import { z } from "zod";
import { canonicalJson } from "../../../lib/planning/fingerprint";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../execution-policy";
import { hashBridgeJob, parseBridgeJob } from "./job";
import { BRIDGE_AUTH_PROTOCOL } from "./auth";
import { BRIDGE_BODY_LIMITS, bridgeByteLength, decodeBridgeJson } from "./body";

export const BRIDGE_RESULT_MARGIN_MS = 30_000;

export class BridgeBeginError extends Error {
  constructor(readonly code: "invalid-message" | "conflict" | "insufficient-time" | "unavailable") {
    super(`Research bridge begin failure: ${code}`);
    this.name = "BridgeBeginError";
  }
}

const MAX_SAFE_TIME = Number.MAX_SAFE_INTEGER;
const ACTIVE_TTL_MS = KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs;
const RESEARCH_TIMEOUT_MS = KIMI_RESEARCH_EXECUTION_POLICY.researchTimeoutMs;
const time = z.number().int().min(0).max(MAX_SAFE_TIME);

const grantSchema = z.object({
  protocol: z.literal(BRIDGE_AUTH_PROTOCOL),
  jobId: z.uuid(),
  requestHash: z.string().length(64).regex(/^[0-9a-f]{64}$/u),
  beganAt: time.max(MAX_SAFE_TIME - ACTIVE_TTL_MS),
  executionExpiresAt: time,
}).strict().refine((value) => (
  value.executionExpiresAt === value.beganAt + ACTIVE_TTL_MS
));

const replySchema = z.object({
  grant: grantSchema,
  observedAt: time,
  remainingMs: time.max(ACTIVE_TTL_MS),
}).strict().refine((value) => (
  value.observedAt >= value.grant.beganAt
  && value.remainingMs === Math.max(0, value.grant.executionExpiresAt - value.observedAt)
));

export type BridgeBeginGrant = Readonly<z.infer<typeof grantSchema>>;
export type BridgeBeginReply = Readonly<{
  grant: BridgeBeginGrant;
  observedAt: number;
  remainingMs: number;
}>;

function invalidMessage(): never {
  throw new BridgeBeginError("invalid-message");
}

export function parseBridgeBeginGrant(input: unknown): BridgeBeginGrant {
  try {
    const bytes = new TextEncoder().encode(canonicalJson(input));
    if (bytes.byteLength > BRIDGE_BODY_LIMITS.status) throw new Error();
    return Object.freeze(grantSchema.parse(decodeBridgeJson(bytes)));
  } catch {
    return invalidMessage();
  }
}

function parseOwned(input: unknown): BridgeBeginReply {
  const bytes = new TextEncoder().encode(canonicalJson(input));
  if (bytes.byteLength > BRIDGE_BODY_LIMITS.status) throw new Error();
  const value = replySchema.parse(decodeBridgeJson(bytes));
  return Object.freeze({
    ...value,
    grant: Object.freeze({ ...value.grant }),
  });
}

export function parseBridgeBeginReply(input: unknown): BridgeBeginReply {
  try {
    return parseOwned(input);
  } catch {
    return invalidMessage();
  }
}

export function encodeBridgeBeginReply(input: unknown): Uint8Array<ArrayBuffer> {
  const value = parseBridgeBeginReply(input);
  return new TextEncoder().encode(canonicalJson(value));
}

export function decodeBridgeBeginReply(bytes: Uint8Array): BridgeBeginReply {
  try {
    const actualBytes = bridgeByteLength(bytes);
    if (
      actualBytes === 0
      || actualBytes > BRIDGE_BODY_LIMITS.status
    ) throw new Error();
    return parseBridgeBeginReply(decodeBridgeJson(bytes));
  } catch {
    return invalidMessage();
  }
}

export async function matchBridgeBeginReply(
  input: unknown,
  expectedJob: unknown,
): Promise<BridgeBeginReply> {
  const reply = parseBridgeBeginReply(input);
  let job: ReturnType<typeof parseBridgeJob>;
  try {
    job = parseBridgeJob(expectedJob);
  } catch {
    return invalidMessage();
  }

  let expectedHash: string;
  try {
    expectedHash = await hashBridgeJob(job);
  } catch {
    throw new BridgeBeginError("unavailable");
  }

  if (
    reply.grant.jobId !== job.jobId
    || reply.grant.requestHash !== expectedHash
    || reply.grant.beganAt < job.createdAt
    || reply.grant.beganAt >= job.queueExpiresAt
  ) {
    throw new BridgeBeginError("conflict");
  }
  return reply;
}

export function assertBridgeProviderBudget(input: BridgeBeginReply, elapsedMs: number): void {
  const reply = parseBridgeBeginReply(input);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > MAX_SAFE_TIME) {
    return invalidMessage();
  }
  const remainingMs = reply.remainingMs - Math.ceil(elapsedMs);
  if (remainingMs < RESEARCH_TIMEOUT_MS + BRIDGE_RESULT_MARGIN_MS) {
    throw new BridgeBeginError("insufficient-time");
  }
}
