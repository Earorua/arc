import { z } from "zod";
import {
  generatePlanningRequestSchema,
  planningEventRequestSchema,
  replanDecisionRequestSchema,
  type PlanningMutationResponse,
  type PlanningWorkspaceResponse,
} from "../../contracts/planning-api";
import {
  planningEventSchema,
  planningMutationResultSchema,
  planningSourceContextSchema,
  planningWorkspaceSchema,
  type PlanningEvent,
  type PlanningMutationResult,
  type PlanningWorkspace,
  type PlanningSourceContext,
  type PlanningSourceReference,
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
import { PlanningSourceContractError, PlanningSourceResolver, PlanningSourceUnavailableError } from "./source-resolver";

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
    readonly reason: "unavailable" | "version-mismatch" | "response-too-large" = "unavailable",
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
  intelligence?: Pick<IntelligenceService, "getPublished">;
  registry?: unknown;
  sourceResolver?: PlanningSourceResolver;
  createId?: () => string;
  now?: () => Date;
};

export class PlanningService {
  private readonly createId: () => string;
  private readonly now: () => Date;
  private readonly sourceResolver: PlanningSourceResolver;

  constructor(private readonly dependencies: ServiceOptions) {
    this.createId = dependencies.createId ?? (() => `planning-${crypto.randomUUID()}`);
    this.now = dependencies.now ?? (() => new Date());
    if (dependencies.sourceResolver) this.sourceResolver = dependencies.sourceResolver;
    else if (dependencies.intelligence && dependencies.registry) {
      this.sourceResolver = new PlanningSourceResolver({
        intelligence: dependencies.intelligence,
        flagshipRegistry: dependencies.registry,
      });
    } else throw new PlanningUnavailableError();
  }

  async getWorkspace(userId: string): Promise<PlanningWorkspace | null> {
    return (await this.getWorkspaceResponse(userId)).workspace;
  }

  async getWorkspaceResponse(userId: string): Promise<PlanningWorkspaceResponse> {
    const scope = await this.resolveScope(userId);
    const stored = await repositoryRead(() => this.dependencies.repository.load(scope));
    if (!stored) return { workspace: null, sourceContext: null };
    return this.parseOwnedWorkspace(stored, scope);
  }

  async generate(userId: string, input: unknown): Promise<PlanningMutationResult> {
    return (await this.generateResponse(userId, input)).result;
  }

  async generateResponse(userId: string, input: unknown): Promise<PlanningMutationResponse> {
    const ownerId = parseOwner(userId);
    const request = parseContract(generatePlanningRequestSchema, input);
    const scope = await this.resolveScope(ownerId);
    const replay = await this.loadReplay(scope, request.mutationId);
    if (replay) return replay;
    const existing = await repositoryRead(() => this.dependencies.repository.load(scope));
    if (existing) throw new PlanningConflictError();

    try {
      const requestedSource = "source" in request
        ? request.source
        : { source: "flagship" as const, roleId: request.roleId };
      const sourceContext = await this.sourceResolver.resolveForGenerate(ownerId, requestedSource);
      const { blueprint, registry, reference: sourceReference } = sourceContext;
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
      const saved = await this.dependencies.repository.saveGeneration({
        ...scope, mutationId: request.mutationId, result, sourceReference,
      });
      return this.parseOwnedResult(saved, scope, sourceReference);
    } catch (error) {
      throw normalizeError(error);
    }
  }

  async appendEvent(userId: string, input: unknown): Promise<PlanningMutationResult> {
    return (await this.appendEventResponse(userId, input)).result;
  }

  async appendEventResponse(userId: string, input: unknown): Promise<PlanningMutationResponse> {
    parseOwner(userId);
    const request = parseContract(planningEventRequestSchema, input);
    return this.mutate(userId, request.mutationId, request.baseVersionId, request.event);
  }

  async acceptReplan(userId: string, input: unknown): Promise<PlanningMutationResult> {
    return (await this.acceptReplanResponse(userId, input)).result;
  }

  async acceptReplanResponse(userId: string, input: unknown): Promise<PlanningMutationResponse> {
    parseOwner(userId);
    const request = parseContract(replanDecisionRequestSchema, input);
    return this.mutate(userId, request.mutationId, request.baseVersionId, {
      kind: "replan_accepted",
      candidatePlanVersionId: request.candidatePlanVersionId,
    });
  }

  async discardReplan(userId: string, input: unknown): Promise<PlanningMutationResult> {
    return (await this.discardReplanResponse(userId, input)).result;
  }

  async discardReplanResponse(userId: string, input: unknown): Promise<PlanningMutationResponse> {
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
  ): Promise<PlanningMutationResponse> {
    const ownerId = parseOwner(userId);
    const scope = await this.resolveScope(ownerId);
    const replay = await this.loadReplay(scope, mutationId);
    if (replay) return replay;
    const stored = await repositoryRead(() => this.dependencies.repository.load(scope));
    if (!stored) throw new PlanningUnavailableError();
    const parsedStored = await this.parseOwnedWorkspace(stored, scope);
    const { workspace, sourceContext } = parsedStored;
    if (workspace.activePlanVersionId !== baseVersionId) throw new PlanningConflictError();
    try {
      const { blueprint, registry, reference: sourceReference } = sourceContext;
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
        sourceReference,
      });
      return this.parseOwnedResult(saved, scope, sourceReference);
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

