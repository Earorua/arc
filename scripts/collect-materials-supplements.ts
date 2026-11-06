/**
 * Local operator entry: node --import tsx scripts/collect-materials-supplements.ts <operation>
 * --inspect <settings.json> reads only {config, qualification} and prints the six identities, schema, corpus and configuration hashes.
 * --check-source <candidateCommit> checks the actual execution checkout against that commit without a credential or ledger.
 * --register-ledger registers the restricted local DB once, or prints its existing ledgerSha256. It does not issue a run.
 * --collect <issued.json> requires that same settings object plus the separate authorization below. The issuer pins the file's
 * exact UTF-8 SHA-256 in ARC_SUPPLEMENT_ISSUANCE_SHA256, the approved key's SHA-256 in credentialSha256, and the registered ledger.
 * Only an independently approved process supplies ARC_SUPPLEMENT_COLLECTION_ENABLED=true and ARC_SUPPLEMENT_PROVIDER_API_KEY.
 * Exit 0 means all six scored and passed, 1 means a stop or failed evaluation, and 2 means refusal or a local persistence failure.
 * Preserve the DB, including any interrupted run, for manual reconciliation. A prior run or issuance cannot be resumed.
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DOCUMENT_SCHEMA_VERSION } from "../app/contracts/documents";
import { documentAnalysisConfigurationSchema } from "../app/server/documents/policy";
import { documentAcceptanceConfigurationDigest } from "../worker/document-executor/acceptance-policy";
import { readDocumentHttpJson } from "../worker/document-executor/generation-receipt";
import { calculateDocumentReservation, HttpDocumentAnalysisProvider, isDocumentProviderQualified, type DocumentFetch } from "../worker/document-executor/provider-http";
import { KIMI_SOURCE_SPAN_ROUTE, sourceSpanPolicy } from "../worker/document-executor/source-span-extraction";
import { openSupplementLedger, readPinnedSupplementIssuance, registerSupplementLedger, supplementLimits as limits, supplementPurpose as purpose,
  supplementSettingsSchema as settingsSchema, supplementFixtureToken as fixtureToken, type SupplementIssuanceBinding } from "./materials-supplement-ledger";
import { inspectDiagnosticPilotSourceManifest } from "./materials-diagnostic-pilot-host";
import { readFrozenSupplementDocuments, scoreSupplementBatch, supplementCorpusSha256 } from "./score-materials-supplements";

const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
type Environment = Readonly<Record<string, string | undefined>>;
type CollectionOptions = { directory: string; fetch: DocumentFetch; matchesCandidate: (commit: string) => boolean | Promise<boolean>; now?: () => Date };

function requireSupplementGate(env: Environment) {
  if (env.ARC_SUPPLEMENT_COLLECTION_ENABLED !== "true" || env.ARC_DOCUMENT_QUALIFICATION_ENABLED === "true" || env.ARC_DOCUMENT_PILOT_ENABLED === "true"
    || env.ARC_DOCUMENT_ACCEPTANCE_MODE === "live" || env.ARC_DOCUMENT_PRODUCTION_ENABLED === "true") throw new Error("supplement-disabled");
}

/** Public input only. Prints commitments for review without creating a grant, opening a ledger or using a credential. */
export async function inspectSupplementSettings(input: unknown) {
  const { config, qualification } = settingsSchema.parse(input);
  // These are reviewed public constraints. No route or rate, including this one, grants permission to send.
  if (!isDocumentProviderQualified(config, qualification) || config.maxJobMicroUsd > limits.perRequestMicroUsd
    || config.endpoint !== KIMI_SOURCE_SPAN_ROUTE.endpoint || config.provider !== "OpenRouter / Moonshot AI"
    || config.model !== KIMI_SOURCE_SPAN_ROUTE.model || config.routingPolicy.providerOrder[0] !== KIMI_SOURCE_SPAN_ROUTE.tag
    || (config.providerPolicyId !== "materials-openrouter-kimi-k31-pro-mxfp4-zdr" && !sourceSpanPolicy(config.providerPolicyId)) || config.priceVersion !== "2026.11.3"
    || config.routingPolicy.policyVersion !== "2026.11.3" || qualification.receiptRoute.providerName !== KIMI_SOURCE_SPAN_ROUTE.providerName
    || qualification.receiptRoute.endpointId !== KIMI_SOURCE_SPAN_ROUTE.endpointId || qualification.receiptRoute.generationModel !== KIMI_SOURCE_SPAN_ROUTE.generationModel
    || qualification.inputMicroUsdPerMillionTokens !== 2_000_000 || qualification.outputMicroUsdPerMillionTokens !== 10_000_000)
    throw new Error("invalid-supplement-configuration");
  const documents = readFrozenSupplementDocuments().map(doc => ({
    documentId: doc.id, documentVersionId: doc.documentVersionId, textVersionId: doc.textVersionId,
  }));
  return { purpose, ...limits, documents, corpusSha256: supplementCorpusSha256, outputSchemaVersion: DOCUMENT_SCHEMA_VERSION,
    configurationSha256: await documentAcceptanceConfigurationDigest(config, qualification),
    reservationMicroUsd: calculateDocumentReservation(config, qualification) };
}

