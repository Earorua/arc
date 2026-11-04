import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  documentAcceptanceCases, documentAcceptanceConfigurationDigest, documentAcceptanceCorpusSha256, utf8Sha256,
} from "../worker/document-executor/acceptance-policy.ts";

const id = z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
// documentAcceptanceConfigurationDigest(config, { ...qualification, qualified: true }) from
// 24e918d:docs/verification/materials-gate-1b-b1/b2-settings.review.json. Migration 0004 checks this on the separate B4 grant.
const kimiBudget = {
  plan: "b4-kimi-k31-pro-mxfp4-v1",
  configurationSha256: "5b55cb672995351b5c01b6c15a74dae17e3a314f5ab45aa8c1625cfb8eef59e8",
  ceilingMicroUsd: 2_000_000,
} as const;
const routingPolicy = z.object({
  policyVersion: z.string(), providerOrder: z.array(z.string()).length(1), allowFallback: z.literal(false), dataPolicy: z.literal("zdr-only"),
}).strict();
// Strict, public B1 fields. The executor additionally validates its complete policy and dedicated credential.
const authorization = z.object({
  runId: id, ownerId: z.string().max(256).regex(/^[A-Za-z0-9_-]+$/u), corpusSha256: z.literal(documentAcceptanceCorpusSha256),
  approvedAt: z.iso.datetime({offset:true}), expiresAt: z.iso.datetime({offset:true}), maxRequests: z.literal(24),
  totalBudgetMicroUsd: amount.min(1).max(kimiBudget.ceilingMicroUsd), budgetPlan: z.literal(kimiBudget.plan).optional(),
  config: z.object({ provider: z.string(), model: z.string(), endpoint: z.url(), providerPolicyId: id,
    priceVersion: z.string(), routingPolicy, userDailyMicroUsd: amount, globalDailyMicroUsd: amount,
    maxJobMicroUsd: amount, maxInputTokens: amount, maxOutputTokens: amount, httpTimeoutMs: amount }).strict(),
  qualification: z.object({qualified:z.literal(true), model:z.string(), endpoint:z.url(), providerPolicyId:id,
    priceVersion:z.string(), routingPolicy, receiptRoute:z.object({providerName:z.string(),endpointId:z.string()}).strict(),
    inputMicroUsdPerMillionTokens:amount, outputMicroUsdPerMillionTokens:amount, inputTokenBound:z.literal("utf8-bytes-plus-4096")}).strict(),
  cases: z.array(z.object({ caseId: id, documentId: z.uuidv4(), documentVersionId: z.uuidv4(),
    textVersionId: z.uuidv4(), generation: amount, textSha256: hash }).strict()).length(24),
}).strict();

/** Produces exactly one INSERT. Applying it is a separate, privileged operation after approval. */
export async function renderDocumentAcceptanceEnrollment(raw: unknown): Promise<string> {
  const parsed = authorization.safeParse(raw);
  if (!parsed.success) throw new Error("Invalid document acceptance enrollment");
  const { cases, approvedAt, expiresAt, config, qualification, ...run } = parsed.data;
  const start = Date.parse(approvedAt), end = Date.parse(expiresAt);
  const corpus = readFileSync(new URL("../tests/fixtures/documents/quality-corpus.json", import.meta.url), "utf8");
  if (await utf8Sha256(corpus) !== documentAcceptanceCorpusSha256 || end <= start
    || cases.some(row => documentAcceptanceCases[row.caseId] !== row.textSha256)
    || (["caseId","documentId","documentVersionId","textVersionId"] as const).some(key => new Set(cases.map(row => row[key])).size !== 24))
    throw new Error("Invalid frozen corpus, cases or authorization window");
  const configHash = await documentAcceptanceConfigurationDigest(config, qualification);
  if (run.budgetPlan ? configHash !== kimiBudget.configurationSha256 : run.totalBudgetMicroUsd > 500_000)
    throw new Error("Invalid document acceptance budget plan");
  const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const columns = ["run_id","owner_id","corpus_sha256","configuration_sha256","approved_at","expires_at","max_requests","total_budget_micro_usd","cases_json"];
  const values = [quote(run.runId),quote(run.ownerId),quote(run.corpusSha256),quote(configHash),start,end,24,run.totalBudgetMicroUsd,quote(JSON.stringify(cases))];
  if (run.budgetPlan) {
    columns.push("budget_plan");
    values.push(quote(run.budgetPlan));
  }
  return `INSERT INTO document_acceptance_runs(${columns.join(",")}) VALUES(${values.join(",")});\n`;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    if (process.argv.length !== 4) throw new Error();
    const sql = await renderDocumentAcceptanceEnrollment(JSON.parse(readFileSync(process.argv[2]!, "utf8")));
    writeFileSync(process.argv[3]!, sql, { flag:"wx", mode:0o600 });
  } catch {
    process.stderr.write("Document enrollment rejected. Supply a reviewed JSON file and a new local SQL output path.\n");
    process.exitCode = 1;
  }
}
