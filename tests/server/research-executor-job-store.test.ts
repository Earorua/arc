// @vitest-environment node

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../app/lib/planning/fingerprint";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../../app/server/research/execution-policy";
import { BRIDGE_AUTH_PROTOCOL } from "../../app/server/research/executor/auth";
import {
  parseBridgeBeginGrant,
  type BridgeBeginGrant,
} from "../../app/server/research/executor/begin";
import {
  BRIDGE_EXECUTOR_MODE,
  BRIDGE_QUEUE_TTL_MS,
  hashBridgeJob,
  parseBridgeJob,
  type BridgeJob,
} from "../../app/server/research/executor/job";
import {
  BridgeJobStoreError,
  D1BridgeJobStore,
} from "../../worker/research-executor/d1-job-store";
import { SqliteD1 } from "../helpers/sqlite-d1";

const BASE_TIME = 1_800_000_000_000;
const JOB_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_JOB_ID = "22222222-2222-4222-8222-222222222222";
const EVIDENCE_ROOT = resolve(process.cwd(), "outputs/local-durable-executor-20260914");
const NONCE_MIGRATION = resolve(process.cwd(), "worker/research-executor/migrations/0000_research_bridge_nonces.sql");
const JOB_MIGRATION = resolve(process.cwd(), "worker/research-executor/migrations/0001_research_executor_jobs.sql");
const SITE_NONCE_MIGRATION = resolve(process.cwd(), "drizzle/0007_research_bridge_nonces.sql");
const PRIOR_NONCE_HASH = "0a2c53031dafa8290fa95a5444de91cd589d9b8e6475da86e86472102bba8908";

function migration(path: string): string {
  return readFileSync(path, "utf8").replaceAll("--> statement-breakpoint", ";");
}

function createExecutorDb(filename = ":memory:"): SqliteD1 {
  const db = new SqliteD1(filename);
  db.database.exec(migration(NONCE_MIGRATION));
  db.database.exec(migration(JOB_MIGRATION));
  return db;
}

function rawJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
  };
}

function job(overrides: Record<string, unknown> = {}): BridgeJob {
  return parseBridgeJob(rawJob(overrides));
}

async function grantFor(
  value: BridgeJob,
  overrides: Record<string, unknown> = {},
): Promise<BridgeBeginGrant> {
  const beganAt = value.createdAt + 10;
  return parseBridgeBeginGrant({
    protocol: BRIDGE_AUTH_PROTOCOL,
    jobId: value.jobId,
    requestHash: await hashBridgeJob(value),
    beganAt,
    executionExpiresAt: beganAt + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
    ...overrides,
  });
}

async function expectStoreError(
  work: Promise<unknown>,
  code: BridgeJobStoreError["code"],
): Promise<BridgeJobStoreError> {
  const error = await work.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(BridgeJobStoreError);
  expect(error).toMatchObject({
    code,
    name: "BridgeJobStoreError",
    message: `Research bridge job store failure: ${code}`,
  });
  expect((error as Error).message).not.toMatch(/SELECT|INSERT|UPDATE|synthetic-private/iu);
  return error as BridgeJobStoreError;
}

function rawStored(db: SqliteD1, jobId = JOB_ID): Record<string, unknown> | undefined {
  return db.database.prepare(`SELECT job_id,request_hash,job_json,accepted_at,
    workflow_accepted_at,grant_json,dispatch_state,dispatch_at
    FROM research_executor_jobs WHERE job_id = ?1`).get(jobId) as Record<string, unknown> | undefined;
}

function removeCreatedDatabase(directory: string, filename: string): void {
  const resolvedDirectory = resolve(directory);
  const resolvedFile = resolve(filename);
  if (!resolvedDirectory.startsWith(`${EVIDENCE_ROOT}${sep}`)
    || !resolvedFile.startsWith(`${resolvedDirectory}${sep}`)) {
    throw new Error("Refusing to clean a database outside Task 7 evidence");
  }
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const target = `${resolvedFile}${suffix}`;
    if (existsSync(target)) rmSync(target);
  }
}

function throwAfterCommittedRun(db: SqliteD1, sqlFragment: string): Pick<D1Database, "prepare"> {
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

function abnormalMutationDb(result: unknown): Pick<D1Database, "prepare"> {
  return {
    prepare() {
      return {
        bind() {
          return { run: async () => result } as D1PreparedStatement;
        },
      } as D1PreparedStatement;
    },
  };
}

function wrapActualFirstResult(
  db: SqliteD1,
  transform: (row: unknown) => unknown,
  reads: { count: number },
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
              reads.count += 1;
              return transform(actual) as T | null;
            },
          } as D1PreparedStatement;
        },
      } as D1PreparedStatement;
    },
  };
}

