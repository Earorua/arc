import { afterEach, describe, expect, it } from "vitest";
import { D1ResearchBudgetRepository } from "../../app/server/research/d1-budget-repository";
import type { BudgetDecision, BudgetReserveCommand, BudgetSettlement } from "../../app/server/research/budget";
import { createResearchD1, seedUser } from "../helpers/sqlite-d1";

const day = Date.parse("2026-08-31T00:00:00Z");
const databases: ReturnType<typeof createResearchD1>[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
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
