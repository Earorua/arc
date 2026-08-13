import { z } from "zod";
import { roleBlueprintSchema } from "../../contracts/intelligence";
import {
  generatePlanningRequestSchema,
  planningEventRequestSchema,
  replanDecisionRequestSchema,
} from "../../contracts/planning-api";
import {
  planningEventSchema,
  planningMutationResultSchema,
  planningWorkspaceSchema,
  unitRegistrySchema,
  type PlanningEvent,
  type PlanningMutationResult,
  type PlanningWorkspace,
} from "../../contracts/planning";
import { applyPlanningEvent, PlanningEventError, type PlanningTransition } from "../../lib/planning/event-reducer";
import { validateRoleBlueprint } from "../../lib/intelligence-validation";
import { buildLearningPaths, PlanningInputError } from "../../lib/planning/path-builder";
import { validateUnitRegistry } from "../../lib/planning/registry-validation";
import { buildPlanVersion, PlanningScheduleError } from "../../lib/planning/scheduler";
import type { IntelligenceService } from "../intelligence/service";
import type {
  PlanningOwnerGoal,
  PlanningRepository,
  PlanningRepositoryPayload,
} from "./repository";

const FLAGSHIP_SLUG = "ai-native-full-stack-engineer";
const authenticatedOwnerSchema = z.string().trim().min(1).max(256);

export type PlanningServiceErrorCode = "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "PLANNING_UNAVAILABLE";

export class PlanningServiceError extends Error {
  constructor(
    readonly code: PlanningServiceErrorCode,
    readonly issues: readonly string[] = [],
  ) {
    super(messageFor(code));
    this.name = "PlanningServiceError";
  }
}

export class PlanningConflictError extends PlanningServiceError {
  constructor() { super("CONFLICT"); this.name = "PlanningConflictError"; }
}

export class PlanningUnavailableError extends PlanningServiceError {
  constructor(
    issues: readonly string[] = [],
    readonly reason: "unavailable" | "version-mismatch" = "unavailable",
  ) {
    super("PLANNING_UNAVAILABLE", [...new Set(issues)].sort());
    this.name = "PlanningUnavailableError";
  }
}

export class PlanningNotFoundError extends PlanningServiceError {
  constructor() { super("NOT_FOUND"); this.name = "PlanningNotFoundError"; }
}

export class PlanningInvalidInputError extends PlanningServiceError {
  constructor(issues: readonly string[] = []) { super("INVALID_INPUT", [...new Set(issues)].sort()); this.name = "PlanningInvalidInputError"; }
}

type ServiceOptions = {
  repository: PlanningRepository;
  intelligence: Pick<IntelligenceService, "getPublished">;
  registry: unknown;
  createId?: () => string;
  now?: () => Date;
};

export class PlanningService {
  private readonly createId: () => string;
  private readonly now: () => Date;

  constructor(private readonly dependencies: ServiceOptions) {
    this.createId = dependencies.createId ?? (() => `planning-${crypto.randomUUID()}`);
    this.now = dependencies.now ?? (() => new Date());
  }

  async getWorkspace(userId: string): Promise<PlanningWorkspace | null> {
    const scope = await this.resolveScope(userId);
    const stored = await repositoryRead(() => this.dependencies.repository.load(scope));
    if (!stored) return null;
    return this.parseOwnedWorkspace(stored, scope);
  }

