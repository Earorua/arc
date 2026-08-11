import { z } from "zod";
import {
  availabilityVersionSchema,
  planningEventInputSchema,
  planningMutationResultSchema,
  planningTargetSchema,
  planningWorkspaceSchema,
  skillAuditVersionSchema,
} from "./planning";
import { calendarDateSchema } from "./intelligence";

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

export const generatePlanningRequestSchema = z.object({
  mutationId: idSchema,
  roleId: z.literal("ai-native-full-stack-engineer"),
  planningDate: calendarDateSchema,
  audit: skillAuditVersionSchema,
  availability: availabilityVersionSchema,
  target: planningTargetSchema,
  selectedScope: z.enum(["full-scope", "target-date"]).nullable(),
}).strict();

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
}).strict();

export const planningMutationResponseSchema = z.object({
  result: planningMutationResultSchema,
}).strict();

export type GeneratePlanningRequest = z.infer<typeof generatePlanningRequestSchema>;
export type PlanningEventRequest = z.infer<typeof planningEventRequestSchema>;
export type ReplanDecisionRequest = z.infer<typeof replanDecisionRequestSchema>;
export type PlanningWorkspaceResponse = z.infer<typeof planningWorkspaceResponseSchema>;
export type PlanningMutationResponse = z.infer<typeof planningMutationResponseSchema>;
