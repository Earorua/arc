import { z } from "zod";
import {
  MAX_PLANNING_WORKSPACE_BYTES,
  parsePlanningWorkspaceAtRepositoryBoundary,
  planningEventSchema,
  planningMutationResultSchema,
  PLANNING_SCHEMA_VERSION,
  type DailyUnit,
  type LearningPathVersion,
  type PlanVersion,
  type PlanningEvent,
  type PlanningMutationResult,
  planningSourceReferenceSchema,
  type PlanningSourceContext,
  type PlanningSourceReference,
  type PlanningWorkspace,
} from "../../contracts/planning";
import { flagshipBlueprint } from "../../data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../data/flagship-unit-registry";
import { applyPlanningEvent, replayPlanningEvents, type PlanningTransition } from "../../lib/planning/event-reducer";
import type {
  PlanningMutationLookup,
  PlanningOwnerGoal,
  PlanningRepository,
  PlanningRepositoryPayload,
  SavePlanningEventCommand,
  SavePlanningGenerationCommand,
} from "./repository";
import { PlanningConflictError, PlanningNotFoundError, PlanningUnavailableError } from "./service";
import { canonicalJson, fingerprint } from "../../lib/planning/fingerprint";
import type { PlanningSourceResolver } from "./source-resolver";

const IDEMPOTENCY_SCOPE_PREFIX = "adaptive-planning:";
export const D1_PLANNING_VALUE_MAX_BYTES = 1_900_000;

const mutationOutcomeSchema = z.enum(["active", "proposed", "accepted", "discarded"]);
const lineageFingerprintSchema = z.string().regex(/^p2-[0-9a-f]{32}$/u);
const CLOUD_LINEAGE_KIND = "arc-cloud-planning-mutation-lineage";
const CLOUD_LINEAGE_VERSION = 1;

const storedGenerationSchema = z.object({
  schemaVersion: z.literal(PLANNING_SCHEMA_VERSION),
  ownerId: z.string().min(1),
  goalId: z.string().min(1),
  kind: z.literal("generation"),
  sourceReference: planningSourceReferenceSchema.optional(),
  result: z.unknown(),
}).strict();

const storedEventSchema = z.object({
  schemaVersion: z.literal(PLANNING_SCHEMA_VERSION),
  ownerId: z.string().min(1),
  goalId: z.string().min(1),
  kind: z.literal("event"),
  sequence: z.number().int().positive().max(5000),
  outcome: mutationOutcomeSchema,
  lineageFingerprint: lineageFingerprintSchema,
}).strict();

type StoredGeneration = Omit<z.infer<typeof storedGenerationSchema>, "result"> & { result: PlanningMutationResult };
type StoredEvent = z.infer<typeof storedEventSchema>;
type StoredMutation = StoredGeneration | StoredEvent;

type RepositoryOptions = {
  createId: () => string;
  now: () => Date;
  sourceResolver: Pick<PlanningSourceResolver, "resolveForGenerationCommit" | "resolveForReplay">;
};
const defaultOptions: RepositoryOptions = {
  createId: () => crypto.randomUUID(),
  now: () => new Date(),
  sourceResolver: {
    async resolveForGenerationCommit(_ownerId, reference) {
      const parsed = planningSourceReferenceSchema.parse(reference);
      if (parsed.source !== "flagship") throw new PlanningUnavailableError();
      return { reference: parsed, blueprint: flagshipBlueprint, registry: flagshipUnitRegistry };
    },
    async resolveForReplay(_ownerId, reference) {
      const parsed = planningSourceReferenceSchema.parse(reference);
      if (parsed.source !== "flagship") throw new PlanningUnavailableError();
      return { reference: parsed, blueprint: flagshipBlueprint, registry: flagshipUnitRegistry };
    },
  },
};

