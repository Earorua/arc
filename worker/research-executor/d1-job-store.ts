import { canonicalJson } from "../../app/lib/planning/fingerprint";
import { z } from "zod";
import {
  parseBridgeBeginGrant,
  type BridgeBeginGrant,
} from "../../app/server/research/executor/begin";
import {
  hashBridgeJob,
  parseBridgeJob,
  type BridgeJob,
} from "../../app/server/research/executor/job";

export type BridgeJobStoreErrorCode =
  | "invalid-message"
  | "conflict"
  | "not-found"
  | "unavailable";

export class BridgeJobStoreError extends Error {
  constructor(readonly code: BridgeJobStoreErrorCode) {
    super(`Research bridge job store failure: ${code}`);
    this.name = "BridgeJobStoreError";
  }
}

export type BridgeDispatchState = "unclaimed" | "claimed" | "closed";

export type BridgeStoredJob = Readonly<{
  job: BridgeJob;
  requestHash: string;
  acceptedAt: number;
  workflowAcceptedAt: number | null;
  grant: BridgeBeginGrant | null;
  dispatchState: BridgeDispatchState;
  dispatchAt: number | null;
}>;

type PreparedJob = Readonly<{ job: BridgeJob; json: string }>;
type JobIdentity = PreparedJob & Readonly<{ hash: string }>;
type PreparedGrant = Readonly<{ grant: BridgeBeginGrant; json: string }>;
type JobRow = Readonly<{
  job_id: string;
  request_hash: string;
  job_json: string;
  accepted_at: number;
  workflow_accepted_at: number | null;
  grant_json: string | null;
  dispatch_state: BridgeDispatchState;
  dispatch_at: number | null;
}>;

const STORED_JSON_MAX_BYTES = 4096;
const HASH = /^[0-9a-f]{64}$/u;
const UUID_SCHEMA = z.uuid();
const ROW_COLUMNS = [
  "accepted_at", "dispatch_at", "dispatch_state", "grant_json",
  "job_id", "job_json", "request_hash", "workflow_accepted_at",
] as const;
const SELECT_JOB = `SELECT job_id,request_hash,job_json,accepted_at,
  workflow_accepted_at,grant_json,dispatch_state,dispatch_at
  FROM research_executor_jobs WHERE job_id = ?1`;

function storeError(code: BridgeJobStoreErrorCode): BridgeJobStoreError {
  return new BridgeJobStoreError(code);
}

function invalidMessage(): never {
  throw storeError("invalid-message");
}

function unavailable(): never {
  throw storeError("unavailable");
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isSafeTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validTime(value: unknown): number {
  if (!isSafeTime(value)) return invalidMessage();
  return value;
}

function validUuid(value: unknown): string {
  const parsed = UUID_SCHEMA.safeParse(value);
  if (!parsed.success) return invalidMessage();
  return parsed.data;
}

function prepareJob(input: unknown): PreparedJob {
  try {
    const job = parseBridgeJob(input);
    const json = canonicalJson(job);
    const bytes = utf8Length(json);
    if (bytes < 1 || bytes > STORED_JSON_MAX_BYTES) return invalidMessage();
    return Object.freeze({ job, json });
  } catch {
    return invalidMessage();
  }
}

function prepareGrant(input: unknown): PreparedGrant {
  try {
    const grant = parseBridgeBeginGrant(input);
    const json = canonicalJson(grant);
    const bytes = utf8Length(json);
    if (bytes < 1 || bytes > STORED_JSON_MAX_BYTES) return invalidMessage();
    return Object.freeze({ grant, json });
  } catch {
    return invalidMessage();
  }
}

async function identifyJob(prepared: PreparedJob): Promise<JobIdentity> {
  try {
    const hash = await hashBridgeJob(prepared.job);
    if (!HASH.test(hash)) return unavailable();
    return Object.freeze({ ...prepared, hash });
  } catch {
    return unavailable();
  }
}

function ownDataRecord(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== "object") return unavailable();
  let prototype: object | null;
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try {
    prototype = Object.getPrototypeOf(input);
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch {
    return unavailable();
  }
  if (prototype !== Object.prototype && prototype !== null) return unavailable();
  if (Object.getOwnPropertySymbols(descriptors).length !== 0) return unavailable();
  const names = Object.getOwnPropertyNames(descriptors).sort();
  if (names.length !== ROW_COLUMNS.length
    || names.some((name, index) => name !== ROW_COLUMNS[index])) return unavailable();
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const name of names) {
    const descriptor = descriptors[name];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return unavailable();
    output[name] = descriptor.value;
  }
  return output;
}

function dataValue(input: unknown, key: string): unknown {
  if (input === null || typeof input !== "object") return unavailable();
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(input, key);
  } catch {
    return unavailable();
  }
  if (!descriptor || !("value" in descriptor)) return unavailable();
  return descriptor.value;
}

