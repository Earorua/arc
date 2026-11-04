/**
 * Local operator entry: node --import tsx scripts/collect-materials-supplements.ts <operation>
 * --inspect <settings.json> reads only {config, qualification} and prints the six identities, schema, corpus and configuration hashes.
 * --register-ledger registers the restricted local DB once, or prints its existing ledgerSha256. It does not issue a run.
 * --collect <issued.json> requires that same settings object plus the separate authorization below. The issuer pins the file's
 * exact UTF-8 SHA-256 in ARC_SUPPLEMENT_ISSUANCE_SHA256, the approved key's SHA-256 in credentialSha256, and the registered ledger.
 * Only an independently approved process supplies ARC_SUPPLEMENT_COLLECTION_ENABLED=true and ARC_SUPPLEMENT_PROVIDER_API_KEY.
 * Exit 0 means all six scored and passed, 1 means a stop or failed evaluation, and 2 means refusal or a local persistence failure.
 * Preserve the DB, including any interrupted run, for manual reconciliation. A prior run or issuance cannot be resumed.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { DOCUMENT_SCHEMA_VERSION, materialDigestSchema, materialIdSchema, materialTimestampSchema } from "../app/contracts/documents";
import { documentAnalysisConfigurationSchema, documentAnalysisMetadataSchema } from "../app/server/documents/policy";
import { documentAcceptanceConfigurationDigest } from "../worker/document-executor/acceptance-policy";
import { readDocumentHttpJson } from "../worker/document-executor/generation-receipt";
import { calculateDocumentReservation, documentProviderQualificationSchema, HttpDocumentAnalysisProvider, isDocumentProviderQualified, type DocumentFetch } from "../worker/document-executor/provider-http";
import { openSupplementLedger, registerSupplementLedger } from "./materials-supplement-ledger";
import { readFrozenSupplementDocuments, scoreSupplementBatch, supplementCorpusSha256 } from "./score-materials-supplements";

const purpose = "collect-six-synthetic-supplements";
const limits = { maxRequests: 6, perRequestMicroUsd: 75_000, totalBudgetMicroUsd: 450_000, maxWindowMs: 2 * 60 * 60 * 1000 } as const;
const settingsSchema = z.strictObject({ config: documentAnalysisMetadataSchema, qualification: documentProviderQualificationSchema });
const authorizationSchema = z.strictObject({
  purpose: z.literal(purpose), id: materialIdSchema, issuedBy: materialIdSchema, runId: materialIdSchema,
  candidateCommit: z.string().regex(/^[a-f0-9]{40}$/u), configurationSha256: materialDigestSchema,
  credentialSha256: materialDigestSchema, ledgerSha256: materialDigestSchema, corpusSha256: z.literal(supplementCorpusSha256), outputSchemaVersion: z.literal(DOCUMENT_SCHEMA_VERSION),
  documents: z.array(z.strictObject({ documentId: materialIdSchema, documentVersionId: materialIdSchema, textVersionId: materialIdSchema })).length(limits.maxRequests),
  approvedAt: materialTimestampSchema, expiresAt: materialTimestampSchema, maxRequests: z.literal(limits.maxRequests),
  perRequestMicroUsd: z.number().int().positive().max(limits.perRequestMicroUsd),
  totalBudgetMicroUsd: z.number().int().positive().max(limits.totalBudgetMicroUsd),
});
const issuanceSchema = settingsSchema.extend({ authorization: authorizationSchema });
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
type Environment = Readonly<Record<string, string | undefined>>;
type CollectionOptions = { directory: string; fetch: DocumentFetch; matchesCandidate: (commit: string) => boolean;
  mode: "authorized-live" | "offline-test"; now?: () => Date };

function requireSupplementGate(env: Environment) {
  if (env.ARC_SUPPLEMENT_COLLECTION_ENABLED !== "true" || env.ARC_DOCUMENT_QUALIFICATION_ENABLED === "true"
    || env.ARC_DOCUMENT_ACCEPTANCE_MODE === "live" || env.ARC_DOCUMENT_PRODUCTION_ENABLED === "true") throw new Error("supplement-disabled");
}

/** Public input only. Prints commitments for review without creating a grant, opening a ledger or using a credential. */
export async function inspectSupplementSettings(input: unknown) {
  const { config, qualification } = settingsSchema.parse(input);
  // These are reviewed public constraints. No route or rate, including this one, grants permission to send.
  if (!isDocumentProviderQualified(config, qualification) || config.maxJobMicroUsd > limits.perRequestMicroUsd
    || config.endpoint !== "https://openrouter.ai/api/v1/chat/completions" || config.provider !== "OpenRouter / Moonshot AI"
    || config.model !== "moonshotai/kimi-k3.1-pro" || config.routingPolicy.providerOrder[0] !== "moonshotai/mxfp4"
    || config.providerPolicyId !== "materials-openrouter-kimi-k31-pro-mxfp4-zdr" || config.priceVersion !== "2026.11.3"
    || config.routingPolicy.policyVersion !== "2026.11.3" || qualification.receiptRoute.providerName !== "Moonshot AI"
    || qualification.receiptRoute.endpointId !== "a3fafaac-f097-4ef1-86b3-842854dad5c6"
    || qualification.inputMicroUsdPerMillionTokens !== 2_000_000 || qualification.outputMicroUsdPerMillionTokens !== 10_000_000)
    throw new Error("invalid-supplement-configuration");
  const documents = readFrozenSupplementDocuments().map(doc => ({
    documentId: doc.id, documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId,
  }));
  return { purpose, ...limits, documents, corpusSha256: supplementCorpusSha256, outputSchemaVersion: DOCUMENT_SCHEMA_VERSION,
    configurationSha256: await documentAcceptanceConfigurationDigest(config, qualification),
    reservationMicroUsd: calculateDocumentReservation(config, qualification) };
}