  async generate(userId: string, input: unknown): Promise<PlanningMutationResult> {
    const ownerId = parseOwner(userId);
    const request = parseContract(generatePlanningRequestSchema, input);
    const scope = await this.resolveScope(ownerId);
    const replay = await this.loadReplay(scope, request.mutationId);
    if (replay) return replay;
    const existing = await repositoryRead(() => this.dependencies.repository.load(scope));
    if (existing) throw new PlanningConflictError();

    try {
      if (request.roleId !== FLAGSHIP_SLUG) throw new PlanningInvalidInputError(["role"]);
      const registry = unitRegistrySchema.parse(cloneUnknown(this.dependencies.registry));
      const rawBlueprint = await this.dependencies.intelligence.getPublished(FLAGSHIP_SLUG);
      if (!rawBlueprint) throw new PlanningUnavailableError();
      const blueprint = roleBlueprintSchema.parse(cloneUnknown(rawBlueprint));
      if (blueprint.id !== FLAGSHIP_SLUG) throw new PlanningUnavailableError();
      validatePlanningSources(blueprint, registry);
      const alternatives = buildLearningPaths({
        blueprint,
        registry,
        audit: request.audit,
        availability: request.availability,
        target: request.target,
        planningDate: request.planningDate,
      });
      const path = request.selectedScope === "target-date" ? alternatives.targetDate : alternatives.fullScope;
      if (!path) throw new PlanningInvalidInputError(["selected-scope"]);
      const built = buildPlanVersion({
        path,
        registry,
        availability: request.availability,
        planningDate: request.planningDate,
        generation: "initial",
        baseVersionId: null,
        replanReason: null,
        completedUnitIds: new Set(),
      });
      const result = planningMutationResultSchema.parse({
        outcome: "active",
        workspace: {
          id: this.createId(),
          goalId: scope.goalId,
          revision: 0,
          lastSequence: 0,
          audit: request.audit,
          availability: request.availability,
          availabilityVersions: [request.availability],
          target: request.target,
          pathVersions: [path],
          planVersions: [built.plan],
          dailyUnits: built.dailyUnits,
          events: [],
          activePathVersionId: path.id,
          activePlanVersionId: built.plan.id,
          pendingPlanVersionId: null,
        },
        diff: null,
      });
      const saved = await this.dependencies.repository.saveGeneration({ ...scope, mutationId: request.mutationId, result });
      return this.parseOwnedResult(saved, scope);
    } catch (error) {
      throw normalizeError(error);
    }
  }

  async appendEvent(userId: string, input: unknown): Promise<PlanningMutationResult> {
    parseOwner(userId);
    const request = parseContract(planningEventRequestSchema, input);
    return this.mutate(userId, request.mutationId, request.baseVersionId, request.event);
  }

  async acceptReplan(userId: string, input: unknown): Promise<PlanningMutationResult> {
    parseOwner(userId);
    const request = parseContract(replanDecisionRequestSchema, input);
    return this.mutate(userId, request.mutationId, request.baseVersionId, {
      kind: "replan_accepted",
      candidatePlanVersionId: request.candidatePlanVersionId,
    });
  }

  async discardReplan(userId: string, input: unknown): Promise<PlanningMutationResult> {
    parseOwner(userId);
    const request = parseContract(replanDecisionRequestSchema, input);
    return this.mutate(userId, request.mutationId, request.baseVersionId, {
      kind: "replan_discarded",
      candidatePlanVersionId: request.candidatePlanVersionId,
    });
  }

  private async mutate(
    userId: string,
    mutationId: string,
    baseVersionId: string,
    body: Record<string, unknown>,
  ): Promise<PlanningMutationResult> {
    const ownerId = parseOwner(userId);
    const scope = await this.resolveScope(ownerId);
    const replay = await this.loadReplay(scope, mutationId);
    if (replay) return replay;
    const stored = await repositoryRead(() => this.dependencies.repository.load(scope));
    if (!stored) throw new PlanningUnavailableError();
    const workspace = this.parseOwnedWorkspace(stored, scope);
    if (workspace.activePlanVersionId !== baseVersionId) throw new PlanningConflictError();
    try {
      const registry = unitRegistrySchema.parse(cloneUnknown(this.dependencies.registry));
      const rawBlueprint = await this.dependencies.intelligence.getPublished(FLAGSHIP_SLUG);
      if (!rawBlueprint) throw new PlanningUnavailableError();
      const blueprint = roleBlueprintSchema.parse(cloneUnknown(rawBlueprint));
      if (blueprint.id !== FLAGSHIP_SLUG) throw new PlanningUnavailableError();
      validatePlanningSources(blueprint, registry);
      const event = planningEventSchema.parse({
        ...body,
        eventId: this.createId(),
        mutationId,
        sequence: workspace.lastSequence + 1,
        targetPlanVersionId: baseVersionId,
        occurredAt: this.now().toISOString(),
      }) as PlanningEvent;
      const transition = applyPlanningEvent({ workspace, event, blueprint, registry });
      const result = resultFromTransition(transition);
      const saved = await this.dependencies.repository.saveEvent({
        ...scope,
        mutationId,
        baseRevision: workspace.revision,
        baseVersionId,
        previous: workspace,
        result,
      });
      return this.parseOwnedResult(saved, scope);
    } catch (error) {
      throw normalizeError(error);
    }
  }

