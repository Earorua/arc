import { z } from "zod";
import {
  planningMutationResultSchema,
  planningWorkspaceSchema,
  type DailyUnit,
  type LearningPathVersion,
  type PlanVersion,
  type PlanningEvent,
  type PlanningMutationResult,
  type PlanningWorkspace,
} from "../../contracts/planning";
import type {
  PlanningMutationLookup,
  PlanningOwnerGoal,
  PlanningRepository,
  PlanningRepositoryPayload,
  SavePlanningEventCommand,
  SavePlanningGenerationCommand,
} from "./repository";
import { PlanningConflictError, PlanningNotFoundError, PlanningUnavailableError } from "./service";
import { canonicalJson } from "../../lib/planning/fingerprint";

const IDEMPOTENCY_SCOPE_PREFIX = "adaptive-planning:";

const storedResultSchema = z.object({
  ownerId: z.string().min(1),
  goalId: z.string().min(1),
  result: planningMutationResultSchema,
}).strict();

type RepositoryOptions = { createId: () => string; now: () => Date };
const defaultOptions: RepositoryOptions = {
  createId: () => crypto.randomUUID(),
  now: () => new Date(),
};

type GoalRow = { id: string; user_id?: string };
type IdempotencyRow = { response_json: string };
type WorkspaceRow = {
  id: string;
  revision: number;
  next_sequence: number;
  current_audit_version_id: string | null;
  current_availability_version_id: string | null;
  active_path_version_id: string | null;
  active_plan_version_id: string | null;
  pending_plan_version_id: string | null;
};

export class D1PlanningRepository implements PlanningRepository {
  private readonly options: RepositoryOptions;

  constructor(private readonly db: D1Database, options: Partial<RepositoryOptions> = {}) {
    this.options = { ...defaultOptions, ...options };
  }

  async findActiveGoal(ownerId: string): Promise<PlanningOwnerGoal | null> {
    const row = await this.db.prepare(`
      SELECT id, user_id FROM career_goals
      WHERE user_id = ?1 AND active_slot = 1
      LIMIT 1
    `).bind(ownerId).first<GoalRow>();
    return row ? { ownerId, goalId: row.id } : null;
  }

  async findMutation(input: PlanningMutationLookup): Promise<PlanningRepositoryPayload | null> {
    const row = await this.db.prepare(`
      SELECT response_json FROM idempotency_records
      WHERE user_id = ?1 AND scope = ?2 AND mutation_id = ?3
      LIMIT 1
    `).bind(input.ownerId, scopeFor(input.goalId), input.mutationId)
      .first<IdempotencyRow>();
    if (!row) return null;
    const stored = parseStoredResult(row.response_json);
    if (stored.ownerId !== input.ownerId || stored.goalId !== input.goalId) throw new PlanningNotFoundError();
    return { ownerId: stored.ownerId, goalId: stored.goalId, payload: stored.result };
  }

