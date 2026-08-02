import { describe, expect, it } from "vitest";
import { D1EntitlementRepository } from "../../app/server/entitlements/d1-entitlement-repository";

class FakeStatement {
  values: unknown[] = [];

  constructor(private readonly db: FakeD1, readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    this.db.calls.push({ sql: this.sql, values });
    return this;
  }

  async first<T>() {
    return this.db.take(this.sql) as T | null;
  }

  async run() {
    this.db.runs.push({ sql: this.sql, values: this.values });
    return { success: true };
  }
}

class FakeD1 {
  readonly calls: Array<{ sql: string; values: unknown[] }> = [];
  readonly runs: Array<{ sql: string; values: unknown[] }> = [];
  private readonly responses: Array<{ match: string; value: unknown }> = [];

  when(match: string, value: unknown) {
    this.responses.push({ match, value });
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  take(sql: string) {
    const index = this.responses.findIndex((response) => sql.includes(response.match));
    if (index < 0) return null;
    return this.responses.splice(index, 1)[0].value;
  }
}

function repository(db: FakeD1) {
  return new D1EntitlementRepository(db as unknown as D1Database, {
    createId: () => "generated-id",
    now: () => 1_785_196_800_000,
  });
}

describe("D1EntitlementRepository", () => {
  it("reads owner and global accepted usage for one period", async () => {
    const db = new FakeD1();
    db.when("FROM quota_ledger", { user_units: 2, global_units: 9 });

    await expect(repository(db).readUsage("user-owner", "preview", {
      startMs: 100,
      endMs: 200,
    })).resolves.toEqual({ userAcceptedUnits: 2, globalAcceptedUnits: 9 });
    expect(db.calls[0].values).toEqual(["user-owner", "preview", 100, 200]);
    expect(db.calls[0].sql).toContain("entry_kind = 'accepted'");
  });

  it("replays an existing user-scoped reservation without another insert", async () => {
    const db = new FakeD1();
    db.when("entry_kind = 'reserved'", {
      user_id: "user-owner",
      purpose: "preview",
      reservation_id: "reservation-existing",
      idempotency_key: "request-existing",
    });

    await expect(repository(db).reserve(
      "user-owner",
      "preview",
      "request-existing",
      1,
    )).resolves.toBe("reservation-existing");
    expect(db.runs).toHaveLength(0);
    expect(db.calls[0].values).toEqual(["user-owner", "request-existing"]);
  });

  it("appends one zero-unit rejection and never rewrites an accepted charge", async () => {
    const db = new FakeD1();
    const reservation = {
      user_id: "user-owner",
      purpose: "preview",
      reservation_id: "reservation-1",
      idempotency_key: "request-1",
    };
    db.when("entry_kind = 'reserved'", reservation);
    db.when("entry_kind = ?3", null);

    await repository(db).finalize("reservation-1", "rejected", 99);

    expect(db.runs).toHaveLength(1);
    expect(db.runs[0].sql).toContain("INSERT INTO quota_ledger");
    expect(db.runs[0].values).toEqual(expect.arrayContaining([
      "user-owner",
      "reservation-1",
      "request-1",
      "rejected",
      0,
    ]));
    expect(db.runs[0].sql).not.toContain("UPDATE");
  });
});