  private async resolveScope(userId: string): Promise<PlanningOwnerGoal> {
    const ownerId = parseOwner(userId);
    let scope: PlanningOwnerGoal | null;
    try {
      scope = await this.dependencies.repository.findActiveGoal(ownerId);
    } catch {
      throw new PlanningUnavailableError();
    }
    if (!scope) throw new PlanningNotFoundError();
    if (scope.ownerId !== ownerId || !scope.goalId) throw new PlanningNotFoundError();
    return { ownerId, goalId: scope.goalId };
  }

  private async loadReplay(scope: PlanningOwnerGoal, mutationId: string): Promise<PlanningMutationResult | null> {
    const stored = await repositoryRead(() => this.dependencies.repository.findMutation({ ...scope, mutationId }));
    return stored ? this.parseOwnedResult(stored, scope) : null;
  }

  private parseOwnedWorkspace(stored: PlanningRepositoryPayload, scope: PlanningOwnerGoal): PlanningWorkspace {
    assertOwned(stored, scope);
    try {
      const workspace = planningWorkspaceSchema.parse(cloneUnknown(stored.payload));
      if (workspace.goalId !== scope.goalId) throw new PlanningNotFoundError();
      return workspace;
    }
    catch (error) {
      if (error instanceof PlanningNotFoundError) throw error;
      throw new PlanningUnavailableError();
    }
  }

  private parseOwnedResult(stored: PlanningRepositoryPayload, scope: PlanningOwnerGoal): PlanningMutationResult {
    assertOwned(stored, scope);
    try {
      const result = planningMutationResultSchema.parse(cloneUnknown(stored.payload));
      if (result.workspace.goalId !== scope.goalId) throw new PlanningNotFoundError();
      return result;
    } catch (error) {
      if (error instanceof PlanningServiceError) throw error;
      throw new PlanningUnavailableError();
    }
  }
}

function parseOwner(userId: string): string {
  const parsed = authenticatedOwnerSchema.safeParse(userId);
  if (!parsed.success) throw new PlanningUnavailableError();
  return parsed.data;
}

function validatePlanningSources(
  blueprint: z.infer<typeof roleBlueprintSchema>,
  registry: z.infer<typeof unitRegistrySchema>,
): void {
  const issues = [
    ...validateRoleBlueprint(blueprint).issues.map(({ code, path }) => `blueprint:${code}:${path}`),
    ...validateUnitRegistry(registry, blueprint).issues.map(({ code, path }) => `registry:${code}:${path}`),
  ].sort();
  if (issues.length > 0) throw new PlanningUnavailableError(issues);
}

function parseContract<T>(schema: z.ZodType<T>, value: unknown): T {
  try { return schema.parse(cloneUnknown(value)); }
  catch { throw new PlanningInvalidInputError(["contract"]); }
}

function assertOwned(stored: PlanningOwnerGoal, expected: PlanningOwnerGoal): void {
  if (stored.ownerId !== expected.ownerId || stored.goalId !== expected.goalId) throw new PlanningNotFoundError();
}

function cloneUnknown(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function resultFromTransition(transition: PlanningTransition): PlanningMutationResult {
  return planningMutationResultSchema.parse({
    outcome: transition.kind === "automatic" ? "active" : transition.kind,
    workspace: transition.workspace,
    diff: transition.kind === "proposed" ? transition.diff : null,
  });
}

function normalizeError(error: unknown): PlanningServiceError {
  if (error instanceof PlanningServiceError) return error;
  if (error instanceof PlanningEventError && error.code === "BASE_REVISION_MISMATCH") return new PlanningConflictError();
  if (error instanceof PlanningInputError) return new PlanningInvalidInputError(error.issues.map(({ code }) => code));
  if (error instanceof PlanningEventError || error instanceof PlanningScheduleError || error instanceof z.ZodError) {
    return new PlanningInvalidInputError();
  }
  return new PlanningUnavailableError();
}

function messageFor(code: PlanningServiceErrorCode): string {
  if (code === "CONFLICT") return "Planning state changed. Refresh and try again.";
  if (code === "NOT_FOUND") return "Planning workspace was not found.";
  if (code === "INVALID_INPUT") return "Planning input is invalid.";
  return "Planning is unavailable. The previous valid state is unchanged.";
}

async function repositoryRead<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (error) {
    if (error instanceof PlanningServiceError) throw error;
    throw new PlanningUnavailableError();
  }
}
