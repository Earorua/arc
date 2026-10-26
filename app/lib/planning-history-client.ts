import { z } from "zod";
import { planningHistorySchema, type PlanningHistory } from "../contracts/planning-history";
import { planningWorkspaceResponseSchema, type PlanningWorkspaceResponse } from "../contracts/planning-api";
import { readBoundedResponse } from "./planning-client";
import { ArcApiError } from "./cloud-client";

export interface PlanningHistoryClient {
  list(offset: number, signal?: AbortSignal): Promise<PlanningHistory>;
  load(goalId: string, signal?: AbortSignal): Promise<PlanningWorkspaceResponse>;
}

async function read<T>(query: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/planning/history?${query}`, { method: "GET", cache: "no-store", credentials: "include", signal });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new ArcApiError(response.status, response.status === 401 ? "UNAUTHENTICATED" : "HISTORY_UNAVAILABLE",
      "Saved learning history is unavailable.", "request-unavailable");
  }
  const value = await readBoundedResponse(response, signal);
  signal?.throwIfAborted();
  return schema.parse(JSON.parse(value));
}

export const planningHistoryClient: PlanningHistoryClient = {
  list: (offset, signal) => read(`offset=${offset}`, planningHistorySchema, signal),
  load: (goalId, signal) => read(`goal=${encodeURIComponent(goalId)}`, planningWorkspaceResponseSchema, signal),
};
