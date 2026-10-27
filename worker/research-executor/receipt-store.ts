import { z } from "zod";
import { canonicalJson } from "../../app/lib/planning/fingerprint";
import {
  type BridgeBeginGrant,
} from "../../app/server/research/executor/begin";
import {
  BRIDGE_BODY_LIMITS,
  decodeBridgeJson,
  readBridgeBody,
} from "../../app/server/research/executor/body";
import {
  BRIDGE_RECEIPT_RETENTION_MS,
  decodeBridgeProviderReceipt,
  encodeBridgeProviderReceipt,
  parseBridgeReceiptMetadata,
  summarizeBridgeProviderReceipt,
  type BridgeProviderReceipt,
  type BridgeReceiptMetadata,
} from "../../app/server/research/executor/receipt";
import {
  D1BridgeJobStore,
  type BridgeStoredJob,
} from "./d1-job-store";

export type BridgeReceiptStoreErrorCode =
  | "invalid-message"
  | "conflict"
  | "not-found"
  | "unavailable";

export class BridgeReceiptStoreError extends Error {
  constructor(readonly code: BridgeReceiptStoreErrorCode) {
    super(`Research bridge receipt store failure: ${code}`);
    this.name = "BridgeReceiptStoreError";
  }
}

export type StoredExecutorReceipt = Readonly<{
  metadata: BridgeReceiptMetadata;
  fixedAt: number;
  siteAcknowledgedAt: number | null;
  cleanupRequestedAt: number | null;
  bodyRemovedAt: number | null;
  bodyState: "available" | "missing" | "removed";
  receipt: BridgeProviderReceipt | null;
}>;

type ResultRow = Readonly<{
  job_id: string;
  receipt_hash: string;
  metadata_json: string;
  fixed_at: number;
  site_acknowledged_at: number | null;
  cleanup_requested_at: number | null;
  body_removed_at: number | null;
}>;

type DurableResult = Readonly<{
  metadata: BridgeReceiptMetadata;
  metadataJson: string;
  fixedAt: number;
  siteAcknowledgedAt: number | null;
  cleanupRequestedAt: number | null;
  bodyRemovedAt: number | null;
}>;

type Tombstone = Readonly<{
  format: "arc-research-receipt-tombstone-v1";
  metadata: BridgeReceiptMetadata;
  removedAt: number;
}>;

type StoredBody =
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "receipt"; receipt: BridgeProviderReceipt; etag: string }>
  | Readonly<{ kind: "tombstone"; tombstone: Tombstone; etag: string }>;

const OPERATION_TIMEOUT_MS = 5_000;
const STORED_JSON_MAX_BYTES = 4_096;
const HASH = /^[0-9a-f]{64}$/u;
const UUID_SCHEMA = z.uuid();
const RESULT_COLUMNS = [
  "body_removed_at",
  "cleanup_requested_at",
  "fixed_at",
  "job_id",
  "metadata_json",
  "receipt_hash",
  "site_acknowledged_at",
] as const;
const SELECT_RESULT = `SELECT job_id,receipt_hash,metadata_json,fixed_at,
  site_acknowledged_at,cleanup_requested_at,body_removed_at
  FROM research_executor_results WHERE job_id = ?1`;

function storeError(code: BridgeReceiptStoreErrorCode): BridgeReceiptStoreError {
  return new BridgeReceiptStoreError(code);
}

function invalidMessage(): never {
  throw storeError("invalid-message");
}

function conflict(): never {
  throw storeError("conflict");
}

function notFound(): never {
  throw storeError("not-found");
}

