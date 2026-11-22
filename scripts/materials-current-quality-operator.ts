/** Fixed current 24+6 operator. It consumes external approval; it never issues one. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { open, stat } from "node:fs/promises";
import { lstatSync, realpathSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { materialDigestSchema as digest, materialIdSchema as id, materialTimestampSchema as timestamp } from "../app/contracts/documents";
import historicalDraft from "../docs/verification/materials-quality-next/request-draft/manifest.json" with { type: "json" };
import modalDraft from "../docs/verification/materials-quality-next/modal-request-bindings.json" with { type: "json" };
import { assertNoLinks, readRegularFile, safeRelative } from "./lib/restricted-candidate-files.mjs";
import { readQualificationConfiguration, runDocumentQualification, type MaterialCollectionBeforeSend } from "./materials-qualification-runner";
import { createQualificationJournal } from "./materials-qualification-journal";
import { createQualificationOutputWriter } from "./materials-qualification-capture";
import { inspectDiagnosticPilotSourceManifest } from "./materials-diagnostic-pilot-host";
import { collectAuthorizedSupplementForOperator, inspectSupplementSettings } from "./collect-materials-supplements";
import { readPinnedSupplementIssuance } from "./materials-supplement-ledger";
import { documentAcceptanceConfigurationDigest } from "../worker/document-executor/acceptance-policy";
import { withDocumentDeadline } from "../worker/document-executor/generation-receipt";
import type { DocumentFetch } from "../worker/document-executor/provider-http";
import { loadCurrentQualityRuntime } from "./materials-current-quality-runtime";

export const CURRENT_REQUEST_DRAFT_SHA256 = "06238bde3fbc45aa33efb38da95234cfbb74d34d162bf1941d9ac0c56c964ac7";
const MODAL_REQUEST_DRAFT_SHA256 = "c16349e254118befba96cb9b729acec998aceaa3d4762ac83a4ebd926a5bf981";
const historicalDraftPath = "docs/verification/materials-quality-next/request-draft/manifest.json";
const modalDraftPath = "docs/verification/materials-quality-next/modal-request-bindings.json";
const REQUIRED_RUNTIME_ATTACHMENTS = [
  "docs/verification/materials-quality-next/current-references.mjs",
  "docs/verification/materials-quality-next/current-captures.ts",
  "docs/verification/materials-quality-next/current-adapter.ts",
];
const MAX_WINDOW_MS = 2 * 60 * 60 * 1000, READBACK_MAX_AGE_MS = 15 * 60 * 1000;
const reasons = {
  "invalid-packet": "Check the externally issued packet, digest and private file permissions.",
  "approval-window": "Obtain a fresh approval window; this command cannot renew it.",
  "source-drift": "Source, body or evidence pins changed; review and freeze the packet again.",
  "route-unavailable": "The reviewed route, pricing or strict ZDR listing could not be confirmed.",
  "account-evidence": "Refresh the independently reviewed Credits and guardrail evidence.",
  "key-readback": "Inspect the dedicated key metadata and its active restrictions.",
  "key-mismatch": "Use the dedicated key bound to the approved packet.",
  "insufficient-funds": "The verified allowance cannot cover this scope; no limit change is automatic.",
  "used-slot": "This run has already started; preserve its evidence and do not repeat it.",
  "ledger-unresolved": "Check the pinned six-document ledger and reconcile its open or held run.",
  "collection-stopped": "Collection or capture is incomplete; preserve the ledgers and do not retry inference.",
  "local-write": "Check private local output permissions and retain existing evidence.",
} as const;
type Reason = keyof typeof reasons;
class OperatorRefusal extends Error { constructor(readonly reason?: Reason) { super("current-quality-operator-refused"); } }
const fail = (reason?: Reason): never => { throw new OperatorRefusal(reason); };
const requireMatch = (value: unknown, reason?: Reason): void => { if (!value) fail(reason); };
export function operatorFailure(error: unknown, stage: Reason) {
  const reason = error instanceof OperatorRefusal && error.reason ? error.reason : stage;
  return { status: "refused", reason, message: reasons[reason] };
}
let currentStage: Reason = "invalid-packet";
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const file = z.strictObject({ path: z.string().min(1).max(1024), sha256: digest });
const run = z.strictObject({ runId: id, authorizationId: id, issuance: file });
const historicalApprovalSchema = z.strictObject({ version: z.literal("materials-current-quality-v1"), status: z.literal("owner-approved"), packetId: id,
  candidateCommit: z.string().regex(/^[a-f0-9]{40}$/u), packetCommit: z.string().regex(/^[a-f0-9]{40}$/u),
  approvedAt: timestamp, expiresAt: timestamp, credentialSha256: digest, ownerApproval: file, accountReadback: file,
  sourceManifest: file, attachments: z.array(file).min(1).max(64), qualification: run, supplement: run,
  requestDraftSha256: z.literal(CURRENT_REQUEST_DRAFT_SHA256), totalBudgetMicroUsd: z.literal(2_450_000), maxMetadataReadsPerDocument: z.literal(3) });
const modalApprovalSchema = historicalApprovalSchema.extend({
  version: z.literal("materials-current-quality-modal-v1"), requestDraftSha256: z.literal(MODAL_REQUEST_DRAFT_SHA256),
  firstReceiptDocumentId: z.literal("resume-01"), implicitCacheAccepted: z.literal(true), screeningAndLegalPreservationAccepted: z.literal(true),
});
const approvalSchema = z.discriminatedUnion("version", [historicalApprovalSchema, modalApprovalSchema]);
type Approval = z.infer<typeof approvalSchema>;
function requestDraft(approval: Approval) {
  return approval.version === "materials-current-quality-modal-v1" ? modalDraft : historicalDraft;
}
const accountSchema = z.strictObject({ creatorUserId: z.string().min(1).nullable(), organizationId: z.string().min(1).nullable(), workspaceId: z.string().min(1) });
type Account = z.infer<typeof accountSchema>;
const readbackSchema = z.strictObject({ version: z.literal("materials-current-account-readback-v1"), reviewedBy: id, capturedAt: timestamp,
  account: accountSchema, credentialSha256: digest, source: z.literal("openrouter-credits-ui"), precision: z.literal("whole-dollar-lower-bound"),
  displayedUsd: z.string().regex(/^(?:0|[1-9]\d{0,6})\.\d{2}$/u), evidence: file,
  strictZdrAssigned: z.literal(true), safetyRetentionAllowed: z.literal(false), inputOutputLogging: z.literal(false), trainingEnabled: z.literal(false),
  publicPrompts: z.literal(false), traceDestinations: z.literal(0), responseCacheOptIn: z.literal(false), moonshotByok: z.literal(false),
  implicitCacheScope: z.literal("thirty-synthetic-documents") });
const modalReadbackSchema = readbackSchema.omit({ moonshotByok: true }).extend({
  version: z.literal("materials-modal-account-readback-v1"), modalByok: z.literal(false), byokOnlyRouting: z.literal(false),
});
function inWindow(approval: Approval, time: Date) {
  const start = Date.parse(approval.approvedAt), end = Date.parse(approval.expiresAt), now = time.getTime();
  requireMatch(Number.isFinite(now) && end > start && end - start <= MAX_WINDOW_MS && start <= now && now < end, "approval-window");
}
export function readCurrentApproval(raw: string, externalSha256: string, now: Date) {
  requireMatch(Buffer.byteLength(raw) <= 32_768 && digest.safeParse(externalSha256).success && hash(raw) === externalSha256);
  const approval = approvalSchema.parse(JSON.parse(raw));
  const attachmentPaths = new Set(approval.attachments.map(attachment => attachment.path));
  requireMatch(attachmentPaths.size === approval.attachments.length
    && REQUIRED_RUNTIME_ATTACHMENTS.every(path => attachmentPaths.has(path)), "invalid-packet");
  inWindow(approval, now);
  requireMatch(approval.qualification.runId !== approval.supplement.runId && approval.qualification.authorizationId !== approval.supplement.authorizationId);
  return approval;
}
export function readCurrentCredits(raw: string, approval: Approval, now: Date) {
  requireMatch(Buffer.byteLength(raw) <= 16_384);
  const schema = approval.version === "materials-current-quality-modal-v1" ? modalReadbackSchema : readbackSchema;
  const record = schema.parse(JSON.parse(raw)), at = Date.parse(record.capturedAt);
  requireMatch(at <= now.getTime() && now.getTime() - at <= READBACK_MAX_AGE_MS && record.credentialSha256 === approval.credentialSha256, "account-evidence");
  // This deliberately claims only whole dollars, never that the UI's rounded cents are exact.
  const minimumMicroUsd = Number(record.displayedUsd.split(".")[0]) * 1_000_000;
  requireMatch(minimumMicroUsd >= approval.totalBudgetMicroUsd && (record.account.creatorUserId !== null || record.account.organizationId !== null), "account-evidence");
  return { ...record, minimumMicroUsd };
}

/** Keep source number lexemes; binary floating point cannot round a near-limit balance upward. */
export function readCurrentKeyAllowance(raw: string, account: Account | null, requiredMicroUsd: number, now: Date, inspectOnly = false) {
  requireMatch(Buffer.byteLength(raw) <= 32_768 && Number.isSafeInteger(requiredMicroUsd) && requiredMicroUsd > 0);
  const literals = new WeakMap<object, string>();
  const parsed = JSON.parse(raw, (_key, value: unknown, context?: { source?: string }) => {
    if (typeof value !== "number") return value;
    if (!context?.source) return fail();
    const wrapped = {}; literals.set(wrapped, context.source); return wrapped;
  });
  const number = z.custom<object>(value => typeof value === "object" && value !== null && literals.has(value));
  const budgetSchema = z.object({ scope: z.enum(["workspace_default_member", "workspace_default_key", "member", "api_key", "workspace", "key_limit"]),
    guardrail_id: z.string().nullable(), budget_id: z.string().nullable(), limit_usd: number, spend_usd: number, remaining_usd: number,
    reset_interval: z.enum(["daily", "weekly", "monthly"]).nullable(), resets_at: timestamp.nullable(), include_byok: z.boolean() });
  const key = z.object({ creator_user_id: z.string().nullable(), organization_id: z.string().nullable(), workspace_id: z.string().nullable(),
    limit: number.nullable(), limit_remaining: number.nullable(), usage: number, byok_usage: number, limit_reset: z.string().nullable(), include_byok_in_limit: z.boolean(),
    is_free_tier: z.boolean(), is_management_key: z.boolean(), is_provisioning_key: z.boolean(),
    allowed_data_regions: z.array(z.enum(["global", "europe", "us"])), budgets: z.array(budgetSchema).max(64),
    effective_budget: budgetSchema.nullable(), expires_at: timestamp.nullable().optional() }).parse(parsed.data);
  const issues: Reason[] = [];
  if (account && (key.creator_user_id !== account.creatorUserId || key.organization_id !== account.organizationId || key.workspace_id !== account.workspaceId)) issues.push("key-mismatch");
  const micro = (value: object, upward = false): number => {
    const source = literals.get(value)!;
    const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/u.exec(source);
    if (!match) return fail();
    const fraction = match[3] ?? "", exponent = Number(match[4] ?? 0) - fraction.length + 6;
    requireMatch(Number.isSafeInteger(exponent) && Math.abs(exponent) <= 1000);
    const coefficient = BigInt(match[2]! + fraction);
    const divisor = exponent < 0 ? BigInt(10) ** BigInt(-exponent) : BigInt(1);
    const numerator = exponent >= 0 ? coefficient * BigInt(10) ** BigInt(exponent) : coefficient;
    const awayFromZero = match[1] === "-" ? !upward : upward;
    const integer = numerator / divisor + (awayFromZero && numerator % divisor !== BigInt(0) ? BigInt(1) : BigInt(0));
    requireMatch(integer <= BigInt(Number.MAX_SAFE_INTEGER));
    return Number(integer) * (match[1] === "-" ? -1 : 1);
  };
  const policyMatches = key.limit !== null && key.limit_remaining !== null && micro(key.limit, true) <= 3_000_000 && micro(key.limit) > 0
    && micro(key.usage) >= 0 && micro(key.byok_usage, true) === 0 && key.limit_reset === null && key.workspace_id !== null
    && !key.is_free_tier && !key.is_management_key && !key.is_provisioning_key && key.allowed_data_regions.includes("global")
    && (!key.expires_at || Date.parse(key.expires_at) > now.getTime());
  if (!policyMatches) issues.push("key-readback");
  const bounds = key.limit && key.limit_remaining ? [micro(key.limit_remaining), micro(key.limit) - micro(key.usage, true)] : [0];
  const budgetIdentity = (value: z.infer<typeof budgetSchema>) => JSON.stringify({ ...value,
    limit_usd: literals.get(value.limit_usd), spend_usd: literals.get(value.spend_usd), remaining_usd: literals.get(value.remaining_usd) });
  if (!key.effective_budget || !key.budgets.some(value => budgetIdentity(value) === budgetIdentity(key.effective_budget!))) issues.push("key-readback");
  for (const budget of key.budgets) {
    if (micro(budget.limit_usd) < 0 || micro(budget.spend_usd) < 0 || budget.resets_at && Date.parse(budget.resets_at) <= now.getTime()) issues.push("key-readback");
    bounds.push(micro(budget.remaining_usd), micro(budget.limit_usd) - micro(budget.spend_usd, true));
  }
  const minimumMicroUsd = Math.min(...bounds);
  if (minimumMicroUsd < requiredMicroUsd) issues.push("insufficient-funds");
  if (!inspectOnly && issues.length) fail(issues[0]);
  return { source: "openrouter-key" as const, minimumMicroUsd, budgetCount: key.budgets.length,
    account: { creatorUserId: key.creator_user_id, organizationId: key.organization_id, workspaceId: key.workspace_id },
    eligibleForProposedRun: issues.length === 0, reasons: [...new Set(issues)],
    amounts: { limit: key.limit ? literals.get(key.limit) : null, usage: literals.get(key.usage), remaining: key.limit_remaining ? literals.get(key.limit_remaining) : null },
    budgets: key.budgets.map(value => JSON.parse(budgetIdentity(value)) as unknown) };
}
export function inspectCurrentKeyReadback(raw: string, now: Date) {
  return readCurrentKeyAllowance(raw, null, 2_450_000, now, true);
}

