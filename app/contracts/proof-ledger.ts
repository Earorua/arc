import { z } from "zod";
import { publicHttpsUrlSchema as basePublicHttpsUrlSchema } from "./intelligence";

export const PROOF_LEDGER_SCHEMA_VERSION = "2026.08.1" as const;
export const MAX_PROOF_LEDGER_WORKSPACE_BYTES = 4 * 1024 * 1024;

const idSchema = z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const timestampSchema = z.string().max(64).datetime({ offset: true });
const publicHttpsUrlSchema = basePublicHttpsUrlSchema.max(2048);
const validatorKeySchema = z.string().max(128)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u);
const reasonCodeSchema = z.string().max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

function issueDuplicates(
  values: readonly string[],
  context: z.RefinementCtx,
  path: (string | number)[],
  message: string,
) {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", path, message });
  }
}

export const proofArtifactKindSchema = z.enum([
  "repository",
  "commit",
  "pull_request",
  "deployment",
  "api",
  "document",
  "screenshot",
  "test_report",
  "code",
  "upload",
  "reflection",
]);

export const proofReviewStateSchema = z.enum([
  "draft",
  "pending_review",
  "demonstrated",
  "verified",
  "rejected",
  "withdrawn",
  "superseded",
]);

export const skillEvidenceStatusSchema = z.enum([
  "exploring",
  "practicing",
  "demonstrated",
  "verified",
]);

export const proofVisibilitySchema = z.enum(["private", "public"]);
export const deterministicReviewOutcomeSchema = z.enum(["passed", "failed", "unavailable"]);
export const proofReviewEventKindSchema = z.enum([
  "drafted",
  "submitted",
  "structural_passed",
  "validator_passed",
  "validator_failed",
  "validator_unavailable",
  "rejected",
  "withdrawn",
  "superseded",
  "visibility_changed",
]);
export const proofProjectionAudienceSchema = z.enum(["internal", "public"]);
export const proofMutationIntentSchema = z.enum(["save_draft", "submit"]);

export const proofVersionSchema = z.object({
  id: idSchema,
  proofId: idSchema,
  versionNumber: z.number().int().positive().max(10_000),
  schemaVersion: z.literal(PROOF_LEDGER_SCHEMA_VERSION),
  dailyUnitId: idSchema.nullable(),
  title: z.string().trim().min(1).max(180),
  kind: proofArtifactKindSchema,
  summary: z.string().trim().min(1).max(2000),
  artifactUrl: publicHttpsUrlSchema.nullable(),
  assetId: idSchema.nullable(),
  skillIds: z.array(idSchema).min(1).max(32),
  completionCriteria: z.array(z.string().trim().min(1).max(500)).max(8),
  visibility: proofVisibilitySchema,
  createdAt: timestampSchema,
  supersedesVersionId: idSchema.nullable(),
}).strict().superRefine((version, context) => {
  issueDuplicates(version.skillIds, context, ["skillIds"], "Skill IDs must be unique");
  issueDuplicates(
    version.completionCriteria,
    context,
    ["completionCriteria"],
    "Completion criteria must be unique",
  );
  if (version.artifactUrl !== null && version.assetId !== null) {
    context.addIssue({
      code: "custom",
      path: ["assetId"],
      message: "A proof version cannot bind both a URL and an asset",
    });
  }
  if ((version.versionNumber === 1) !== (version.supersedesVersionId === null)) {
    context.addIssue({
      code: "custom",
      path: ["supersedesVersionId"],
      message: "Only the first version may omit its superseded version",
    });
  }
});