  async load(scope: PlanningOwnerGoal): Promise<PlanningRepositoryPayload | null> {
    const workspaceRow = await this.db.prepare(`
      SELECT id, revision, next_sequence, current_audit_version_id, current_availability_version_id,
        active_path_version_id, active_plan_version_id, pending_plan_version_id
      FROM planning_workspaces
      WHERE user_id = ?1 AND goal_id = ?2
      LIMIT 1
    `).bind(scope.ownerId, scope.goalId).first<WorkspaceRow>();
    if (!workspaceRow) return null;
    try {
      // Target has no dedicated Task 8 table. The strict latest result snapshot carries
      // it, while every immutable/event/unit body is reloaded owner+goal scoped below.
      const row = await this.db.prepare(`SELECT response_json FROM idempotency_records
        WHERE user_id = ?1 AND scope = ?2
        ORDER BY json_extract(response_json, '$.result.workspace.revision') DESC, created_at DESC
        LIMIT 1`).bind(scope.ownerId, scopeFor(scope.goalId))
        .first<IdempotencyRow>();
      if (!row) throw new Error("missing workspace payload");
      const stored = parseStoredResult(row.response_json);
      if (stored.ownerId !== scope.ownerId || stored.goalId !== scope.goalId) throw new Error("owner mismatch");
      const snapshot = planningWorkspaceSchema.parse(stored.result.workspace);
      const [audit, availabilities, paths, plans, units, events] = await Promise.all([
        this.loadOne("skill_audit_versions", scope, workspaceRow.current_audit_version_id),
        this.loadMany("availability_versions", scope),
        this.loadMany("learning_path_versions", scope),
        this.loadMany("plan_versions", scope),
        this.loadMany("daily_units", scope),
        this.loadMany("planning_events", scope),
      ]);
      const workspace = planningWorkspaceSchema.parse({
        ...snapshot,
        audit,
        availabilityVersions: alignRows(availabilities, snapshot.availabilityVersions, versionKey),
        availability: availabilities.find((item) => readId(item) === workspaceRow.current_availability_version_id),
        pathVersions: alignRows(paths, snapshot.pathVersions, versionKey),
        planVersions: alignRows(plans, snapshot.planVersions, versionKey),
        dailyUnits: alignRows(units, snapshot.dailyUnits, dailyUnitKey),
        events: alignRows(events, snapshot.events, eventKey),
      });
      if (workspace.id !== workspaceRow.id || workspace.revision !== workspaceRow.revision
        || workspace.lastSequence + 1 !== workspaceRow.next_sequence
        || workspace.audit.id !== workspaceRow.current_audit_version_id
        || workspace.availability.id !== workspaceRow.current_availability_version_id
        || workspace.activePathVersionId !== workspaceRow.active_path_version_id
        || workspace.activePlanVersionId !== workspaceRow.active_plan_version_id
        || workspace.pendingPlanVersionId !== workspaceRow.pending_plan_version_id) {
        throw new Error("pointer mismatch");
      }
      if (canonicalJson(workspace) !== canonicalJson(snapshot)) throw new Error("snapshot mismatch");
      return { ...scope, payload: workspace };
    } catch {
      throw new PlanningUnavailableError();
    }
  }

  async saveGeneration(command: SavePlanningGenerationCommand): Promise<PlanningRepositoryPayload> {
    let result: PlanningMutationResult;
    try { result = planningMutationResultSchema.parse(command.result); }
    catch { throw new PlanningUnavailableError(); }
    if (result.workspace.goalId !== command.goalId || result.workspace.revision !== 0) throw new PlanningUnavailableError();
    const replay = await this.findMutation(command);
    if (replay) return replay;
    const now = this.options.now().getTime();
    const statements: D1PreparedStatement[] = [];
    statements.push(...immutableGenerationStatements(this.db, command.ownerId, command.goalId, result.workspace, now));
    statements.push(this.db.prepare(`UPDATE career_goals SET weekly_minutes = ?1, updated_at = ?2
      WHERE user_id = ?3 AND id = ?4 AND active_slot = 1`).bind(
      result.workspace.availability.weeklyMinutes, now, command.ownerId, command.goalId));
    statements.push(this.db.prepare(`
      INSERT INTO planning_workspaces (
        id,user_id,goal_id,revision,current_audit_version_id,current_availability_version_id,
        active_path_version_id,active_plan_version_id,pending_plan_version_id,next_sequence,created_at,updated_at
      ) VALUES (?1,?2,?3,0,?4,?5,?6,?7,NULL,1,?8,?8)
    `).bind(result.workspace.id, command.ownerId, command.goalId, result.workspace.audit.id,
      result.workspace.availability.id, result.workspace.activePathVersionId,
      result.workspace.activePlanVersionId, now));
    statements.push(this.idempotencyStatement(command, result, now));
    try {
      await this.db.batch(statements);
    } catch (error) {
      const winner = await this.findMutation(command);
      if (winner) return winner;
      throw isConflictError(error) ? new PlanningConflictError() : new PlanningUnavailableError();
    }
    return { ownerId: command.ownerId, goalId: command.goalId, payload: result };
  }