type GoalRow = { id: string; user_id?: string };
type IdempotencyRow = { response_json: string };
type EventIdempotencyRow = { mutation_id: string; response_json: string };
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
    const stored = parseStoredMutation(row.response_json);
    if (stored.ownerId !== input.ownerId || stored.goalId !== input.goalId) throw new PlanningNotFoundError();
    if (stored.kind === "generation") {
      const sourceReference = storedReference(stored);
      await this.resolveReplaySource(input.ownerId, sourceReference, stored.result.workspace);
      return { ownerId: stored.ownerId, goalId: stored.goalId, payload: stored.result, sourceReference };
    }
    const history = await this.replayHistory(input, stored.sequence);
    const replay = history.resultAtTarget;
    if (!replay || replay.outcome !== stored.outcome
      || history.lineageAtTarget !== stored.lineageFingerprint) {
      throw new PlanningUnavailableError();
    }
    return { ownerId: stored.ownerId, goalId: stored.goalId, payload: replay, sourceReference: history.sourceReference };
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
      // Target has no dedicated Task 8 table. The one bounded generation record carries
      // it; later state is reconstructed once from the canonical owner+goal event stream.
      const row = await this.db.prepare(`SELECT response_json FROM idempotency_records
        WHERE user_id = ?1 AND scope = ?2
          AND json_extract(response_json, '$.kind') = 'generation'
        ORDER BY created_at ASC
        LIMIT 1`).bind(scope.ownerId, scopeFor(scope.goalId))
        .first<IdempotencyRow>();
      if (!row) throw new Error("missing workspace payload");
      const generation = parseStoredGeneration(row.response_json);
      if (generation.ownerId !== scope.ownerId || generation.goalId !== scope.goalId) throw new Error("owner mismatch");
      const replayed = await this.replayHistory(scope, workspaceRow.next_sequence - 1, generation);
      const snapshot = replayed.workspace;
      const [audit, availabilities, paths, plans, units] = await Promise.all([
        this.loadOne("skill_audit_versions", scope, workspaceRow.current_audit_version_id),
        this.loadMany("availability_versions", scope),
        this.loadMany("learning_path_versions", scope),
        this.loadMany("plan_versions", scope),
        this.loadMany("daily_units", scope),
      ]);
      const workspace = parsePlanningWorkspaceAtRepositoryBoundary({
        ...snapshot,
        audit,
        availabilityVersions: alignRows(availabilities, snapshot.availabilityVersions, versionKey),
        availability: availabilities.find((item) => readId(item) === workspaceRow.current_availability_version_id),
        pathVersions: alignRows(paths, snapshot.pathVersions, versionKey),
        planVersions: alignRows(plans, snapshot.planVersions, versionKey),
        dailyUnits: alignRows(units, snapshot.dailyUnits, dailyUnitKey),
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
      return { ...scope, payload: workspace, sourceReference: replayed.sourceReference };
    } catch (error) {
      if (error instanceof PlanningUnavailableError && error.reason === "version-mismatch") throw error;
      throw new PlanningUnavailableError();
    }
  }

  async saveGeneration(command: SavePlanningGenerationCommand): Promise<PlanningRepositoryPayload> {
    const result = parseMutationResult(command.result);
    if (result.workspace.goalId !== command.goalId || result.workspace.revision !== 0) throw new PlanningUnavailableError();
    const sourceReference = parseSourceReference(command.sourceReference);
    await this.resolveGenerationSource(command.ownerId, sourceReference, result.workspace);
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
    return { ownerId: command.ownerId, goalId: command.goalId, payload: result, sourceReference };
  }

  async saveEvent(command: SavePlanningEventCommand): Promise<PlanningRepositoryPayload> {
    const previous = parseWorkspace(command.previous);
    const result = parseMutationResult(command.result);
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
    statements.push(this.db.prepare(`
      UPDATE planning_workspaces SET revision = ?1, current_audit_version_id = ?2,
        current_availability_version_id = ?3, active_path_version_id = ?4,
        active_plan_version_id = ?5, pending_plan_version_id = ?6, next_sequence = ?7, updated_at = ?8
      WHERE user_id = ?9 AND goal_id = ?10 AND id = ?11 AND revision = ?12 AND next_sequence = ?13
    `).bind(workspace.revision, workspace.audit.id, workspace.availability.id,
      workspace.activePathVersionId, workspace.activePlanVersionId, workspace.pendingPlanVersionId,
      workspace.lastSequence + 1, now, command.ownerId, command.goalId, workspace.id,
      command.baseRevision, previous.lastSequence + 1));
    const history = await this.replayHistory(command, previous.lastSequence);
    const sourceReference = parseSourceReference(command.sourceReference);
    if (canonicalJson(sourceReference) !== canonicalJson(history.sourceReference)) throw new PlanningUnavailableError();
    const previousLineage = history.lineageAtTarget;
    if (!previousLineage || canonicalJson(history.workspace) !== canonicalJson(previous)) {
      throw new PlanningUnavailableError();
    }
    let canonicalResult: PlanningMutationResult;
    try {
      canonicalResult = resultFromTransition(applyPlanningEvent({
        workspace: previous,
        event,
        blueprint: history.sourceContext.blueprint,
        registry: history.sourceContext.registry,
      }));
    } catch {
      throw new PlanningUnavailableError();
    }
    if (canonicalJson(canonicalResult) !== canonicalJson(result)) throw new PlanningUnavailableError();
    statements.push(this.idempotencyStatement(command, result, now, previousLineage));
    try {
      await this.db.batch(statements);
    } catch (error) {
      const winner = await this.findMutation(command);
      if (winner) return winner;
      throw error instanceof PlanningConflictError || isConflictError(error)
        ? new PlanningConflictError()
        : new PlanningUnavailableError();
    }
    return { ownerId: command.ownerId, goalId: command.goalId, payload: result, sourceReference };
  }

  private idempotencyStatement(
    command: SavePlanningGenerationCommand,
    result: PlanningMutationResult,
    now: number,
    previousLineageFingerprint?: string,
  ): D1PreparedStatement {
    const workspace = result.workspace;
    const event = workspace.events.at(-1);
    const stored = previousLineageFingerprint === undefined
      ? serializeGeneration(command, result)
      : serializeEvent(command, result, previousLineageFingerprint, event);
    return this.db.prepare(`INSERT INTO idempotency_records
      (id,user_id,scope,mutation_id,response_json,created_at)
      VALUES (?1,?2,?3,?4,
        CASE WHEN EXISTS (SELECT 1 FROM career_goals
          WHERE user_id = ?7 AND id = ?8 AND active_slot = 1) AND
        EXISTS (SELECT 1 FROM planning_workspaces
          WHERE user_id = ?7 AND goal_id = ?8 AND id = ?9
            AND revision = ?10 AND next_sequence = ?11
            AND current_audit_version_id = ?12 AND current_availability_version_id = ?13
            AND active_path_version_id = ?14 AND active_plan_version_id = ?15
            AND pending_plan_version_id IS ?16)
        THEN ?5 ELSE NULL END,
        ?6)`)
      .bind(this.options.createId(), command.ownerId, scopeFor(command.goalId), command.mutationId,
        stored, now, command.ownerId, command.goalId, workspace.id,
        workspace.revision, workspace.lastSequence + 1, workspace.audit.id, workspace.availability.id,
        workspace.activePathVersionId, workspace.activePlanVersionId, workspace.pendingPlanVersionId);
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

  private async replayHistory(
    scope: PlanningOwnerGoal,
    targetSequence: number,
    knownGeneration?: StoredGeneration,
  ): Promise<{
    workspace: PlanningWorkspace;
    resultAtTarget: PlanningMutationResult;
    lineageAtTarget: string;
    sourceReference: PlanningSourceReference;
    sourceContext: PlanningSourceContext;
  }> {
    const generation = knownGeneration ?? await this.loadGeneration(scope);
    const sourceReference = storedReference(generation);
    const sourceContext = await this.resolveReplaySource(scope.ownerId, sourceReference, generation.result.workspace);
    const [eventRows, mutationRows] = await Promise.all([
      this.db.prepare(`SELECT payload_json FROM planning_events
      WHERE user_id = ?1 AND goal_id = ?2 AND sequence <= ?3
      ORDER BY sequence ASC`).bind(scope.ownerId, scope.goalId, targetSequence).all<PayloadRow>(),
      this.db.prepare(`SELECT mutation_id, response_json FROM idempotency_records
        WHERE user_id = ?1 AND scope = ?2
          AND json_extract(response_json, '$.kind') = 'event'
          AND json_extract(response_json, '$.sequence') <= ?3
        ORDER BY json_extract(response_json, '$.sequence') ASC`)
        .bind(scope.ownerId, scopeFor(scope.goalId), targetSequence).all<EventIdempotencyRow>(),
    ]);
    const events = eventRows.results.map(({ payload_json }) => parsePlanningEvent(payload_json));
    const mutationEntries = mutationRows.results.map(({ mutation_id, response_json }) => ({
      mutationId: mutation_id,
      stored: parseStoredEvent(response_json),
    }));
    if (events.length !== targetSequence || mutationEntries.length !== targetSequence) {
      throw new PlanningUnavailableError();
    }
    let lineage = fingerprint(generation.result);
    let resultAtTarget = generation.result;
    let workspace: PlanningWorkspace;
    try {
      workspace = replayPlanningEvents({
        initial: generation.result.workspace,
        events,
        blueprint: sourceContext.blueprint,
        registry: sourceContext.registry,
      }, (transition) => {
        const result = resultFromTransition(transition);
        lineage = mutationLineageFingerprint(lineage, transition.event, result.outcome);
        if (transition.event.sequence === targetSequence) resultAtTarget = result;
        const entry = mutationEntries[transition.event.sequence - 1];
        if (!entry || entry.mutationId !== transition.event.mutationId
          || entry.stored.ownerId !== scope.ownerId || entry.stored.goalId !== scope.goalId
          || entry.stored.sequence !== transition.event.sequence
          || entry.stored.outcome !== result.outcome
          || entry.stored.lineageFingerprint !== lineage) {
          throw new PlanningUnavailableError();
        }
      });
    } catch {
      throw new PlanningUnavailableError();
    }
    return {
      workspace: parsePlanningWorkspaceAtRepositoryBoundary(workspace),
      resultAtTarget,
      lineageAtTarget: lineage,
      sourceReference,
      sourceContext,
    };
  }

  private async resolveReplaySource(
    ownerId: string,
    reference: PlanningSourceReference,
    workspace: PlanningWorkspace,
  ): Promise<PlanningSourceContext> {
    try {
      const context = await this.options.sourceResolver.resolveForReplay(ownerId, reference);
      assertWorkspaceSource(workspace, context);
      return context;
    } catch {
      throw new PlanningUnavailableError();
    }
  }

  private async resolveGenerationSource(
    ownerId: string,
    reference: PlanningSourceReference,
    workspace: PlanningWorkspace,
  ): Promise<PlanningSourceContext> {
    try {
      const context = await this.options.sourceResolver.resolveForGenerationCommit(ownerId, reference);
      assertWorkspaceSource(workspace, context);
      return context;
    } catch {
      throw new PlanningUnavailableError();
    }
  }

  private async loadGeneration(scope: PlanningOwnerGoal): Promise<StoredGeneration> {
    const row = await this.db.prepare(`SELECT response_json FROM idempotency_records
      WHERE user_id = ?1 AND scope = ?2
        AND json_extract(response_json, '$.kind') = 'generation'
      ORDER BY created_at ASC LIMIT 1`).bind(scope.ownerId, scopeFor(scope.goalId)).first<IdempotencyRow>();
    if (!row) throw new PlanningUnavailableError();
    const generation = parseStoredGeneration(row.response_json);
    if (generation.ownerId !== scope.ownerId || generation.goalId !== scope.goalId) throw new PlanningNotFoundError();
    return generation;
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
      workspace.audit.inputFingerprint, serializeD1Value(workspace.audit), now),
    ...workspace.availabilityVersions.map((availability) => db.prepare(`INSERT INTO availability_versions
      (id,user_id,goal_id,schema_version,input_fingerprint,weekly_minutes,payload_json,created_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`).bind(availability.id, ownerId, goalId,
      availability.schemaVersion, availability.inputFingerprint, availability.weeklyMinutes,
      serializeD1Value(availability), now)),
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
      serializeD1Value(availability), now)));
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
    "unitId" in event ? event.unitId : null, event.kind, serializeD1Value(event), Date.parse(event.occurredAt), now));
  return statements;
}

