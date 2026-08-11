import { z } from "zod";
import {
  generatePlanningRequestSchema,
  planningEventRequestSchema,
  replanDecisionRequestSchema,
  type GeneratePlanningRequest,
  type PlanningEventRequest,
  type ReplanDecisionRequest,
} from "../../contracts/planning-api";
import {
  planningEventSchema,
  planningMutationResultSchema,
  planningWorkspaceSchema,
  PLANNING_SCHEMA_VERSION,
  type PlanningEvent,
  type PlanningMutationResult,
  type PlanningWorkspace,
} from "../../contracts/planning";
import { flagshipBlueprint } from "../../data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../data/flagship-unit-registry";
import {
  createDemoState,
  DEMO_STORAGE_KEY,
  loadDemoState,
  readDemoStateForMigration,
  type DemoState,
} from "../demo-store";
import { applyPlanningEvent, PlanningEventError } from "./event-reducer";
import { buildLearningPaths } from "./path-builder";
import { buildPlanVersion } from "./scheduler";

export const PLANNING_STORAGE_KEY = "arc-planning-state-v2";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const idSchema = z.string().max(256).regex(ID_PATTERN);
const fingerprintSchema = z.string().trim().min(1).max(256);
const resultJsonSchema = z.string().min(1);
const learnerLevelSchema = z.enum(["new", "beginner", "intermediate", "advanced"]);

const migrationMarkerSchema = z.object({
  source: z.literal(DEMO_STORAGE_KEY),
  sourceFingerprint: fingerprintSchema,
  roleId: z.string().trim().min(1).max(256),
  weeklyMinutes: z.number().int().min(30).max(2400),
  targetWeeks: z.number().int().min(4).max(52),
}).strict();

const setupDraftSchema = z.object({
  roleId: z.string().trim().min(1).max(256),
  legacyLevel: learnerLevelSchema,
  weeklyMinutes: z.number().int().min(30).max(2400),
  targetWeeks: z.number().int().min(4).max(52),
  auditAnswers: z.array(z.never()).length(0),
}).strict();

const mutationResultEntrySchema = z.object({
  mutationId: idSchema,
  resultJson: resultJsonSchema,
}).strict();

const localPlanningEnvelopeSchema = z.object({
  schemaVersion: z.literal(PLANNING_SCHEMA_VERSION),
  migration: migrationMarkerSchema.nullable(),
  setupDraft: setupDraftSchema.nullable(),
  workspace: planningWorkspaceSchema.nullable(),
  eventStream: z.array(planningEventSchema).max(5000),
  mutationResults: z.array(mutationResultEntrySchema).max(500),
  nextSequence: z.number().int().positive(),
}).strict().superRefine((envelope, ctx) => {
  if ((envelope.migration === null) !== (envelope.setupDraft === null)) {
    ctx.addIssue({ code: "custom", path: ["setupDraft"], message: "Migration marker and setup draft must coexist" });
  }
  const mutationIds = envelope.mutationResults.map(({ mutationId }) => mutationId);
  if (new Set(mutationIds).size !== mutationIds.length) {
    ctx.addIssue({ code: "custom", path: ["mutationResults"], message: "Mutation results must have unique IDs" });
  }
  envelope.mutationResults.forEach(({ resultJson }, index) => {
    try {
      planningMutationResultSchema.parse(JSON.parse(resultJson) as unknown);
    } catch {
      ctx.addIssue({ code: "custom", path: ["mutationResults", index, "resultJson"], message: "Cached result must strictly parse" });
    }
  });
  if (envelope.workspace === null) {
    if (envelope.eventStream.length !== 0) {
      ctx.addIssue({ code: "custom", path: ["eventStream"], message: "An empty envelope cannot contain events" });
    }
    if (envelope.nextSequence !== 1) {
      ctx.addIssue({ code: "custom", path: ["nextSequence"], message: "An empty envelope starts at sequence one" });
    }
    return;
  }
  if (JSON.stringify(envelope.eventStream) !== JSON.stringify(envelope.workspace.events)) {
    ctx.addIssue({ code: "custom", path: ["eventStream"], message: "Event stream must match the current workspace history" });
  }
  if (envelope.nextSequence !== envelope.workspace.lastSequence + 1) {
    ctx.addIssue({ code: "custom", path: ["nextSequence"], message: "Next sequence must follow the workspace history" });
  }
});

