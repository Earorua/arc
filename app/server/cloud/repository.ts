import type {
  CompletionMutation,
  MigrationRequest,
  RepositoryMigrationResult,
  RepositorySnapshot,
  SetupAnswersInput,
} from "../../contracts/cloud-state";

export interface CloudRepository {
  getSnapshot(userId: string): Promise<RepositorySnapshot | null>;
  getMigrationResult(userId: string, migrationId: string): Promise<RepositoryMigrationResult | null>;
  importState(userId: string, request: MigrationRequest): Promise<RepositoryMigrationResult>;
  saveSetup(userId: string, mutationId: string, setup: SetupAnswersInput): Promise<RepositorySnapshot>;
  recordCompletion(userId: string, request: CompletionMutation): Promise<RepositorySnapshot>;
}
