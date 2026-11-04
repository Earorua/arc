import type { DocumentAnalysisConfiguration } from "../../app/server/documents/policy";
import type { DocumentReceiptClaim } from "../../app/server/documents/provider";
import type { DocumentReceiptAudit } from "../../app/server/documents/provider-receipt";
import type { DocumentFetch, DocumentProviderQualification } from "./provider-http";

export const DOCUMENT_METADATA_TIMEOUT_MS = 30_000;
const MAX_METADATA_ATTEMPTS = 3;
const MAX_RESPONSE_BYTES = 128 * 1024;
export class DocumentHttpTimeout extends Error {}

/** Bound headers and streaming bodies even for a service transport that ignores AbortSignal. */
export async function withDocumentDeadline<T>(outer: AbortSignal, timeoutMs: number,
  operation: (signal: AbortSignal, checkTime: () => void) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const expiresAt = Date.now() + timeoutMs;
  const checkTime = () => {
    if (outer.aborted || controller.signal.aborted || Date.now() >= expiresAt) { controller.abort(); throw new DocumentHttpTimeout(); }
  };
  let expired!: () => void;
  const deadline = new Promise<never>((_, reject) => {
    expired = () => { reject(new DocumentHttpTimeout()); controller.abort(); };
  });
  const timer = setTimeout(expired, timeoutMs);
  outer.addEventListener("abort", expired, { once: true });
  try {
    checkTime();
    const value = await Promise.race([deadline, operation(controller.signal, checkTime)]);
    checkTime();
    return value;
  } finally {
    clearTimeout(timer);
    outer.removeEventListener("abort", expired);
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function reportsError(value: unknown): boolean {
  const row = record(value);
  return row.error != null || row.finish_reason === "error" || row.native_finish_reason === "error";
}
export function isFailedChatResponse(raw: Record<string, unknown>): boolean {
  return reportsError(raw) || (Array.isArray(raw.choices) && raw.choices.some(reportsError));
}
type CostKey = "cost" | "total_cost";
const costLiterals = new WeakMap<object, Partial<Record<CostKey, string>>>();
// Keep only numeric billing tokens from the bounded JSON reader. JSON.parse otherwise rounds them before comparison.
function rememberCost(this: object, key: string, value: unknown, context?: { source?: string }) {
  if ((key === "cost" || key === "total_cost") && typeof value === "number") {
    if (!context?.source || context.source.length > 128) throw new Error("Unsupported receipt price");
    const fields = costLiterals.get(this) ?? {};
    fields[key] = context.source;
    costLiterals.set(this, fields);
  }
  return value;
}
export async function readDocumentHttpJson(response: Response, signal: AbortSignal, checkTime: () => void): Promise<Record<string, unknown>> {
  if (!response.body) throw new Error();
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      checkTime();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (!value.byteLength || length > MAX_RESPONSE_BYTES) throw new Error();
      chunks.push(value);
    }
    checkTime();
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes), rememberCost));
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function receiptPrice(row: Record<string, unknown>, key: CostKey) {
  const value = row[key];
  if (typeof value !== "number" || value < 0) return null;
  const literal = costLiterals.get(row)?.[key];
  if (!literal && !Number.isFinite(value)) return null;
  const source = literal ?? String(value);
  const [significand, power = "0"] = source.toLowerCase().split("e");
  const [whole, fraction = ""] = significand!.replace(/^-/, "").split(".");
  const coefficient = (whole + fraction).replace(/^0+/u, "");
  if (!coefficient) return { source, decimal: "0", microUsd: 0 };
  if (source.startsWith("-")) return null;
  const digits = coefficient.replace(/0+$/u, "");
  const exponent = BigInt(power) - BigInt(fraction.length) + BigInt(coefficient.length - digits.length);
  const microDigits = exponent + BigInt(digits.length + 6);
  let microUsd: number | null = null;
  if (microDigits < BigInt(0)) microUsd = 0;
  else if (microDigits <= BigInt(16)) {
    const point = Number(microDigits);
    const integral = digits.slice(0, point).padEnd(point, "0");
    microUsd = count(Number(integral) + (digits.charAt(point) >= "5" ? 1 : 0));
  }
  return { source, decimal: digits + "e" + exponent, microUsd };
}
async function safeObservedLabel(value: unknown, approved: string): Promise<string | null> {
  if (value === approved) return approved;
  if (typeof value !== "string" || !value || value.length > 256) return null;
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return "sha256:" + Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
}
export function documentTokenPriceCeiling(inputTokens: number, outputTokens: number, qualification: DocumentProviderQualification): number {
  const numerator = BigInt(inputTokens) * BigInt(qualification.inputMicroUsdPerMillionTokens)
    + BigInt(outputTokens) * BigInt(qualification.outputMicroUsdPerMillionTokens);
  return Number((numerator + BigInt(999_999)) / BigInt(1_000_000));
}