/** Supply the original externally pinned issuance when reopening an archive. This function grants no transport access. */
export function supplementCaptureBinding(raw: string, issuanceSha256: string, mode: SupplementIssuanceBinding["mode"]) {
  return readPinnedSupplementIssuance(raw, issuanceSha256, mode).binding;
}
async function verifyIssuance(raw: string, env: Environment, options: CollectionOptions, now: Date, mode: SupplementIssuanceBinding["mode"]) {
  requireSupplementGate(env);
  try {
    const digest = env.ARC_SUPPLEMENT_ISSUANCE_SHA256;
    const { issued, binding } = readPinnedSupplementIssuance(raw, digest, mode);
    const { config, qualification, authorization } = issued;
    const scope = await inspectSupplementSettings({ config, qualification });
    const start = Date.parse(authorization.approvedAt), end = Date.parse(authorization.expiresAt);
    if (end - start > limits.maxWindowMs || !Number.isFinite(now.getTime()) || now.getTime() < start || now.getTime() >= end
      || scope.configurationSha256 !== authorization.configurationSha256 || JSON.stringify(scope.documents) !== JSON.stringify(authorization.documents)
      || config.maxJobMicroUsd > authorization.perRequestMicroUsd || scope.reservationMicroUsd > authorization.totalBudgetMicroUsd
      || authorization.totalBudgetMicroUsd > config.userDailyMicroUsd || authorization.totalBudgetMicroUsd > config.globalDailyMicroUsd
      || [authorization.runId, authorization.id, authorization.issuedBy].some(id => id.includes(authorization.credentialSha256))
      || !await options.matchesCandidate(authorization.candidateCommit)) throw new Error();
    return { ...issued, binding, reservation: scope.reservationMicroUsd, start, end };
  } catch { throw new Error("supplement-authorization-invalid"); }
}

function containsCredential(content: string, apiKey: string) {
  if (content.includes(apiKey)) return true;
  if (!content.includes("\\")) return false;
  try { return JSON.stringify(JSON.parse(content)).includes(JSON.stringify(apiKey).slice(1, -1)); }
  catch { return false; }
}
/** Keep the original response bytes for the adapter's decimal comparison. Only the unedited assistant content enters the capture. */
async function freezeChat(response: Response, signal: AbortSignal, apiKey: string, store: (content: string | null) => void) {
  if (response.redirected || response.status !== 200) return;
  const raw = await readDocumentHttpJson(response.clone(), signal, () => signal.throwIfAborted());
  const content: unknown = Array.isArray(raw.choices) ? raw.choices[0]?.message?.content : null;
  if (typeof content === "string" && containsCredential(content, apiKey)) throw new Error("credential-in-response");
  store(typeof content === "string" ? content : null);
}

