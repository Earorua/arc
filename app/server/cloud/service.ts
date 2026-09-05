import {
  cloudSnapshotSchema,
  completionMutationSchema,
  migrationRequestSchema,
  migrationResultSchema,
  workspaceMutationSchema,
  type CloudSnapshot,
  type MigrationResult,
  type RepositoryMigrationResult,
  type RepositorySnapshot,
} from "../../contracts/cloud-state";
import type { CloudRepository } from "./repository";

export class CloudOwnershipError extends Error {
  readonly code = "OWNERSHIP_MISMATCH";

  constructor() {
    super("Cloud repository returned state outside the authenticated owner scope.");
    this.name = "CloudOwnershipError";
  }
}

function requireUserId(userId: string): string {
  const value = userId.trim();
  if (!value) throw new CloudOwnershipError();
  return value;
}

function assertOwner(userId: string, owned: { ownerId: string }): void {
  if (owned.ownerId !== userId) throw new CloudOwnershipError();
}

function publicSnapshot(userId: string, snapshot: RepositorySnapshot): CloudSnapshot {
  assertOwner(userId, snapshot);
  return cloudSnapshotSchema.parse({
    state: snapshot.state,
    activeGoalId: snapshot.activeGoalId,
    revision: snapshot.revision,
  });
}

function publicMigrationResult(userId: string, result: RepositoryMigrationResult): MigrationResult {
  assertOwner(userId, result);
  return migrationResultSchema.parse({
    migrationId: result.migrationId,
    status: result.status,
    activeGoalId: result.activeGoalId,
    importedCompletionCount: result.importedCompletionCount,
    importedProofCount: result.importedProofCount,
    availableResolutions: result.availableResolutions,
  });
}

export class CloudService {
  constructor(private readonly repository: CloudRepository) {}

  async getWorkspace(rawUserId: string): Promise<CloudSnapshot | null> {
    const userId = requireUserId(rawUserId);
    const snapshot = await this.repository.getSnapshot(userId);
    return snapshot ? publicSnapshot(userId, snapshot) : null;
  }

  async importLocalState(rawUserId: string, input: unknown): Promise<MigrationResult> {
    const userId = requireUserId(rawUserId);
    const request = migrationRequestSchema.parse(input);
    const replay = await this.repository.getMigrationResult(userId, request.migrationId);

    if (replay) {
      const result = publicMigrationResult(userId, replay);
      return migrationResultSchema.parse({ ...result, status: "already-imported" });
    }

    const current = await this.repository.getSnapshot(userId);
    if (current) {
      const snapshot = publicSnapshot(userId, current);
      const roleConflicts = snapshot.state.setup.roleId !== request.state.setup.roleId;
      if (roleConflicts && request.conflictResolution === "reject") {
        return migrationResultSchema.parse({
          migrationId: request.migrationId,
          status: "conflict",
          activeGoalId: snapshot.activeGoalId,
          importedCompletionCount: 0,
          importedProofCount: 0,
          availableResolutions: ["archive-import", "activate-import"],
        });
      }
    }

    return publicMigrationResult(userId, await this.repository.importState(userId, request));
  }

  async saveSetup(rawUserId: string, input: unknown): Promise<CloudSnapshot> {
    const userId = requireUserId(rawUserId);
    const request = workspaceMutationSchema.parse(input);
    return publicSnapshot(
      userId,
      await (request.intent
        ? this.repository.saveSetup(userId, request.mutationId, request.setup, request.intent)
        : this.repository.saveSetup(userId, request.mutationId, request.setup)),
    );
  }

  async recordCompletion(rawUserId: string, input: unknown): Promise<CloudSnapshot> {
    const userId = requireUserId(rawUserId);
    const request = completionMutationSchema.parse(input);
    return publicSnapshot(userId, await this.repository.recordCompletion(userId, request));
  }
}