function privateSafeReceiptId(id: unknown, privateText: string, apiKey: string): string | null {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,256}$/u.test(id) || id.includes(apiKey) || privateText.includes(id)) return null;
  // An opaque gateway ID must not carry a source excerpt inside a valid-looking prefix/suffix.
  for (let i = 0; i + 8 <= id.length; i++) if (privateText.includes(id.slice(i, i + 8))) return null;
  const keyFragment = Math.max(12, Math.ceil(apiKey.length / 2));
  for (let i = 0; i + keyFragment <= id.length; i++) if (apiKey.includes(id.slice(i, i + keyFragment))) return null;
  return id;
}
export function readChatReceipt(raw: Record<string, unknown>, privateText: string, apiKey: string) {
  const usage = record(raw.usage);
  const price = receiptPrice(usage, "cost");
  return {
    receiptId: privateSafeReceiptId(raw.id, privateText, apiKey),
    model: raw.model, provider: raw.provider, inputTokens: count(usage.prompt_tokens), outputTokens: count(usage.completion_tokens),
    actualMicroUsd: price?.microUsd ?? null, price,
  };
}
type ChatReceipt = ReturnType<typeof readChatReceipt>;

async function checkGeneration(data: Record<string, unknown>, chat: ChatReceipt, config: DocumentAnalysisConfiguration,
  qualification: DocumentProviderQualification, audit: DocumentReceiptAudit): Promise<DocumentReceiptAudit["status"]> {
  // Cost in a different generation's record never settles this request.
  if (data.id !== chat.receiptId) return "id-mismatch";
  const approved = qualification.receiptRoute;
  const responses = data.provider_responses;
  const attempts = Array.isArray(responses) ? responses.map(record) : [];
  const successes = attempts.filter(attempt => attempt.status === 200);
  if (reportsError(data) || (successes.length ? successes : attempts).some(reportsError)
    || (!successes.length && attempts.some(attempt => attempt.status != null))) {
    return "metadata-unavailable";
  }
  const soleResponse = Array.isArray(responses) && responses.length === 1 ? record(responses[0]) : null;
  const successful = soleResponse?.status === 200 ? soleResponse : null;
  audit.actualModel = await safeObservedLabel(data.model, config.model);
  audit.actualProvider = await safeObservedLabel(data.provider_name, approved.providerName);
  audit.actualEndpointId = await safeObservedLabel(successful?.endpoint_id, approved.endpointId);
  audit.metadataInputTokens = count(data.native_tokens_prompt);
  audit.metadataOutputTokens = count(data.native_tokens_completion);
  const price = receiptPrice(data, "total_cost");
  audit.metadataMicroUsd = price?.microUsd ?? null;
  audit.providerLatencyMs = count(data.latency);
  audit.providerGenerationMs = count(data.generation_time);
  if (chat.price && price && chat.price.decimal !== price.decimal) {
    audit.conflictingCostsUsd = { chat: chat.price.source, generation: price.source };
    return "cost-conflict";
  }
  if (data.model !== config.model || chat.model !== config.model) return "model-mismatch";
  if (!audit.actualProvider || !audit.actualEndpointId || !successful) return "route-unverified";
  if (data.provider_name !== approved.providerName || successful.endpoint_id !== approved.endpointId
    || (chat.provider !== undefined && chat.provider !== approved.providerName)
    || (successful.provider_name !== undefined && successful.provider_name !== approved.providerName)) return "route-mismatch";
  if (chat.inputTokens === null || chat.outputTokens === null || chat.actualMicroUsd === null
    || audit.metadataInputTokens !== chat.inputTokens || audit.metadataOutputTokens !== chat.outputTokens || audit.metadataMicroUsd !== chat.actualMicroUsd
    || chat.inputTokens > config.maxInputTokens || chat.outputTokens > config.maxOutputTokens) return "usage-mismatch";
  if (chat.actualMicroUsd > documentTokenPriceCeiling(chat.inputTokens, chat.outputTokens, qualification)) return "price-bound-exceeded";
  return "verified";
}

