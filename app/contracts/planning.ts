import { z } from "zod";
import { calendarDateSchema as baseCalendarDateSchema, isIanaTimeZoneIdentifier, publicHttpsUrlSchema as basePublicHttpsUrlSchema, roleBlueprintSchema } from "./intelligence";

export const PLANNING_SCHEMA_VERSION = "2026.08.1" as const;

const idSchema = z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const versionSchema = z.string().max(32).regex(/^\d{4}\.\d{2}\.\d+$/u);
const fingerprintSchema = z.string().trim().min(1).max(256);
const shortTextSchema = z.string().trim().min(1).max(1000);
const minuteSchema = z.number().int().positive().max(720);
const availabilityMinuteSchema = z.union([z.literal(0), z.number().int().min(15).max(720)]);
const calendarDateSchema = baseCalendarDateSchema.max(10);
const publicHttpsUrlSchema = basePublicHttpsUrlSchema.max(2048);
const timestampSchema = z.string().max(64).datetime({ offset: true });

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function issueDuplicateIds(ctx: z.RefinementCtx, values: readonly string[], path: (string | number)[], message: string) {
  if (hasDuplicates(values)) ctx.addIssue({ code: "custom", path, message });
}

export const skillSelfLevelSchema = z.enum(["unseen", "conceptual", "guided", "independent"]);
export const evidenceKindSchema = z.enum(["repository", "deployment", "project", "document", "other"]);
export const unitKindSchema = z.enum(["learn", "calibrate", "reinforce"]);
export const planGenerationSchema = z.enum(["initial", "automatic", "proposed"]);
export const learningEventKindSchema = z.enum([
  "completed", "delayed", "skipped", "too_hard", "already_known", "availability_changed",
  "replan_accepted", "replan_discarded",
]);

export const planningGenerateSourceSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("flagship"), roleId: z.literal("ai-native-full-stack-engineer") }).strict(),
  z.object({ source: z.literal("research"), researchRunId: idSchema }).strict(),
]);

export const planningSourceReferenceSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("flagship"), roleId: z.literal("ai-native-full-stack-engineer") }).strict(),
  z.object({
    source: z.literal("research"),
    researchRunId: idSchema,
    packageId: idSchema,
    blueprintId: idSchema,
    blueprintVersion: versionSchema,
    registryId: idSchema,
    registryVersion: versionSchema,
    configFingerprint: fingerprintSchema,
    contentFingerprint: fingerprintSchema,
  }).strict(),
]);

export const skillEvidenceSchema = z.object({
  id: idSchema,
  skillId: idSchema,
  kind: evidenceKindSchema,
  url: publicHttpsUrlSchema,
  note: shortTextSchema.max(300),
}).strict();

export const skillAuditAnswerSchema = z.object({
  skillId: idSchema,
  level: skillSelfLevelSchema,
  evidenceRefs: z.array(idSchema).max(3),
}).strict().superRefine((answer, ctx) => {
  issueDuplicateIds(ctx, answer.evidenceRefs, ["evidenceRefs"], "Evidence references must be unique");
});

export const skillAuditVersionSchema = z.object({
  id: idSchema,
  schemaVersion: z.literal(PLANNING_SCHEMA_VERSION),
  blueprintId: idSchema,
  blueprintVersion: versionSchema,
  answers: z.array(skillAuditAnswerSchema).max(64),
  evidence: z.array(skillEvidenceSchema).max(192),
  createdBy: idSchema,
  inputFingerprint: fingerprintSchema,
}).strict().superRefine((audit, ctx) => {
  issueDuplicateIds(ctx, audit.answers.map(({ skillId }) => skillId), ["answers"], "Audit answers must have unique skill IDs");
  issueDuplicateIds(ctx, audit.evidence.map(({ id }) => id), ["evidence"], "Evidence IDs must be unique");
  const evidenceById = new Map(audit.evidence.map((evidence) => [evidence.id, evidence]));
  audit.answers.forEach((answer, answerIndex) => answer.evidenceRefs.forEach((reference, referenceIndex) => {
    const evidence = evidenceById.get(reference);
    if (!evidence || evidence.skillId !== answer.skillId) {
      ctx.addIssue({ code: "custom", path: ["answers", answerIndex, "evidenceRefs", referenceIndex], message: "Evidence must resolve to the answer's skill" });
    }
  }));
});

