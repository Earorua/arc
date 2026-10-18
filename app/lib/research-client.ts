import { z } from "zod";
import {
  MAX_RESEARCH_PACKAGE_JSON_BYTES,
  researchHttpEnvelopeSchema,
  researchRequestSchema,
  researchRetryRequestSchema,
  researchSuccessEnvelopeSchema,
  type ResearchErrorCode,
  type ResearchRecovery,
  type ResearchRequest,
  type ResearchRetryRequest,
  type ResearchRunPublicView,
} from "../contracts/research";
import { ArcApiError } from "./cloud-client";

const maxResponseBytes = MAX_RESEARCH_PACKAGE_JSON_BYTES + 64_000;
const unavailableRequestId = "request-unavailable";
const runIdSchema = z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const requestIdSchema = researchSuccessEnvelopeSchema.shape.requestId;
const publicErrors: Record<ResearchErrorCode, { status: number; message: string; recovery?: ResearchRecovery }> = {
  UNAUTHENTICATED: { status: 401, message: "Sign in to use Arc research.", recovery: "sign-in" },
  INVALID_INPUT: { status: 400, message: "Research input is invalid." },
  NOT_FOUND: { status: 404, message: "Research run was not found." },
  CONFLICT: { status: 409, message: "Research state changed. Refresh and try again.", recovery: "refresh" },
  RATE_LIMITED: { status: 429, message: "Too many research requests. Try again shortly.", recovery: "retry" },
  ALLOWANCE_REACHED: { status: 429, message: "The current Research allowance has been reached.", recovery: "use-flagship" },
  RESEARCH_NEEDS_REVIEW: { status: 422, message: "Research needs review before it can be used.", recovery: "retry-or-flagship" },
  RESEARCH_UNAVAILABLE: { status: 503, message: "Research is temporarily unavailable.", recovery: "retry-or-flagship" },
  INTERNAL: { status: 500, message: "Arc could not complete this research request." },
};

export class ResearchClientError extends ArcApiError {
  readonly recovery: ResearchRecovery | undefined;

  constructor(code: ResearchErrorCode, requestId = unavailableRequestId, invalidResponse = false) {
    const stable = publicErrors[code];
    super(stable.status, code,
      invalidResponse ? "Arc returned an invalid research response." : stable.message,
      safeRequestId(requestId),
      stable.recovery === "refresh" || stable.recovery === "retry" || stable.recovery === "sign-in"
        ? stable.recovery : undefined);
    this.recovery = stable.recovery;
  }
}

export type ResearchClientResult = {
  run: ResearchRunPublicView;
  requestId: string;
  error: ResearchClientError | null;
};
export interface ResearchClient {
  startResearch(input: ResearchRequest, signal: AbortSignal): Promise<ResearchClientResult>;
  getResearch(runId: string, signal: AbortSignal): Promise<ResearchClientResult>;
  retryResearch(runId: string, input: ResearchRetryRequest, signal: AbortSignal): Promise<ResearchClientResult>;
}
type ArcFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function safeRequestId(value: unknown) {
  const parsed = requestIdSchema.safeParse(value);
  return parsed.success ? parsed.data : unavailableRequestId;
}
function invalidResponse(requestId?: string) { return new ResearchClientError("INTERNAL", requestId, true); }
function abortError() { return new DOMException("Research request aborted.", "AbortError"); }
function checkAbort(signal: AbortSignal) { if (signal.aborted) throw abortError(); }
function normalizedRole(role: string) { return role.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase(); }

async function readResponse(response: Response, signal: AbortSignal, requestId: string) {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maxResponseBytes)) {
    void response.body?.cancel().catch(() => undefined);
    throw invalidResponse(requestId);
  }
  const reader = response.body?.getReader();
  if (!reader) throw invalidResponse(requestId);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let result = "";
  let rejectAbort!: (error: DOMException) => void;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const onAbort = () => {
    // Cancellation must reach a pending read even when fetch has already resolved.
    void reader.cancel().catch(() => undefined);
    rejectAbort(abortError());
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    checkAbort(signal);
    const readBody = async () => {
      while (true) {
        const chunk = await reader.read();
        checkAbort(signal);
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maxResponseBytes) throw invalidResponse(requestId);
        result += decoder.decode(chunk.value, { stream: true });
      }
      return result + decoder.decode();
    };
    // One retained abort subscription for the body, regardless of chunk size.
    return await Promise.race([readBody(), aborted]);
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (signal.aborted) throw abortError();
    if (error instanceof ResearchClientError) throw error;
    throw invalidResponse(requestId);
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

