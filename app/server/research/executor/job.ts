import { z } from "zod";
import { researchPackageSchema } from "../../../contracts/research";
import { canonicalJson } from "../../../lib/planning/fingerprint";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../execution-policy";
import { parseProviderRequest } from "../provider";
import { BRIDGE_AUTH_PROTOCOL } from "./auth";
import { BRIDGE_BODY_LIMITS, bridgeByteLength, decodeBridgeJson } from "./body";

export const BRIDGE_EXECUTOR_MODE = "cloudflare-workflow-v1" as const;
export const BRIDGE_QUEUE_TTL_MS = 120_000;

export class BridgeJobError extends Error {
  constructor(readonly code: "invalid-message" | "unavailable") {
    super(`Research bridge job failure: ${code}`);
    this.name = "BridgeJobError";
  }
}

const time = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const fingerprint = z.string().length(35).regex(/^p2-[0-9a-f]{32}$/u);
const requestId = z.string().min(1).max(256)
  .refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));

const bridgeJobSchema = z.object({
  protocol: z.literal(BRIDGE_AUTH_PROTOCOL),
  executor: z.literal(BRIDGE_EXECUTOR_MODE),
  jobId: z.uuid(),
  runId: researchPackageSchema.shape.id,
  requestId,
  inputFingerprint: fingerprint,
  configFingerprint: fingerprint,
  policyId: z.literal(KIMI_RESEARCH_EXECUTION_POLICY.profileId),
  role: z.string().min(2).max(640),
  locale: z.enum(["en-US", "zh-CN"]),
  createdAt: time.max(
    Number.MAX_SAFE_INTEGER - BRIDGE_QUEUE_TTL_MS - KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
  ),
  queueExpiresAt: time,
}).strict().refine(
  (value) => value.queueExpiresAt === value.createdAt + BRIDGE_QUEUE_TTL_MS,
);

export type BridgeJob = Readonly<z.infer<typeof bridgeJobSchema>>;

function newBridgeJobError(code: "invalid-message" | "unavailable"): BridgeJobError {
  return new BridgeJobError(code);
}

export function parseBridgeJob(input: unknown): BridgeJob {
  try {
    const serialized = canonicalJson(input);
    const bytes = new TextEncoder().encode(serialized);
    if (bytes.byteLength > BRIDGE_BODY_LIMITS.request) throw new Error();
    const parsed = bridgeJobSchema.parse(decodeBridgeJson(bytes));
    const request = parseProviderRequest({ role: parsed.role, locale: parsed.locale });
    return Object.freeze({ ...parsed, ...request });
  } catch {
    throw newBridgeJobError("invalid-message");
  }
}

export function encodeBridgeJob(input: unknown): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(canonicalJson(parseBridgeJob(input)));
  if (bytes.byteLength > BRIDGE_BODY_LIMITS.request) throw newBridgeJobError("invalid-message");
  return bytes;
}

export function decodeBridgeJob(bytes: Uint8Array): BridgeJob {
  try {
    const actualBytes = bridgeByteLength(bytes);
    if (actualBytes === 0 || actualBytes > BRIDGE_BODY_LIMITS.request) {
      throw new Error();
    }
    return parseBridgeJob(decodeBridgeJson(bytes));
  } catch {
    throw newBridgeJobError("invalid-message");
  }
}

export async function hashBridgeJob(input: unknown): Promise<string> {
  const bytes = encodeBridgeJob(input);
  try {
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
    return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
  } catch {
    throw newBridgeJobError("unavailable");
  }
}