describe("D1 bridge job store immutable identity", () => {
  it("accepts a canonical owned snapshot and exactly replays its original state", async () => {
    const db = createExecutorDb();
    try {
      const source = rawJob({ role: "  Ｆrontend   Engineer  " });
      const pending = new D1BridgeJobStore(db).accept(source, BASE_TIME + 5);
      source.role = "mutated";
      source.requestId = "mutated";
      const accepted = await pending;
      expect(accepted).toEqual({
        job: job(),
        requestHash: createHash("sha256").update(canonicalJson(job()), "utf8").digest("hex"),
        acceptedAt: BASE_TIME + 5,
        workflowAcceptedAt: null,
        grant: null,
        dispatchState: "unclaimed",
        dispatchAt: null,
      });
      expect(Object.isFrozen(accepted)).toBe(true);
      expect(Object.isFrozen(accepted.job)).toBe(true);

      const replay = await new D1BridgeJobStore(db).accept(job(), BASE_TIME + 99);
      expect(replay).toEqual(accepted);
      expect(replay.acceptedAt).toBe(BASE_TIME + 5);
      expect(rawStored(db)?.job_json).toBe(canonicalJson(job()));
    } finally {
      db.close();
    }
  });

  it.each([
    ["workflow acknowledgement and grant", "unclaimed", true],
    ["claimed dispatch", "claimed", true],
    ["closed dispatch with grant", "closed", true],
    ["closed dispatch without grant", "closed", false],
  ] as const)("replays the complete immutable state after %s", async (_label, state, withGrant) => {
    const db = createExecutorDb();
    try {
      const value = job();
      const grant = await grantFor(value);
      const store = new D1BridgeJobStore(db);
      await store.accept(value, BASE_TIME + 5);
      await store.recordWorkflowAccepted(value, value.jobId, BASE_TIME + 6);
      if (withGrant) await store.recordBegin(value, grant);
      if (state === "claimed") await store.claimDispatch(value, grant, BASE_TIME + 7);
      if (state === "closed") await store.closeUnclaimed(value, BASE_TIME + 8);

      const beforeReplay = await store.get(value.jobId) as NonNullable<Awaited<ReturnType<typeof store.get>>>;
      const replay = await new D1BridgeJobStore(db).accept(value, BASE_TIME + 999);
      expect(replay).toEqual(beforeReplay);
      expect(replay).toMatchObject({
        acceptedAt: BASE_TIME + 5,
        workflowAcceptedAt: BASE_TIME + 6,
        grant: withGrant ? grant : null,
        dispatchState: state,
        dispatchAt: state === "unclaimed" ? null : state === "claimed" ? BASE_TIME + 7 : BASE_TIME + 8,
      });

      if (state !== "unclaimed" && withGrant) {
        await expect(store.claimDispatch(value, grant, 0)).resolves.toBe(false);
      }
      if (state === "closed" && !withGrant) {
        await expectStoreError(store.recordBegin(value, grant), "conflict");
        expect((await store.get(value.jobId))?.dispatchState).toBe("closed");
      }
    } finally {
      db.close();
    }
  });

  it.each([
    ["runId", { runId: "research-run-2" }],
    ["requestId", { requestId: "request-2" }],
    ["inputFingerprint", { inputFingerprint: `p2-${"3".repeat(32)}` }],
    ["configFingerprint", { configFingerprint: `p2-${"4".repeat(32)}` }],
    ["role", { role: "Backend Engineer" }],
    ["locale", { locale: "zh-CN" }],
    ["time pair", { createdAt: BASE_TIME + 1, queueExpiresAt: BASE_TIME + BRIDGE_QUEUE_TTL_MS + 1 }],
  ])("conflicts when the same id changes the %s identity", async (_label, change) => {
    const db = createExecutorDb();
    try {
      const store = new D1BridgeJobStore(db);
      await store.accept(job(), BASE_TIME);
      await expectStoreError(store.accept(job(change), BASE_TIME + 1), "conflict");
      expect(rawStored(db)?.job_json).toBe(canonicalJson(job()));
    } finally {
      db.close();
    }
  });

  it("keeps distinct job ids independent", async () => {
    const db = createExecutorDb();
    try {
      const store = new D1BridgeJobStore(db);
      await store.accept(job(), BASE_TIME);
      await store.accept(job({ jobId: OTHER_JOB_ID, requestId: "request-2" }), BASE_TIME + 1);
      expect(db.database.prepare("SELECT count(*) AS n FROM research_executor_jobs").get()).toEqual({ n: 2 });
    } finally {
      db.close();
    }
  });

  it.each([
    "00000000-0000-0000-0000-000000000000",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
  ])("preserves the existing job codec UUID boundary: %s", async (jobId) => {
    const db = createExecutorDb();
    try {
      const store = new D1BridgeJobStore(db);
      const value = job({ jobId });
      await expect(store.accept(value, BASE_TIME)).resolves.toMatchObject({ job: value });
      await expect(store.get(jobId)).resolves.toMatchObject({ job: value });
      await expect(store.recordWorkflowAccepted(value, jobId, BASE_TIME + 1)).resolves.toMatchObject({
        workflowAcceptedAt: BASE_TIME + 1,
      });
    } finally {
      db.close();
    }
  });

  it("returns null only for a valid missing id and rejects invalid scalar input before SQL", async () => {
    const db = createExecutorDb();
    try {
      const store = new D1BridgeJobStore(db);
      await expect(store.get(JOB_ID)).resolves.toBeNull();
      const before = db.preparedSql.length;
      await expectStoreError(store.get("bad-id"), "invalid-message");
      await expectStoreError(store.get(`${JOB_ID}\n`), "invalid-message");
      await expectStoreError(store.accept(job(), -1), "invalid-message");
      await expectStoreError(store.recordWorkflowAccepted(job(), "bad-id", BASE_TIME), "invalid-message");
      await expectStoreError(store.recordWorkflowAccepted(job(), `${JOB_ID}\n`, BASE_TIME), "invalid-message");
      await expectStoreError(store.claimDispatch(job(), await grantFor(job()), 0.5), "invalid-message");
      await expectStoreError(store.closeUnclaimed(job(), Number.MAX_SAFE_INTEGER + 1), "invalid-message");
      expect(db.preparedSql).toHaveLength(before);
    } finally {
      db.close();
    }
  });

  it("returns deeply owned frozen values from get", async () => {
    const db = createExecutorDb();
    try {
      const store = new D1BridgeJobStore(db);
      const value = await store.accept(job(), BASE_TIME);
      const read = await store.get(JOB_ID);
      expect(read).toEqual(value);
      expect(Object.isFrozen(read)).toBe(true);
      expect(Object.isFrozen(read!.job)).toBe(true);
    } finally {
      db.close();
    }
  });

  it("snapshots a grant before the caller can mutate it and never invokes input accessors", async () => {
    const db = createExecutorDb();
    try {
      const store = new D1BridgeJobStore(db);
      const value = job();
      await store.accept(value, BASE_TIME);
      const original = await grantFor(value);
      const mutable = { ...original };
      const pending = store.recordBegin(value, mutable);
      mutable.jobId = OTHER_JOB_ID;
      mutable.requestHash = "0".repeat(64);
      expect((await pending).grant).toEqual(original);

      let accesses = 0;
      const accessorJob = rawJob();
      delete accessorJob.role;
      Object.defineProperty(accessorJob, "role", {
        enumerable: true,
        get() { accesses += 1; return "synthetic-private"; },
      });
      const before = db.preparedSql.length;
      await expectStoreError(store.accept(accessorJob, BASE_TIME), "invalid-message");
      expect(accesses).toBe(0);
      expect(db.preparedSql).toHaveLength(before);
    } finally {
      db.close();
    }
  });

  it.each([
    ["noncanonical job JSON", (db: SqliteD1) => db.database.prepare("UPDATE research_executor_jobs SET job_json=?1 WHERE job_id=?2").run(JSON.stringify(job(), null, 1), JOB_ID)],
    ["mismatched hash", (db: SqliteD1) => db.database.prepare("UPDATE research_executor_jobs SET request_hash=?1 WHERE job_id=?2").run("0".repeat(64), JOB_ID)],
    ["mismatched parsed id", (db: SqliteD1) => db.database.prepare("UPDATE research_executor_jobs SET job_json=?1 WHERE job_id=?2").run(canonicalJson(job({ jobId: OTHER_JOB_ID })), JOB_ID)],
    ["invalid JSON", (db: SqliteD1) => {
      db.database.exec("PRAGMA ignore_check_constraints=ON");
      db.database.prepare("UPDATE research_executor_jobs SET job_json=?1 WHERE job_id=?2").run("{synthetic-private", JOB_ID);
      db.database.exec("PRAGMA ignore_check_constraints=OFF");
    }],
  ])("fails closed for a corrupt row: %s", async (_label, corrupt) => {
    const db = createExecutorDb();
    try {
      const store = new D1BridgeJobStore(db);
      await store.accept(job(), BASE_TIME);
      corrupt(db);
      await expectStoreError(store.get(JOB_ID), "unavailable");
    } finally {
      db.close();
    }
  });

  it.each([
    ["missing selected column", (row: unknown) => {
      const changed = { ...(row as Record<string, unknown>) };
      delete changed.dispatch_at;
      return changed;
    }],
    ["extra selected column", (row: unknown) => ({
      ...(row as Record<string, unknown>),
      unexpected: "synthetic-private-caller-text",
    })],
    ["string accepted time", (row: unknown) => ({
      ...(row as Record<string, unknown>),
      accepted_at: "0",
    })],
    ["numeric request hash", (row: unknown) => ({
      ...(row as Record<string, unknown>),
      request_hash: 0,
    })],
    ["unclaimed with dispatch timestamp", (row: unknown) => ({
      ...(row as Record<string, unknown>),
      dispatch_at: 1,
    })],
    ["claimed without grant", (row: unknown) => ({
      ...(row as Record<string, unknown>),
      dispatch_state: "claimed",
      dispatch_at: 1,
      grant_json: null,
    })],
    ["closed without dispatch timestamp", (row: unknown) => ({
      ...(row as Record<string, unknown>),
      dispatch_state: "closed",
      dispatch_at: null,
    })],
  ] as const)("fails closed for a malformed actual first result: %s", async (_label, transform) => {
    const db = createExecutorDb();
    try {
      await new D1BridgeJobStore(db).accept(job(), BASE_TIME);
      const reads = { count: 0 };
      const wrapped = wrapActualFirstResult(db, transform, reads);
      await expectStoreError(new D1BridgeJobStore(wrapped).get(JOB_ID), "unavailable");
      expect(reads.count).toBe(1);
    } finally {
      db.close();
    }
  });

  it("rejects an accessor in an actual first result without invoking it", async () => {
    const db = createExecutorDb();
    try {
      await new D1BridgeJobStore(db).accept(job(), BASE_TIME);
      let accesses = 0;
      const reads = { count: 0 };
      const wrapped = wrapActualFirstResult(db, (row) => {
        const changed = { ...(row as Record<string, unknown>) };
        Object.defineProperty(changed, "dispatch_state", {
          enumerable: true,
          get() {
            accesses += 1;
            return "synthetic-private-caller-text";
          },
        });
        return changed;
      }, reads);
      await expectStoreError(new D1BridgeJobStore(wrapped).get(JOB_ID), "unavailable");
      expect(reads.count).toBe(1);
      expect(accesses).toBe(0);
    } finally {
      db.close();
    }
  });

  it.each([
    ["noncanonical grant JSON", async (value: BridgeJob) => JSON.stringify(await grantFor(value), null, 1)],
    ["grant with a different hash", async (value: BridgeJob) => canonicalJson(await grantFor(value, { requestHash: "0".repeat(64) }))],
    ["grant before the Site queue", async (value: BridgeJob) => canonicalJson(await grantFor(value, {
      beganAt: value.createdAt - 1,
      executionExpiresAt: value.createdAt - 1 + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
    }))],
  ])("fails closed for a corrupt persisted grant relationship: %s", async (_label, corruptGrant) => {
    const db = createExecutorDb();
    try {
      const store = new D1BridgeJobStore(db);
      const value = job();
      await store.accept(value, BASE_TIME);
      const storedGrant = await corruptGrant(value);
      db.database.prepare("UPDATE research_executor_jobs SET grant_json=?1 WHERE job_id=?2").run(storedGrant, JOB_ID);
      await expectStoreError(store.get(JOB_ID), "unavailable");
    } finally {
      db.close();
    }
  });

  it("fails closed for database errors and abnormal D1 mutation metadata", async () => {
    const markerDb = { prepare() { throw new Error("synthetic-private-database-detail"); } };
    await expectStoreError(new D1BridgeJobStore(markerDb).get(JOB_ID), "unavailable");
    for (const result of [
      { success: false, meta: { changes: 1 } },
      { success: true, meta: {} },
      { success: true, meta: { changes: -1 } },
      { success: true, meta: { changes: 2 } },
    ]) {
      await expectStoreError(new D1BridgeJobStore(abnormalMutationDb(result)).accept(job(), BASE_TIME), "unavailable");
    }
  });
});

