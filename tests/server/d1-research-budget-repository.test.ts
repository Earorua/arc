import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { D1ResearchBudgetRepository } from "../../app/server/research/d1-budget-repository";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import type { BudgetDecision, BudgetReserveCommand, BudgetSettlement } from "../../app/server/research/budget";
import { createResearchD1, seedUser, SqliteD1 } from "../helpers/sqlite-d1";
import { createControlPoint, createSiteAdmissionFixture } from "../helpers/site-admission-fixture";

const day = Date.parse("2026-08-31T00:00:00Z");
const databases: ReturnType<typeof createResearchD1>[] = [];
const files = new Set<string>();
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const file of files) {
    const target = resolve(file);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("site-budget-release-")) {
      throw new Error("Refusing to remove an unexpected fixture file");
    }
    rmSync(target, { force: true });
  }
  files.clear();
});
function setup() {
  const db = createResearchD1(); databases.push(db);
  seedUser(db, "owner-a"); seedUser(db, "owner-b");
  for (const [id, owner] of [["a", "owner-a"], ["b", "owner-a"], ["c", "owner-b"]]) {
    db.database.prepare(`INSERT INTO research_runs(id,user_id,request_id,mutation_id,raw_role,normalized_role_key,locale,input_fingerprint,config_fingerprint,state,active_slot,active_expires_at) VALUES(?1,?2,?3,?4,?1,?1,'en-US','input','config','queued',1,?5)`).run(`run-${id}`, owner, `request-${id}`, `mutation-${id}`, day + 60_000);
  }
  let sequence = 0; let now = day + 1000;
  const repository = new D1ResearchBudgetRepository(db as unknown as D1Database, { now: () => now, createId: () => `budget-${++sequence}` });
  return { db, repository, setNow: (value: number) => { now = value; } };
}
function command(id = "a", overrides: Partial<BudgetReserveCommand> = {}): BudgetReserveCommand {
  return { ownerId: "owner-a", runId: `run-${id}`, requestId: `request-${id}`, maximumMicros: 700, dailyBudgetMicros: 1000, monthlyBudgetMicros: 1000, expiresAt: day + 60_000, ...overrides };
}
function allowed(result: BudgetDecision) { expect(result.allowed).toBe(true); if (!result.allowed) throw new Error("fixture denied"); return result.reservation; }
function balances(db: ReturnType<typeof createResearchD1>) { return db.database.prepare("SELECT period_kind,reserved_micros,settled_micros,version FROM ai_budget_buckets ORDER BY period_kind").all(); }

