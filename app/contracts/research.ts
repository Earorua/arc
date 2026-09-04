import { z } from "zod";
import { calendarDateSchema, roleBlueprintSchema } from "./intelligence";
import { unitRegistrySchema } from "./planning";

const idSchema = z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const minuteSchema = z.number().int().positive().max(720);

export const researchRoleSummarySchema = z.object({
  id: idSchema,
  name: z.string().trim().min(2).max(120),
  summary: z.string().trim().min(20).max(500),
}).strict();

export const researchCandidateSkillSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(2).max(120),
  category: z.enum(["foundations", "frontend", "backend", "data", "quality", "cloud", "ai", "product"]),
  importance: z.enum(["core", "strong", "advantage"]),
  why: z.string().trim().min(12).max(360),
  masteryCriteria: z.array(z.string().trim().min(12).max(240)).min(2).max(8),
  resourceIds: z.array(idSchema).min(1).max(32),
}).strict();

export const researchPrerequisiteEdgeSchema = z.object({
  skillId: idSchema,
  prerequisiteSkillId: idSchema,
}).strict();

export const researchCandidateResourceSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(3).max(180),
  url: z.string().trim().min(1).max(2_048),
  provider: z.string().trim().min(2).max(120),
  language: z.enum(["en", "zh-CN"]),
  cost: z.enum(["free", "paid", "mixed"]),
  format: z.enum(["documentation", "course", "guide", "reference", "practice"]),
  sourceTier: z.enum(["primary", "institutional", "practitioner", "community"]),
  purpose: z.enum(["primary", "alternative", "reference"]),
  estimatedMinutes: minuteSchema.nullable(),
  skillIds: z.array(idSchema).min(1).max(64),
}).strict();

export const researchCandidateStageSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(2).max(120),
  weeks: z.number().int().positive().max(52),
  outcome: z.string().trim().min(12).max(360),
  skillIds: z.array(idSchema).min(1).max(64),
}).strict();

export const researchCandidateUnitStepSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1).max(180),
  minutes: minuteSchema,
}).strict();

export const researchCandidateUnitCheckpointSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1).max(180),
  stepIds: z.array(idSchema).min(1).max(12),
  estimatedMinutes: minuteSchema,
}).strict();

export const researchCandidateUnitTemplateSchema = z.object({
  id: idSchema,
  skillId: idSchema,
  kind: z.enum(["learn", "calibrate", "reinforce"]),
  title: z.string().trim().min(1).max(180),
  objective: z.string().trim().min(1).max(500),
  whyNow: z.string().trim().min(1).max(500),
  primaryResourceId: idSchema,
  alternativeResourceIds: z.array(idSchema).max(8),
  steps: z.array(researchCandidateUnitStepSchema).min(1).max(12),
  checkpoints: z.array(researchCandidateUnitCheckpointSchema).max(8),
  buildTask: z.string().trim().min(1).max(800),
  completionCriteria: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
  proofRequirement: z.string().trim().min(1).max(800),
  rubric: z.array(z.string().trim().min(1).max(500)).min(1).max(6),
  estimatedMinutes: minuteSchema,
}).strict();

export const researchCandidateEvidenceSchema = z.object({
  id: idSchema,
  skillId: idSchema,
  resourceId: idSchema,
}).strict();

export const researchCandidateSchema = z.object({
  role: researchRoleSummarySchema,
  skills: z.array(researchCandidateSkillSchema).min(1).max(64),
  prerequisiteEdges: z.array(researchPrerequisiteEdgeSchema).max(4_096),
  resources: z.array(researchCandidateResourceSchema).min(1).max(256),
  stages: z.array(researchCandidateStageSchema).min(1).max(24),
  unitTemplates: z.array(researchCandidateUnitTemplateSchema).min(1).max(512),
  evidence: z.array(researchCandidateEvidenceSchema).min(1).max(512),
}).strict();

export const researchStateSchema = z.enum([
  "queued", "researching", "validating", "ready", "needs-review", "failed",
]);

export const researchIssueCodeSchema = z.enum([
  "invalid-schema",
  "invalid-graph",
  "invalid-registry",
  "missing-skill-source",
  "missing-core-authority",
  "unsafe-url",
  "unreferenced-url",
  "missing-free-alternative",
  "missing-unit",
  "minute-mismatch",
  "unsafe-content",
]);

