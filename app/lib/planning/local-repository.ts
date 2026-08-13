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
import {
  applyPlanningEvent,
  PlanningEventError,
  replayPlanningEvents,
  type PlanningTransition,
} from "./event-reducer";
import { canonicalJson, fingerprint } from "./fingerprint";
import { buildLearningPaths } from "./path-builder";
import { buildPlanVersion } from "./scheduler";

export const PLANNING_STORAGE_KEY = "arc-planning-state-v2";
export const PLANNING_STORAGE_LOCK_NAME = "arc-planning-state-v2:exclusive";
export const LOCAL_PLANNING_ENVELOPE_MAX_BYTES = 4 * 1024 * 1024;

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const idSchema = z.string().max(256).regex(ID_PATTERN);
const fingerprintSchema = z.string().trim().min(1).max(256);
const resultFingerprintSchema = z.string().regex(/^p2-[0-9a-f]{32}$/u);
const MUTATION_LINEAGE_KIND = "arc-local-planning-mutation-lineage";
const MUTATION_LINEAGE_VERSION = 1;
const learnerLevelSchema = z.enum(["new", "beginner", "intermediate", "advanced"]);
const mutationOutcomeSchema = z.enum(["active", "proposed", "accepted", "discarded"]);

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
  sequence: z.number().int().min(0).max(5000),
  outcome: mutationOutcomeSchema,
  resultFingerprint: resultFingerprintSchema,
}).strict();

const planningImportProgressSchema = z.object({
  userId: z.string().trim().min(1).max(256),
  initialMutationId: idSchema,
  lastImportedSequence: z.number().int().min(0).max(5000),
  completed: z.boolean(),
}).strict();

const planningImportProgressEntrySchema = planningImportProgressSchema.extend({
  workspaceFingerprint: resultFingerprintSchema,
}).strict();