export const weekdayMinutesSchema = z.object({
  monday: availabilityMinuteSchema,
  tuesday: availabilityMinuteSchema,
  wednesday: availabilityMinuteSchema,
  thursday: availabilityMinuteSchema,
  friday: availabilityMinuteSchema,
  saturday: availabilityMinuteSchema,
  sunday: availabilityMinuteSchema,
}).strict();

export const availabilityExceptionSchema = z.object({
  date: calendarDateSchema,
  minutes: availabilityMinuteSchema,
  reason: z.string().trim().min(1).max(300).nullable(),
}).strict();

function isSupportedTimeZone(timeZone: string): boolean {
  if (!isIanaTimeZoneIdentifier(timeZone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export const availabilityVersionSchema = z.object({
  id: idSchema,
  schemaVersion: z.literal(PLANNING_SCHEMA_VERSION),
  timeZone: z.string().min(1).max(128).refine(isSupportedTimeZone, "Unsupported IANA time zone"),
  weekdays: weekdayMinutesSchema,
  exceptions: z.array(availabilityExceptionSchema).max(90),
  weeklyMinutes: z.number().int().min(30).max(2400),
  inputFingerprint: fingerprintSchema,
}).strict().superRefine((availability, ctx) => {
  issueDuplicateIds(ctx, availability.exceptions.map(({ date }) => date), ["exceptions"], "Exception dates must be unique");
  const weeklyMinutes = Object.values(availability.weekdays).reduce((sum, minutes) => sum + minutes, 0);
  if (availability.weeklyMinutes !== weeklyMinutes) {
    ctx.addIssue({ code: "custom", path: ["weeklyMinutes"], message: "Weekly minutes must equal weekday total" });
  }
});

export const planningTargetSchema = z.object({
  id: idSchema,
  schemaVersion: z.literal(PLANNING_SCHEMA_VERSION),
  targetWeeks: z.number().int().min(4).max(52),
  inputFingerprint: fingerprintSchema,
}).strict();

export const unitStepSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1).max(180),
  minutes: minuteSchema,
}).strict();

export const unitCheckpointSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1).max(180),
  stepIds: z.array(idSchema).min(1).max(12),
  estimatedMinutes: minuteSchema,
}).strict().superRefine((checkpoint, ctx) => {
  issueDuplicateIds(ctx, checkpoint.stepIds, ["stepIds"], "Checkpoint step IDs must be unique");
});

export const unitTemplateSchema = z.object({
  id: idSchema,
  version: versionSchema,
  skillId: idSchema,
  kind: unitKindSchema,
  title: z.string().trim().min(1).max(180),
  objective: z.string().trim().min(1).max(500),
  whyNow: z.string().trim().min(1).max(500),
  primaryResourceId: idSchema,
  alternativeResourceIds: z.array(idSchema).max(8),
  steps: z.array(unitStepSchema).min(1).max(12),
  checkpoints: z.array(unitCheckpointSchema).max(8),
  buildTask: z.string().trim().min(1).max(800),
  completionCriteria: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
  proofRequirement: z.string().trim().min(1).max(800),
  rubric: z.array(z.string().trim().min(1).max(500)).min(1).max(6),
  estimatedMinutes: minuteSchema,
}).strict().superRefine((template, ctx) => {
  issueDuplicateIds(ctx, template.alternativeResourceIds, ["alternativeResourceIds"], "Alternative resource IDs must be unique");
  if (template.alternativeResourceIds.includes(template.primaryResourceId)) {
    ctx.addIssue({ code: "custom", path: ["alternativeResourceIds"], message: "Primary resource cannot also be an alternative" });
  }
  issueDuplicateIds(ctx, template.steps.map(({ id }) => id), ["steps"], "Step IDs must be unique");
  issueDuplicateIds(ctx, template.checkpoints.map(({ id }) => id), ["checkpoints"], "Checkpoint IDs must be unique");
  issueDuplicateIds(ctx, template.completionCriteria, ["completionCriteria"], "Completion criteria must be unique");
  issueDuplicateIds(ctx, template.rubric, ["rubric"], "Rubric rows must be unique");
  const stepIds = new Set(template.steps.map(({ id }) => id));
  template.checkpoints.forEach((checkpoint, checkpointIndex) => checkpoint.stepIds.forEach((stepId, stepIndex) => {
    if (!stepIds.has(stepId)) ctx.addIssue({ code: "custom", path: ["checkpoints", checkpointIndex, "stepIds", stepIndex], message: "Checkpoint step must resolve" });
  }));
});