const sortedIssueCodesSchema = z.array(researchIssueCodeSchema).max(64).superRefine((issueCodes, ctx) => {
  const sortedUniqueCodes = [...new Set(issueCodes)].sort();
  if (issueCodes.some((code, index) => code !== sortedUniqueCodes[index])) {
    ctx.addIssue({ code: "custom", message: "Issue codes must be sorted and unique" });
  }
});

export const researchQualityReportSchema = z.object({
  passed: z.boolean(),
  issueCodes: sortedIssueCodesSchema,
  skillCount: z.number().int().min(0).max(64),
  sourceCount: z.number().int().min(0).max(256),
  unitCount: z.number().int().min(0).max(512),
  observedAt: calendarDateSchema,
}).strict().superRefine((report, ctx) => {
  if (report.passed !== (report.issueCodes.length === 0)) {
    ctx.addIssue({ code: "custom", path: ["passed"], message: "Passed must match the absence of issues" });
  }
});

export const providerCitationAnnotationSchema = z.object({
  type: z.literal("url_citation"),
  url: z.string().trim().min(1).max(2_048),
  title: z.string().trim().min(1).max(500),
}).strict();

const providerTokenCountSchema = z.number().int().min(0).max(10_000_000);

export const providerUsageSchema = z.object({
  promptTokens: providerTokenCountSchema,
  completionTokens: providerTokenCountSchema,
  totalTokens: providerTokenCountSchema,
  costMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  webSearchRequests: z.number().int().min(0).max(10),
}).strict().superRefine((usage, ctx) => {
  if (usage.totalTokens !== usage.promptTokens + usage.completionTokens) {
    ctx.addIssue({ code: "custom", path: ["totalTokens"], message: "Total tokens must equal prompt plus completion tokens" });
  }
});

export const researchProviderCitationAnnotationSchema = providerCitationAnnotationSchema;
export const researchProviderUsageSchema = providerUsageSchema;

export const auditedSourceSchema = z.object({
  canonicalUrl: z.string().trim().min(1).max(2_048),
  title: z.string().trim().min(1).max(500),
  hostname: z.string().trim().min(1).max(253),
  sourceTier: z.enum(["primary", "institutional", "practitioner", "community"]),
  observedAt: calendarDateSchema,
  citationHash: z.string().trim().min(1).max(256),
}).strict();

const researchVersionSchema = z.string().trim().min(1).max(64);

// Research packages inherit canonical types, with research-only input/storage bounds.
const researchBlueprintSchema = roleBlueprintSchema.extend({
  id: idSchema,
  version: roleBlueprintSchema.shape.version.max(32),
  skills: z.array(roleBlueprintSchema.shape.skills.element.extend({
    id: idSchema,
    masteryCriteria: researchCandidateSkillSchema.shape.masteryCriteria,
    prerequisiteIds: z.array(idSchema).max(64),
    resourceIds: researchCandidateSkillSchema.shape.resourceIds,
  })).min(1).max(64),
  resources: z.array(roleBlueprintSchema.shape.resources.element.extend({
    id: idSchema,
    url: roleBlueprintSchema.shape.resources.element.shape.url.max(2_048),
    estimatedMinutes: minuteSchema.nullable(),
    skillIds: researchCandidateResourceSchema.shape.skillIds,
  })).min(1).max(256),
  phases: z.array(roleBlueprintSchema.shape.phases.element.extend({
    id: idSchema,
    weeks: researchCandidateStageSchema.shape.weeks,
    skillIds: researchCandidateStageSchema.shape.skillIds,
  })).min(1).max(24),
});

export const researchPackageSchema = z.object({
  id: idSchema,
  blueprint: researchBlueprintSchema,
  registry: unitRegistrySchema,
  sourceEvidence: z.array(auditedSourceSchema).min(1).max(256),
  qualityReport: researchQualityReportSchema,
  promptVersion: researchVersionSchema,
  inputSchemaVersion: researchVersionSchema,
  outputSchemaVersion: researchVersionSchema,
  qualityVersion: researchVersionSchema,
  modelConfigVersion: researchVersionSchema,
  contentFingerprint: z.string().trim().min(16).max(256),
  observedAt: calendarDateSchema,
  expiresAt: calendarDateSchema,
}).strict();

