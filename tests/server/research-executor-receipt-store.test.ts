// @vitest-environment node

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalJson } from "../../app/lib/planning/fingerprint";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../../app/server/research/execution-policy";
import { BRIDGE_AUTH_PROTOCOL } from "../../app/server/research/executor/auth";
import { parseBridgeBeginGrant, type BridgeBeginGrant } from "../../app/server/research/executor/begin";
import { BRIDGE_BODY_LIMITS } from "../../app/server/research/executor/body";
import {
  BRIDGE_EXECUTOR_MODE,
  BRIDGE_QUEUE_TTL_MS,
  hashBridgeJob,
  parseBridgeJob,
  type BridgeJob,
} from "../../app/server/research/executor/job";
import {
  BRIDGE_RECEIPT_RETENTION_MS,
  encodeBridgeProviderReceipt,
  summarizeBridgeProviderReceipt,
  type BridgeProviderReceipt,
} from "../../app/server/research/executor/receipt";
import { D1BridgeJobStore } from "../../worker/research-executor/d1-job-store";
import {
  BridgeReceiptStoreError,
  ExecutorReceiptStore,
} from "../../worker/research-executor/receipt-store";
import { SqliteD1 } from "../helpers/sqlite-d1";

const BASE_TIME = 1_800_000_000_000;
const JOB_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_JOB_ID = "22222222-2222-4222-8222-222222222222";
const MIGRATIONS = [
  "0000_research_bridge_nonces.sql",
  "0001_research_executor_jobs.sql",
  "0002_research_executor_results.sql",
] as const;

function migration(name: string): string {
  return readFileSync(resolve(process.cwd(), "worker/research-executor/migrations", name), "utf8")
    .replaceAll("--> statement-breakpoint", ";");
}

function createExecutorDb(filename = ":memory:"): SqliteD1 {
  const db = new SqliteD1(filename);
  db.database.exec("PRAGMA foreign_keys = ON");
  for (const name of MIGRATIONS) db.database.exec(migration(name));
  return db;
}

function job(overrides: Record<string, unknown> = {}): BridgeJob {
  return parseBridgeJob({
    protocol: BRIDGE_AUTH_PROTOCOL,
    executor: BRIDGE_EXECUTOR_MODE,
    jobId: JOB_ID,
    runId: "research-run-1",
    requestId: "request-1",
    inputFingerprint: `p2-${"1".repeat(32)}`,
    configFingerprint: `p2-${"2".repeat(32)}`,
    policyId: KIMI_RESEARCH_EXECUTION_POLICY.profileId,
    role: "Frontend Engineer",
    locale: "en-US",
    createdAt: BASE_TIME,
    queueExpiresAt: BASE_TIME + BRIDGE_QUEUE_TTL_MS,
    ...overrides,
  });
}

async function grantFor(value: BridgeJob): Promise<BridgeBeginGrant> {
  const beganAt = value.createdAt + 10;
  return parseBridgeBeginGrant({
    protocol: BRIDGE_AUTH_PROTOCOL,
    jobId: value.jobId,
    requestHash: await hashBridgeJob(value),
    beganAt,
    executionExpiresAt: beganAt + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
  });
}

async function receiptFor(
  value: BridgeJob,
  overrides: Record<string, unknown> = {},
): Promise<BridgeProviderReceipt> {
  return {
    grant: await grantFor(value),
    producedAt: BASE_TIME + 20,
    latencyMs: 42_000,
    outcome: {
      kind: "response",
      content: '{"private":"candidate"}',
      annotations: [{ type: "url_citation", url: "https://example.com", title: "Source" }],
      actualModel: "moonshotai/kimi-k2.5",
      usage: {
        promptTokens: 120,
        completionTokens: 80,
        totalTokens: 200,
        costMicros: 6_250_000,
        webSearchRequests: 1,
      },
    },
    ...overrides,
  } as BridgeProviderReceipt;
}

async function claim(db: SqliteD1, value: BridgeJob): Promise<void> {
  const jobs = new D1BridgeJobStore(db);
  const grant = await grantFor(value);
  await jobs.accept(value, BASE_TIME);
  await jobs.recordBegin(value, grant);
  expect(await jobs.claimDispatch(value, grant, BASE_TIME + 1)).toBe(true);
}

async function privateKey(value: BridgeJob): Promise<string> {
  return `research-receipts/v1/${value.jobId}/${(await grantFor(value)).requestHash}.json`;
}

function deferred(): Readonly<{
  promise: Promise<void>;
  resolve: () => void;
}> {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolveValue) => { resolvePromise = resolveValue; });
  return Object.freeze({ promise, resolve: () => resolvePromise?.() });
}

function throwAfterCommittedRun(
  db: SqliteD1,
  sqlFragment: string,
): Pick<D1Database, "prepare"> {
  let armed = true;
  return {
    prepare(sql: string) {
      const statement = db.prepare(sql);
      return {
        bind(...values: unknown[]) {
          const bound = statement.bind(...values);
          return {
            first: <T>() => bound.first<T>(),
            async run() {
              const result = await bound.run();
              if (armed && sql.includes(sqlFragment)) {
                armed = false;
                throw new Error("synthetic-private-lost-ack");
              }
              return result;
            },
          } as D1PreparedStatement;
        },
      } as D1PreparedStatement;
    },
  };
}

function closeJobBeforeRun(
  db: SqliteD1,
  sqlFragment: string,
  jobId: string,
): Pick<D1Database, "prepare"> {
  let armed = true;
  return {
    prepare(sql: string) {
      const statement = db.prepare(sql);
      return {
        bind(...values: unknown[]) {
          const bound = statement.bind(...values);
          return {
            first: <T>() => bound.first<T>(),
            async run() {
              if (armed && sql.includes(sqlFragment)) {
                armed = false;
                db.database.prepare(`UPDATE research_executor_jobs
                  SET dispatch_state='closed' WHERE job_id=?1`).run(jobId);
              }
              return bound.run();
            },
          } as D1PreparedStatement;
        },
      } as D1PreparedStatement;
    },
  };
}

function transformResultSelect(
  db: SqliteD1,
  transform: (row: unknown) => unknown,
): Pick<D1Database, "prepare"> {
  return {
    prepare(sql: string) {
      const statement = db.prepare(sql);
      return {
        bind(...values: unknown[]) {
          const bound = statement.bind(...values);
          return {
            async first<T>() {
              const actual = await bound.first();
              return (sql.includes("FROM research_executor_results")
                ? transform(actual)
                : actual) as T | null;
            },
            run: () => bound.run(),
          } as D1PreparedStatement;
        },
      } as D1PreparedStatement;
    },
  };
}

function gateAfterCommittedRun(
  db: SqliteD1,
  sqlFragment: string,
  committed: ReturnType<typeof deferred>,
  release: ReturnType<typeof deferred>,
): Pick<D1Database, "prepare"> {
  let armed = true;
  return {
    prepare(sql: string) {
      const statement = db.prepare(sql);
      return {
        bind(...values: unknown[]) {
          const bound = statement.bind(...values);
          return {
            first: <T>() => bound.first<T>(),
            async run() {
              const result = await bound.run();
              if (armed && sql.includes(sqlFragment)) {
                armed = false;
                committed.resolve();
                await release.promise;
              }
              return result;
            },
          } as D1PreparedStatement;
        },
      } as D1PreparedStatement;
    },
  };
}

