import { z } from "zod";
import type { ProofItem } from "../domain/learning";
import type { DemoState, SetupAnswers } from "../lib/demo-store";

export const setupAnswersSchema: z.ZodType<SetupAnswers> = z.object({
  roleId: z.string().trim().min(1).max(160),
  level: z.enum(["new", "beginner", "intermediate", "advanced"]),
  weeklyMinutes: z.number().int().min(30).max(2400),
  targetWeeks: z.number().int().min(4).max(52),
}).strict();

export const proofItemSchema: z.ZodType<ProofItem> = z.object({
  id: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(240),
  kind: z.enum(["completion", "commit", "project", "note", "upload"]),
  skillIds: z.array(z.string().trim().min(1).max(120)).max(32),
  verified: z.boolean(),
}).strict();

export const demoStateSchema: z.ZodType<DemoState> = z.object({
  setup: setupAnswersSchema,
  completedUnitIds: z.array(z.string().trim().min(1).max(160)).max(2000),
  proofs: z.array(proofItemSchema).max(200),
}).strict();

export const migrationRequestSchema = z.object({
  migrationId: z.string().trim().min(8).max(128),
  consent: z.literal(true),
  state: demoStateSchema,
  conflictResolution: z.enum(["reject", "archive-import", "activate-import"]).default("reject"),
}).strict();

export const migrationResultSchema = z.object({
  migrationId: z.string().min(1),
  status: z.enum(["imported", "already-imported", "conflict"]),
  activeGoalId: z.string().min(1).nullable(),
  importedCompletionCount: z.number().int().nonnegative(),
  importedProofCount: z.number().int().nonnegative(),
  availableResolutions: z.array(z.enum(["archive-import", "activate-import"])).max(2),
}).strict();

export const workspaceMutationSchema = z.object({
  mutationId: z.string().trim().min(8).max(128),
  setup: setupAnswersSchema,
}).strict();

export const completionMutationSchema = z.object({
  mutationId: z.string().trim().min(8).max(128),
  unitId: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(240),
  deliverable: z.string().trim().min(1).max(500),
  skillIds: z.array(z.string().trim().min(1).max(120)).max(32),
}).strict();

export const cloudSnapshotSchema = z.object({
  state: demoStateSchema,
  activeGoalId: z.string().min(1),
  revision: z.string().min(1),
}).strict();

export const cloudWorkspaceResponseSchema = z.object({
  snapshot: cloudSnapshotSchema.nullable(),
}).strict();

export type SetupAnswersInput = z.infer<typeof setupAnswersSchema>;
export type DemoStateInput = z.infer<typeof demoStateSchema>;
export type MigrationRequest = z.infer<typeof migrationRequestSchema>;
export type MigrationResult = z.infer<typeof migrationResultSchema>;
export type WorkspaceMutation = z.infer<typeof workspaceMutationSchema>;
export type CompletionMutation = z.infer<typeof completionMutationSchema>;
export type CloudSnapshot = z.infer<typeof cloudSnapshotSchema>;

export type RepositorySnapshot = CloudSnapshot & {
  ownerId: string;
};

export type RepositoryMigrationResult = MigrationResult & {
  ownerId: string;
};