function insertPath(db: D1Database, ownerId: string, goalId: string, path: LearningPathVersion, now: number) {
  return db.prepare(`INSERT INTO learning_path_versions
    (id,user_id,goal_id,schema_version,blueprint_id,blueprint_version,registry_id,registry_version,
     audit_version_id,availability_version_id,scope_mode,input_fingerprint,payload_json,created_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)`).bind(
    path.id, ownerId, goalId, path.schemaVersion, path.blueprintId, path.blueprintVersion,
    path.registryId, path.registryVersion, path.auditVersionId, path.availabilityVersionId,
    path.scopeMode, path.inputFingerprint, serializeD1Value(path), now);
}

function insertPlan(db: D1Database, ownerId: string, goalId: string, plan: PlanVersion, now: number) {
  return db.prepare(`INSERT INTO plan_versions
    (id,user_id,goal_id,schema_version,path_version_id,generation,base_version_id,replan_reason,
     planning_date,input_fingerprint,payload_json,created_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`).bind(
    plan.id, ownerId, goalId, plan.schemaVersion, plan.pathVersionId, plan.generation,
    plan.baseVersionId, plan.replanReason, plan.planningDate, plan.inputFingerprint,
    serializeD1Value(plan), now);
}

function insertUnit(db: D1Database, ownerId: string, goalId: string, unit: DailyUnit, now: number) {
  return db.prepare(`INSERT INTO daily_units
    (id,user_id,goal_id,plan_version_id,unit_id,scheduled_date,slot,required,payload_json,created_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`).bind(
    `${unit.planVersionId}:${unit.id}`, ownerId, goalId, unit.planVersionId, unit.id,
    unit.scheduledDate, unit.slot, unit.required ? 1 : 0, serializeD1Value(unit), now);
}