function unavailable(): never {
  throw storeError("unavailable");
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validTime(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return invalidMessage();
  return value as number;
}

function validUuid(value: unknown): string {
  const parsed = UUID_SCHEMA.safeParse(value);
  if (!parsed.success) return invalidMessage();
  return parsed.data;
}

function validHash(value: unknown): string {
  if (typeof value !== "string" || value.length !== 64 || !HASH.test(value)) return invalidMessage();
  return value;
}

function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function ownedRow(input: unknown): ResultRow {
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
  if (names.length !== RESULT_COLUMNS.length
    || names.some((name, index) => name !== RESULT_COLUMNS[index])) return unavailable();
  const values: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const name of names) {
    const descriptor = descriptors[name];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return unavailable();
    values[name] = descriptor.value;
  }
  return values as ResultRow;
}

function resultValue(input: unknown, key: string): unknown {
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

function safeStoredTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function parseResult(input: unknown, job: BridgeStoredJob): DurableResult {
  const row = ownedRow(input);
  if (typeof row.job_id !== "string" || row.job_id !== job.job.jobId
    || typeof row.receipt_hash !== "string" || !HASH.test(row.receipt_hash)
    || typeof row.metadata_json !== "string"
    || utf8Length(row.metadata_json) < 1 || utf8Length(row.metadata_json) > STORED_JSON_MAX_BYTES
    || !safeStoredTime(row.fixed_at)
    || (row.site_acknowledged_at !== null && !safeStoredTime(row.site_acknowledged_at))
    || (row.cleanup_requested_at !== null && !safeStoredTime(row.cleanup_requested_at))
    || (row.body_removed_at !== null && !safeStoredTime(row.body_removed_at))
    || (row.body_removed_at !== null && (
      row.cleanup_requested_at === null || row.body_removed_at !== row.cleanup_requested_at
    ))) return unavailable();
  let metadata: BridgeReceiptMetadata;
  try {
    metadata = parseBridgeReceiptMetadata(JSON.parse(row.metadata_json) as unknown);
  } catch {
    return unavailable();
  }
  if (canonicalJson(metadata) !== row.metadata_json
    || metadata.receiptHash !== row.receipt_hash
    || job.dispatchState !== "claimed" || job.grant === null
    || !same(metadata.grant, job.grant)) return unavailable();
  return Object.freeze({
    metadata,
    metadataJson: row.metadata_json,
    fixedAt: row.fixed_at,
    siteAcknowledgedAt: row.site_acknowledged_at,
    cleanupRequestedAt: row.cleanup_requested_at,
    bodyRemovedAt: row.body_removed_at,
  });
}

function tombstoneFrom(metadata: BridgeReceiptMetadata, removedAt: number): Tombstone {
  const tombstone = Object.freeze({
    format: "arc-research-receipt-tombstone-v1" as const,
    metadata,
    removedAt,
  });
  const json = canonicalJson(tombstone);
  if (utf8Length(json) < 1 || utf8Length(json) > STORED_JSON_MAX_BYTES) return unavailable();
  return tombstone;
}

function parseTombstone(input: unknown, bytes: Uint8Array): Tombstone {
  if (bytes.byteLength < 1 || bytes.byteLength > STORED_JSON_MAX_BYTES
    || input === null || typeof input !== "object" || Array.isArray(input)) return unavailable();
  const record = input as Record<string, unknown>;
  const names = Object.keys(record).sort();
  if (names.length !== 3 || names[0] !== "format" || names[1] !== "metadata" || names[2] !== "removedAt"
    || record.format !== "arc-research-receipt-tombstone-v1"
    || !safeStoredTime(record.removedAt)) return unavailable();
  let metadata: BridgeReceiptMetadata;
  try {
    metadata = parseBridgeReceiptMetadata(record.metadata);
  } catch {
    return unavailable();
  }
  const tombstone = tombstoneFrom(metadata, record.removedAt);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return unavailable();
  }
  if (text !== canonicalJson(tombstone)) return unavailable();
  return tombstone;
}

class Deadline {
  private readonly endsAt = performance.now() + OPERATION_TIMEOUT_MS;

  expired(): boolean {
    return performance.now() >= this.endsAt;
  }