export const skillUnitTrackSchema = z.object({
  skillId: idSchema,
  templates: z.array(unitTemplateSchema).min(1).max(8),
}).strict().superRefine((track, ctx) => {
  issueDuplicateIds(ctx, track.templates.map(({ id }) => id), ["templates"], "Template IDs must be unique within a skill track");
  track.templates.forEach((template, index) => {
    if (template.skillId !== track.skillId) ctx.addIssue({ code: "custom", path: ["templates", index, "skillId"], message: "Template skill must match its track" });
  });
});

export const unitRegistrySchema = z.object({
  id: idSchema,
  version: versionSchema,
  blueprintId: idSchema,
  blueprintVersion: versionSchema,
  tracks: z.array(skillUnitTrackSchema).min(1).max(64),
}).strict().superRefine((registry, ctx) => {
  issueDuplicateIds(ctx, registry.tracks.map(({ skillId }) => skillId), ["tracks"], "Registry tracks must have unique skill IDs");
});

export const planningSourceContextSchema = z.object({
  reference: planningSourceReferenceSchema,
  blueprint: roleBlueprintSchema,
  registry: unitRegistrySchema,
}).strict().superRefine((context, ctx) => {
  const reference = context.reference;
  const blueprintId = reference.source === "flagship" ? reference.roleId : reference.blueprintId;
  if (context.blueprint.id !== blueprintId) {
    ctx.addIssue({ code: "custom", path: ["blueprint", "id"], message: "Source blueprint identity must match" });
  }
  if (reference.source === "research" && context.blueprint.version !== reference.blueprintVersion) {
    ctx.addIssue({ code: "custom", path: ["blueprint", "version"], message: "Source blueprint version must match" });
  }
  if (context.registry.blueprintId !== context.blueprint.id
    || context.registry.blueprintVersion !== context.blueprint.version) {
    ctx.addIssue({ code: "custom", path: ["registry"], message: "Source registry domain must match its blueprint" });
  }
  if (reference.source === "research"
    && (context.registry.id !== reference.registryId || context.registry.version !== reference.registryVersion)) {
    ctx.addIssue({ code: "custom", path: ["registry"], message: "Source registry identity must match" });
  }
  if (reference.source === "flagship") {
    if (context.blueprint.version !== "2026.08.1") {
      ctx.addIssue({ code: "custom", path: ["blueprint", "version"], message: "Flagship blueprint version must match" });
    }
    if (context.registry.id !== "ai-native-full-stack-engineer-units"
      || context.registry.version !== "2026.08.1") {
      ctx.addIssue({ code: "custom", path: ["registry"], message: "Flagship registry identity must match" });
    }
  }
});

export const pathUnitSchema = z.object({
  id: idSchema,
  templateId: idSchema,
  templateVersion: versionSchema,
  checkpointId: idSchema.nullable(),
  skillId: idSchema,
  kind: unitKindSchema,
  estimatedMinutes: minuteSchema,
  prerequisiteUnitIds: z.array(idSchema).max(2000),
}).strict().superRefine((unit, ctx) => {
  issueDuplicateIds(ctx, unit.prerequisiteUnitIds, ["prerequisiteUnitIds"], "Prerequisite unit IDs must be unique");
  if (unit.prerequisiteUnitIds.includes(unit.id)) ctx.addIssue({ code: "custom", path: ["prerequisiteUnitIds"], message: "A unit cannot require itself" });
});

export const learningPathPhaseSchema = z.object({
  phaseId: idSchema,
  name: z.string().trim().min(1).max(180),
  outcome: z.string().trim().min(1).max(500),
  unitIds: z.array(idSchema).min(1).max(2000),
}).strict().superRefine((phase, ctx) => {
  issueDuplicateIds(ctx, phase.unitIds, ["unitIds"], "Phase unit IDs must be unique");
});

export const deferredSkillSchema = z.object({
  skillId: idSchema,
  reason: z.enum(["target-date-advantage", "target-date-strong"]),
}).strict();