export type LocalPlanningEnvelope = z.infer<typeof localPlanningEnvelopeSchema>;

export type V7UpgradeResult =
  | { migrated: true; envelope: LocalPlanningEnvelope; fallback: DemoState }
  | { migrated: false; envelope: LocalPlanningEnvelope | null; fallback: DemoState };

export type LocalPlanningRepositoryErrorCode = "INVALID_INPUT" | "CONFLICT" | "PLANNING_UNAVAILABLE";

export class LocalPlanningRepositoryError extends Error {
  readonly code: LocalPlanningRepositoryErrorCode;

  constructor(code: LocalPlanningRepositoryErrorCode) {
    super(errorMessage(code));
    this.name = "LocalPlanningRepositoryError";
    this.code = code;
  }
}

export interface LocalPlanningRepository {
  load(): Promise<PlanningWorkspace | null>;
  generate(request: GeneratePlanningRequest): Promise<PlanningMutationResult>;
  appendEvent(request: PlanningEventRequest): Promise<PlanningMutationResult>;
  accept(request: ReplanDecisionRequest): Promise<PlanningMutationResult>;
  discard(request: ReplanDecisionRequest): Promise<PlanningMutationResult>;
}

export function upgradeV7State(storage?: Storage): V7UpgradeResult {
  const resolvedStorage = resolveStorage(storage);
  const fallback = cloneDemoState(resolvedStorage ? loadDemoState(resolvedStorage) : createDemoState());
  if (!resolvedStorage) return { migrated: false, envelope: null, fallback };

  const existing = readEnvelope(resolvedStorage);
  if (existing.kind === "valid") {
    return { migrated: false, envelope: cloneEnvelope(existing.envelope), fallback };
  }
  if (existing.kind === "invalid") {
    return { migrated: false, envelope: null, fallback };
  }

  const legacy = readDemoStateForMigration(resolvedStorage);
  if (!legacy.found) return { migrated: false, envelope: null, fallback };
  const envelope = createEmptyEnvelope(legacy.state, legacy.fingerprint);
  try {
    const persisted = persistEnvelope(resolvedStorage, envelope);
    return { migrated: true, envelope: persisted, fallback: cloneDemoState(legacy.state) };
  } catch {
    return { migrated: false, envelope: null, fallback: cloneDemoState(legacy.state) };
  }
}

export function createLocalPlanningRepository(options?: {
  storage?: Storage;
  createId?: () => string;
  now?: () => Date;
}): LocalPlanningRepository {
  const storage = resolveStorage(options?.storage);
  const createId = options?.createId ?? defaultIdFactory();
  const now = options?.now ?? (() => new Date());

  return {
    async load() {
      if (!storage) return null;
      const stored = readEnvelope(storage);
      if (stored.kind !== "valid" || stored.envelope.workspace === null) return null;
      return cloneWorkspace(stored.envelope.workspace);
    },

    async generate(request) {
      const parsed = parseRequest(generatePlanningRequestSchema, request);
      const envelope = envelopeForWrite(storage);
      const replay = replayMutation(envelope, parsed.mutationId);
      if (replay) return replay;
      if (envelope.workspace !== null) throw new LocalPlanningRepositoryError("CONFLICT");

      let result: PlanningMutationResult;
      try {
        const alternatives = buildLearningPaths({
          blueprint: flagshipBlueprint,
          registry: flagshipUnitRegistry,
          audit: parsed.audit,
          availability: parsed.availability,
          target: parsed.target,
          planningDate: parsed.planningDate,
        });
        const path = parsed.selectedScope === "target-date"
          ? alternatives.targetDate
          : alternatives.fullScope;
        if (!path) throw new LocalPlanningRepositoryError("INVALID_INPUT");
        const built = buildPlanVersion({
          path,
          registry: flagshipUnitRegistry,
          availability: parsed.availability,
          planningDate: parsed.planningDate,
          generation: "initial",
          baseVersionId: null,
          replanReason: null,
          completedUnitIds: new Set(),
        });
        const workspace = planningWorkspaceSchema.parse({
          id: createId(),
          goalId: createId(),
          revision: 0,
          lastSequence: 0,
          audit: parsed.audit,
          availability: parsed.availability,
          availabilityVersions: [parsed.availability],
          target: parsed.target,
          pathVersions: [path],
          planVersions: [built.plan],
          dailyUnits: built.dailyUnits,
          events: [],
          activePathVersionId: path.id,
          activePlanVersionId: built.plan.id,
          pendingPlanVersionId: null,
        });
        result = planningMutationResultSchema.parse({ outcome: "active", workspace, diff: null });
      } catch (error) {
        throw normalizePlanningError(error);
      }

      const persisted = writeMutation(storage, envelope, parsed.mutationId, result);
      return replayMutation(persisted, parsed.mutationId)!;
    },

    async appendEvent(request) {
      const parsed = parseRequest(planningEventRequestSchema, request);
      return mutateWithEvent(storage, createId, now, parsed, parsed.event);
    },

    async accept(request) {
      const parsed = parseRequest(replanDecisionRequestSchema, request);
      return mutateWithEvent(storage, createId, now, parsed, {
        kind: "replan_accepted",
        candidatePlanVersionId: parsed.candidatePlanVersionId,
      });
    },

    async discard(request) {
      const parsed = parseRequest(replanDecisionRequestSchema, request);
      return mutateWithEvent(storage, createId, now, parsed, {
        kind: "replan_discarded",
        candidatePlanVersionId: parsed.candidatePlanVersionId,
      });
    },
  };
}

