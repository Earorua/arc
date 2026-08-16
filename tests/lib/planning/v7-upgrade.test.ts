import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RepositoryMigrationResult, RepositorySnapshot } from "../../../app/contracts/cloud-state";
import { flagshipRole } from "../../../app/data/flagship-role";
import {
  completeDemoUnit,
  createDemoState,
  DEMO_STORAGE_KEY,
  loadDemoState,
  mergeSetup,
  type DemoState,
} from "../../../app/lib/demo-store";
import {
  PLANNING_STORAGE_KEY,
  upgradeV7State,
} from "../../../app/lib/planning/local-repository";
import type { CloudRepository } from "../../../app/server/cloud/repository";
import { CloudService } from "../../../app/server/cloud/service";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  failWrites = false;
  setAttempts = 0;
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void {
    this.setAttempts += 1;
    if (this.failWrites) throw new Error("quota unavailable: private detail");
    this.values.set(key, value);
  }
}

class ReadOnlyCloudRepository implements CloudRepository {
  constructor(readonly snapshot: RepositorySnapshot) {}
  async getSnapshot(userId: string) { return userId === this.snapshot.ownerId ? structuredClone(this.snapshot) : null; }
  async getMigrationResult() { return null; }
  async importState(): Promise<RepositoryMigrationResult> { throw new Error("not used"); }
  async saveSetup(): Promise<RepositorySnapshot> { throw new Error("not used"); }
  async recordCompletion(): Promise<RepositorySnapshot> { throw new Error("not used"); }
}

function customState(): DemoState {
  return mergeSetup(createDemoState(), {
    roleId: "staff-design-systems-engineer",
    level: "advanced",
    weeklyMinutes: 735,
    targetWeeks: 11,
  });
}

function completedState(): DemoState {
  return completeDemoUnit(createDemoState(), flagshipRole.today);
}

function proofState(): DemoState {
  const state = customState();
  state.proofs = [{
    id: "legacy-proof-note",
    title: "Legacy learner note",
    kind: "note",
    skillIds: ["web-foundations"],
    verified: false,
  }];
  return state;
}

describe("v7 adaptive-planning upgrade boundary", () => {
  let restoreLocks: (() => void) | undefined;

  beforeEach(() => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request: async <T>(_name: string, _options: unknown, callback: () => T | Promise<T>) => callback() },
    });
    restoreLocks = () => {
      if (descriptor) Object.defineProperty(navigator, "locks", descriptor);
      else Reflect.deleteProperty(navigator, "locks");
    };
  });

  afterEach(() => restoreLocks?.());

  it.each([
    ["default", createDemoState()],
    ["custom role", customState()],
    ["meaningful completion", completedState()],
    ["Proof item", proofState()],
  ])("preserves the exact %s v7 bytes and creates only an unverified setup draft", async (_label, state) => {
    const storage = new MemoryStorage();
    const legacyBytes = JSON.stringify(state);
    storage.values.set(DEMO_STORAGE_KEY, legacyBytes);

    const result = await upgradeV7State(storage);

    expect(result.migrated).toBe(true);
    expect(storage.getItem(DEMO_STORAGE_KEY)).toBe(legacyBytes);
    expect(loadDemoState(storage)).toEqual(state);
    expect(result.fallback).toEqual(state);
    expect(result.envelope).toMatchObject({
      workspace: null,
      initialWorkspace: null,
      generationMutationId: null,
      eventStream: [],
      setupDraft: {
        roleId: state.setup.roleId,
        legacyLevel: state.setup.level,
        weeklyMinutes: state.setup.weeklyMinutes,
        targetWeeks: state.setup.targetWeeks,
        auditAnswers: [],
      },
    });
    expect(JSON.stringify(result.envelope)).not.toMatch(/"verified"\s*:\s*true/iu);
    expect(result.envelope?.setupDraft?.auditAnswers).toEqual([]);
  });

  it.each([
    ["default", createDemoState()],
    ["custom", customState()],
    ["completion", completedState()],
    ["Proof", proofState()],
  ])("keeps an existing cloud %s v7 snapshot readable and byte-for-byte unchanged", async (_label, state) => {
    const snapshot: RepositorySnapshot = {
      ownerId: "v7-owner",
      state: structuredClone(state),
      activeGoalId: "v7-goal",
      revision: "v7-revision",
    };
    const repository = new ReadOnlyCloudRepository(snapshot);
    const service = new CloudService(repository);

    const read = await service.getWorkspace("v7-owner");

    expect(read).toEqual({ state, activeGoalId: "v7-goal", revision: "v7-revision" });
    expect(repository.snapshot).toEqual(snapshot);
  });

  it("falls back to readable v7 Today, Path, and Proof state after malformed v2 bytes or a failed envelope write", async () => {
    const state = completedState();
    state.proofs.push({
      id: "legacy-project",
      title: "Readable legacy project",
      kind: "project",
      skillIds: ["web-foundations"],
      verified: false,
    });
    const legacyBytes = JSON.stringify(state);

    const malformed = new MemoryStorage();
    malformed.values.set(DEMO_STORAGE_KEY, legacyBytes);
    malformed.values.set(PLANNING_STORAGE_KEY, "{private malformed envelope");
    const malformedResult = await upgradeV7State(malformed);
    expect(malformedResult).toMatchObject({ migrated: false, envelope: null, fallback: state });
    expect(loadDemoState(malformed)).toEqual(state);
    expect(malformed.getItem(DEMO_STORAGE_KEY)).toBe(legacyBytes);

    const failed = new MemoryStorage();
    failed.values.set(DEMO_STORAGE_KEY, legacyBytes);
    failed.failWrites = true;
    const failedResult = await upgradeV7State(failed);
    expect(failedResult).toMatchObject({ migrated: false, envelope: null, fallback: state });
    expect(failed.setAttempts).toBe(1);
    expect(failed.getItem(PLANNING_STORAGE_KEY)).toBeNull();
    expect(loadDemoState(failed)).toEqual(state);
    expect(failed.getItem(DEMO_STORAGE_KEY)).toBe(legacyBytes);
  });
});