  async saveEvent(command: SavePlanningEventCommand): Promise<PlanningRepositoryPayload> {
    const previous = parseWorkspace(command.previous);
    let result: PlanningMutationResult;
    try { result = planningMutationResultSchema.parse(command.result); }
    catch { throw new PlanningUnavailableError(); }
    const workspace = result.workspace;
    if (previous.goalId !== command.goalId || workspace.goalId !== command.goalId
      || previous.revision !== command.baseRevision || previous.activePlanVersionId !== command.baseVersionId
      || workspace.revision !== command.baseRevision + 1 || workspace.lastSequence !== previous.lastSequence + 1) {
      throw new PlanningConflictError();
    }
    const replay = await this.findMutation(command);
    if (replay) return replay;
    const event = workspace.events.at(-1);
    if (!event || event.mutationId !== command.mutationId) throw new PlanningUnavailableError();
    const now = this.options.now().getTime();
    const statements = transitionStatements(this.db, command.ownerId, command.goalId, previous, workspace, event, now);
    if (event.kind === "replan_accepted" && previous.availability.id !== workspace.availability.id) {
      statements.push(this.db.prepare(`UPDATE career_goals SET weekly_minutes = ?1, updated_at = ?2
        WHERE user_id = ?3 AND id = ?4 AND active_slot = 1`).bind(
        workspace.availability.weeklyMinutes, now, command.ownerId, command.goalId));
    }
    const pointerIndex = statements.length;
    statements.push(this.db.prepare(`
      UPDATE planning_workspaces SET revision = ?1, current_audit_version_id = ?2,
        current_availability_version_id = ?3, active_path_version_id = ?4,
        active_plan_version_id = ?5, pending_plan_version_id = ?6, next_sequence = ?7, updated_at = ?8
      WHERE user_id = ?9 AND goal_id = ?10 AND id = ?11 AND revision = ?12 AND next_sequence = ?13
    `).bind(workspace.revision, workspace.audit.id, workspace.availability.id,
      workspace.activePathVersionId, workspace.activePlanVersionId, workspace.pendingPlanVersionId,
      workspace.lastSequence + 1, now, command.ownerId, command.goalId, workspace.id,
      command.baseRevision, previous.lastSequence + 1));
    statements.push(this.idempotencyStatement(command, result, now));
    try {
      const batch = await this.db.batch(statements);
      const pointerResult = batch[pointerIndex] as { meta?: { changes?: number } } | undefined;
      if (pointerResult?.meta?.changes === 0) throw new PlanningConflictError();
    } catch (error) {
      const winner = await this.findMutation(command);
      if (winner) return winner;
      throw error instanceof PlanningConflictError || isConflictError(error)
        ? new PlanningConflictError()
        : new PlanningUnavailableError();
    }
    return { ownerId: command.ownerId, goalId: command.goalId, payload: result };
  }

  private idempotencyStatement(
    command: SavePlanningGenerationCommand,
    result: PlanningMutationResult,
    now: number,
  ): D1PreparedStatement {
    const stored = storedResultSchema.parse({
      ownerId: command.ownerId,
      goalId: command.goalId,
      result,
    });
    return this.db.prepare(`INSERT INTO idempotency_records
      (id,user_id,scope,mutation_id,response_json,created_at) VALUES (?1,?2,?3,?4,?5,?6)`)
      .bind(this.options.createId(), command.ownerId, scopeFor(command.goalId), command.mutationId, JSON.stringify(stored), now);
  }

  private async loadOne(table: string, scope: PlanningOwnerGoal, id: string | null): Promise<unknown | null> {
    if (!id) return null;
    const row = await this.db.prepare(`SELECT payload_json FROM ${safeTable(table)}
      WHERE user_id = ?1 AND goal_id = ?2 AND id = ?3 LIMIT 1`).bind(scope.ownerId, scope.goalId, id).first<PayloadRow>();
    return row ? parsePayload(row.payload_json) : null;
  }