  private async loadReplay(scope: PlanningOwnerGoal, mutationId: string): Promise<PlanningMutationResponse | null> {
    const stored = await repositoryRead(() => this.dependencies.repository.findMutation({ ...scope, mutationId }));
    return stored ? this.parseOwnedResult(stored, scope) : null;
  }

  private async parseOwnedWorkspace(stored: PlanningRepositoryPayload, scope: PlanningOwnerGoal): Promise<{
    workspace: PlanningWorkspace;
    sourceContext: PlanningSourceContext;
  }> {
    assertOwned(stored, scope);
    try {
      const workspace = planningWorkspaceSchema.parse(cloneUnknown(stored.payload));
      if (workspace.goalId !== scope.goalId) throw new PlanningNotFoundError();
      const sourceReference = resolveStoredReference(stored.sourceReference, workspace);
      const sourceContext = await this.resolveStoredContext(stored, scope.ownerId, sourceReference);
      assertWorkspaceSource(workspace, sourceContext);
      return { workspace, sourceContext };
    }
    catch (error) {
      if (error instanceof PlanningNotFoundError) throw error;
      throw new PlanningUnavailableError();
    }
  }

  private async parseOwnedResult(
    stored: PlanningRepositoryPayload,
    scope: PlanningOwnerGoal,
    expectedReference?: PlanningSourceReference,
  ): Promise<{ result: PlanningMutationResult; sourceContext: PlanningSourceContext }> {
    assertOwned(stored, scope);
    try {
      const result = planningMutationResultSchema.parse(cloneUnknown(stored.payload));
      if (result.workspace.goalId !== scope.goalId) throw new PlanningNotFoundError();
      const sourceReference = resolveStoredReference(stored.sourceReference ?? expectedReference, result.workspace);
      if (expectedReference && JSON.stringify(sourceReference) !== JSON.stringify(expectedReference)) {
        throw new PlanningUnavailableError();
      }
      const sourceContext = await this.resolveStoredContext(stored, scope.ownerId, sourceReference);
      assertWorkspaceSource(result.workspace, sourceContext);
      return { result, sourceContext };
    } catch (error) {
      if (error instanceof PlanningServiceError) throw error;
      throw new PlanningUnavailableError();
    }
  }

  private async resolveStoredContext(
    stored: PlanningRepositoryPayload,
    ownerId: string,
    sourceReference: PlanningSourceReference,
  ): Promise<PlanningSourceContext> {
    const context = stored.sourceContext === undefined
      ? await this.sourceResolver.resolveForReplay(ownerId, sourceReference)
      : planningSourceContextSchema.parse(cloneUnknown(stored.sourceContext));
    if (JSON.stringify(context.reference) !== JSON.stringify(sourceReference)) {
      throw new PlanningUnavailableError();
    }
    if (validateRoleBlueprint(context.blueprint).issues.length
      || validateUnitRegistry(context.registry, context.blueprint).issues.length) {
      throw new PlanningUnavailableError();
    }
    return context;
  }
}

function parseOwner(userId: string): string {
  const parsed = authenticatedOwnerSchema.safeParse(userId);
  if (!parsed.success) throw new PlanningUnavailableError();
  return parsed.data;
}

function resolveStoredReference(
  input: PlanningSourceReference | undefined,
  workspace: PlanningWorkspace,
): PlanningSourceReference {
  if (input) return input;
  const exactFlagship = workspace.audit.blueprintId === FLAGSHIP_SLUG
    && workspace.pathVersions.every((path) => path.blueprintId === FLAGSHIP_SLUG
      && path.blueprintVersion === workspace.audit.blueprintVersion
      && path.registryId === "ai-native-full-stack-engineer-units");
  if (!exactFlagship) throw new PlanningUnavailableError();
  return { source: "flagship", roleId: FLAGSHIP_SLUG };
}

function assertWorkspaceSource(workspace: PlanningWorkspace, context: PlanningSourceContext): void {
  const { blueprint, registry } = context;
  if (workspace.audit.blueprintId !== blueprint.id || workspace.audit.blueprintVersion !== blueprint.version
    || workspace.pathVersions.some((path) => path.blueprintId !== blueprint.id
      || path.blueprintVersion !== blueprint.version
      || path.registryId !== registry.id || path.registryVersion !== registry.version)) {
    throw new PlanningUnavailableError();
  }
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
  if (error instanceof PlanningSourceContractError) return new PlanningInvalidInputError();
  if (error instanceof PlanningSourceUnavailableError) return new PlanningUnavailableError();
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
