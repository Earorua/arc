import { z } from "zod";
import { canonicalJson } from "../../../lib/planning/fingerprint";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../execution-policy";
import { parseBridgeBeginGrant, type BridgeBeginGrant } from "./begin";
import { BRIDGE_BODY_LIMITS, bridgeByteLength, decodeBridgeJson } from "./body";
import { hashBridgeJob, parseBridgeJob, type BridgeJob } from "./job";
import {
  hashBridgeProviderReceipt,
  matchBridgeProviderReceipt,
  parseBridgeProviderReceipt,
  parseBridgeReceiptMetadata,
  type BridgeProviderReceipt,
  type BridgeReceiptMetadata,
} from "./receipt";

export class BridgeContractError extends Error {
  constructor(readonly code: "invalid-message" | "conflict" | "unavailable") {
    super(`Research bridge contract failure: ${code}`);
    this.name = "BridgeContractError";
  }
}

export type BridgeIdentity = Readonly<{ jobId: string; requestHash: string }>;
export type AcceptedProof = Readonly<BridgeIdentity & { workflowId: string; workflowAcceptedAt: number }>;
export type UnsentProof = Readonly<BridgeIdentity & { state: "closed"; closedAt: number; grant: BridgeBeginGrant | null }>;
export type ExecutorStatus = Readonly<BridgeIdentity & {
  accepted: AcceptedProof | null;
  dispatchState: "unclaimed" | "claimed" | "closed";
  unsent: UnsentProof | null;
  metadata: BridgeReceiptMetadata | null;
  bodyState: "available" | "missing" | "removed" | null;
}>;
export type ReceiptNotice = Readonly<BridgeIdentity & { receiptHash: string }>;
export type ImportAcknowledgement = Readonly<ReceiptNotice & { accounting: "held" | "settled" | "released" }>;
export type BridgeErrorBody = Readonly<{ code: "not-found" | "closed" | "conflict" | "unauthorized" | "invalid-message" | "temporary" }>;
export type ScanCursor = Readonly<{ createdAt: number; jobId: string }> | null;
export type JobPage = Readonly<{ jobs: readonly BridgeJob[]; next: ScanCursor }>;
export type MaintenanceReply = Readonly<{ visited: number; failed: number }>;

const time = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const hash = z.string().length(64).regex(/^[0-9a-f]{64}$/u);
const identityShape = { jobId: z.uuid(), requestHash: hash };
const acceptedSchema = z.object({
  ...identityShape,
  workflowId: z.uuid(),
  workflowAcceptedAt: time,
}).strict().refine((value) => value.workflowId === value.jobId);
const unsentSchema = z.object({
  ...identityShape,
  state: z.literal("closed"),
  closedAt: time,
  grant: z.unknown().nullable(),
}).strict();
const statusSchema = z.object({
  ...identityShape,
  accepted: z.unknown().nullable(),
  dispatchState: z.enum(["unclaimed", "claimed", "closed"]),
  unsent: z.unknown().nullable(),
  metadata: z.unknown().nullable(),
  bodyState: z.enum(["available", "missing", "removed"]).nullable(),
}).strict().refine((value) => (
  (value.dispatchState === "closed") === (value.unsent !== null)
  && (value.metadata === null) === (value.bodyState === null)
  && (value.metadata === null || value.dispatchState === "claimed")
));
const noticeSchema = z.object({ ...identityShape, receiptHash: hash }).strict();
const acknowledgementSchema = noticeSchema.extend({
  accounting: z.enum(["held", "settled", "released"]),
}).strict();
const errorSchema = z.object({
  code: z.enum(["not-found", "closed", "conflict", "unauthorized", "invalid-message", "temporary"]),
}).strict();
const cursorSchema = z.object({ createdAt: time, jobId: z.uuid() }).strict();
const pageSchema = z.object({ jobs: z.array(z.unknown()).max(10), next: cursorSchema.nullable() }).strict();
const maintenanceSchema = z.object({ visited: z.number().int().min(0).max(10), failed: z.number().int().min(0).max(10) }).strict();

function invalidMessage(): never { throw new BridgeContractError("invalid-message"); }
function conflict(): never { throw new BridgeContractError("conflict"); }