export const localPlanningEnvelopeSchema = z.object({
  schemaVersion: z.literal(PLANNING_SCHEMA_VERSION),
  migration: migrationMarkerSchema.nullable(),
  setupDraft: setupDraftSchema.nullable(),
  generationMutationId: idSchema.nullable(),
  initialWorkspace: planningWorkspaceSchema.nullable(),
  workspace: planningWorkspaceSchema.nullable(),
  eventStream: z.array(planningEventSchema).max(5000),
  mutationResults: z.array(mutationResultEntrySchema).max(500),
  importProgress: z.array(planningImportProgressEntrySchema).max(32).default([]),
  nextSequence: z.number().int().positive(),
}).strict().superRefine((envelope, ctx) => {
  if (serializedBytes(envelope) > LOCAL_PLANNING_ENVELOPE_MAX_BYTES) {
    ctx.addIssue({ code: "custom", message: "Local planning envelope exceeds the byte budget" });
    return;
  }
  if ((envelope.migration === null) !== (envelope.setupDraft === null)) {
    ctx.addIssue({ code: "custom", path: ["setupDraft"], message: "Migration marker and setup draft must coexist" });
  }
  const mutationIds = envelope.mutationResults.map(({ mutationId }) => mutationId);
  if (new Set(mutationIds).size !== mutationIds.length) {
    ctx.addIssue({ code: "custom", path: ["mutationResults"], message: "Mutation results must have unique IDs" });
  }
  const sequences = envelope.mutationResults.map(({ sequence }) => sequence);
  if (new Set(sequences).size !== sequences.length) {
    ctx.addIssue({ code: "custom", path: ["mutationResults"], message: "Mutation result sequences must be unique" });
  }
  envelope.mutationResults.forEach((entry, index) => {
    if (index > 0 && entry.sequence <= envelope.mutationResults[index - 1]!.sequence) {
      ctx.addIssue({ code: "custom", path: ["mutationResults", index, "sequence"], message: "Mutation results must follow history order" });
    }
  });
  const progressKeys = envelope.importProgress.map(({ userId, workspaceFingerprint }) => `${userId}\u0000${workspaceFingerprint}`);
  if (new Set(progressKeys).size !== progressKeys.length) {
    ctx.addIssue({ code: "custom", path: ["importProgress"], message: "Import progress must be unique per user and workspace" });
  }
  if (envelope.workspace === null) {
    if (envelope.initialWorkspace !== null || envelope.generationMutationId !== null) {
      ctx.addIssue({ code: "custom", path: ["initialWorkspace"], message: "An empty envelope cannot have generation state" });
    }
    if (envelope.eventStream.length !== 0) {
      ctx.addIssue({ code: "custom", path: ["eventStream"], message: "An empty envelope cannot contain events" });
    }
    if (envelope.mutationResults.length !== 0) {
      ctx.addIssue({ code: "custom", path: ["mutationResults"], message: "An empty envelope cannot contain mutation results" });
    }
    if (envelope.importProgress.length !== 0) {
      ctx.addIssue({ code: "custom", path: ["importProgress"], message: "An empty envelope cannot contain import progress" });
    }
    if (envelope.nextSequence !== 1) {
      ctx.addIssue({ code: "custom", path: ["nextSequence"], message: "An empty envelope starts at sequence one" });
    }
    return;
  }
  if (envelope.initialWorkspace === null || envelope.generationMutationId === null) {
    ctx.addIssue({ code: "custom", path: ["initialWorkspace"], message: "A generated envelope requires canonical generation state" });
    return;
  }
  envelope.importProgress.forEach((entry, index) => {
    if (entry.initialMutationId !== envelope.generationMutationId) {
      ctx.addIssue({ code: "custom", path: ["importProgress", index, "initialMutationId"], message: "Import progress must use the local generation mutation" });
    }
    if (entry.lastImportedSequence > envelope.workspace!.lastSequence) {
      ctx.addIssue({ code: "custom", path: ["importProgress", index, "lastImportedSequence"], message: "Import progress cannot exceed local history" });
    }
  });
  const initialWorkspace = envelope.initialWorkspace;
  if (initialWorkspace.events.length !== 0
    || initialWorkspace.lastSequence !== 0
    || initialWorkspace.revision !== 0) {
    ctx.addIssue({ code: "custom", path: ["initialWorkspace"], message: "Canonical initial workspace must precede all events" });
    return;
  }
  if (JSON.stringify(envelope.eventStream) !== JSON.stringify(envelope.workspace.events)) {
    ctx.addIssue({ code: "custom", path: ["eventStream"], message: "Event stream must match the current workspace history" });
  }
  if (envelope.nextSequence !== envelope.workspace.lastSequence + 1) {
    ctx.addIssue({ code: "custom", path: ["nextSequence"], message: "Next sequence must follow the workspace history" });
  }
  let replayedWorkspace: PlanningWorkspace;
  const cachedFingerprints = new Map<number, string>();
  const cachedSequences = new Set(envelope.mutationResults
    .filter(({ sequence }) => sequence > 0)
    .map(({ sequence }) => sequence));
  const generationFingerprint = fingerprint(initialResult(initialWorkspace));
  let previousLineageFingerprint = generationFingerprint;
  try {
    replayedWorkspace = replayPlanningEvents({
      initial: initialWorkspace,
      events: envelope.eventStream,
      blueprint: flagshipBlueprint,
      registry: flagshipUnitRegistry,
    }, (transition) => {
      previousLineageFingerprint = mutationLineageFingerprint(
        previousLineageFingerprint,
        transition.event,
      );
      if (cachedSequences.has(transition.event.sequence)) {
        cachedFingerprints.set(
          transition.event.sequence,
          previousLineageFingerprint,
        );
      }
    });
  } catch {
    ctx.addIssue({ code: "custom", path: ["eventStream"], message: "Event stream must replay from the canonical initial workspace" });
    return;
  }
  if (canonicalJson(replayedWorkspace) !== canonicalJson(envelope.workspace)) {
    ctx.addIssue({ code: "custom", path: ["workspace"], message: "Current workspace must equal canonical event replay" });
  }
  envelope.mutationResults.forEach((entry, index) => {
    if (entry.sequence === 0) {
      if (entry.mutationId !== envelope.generationMutationId) {
        ctx.addIssue({ code: "custom", path: ["mutationResults", index, "mutationId"], message: "Generation cache must match the generation mutation" });
      }
      const expected = initialResult(initialWorkspace);
      if (entry.outcome !== expected.outcome || entry.resultFingerprint !== generationFingerprint) {
        ctx.addIssue({ code: "custom", path: ["mutationResults", index], message: "Generation cache fingerprint must match the initial workspace" });
      }
    } else {
      const event = envelope.eventStream[entry.sequence - 1];
      if (!event || event.sequence !== entry.sequence || event.mutationId !== entry.mutationId) {
        ctx.addIssue({ code: "custom", path: ["mutationResults", index], message: "Mutation cache must match its event history row" });
      } else if (entry.outcome !== outcomeForEvent(event)) {
        ctx.addIssue({ code: "custom", path: ["mutationResults", index, "outcome"], message: "Mutation cache outcome must match its event kind" });
      } else if (entry.resultFingerprint !== cachedFingerprints.get(entry.sequence)) {
        ctx.addIssue({ code: "custom", path: ["mutationResults", index, "resultFingerprint"], message: "Mutation cache fingerprint must match canonical replay" });
      }
    }
  });
});