export const proofReviewEventSchema = z.object({
  id: idSchema,
  proofId: idSchema,
  versionId: idSchema,
  sequence: z.number().int().positive().max(100_000),
  mutationId: idSchema,
  kind: proofReviewEventKindSchema,
  stateAfter: proofReviewStateSchema,
  visibilityAfter: proofVisibilitySchema,
  validatorKey: validatorKeySchema.nullable(),
  outcome: deterministicReviewOutcomeSchema.nullable(),
  reasonCodes: z.array(reasonCodeSchema).max(32),
  occurredAt: timestampSchema,
}).strict().superRefine((event, context) => {
  issueDuplicates(event.reasonCodes, context, ["reasonCodes"], "Reason codes must be unique");
  const validatorEvent = event.kind === "validator_passed"
    || event.kind === "validator_failed"
    || event.kind === "validator_unavailable";
  if (validatorEvent !== (event.validatorKey !== null)) {
    context.addIssue({
      code: "custom",
      path: ["validatorKey"],
      message: "Only validator events carry a validator key",
    });
  }
  const expected = event.kind === "visibility_changed" ? null : {
    drafted: { state: "draft", outcome: null },
    submitted: { state: "pending_review", outcome: null },
    structural_passed: { state: "demonstrated", outcome: "passed" },
    validator_passed: { state: "verified", outcome: "passed" },
    validator_failed: { state: "rejected", outcome: "failed" },
    validator_unavailable: { state: "demonstrated", outcome: "unavailable" },
    rejected: { state: "rejected", outcome: null },
    withdrawn: { state: "withdrawn", outcome: null },
    superseded: { state: "superseded", outcome: null },
  }[event.kind];
  if (expected && (event.stateAfter !== expected.state || event.outcome !== expected.outcome)) {
    context.addIssue({
      code: "custom",
      path: ["stateAfter"],
      message: "Review kind, state, and outcome must form a valid transition",
    });
  }
});

export const skillEvidenceProjectionSchema = z.object({
  skillId: idSchema,
  audience: proofProjectionAudienceSchema,
  status: skillEvidenceStatusSchema,
  completedUnitIds: z.array(idSchema).max(2000),
  strongestProofId: idSchema.nullable(),
  strongestVersionId: idSchema.nullable(),
  latestUsedAt: timestampSchema.nullable(),
}).strict().superRefine((projection, context) => {
  issueDuplicates(
    projection.completedUnitIds,
    context,
    ["completedUnitIds"],
    "Completed unit IDs must be unique",
  );
  if ((projection.strongestProofId === null) !== (projection.strongestVersionId === null)) {
    context.addIssue({
      code: "custom",
      path: ["strongestVersionId"],
      message: "Strongest proof and version IDs must be present together",
    });
  }
});

export const proofLedgerWorkspaceSchema = z.object({
  id: idSchema,
  goalId: idSchema,
  schemaVersion: z.literal(PROOF_LEDGER_SCHEMA_VERSION),
  revision: z.number().int().min(0),
  versions: z.array(proofVersionSchema).max(5000),
  reviews: z.array(proofReviewEventSchema).max(20_000),
  projections: z.array(skillEvidenceProjectionSchema).max(256),
}).strict().superRefine((workspace, context) => {
  issueDuplicates(workspace.versions.map(({ id }) => id), context, ["versions"], "Version IDs must be unique");
  issueDuplicates(
    workspace.versions.map(({ proofId, versionNumber }) => `${proofId}:${versionNumber}`),
    context,
    ["versions"],
    "Proof version numbers must be unique",
  );
  issueDuplicates(workspace.reviews.map(({ id }) => id), context, ["reviews"], "Review IDs must be unique");
  issueDuplicates(
    workspace.reviews.map(({ proofId, sequence }) => `${proofId}:${sequence}`),
    context,
    ["reviews"],
    "Review sequences must be unique within a proof",
  );
  issueDuplicates(
    workspace.projections.map(({ audience, skillId }) => `${audience}:${skillId}`),
    context,
    ["projections"],
    "Skill projections must be unique within an audience",
  );

  const versions = new Map(workspace.versions.map((version) => [version.id, version]));
  workspace.versions.forEach((version, index) => {
    if (version.supersedesVersionId === null) return;
    const previous = versions.get(version.supersedesVersionId);
    if (!previous
      || previous.proofId !== version.proofId
      || previous.versionNumber >= version.versionNumber) {
      context.addIssue({
        code: "custom",
        path: ["versions", index, "supersedesVersionId"],
        message: "A revision must supersede an earlier version of the same proof",
      });
    }
  });
  workspace.reviews.forEach((review, index) => {
    const version = versions.get(review.versionId);
    if (!version || version.proofId !== review.proofId) {
      context.addIssue({
        code: "custom",
        path: ["reviews", index, "versionId"],
        message: "A review must resolve to its proof version",
      });
    }
  });
  workspace.projections.forEach((projection, index) => {
    if (projection.strongestVersionId === null) return;
    const version = versions.get(projection.strongestVersionId);
    if (!version || version.proofId !== projection.strongestProofId) {
      context.addIssue({
        code: "custom",
        path: ["projections", index, "strongestVersionId"],
        message: "Strongest evidence must resolve to its proof version",
      });
    }
  });
});