async function verifyIssuance(raw: string, env: Environment, options: CollectionOptions, now: Date) {
  requireSupplementGate(env);
  try {
    if (Buffer.byteLength(raw) > 32_768 || sha(raw) !== env.ARC_SUPPLEMENT_ISSUANCE_SHA256) throw new Error();
    const issued = issuanceSchema.parse(JSON.parse(raw));
    const { config, qualification, authorization } = issued;
    const scope = await inspectSupplementSettings({ config, qualification });
    const start = Date.parse(authorization.approvedAt), end = Date.parse(authorization.expiresAt);
    if (end - start > limits.maxWindowMs || !Number.isFinite(now.getTime()) || now.getTime() < start || now.getTime() >= end
      || scope.configurationSha256 !== authorization.configurationSha256 || JSON.stringify(scope.documents) !== JSON.stringify(authorization.documents)
      || config.maxJobMicroUsd > authorization.perRequestMicroUsd || scope.reservationMicroUsd > authorization.totalBudgetMicroUsd
      || authorization.totalBudgetMicroUsd > config.userDailyMicroUsd || authorization.totalBudgetMicroUsd > config.globalDailyMicroUsd
      || !options.matchesCandidate(authorization.candidateCommit)) throw new Error();
    return { ...issued, publicIssuance: JSON.stringify(issued), reservation: scope.reservationMicroUsd, start, end };
  } catch { throw new Error("supplement-authorization-invalid"); }
}

/** Keep the original response bytes for the adapter's decimal comparison. Only the unedited assistant content enters the capture. */
async function freezeChat(response: Response, signal: AbortSignal, apiKey: string, store: (content: string | null) => void) {
  if (response.redirected || response.status !== 200) return;
  const raw = await readDocumentHttpJson(response.clone(), signal, () => signal.throwIfAborted());
  const content: unknown = Array.isArray(raw.choices) ? raw.choices[0]?.message?.content : null;
  if (typeof content === "string" && content.includes(apiKey)) throw new Error("credential-in-response");
  store(typeof content === "string" ? content : null);
}

