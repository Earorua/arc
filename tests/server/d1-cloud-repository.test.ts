import { describe, expect, it } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";
import { completeDemoUnit, createDemoState } from "../../app/lib/demo-store";
import { D1CloudRepository } from "../../app/server/cloud/d1-cloud-repository";
import type { MigrationRequest, MigrationResult } from "../../app/contracts/cloud-state";
import { legacyProofsToPracticingSkills } from "../../app/lib/proof/legacy-adapter";
import { projectSkillEvidence } from "../../app/lib/proof/projection";

type PreparedCall = { sql: string; values: unknown[] };

class FakeStatement {
  values: unknown[] = [];

  constructor(readonly db: FakeD1, readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    this.db.calls.push({ sql: this.sql, values });
    return this;
  }

  async first<T>() {
    return this.db.takeFirst(this.sql) as T | null;
  }

  async all<T>() {
    return { success: true, results: this.db.takeAll(this.sql) as T[] };
  }
}

class FakeD1 {
  readonly calls: PreparedCall[] = [];
  readonly batches: PreparedCall[][] = [];
  batchError: Error | null = null;
  private readonly firstResponses: Array<{ match: string; value: unknown }> = [];
  private readonly allResponses: Array<{ match: string; value: unknown[] }> = [];

  whenFirst(match: string, value: unknown) {
    this.firstResponses.push({ match, value });
  }

  whenAll(match: string, value: unknown[]) {
    this.allResponses.push({ match, value });
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  async batch(statements: FakeStatement[]) {
    this.batches.push(statements.map((statement) => ({ sql: statement.sql, values: statement.values })));
    if (this.batchError) {
      const error = this.batchError;
      this.batchError = null;
      throw error;
    }
    return statements.map(() => ({ success: true, results: [], meta: {} }));
  }

  takeFirst(sql: string) {
    const index = this.firstResponses.findIndex((response) => sql.includes(response.match));
    if (index < 0) return null;
    return this.firstResponses.splice(index, 1)[0].value;
  }

  takeAll(sql: string) {
    const index = this.allResponses.findIndex((response) => sql.includes(response.match));
    if (index < 0) return [];
    return this.allResponses.splice(index, 1)[0].value;
  }
}

function repositoryWith(db: FakeD1) {
  return new D1CloudRepository(db as unknown as D1Database, {
    createId: (() => {
      let count = 0;
      return () => `generated-${++count}`;
    })(),
    now: () => new Date("2026-07-28T00:00:00.000Z"),
    hash: async () => "request-hash",
  });
}

function migration(overrides: Partial<MigrationRequest> = {}): MigrationRequest {
  return {
    migrationId: "migration-1",
    consent: true,
    state: completeDemoUnit(createDemoState(), flagshipRole.today),
    conflictResolution: "reject",
    ...overrides,
  };
}

describe("D1CloudRepository", () => {
  it("binds the authenticated owner to every personal snapshot query", async () => {
    const db = new FakeD1();
    db.whenFirst("FROM career_goals", {
      id: "goal-1",
      role_id: flagshipRole.id,
      level: "beginner",
      weekly_minutes: 420,
      target_weeks: 18,
      updated_at: 1785196800000,
    });
    db.whenAll("FROM learning_events", [{ task_id: flagshipRole.today.id }]);
    db.whenAll("FROM proof_items", [{
      id: `proof-${flagshipRole.today.id}`,
      title: flagshipRole.today.deliverable,
      kind: "completion",
      skill_ids_json: JSON.stringify(flagshipRole.today.skillIds),
      verified: 1,
    }]);

    const snapshot = await repositoryWith(db).getSnapshot("user-1");

    expect(snapshot?.ownerId).toBe("user-1");
    expect(snapshot?.state.completedUnitIds).toEqual([flagshipRole.today.id]);
    expect(snapshot?.state.proofs[0].verified).toBe(true);
    const projections = projectSkillEvidence({
      skillIds: flagshipRole.today.skillIds,
      completedSkillIds: legacyProofsToPracticingSkills(snapshot!.state.proofs),
      versions: [],
      reviews: [],
      visibility: "internal",
    });
    expect(projections.every(({ status }) => status === "practicing")).toBe(true);
    expect(db.calls
      .filter((call) => call.sql.includes("SELECT"))
      .every((call) => call.values.includes("user-1")))
      .toBe(true);
  });

  it("imports profile, active goal, events, proofs, and result in one batch", async () => {
    const db = new FakeD1();
    db.whenFirst("FROM migration_runs", null);
    db.whenFirst("FROM career_goals", null);

    const result = await repositoryWith(db).importState("user-1", migration());

    expect(result).toMatchObject({ status: "imported", importedCompletionCount: 1, importedProofCount: 1 });
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0].map((call) => call.sql)).toEqual(expect.arrayContaining([
      expect.stringContaining("INSERT INTO learner_profiles"),
      expect.stringContaining("INSERT INTO career_goals"),
      expect.stringContaining("INSERT INTO learning_events"),
      expect.stringContaining("INSERT INTO proof_items"),
      expect.stringContaining("INSERT INTO migration_runs"),
    ]));
    expect(db.batches[0].every((call) => call.values.includes("user-1"))).toBe(true);
  });