function gateBeforeRun(
  db: SqliteD1,
  sqlFragment: string,
  entered: ReturnType<typeof deferred>,
  release: ReturnType<typeof deferred>,
): Pick<D1Database, "prepare"> {
  let armed = true;
  return {
    prepare(sql: string) {
      const statement = db.prepare(sql);
      return {
        bind(...values: unknown[]) {
          const bound = statement.bind(...values);
          return {
            first: <T>() => bound.first<T>(),
            async run() {
              if (armed && sql.includes(sqlFragment)) {
                armed = false;
                entered.resolve();
                await release.promise;
              }
              return bound.run();
            },
          } as D1PreparedStatement;
        },
      } as D1PreparedStatement;
    },
  };
}

function delayFirstJobRead(
  db: SqliteD1,
  delayMs: number,
  ready: ReturnType<typeof deferred>,
): Pick<D1Database, "prepare"> {
  let armed = true;
  return {
    prepare(sql: string) {
      const statement = db.prepare(sql);
      return {
        bind(...values: unknown[]) {
          const bound = statement.bind(...values);
          return {
            async first<T>() {
              const actual = await bound.first<T>();
              if (armed && sql.includes("FROM research_executor_jobs")) {
                armed = false;
                ready.resolve();
                await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, delayMs));
              }
              return actual;
            },
            run: () => bound.run(),
          } as D1PreparedStatement;
        },
      } as D1PreparedStatement;
    },
  };
}

function countingBucket(
  bucket: TestR2Bucket,
  writes: { count: number },
): Pick<R2Bucket, "get" | "put"> {
  return {
    get: bucket.get.bind(bucket),
    async put(key, value, options) {
      writes.count += 1;
      return bucket.put(key, value, options);
    },
  };
}

function removeExactTree(root: string): void {
  const resolvedRoot = resolve(root);
  const resolvedTemp = resolve(tmpdir());
  const inTaskTemp = dirname(resolvedRoot) === resolvedTemp
    && resolvedRoot.split(sep).at(-1)?.startsWith("arc-v8-task8-");
  if (!inTaskTemp) throw new Error("Refusing to clean a fixture outside Task 8 temp");
  if (!existsSync(resolvedRoot)) return;
  if (lstatSync(resolvedRoot).isSymbolicLink()) throw new Error("Refusing Task 8 fixture link");
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      const target = resolve(directory, name);
      if (!target.startsWith(`${resolvedRoot}${sep}`)) throw new Error("Fixture escaped Task 8 root");
      const status = lstatSync(target);
      if (status.isSymbolicLink()) throw new Error("Refusing Task 8 fixture descendant link");
      if (status.isDirectory()) visit(target);
      else rmSync(target);
    }
    rmdirSync(directory);
  };
  visit(resolvedRoot);
}

type TestR2Bucket = Pick<R2Bucket, "get" | "put" | "delete">;
type MiniflareR2Bucket = Awaited<ReturnType<Miniflare["getR2Bucket"]>>;

function asWorkerR2Bucket(bucket: MiniflareR2Bucket): TestR2Bucket {
  return {
    get: ((key: string, options?: R2GetOptions) => (
      options === undefined ? bucket.get(key) : bucket.get(key, options as never)
    )) as R2Bucket["get"],
    put: ((key: string, value: Parameters<R2Bucket["put"]>[1], options?: R2PutOptions) => (
      bucket.put(key, value as never, options as never)
    )) as R2Bucket["put"],
    delete: ((keys: string | string[]) => bucket.delete(keys)) as R2Bucket["delete"],
  };
}

const simulators: Miniflare[] = [];
async function createBucket(): Promise<TestR2Bucket> {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    compatibilityDate: "2026-05-15",
    cf: false,
    r2Buckets: ["RECEIPTS"],
  });
  simulators.push(mf);
  return asWorkerR2Bucket(await mf.getR2Bucket("RECEIPTS"));
}

afterEach(async () => {
  const results = await Promise.allSettled(simulators.splice(0).map((simulator) => simulator.dispose()));
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
});

async function expectStoreError(work: Promise<unknown>, code: BridgeReceiptStoreError["code"]): Promise<void> {
  const error = await work.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(BridgeReceiptStoreError);
  expect(error).toMatchObject({
    code,
    name: "BridgeReceiptStoreError",
    message: `Research bridge receipt store failure: ${code}`,
  });
  expect((error as Error).message).not.toMatch(/SELECT|INSERT|UPDATE|private|example\.com/iu);
}