export type LocalPlanningEnvelope = z.infer<typeof localPlanningEnvelopeSchema>;
export type PlanningImportProgress = z.infer<typeof planningImportProgressSchema>;

export type LocalPlanningImportSource = {
  generationMutationId: string;
  initialWorkspace: PlanningWorkspace;
  workspace: PlanningWorkspace;
  workspaceFingerprint: string;
};

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
  readImportSource(): Promise<LocalPlanningImportSource | null>;
  readImportProgress(userId: string, workspaceFingerprint: string): Promise<PlanningImportProgress | null>;
  updateImportProgress(workspaceFingerprint: string, progress: PlanningImportProgress): Promise<void>;
  generate(request: GeneratePlanningRequest): Promise<PlanningMutationResult>;
  appendEvent(request: PlanningEventRequest): Promise<PlanningMutationResult>;
  accept(request: ReplanDecisionRequest): Promise<PlanningMutationResult>;
  discard(request: ReplanDecisionRequest): Promise<PlanningMutationResult>;
}

export async function upgradeV7State(storage?: Storage): Promise<V7UpgradeResult> {
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
  try {
    return await withRepositoryMutationLock(resolvedStorage, () => {
      const lockedFallback = cloneDemoState(loadDemoState(resolvedStorage));
      const lockedExisting = readEnvelope(resolvedStorage);
      if (lockedExisting.kind === "valid") {
        return {
          migrated: false,
          envelope: cloneEnvelope(lockedExisting.envelope),
          fallback: lockedFallback,
        };
      }
      if (lockedExisting.kind === "invalid") {
        return { migrated: false, envelope: null, fallback: lockedFallback };
      }
      const lockedLegacy = readDemoStateForMigration(resolvedStorage);
      if (!lockedLegacy.found) {
        return { migrated: false, envelope: null, fallback: lockedFallback };
      }
      const envelope = createEmptyEnvelope(lockedLegacy.state, lockedLegacy.fingerprint);
      const persisted = persistEnvelope(resolvedStorage, envelope, null);
      return {
        migrated: true,
        envelope: persisted,
        fallback: cloneDemoState(lockedLegacy.state),
      };
    });
  } catch {
    const current = readEnvelope(resolvedStorage);
    return {
      migrated: false,
      envelope: current.kind === "valid" ? cloneEnvelope(current.envelope) : null,
      fallback: cloneDemoState(loadDemoState(resolvedStorage)),
    };
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

    async readImportSource() {
      return withRepositoryMutationLock(storage, () => {
        if (!storage) throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
        const stored = readEnvelope(storage);
        if (stored.kind === "absent") return null;
        if (stored.kind !== "valid") throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
        const { generationMutationId, initialWorkspace, workspace } = stored.envelope;
        if (!generationMutationId || !initialWorkspace || !workspace) return null;
        return {
          generationMutationId,
          initialWorkspace: cloneWorkspace(initialWorkspace),
          workspace: cloneWorkspace(workspace),
          workspaceFingerprint: fingerprint(workspace),
        };
      });
    },

    async readImportProgress(userId, workspaceFingerprint) {
      const parsedUserId = parseProgressUserId(userId);
      const parsedFingerprint = parseProgressFingerprint(workspaceFingerprint);
      return withRepositoryMutationLock(storage, () => {
        if (!storage) throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
        const stored = readEnvelope(storage);
        if (stored.kind === "absent") return null;
        if (stored.kind !== "valid") throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
        const entry = stored.envelope.importProgress.find((candidate) =>
          candidate.userId === parsedUserId && candidate.workspaceFingerprint === parsedFingerprint);
        if (!entry) return null;
        return planningImportProgressSchema.parse({
          userId: entry.userId,
          initialMutationId: entry.initialMutationId,
          lastImportedSequence: entry.lastImportedSequence,
          completed: entry.completed,
        });
      });
    },

    async updateImportProgress(workspaceFingerprint, progress) {
      const parsedFingerprint = parseProgressFingerprint(workspaceFingerprint);
      const parsedProgress = parseProgress(progress);
      await withRepositoryMutationLock(storage, () => {
        if (!storage) throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
        const stored = readEnvelope(storage);
        if (stored.kind !== "valid" || !stored.envelope.workspace) {
          throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
        }
        if (fingerprint(stored.envelope.workspace) !== parsedFingerprint) {
          throw new LocalPlanningRepositoryError("CONFLICT");
        }
        const retained = stored.envelope.importProgress.filter((entry) =>
          entry.userId !== parsedProgress.userId || entry.workspaceFingerprint !== parsedFingerprint);
        const candidate = {
          ...stored.envelope,
          importProgress: [...retained, { ...parsedProgress, workspaceFingerprint: parsedFingerprint }].slice(-32),
        };
        persistEnvelope(storage, candidate, stored.raw);
      });
    },

    async generate(request) {
      const parsed = parseRequest(generatePlanningRequestSchema, request);
      return withRepositoryMutationLock(storage, () => {
        const context = envelopeForWrite(storage);
        const replay = replayMutation(context.envelope, parsed.mutationId);
        if (replay) return replay;
        if (context.envelope.workspace !== null) throw new LocalPlanningRepositoryError("CONFLICT");

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

        const generatedEnvelope = {
          ...context.envelope,
          generationMutationId: parsed.mutationId,
          initialWorkspace: result.workspace,
          workspace: result.workspace,
        };
        const persisted = writeMutation(
          storage,
          generatedEnvelope,
          parsed.mutationId,
          result,
          context.raw,
        );
        return replayMutation(persisted, parsed.mutationId)!;
      });
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
  | { kind: "absent"; raw: null }
  | { kind: "invalid"; raw: string | null }
  | { kind: "valid"; envelope: LocalPlanningEnvelope; raw: string };

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
): Promise<PlanningMutationResult> {
  return withRepositoryMutationLock(storage, () => {
    const context = envelopeForWrite(storage);
    const replay = replayMutation(context.envelope, request.mutationId);
    if (replay) return replay;
    const workspace = context.envelope.workspace;
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
        sequence: context.envelope.nextSequence,
        targetPlanVersionId: request.baseVersionId,
        occurredAt: now().toISOString(),
      }) as PlanningEvent;
      const transition = applyPlanningEvent({
        workspace,
        event,
        blueprint: flagshipBlueprint,
        registry: flagshipUnitRegistry,
      });
      result = resultFromTransition(transition);
    } catch (error) {
      throw normalizePlanningError(error);
    }

    const persisted = writeMutation(
      storage,
      context.envelope,
      request.mutationId,
      result,
      context.raw,
    );
    return replayMutation(persisted, request.mutationId)!;
  });
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
    generationMutationId: null,
    initialWorkspace: null,
    workspace: null,
    eventStream: [],
    mutationResults: [],
    importProgress: [],
    nextSequence: 1,
  });
}

