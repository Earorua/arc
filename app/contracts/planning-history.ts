import { z } from "zod";

export const historyIdSchema = z.string().trim().min(1).max(256);
export const historyOffsetSchema = z.number().int().min(0).max(100000);
const historyProgressSchema = z.object({
  completedUnits: z.number().int().nonnegative().max(2000),
  totalUnits: z.number().int().positive().max(2000),
}).strict().refine(progress => progress.completedUnits <= progress.totalUnits, "Completed units cannot exceed the saved route total");
export const planningHistorySchema = z.object({
  goals: z.array(z.object({
    id: historyIdSchema,
    roleId: z.string().min(1).max(256),
    targetWeeks: z.number().int().positive(),
    weeklyMinutes: z.number().int().nonnegative(),
    createdAt: z.number().int().nonnegative(),
    hasWorkspace: z.boolean(),
    progress: historyProgressSchema.nullable(),
  }).strict().refine(goal => goal.hasWorkspace || goal.progress === null, "A goal without a workspace cannot have route progress")).max(20),
  nextOffset: historyOffsetSchema.nullable(),
}).strict();
export type PlanningHistory = z.infer<typeof planningHistorySchema>;