function parseStoredMutation(value: string): StoredMutation {
  if (serializedBytes(value) > D1_PLANNING_VALUE_MAX_BYTES) throw new PlanningUnavailableError();
  let parsed: unknown;
  try { parsed = JSON.parse(value) as unknown; }
  catch { throw new PlanningUnavailableError(); }
  if (parsed && typeof parsed === "object" && "schemaVersion" in parsed
    && parsed.schemaVersion !== PLANNING_SCHEMA_VERSION) {
    throw new PlanningUnavailableError([], "version-mismatch");
  }
  const kind = parsed && typeof parsed === "object" && "kind" in parsed ? parsed.kind : null;
  if (kind === "generation") {
    try {
      const stored = storedGenerationSchema.parse(parsed);
      return { ...stored, result: parseMutationResult(stored.result) };
    } catch (error) {
      if (error instanceof PlanningUnavailableError) throw error;
      throw new PlanningUnavailableError();
    }
  }
  try { return storedEventSchema.parse(parsed); }
  catch (error) {
    if (error instanceof PlanningUnavailableError) throw error;
    throw new PlanningUnavailableError();
  }
}

function parseStoredGeneration(value: string): StoredGeneration {
  const stored = parseStoredMutation(value);
  if (stored.kind !== "generation") throw new PlanningUnavailableError();
  if (stored.result.outcome !== "active" || stored.result.diff !== null
    || stored.result.workspace.revision !== 0 || stored.result.workspace.lastSequence !== 0
    || stored.result.workspace.events.length !== 0) {
    throw new PlanningUnavailableError();
  }
  return stored;
}

