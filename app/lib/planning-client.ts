import { z } from "zod";
import {
  generatePlanningRequestSchema,
  planningEventRequestSchema,
  planningMutationResponseSchema,
  planningWorkspaceResponseSchema,
  replanDecisionRequestSchema,
  type GeneratePlanningRequest,
  type PlanningEventRequest,
  type ReplanDecisionRequest,
} from "../contracts/planning-api";
import type { PlanningMutationResult, PlanningWorkspace } from "../contracts/planning";
import { ArcApiError } from "./cloud-client";

const MAX_PLANNING_RESPONSE_BYTES = 4 * 1024 * 1024;

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
  loadWorkspace(): Promise<PlanningWorkspace | null>;
  generate(input: GeneratePlanningRequest): Promise<PlanningMutationResult>;
  appendEvent(input: PlanningEventRequest): Promise<PlanningMutationResult>;
  acceptReplan(input: ReplanDecisionRequest): Promise<PlanningMutationResult>;
  discardReplan(input: ReplanDecisionRequest): Promise<PlanningMutationResult>;
}

export function createPlanningClient(options: { fetch?: ArcFetch } = {}): PlanningClient {
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));

  async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit): Promise<T> {
    const response = await fetcher(path, {
      ...init,
      cache: "no-store",
      credentials: "include",
      headers: init.body ? { "content-type": "application/json", ...init.headers } : init.headers,
    });
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_PLANNING_RESPONSE_BYTES) {
      throw new Error("Arc returned an invalid response.");
    }
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
    return response.result;
  }

  return {
    async loadWorkspace() {
      const response = await request("/api/planning/workspace", planningWorkspaceResponseSchema, { method: "GET" });
      return response.workspace;
    },
    generate: (input) => mutation("/api/planning/generate", input, generatePlanningRequestSchema),
    appendEvent: (input) => mutation("/api/planning/events", input, planningEventRequestSchema),
    acceptReplan: (input) => mutation("/api/planning/replans/accept", input, replanDecisionRequestSchema),
    discardReplan: (input) => mutation("/api/planning/replans/discard", input, replanDecisionRequestSchema),
  };
}

export const planningClient = createPlanningClient();
