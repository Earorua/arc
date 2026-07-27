import { z } from "zod";

const countersSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  z.number().finite().nonnegative(),
).refine((value) => Object.keys(value).length <= 16, "Too many operational counters.");

export const operationalEventSchema = z.object({
  requestId: z.uuid(),
  route: z.string().min(1).max(160),
  resultCode: z.string().min(1).max(64),
  latencyMs: z.number().int().nonnegative(),
  userSurrogate: z.string().min(16).max(128).nullable(),
  counters: countersSchema,
}).strict();

export type OperationalEvent = z.infer<typeof operationalEventSchema>;

export interface OperationalEventSink {
  record(event: OperationalEvent): Promise<void>;
}

type OperationalEventDraft = Omit<OperationalEvent, "userSurrogate"> & {
  userId?: string | null;
};

type OperationalEventOptions = {
  hash: (value: string) => Promise<string>;
};

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createOperationalEvent(
  draft: OperationalEventDraft,
  options: Partial<OperationalEventOptions> = {},
): Promise<OperationalEvent> {
  const hash = options.hash ?? sha256;
  return operationalEventSchema.parse({
    requestId: draft.requestId,
    route: draft.route,
    resultCode: draft.resultCode,
    latencyMs: draft.latencyMs,
    userSurrogate: draft.userId ? await hash(draft.userId) : null,
    counters: draft.counters,
  });
}