describe("executor receipt result migration", () => {
  it("creates only the three executor tables and enforces result storage boundaries", async () => {
    const db = createExecutorDb();
    try {
      expect(db.database.prepare(`SELECT name FROM sqlite_master WHERE type='table'
        AND name NOT LIKE 'sqlite_%' ORDER BY name`).all()).toEqual([
        { name: "research_bridge_nonces" },
        { name: "research_executor_jobs" },
        { name: "research_executor_results" },
      ]);
      const value = job();
      await claim(db, value);
      const metadata = await summarizeBridgeProviderReceipt(await receiptFor(value));
      const valid = [value.jobId, metadata.receiptHash, canonicalJson(metadata), BASE_TIME, null, null, null];
      const sql = `INSERT INTO research_executor_results
        (job_id,receipt_hash,metadata_json,fixed_at,site_acknowledged_at,cleanup_requested_at,body_removed_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7)`;
      for (const changed of [
        ["bad", ...valid.slice(1)],
        [Buffer.from(value.jobId), ...valid.slice(1)],
        [valid[0], "A".repeat(64), ...valid.slice(2)],
        [valid[0], Buffer.from(metadata.receiptHash), ...valid.slice(2)],
        [valid[0], "g".repeat(64), ...valid.slice(2)],
        [valid[0], valid[1], "[]", ...valid.slice(3)],
        [valid[0], valid[1], "{", ...valid.slice(3)],
        [valid[0], valid[1], Buffer.from("{}"), ...valid.slice(3)],
        [valid[0], valid[1], JSON.stringify({ value: "🙂".repeat(1_100) }), ...valid.slice(3)],
        [valid[0], valid[1], "{}", 0.5, null, null, null],
        [valid[0], valid[1], "{}", -1, null, null, null],
        [valid[0], valid[1], "{}", Number.MAX_SAFE_INTEGER + 1, null, null, null],
        [valid[0], valid[1], "{}", 0, 0.5, null, null],
        [valid[0], valid[1], "{}", 0, null, -1, null],
        [valid[0], valid[1], "{}", 0, null, null, Number.MAX_SAFE_INTEGER + 1],
        [valid[0], valid[1], "{}", 0, null, null, 0],
        [valid[0], valid[1], "{}", 0, null, 1, 2],
      ]) expect(() => db.database.prepare(sql).run(...changed as never[])).toThrow();
      expect(db.database.prepare("SELECT count(*) AS n FROM research_executor_results").get()).toEqual({ n: 0 });
      const source = readFileSync(
        resolve(process.cwd(), "worker/research-executor/receipt-store.ts"),
        "utf8",
      );
      expect(source).not.toMatch(/CREATE\s+TABLE|\.delete\s*\(|openrouter-provider/iu);
    } finally {
      db.close();
    }
  });
});

describe("executor receipt private storage", () => {
  it("saves canonical private bytes to real R2, fixes metadata in D1, and recovers without input", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const receipt = structuredClone(await receiptFor(value));
      const expectedReceipt = structuredClone(receipt);
      const expectedBytes = encodeBridgeProviderReceipt(receipt);
      const pending = new ExecutorReceiptStore(db, bucket).save(receipt, BASE_TIME + 30);
      (receipt.outcome as unknown as Record<string, unknown>).content = "mutated after call";
      (receipt.grant as unknown as Record<string, unknown>).requestHash = "f".repeat(64);
      const saved = await pending;
      expect(saved).toMatchObject({ fixedAt: BASE_TIME + 30, bodyState: "available", receipt: expectedReceipt });
      expect(saved.metadata.receiptHash).toBe(
        createHash("sha256").update(expectedBytes).digest("hex"),
      );
      const key = `research-receipts/v1/${value.jobId}/${(await grantFor(value)).requestHash}.json`;
      const object = await bucket.get(key);
      expect(object).not.toBeNull();
      expect(await object?.text()).toBe(new TextDecoder().decode(expectedBytes));
      const row = db.database.prepare("SELECT * FROM research_executor_results WHERE job_id=?1").get(value.jobId);
      expect(row).not.toHaveProperty("content");
      expect(JSON.stringify(row)).not.toContain("private");
      expect(JSON.stringify(row)).not.toContain("annotations");
      const recovered = await new ExecutorReceiptStore(db, bucket).recover(value.jobId, 0);
      expect(recovered).toEqual(saved);
      expect(Object.isFrozen(recovered)).toBe(true);
      expect(Object.isFrozen(recovered?.receipt?.outcome)).toBe(true);
    } finally {
      db.close();
    }
  });

  it("recovers a content-only interrupted save and preserves the first valid outcome", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const receipt = await receiptFor(value);
      const key = `research-receipts/v1/${value.jobId}/${(await grantFor(value)).requestHash}.json`;
      await bucket.put(key, encodeBridgeProviderReceipt(receipt), {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: "application/json" },
      });
      const recovered = await new ExecutorReceiptStore(db, bucket).recover(value.jobId, BASE_TIME + 31);
      expect(recovered).toMatchObject({ fixedAt: BASE_TIME + 31, bodyState: "available", receipt });
      const competing = await receiptFor(value, {
        outcome: { ...(receipt.outcome as Record<string, unknown>), content: "different private body" },
      });
      await expectStoreError(
        new ExecutorReceiptStore(db, bucket).save(competing, BASE_TIME + 32),
        "conflict",
      );
      expect(new TextDecoder().decode(new Uint8Array(await (await bucket.get(key))!.arrayBuffer())))
        .toBe(new TextDecoder().decode(encodeBridgeProviderReceipt(receipt)));
    } finally {
      db.close();
    }
  });

  it("acknowledges the exact hash and permanently replaces an eligible body with a bounded tombstone", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const receipt = await receiptFor(value);
      const store = new ExecutorReceiptStore(db, bucket);
      const saved = await store.save(receipt, BASE_TIME + 30);
      expect(() => store.acknowledge(
        value.jobId,
        `${saved.metadata.receiptHash}\n`,
        BASE_TIME + 39,
      )).toThrowError(new BridgeReceiptStoreError("invalid-message"));
      await expectStoreError(store.acknowledge(value.jobId, "f".repeat(64), BASE_TIME + 40), "conflict");
      const acknowledged = await store.acknowledge(
        value.jobId,
        saved.metadata.receiptHash,
        BASE_TIME + 40,
      );
      expect(acknowledged.siteAcknowledgedAt).toBe(BASE_TIME + 40);
      const cleaned = await store.cleanup(value.jobId, BASE_TIME + 41);
      expect(cleaned).toMatchObject({
        bodyState: "removed",
        receipt: null,
        siteAcknowledgedAt: BASE_TIME + 40,
        cleanupRequestedAt: BASE_TIME + 41,
        bodyRemovedAt: BASE_TIME + 41,
      });
      const key = `research-receipts/v1/${value.jobId}/${(await grantFor(value)).requestHash}.json`;
      const text = await (await bucket.get(key))?.text();
      expect(text).toBe(canonicalJson({
        format: "arc-research-receipt-tombstone-v1",
        metadata: saved.metadata,
        removedAt: BASE_TIME + 41,
      }));
      expect(text).not.toContain("private");
      expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(4096);
      expect(await store.save(receipt, BASE_TIME + 99)).toEqual(cleaned);
      expect(await (await bucket.get(key))?.text()).toBe(text);
      expect(await store.cleanup(value.jobId, 0)).toEqual(cleaned);
    } finally {
      db.close();
    }
  });

  it("keeps unknown jobs open, rejects unclaimed or closed jobs, and accepts late claimed receipts", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const store = new ExecutorReceiptStore(db, bucket);
      await expectStoreError(store.recover(JOB_ID, BASE_TIME), "not-found");
      const unclaimed = job();
      const jobs = new D1BridgeJobStore(db);
      await jobs.accept(unclaimed, BASE_TIME);
      await jobs.recordBegin(unclaimed, await grantFor(unclaimed));
      await expectStoreError(store.save(await receiptFor(unclaimed), BASE_TIME), "conflict");
      await jobs.closeUnclaimed(unclaimed, BASE_TIME + 2);
      await expectStoreError(store.save(await receiptFor(unclaimed), BASE_TIME), "conflict");
      const claimed = job({ jobId: OTHER_JOB_ID, requestId: "request-2" });
      await claim(db, claimed);
      const late = await receiptFor(claimed, {
        producedAt: claimed.createdAt + BRIDGE_QUEUE_TTL_MS + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
      });
      await expect(store.save(late, Number.MAX_SAFE_INTEGER)).resolves.toMatchObject({ bodyState: "available" });

      const open = job({ jobId: "55555555-5555-4555-8555-555555555555", requestId: "request-open" });
      await claim(db, open);
      expect(await store.recover(open.jobId, BASE_TIME + 10)).toBeNull();
      await expect(store.save(await receiptFor(open), BASE_TIME + 11))
        .resolves.toMatchObject({ fixedAt: BASE_TIME + 11, bodyState: "available" });
    } finally {
      db.close();
    }
  });

  it("rejects malformed public scalars synchronously before cryptography or storage", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    try {
      const value = job();
      const receipt = await receiptFor(value);
      digest.mockClear();
      const store = new ExecutorReceiptStore(db, bucket);
      expect(() => store.save(receipt, -1)).toThrowError(new BridgeReceiptStoreError("invalid-message"));
      expect(() => store.recover(`${value.jobId}\n`, 0))
        .toThrowError(new BridgeReceiptStoreError("invalid-message"));
      expect(() => store.cleanup(value.jobId, Number.MAX_SAFE_INTEGER + 1))
        .toThrowError(new BridgeReceiptStoreError("invalid-message"));
      expect(digest).not.toHaveBeenCalled();
    } finally {
      digest.mockRestore();
      db.close();
    }
  });

  it("preserves first fixation, acknowledgement, and cleanup markers across replays and races", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const receipt = await receiptFor(value);
      const first = new ExecutorReceiptStore(db, bucket);
      const second = new ExecutorReceiptStore(db, bucket);
      const saves = await Promise.all([
        first.save(receipt, BASE_TIME + 30),
        second.save(structuredClone(receipt), BASE_TIME + 31),
      ]);
      const fixedAt = saves[0]!.fixedAt;
      expect([BASE_TIME + 30, BASE_TIME + 31]).toContain(fixedAt);
      expect(saves.map((item) => item.fixedAt)).toEqual([fixedAt, fixedAt]);
      expect((await first.save(receipt, BASE_TIME + 32)).fixedAt).toBe(fixedAt);
      const hash = saves[0]!.metadata.receiptHash;
      const acknowledgements = await Promise.all([
        first.acknowledge(value.jobId, hash, BASE_TIME + 40),
        second.acknowledge(value.jobId, hash, BASE_TIME + 41),
      ]);
      const acknowledgedAt = acknowledgements[0]!.siteAcknowledgedAt;
      expect([BASE_TIME + 40, BASE_TIME + 41]).toContain(acknowledgedAt);
      expect(acknowledgements.map((item) => item.siteAcknowledgedAt))
        .toEqual([acknowledgedAt, acknowledgedAt]);
      expect(acknowledgements.map((item) => item.fixedAt)).toEqual([fixedAt, fixedAt]);
      expect(await first.acknowledge(value.jobId, hash, BASE_TIME + 42))
        .toMatchObject({ fixedAt, siteAcknowledgedAt: acknowledgedAt });
      const cleanups = await Promise.all([
        first.cleanup(value.jobId, BASE_TIME + 50),
        second.cleanup(value.jobId, BASE_TIME + 51),
      ]);
      const cleanupIntent = cleanups[0]?.cleanupRequestedAt;
      expect([BASE_TIME + 50, BASE_TIME + 51]).toContain(cleanupIntent);
      expect(cleanups.map((item) => item?.cleanupRequestedAt))
        .toEqual([cleanupIntent, cleanupIntent]);
      expect(cleanups.map((item) => item?.bodyRemovedAt))
        .toEqual([cleanupIntent, cleanupIntent]);
      for (const cleanup of cleanups) {
        expect(cleanup).toMatchObject({ fixedAt, siteAcknowledgedAt: acknowledgedAt });
      }
      expect(cleanups.map((item) => item?.metadata.outcome.usage?.costMicros))
        .toEqual([6_250_000, 6_250_000]);
      expect(await first.cleanup(value.jobId, BASE_TIME + 52)).toMatchObject({
        fixedAt, siteAcknowledgedAt: acknowledgedAt,
        cleanupRequestedAt: cleanupIntent, bodyRemovedAt: cleanupIntent,
      });
    } finally {
      db.close();
    }
  });

  it("converges an acknowledgement racing a committed cleanup intent on real SQLite and R2", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    const committed = deferred();
    const release = deferred();
    try {
      const value = job();
      await claim(db, value);
      const receipt = await receiptFor(value);
      const saved = await new ExecutorReceiptStore(db, bucket).save(receipt, BASE_TIME + 30);
      const cleanupAt = saved.metadata.producedAt + BRIDGE_RECEIPT_RETENTION_MS;
      const acknowledgedAt = BASE_TIME + 40;
      const writes = { count: 0 };
      const countedBucket = countingBucket(bucket, writes);
      const cleanupPromise = new ExecutorReceiptStore(
        gateAfterCommittedRun(db, "SET cleanup_requested_at", committed, release),
        countedBucket,
      ).cleanup(value.jobId, cleanupAt);
      const observedCleanup = cleanupPromise.then(
        (result) => ({ status: "fulfilled" as const, result }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      );

      await committed.promise;
      expect(await new ExecutorReceiptStore(db, countedBucket).acknowledge(
        value.jobId,
        saved.metadata.receiptHash,
        acknowledgedAt,
      )).toMatchObject({ siteAcknowledgedAt: acknowledgedAt });
      release.resolve();

      const cleanupOutcome = await observedCleanup;
      if (cleanupOutcome.status === "rejected") {
        expect(cleanupOutcome.error).toEqual(new BridgeReceiptStoreError("unavailable"));
      }
      const replayStore = new ExecutorReceiptStore(db, countedBucket);
      const converged = await replayStore.cleanup(value.jobId, cleanupAt + 1);
      expect(converged).toMatchObject({
        metadata: saved.metadata,
        fixedAt: BASE_TIME + 30,
        siteAcknowledgedAt: acknowledgedAt,
        cleanupRequestedAt: cleanupAt,
        bodyRemovedAt: cleanupAt,
        bodyState: "removed",
        receipt: null,
      });
      expect(converged?.metadata.receiptHash).toBe(saved.metadata.receiptHash);
      expect(converged?.metadata.outcome.usage?.costMicros).toBe(6_250_000);
      expect(await replayStore.acknowledge(
        value.jobId,
        saved.metadata.receiptHash,
        acknowledgedAt + 1,
      )).toEqual(converged);
      expect(await replayStore.save(receipt, BASE_TIME + 99)).toEqual(converged);
      expect(await replayStore.cleanup(value.jobId, cleanupAt + 2)).toEqual(converged);
      expect(writes.count).toBe(1);
      expect(await new ExecutorReceiptStore(db, bucket).recover(value.jobId, 0)).toEqual(converged);
    } finally {
      release.resolve();
      db.close();
    }
  });

  it("allows one concurrent first identity and rejects a different valid first receipt", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const first = await receiptFor(value);
      const second = await receiptFor(value, {
        outcome: { ...(first.outcome as Record<string, unknown>), content: "other private result" },
      });
      const outcomes = await Promise.allSettled([
        new ExecutorReceiptStore(db, bucket).save(first, BASE_TIME + 30),
        new ExecutorReceiptStore(db, bucket).save(second, BASE_TIME + 31),
      ]);
      expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
      const rejection = outcomes.find((item) => item.status === "rejected");
      expect(rejection).toMatchObject({
        reason: new BridgeReceiptStoreError("conflict"),
      });
      const stored = await new ExecutorReceiptStore(db, bucket).recover(value.jobId, 0);
      const winner = outcomes.find((item) => item.status === "fulfilled");
      expect(stored).toEqual(winner?.status === "fulfilled" ? winner.value : undefined);
    } finally {
      db.close();
    }
  });

  it("treats a same-hash different metadata row as conflict and a tombstone without D1 intent as unavailable", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const receipt = await receiptFor(value);
      const store = new ExecutorReceiptStore(db, bucket);
      const saved = await store.save(receipt, BASE_TIME + 30);
      const altered = {
        ...saved.metadata,
        latencyMs: saved.metadata.latencyMs + 1,
      };
      db.database.prepare(`UPDATE research_executor_results SET metadata_json=?1 WHERE job_id=?2`)
        .run(canonicalJson(altered), value.jobId);
      await expectStoreError(store.save(receipt, BASE_TIME + 31), "conflict");
      await expectStoreError(store.recover(value.jobId, 0), "unavailable");
      expect((db.database.prepare(`SELECT receipt_hash FROM research_executor_results
        WHERE job_id=?1`).get(value.jobId) as { receipt_hash: string }).receipt_hash)
        .toBe(saved.metadata.receiptHash);

      const other = job({ jobId: OTHER_JOB_ID, requestId: "request-tombstone-only" });
      await claim(db, other);
      const otherReceipt = await receiptFor(other);
      const metadata = await summarizeBridgeProviderReceipt(otherReceipt);
      await bucket.put(await privateKey(other), new TextEncoder().encode(canonicalJson({
        format: "arc-research-receipt-tombstone-v1",
        metadata,
        removedAt: BASE_TIME + 40,
      })));
      await expectStoreError(store.recover(other.jobId, BASE_TIME + 41), "unavailable");
      expect(db.database.prepare(`SELECT count(*) AS n FROM research_executor_results
        WHERE job_id=?1`).get(other.jobId)).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });

  it("waits for the retention boundary, then cleans a missing body using permanent metadata", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const receipt = await receiptFor(value);
      const store = new ExecutorReceiptStore(db, bucket);
      const saved = await store.save(receipt, BASE_TIME + 30);
      const before = await store.cleanup(
        value.jobId,
        saved.metadata.producedAt + BRIDGE_RECEIPT_RETENTION_MS - 1,
      );
      expect(before).toMatchObject({ bodyState: "available", cleanupRequestedAt: null });
      const key = await privateKey(value);
      await bucket.delete(key);
      expect(await store.recover(value.jobId, 0)).toMatchObject({ bodyState: "missing", receipt: null });
      expect(await store.save(receipt, BASE_TIME + 99)).toMatchObject({
        fixedAt: BASE_TIME + 30,
        bodyState: "missing",
        receipt: null,
      });
      expect(await bucket.get(key)).toBeNull();
      const boundary = saved.metadata.producedAt + BRIDGE_RECEIPT_RETENTION_MS;
      expect(await store.cleanup(value.jobId, boundary)).toMatchObject({
        bodyState: "removed",
        cleanupRequestedAt: boundary,
        bodyRemovedAt: boundary,
        receipt: null,
      });
      expect(await (await bucket.get(key))?.text()).toContain("arc-research-receipt-tombstone-v1");
    } finally {
      db.close();
    }
  });

  it("keeps a tombstone when a delayed real create-only save resumes after cleanup", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const receipt = await receiptFor(value);
      const entered = deferred();
      const release = deferred();
      const delayedBucket: Pick<R2Bucket, "get" | "put"> = {
        get: bucket.get.bind(bucket),
        async put(key, valueToStore, options) {
          entered.resolve();
          await release.promise;
          return bucket.put(key, valueToStore, options);
        },
      };
      const delayed = new ExecutorReceiptStore(db, delayedBucket).save(receipt, BASE_TIME + 30);
      await entered.promise;
      const winner = new ExecutorReceiptStore(db, bucket);
      const saved = await winner.save(receipt, BASE_TIME + 31);
      await winner.acknowledge(value.jobId, saved.metadata.receiptHash, BASE_TIME + 32);
      const cleaned = await winner.cleanup(value.jobId, BASE_TIME + 33);
      release.resolve();
      expect(await delayed).toEqual(cleaned);
      const finalText = await (await bucket.get(await privateKey(value)))?.text();
      expect(finalText).toBe(canonicalJson({
        format: "arc-research-receipt-tombstone-v1",
        metadata: saved.metadata,
        removedAt: BASE_TIME + 33,
      }));
      expect(finalText).not.toContain("private");
    } finally {
      db.close();
    }
  });

  it.each(["save", "recover"] as const)(
    "returns a coherent removed snapshot when %s fixation races completed cleanup",
    async (method) => {
      const db = createExecutorDb();
      const bucket = await createBucket();
      const entered = deferred();
      const release = deferred();
      let pendingOutcome: Promise<
        | { status: "fulfilled"; value: Awaited<ReturnType<ExecutorReceiptStore["recover"]>> }
        | { status: "rejected"; error: unknown }
      > | undefined;
      try {
        const value = job();
        await claim(db, value);
        const receipt = await receiptFor(value);
        if (method === "recover") {
          await bucket.put(await privateKey(value), encodeBridgeProviderReceipt(receipt), {
            onlyIf: { etagDoesNotMatch: "*" },
            httpMetadata: { contentType: "application/json" },
          });
        }
        const writes = { count: 0 };
        const racingStore = new ExecutorReceiptStore(
          gateBeforeRun(db, "INSERT INTO research_executor_results", entered, release),
          countingBucket(bucket, writes),
        );
        const pending = method === "save"
          ? racingStore.save(receipt, BASE_TIME + 30)
          : racingStore.recover(value.jobId, BASE_TIME + 30);
        pendingOutcome = pending.then(
          (result) => ({ status: "fulfilled" as const, value: result }),
          (error: unknown) => ({ status: "rejected" as const, error }),
        );
        await entered.promise;
        expect(writes.count).toBe(method === "save" ? 1 : 0);

        const winner = new ExecutorReceiptStore(db, bucket);
        const saved = await winner.save(receipt, BASE_TIME + 31);
        await winner.acknowledge(value.jobId, saved.metadata.receiptHash, BASE_TIME + 32);
        const cleaned = await winner.cleanup(value.jobId, BASE_TIME + 33);
        const durableBeforeRelease = db.database.prepare(`SELECT * FROM research_executor_results
          WHERE job_id=?1`).get(value.jobId);
        const writesBeforeRelease = writes.count;

        release.resolve();
        const outcome = await pendingOutcome;
        if (outcome.status === "rejected") throw outcome.error;
        expect(outcome.value).toEqual(cleaned);
        expect(outcome.value).toMatchObject({
          fixedAt: BASE_TIME + 31,
          siteAcknowledgedAt: BASE_TIME + 32,
          cleanupRequestedAt: BASE_TIME + 33,
          bodyRemovedAt: BASE_TIME + 33,
          bodyState: "removed",
          receipt: null,
          metadata: {
            receiptHash: saved.metadata.receiptHash,
            outcome: { usage: { costMicros: 6_250_000 } },
          },
        });
        expect(writes.count).toBe(writesBeforeRelease);
        expect(db.database.prepare(`SELECT * FROM research_executor_results
          WHERE job_id=?1`).get(value.jobId)).toEqual(durableBeforeRelease);
        expect(await racingStore.save(receipt, BASE_TIME + 99)).toEqual(cleaned);
        expect(writes.count).toBe(writesBeforeRelease);
        expect(await (await bucket.get(await privateKey(value)))?.text()).toBe(canonicalJson({
          format: "arc-research-receipt-tombstone-v1",
          metadata: saved.metadata,
          removedAt: BASE_TIME + 33,
        }));
      } finally {
        release.resolve();
        await pendingOutcome;
        db.close();
      }
    },
  );

  it("recovers after actual R2 and D1 commits lose their acknowledgements", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const receipt = await receiptFor(value);
      let throwAfterPut = true;
      const lossyBucket: Pick<R2Bucket, "get" | "put"> = {
        get: bucket.get.bind(bucket),
        async put(key, valueToStore, options) {
          const result = await bucket.put(key, valueToStore, options);
          if (throwAfterPut) {
            throwAfterPut = false;
            throw new Error("synthetic-private-lost-r2-ack");
          }
          return result;
        },
      };
      await expectStoreError(
        new ExecutorReceiptStore(db, lossyBucket).save(receipt, BASE_TIME + 30),
        "unavailable",
      );
      const recovered = await new ExecutorReceiptStore(db, bucket).recover(value.jobId, BASE_TIME + 31);
      expect(recovered).toMatchObject({ fixedAt: BASE_TIME + 31, bodyState: "available", receipt });

      const other = job({ jobId: OTHER_JOB_ID, requestId: "request-2" });
      await claim(db, other);
      const otherReceipt = await receiptFor(other);
      await expectStoreError(
        new ExecutorReceiptStore(
          throwAfterCommittedRun(db, "INSERT INTO research_executor_results"),
          bucket,
        ).save(otherReceipt, BASE_TIME + 40),
        "unavailable",
      );
      expect(await new ExecutorReceiptStore(db, bucket).recover(other.jobId, 0))
        .toMatchObject({ fixedAt: BASE_TIME + 40, bodyState: "available", receipt: otherReceipt });
    } finally {
      db.close();
    }
  });

  it("replays lost acknowledgement, cleanup-intent, tombstone, and removal-marker commits", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    const setup = async (jobId: string, requestId: string) => {
      const value = job({ jobId, requestId });
      await claim(db, value);
      const receipt = await receiptFor(value);
      const saved = await new ExecutorReceiptStore(db, bucket).save(receipt, BASE_TIME + 30);
      return { value, receipt, saved };
    };
    try {
      const ackCase = await setup(JOB_ID, "request-ack-loss");
      await expectStoreError(new ExecutorReceiptStore(
        throwAfterCommittedRun(db, "SET site_acknowledged_at"),
        bucket,
      ).acknowledge(ackCase.value.jobId, ackCase.saved.metadata.receiptHash, BASE_TIME + 40), "unavailable");
      expect(await new ExecutorReceiptStore(db, bucket).acknowledge(
        ackCase.value.jobId,
        ackCase.saved.metadata.receiptHash,
        BASE_TIME + 41,
      )).toMatchObject({ siteAcknowledgedAt: BASE_TIME + 40 });

      const intentCase = await setup(OTHER_JOB_ID, "request-intent-loss");
      await new ExecutorReceiptStore(db, bucket).acknowledge(
        intentCase.value.jobId,
        intentCase.saved.metadata.receiptHash,
        BASE_TIME + 42,
      );
      await expectStoreError(new ExecutorReceiptStore(
        throwAfterCommittedRun(db, "SET cleanup_requested_at"),
        bucket,
      ).cleanup(intentCase.value.jobId, BASE_TIME + 50), "unavailable");
      expect(await new ExecutorReceiptStore(db, bucket).cleanup(intentCase.value.jobId, BASE_TIME + 51))
        .toMatchObject({ cleanupRequestedAt: BASE_TIME + 50, bodyRemovedAt: BASE_TIME + 50 });

      const tombstoneCase = await setup("33333333-3333-4333-8333-333333333333", "request-tombstone-loss");
      await new ExecutorReceiptStore(db, bucket).acknowledge(
        tombstoneCase.value.jobId,
        tombstoneCase.saved.metadata.receiptHash,
        BASE_TIME + 43,
      );
      let throwTombstoneAck = true;
      const lossyBucket: Pick<R2Bucket, "get" | "put"> = {
        get: bucket.get.bind(bucket),
        async put(key, valueToStore, options) {
          const result = await bucket.put(key, valueToStore, options);
          if (throwTombstoneAck) {
            throwTombstoneAck = false;
            throw new Error("synthetic-private-lost-tombstone-ack");
          }
          return result;
        },
      };
      await expectStoreError(
        new ExecutorReceiptStore(db, lossyBucket).cleanup(tombstoneCase.value.jobId, BASE_TIME + 52),
        "unavailable",
      );
      expect(await new ExecutorReceiptStore(db, bucket).cleanup(tombstoneCase.value.jobId, 0))
        .toMatchObject({ cleanupRequestedAt: BASE_TIME + 52, bodyRemovedAt: BASE_TIME + 52 });

      const markerCase = await setup("44444444-4444-4444-8444-444444444444", "request-marker-loss");
      await new ExecutorReceiptStore(db, bucket).acknowledge(
        markerCase.value.jobId,
        markerCase.saved.metadata.receiptHash,
        BASE_TIME + 44,
      );
      await expectStoreError(new ExecutorReceiptStore(
        throwAfterCommittedRun(db, "SET body_removed_at"),
        bucket,
      ).cleanup(markerCase.value.jobId, BASE_TIME + 53), "unavailable");
      expect(await new ExecutorReceiptStore(db, bucket).recover(markerCase.value.jobId, 0))
        .toMatchObject({ cleanupRequestedAt: BASE_TIME + 53, bodyRemovedAt: BASE_TIME + 53 });
    } finally {
      db.close();
    }
  });

  it("refuses a marker when the exact claimed job changes before the conditional update", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const receipt = await receiptFor(value);
      const saved = await new ExecutorReceiptStore(db, bucket).save(receipt, BASE_TIME + 30);
      await expectStoreError(new ExecutorReceiptStore(
        closeJobBeforeRun(db, "SET site_acknowledged_at", value.jobId),
        bucket,
      ).acknowledge(value.jobId, saved.metadata.receiptHash, BASE_TIME + 40), "unavailable");
      expect(db.database.prepare(`SELECT site_acknowledged_at FROM research_executor_results
        WHERE job_id=?1`).get(value.jobId)).toEqual({ site_acknowledged_at: null });
    } finally {
      db.close();
    }
  });

  it("fails closed on corrupt bodies and never overwrites fixed accounting metadata", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const receipt = await receiptFor(value);
      const store = new ExecutorReceiptStore(db, bucket);
      const saved = await store.save(receipt, BASE_TIME + 30);
      const key = await privateKey(value);
      for (const bytes of [
        new Uint8Array([0xff, 0xfe]),
        new TextEncoder().encode("{"),
        new TextEncoder().encode(`${new TextDecoder().decode(encodeBridgeProviderReceipt(receipt))} `),
      ]) {
        await bucket.put(key, bytes);
        await expectStoreError(store.recover(value.jobId, 0), "unavailable");
      }
      const row = db.database.prepare(`SELECT receipt_hash,metadata_json,fixed_at
        FROM research_executor_results WHERE job_id=?1`).get(value.jobId);
      expect(row).toEqual({
        receipt_hash: saved.metadata.receiptHash,
        metadata_json: canonicalJson(saved.metadata),
        fixed_at: BASE_TIME + 30,
      });
    } finally {
      db.close();
    }
  });

  it("fails closed for table-driven unknown result rows while preserving actual SQLite and R2 state", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const receipt = await receiptFor(value);
      const store = new ExecutorReceiptStore(db, bucket);
      const saved = await store.save(receipt, BASE_TIME + 30);
      await store.acknowledge(value.jobId, saved.metadata.receiptHash, BASE_TIME + 40);
      const healthy = await store.cleanup(value.jobId, BASE_TIME + 41);
      const select = `SELECT job_id,receipt_hash,metadata_json,fixed_at,
        site_acknowledged_at,cleanup_requested_at,body_removed_at
        FROM research_executor_results WHERE job_id=?1`;
      const actualRow = db.database.prepare(select).get(value.jobId) as Record<string, unknown>;
      const accessorReads = { count: 0 };
      const changedMetadata = (row: unknown, change: (metadata: Record<string, unknown>) => unknown) => {
        const copy = { ...(row as Record<string, unknown>) };
        const metadata = JSON.parse(copy.metadata_json as string) as Record<string, unknown>;
        copy.metadata_json = canonicalJson(change(metadata));
        return copy;
      };
      const cases: readonly [string, (row: unknown) => unknown][] = [
        ["missing column", (row) => {
          const copy = { ...(row as Record<string, unknown>) };
          delete copy.fixed_at;
          return copy;
        }],
        ["extra column", (row) => ({ ...(row as Record<string, unknown>), extra: "private" })],
        ["accessor column", (row) => {
          const copy = { ...(row as Record<string, unknown>) };
          Object.defineProperty(copy, "fixed_at", {
            enumerable: true,
            get() { accessorReads.count += 1; return BASE_TIME + 30; },
          });
          return copy;
        }],
        ["non-plain row", (row) => Object.assign(Object.create({ inherited: true }), row)],
        ["text fixed marker", (row) => ({ ...(row as Record<string, unknown>), fixed_at: "1800000000030" })],
        ["fractional acknowledgement", (row) => ({
          ...(row as Record<string, unknown>), site_acknowledged_at: 1.5,
        })],
        ["removal without intent", (row) => ({
          ...(row as Record<string, unknown>), cleanup_requested_at: null,
        })],
        ["removal differs from intent", (row) => ({
          ...(row as Record<string, unknown>), body_removed_at: BASE_TIME + 42,
        })],
        ["noncanonical metadata", (row) => ({
          ...(row as Record<string, unknown>),
          metadata_json: `${(row as Record<string, unknown>).metadata_json as string} `,
        })],
        ["mismatched row job", (row) => ({ ...(row as Record<string, unknown>), job_id: OTHER_JOB_ID })],
        ["mismatched hash column", (row) => ({ ...(row as Record<string, unknown>), receipt_hash: "f".repeat(64) })],
        ["mismatched metadata grant job", (row) => changedMetadata(row, (metadata) => ({
          ...metadata,
          grant: {
            ...(metadata.grant as Record<string, unknown>),
            jobId: OTHER_JOB_ID,
          },
        }))],
        ["mismatched metadata grant hash", (row) => changedMetadata(row, (metadata) => ({
          ...metadata,
          grant: {
            ...(metadata.grant as Record<string, unknown>),
            requestHash: "f".repeat(64),
          },
        }))],
      ];
      for (const [label, transform] of cases) {
        const writes = { count: 0 };
        await expectStoreError(
          new ExecutorReceiptStore(
            transformResultSelect(db, transform),
            countingBucket(bucket, writes),
          ).recover(value.jobId, 0),
          "unavailable",
        );
        expect(writes.count, label).toBe(0);
        expect(db.database.prepare(select).get(value.jobId), label).toEqual(actualRow);
        expect(await new ExecutorReceiptStore(db, bucket).recover(value.jobId, 0), label).toEqual(healthy);
      }
      expect(accessorReads.count).toBe(0);
    } finally {
      db.close();
    }
  });

  it("rejects wrong-grant receipts and mismatched valid tombstones without restoring or overwriting", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const receipt = await receiptFor(value);
      const saved = await new ExecutorReceiptStore(db, bucket).save(receipt, BASE_TIME + 30);
      const resultBefore = db.database.prepare(`SELECT * FROM research_executor_results
        WHERE job_id=?1`).get(value.jobId);
      const otherReceipt = await receiptFor(job({ jobId: OTHER_JOB_ID, requestId: "wrong-grant" }));
      const wrongGrantBytes = encodeBridgeProviderReceipt(otherReceipt);
      const key = await privateKey(value);
      await bucket.put(key, wrongGrantBytes);
      const wrongGrantWrites = { count: 0 };
      const wrongGrantStore = new ExecutorReceiptStore(db, countingBucket(bucket, wrongGrantWrites));
      await expectStoreError(wrongGrantStore.recover(value.jobId, 0), "unavailable");
      await expectStoreError(wrongGrantStore.save(receipt, BASE_TIME + 31), "unavailable");
      expect(wrongGrantWrites.count).toBe(0);
      expect(db.database.prepare(`SELECT * FROM research_executor_results WHERE job_id=?1`).get(value.jobId))
        .toEqual(resultBefore);
      expect(new Uint8Array(await (await bucket.get(key))!.arrayBuffer())).toEqual(wrongGrantBytes);
      expect(saved.metadata.receiptHash).not.toBe((await summarizeBridgeProviderReceipt(otherReceipt)).receiptHash);

      const tombstoneCases = [
        { jobId: "66666666-6666-4666-8666-666666666666", kind: "metadata" },
        { jobId: "77777777-7777-4777-8777-777777777777", kind: "hash" },
        { jobId: "88888888-8888-4888-8888-888888888888", kind: "removedAt" },
      ] as const;
      for (const [index, current] of tombstoneCases.entries()) {
        const tombstoneJob = job({ jobId: current.jobId, requestId: `bad-tombstone-${current.kind}` });
        await claim(db, tombstoneJob);
        const tombstoneReceipt = await receiptFor(tombstoneJob);
        const tombstoneSaved = await new ExecutorReceiptStore(db, bucket)
          .save(tombstoneReceipt, BASE_TIME + 50 + index);
        await expectStoreError(new ExecutorReceiptStore(
          throwAfterCommittedRun(db, "SET cleanup_requested_at"),
          bucket,
        ).cleanup(
          tombstoneJob.jobId,
          tombstoneSaved.metadata.producedAt + BRIDGE_RECEIPT_RETENTION_MS,
        ), "unavailable");
        const durable = db.database.prepare(`SELECT * FROM research_executor_results
          WHERE job_id=?1`).get(tombstoneJob.jobId) as Record<string, unknown>;
        const originalIntent = durable.cleanup_requested_at as number;
        expect(originalIntent).toBe(
          tombstoneSaved.metadata.producedAt + BRIDGE_RECEIPT_RETENTION_MS,
        );
        const tombstoneMetadata = current.kind === "metadata"
          ? { ...tombstoneSaved.metadata, latencyMs: tombstoneSaved.metadata.latencyMs + 1 }
          : current.kind === "hash"
            ? { ...tombstoneSaved.metadata, receiptHash: "f".repeat(64) }
            : tombstoneSaved.metadata;
        const corruptTombstone = canonicalJson({
          format: "arc-research-receipt-tombstone-v1",
          metadata: tombstoneMetadata,
          removedAt: current.kind === "removedAt" ? originalIntent + 1 : originalIntent,
        });
        const tombstoneKey = await privateKey(tombstoneJob);
        await bucket.put(tombstoneKey, new TextEncoder().encode(corruptTombstone));
        const writes = { count: 0 };
        const corruptStore = new ExecutorReceiptStore(db, countingBucket(bucket, writes));
        await expectStoreError(corruptStore.recover(tombstoneJob.jobId, 0), "unavailable");
        await expectStoreError(corruptStore.save(tombstoneReceipt, BASE_TIME + 99), "unavailable");
        expect(writes.count, current.kind).toBe(0);
        expect(await (await bucket.get(tombstoneKey))?.text(), current.kind).toBe(corruptTombstone);
        expect(db.database.prepare(`SELECT * FROM research_executor_results
          WHERE job_id=?1`).get(tombstoneJob.jobId), current.kind).toEqual(durable);
      }
    } finally {
      db.close();
    }
  });
});

