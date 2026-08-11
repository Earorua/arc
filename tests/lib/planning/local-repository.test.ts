import { describe, expect, it, vi } from "vitest";
import type { GeneratePlanningRequest, PlanningEventRequest } from "../../../app/contracts/planning-api";
import { PLANNING_SCHEMA_VERSION, type PlanningWorkspace } from "../../../app/contracts/planning";
import { flagshipBlueprint } from "../../../app/data/flagship-blueprint";
import { createDemoState, DEMO_STORAGE_KEY, mergeSetup } from "../../../app/lib/demo-store";
import {
  createLocalPlanningRepository,
  PLANNING_STORAGE_KEY,
  upgradeV7State,
} from "../../../app/lib/planning/local-repository";

const OFFLINE_QUEUE_KEY = "arc-offline-queue-v1";
const PLANNING_DATE = "2026-08-12";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  readonly setCalls: Array<{ key: string; value: string }> = [];
  readonly removeCalls: string[] = [];
  setAttempts = 0;
  failSet = false;

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
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

describe("guest adaptive planning repository", () => {
  it("upgrades a strict v7 snapshot without overwriting v7 or the offline queue", () => {
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

    const result = upgradeV7State(storage);

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

  it("returns a v7-compatible fallback without replacing malformed v2 bytes or partially writing", () => {
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

    const malformed = upgradeV7State(storage);

    expect(malformed).toMatchObject({ migrated: false, envelope: null, fallback: legacy });
    expect(storage.getItem(PLANNING_STORAGE_KEY)).toBe(malformedV2);
    expect(storage.setCalls).toHaveLength(0);
    expect(storage.setAttempts).toBe(0);

    storage.values.delete(PLANNING_STORAGE_KEY);
    storage.failSet = true;
    const failedWrite = upgradeV7State(storage);
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
      nextSequence: 1,
      eventStream: [],
    });
    expect(await repository.load()).toEqual(result.workspace);
    expect(storage.getItem(DEMO_STORAGE_KEY)).toBe(JSON.stringify(createDemoState()));
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
    const generated = await repository.generate(generateRequest());
    const envelope = JSON.parse(storage.getItem(PLANNING_STORAGE_KEY)!) as {
      mutationResults: Array<{ mutationId: string; resultJson: string }>;
    };
    const resultJson = JSON.stringify(generated);
    envelope.mutationResults = Array.from({ length: 500 }, (_, index) => ({
      mutationId: `seed-${String(index + 1).padStart(3, "0")}`,
      resultJson,
    }));
    storage.values.set(PLANNING_STORAGE_KEY, JSON.stringify(envelope));
    storage.setCalls.length = 0;
    storage.setAttempts = 0;

    await repository.appendEvent(eventRequest(generated.workspace, "mutation-after-cap", "completed"));

    const persisted = JSON.parse(storage.getItem(PLANNING_STORAGE_KEY)!) as {
      mutationResults: Array<{ mutationId: string }>;
    };
    expect(persisted.mutationResults).toHaveLength(500);
    expect(persisted.mutationResults[0]?.mutationId).toBe("seed-002");
    expect(persisted.mutationResults.at(-1)?.mutationId).toBe("mutation-after-cap");
    expect(persisted.mutationResults.some(({ mutationId }) => mutationId === "seed-001")).toBe(false);
    expect(storage.setAttempts).toBe(1);
    expect(storage.setCalls).toHaveLength(1);
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
});
