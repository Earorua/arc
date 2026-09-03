import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminHealthHandler } from "../../app/api/admin/health/route";
import { D1AdminRepository } from "../../app/server/admin/d1-admin-repository";
import type { AdminEnvironment } from "../../app/server/admin/policy";
import { createResearchD1, seedUser } from "../helpers/sqlite-d1";

const NOW = Date.parse("2026-09-03T12:00:00.000Z");
const DAY = Date.parse("2026-09-03T00:00:00.000Z");
const DAY_END = DAY + 86_400_000;
const MONTH = Date.parse("2026-09-01T00:00:00.000Z");
const databases: ReturnType<typeof createResearchD1>[] = [];

const validResearchEnvironment: AdminEnvironment = {
  ARC_ADMIN_EMAILS: "owner@example.com",
  ARC_ENVIRONMENT: "test",
  BETTER_AUTH_URL: "https://arc.example",
  ARC_AI_ENABLED: "true",
  ARC_AI_RESEARCH_ENABLED: "true",
  ARC_AI_USER_DAILY_QUOTA: "3",
  ARC_AI_RATE_LIMIT_PER_MINUTE: "2",
  ARC_AI_MODEL_RESEARCH: "test/research-fixed",
  ARC_AI_MODEL_ECONOMY: "test/economy-fixed",
  ARC_AI_RESEARCH_TIMEOUT_MS: "20000",
  ARC_AI_REPAIR_TIMEOUT_MS: "10000",
  ARC_AI_RESEARCH_CACHE_DAYS: "14",
  ARC_AI_SITE_DAILY_BUDGET_MICROS: "10000",
  ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "100000",
  ARC_AI_RESEARCH_MAX_COST_MICROS: "1200",
  ARC_AI_REPAIR_MAX_COST_MICROS: "300",
  ARC_AI_IP_HASH_SALT: "synthetic-test-salt-value",
  OPENROUTER_API_KEY: "synthetic-dummy-credential",
};

afterEach(() => {
  vi.restoreAllMocks();
  while (databases.length > 0) databases.pop()!.close();
});

function database() {
  const db = createResearchD1();
  databases.push(db);
  seedUser(db, "owner-a");
  seedUser(db, "owner-private");
  return db;
}

function seedPackage(db: ReturnType<typeof createResearchD1>) {
  db.database.exec(`
    INSERT INTO role_blueprints (id,slug,name,status,current_version)
      VALUES ('private-blueprint','private-blueprint','Private role','ready','1');
    INSERT INTO role_blueprint_versions (id,role_id,version,status,blueprint_json)
      VALUES ('private-version','private-blueprint','1','ready','{}');
    INSERT INTO research_packages (
      id,normalized_role_key,locale,config_fingerprint,content_fingerprint,
      package_json,quality_json,blueprint_id,blueprint_version,blueprint_version_id,
      registry_id,registry_version,observed_at,expires_at,created_at
    ) VALUES (
      'private-package','private-role','en-US','private-config','private-content',
      '{"sourceUrl":"https://private.example/source"}','{}','private-blueprint','1','private-version',
      'private-registry','1','2026-09-03',1799020800000,${NOW}
    );
  `);
}

function insertRun(
  db: ReturnType<typeof createResearchD1>,
  id: string,
  state: "queued" | "researching" | "validating" | "ready" | "needs-review" | "failed",
  owner = "owner-a",
  updatedAt = NOW,
) {
  const active = ["queued", "researching", "validating"].includes(state);
  db.database.prepare(`
    INSERT INTO research_runs (
      id,user_id,request_id,mutation_id,raw_role,normalized_role_key,locale,
      input_fingerprint,config_fingerprint,state,active_slot,active_expires_at,package_id,
      candidate_json,created_at,updated_at
    ) VALUES (?1,?2,?3,?4,?5,?6,'en-US',?7,?8,?9,?10,?11,?12,?13,?14,?14)
  `).run(
    id,
    owner,
    `request-${id}`,
    `mutation-${id}`,
    `Private role ${id}`,
    `private-role-${id}`,
    `input-${id}`,
    `config-${id}`,
    state,
    active ? 1 : null,
    active ? NOW + 60_000 : null,
    state === "ready" ? "private-package" : null,
    state === "needs-review" ? '{"owner":"owner-private","url":"https://private.example"}' : null,
    updatedAt,
  );
}

function seedBuckets(db: ReturnType<typeof createResearchD1>) {
  db.database.exec(`
    INSERT INTO ai_budget_buckets (id,scope,period_kind,period_start,reserved_micros,settled_micros,version,created_at,updated_at)
      VALUES
        ('day-current','site','day',${DAY},1900,430,1,${NOW},${NOW}),
        ('month-current','site','month',${MONTH},1900,5430,1,${NOW},${NOW}),
        ('day-previous','site','day',${DAY - 86_400_000},0,999,1,${NOW - 86_400_000},${NOW - 86_400_000});
  `);
}