function envelopeForWrite(storage: Storage | undefined): { envelope: LocalPlanningEnvelope; raw: string | null } {
  if (!storage) throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
  const stored = readEnvelope(storage);
  if (stored.kind === "valid") return { envelope: stored.envelope, raw: stored.raw };
  if (stored.kind === "invalid") throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
  const legacy = readDemoStateForMigration(storage);
  return {
    envelope: legacy.found ? createEmptyEnvelope(legacy.state, legacy.fingerprint) : createEmptyEnvelope(),
    raw: null,
  };
}

function readEnvelope(storage: Pick<Storage, "getItem">): StoredEnvelopeRead {
  let raw: string | null = null;
  try {
    raw = storage.getItem(PLANNING_STORAGE_KEY);
    if (raw === null) return { kind: "absent", raw };
    if (serializedBytes(raw) > LOCAL_PLANNING_ENVELOPE_MAX_BYTES) return { kind: "invalid", raw };
    return {
      kind: "valid",
      envelope: localPlanningEnvelopeSchema.parse(JSON.parse(raw) as unknown),
      raw,
    };
  } catch {
    return { kind: "invalid", raw };
  }
}

function writeMutation(
  storage: Storage | undefined,
  envelope: LocalPlanningEnvelope,
  mutationId: string,
  result: PlanningMutationResult,
  expectedRaw: string | null,
): LocalPlanningEnvelope {
  if (!storage) throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
  const clonedResult = planningMutationResultSchema.parse(JSON.parse(JSON.stringify(result)) as unknown);
  const workspace = clonedResult.workspace;
  const mutationResults = [
    ...envelope.mutationResults,
    {
      mutationId,
      sequence: workspace.lastSequence,
      outcome: clonedResult.outcome,
      resultFingerprint: resultFingerprintForWrite(envelope, clonedResult),
    },
  ].slice(-500);
  const candidate = {
    ...envelope,
    workspace,
    eventStream: workspace.events,
    mutationResults,
    nextSequence: workspace.lastSequence + 1,
  };
  return persistEnvelope(storage, candidate, expectedRaw);
}

