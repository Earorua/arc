import { z } from "zod";
import {
  availabilityVersionSchema,
  planningEventInputSchema,
  planningGenerateSourceSchema,
  planningMutationResultSchema,
  planningSourceContextSchema,
  planningTargetSchema,
  planningWorkspaceSchema,
  skillAuditVersionSchema,
} from "./planning";
import { calendarDateSchema } from "./intelligence";

const idSchema = z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const planningDateSchema = calendarDateSchema.max(10);
const FLAGSHIP_BLUEPRINT_ID = "ai-native-full-stack-engineer";
const FLAGSHIP_BLUEPRINT_VERSION = "2026.08.1";
const FLAGSHIP_REGISTRY_ID = "ai-native-full-stack-engineer-units";
const FLAGSHIP_REGISTRY_VERSION = "2026.08.1";

const generatePlanningRequestFields = {
  mutationId: idSchema,
  planningDate: planningDateSchema,
  audit: skillAuditVersionSchema,
  availability: availabilityVersionSchema,
  target: planningTargetSchema,
  selectedScope: z.enum(["full-scope", "target-date"]).nullable(),
} as const;

export const generatePlanningRequestSchema = z.union([
  z.object({ ...generatePlanningRequestFields, roleId: z.literal("ai-native-full-stack-engineer") }).strict(),
  z.object({ ...generatePlanningRequestFields, source: planningGenerateSourceSchema }).strict(),
]);

export const planningEventRequestSchema = z.object({
  mutationId: idSchema,
  baseVersionId: idSchema,
  event: planningEventInputSchema,
}).strict();

export const replanDecisionRequestSchema = z.object({
  mutationId: idSchema,
  baseVersionId: idSchema,
  candidatePlanVersionId: idSchema,
}).strict();

export const planningWorkspaceResponseSchema = z.object({
  workspace: planningWorkspaceSchema.nullable(),
  sourceContext: planningSourceContextSchema.nullable().optional(),
}).strict().superRefine((response, ctx) => {
  if (response.workspace === null && response.sourceContext) {
    ctx.addIssue({ code: "custom", path: ["sourceContext"], message: "An empty workspace cannot carry source context" });
  }
  if (response.workspace && !response.sourceContext && !isExactFlagshipWorkspace(response.workspace)) {
    ctx.addIssue({ code: "custom", path: ["sourceContext"], message: "A non-Flagship workspace requires source context" });
  }
  if (response.workspace && response.sourceContext) validateResponseSource(response.workspace, response.sourceContext, ctx);
});

export const planningMutationResponseSchema = z.object({
  result: planningMutationResultSchema,
  sourceContext: planningSourceContextSchema.nullable().optional(),
}).strict().superRefine((response, ctx) => {
  if (!response.sourceContext && !isExactFlagshipWorkspace(response.result.workspace)) {
    ctx.addIssue({ code: "custom", path: ["sourceContext"], message: "A non-Flagship workspace requires source context" });
  }
  if (response.sourceContext) validateResponseSource(response.result.workspace, response.sourceContext, ctx);
});

function isExactFlagshipWorkspace(workspace: z.infer<typeof planningWorkspaceSchema>) {
  return workspace.audit.blueprintId === FLAGSHIP_BLUEPRINT_ID
    && workspace.audit.blueprintVersion === FLAGSHIP_BLUEPRINT_VERSION
    && workspace.pathVersions.every((path) => path.blueprintId === FLAGSHIP_BLUEPRINT_ID
      && path.blueprintVersion === FLAGSHIP_BLUEPRINT_VERSION
      && path.registryId === FLAGSHIP_REGISTRY_ID
      && path.registryVersion === FLAGSHIP_REGISTRY_VERSION);
}

function validateResponseSource(
  workspace: z.infer<typeof planningWorkspaceSchema>,
  context: z.infer<typeof planningSourceContextSchema>,
  ctx: z.RefinementCtx,
) {
  if (workspace.audit.blueprintId !== context.blueprint.id
    || workspace.audit.blueprintVersion !== context.blueprint.version
    || workspace.pathVersions.some((path) => path.blueprintId !== context.blueprint.id
      || path.blueprintVersion !== context.blueprint.version
      || path.registryId !== context.registry.id || path.registryVersion !== context.registry.version)) {
    ctx.addIssue({ code: "custom", path: ["sourceContext"], message: "Source context must match workspace identities" });
  }
}

export type GeneratePlanningRequest = z.infer<typeof generatePlanningRequestSchema>;
export type PlanningEventRequest = z.infer<typeof planningEventRequestSchema>;
export type ReplanDecisionRequest = z.infer<typeof replanDecisionRequestSchema>;
export type PlanningWorkspaceResponse = z.infer<typeof planningWorkspaceResponseSchema>;
export type PlanningMutationResponse = z.infer<typeof planningMutationResponseSchema>;
