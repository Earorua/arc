import { describe, expect, it } from "vitest";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";
import type { PlanningMutationResult } from "../../app/contracts/planning";
import { PlanningService } from "../../app/server/planning/service";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";

type PreparedCall = { sql: string; values: unknown[] };

class FakeStatement {
  values: unknown[] = [];
  constructor(readonly db: FakeD1, readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; this.db.calls.push({ sql: this.sql, values }); return this; }
  async first<T>() { return this.db.takeFirst(this.sql) as T | null; }
  async all<T>() { return { success: true, results: this.db.takeAll(this.sql) as T[] }; }
}

class FakeD1 {
  readonly calls: PreparedCall[] = [];
  readonly batches: PreparedCall[][] = [];
  readonly committedBatches: PreparedCall[][] = [];
  batchError: Error | null = null;
  batchResults: Array<{ success: boolean; meta: { changes?: number } }> | null = null;
  guardExists: boolean | null = null;
  private readonly firstResponses: Array<{ match: string; value: unknown }> = [];
  private readonly allResponses: Array<{ match: string; value: unknown[] }> = [];
  whenFirst(match: string, value: unknown) { this.firstResponses.push({ match, value }); }
  whenAll(match: string, value: unknown[]) { this.allResponses.push({ match, value }); }
  prepare(sql: string) { return new FakeStatement(this, sql); }
  async batch(statements: FakeStatement[]) {
    const batch = statements.map(({ sql, values }) => ({ sql, values }));
    this.batches.push(batch);
    if (this.batchError) { const error = this.batchError; this.batchError = null; throw error; }
    if (this.guardExists === false && /CASE WHEN\s+EXISTS/u.test(batch.at(-1)?.sql ?? "")) {
      throw new Error("NOT NULL constraint failed: idempotency_records.response_json");
    }
    this.committedBatches.push(batch);
    return this.batchResults ?? statements.map(() => ({ success: true, meta: { changes: 1 } }));
  }
  takeFirst(sql: string) {
    const index = this.firstResponses.findIndex(({ match }) => sql.includes(match));
    return index < 0 ? null : this.firstResponses.splice(index, 1)[0]!.value;
  }
  takeAll(sql: string) {
    const index = this.allResponses.findIndex(({ match }) => sql.includes(match));
    return index < 0 ? [] : this.allResponses.splice(index, 1)[0]!.value;
  }
}

function repositoryWith(db: FakeD1) {
  let id = 0;
  return new D1PlanningRepository(db as unknown as D1Database, {
    createId: () => `stored-${++id}`,
    now: () => new Date("2026-08-17T00:00:00.000Z"),
  });
}

async function validResult(): Promise<PlanningMutationResult> {
  const service = new PlanningService({
    repository: {
      findActiveGoal: async () => ({ ownerId: "user-1", goalId: "goal-1" }),
      load: async () => null,
      findMutation: async () => null,
      saveGeneration: async (command) => ({ ownerId: command.ownerId, goalId: command.goalId, payload: command.result }),
      saveEvent: async (command) => ({ ownerId: command.ownerId, goalId: command.goalId, payload: command.result }),
    },
    intelligence: { getPublished: async () => flagshipBlueprint },
    registry: flagshipUnitRegistry,
    createId: () => "workspace-1",
  });
  return service.generate("user-1", {
    mutationId: "mutation-generate-1",
    roleId: "ai-native-full-stack-engineer",
    planningDate: "2026-08-17",
    audit: {
      id: "audit-1", schemaVersion: "2026.08.1", blueprintId: flagshipBlueprint.id,
      blueprintVersion: flagshipBlueprint.version,
      answers: flagshipBlueprint.skills.map(({ id: skillId }) => ({ skillId, level: "conceptual", evidenceRefs: [] })),
      evidence: [], createdBy: "learner", inputFingerprint: "audit-fingerprint",
    },
    availability: {
      id: "availability-1", schemaVersion: "2026.08.1", timeZone: "Asia/Shanghai",
      weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 60, sunday: 60 },
      exceptions: [], weeklyMinutes: 420, inputFingerprint: "availability-fingerprint",
    },
    target: { id: "target-1", schemaVersion: "2026.08.1", targetWeeks: 18, inputFingerprint: "target-fingerprint" },
    selectedScope: "full-scope",
  });
}

