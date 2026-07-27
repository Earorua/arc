import { describe, expect, it } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";
import { completeDemoUnit, createDemoState, mergeSetup } from "../../app/lib/demo-store";
import {
  CloudOwnershipError,
  CloudService,
} from "../../app/server/cloud/service";
import type { CloudRepository } from "../../app/server/cloud/repository";
import type {
  CompletionMutation,
  MigrationRequest,
  RepositoryMigrationResult,
  RepositorySnapshot,
} from "../../app/contracts/cloud-state";

class InMemoryCloudRepository implements CloudRepository {
  readonly snapshots = new Map<string, RepositorySnapshot>();
  readonly migrations = new Map<string, RepositoryMigrationResult>();
  readonly completionMutations = new Set<string>();
  importCalls = 0;

  async getSnapshot(userId: string) {
    return this.snapshots.get(userId) ?? null;
  }

  async getMigrationResult(userId: string, migrationId: string) {
    return this.migrations.get(`${userId}:${migrationId}`) ?? null;
  }

  async importState(userId: string, request: MigrationRequest) {
    this.importCalls += 1;
    const current = this.snapshots.get(userId);
    const importedGoalId = `goal-${request.migrationId}`;

    if (!current || request.conflictResolution === "activate-import") {
      this.snapshots.set(userId, {
        ownerId: userId,
        state: structuredClone(request.state),
        activeGoalId: importedGoalId,
        revision: `revision-${this.importCalls}`,
      });
    }

    const result: RepositoryMigrationResult = {
      ownerId: userId,
      migrationId: request.migrationId,
      status: "imported",
      activeGoalId: request.conflictResolution === "archive-import" && current
        ? current.activeGoalId
        : importedGoalId,
      importedCompletionCount: request.state.completedUnitIds.length,
      importedProofCount: request.state.proofs.length,
      availableResolutions: [],
    };
    this.migrations.set(`${userId}:${request.migrationId}`, result);
    return result;
  }

  async saveSetup(userId: string, _mutationId: string, setup: MigrationRequest["state"]["setup"]) {
    const current = this.snapshots.get(userId);
    if (!current) throw new Error("workspace missing");
    const next = { ...current, state: mergeSetup(current.state, setup), revision: `${current.revision}-setup` };
    this.snapshots.set(userId, next);
    return next;
  }

  async recordCompletion(userId: string, request: CompletionMutation) {
    const current = this.snapshots.get(userId);
    if (!current) throw new Error("workspace missing");
    const key = `${userId}:${request.mutationId}`;
    if (this.completionMutations.has(key)) return current;

    this.completionMutations.add(key);
    const next = {
      ...current,
      state: completeDemoUnit(current.state, {
        id: request.unitId,
        title: request.title,
        deliverable: request.deliverable,
        skillIds: request.skillIds,
        minutes: 1,
        steps: [],
      }),
      revision: `${current.revision}-complete`,
    };
    this.snapshots.set(userId, next);
    return next;
  }
}

function migrationRequest(overrides: Partial<MigrationRequest> = {}): MigrationRequest {
  return {
    migrationId: "migration-1",
    consent: true,
    state: completeDemoUnit(createDemoState(), flagshipRole.today),
    conflictResolution: "reject",
    ...overrides,
  };
}

describe("CloudService", () => {
  it("requires explicit import consent before writing local state", async () => {
    const repository = new InMemoryCloudRepository();
    const service = new CloudService(repository);
    const request = migrationRequest();
    const withoutConsent = {
      migrationId: request.migrationId,
      state: request.state,
      conflictResolution: request.conflictResolution,
    };

    await expect(service.importLocalState("user-1", withoutConsent)).rejects.toThrow();
    expect(repository.importCalls).toBe(0);
  });

  it("imports validated local progress after explicit consent", async () => {
    const repository = new InMemoryCloudRepository();
    const service = new CloudService(repository);

    const result = await service.importLocalState("user-1", migrationRequest());

    expect(result.importedCompletionCount).toBe(1);
    expect(result.importedProofCount).toBe(1);
    expect(result).not.toHaveProperty("ownerId");
    expect((await service.getWorkspace("user-1"))?.state.completedUnitIds).toEqual([flagshipRole.today.id]);
  });

  it("returns the first result when a migration ID is replayed", async () => {
    const repository = new InMemoryCloudRepository();
    const service = new CloudService(repository);
    const request = migrationRequest();
    const first = await service.importLocalState("user-1", request);

    const replay = await service.importLocalState("user-1", request);

    expect(replay).toEqual({ ...first, status: "already-imported" });
    expect(repository.importCalls).toBe(1);
  });

  it("does not silently replace an existing active cloud goal", async () => {
    const repository = new InMemoryCloudRepository();
    const cloudState = createDemoState();
    cloudState.setup.roleId = "cloud-role";
    repository.snapshots.set("user-1", {
      ownerId: "user-1",
      state: cloudState,
      activeGoalId: "goal-cloud",
      revision: "revision-cloud",
    });
    const service = new CloudService(repository);

    const result = await service.importLocalState("user-1", migrationRequest());

    expect(result).toMatchObject({
      status: "conflict",
      activeGoalId: "goal-cloud",
      availableResolutions: ["archive-import", "activate-import"],
    });
    expect(repository.importCalls).toBe(0);
    expect((await service.getWorkspace("user-1"))?.state.setup.roleId).toBe("cloud-role");
  });

  it("records a repeated completion mutation exactly once", async () => {
    const repository = new InMemoryCloudRepository();
    repository.snapshots.set("user-1", {
      ownerId: "user-1",
      state: createDemoState(),
      activeGoalId: "goal-1",
      revision: "revision-1",
    });
    const service = new CloudService(repository);
    const request = {
      mutationId: "mutation-complete-1",
      unitId: flagshipRole.today.id,
      title: flagshipRole.today.title,
      deliverable: flagshipRole.today.deliverable,
      skillIds: flagshipRole.today.skillIds,
    };

    await service.recordCompletion("user-1", request);
    const replay = await service.recordCompletion("user-1", request);

    expect(replay.state.completedUnitIds).toEqual([flagshipRole.today.id]);
    expect(replay.state.proofs).toHaveLength(1);
  });

  it("rejects a repository snapshot owned by another user", async () => {
    const repository = new InMemoryCloudRepository();
    repository.snapshots.set("user-1", {
      ownerId: "user-2",
      state: createDemoState(),
      activeGoalId: "goal-foreign",
      revision: "revision-foreign",
    });
    const service = new CloudService(repository);

    await expect(service.getWorkspace("user-1")).rejects.toBeInstanceOf(CloudOwnershipError);
  });
});
