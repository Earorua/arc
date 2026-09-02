import { afterEach, describe, expect, it } from "vitest";
import { D1AdminRepository } from "../../app/server/admin/d1-admin-repository";
import { createResearchD1, seedUser } from "../helpers/sqlite-d1";

const NOW = Date.parse("2026-09-03T12:00:00.000Z");
const DAY = Date.parse("2026-09-03T00:00:00.000Z");
const MONTH = Date.parse("2026-09-01T00:00:00.000Z");
const databases: ReturnType<typeof createResearchD1>[] = [];

afterEach(() => {
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
    NOW,
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
  status: "reserved" | "settled" | "conservative-hold" | "released",
  maximum: number,
  settled: number,
) {
  db.database.prepare(`
    INSERT INTO ai_budget_reservations (
      id,request_id,run_id,day_bucket_id,month_bucket_id,maximum_reserved_micros,
      settled_micros,status,expires_at,created_at,updated_at
    ) VALUES (?1,?2,?3,'day-current','month-current',?4,?5,?6,?7,?8,?8)
  `).run(id, `budget-${id}`, runId, maximum, settled, status, NOW + 60_000, NOW);
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

    const queryPlans = [
      db.database.prepare("EXPLAIN QUERY PLAN SELECT state, COUNT(*) FROM research_runs GROUP BY state").all(),
      db.database.prepare("EXPLAIN QUERY PLAN SELECT status, SUM(maximum_reserved_micros) FROM ai_budget_reservations WHERE status IN ('reserved','conservative-hold') GROUP BY status").all(),
      db.database.prepare("EXPLAIN QUERY PLAN SELECT settled_micros FROM ai_budget_buckets WHERE scope='site' AND period_kind='day' AND period_start=?1 LIMIT 1").all(DAY),
    ].flat().map((row) => JSON.stringify(row)).join("\n");
    expect(queryPlans).toMatch(/research_runs_active_expiry_idx/);
    expect(queryPlans).toMatch(/ai_budget_reservations_expiry_idx/);
    expect(queryPlans).toMatch(/ai_budget_bucket_period_idx/);
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
});