async function completedResults(): Promise<{ previous: PlanningMutationResult; next: PlanningMutationResult }> {
  const previous = await validResult();
  const service = new PlanningService({
    repository: {
      findActiveGoal: async () => ({ ownerId: "user-1", goalId: "goal-1" }),
      load: async () => ({ ownerId: "user-1", goalId: "goal-1", payload: previous.workspace }),
      findMutation: async () => null,
      saveGeneration: async (command) => ({ ownerId: command.ownerId, goalId: command.goalId, payload: command.result }),
      saveEvent: async (command) => ({ ownerId: command.ownerId, goalId: command.goalId, payload: command.result }),
    },
    intelligence: { getPublished: async () => flagshipBlueprint },
    registry: flagshipUnitRegistry,
    createId: () => "event-1",
    now: () => new Date("2026-08-17T00:00:00.000Z"),
  });
  const next = await service.appendEvent("user-1", {
    mutationId: "mutation-event-1",
    baseVersionId: previous.workspace.activePlanVersionId,
    event: { kind: "completed", unitId: previous.workspace.dailyUnits[0]!.id, actualMinutes: 30, planningDate: "2026-08-17" },
  });
  return { previous, next };
}

async function availabilityResults(): Promise<{
  previous: PlanningMutationResult;
  proposed: PlanningMutationResult;
  accepted: PlanningMutationResult;
}> {
  const previous = await validResult();
  let workspace = structuredClone(previous.workspace);
  let id = 0;
  const service = new PlanningService({
    repository: {
      findActiveGoal: async () => ({ ownerId: "user-1", goalId: "goal-1" }),
      load: async () => ({ ownerId: "user-1", goalId: "goal-1", payload: workspace }),
      findMutation: async () => null,
      saveGeneration: async (command) => ({ ownerId: command.ownerId, goalId: command.goalId, payload: command.result }),
      saveEvent: async (command) => {
        workspace = structuredClone(command.result.workspace);
        return { ownerId: command.ownerId, goalId: command.goalId, payload: command.result };
      },
    },
    intelligence: { getPublished: async () => flagshipBlueprint },
    registry: flagshipUnitRegistry,
    createId: () => `availability-event-${++id}`,
    now: () => new Date("2026-08-17T00:00:00.000Z"),
  });
  const availability = structuredClone(previous.workspace.availability);
  availability.id = "availability-2";
  availability.inputFingerprint = "availability-fingerprint-2";
  availability.weekdays = {
    monday: 90, tuesday: 90, wednesday: 90, thursday: 90,
    friday: 90, saturday: 90, sunday: 90,
  };
  availability.weeklyMinutes = 630;
  const proposed = await service.appendEvent("user-1", {
    mutationId: "mutation-availability",
    baseVersionId: previous.workspace.activePlanVersionId,
    event: { kind: "availability_changed", availability, planningDate: "2026-08-17" },
  });
  const accepted = await service.acceptReplan("user-1", {
    mutationId: "mutation-accept",
    baseVersionId: proposed.workspace.activePlanVersionId,
    candidatePlanVersionId: proposed.workspace.pendingPlanVersionId,
  });
  return { previous, proposed, accepted };
}

