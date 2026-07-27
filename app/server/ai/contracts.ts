import { z } from "zod";

export const roleResearchRequestSchema = z.object({
  requestId: z.string().uuid(),
  role: z.string().trim().min(2).max(160),
  locale: z.enum(["zh-CN", "en-US"]).default("zh-CN"),
}).strict();

export type RoleResearchRequest = z.infer<typeof roleResearchRequestSchema>;

export interface AiProvider {
  run(request: RoleResearchRequest): Promise<unknown>;
  repair(request: RoleResearchRequest, invalid: unknown): Promise<unknown>;
}

export const roleResearchPreviewSchema = z.object({
  role: z.string().min(2).max(160),
  mode: z.literal("deterministic-preview"),
  dimensions: z.array(z.string().min(1).max(120)).min(1).max(12),
  notice: z.string().min(1).max(240),
}).strict();

export type RoleResearchPreview = z.infer<typeof roleResearchPreviewSchema>;
