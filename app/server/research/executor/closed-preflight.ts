import { z } from "zod";

export const CLOSED_PREFLIGHT_JOB_ID = "753e4995-30b1-4c4a-98ec-51e6d04b502d";
export const CLOSED_PREFLIGHT_PATH = "/api/intelligence/research/closed-preflight";
export const CLOSED_PREFLIGHT_EXECUTOR_PATH = "/internal/research-bridge/closed-preflight";

const requestSchema = z.object({}).strict();
const replySchema = z.object({ executorClosed: z.literal(true), jobAbsent: z.literal(true),
  siteOutboxEmpty: z.literal(true) }).strict();

export function parseClosedPreflightRequest(value: unknown) { return requestSchema.parse(value); }
export function parseClosedPreflightReply(value: unknown) { return replySchema.parse(value); }
