import { describe, expect, it } from "vitest";
import { D1AdminRepository } from "../../app/server/admin/d1-admin-repository";
import { readAdminPolicy } from "../../app/server/admin/policy";

describe("Arc admin policy", () => {
  it("normalizes and exact-matches a valid email allowlist", () => {
    const policy = readAdminPolicy({
      ARC_ADMIN_EMAILS: " Owner@Example.com, ops@example.com ",
    });

    expect(policy.configured).toBe(true);
    expect(policy.allows("owner@example.com")).toBe(true);
    expect(policy.allows("OWNER@EXAMPLE.COM")).toBe(true);
    expect(policy.allows("attacker-owner@example.com")).toBe(false);
    expect(policy.allows("owner@example.com.attacker.test")).toBe(false);
  });

  it.each([undefined, "", "*@example.com", "@example.com", "owner@example.com,not-an-email"])(
    "fails closed for malformed configuration %j",
    (value) => {
      const policy = readAdminPolicy({ ARC_ADMIN_EMAILS: value });
      expect(policy.configured).toBe(false);
      expect(policy.allows("owner@example.com")).toBe(false);
    },
  );
});

class FakeStatement {
  values: unknown[] = [];
  constructor(private readonly db: FakeD1, readonly sql: string) {}
  bind(...values: unknown[]) {
    this.values = values;
    this.db.calls.push({ sql: this.sql, values });
    return this;
  }
  async first<T>() { return this.db.take(this.sql) as T | null; }
  async all<T>() { return { results: (this.db.take(this.sql) ?? []) as T[] }; }
}

class FakeD1 {
  readonly calls: Array<{ sql: string; values: unknown[] }> = [];
  private readonly responses: Array<{ match: string; value: unknown }> = [];
  when(match: string, value: unknown) { this.responses.push({ match, value }); }
  prepare(sql: string) { return new FakeStatement(this, sql); }
  take(sql: string) {
    const index = this.responses.findIndex((response) => sql.includes(response.match));
    if (index < 0) return null;
    return this.responses.splice(index, 1)[0].value;
  }
}

describe("D1AdminRepository", () => {
  it("returns aggregate health without querying learner, identity, or proof content", async () => {
    const db = new FakeD1();
    db.when("FROM feature_flags", { enabled: 0 });
    db.when("FROM ai_runs", { calls_today: 7, accepted_today: 5 });
    db.when("FROM quota_ledger", { budget_units_today: 5 });
    db.when("FROM migration_runs", { pending: 1, failed_24h: 2, completed_24h: 9 });
    db.when("FROM operational_events", [{
      request_id: "00000000-0000-4000-8000-000000000009",
      route: "/api/workspace",
      result_code: "INTERNAL",
      occurred_at: 1_785_196_800_000,
    }]);

    const snapshot = await new D1AdminRepository(
      db as unknown as D1Database,
      () => new Date("2026-07-28T08:00:00.000Z"),
    ).getHealthSnapshot();

    expect(snapshot).toEqual({
      service: "degraded",
      ai: { enabled: false, callsToday: 7, acceptedToday: 5, budgetUnitsToday: 5 },
      migrations: { pending: 1, failed24h: 2, completed24h: 9 },
      failures: [{
        requestId: "00000000-0000-4000-8000-000000000009",
        route: "/api/workspace",
        code: "INTERNAL",
        occurredAt: "2026-07-28T00:00:00.000Z",
      }],
    });
    const sql = db.calls.map((call) => call.sql).join("\n").toLowerCase();
    expect(sql).toMatch(/feature_flags/);
    expect(sql).toMatch(/ai_runs/);
    expect(sql).toMatch(/quota_ledger/);
    expect(sql).toMatch(/migration_runs/);
    expect(sql).toMatch(/operational_events/);
    expect(sql).not.toMatch(/\busers\b|proof_items|proof_assets|career_goals|account|session|oauth|user_id|email|role_description|proof_text/);
  });
});
