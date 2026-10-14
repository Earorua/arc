import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { D1SiteBridgeRepository } from "../../app/server/research/d1-site-bridge-repository";
import { D1SiteExpiryRepository } from "../../app/server/research/d1-site-expiry-repository";
import { SiteExpiryCoordinator } from "../../app/server/research/site-expiry";
import { D1SiteImportPublication } from "../../app/server/research/d1-site-import-publication";
import { SiteImportCoordinator } from "../../app/server/research/site-import";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { createSiteImportFixture, validReceipt } from "../helpers/site-import-fixture";
import { SqliteD1 } from "../helpers/sqlite-d1";
import { D1BridgeJobStore } from "../../worker/research-executor/d1-job-store";

function createExecutorDb(): SqliteD1 {
  const db = new SqliteD1();
  for (const file of ["0000_research_bridge_nonces.sql", "0001_research_executor_jobs.sql"]) {
    db.database.exec(readFileSync(resolve("worker/research-executor/migrations", file), "utf8")
      .replaceAll("--> statement-breakpoint", ";"));
  }
  return db;
}

function loseFirstRecoveryMarkerAck(db: D1Database): D1Database {
  let lose = true;
  const originals = new WeakMap<object, D1PreparedStatement>();
  const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => {
    const wrapped = {
    bind: (...values: unknown[]) => wrap(statement.bind(...values), sql),
    first: <T>() => statement.first<T>(),
    all: <T>() => statement.all<T>(),
    run: async () => {
      const result = await statement.run();
      if (lose && sql.includes("UPDATE research_site_recoveries AS p")) {
        lose = false;
        throw new Error("lost recovery marker acknowledgement");
      }
      return result;
    },
    } as D1PreparedStatement;
    originals.set(wrapped as object, statement);
    return wrapped;
  };
  return { prepare: (sql: string) => wrap(db.prepare(sql), sql),
    batch: (statements: D1PreparedStatement[]) => db.batch(statements.map((statement) =>
      originals.get(statement as object) ?? statement)) } as D1Database;
}

function loseRecoveryMarkerAck(db: D1Database, ordinal: number): D1Database {
  let seen = 0;
  const originals = new WeakMap<object, D1PreparedStatement>();
  const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => {
    const wrapped = { bind: (...values: unknown[]) => wrap(statement.bind(...values), sql),
      first: <T>() => statement.first<T>(), all: <T>() => statement.all<T>(),
      run: async () => {
        const result = await statement.run();
        if (sql.includes("UPDATE research_site_recoveries AS p") && ++seen === ordinal) {
          throw new Error("lost selected recovery marker acknowledgement");
        }
        return result;
      } } as D1PreparedStatement;
    originals.set(wrapped as object, statement);
    return wrapped;
  };
  return { prepare: (sql: string) => wrap(db.prepare(sql), sql),
    batch: (statements: D1PreparedStatement[]) => db.batch(statements.map((statement) =>
      originals.get(statement as object) ?? statement)) } as D1Database;
}

function loseFirstExpiryBatchAck(db: D1Database): D1Database {
  let lose = true;
  return { prepare: (sql: string) => db.prepare(sql),
    batch: async (statements: D1PreparedStatement[]) => {
      const result = await db.batch(statements);
      if (lose) { lose = false; throw new Error("lost expiry batch acknowledgement"); }
      return result;
    } } as D1Database;
}

function mutateBeforeExpiryBatch(db: SqliteD1, mutation: () => void): D1Database {
  let first = true;
  return { prepare: (sql: string) => (db as unknown as D1Database).prepare(sql),
    batch: (statements: D1PreparedStatement[]) => {
      if (first) { first = false; mutation(); }
      return (db as unknown as D1Database).batch(statements);
    } } as D1Database;
}

function mutateBeforeRecoveryMarker(db: SqliteD1, ordinal: number, mutation: () => void): D1Database {
  let seen = 0;
  const originals = new WeakMap<object, D1PreparedStatement>();
  const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => {
    const wrapped = { bind: (...values: unknown[]) => wrap(statement.bind(...values), sql),
      first: <T>() => statement.first<T>(), all: <T>() => statement.all<T>(),
      run: async () => {
        if (sql.includes("UPDATE research_site_recoveries AS p") && ++seen === ordinal) mutation();
        return statement.run();
      } } as D1PreparedStatement;
    originals.set(wrapped as object, statement);
    return wrapped;
  };
  return { prepare: (sql: string) => wrap((db as unknown as D1Database).prepare(sql), sql),
    batch: (statements: D1PreparedStatement[]) => (db as unknown as D1Database).batch(
      statements.map((statement) => originals.get(statement as object) ?? statement),
    ) } as D1Database;
}