describe("D1PlanningRepository", () => {
  it("finds the active goal by authenticated owner and active slot", async () => {
    const db = new FakeD1();
    db.whenFirst("FROM career_goals", { id: "goal-1", user_id: "user-1" });

    await expect(repositoryWith(db).findActiveGoal("user-1"))
      .resolves.toEqual({ ownerId: "user-1", goalId: "goal-1" });
    expect(db.calls[0]).toMatchObject({ values: ["user-1"] });
    expect(db.calls[0]!.sql).toContain("active_slot = 1");
  });

  it("parses a stored idempotent result and binds both owner and goal", async () => {
    const db = new FakeD1();
    db.whenFirst("FROM idempotency_records", {
      response_json: JSON.stringify({ ownerId: "user-1", goalId: "goal-1", revision: 3, result: { broken: true } }),
    });

    await expect(repositoryWith(db).findMutation({ ownerId: "user-1", goalId: "goal-1", mutationId: "mutation-1" }))
      .rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
    expect(db.calls[0]!.values).toEqual(["user-1", "adaptive-planning:goal-1", "mutation-1"]);
  });

  it("writes immutable generation rows before workspace pointers and idempotency in one batch", async () => {
    const db = new FakeD1();
    const repository = repositoryWith(db);
    const result = { outcome: "active", workspace: { invalid: true }, diff: null } as unknown as PlanningMutationResult;

    await expect(repository.saveGeneration({
      ownerId: "user-1", goalId: "goal-1", mutationId: "mutation-1", result,
    })).rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
    expect(db.batches).toHaveLength(0);
  });

  it("stores a valid generation immutable-first and goal-scoped in one batch", async () => {
    const db = new FakeD1();
    const result = await validResult();

    await repositoryWith(db).saveGeneration({
      ownerId: "user-1", goalId: "goal-1", mutationId: "mutation-1", result,
    });

    expect(db.batches).toHaveLength(1);
    const batch = db.batches[0]!;
    const workspaceIndex = batch.findIndex(({ sql }) => sql.includes("INSERT INTO planning_workspaces"));
    const resultIndex = batch.findIndex(({ sql }) => sql.includes("INSERT INTO idempotency_records"));
    expect(batch.slice(0, workspaceIndex).map(({ sql }) => sql).join("\n")).toMatch(/skill_audit_versions[\s\S]*availability_versions[\s\S]*learning_path_versions[\s\S]*plan_versions[\s\S]*daily_units/u);
    expect(workspaceIndex).toBeGreaterThan(0);
    expect(resultIndex).toBeGreaterThan(workspaceIndex);
    const weeklyIndex = batch.findIndex(({ sql }) => sql.includes("UPDATE career_goals SET weekly_minutes"));
    expect(weeklyIndex).toBeGreaterThan(-1);
    expect(weeklyIndex).toBeLessThan(workspaceIndex);
    expect(batch[weeklyIndex]!.values).toEqual(expect.arrayContaining([420, "user-1", "goal-1"]));
    expect(batch[resultIndex]!.sql).toMatch(/CASE WHEN EXISTS[\s\S]*career_goals[\s\S]*active_slot = 1[\s\S]*THEN \?5 ELSE NULL END/u);
    expect(batch.every(({ values }) => values.includes("user-1") && values.includes("goal-1")
      || values.includes("adaptive-planning:goal-1"))).toBe(true);
  });

  it("rolls back generation when the active goal drifts before its database guard", async () => {
    const db = new FakeD1();
    db.guardExists = false;
    const result = await validResult();

    await expect(repositoryWith(db).saveGeneration({
      ownerId: "user-1", goalId: "goal-1", mutationId: "mutation-1", result,
    })).rejects.toMatchObject({ code: "CONFLICT" });

    expect(db.batches).toHaveLength(1);
    expect(db.committedBatches).toHaveLength(0);
  });

  it("loads target from the strict snapshot and verifies every canonical table payload", async () => {
    const db = new FakeD1();
    const result = await validResult();
    const workspace = result.workspace;
    db.whenFirst("FROM planning_workspaces", {
      id: workspace.id, revision: workspace.revision, next_sequence: workspace.lastSequence + 1,
      current_audit_version_id: workspace.audit.id,
      current_availability_version_id: workspace.availability.id,
      active_path_version_id: workspace.activePathVersionId,
      active_plan_version_id: workspace.activePlanVersionId,
      pending_plan_version_id: workspace.pendingPlanVersionId,
    });
    db.whenFirst("FROM idempotency_records", {
      response_json: JSON.stringify({ ownerId: "user-1", goalId: "goal-1", result }),
    });
    db.whenFirst("FROM skill_audit_versions", { payload_json: JSON.stringify(workspace.audit) });
    db.whenAll("FROM availability_versions", workspace.availabilityVersions.map((item) => ({ payload_json: JSON.stringify(item) })));
    db.whenAll("FROM learning_path_versions", workspace.pathVersions.map((item) => ({ payload_json: JSON.stringify(item) })));
    db.whenAll("FROM plan_versions", workspace.planVersions.map((item) => ({ payload_json: JSON.stringify(item) })));
    db.whenAll("FROM daily_units", workspace.dailyUnits.map((item) => ({ payload_json: JSON.stringify(item) })));
    db.whenAll("FROM planning_events", []);

    const loaded = await repositoryWith(db).load({ ownerId: "user-1", goalId: "goal-1" });

    expect(loaded?.payload).toEqual(workspace);
    expect((loaded?.payload as typeof workspace).target).toEqual(workspace.target);
    expect(db.calls.filter(({ sql }) => /FROM (planning_|skill_|availability_|learning_|plan_|daily_)/u.test(sql))
      .every(({ values }) => values.includes("user-1") && values.includes("goal-1"))).toBe(true);
  });

  it("fails closed on a corrupt or mismatched canonical snapshot without writing", async () => {
    for (const response_json of ["{", JSON.stringify({ ownerId: "wrong-user", goalId: "goal-1", result: await validResult() })]) {
      const db = new FakeD1();
      const result = await validResult();
      db.whenFirst("FROM planning_workspaces", {
        id: result.workspace.id, revision: 0, next_sequence: 1,
        current_audit_version_id: result.workspace.audit.id,
        current_availability_version_id: result.workspace.availability.id,
        active_path_version_id: result.workspace.activePathVersionId,
        active_plan_version_id: result.workspace.activePlanVersionId,
        pending_plan_version_id: null,
      });
      db.whenFirst("FROM idempotency_records", { response_json });

      await expect(repositoryWith(db).load({ ownerId: "user-1", goalId: "goal-1" }))
        .rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
      expect(db.batches).toHaveLength(0);
    }
  });

  it("uses prepared owner-and-goal scoped statements and one guarded event batch", async () => {
    const db = new FakeD1();
    const repository = repositoryWith(db);
    await expect(repository.saveEvent({
      ownerId: "user-1", goalId: "goal-1", mutationId: "mutation-1",
      baseRevision: 1, baseVersionId: "plan-1", previous: {}, result: {} as PlanningMutationResult,
    })).rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
    expect(db.batches).toHaveLength(0);
  });

  it("writes one immutable-first event batch with a revision and sequence guard", async () => {
    const db = new FakeD1();
    const { previous, next } = await completedResults();

    await repositoryWith(db).saveEvent({
      ownerId: "user-1", goalId: "goal-1", mutationId: "mutation-event-1",
      baseRevision: previous.workspace.revision,
      baseVersionId: previous.workspace.activePlanVersionId,
      previous: previous.workspace,
      result: next,
    });

    expect(db.batches).toHaveLength(1);
    const batch = db.batches[0]!;
    const eventIndex = batch.findIndex(({ sql }) => sql.includes("INSERT INTO planning_events"));
    const pointerIndex = batch.findIndex(({ sql }) => sql.includes("UPDATE planning_workspaces"));
    const replayIndex = batch.findIndex(({ sql }) => sql.includes("INSERT INTO idempotency_records"));
    expect(batch.slice(0, eventIndex).some(({ sql }) => sql.includes("INSERT INTO plan_versions"))).toBe(true);
    expect(eventIndex).toBeGreaterThan(0);
    expect(pointerIndex).toBeGreaterThan(eventIndex);
    expect(replayIndex).toBeGreaterThan(pointerIndex);
    expect(batch[pointerIndex]!.sql).toContain("revision = ?12 AND next_sequence = ?13");
    expect(batch[pointerIndex]!.values).toEqual(expect.arrayContaining([
      "user-1", "goal-1", previous.workspace.revision, previous.workspace.lastSequence + 1,
    ]));
    expect(batch[replayIndex]!.sql).toMatch(/CASE WHEN[\s\S]*EXISTS[\s\S]*planning_workspaces[\s\S]*pending_plan_version_id IS \?16[\s\S]*THEN \?5 ELSE NULL END/u);
    expect(batch[replayIndex]!.values).toEqual(expect.arrayContaining(["user-1", "goal-1"]));
  });

  it("uses the final database guard to roll back every event write when pointer CAS loses", async () => {
    const db = new FakeD1();
    const { previous, next } = await completedResults();
    db.guardExists = false;
    db.batchResults = Array.from({ length: 20 }, () => ({ success: true, meta: { changes: 1 } }));

    await expect(repositoryWith(db).saveEvent({
      ownerId: "user-1", goalId: "goal-1", mutationId: "mutation-event-1",
      baseRevision: previous.workspace.revision,
      baseVersionId: previous.workspace.activePlanVersionId,
      previous: previous.workspace,
      result: next,
    })).rejects.toMatchObject({ code: "CONFLICT" });

    expect(db.batches).toHaveLength(1);
    expect(db.committedBatches).toHaveLength(0);
  });

  it("synchronizes weekly minutes only on generation and accepted availability changes", async () => {
    const { previous, proposed, accepted } = await availabilityResults();
    const proposalDb = new FakeD1();
    await repositoryWith(proposalDb).saveEvent({
      ownerId: "user-1", goalId: "goal-1", mutationId: "mutation-availability",
      baseRevision: previous.workspace.revision,
      baseVersionId: previous.workspace.activePlanVersionId,
      previous: previous.workspace,
      result: proposed,
    });
    expect(proposalDb.batches[0]!.some(({ sql }) => sql.includes("UPDATE career_goals SET weekly_minutes"))).toBe(false);

    const acceptDb = new FakeD1();
    await repositoryWith(acceptDb).saveEvent({
      ownerId: "user-1", goalId: "goal-1", mutationId: "mutation-accept",
      baseRevision: proposed.workspace.revision,
      baseVersionId: proposed.workspace.activePlanVersionId,
      previous: proposed.workspace,
      result: accepted,
    });
    const batch = acceptDb.batches[0]!;
    const weeklyIndex = batch.findIndex(({ sql }) => sql.includes("UPDATE career_goals SET weekly_minutes"));
    const pointerIndex = batch.findIndex(({ sql }) => sql.includes("UPDATE planning_workspaces"));
    const replayIndex = batch.findIndex(({ sql }) => sql.includes("INSERT INTO idempotency_records"));
    expect(batch[weeklyIndex]!.values).toEqual(expect.arrayContaining([630, "user-1", "goal-1"]));
    expect(weeklyIndex).toBeLessThan(pointerIndex);
    expect(pointerIndex).toBeLessThan(replayIndex);
  });

  it("recovers an exact winning replay after a unique sequence race, otherwise conflicts", async () => {
    const { previous, next } = await completedResults();
    const command = {
      ownerId: "user-1", goalId: "goal-1", mutationId: "mutation-event-1",
      baseRevision: previous.workspace.revision,
      baseVersionId: previous.workspace.activePlanVersionId,
      previous: previous.workspace,
      result: next,
    };
    const winning = new FakeD1();
    winning.whenFirst("FROM idempotency_records", null);
    winning.whenFirst("FROM idempotency_records", {
      response_json: JSON.stringify({ ownerId: "user-1", goalId: "goal-1", result: next }),
    });
    winning.batchError = new Error("UNIQUE constraint failed: planning_events.workspace_id, planning_events.sequence");
    await expect(repositoryWith(winning).saveEvent(command)).resolves.toEqual({
      ownerId: "user-1", goalId: "goal-1", payload: next,
    });

    const losing = new FakeD1();
    losing.batchError = new Error("UNIQUE constraint failed: planning_events.workspace_id, planning_events.sequence");
    await expect(repositoryWith(losing).saveEvent(command)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