export function createCurrentSendGuard(approval: Approval, group: "resume-jd" | "supplement", verifySource: () => Promise<void>,
  now = () => new Date(), checkRoute?: () => Promise<unknown>): MaterialCollectionBeforeSend {
  const draft = requestDraft(approval);
  const rows = draft.records.filter(row => row.group === group), sent = new Set<string>();
  let latest = Date.parse(approval.approvedAt);
  return async request => {
    const row = rows[sent.size];
    requireMatch(row && row.documentId === request.documentId && !sent.has(request.documentId)
      && request.url === draft.configurations[group].config.endpoint && request.redirect === "manual" && request.bodySha256 === row.requestBodySha256, "source-drift");
    await verifySource();
    if (approval.version === "materials-current-quality-modal-v1") {
      if (!checkRoute) return fail("route-unavailable");
      await checkRoute();
    }
    const current = now(); requireMatch(current.getTime() >= latest); latest = current.getTime(); inWindow(approval, current);
    sent.add(request.documentId);
  };
}
export async function claimCurrentSlot(directory: string, runId: string, packetSha256: string) {
  id.parse(runId); digest.parse(packetSha256);
  const path = join(directory, `${runId}.started`); await assertNoLinks(path, true);
  const handle = await open(path, "wx", 0o600).catch(error => { if ((error as NodeJS.ErrnoException).code === "EEXIST") fail("used-slot"); throw error; });
  try { await handle.writeFile(JSON.stringify({ runId, packetSha256, startedAt: new Date().toISOString() }) + "\n"); await handle.sync(); }
  finally { await handle.close(); }
}
type Completion = { requestsSent: number; heldMicroUsd: number; settledMicroUsd: number; stoppedReason: string | null;
  documents: { documentId: string; accounting: string; receiptId: string | null; actualMicroUsd: number | null; audit: { status: string } | null }[] };