function persistEnvelope(
  storage: Storage,
  input: unknown,
  expectedRaw: string | null,
): LocalPlanningEnvelope {
  let serialized: string;
  try {
    const envelope = localPlanningEnvelopeSchema.parse(input);
    serialized = JSON.stringify(envelope);
    if (serializedBytes(serialized) > LOCAL_PLANNING_ENVELOPE_MAX_BYTES) {
      throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
    }
  } catch (error) {
    if (error instanceof LocalPlanningRepositoryError) throw error;
    throw new LocalPlanningRepositoryError("INVALID_INPUT");
  }
  try {
    if (storage.getItem(PLANNING_STORAGE_KEY) !== expectedRaw) {
      throw new LocalPlanningRepositoryError("CONFLICT");
    }
    storage.setItem(PLANNING_STORAGE_KEY, serialized);
  } catch (error) {
    if (error instanceof LocalPlanningRepositoryError) throw error;
    throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
  }
  return JSON.parse(serialized) as LocalPlanningEnvelope;
}

function replayMutation(envelope: LocalPlanningEnvelope, mutationId: string): PlanningMutationResult | null {
  const entry = envelope.mutationResults.find((candidate) => candidate.mutationId === mutationId);
  if (!entry) return null;
  if (!envelope.initialWorkspace) throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
  const result = resultAtSequence(envelope.initialWorkspace, envelope.eventStream, entry.sequence);
  if (result.outcome !== entry.outcome
    || lineageFingerprintAtSequence(envelope.initialWorkspace, envelope.eventStream, entry.sequence) !== entry.resultFingerprint) {
    throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
  }
  return planningMutationResultSchema.parse(JSON.parse(JSON.stringify(result)) as unknown);
}

function resultFingerprintForWrite(
  envelope: LocalPlanningEnvelope,
  result: PlanningMutationResult,
): string {
  const sequence = result.workspace.lastSequence;
  if (sequence === 0) return fingerprint(result);
  const event = result.workspace.events[sequence - 1];
  const previous = envelope.mutationResults.at(-1);
  if (!event || !previous || previous.sequence !== sequence - 1) {
    throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
  }
  return mutationLineageFingerprint(previous.resultFingerprint, event);
}

function lineageFingerprintAtSequence(
  initialWorkspace: PlanningWorkspace,
  events: readonly PlanningEvent[],
  sequence: number,
): string {
  let lineage = fingerprint(initialResult(initialWorkspace));
  for (let index = 0; index < sequence; index += 1) {
    const event = events[index];
    if (!event) throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
    lineage = mutationLineageFingerprint(lineage, event);
  }
  return lineage;
}

function mutationLineageFingerprint(
  previousLineageFingerprint: string,
  event: PlanningEvent,
): string {
  return fingerprint({
    kind: MUTATION_LINEAGE_KIND,
    version: MUTATION_LINEAGE_VERSION,
    previousLineageFingerprint,
    event,
    outcome: outcomeForEvent(event),
  });
}