function mutateBeforeUnsentUpgrade(db: SqliteD1, mutation: () => void): D1Database {
  let mutate = true;
  const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => ({
    bind: (...values: unknown[]) => wrap(statement.bind(...values), sql),
    first: <T>() => statement.first<T>(), all: <T>() => statement.all<T>(),
    run: async () => {
      if (mutate && sql.includes("SET reason='executor-unsent'")) { mutate = false; mutation(); }
      return statement.run();
    },
  } as D1PreparedStatement);
  return { prepare: (sql: string) => wrap((db as unknown as D1Database).prepare(sql), sql),
    batch: (statements: D1PreparedStatement[]) => (db as unknown as D1Database).batch(statements) } as D1Database;
}

function createExpiry(f: Awaited<ReturnType<typeof createSiteImportFixture>>) {
  const bridge = new D1SiteBridgeRepository(f.db as unknown as D1Database, f.research, f.executions);
  const repository = new D1SiteExpiryRepository(f.db as unknown as D1Database, f.research, f.executions);
  const expiry = new SiteExpiryCoordinator({
    repository,
    bridgeRepository: bridge,
    importer: { reconcileMetadata: async () => { throw new Error("unexpected import journal"); } },
    importJournal: { read: async () => null },
    entitlements: f.quota,
    budget: f.budget,
  });
  return { bridge, repository, expiry };
}