function ownedUnknown(input: unknown, limit: number): unknown {
  try {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > BRIDGE_BODY_LIMITS.result) throw new Error();
    const bytes = new TextEncoder().encode(canonicalJson(input));
    if (bridgeByteLength(bytes) === 0 || bridgeByteLength(bytes) > limit) throw new Error();
    return decodeBridgeJson(bytes);
  } catch {
    return invalidMessage();
  }
}

function parsed<T>(schema: z.ZodType<T>, input: unknown, limit: number = BRIDGE_BODY_LIMITS.status): T {
  try { return schema.parse(ownedUnknown(input, limit)); }
  catch { return invalidMessage(); }
}

export function encodeBridgeDto(value: unknown, limit: number): Uint8Array<ArrayBuffer> {
  const owned = ownedUnknown(value, limit);
  const bytes = new TextEncoder().encode(canonicalJson(owned));
  if (bridgeByteLength(bytes) > limit) return invalidMessage();
  return new Uint8Array(bytes);
}

export function parseAcceptedProof(input: unknown): AcceptedProof {
  return Object.freeze({ ...parsed(acceptedSchema, input) });
}

export function parseUnsentProof(input: unknown): UnsentProof {
  const value = parsed(unsentSchema, input);
  try {
    const grant = value.grant === null ? null : parseBridgeBeginGrant(value.grant);
    return Object.freeze({ ...value, grant });
  } catch { return invalidMessage(); }
}

export function parseExecutorStatus(input: unknown): ExecutorStatus {
  const value = parsed(statusSchema, input);
  try {
    const accepted = value.accepted === null ? null : parseAcceptedProof(value.accepted);
    const unsent = value.unsent === null ? null : parseUnsentProof(value.unsent);
    const metadata = value.metadata === null ? null : parseBridgeReceiptMetadata(value.metadata);
    const matchesOuter = (identity: BridgeIdentity) => (
      identity.jobId === value.jobId && identity.requestHash === value.requestHash
    );
    if (
      (accepted !== null && !matchesOuter(accepted))
      || (unsent !== null && !matchesOuter(unsent))
      || (unsent?.grant && !matchesOuter(unsent.grant))
      || (metadata && !matchesOuter(metadata.grant))
    ) throw new Error();
    return Object.freeze({ ...value, accepted, unsent, metadata });
  } catch { return invalidMessage(); }
}

export function parseReceiptNotice(input: unknown): ReceiptNotice {
  return Object.freeze({ ...parsed(noticeSchema, input) });
}

export function parseImportAcknowledgement(input: unknown): ImportAcknowledgement {
  return Object.freeze({ ...parsed(acknowledgementSchema, input) });
}

export function parseBridgeErrorBody(input: unknown): BridgeErrorBody {
  return Object.freeze({ ...parsed(errorSchema, input) });
}

export function parseJobPage(input: unknown): JobPage {
  const value = parsed(pageSchema, input, BRIDGE_BODY_LIMITS.outbox);
  try {
    const jobs = Object.freeze(value.jobs.map((job) => parseBridgeJob(job)));
    const next = value.next === null ? null : Object.freeze({ ...value.next });
    const result = Object.freeze({ jobs, next });
    encodeBridgeDto(result, BRIDGE_BODY_LIMITS.outbox);
    return result;
  } catch { return invalidMessage(); }
}

export function parseMaintenanceReply(input: unknown): MaintenanceReply {
  return Object.freeze({ ...parsed(maintenanceSchema, input) });
}

function snapshotJob(input: unknown): BridgeJob {
  try { return parseBridgeJob(input); }
  catch { return invalidMessage(); }
}

async function expectedRequestHash(job: BridgeJob): Promise<string> {
  try { return await hashBridgeJob(job); }
  catch { throw new BridgeContractError("unavailable"); }
}

function exact(left: unknown, right: unknown): boolean {
  try { return canonicalJson(left) === canonicalJson(right); }
  catch { return false; }
}

function assertIdentity(value: BridgeIdentity, job: BridgeJob, requestHash: string): void {
  if (value.jobId !== job.jobId || value.requestHash !== requestHash) conflict();
}

function assertGrant(grant: BridgeBeginGrant, job: BridgeJob, requestHash: string): void {
  if (
    grant.jobId !== job.jobId
    || grant.requestHash !== requestHash
    || grant.beganAt < job.createdAt
    || grant.beganAt >= job.queueExpiresAt
    || grant.executionExpiresAt !== grant.beganAt + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs
  ) conflict();
}