export const learningPathVersionSchema = z.object({
  id: idSchema,
  schemaVersion: z.literal(PLANNING_SCHEMA_VERSION),
  blueprintId: idSchema,
  blueprintVersion: versionSchema,
  registryId: idSchema,
  registryVersion: versionSchema,
  auditVersionId: idSchema,
  availabilityVersionId: idSchema,
  targetId: idSchema,
  scopeMode: z.enum(["full-scope", "target-date"]),
  phases: z.array(learningPathPhaseSchema).min(1).max(2000),
  units: z.array(pathUnitSchema).min(1).max(2000),
  deferredSkills: z.array(deferredSkillSchema).max(64),
  estimatedStartDate: calendarDateSchema,
  estimatedCompletionDate: calendarDateSchema,
  inputFingerprint: fingerprintSchema,
}).strict().superRefine((path, ctx) => {
  issueDuplicateIds(ctx, path.phases.map(({ phaseId }) => phaseId), ["phases"], "Phase IDs must be unique");
  issueDuplicateIds(ctx, path.units.map(({ id }) => id), ["units"], "Path unit IDs must be unique");
  issueDuplicateIds(ctx, path.deferredSkills.map(({ skillId }) => skillId), ["deferredSkills"], "Deferred skill IDs must be unique");
  const unitIds = new Set(path.units.map(({ id }) => id));
  const phaseUnitIds = path.phases.flatMap(({ unitIds: ids }) => ids);
  issueDuplicateIds(ctx, phaseUnitIds, ["phases"], "A unit may appear in only one phase");
  path.phases.forEach((phase, phaseIndex) => phase.unitIds.forEach((unitId, unitIndex) => {
    if (!unitIds.has(unitId)) ctx.addIssue({ code: "custom", path: ["phases", phaseIndex, "unitIds", unitIndex], message: "Phase unit must resolve" });
  }));
  path.units.forEach((unit, unitIndex) => unit.prerequisiteUnitIds.forEach((prerequisiteId, prerequisiteIndex) => {
    if (!unitIds.has(prerequisiteId)) ctx.addIssue({ code: "custom", path: ["units", unitIndex, "prerequisiteUnitIds", prerequisiteIndex], message: "Prerequisite unit must resolve" });
  }));
});

export const pathBuildResultSchema = z.object({
  fullScope: learningPathVersionSchema,
  targetDate: learningPathVersionSchema.nullable(),
  infeasibleReason: z.string().trim().min(1).max(1000).nullable(),
}).strict().superRefine((result, ctx) => {
  if (result.fullScope.scopeMode !== "full-scope") ctx.addIssue({ code: "custom", path: ["fullScope", "scopeMode"], message: "Full-scope result must be full-scope" });
  if (result.targetDate?.scopeMode !== "target-date" && result.targetDate !== null) ctx.addIssue({ code: "custom", path: ["targetDate", "scopeMode"], message: "Target-date result must be target-date" });
  if ((result.targetDate === null) !== (result.infeasibleReason !== null)) ctx.addIssue({ code: "custom", path: ["infeasibleReason"], message: "An infeasibility reason is required only without a target-date path" });
});

export const dailyUnitSchema = z.object({
  id: idSchema,
  planVersionId: idSchema,
  templateId: idSchema,
  templateVersion: versionSchema,
  checkpointId: idSchema.nullable(),
  skillId: idSchema,
  kind: unitKindSchema,
  scheduledDate: calendarDateSchema,
  slot: z.enum(["primary", "stretch"]),
  required: z.boolean(),
  objective: z.string().trim().min(1).max(500),
  whyNow: z.string().trim().min(1).max(500),
  primaryResourceId: idSchema,
  alternativeResourceIds: z.array(idSchema).max(8),
  steps: z.array(unitStepSchema).min(1).max(12),
  buildTask: z.string().trim().min(1).max(800),
  completionCriteria: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
  proofRequirement: z.string().trim().min(1).max(800),
  rubric: z.array(z.string().trim().min(1).max(500)).min(1).max(6),
  estimatedMinutes: minuteSchema,
}).strict().superRefine((unit, ctx) => {
  issueDuplicateIds(ctx, unit.alternativeResourceIds, ["alternativeResourceIds"], "Alternative resource IDs must be unique");
  if (unit.alternativeResourceIds.includes(unit.primaryResourceId)) {
    ctx.addIssue({ code: "custom", path: ["alternativeResourceIds"], message: "Primary resource cannot also be an alternative" });
  }
  issueDuplicateIds(ctx, unit.steps.map(({ id }) => id), ["steps"], "Step IDs must be unique");
  issueDuplicateIds(ctx, unit.completionCriteria, ["completionCriteria"], "Completion criteria must be unique");
  issueDuplicateIds(ctx, unit.rubric, ["rubric"], "Rubric rows must be unique");
});