const proofMutationBodyShape = {
  mutationId: idSchema,
  baseRevision: z.number().int().min(0),
  intent: proofMutationIntentSchema,
  validatorKey: validatorKeySchema.nullable(),
  dailyUnitId: idSchema.nullable(),
  title: z.string().trim().min(1).max(180),
  kind: proofArtifactKindSchema,
  summary: z.string().trim().min(1).max(2000),
  artifactUrl: publicHttpsUrlSchema.nullable(),
  assetId: idSchema.nullable(),
  skillIds: z.array(idSchema).min(1).max(32),
  completionCriteria: z.array(z.string().trim().min(1).max(500)).max(8),
  visibility: proofVisibilitySchema,
} as const;

const proofMutationBodySchema = z.object(proofMutationBodyShape).strict()
  .superRefine((request, context) => {
    issueDuplicates(request.skillIds, context, ["skillIds"], "Skill IDs must be unique");
    issueDuplicates(
      request.completionCriteria,
      context,
      ["completionCriteria"],
      "Completion criteria must be unique",
    );
    if (request.artifactUrl !== null && request.assetId !== null) {
      context.addIssue({
        code: "custom",
        path: ["assetId"],
        message: "A proof request cannot bind both a URL and an asset",
      });
    }
  });

export const createProofRequestSchema = proofMutationBodySchema;
export const reviseProofRequestSchema = proofMutationBodySchema;
export const withdrawProofRequestSchema = z.object({
  mutationId: idSchema,
  baseRevision: z.number().int().min(0),
}).strict();
export const setProofVisibilityRequestSchema = withdrawProofRequestSchema.extend({
  visibility: proofVisibilitySchema,
}).strict();

export const proofLedgerMutationResultSchema = z.object({
  outcome: z.enum(["draft", "demonstrated", "verified", "rejected", "withdrawn", "updated"]),
  workspace: proofLedgerWorkspaceSchema,
}).strict();

export function parseProofLedgerWorkspaceAtRepositoryBoundary(input: unknown): ProofLedgerWorkspace {
  let serialized: string;
  try {
    serialized = typeof input === "string" ? input : JSON.stringify(input);
  } catch {
    throw new Error("Proof ledger workspace must be serializable");
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_PROOF_LEDGER_WORKSPACE_BYTES) {
    throw new Error("Proof ledger workspace exceeds four MiB");
  }
  let value = input;
  if (typeof input === "string") {
    try { value = JSON.parse(input) as unknown; }
    catch { throw new Error("Proof ledger workspace JSON is invalid"); }
  }
  return proofLedgerWorkspaceSchema.parse(value);
}

export type ProofArtifactKind = z.infer<typeof proofArtifactKindSchema>;
export type ProofReviewState = z.infer<typeof proofReviewStateSchema>;
export type SkillEvidenceStatus = z.infer<typeof skillEvidenceStatusSchema>;
export type ProofVisibility = z.infer<typeof proofVisibilitySchema>;
export type DeterministicReviewOutcome = z.infer<typeof deterministicReviewOutcomeSchema>;
export type ProofReviewEventKind = z.infer<typeof proofReviewEventKindSchema>;
export type ProofProjectionAudience = z.infer<typeof proofProjectionAudienceSchema>;
export type ProofMutationIntent = z.infer<typeof proofMutationIntentSchema>;
export type ProofVersion = z.infer<typeof proofVersionSchema>;
export type ProofReviewEvent = z.infer<typeof proofReviewEventSchema>;
export type SkillEvidenceProjection = z.infer<typeof skillEvidenceProjectionSchema>;
export type ProofLedgerWorkspace = z.infer<typeof proofLedgerWorkspaceSchema>;
export type CreateProofRequest = z.infer<typeof createProofRequestSchema>;
export type ReviseProofRequest = z.infer<typeof reviseProofRequestSchema>;
export type WithdrawProofRequest = z.infer<typeof withdrawProofRequestSchema>;
export type SetProofVisibilityRequest = z.infer<typeof setProofVisibilityRequestSchema>;
export type ProofLedgerMutationResult = z.infer<typeof proofLedgerMutationResultSchema>;
