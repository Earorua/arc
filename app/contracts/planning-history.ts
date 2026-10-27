import { z } from "zod";

export const historyIdSchema = z.string().trim().min(1).max(256);
export const historyOffsetSchema = z.number().int().min(0).max(100000);
export const planningHistorySchema = z.object({
  goals: z.array(z.object({
    id: historyIdSchema,
    roleId: z.string().min(1).max(256),
    targetWeeks: z.number().int().positive(),
    weeklyMinutes: z.number().int().nonnegative(),
    createdAt: z.number().int().nonnegative(),
    hasWorkspace: z.boolean(),
  }).strict()).max(20),
  nextOffset: historyOffsetSchema.nullable(),
}).strict();
export type PlanningHistory = z.infer<typeof planningHistorySchema>;
