import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { materialDigestSchema, materialIdSchema, materialTimestampSchema } from "../app/contracts/documents";
import { canonicalJson } from "../app/lib/planning/fingerprint";
import { documentAnalysisConfigurationSchema } from "../app/server/documents/policy";
import corpus from "../tests/fixtures/documents/quality-corpus.json";
import { documentAcceptanceConfigurationDigest, documentAcceptanceCorpusSha256 } from "../worker/document-executor/acceptance-policy";
import { calculateDocumentReservation, HttpDocumentAnalysisProvider } from "../worker/document-executor/provider-http";
import { KIMI_SOURCE_SPAN_POLICY_ID, KIMI_SOURCE_SPAN_ROUTE } from "../worker/document-executor/source-span-extraction";
import { corpusDigest, qualificationInput, QualificationRunError } from "./materials-qualification-inputs";
import { inspectDiagnosticPilotSourceManifest, inspectLiveDiagnosticPilotHost } from "./materials-diagnostic-pilot-host";

const purpose = "materials-b2-diagnostic-pilot-v1";
const ids = ["resume-01", "resume-08", "jd-01", "jd-11"];
const limits = { maxRequests: 4, maxPostsPerDocument: 1, maxGetsPerDocument: 3,
  reservationMicroUsd: 72_960, maxTotalBudgetMicroUsd: 300_000 } as const;
const privacyEvidence = "https://openrouter.ai/docs/guides/features/zdr";
const pricingEvidence = "https://openrouter.ai/api/v1/models/moonshotai/kimi-k3.1-pro/endpoints";
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

// These are the fixed public terms for this four-case proposal. Only a separate host issuance enables it.
function pilotSettings() {
  const config = {
    provider: "OpenRouter / Moonshot AI", model: KIMI_SOURCE_SPAN_ROUTE.model, endpoint: KIMI_SOURCE_SPAN_ROUTE.endpoint,
    providerPolicyId: KIMI_SOURCE_SPAN_POLICY_ID, priceVersion: "2026.11.3",
    routingPolicy: { policyVersion: "2026.11.3", providerOrder: [KIMI_SOURCE_SPAN_ROUTE.tag], allowFallback: false as const, dataPolicy: "zdr-only" as const },
    userDailyMicroUsd: limits.maxTotalBudgetMicroUsd, globalDailyMicroUsd: limits.maxTotalBudgetMicroUsd,
    maxJobMicroUsd: 75_000, maxInputTokens: 16_000, maxOutputTokens: 4096, httpTimeoutMs: 180_000,
  };
  const { model, endpoint, providerPolicyId, priceVersion, routingPolicy } = config;
  const qualification = {
    qualified: true as const, model, endpoint, providerPolicyId, priceVersion, routingPolicy,
    receiptRoute: { providerName: KIMI_SOURCE_SPAN_ROUTE.providerName, endpointId: KIMI_SOURCE_SPAN_ROUTE.endpointId, generationModel: KIMI_SOURCE_SPAN_ROUTE.generationModel },
    inputMicroUsdPerMillionTokens: 2_000_000, outputMicroUsdPerMillionTokens: 10_000_000, inputTokenBound: "utf8-bytes-plus-4096" as const,
  };
  return { config, qualification };
}

const documentScopeSchema = z.strictObject({
  documentId: materialIdSchema, documentVersionId: materialIdSchema, textVersionId: materialIdSchema,
  sourceSha256: materialDigestSchema, bodySha256: materialDigestSchema,
});
const scopeSchema = z.strictObject({
  purpose: z.literal(purpose), configurationSha256: materialDigestSchema, corpusSha256: materialDigestSchema,
  maxRequests: z.literal(limits.maxRequests), maxPostsPerDocument: z.literal(limits.maxPostsPerDocument),
  maxGetsPerDocument: z.literal(limits.maxGetsPerDocument), reservationMicroUsd: z.literal(limits.reservationMicroUsd),
  maxTotalBudgetMicroUsd: z.literal(limits.maxTotalBudgetMicroUsd), documents: z.array(documentScopeSchema).length(limits.maxRequests),
});
const runIdSchema = materialIdSchema.refine(value => /^materials-b2-diagnostic-pilot-[a-z0-9]/u.test(value));
const issuanceSchema = z.strictObject({ runId: runIdSchema, authorization: z.strictObject({
  id: materialIdSchema, runId: runIdSchema, mode: z.enum(["offline-test", "authorized-live"]), scope: scopeSchema,
  candidateCommit: z.string().regex(/^[a-f0-9]{40}$/u), sourceBundleSha256: materialDigestSchema,
  preflightSha256: materialDigestSchema, credentialSha256: materialDigestSchema,
  approvedAt: materialTimestampSchema, expiresAt: materialTimestampSchema,
  totalBudgetMicroUsd: z.number().int().positive().max(limits.maxTotalBudgetMicroUsd),
}) });

function pilotDocuments() {
  const documents = corpus.documents.filter(doc => ids.includes(doc.id));
  if (corpusDigest !== documentAcceptanceCorpusSha256 || documents.length !== ids.length || documents.some((doc, i) => doc.id !== ids[i])) {
    throw new QualificationRunError("qualification-settings-invalid");
  }
  return documents;
}