export function currentQualificationComplete(result: Completion, capture: { complete: boolean }) {
  const ids = historicalDraft.records.filter(row => row.group === "resume-jd").map(row => row.documentId);
  return capture.complete && result.requestsSent === 24 && result.heldMicroUsd === 0 && result.stoppedReason === null
    && result.documents.length === 24 && new Set(result.documents.map(row => row.receiptId)).size === 24
    && result.documents.every((row, index) => row.documentId === ids[index] && row.accounting === "settled" && row.receiptId
      && row.actualMicroUsd !== null && row.audit?.status === "verified")
    && result.documents.reduce((sum, row) => sum + row.actualMicroUsd!, 0) === result.settledMicroUsd;
}
type QualificationOptions = { approval: Approval; directory: string; settings: string; fetch: DocumentFetch; now: () => Date;
  verifySource: () => Promise<void>; checkRoute?: () => Promise<unknown> };
const fixtureKey = "synthetic-current-operator-key";
const qualificationEnvironment = (settings: string, key: string) => ({ ARC_DOCUMENT_QUALIFICATION_ENABLED: "true",
  ARC_DOCUMENT_QUALIFICATION_SETTINGS: settings, ARC_DOCUMENT_PROVIDER_API_KEY: key });
async function runQualification(options: QualificationOptions, key: string, mode: "authorized-live" | "offline-test") {
  const purpose = options.approval.version === "materials-current-quality-modal-v1" ? "current-quality" : undefined;
  const env = qualificationEnvironment(options.settings, key), checked = readQualificationConfiguration(env, options.now(), purpose);
  requireMatch(hash(key) === options.approval.credentialSha256);
  const journal = createQualificationJournal(join(options.directory, "qualification"), checked.runId);
  const configurationSha256 = await documentAcceptanceConfigurationDigest(checked.config, checked.qualification);
  const writer = createQualificationOutputWriter(join(options.directory, "captures"), { runId: checked.runId, authorizationId: checked.authorization.id,
    mode, candidateCommit: options.approval.candidateCommit, configurationSha256 });
  const result = await runDocumentQualification(env, { mode, now: options.now, fetch: options.fetch, checkpoint: journal.checkpoint, purpose,
    capture: writer.capture, beforeSend: createCurrentSendGuard(options.approval, "resume-jd", options.verifySource, options.now, options.checkRoute) });
  journal.finish(result);
  return { result, captureDirectory: writer.directory, bindingSha256: writer.bindingSha256, configurationSha256 };
}
/** Local response fixtures never receive a live credential or acquire a live label. */
export function runCurrentQualificationFixture(options: QualificationOptions) {
  requireMatch(options.approval.credentialSha256 === hash(fixtureKey));
  return runQualification(options, fixtureKey, "offline-test");
}