type StoredEnvelopeRead =
  | { kind: "absent" }
  | { kind: "invalid" }
  | { kind: "valid"; envelope: LocalPlanningEnvelope };

type MutationRequest = {
  mutationId: string;
  baseVersionId: string;
};

type EventBody =
  | PlanningEventRequest["event"]
  | { kind: "replan_accepted" | "replan_discarded"; candidatePlanVersionId: string };

function mutateWithEvent(
  storage: Storage | undefined,
  createId: () => string,
  now: () => Date,
  request: MutationRequest,
  body: EventBody,
): PlanningMutationResult {
  const envelope = envelopeForWrite(storage);
  const replay = replayMutation(envelope, request.mutationId);
  if (replay) return replay;
  const workspace = envelope.workspace;
  if (!workspace) throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
  if (request.baseVersionId !== workspace.activePlanVersionId) {
    throw new LocalPlanningRepositoryError("CONFLICT");
  }

  let result: PlanningMutationResult;
  try {
    const event = planningEventSchema.parse({
      ...body,
      eventId: createId(),
      mutationId: request.mutationId,
      sequence: envelope.nextSequence,
      targetPlanVersionId: request.baseVersionId,
      occurredAt: now().toISOString(),
    }) as PlanningEvent;
    const transition = applyPlanningEvent({
      workspace,
      event,
      blueprint: flagshipBlueprint,
      registry: flagshipUnitRegistry,
    });
    result = planningMutationResultSchema.parse({
      outcome: transition.kind === "automatic" ? "active" : transition.kind,
      workspace: transition.workspace,
      diff: transition.kind === "proposed" ? transition.diff : null,
    });
  } catch (error) {
    throw normalizePlanningError(error);
  }

  const persisted = writeMutation(storage, envelope, request.mutationId, result);
  return replayMutation(persisted, request.mutationId)!;
}

function createEmptyEnvelope(state?: DemoState, sourceFingerprint?: string): LocalPlanningEnvelope {
  const migration = state && sourceFingerprint
    ? {
      source: DEMO_STORAGE_KEY,
      sourceFingerprint,
      roleId: state.setup.roleId,
      weeklyMinutes: state.setup.weeklyMinutes,
      targetWeeks: state.setup.targetWeeks,
    }
    : null;
  const setupDraft = state
    ? {
      roleId: state.setup.roleId,
      legacyLevel: state.setup.level,
      weeklyMinutes: state.setup.weeklyMinutes,
      targetWeeks: state.setup.targetWeeks,
      auditAnswers: [] as never[],
    }
    : null;
  return localPlanningEnvelopeSchema.parse({
    schemaVersion: PLANNING_SCHEMA_VERSION,
    migration,
    setupDraft,
    workspace: null,
    eventStream: [],
    mutationResults: [],
    nextSequence: 1,
  });
}