function parseStoredEvent(value: string): StoredEvent {
  const stored = parseStoredMutation(value);
  if (stored.kind !== "event") throw new PlanningUnavailableError();
  return stored;
}

function serializeGeneration(command: SavePlanningGenerationCommand, result: PlanningMutationResult): string {
  const stored = storedGenerationSchema.parse({
    schemaVersion: PLANNING_SCHEMA_VERSION,
    ownerId: command.ownerId,
    goalId: command.goalId,
    kind: "generation",
    sourceReference: command.sourceReference,
    result,
  });
  const serialized = JSON.stringify(stored);
  if (serializedBytes(serialized) > D1_PLANNING_VALUE_MAX_BYTES) throw new PlanningUnavailableError();
  return serialized;
}

function storedReference(generation: StoredGeneration): PlanningSourceReference {
  if (generation.sourceReference) return generation.sourceReference;
  const workspace = generation.result.workspace;
  if (workspace.audit.blueprintId !== flagshipBlueprint.id
    || workspace.audit.blueprintVersion !== flagshipBlueprint.version
    || workspace.pathVersions.some((path) => path.blueprintId !== flagshipBlueprint.id
      || path.blueprintVersion !== flagshipBlueprint.version
      || path.registryId !== flagshipUnitRegistry.id
      || path.registryVersion !== flagshipUnitRegistry.version)) throw new PlanningUnavailableError();
  return { source: "flagship", roleId: "ai-native-full-stack-engineer" };
}

function parseSourceReference(value: unknown): PlanningSourceReference {
  try { return planningSourceReferenceSchema.parse(structuredClone(value)); }
  catch { throw new PlanningUnavailableError(); }
}