describe("D1 bridge workflow acknowledgement and begin grant", () => {
  it("records only the first workflow acknowledgement and allows begin/claim before it", async () => {
    const db = createExecutorDb();
    try {
      const store = new D1BridgeJobStore(db);
      const value = job();
      const grant = await grantFor(value);
      await store.accept(value, BASE_TIME);
      await store.recordBegin(value, grant);
      await expect(store.claimDispatch(value, grant, BASE_TIME + 20)).resolves.toBe(true);
      const first = await store.recordWorkflowAccepted(value, JOB_ID, BASE_TIME + 30);
      const replay = await store.recordWorkflowAccepted(value, JOB_ID, BASE_TIME - 30);
      expect(first.workflowAcceptedAt).toBe(BASE_TIME + 30);
      expect(replay.workflowAcceptedAt).toBe(BASE_TIME + 30);
      expect(replay.dispatchState).toBe("claimed");
    } finally {
      db.close();
    }
  });

  it("rejects a valid different workflow id and reports a missing job", async () => {
    const db = createExecutorDb();
    try {
      const store = new D1BridgeJobStore(db);
      await store.accept(job(), BASE_TIME);
      await expectStoreError(store.recordWorkflowAccepted(job(), OTHER_JOB_ID, BASE_TIME), "conflict");
      await expectStoreError(store.recordWorkflowAccepted(job({ jobId: OTHER_JOB_ID }), OTHER_JOB_ID, BASE_TIME), "not-found");
    } finally {
      db.close();
    }
  });

  it("stores one immutable matching grant and replays it after claim", async () => {
    const db = createExecutorDb();
    try {
      const store = new D1BridgeJobStore(db);
      const value = job();
      const original = await grantFor(value);
      await store.accept(value, BASE_TIME);
      const began = await store.recordBegin(value, original);
      expect(began.grant).toEqual(original);
      expect(Object.isFrozen(began.grant)).toBe(true);
      await store.claimDispatch(value, original, BASE_TIME + 20);
      expect((await store.recordBegin(value, original)).grant).toEqual(original);
      const different = await grantFor(value, {
        beganAt: value.createdAt + 11,
        executionExpiresAt: value.createdAt + 11 + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
      });
      await expectStoreError(store.recordBegin(value, different), "conflict");
    } finally {
      db.close();
    }
  });

  it.each([
    ["different job", async (value: BridgeJob) => grantFor(job({
      jobId: OTHER_JOB_ID,
      requestId: `${value.requestId}-other`,
    }), { jobId: OTHER_JOB_ID })],
    ["different hash", async (value: BridgeJob) => grantFor(value, { requestHash: "0".repeat(64) })],
    ["before queue", async (value: BridgeJob) => grantFor(value, { beganAt: value.createdAt - 1, executionExpiresAt: value.createdAt - 1 + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs })],
    ["at queue expiry", async (value: BridgeJob) => grantFor(value, { beganAt: value.queueExpiresAt, executionExpiresAt: value.queueExpiresAt + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs })],
  ])("rejects a grant outside the job relationship: %s", async (_label, makeGrant) => {
    const db = createExecutorDb();
    try {
      const store = new D1BridgeJobStore(db);
      const value = job();
      await store.accept(value, BASE_TIME);
      await expectStoreError(store.recordBegin(value, await makeGrant(value)), "conflict");
      expect((await store.get(JOB_ID))?.grant).toBeNull();
    } finally {
      db.close();
    }
  });

  it("cannot attach a grant after close and does not require executor wall-clock ordering", async () => {
    const db = createExecutorDb();
    try {
      const store = new D1BridgeJobStore(db);
      const value = job();
      await store.accept(value, Number.MAX_SAFE_INTEGER);
      const closed = await store.closeUnclaimed(value, 0);
      expect(closed.dispatchState).toBe("closed");
      await expectStoreError(store.recordBegin(value, await grantFor(value)), "conflict");
    } finally {
      db.close();
    }
  });

  it("reports not-found for begin and claim without an accepted job", async () => {
    const db = createExecutorDb();
    try {
      const value = job();
      const grant = await grantFor(value);
      const store = new D1BridgeJobStore(db);
      await expectStoreError(store.recordBegin(value, grant), "not-found");
      await expectStoreError(store.claimDispatch(value, grant, BASE_TIME), "not-found");
      await expectStoreError(store.closeUnclaimed(value, BASE_TIME), "not-found");
    } finally {
      db.close();
    }
  });
});