function parseRowShape(input: unknown): JobRow {
  const row = ownDataRecord(input);
  const jobId = row.job_id;
  const requestHash = row.request_hash;
  const jobJson = row.job_json;
  const acceptedAt = row.accepted_at;
  const workflowAcceptedAt = row.workflow_accepted_at;
  const grantJson = row.grant_json;
  const dispatchState = row.dispatch_state;
  const dispatchAt = row.dispatch_at;
  if (typeof jobId !== "string" || !UUID_SCHEMA.safeParse(jobId).success
    || typeof requestHash !== "string" || !HASH.test(requestHash)
    || typeof jobJson !== "string" || utf8Length(jobJson) < 1
    || utf8Length(jobJson) > STORED_JSON_MAX_BYTES
    || !isSafeTime(acceptedAt)
    || (workflowAcceptedAt !== null && !isSafeTime(workflowAcceptedAt))
    || (grantJson !== null && (typeof grantJson !== "string"
      || utf8Length(grantJson) < 1 || utf8Length(grantJson) > STORED_JSON_MAX_BYTES))
    || (dispatchState !== "unclaimed" && dispatchState !== "claimed" && dispatchState !== "closed")
    || (dispatchAt !== null && !isSafeTime(dispatchAt))
    || (dispatchState === "unclaimed") !== (dispatchAt === null)
    || (dispatchState === "claimed" && grantJson === null)) return unavailable();
  return Object.freeze({
    job_id: jobId,
    request_hash: requestHash,
    job_json: jobJson,
    accepted_at: acceptedAt,
    workflow_accepted_at: workflowAcceptedAt,
    grant_json: grantJson,
    dispatch_state: dispatchState,
    dispatch_at: dispatchAt,
  });
}

function parseStoredJobJson(row: JobRow): BridgeJob {
  try {
    const decoded: unknown = JSON.parse(row.job_json);
    const job = parseBridgeJob(decoded);
    if (canonicalJson(job) !== row.job_json || job.jobId !== row.job_id) return unavailable();
    return job;
  } catch {
    return unavailable();
  }
}

function parseStoredGrantJson(row: JobRow, job: BridgeJob): BridgeBeginGrant | null {
  if (row.grant_json === null) return null;
  try {
    const decoded: unknown = JSON.parse(row.grant_json);
    const grant = parseBridgeBeginGrant(decoded);
    if (canonicalJson(grant) !== row.grant_json
      || grant.jobId !== job.jobId
      || grant.requestHash !== row.request_hash
      || grant.beganAt < job.createdAt
      || grant.beganAt >= job.queueExpiresAt) return unavailable();
    return grant;
  } catch {
    return unavailable();
  }
}

async function decodeStored(input: unknown): Promise<BridgeStoredJob> {
  const row = parseRowShape(input);
  const job = parseStoredJobJson(row);
  let actualHash: string;
  try {
    actualHash = await hashBridgeJob(job);
  } catch {
    return unavailable();
  }
  if (actualHash !== row.request_hash) return unavailable();
  const grant = parseStoredGrantJson(row, job);
  return Object.freeze({
    job,
    requestHash: row.request_hash,
    acceptedAt: row.accepted_at,
    workflowAcceptedAt: row.workflow_accepted_at,
    grant,
    dispatchState: row.dispatch_state,
    dispatchAt: row.dispatch_at,
  });
}

function assertIdentity(stored: BridgeStoredJob, expected: JobIdentity): void {
  if (stored.requestHash !== expected.hash || canonicalJson(stored.job) !== expected.json) {
    throw storeError("conflict");
  }
}

function assertGrantBelongs(identity: JobIdentity, grant: BridgeBeginGrant): void {
  if (grant.jobId !== identity.job.jobId || grant.requestHash !== identity.hash
    || grant.beganAt < identity.job.createdAt || grant.beganAt >= identity.job.queueExpiresAt) {
    throw storeError("conflict");
  }
}

export class D1BridgeJobStore {
  constructor(private readonly db: Pick<D1Database, "prepare">) {}

  private async select(jobId: string): Promise<BridgeStoredJob | null> {
    let row: unknown;
    try {
      row = await this.db.prepare(SELECT_JOB).bind(jobId).first();
    } catch {
      return unavailable();
    }
    if (row === null) return null;
    return decodeStored(row);
  }

  private async mutate(sql: string, ...bindings: unknown[]): Promise<0 | 1> {
    let result: unknown;
    try {
      result = await this.db.prepare(sql).bind(...bindings).run();
    } catch {
      return unavailable();
    }
    if (dataValue(result, "success") !== true) return unavailable();
    const changes = dataValue(dataValue(result, "meta"), "changes");
    if (changes !== 0 && changes !== 1) return unavailable();
    return changes;
  }

