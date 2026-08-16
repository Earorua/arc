import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeneratePlanningRequest, PlanningEventRequest } from "../../../app/contracts/planning-api";
import {
  planningMutationResultSchema,
  PLANNING_SCHEMA_VERSION,
  type PlanningEvent,
  type PlanningMutationResult,
  type PlanningWorkspace,
} from "../../../app/contracts/planning";
import { flagshipBlueprint } from "../../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../../app/data/flagship-unit-registry";
import { createDemoState, DEMO_STORAGE_KEY, mergeSetup } from "../../../app/lib/demo-store";
import {
  createLocalPlanningRepository,
  LOCAL_PLANNING_ENVELOPE_MAX_BYTES,
  localPlanningEnvelopeSchema,
  PLANNING_STORAGE_KEY,
  PLANNING_STORAGE_LOCK_NAME,
  upgradeV7State,
} from "../../../app/lib/planning/local-repository";
import {
  applyPlanningEvent,
  replayPlanningEvents,
  type PlanningTransition,
} from "../../../app/lib/planning/event-reducer";
import { fingerprint } from "../../../app/lib/planning/fingerprint";

const OFFLINE_QUEUE_KEY = "arc-offline-queue-v1";
const PLANNING_DATE = "2026-08-12";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  readonly setCalls: Array<{ key: string; value: string }> = [];
  readonly removeCalls: string[] = [];
  setAttempts = 0;
  failSet = false;
  beforeGet: ((key: string) => void) | null = null;

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    this.beforeGet?.(key);
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.removeCalls.push(key);
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.setAttempts += 1;
    if (this.failSet) throw new Error("storage unavailable");
    this.setCalls.push({ key, value });
    this.values.set(key, value);
  }
}

function generateRequest(mutationId = "mutation-generate"): GeneratePlanningRequest {
  const audit = {
    id: "audit-guest",
    schemaVersion: PLANNING_SCHEMA_VERSION,
    blueprintId: flagshipBlueprint.id,
    blueprintVersion: flagshipBlueprint.version,
    answers: flagshipBlueprint.skills.map(({ id }) => ({
      skillId: id,
      level: "guided" as const,
      evidenceRefs: [],
    })),
    evidence: [],
    createdBy: "guest-learner",
    inputFingerprint: "audit-guest-fingerprint",
  };
  const weekdays = {
    monday: 120,
    tuesday: 120,
    wednesday: 120,
    thursday: 120,
    friday: 120,
    saturday: 120,
    sunday: 120,
  };
  return {
    mutationId,
    roleId: "ai-native-full-stack-engineer",
    planningDate: PLANNING_DATE,
    audit,
    availability: {
      id: "availability-guest",
      schemaVersion: PLANNING_SCHEMA_VERSION,
      timeZone: "Asia/Shanghai",
      weekdays,
      exceptions: [],
      weeklyMinutes: 840,
      inputFingerprint: "availability-guest-fingerprint",
    },
    target: {
      id: "target-guest",
      schemaVersion: PLANNING_SCHEMA_VERSION,
      targetWeeks: 18,
      inputFingerprint: "target-guest-fingerprint",
    },
    selectedScope: "full-scope",
  };
}

function sparseGenerateRequest(mutationId = "mutation-generate"): GeneratePlanningRequest {
  const request = generateRequest(mutationId);
  request.availability.weekdays = {
    monday: 0,
    tuesday: 0,
    wednesday: 720,
    thursday: 0,
    friday: 0,
    saturday: 0,
    sunday: 0,
  };
  request.availability.weeklyMinutes = 720;
  request.availability.inputFingerprint = "availability-sparse-fingerprint";
  return request;
}

function createRepository(storage: Storage, prefix = "runtime") {
  let nextId = 0;
  return createLocalPlanningRepository({
    storage,
    createId: () => `${prefix}-${++nextId}`,
    now: () => new Date("2026-08-12T08:00:00.000Z"),
  });
}

function requiredUnit(workspace: PlanningWorkspace) {
  const unit = workspace.dailyUnits.find((candidate) =>
    candidate.planVersionId === workspace.activePlanVersionId && candidate.required);
  if (!unit) throw new Error("Expected a required active Daily Unit");
  return unit;
}

function eventRequest(
  workspace: PlanningWorkspace,
  mutationId: string,
  kind: "completed" | "delayed" | "skipped",
): PlanningEventRequest {
  const unit = requiredUnit(workspace);
  return {
    mutationId,
    baseVersionId: workspace.activePlanVersionId,
    event: kind === "completed"
      ? { kind, unitId: unit.id, actualMinutes: 90, planningDate: PLANNING_DATE }
      : { kind, unitId: unit.id, planningDate: PLANNING_DATE },
  };
}

function resultFromTransition(transition: PlanningTransition): PlanningMutationResult {
  return planningMutationResultSchema.parse({
    outcome: transition.kind === "automatic" ? "active" : transition.kind,
    workspace: transition.workspace,
    diff: transition.kind === "proposed" ? transition.diff : null,
  });
}