export async function matchAcceptedProof(input: unknown, expectedJob: BridgeJob): Promise<AcceptedProof> {
  const value = parseAcceptedProof(input);
  const job = snapshotJob(expectedJob);
  const requestHash = await expectedRequestHash(job);
  assertIdentity(value, job, requestHash);
  if (value.workflowId !== job.jobId) conflict();
  return value;
}

export async function matchUnsentProof(input: unknown, expectedJob: BridgeJob): Promise<UnsentProof> {
  const value = parseUnsentProof(input);
  const job = snapshotJob(expectedJob);
  const requestHash = await expectedRequestHash(job);
  assertIdentity(value, job, requestHash);
  if (value.grant !== null) assertGrant(value.grant, job, requestHash);
  return value;
}

export async function matchExecutorStatus(input: unknown, expectedJob: BridgeJob): Promise<ExecutorStatus> {
  const value = parseExecutorStatus(input);
  const job = snapshotJob(expectedJob);
  const requestHash = await expectedRequestHash(job);
  assertIdentity(value, job, requestHash);
  if (value.accepted) {
    assertIdentity(value.accepted, job, requestHash);
    if (value.accepted.workflowId !== job.jobId) conflict();
  }
  if (value.unsent) {
    assertIdentity(value.unsent, job, requestHash);
    if (value.unsent.grant) assertGrant(value.unsent.grant, job, requestHash);
  }
  if (value.metadata) assertGrant(value.metadata.grant, job, requestHash);
  return value;
}

export async function matchReceiptNotice(input: unknown, expectedJob: BridgeJob): Promise<ReceiptNotice> {
  const value = parseReceiptNotice(input);
  const job = snapshotJob(expectedJob);
  const requestHash = await expectedRequestHash(job);
  assertIdentity(value, job, requestHash);
  return value;
}

export async function matchImportAcknowledgement(
  input: unknown,
  expectedJob: BridgeJob,
  expectedNotice: ReceiptNotice,
): Promise<ImportAcknowledgement> {
  const value = parseImportAcknowledgement(input);
  const job = snapshotJob(expectedJob);
  const notice = parseReceiptNotice(expectedNotice);
  const requestHash = await expectedRequestHash(job);
  assertIdentity(value, job, requestHash);
  assertIdentity(notice, job, requestHash);
  if (value.receiptHash !== notice.receiptHash) conflict();
  return value;
}

export async function matchBridgeMetadata(input: unknown, expectedJob: BridgeJob): Promise<BridgeReceiptMetadata> {
  let value: BridgeReceiptMetadata;
  try { value = parseBridgeReceiptMetadata(input); }
  catch { return invalidMessage(); }
  const job = snapshotJob(expectedJob);
  const requestHash = await expectedRequestHash(job);
  assertGrant(value.grant, job, requestHash);
  return value;
}

export async function matchResultReceipt(
  input: unknown,
  expectedJob: BridgeJob,
  expectedNotice: ReceiptNotice,
  expectedGrant: BridgeBeginGrant,
): Promise<BridgeProviderReceipt> {
  let receipt: BridgeProviderReceipt;
  let grant: BridgeBeginGrant;
  try {
    receipt = parseBridgeProviderReceipt(input);
    grant = parseBridgeBeginGrant(expectedGrant);
  } catch { return invalidMessage(); }
  const job = snapshotJob(expectedJob);
  const notice = parseReceiptNotice(expectedNotice);
  let matched: BridgeProviderReceipt;
  try { matched = matchBridgeProviderReceipt(receipt, grant); }
  catch { return conflict(); }
  const requestHashPromise = expectedRequestHash(job);
  const receiptHashPromise = hashBridgeProviderReceipt(receipt).catch(() => { throw new BridgeContractError("unavailable"); });
  const [requestHash, receiptHash] = await Promise.all([requestHashPromise, receiptHashPromise]);
  assertIdentity(notice, job, requestHash);
  assertGrant(grant, job, requestHash);
  if (!exact(matched.grant, grant) || receiptHash !== notice.receiptHash) conflict();
  return matched;
}