function envelopeForWrite(storage: Storage | undefined): LocalPlanningEnvelope {
  if (!storage) throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
  const stored = readEnvelope(storage);
  if (stored.kind === "valid") return stored.envelope;
  if (stored.kind === "invalid") throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
  const legacy = readDemoStateForMigration(storage);
  return legacy.found ? createEmptyEnvelope(legacy.state, legacy.fingerprint) : createEmptyEnvelope();
}

function readEnvelope(storage: Pick<Storage, "getItem">): StoredEnvelopeRead {
  try {
    const raw = storage.getItem(PLANNING_STORAGE_KEY);
    if (raw === null) return { kind: "absent" };
    return {
      kind: "valid",
      envelope: localPlanningEnvelopeSchema.parse(JSON.parse(raw) as unknown),
    };
  } catch {
    return { kind: "invalid" };
  }
}

function writeMutation(
  storage: Storage | undefined,
  envelope: LocalPlanningEnvelope,
  mutationId: string,
  result: PlanningMutationResult,
): LocalPlanningEnvelope {
  if (!storage) throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
  const resultJson = JSON.stringify(planningMutationResultSchema.parse(result));
  const workspace = planningMutationResultSchema.parse(JSON.parse(resultJson) as unknown).workspace;
  const mutationResults = [
    ...envelope.mutationResults,
    { mutationId, resultJson },
  ].slice(-500);
  const candidate = {
    ...envelope,
    workspace,
    eventStream: workspace.events,
    mutationResults,
    nextSequence: workspace.lastSequence + 1,
  };
  return persistEnvelope(storage, candidate);
}

function persistEnvelope(storage: Storage, input: unknown): LocalPlanningEnvelope {
  let serialized: string;
  try {
    const envelope = localPlanningEnvelopeSchema.parse(input);
    serialized = JSON.stringify(envelope);
  } catch {
    throw new LocalPlanningRepositoryError("INVALID_INPUT");
  }
  try {
    storage.setItem(PLANNING_STORAGE_KEY, serialized);
  } catch {
    throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
  }
  return localPlanningEnvelopeSchema.parse(JSON.parse(serialized) as unknown);
}

function replayMutation(envelope: LocalPlanningEnvelope, mutationId: string): PlanningMutationResult | null {
  const entry = envelope.mutationResults.find((candidate) => candidate.mutationId === mutationId);
  if (!entry) return null;
  return planningMutationResultSchema.parse(JSON.parse(entry.resultJson) as unknown);
}

function parseRequest<T>(schema: z.ZodType<T>, request: unknown): T {
  try {
    return schema.parse(request);
  } catch {
    throw new LocalPlanningRepositoryError("INVALID_INPUT");
  }
}

function normalizePlanningError(error: unknown): LocalPlanningRepositoryError {
  if (error instanceof LocalPlanningRepositoryError) return error;
  if (error instanceof PlanningEventError && error.code === "BASE_REVISION_MISMATCH") {
    return new LocalPlanningRepositoryError("CONFLICT");
  }
  return new LocalPlanningRepositoryError("INVALID_INPUT");
}

function resolveStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function defaultIdFactory(): () => string {
  let fallbackSequence = 0;
  return () => {
    const randomUuid = globalThis.crypto?.randomUUID?.();
    if (randomUuid) return `local-${randomUuid}`;
    fallbackSequence += 1;
    return `local-${Date.now().toString(36)}-${fallbackSequence.toString(36)}`;
  };
}

function cloneEnvelope(envelope: LocalPlanningEnvelope): LocalPlanningEnvelope {
  return localPlanningEnvelopeSchema.parse(JSON.parse(JSON.stringify(envelope)) as unknown);
}

function cloneWorkspace(workspace: PlanningWorkspace): PlanningWorkspace {
  return planningWorkspaceSchema.parse(JSON.parse(JSON.stringify(workspace)) as unknown);
}

function cloneDemoState(state: DemoState): DemoState {
  return JSON.parse(JSON.stringify(state)) as DemoState;
}

function errorMessage(code: LocalPlanningRepositoryErrorCode): string {
  if (code === "CONFLICT") return "Planning state changed. Refresh and try again.";
  if (code === "PLANNING_UNAVAILABLE") return "Planning is unavailable. Your previous state is unchanged.";
  return "Planning input is invalid.";
}
