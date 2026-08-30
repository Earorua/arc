import { afterEach, describe, expect, it } from "vitest";
import { D1EntitlementRepository } from "../../app/server/entitlements/d1-entitlement-repository";
import type { ResearchQuotaAdmission } from "../../app/server/entitlements/repository";
import { createResearchD1, seedUser } from "../helpers/sqlite-d1";

const day = Date.parse("2026-08-31T00:00:00Z");
const period = { startMs: day, endMs: day + 86_400_000 };
const databases: ReturnType<typeof createResearchD1>[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function setup() {
  const db = createResearchD1(); databases.push(db); seedUser(db, "owner-a"); seedUser(db, "owner-b");
  let sequence = 0; let now = day + 1000;
  const repository = new D1EntitlementRepository(db as unknown as D1Database, { createId: () => `quota-${++sequence}`, now: () => now });
  return { db, repository, setNow: (value: number) => { now = value; } };
}
function command(key = "research-role-a", overrides: Partial<ResearchQuotaAdmission> = {}): ResearchQuotaAdmission {
  return { userId: "owner-a", purpose: "role-research", idempotencyKey: key, units: 1, dailyQuota: 1, period, ...overrides };
}
async function admit(repository: D1EntitlementRepository, key = "research-role-a") {
  const result = await repository.admitResearch(command(key));
  expect(result.allowed).toBe(true); if (!result.allowed) throw new Error("fixture quota denied"); return result.reservationId;
}

describe("D1EntitlementRepository", () => {
  it("preserves preview accepted-only usage and replay without another charge", async () => {
    const { repository } = setup();
    const first = await repository.reserve("owner-a", "preview", "request-preview", 1);
    expect(await repository.reserve("owner-a", "preview", "request-preview", 1)).toBe(first);
    await expect(repository.readUsage("owner-a", "preview", period)).resolves.toEqual({ userAcceptedUnits: 0, globalAcceptedUnits: 0 });
    await repository.finalize(first, "accepted", 1);
    const other = await repository.reserve("owner-b", "preview", "request-preview", 2);
    await repository.finalize(other, "accepted", 2);
    await expect(repository.readUsage("owner-a", "preview", period)).resolves.toEqual({ userAcceptedUnits: 1, globalAcceptedUnits: 3 });
  });

  it("preserves zero-unit preview rejection behavior", async () => {
    const { repository, db } = setup(); const id = await repository.reserve("owner-a", "preview", "request-preview", 1);
    await repository.finalize(id, "rejected", 99);
    expect(db.database.prepare("SELECT entry_kind, units FROM quota_ledger WHERE entry_kind<>'reserved'").all()).toEqual([{ entry_kind: "rejected", units: 0 }]);
  });

  it("atomically limits different-role Research requests sharing the owner's last slot", async () => {
    const { repository, db } = setup();
    const results = await Promise.all([repository.admitResearch(command()), repository.admitResearch(command("research-role-b"))]);
    expect(results.filter((result) => result.allowed)).toHaveLength(1);
    expect(results.filter((result) => !result.allowed)).toEqual([{ allowed: false, reason: "quota" }]);
    expect(db.database.prepare("SELECT count(*) count FROM quota_ledger").get()).toEqual({ count: 1 });
    await expect(repository.readUsage("owner-a", "role-research", period)).resolves.toEqual({ userAcceptedUnits: 0, globalAcceptedUnits: 0 });
    await expect(repository.admitResearch(command("research-role-c", { userId: "owner-b" }))).resolves.toMatchObject({ allowed: true });
  });

  it("replays identical concurrent quota requests including their final status", async () => {
    const { repository, db } = setup();
    const results = await Promise.all([repository.admitResearch(command()), repository.admitResearch(command())]);
    expect(results.filter((result) => result.allowed && !result.replayed)).toHaveLength(1);
    const ids = results.map((result) => { if (!result.allowed) throw new Error("denied replay"); return result.reservationId; });
    expect(new Set(ids).size).toBe(1);
    await repository.finalize(ids[0], "accepted", 1);
    await expect(repository.admitResearch(command())).resolves.toMatchObject({ allowed: true, reservationId: ids[0], replayed: true, finalStatus: "accepted" });
    expect(db.database.prepare("SELECT count(*) count FROM quota_ledger").get()).toEqual({ count: 2 });
  });

  it.each(["failed", "rejected"] as const)("releases %s capacity without accepted usage", async (status) => {
    const { repository } = setup(); const id = await admit(repository); await repository.finalize(id, status, 0);
    await expect(repository.readUsage("owner-a", "role-research", period)).resolves.toEqual({ userAcceptedUnits: 0, globalAcceptedUnits: 0 });
    await expect(repository.admitResearch(command("research-role-b"))).resolves.toMatchObject({ allowed: true });
    await expect(repository.admitResearch(command())).resolves.toMatchObject({ replayed: true, finalStatus: status });
  });

  it("accepted Ready keeps one quota unit consumed", async () => {
    const { repository } = setup(); const id = await admit(repository); await repository.finalize(id, "accepted", 1);
    await expect(repository.admitResearch(command("research-role-b"))).resolves.toEqual({ allowed: false, reason: "quota" });
    await expect(repository.readUsage("owner-a", "role-research", period)).resolves.toEqual({ userAcceptedUnits: 1, globalAcceptedUnits: 1 });
  });

  it("rejects purpose and units replay aliases on legacy and Research paths", async () => {
    const { repository } = setup(); await repository.reserve("owner-a", "preview", "shared-request", 1);
    await expect(repository.reserve("owner-a", "other", "shared-request", 1)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(repository.reserve("owner-a", "preview", "shared-request", 2)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(repository.admitResearch(command("shared-request"))).rejects.toMatchObject({ code: "CONFLICT" });
    const id = await admit(repository);
    await expect(repository.reserve("owner-a", "role-research", "research-role-a", 1)).rejects.toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
    await expect(repository.finalize(id, "accepted", 2)).rejects.toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
  });

  it("allows one terminal kind under concurrent conflicting finalizations", async () => {
    const { repository, db } = setup(); const id = await admit(repository);
    const results = await Promise.allSettled([repository.finalize(id, "accepted", 1), repository.finalize(id, "failed", 0)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
    expect(db.database.prepare("SELECT entry_kind FROM quota_ledger WHERE entry_kind<>'reserved'").all()).toEqual([{ entry_kind: "accepted" }]);
    await repository.finalize(id, "accepted", 1);
    await expect(repository.finalize(id, "accepted", 0)).rejects.toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
  });

  it("does not add duplicate terminal entries on concurrent identical finalization", async () => {
    const { repository, db } = setup(); const id = await admit(repository);
    await Promise.all([repository.finalize(id, "accepted", 1), repository.finalize(id, "accepted", 1)]);
    expect(db.database.prepare("SELECT count(*) count FROM quota_ledger WHERE entry_kind='accepted'").get()).toEqual({ count: 1 });
  });

  it("keeps cross-midnight accounting on each original reservation day", async () => {
    const { repository, setNow } = setup(); const first = await admit(repository); setNow(period.endMs + 1000);
    const nextPeriod = { startMs: period.endMs, endMs: period.endMs + 86_400_000 };
    await expect(repository.admitResearch(command("research-next-day", { period: nextPeriod }))).resolves.toMatchObject({ allowed: true });
    await repository.finalize(first, "accepted", 1);
    await expect(repository.readUsage("owner-a", "role-research", period)).resolves.toEqual({ userAcceptedUnits: 1, globalAcceptedUnits: 1 });
    await expect(repository.readUsage("owner-a", "role-research", nextPeriod)).resolves.toEqual({ userAcceptedUnits: 0, globalAcceptedUnits: 0 });
    await expect(repository.admitResearch(command("research-next-day-other", { period: nextPeriod }))).resolves.toEqual({ allowed: false, reason: "quota" });
    await expect(repository.admitResearch(command("research-role-a", { period: nextPeriod }))).resolves.toMatchObject({ replayed: true, reservationId: first, finalStatus: "accepted" });
  });

  it.each([
    { units: 2 }, { dailyQuota: -1 }, { dailyQuota: 1.5 }, { dailyQuota: Number.MAX_SAFE_INTEGER + 1 },
    { purpose: "role-research-other" }, { userId: "" }, { idempotencyKey: "tiny" }, { period: { startMs: day + 1, endMs: period.endMs } },
  ])("rejects invalid admission %j before ledger writes", async (overrides) => {
    const { repository, db } = setup();
    await expect(repository.admitResearch(command("research-role-a", overrides))).rejects.toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE", message: "ENTITLEMENT_UNAVAILABLE" });
    expect(db.database.prepare("SELECT count(*) count FROM quota_ledger").get()).toEqual({ count: 0 });
  });

  it.each(["units", "entry_kind", "purpose", "created_at"])("fails closed on corrupt quota %s", async (field) => {
    const { repository, db } = setup(); await admit(repository);
    db.database.prepare(`UPDATE quota_ledger SET ${field}=?1`).run(field === "entry_kind" ? "unknown" : field === "purpose" ? "other" : -1);
    await expect(repository.admitResearch(command())).rejects.toMatchObject({ code: field === "purpose" ? "CONFLICT" : "ENTITLEMENT_UNAVAILABLE" });
  });

  it("sanitizes storage errors on all ledger entrypoints", async () => {
    const { repository, db } = setup(); db.database.exec("DROP TABLE quota_ledger");
    for (const operation of [() => repository.readUsage("owner-a", "preview", period), () => repository.reserve("owner-a", "preview", "request-preview", 1), () => repository.admitResearch(command()), () => repository.finalize("missing", "accepted", 1)]) {
      await expect(operation()).rejects.toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE", message: "ENTITLEMENT_UNAVAILABLE" });
    }
  });

  it("avoids correlated full-ledger scans while validating realistic history", async () => {
    const { repository, db } = setup();
    const insert = db.database.prepare("INSERT INTO quota_ledger(id,user_id,purpose,reservation_id,idempotency_key,entry_kind,units,created_at) VALUES(?1,'owner-a','preview',?2,?3,?4,1,?5)");
    db.database.exec("BEGIN");
    for (let index = 0; index < 1500; index++) {
      for (const kind of ["reserved", "accepted"]) insert.run(`history-${index}-${kind}`, `history-${index}`, `history-key-${index}`, kind, day - 86_400_000);
    }
    db.database.exec("COMMIT");
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const prepare = db.prepare.bind(db);
    db.prepare = (sql) => {
      const statement = prepare(sql); const bind = statement.bind.bind(statement);
      statement.bind = (...values) => { statements.push({ sql, values }); return bind(...values); };
      return statement;
    };
    await expect(repository.readUsage("owner-a", "preview", { startMs: day - 86_400_000, endMs: day })).resolves.toEqual({ userAcceptedUnits: 1500, globalAcceptedUnits: 1500 });
    const id = await admit(repository); await repository.finalize(id, "accepted", 1);
    await expect(repository.admitResearch(command("research-role-b"))).resolves.toEqual({ allowed: false, reason: "quota" });
    for (const { sql, values } of statements) {
      const plan = db.database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...values as never[]);
      for (const step of plan.filter((row) => /CORRELATED/.test(String(row.detail)))) {
        const children = plan.filter((row) => row.parent === step.id);
        expect(children.filter((row) => /SCAN (?:q|r|t)(?:\s|$)/.test(String(row.detail))), String(step.detail)).toEqual([]);
      }
    }
  });

  it("does not audit unrelated historic rows while admitting current Research work", async () => {
    const { repository, db } = setup();
    db.database.prepare("INSERT INTO quota_ledger(id,user_id,purpose,reservation_id,idempotency_key,entry_kind,units,created_at) VALUES('historic','owner-a','preview','historic-reservation','historic-key','unknown',-1,?1)").run(day - 86_400_000);
    const id = await admit(repository); await repository.finalize(id, "accepted", 1);
    await expect(repository.readUsage("owner-a", "role-research", period)).resolves.toEqual({ userAcceptedUnits: 1, globalAcceptedUnits: 1 });
  });
});