export const planDaySchema = z.object({
  date: calendarDateSchema,
  budgetMinutes: z.number().int().min(0).max(720),
  status: z.enum(["scheduled", "rest", "open"]),
  primaryUnitId: idSchema.nullable(),
  stretchUnitId: idSchema.nullable(),
}).strict().superRefine((day, ctx) => {
  if (day.primaryUnitId !== null && day.primaryUnitId === day.stretchUnitId) ctx.addIssue({ code: "custom", path: ["stretchUnitId"], message: "Primary and stretch units must differ" });
});

export const planVersionSchema = z.object({
  id: idSchema,
  schemaVersion: z.literal(PLANNING_SCHEMA_VERSION),
  generation: planGenerationSchema,
  baseVersionId: idSchema.nullable(),
  replanReason: learningEventKindSchema.nullable(),
  planningDate: calendarDateSchema,
  pathVersionId: idSchema,
  days: z.array(planDaySchema).length(7),
  dailyUnitIds: z.array(idSchema).max(2000),
  estimatedCompletionDate: calendarDateSchema,
  inputFingerprint: fingerprintSchema,
  summary: z.string().trim().min(1).max(1000),
}).strict().superRefine((plan, ctx) => {
  issueDuplicateIds(ctx, plan.days.map(({ date }) => date), ["days"], "Plan dates must be unique");
  issueDuplicateIds(ctx, plan.dailyUnitIds, ["dailyUnitIds"], "Daily unit IDs must be unique");
  const placements = plan.days.flatMap((day, dayIndex) => [
    { dayIndex, slot: "primary" as const, unitId: day.primaryUnitId },
    { dayIndex, slot: "stretch" as const, unitId: day.stretchUnitId },
  ].filter((placement): placement is { dayIndex: number; slot: "primary" | "stretch"; unitId: string } => placement.unitId !== null));
  issueDuplicateIds(ctx, placements.map(({ unitId }) => unitId), ["days"], "A daily unit may be placed only once");
  const unitIds = new Set(plan.dailyUnitIds);
  placements.forEach(({ dayIndex, slot, unitId }) => {
    if (!unitIds.has(unitId)) ctx.addIssue({ code: "custom", path: ["days", dayIndex, `${slot}UnitId`], message: "Plan-day unit must be listed in dailyUnitIds" });
  });
  if (placements.length !== plan.dailyUnitIds.length || placements.some(({ unitId }) => !unitIds.has(unitId))) {
    ctx.addIssue({ code: "custom", path: ["dailyUnitIds"], message: "Every daily unit must have exactly one plan-day placement" });
  }
});

export const planDiffItemSchema = z.object({
  unitId: idSchema,
  change: z.enum(["added", "moved", "removed", "unchanged"]),
  fromDate: calendarDateSchema.nullable(),
  toDate: calendarDateSchema.nullable(),
  reason: z.string().trim().min(1).max(1000),
}).strict().superRefine((item, ctx) => {
  const invalid = (item.change === "added" && (item.fromDate !== null || item.toDate === null))
    || (item.change === "removed" && (item.fromDate === null || item.toDate !== null))
    || (item.change === "moved" && (item.fromDate === null || item.toDate === null || item.fromDate === item.toDate))
    || (item.change === "unchanged" && (item.fromDate === null || item.toDate === null || item.fromDate !== item.toDate));
  if (invalid) ctx.addIssue({ code: "custom", message: "Diff dates must match the change kind" });
});

export const planDiffSchema = z.object({
  id: idSchema,
  basePlanVersionId: idSchema,
  candidatePlanVersionId: idSchema,
  items: z.array(planDiffItemSchema).min(1).max(2000),
  previousEstimatedCompletionDate: calendarDateSchema,
  nextEstimatedCompletionDate: calendarDateSchema,
  summary: z.string().trim().min(1).max(1000),
  inputFingerprint: fingerprintSchema,
}).strict().superRefine((diff, ctx) => {
  issueDuplicateIds(ctx, diff.items.map(({ unitId }) => unitId), ["items"], "Diff unit IDs must be unique");
});

const unitEventInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("completed"), unitId: idSchema, actualMinutes: z.number().int().min(0).max(720).nullable(), planningDate: calendarDateSchema }).strict(),
  z.object({ kind: z.literal("delayed"), unitId: idSchema, planningDate: calendarDateSchema }).strict(),
  z.object({ kind: z.literal("skipped"), unitId: idSchema, planningDate: calendarDateSchema }).strict(),
  z.object({ kind: z.literal("too_hard"), unitId: idSchema, planningDate: calendarDateSchema }).strict(),
  z.object({ kind: z.literal("already_known"), unitId: idSchema, planningDate: calendarDateSchema }).strict(),
]);

export const planningEventInputSchema = z.discriminatedUnion("kind", [
  ...unitEventInputSchema.options,
  z.object({ kind: z.literal("availability_changed"), availability: availabilityVersionSchema, planningDate: calendarDateSchema }).strict(),
]);

const eventMetadataSchema = z.object({
  eventId: idSchema,
  mutationId: idSchema,
  sequence: z.number().int().positive(),
  targetPlanVersionId: idSchema,
  occurredAt: timestampSchema,
}).strict();

const decisionEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("replan_accepted"), candidatePlanVersionId: idSchema }).strict(),
  z.object({ kind: z.literal("replan_discarded"), candidatePlanVersionId: idSchema }).strict(),
]);

export const planningEventSchema = z.union([
  ...planningEventInputSchema.options.map((event) => event.extend(eventMetadataSchema.shape).strict()),
  ...decisionEventSchema.options.map((event) => event.extend(eventMetadataSchema.shape).strict()),
]).superRefine((event, ctx) => {
  if (new TextEncoder().encode(JSON.stringify(event)).byteLength > 32 * 1024) {
    ctx.addIssue({ code: "custom", message: "Planning event must not exceed 32 KiB serialized" });
  }
});