function installFakeWebLocks() {
  const calls: Array<{ name: string; mode: string | undefined }> = [];
  let tail: Promise<unknown> = Promise.resolve();
  const fakeLocks = {
    request<T>(
      name: string,
      options: { mode?: string },
      callback: () => Promise<T> | T,
    ): Promise<T> {
      calls.push({ name, mode: options.mode });
      const result = tail.then(() => callback());
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", { configurable: true, value: fakeLocks });
  return {
    calls,
    restore() {
      if (descriptor) Object.defineProperty(navigator, "locks", descriptor);
      else Reflect.deleteProperty(navigator, "locks");
    },
  };
}

describe("guest adaptive planning repository", () => {
  let defaultWebLocks: ReturnType<typeof installFakeWebLocks>;

  beforeEach(() => {
    defaultWebLocks = installFakeWebLocks();
  });

  afterEach(() => {
    defaultWebLocks.restore();
  });

  it("upgrades a strict v7 snapshot without overwriting v7 or the offline queue", async () => {
    const storage = new MemoryStorage();
    const legacy = mergeSetup(createDemoState(), {
      roleId: "ai-native-full-stack-engineer",
      level: "advanced",
      weeklyMinutes: 600,
      targetWeeks: 12,
    });
    const legacyBytes = JSON.stringify(legacy);
    const offlineBytes = JSON.stringify([{ mutationId: "legacy-offline" }]);
    storage.values.set(DEMO_STORAGE_KEY, legacyBytes);
    storage.values.set(OFFLINE_QUEUE_KEY, offlineBytes);

    const result = await upgradeV7State(storage);

    expect(PLANNING_STORAGE_KEY).toBe("arc-planning-state-v2");
    expect(result).toMatchObject({
      migrated: true,
      envelope: {
        schemaVersion: PLANNING_SCHEMA_VERSION,
        migration: {
          source: "arc-demo-state-v1",
          roleId: "ai-native-full-stack-engineer",
          weeklyMinutes: 600,
          targetWeeks: 12,
        },
        setupDraft: {
          roleId: "ai-native-full-stack-engineer",
          legacyLevel: "advanced",
          weeklyMinutes: 600,
          targetWeeks: 12,
          auditAnswers: [],
        },
        workspace: null,
        eventStream: [],
        mutationResults: [],
        nextSequence: 1,
      },
    });
    expect(storage.getItem(DEMO_STORAGE_KEY)).toBe(legacyBytes);
    expect(storage.getItem(OFFLINE_QUEUE_KEY)).toBe(offlineBytes);
    expect(storage.setCalls).toHaveLength(1);
    expect(storage.setAttempts).toBe(1);
    expect(storage.setCalls[0]?.key).toBe(PLANNING_STORAGE_KEY);
    expect(storage.removeCalls).toEqual([]);
  });

  it("runs the guarded v7 upgrade on the first production repository read", async () => {
    const storage = new MemoryStorage();
    const legacy = mergeSetup(createDemoState(), {
      roleId: "ai-native-full-stack-engineer",
      level: "intermediate",
      weeklyMinutes: 360,
      targetWeeks: 20,
    });
    const legacyBytes = JSON.stringify(legacy);
    storage.values.set(DEMO_STORAGE_KEY, legacyBytes);

    const repository = createRepository(storage, "production-upgrade");
    await expect(repository.load()).resolves.toBeNull();

    expect(storage.getItem(DEMO_STORAGE_KEY)).toBe(legacyBytes);
    expect(storage.setCalls).toHaveLength(1);
    expect(JSON.parse(storage.getItem(PLANNING_STORAGE_KEY)!)).toMatchObject({
      migration: { source: DEMO_STORAGE_KEY },
      setupDraft: {
        roleId: "ai-native-full-stack-engineer",
        legacyLevel: "intermediate",
        weeklyMinutes: 360,
        targetWeeks: 20,
        auditAnswers: [],
      },
      workspace: null,
    });
  });

  it("returns a v7-compatible fallback without replacing malformed v2 bytes or partially writing", async () => {
    const storage = new MemoryStorage();
    const legacy = mergeSetup(createDemoState(), {
      roleId: "legacy-custom-role",
      level: "intermediate",
      weeklyMinutes: 300,
      targetWeeks: 24,
    });
    const malformedV2 = "{not-valid-json";
    storage.values.set(DEMO_STORAGE_KEY, JSON.stringify(legacy));
    storage.values.set(PLANNING_STORAGE_KEY, malformedV2);

    const malformed = await upgradeV7State(storage);

    expect(malformed).toMatchObject({ migrated: false, envelope: null, fallback: legacy });
    expect(storage.getItem(PLANNING_STORAGE_KEY)).toBe(malformedV2);
    expect(storage.setCalls).toHaveLength(0);
    expect(storage.setAttempts).toBe(0);

    storage.values.delete(PLANNING_STORAGE_KEY);
    storage.failSet = true;
    const failedWrite = await upgradeV7State(storage);
    expect(failedWrite).toMatchObject({ migrated: false, envelope: null, fallback: legacy });
    expect(storage.getItem(PLANNING_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(DEMO_STORAGE_KEY)).toBe(JSON.stringify(legacy));
    expect(storage.removeCalls).toEqual([]);
  });

  it("constructs, validates, and persists a complete initial envelope with one write", async () => {
    const storage = new MemoryStorage();
    storage.values.set(DEMO_STORAGE_KEY, JSON.stringify(createDemoState()));
    const repository = createRepository(storage);
    const input = generateRequest();

    const result = await repository.generate(input);

    expect(result.outcome).toBe("active");
    expect(result.workspace.events).toEqual([]);
    expect(result.workspace.lastSequence).toBe(0);
    expect(storage.setCalls).toHaveLength(1);
    expect(storage.setAttempts).toBe(1);
    expect(storage.setCalls[0]?.key).toBe(PLANNING_STORAGE_KEY);
    const persisted = JSON.parse(storage.getItem(PLANNING_STORAGE_KEY)!) as Record<string, unknown>;
    expect(persisted).toMatchObject({
      schemaVersion: PLANNING_SCHEMA_VERSION,
      generationMutationId: "mutation-generate",
      initialWorkspace: result.workspace,
      nextSequence: 1,
      eventStream: [],
      mutationResults: [{
        mutationId: "mutation-generate",
        sequence: 0,
        outcome: "active",
        resultFingerprint: fingerprint(result),
      }],
    });
    expect(JSON.stringify(persisted)).not.toContain("resultJson");
    expect(await repository.load()).toEqual(result.workspace);
    expect(storage.getItem(DEMO_STORAGE_KEY)).toBe(JSON.stringify(createDemoState()));
  });

  it("chains non-generation cache fingerprints from compact canonical lineage only", async () => {
    const storage = new MemoryStorage();
    const repository = createRepository(storage, "lineage-chain");
    const generated = await repository.generate(generateRequest());
    const completed = await repository.appendEvent(eventRequest(
      generated.workspace,
      "mutation-lineage-completed",
      "completed",
    ));
    const envelope = JSON.parse(storage.getItem(PLANNING_STORAGE_KEY)!) as {
      eventStream: PlanningEvent[];
      mutationResults: Array<{ sequence: number; resultFingerprint: string }>;
    };
    const generation = envelope.mutationResults.find(({ sequence }) => sequence === 0)!;
    const completion = envelope.mutationResults.find(({ sequence }) => sequence === 1)!;

    expect(generation.resultFingerprint).toBe(fingerprint(generated));
    expect(completion.resultFingerprint).toBe(fingerprint({
      kind: "arc-local-planning-mutation-lineage",
      version: 1,
      previousLineageFingerprint: generation.resultFingerprint,
      event: envelope.eventStream[0],
      outcome: completed.outcome,
    }));
    expect(completion.resultFingerprint).not.toBe(fingerprint(completed));
  });

  it("serializes upgrade behind generation and never overwrites the generated winner", async () => {
    const storage = new MemoryStorage();
    const legacyBytes = JSON.stringify(createDemoState());
    storage.values.set(DEMO_STORAGE_KEY, legacyBytes);
    const repository = createRepository(storage, "upgrade-race");

    const generatedPromise = repository.generate(generateRequest("mutation-upgrade-race"));
    const upgradePromise = upgradeV7State(storage);
    const [generated, upgrade] = await Promise.all([generatedPromise, upgradePromise]);

    expect(upgrade).toMatchObject({
      migrated: false,
      envelope: { workspace: generated.workspace },
    });
    expect(storage.setAttempts).toBe(1);
    expect(storage.setCalls).toHaveLength(1);
    expect(JSON.parse(storage.getItem(PLANNING_STORAGE_KEY)!)).toMatchObject({
      workspace: generated.workspace,
      generationMutationId: "mutation-upgrade-race",
    });
    expect(storage.getItem(DEMO_STORAGE_KEY)).toBe(legacyBytes);
  });

  it("returns a safe migration fallback with zero writes when browser Web Locks are unavailable", async () => {
    const legacy = createDemoState();
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
    for (const unavailable of ["missing", "throwing"] as const) {
      const storage = new MemoryStorage();
      storage.values.set(DEMO_STORAGE_KEY, JSON.stringify(legacy));
      if (unavailable === "missing") {
        Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
      } else {
        Object.defineProperty(navigator, "locks", {
          configurable: true,
          get() { throw new Error("locks unavailable"); },
        });
      }

      const result = await upgradeV7State(storage);

      expect(result).toMatchObject({ migrated: false, envelope: null, fallback: legacy });
      expect(storage.getItem(PLANNING_STORAGE_KEY)).toBeNull();
      expect(storage.setAttempts).toBe(0);
    }
    if (descriptor) Object.defineProperty(navigator, "locks", descriptor);
    else Reflect.deleteProperty(navigator, "locks");
  });

  it("does not write when the complete next envelope cannot validate or storage rejects it", async () => {
    const invalidIdStorage = new MemoryStorage();
    const invalidIds = createLocalPlanningRepository({
      storage: invalidIdStorage,
      createId: () => "INVALID ID",
      now: () => new Date("2026-08-12T08:00:00.000Z"),
    });
    await expect(invalidIds.generate(generateRequest())).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(invalidIdStorage.setCalls).toHaveLength(0);
    expect(invalidIdStorage.setAttempts).toBe(0);
    expect(invalidIdStorage.getItem(PLANNING_STORAGE_KEY)).toBeNull();

    const failedStorage = new MemoryStorage();
    failedStorage.values.set(DEMO_STORAGE_KEY, JSON.stringify(createDemoState()));
    failedStorage.failSet = true;
    await expect(createRepository(failedStorage).generate(generateRequest())).rejects.toMatchObject({
      code: "PLANNING_UNAVAILABLE",
    });
    expect(failedStorage.getItem(PLANNING_STORAGE_KEY)).toBeNull();
    expect(failedStorage.getItem(DEMO_STORAGE_KEY)).toBe(JSON.stringify(createDemoState()));
    expect(failedStorage.setAttempts).toBe(1);
  });

  it("keeps the previous complete v2 bytes when a later atomic replacement fails", async () => {
    const storage = new MemoryStorage();
    const repository = createRepository(storage);
    const generated = await repository.generate(generateRequest());
    const before = storage.getItem(PLANNING_STORAGE_KEY);
    const attemptsBefore = storage.setAttempts;
    storage.failSet = true;

    await expect(repository.appendEvent(eventRequest(generated.workspace, "mutation-failed-write", "completed")))
      .rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });

    expect(storage.setAttempts).toBe(attemptsBefore + 1);
    expect(storage.getItem(PLANNING_STORAGE_KEY)).toBe(before);
    expect(storage.removeCalls).toEqual([]);
  });

  it("allocates monotonic events and replays a duplicate mutation without writing", async () => {
    const storage = new MemoryStorage();
    let nextId = 0;
    const createId = vi.fn(() => `replay-${++nextId}`);
    const repository = createLocalPlanningRepository({
      storage,
      createId,
      now: () => new Date("2026-08-12T08:00:00.000Z"),
    });
    const generated = await repository.generate(generateRequest());
    const request = eventRequest(generated.workspace, "mutation-complete", "completed");
    const first = await repository.appendEvent(request);
    const originalResultBytes = JSON.stringify(first);
    const persistedAfterFirst = storage.getItem(PLANNING_STORAGE_KEY);
    const writesAfterFirst = storage.setCalls.length;
    const idCallsAfterFirst = createId.mock.calls.length;

    first.workspace.audit.answers[0]!.level = "unseen";
    const replayed = await repository.appendEvent(request);

    expect(JSON.stringify(replayed)).toBe(originalResultBytes);
    expect(storage.setCalls).toHaveLength(writesAfterFirst);
    expect(createId).toHaveBeenCalledTimes(idCallsAfterFirst);
    expect(storage.getItem(PLANNING_STORAGE_KEY)).toBe(persistedAfterFirst);
    expect(replayed.workspace.events.map(({ sequence }) => sequence)).toEqual([1]);
    const envelope = JSON.parse(persistedAfterFirst!) as {
      eventStream: Array<{ sequence: number }>;
      nextSequence: number;
    };
    expect(envelope.eventStream.map(({ sequence }) => sequence)).toEqual([1]);
    expect(envelope.nextSequence).toBe(2);
  });

  it("returns a stable conflict for a stale base and leaves stored bytes unchanged", async () => {
    const storage = new MemoryStorage();
    const repository = createRepository(storage);
    const generated = await repository.generate(generateRequest());
    const completed = await repository.appendEvent(eventRequest(generated.workspace, "mutation-complete", "completed"));
    const stale = eventRequest(generated.workspace, "mutation-stale", "delayed");
    const before = storage.getItem(PLANNING_STORAGE_KEY);
    const writesBefore = storage.setCalls.length;

    const first = repository.appendEvent(stale).catch((error: unknown) => error);
    const second = repository.appendEvent(stale).catch((error: unknown) => error);

    await expect(first).resolves.toMatchObject({
      code: "CONFLICT",
      message: "Planning state changed. Refresh and try again.",
    });
    await expect(second).resolves.toMatchObject({
      code: "CONFLICT",
      message: "Planning state changed. Refresh and try again.",
    });
    expect(completed.workspace.activePlanVersionId).not.toBe(generated.workspace.activePlanVersionId);
    expect(storage.getItem(PLANNING_STORAGE_KEY)).toBe(before);
    expect(storage.setCalls).toHaveLength(writesBefore);
  });

  it("evicts the oldest cached result deterministically after the 500-entry cap", async () => {
    const storage = new MemoryStorage();
    const repository = createRepository(storage, "cache");
    const generated = await repository.generate(sparseGenerateRequest());
    const initialEnvelope = JSON.parse(storage.getItem(PLANNING_STORAGE_KEY)!) as {
      generationMutationId?: string;
      initialWorkspace?: PlanningWorkspace;
      mutationResults: Array<{ sequence: number; resultFingerprint: string }>;
    };
    expect(initialEnvelope.initialWorkspace).toEqual(generated.workspace);
    if (!initialEnvelope.initialWorkspace) throw new Error("Expected canonical initial workspace");

    const events: PlanningEvent[] = [];
    const cacheRecords: Array<{
      mutationId: string;
      sequence: number;
      outcome: PlanningMutationResult["outcome"];
      resultFingerprint: string;
    }> = [];
    const unit = requiredUnit(generated.workspace);
    let previousLineageFingerprint = initialEnvelope.mutationResults
      .find(({ sequence }) => sequence === 0)!.resultFingerprint;
    const firstProposalEvent: PlanningEvent = {
      kind: "delayed",
      unitId: unit.id,
      planningDate: PLANNING_DATE,
      eventId: "cache-event-1",
      mutationId: "cache-mutation-1",
      sequence: 1,
      targetPlanVersionId: generated.workspace.activePlanVersionId,
      occurredAt: "2026-08-12T08:00:00.000Z",
    };
    const firstProposal = applyPlanningEvent({
      workspace: generated.workspace,
      event: firstProposalEvent,
      blueprint: flagshipBlueprint,
      registry: flagshipUnitRegistry,
    });
    if (firstProposal.kind !== "proposed") throw new Error("Expected proposed transition");
    const candidatePlanVersionId = firstProposal.workspace.pendingPlanVersionId!;
    for (let cycle = 1; cycle <= 250; cycle += 1) {
      const proposalSequence = cycle * 2 - 1;
      const proposalEvent: PlanningEvent = {
        kind: "delayed",
        unitId: unit.id,
        planningDate: PLANNING_DATE,
        eventId: `cache-event-${proposalSequence}`,
        mutationId: `cache-mutation-${proposalSequence}`,
        sequence: proposalSequence,
        targetPlanVersionId: generated.workspace.activePlanVersionId,
        occurredAt: "2026-08-12T08:00:00.000Z",
      };
      events.push(proposalEvent);

      const decisionSequence = cycle * 2;
      const decisionEvent: PlanningEvent = {
        kind: "replan_discarded",
        candidatePlanVersionId,
        eventId: `cache-event-${decisionSequence}`,
        mutationId: `cache-mutation-${decisionSequence}`,
        sequence: decisionSequence,
        targetPlanVersionId: generated.workspace.activePlanVersionId,
        occurredAt: "2026-08-12T08:00:00.000Z",
      };
      events.push(decisionEvent);
    }
    const workspace = replayPlanningEvents({
      initial: initialEnvelope.initialWorkspace,
      events,
      blueprint: flagshipBlueprint,
      registry: flagshipUnitRegistry,
    }, (transition) => {
      const result = resultFromTransition(transition);
      const resultFingerprint = fingerprint({
        kind: "arc-local-planning-mutation-lineage",
        version: 1,
        previousLineageFingerprint,
        event: transition.event,
        outcome: result.outcome,
      });
      cacheRecords.push({
        mutationId: transition.event.mutationId,
        sequence: transition.event.sequence,
        outcome: result.outcome,
        resultFingerprint,
      });
      previousLineageFingerprint = resultFingerprint;
    });

    const envelope = {
      ...initialEnvelope,
      workspace,
      eventStream: workspace.events,
      mutationResults: cacheRecords,
      nextSequence: 501,
    };
    const serialized = JSON.stringify(envelope);
    const measuredBytes = new TextEncoder().encode(serialized).byteLength;
    expect(measuredBytes).toBeLessThan(LOCAL_PLANNING_ENVELOPE_MAX_BYTES);
    storage.values.set(PLANNING_STORAGE_KEY, serialized);
    storage.setCalls.length = 0;
    storage.setAttempts = 0;

    await repository.appendEvent(eventRequest(workspace, "cache-mutation-501", "delayed"));

    const persisted = JSON.parse(storage.getItem(PLANNING_STORAGE_KEY)!) as {
      mutationResults: Array<{ mutationId: string; sequence: number }>;
    };
    expect(persisted.mutationResults).toHaveLength(500);
    expect(persisted.mutationResults[0]).toMatchObject({ mutationId: "cache-mutation-2", sequence: 2 });
    expect(persisted.mutationResults.at(-1)).toMatchObject({ mutationId: "cache-mutation-501", sequence: 501 });
    expect(persisted.mutationResults.some(({ mutationId }) => mutationId === "cache-mutation-1")).toBe(false);
    expect(storage.setAttempts).toBe(1);
    expect(storage.setCalls).toHaveLength(1);
  }, 30_000);

  it("rejects a compact cache record that is not related to its canonical history", async () => {
    const storage = new MemoryStorage();
    const repository = createRepository(storage, "lineage");
    const generated = await repository.generate(generateRequest());
    const envelope = JSON.parse(storage.getItem(PLANNING_STORAGE_KEY)!) as {
      mutationResults: unknown[];
    };
    envelope.mutationResults = [{
      mutationId: "unrelated-generation",
      sequence: 0,
      outcome: "active",
      resultFingerprint: fingerprint(generated),
    }];
    const unrelatedBytes = JSON.stringify(envelope);
    storage.values.set(PLANNING_STORAGE_KEY, unrelatedBytes);
    storage.setCalls.length = 0;
    storage.setAttempts = 0;

    expect(await repository.load()).toBeNull();
    await expect(repository.appendEvent(eventRequest(generated.workspace, "mutation-after-unrelated", "completed")))
      .rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
    expect(storage.getItem(PLANNING_STORAGE_KEY)).toBe(unrelatedBytes);
    expect(storage.setAttempts).toBe(0);
  });

  it("rejects a non-generation cache fingerprint that differs from canonical replay", async () => {
    const storage = new MemoryStorage();
    const repository = createRepository(storage, "fingerprint");
    const generated = await repository.generate(generateRequest());
    await repository.appendEvent(eventRequest(generated.workspace, "mutation-fingerprint", "completed"));
    const envelope = JSON.parse(storage.getItem(PLANNING_STORAGE_KEY)!) as {
      mutationResults: Array<{ sequence: number; resultFingerprint: string }>;
    };
    const cached = envelope.mutationResults.find(({ sequence }) => sequence === 1);
    if (!cached) throw new Error("Expected event mutation cache");
    cached.resultFingerprint = "p2-00000000000000000000000000000000";
    const corruptedBytes = JSON.stringify(envelope);

    expect(localPlanningEnvelopeSchema.safeParse(envelope).success).toBe(false);
    storage.values.set(PLANNING_STORAGE_KEY, corruptedBytes);
    storage.setCalls.length = 0;
    storage.setAttempts = 0;

    expect(await repository.load()).toBeNull();
    await expect(repository.appendEvent(eventRequest(generated.workspace, "mutation-after-corruption", "completed")))
      .rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
    expect(storage.getItem(PLANNING_STORAGE_KEY)).toBe(corruptedBytes);
    expect(storage.setAttempts).toBe(0);
  });

  it("uses one named exclusive Web Lock so concurrent same-base writes cannot overwrite", async () => {
    const fakeLocks = installFakeWebLocks();
    try {
      const storage = new MemoryStorage();
      const firstRepository = createRepository(storage, "first-tab");
      const secondRepository = createRepository(storage, "second-tab");
      const generated = await firstRepository.generate(generateRequest());
      const lockCallsBefore = fakeLocks.calls.length;
      const writesBefore = storage.setAttempts;

      const [first, second] = await Promise.allSettled([
        firstRepository.appendEvent(eventRequest(generated.workspace, "mutation-first-tab", "completed")),
        secondRepository.appendEvent(eventRequest(generated.workspace, "mutation-second-tab", "completed")),
      ]);

      expect(first.status).toBe("fulfilled");
      expect(second).toMatchObject({
        status: "rejected",
        reason: { code: "CONFLICT" },
      });
      expect(storage.setAttempts).toBe(writesBefore + 1);
      expect(fakeLocks.calls.slice(lockCallsBefore)).toEqual([
        { name: PLANNING_STORAGE_LOCK_NAME, mode: "exclusive" },
        { name: PLANNING_STORAGE_LOCK_NAME, mode: "exclusive" },
      ]);
      expect(fakeLocks.calls[0]).toEqual({ name: PLANNING_STORAGE_LOCK_NAME, mode: "exclusive" });
    } finally {
      fakeLocks.restore();
    }
  });

  it("fails every browser repository write closed without Web Locks and preserves canonical bytes", async () => {
    const storage = new MemoryStorage();
    const repository = createRepository(storage, "no-locks-seed");
    const generated = await repository.generate(generateRequest());
    const proposed = await repository.appendEvent(eventRequest(generated.workspace, "mutation-no-locks-proposal", "delayed"));
    const candidatePlanVersionId = proposed.workspace.pendingPlanVersionId!;
    const canonicalBytes = storage.getItem(PLANNING_STORAGE_KEY)!;
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    try {
      const cases = [
        (target: ReturnType<typeof createRepository>) => target.generate(generateRequest("mutation-no-locks-generate")),
        (target: ReturnType<typeof createRepository>) => target.appendEvent(eventRequest(proposed.workspace, "mutation-no-locks-append", "completed")),
        (target: ReturnType<typeof createRepository>) => target.accept({
          mutationId: "mutation-no-locks-accept",
          baseVersionId: proposed.workspace.activePlanVersionId,
          candidatePlanVersionId,
        }),
        (target: ReturnType<typeof createRepository>) => target.discard({
          mutationId: "mutation-no-locks-discard",
          baseVersionId: proposed.workspace.activePlanVersionId,
          candidatePlanVersionId,
        }),
      ];
      for (const [index, invoke] of cases.entries()) {
        const isolated = new MemoryStorage();
        isolated.values.set(PLANNING_STORAGE_KEY, canonicalBytes);
        await expect(invoke(createRepository(isolated, `no-locks-${index}`)))
          .rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
        expect(isolated.getItem(PLANNING_STORAGE_KEY)).toBe(canonicalBytes);
        expect(isolated.setAttempts).toBe(0);
      }
    } finally {
      if (descriptor) Object.defineProperty(navigator, "locks", descriptor);
      else Reflect.deleteProperty(navigator, "locks");
    }
  });

  it("fails browser writes closed when Web Locks access throws", async () => {
    const storage = new MemoryStorage();
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      get() { throw new Error("locks unavailable"); },
    });
    try {
      await expect(createRepository(storage, "throwing-locks").generate(generateRequest()))
        .rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
      expect(storage.getItem(PLANNING_STORAGE_KEY)).toBeNull();
      expect(storage.setAttempts).toBe(0);
    } finally {
      if (descriptor) Object.defineProperty(navigator, "locks", descriptor);
      else Reflect.deleteProperty(navigator, "locks");
    }
  });

  it("retains the per-storage mutex only outside a browser", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Reflect.deleteProperty(globalThis, "navigator");
    try {
      const storage = new MemoryStorage();
      const firstRepository = createRepository(storage, "server-first");
      const secondRepository = createRepository(storage, "server-second");
      const generated = await firstRepository.generate(generateRequest());
      const duplicate = eventRequest(generated.workspace, "mutation-server-duplicate", "completed");
      const writesBefore = storage.setAttempts;

      const [first, replayed] = await Promise.all([
        firstRepository.appendEvent(duplicate),
        secondRepository.appendEvent(duplicate),
      ]);

      expect(replayed).toEqual(first);
      expect(storage.setAttempts).toBe(writesBefore + 1);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    }
  });

  it("performs a final raw-byte recheck and preserves a cooperative external winner", async () => {
    const storage = new MemoryStorage();
    const repository = createRepository(storage, "optimistic");
    const generated = await repository.generate(generateRequest());
    const before = storage.getItem(PLANNING_STORAGE_KEY)!;
    const externalBytes = `${before} `;
    let planningReads = 0;
    storage.beforeGet = (key) => {
      if (key !== PLANNING_STORAGE_KEY) return;
      planningReads += 1;
      if (planningReads === 2) storage.values.set(PLANNING_STORAGE_KEY, externalBytes);
    };
    const writesBefore = storage.setAttempts;

    await expect(repository.appendEvent(eventRequest(generated.workspace, "mutation-optimistic", "completed")))
      .rejects.toMatchObject({ code: "CONFLICT" });

    storage.beforeGet = null;
    expect(storage.getItem(PLANNING_STORAGE_KEY)).toBe(externalBytes);
    expect(storage.setAttempts).toBe(writesBefore);
  });

  it("rejects an otherwise valid envelope over the conservative byte budget before writing", async () => {
    const storage = new MemoryStorage();
    const repository = createRepository(storage, "oversized");
    const generated = await repository.generate(generateRequest());
    const envelope = JSON.parse(storage.getItem(PLANNING_STORAGE_KEY)!) as {
      initialWorkspace?: PlanningWorkspace;
      workspace: PlanningWorkspace;
      mutationResults: Array<{ resultFingerprint: string }>;
    };
    if (!envelope.initialWorkspace) throw new Error("Expected canonical initial workspace");
    const sourcePath = envelope.initialWorkspace.pathVersions[0]!;
    const paths = [sourcePath, ...Array.from({ length: 499 }, (_, index) => ({
      ...sourcePath,
      id: `oversized-path-${String(index + 1).padStart(3, "0")}`,
    }))];
    envelope.initialWorkspace.pathVersions = paths.map((path) => structuredClone(path));
    envelope.workspace.pathVersions = paths.map((path) => structuredClone(path));
    const initialResult = planningMutationResultSchema.parse({
      outcome: "active",
      workspace: envelope.initialWorkspace,
      diff: null,
    });
    envelope.mutationResults[0]!.resultFingerprint = fingerprint(initialResult);
    const oversizedBytes = JSON.stringify(envelope);

    expect(new TextEncoder().encode(oversizedBytes).byteLength)
      .toBeGreaterThan(LOCAL_PLANNING_ENVELOPE_MAX_BYTES);
    expect(localPlanningEnvelopeSchema.safeParse(envelope).success).toBe(false);
    storage.values.set(PLANNING_STORAGE_KEY, oversizedBytes);
    storage.setCalls.length = 0;
    storage.setAttempts = 0;

    await expect(repository.appendEvent(eventRequest(generated.workspace, "mutation-after-oversized", "completed")))
      .rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
    expect(storage.getItem(PLANNING_STORAGE_KEY)).toBe(oversizedBytes);
    expect(storage.setAttempts).toBe(0);
  });

  it("accepts and discards candidates while retaining every prior plan and event row", async () => {
    const storage = new MemoryStorage();
    const legacyBytes = JSON.stringify(createDemoState());
    const offlineBytes = JSON.stringify([{ mutationId: "queued-v7-write" }]);
    storage.values.set(DEMO_STORAGE_KEY, legacyBytes);
    storage.values.set(OFFLINE_QUEUE_KEY, offlineBytes);
    const repository = createRepository(storage);
    const generated = await repository.generate(generateRequest());
    const proposed = await repository.appendEvent(eventRequest(generated.workspace, "mutation-delay", "delayed"));
    const candidate = proposed.workspace.pendingPlanVersionId!;
    const beforeAcceptPlanIds = proposed.workspace.planVersions.map(({ id }) => id);

    const accepted = await repository.accept({
      mutationId: "mutation-accept",
      baseVersionId: proposed.workspace.activePlanVersionId,
      candidatePlanVersionId: candidate,
    });

    expect(accepted.outcome).toBe("accepted");
    expect(accepted.workspace.activePlanVersionId).toBe(candidate);
    expect(accepted.workspace.pendingPlanVersionId).toBeNull();
    expect(accepted.workspace.planVersions.map(({ id }) => id)).toEqual(expect.arrayContaining(beforeAcceptPlanIds));
    expect(accepted.workspace.events.map(({ kind }) => kind).slice(0, 2)).toEqual(["delayed", "replan_accepted"]);

    const secondProposal = await repository.appendEvent(eventRequest(accepted.workspace, "mutation-skip", "skipped"));
    const secondCandidate = secondProposal.workspace.pendingPlanVersionId!;
    const historyPlanIds = secondProposal.workspace.planVersions.map(({ id }) => id);
    const historyEventIds = secondProposal.workspace.events.map(({ eventId }) => eventId);
    const discarded = await repository.discard({
      mutationId: "mutation-discard",
      baseVersionId: secondProposal.workspace.activePlanVersionId,
      candidatePlanVersionId: secondCandidate,
    });

    expect(discarded.outcome).toBe("discarded");
    expect(discarded.workspace.activePlanVersionId).toBe(accepted.workspace.activePlanVersionId);
    expect(discarded.workspace.pendingPlanVersionId).toBeNull();
    expect(discarded.workspace.planVersions.map(({ id }) => id)).toEqual(expect.arrayContaining(historyPlanIds));
    expect(discarded.workspace.events.slice(0, -1).map(({ eventId }) => eventId)).toEqual(historyEventIds);
    expect(discarded.workspace.events.at(-1)?.kind).toBe("replan_discarded");
    const envelope = JSON.parse(storage.getItem(PLANNING_STORAGE_KEY)!) as {
      eventStream: Array<{ sequence: number }>;
      nextSequence: number;
    };
    expect(envelope.eventStream.map(({ sequence }) => sequence)).toEqual([1, 2, 3, 4]);
    expect(envelope.nextSequence).toBe(5);
    expect(new Set(storage.setCalls.map(({ key }) => key))).toEqual(new Set([PLANNING_STORAGE_KEY]));
    expect(storage.removeCalls).toEqual([]);
    expect(storage.getItem(DEMO_STORAGE_KEY)).toBe(legacyBytes);
    expect(storage.getItem(OFFLINE_QUEUE_KEY)).toBe(offlineBytes);
  });

  it("strict-clones request data, repository results, and loaded persisted state", async () => {
    const storage = new MemoryStorage();
    const repository = createRepository(storage);
    const input = generateRequest();
    const result = await repository.generate(input);
    const originalLevel = result.workspace.audit.answers[0]!.level;

    input.audit.answers[0]!.level = "unseen";
    result.workspace.audit.answers[0]!.level = "independent";
    const firstLoad = await repository.load();
    expect(firstLoad?.audit.answers[0]?.level).toBe(originalLevel);

    firstLoad!.audit.answers[0]!.level = "conceptual";
    const secondLoad = await repository.load();
    expect(secondLoad?.audit.answers[0]?.level).toBe(originalLevel);
  });

  it("stores bounded import progress independently per user and workspace fingerprint", async () => {
    const storage = new MemoryStorage();
    const repository = createRepository(storage, "import-progress");
    await repository.generate(generateRequest());
    const source = await repository.readImportSource();
    if (!source) throw new Error("Expected a local import source");
    const writesBefore = storage.setAttempts;

    expect(source.initialWorkspace.events).toEqual([]);
    expect(source.workspaceFingerprint).toMatch(/^p2-[0-9a-f]{32}$/u);
    expect(await repository.readImportProgress("user-one", source.workspaceFingerprint)).toBeNull();

    await repository.updateImportProgress(source.workspaceFingerprint, {
      userId: "user-one",
      initialMutationId: source.generationMutationId,
      lastImportedSequence: 0,
      completed: false,
    });
    await repository.updateImportProgress(source.workspaceFingerprint, {
      userId: "user-two",
      initialMutationId: source.generationMutationId,
      lastImportedSequence: 0,
      completed: true,
    });

    expect(storage.setAttempts).toBe(writesBefore + 2);
    expect(await repository.readImportProgress("user-one", source.workspaceFingerprint))
      .toMatchObject({ userId: "user-one", completed: false });
    expect(await repository.readImportProgress("user-two", source.workspaceFingerprint))
      .toMatchObject({ userId: "user-two", completed: true });
    expect(JSON.parse(storage.getItem(PLANNING_STORAGE_KEY)!).eventStream).toEqual([]);
  });

  it("loads a pre-import-progress v2 envelope and fails progress writes closed without Web Locks", async () => {
    const storage = new MemoryStorage();
    const repository = createRepository(storage, "progress-compat");
    const generated = await repository.generate(generateRequest());
    const legacyEnvelope = JSON.parse(storage.getItem(PLANNING_STORAGE_KEY)!) as Record<string, unknown>;
    delete legacyEnvelope.importProgress;
    const legacyBytes = JSON.stringify(legacyEnvelope);
    storage.values.set(PLANNING_STORAGE_KEY, legacyBytes);
    storage.setAttempts = 0;
    expect(await repository.load()).toEqual(generated.workspace);

    const descriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    try {
      await expect(repository.updateImportProgress(fingerprint(generated.workspace), {
        userId: "user-one",
        initialMutationId: "mutation-generate",
        lastImportedSequence: 0,
        completed: false,
      })).rejects.toMatchObject({ code: "PLANNING_UNAVAILABLE" });
      expect(storage.getItem(PLANNING_STORAGE_KEY)).toBe(legacyBytes);
      expect(storage.setAttempts).toBe(0);
    } finally {
      if (descriptor) Object.defineProperty(navigator, "locks", descriptor);
      else Reflect.deleteProperty(navigator, "locks");
    }
  });
});
