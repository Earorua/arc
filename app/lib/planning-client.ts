import { z } from "zod";
import {
  generatePlanningRequestSchema,
  planningEventRequestSchema,
  planningMutationResponseSchema,
  planningWorkspaceResponseSchema,
  replanDecisionRequestSchema,
  MAX_PLANNING_RESPONSE_BYTES,
  type GeneratePlanningRequest,
  type PlanningEventRequest,
  type PlanningMutationResponse,
  type PlanningWorkspaceResponse,
  type ReplanDecisionRequest,
} from "../contracts/planning-api";
import { ArcApiError } from "./cloud-client";

const invalidResponseId = "request-unavailable";

const planningErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1).max(64),
    message: z.string().min(1).max(240),
    requestId: z.string().min(1).max(128),
    action: z.enum(["refresh", "retry", "sign-in", "rebuild"]).optional(),
  }).strict(),
}).strict();

type ArcFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface PlanningClient {
  loadWorkspace(signal?: AbortSignal): Promise<PlanningWorkspaceResponse>;
  generate(input: GeneratePlanningRequest): Promise<PlanningMutationResponse>;
  appendEvent(input: PlanningEventRequest): Promise<PlanningMutationResponse>;
  acceptReplan(input: ReplanDecisionRequest): Promise<PlanningMutationResponse>;
  discardReplan(input: ReplanDecisionRequest): Promise<PlanningMutationResponse>;
}

export function createPlanningClient(options: { fetch?: ArcFetch } = {}): PlanningClient {
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));

  async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit): Promise<T> {
    init.signal?.throwIfAborted();
    const response = await fetcher(path, {
      ...init,
      cache: "no-store",
      credentials: "include",
      headers: init.body ? { "content-type": "application/json", ...init.headers } : init.headers,
    });
    if (init.signal?.aborted) {
      void response.body?.cancel().catch(() => undefined);
      init.signal.throwIfAborted();
    }
    const raw = await readBoundedResponse(response, init.signal ?? undefined);
    init.signal?.throwIfAborted();
    let payload: unknown;
    try { payload = JSON.parse(raw) as unknown; }
    catch { throw new Error("Arc returned an invalid response."); }
    if (!response.ok) {
      const parsed = planningErrorSchema.safeParse(payload);
      if (!parsed.success) throw new Error("Arc returned an invalid response.");
      throw new ArcApiError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.requestId,
        parsed.data.error.action,
      );
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new Error("Arc returned an invalid response.");
    return parsed.data;
  }

  async function mutation<T>(path: string, input: T, inputSchema: z.ZodType<T>) {
    const parsedInput = inputSchema.parse(input);
    const response = await request(path, planningMutationResponseSchema, {
      method: "POST",
      body: JSON.stringify(parsedInput),
    });
    return response;
  }

  return {
    async loadWorkspace(signal) {
      const response = await request("/api/planning/workspace", planningWorkspaceResponseSchema, { method: "GET", signal });
      return response;
    },
    generate: (input) => mutation("/api/planning/generate", input, generatePlanningRequestSchema),
    appendEvent: (input) => mutation("/api/planning/events", input, planningEventRequestSchema),
    acceptReplan: (input) => mutation("/api/planning/replans/accept", input, replanDecisionRequestSchema),
    discardReplan: (input) => mutation("/api/planning/replans/discard", input, replanDecisionRequestSchema),
  };
}

function invalidResponse(): ArcApiError {
  return new ArcApiError(500, "INTERNAL", "Arc returned an invalid response.", invalidResponseId);
}

async function readBoundedResponse(response: Response, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed > MAX_PLANNING_RESPONSE_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw invalidResponse();
    }
  }
  if (!response.body) throw invalidResponse();
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PLANNING_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw invalidResponse();
      }
      chunks.push(value);
    }
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ArcApiError) throw error;
    await reader.cancel().catch(() => undefined);
    throw invalidResponse();
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(combined); }
  catch { throw invalidResponse(); }
}

export const planningClient = createPlanningClient();