describe("Site expiry reconciliation", () => {
  it.each(["wrong-day-period", "unsafe-bucket-sum", "insufficient-reserved",
    "negative-reservation-created-at"] as const)(
    "rejects preexisting %s accounting before any expiry effect",
    async (kind) => {
      const f = await createSiteImportFixture();
      try {
        const budget = f.db.database.prepare("SELECT * FROM ai_budget_reservations WHERE id=?1")
          .get(f.execution.budgetReservationId!) as Record<string, unknown>;
        if (kind === "wrong-day-period") f.db.database.prepare(
          "UPDATE ai_budget_buckets SET period_start=period_start+86400000 WHERE id=?1",
        ).run(budget.day_bucket_id as string);
        if (kind === "unsafe-bucket-sum") f.db.database.prepare(
          "UPDATE ai_budget_buckets SET settled_micros=?1 WHERE id=?2",
        ).run(Number.MAX_SAFE_INTEGER, budget.day_bucket_id as string);
        if (kind === "insufficient-reserved") f.db.database.prepare(
          "UPDATE ai_budget_buckets SET reserved_micros=0 WHERE id=?1",
        ).run(budget.day_bucket_id as string);
        if (kind === "negative-reservation-created-at") f.db.database.prepare(
          "UPDATE ai_budget_reservations SET created_at=-1 WHERE id=?1",
        ).run(f.execution.budgetReservationId!);
        const { expiry } = createExpiry(f);
        f.setSqlNow(f.execution.executionExpiresAt!);
        await expect(expiry.reconcile(f.identity, null)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
        expect(f.db.database.prepare("SELECT state,state_version FROM research_runs WHERE id=?1")
          .get(f.identity.runId)).toEqual({ state: "researching", state_version: 1 });
        expect(f.db.database.prepare("SELECT count(*) AS n FROM research_site_recoveries").get())
          .toEqual({ n: 0 });
        expect((await f.quota.readResearchReservation(f.identity.ownerId, f.execution.quotaKey))?.finalStatus)
          .toBeNull();
        expect(f.db.database.prepare("SELECT status FROM ai_budget_reservations WHERE id=?1")
          .get(f.execution.budgetReservationId!)).toEqual({ status: "reserved" });
      } finally { f.db.close(); }
    },
  );
  it("rechecks the SQL clock at mutation after an unexpired preread", async () => {
    const f = await createSiteImportFixture();
    try {
      const expiresAt = f.execution.executionExpiresAt!;
      f.setSqlNow(expiresAt - 1);
      f.setAppNow(expiresAt + 60_000);
      let advanced = false;
      const db = { prepare: (sql: string) => (f.db as unknown as D1Database).prepare(sql),
        batch: (statements: D1PreparedStatement[]) => {
          advanced = true;
          f.setSqlNow(expiresAt);
          return (f.db as unknown as D1Database).batch(statements);
        } } as D1Database;
      const repository = new D1SiteExpiryRepository(db, f.research, f.executions);
      await expect(repository.terminate(f.identity, null)).resolves.toMatchObject({
        reason: "expired-unknown", terminalAt: expiresAt - 1,
      });
      expect(advanced).toBe(true);
    } finally {
      f.db.close();
    }
  });

  it.each(["run", "accounting"] as const)(
    "rejects %s substitution after preread and before the terminal batch without expiry effects",
    async (kind) => {
      const f = await createSiteImportFixture();
      try {
        const db = mutateBeforeExpiryBatch(f.db, () => {
          if (kind === "run") {
            f.db.database.prepare("UPDATE research_runs SET raw_role='same-version-substitute' WHERE id=?1")
              .run(f.identity.runId);
          } else {
            f.db.database.prepare(`UPDATE ai_budget_reservations
              SET maximum_reserved_micros=maximum_reserved_micros+1 WHERE id=?1`)
              .run(f.execution.budgetReservationId!);
          }
        });
        const repository = new D1SiteExpiryRepository(db, f.research, f.executions);
        f.setSqlNow(f.execution.executionExpiresAt!);
        await expect(repository.terminate(f.identity, null)).rejects.toMatchObject({
          code: "RESEARCH_UNAVAILABLE",
        });
        expect(f.db.database.prepare("SELECT state,state_version FROM research_runs WHERE id=?1")
          .get(f.identity.runId)).toMatchObject({ state: "researching" });
        expect(f.db.database.prepare("SELECT count(*) AS n FROM research_site_recoveries").get())
          .toEqual({ n: 0 });
      } finally {
        f.db.close();
      }
    },
  );

  it("uses the SQL mutation clock and conservatively holds unknown expired accounting", async () => {
    const f = await createSiteImportFixture();
    try {
      const { bridge, repository, expiry } = createExpiry(f);
      await expect(repository.terminate(f.identity, null)).resolves.toBeNull();
      f.setSqlNow(f.execution.executionExpiresAt!);
      f.setAppNow(f.execution.executionExpiresAt!);
      await expiry.reconcile(f.identity, null);
      const run = await f.research.getRun(f.identity.ownerId, f.identity.runId);
      const recovery = await repository.read(f.identity);
      expect(run).toMatchObject({ state: "failed", errorCode: "interrupted", failureCategory: "timeout" });
      expect(recovery).toMatchObject({ reason: "expired-unknown", quotaDone: true, budgetDone: true });
      expect((await f.quota.readResearchReservation(f.identity.ownerId, f.execution.quotaKey))?.finalStatus)
        .toBe("failed");
      expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))?.status)
        .toBe("conservative-hold");
      await expect(bridge.nextScan("maintenance")).resolves.toEqual(f.identity);
    } finally {
      f.db.close();
    }
  });

  it("upgrades durable unknown recovery only from an exact irreversible unsent proof", async () => {
    const f = await createSiteImportFixture();
    try {
      const { bridge, repository, expiry } = createExpiry(f);
      f.setSqlNow(f.execution.executionExpiresAt!);
      f.setAppNow(f.execution.executionExpiresAt!);
      await expiry.reconcile(f.identity, null);
      const before = await repository.read(f.identity);
      const failed = await f.research.getRun(f.identity.ownerId, f.identity.runId);
      const proof = {
        jobId: f.identity.jobId,
        requestHash: f.identity.requestHash,
        state: "closed" as const,
        closedAt: f.execution.executionExpiresAt!,
        grant: {
          protocol: f.execution.job.protocol,
          jobId: f.identity.jobId,
          requestHash: f.identity.requestHash,
          beganAt: f.execution.beganAt!,
          executionExpiresAt: f.execution.executionExpiresAt!,
        },
      };
      await expiry.reconcile(f.identity, proof);
      const after = await repository.read(f.identity);
      expect(after).toMatchObject({ reason: "executor-unsent", quotaDone: true, budgetDone: true,
        terminalHash: before?.terminalHash, terminalAt: before?.terminalAt, runVersion: before?.runVersion });
      expect(await f.research.getRun(f.identity.ownerId, f.identity.runId)).toEqual(failed);
      expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))?.status)
        .toBe("released");
      await expiry.reconcile(f.identity, proof);
      expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))?.status)
        .toBe("released");
      await expect(bridge.nextScan("maintenance")).resolves.toBeNull();
    } finally {
      f.db.close();
    }
  });

  it("rejects an unsent upgrade when the terminal snapshot changes after preread", async () => {
    const f = await createSiteImportFixture();
    try {
      const initial = createExpiry(f);
      f.setSqlNow(f.execution.executionExpiresAt!);
      await initial.expiry.reconcile(f.identity, null);
      const proof = { jobId: f.identity.jobId, requestHash: f.identity.requestHash,
        state: "closed" as const, closedAt: f.execution.executionExpiresAt!,
        grant: { protocol: f.execution.job.protocol, jobId: f.identity.jobId,
          requestHash: f.identity.requestHash, beganAt: f.execution.beganAt!,
          executionExpiresAt: f.execution.executionExpiresAt! } };
      const guarded = new D1SiteExpiryRepository(mutateBeforeUnsentUpgrade(f.db, () => {
        f.db.database.prepare("UPDATE research_runs SET raw_role='upgrade-window-tamper' WHERE id=?1")
          .run(f.identity.runId);
      }), f.research, f.executions);
      await expect(guarded.terminate(f.identity, proof)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
      expect(f.db.database.prepare(`SELECT reason,budget_done FROM research_site_recoveries
        WHERE job_id=?1`).get(f.identity.jobId)).toEqual({ reason: "expired-unknown", budget_done: 1 });
    } finally {
      f.db.close();
    }
  });

  it("accepts a signed-proof-shaped null grant as early irreversible closure authority", async () => {
    const f = await createSiteImportFixture();
    try {
      const { repository, expiry } = createExpiry(f);
      const closedAt = f.execution.beganAt! + 1_000;
      f.setSqlNow(closedAt);
      f.setAppNow(closedAt);
      await expiry.reconcile(f.identity, { jobId: f.identity.jobId, requestHash: f.identity.requestHash,
        state: "closed", closedAt, grant: null });
      expect(await repository.read(f.identity)).toMatchObject({ reason: "executor-unsent",
        quotaDone: true, budgetDone: true });
      expect(await f.research.getRun(f.identity.ownerId, f.identity.runId)).toMatchObject({
        state: "failed", failureCategory: "service-unavailable",
      });
      expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))?.status)
        .toBe("released");
    } finally {
      f.db.close();
    }
  });

  it("lets the real import journal settle a late 6250000 receipt without reviving the failed run", async () => {
    const f = await createSiteImportFixture();
    try {
      const bridge = new D1SiteBridgeRepository(f.db as unknown as D1Database, f.research, f.executions);
      const repository = new D1SiteExpiryRepository(f.db as unknown as D1Database, f.research, f.executions);
      const realImport = new SiteImportCoordinator({
        imports: f.imports,
        publication: new D1SiteImportPublication(f.db as unknown as D1Database, f.research, f.executions),
        research: f.research,
        audits: f.audits,
        entitlements: f.quota,
        budget: f.budget,
      });
      const expiry = new SiteExpiryCoordinator({ repository, bridgeRepository: bridge,
        importer: realImport, importJournal: f.imports, entitlements: f.quota, budget: f.budget });
      f.setSqlNow(f.execution.executionExpiresAt!);
      f.setAppNow(f.execution.executionExpiresAt!);
      await expiry.reconcile(f.identity, null);
      const failed = await f.research.getRun(f.identity.ownerId, f.identity.runId);
      await realImport.complete(f.identity, validReceipt(f.execution, 6_250_000));
      await expiry.reconcile(f.identity, null);
      expect(await f.research.getRun(f.identity.ownerId, f.identity.runId)).toEqual(failed);
      expect(f.db.database.prepare("SELECT count(*) AS n FROM research_packages").get()).toEqual({ n: 0 });
      expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!)))
        .toMatchObject({ status: "settled", settledMicros: 6_250_000 });
      expect(await repository.read(f.identity)).toMatchObject({ quotaDone: true, budgetDone: true });
      await expect(bridge.nextScan("maintenance")).resolves.toBeNull();
    } finally {
      f.db.close();
    }
  });

  it("yields to a real receipt that settles actual cost at the unknown-settlement barrier", async () => {
    const f = await createSiteImportFixture();
    try {
      const bridge = new D1SiteBridgeRepository(f.db as unknown as D1Database, f.research, f.executions);
      const repository = new D1SiteExpiryRepository(f.db as unknown as D1Database, f.research, f.executions);
      const realImport = new SiteImportCoordinator({ imports: f.imports,
        publication: new D1SiteImportPublication(f.db as unknown as D1Database, f.research, f.executions),
        research: f.research, audits: f.audits, entitlements: f.quota, budget: f.budget });
      let raced = false;
      const expiry = new SiteExpiryCoordinator({ repository, bridgeRepository: bridge,
        importer: realImport, importJournal: f.imports, entitlements: f.quota,
        budget: {
          readReservation: (ownerId, id) => f.budget.readReservation(ownerId, id),
          readBucket: (id) => f.budget.readBucket(id),
          settle: async (ownerId, id, settlement) => {
            if (!raced && settlement.kind === "unknown") {
              raced = true;
              await realImport.complete(f.identity, validReceipt(f.execution, 6_250_000));
              throw new Error("unknown settlement lost to actual import");
            }
            return f.budget.settle(ownerId, id, settlement);
          },
        } });
      f.setSqlNow(f.execution.executionExpiresAt!);
      f.setAppNow(f.execution.executionExpiresAt!);
      await expiry.reconcile(f.identity, null);
      expect(raced).toBe(true);
      expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!)))
        .toMatchObject({ status: "settled", settledMicros: 6_250_000 });
      expect(await repository.read(f.identity)).toMatchObject({ quotaDone: true, budgetDone: true });
      expect(await f.research.getRun(f.identity.ownerId, f.identity.runId)).toMatchObject({ state: "failed" });
    } finally {
      f.db.close();
    }
  });

  it("never overwrites a real import that resolves before expiry", async () => {
    const f = await createSiteImportFixture();
    try {
      const bridge = new D1SiteBridgeRepository(f.db as unknown as D1Database, f.research, f.executions);
      const repository = new D1SiteExpiryRepository(f.db as unknown as D1Database, f.research, f.executions);
      const realImport = new SiteImportCoordinator({ imports: f.imports,
        publication: new D1SiteImportPublication(f.db as unknown as D1Database, f.research, f.executions),
        research: f.research, audits: f.audits, entitlements: f.quota, budget: f.budget });
      const expiry = new SiteExpiryCoordinator({ repository, bridgeRepository: bridge,
        importer: realImport, importJournal: f.imports, entitlements: f.quota, budget: f.budget });
      const imported = await realImport.complete(f.identity, validReceipt(f.execution, 100_000));
      await expiry.reconcile(f.identity, null);
      expect(await f.research.getRun(f.identity.ownerId, f.identity.runId)).toEqual(imported.run);
      expect(await repository.read(f.identity)).toBeNull();
      expect(f.db.database.prepare("SELECT count(*) AS n FROM research_packages").get())
        .toEqual({ n: 1 });
    } finally {
      f.db.close();
    }
  });

  it("yields when a real import commits at the terminal batch barrier", async () => {
    const f = await createSiteImportFixture();
    try {
      const realImport = new SiteImportCoordinator({ imports: f.imports,
        publication: new D1SiteImportPublication(f.db as unknown as D1Database, f.research, f.executions),
        research: f.research, audits: f.audits, entitlements: f.quota, budget: f.budget });
      let raced = false;
      const db = { prepare: (sql: string) => (f.db as unknown as D1Database).prepare(sql),
        batch: async (statements: D1PreparedStatement[]) => {
          if (!raced) { raced = true; await realImport.complete(f.identity, validReceipt(f.execution, 625_000)); }
          return (f.db as unknown as D1Database).batch(statements);
        } } as D1Database;
      const repository = new D1SiteExpiryRepository(db, f.research, f.executions);
      f.setSqlNow(f.execution.executionExpiresAt!);
      await expect(repository.terminate(f.identity, null)).resolves.toBeNull();
      expect(raced).toBe(true);
      expect(await f.imports.read(f.identity)).toMatchObject({ phase: 5 });
      expect(f.db.database.prepare("SELECT count(*) AS n FROM research_site_recoveries").get())
        .toEqual({ n: 0 });
    } finally {
      f.db.close();
    }
  });

  it("yields to a real import that commits at the quota-finalize barrier", async () => {
    const f = await createSiteImportFixture();
    try {
      const realImport = new SiteImportCoordinator({ imports: f.imports,
        publication: new D1SiteImportPublication(f.db as unknown as D1Database, f.research, f.executions),
        research: f.research, audits: f.audits, entitlements: f.quota, budget: f.budget });
      const bridge = new D1SiteBridgeRepository(f.db as unknown as D1Database, f.research, f.executions);
      const repository = new D1SiteExpiryRepository(f.db as unknown as D1Database, f.research, f.executions);
      let raced = false;
      const expiry = new SiteExpiryCoordinator({ repository, bridgeRepository: bridge,
        importer: realImport, importJournal: f.imports,
        entitlements: {
          readResearchReservation: (ownerId, key) => f.quota.readResearchReservation(ownerId, key),
          finalize: async () => {
            if (!raced) { raced = true; await realImport.complete(f.identity, validReceipt(f.execution, 625_000)); }
            throw new Error("quota finalize lost to actual import");
          },
        }, budget: f.budget });
      f.setSqlNow(f.execution.executionExpiresAt!);
      await expiry.reconcile(f.identity, null);
      expect(raced).toBe(true);
      expect(await f.imports.read(f.identity)).toMatchObject({ phase: 5 });
      expect(await repository.read(f.identity)).toMatchObject({ quotaDone: true, budgetDone: true });
      expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!)))
        .toMatchObject({ status: "settled", settledMicros: 625_000 });
    } finally {
      f.db.close();
    }
  });

  it("rediscovers a completed conservative hold after closing and reopening SQLite", async () => {
    const directory = mkdtempSync(join(tmpdir(), "site-expiry-reopen-"));
    const safeRoot = `${resolve(tmpdir())}${sep}`;
    expect(resolve(directory).startsWith(safeRoot)).toBe(true);
    expect(resolve(directory).split(sep).at(-1)?.startsWith("site-expiry-reopen-")).toBe(true);
    const filename = join(directory, "site.sqlite");
    const f = await createSiteImportFixture(filename);
    let reopened: SqliteD1 | null = null;
    try {
      const { expiry, bridge } = createExpiry(f);
      const expiryAt = f.execution.executionExpiresAt!;
      f.setSqlNow(expiryAt);
      f.setAppNow(expiryAt);
      await expiry.reconcile(f.identity, null);
      expect(f.db.database.prepare(`SELECT quota_done,budget_done FROM research_site_recoveries
        WHERE job_id=?1`).get(f.identity.jobId)).toEqual({ quota_done: 1, budget_done: 1 });
      expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!)))
        .toMatchObject({ status: "conservative-hold", settledMicros: 0 });
      await expect(bridge.nextScan("maintenance")).resolves.toEqual(f.identity);
      expect(f.db.database.prepare(`SELECT after_job_id FROM research_site_scan_cursors
        WHERE name='maintenance'`).get()).toEqual({ after_job_id: f.identity.jobId });
      f.db.close();

      reopened = new SqliteD1(filename);
      reopened.database.exec("PRAGMA foreign_keys = ON");
      reopened.database.function("unixepoch", { varargs: true }, (...args: unknown[]) => {
        if (args.length === 0) return Math.floor(expiryAt / 1_000);
        if (args.length === 1 && args[0] === "subsec") return expiryAt / 1_000;
        throw new Error("unexpected reopened SQL clock call");
      });
      const research = new D1ResearchRepository(reopened as unknown as D1Database, {
        now: () => expiryAt, createId: () => "unused-run", createJobId: () => crypto.randomUUID(),
      });
      const executions = new D1SiteExecutionRepository(reopened as unknown as D1Database, research);
      const reopenedBridge = new D1SiteBridgeRepository(reopened as unknown as D1Database, research, executions);
      await expect(reopenedBridge.nextScan("maintenance")).resolves.toBeNull();
      await expect(reopenedBridge.nextScan("maintenance")).resolves.toEqual(f.identity);
    } finally {
      reopened?.close();
      try { f.db.close(); } catch { /* already closed before reopen */ }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("recovers real quota, budget, and budget-marker effects after their acknowledgements are lost", async () => {
    const f = await createSiteImportFixture();
    try {
      const bridge = new D1SiteBridgeRepository(f.db as unknown as D1Database, f.research, f.executions);
      const repository = new D1SiteExpiryRepository(
        loseRecoveryMarkerAck(f.db as unknown as D1Database, 2), f.research, f.executions,
      );
      let quotaLost = true;
      let budgetLost = true;
      const expiry = new SiteExpiryCoordinator({ repository, bridgeRepository: bridge,
        importer: { reconcileMetadata: async () => { throw new Error("unexpected journal"); } },
        importJournal: { read: async () => null },
        entitlements: {
          readResearchReservation: (ownerId, key) => f.quota.readResearchReservation(ownerId, key),
          finalize: async (id, status, units) => {
            await f.quota.finalize(id, status, units);
            if (quotaLost) { quotaLost = false; throw new Error("lost quota finalize acknowledgement"); }
          },
        },
        budget: {
          readReservation: (ownerId, id) => f.budget.readReservation(ownerId, id),
          readBucket: (id) => f.budget.readBucket(id),
          settle: async (ownerId, id, settlement) => {
            const saved = await f.budget.settle(ownerId, id, settlement);
            if (budgetLost) { budgetLost = false; throw new Error("lost budget settle acknowledgement"); }
            return saved;
          },
        } });
      f.setSqlNow(f.execution.executionExpiresAt!);
      await expiry.reconcile(f.identity, null);
      expect({ quotaLost, budgetLost }).toEqual({ quotaLost: false, budgetLost: false });
      expect(await repository.read(f.identity)).toMatchObject({ quotaDone: true, budgetDone: true });
      expect(f.db.database.prepare(`SELECT count(*) AS n FROM quota_ledger
        WHERE reservation_id=?1 AND entry_kind='failed'`).get(f.execution.quotaReservationId!))
        .toEqual({ n: 1 });
      const reservation = await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!);
      expect(reservation).toMatchObject({ status: "conservative-hold", settledMicros: 0 });
      const day = await f.budget.readBucket(reservation!.dayBucketId);
      const month = await f.budget.readBucket(reservation!.monthBucketId);
      expect(day?.reservedMicros).toBe(f.execution.policy.maximumMicros);
      expect(month?.reservedMicros).toBe(f.execution.policy.maximumMicros);
    } finally {
      f.db.close();
    }
  });

  it("rejects mismatched and non-closed unsent proofs without changing held accounting", async () => {
    const f = await createSiteImportFixture();
    try {
      const { expiry } = createExpiry(f);
      f.setSqlNow(f.execution.executionExpiresAt!);
      await expiry.reconcile(f.identity, null);
      const grant = { protocol: f.execution.job.protocol, jobId: f.identity.jobId,
        requestHash: f.identity.requestHash, beganAt: f.execution.beganAt!,
        executionExpiresAt: f.execution.executionExpiresAt! };
      const invalid = [
        { jobId: crypto.randomUUID(), requestHash: f.identity.requestHash, state: "closed", closedAt: f.execution.executionExpiresAt!, grant },
        { jobId: f.identity.jobId, requestHash: "f".repeat(64), state: "closed", closedAt: f.execution.executionExpiresAt!, grant },
        { jobId: f.identity.jobId, requestHash: f.identity.requestHash, state: "claimed", closedAt: f.execution.executionExpiresAt!, grant },
        { jobId: f.identity.jobId, requestHash: f.identity.requestHash, state: "closed", closedAt: f.execution.executionExpiresAt!,
          grant: { ...grant, beganAt: grant.beganAt + 1 } },
      ];
      for (const proof of invalid) await expect(expiry.reconcile(f.identity, proof as never)).rejects.toBeTruthy();
      expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!)))
        .toMatchObject({ status: "conservative-hold", settledMicros: 0 });
    } finally {
      f.db.close();
    }
  });

  it("proves the durable effect after a recovery marker acknowledgement is lost", async () => {
    const f = await createSiteImportFixture();
    try {
      const bridge = new D1SiteBridgeRepository(f.db as unknown as D1Database, f.research, f.executions);
      const repository = new D1SiteExpiryRepository(
        loseFirstRecoveryMarkerAck(f.db as unknown as D1Database), f.research, f.executions,
      );
      const expiry = new SiteExpiryCoordinator({ repository, bridgeRepository: bridge,
        importer: { reconcileMetadata: async () => { throw new Error("unexpected journal"); } },
        importJournal: { read: async () => null }, entitlements: f.quota, budget: f.budget });
      f.setSqlNow(f.execution.executionExpiresAt!);
      f.setAppNow(f.execution.executionExpiresAt!);
      await expiry.reconcile(f.identity, null);
      expect(await repository.read(f.identity)).toMatchObject({ quotaDone: true, budgetDone: true });
    } finally {
      f.db.close();
    }
  });

  it("recovers the exact terminal snapshot after the atomic expiry batch acknowledgement is lost", async () => {
    const f = await createSiteImportFixture();
    try {
      const repository = new D1SiteExpiryRepository(
        loseFirstExpiryBatchAck(f.db as unknown as D1Database), f.research, f.executions,
      );
      f.setSqlNow(f.execution.executionExpiresAt!);
      await expect(repository.terminate(f.identity, null)).resolves.toMatchObject({
        reason: "expired-unknown", quotaDone: false, budgetDone: false,
      });
      expect(await f.research.getRun(f.identity.ownerId, f.identity.runId)).toMatchObject({ state: "failed" });
      expect(f.db.database.prepare("SELECT count(*) AS n FROM research_site_recoveries").get())
        .toEqual({ n: 1 });
    } finally {
      f.db.close();
    }
  });

  it("rejects a completed marker replay after same-version terminal corruption or an invalid quota group", async () => {
    const f = await createSiteImportFixture();
    try {
      const { repository, expiry } = createExpiry(f);
      f.setSqlNow(f.execution.executionExpiresAt!);
      f.setAppNow(f.execution.executionExpiresAt!);
      await expiry.reconcile(f.identity, null);
      const recovery = await repository.read(f.identity);
      if (!recovery) throw new Error("missing recovery");
      f.db.database.prepare("UPDATE research_runs SET error_code='tampered' WHERE id=?1").run(f.identity.runId);
      await expect(repository.mark(f.identity, "quota", recovery.version))
        .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
      f.db.database.prepare("UPDATE research_runs SET error_code='interrupted' WHERE id=?1").run(f.identity.runId);
      f.db.database.prepare(`INSERT INTO quota_ledger
        (id,user_id,purpose,reservation_id,idempotency_key,entry_kind,units,created_at)
        VALUES ('extra-terminal',?1,'role-research',?2,?3,'rejected',0,?4)`)
        .run(f.identity.ownerId, f.execution.quotaReservationId, f.execution.quotaKey,
          f.execution.executionExpiresAt!);
      await expect(repository.mark(f.identity, "quota", recovery.version))
        .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    } finally {
      f.db.close();
    }
  });

  it("rejects same-version terminal replacement in the SQL write window for quota and budget markers", async () => {
    for (const ordinal of [1, 2]) {
      const f = await createSiteImportFixture();
      try {
        const bridge = new D1SiteBridgeRepository(f.db as unknown as D1Database, f.research, f.executions);
        const repository = new D1SiteExpiryRepository(mutateBeforeRecoveryMarker(f.db, ordinal, () => {
          if (ordinal === 1) {
            f.db.database.prepare("UPDATE research_runs SET error_code='write-window-tamper' WHERE id=?1")
              .run(f.identity.runId);
          } else {
            f.db.database.prepare("UPDATE research_runs SET created_at=created_at+1 WHERE id=?1")
              .run(f.identity.runId);
          }
        }), f.research, f.executions);
        const expiry = new SiteExpiryCoordinator({ repository, bridgeRepository: bridge,
          importer: { reconcileMetadata: async () => { throw new Error("unexpected journal"); } },
          importJournal: { read: async () => null }, entitlements: f.quota, budget: f.budget });
        f.setSqlNow(f.execution.executionExpiresAt!);
        await expect(expiry.reconcile(f.identity, null)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
        const row = f.db.database.prepare(`SELECT quota_done,budget_done FROM research_site_recoveries
          WHERE job_id=?1`).get(f.identity.jobId);
        expect(row).toEqual(ordinal === 1
          ? { quota_done: 0, budget_done: 0 }
          : { quota_done: 1, budget_done: 0 });
      } finally {
        f.db.close();
      }
    }
  });

  it("rejects same-version canonical journal substitution in the budget-marker SQL window", async () => {
    const f = await createSiteImportFixture();
    try {
      const base = new D1SiteExpiryRepository(f.db as unknown as D1Database, f.research, f.executions);
      f.setSqlNow(f.execution.executionExpiresAt!);
      const recovery = await base.terminate(f.identity, null);
      expect(recovery).toMatchObject({ quotaDone: false, budgetDone: false });
      const realImport = new SiteImportCoordinator({ imports: f.imports,
        publication: new D1SiteImportPublication(f.db as unknown as D1Database, f.research, f.executions),
        research: f.research, audits: f.audits, entitlements: f.quota, budget: f.budget });
      await realImport.complete(f.identity, validReceipt(f.execution, 6_250_000));
      const quotaMarked = await base.mark(f.identity, "quota", recovery!.version);
      const guarded = new D1SiteExpiryRepository(mutateBeforeRecoveryMarker(f.db, 1, () => {
        f.db.database.exec("DROP TRIGGER research_site_imports_immutable_guard");
        f.db.database.exec("DROP TRIGGER research_site_imports_lifecycle_guard");
        f.db.database.prepare(`UPDATE research_site_imports SET settlement_json='{"kind":"unknown"}'
          WHERE run_id=?1`).run(f.identity.runId);
      }), f.research, f.executions);
      await expect(guarded.mark(f.identity, "budget", quotaMarked.version))
        .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
      expect(f.db.database.prepare(`SELECT quota_done,budget_done FROM research_site_recoveries
        WHERE job_id=?1`).get(f.identity.jobId)).toEqual({ quota_done: 1, budget_done: 0 });
    } finally {
      f.db.close();
    }
  });

  it("uses the actual executor close winner for a null-grant lost-begin reply and never treats a claim as unsent", async () => {
    const f = await createSiteImportFixture();
    const held = await createSiteImportFixture();
    const closedDb = createExecutorDb();
    const claimedDb = createExecutorDb();
    try {
      const closedStore = new D1BridgeJobStore(closedDb as unknown as D1Database);
      const closedCompetitor = new D1BridgeJobStore(closedDb as unknown as D1Database);
      await closedStore.accept(f.execution.job, f.execution.createdAt);
      await closedStore.recordWorkflowAccepted(f.execution.job, f.execution.jobId, f.execution.createdAt + 1);
      const closed = await closedStore.closeUnclaimed(f.execution.job, f.execution.beganAt! + 1_000);
      expect(closed).toMatchObject({ dispatchState: "closed", grant: null });
      const rejectedGrant = { protocol: f.execution.job.protocol, jobId: f.execution.jobId,
        requestHash: f.execution.requestHash, beganAt: f.execution.beganAt!,
        executionExpiresAt: f.execution.executionExpiresAt! };
      await expect(closedCompetitor.claimDispatch(f.execution.job, rejectedGrant,
        f.execution.beganAt! + 1_500)).rejects.toMatchObject({ code: "conflict" });
      await expect(closedCompetitor.get(f.execution.jobId))
        .resolves.toMatchObject({ dispatchState: "closed", grant: null });
      await expect(closedCompetitor.closeUnclaimed(f.execution.job, f.execution.beganAt! + 2_000))
        .resolves.toMatchObject({ dispatchState: "closed", grant: null, dispatchAt: closed.dispatchAt });

      const { expiry } = createExpiry(f);
      f.setSqlNow(closed.dispatchAt!);
      f.setAppNow(closed.dispatchAt!);
      await expiry.reconcile(f.identity, { jobId: closed.job.jobId, requestHash: closed.requestHash,
        state: "closed", closedAt: closed.dispatchAt!, grant: closed.grant });
      expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))?.status)
        .toBe("released");

      const claimedStore = new D1BridgeJobStore(claimedDb as unknown as D1Database);
      const claimedCompetitor = new D1BridgeJobStore(claimedDb as unknown as D1Database);
      const grant = { protocol: held.execution.job.protocol, jobId: held.execution.jobId,
        requestHash: held.execution.requestHash, beganAt: held.execution.beganAt!,
        executionExpiresAt: held.execution.executionExpiresAt! };
      await claimedStore.accept(held.execution.job, held.execution.createdAt);
      await claimedStore.recordWorkflowAccepted(held.execution.job, held.execution.jobId, held.execution.createdAt + 1);
      await claimedStore.recordBegin(held.execution.job, grant);
      await expect(claimedStore.claimDispatch(held.execution.job, grant, held.execution.beganAt! + 1_000))
        .resolves.toBe(true);
      const afterClaim = await claimedCompetitor.closeUnclaimed(held.execution.job, held.execution.beganAt! + 2_000);
      expect(afterClaim.dispatchState).toBe("claimed");
      const heldExpiry = createExpiry(held);
      held.setSqlNow(held.execution.executionExpiresAt!);
      await heldExpiry.expiry.reconcile(held.identity, null);
      expect((await held.budget.readReservation(held.identity.ownerId, held.execution.budgetReservationId!)))
        .toMatchObject({ status: "conservative-hold", settledMicros: 0 });
    } finally {
      closedDb.close();
      claimedDb.close();
      f.db.close();
      held.db.close();
    }
  });
});