  private async loadMany(table: string, scope: PlanningOwnerGoal): Promise<unknown[]> {
    const rows = await this.db.prepare(`SELECT payload_json FROM ${safeTable(table)}
      WHERE user_id = ?1 AND goal_id = ?2 ORDER BY created_at ASC`).bind(scope.ownerId, scope.goalId).all<PayloadRow>();
    return rows.results.map(({ payload_json }) => parsePayload(payload_json));
  }

}

function immutableGenerationStatements(
  db: D1Database, ownerId: string, goalId: string, workspace: PlanningWorkspace, now: number,
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO skill_audit_versions
      (id,user_id,goal_id,schema_version,blueprint_id,blueprint_version,input_fingerprint,payload_json,created_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`).bind(workspace.audit.id, ownerId, goalId,
      workspace.audit.schemaVersion, workspace.audit.blueprintId, workspace.audit.blueprintVersion,
      workspace.audit.inputFingerprint, JSON.stringify(workspace.audit), now),
    ...workspace.availabilityVersions.map((availability) => db.prepare(`INSERT INTO availability_versions
      (id,user_id,goal_id,schema_version,input_fingerprint,weekly_minutes,payload_json,created_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`).bind(availability.id, ownerId, goalId,
      availability.schemaVersion, availability.inputFingerprint, availability.weeklyMinutes,
      JSON.stringify(availability), now)),
  ];
  statements.push(...workspace.pathVersions.map((path) => insertPath(db, ownerId, goalId, path, now)));
  statements.push(...workspace.planVersions.map((plan) => insertPlan(db, ownerId, goalId, plan, now)));
  statements.push(...workspace.dailyUnits.map((unit) => insertUnit(db, ownerId, goalId, unit, now)));
  return statements;
}

function transitionStatements(
  db: D1Database, ownerId: string, goalId: string, previous: PlanningWorkspace,
  next: PlanningWorkspace, event: PlanningEvent, now: number,
): D1PreparedStatement[] {
  const previousAvailabilities = new Set(previous.availabilityVersions.map(({ id }) => id));
  const previousPaths = new Set(previous.pathVersions.map(({ id }) => id));
  const previousPlans = new Set(previous.planVersions.map(({ id }) => id));
  const previousUnits = new Set(previous.dailyUnits.map(({ planVersionId, id }) => `${planVersionId}:${id}`));
  const statements: D1PreparedStatement[] = [];
  statements.push(...next.availabilityVersions.filter(({ id }) => !previousAvailabilities.has(id)).map((availability) =>
    db.prepare(`INSERT INTO availability_versions
      (id,user_id,goal_id,schema_version,input_fingerprint,weekly_minutes,payload_json,created_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`).bind(availability.id, ownerId, goalId,
      availability.schemaVersion, availability.inputFingerprint, availability.weeklyMinutes,
      JSON.stringify(availability), now)));
  statements.push(...next.pathVersions.filter(({ id }) => !previousPaths.has(id)).map((path) => insertPath(db, ownerId, goalId, path, now)));
  statements.push(...next.planVersions.filter(({ id }) => !previousPlans.has(id)).map((plan) => insertPlan(db, ownerId, goalId, plan, now)));
  statements.push(...next.dailyUnits.filter(({ planVersionId, id }) => !previousUnits.has(`${planVersionId}:${id}`))
    .map((unit) => insertUnit(db, ownerId, goalId, unit, now)));
  statements.push(db.prepare(`INSERT INTO planning_events
    (id,user_id,goal_id,workspace_id,sequence,mutation_id,target_plan_version_id,candidate_plan_version_id,
     unit_id,kind,payload_json,occurred_at,created_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`).bind(
    event.eventId, ownerId, goalId, next.id, event.sequence, event.mutationId,
    event.targetPlanVersionId, "candidatePlanVersionId" in event ? event.candidatePlanVersionId : null,
    "unitId" in event ? event.unitId : null, event.kind, JSON.stringify(event), Date.parse(event.occurredAt), now));
  return statements;
}

function insertPath(db: D1Database, ownerId: string, goalId: string, path: LearningPathVersion, now: number) {
  return db.prepare(`INSERT INTO learning_path_versions
    (id,user_id,goal_id,schema_version,blueprint_id,blueprint_version,registry_id,registry_version,
     audit_version_id,availability_version_id,scope_mode,input_fingerprint,payload_json,created_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)`).bind(
    path.id, ownerId, goalId, path.schemaVersion, path.blueprintId, path.blueprintVersion,
    path.registryId, path.registryVersion, path.auditVersionId, path.availabilityVersionId,
    path.scopeMode, path.inputFingerprint, JSON.stringify(path), now);
}

function insertPlan(db: D1Database, ownerId: string, goalId: string, plan: PlanVersion, now: number) {
  return db.prepare(`INSERT INTO plan_versions
    (id,user_id,goal_id,schema_version,path_version_id,generation,base_version_id,replan_reason,
     planning_date,input_fingerprint,payload_json,created_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`).bind(
    plan.id, ownerId, goalId, plan.schemaVersion, plan.pathVersionId, plan.generation,
    plan.baseVersionId, plan.replanReason, plan.planningDate, plan.inputFingerprint,
    JSON.stringify(plan), now);
}

function insertUnit(db: D1Database, ownerId: string, goalId: string, unit: DailyUnit, now: number) {
  return db.prepare(`INSERT INTO daily_units
    (id,user_id,goal_id,plan_version_id,unit_id,scheduled_date,slot,required,payload_json,created_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`).bind(
    `${unit.planVersionId}:${unit.id}`, ownerId, goalId, unit.planVersionId, unit.id,
    unit.scheduledDate, unit.slot, unit.required ? 1 : 0, JSON.stringify(unit), now);
}

function parseStoredResult(value: string) {
  try { return storedResultSchema.parse(JSON.parse(value) as unknown); }
  catch { throw new PlanningUnavailableError(); }
}

type PayloadRow = { payload_json: string };

function parsePayload(value: string): unknown {
  try { return JSON.parse(value) as unknown; }
  catch { throw new PlanningUnavailableError(); }
}

function safeTable(value: string): string {
  const allowed = new Set(["skill_audit_versions", "availability_versions", "learning_path_versions", "plan_versions", "daily_units", "planning_events"]);
  if (!allowed.has(value)) throw new PlanningUnavailableError();
  return value;
}

function readId(value: unknown): string {
  if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string") throw new PlanningUnavailableError();
  return value.id;
}

function alignRows<T>(rows: unknown[], expected: readonly T[], key: (value: unknown) => string): unknown[] {
  const byKey = new Map(rows.map((row) => [key(row), row]));
  if (byKey.size !== rows.length || byKey.size !== expected.length) throw new PlanningUnavailableError();
  return expected.map((item) => {
    const row = byKey.get(key(item));
    if (!row) throw new PlanningUnavailableError();
    return row;
  });
}

function versionKey(value: unknown): string {
  return readId(value);
}

function dailyUnitKey(value: unknown): string {
  if (!value || typeof value !== "object" || !("planVersionId" in value) || typeof value.planVersionId !== "string") {
    throw new PlanningUnavailableError();
  }
  return `${value.planVersionId}:${readId(value)}`;
}

function eventKey(value: unknown): string {
  if (!value || typeof value !== "object" || !("eventId" in value) || typeof value.eventId !== "string") {
    throw new PlanningUnavailableError();
  }
  return value.eventId;
}

function scopeFor(goalId: string): string {
  return `${IDEMPOTENCY_SCOPE_PREFIX}${goalId}`;
}

function parseWorkspace(value: unknown): PlanningWorkspace {
  try { return planningWorkspaceSchema.parse(value); }
  catch { throw new PlanningUnavailableError(); }
}

function isConflictError(error: unknown): boolean {
  return error instanceof Error && /unique|constraint|revision|sequence/iu.test(error.message);
}