export const researchPlanningDataSchema = researchPackageSchema.pick({
  id: true,
  blueprint: true,
  registry: true,
});

const publicRunIdentityShape = {
  id: idSchema,
  role: z.string().trim().min(2).max(160),
  locale: z.enum(["zh-CN", "en-US"]),
} as const;

const activeResearchRunPublicViewSchema = z.object({
  ...publicRunIdentityShape,
  state: z.enum(["queued", "researching", "validating"]),
  retryable: z.literal(false),
}).strict();

const readyResearchRunPublicViewSchema = z.object({
  ...publicRunIdentityShape,
  state: z.literal("ready"),
  retryable: z.literal(false),
  packageId: idSchema,
  summary: z.string().trim().min(20).max(500),
  skillCount: z.number().int().min(1).max(64),
  sourceCount: z.number().int().min(1).max(256),
  observedAt: calendarDateSchema,
  quality: z.object({
    passed: z.literal(true),
    issueCodes: z.array(researchIssueCodeSchema).max(0),
  }).strict(),
  planningData: researchPlanningDataSchema,
}).strict();

const needsReviewResearchRunPublicViewSchema = z.object({
  ...publicRunIdentityShape,
  state: z.literal("needs-review"),
  retryable: z.boolean(),
  quality: z.object({
    issueCodes: sortedIssueCodesSchema,
    skillCount: z.number().int().min(0).max(64),
    sourceCount: z.number().int().min(0).max(256),
    unitCount: z.number().int().min(0).max(512),
  }).strict().superRefine((quality, ctx) => {
    if (quality.issueCodes.length === 0) {
      ctx.addIssue({ code: "custom", path: ["issueCodes"], message: "Needs review requires at least one issue" });
    }
  }),
}).strict();

export const researchPublicFailureCategorySchema = z.enum([
  "timeout",
  "rate-limited",
  "allowance-reached",
  "service-unavailable",
  "content-rejected",
  "invalid-result",
  "internal",
]);

const failedResearchRunPublicViewSchema = z.object({
  ...publicRunIdentityShape,
  state: z.literal("failed"),
  failureCategory: researchPublicFailureCategorySchema,
  retryable: z.boolean(),
}).strict();

export const researchRunPublicViewSchema = z.discriminatedUnion("state", [
  activeResearchRunPublicViewSchema,
  readyResearchRunPublicViewSchema,
  needsReviewResearchRunPublicViewSchema,
  failedResearchRunPublicViewSchema,
]);

export const researchRequestSchema = z.object({
  mutationId: z.string().trim().min(8).max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  role: z.string().trim().min(2).max(160),
  locale: z.enum(["zh-CN", "en-US"]),
}).strict();

export const researchRetryRequestSchema = z.object({
  mutationId: researchRequestSchema.shape.mutationId,
}).strict();

export const researchErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "INVALID_INPUT",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "ALLOWANCE_REACHED",
  "RESEARCH_NEEDS_REVIEW",
  "RESEARCH_UNAVAILABLE",
  "INTERNAL",
]);

export const researchRecoverySchema = z.enum([
  "sign-in",
  "refresh",
  "retry",
  "use-flagship",
  "retry-or-flagship",
]);

const researchRequestIdSchema = z.string().min(1).max(128)
  .refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f-\u009f]/u.test(value));

const expectedRecovery = {
  UNAUTHENTICATED: "sign-in",
  INVALID_INPUT: undefined,
  NOT_FOUND: undefined,
  CONFLICT: "refresh",
  RATE_LIMITED: "retry",
  ALLOWANCE_REACHED: "use-flagship",
  RESEARCH_NEEDS_REVIEW: "retry-or-flagship",
  RESEARCH_UNAVAILABLE: "retry-or-flagship",
  INTERNAL: undefined,
} as const;