export async function collectSupplementRun(raw: string, env: Environment, options: CollectionOptions) {
  const clock = options.now ?? (() => new Date());
  let latest = clock().getTime(), regressed = false;
  const now = () => {
    const observed = clock().getTime();
    if (!Number.isFinite(observed) || observed < latest) regressed = true;
    if (Number.isFinite(observed)) latest = Math.max(latest, observed);
    return new Date(latest);
  };
  const issued = await verifyIssuance(raw, env, options, new Date(latest));
  const { authorization, qualification, reservation, start, end } = issued;
  const signal = AbortSignal.timeout(Math.max(1, end - now().getTime()));
  const windowFailure = () => {
    const at = now().getTime();
    if (regressed || at < start) return "authorization-clock-rollback";
    return at >= end || signal.aborted ? "authorization-expired" : null;
  };
  const documents = readFrozenSupplementDocuments(), { runId } = authorization;
  const ledger = openSupplementLedger(options.directory, runId, authorization.ledgerSha256);
  try {
    if (windowFailure()) throw new Error("supplement-authorization-invalid");
    const privateConfig = documentAnalysisConfigurationSchema.safeParse({ ...issued.config, apiKey: env.ARC_SUPPLEMENT_PROVIDER_API_KEY });
    if (!privateConfig.success || sha(privateConfig.data.apiKey) !== authorization.credentialSha256
      || issued.publicIssuance.includes(JSON.stringify(privateConfig.data.apiKey).slice(1, -1))) throw new Error("supplement-authorization-invalid");
    const config = privateConfig.data;
    ledger.start(authorization.id, sha(raw), issued.publicIssuance, options.mode, now().toISOString());
    let reason: string | null = null;
    for (const [index, doc] of documents.entries()) {
      reason = windowFailure();
      if (reason) break;
      const balance = ledger.totals();
      if (balance.requestsSent >= authorization.maxRequests) { reason = "request-limit"; break; }
      if (balance.settledMicroUsd + balance.heldMicroUsd + reservation > authorization.totalBudgetMicroUsd) { reason = "budget-exhausted"; break; }
      ledger.reserve(authorization.documents[index]!, reservation, now().toISOString());
      let sent = false, metadataRead = false, captureFailed = false, handoffFailure: string | null = null;
      const assertWindow = () => {
        handoffFailure = windowFailure();
        if (handoffFailure) throw new Error(handoffFailure);
      };
      const provider = new HttpDocumentAnalysisProvider(config, { qualification, now, fetch: async (url, init) => {
        assertWindow();
        if (init?.method === "POST" && !sent) {
          ledger.markSending(doc.id, now().toISOString());
          assertWindow();
          sent = true;
          const response = await options.fetch(url, init);
          try { await freezeChat(response, init.signal!, config.apiKey, content => ledger.capture(doc.id, content)); }
          catch { captureFailed = true; }
          // Even if capture failed, let the adapter attribute a trustworthy chat charge without another HTTP request.
          return response;
        }
        if (init?.method !== "GET" || !sent || metadataRead || captureFailed) throw new Error("supplement-request-refused");
        metadataRead = true;
        const response = await options.fetch(url, init);
        // One metadata read in this scope. Do not enter the adapter's optional retry loop on pending or failed responses.
        if (response.redirected || response.status !== 200) { void response.body?.cancel().catch(() => {}); throw new Error("supplement-metadata-unavailable"); }
        return response;
      } });
      const outcome = await provider.analyze({ kind: "supplement", text: doc.text, segments: doc.segments, textVersionId: doc.textVersionId,
        providerPolicyId: config.providerPolicyId, outputSchemaVersion: DOCUMENT_SCHEMA_VERSION }, signal, undefined,
      async (id, observed) => ledger.claim(doc.id, id, observed));
      const audit = outcome.kind === "received" ? outcome.audit ?? null : null;
      if (outcome.kind === "received" && outcome.receiptId !== null && outcome.actualMicroUsd !== null) {
        // The adapter attributes cost independently from quality. Conflicts, duplicate IDs and unpriced replies yield null.
        reason = handoffFailure ?? (captureFailed ? "capture-failed" : null);
        if (!reason && outcome.actualMicroUsd > reservation) reason = "price-bound-exceeded";
        if (!reason && audit?.status !== "verified") reason = audit?.status ?? "unverified-receipt";
        reason ??= windowFailure();
        ledger.finishAttempt(doc.id, "settled", outcome.actualMicroUsd, audit, reason);
      } else {
        reason = handoffFailure ?? audit?.status ?? (outcome.kind === "received" ? "unverified-receipt" : outcome.code);
        ledger.finishAttempt(doc.id, sent ? "held" : "released", null, audit, reason);
      }
      if (reason) break;
    }
    const balance = ledger.totals();
    const quality = !reason && balance.requestsSent === limits.maxRequests
      ? scoreSupplementBatch({ corpusSha256: supplementCorpusSha256, outputs: ledger.captures() }) : null;
    const status = balance.heldMicroUsd ? "held" : reason ? "stopped" : quality?.passed ? "complete" : "quality-failed";
    const result = { runId, mode: options.mode, ...balance, status,
      reason: reason ?? (quality?.passed ? null : "quality-threshold-failed"), quality, completedAt: now().toISOString() };
    ledger.finish(result);
    return result;
  } finally { ledger.close(); }
}