describe("executor receipt bounded and persistent recovery", () => {
  it("uses one cumulative five-second budget across completed D1 and delayed R2 stages", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    let cancel: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const value = job();
      await claim(db, value);
      const receipt = await receiptFor(value);
      const saved = await new ExecutorReceiptStore(db, bucket).save(receipt, BASE_TIME + 30);
      const resultBefore = db.database.prepare(`SELECT * FROM research_executor_results
        WHERE job_id=?1`).get(value.jobId);
      const firstStage = deferred();
      const secondStage = deferred();
      const writes = { count: 0 };
      const delayedBucket: Pick<R2Bucket, "get" | "put"> = {
        async get(key, options) {
          const object = await bucket.get(key, options);
          if (object === null) throw new Error("missing cumulative deadline fixture");
          cancel = vi.spyOn(object.body, "cancel");
          secondStage.resolve();
          await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 2_401));
          return object;
        },
        async put(key, body, options) {
          writes.count += 1;
          return bucket.put(key, body, options);
        },
      };
      vi.useFakeTimers();
      try {
        const startedAt = performance.now();
        const pending = new ExecutorReceiptStore(
          delayFirstJobRead(db, 2_600, firstStage),
          delayedBucket,
        ).recover(value.jobId, 0);
        const assertion = expectStoreError(pending, "unavailable");
        await firstStage.promise;
        await vi.advanceTimersByTimeAsync(2_600);
        await secondStage.promise;
        await vi.advanceTimersByTimeAsync(2_401);
        await assertion;
        expect(performance.now() - startedAt).toBe(5_001);
        await Promise.resolve();
        await Promise.resolve();
        expect(cancel).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
        expect(writes.count).toBe(0);
        expect(db.database.prepare(`SELECT * FROM research_executor_results
          WHERE job_id=?1`).get(value.jobId)).toEqual(resultBefore);
        expect(await new ExecutorReceiptStore(db, bucket).recover(value.jobId, 0)).toEqual(saved);
      } finally {
        vi.useRealTimers();
      }
    } finally {
      cancel?.mockRestore();
      db.close();
    }
  });

  it("bounds a late R2 body, cancels it, and starts no fixation after timeout", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const receipt = await receiptFor(value);
      const key = await privateKey(value);
      await bucket.put(key, encodeBridgeProviderReceipt(receipt));
      const actual = await bucket.get(key);
      if (actual === null) throw new Error("missing fixture");
      const entered = deferred();
      const release = deferred();
      const cancel = vi.spyOn(actual.body, "cancel");
      const delayed: Pick<R2Bucket, "get" | "put"> = {
        async get() {
          entered.resolve();
          await release.promise;
          return actual;
        },
        put: bucket.put.bind(bucket),
      };
      vi.useFakeTimers();
      try {
        const pending = new ExecutorReceiptStore(db, delayed).recover(value.jobId, BASE_TIME + 30);
        const assertion = expectStoreError(pending, "unavailable");
        for (let index = 0; index < 20; index += 1) await Promise.resolve();
        await entered.promise;
        await vi.advanceTimersByTimeAsync(5_001);
        await assertion;
        expect(vi.getTimerCount()).toBe(0);
        release.resolve();
        await Promise.resolve();
        await Promise.resolve();
        expect(cancel).toHaveBeenCalledOnce();
        expect(db.database.prepare("SELECT count(*) AS n FROM research_executor_results").get())
          .toEqual({ n: 0 });
      } finally {
        vi.useRealTimers();
        cancel.mockRestore();
      }
    } finally {
      db.close();
    }
  });

  it("treats a timed-out in-flight put as unknown and later recovers its actual committed body", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const receipt = await receiptFor(value);
      const committed = deferred();
      const release = deferred();
      const delayed: Pick<R2Bucket, "get" | "put"> = {
        get: bucket.get.bind(bucket),
        async put(key, valueToStore, options) {
          const result = await bucket.put(key, valueToStore, options);
          committed.resolve();
          await release.promise;
          return result;
        },
      };
      vi.useFakeTimers();
      try {
        const pending = new ExecutorReceiptStore(db, delayed).save(receipt, BASE_TIME + 30);
        const assertion = expectStoreError(pending, "unavailable");
        await committed.promise;
        await vi.advanceTimersByTimeAsync(5_001);
        await assertion;
        expect(vi.getTimerCount()).toBe(0);
        release.resolve();
        await Promise.resolve();
      } finally {
        vi.useRealTimers();
      }
      expect(db.database.prepare("SELECT count(*) AS n FROM research_executor_results").get())
        .toEqual({ n: 0 });
      expect(await new ExecutorReceiptStore(db, bucket).recover(value.jobId, BASE_TIME + 31))
        .toMatchObject({ fixedAt: BASE_TIME + 31, bodyState: "available", receipt });
    } finally {
      db.close();
    }
  });

  it("enforces the intrinsic stream cap even when object metadata claims a small body", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const key = await privateKey(value);
      await bucket.put(key, new Uint8Array(BRIDGE_BODY_LIMITS.result + 1).fill(0x20));
      const actual = await bucket.get(key);
      if (actual === null) throw new Error("missing fixture");
      const lying = Object.create(actual) as R2ObjectBody;
      Object.defineProperty(lying, "size", { configurable: true, value: 1 });
      const wrapper: Pick<R2Bucket, "get" | "put"> = {
        get: async () => lying,
        put: bucket.put.bind(bucket),
      };
      await expectStoreError(
        new ExecutorReceiptStore(db, wrapper).recover(value.jobId, BASE_TIME),
        "unavailable",
      );
      expect(db.database.prepare("SELECT count(*) AS n FROM research_executor_results").get())
        .toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });

  it("bounds a stream that trickles one chunk and never completes", async () => {
    const db = createExecutorDb();
    const bucket = await createBucket();
    try {
      const value = job();
      await claim(db, value);
      const actual = await bucket.put(await privateKey(value), "fixture");
      if (actual === null) throw new Error("missing fixture");
      let cancelled = 0;
      const stalled = deferred();
      const body = new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new Uint8Array([0x7b])); },
        pull() { stalled.resolve(); },
        cancel() { cancelled += 1; },
      });
      const object = Object.create(actual) as R2ObjectBody;
      Object.defineProperty(object, "body", { configurable: true, value: body });
      const wrapper: Pick<R2Bucket, "get" | "put"> = {
        get: async () => object,
        put: bucket.put.bind(bucket),
      };
      vi.useFakeTimers();
      try {
        const pending = new ExecutorReceiptStore(db, wrapper).recover(value.jobId, BASE_TIME);
        const assertion = expectStoreError(pending, "unavailable");
        await stalled.promise;
        await vi.advanceTimersByTimeAsync(5_001);
        await assertion;
        await Promise.resolve();
        await Promise.resolve();
        expect(vi.getTimerCount()).toBe(0);
        expect(cancelled).toBe(1);
      } finally {
        vi.useRealTimers();
      }
      expect(db.database.prepare("SELECT count(*) AS n FROM research_executor_results").get())
        .toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });

  it("persists SQLite metadata and real R2 bodies across disposal and reopen", async () => {
    const directory = mkdtempSync(join(tmpdir(), "arc-v8-task8-"));
    const sqlitePath = join(directory, "results.sqlite");
    const r2Path = join(directory, "r2");
    mkdirSync(r2Path);
    const options = {
      modules: true as const,
      script: "export default { fetch() { return new Response('ok') } }",
      compatibilityDate: "2026-05-15",
      cf: false as const,
      r2Buckets: ["RECEIPTS"],
      r2Persist: r2Path,
    };
    let db: SqliteD1 | undefined;
    let mf: Miniflare | undefined;
    try {
      db = createExecutorDb(sqlitePath);
      mf = new Miniflare(options);
      let bucket = asWorkerR2Bucket(await mf.getR2Bucket("RECEIPTS"));
      await bucket.put("task8-initialization-check", "ok");
      await bucket.delete("task8-initialization-check");
      const value = job();
      await claim(db, value);
      const receipt = await receiptFor(value);
      const saved = await new ExecutorReceiptStore(db, bucket).save(receipt, BASE_TIME + 30);
      db.close();
      db = undefined;
      await mf.dispose();
      mf = undefined;

      db = new SqliteD1(sqlitePath);
      mf = new Miniflare(options);
      bucket = asWorkerR2Bucket(await mf.getR2Bucket("RECEIPTS"));
      const recovered = await new ExecutorReceiptStore(db, bucket).recover(value.jobId, 0);
      expect(recovered).toEqual(saved);
      expect(await (await bucket.get(await privateKey(value)))?.text())
        .toBe(new TextDecoder().decode(encodeBridgeProviderReceipt(receipt)));
      const reopenedStore = new ExecutorReceiptStore(db, bucket);
      await reopenedStore.acknowledge(value.jobId, saved.metadata.receiptHash, BASE_TIME + 40);
      const cleaned = await reopenedStore.cleanup(value.jobId, BASE_TIME + 41);
      db.close();
      db = undefined;
      await mf.dispose();
      mf = undefined;

      db = new SqliteD1(sqlitePath);
      mf = new Miniflare(options);
      bucket = asWorkerR2Bucket(await mf.getR2Bucket("RECEIPTS"));
      expect(await new ExecutorReceiptStore(db, bucket).recover(value.jobId, 0)).toEqual(cleaned);
      expect(await (await bucket.get(await privateKey(value)))?.text()).toBe(canonicalJson({
        format: "arc-research-receipt-tombstone-v1",
        metadata: saved.metadata,
        removedAt: BASE_TIME + 41,
      }));
    } finally {
      try {
        db?.close();
      } finally {
        try {
          await mf?.dispose();
        } finally {
          removeExactTree(directory);
        }
      }
    }
  });
});