export const researchPublicErrorSchema = z.object({
  code: researchErrorCodeSchema,
  message: z.string().trim().min(1).max(240),
  recovery: researchRecoverySchema.optional(),
}).strict().superRefine((error, context) => {
  if (error.recovery !== expectedRecovery[error.code]) {
    context.addIssue({ code: "custom", path: ["recovery"], message: "Recovery must match the public Research error" });
  }
});

export const researchSuccessEnvelopeSchema = z.object({
  run: researchRunPublicViewSchema,
  requestId: researchRequestIdSchema,
}).strict();

function expectedRunError(run: ResearchRunPublicView): z.infer<typeof researchErrorCodeSchema> | null {
  if (run.state === "needs-review") return "RESEARCH_NEEDS_REVIEW";
  if (run.state !== "failed") return null;
  if (run.failureCategory === "rate-limited") return "RATE_LIMITED";
  if (run.failureCategory === "allowance-reached") return "ALLOWANCE_REACHED";
  return "RESEARCH_UNAVAILABLE";
}

export const researchErrorEnvelopeSchema = z.object({
  error: researchPublicErrorSchema,
  run: researchRunPublicViewSchema.optional(),
  requestId: researchRequestIdSchema,
}).strict().superRefine((envelope, context) => {
  if (envelope.run && expectedRunError(envelope.run) !== envelope.error.code) {
    context.addIssue({ code: "custom", path: ["run"], message: "Terminal run contradicts the public Research error" });
  }
});

export const researchHttpEnvelopeSchema = z.union([
  researchSuccessEnvelopeSchema,
  researchErrorEnvelopeSchema,
]);

export type ResearchRequest = z.infer<typeof researchRequestSchema>;
export type ResearchRetryRequest = z.infer<typeof researchRetryRequestSchema>;
export type ResearchRoleSummary = z.infer<typeof researchRoleSummarySchema>;
export type ResearchCandidateSkill = z.infer<typeof researchCandidateSkillSchema>;
export type ResearchPrerequisiteEdge = z.infer<typeof researchPrerequisiteEdgeSchema>;
export type ResearchCandidateResource = z.infer<typeof researchCandidateResourceSchema>;
export type ResearchCandidateStage = z.infer<typeof researchCandidateStageSchema>;
export type ResearchCandidateUnitStep = z.infer<typeof researchCandidateUnitStepSchema>;
export type ResearchCandidateUnitCheckpoint = z.infer<typeof researchCandidateUnitCheckpointSchema>;
export type ResearchCandidateUnitTemplate = z.infer<typeof researchCandidateUnitTemplateSchema>;
export type ResearchCandidateEvidence = z.infer<typeof researchCandidateEvidenceSchema>;
export type ResearchCandidate = z.infer<typeof researchCandidateSchema>;
export type ResearchState = z.infer<typeof researchStateSchema>;
export type ResearchIssueCode = z.infer<typeof researchIssueCodeSchema>;
export type ResearchQualityReport = z.infer<typeof researchQualityReportSchema>;
export type ProviderCitationAnnotation = z.infer<typeof providerCitationAnnotationSchema>;
export type ProviderUsage = z.infer<typeof providerUsageSchema>;
export type ResearchProviderCitationAnnotation = ProviderCitationAnnotation;
export type ResearchProviderUsage = ProviderUsage;
export type AuditedSource = z.infer<typeof auditedSourceSchema>;
export type ResearchPackage = z.infer<typeof researchPackageSchema>;
export type ResearchPlanningData = z.infer<typeof researchPlanningDataSchema>;
export type ResearchPublicFailureCategory = z.infer<typeof researchPublicFailureCategorySchema>;
export type ResearchRunPublicView = z.infer<typeof researchRunPublicViewSchema>;
export type ResearchErrorCode = z.infer<typeof researchErrorCodeSchema>;
export type ResearchRecovery = z.infer<typeof researchRecoverySchema>;
export type ResearchPublicError = z.infer<typeof researchPublicErrorSchema>;
export type ResearchSuccessEnvelope = z.infer<typeof researchSuccessEnvelopeSchema>;
export type ResearchErrorEnvelope = z.infer<typeof researchErrorEnvelopeSchema>;
export type ResearchHttpEnvelope = z.infer<typeof researchHttpEnvelopeSchema>;