export const planningWorkspaceSchema = z.object({
  id: idSchema,
  goalId: idSchema,
  revision: z.number().int().min(0),
  lastSequence: z.number().int().min(0),
  audit: skillAuditVersionSchema,
  availability: availabilityVersionSchema,
  availabilityVersions: z.array(availabilityVersionSchema).min(1).max(500),
  target: planningTargetSchema,
  pathVersions: z.array(learningPathVersionSchema).min(1).max(500),
  planVersions: z.array(planVersionSchema).min(1).max(500),
  dailyUnits: z.array(dailyUnitSchema).max(2000),
  events: z.array(planningEventSchema).max(5000),
  activePathVersionId: idSchema,
  activePlanVersionId: idSchema,
  pendingPlanVersionId: idSchema.nullable(),
}).strict().superRefine((workspace, ctx) => {
  issueDuplicateIds(ctx, workspace.pathVersions.map(({ id }) => id), ["pathVersions"], "Path version IDs must be unique");
  issueDuplicateIds(ctx, workspace.planVersions.map(({ id }) => id), ["planVersions"], "Plan version IDs must be unique");
  issueDuplicateIds(ctx, workspace.availabilityVersions.map(({ id }) => id), ["availabilityVersions"], "Availability version IDs must be unique");
  issueDuplicateIds(ctx, workspace.dailyUnits.map(({ planVersionId, id }) => `${planVersionId}:${id}`), ["dailyUnits"], "Daily unit IDs must be unique within a plan version");
  issueDuplicateIds(ctx, workspace.events.map(({ eventId }) => eventId), ["events"], "Event IDs must be unique");
  issueDuplicateIds(ctx, workspace.events.map(({ mutationId }) => mutationId), ["events"], "Event mutation IDs must be unique");
  issueDuplicateIds(ctx, workspace.events.map(({ sequence }) => String(sequence)), ["events"], "Event sequences must be unique");
  const paths = new Map(workspace.pathVersions.map((path) => [path.id, path]));
  const plans = new Map(workspace.planVersions.map((plan) => [plan.id, plan]));
  const availabilityVersions = new Map(workspace.availabilityVersions.map((availability) => [availability.id, availability]));
  const units = new Map(workspace.dailyUnits.map((unit) => [`${unit.planVersionId}:${unit.id}`, unit]));
  if (!paths.has(workspace.activePathVersionId)) ctx.addIssue({ code: "custom", path: ["activePathVersionId"], message: "Active path must resolve" });
  if (!plans.has(workspace.activePlanVersionId)) ctx.addIssue({ code: "custom", path: ["activePlanVersionId"], message: "Active plan must resolve" });
  if (workspace.pendingPlanVersionId !== null && !plans.has(workspace.pendingPlanVersionId)) ctx.addIssue({ code: "custom", path: ["pendingPlanVersionId"], message: "Pending plan must resolve" });
  const currentAvailability = availabilityVersions.get(workspace.availability.id);
  if (!currentAvailability
    || currentAvailability.inputFingerprint !== workspace.availability.inputFingerprint
    || JSON.stringify(currentAvailability) !== JSON.stringify(workspace.availability)) {
    ctx.addIssue({ code: "custom", path: ["availability"], message: "Current availability must match a historical availability snapshot" });
  }
  workspace.dailyUnits.forEach((unit, unitIndex) => {
    if (!plans.has(unit.planVersionId)) ctx.addIssue({ code: "custom", path: ["dailyUnits", unitIndex, "planVersionId"], message: "Daily unit plan version must resolve" });
  });
  workspace.pathVersions.forEach((path, pathIndex) => {
    if (path.auditVersionId !== workspace.audit.id) ctx.addIssue({ code: "custom", path: ["pathVersions", pathIndex, "auditVersionId"], message: "Path audit must be the workspace audit" });
    if (!availabilityVersions.has(path.availabilityVersionId)) ctx.addIssue({ code: "custom", path: ["pathVersions", pathIndex, "availabilityVersionId"], message: "Path availability must resolve" });
    if (path.targetId !== workspace.target.id) ctx.addIssue({ code: "custom", path: ["pathVersions", pathIndex, "targetId"], message: "Path target must be the workspace target" });
  });
  workspace.planVersions.forEach((plan, planIndex) => {
    if (!paths.has(plan.pathVersionId)) ctx.addIssue({ code: "custom", path: ["planVersions", planIndex, "pathVersionId"], message: "Plan path must resolve" });
    if (plan.baseVersionId !== null && !plans.has(plan.baseVersionId)) ctx.addIssue({ code: "custom", path: ["planVersions", planIndex, "baseVersionId"], message: "Plan base version must resolve" });
    plan.dailyUnitIds.forEach((unitId, unitIndex) => {
      const unit = units.get(`${plan.id}:${unitId}`);
      if (!unit) ctx.addIssue({ code: "custom", path: ["planVersions", planIndex, "dailyUnitIds", unitIndex], message: "Plan daily unit must resolve within its plan version" });
    });
    plan.days.forEach((day, dayIndex) => ([
      { slot: "primary" as const, unitId: day.primaryUnitId },
      { slot: "stretch" as const, unitId: day.stretchUnitId },
    ]).forEach(({ slot, unitId }) => {
      if (unitId === null) return;
      const unit = units.get(`${plan.id}:${unitId}`);
      if (!unit || unit.scheduledDate !== day.date || unit.slot !== slot) {
        ctx.addIssue({ code: "custom", path: ["planVersions", planIndex, "days", dayIndex, `${slot}UnitId`], message: "Placed daily unit must match its day and slot" });
      }
    }));
  });
  workspace.events.forEach((event, eventIndex) => {
    if (!plans.has(event.targetPlanVersionId)) ctx.addIssue({ code: "custom", path: ["events", eventIndex, "targetPlanVersionId"], message: "Event target plan must resolve" });
    if (event.kind === "availability_changed") {
      const availability = availabilityVersions.get(event.availability.id);
      if (!availability
        || availability.inputFingerprint !== event.availability.inputFingerprint
        || JSON.stringify(availability) !== JSON.stringify(event.availability)) {
        ctx.addIssue({ code: "custom", path: ["events", eventIndex, "availability"], message: "Availability-change event must match a retained availability snapshot" });
      }
    }
    if ("unitId" in event) {
      const targetPlan = plans.get(event.targetPlanVersionId);
      if (!units.has(`${event.targetPlanVersionId}:${event.unitId}`) || !targetPlan?.dailyUnitIds.includes(event.unitId)) {
        ctx.addIssue({ code: "custom", path: ["events", eventIndex, "unitId"], message: "Event unit must resolve within its target plan" });
      }
    }
    if ("candidatePlanVersionId" in event && !plans.has(event.candidatePlanVersionId)) ctx.addIssue({ code: "custom", path: ["events", eventIndex, "candidatePlanVersionId"], message: "Candidate plan must resolve" });
  });
  workspace.events.forEach((event, eventIndex) => {
    if (event.sequence !== eventIndex + 1) ctx.addIssue({ code: "custom", path: ["events", eventIndex, "sequence"], message: "Event sequences must be ordered and gap-free" });
  });
  if (workspace.lastSequence !== workspace.events.length) ctx.addIssue({ code: "custom", path: ["lastSequence"], message: "Last sequence must equal the terminal event sequence" });
});