type AuditInputs = {
  config: DocumentAnalysisConfiguration; qualification: DocumentProviderQualification; fetch: DocumentFetch;
  chat: ChatReceipt; signal: AbortSignal; now: () => Date; sentAt: string; returnedAt: string;
  claimReceipt?: DocumentReceiptClaim;
};
export async function auditDocumentGeneration(input: AuditInputs): Promise<DocumentReceiptAudit> {
  const { config, qualification, chat, now, sentAt, returnedAt } = input;
  const audit: DocumentReceiptAudit = { status: "receipt-missing", actualModel: null, actualProvider: null, actualEndpointId: null,
    metadataAttempts: 0, metadataInputTokens: null, metadataOutputTokens: null, metadataMicroUsd: null,
    sentAt, returnedAt, checkedAt: returnedAt };
  if (!chat.receiptId) return audit;
  if (input.claimReceipt) {
    try {
      const unique = await input.claimReceipt(chat.receiptId, { sentAt, returnedAt, inputTokens: chat.inputTokens,
        outputTokens: chat.outputTokens, actualMicroUsd: chat.actualMicroUsd });
      if (!unique) return { ...audit, status: "duplicate-receipt", checkedAt: now().toISOString() };
    }
    catch { return { ...audit, status: "receipt-claim-failed", checkedAt: now().toISOString() }; }
  }
  // Only the pre-approved completion endpoint supplies the origin/path. The reply supplies just a validated opaque ID.
  audit.costEvidenceVersion = "wire-decimal-v1";
  const url = new URL(config.endpoint);
  url.pathname = url.pathname.replace(/\/chat\/completions$/u, "/generation");
  url.searchParams.set("id", chat.receiptId);
  try {
    const result = await withDocumentDeadline(input.signal, DOCUMENT_METADATA_TIMEOUT_MS, async (signal, checkTime) => {
      for (let attempt = 1; attempt <= MAX_METADATA_ATTEMPTS; attempt++) {
        checkTime();
        audit.metadataAttempts = attempt;
        const response = await input.fetch(url.href, { method: "GET", redirect: "manual", signal,
          headers: { authorization: "Bearer " + config.apiKey }, cache: "no-store" });
        if (!response.redirected && response.status === 200) {
          const raw = await readDocumentHttpJson(response, signal, checkTime);
          const observed = { ...audit };
          observed.status = raw.data && !reportsError(raw) ? await checkGeneration(record(raw.data), chat, config, qualification, observed) : "metadata-unavailable";
          return observed;
        }
        void response.body?.cancel().catch(() => {});
        if (response.redirected || ![202, 404, 429, 502, 503, 504].includes(response.status) || attempt === MAX_METADATA_ATTEMPTS) break;
        await new Promise<void>(resolve => setTimeout(resolve, 1000 * attempt));
      }
      return { ...audit, status: "metadata-unavailable" as const };
    });
    return { ...result, checkedAt: now().toISOString() };
  } catch (error) {
    audit.status = error instanceof DocumentHttpTimeout ? "metadata-timeout" : "metadata-unavailable";
  }
  return { ...audit, checkedAt: now().toISOString() };
}