  check(): void {
    if (this.expired()) return unavailable();
  }

  remaining(): number {
    this.check();
    return Math.max(1, Math.ceil(this.endsAt - performance.now()));
  }

  async wait<T>(work: Promise<T>): Promise<T> {
    const remaining = this.remaining();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(storeError("unavailable")), remaining);
        }),
      ]);
      this.check();
      return value;
    } catch (error) {
      if (error instanceof BridgeReceiptStoreError) throw error;
      return unavailable();
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

function boundedDb(db: Pick<D1Database, "prepare">, deadline: Deadline): Pick<D1Database, "prepare"> {
  return {
    prepare(sql: string) {
      let statement: D1PreparedStatement;
      try {
        deadline.check();
        statement = db.prepare(sql);
      } catch {
        return unavailable();
      }
      return {
        bind(...values: unknown[]) {
          let bound: D1PreparedStatement;
          try {
            deadline.check();
            bound = statement.bind(...values);
          } catch {
            return unavailable();
          }
          return {
            first: <T>() => {
              deadline.check();
              return deadline.wait(bound.first<T>());
            },
            run: () => {
              deadline.check();
              return deadline.wait(bound.run());
            },
          } as D1PreparedStatement;
        },
      } as D1PreparedStatement;
    },
  };
}

function keyFor(job: BridgeStoredJob): string {
  return `research-receipts/v1/${job.job.jobId}/${job.requestHash}.json`;
}

function assertClaimed(job: BridgeStoredJob): asserts job is BridgeStoredJob & { grant: BridgeBeginGrant } {
  if (job.dispatchState !== "claimed" || job.grant === null) return conflict();
}

function assertGrant(job: BridgeStoredJob & { grant: BridgeBeginGrant }, grant: BridgeBeginGrant): void {
  if (!same(job.grant, grant)) return conflict();
}

function storedRecord(
  result: DurableResult,
  bodyState: StoredExecutorReceipt["bodyState"],
  receipt: BridgeProviderReceipt | null,
): StoredExecutorReceipt {
  return Object.freeze({
    metadata: result.metadata,
    fixedAt: result.fixedAt,
    siteAcknowledgedAt: result.siteAcknowledgedAt,
    cleanupRequestedAt: result.cleanupRequestedAt,
    bodyRemovedAt: result.bodyRemovedAt,
    bodyState,
    receipt,
  });
}

function prepareReceipt(input: unknown): Readonly<{
  receipt: BridgeProviderReceipt;
  bytes: Uint8Array<ArrayBuffer>;
  metadataPromise: Promise<BridgeReceiptMetadata>;
}> {
  try {
    const receipt = decodeBridgeProviderReceipt(encodeBridgeProviderReceipt(input));
    const bytes = encodeBridgeProviderReceipt(receipt);
    const metadataPromise = summarizeBridgeProviderReceipt(receipt);
    return Object.freeze({ receipt, bytes, metadataPromise });
  } catch {
    return invalidMessage();
  }
}

export class ExecutorReceiptStore {
  constructor(
    private readonly db: Pick<D1Database, "prepare">,
    private readonly bucket: Pick<R2Bucket, "get" | "put">,
  ) {}

  private async job(jobId: string, deadline: Deadline): Promise<BridgeStoredJob | null> {
    try {
      return await deadline.wait(new D1BridgeJobStore(boundedDb(this.db, deadline)).get(jobId));
    } catch (error) {
      if (error instanceof BridgeReceiptStoreError) throw error;
      return unavailable();
    }
  }

  private async selectResult(
    job: BridgeStoredJob,
    deadline: Deadline,
  ): Promise<DurableResult | null> {
    let row: unknown;
    try {
      deadline.check();
      row = await deadline.wait(this.db.prepare(SELECT_RESULT).bind(job.job.jobId).first());
    } catch {
      return unavailable();
    }
    if (row === null) return null;
    return parseResult(row, job);
  }

  private async mutate(deadline: Deadline, sql: string, ...bindings: unknown[]): Promise<0 | 1> {
    let result: unknown;
    try {
      deadline.check();
      const statement = this.db.prepare(sql).bind(...bindings);
      deadline.check();
      result = await deadline.wait(statement.run());
    } catch (error) {
      if (error instanceof BridgeReceiptStoreError) throw error;
      return unavailable();
    }
    if (resultValue(result, "success") !== true) return unavailable();
    const changes = resultValue(resultValue(result, "meta"), "changes");
    if (changes !== 0 && changes !== 1) return unavailable();
    return changes;
  }

  private async readBody(key: string, deadline: Deadline): Promise<StoredBody> {
    let pending: Promise<R2ObjectBody | null>;
    try {
      deadline.check();
      pending = this.bucket.get(key);
    } catch {
      return unavailable();
    }
    void pending.then((object) => {
      if (deadline.expired()) void object?.body.cancel().catch(() => undefined);
    }, () => undefined);
    let object: R2ObjectBody | null;
    try {
      object = await deadline.wait(pending);
    } catch {
      return unavailable();
    }
    if (object === null) return Object.freeze({ kind: "missing" });
    let bytes: Uint8Array;
    try {
      bytes = await readBridgeBody(object, {
        maxBytes: BRIDGE_BODY_LIMITS.result,
        timeoutMs: deadline.remaining(),
      });
      deadline.check();
    } catch {
      return unavailable();
    }
    let decoded: unknown;
    try {
      decoded = decodeBridgeJson(bytes);
    } catch {
      return unavailable();
    }
    if (decoded !== null && typeof decoded === "object"
      && (decoded as Record<string, unknown>).format === "arc-research-receipt-tombstone-v1") {
      return Object.freeze({ kind: "tombstone", tombstone: parseTombstone(decoded, bytes), etag: object.etag });
    }
    let receipt: BridgeProviderReceipt;
    try {
      receipt = decodeBridgeProviderReceipt(bytes);
    } catch {
      return unavailable();
    }
    const expected = encodeBridgeProviderReceipt(receipt);
    if (bytes.byteLength !== expected.byteLength
      || bytes.some((value, index) => value !== expected[index])) return unavailable();
    return Object.freeze({ kind: "receipt", receipt, etag: object.etag });
  }

  private async fixResult(
    job: BridgeStoredJob & { grant: BridgeBeginGrant },
    metadata: BridgeReceiptMetadata,
    fixedAt: number,
    deadline: Deadline,
  ): Promise<DurableResult> {
    const metadataJson = canonicalJson(metadata);
    if (utf8Length(metadataJson) < 1 || utf8Length(metadataJson) > STORED_JSON_MAX_BYTES) return unavailable();
    await this.mutate(deadline, `INSERT INTO research_executor_results
      (job_id,receipt_hash,metadata_json,fixed_at)
      SELECT ?1,?2,?3,?4 FROM research_executor_jobs
      WHERE job_id = ?1 AND request_hash = ?5 AND job_json = ?6
        AND grant_json = ?7 AND dispatch_state = 'claimed'
      ON CONFLICT(job_id) DO NOTHING`,
    job.job.jobId, metadata.receiptHash, metadataJson, fixedAt,
    job.requestHash, canonicalJson(job.job), canonicalJson(job.grant));
    const stored = await this.selectResult(job, deadline);
    if (stored === null) return unavailable();
    if (stored.metadataJson !== metadataJson || stored.metadata.receiptHash !== metadata.receiptHash) {
      return conflict();
    }
    return stored;
  }

  private assertTombstone(result: DurableResult, tombstone: Tombstone): void {
    if (result.cleanupRequestedAt === null
      || tombstone.removedAt !== result.cleanupRequestedAt
      || !same(tombstone.metadata, result.metadata)) return unavailable();
  }

  private async verifiedReceipt(
    body: Extract<StoredBody, { kind: "receipt" }>,
    job: BridgeStoredJob & { grant: BridgeBeginGrant },
    deadline: Deadline,
  ): Promise<BridgeReceiptMetadata> {
    if (!same(job.grant, body.receipt.grant)) return unavailable();
    try {
      return await deadline.wait(summarizeBridgeProviderReceipt(body.receipt));
    } catch {
      return unavailable();
    }
  }

  private async existingRecord(
    job: BridgeStoredJob & { grant: BridgeBeginGrant },
    result: DurableResult,
    deadline: Deadline,
  ): Promise<StoredExecutorReceipt> {
    const body = await this.readBody(keyFor(job), deadline);
    if (body.kind === "missing") return storedRecord(result, "missing", null);
    if (body.kind === "receipt") {
      const metadata = await this.verifiedReceipt(body, job, deadline);
      if (!same(metadata, result.metadata)) return unavailable();
      return storedRecord(result, "available", body.receipt);
    }
    this.assertTombstone(result, body.tombstone);
    let current = result;
    if (current.bodyRemovedAt === null) {
      await this.mutate(deadline, `UPDATE research_executor_results
        SET body_removed_at = cleanup_requested_at
        WHERE job_id = ?1 AND receipt_hash = ?2 AND metadata_json = ?3
          AND cleanup_requested_at = ?4 AND body_removed_at IS NULL
          AND EXISTS (SELECT 1 FROM research_executor_jobs
            WHERE job_id = ?1 AND request_hash = ?5 AND job_json = ?6
              AND grant_json = ?7 AND dispatch_state = 'claimed')`,
      job.job.jobId, current.metadata.receiptHash, current.metadataJson, current.cleanupRequestedAt,
      job.requestHash, canonicalJson(job.job), canonicalJson(job.grant));
      const reread = await this.selectResult(job, deadline);
      if (reread === null) return unavailable();
      current = reread;
    }
    if (current.bodyRemovedAt !== current.cleanupRequestedAt) return unavailable();
    return storedRecord(current, "removed", null);
  }

  private async recoverInternal(
    jobId: string,
    fixedAt: number,
    deadline: Deadline,
  ): Promise<StoredExecutorReceipt | null> {
    const job = await this.job(jobId, deadline);
    if (job === null) return notFound();
    assertClaimed(job);
    let result = await this.selectResult(job, deadline);
    if (result !== null) return this.existingRecord(job, result, deadline);
    const body = await this.readBody(keyFor(job), deadline);
    if (body.kind === "missing") return null;
    if (body.kind === "tombstone") return unavailable();
    const metadata = await this.verifiedReceipt(body, job, deadline);
    result = await this.fixResult(job, metadata, fixedAt, deadline);
    if (result.cleanupRequestedAt !== null) return this.existingRecord(job, result, deadline);
    return storedRecord(result, "available", body.receipt);
  }

  save(input: unknown, fixedAt: number): Promise<StoredExecutorReceipt> {
    const fixed = validTime(fixedAt);
    const deadline = new Deadline();
    const prepared = prepareReceipt(input);
    return this.savePrepared(prepared, fixed, deadline);
  }

  private async savePrepared(
    prepared: ReturnType<typeof prepareReceipt>,
    fixedAt: number,
    deadline: Deadline,
  ): Promise<StoredExecutorReceipt> {
    try {
      const metadata = await deadline.wait(prepared.metadataPromise);
      const job = await this.job(prepared.receipt.grant.jobId, deadline);
      if (job === null) return notFound();
      assertClaimed(job);
      assertGrant(job, prepared.receipt.grant);
      const existing = await this.selectResult(job, deadline);
      if (existing !== null) {
        if (!same(existing.metadata, metadata)) return conflict();
        return await this.existingRecord(job, existing, deadline);
      }
      try {
        deadline.check();
        await deadline.wait(this.bucket.put(keyFor(job), prepared.bytes, {
          onlyIf: { etagDoesNotMatch: "*" },
          httpMetadata: { contentType: "application/json" },
        }));
      } catch {
        return unavailable();
      }
      const body = await this.readBody(keyFor(job), deadline);
      if (body.kind === "missing") return unavailable();
      if (body.kind === "tombstone") {
        const raced = await this.selectResult(job, deadline);
        if (raced === null || !same(raced.metadata, metadata)) return unavailable();
        this.assertTombstone(raced, body.tombstone);
        return this.existingRecord(job, raced, deadline);
      }
      const actualMetadata = await this.verifiedReceipt(body, job, deadline);
      const actualBytes = encodeBridgeProviderReceipt(body.receipt);
      if (!same(actualMetadata, metadata)
        || actualBytes.byteLength !== prepared.bytes.byteLength
        || actualBytes.some((value, index) => value !== prepared.bytes[index])) return conflict();
      const result = await this.fixResult(job, metadata, fixedAt, deadline);
      if (result.cleanupRequestedAt !== null) return await this.existingRecord(job, result, deadline);
      return storedRecord(result, "available", body.receipt);
    } catch (error) {
      if (error instanceof BridgeReceiptStoreError) throw error;
      return unavailable();
    }
  }

  recover(jobId: string, fixedAt: number): Promise<StoredExecutorReceipt | null> {
    const id = validUuid(jobId);
    const fixed = validTime(fixedAt);
    return this.recoverBounded(id, fixed);
  }

  private async recoverBounded(jobId: string, fixedAt: number): Promise<StoredExecutorReceipt | null> {
    const deadline = new Deadline();
    try {
      return await this.recoverInternal(jobId, fixedAt, deadline);
    } catch (error) {
      if (error instanceof BridgeReceiptStoreError) throw error;
      return unavailable();
    }
  }

  acknowledge(jobId: string, receiptHash: string, observedAt: number): Promise<StoredExecutorReceipt> {
    const id = validUuid(jobId);
    const hash = validHash(receiptHash);
    const observed = validTime(observedAt);
    return this.acknowledgeBounded(id, hash, observed);
  }

  private async acknowledgeBounded(
    jobId: string,
    receiptHash: string,
    observedAt: number,
  ): Promise<StoredExecutorReceipt> {
    const deadline = new Deadline();
    try {
      const job = await this.job(jobId, deadline);
      if (job === null) return notFound();
      assertClaimed(job);
      let result = await this.selectResult(job, deadline);
      if (result === null) return notFound();
      if (result.metadata.receiptHash !== receiptHash) return conflict();
      if (result.siteAcknowledgedAt === null) {
        await this.mutate(deadline, `UPDATE research_executor_results
          SET site_acknowledged_at = ?1
          WHERE job_id = ?2 AND receipt_hash = ?3 AND metadata_json = ?4
            AND site_acknowledged_at IS NULL
            AND EXISTS (SELECT 1 FROM research_executor_jobs
              WHERE job_id = ?2 AND request_hash = ?5 AND job_json = ?6
                AND grant_json = ?7 AND dispatch_state = 'claimed')`,
        observedAt, jobId, receiptHash, result.metadataJson,
        job.requestHash, canonicalJson(job.job), canonicalJson(job.grant));
        const reread = await this.selectResult(job, deadline);
        if (reread === null) return unavailable();
        result = reread;
      }
      if (result.siteAcknowledgedAt === null) return unavailable();
      return await this.existingRecord(job, result, deadline);
    } catch (error) {
      if (error instanceof BridgeReceiptStoreError) throw error;
      return unavailable();
    }
  }

  cleanup(jobId: string, now: number): Promise<StoredExecutorReceipt | null> {
    const id = validUuid(jobId);
    const observed = validTime(now);
    return this.cleanupBounded(id, observed);
  }

  private async cleanupBounded(jobId: string, now: number): Promise<StoredExecutorReceipt | null> {
    const deadline = new Deadline();
    try {
      const initial = await this.recoverInternal(jobId, now, deadline);
      if (initial === null) return null;
      const job = await this.job(jobId, deadline);
      if (job === null) return notFound();
      assertClaimed(job);
      let result = await this.selectResult(job, deadline);
      if (result === null) return unavailable();
      if (result.cleanupRequestedAt === null
        && result.siteAcknowledgedAt === null
        && now < result.metadata.producedAt + BRIDGE_RECEIPT_RETENTION_MS) return initial;
      if (result.cleanupRequestedAt === null) {
        await this.mutate(deadline, `UPDATE research_executor_results
          SET cleanup_requested_at = ?1
          WHERE job_id = ?2 AND receipt_hash = ?3 AND metadata_json = ?4
            AND cleanup_requested_at IS NULL
            AND EXISTS (SELECT 1 FROM research_executor_jobs
              WHERE job_id = ?2 AND request_hash = ?5 AND job_json = ?6
                AND grant_json = ?7 AND dispatch_state = 'claimed')`,
        now, jobId, result.metadata.receiptHash, result.metadataJson,
        job.requestHash, canonicalJson(job.job), canonicalJson(job.grant));
        const reread = await this.selectResult(job, deadline);
        if (reread === null || reread.cleanupRequestedAt === null) return unavailable();
        result = reread;
      }
      const removedAt = result.cleanupRequestedAt;
      if (removedAt === null) return unavailable();
      const tombstone = tombstoneFrom(result.metadata, removedAt);
      const tombstoneBytes = new TextEncoder().encode(canonicalJson(tombstone));
      const body = await this.readBody(keyFor(job), deadline);
      if (body.kind === "receipt") {
        const metadata = await this.verifiedReceipt(body, job, deadline);
        if (!same(metadata, result.metadata)) return unavailable();
        try {
          deadline.check();
          await deadline.wait(this.bucket.put(keyFor(job), tombstoneBytes, {
            onlyIf: { etagMatches: body.etag },
            httpMetadata: { contentType: "application/json" },
          }));
        } catch {
          return unavailable();
        }
      } else if (body.kind === "missing") {
        try {
          deadline.check();
          await deadline.wait(this.bucket.put(keyFor(job), tombstoneBytes, {
            onlyIf: { etagDoesNotMatch: "*" },
            httpMetadata: { contentType: "application/json" },
          }));
        } catch {
          return unavailable();
        }
      } else {
        this.assertTombstone(result, body.tombstone);
      }
      const verified = await this.readBody(keyFor(job), deadline);
      if (verified.kind !== "tombstone") return unavailable();
      this.assertTombstone(result, verified.tombstone);
      if (result.bodyRemovedAt === null) {
        await this.mutate(deadline, `UPDATE research_executor_results
          SET body_removed_at = cleanup_requested_at
          WHERE job_id = ?1 AND receipt_hash = ?2 AND metadata_json = ?3
            AND cleanup_requested_at = ?4 AND body_removed_at IS NULL
            AND EXISTS (SELECT 1 FROM research_executor_jobs
              WHERE job_id = ?1 AND request_hash = ?5 AND job_json = ?6
                AND grant_json = ?7 AND dispatch_state = 'claimed')`,
        jobId, result.metadata.receiptHash, result.metadataJson, removedAt,
        job.requestHash, canonicalJson(job.job), canonicalJson(job.grant));
        const reread = await this.selectResult(job, deadline);
        if (reread === null) return unavailable();
        result = reread;
      }
      if (result.bodyRemovedAt !== removedAt) return unavailable();
      return storedRecord(result, "removed", null);
    } catch (error) {
      if (error instanceof BridgeReceiptStoreError) throw error;
      return unavailable();
    }
  }
}