/** Construct all four exact commitments locally. This function has no credential, network or journal inputs. */
export async function inspectDiagnosticPilotScope(): Promise<z.infer<typeof scopeSchema>> {
  const { config, qualification } = pilotSettings();
  if (calculateDocumentReservation(config, qualification) !== limits.reservationMicroUsd) throw new QualificationRunError("qualification-settings-invalid");
  const documents: z.infer<typeof documentScopeSchema>[] = [];
  for (const doc of pilotDocuments()) {
    let calls = 0, bodySha256: string | null = null;
    const provider = new HttpDocumentAnalysisProvider({ ...config, apiKey: "offline-wire-inspection" }, { qualification,
      fetch: async (url, init) => {
        calls++;
        if (url === config.endpoint && init?.method === "POST" && typeof init.body === "string") bodySha256 = sha(init.body);
        throw new Error("offline-wire-inspection");
      },
    });
    await provider.analyze(qualificationInput(doc, config.providerPolicyId), new AbortController().signal);
    if (calls !== 1 || bodySha256 === null) throw new QualificationRunError("qualification-settings-invalid");
    documents.push({ documentId: doc.id, documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId,
      sourceSha256: sha(doc.text), bodySha256 });
  }
  return { purpose, ...limits, corpusSha256: corpusDigest, configurationSha256: await documentAcceptanceConfigurationDigest(config, qualification), documents };
}

/** The restricted host issuer verifies owner approval, frozen source, funding and the one-use slot, then pins these exact bytes independently. */
export async function readDiagnosticPilotConfiguration(env: Readonly<Record<string, string | undefined>>, now: Date,
  mode: "offline-test" | "authorized-live") {
  if (env.ARC_DOCUMENT_PILOT_ENABLED !== "true" || env.ARC_DOCUMENT_QUALIFICATION_ENABLED === "true") throw new QualificationRunError("qualification-disabled");
  const raw = env.ARC_DOCUMENT_PILOT_SETTINGS;
  if (!raw || Buffer.byteLength(raw, "utf8") > 32_768 || sha(raw) !== env.ARC_DOCUMENT_PILOT_ISSUANCE_SHA256) {
    throw new QualificationRunError("qualification-settings-invalid");
  }
  let issuance: z.infer<typeof issuanceSchema>;
  try { issuance = issuanceSchema.parse(JSON.parse(raw)); }
  catch { throw new QualificationRunError("qualification-settings-invalid"); }
  const { authorization, runId } = issuance;
  const publicIds = [runId, authorization.id];
  const privateDigests = [authorization.credentialSha256, sha("materials-b2\0" + authorization.credentialSha256)];
  if (publicIds.some(id => privateDigests.some(digest => id.toLowerCase().includes(digest)))) {
    throw new QualificationRunError("qualification-settings-invalid");
  }
  const start = Date.parse(authorization.approvedAt), end = Date.parse(authorization.expiresAt);
  if (authorization.mode !== mode || authorization.runId !== runId || !Number.isFinite(now.getTime())
    || now.getTime() < start || now.getTime() >= end || end - start > 2 * 60 * 60 * 1000
    || canonicalJson(authorization.scope) !== canonicalJson(await inspectDiagnosticPilotScope())) {
    throw new QualificationRunError("qualification-authorization-mismatch");
  }
  const openLiveJournal = mode === "authorized-live" ? await inspectLiveDiagnosticPilotHost({
    runId, authorizationId: authorization.id, approvedAt: authorization.approvedAt, expiresAt: authorization.expiresAt,
    settingsSha256: sha(raw), candidateCommit: authorization.candidateCommit, sourceBundleSha256: authorization.sourceBundleSha256,
    preflightSha256: authorization.preflightSha256,
  }) : null;
  const settings = pilotSettings();
  const privateConfig = documentAnalysisConfigurationSchema.safeParse({ ...settings.config, apiKey: env.ARC_DOCUMENT_PILOT_PROVIDER_API_KEY });
  if (!privateConfig.success) throw new QualificationRunError("qualification-settings-invalid");
  const { apiKey } = privateConfig.data;
  if ((mode === "offline-test" && apiKey !== "offline-pilot-fixture-credential")
    || sha(apiKey) !== authorization.credentialSha256 || raw.includes(JSON.stringify(apiKey).slice(1, -1))
    || publicIds.some(id => id.includes(apiKey))) {
    throw new QualificationRunError("qualification-settings-invalid");
  }
  const { scope } = authorization;
  return { runId, config: privateConfig.data, qualification: settings.qualification, reservationMicroUsd: scope.reservationMicroUsd,
    authorization: { id: authorization.id, approvedAt: authorization.approvedAt, expiresAt: authorization.expiresAt,
      maxRequests: scope.maxRequests, totalBudgetMicroUsd: authorization.totalBudgetMicroUsd, privacyEvidence, pricingEvidence },
    pilotScope: scope, documents: pilotDocuments(), openLiveJournal };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 2 && args[0] === "--source-manifest") {
      process.stdout.write(JSON.stringify(await inspectDiagnosticPilotSourceManifest(process.cwd(), args[1]!), null, 2) + "\n");
    } else if (args.length === 1 && args[0] === "--scope") {
      process.stdout.write(JSON.stringify(await inspectDiagnosticPilotScope(), null, 2) + "\n");
    } else if (args.length === 1 && args[0] === "--check") {
      await readDiagnosticPilotConfiguration(process.env, new Date(), "authorized-live");
      process.stdout.write("Diagnostic pilot ready.\n");
    } else throw new Error();
  } catch { process.stderr.write("Diagnostic pilot preflight refused.\n"); process.exitCode = 2; }
}