function resultAtSequence(
  initialWorkspace: PlanningWorkspace,
  events: readonly PlanningEvent[],
  sequence: number,
): PlanningMutationResult {
  if (sequence === 0) return initialResult(initialWorkspace);
  if (sequence < 0 || sequence > events.length) throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
  const priorEvents = events.slice(0, sequence - 1);
  const workspace = priorEvents.length === 0
    ? planningWorkspaceSchema.parse(initialWorkspace)
    : replayPlanningEvents({
      initial: initialWorkspace,
      events: priorEvents,
      blueprint: flagshipBlueprint,
      registry: flagshipUnitRegistry,
    });
  const transition = applyPlanningEvent({
    workspace,
    event: events[sequence - 1]!,
    blueprint: flagshipBlueprint,
    registry: flagshipUnitRegistry,
  });
  return resultFromTransition(transition);
}

function initialResult(workspace: PlanningWorkspace): PlanningMutationResult {
  return planningMutationResultSchema.parse({ outcome: "active", workspace, diff: null });
}

function resultFromTransition(transition: PlanningTransition): PlanningMutationResult {
  return planningMutationResultSchema.parse({
    outcome: transition.kind === "automatic" ? "active" : transition.kind,
    workspace: transition.workspace,
    diff: transition.kind === "proposed" ? transition.diff : null,
  });
}

function outcomeForEvent(event: PlanningEvent): PlanningMutationResult["outcome"] {
  if (event.kind === "completed") return "active";
  if (event.kind === "replan_accepted") return "accepted";
  if (event.kind === "replan_discarded") return "discarded";
  return "proposed";
}

type WebLockManager = {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    callback: () => Promise<T> | T,
  ): Promise<T>;
};

const storageMutexTails = new WeakMap<Storage, Promise<void>>();

async function withRepositoryMutationLock<T>(
  storage: Storage | undefined,
  action: () => Promise<T> | T,
): Promise<T> {
  if (!storage) throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
  const webLocks = resolveWebLocks();
  if (webLocks.kind === "available") {
    try {
      return await webLocks.manager.request(PLANNING_STORAGE_LOCK_NAME, { mode: "exclusive" }, action);
    } catch (error) {
      if (error instanceof LocalPlanningRepositoryError) throw error;
      throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
    }
  }
  if (webLocks.kind === "unavailable") {
    throw new LocalPlanningRepositoryError("PLANNING_UNAVAILABLE");
  }
  return withStorageMutex(storage, action);
}

async function withStorageMutex<T>(storage: Storage, action: () => Promise<T> | T): Promise<T> {
  const previous = storageMutexTails.get(storage) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  storageMutexTails.set(storage, tail);
  await previous.catch(() => undefined);
  try {
    return await action();
  } finally {
    release();
    if (storageMutexTails.get(storage) === tail) storageMutexTails.delete(storage);
  }
}

type WebLocksResolution =
  | { kind: "available"; manager: WebLockManager }
  | { kind: "non-browser" }
  | { kind: "unavailable" };

function resolveWebLocks(): WebLocksResolution {
  if (typeof navigator === "undefined") return { kind: "non-browser" };
  try {
    const locks = navigator.locks as unknown as WebLockManager | undefined;
    return locks && typeof locks.request === "function"
      ? { kind: "available", manager: locks }
      : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

function serializedBytes(value: unknown): number {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return new TextEncoder().encode(serialized).byteLength;
}

function parseRequest<T>(schema: z.ZodType<T>, request: unknown): T {
  try {
    return schema.parse(request);
  } catch {
    throw new LocalPlanningRepositoryError("INVALID_INPUT");
  }
}

function parseProgress(value: unknown): PlanningImportProgress {
  try {
    return planningImportProgressSchema.parse(value);
  } catch {
    throw new LocalPlanningRepositoryError("INVALID_INPUT");
  }
}

function parseProgressUserId(value: unknown): string {
  try {
    return planningImportProgressSchema.shape.userId.parse(value);
  } catch {
    throw new LocalPlanningRepositoryError("INVALID_INPUT");
  }
}

function parseProgressFingerprint(value: unknown): string {
  try {
    return resultFingerprintSchema.parse(value);
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
