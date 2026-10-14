import { z } from "zod";
import { canonicalJson } from "../../app/lib/planning/fingerprint";
import { parseBridgeBeginGrant } from "../../app/server/research/executor/begin";
import { BRIDGE_AUTH_PROTOCOL } from "../../app/server/research/executor/auth";
import { SCENARIOS } from "./scenarios";

export const SMOKE_REPLAY_STEPS = Object.freeze([
  "submit", "status", "owner-a-recover", "owner-a-get", "owner-b-recover", "owner-b-get",
] as const);
export type SmokeReplayStep = typeof SMOKE_REPLAY_STEPS[number];
const scenarioId = z.enum(["long", "after-r2", "after-d1"]);
const hash = z.string().regex(/^[0-9a-f]{64}$/u);
const time = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const smokeReplayRequestSchema = z.object({ scenarioId, step: z.enum(SMOKE_REPLAY_STEPS) }).strict();
export type SmokeReplayRequest = Readonly<z.infer<typeof smokeReplayRequestSchema>>;

function validGrant(value: { jobId: string; requestHash: string; beganAt: number; executionExpiresAt: number }): boolean {
  try { parseBridgeBeginGrant({ protocol: BRIDGE_AUTH_PROTOCOL, jobId: value.jobId,
    requestHash: value.requestHash, beganAt: value.beganAt, executionExpiresAt: value.executionExpiresAt }); return true; }
  catch { return false; }
}
// acceptedAt is the first durable Workflow acknowledgement, which may follow begin.
const approvalSchema = z.object({ scenarioId, jobId: z.uuid(), requestHash: hash, receiptHash: hash,
  receiptMetadataSha256: hash, runHash: hash, packageHash: hash,
  acceptedAt: time, beganAt: time, executionExpiresAt: time,
}).strict().refine(value => SCENARIOS.some(s => s.id === value.scenarioId && s.jobId === value.jobId)
  && value.beganAt < value.executionExpiresAt && validGrant(value));
const rosterSchema = z.object({ schemaVersion: z.literal("arc-smoke-replay-approval-v1"),
  inventorySha256: hash, nativeEvidenceSha256: hash, scenarios: z.array(approvalSchema).min(1).max(3),
}).strict().refine(value => new Set(value.scenarios.map(s => s.scenarioId)).size === value.scenarios.length);
export type SmokeReplayApproval = Readonly<z.infer<typeof approvalSchema>>;
export type SmokeReplayRoster = Readonly<Omit<z.infer<typeof rosterSchema>, "scenarios"> & {
  scenarios: readonly SmokeReplayApproval[];
}>;

const common = { schemaVersion: z.literal("arc-smoke-replay-v1"), scenarioId };
const identity = z.object({ jobId: z.uuid(), requestHash: hash, runHash: hash, packageHash: hash }).strict();
const bridgeReply = z.object({ ...common, step: z.enum(["submit", "status"]), completed: z.literal(true), identity,
  original: z.object({ acceptedAt: time, beganAt: time, executionExpiresAt: time, queueExpiresAt: time }).strict(),
  receipt: z.object({ receiptHash: hash, metadataSha256: hash, bodyState: z.enum(["available", "removed"]) }).strict(),
  checks: z.object({ approvalMatched: z.literal(true), settled: z.literal(true), acceptedProofMatched: z.literal(true),
    grantMatched: z.literal(true), receiptMatched: z.literal(true) }).strict(),
}).strict();
const ownerAReply = z.object({ ...common, step: z.enum(["owner-a-recover", "owner-a-get"]), completed: z.literal(true), identity,
  checks: z.object({ approvalMatched: z.literal(true), settled: z.literal(true), runMatched: z.literal(true),
    packageMatched: z.literal(true), ready: z.literal(true), backgroundAccepted: z.literal(true) }).strict(),
}).strict();
const ownerBReply = z.object({ ...common, step: z.enum(["owner-b-recover", "owner-b-get"]),
  completed: z.boolean(), isNull: z.boolean() }).strict();
export const smokeReplayReplySchema = z.discriminatedUnion("step", [bridgeReply, ownerAReply, ownerBReply]).refine(value => {
  if ("isNull" in value) return value.completed === value.isNull;
  if (!SCENARIOS.some(s => s.id === value.scenarioId && s.jobId === value.identity.jobId)) return false;
  return !("original" in value) || (value.original.beganAt < value.original.queueExpiresAt
    && validGrant({ ...value.identity, ...value.original }));
});
export type SmokeReplayReply = z.infer<typeof smokeReplayReplySchema>;

function unavailable(): never { throw new Error("Smoke unavailable"); }
function boundedJson(json: unknown): unknown {
  if (typeof json !== "string" || new TextEncoder().encode(json).byteLength > 4096) unavailable();
  return JSON.parse(json) as unknown;
}
function ownedValue(input: unknown): unknown {
  return boundedJson(canonicalJson(input));
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function parseSmokeReplayRequest(input: unknown): SmokeReplayRequest {
  try { return freeze(smokeReplayRequestSchema.parse(ownedValue(input))); } catch { return unavailable(); }
}
export function parseSmokeReplayRoster(json: unknown, inventorySha256: unknown): SmokeReplayRoster {
  try {
    const expected = hash.parse(inventorySha256);
    const value = rosterSchema.parse(boundedJson(json));
    if (value.inventorySha256 !== expected) unavailable();
    return freeze(value);
  } catch { return unavailable(); }
}
export function parseSmokeReplayReply(input: unknown): SmokeReplayReply {
  try { return freeze(smokeReplayReplySchema.parse(ownedValue(input))); } catch { return unavailable(); }
}
/** Hash raw UTF-8 identities; metadata callers must first use the production canonical JSON. */
export async function smokeReplayHash(input: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}