function assertWorkspaceSource(workspace: PlanningWorkspace, context: PlanningSourceContext): void {
  if (workspace.audit.blueprintId !== context.blueprint.id
    || workspace.audit.blueprintVersion !== context.blueprint.version
    || workspace.pathVersions.some((path) => path.blueprintId !== context.blueprint.id
      || path.blueprintVersion !== context.blueprint.version
      || path.registryId !== context.registry.id
      || path.registryVersion !== context.registry.version)) throw new PlanningUnavailableError();
}

function serializeEvent(
  command: SavePlanningGenerationCommand,
  result: PlanningMutationResult,
  previousLineageFingerprint: string,
  event: PlanningEvent | undefined,
): string {
  if (!event || event.mutationId !== command.mutationId) throw new PlanningUnavailableError();
  return serializeD1Value(storedEventSchema.parse({
    schemaVersion: PLANNING_SCHEMA_VERSION,
    ownerId: command.ownerId,
    goalId: command.goalId,
    kind: "event",
    sequence: event.sequence,
    outcome: result.outcome,
    lineageFingerprint: mutationLineageFingerprint(previousLineageFingerprint, event, result.outcome),
  }));
}

function mutationLineageFingerprint(
  previousLineageFingerprint: string,
  event: PlanningEvent,
  outcome: PlanningMutationResult["outcome"],
): string {
  return fingerprint({
    kind: CLOUD_LINEAGE_KIND,
    version: CLOUD_LINEAGE_VERSION,
    previousLineageFingerprint,
    event,
    outcome,
  });
}

function resultFromTransition(transition: PlanningTransition): PlanningMutationResult {
  return parseMutationResult({
    outcome: transition.kind === "automatic" ? "active" : transition.kind,
    workspace: transition.workspace,
    diff: transition.kind === "proposed" ? transition.diff : null,
  });
}

function parseMutationResult(value: unknown): PlanningMutationResult {
  try {
    const raw = safeSerializeBounded(value, MAX_PLANNING_WORKSPACE_BYTES);
    const parsed = planningMutationResultSchema.parse(JSON.parse(raw) as unknown);
    const workspace = parsePlanningWorkspaceAtRepositoryBoundary(parsed.workspace);
    const cloned = planningMutationResultSchema.parse({ ...parsed, workspace });
    return cloned;
  } catch (error) {
    if (error instanceof PlanningUnavailableError) throw error;
    throw new PlanningUnavailableError();
  }
}

function parsePlanningEvent(value: string): PlanningEvent {
  if (serializedBytes(value) > 32 * 1024) throw new PlanningUnavailableError();
  try { return planningEventSchema.parse(JSON.parse(value) as unknown); }
  catch (error) {
    if (error instanceof PlanningUnavailableError) throw error;
    throw new PlanningUnavailableError();
  }
}

function serializedBytes(value: unknown): number {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return new TextEncoder().encode(serialized).byteLength;
}

type PayloadRow = { payload_json: string };

function parsePayload(value: string): unknown {
  if (serializedBytes(value) > D1_PLANNING_VALUE_MAX_BYTES) throw new PlanningUnavailableError();
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && "schemaVersion" in parsed
      && parsed.schemaVersion !== PLANNING_SCHEMA_VERSION) {
      throw new PlanningUnavailableError([], "version-mismatch");
    }
    return parsed;
  }
  catch (error) {
    if (error instanceof PlanningUnavailableError) throw error;
    throw new PlanningUnavailableError();
  }
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

function scopeFor(goalId: string): string {
  return `${IDEMPOTENCY_SCOPE_PREFIX}${goalId}`;
}

function parseWorkspace(value: unknown): PlanningWorkspace {
  try {
    const raw = safeSerializeBounded(value, MAX_PLANNING_WORKSPACE_BYTES);
    return parsePlanningWorkspaceAtRepositoryBoundary(raw);
  }
  catch { throw new PlanningUnavailableError(); }
}

function isConflictError(error: unknown): boolean {
  return error instanceof Error && /unique|constraint|revision|sequence/iu.test(error.message);
}

function serializeD1Value(value: unknown): string {
  return safeSerializeBounded(value, D1_PLANNING_VALUE_MAX_BYTES);
}

function safeSerializeBounded(value: unknown, limit: number): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new PlanningUnavailableError();
  }
  if (typeof serialized !== "string" || serializedBytes(serialized) > limit) {
    throw new PlanningUnavailableError();
  }
  return serialized;
}