function insertReservation(
  db: ReturnType<typeof createResearchD1>,
  id: string,
  runId: string,
  status: string,
  maximum: number | string,
  settled: number | string,
  dayBucketId = "day-current",
) {
  db.database.prepare(`
    INSERT INTO ai_budget_reservations (
      id,request_id,run_id,day_bucket_id,month_bucket_id,maximum_reserved_micros,
      settled_micros,status,expires_at,created_at,updated_at
    ) VALUES (?1,?2,?3,?4,'month-current',?5,?6,?7,?8,?9,?9)
  `).run(id, `budget-${id}`, runId, dayBucketId, maximum, settled, status, NOW + 60_000, NOW);
}

function preparedQuery(db: ReturnType<typeof createResearchD1>, marker: string): string {
  const sql = db.preparedSql.find((candidate) => candidate.includes(marker));
  expect(sql, marker).toBeDefined();
  return sql as string;
}

describe("D1 admin Research Beta health", () => {
  it("returns zeroed aggregate research health for an empty database", async () => {
    const db = database();
    const snapshot = await new D1AdminRepository(
      db as unknown as D1Database,
      () => new Date(NOW),
    ).getHealthSnapshot();

    expect(snapshot.research).toEqual({
      queued: 0,
      researching: 0,
      validating: 0,
      ready: 0,
      needsReview: 0,
      failed: 0,
      reservedMicros: 0,
      settledMicros: 0,
      conservativeHoldMicros: 0,
    });
  });

  it("counts states and separates active, settled-today, and held cost without private data", async () => {
    const db = database();
    seedPackage(db);
    insertRun(db, "queued-one", "queued");
    insertRun(db, "validating-one", "validating");
    insertRun(db, "ready-one", "ready");
    insertRun(db, "ready-private", "ready", "owner-private");
    insertRun(db, "review-one", "needs-review");
    insertRun(db, "failed-one", "failed");
    seedBuckets(db);
    insertReservation(db, "reservation-active", "queued-one", "reserved", 1_200, 0);
    insertReservation(db, "reservation-held", "failed-one", "conservative-hold", 700, 0);
    insertReservation(db, "reservation-settled", "ready-one", "settled", 600, 430);
    insertReservation(db, "reservation-released", "review-one", "released", 900, 0);

    const repository = new D1AdminRepository(
      db as unknown as D1Database,
      () => new Date(NOW),
    );
    const snapshot = await repository.getHealthSnapshot();
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.research).toEqual({
      queued: 1,
      researching: 0,
      validating: 1,
      ready: 2,
      needsReview: 1,
      failed: 1,
      reservedMicros: 1_200,
      settledMicros: 430,
      conservativeHoldMicros: 700,
    });
    expect(serialized).not.toMatch(/owner-a|owner-private|private-role|private\.example|private-package|request-|budget-|sourceUrl/iu);

    const stateSql = preparedQuery(db, "FROM research_runs");
    const exposureSql = preparedQuery(db, "ai_budget_reservations");
    const settledSql = preparedQuery(db, "SELECT settled_micros");
    expect(stateSql).toMatch(/updated_at\s*>=\s*\?1\s+AND updated_at\s*<\s*\?2/);
    expect(exposureSql).toMatch(/JOIN ai_budget_reservations/);
    const queryPlans = [
      db.database.prepare(`EXPLAIN QUERY PLAN ${stateSql}`).all(DAY, DAY_END),
      db.database.prepare(`EXPLAIN QUERY PLAN ${exposureSql}`).all(DAY),
      db.database.prepare(`EXPLAIN QUERY PLAN ${settledSql}`).all(DAY),
    ].flat().map((row) => JSON.stringify(row)).join("\n");
    expect(queryPlans).toMatch(/research_runs_updated_state_idx/);
    expect(queryPlans).toMatch(/ai_budget_reservations_day_status_idx/);
    expect(queryPlans).toMatch(/ai_budget_bucket_period_idx/);
    expect(queryPlans).not.toMatch(/SCAN research_runs|SCAN ai_budget_reservations/);
  });

  it("counts only the current UTC day with inclusive start and exclusive end boundaries", async () => {
    const db = database();
    insertRun(db, "day-start", "queued", "owner-a", DAY);
    insertRun(db, "day-last-millisecond", "failed", "owner-a", DAY_END - 1);
    insertRun(db, "next-day", "failed", "owner-a", DAY_END);
    for (let index = 0; index < 128; index++) {
      insertRun(db, `historical-${index}`, "failed", "owner-a", DAY - 1 - index);
    }
    db.database.exec("PRAGMA ignore_check_constraints = ON");
    db.database.prepare("UPDATE research_runs SET state='unknown' WHERE id='historical-0'").run();

    const snapshot = await new D1AdminRepository(
      db as unknown as D1Database,
      () => new Date(NOW),
    ).getHealthSnapshot();

    expect(snapshot.research).toMatchObject({ queued: 1, failed: 1 });
    expect(Object.values(snapshot.research).every(Number.isSafeInteger)).toBe(true);
  });

  it("rejects an unknown Research state inside the current UTC day", async () => {
    const db = database();
    insertRun(db, "current-corrupt", "failed", "owner-a", DAY);
    db.database.exec("PRAGMA ignore_check_constraints = ON");
    db.database.prepare("UPDATE research_runs SET state='unknown' WHERE id='current-corrupt'").run();

    await expect(new D1AdminRepository(
      db as unknown as D1Database,
      () => new Date(NOW),
    ).getHealthSnapshot()).rejects.toThrow();
  });

  it("scopes reservation validation and exposure to the current UTC-day site bucket", async () => {
    const db = database();
    insertRun(db, "current-run", "queued", "owner-a", DAY);
    insertRun(db, "historical-run", "failed", "owner-a", DAY - 1);
    seedBuckets(db);
    insertReservation(db, "current-reserved", "current-run", "reserved", 1_200, 0);
    for (let index = 0; index < 128; index++) {
      insertReservation(db, `historical-${index}`, "historical-run", "released", 10, 0, "day-previous");
    }
    db.database.exec("PRAGMA ignore_check_constraints = ON");
    db.database.prepare(`
      UPDATE ai_budget_reservations
      SET status='unknown', maximum_reserved_micros='not-a-number'
      WHERE id='historical-0'
    `).run();

    const snapshot = await new D1AdminRepository(
      db as unknown as D1Database,
      () => new Date(NOW),
    ).getHealthSnapshot();

    expect(snapshot.research).toMatchObject({
      queued: 1,
      failed: 0,
      reservedMicros: 1_200,
      conservativeHoldMicros: 0,
      settledMicros: 430,
    });
  });

  it("publishes effective enablement from the beta cohort flag, never the preview flag", async () => {
    const db = database();
    db.database.prepare(`
      INSERT INTO feature_flags (key,enabled,cohort_json,updated_at)
      VALUES ('role-research-preview',1,'{}',?1), ('role-research-beta',0,'{}',?1)
    `).run(NOW);
    const fetch = vi.spyOn(globalThis, "fetch");
    const handler = createAdminHealthHandler({
      requireUser: vi.fn().mockResolvedValue({ id: "admin", name: "Admin", email: "owner@example.com" }),
      environment: validResearchEnvironment,
      repository: new D1AdminRepository(db as unknown as D1Database, () => new Date(NOW)),
      createRequestId: () => "request-health-beta-flag",
    });

    const previewOnlyResponse = await handler(new Request("https://arc.example/api/admin/health"));
    const previewOnlyBody = await previewOnlyResponse.json();
    expect(previewOnlyResponse.status).toBe(200);
    expect(previewOnlyBody).toMatchObject({ health: { ai: { enabled: false } } });

    db.database.exec("UPDATE feature_flags SET enabled=0 WHERE key='role-research-preview'; UPDATE feature_flags SET enabled=1 WHERE key='role-research-beta';");
    const betaResponse = await handler(new Request("https://arc.example/api/admin/health"));
    const betaBody = await betaResponse.json();
    const serialized = JSON.stringify(betaBody);
    expect(betaResponse.status).toBe(200);
    expect(betaBody).toMatchObject({ health: { ai: { enabled: true } } });
    expect(serialized).not.toMatch(/research-fixed|economy-fixed|dummy-credential|synthetic-test-salt|model|api.?key|salt|config|role-research/iu);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed when a persisted aggregate is outside the JSON-safe integer boundary", async () => {
    const db = database();
    seedBuckets(db);
    db.database.exec("PRAGMA ignore_check_constraints = ON");
    db.database.prepare("UPDATE ai_budget_buckets SET settled_micros=?1 WHERE id='day-current'")
      .run(Number.MAX_SAFE_INTEGER + 1);

    await expect(new D1AdminRepository(
      db as unknown as D1Database,
      () => new Date(NOW),
    ).getHealthSnapshot()).rejects.toThrow();
  });

  it.each([
    ["unknown status", "unknown", 1_200, 0],
    ["non-integer maximum", "reserved", "not-a-number", 0],
    ["non-integer settled amount", "settled", 1_200, "not-a-number"],
    ["actual cost on an unsettled reservation", "reserved", 1_200, 1],
  ])("fails closed for a corrupt reservation %s", async (_case, status, maximum, settled) => {
    const db = database();
    insertRun(db, "queued-corrupt", "queued");
    seedBuckets(db);
    db.database.exec("PRAGMA ignore_check_constraints = ON");
    insertReservation(db, "reservation-corrupt", "queued-corrupt", status, maximum, settled);

    await expect(new D1AdminRepository(
      db as unknown as D1Database,
      () => new Date(NOW),
    ).getHealthSnapshot()).rejects.toThrow();
  });
});