function readSettingsFile(path: string) {
  const file = statSync(path);
  if (!file.isFile() || file.size > 32_768) throw new Error("invalid-supplement-settings-file");
  const bytes = readFileSync(path);
  if (bytes.length > 32_768) throw new Error("invalid-supplement-settings-file");
  return bytes.toString("utf8");
}

const root = fileURLToPath(new URL("../", import.meta.url));
const ledgerDirectory = fileURLToPath(new URL("../work/materials-supplement-collection/", import.meta.url));
function matchesFrozenCandidate(commit: string) {
  // The operator may use a handoff commit which adds documentation atop the approved product.
  // Include the script/import tree, runtime manifests and all other executable product paths.
  const paths = ["--", ".", ":(exclude)docs/**"];
  const git = (args: string[]) => execFileSync("git", ["-c", "core.fsmonitor=false", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  git(["cat-file", "-e", commit + "^{commit}"]);
  git(["diff", "--quiet", "--no-ext-diff", commit, ...paths]);
  return !git(["ls-files", "--others", "--exclude-standard", ...paths]).trim();
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const [, , mode, path] = process.argv;
    if (mode === "--register-ledger" && process.argv.length === 3) process.stdout.write(JSON.stringify({ ledgerSha256: registerSupplementLedger(ledgerDirectory) }) + "\n");
    else if (process.argv.length !== 4 || !path) throw new Error();
    else if (mode === "--inspect") process.stdout.write(JSON.stringify(await inspectSupplementSettings(JSON.parse(readSettingsFile(path))), null, 2) + "\n");
    else if (mode === "--collect") {
      requireSupplementGate(process.env);
      const result = await collectSupplementRun(readSettingsFile(path), process.env, { mode: "authorized-live",
        matchesCandidate: matchesFrozenCandidate, directory: ledgerDirectory, fetch });
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      process.exitCode = result.quality?.passed ? 0 : 1;
    } else throw new Error();
  } catch {
    process.stderr.write("Supplement collection refused. Use --register-ledger, --inspect <public-settings.json> or --collect <separately-issued-run.json>. Check the local ledger before proceeding.\n");
    process.exitCode = 2;
  }
}