  private async required(jobId: string): Promise<BridgeStoredJob> {
    const stored = await this.select(jobId);
    if (stored === null) throw storeError("not-found");
    return stored;
  }

  private async readMatched(identity: JobIdentity): Promise<BridgeStoredJob> {
    const stored = await this.required(identity.job.jobId);
    assertIdentity(stored, identity);
    return stored;
  }

  async accept(input: unknown, acceptedAt: number): Promise<BridgeStoredJob> {
    const prepared = prepareJob(input);
    const accepted = validTime(acceptedAt);
    const identity = await identifyJob(prepared);
    await this.mutate(`INSERT INTO research_executor_jobs
      (job_id,request_hash,job_json,accepted_at)
      VALUES (?1,?2,?3,?4)
      ON CONFLICT (job_id) DO NOTHING`,
    identity.job.jobId, identity.hash, identity.json, accepted);
    const stored = await this.select(identity.job.jobId);
    if (stored === null) return unavailable();
    assertIdentity(stored, identity);
    return stored;
  }

  async get(jobId: string): Promise<BridgeStoredJob | null> {
    const id = validUuid(jobId);
    return this.select(id);
  }

  async recordWorkflowAccepted(input: unknown, workflowId: string, observedAt: number): Promise<BridgeStoredJob> {
    const prepared = prepareJob(input);
    const workflow = validUuid(workflowId);
    const observed = validTime(observedAt);
    if (workflow !== prepared.job.jobId) throw storeError("conflict");
    const identity = await identifyJob(prepared);
    await this.readMatched(identity);
    await this.mutate(`UPDATE research_executor_jobs
      SET workflow_accepted_at = ?1
      WHERE job_id = ?2 AND request_hash = ?3 AND job_json = ?4
        AND workflow_accepted_at IS NULL`,
    observed, identity.job.jobId, identity.hash, identity.json);
    const stored = await this.select(identity.job.jobId);
    if (stored === null) return unavailable();
    assertIdentity(stored, identity);
    return stored;
  }

  async recordBegin(input: unknown, grant: BridgeBeginGrant): Promise<BridgeStoredJob> {
    const prepared = prepareJob(input);
    const preparedGrant = prepareGrant(grant);
    const identity = await identifyJob(prepared);
    assertGrantBelongs(identity, preparedGrant.grant);
    const before = await this.readMatched(identity);
    if (before.grant !== null) {
      if (canonicalJson(before.grant) !== preparedGrant.json) throw storeError("conflict");
      return before;
    }
    if (before.dispatchState !== "unclaimed") throw storeError("conflict");
    await this.mutate(`UPDATE research_executor_jobs
      SET grant_json = ?1
      WHERE job_id = ?2 AND request_hash = ?3 AND job_json = ?4
        AND grant_json IS NULL AND dispatch_state = 'unclaimed'`,
    preparedGrant.json, identity.job.jobId, identity.hash, identity.json);
    const stored = await this.select(identity.job.jobId);
    if (stored === null) return unavailable();
    assertIdentity(stored, identity);
    if (stored.grant === null || canonicalJson(stored.grant) !== preparedGrant.json) throw storeError("conflict");
    return stored;
  }

  async claimDispatch(input: unknown, grant: BridgeBeginGrant, claimedAt: number): Promise<boolean> {
    const prepared = prepareJob(input);
    const preparedGrant = prepareGrant(grant);
    const claimed = validTime(claimedAt);
    const identity = await identifyJob(prepared);
    assertGrantBelongs(identity, preparedGrant.grant);
    const stored = await this.readMatched(identity);
    if (stored.grant === null || canonicalJson(stored.grant) !== preparedGrant.json) throw storeError("conflict");
    const changes = await this.mutate(`UPDATE research_executor_jobs
      SET dispatch_state = 'claimed', dispatch_at = ?1
      WHERE job_id = ?2 AND request_hash = ?3 AND job_json = ?4
        AND grant_json = ?5 AND dispatch_state = 'unclaimed'`,
    claimed, identity.job.jobId, identity.hash, identity.json, preparedGrant.json);
    return changes === 1;
  }

  async closeUnclaimed(input: unknown, closedAt: number): Promise<BridgeStoredJob> {
    const prepared = prepareJob(input);
    const closed = validTime(closedAt);
    const identity = await identifyJob(prepared);
    await this.readMatched(identity);
    await this.mutate(`UPDATE research_executor_jobs
      SET dispatch_state = 'closed', dispatch_at = ?1
      WHERE job_id = ?2 AND request_hash = ?3 AND job_json = ?4
        AND dispatch_state = 'unclaimed'`,
    closed, identity.job.jobId, identity.hash, identity.json);
    const stored = await this.select(identity.job.jobId);
    if (stored === null) return unavailable();
    assertIdentity(stored, identity);
    return stored;
  }
}