describe("D1 bridge dispatch exclusion and durability", () => {
  it("allows exactly one of twenty claims across two store instances", async () => {
    const db = createExecutorDb();
    try {
      const value = job();
      const grant = await grantFor(value);
      const first = new D1BridgeJobStore(db);
      const second = new D1BridgeJobStore(db);
      await first.accept(value, BASE_TIME);
      await first.recordBegin(value, grant);
      const outcomes = await Promise.all(Array.from({ length: 20 }, (_, index) =>
        (index % 2 ? first : second).claimDispatch(value, grant, BASE_TIME + index)));
      expect(outcomes.filter(Boolean)).toHaveLength(1);
      expect((await first.get(JOB_ID))?.dispatchState).toBe("claimed");
    } finally {
      db.close();
    }
  });

  it("persists claim across close/reopen and two real SQLite connections", async () => {
    mkdirSync(EVIDENCE_ROOT, { recursive: true });
    const directory = mkdtempSync(join(EVIDENCE_ROOT, "task7-db-"));
    const filename = join(directory, "ledger.sqlite");
    let first: SqliteD1 | undefined;
    let second: SqliteD1 | undefined;
    let reopened: SqliteD1 | undefined;
    try {
      first = createExecutorDb(filename);
      first.database.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
      second = new SqliteD1(filename);
      second.database.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
      const value = job();
      const grant = await grantFor(value);
      await new D1BridgeJobStore(first).accept(value, BASE_TIME);
      await new D1BridgeJobStore(first).recordBegin(value, grant);
      const results = await Promise.all([
        new D1BridgeJobStore(first).claimDispatch(value, grant, BASE_TIME + 1),
        new D1BridgeJobStore(second).claimDispatch(value, grant, BASE_TIME + 2),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      first.close(); first = undefined;
      second.close(); second = undefined;
      reopened = new SqliteD1(filename);
      await expect(new D1BridgeJobStore(reopened).claimDispatch(value, grant, 0)).resolves.toBe(false);
      expect((await new D1BridgeJobStore(reopened).get(JOB_ID))?.dispatchState).toBe("claimed");
    } finally {
      first?.close();
      second?.close();
      reopened?.close();
      removeCreatedDatabase(directory, filename);
      rmdirSync(directory);
    }
  });

  it("makes concurrent close and claim permanently exclude each other", async () => {
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const db = createExecutorDb();
      try {
        const value = job();
        const grant = await grantFor(value);
        const first = new D1BridgeJobStore(db);
        const second = new D1BridgeJobStore(db);
        await first.accept(value, BASE_TIME);
        await first.recordBegin(value, grant);
        const [claimResult, closeResult] = await Promise.all([
          first.claimDispatch(value, grant, iteration),
          second.closeUnclaimed(value, Number.MAX_SAFE_INTEGER - iteration),
        ]);
        const final = await first.get(JOB_ID);
        if (final?.dispatchState === "closed") {
          expect(claimResult).toBe(false);
          expect(closeResult.dispatchState).toBe("closed");
          await expect(first.claimDispatch(value, grant, 0)).resolves.toBe(false);
        } else {
          expect(final?.dispatchState).toBe("claimed");
          expect(claimResult).toBe(true);
          expect(closeResult.dispatchState).toBe("claimed");
        }
      } finally {
        db.close();
      }
    }
  });

  it("closes before or after grant, preserves first close time, and never resets claimed", async () => {
    const db = createExecutorDb();
    try {
      const store = new D1BridgeJobStore(db);
      const firstJob = job();
      await store.accept(firstJob, BASE_TIME);
      const firstClosed = await store.closeUnclaimed(firstJob, BASE_TIME + 10);
      expect(firstClosed).toMatchObject({ dispatchState: "closed", dispatchAt: BASE_TIME + 10, grant: null });
      expect((await store.closeUnclaimed(firstJob, 0)).dispatchAt).toBe(BASE_TIME + 10);

      const secondJob = job({ jobId: OTHER_JOB_ID, requestId: "request-2" });
      const grant = await grantFor(secondJob);
      await store.accept(secondJob, BASE_TIME);
      await store.recordBegin(secondJob, grant);
      expect((await store.closeUnclaimed(secondJob, Number.MAX_SAFE_INTEGER)).dispatchState).toBe("closed");

      const thirdJob = job({ jobId: "33333333-3333-4333-8333-333333333333", requestId: "request-3" });
      const thirdGrant = await grantFor(thirdJob);
      await store.accept(thirdJob, BASE_TIME);
      await store.recordBegin(thirdJob, thirdGrant);
      await store.claimDispatch(thirdJob, thirdGrant, BASE_TIME + 50);
      expect((await store.closeUnclaimed(thirdJob, 0)).dispatchState).toBe("claimed");
      expect((await store.get(thirdJob.jobId))?.dispatchAt).toBe(BASE_TIME + 50);
    } finally {
      db.close();
    }
  });

  it("requires the exact persisted grant and never implicitly records begin", async () => {
    const db = createExecutorDb();
    try {
      const value = job();
      const grant = await grantFor(value);
      const store = new D1BridgeJobStore(db);
      await store.accept(value, BASE_TIME);
      await expectStoreError(store.claimDispatch(value, grant, BASE_TIME), "conflict");
      await store.recordBegin(value, grant);
      const other = await grantFor(value, {
        beganAt: value.createdAt + 11,
        executionExpiresAt: value.createdAt + 11 + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
      });
      await expectStoreError(store.claimDispatch(value, other, BASE_TIME), "conflict");
    } finally {
      db.close();
    }
  });
});

describe("D1 bridge lost acknowledgement handling", () => {
  it("recovers idempotently after committed insert, workflow, grant, and close writes", async () => {
    const cases = ["INSERT INTO research_executor_jobs", "workflow_accepted_at = ?1", "grant_json = ?1", "dispatch_state = 'closed'"] as const;
    for (const fragment of cases) {
      const db = createExecutorDb();
      try {
        const value = job();
        const grant = await grantFor(value);
        const normal = new D1BridgeJobStore(db);
        if (!fragment.startsWith("INSERT")) await normal.accept(value, BASE_TIME);
        if (fragment === "grant_json = ?1" || fragment === "dispatch_state = 'closed'") {
          if (fragment === "dispatch_state = 'closed'") await normal.recordBegin(value, grant);
        }
        const lossy = new D1BridgeJobStore(throwAfterCommittedRun(db, fragment));
        if (fragment.startsWith("INSERT")) {
          await expectStoreError(lossy.accept(value, BASE_TIME), "unavailable");
          expect((await normal.accept(value, BASE_TIME + 1)).acceptedAt).toBe(BASE_TIME);
        } else if (fragment === "workflow_accepted_at = ?1") {
          await expectStoreError(lossy.recordWorkflowAccepted(value, JOB_ID, BASE_TIME + 1), "unavailable");
          expect((await normal.recordWorkflowAccepted(value, JOB_ID, BASE_TIME + 2)).workflowAcceptedAt).toBe(BASE_TIME + 1);
        } else if (fragment === "grant_json = ?1") {
          await expectStoreError(lossy.recordBegin(value, grant), "unavailable");
          expect((await normal.recordBegin(value, grant)).grant).toEqual(grant);
        } else {
          await expectStoreError(lossy.closeUnclaimed(value, BASE_TIME + 3), "unavailable");
          const replay = await normal.closeUnclaimed(value, BASE_TIME + 4);
          expect(replay).toMatchObject({ dispatchState: "closed", dispatchAt: BASE_TIME + 3 });
        }
      } finally {
        db.close();
      }
    }
  });

  it("never turns a lost claim acknowledgement into a later true claim", async () => {
    const db = createExecutorDb();
    try {
      const value = job();
      const grant = await grantFor(value);
      const normal = new D1BridgeJobStore(db);
      await normal.accept(value, BASE_TIME);
      await normal.recordBegin(value, grant);
      const lossy = new D1BridgeJobStore(throwAfterCommittedRun(db, "dispatch_state = 'claimed'"));
      let providerCalls = 0;
      const dispatch = async (store: D1BridgeJobStore) => {
        if (await store.claimDispatch(value, grant, BASE_TIME + 1)) providerCalls += 1;
      };
      await expectStoreError(dispatch(lossy), "unavailable");
      expect(providerCalls).toBe(0);
      await dispatch(normal);
      await dispatch(normal);
      expect(providerCalls).toBe(0);
      expect((await normal.get(JOB_ID))?.dispatchState).toBe("claimed");
    } finally {
      db.close();
    }
  });
});

describe("executor job migration boundaries and scope", () => {
  it.each([
    ["bad id length", ["bad", "0".repeat(64), "{}", 0, null, null, "unclaimed", null]],
    ["blob id", [Buffer.from(JOB_ID), "0".repeat(64), "{}", 0, null, null, "unclaimed", null]],
    ["uppercase hash", [JOB_ID, "A".repeat(64), "{}", 0, null, null, "unclaimed", null]],
    ["blob hash", [JOB_ID, Buffer.from("0".repeat(64)), "{}", 0, null, null, "unclaimed", null]],
    ["invalid job JSON", [JOB_ID, "0".repeat(64), "x", 0, null, null, "unclaimed", null]],
    ["array job JSON", [JOB_ID, "0".repeat(64), "[]", 0, null, null, "unclaimed", null]],
    ["oversized job JSON", [JOB_ID, "0".repeat(64), JSON.stringify({ value: "x".repeat(4096) }), 0, null, null, "unclaimed", null]],
    ["negative accepted time", [JOB_ID, "0".repeat(64), "{}", -1, null, null, "unclaimed", null]],
    ["fractional accepted time", [JOB_ID, "0".repeat(64), "{}", 0.5, null, null, "unclaimed", null]],
    ["unsafe accepted time", [JOB_ID, "0".repeat(64), "{}", Number.MAX_SAFE_INTEGER + 1, null, null, "unclaimed", null]],
    ["fractional workflow time", [JOB_ID, "0".repeat(64), "{}", 0, 0.5, null, "unclaimed", null]],
    ["unsafe workflow time", [JOB_ID, "0".repeat(64), "{}", 0, Number.MAX_SAFE_INTEGER + 1, null, "unclaimed", null]],
    ["invalid grant JSON", [JOB_ID, "0".repeat(64), "{}", 0, null, "[]", "unclaimed", null]],
    ["oversized grant JSON", [JOB_ID, "0".repeat(64), "{}", 0, null, JSON.stringify({ value: "x".repeat(4096) }), "closed", 0]],
    ["unknown state", [JOB_ID, "0".repeat(64), "{}", 0, null, null, "retry", null]],
    ["unclaimed timestamp", [JOB_ID, "0".repeat(64), "{}", 0, null, null, "unclaimed", 0]],
    ["claimed without grant", [JOB_ID, "0".repeat(64), "{}", 0, null, null, "claimed", 0]],
    ["fractional dispatch time", [JOB_ID, "0".repeat(64), "{}", 0, null, null, "closed", 0.5]],
    ["negative dispatch time", [JOB_ID, "0".repeat(64), "{}", 0, null, null, "closed", -1]],
    ["unsafe dispatch time", [JOB_ID, "0".repeat(64), "{}", 0, null, null, "closed", Number.MAX_SAFE_INTEGER + 1]],
    ["closed without timestamp", [JOB_ID, "0".repeat(64), "{}", 0, null, null, "closed", null]],
  ])("rejects direct SQL constraint violation: %s", (_label, values) => {
    const db = createExecutorDb();
    try {
      expect(() => db.database.prepare(`INSERT INTO research_executor_jobs
        (job_id,request_hash,job_json,accepted_at,workflow_accepted_at,grant_json,dispatch_state,dispatch_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`).run(...values as never[])).toThrow();
      expect(db.database.prepare("SELECT count(*) AS n FROM research_executor_jobs").get()).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });

  it("preserves nonce migration bytes and creates only the two executor tables", () => {
    expect(createHash("sha256").update(readFileSync(NONCE_MIGRATION)).digest("hex")).toBe(PRIOR_NONCE_HASH);
    expect(createHash("sha256").update(readFileSync(SITE_NONCE_MIGRATION)).digest("hex")).toBe(PRIOR_NONCE_HASH);
    const db = createExecutorDb();
    try {
      expect(db.database.prepare(`SELECT name FROM sqlite_master WHERE type='table'
        AND name NOT LIKE 'sqlite_%' ORDER BY name`).all()).toEqual([
        { name: "research_bridge_nonces" },
        { name: "research_executor_jobs" },
      ]);
      const source = readFileSync(resolve(process.cwd(), "worker/research-executor/d1-job-store.ts"), "utf8");
      expect(source).not.toMatch(/CREATE\s+TABLE|DELETE\s+FROM|openrouter-provider|from\s+["'][^"']*provider["']/iu);
    } finally {
      db.close();
    }
  });
});