const checkout = resolve(fileURLToPath(new URL("../", import.meta.url)));
export function inspectCurrentSupplementLedger(directory: string, ledgerSha256: string) {
  const path = join(directory, "ledger.sqlite"), info = lstatSync(path);
  requireMatch(info.isFile() && info.nlink === 1 && relative(resolve(path), realpathSync.native(path)) === "", "ledger-unresolved");
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const identity = db.prepare("SELECT id FROM ledger_identity WHERE singleton=1").get();
    requireMatch(typeof identity?.id === "string" && hash(JSON.stringify([realpathSync.native(path), identity.id])) === ledgerSha256
      && !db.prepare("SELECT 1 FROM collection_runs WHERE status IN ('collecting','held') LIMIT 1").get(), "ledger-unresolved");
    return true;
  } finally { db.close(); }
}
async function pinned(directory: string, attachment: z.infer<typeof file>, maximum = 8 * 1024 * 1024) {
  const path = join(directory, safeRelative(attachment.path)); await assertNoLinks(path);
  const info = await stat(path); requireMatch(info.isFile() && info.nlink === 1 && info.size <= maximum);
  const bytes = await readRegularFile(path); requireMatch(bytes.length <= maximum && hash(bytes) === attachment.sha256); return bytes;
}
async function unused(directory: string, runId: string) {
  const path = join(directory, `${runId}.started`); await assertNoLinks(path, true);
  try { await stat(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  fail("used-slot");
}
async function writeResult(directory: string, name: string, value: unknown, key: string) {
  const text = JSON.stringify(value, null, 2) + "\n"; requireMatch(!text.includes(key) && !text.includes(JSON.stringify(key).slice(1, -1)));
  const handle = await open(join(directory, name), "wx", 0o600);
  try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
}
async function readOperatorEndpoint(transport: DocumentFetch, url: string, maximum: number, headers?: HeadersInit) {
  return withDocumentDeadline(new AbortController().signal, 30_000, async (signal, checkTime) => {
    const response = await transport(url, { method: "GET", redirect: "manual", cache: "no-store", credentials: "omit", headers, signal });
    if (response.status !== 200 || response.redirected || !response.body) {
      void response.body?.cancel().catch(() => {}); return fail();
    }
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener("abort", cancel, { once: true });
    let length = 0;
    try {
      for (;;) {
        checkTime(); const part = await reader.read(); if (part.done) break;
        length += part.value.length; if (length > maximum) fail(); chunks.push(part.value);
      }
      checkTime(); return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    } catch (error) { cancel(); throw error; }
    finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
  });
}
async function readKey(key: string, account: Account | null, needed: number, inspectOnly = false) {
  const raw = await readOperatorEndpoint(globalThis.fetch, "https://openrouter.ai/api/v1/key", 32_768, { authorization: `Bearer ${key}` });
  const readback = { ...readCurrentKeyAllowance(raw, account, needed, new Date(), inspectOnly), responseSha256: hash(raw), checkedAt: new Date().toISOString() };
  const serialized = JSON.stringify(readback);
  requireMatch(!serialized.includes(key) && !serialized.includes(JSON.stringify(key).slice(1, -1)), "key-readback");
  return readback;
}

/** Only public catalogues are read. The first generation receipt must still establish the actual endpoint UUID. */
export async function checkCurrentModalCatalogue(transport: DocumentFetch) {
  const { config, qualification } = modalDraft.configurations["resume-jd"];
  const [standard, zdr] = await Promise.all([
    readOperatorEndpoint(transport, `https://openrouter.ai/api/v1/models/${config.model}/endpoints`, 512 * 1024),
    readOperatorEndpoint(transport, "https://openrouter.ai/api/v1/endpoints/zdr", 4 * 1024 * 1024),
  ]);
  const rows = z.array(z.record(z.string(), z.unknown()));
  const catalogue = z.object({ data: z.object({ id: z.literal(config.model), endpoints: rows }) }).parse(JSON.parse(standard));
  const strict = z.object({ data: rows }).parse(JSON.parse(zdr));
  const tag = config.routingPolicy.providerOrder[0]!;
  const match = (entries: z.infer<typeof rows>) => {
    const found = entries.filter(row => row.model_id === config.model && row.tag === tag);
    requireMatch(found.length === 1, "route-unavailable"); return found[0]!;
  };
  const zero = z.union([z.literal(0), z.string().regex(/^0(?:\.0+)?$/u)]);
  const endpoint = z.object({
    provider_name: z.literal(qualification.receiptRoute.providerName), name: z.literal("Modal | " + qualification.receiptRoute.generationModel),
    quantization: z.literal("mxfp4"), service_tier: z.null(), status: z.literal(0),
    pricing: z.object({ prompt: z.string().regex(/^0\.0000020*$/u), completion: z.string().regex(/^0\.000010*$/u),
      input_cache_read: z.string().regex(/^0\.00000020*$/u) }).catchall(zero),
    supported_parameters: z.array(z.string()), context_length: z.number().int().min(config.maxInputTokens + config.maxOutputTokens),
    max_completion_tokens: z.number().int().min(config.maxOutputTokens), max_prompt_tokens: z.number().int().min(config.maxInputTokens).nullable(),
  });
  const strictRow = match(strict.data);
  requireMatch(strictRow.safety_retention === false, "route-unavailable");
  for (const row of [match(catalogue.data.endpoints), strictRow]) {
    const parsed = endpoint.safeParse(row);
    requireMatch(parsed.success && ["max_tokens", "response_format"].every(param => parsed.data.supported_parameters.includes(param)), "route-unavailable");
  }
  return { tag, model: config.model, checkedAt: new Date().toISOString(), standardSha256: hash(standard), strictZdrSha256: hash(zdr) };
}

function privateDirectories(paths: string[]) {
  requireMatch(process.platform === "win32" && process.env.SystemRoot);
  // Reuse the existing host's SID-based owner/SYSTEM/admin boundary. This also
  // applies when the Node entry is invoked directly rather than by the launcher.
  const script = `$ErrorActionPreference='Stop'
$allowed=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')
foreach($path in [Console]::In.ReadToEnd().Split([char]10)) {
  if(-not [IO.Directory]::Exists($path)){exit 1}
  foreach($entry in @((Get-Item -LiteralPath $path)) + @(Get-ChildItem -LiteralPath $path -Force -Recurse)) {
    if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){exit 1}
    $acl=Get-Acl -LiteralPath $entry.FullName
    if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -notin $allowed){exit 1}
    foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
      if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin $allowed){exit 1}
    }
  }
}`;
  execFileSync(join(process.env.SystemRoot!, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), ["-NoProfile", "-NonInteractive", "-Command", script], {
    input: paths.join("\n"), windowsHide: true, timeout: 20_000, stdio: ["pipe", "ignore", "ignore"],
    env: { NODE_ENV: "production", SystemRoot: process.env.SystemRoot, PATH: process.env.PATH } });
}

export async function inspectCurrentSupplementIssuance(raw: string, issuanceSha256: string) {
  const supplement = readPinnedSupplementIssuance(raw, issuanceSha256, "authorized-live").issued;
  const six = await inspectSupplementSettings({ config: supplement.config, qualification: supplement.qualification });
  requireMatch(isDeepStrictEqual(supplement.authorization.documents, six.documents)
    && supplement.authorization.perRequestMicroUsd === six.perRequestMicroUsd, "invalid-packet");
  return { supplement, six };
}

async function loadPacket(packetId: string, packetSha256: string) {
  id.parse(packetId); digest.parse(packetSha256); requireMatch(relative(checkout, process.cwd()) === "");
  const directory = join(homedir(), ".arc-materials", "gate-1b", "materials-b2", "quality-approvals", "current", packetId);
  await assertNoLinks(directory); await assertNoLinks(join(checkout, "work", "materials-supplement-collection"));
  privateDirectories([directory, join(checkout, "work", "materials-supplement-collection")]);
  const raw = (await pinned(directory, { path: "approved.json", sha256: packetSha256 }, 32_768)).toString("utf8");
  const approval = readCurrentApproval(raw, packetSha256, new Date()); requireMatch(approval.packetId === packetId);
  const draft = requestDraft(approval);
  const owner = await pinned(directory, approval.ownerApproval, 32_768); requireMatch(owner.length > 0);
  currentStage = "account-evidence";
  const accountRaw = (await pinned(directory, approval.accountReadback, 16_384)).toString("utf8");
  const credits = readCurrentCredits(accountRaw, approval, new Date()); await pinned(directory, credits.evidence);
  currentStage = "invalid-packet";
  const settings = (await pinned(directory, approval.qualification.issuance, 32_768)).toString("utf8");
  const supplementRaw = (await pinned(directory, approval.supplement.issuance, 32_768)).toString("utf8");
  const purpose = approval.version === "materials-current-quality-modal-v1" ? "current-quality" : undefined;
  const checked = readQualificationConfiguration(qualificationEnvironment(settings, "configuration-check-only"), new Date(), purpose);
  const { supplement, six } = await inspectCurrentSupplementIssuance(supplementRaw, approval.supplement.issuance.sha256);
  currentStage = "ledger-unresolved";
  inspectCurrentSupplementLedger(join(checkout, "work", "materials-supplement-collection"), supplement.authorization.ledgerSha256);
  currentStage = "invalid-packet";
  const publicSettings = JSON.parse(settings) as { config: unknown; qualification: unknown };
  for (const [actual, group] of [[publicSettings, "resume-jd"], [supplement, "supplement"]] as const) {
    const qualification = actual.qualification as Record<string, unknown>;
    requireMatch(isDeepStrictEqual(actual.config, draft.configurations[group].config)
      && isDeepStrictEqual({ ...qualification, qualified: false }, draft.configurations[group].qualification));
  }
  requireMatch(checked.runId === approval.qualification.runId && checked.authorization.id === approval.qualification.authorizationId
    && checked.authorization.totalBudgetMicroUsd === 2_000_000 && checked.reservationMicroUsd === 72_960
    && supplement.authorization.runId === approval.supplement.runId && supplement.authorization.id === approval.supplement.authorizationId
    && supplement.authorization.totalBudgetMicroUsd === 450_000 && supplement.authorization.maxMetadataReadsPerDocument === 3
    && supplement.authorization.credentialSha256 === approval.credentialSha256 && supplement.authorization.candidateCommit === approval.candidateCommit
    && supplement.authorization.configurationSha256 === six.configurationSha256
    && [checked.authorization, supplement.authorization].every(grant => grant.approvedAt === approval.approvedAt && grant.expiresAt === approval.expiresAt));
  await unused(directory, checked.runId); await unused(directory, supplement.authorization.runId);
  const verifySource = async () => {
    currentStage = "source-drift";
    inWindow(approval, new Date());
    await pinned(directory, { path: "approved.json", sha256: packetSha256 }, 32_768);
    for (const attachment of [approval.ownerApproval, approval.accountReadback, approval.qualification.issuance, approval.supplement.issuance, credits.evidence])
      await pinned(directory, attachment);
    await pinned(checkout, { path: approval.version === "materials-current-quality-modal-v1" ? modalDraftPath : historicalDraftPath,
      sha256: approval.requestDraftSha256 });
    for (const attachment of [approval.sourceManifest, ...approval.attachments]) { requireMatch(attachment.path.startsWith("docs/")); await pinned(checkout, attachment); }
    const actual = await inspectDiagnosticPilotSourceManifest(checkout, approval.candidateCommit);
    const expected = JSON.parse((await pinned(checkout, approval.sourceManifest)).toString("utf8")); requireMatch(isDeepStrictEqual(actual, expected));
    const head = execFileSync("git", ["--no-lazy-fetch", "--no-replace-objects", "-c", "core.longpaths=true", "rev-parse", "HEAD"], {
      cwd: checkout, encoding: "utf8", windowsHide: true, timeout: 20_000, stdio: ["ignore", "pipe", "ignore"],
      env: { NODE_ENV: "production", PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_ALLOW_PROTOCOL: "", GIT_TERMINAL_PROMPT: "0" } }).trim();
    requireMatch(head === approval.packetCommit);
  };
  await verifySource();
  const runtime = await loadCurrentQualityRuntime();
  const references = await runtime.loadCurrentReviewedReferences(checkout);
  return { directory, approval, draft, raw, owner, accountRaw, credits, settings, supplementRaw, checked, verifySource, references, runtime, supplementLedgerSha256: supplement.authorization.ledgerSha256 };
}

async function main(mode: string, packetId: string, packetSha256: string) {
  requireMatch(["--verify", "--check", "--execute"].includes(mode));
  const packet = await loadPacket(packetId, packetSha256);
  if (mode === "--verify") return { status: "verified-without-credential", inferenceRequests: 0 };
  requireMatch(packet.approval.version === "materials-current-quality-modal-v1", "route-unavailable");
  const key = process.env.ARC_CURRENT_MATERIALS_KEY ?? ""; delete process.env.ARC_CURRENT_MATERIALS_KEY;
  requireMatch(key.length >= 8 && hash(key) === packet.approval.credentialSha256
    && ![packet.raw, packet.owner.toString("utf8"), packet.accountRaw, packet.settings, packet.supplementRaw].some(text => text.includes(key)), "key-mismatch");
  currentStage = "key-readback";
  const allowance = await readKey(key, packet.credits.account, packet.approval.totalBudgetMicroUsd);
  currentStage = "route-unavailable";
  const checkRoute = () => checkCurrentModalCatalogue(globalThis.fetch);
  const catalogue = await checkRoute();
  await packet.verifySource();
  if (mode === "--check") return { status: "read-only-check-passed", inferenceRequests: 0, creditsPrecision: packet.credits.precision, exactKeyBudgetsChecked: allowance.budgetCount };
  currentStage = "ledger-unresolved";
  inspectCurrentSupplementLedger(join(checkout, "work", "materials-supplement-collection"), packet.supplementLedgerSha256);
  currentStage = "local-write";
  await writeResult(packet.directory, "startup-funding.json", { key: allowance, catalogue, accountReadbackSha256: packet.approval.accountReadback.sha256,
    creditsPrecision: packet.credits.precision, creditsMinimumMicroUsd: packet.credits.minimumMicroUsd }, key);
  // Each phase owns its original ledger and a separate external once-only slot.
  await claimCurrentSlot(packet.directory, packet.approval.qualification.runId, packetSha256);
  currentStage = "collection-stopped";
  const qualification = await runQualification({ approval: packet.approval, directory: packet.directory, settings: packet.settings,
    fetch: globalThis.fetch, now: () => new Date(), verifySource: packet.verifySource, checkRoute }, key, "authorized-live");
  const captured = await packet.runtime.readQualificationCaptures(qualification.captureDirectory, { bindingSha256: qualification.bindingSha256,
    runId: packet.checked.runId, authorizationId: packet.checked.authorization.id, mode: "authorized-live", candidateCommit: packet.approval.candidateCommit,
    configurationSha256: qualification.configurationSha256, providerPolicyId: "materials-openrouter-kimi-k31-pro-mxfp4-zdr-extractive-v3",
    endpoint: packet.checked.config.endpoint, model: packet.checked.config.model, receiptRoute: packet.checked.qualification.receiptRoute,
    requestBodies: packet.draft.records.filter(row => row.group === "resume-jd").map(({ documentId, requestBodySha256 }) => ({ documentId, requestBodySha256 })) });
  requireMatch(currentQualificationComplete(qualification.result, captured), "collection-stopped");
  requireMatch(packet.credits.minimumMicroUsd - qualification.result.settledMicroUsd >= 450_000, "insufficient-funds");
  currentStage = "ledger-unresolved";
  inspectCurrentSupplementLedger(join(checkout, "work", "materials-supplement-collection"), packet.supplementLedgerSha256);
  currentStage = "key-readback";
  const supplementAllowance = await readKey(key, packet.credits.account, 450_000);
  currentStage = "route-unavailable";
  const supplementCatalogue = await checkRoute(); await packet.verifySource();
  await writeResult(packet.directory, "supplement-funding.json", { key: supplementAllowance, catalogue: supplementCatalogue, accountReadbackSha256: packet.approval.accountReadback.sha256,
    creditsPrecision: packet.credits.precision, creditsMinimumMicroUsd: packet.credits.minimumMicroUsd - qualification.result.settledMicroUsd }, key);
  await claimCurrentSlot(packet.directory, packet.approval.supplement.runId, packetSha256);
  currentStage = "collection-stopped";
  const supplement = await collectAuthorizedSupplementForOperator(packet.supplementRaw, { ARC_SUPPLEMENT_COLLECTION_ENABLED: "true",
    ARC_SUPPLEMENT_ISSUANCE_SHA256: packet.approval.supplement.issuance.sha256, ARC_SUPPLEMENT_PROVIDER_API_KEY: key },
  createCurrentSendGuard(packet.approval, "supplement", packet.verifySource, () => new Date(), checkRoute));
  await writeResult(packet.directory, "supplement-result.json", supplement, key);
  const supplementCaptures = await packet.runtime.readSupplementCaptures({ issuance: packet.supplementRaw, issuanceSha256: packet.approval.supplement.issuance.sha256,
    directory: join(checkout, "work", "materials-supplement-collection"), mode: "authorized-live" });
  const quality = await packet.runtime.evaluateCurrentQuality({ qualification: captured, supplement: supplementCaptures }, packet.references);
  await writeResult(packet.directory, "current-quality-result.json", quality, key);
  return { status: "collection-recorded", qualificationRequests: qualification.result.requestsSent, supplementRequests: supplement.requestsSent,
    captureComplete: captured.complete && supplementCaptures.complete, heldMicroUsd: supplement.heldMicroUsd, qualityReportWritten: true };
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [, , mode = "--check", packetId, packetSha256] = process.argv;
  try {
    if (mode === "--inspect-route" && process.argv.length === 3) {
      currentStage = "route-unavailable";
      process.stdout.write(JSON.stringify({ ...await checkCurrentModalCatalogue(globalThis.fetch), inferenceRequests: 0 }) + "\n");
    } else if ((mode === "--inspect-account" || mode === "--check") && process.argv.length <= 3) {
      currentStage = "key-readback";
      const key = process.env.ARC_CURRENT_MATERIALS_KEY ?? ""; delete process.env.ARC_CURRENT_MATERIALS_KEY; requireMatch(key.length >= 8);
      const { budgets: _budgets, ...readback } = await readKey(key, null, 2_450_000, true);
      void _budgets; // Detailed budget identities stay out of the terminal summary.
      process.stdout.write(JSON.stringify({ ...readback, credentialSha256: hash(key), mode: "read-only-account-inspection",
        inferenceRequests: 0, paidAuthorization: false, accountCreditsVerified: false }) + "\n");
    } else {
      requireMatch(process.argv.length === 5 && packetId && packetSha256);
      process.stdout.write(JSON.stringify(await main(mode, packetId!, packetSha256!)) + "\n");
    }
  } catch (error) { process.stdout.write(JSON.stringify(operatorFailure(error, currentStage)) + "\n"); process.exitCode = 2; }
  finally { delete process.env.ARC_CURRENT_MATERIALS_KEY; }
}