export const planningMutationResultSchema = z.object({
  outcome: z.enum(["active", "proposed", "accepted", "discarded"]),
  workspace: planningWorkspaceSchema,
  diff: planDiffSchema.nullable(),
}).strict();

export const MAX_PLANNING_WORKSPACE_BYTES = 4 * 1024 * 1024;

export function parsePlanningWorkspaceAtRepositoryBoundary(input: unknown): PlanningWorkspace {
  let value: unknown = input;
  let serialized: string;
  try {
    serialized = typeof input === "string" ? input : JSON.stringify(input);
  } catch {
    throw new Error("Planning workspace must be serializable");
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_PLANNING_WORKSPACE_BYTES) {
    throw new Error("Planning workspace exceeds the 4 MiB repository boundary");
  }
  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      throw new Error("Planning workspace JSON is invalid");
    }
  }
  return planningWorkspaceSchema.parse(value);
}

export type SkillSelfLevel = z.infer<typeof skillSelfLevelSchema>;
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;
export type UnitKind = z.infer<typeof unitKindSchema>;
export type PlanGeneration = z.infer<typeof planGenerationSchema>;
export type LearningEventKind = z.infer<typeof learningEventKindSchema>;
export type SkillEvidence = z.infer<typeof skillEvidenceSchema>;
export type SkillAuditAnswer = z.infer<typeof skillAuditAnswerSchema>;
export type SkillAuditVersion = z.infer<typeof skillAuditVersionSchema>;
export type WeekdayMinutes = z.infer<typeof weekdayMinutesSchema>;
export type AvailabilityException = z.infer<typeof availabilityExceptionSchema>;
export type AvailabilityVersion = z.infer<typeof availabilityVersionSchema>;
export type PlanningTarget = z.infer<typeof planningTargetSchema>;
export type UnitStep = z.infer<typeof unitStepSchema>;
export type UnitCheckpoint = z.infer<typeof unitCheckpointSchema>;
export type UnitTemplate = z.infer<typeof unitTemplateSchema>;
export type SkillUnitTrack = z.infer<typeof skillUnitTrackSchema>;
export type UnitRegistry = z.infer<typeof unitRegistrySchema>;
export type PlanningGenerateSource = z.infer<typeof planningGenerateSourceSchema>;
export type PlanningSourceReference = z.infer<typeof planningSourceReferenceSchema>;
export type PlanningSourceContext = z.infer<typeof planningSourceContextSchema>;
export type PathUnit = z.infer<typeof pathUnitSchema>;
export type LearningPathPhase = z.infer<typeof learningPathPhaseSchema>;
export type DeferredSkill = z.infer<typeof deferredSkillSchema>;
export type LearningPathVersion = z.infer<typeof learningPathVersionSchema>;
export type PathBuildResult = z.infer<typeof pathBuildResultSchema>;
export type DailyUnit = z.infer<typeof dailyUnitSchema>;
export type PlanDay = z.infer<typeof planDaySchema>;
export type PlanVersion = z.infer<typeof planVersionSchema>;
export type PlanDiffItem = z.infer<typeof planDiffItemSchema>;
export type PlanDiff = z.infer<typeof planDiffSchema>;
export type PlanningEventInput = z.infer<typeof planningEventInputSchema>;
export type PlanningEvent = z.infer<typeof planningEventSchema>;
export type PlanningWorkspace = z.infer<typeof planningWorkspaceSchema>;
export type PlanningMutationResult = z.infer<typeof planningMutationResultSchema>;