/** Injectable fixtures always report offline-test and can only use the synthetic placeholder credential. */
export function collectSupplementRun(raw: string, env: Environment, options: CollectionOptions & { mode?: "offline-test" }) {
  if (options.mode !== undefined && options.mode !== "offline-test") return Promise.reject(new Error("supplement-fixture-refused"));
  return collect(raw, env, options, "offline-test");
}
async function collect(raw: string, env: Environment, options: CollectionOptions, mode: SupplementIssuanceBinding["mode"]) {
  const clock = options.now ?? (() => new Date());
  let latest = clock().getTime(), regressed = false;
  const now = () => {
    const observed = clock().getTime();
    if (!Number.isFinite(observed) || observed < latest) regressed = true;
    if (Number.isFinite(observed)) latest = Math.max(latest, observed);
    return new Date(latest);
  };
  const issued = await verifyIssuance(raw, env, options, new Date(latest), mode);
  const { authorization, binding, qualification, reservation, start, end } = issued;
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
      || (mode === "offline-test" && privateConfig.data.apiKey !== fixtureToken)
      || binding.publicIssuance.includes(JSON.stringify(privateConfig.data.apiKey).slice(1, -1))) throw new Error("supplement-authorization-invalid");
    const config = privateConfig.data;
    ledger.start(binding, now().toISOString());
    const admissionFailure = () => windowFailure() ?? (ledger.matchesBinding(binding) ? null : "issuance-mismatch");
    let reason: string | null = null;
    for (const [index, doc] of documents.entries()) {
      reason = admissionFailure();
      if (reason) break;
      const balance = ledger.totals();
      if (balance.requestsSent >= authorization.maxRequests) { reason = "request-limit"; break; }
      if (balance.settledMicroUsd + balance.heldMicroUsd + reservation > authorization.totalBudgetMicroUsd) { reason = "budget-exhausted"; break; }
      ledger.reserve(authorization.documents[index]!, reservation, now().toISOString());
      let sent = false, metadataRead = false, captureFailed = false, handoffFailure: string | null = null;
      let rawDigest: string | null = null;
      const assertWindow = () => {
        handoffFailure = admissionFailure();
        if (handoffFailure) throw new Error(handoffFailure);
      };
      const provider = new HttpDocumentAnalysisProvider(config, { qualification, now, singleMetadataRead: true, fetch: async (url, init) => {
        assertWindow();
        if (init?.method === "POST" && !sent) {
          ledger.markSending(doc.id, now().toISOString());
          assertWindow();
          sent = true;
          const response = await options.fetch(url, init);
          try { await freezeChat(response, init.signal!, config.apiKey, content => { rawDigest = ledger.capture(doc.id, content); }); }
          catch { captureFailed = true; }
          // Even if capture failed, let the adapter attribute a trustworthy chat charge without another HTTP request.
          return response;
        }
        if (init?.method !== "GET" || !sent || metadataRead || captureFailed) throw new Error("supplement-request-refused");
        metadataRead = true;
        // This scope permits one GET. Let the auditor see its actual HTTP status.
        return options.fetch(url, init);
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
        reason ??= admissionFailure();
        // The provider decoded the original chat with its actual finish flags and verified metadata.
        // For rejected wire content it returns null. Never reinterpret that raw content as a legacy success.
        let decoded;
        if (!reason && sourceSpanPolicy(config.providerPolicyId)) {
          const extractionJson = JSON.stringify(outcome.candidate);
          if (!rawDigest || extractionJson.includes(JSON.stringify(config.apiKey).slice(1, -1))) reason = "capture-failed";
          else decoded = { receiptId: outcome.receiptId, rawDigest, extractionJson };
        }
        reason = ledger.finishAttempt(doc.id, "settled", outcome.actualMicroUsd, audit, reason, decoded);
      } else {
        reason = handoffFailure ?? audit?.status ?? (outcome.kind === "received" ? "unverified-receipt" : outcome.code);
        ledger.finishAttempt(doc.id, sent ? "held" : "released", null, audit, reason);
      }
      if (reason) break;
    }
    const balance = ledger.totals();
    if (!ledger.matchesBinding(binding)) reason = "issuance-mismatch";
    const quality = !reason && balance.requestsSent === limits.maxRequests
      ? scoreSupplementBatch({ corpusSha256: supplementCorpusSha256, outputs: ledger.captures(binding) }, config.providerPolicyId) : null;
    const status = balance.heldMicroUsd ? "held" : reason ? "stopped" : quality?.passed ? "complete" : "quality-failed";
    const result = { runId, mode, ...balance, status,
      reason: reason ?? (quality?.passed ? null : "quality-threshold-failed"), quality, completedAt: now().toISOString() };
    ledger.finish(result, binding);
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
function frozenSource(commit: string) {
  return inspectDiagnosticPilotSourceManifest(root, commit);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const [, , mode, path] = process.argv;
    if (mode === "--register-ledger" && process.argv.length === 3) process.stdout.write(JSON.stringify({ ledgerSha256: registerSupplementLedger(ledgerDirectory) }) + "\n");
    else if (process.argv.length !== 4 || !path) throw new Error();
    else if (mode === "--check-source") {
      const { candidateCommit, candidateTree, files } = await frozenSource(path);
      process.stdout.write(JSON.stringify({ candidateCommit, candidateTree, checkedFiles: files.length }) + "\n");
    }
    else if (mode === "--inspect") process.stdout.write(JSON.stringify(await inspectSupplementSettings(JSON.parse(readSettingsFile(path))), null, 2) + "\n");
    else if (mode === "--collect") {
      requireSupplementGate(process.env);
      const result = await collect(readSettingsFile(path), process.env, {
        matchesCandidate: async commit => (await frozenSource(commit)).candidateCommit === commit, directory: ledgerDirectory, fetch: globalThis.fetch,
      }, "authorized-live");
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      process.exitCode = result.quality?.passed ? 0 : 1;
    } else throw new Error();
  } catch {
    process.stderr.write("Supplement collection refused. Use --register-ledger, --inspect <public-settings.json> or --collect <separately-issued-run.json>. Check the local ledger before proceeding.\n");
    process.exitCode = 2;
  }
}