export function createResearchClient(options: { fetch?: ArcFetch } = {}): ResearchClient {
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));
  async function request(path: string, signal: AbortSignal, body?: string, expected?: { runId?: string; role?: string; locale?: string }): Promise<ResearchClientResult> {
    checkAbort(signal);
    let response: Response;
    try {
      response = await fetcher(path, {
        method: body === undefined ? "GET" : "POST", signal, cache: "no-store", credentials: "include",
        ...(body === undefined ? {} : { body, headers: { "content-type": "application/json" } }),
      });
    } catch {
      checkAbort(signal);
      throw new ResearchClientError("RESEARCH_UNAVAILABLE");
    }
    if (signal.aborted) {
      void response.body?.cancel().catch(() => undefined);
      throw abortError();
    }
    let requestId = safeRequestId(response.headers.get("x-request-id"));
    const raw = await readResponse(response, signal, requestId);
    let payload: unknown;
    try { payload = JSON.parse(raw) as unknown; }
    catch { throw invalidResponse(requestId); }
    // A safe diagnostic identifier remains useful even when the rest is malformed.
    if (payload && typeof payload === "object" && "requestId" in payload) {
      const candidate = requestIdSchema.safeParse(payload.requestId);
      if (candidate.success) requestId = candidate.data;
    }
    const parsed = researchHttpEnvelopeSchema.safeParse(payload);
    if (!parsed.success) throw invalidResponse(requestId);
    const envelope = parsed.data;
    let error: ResearchClientError | null = null;
    if ("error" in envelope) {
      if (response.status !== publicErrors[envelope.error.code].status
        || envelope.error.code === "RESEARCH_NEEDS_REVIEW" && !envelope.run
        || body === undefined && envelope.run) throw invalidResponse(requestId);
      error = new ResearchClientError(envelope.error.code, envelope.requestId);
      if (!envelope.run) throw error;
    } else if (response.status !== 200
      || body !== undefined && (envelope.run.state === "failed" || envelope.run.state === "needs-review")) {
      throw invalidResponse(requestId);
    }
    const run = envelope.run!;
    if (expected?.runId && run.id !== expected.runId
      || expected?.role && normalizedRole(run.role) !== normalizedRole(expected.role)
      || expected?.locale && run.locale !== expected.locale) throw invalidResponse(requestId);
    if (run.state === "ready" && (run.packageId !== run.planningData.id
      || run.planningData.registry.blueprintId !== run.planningData.blueprint.id
      || run.planningData.registry.blueprintVersion !== run.planningData.blueprint.version)) throw invalidResponse(requestId);
    return { run, requestId: envelope.requestId, error };
  }
  return {
    async startResearch(input, signal) {
      const parsed = researchRequestSchema.safeParse(input);
      if (!parsed.success) throw new ResearchClientError("INVALID_INPUT");
      return request("/api/intelligence/research", signal, JSON.stringify(parsed.data), parsed.data);
    },
    async getResearch(runId, signal) {
      if (!runIdSchema.safeParse(runId).success) throw new ResearchClientError("INVALID_INPUT");
      return request(`/api/intelligence/research/${runId}`, signal, undefined, { runId });
    },
    async retryResearch(runId, input, signal) {
      const parsed = researchRetryRequestSchema.safeParse(input);
      if (!runIdSchema.safeParse(runId).success || !parsed.success) throw new ResearchClientError("INVALID_INPUT");
      return request(`/api/intelligence/research/${runId}/retry`, signal, JSON.stringify(parsed.data));
    },
  };
}

export const researchClient = createResearchClient();
export const startResearch = researchClient.startResearch;
export const getResearch = researchClient.getResearch;
export const retryResearch = researchClient.retryResearch;