describe("D1ResearchBudgetRepository", () => {
  it("releases an exact reserved budget after durable known-unsent closure", async () => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const decision = await fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));
    if (!decision.allowed) throw new Error("remote budget fixture denied");
    const closed = await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution, "denied"));

    const released = await fixture.budget.releaseRemoteBeforeBegin(
      fixture.releaseCommand(closed.execution, decision.reservation.id),
    );
    expect(released).toMatchObject({ status: "released", settledMicros: 0 });
    expect(balances(fixture.db)).toEqual([
      { period_kind: "day", reserved_micros: 0, settled_micros: 0, version: 2 },
      { period_kind: "month", reserved_micros: 0, settled_micros: 0, version: 2 },
    ]);
    await expect(fixture.executions.read(closed.execution.ownerId, closed.execution.runId)).resolves.toEqual(closed.execution);
  });

  it("replays an exact released reservation without changing either bucket", async () => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const decision = await fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));
    if (!decision.allowed) throw new Error("remote budget fixture denied");
    const closed = await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution, "interrupted"));
    const command = fixture.releaseCommand(closed.execution, decision.reservation.id);
    const released = await fixture.budget.releaseRemoteBeforeBegin(command);
    const after = balances(fixture.db);
    await expect(fixture.budget.releaseRemoteBeforeBegin(command)).resolves.toEqual(released);
    expect(balances(fixture.db)).toEqual(after);
  });

  it("releases an admitted execution only through its exact stored budget reservation", async () => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const reservations = await fixture.reserveAdmission(created.execution);
    const admitted = await fixture.executions.markAdmitted(fixture.admissionCommand(created.execution, reservations));
    const closed = await fixture.executions.closeBeforeBegin(fixture.closeCommand(admitted));
    await expect(fixture.budget.releaseRemoteBeforeBegin(
      fixture.releaseCommand(closed.execution, reservations.budgetReservationId),
    )).resolves.toMatchObject({ id: reservations.budgetReservationId, status: "released", settledMicros: 0 });
  });

  it.each(["owner", "run", "request", "job", "hash", "reservation", "missing"] as const)(
    "rejects an incompatible remote release %s identity",
    async (kind) => {
      const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
      const created = await fixture.createRemote();
      const decision = await fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));
      if (!decision.allowed) throw new Error("remote budget fixture denied");
      const closed = await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution));
      const command = fixture.releaseCommand(closed.execution, decision.reservation.id);
      const changed = {
        ...command,
        ...(kind === "owner" ? { ownerId: "owner-b" } : {}),
        ...(kind === "run" ? { runId: "research-run-other" } : {}),
        ...(kind === "request" ? { requestId: "request-other" } : {}),
        ...(kind === "job" ? { jobId: "00000000-0000-4000-8000-999999999999" } : {}),
        ...(kind === "hash" ? { requestHash: "f".repeat(64) } : {}),
        ...(kind === "reservation" || kind === "missing" ? { reservationId: "budget-missing" } : {}),
      };
      await expect(fixture.budget.releaseRemoteBeforeBegin(changed)).rejects.toMatchObject({
        code: kind === "owner" || kind === "reservation" || kind === "missing" ? "NOT_FOUND" : "CONFLICT",
      });
      await expect(fixture.budget.readReservation(created.execution.ownerId, decision.reservation.id)).resolves
        .toMatchObject({ status: "reserved" });
    },
  );

  it.each(["open", "begun", "cached"] as const)("rejects release from a valid but incompatible %s lifecycle", async (kind) => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const decision = await fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));
    if (!decision.allowed) throw new Error("remote budget fixture denied");
    if (kind === "begun") {
      const quota = await fixture.quota.admitRemoteResearch(fixture.quotaCommand(created.execution));
      if (!quota.allowed) throw new Error("remote quota fixture denied");
      const admitted = await fixture.executions.markAdmitted(fixture.admissionCommand(created.execution, {
        quotaReservationId: quota.reservationId,
        budgetReservationId: decision.reservation.id,
      }));
      const beganAt = admitted.admittedAt! + 1;
      fixture.db.database.prepare("UPDATE research_site_executions SET began_at=?1,execution_expires_at=?1+1260000,version=version+1,updated_at=?1 WHERE run_id=?2")
        .run(beganAt, admitted.runId);
      fixture.db.database.prepare("UPDATE research_runs SET state='researching',state_version=state_version+1,active_expires_at=?1,updated_at=?2 WHERE id=?3")
        .run(beganAt + 1_260_000, beganAt, admitted.runId);
    } else if (kind === "cached") {
      fixture.db.database.prepare(`UPDATE research_site_executions SET admission_state='closed',closed_at=?1,
        close_reason='cached',version=version+1,updated_at=?1 WHERE run_id=?2`).run(decision.reservation.createdAt, created.run.id);
      fixture.db.database.prepare(`UPDATE research_runs SET state='failed',state_version=state_version+1,
        retryable=1,active_slot=NULL,active_expires_at=NULL,error_code='service-failed',
        public_failure_category='service-unavailable',updated_at=?1 WHERE id=?2`)
        .run(decision.reservation.createdAt, created.run.id);
    }
    await expect(fixture.budget.releaseRemoteBeforeBegin(fixture.releaseCommand(created.execution, decision.reservation.id)))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it.each(["released", "held", "settled"] as const)("never overwrites a pre-existing %s accounting outcome", async (kind) => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const decision = await fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));
    if (!decision.allowed) throw new Error("remote budget fixture denied");
    if (kind === "released") await fixture.budget.settle(created.execution.ownerId, decision.reservation.id, { kind: "not-charged" });
    if (kind === "held") await fixture.budget.settle(created.execution.ownerId, decision.reservation.id, { kind: "unknown" });
    if (kind === "settled") await fixture.budget.settle(created.execution.ownerId, decision.reservation.id, { kind: "actual", actualMicros: 123 });
    const closed = await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution));
    const before = await fixture.budget.readReservation(created.execution.ownerId, decision.reservation.id);
    const beforeBalances = balances(fixture.db);
    const release = fixture.budget.releaseRemoteBeforeBegin(fixture.releaseCommand(closed.execution, decision.reservation.id));
    if (kind === "released") await expect(release).resolves.toEqual(before);
    else await expect(release).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(fixture.budget.readReservation(created.execution.ownerId, decision.reservation.id)).resolves.toEqual(before);
    expect(balances(fixture.db)).toEqual(beforeBalances);
  });

  it.each(["maximum", "expiry"] as const)("rejects a reservation with a corrupt immutable %s", async (field) => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const decision = await fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));
    if (!decision.allowed) throw new Error("remote budget fixture denied");
    const closed = await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution));
    fixture.db.database.prepare(field === "maximum"
      ? "UPDATE ai_budget_reservations SET maximum_reserved_micros=maximum_reserved_micros-1 WHERE id=?1"
      : "UPDATE ai_budget_reservations SET expires_at=expires_at+1 WHERE id=?1").run(decision.reservation.id);
    const before = balances(fixture.db);
    await expect(fixture.budget.releaseRemoteBeforeBegin(fixture.releaseCommand(closed.execution, decision.reservation.id)))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(balances(fixture.db)).toEqual(before);
  });

  it("releases after the original reservation expiry without renewing it", async () => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const decision = await fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));
    if (!decision.allowed) throw new Error("remote budget fixture denied");
    const closed = await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution, "expired"));
    fixture.setAppNow(created.execution.reservationExpiresAt + 1);
    fixture.setSqlNow(created.execution.reservationExpiresAt + 1);
    await expect(fixture.budget.releaseRemoteBeforeBegin(fixture.releaseCommand(closed.execution, decision.reservation.id)))
      .resolves.toMatchObject({ status: "released", expiresAt: created.execution.reservationExpiresAt });
  });

  it.each(["held", "settled"] as const)("the actual release fence preserves a competing coherent %s outcome", async (kind) => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const decision = await fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));
    if (!decision.allowed) throw new Error("remote budget fixture denied");
    const closed = await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution));
    const point = createControlPoint();
    const batch = fixture.db.batch.bind(fixture.db); let paused = false;
    fixture.db.batch = async (statements) => {
      const sql = (statements[0] as unknown as { sql?: string } | undefined)?.sql;
      if (!paused && typeof sql === "string" && sql.startsWith("UPDATE ai_budget_reservations AS release_reservation")) {
        paused = true;
        await point.wait();
      }
      return batch(statements);
    };
    const pending = fixture.budget.releaseRemoteBeforeBegin(fixture.releaseCommand(closed.execution, decision.reservation.id));
    await point.entered;
    await fixture.budget.settle(created.execution.ownerId, decision.reservation.id,
      kind === "held" ? { kind: "unknown" } : { kind: "actual", actualMicros: 321 });
    const competingReservation = await fixture.budget.readReservation(created.execution.ownerId, decision.reservation.id);
    const competingBalances = balances(fixture.db);
    const competingExecution = await fixture.executions.read(closed.execution.ownerId, closed.execution.runId);
    point.resume();
    await expect(pending).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(fixture.budget.readReservation(created.execution.ownerId, decision.reservation.id)).resolves.toEqual(competingReservation);
    expect(balances(fixture.db)).toEqual(competingBalances);
    await expect(fixture.executions.read(closed.execution.ownerId, closed.execution.runId)).resolves.toEqual(competingExecution);
  });

  it.each([0, 1] as const)("rolls back release when actual bucket decrement %s changes zero rows", async (target) => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const decision = await fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));
    if (!decision.allowed) throw new Error("remote budget fixture denied");
    const closed = await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution));
    const before = balances(fixture.db); const prepare = fixture.db.prepare.bind(fixture.db); let decrement = 0;
    fixture.db.prepare = ((sql: string) => {
      if (!sql.includes("SET reserved_micros=reserved_micros-(SELECT maximum_reserved_micros")) return prepare(sql);
      const current = decrement++;
      return prepare(current === target ? `${sql} AND 0` : sql);
    }) as typeof fixture.db.prepare;
    await expect(fixture.budget.releaseRemoteBeforeBegin(fixture.releaseCommand(closed.execution, decision.reservation.id)))
      .rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE" });
    await expect(fixture.budget.readReservation(created.execution.ownerId, decision.reservation.id)).resolves
      .toMatchObject({ status: "reserved" });
    expect(balances(fixture.db)).toEqual(before);
  });

  it.each([0, 1, 2, 3] as const)("rolls back the whole release batch when statement %s throws", async (index) => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const decision = await fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));
    if (!decision.allowed) throw new Error("remote budget fixture denied");
    const closed = await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution));
    const before = balances(fixture.db); fixture.db.failAtBatchStatement = index;
    await expect(fixture.budget.releaseRemoteBeforeBegin(fixture.releaseCommand(closed.execution, decision.reservation.id)))
      .rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE" });
    fixture.db.failAtBatchStatement = null;
    await expect(fixture.budget.readReservation(created.execution.ownerId, decision.reservation.id)).resolves
      .toMatchObject({ status: "reserved" });
    expect(balances(fixture.db)).toEqual(before);
  });

  it("recovers a committed release after losing its batch acknowledgement", async () => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const decision = await fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));
    if (!decision.allowed) throw new Error("remote budget fixture denied");
    const closed = await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution));
    const batch = fixture.db.batch.bind(fixture.db); let lost = false;
    fixture.db.batch = async (statements) => {
      const result = await batch(statements);
      const sql = (statements[0] as unknown as { sql?: string } | undefined)?.sql;
      if (!lost && typeof sql === "string" && sql.startsWith("UPDATE ai_budget_reservations AS release_reservation")) {
        lost = true;
        throw new Error("lost release acknowledgement");
      }
      return result;
    };
    await expect(fixture.budget.releaseRemoteBeforeBegin(fixture.releaseCommand(closed.execution, decision.reservation.id)))
      .resolves.toMatchObject({ status: "released", settledMicros: 0 });
  });

  it("snapshots the release command before its first storage await", async () => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const decision = await fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));
    if (!decision.allowed) throw new Error("remote budget fixture denied");
    const closed = await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution));
    const command = fixture.releaseCommand(closed.execution, decision.reservation.id);
    const point = createControlPoint(); const prepare = fixture.db.prepare.bind(fixture.db); let paused = false;
    fixture.db.prepare = ((sql: string) => {
      const statement = prepare(sql);
      if (paused || !sql.includes("FROM ai_budget_reservations r JOIN research_runs u")) return statement;
      paused = true;
      const bind = statement.bind.bind(statement);
      statement.bind = ((...values: unknown[]) => {
        const bound = bind(...values); const first = bound.first.bind(bound);
        bound.first = async <T>() => { await point.wait(); return first<T>(); };
        return bound;
      }) as typeof statement.bind;
      return statement;
    }) as typeof fixture.db.prepare;
    const pending = fixture.budget.releaseRemoteBeforeBegin(command);
    await point.entered;
    const mutable = command as { requestId: string; requestHash: string; reservationId: string };
    mutable.requestId = "request-mutated"; mutable.requestHash = "f".repeat(64); mutable.reservationId = "budget-mutated";
    point.resume();
    await expect(pending).resolves.toMatchObject({ id: decision.reservation.id, status: "released" });
  });

  it("rejects unsafe release command shapes before storage", async () => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const valid = fixture.releaseCommand(created.execution, "budget-missing");
    const values = [
      { ...valid, unknown: true },
      Object.assign({ ...valid }, { [Symbol("secret")]: true }),
      Object.defineProperty({ ...valid }, "reservationId", { enumerable: true, get: () => "budget-missing" }),
      Object.assign(Object.create(null), valid),
    ];
    for (const value of values) {
      await expect(fixture.budget.releaseRemoteBeforeBegin(value)).rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE" });
    }
    expect(fixture.db.preparedSql.filter((sql) => sql.includes("FROM ai_budget_reservations r JOIN research_runs u"))).toHaveLength(0);
  });

  it("reopens a file database and releases with new repository instances", async () => {
    const path = join(tmpdir(), `site-budget-release-${process.pid}-${Date.now()}.sqlite`); files.add(path);
    const fixture = createSiteAdmissionFixture(path); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const decision = await fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));
    if (!decision.allowed) throw new Error("remote budget fixture denied");
    const closed = await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution));
    fixture.db.close(); databases.splice(databases.indexOf(fixture.db), 1);

    const reopened = new SqliteD1(path); databases.push(reopened); reopened.database.exec("PRAGMA foreign_keys = ON");
    reopened.database.function("unixepoch", { varargs: true }, (...args: unknown[]) => {
      if (args.length === 0) return Math.floor(closed.execution.closedAt! / 1_000);
      if (args.length === 1 && args[0] === "subsec") return closed.execution.closedAt! / 1_000;
      throw new Error("Unexpected SQL clock call in reopened fixture");
    });
    const research = new D1ResearchRepository(reopened as unknown as D1Database);
    const executions = new D1SiteExecutionRepository(reopened as unknown as D1Database, research);
    const budget = new D1ResearchBudgetRepository(reopened as unknown as D1Database);
    const stored = await executions.read(closed.execution.ownerId, closed.execution.runId);
    if (!stored) throw new Error("reopened execution missing");
    const releaseCommand = {
      ownerId: stored.ownerId, runId: stored.runId, requestId: stored.requestId,
      jobId: stored.jobId, requestHash: stored.requestHash, reservationId: decision.reservation.id,
    };
    const released = await budget.releaseRemoteBeforeBegin(releaseCommand);
    expect(released).toMatchObject({ status: "released" });
    reopened.close(); databases.splice(databases.indexOf(reopened), 1);

    const replayedDb = new SqliteD1(path); databases.push(replayedDb); replayedDb.database.exec("PRAGMA foreign_keys = ON");
    const replayedResearch = new D1ResearchRepository(replayedDb as unknown as D1Database);
    const replayedExecutions = new D1SiteExecutionRepository(replayedDb as unknown as D1Database, replayedResearch);
    const replayedBudget = new D1ResearchBudgetRepository(replayedDb as unknown as D1Database);
    await expect(replayedExecutions.closeBeforeBegin({
      ownerId: releaseCommand.ownerId,
      runId: releaseCommand.runId,
      requestId: releaseCommand.requestId,
      jobId: releaseCommand.jobId,
      requestHash: releaseCommand.requestHash,
      reason: "denied",
    }))
      .resolves.toEqual(closed);
    await expect(replayedBudget.releaseRemoteBeforeBegin(releaseCommand)).resolves.toEqual(released);
  });

  it("fails unavailable on malformed durable bucket data without releasing", async () => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const decision = await fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));
    if (!decision.allowed) throw new Error("remote budget fixture denied");
    const closed = await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution));
    fixture.db.database.exec("PRAGMA ignore_check_constraints=ON");
    fixture.db.database.prepare("UPDATE ai_budget_buckets SET version=-1 WHERE id=?1").run(decision.reservation.monthBucketId);
    await expect(fixture.budget.releaseRemoteBeforeBegin(fixture.releaseCommand(closed.execution, decision.reservation.id)))
      .rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE" });
    expect(fixture.db.database.prepare("SELECT status FROM ai_budget_reservations WHERE id=?1").get(decision.reservation.id))
      .toEqual({ status: "reserved" });
  });

  it("reserves both frozen buckets for an exact open remote execution and replays without authority", async () => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const budgetCommand = fixture.budgetCommand(created.execution);

    const first = await fixture.budget.reserveRemote(budgetCommand);
    expect(first).toMatchObject({ allowed: true, replayed: false, providerAttemptAllowed: true });
    if (!first.allowed) throw new Error("remote budget fixture denied");
    await expect(fixture.budget.reserveRemote(budgetCommand)).resolves.toEqual({
      allowed: true,
      reservation: first.reservation,
      replayed: true,
      providerAttemptAllowed: false,
    });
    expect(fixture.db.database.prepare("SELECT period_kind,reserved_micros,version FROM ai_budget_buckets ORDER BY period_kind").all()).toEqual([
      { period_kind: "day", reserved_micros: created.execution.policy.maximumMicros, version: 1 },
      { period_kind: "month", reserved_micros: created.execution.policy.maximumMicros, version: 1 },
    ]);
  });

  it("fences ordinary budget insertion when a run becomes remote at the actual batch", async () => {
    const { repository, db } = setup();
    const batch = db.batch.bind(db);
    db.batch = async (statements) => {
      db.database.exec("DROP TRIGGER research_runs_execution_classification_immutable");
      db.database.prepare("UPDATE research_runs SET execution_mode='cloudflare-workflow-v1',remote_quota_key='remote-quota-key' WHERE id='run-a'").run();
      return batch(statements);
    };
    await expect(repository.reserve(command())).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.database.prepare("SELECT count(*) count FROM ai_budget_reservations").get()).toEqual({ count: 0 });
    expect(balances(db).every((row) => row.reserved_micros === 0 && row.version === 0)).toBe(true);
  });

  it("rejects ordinary replay after its run carries the remote marker", async () => {
    const { repository, db } = setup();
    await repository.reserve(command());
    db.database.exec("DROP TRIGGER research_runs_execution_classification_immutable");
    db.database.prepare("UPDATE research_runs SET execution_mode='cloudflare-workflow-v1',remote_quota_key='remote-quota-key' WHERE id='run-a'").run();
    const before = balances(db);
    await expect(repository.reserve(command())).rejects.toMatchObject({ code: "CONFLICT" });
    expect(balances(db)).toEqual(before);
  });

  it("denies mismatched frozen remote identity and accounting policy before writes", async () => {
    const overrides = [
      { ownerId: "owner-b" },
      { runId: "research-run-other" },
      { requestId: "request-other" },
      { jobId: "00000000-0000-4000-8000-999999999999" },
      { requestHash: "f".repeat(64) },
      { dailyBudgetMicros: 20_000_001 },
      { monthlyBudgetMicros: 100_000_001 },
      { maximumMicros: 4_999_999 },
      { expiresAt: Date.parse("2026-09-15T12:23:00.001Z") },
    ];
    for (const override of overrides) {
      const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
      const created = await fixture.createRemote();
      await expect(fixture.budget.reserveRemote({ ...fixture.budgetCommand(created.execution), ...override }))
        .rejects.toMatchObject({ code: "CONFLICT" });
      expect(fixture.db.database.prepare("SELECT count(*) count FROM ai_budget_reservations").get()).toEqual({ count: 0 });
      expect(fixture.db.database.prepare("SELECT count(*) count FROM ai_budget_buckets").get()).toEqual({ count: 0 });
    }
  });

  it("fences the actual remote budget batch after the execution closes", async () => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const batch = fixture.db.batch.bind(fixture.db);
    fixture.db.batch = async (statements) => {
      fixture.db.database.prepare("UPDATE research_site_executions SET admission_state='closed',closed_at=?1,close_reason='denied',version=version+1,updated_at=?1 WHERE run_id=?2").run(Date.parse("2026-09-15T12:00:01.000Z"), created.run.id);
      return batch(statements);
    };
    await expect(fixture.budget.reserveRemote(fixture.budgetCommand(created.execution))).resolves.toEqual({ allowed: false, reason: "budget" });
    expect(fixture.db.database.prepare("SELECT count(*) count FROM ai_budget_reservations").get()).toEqual({ count: 0 });
    expect(fixture.db.database.prepare("SELECT count(*) count FROM ai_budget_buckets").get()).toEqual({ count: 0 });
  });

  it("uses SQL day and month at the actual remote budget insert while the queue remains open", async () => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const beforeRollover = Date.parse("2026-08-31T23:59:30.000Z");
    fixture.setAppNow(beforeRollover); fixture.setSqlNow(beforeRollover);
    const created = await fixture.createRemote();
    const command = fixture.budgetCommand(created.execution);
    const batch = fixture.db.batch.bind(fixture.db); let delayed = false;
    fixture.db.batch = async (statements) => {
      if (!delayed) { delayed = true; fixture.setSqlNow(Date.parse("2026-09-01T00:00:00.000Z")); }
      return batch(statements);
    };
    await expect(fixture.budget.reserveRemote(command)).resolves.toEqual({ allowed: false, reason: "budget" });
    expect(fixture.db.database.prepare("SELECT count(*) count FROM ai_budget_reservations").get()).toEqual({ count: 0 });

    fixture.setAppNow(Date.parse("2026-09-01T00:00:00.000Z"));
    const admitted = await fixture.budget.reserveRemote(command);
    expect(admitted).toMatchObject({ allowed: true, replayed: false, providerAttemptAllowed: true });
    expect(fixture.db.database.prepare("SELECT period_kind,period_start FROM ai_budget_buckets ORDER BY period_kind").all()).toEqual([
      { period_kind: "day", period_start: Date.parse("2026-09-01T00:00:00.000Z") },
      { period_kind: "month", period_start: Date.parse("2026-09-01T00:00:00.000Z") },
    ]);
  });

  it("rejects remote budget at the exact SQL queue deadline within the same UTC day", async () => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    fixture.setSqlNow(created.execution.job.queueExpiresAt);
    await expect(fixture.budget.reserveRemote(fixture.budgetCommand(created.execution))).resolves.toEqual({ allowed: false, reason: "budget" });
    expect(fixture.db.database.prepare("SELECT count(*) count FROM ai_budget_reservations").get()).toEqual({ count: 0 });
    expect(fixture.db.database.prepare("SELECT count(*) count FROM ai_budget_buckets").get()).toEqual({ count: 0 });
  });

  it("leaves existing remote bucket balances and versions unchanged when capacity is exhausted", async () => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const policy = { dailyBudgetMicros: 5_000_000, monthlyBudgetMicros: 5_000_000, maximumMicros: 5_000_000 };
    const first = await fixture.createRemote("owner-a", policy);
    const second = await fixture.createRemote("owner-b", policy);
    await expect(fixture.budget.reserveRemote(fixture.budgetCommand(first.execution))).resolves.toMatchObject({ allowed: true, replayed: false });
    const before = fixture.db.database.prepare("SELECT period_kind,reserved_micros,settled_micros,version FROM ai_budget_buckets ORDER BY period_kind").all();
    await expect(fixture.budget.reserveRemote(fixture.budgetCommand(second.execution))).resolves.toEqual({ allowed: false, reason: "budget" });
    expect(fixture.db.database.prepare("SELECT period_kind,reserved_micros,settled_micros,version FROM ai_budget_buckets ORDER BY period_kind").all()).toEqual(before);
    expect(fixture.db.database.prepare("SELECT count(*) count FROM ai_budget_reservations").get()).toEqual({ count: 1 });
  });

  it("snapshots the remote budget command before its first storage await", async () => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const command = fixture.budgetCommand(created.execution);
    const control = createControlPoint();
    const prepare = fixture.db.prepare.bind(fixture.db); let paused = false;
    fixture.db.prepare = ((sql: string) => {
      const statement = prepare(sql);
      if (paused || !sql.includes("FROM ai_budget_reservations r JOIN research_runs u")) return statement;
      paused = true;
      const bind = statement.bind.bind(statement);
      statement.bind = ((...values: unknown[]) => {
        const bound = bind(...values); const first = bound.first.bind(bound);
        bound.first = async <T>() => { await control.wait(); return first<T>(); };
        return bound;
      }) as typeof statement.bind;
      return statement;
    }) as typeof fixture.db.prepare;
    const pending = fixture.budget.reserveRemote(command);
    await control.entered;
    const mutable = command as { requestHash: string; maximumMicros: number };
    mutable.requestHash = "f".repeat(64); mutable.maximumMicros = 1;
    control.resume();
    await expect(pending).resolves.toMatchObject({ allowed: true, replayed: false, providerAttemptAllowed: true });
  });

  it.each([3, 4])("rolls back remote reservation and both buckets on post-insert failure %s", async (index) => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote(); fixture.db.failAtBatchStatement = index;
    await expect(fixture.budget.reserveRemote(fixture.budgetCommand(created.execution))).rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE" });
    expect(fixture.db.database.prepare("SELECT count(*) count FROM ai_budget_reservations").get()).toEqual({ count: 0 });
    expect(fixture.db.database.prepare("SELECT count(*) count FROM ai_budget_buckets").get()).toEqual({ count: 0 });
  });

  it.each([0, 1])("rolls back remote accounting when actual bucket increment %s matches zero rows", async (target) => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote();
    const prepare = fixture.db.prepare.bind(fixture.db); let increment = 0;
    fixture.db.prepare = ((sql: string) => {
      if (!sql.startsWith("UPDATE ai_budget_buckets SET reserved_micros=reserved_micros+")) return prepare(sql);
      const current = increment++;
      return prepare(current === target ? `${sql} AND 0` : sql);
    }) as typeof fixture.db.prepare;
    await expect(fixture.budget.reserveRemote(fixture.budgetCommand(created.execution))).rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE" });
    expect(fixture.db.database.prepare("SELECT count(*) count FROM ai_budget_reservations").get()).toEqual({ count: 0 });
    expect(fixture.db.database.prepare("SELECT count(*) count FROM ai_budget_buckets").get()).toEqual({ count: 0 });
  });

  it("replays the exact original remote expiry after expiry without new provider authority", async () => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote(); const command = fixture.budgetCommand(created.execution);
    const first = await fixture.budget.reserveRemote(command);
    if (!first.allowed) throw new Error("remote budget fixture denied");
    fixture.setAppNow(command.expiresAt + 1); fixture.setSqlNow(command.expiresAt + 1);
    await expect(fixture.budget.reserveRemote(command)).resolves.toEqual({ allowed: true, reservation: first.reservation, replayed: true, providerAttemptAllowed: false });
    await expect(fixture.budget.reserveRemote({ ...command, expiresAt: command.expiresAt + 1 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects unsafe remote budget command shapes before writes", async () => {
    const fixture = createSiteAdmissionFixture(); databases.push(fixture.db);
    const created = await fixture.createRemote(); const valid = fixture.budgetCommand(created.execution);
    const values = [
      Object.assign({ ...valid }, { [Symbol("secret")]: true }),
      Object.defineProperty({ ...valid }, "maximumMicros", { enumerable: true, get: () => valid.maximumMicros }),
      Object.assign(Object.create(null), valid),
      { ...valid, maximumMicros: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, ownerId: "o".repeat(161) },
      { ...valid, requestId: "r".repeat(161) },
    ];
    for (const value of values) await expect(fixture.budget.reserveRemote(value)).rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE" });
    expect(fixture.db.database.prepare("SELECT count(*) count FROM ai_budget_reservations").get()).toEqual({ count: 0 });
  });
  it.each(["terminal", "expired"])("cannot give a fresh provider attempt to a %s run", async (kind) => {
    const { repository, db, setNow } = setup();
    if (kind === "terminal") db.database.exec("UPDATE research_runs SET state='failed',active_slot=NULL,active_expires_at=NULL WHERE id='run-a'");
    else setNow(day + 60_001);
    await expect(repository.reserve(command())).rejects.toMatchObject({ code: "CONFLICT" });
    expect(balances(db)).toEqual([]);
  });
  it("admits only one of two concurrent 700 requests under both 1000 caps", async () => {
    const { db, repository } = setup();
    const results = await Promise.all([repository.reserve(command()), repository.reserve(command("b"))]);
    expect(results.filter((result) => result.allowed)).toHaveLength(1);
    expect(results.filter((result) => !result.allowed)).toEqual([{ allowed: false, reason: "budget" }]);
    expect(balances(db)).toEqual(["day", "month"].map((period_kind) => ({ period_kind, reserved_micros: 700, settled_micros: 0, version: 1 })));
    expect(db.database.prepare("SELECT count(*) count FROM ai_budget_reservations").get()).toEqual({ count: 1 });
  });

  it("replays concurrent identical requests with exactly one provider attempt authority", async () => {
    const { db, repository } = setup();
    const results = await Promise.all([repository.reserve(command()), repository.reserve(command())]);
    expect(new Set(results.map((result) => allowed(result).id)).size).toBe(1);
    expect(results.filter((result) => result.allowed && result.providerAttemptAllowed)).toHaveLength(1);
    expect(balances(db).every((row) => row.reserved_micros === 700 && row.version === 1)).toBe(true);
  });

  it("does not mistake equal-amount stale reads for proof this request won", async () => {
    const { db, repository } = setup();
    const batch = db.batch.bind(db); let injected = false;
    db.batch = async (statements) => {
      if (!injected) { injected = true; await repository.reserve(command("b")); }
      return batch(statements);
    };
    await expect(repository.reserve(command())).resolves.toEqual({ allowed: false, reason: "budget" });
    expect(db.database.prepare("SELECT request_id FROM ai_budget_reservations").all()).toEqual([{ request_id: "request-b" }]);
    expect(balances(db).every((row) => row.reserved_micros === 700)).toBe(true);
  });

  it.each(["dailyBudgetMicros", "monthlyBudgetMicros"] as const)("leaves both buckets unchanged when only %s is exhausted", async (field) => {
    const { db, repository } = setup();
    await repository.reserve(command("a", { maximumMicros: 0 })); const before = balances(db);
    await expect(repository.reserve(command("b", { [field]: 600 }))).resolves.toEqual({ allowed: false, reason: "budget" });
    expect(balances(db)).toEqual(before);
    expect(db.database.prepare("SELECT count(*) count FROM ai_budget_reservations").get()).toEqual({ count: 1 });
  });

  it.each([3, 4])("rolls back reservation and both buckets on midbatch failure %s", async (index) => {
    const { db, repository } = setup(); db.failAtBatchStatement = index;
    await expect(repository.reserve(command())).rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE", message: "BUDGET_UNAVAILABLE" });
    expect(balances(db)).toEqual([]);
    expect(db.database.prepare("SELECT count(*) count FROM ai_budget_reservations").get()).toEqual({ count: 0 });
  });

  it("binds replay to the original owner, run and amount and exposes owner-bound recovery reads", async () => {
    const { repository } = setup(); const reservation = allowed(await repository.reserve(command()));
    for (const overrides of [{ ownerId: "owner-b" }, { runId: "run-b" }, { maximumMicros: 701 }]) {
      await expect(repository.reserve(command("a", overrides))).rejects.toMatchObject({ code: "CONFLICT" });
    }
    await expect(repository.readReservation("owner-b", reservation.id)).resolves.toBeNull();
    await expect(repository.findReservation("owner-a", "run-a", "request-a")).resolves.toEqual(reservation);
    await expect(repository.findReservation("owner-b", "run-a", "request-a")).resolves.toBeNull();
    await expect(repository.readBucket(reservation.dayBucketId)).resolves.toMatchObject({ scope: "site", periodKind: "day", periodStart: day, reservedMicros: 700 });
    await expect(repository.reserve(command("b", { requestId: "not-the-run-request" }))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("retains original buckets on next-month replay and never treats expiry as a zero charge", async () => {
    const { repository, setNow, db } = setup(); const reservation = allowed(await repository.reserve(command()));
    setNow(day + 86_400_000);
    expect(allowed(await repository.reserve(command()))).toEqual(reservation);
    const held = await repository.settle("owner-a", reservation.id, { kind: "unknown" });
    expect(held.status).toBe("conservative-hold");
    expect(balances(db).every((row) => row.reserved_micros === 700)).toBe(true);
    expect(balances(db)).toHaveLength(2);
    await expect(repository.reserve(command())).resolves.toMatchObject({ providerAttemptAllowed: false });
  });

  it.each([
    [{ kind: "actual", actualMicros: 430 }, "settled", 430],
    [{ kind: "not-charged" }, "released", 0],
  ] as const)("applies rollover settlement %j only to the original day and month", async (settlement, status, actual) => {
    const { repository, setNow, db } = setup();
    const original = allowed(await repository.reserve(command()));
    const nextDay = day + 86_400_000; const nextNow = nextDay + 1000;
    setNow(nextNow);
    db.database.prepare("UPDATE research_runs SET active_expires_at=?1 WHERE id='run-b'").run(nextNow + 60_000);
    const next = allowed(await repository.reserve(command("b", { expiresAt: nextNow + 60_000, maximumMicros: 500 })));
    const originalIds = [original.dayBucketId, original.monthBucketId];
    const nextIds = [next.dayBucketId, next.monthBucketId];
    expect(new Set([...originalIds, ...nextIds]).size).toBe(4);
    const oldBefore = await Promise.all(originalIds.map((id) => repository.readBucket(id)));
    const nextBefore = await Promise.all(nextIds.map((id) => repository.readBucket(id)));
    expect(oldBefore.map((bucket) => bucket!.periodStart)).toEqual([day, Date.parse("2026-08-01T00:00:00Z")]);
    expect(nextBefore.map((bucket) => bucket!.periodStart)).toEqual([nextDay, nextDay]);
    const settled = await repository.settle("owner-a", original.id, settlement);
    expect(settled).toMatchObject({ status, settledMicros: actual });
    const oldAfter = await Promise.all(originalIds.map((id) => repository.readBucket(id)));
    expect(oldAfter).toEqual(oldBefore.map((bucket) => ({ ...bucket, reservedMicros: 0, settledMicros: actual, version: bucket!.version + 1, updatedAt: nextNow })));
    expect(await Promise.all(nextIds.map((id) => repository.readBucket(id)))).toEqual(nextBefore);
    await expect(repository.settle("owner-a", original.id, settlement)).resolves.toEqual(settled);
    await expect(repository.reserve(command())).resolves.toMatchObject({ reservation: settled, replayed: true, providerAttemptAllowed: false });
    expect(await Promise.all(originalIds.map((id) => repository.readBucket(id)))).toEqual(oldAfter);
    expect(await Promise.all(nextIds.map((id) => repository.readBucket(id)))).toEqual(nextBefore);
  });

  it.each([
    [{ kind: "actual", actualMicros: 400 }, "settled", 0, 400],
    [{ kind: "actual", actualMicros: 1200 }, "settled", 0, 1200],
    [{ kind: "actual", actualMicros: 0 }, "settled", 0, 0],
    [{ kind: "not-charged" }, "released", 0, 0],
    [{ kind: "unknown" }, "conservative-hold", 700, 0],
  ] as const)("settles %j honestly and idempotently", async (settlement, status, reserved, settled) => {
    const { repository, db } = setup(); const reservation = allowed(await repository.reserve(command()));
    const result = await repository.settle("owner-a", reservation.id, settlement);
    expect(result).toMatchObject({ status, settledMicros: settled }); const before = balances(db);
    await expect(repository.settle("owner-a", reservation.id, settlement)).resolves.toEqual(result);
    expect(balances(db)).toEqual(before);
    expect(before.every((row) => row.reserved_micros === reserved && row.settled_micros === settled)).toBe(true);
    await expect(repository.reserve(command())).resolves.toMatchObject({ providerAttemptAllowed: false });
  });

  it("permits explicit trusted reconciliation of unknown holds", async () => {
    const { repository, db } = setup(); const reservation = allowed(await repository.reserve(command()));
    await repository.settle("owner-a", reservation.id, { kind: "unknown" });
    await repository.settle("owner-a", reservation.id, { kind: "actual", actualMicros: 300 });
    expect(balances(db).every((row) => row.reserved_micros === 0 && row.settled_micros === 300)).toBe(true);
  });

  it("settles identical concurrent actual costs exactly once", async () => {
    const { repository, db } = setup(); const reservation = allowed(await repository.reserve(command()));
    const results = await Promise.all([repository.settle("owner-a", reservation.id, { kind: "actual", actualMicros: 400 }), repository.settle("owner-a", reservation.id, { kind: "actual", actualMicros: 400 })]);
    expect(results[0]).toEqual(results[1]);
    expect(balances(db).every((row) => row.reserved_micros === 0 && row.settled_micros === 400 && row.version === 2)).toBe(true);
  });

  it("supports zero accounting and the largest safe currency amount without overflow", async () => {
    const { repository, db } = setup();
    const zero = allowed(await repository.reserve(command("a", { maximumMicros: 0, dailyBudgetMicros: 0, monthlyBudgetMicros: 0 })));
    await repository.settle("owner-a", zero.id, { kind: "actual", actualMicros: 0 });
    const maximum = allowed(await repository.reserve(command("b", { maximumMicros: Number.MAX_SAFE_INTEGER, dailyBudgetMicros: Number.MAX_SAFE_INTEGER, monthlyBudgetMicros: Number.MAX_SAFE_INTEGER })));
    await repository.settle("owner-a", maximum.id, { kind: "actual", actualMicros: Number.MAX_SAFE_INTEGER });
    expect(balances(db).every((row) => row.reserved_micros === 0 && row.settled_micros === Number.MAX_SAFE_INTEGER)).toBe(true);
    await expect(repository.reserve(command("c", { ownerId: "owner-b", maximumMicros: 1, dailyBudgetMicros: Number.MAX_SAFE_INTEGER, monthlyBudgetMicros: Number.MAX_SAFE_INTEGER }))).resolves.toEqual({ allowed: false, reason: "budget" });
  });

  it("does not terminalize if a bucket loses its hold between preflight and the atomic transition", async () => {
    const { repository, db } = setup(); const reservation = allowed(await repository.reserve(command()));
    const batch = db.batch.bind(db);
    db.batch = async (statements) => { db.database.prepare("UPDATE ai_budget_buckets SET reserved_micros=0 WHERE id=?1").run(reservation.monthBucketId); return batch(statements); };
    await expect(repository.settle("owner-a", reservation.id, { kind: "not-charged" })).rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE" });
    await expect(repository.readReservation("owner-a", reservation.id)).resolves.toEqual(reservation);
    await expect(repository.readBucket(reservation.dayBucketId)).resolves.toMatchObject({ reservedMicros: 700 });
  });

  it("keeps recovery replay possible after the run terminalizes", async () => {
    const { repository, db } = setup(); const reservation = allowed(await repository.reserve(command()));
    db.database.exec("UPDATE research_runs SET state='failed',active_slot=NULL,active_expires_at=NULL WHERE id='run-a'");
    await expect(repository.reserve(command())).resolves.toMatchObject({ reservation, replayed: true, providerAttemptAllowed: false });
    await repository.settle("owner-a", reservation.id, { kind: "not-charged" });
    await expect(repository.settle("owner-a", reservation.id, { kind: "unknown" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it.each(["status", "maximum_reserved_micros", "settled_micros"])("rejects corrupt reservation %s on recovery reads", async (field) => {
    const { repository, db } = setup(); const reservation = allowed(await repository.reserve(command()));
    db.database.exec("PRAGMA ignore_check_constraints=ON");
    db.database.prepare(`UPDATE ai_budget_reservations SET ${field}=?1`).run(field === "status" ? "invalid" : -1);
    await expect(repository.readReservation("owner-a", reservation.id)).rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE" });
  });

  it("admits only one conflicting terminal settlement under concurrency", async () => {
    const { repository, db } = setup(); const reservation = allowed(await repository.reserve(command()));
    const results = await Promise.allSettled([repository.settle("owner-a", reservation.id, { kind: "actual", actualMicros: 500 }), repository.settle("owner-a", reservation.id, { kind: "not-charged" })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
    expect(balances(db).every((row) => row.reserved_micros === 0 && row.settled_micros === 500)).toBe(true);
    await expect(repository.settle("owner-a", reservation.id, { kind: "actual", actualMicros: 501 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it.each([1, 2])("rolls back the whole settlement on bucket update failure %s", async (index) => {
    const { repository, db } = setup(); const reservation = allowed(await repository.reserve(command())); const before = balances(db);
    db.failAtBatchStatement = index;
    await expect(repository.settle("owner-a", reservation.id, { kind: "actual", actualMicros: 300 })).rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE" });
    expect(balances(db)).toEqual(before);
    await expect(repository.readReservation("owner-a", reservation.id)).resolves.toEqual(reservation);
  });

  it.each(["day", "month"])("fails closed on %s settlement overflow without releasing either hold", async (kind) => {
    const { repository, db } = setup(); const reservation = allowed(await repository.reserve(command()));
    db.database.prepare("UPDATE ai_budget_buckets SET settled_micros=?1 WHERE period_kind=?2").run(Number.MAX_SAFE_INTEGER - 700, kind);
    const before = balances(db);
    await expect(repository.settle("owner-a", reservation.id, { kind: "actual", actualMicros: 701 })).rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE" });
    expect(balances(db)).toEqual(before);
    await expect(repository.readReservation("owner-a", reservation.id)).resolves.toEqual(reservation);
  });

  it.each(["reserved_micros", "settled_micros", "version", "period_start", "scope"])("rejects corrupt %s rows with a sanitized error", async (field) => {
    const { repository, db } = setup(); const reservation = allowed(await repository.reserve(command()));
    db.database.exec("PRAGMA ignore_check_constraints=ON");
    db.database.prepare(`UPDATE ai_budget_buckets SET ${field}=?1 WHERE id=?2`).run(field === "scope" ? "other" : -1, reservation.monthBucketId);
    await expect(repository.settle("owner-a", reservation.id, { kind: "actual", actualMicros: 20 })).rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE", message: "BUDGET_UNAVAILABLE" });
  });

  it("rejects a missing bucket or insufficient hold instead of terminalizing a zero-row settlement", async () => {
    const { repository, db } = setup(); const reservation = allowed(await repository.reserve(command()));
    db.database.prepare("UPDATE ai_budget_buckets SET reserved_micros=0 WHERE id=?1").run(reservation.monthBucketId);
    await expect(repository.settle("owner-a", reservation.id, { kind: "not-charged" })).rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE" });
    await expect(repository.readReservation("owner-a", reservation.id)).resolves.toEqual(reservation);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid monetary values %s before writing", async (value) => {
    const { repository, db } = setup();
    await expect(repository.reserve(command("a", { maximumMicros: value }))).rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE" });
    expect(balances(db)).toEqual([]);
  });

  it("rejects invalid settlements and cross-owner mutations", async () => {
    const { repository, db } = setup(); const reservation = allowed(await repository.reserve(command())); const before = balances(db);
    for (const settlement of [{ kind: "actual", actualMicros: -1 }, { kind: "actual", actualMicros: 0, extra: true }, { kind: "expired" }]) {
      await expect(repository.settle("owner-a", reservation.id, settlement as BudgetSettlement)).rejects.toMatchObject({ code: "BUDGET_UNAVAILABLE" });
    }
    await expect(repository.settle("owner-b", reservation.id, { kind: "not-charged" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(balances(db)).toEqual(before);
  });
});