  it("returns a completed migration before preparing any write", async () => {
    const db = new FakeD1();
    const stored: MigrationResult = {
      migrationId: "migration-1",
      status: "imported",
      activeGoalId: "goal-existing",
      importedCompletionCount: 1,
      importedProofCount: 1,
      availableResolutions: [],
    };
    db.whenFirst("FROM migration_runs", { result_json: JSON.stringify(stored) });

    const result = await repositoryWith(db).importState("user-1", migration());

    expect(result).toMatchObject(stored);
    expect(db.batches).toHaveLength(0);
    expect(db.calls[0]).toMatchObject({ values: ["user-1", "migration-1"] });
  });

  it("recovers the winning migration result after a concurrent unique race", async () => {
    const db = new FakeD1();
    const stored: MigrationResult = {
      migrationId: "migration-1",
      status: "imported",
      activeGoalId: "goal-winning-request",
      importedCompletionCount: 1,
      importedProofCount: 1,
      availableResolutions: [],
    };
    db.whenFirst("FROM migration_runs", null);
    db.whenFirst("FROM career_goals", null);
    db.whenFirst("FROM migration_runs", { result_json: JSON.stringify(stored) });
    db.batchError = new Error("UNIQUE constraint failed: migration_runs.user_id, migration_runs.migration_id");

    const result = await repositoryWith(db).importState("user-1", migration());

    expect(result).toMatchObject({ ownerId: "user-1", ...stored });
    expect(db.batches).toHaveLength(1);
  });

  it("queries the active slot and writes an archived import with a null slot", async () => {
    const db = new FakeD1();
    db.whenFirst("FROM migration_runs", null);
    db.whenFirst("FROM career_goals", {
      id: "goal-cloud",
      role_id: "cloud-role",
      level: "advanced",
      weekly_minutes: 600,
      target_weeks: 12,
      updated_at: 1785196800000,
    });

    await repositoryWith(db).importState("user-1", migration({ conflictResolution: "archive-import" }));

    expect(db.calls.some((call) => call.sql.includes("active_slot = 1"))).toBe(true);
    const goalInsert = db.batches[0].find((call) => call.sql.includes("INSERT INTO career_goals"));
    expect(goalInsert?.values).toContain("archived");
    expect(goalInsert?.values).toContain(null);
  });

  it("replays an existing completion mutation without a write batch", async () => {
    const db = new FakeD1();
    const snapshot = {
      state: createDemoState(),
      activeGoalId: "goal-1",
      revision: "revision-existing",
    };
    db.whenFirst("FROM idempotency_records", { response_json: JSON.stringify(snapshot) });

    const result = await repositoryWith(db).recordCompletion("user-1", {
      mutationId: "mutation-complete-1",
      unitId: flagshipRole.today.id,
      title: flagshipRole.today.title,
      deliverable: flagshipRole.today.deliverable,
      skillIds: flagshipRole.today.skillIds,
    });

    expect(result).toMatchObject({ ownerId: "user-1", revision: "revision-existing" });
    expect(db.batches).toHaveLength(0);
    expect(db.calls[0].sql).toContain("FROM idempotency_records");
  });

  it("stores only the public snapshot in a completion idempotency response", async () => {
    const db = new FakeD1();
    db.whenFirst("FROM idempotency_records", null);
    db.whenFirst("FROM career_goals", {
      id: "goal-1",
      role_id: flagshipRole.id,
      level: "beginner",
      weekly_minutes: 420,
      target_weeks: 18,
      updated_at: 1785196800000,
    });
    db.whenAll("FROM learning_events", []);
    db.whenAll("FROM proof_items", []);

    const result = await repositoryWith(db).recordCompletion("user-1", {
      mutationId: "mutation-complete-1",
      unitId: flagshipRole.today.id,
      title: flagshipRole.today.title,
      deliverable: flagshipRole.today.deliverable,
      skillIds: flagshipRole.today.skillIds,
    });

    const record = db.batches[0].find((call) => call.sql.includes("INSERT INTO idempotency_records"));
    const proofInsert = db.batches[0].find((call) => call.sql.includes("INSERT INTO proof_items"));
    const storedResponse = JSON.parse(record?.values.find((value) => typeof value === "string" && value.startsWith("{")) as string);
    expect(result.ownerId).toBe("user-1");
    expect(result.state.proofs[0].verified).toBe(false);
    expect(proofInsert?.values[7]).toBe(0);
    expect(storedResponse).not.toHaveProperty("ownerId");
  });
});
