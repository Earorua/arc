// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { D1SiteBeginRepository } from "../../app/server/research/d1-site-begin-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { ResearchRepositoryError } from "../../app/server/research/repository";
import type { SiteExecutionIdentity } from "../../app/server/research/site-execution-repository";
import { createControlPoint, createSiteAdmissionFixture } from "../helpers/site-admission-fixture";
import { SqliteD1 } from "../helpers/sqlite-d1";

const SQL_NOW = Date.parse("2026-09-16T00:01:00.000Z");
const START_NOW = Date.parse("2026-09-16T00:00:00.000Z");

function identity(value: SiteExecutionIdentity): SiteExecutionIdentity {
  return {
    ownerId: value.ownerId,
    runId: value.runId,
    requestId: value.requestId,
    jobId: value.jobId,
    requestHash: value.requestHash,
  };
}

async function expectCode(operation: () => Promise<unknown>, code: ResearchRepositoryError["code"]) {
  await expect(operation()).rejects.toMatchObject({ name: "ResearchRepositoryError", code });
}

describe("D1SiteBeginRepository", () => {
  const opened: ReturnType<typeof createSiteAdmissionFixture>[] = [];
  const reopened = new Set<SqliteD1>();
  const dirs = new Set<string>();
  const fixture = (filename = ":memory:") => {
    const value = createSiteAdmissionFixture(filename);
    value.setAppNow(START_NOW);
    value.setSqlNow(START_NOW);
    opened.push(value);
    return value;
  };
  afterEach(() => {
    for (const value of opened.splice(0)) value.db.database.close();
    for (const value of reopened) value.close();
    reopened.clear();
    for (const dir of dirs) {
      const target = resolve(dir);
      if (!target.startsWith(`${resolve(tmpdir())}${sep}`) || !basename(target).startsWith("site-begin-")) {
        throw new Error("Refusing to remove an unexpected fixture directory");
      }
      rmSync(target, { recursive: true, force: true });
    }
    dirs.clear();
  });

  const admitted = async (f: ReturnType<typeof fixture>) => {
    const created = await f.createRemote();
    const reservations = await f.reserveAdmission(created.execution);
    const execution = await f.executions.markAdmitted(f.admissionCommand(created.execution, reservations));
    return { ...created, execution, reservations };
  };

  const durableState = (f: ReturnType<typeof fixture>, runId: string) => ({
    run: f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1").get(runId),
    execution: f.db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?1").get(runId),
    quota: f.db.database.prepare("SELECT * FROM quota_ledger ORDER BY id").all(),
    reservations: f.db.database.prepare("SELECT * FROM ai_budget_reservations ORDER BY id").all(),
    buckets: f.db.database.prepare("SELECT * FROM ai_budget_buckets ORDER BY id").all(),
  });

  const pauseBeforeBatch = async (
    f: ReturnType<typeof fixture>,
    command: SiteExecutionIdentity & Readonly<{ newExecutionAllowed: boolean }>,
  ) => {
    const point = createControlPoint();
    const realBatch = f.db.batch.bind(f.db);
    let batchCalls = 0;
    const db = {
      prepare: f.db.prepare.bind(f.db),
      batch: async (statements: D1PreparedStatement[]) => {
        batchCalls += 1;
        await point.wait();
        return realBatch(statements);
      },
    } as unknown as D1Database;
    const repository = new D1SiteBeginRepository(db, f.research, f.executions);
    const pending = repository.begin(command);
    await point.entered;
    return { point, pending, batchCalls: () => batchCalls };
  };

  it("atomically begins an admitted remote execution with the SQL clock deadline", async () => {
    const f = fixture();
    const created = await admitted(f);
    f.setSqlNow(SQL_NOW);

    const reply = await f.begin.begin({ ...identity(created.execution), newExecutionAllowed: true });

    expect(reply).toEqual({
      grant: {
        protocol: created.execution.job.protocol,
        jobId: created.execution.jobId,
        requestHash: created.execution.requestHash,
        beganAt: SQL_NOW,
        executionExpiresAt: SQL_NOW + 1_260_000,
      },
      observedAt: SQL_NOW,
      remainingMs: 1_260_000,
    });
    const run = await f.research.getRun(created.execution.ownerId, created.execution.runId);
    const execution = await f.executions.read(created.execution.ownerId, created.execution.runId);
    expect(run).toMatchObject({ state: "researching", activeExpiresAt: SQL_NOW + 1_260_000 });
    expect(execution).toMatchObject({
      beganAt: SQL_NOW,
      executionExpiresAt: SQL_NOW + 1_260_000,
      admissionState: "admitted",
      jobId: created.execution.jobId,
      requestHash: created.execution.requestHash,
    });
  });

  it("denies a new grant when the trusted server gate is false without writing", async () => {
    const f = fixture();
    const created = await admitted(f);
    const before = f.readCounts();
    const batchesBefore = f.db.batches.length;
    await expectCode(
      () => f.begin.begin({ ...identity(created.execution), newExecutionAllowed: false }),
      "CONFLICT",
    );
    expect(f.db.batches).toHaveLength(batchesBefore);
    expect(f.readCounts()).toEqual(before);
    expect(await f.executions.read(created.execution.ownerId, created.execution.runId))
      .toMatchObject({ beganAt: null, executionExpiresAt: null, version: created.execution.version });
  });

  it("rejects pending, closed, terminal, and synchronous runs", async () => {
    const pending = fixture();
    const pendingCreated = await pending.createRemote();
    await expectCode(
      () => pending.begin.begin({ ...identity(pendingCreated.execution), newExecutionAllowed: true }),
      "CONFLICT",
    );

    const closed = fixture();
    const closedCreated = await admitted(closed);
    await closed.executions.closeBeforeBegin(closed.closeCommand(closedCreated.execution));
    await expectCode(
      () => closed.begin.begin({ ...identity(closedCreated.execution), newExecutionAllowed: true }),
      "CONFLICT",
    );

    const terminal = fixture();
    const terminalCreated = await admitted(terminal);
    terminal.db.database.prepare(
      "UPDATE research_runs SET state='failed',active_slot=NULL,active_expires_at=NULL,retryable=1,error_code='interrupted',public_failure_category='timeout' WHERE id=?1",
    ).run(terminalCreated.execution.runId);
    await expectCode(
      () => terminal.begin.begin({ ...identity(terminalCreated.execution), newExecutionAllowed: true }),
      "CONFLICT",
    );

    const synchronous = fixture();
    const sync = await synchronous.research.createOrReplay(synchronous.command());
    await expectCode(() => synchronous.begin.begin({
      ownerId: sync.run.ownerId,
      runId: sync.run.id,
      requestId: sync.run.requestId,
      jobId: "00000000-0000-4000-8000-000000000099",
      requestHash: "a".repeat(64),
      newExecutionAllowed: true,
    }), "CONFLICT");
  });

  it("distinguishes missing ownership from wrong request, job, and hash identities without writes or retries", async () => {
    const f = fixture();
    const created = await admitted(f);
    const batchesBefore = f.db.batches.length;
    const before = durableState(f, created.execution.runId);
    let reads = 0;
    const countingRuns = {
      getRun: async (ownerId: string, runId: string) => {
        reads += 1;
        return f.research.getRun(ownerId, runId);
      },
    };
    const repository = new D1SiteBeginRepository(
      f.db as unknown as D1Database,
      countingRuns,
      f.executions,
    );
    await expectCode(() => repository.begin({
      ...identity(created.execution), ownerId: "owner-b", newExecutionAllowed: true,
    }), "NOT_FOUND");
    expect(reads).toBe(1);
    for (const changed of [
      { requestId: "wrong-request" },
      { jobId: "00000000-0000-4000-8000-000000000099" },
      { requestHash: "f".repeat(64) },
    ]) {
      reads = 0;
      await expectCode(() => repository.begin({
        ...identity(created.execution), ...changed, newExecutionAllowed: true,
      }), "CONFLICT");
      expect(reads).toBe(1);
    }
    expect(f.db.batches).toHaveLength(batchesBefore);
    expect(durableState(f, created.execution.runId)).toEqual(before);
  });

  it("treats a missing or corrupt durable execution for an owned remote run as unavailable", async () => {
    const missing = fixture();
    const missingCreated = await missing.createRemote();
    missing.db.database.prepare("DELETE FROM research_site_executions WHERE run_id=?1")
      .run(missingCreated.execution.runId);
    await expectCode(
      () => missing.begin.begin({ ...identity(missingCreated.execution), newExecutionAllowed: true }),
      "RESEARCH_UNAVAILABLE",
    );

    const corrupt = fixture();
    const corruptCreated = await admitted(corrupt);
    corrupt.db.database.exec("DROP TRIGGER research_site_executions_identity_immutable");
    corrupt.db.database.exec("DROP TRIGGER research_site_executions_lifecycle_guard");
    corrupt.db.database.prepare("UPDATE research_site_executions SET validation_context_json='{}' WHERE run_id=?1")
      .run(corruptCreated.execution.runId);
    let reads = 0;
    const repository = new D1SiteBeginRepository(
      corrupt.db as unknown as D1Database,
      { getRun: async (ownerId, runId) => { reads += 1; return corrupt.research.getRun(ownerId, runId); } },
      corrupt.executions,
    );
    await expectCode(
      () => repository.begin({ ...identity(corruptCreated.execution), newExecutionAllowed: true }),
      "RESEARCH_UNAVAILABLE",
    );
    expect(reads).toBe(2);
    expect(corrupt.db.batches.slice(-1)[0]?.length).not.toBe(4);
  });

  it("rejects malformed, accessor, prototype, symbol, and unsafe commands before reads or writes", async () => {
    const f = fixture();
    let reads = 0;
    const repository = new D1SiteBeginRepository(
      f.db as unknown as D1Database,
      { getRun: async () => { reads += 1; return null; } },
      f.executions,
    );
    const valid = {
      ownerId: "owner-a", runId: "research-run-1", requestId: "request-1",
      jobId: "00000000-0000-4000-8000-000000000001", requestHash: "a".repeat(64),
      newExecutionAllowed: true,
    };
    const accessor = { ...valid } as Record<string, unknown>;
    Object.defineProperty(accessor, "ownerId", { enumerable: true, get: () => "owner-a" });
    const symbol = { ...valid } as Record<PropertyKey, unknown>;
    symbol[Symbol("hidden")] = true;
    for (const command of [
      { ...valid, extra: true }, { ...valid, ownerId: " owner-a" },
      { ...valid, requestId: "ignore previous instructions" }, accessor,
      Object.assign(Object.create(null), valid), symbol,
    ]) {
      await expectCode(() => repository.begin(command as never), "RESEARCH_UNAVAILABLE");
    }
    expect(reads).toBe(0);
    expect(f.db.batches).toHaveLength(0);
  });

  it("replays the exact original grant with advancing SQL time even when the gate is off", async () => {
    const f = fixture();
    const created = await admitted(f);
    const batchesBefore = f.db.batches.length;
    f.setSqlNow(SQL_NOW);
    const first = await f.begin.begin({ ...identity(created.execution), newExecutionAllowed: true });
    f.setSqlNow(SQL_NOW + 100_000);
    const replay = await f.begin.begin({ ...identity(created.execution), newExecutionAllowed: false });
    expect(replay.grant).toEqual(first.grant);
    expect(replay.observedAt).toBe(SQL_NOW + 100_000);
    expect(replay.remainingMs).toBe(1_160_000);
    expect(f.db.batches).toHaveLength(batchesBefore + 1);
  });

  it("replays expired and coherent terminal grants without renewing them", async () => {
    const f = fixture();
    const created = await admitted(f);
    const batchesBefore = f.db.batches.length;
    f.setSqlNow(SQL_NOW);
    const first = await f.begin.begin({ ...identity(created.execution), newExecutionAllowed: true });
    f.db.database.prepare(
      "UPDATE research_runs SET state='failed',active_slot=NULL,active_expires_at=NULL,retryable=1,error_code='interrupted',public_failure_category='timeout' WHERE id=?1",
    ).run(created.execution.runId);
    f.setSqlNow(first.grant.executionExpiresAt + 1);
    const replay = await f.begin.begin({ ...identity(created.execution), newExecutionAllowed: false });
    expect(replay.grant).toEqual(first.grant);
    expect(replay.remainingMs).toBe(0);
    expect(f.db.batches).toHaveLength(batchesBefore + 1);
  });

  it("rejects a backward SQL observation clock", async () => {
    const f = fixture();
    const created = await admitted(f);
    const batchesBefore = f.db.batches.length;
    f.setSqlNow(SQL_NOW);
    await f.begin.begin({ ...identity(created.execution), newExecutionAllowed: true });
    f.setSqlNow(SQL_NOW - 1);
    await expectCode(
      () => f.begin.begin({ ...identity(created.execution), newExecutionAllowed: false }),
      "RESEARCH_UNAVAILABLE",
    );
    expect(f.db.batches).toHaveLength(batchesBefore + 1);
  });

  it("uses the synchronously snapshotted command when the caller mutates during the first await", async () => {
    const f = fixture();
    const created = await admitted(f);
    let resume!: () => void;
    const paused = new Promise<void>((resolve) => { resume = resolve; });
    let entered!: () => void;
    const atRead = new Promise<void>((resolve) => { entered = resolve; });
    const runs = {
      getRun: async (ownerId: string, runId: string) => {
        entered();
        await paused;
        return f.research.getRun(ownerId, runId);
      },
    };
    const repository = new D1SiteBeginRepository(f.db as unknown as D1Database, runs, f.executions);
    const command = { ...identity(created.execution), newExecutionAllowed: true };
    f.setSqlNow(SQL_NOW);
    const pending = repository.begin(command);
    await atRead;
    command.requestId = "mutated-request";
    command.newExecutionAllowed = false;
    resume();
    expect((await pending).grant.jobId).toBe(created.execution.jobId);
  });

  it.each([
    ["missing quota reservation", (f: ReturnType<typeof fixture>, _value: Awaited<ReturnType<typeof admitted>>) => {
      void _value;
      f.db.database.exec("DELETE FROM quota_ledger");
    }],
    ["foreign quota reservation", (f: ReturnType<typeof fixture>, _value: Awaited<ReturnType<typeof admitted>>) => {
      void _value;
      f.db.database.prepare("UPDATE quota_ledger SET user_id='owner-b'").run();
    }],
    ["corrupt parent quota reservation", (f: ReturnType<typeof fixture>, _value: Awaited<ReturnType<typeof admitted>>) => {
      void _value;
      f.db.database.prepare("UPDATE quota_ledger SET purpose='preview' WHERE entry_kind='reserved'").run();
    }],
    ["terminal quota reservation", async (f: ReturnType<typeof fixture>, value: Awaited<ReturnType<typeof admitted>>) => {
      await f.quota.finalize(value.reservations.quotaReservationId, "accepted", 1);
    }],
  ])("rejects %s without changing the lifecycle pair", async (_name, corrupt) => {
    const f = fixture();
    const created = await admitted(f);
    await corrupt(f, created);
    const before = {
      run: f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1").get(created.execution.runId),
      execution: f.db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?1").get(created.execution.runId),
      buckets: f.db.database.prepare("SELECT * FROM ai_budget_buckets ORDER BY id").all(),
      quota: f.db.database.prepare("SELECT * FROM quota_ledger ORDER BY id").all(),
    };
    await expectCode(
      () => f.begin.begin({ ...identity(created.execution), newExecutionAllowed: true }),
      "CONFLICT",
    );
    expect(f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1").get(created.execution.runId)).toEqual(before.run);
    expect(f.db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?1").get(created.execution.runId)).toEqual(before.execution);
    expect(f.db.database.prepare("SELECT * FROM ai_budget_buckets ORDER BY id").all()).toEqual(before.buckets);
    expect(f.db.database.prepare("SELECT * FROM quota_ledger ORDER BY id").all()).toEqual(before.quota);
  });

  it.each(["released", "conservative-hold", "settled", "wrong-owner", "expired"])(
    "rejects %s budget accounting without changing balances or lifecycle",
    async (kind) => {
      const f = fixture();
      const created = await admitted(f);
      if (kind === "wrong-owner") {
        const foreign = await f.createRemote("owner-b");
        f.db.database.prepare("UPDATE ai_budget_reservations SET run_id=?1,request_id=?2")
          .run(foreign.run.id, foreign.run.requestId);
      } else if (kind === "expired") {
        f.db.database.prepare("UPDATE ai_budget_reservations SET expires_at=?1").run(SQL_NOW);
      } else {
        f.db.database.prepare("UPDATE ai_budget_reservations SET status=?1,settled_micros=?2")
          .run(kind, kind === "settled" ? 1 : 0);
      }
      f.setSqlNow(SQL_NOW);
      const beforeRun = f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1").get(created.execution.runId);
      const beforeExecution = f.db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?1").get(created.execution.runId);
      const beforeBuckets = f.db.database.prepare("SELECT * FROM ai_budget_buckets ORDER BY id").all();
      await expectCode(
        () => f.begin.begin({ ...identity(created.execution), newExecutionAllowed: true }),
        "CONFLICT",
      );
      expect(f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1").get(created.execution.runId)).toEqual(beforeRun);
      expect(f.db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?1").get(created.execution.runId)).toEqual(beforeExecution);
      expect(f.db.database.prepare("SELECT * FROM ai_budget_buckets ORDER BY id").all()).toEqual(beforeBuckets);
    },
  );

  it.each(["terminal", "corrupt-parent"] as const)(
    "rejects when %s quota accounting wins after the durable pre-read",
    async (kind) => {
      const f = fixture();
      const created = await admitted(f);
      f.setSqlNow(SQL_NOW);
      const delayed = await pauseBeforeBatch(
        f,
        { ...identity(created.execution), newExecutionAllowed: true },
      );

      if (kind === "terminal") {
        await f.quota.finalize(created.reservations.quotaReservationId, "failed", 0);
      } else {
        f.db.database.prepare(
          "UPDATE quota_ledger SET purpose='preview' WHERE reservation_id=?1 AND entry_kind='reserved'",
        ).run(created.reservations.quotaReservationId);
      }
      const accountingWinner = durableState(f, created.execution.runId);
      delayed.point.resume();

      await expectCode(() => delayed.pending, "CONFLICT");
      expect(delayed.batchCalls()).toBe(1);
      expect(durableState(f, created.execution.runId)).toEqual(accountingWinner);
      expect((await f.executions.read(created.execution.ownerId, created.execution.runId)))
        .toMatchObject({ beganAt: null, executionExpiresAt: null, version: created.execution.version });
    },
  );

  it.each(["held", "settled", "released", "wrong-relation"] as const)(
    "rejects when %s budget accounting wins after the durable pre-read",
    async (kind) => {
      const f = fixture();
      const created = await admitted(f);
      const foreign = kind === "wrong-relation" ? await f.createRemote("owner-b") : null;
      f.setSqlNow(SQL_NOW);
      const delayed = await pauseBeforeBatch(
        f,
        { ...identity(created.execution), newExecutionAllowed: true },
      );

      if (kind === "held") {
        await f.budget.settle(
          created.execution.ownerId,
          created.reservations.budgetReservationId,
          { kind: "unknown" },
        );
      } else if (kind === "settled") {
        await f.budget.settle(
          created.execution.ownerId,
          created.reservations.budgetReservationId,
          { kind: "actual", actualMicros: 123 },
        );
      } else if (kind === "released") {
        await f.budget.settle(
          created.execution.ownerId,
          created.reservations.budgetReservationId,
          { kind: "not-charged" },
        );
      } else {
        if (!foreign) throw new Error("wrong relation fixture requires a foreign run");
        f.db.database.prepare(
          "UPDATE ai_budget_reservations SET run_id=?1,request_id=?2 WHERE id=?3",
        ).run(foreign.execution.runId, foreign.execution.requestId, created.reservations.budgetReservationId);
      }
      const accountingWinner = durableState(f, created.execution.runId);
      delayed.point.resume();

      await expectCode(() => delayed.pending, "CONFLICT");
      expect(delayed.batchCalls()).toBe(1);
      expect(durableState(f, created.execution.runId)).toEqual(accountingWinner);
      expect((await f.executions.read(created.execution.ownerId, created.execution.runId)))
        .toMatchObject({ beganAt: null, executionExpiresAt: null, version: created.execution.version });
    },
  );

  it.each(["execution", "run"])("rejects exhausted %s versions atomically", async (target) => {
    const f = fixture();
    const created = await admitted(f);
    const table = target === "execution" ? "research_site_executions" : "research_runs";
    const column = target === "execution" ? "version" : "state_version";
    const key = target === "execution" ? "run_id" : "id";
    if (target === "execution") f.db.database.exec("DROP TRIGGER research_site_executions_lifecycle_guard");
    f.db.database.prepare(`UPDATE ${table} SET ${column}=?1 WHERE ${key}=?2`)
      .run(Number.MAX_SAFE_INTEGER, created.execution.runId);
    await expectCode(
      () => f.begin.begin({ ...identity(created.execution), newExecutionAllowed: true }),
      "CONFLICT",
    );
    expect(f.db.database.prepare(`SELECT ${column} AS value FROM ${table} WHERE ${key}=?1`)
      .get(created.execution.runId)).toEqual({ value: Number.MAX_SAFE_INTEGER });
  });

  it("enforces the exact SQL queue deadline", async () => {
    const denied = fixture();
    const deniedCreated = await admitted(denied);
    denied.setSqlNow(deniedCreated.execution.job.queueExpiresAt);
    await expectCode(
      () => denied.begin.begin({ ...identity(deniedCreated.execution), newExecutionAllowed: true }),
      "CONFLICT",
    );
    expect((await denied.executions.read(deniedCreated.execution.ownerId, deniedCreated.execution.runId))?.beganAt).toBeNull();

    const accepted = fixture();
    const acceptedCreated = await admitted(accepted);
    accepted.setSqlNow(acceptedCreated.execution.job.queueExpiresAt - 1);
    const reply = await accepted.begin.begin({ ...identity(acceptedCreated.execution), newExecutionAllowed: true });
    expect(reply.grant.beganAt).toBe(acceptedCreated.execution.job.queueExpiresAt - 1);
    expect(reply.grant.executionExpiresAt).toBe(acceptedCreated.execution.reservationExpiresAt - 1);
    expect(reply.grant.executionExpiresAt - reply.grant.beganAt).toBe(1_260_000);
    expect(reply.remainingMs).toBe(1_260_000);
    const replay = await accepted.begin.begin({ ...identity(acceptedCreated.execution), newExecutionAllowed: false });
    expect(replay.grant).toEqual(reply.grant);
    expect((await accepted.executions.read(
      acceptedCreated.execution.ownerId,
      acceptedCreated.execution.runId,
    ))?.version).toBe(acceptedCreated.execution.version + 1);
  });

  it.each([0, 1])(
    "rejects when the SQL clock crosses the queue deadline by %i ms after the durable pre-read",
    async (offset) => {
      const f = fixture();
      const created = await admitted(f);
      const applicationTime = created.execution.job.queueExpiresAt - 1;
      f.setAppNow(applicationTime);
      f.setSqlNow(applicationTime);
      const delayed = await pauseBeforeBatch(
        f,
        { ...identity(created.execution), newExecutionAllowed: true },
      );
      f.setSqlNow(created.execution.job.queueExpiresAt + offset);
      const beforeBatch = durableState(f, created.execution.runId);
      delayed.point.resume();

      await expectCode(() => delayed.pending, "CONFLICT");
      expect(delayed.batchCalls()).toBe(1);
      expect(durableState(f, created.execution.runId)).toEqual(beforeBatch);
      expect((await f.executions.read(created.execution.ownerId, created.execution.runId)))
        .toMatchObject({ beganAt: null, executionExpiresAt: null });
    },
  );

  it("recovers the original grant after a lost acknowledgement but never invents one before commit", async () => {
    const committed = fixture();
    const committedCreated = await admitted(committed);
    committed.setSqlNow(SQL_NOW);
    const realBatch = committed.db.batch.bind(committed.db);
    let calls = 0;
    const lostAckDb = {
      prepare: committed.db.prepare.bind(committed.db),
      batch: async (statements: D1PreparedStatement[]) => {
        calls += 1;
        await realBatch(statements);
        throw new Error("lost acknowledgement");
      },
    } as unknown as D1Database;
    const repository = new D1SiteBeginRepository(lostAckDb, committed.research, committed.executions);
    const recovered = await repository.begin({ ...identity(committedCreated.execution), newExecutionAllowed: true });
    expect(recovered.grant.beganAt).toBe(SQL_NOW);
    expect(calls).toBe(1);

    const failed = fixture();
    const failedCreated = await admitted(failed);
    const batchesBefore = failed.db.batches.length;
    failed.db.failAtBatchStatement = 0;
    await expectCode(
      () => failed.begin.begin({ ...identity(failedCreated.execution), newExecutionAllowed: true }),
      "CONFLICT",
    );
    expect(failed.db.batches).toHaveLength(batchesBefore + 1);
    expect((await failed.executions.read(failedCreated.execution.ownerId, failedCreated.execution.runId))?.beganAt).toBeNull();
  });

  it.each([0, 1, 2, 3])(
    "rolls back the complete lifecycle pair when begin batch statement %i fails",
    async (position) => {
      const f = fixture();
      const created = await admitted(f);
      f.setSqlNow(SQL_NOW);
      const before = durableState(f, created.execution.runId);
      const batchesBefore = f.db.batches.length;
      f.db.failAtBatchStatement = position;

      await expectCode(
        () => f.begin.begin({ ...identity(created.execution), newExecutionAllowed: true }),
        "CONFLICT",
      );

      expect(f.db.batches).toHaveLength(batchesBefore + 1);
      expect(f.db.batches.at(-1)).toHaveLength(4);
      expect(durableState(f, created.execution.runId)).toEqual(before);
      expect((await f.executions.read(created.execution.ownerId, created.execution.runId)))
        .toMatchObject({ beganAt: null, executionExpiresAt: null, version: created.execution.version });
    },
  );

  it("rolls back the execution update when the actual final run CAS changes zero", async () => {
    const f = fixture();
    const created = await admitted(f);
    f.setSqlNow(SQL_NOW);
    const before = durableState(f, created.execution.runId);
    const batchesBefore = f.db.batches.length;
    f.db.database.exec(`CREATE TEMP TRIGGER ignore_site_begin_run_update
      BEFORE UPDATE OF state ON research_runs
      WHEN OLD.state='queued' AND NEW.state='researching'
      BEGIN SELECT RAISE(IGNORE); END`);

    await expectCode(
      () => f.begin.begin({ ...identity(created.execution), newExecutionAllowed: true }),
      "CONFLICT",
    );

    expect(f.db.batches).toHaveLength(batchesBefore + 1);
    expect(f.db.batches.at(-1)?.[3]).toContain("changes()=1");
    expect(durableState(f, created.execution.runId)).toEqual(before);
  });

  it("lets a real close and known-unsent accounting commit before a delayed begin batch", async () => {
    const f = fixture();
    const created = await admitted(f);
    f.setSqlNow(SQL_NOW);
    const delayed = await pauseBeforeBatch(
      f,
      { ...identity(created.execution), newExecutionAllowed: true },
    );

    const closed = await f.executions.closeBeforeBegin(f.closeCommand(created.execution, "interrupted"));
    await f.quota.finalize(created.reservations.quotaReservationId, "failed", 0);
    await f.budget.releaseRemoteBeforeBegin(
      f.releaseCommand(closed.execution, created.reservations.budgetReservationId),
    );
    const winner = durableState(f, created.execution.runId);
    delayed.point.resume();

    await expectCode(() => delayed.pending, "CONFLICT");
    expect(delayed.batchCalls()).toBe(1);
    expect(durableState(f, created.execution.runId)).toEqual(winner);
    expect(await f.executions.read(created.execution.ownerId, created.execution.runId)).toMatchObject({
      admissionState: "closed",
      beganAt: null,
      executionExpiresAt: null,
      closeReason: "interrupted",
    });
    expect(await f.quota.readResearchReservation(created.execution.ownerId, created.execution.quotaKey))
      .toMatchObject({ finalStatus: "failed" });
    expect(await f.budget.readReservation(created.execution.ownerId, created.reservations.budgetReservationId))
      .toMatchObject({ status: "released", settledMicros: 0 });
  });

  it("keeps a winning begin when a late pre-begin close and release use the fresh execution", async () => {
    const f = fixture();
    const created = await admitted(f);
    f.setSqlNow(SQL_NOW);
    const grant = await f.begin.begin({ ...identity(created.execution), newExecutionAllowed: true });
    const fresh = await f.executions.read(created.execution.ownerId, created.execution.runId);
    if (!fresh) throw new Error("winning begin must retain its execution");
    const winner = durableState(f, created.execution.runId);

    await expect(f.executions.closeBeforeBegin(f.closeCommand(fresh, "interrupted")))
      .rejects.toMatchObject({ code: "CONFLICT" });
    await expect(f.budget.releaseRemoteBeforeBegin(
      f.releaseCommand(fresh, created.reservations.budgetReservationId),
    )).rejects.toMatchObject({ code: "CONFLICT" });

    expect(durableState(f, created.execution.runId)).toEqual(winner);
    expect(fresh).toMatchObject({
      beganAt: grant.grant.beganAt,
      executionExpiresAt: grant.grant.executionExpiresAt,
      version: created.execution.version + 1,
    });
    expect(await f.quota.readResearchReservation(created.execution.ownerId, created.execution.quotaKey))
      .toMatchObject({ finalStatus: null });
    expect(await f.budget.readReservation(created.execution.ownerId, created.reservations.budgetReservationId))
      .toMatchObject({ status: "reserved", settledMicros: 0 });
  });

  it("returns one grant for concurrent identical callers and rejects a different identity", async () => {
    const f = fixture();
    const created = await admitted(f);
    f.setSqlNow(SQL_NOW);
    const batchesBefore = f.db.batches.length;
    const command = { ...identity(created.execution), newExecutionAllowed: true };
    const [first, second] = await Promise.all([f.begin.begin(command), f.begin.begin(command)]);
    expect(first.grant).toEqual(second.grant);
    expect(f.db.batches).toHaveLength(batchesBefore + 2);
    await expectCode(
      () => f.begin.begin({ ...command, jobId: "00000000-0000-4000-8000-000000000099" }),
      "CONFLICT",
    );
    const run = await f.research.getRun(created.execution.ownerId, created.execution.runId);
    const execution = await f.executions.read(created.execution.ownerId, created.execution.runId);
    expect(run?.stateVersion).toBe(created.run.stateVersion + 1);
    expect(execution?.version).toBe(created.execution.version + 1);
  });

  it("retries a torn internal pair once and observes a competing begin without a second batch", async () => {
    const f = fixture();
    const created = await admitted(f);
    f.setSqlNow(SQL_NOW);
    let internalReads = 0;
    let release!: () => void;
    const resume = new Promise<void>((resolve) => { release = resolve; });
    let reached!: () => void;
    const paused = new Promise<void>((resolve) => { reached = resolve; });
    const runs = {
      getRun: async (ownerId: string, runId: string) => {
        const run = await f.research.getRun(ownerId, runId);
        internalReads += 1;
        if (internalReads === 2) { reached(); await resume; }
        return run;
      },
    };
    let aBatches = 0;
    const db = {
      prepare: f.db.prepare.bind(f.db),
      batch: async (statements: D1PreparedStatement[]) => {
        aBatches += 1;
        return f.db.batch(statements);
      },
    } as unknown as D1Database;
    const executions = new D1SiteExecutionRepository(db, runs);
    const callerA = new D1SiteBeginRepository(db, runs, executions);
    const command = { ...identity(created.execution), newExecutionAllowed: true };
    const pendingA = callerA.begin(command);
    await paused;
    const winner = await f.begin.begin(command);
    release();
    const recovered = await pendingA;
    expect(recovered.grant).toEqual(winner.grant);
    expect(aBatches).toBe(0);
    const run = await f.research.getRun(created.execution.ownerId, created.execution.runId);
    const execution = await f.executions.read(created.execution.ownerId, created.execution.runId);
    expect(run?.stateVersion).toBe(created.run.stateVersion + 1);
    expect(execution?.version).toBe(created.execution.version + 1);
  });

  it("retries an outer torn pair once and then returns the fresh grant without writing", async () => {
    const f = fixture();
    const created = await admitted(f);
    f.setSqlNow(SQL_NOW);
    let outerReads = 0;
    let release!: () => void;
    const resume = new Promise<void>((resolve) => { release = resolve; });
    let reached!: () => void;
    const paused = new Promise<void>((resolve) => { reached = resolve; });
    const runs = {
      getRun: async (ownerId: string, runId: string) => {
        const run = await f.research.getRun(ownerId, runId);
        outerReads += 1;
        if (outerReads === 1) { reached(); await resume; }
        return run;
      },
    };
    let writes = 0;
    const db = {
      prepare: f.db.prepare.bind(f.db),
      batch: async (statements: D1PreparedStatement[]) => { writes += 1; return f.db.batch(statements); },
    } as unknown as D1Database;
    const callerA = new D1SiteBeginRepository(db, runs, f.executions);
    const command = { ...identity(created.execution), newExecutionAllowed: true };
    const pendingA = callerA.begin(command);
    await paused;
    const winner = await f.begin.begin(command);
    release();
    const recovered = await pendingA;
    expect(recovered.grant).toEqual(winner.grant);
    expect(writes).toBe(0);
  });

  it("bounds persistent corrupt-pair observations at two attempts and zero writes", async () => {
    const f = fixture();
    const created = await admitted(f);
    let reads = 0;
    let writes = 0;
    const runs = {
      getRun: async (ownerId: string, runId: string) => {
        reads += 1;
        const run = await f.research.getRun(ownerId, runId);
        return run ? { ...run, activeExpiresAt: run.activeExpiresAt! + 1 } : null;
      },
    };
    const db = {
      prepare: f.db.prepare.bind(f.db),
      batch: async (statements: D1PreparedStatement[]) => { writes += 1; return f.db.batch(statements); },
    } as unknown as D1Database;
    const repository = new D1SiteBeginRepository(db, runs, f.executions);
    await expectCode(
      () => repository.begin({ ...identity(created.execution), newExecutionAllowed: true }),
      "RESEARCH_UNAVAILABLE",
    );
    expect(reads).toBe(2);
    expect(writes).toBe(0);
  });

  it("sanitizes statement preparation failures without a mutation retry or raw SQL leak", async () => {
    const f = fixture();
    const created = await admitted(f);
    let mutationPrepares = 0;
    let batches = 0;
    const db = {
      prepare: (sql: string) => {
        if (sql.includes("UPDATE research_site_executions AS e")) {
          mutationPrepares += 1;
          throw new Error(`sensitive SQL: ${sql}`);
        }
        return f.db.prepare(sql);
      },
      batch: async () => { batches += 1; throw new Error("must not batch"); },
    } as unknown as D1Database;
    const repository = new D1SiteBeginRepository(db, f.research, f.executions);
    let thrown: unknown;
    try {
      await repository.begin({ ...identity(created.execution), newExecutionAllowed: true });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toEqual(new ResearchRepositoryError("RESEARCH_UNAVAILABLE"));
    expect((thrown as Error).message).toBe("RESEARCH_UNAVAILABLE");
    expect(mutationPrepares).toBe(1);
    expect(batches).toBe(0);
    expect((await f.executions.read(created.execution.ownerId, created.execution.runId))?.beganAt).toBeNull();
  });

  it("does not reserve, finalize, settle, or alter accounting after setup", async () => {
    const f = fixture();
    const created = await admitted(f);
    const quotaBefore = f.db.database.prepare("SELECT * FROM quota_ledger ORDER BY id").all();
    const reservationsBefore = f.db.database.prepare("SELECT * FROM ai_budget_reservations ORDER BY id").all();
    const bucketsBefore = f.db.database.prepare("SELECT * FROM ai_budget_buckets ORDER BY id").all();
    let reserves = 0;
    let finalizes = 0;
    let settlements = 0;
    f.quota.admitRemoteResearch = async () => { reserves += 1; throw new Error("unexpected reserve"); };
    f.quota.finalize = async () => { finalizes += 1; throw new Error("unexpected finalize"); };
    f.budget.reserveRemote = async () => { reserves += 1; throw new Error("unexpected reserve"); };
    f.budget.settle = async () => { settlements += 1; throw new Error("unexpected settle"); };
    f.setSqlNow(SQL_NOW);

    await f.begin.begin({ ...identity(created.execution), newExecutionAllowed: true });

    expect({ reserves, finalizes, settlements }).toEqual({ reserves: 0, finalizes: 0, settlements: 0 });
    expect(f.db.database.prepare("SELECT * FROM quota_ledger ORDER BY id").all()).toEqual(quotaBefore);
    expect(f.db.database.prepare("SELECT * FROM ai_budget_reservations ORDER BY id").all()).toEqual(reservationsBefore);
    expect(f.db.database.prepare("SELECT * FROM ai_budget_buckets ORDER BY id").all()).toEqual(bucketsBefore);
  });

  it("preserves all immutable execution fields and changes only the authorized lifecycle columns", async () => {
    const f = fixture();
    const created = await admitted(f);
    const beforeExecution = f.db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?1")
      .get(created.execution.runId) as Record<string, unknown>;
    const beforeRun = f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1")
      .get(created.execution.runId) as Record<string, unknown>;
    f.setSqlNow(SQL_NOW);

    await f.begin.begin({ ...identity(created.execution), newExecutionAllowed: true });

    const afterExecution = f.db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?1")
      .get(created.execution.runId) as Record<string, unknown>;
    const afterRun = f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1")
      .get(created.execution.runId) as Record<string, unknown>;
    for (const key of Object.keys(beforeExecution)) {
      if (["began_at", "execution_expires_at", "version", "updated_at"].includes(key)) continue;
      expect(afterExecution[key], `execution.${key}`).toEqual(beforeExecution[key]);
    }
    for (const key of Object.keys(beforeRun)) {
      if (["state", "state_version", "active_expires_at", "updated_at"].includes(key)) continue;
      expect(afterRun[key], `run.${key}`).toEqual(beforeRun[key]);
    }
    expect(afterExecution).toMatchObject({
      began_at: SQL_NOW,
      execution_expires_at: SQL_NOW + 1_260_000,
      version: (beforeExecution.version as number) + 1,
      updated_at: SQL_NOW,
    });
    expect(afterRun).toMatchObject({
      state: "researching",
      state_version: (beforeRun.state_version as number) + 1,
      active_expires_at: SQL_NOW + 1_260_000,
      updated_at: SQL_NOW,
    });
  });

  it("reopens a file-backed database and replays the exact persisted grant", async () => {
    const dir = mkdtempSync(join(tmpdir(), "site-begin-"));
    dirs.add(dir);
    const path = join(dir, "research.sqlite");
    const first = fixture(path);
    const created = await admitted(first);
    first.setSqlNow(SQL_NOW);
    const original = await first.begin.begin({ ...identity(created.execution), newExecutionAllowed: true });
    first.db.close();
    opened.splice(opened.indexOf(first), 1);

    const db = new SqliteD1(path);
    reopened.add(db);
    db.database.exec("PRAGMA foreign_keys = ON");
    db.database.function("unixepoch", { varargs: true }, (...args: unknown[]) => {
      if (args.length === 0) return Math.floor((SQL_NOW + 1_000) / 1_000);
      if (args.length === 1 && args[0] === "subsec") return (SQL_NOW + 1_000) / 1_000;
      throw new Error("Unexpected SQL clock call in reopened fixture");
    });
    const research = new D1ResearchRepository(db as unknown as D1Database, { now: () => SQL_NOW + 1_000 });
    const executions = new D1SiteExecutionRepository(db as unknown as D1Database, research);
    const begin = new D1SiteBeginRepository(db as unknown as D1Database, research, executions);
    expect(db.database.prepare("SELECT id FROM research_runs WHERE id=?1").get(created.execution.runId))
      .toEqual({ id: created.execution.runId });

    const replay = await begin.begin({ ...identity(created.execution), newExecutionAllowed: false });

    expect(replay.grant).toEqual(original.grant);
    expect(replay.observedAt).toBe(SQL_NOW + 1_000);
    expect(replay.remainingMs).toBe(original.remainingMs - 1_000);
    expect(db.batches).toHaveLength(0);
  });
});
