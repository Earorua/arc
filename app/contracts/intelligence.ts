import { z } from "zod";

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const httpsUrlSchema = z.string().url().refine((url) => url.startsWith("https://"));

export const skillCategorySchema = z.enum([
  "foundations", "frontend", "backend", "data",
  "quality", "cloud", "ai", "product",
]);
export const skillImportanceSchema = z.enum(["core", "strong", "advantage"]);
export const resourceCostSchema = z.enum(["free", "paid", "mixed"]);
export const resourceFormatSchema = z.enum([
  "documentation", "course", "guide", "reference", "practice",
]);
export const sourceTierSchema = z.enum([
  "primary", "institutional", "practitioner", "community",
]);
export const resourcePurposeSchema = z.enum(["primary", "alternative", "reference"]);

export const learningResourceSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(3).max(180),
  url: httpsUrlSchema,
  provider: z.string().trim().min(2).max(120),
  language: z.enum(["en", "zh-CN"]),
  cost: resourceCostSchema,
  format: resourceFormatSchema,
  sourceTier: sourceTierSchema,
  purpose: resourcePurposeSchema,
  estimatedMinutes: z.number().int().positive().nullable(),
  lastVerifiedAt: dateSchema,
  skillIds: z.array(idSchema).min(1),
}).strict();

export const roleSkillSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(2).max(120),
  category: skillCategorySchema,
  importance: skillImportanceSchema,
  why: z.string().trim().min(12).max(360),
  confidence: z.number().min(0.75).max(1),
  masteryCriteria: z.array(z.string().trim().min(12).max(240)).min(2),
  prerequisiteIds: z.array(idSchema),
  resourceIds: z.array(idSchema).min(1),
}).strict();

export const rolePhaseSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(2).max(120),
  weeks: z.number().int().positive(),
  outcome: z.string().trim().min(12).max(360),
  skillIds: z.array(idSchema).min(1),
}).strict();

export const roleBlueprintSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(2).max(120),
  summary: z.string().trim().min(20).max(500),
  version: z.string().regex(/^\d{4}\.\d{2}\.\d+$/u),
  status: z.enum(["ready", "needs-review", "draft"]),
  updatedAt: dateSchema,
  languagePolicy: z.literal("english-first"),
  skills: z.array(roleSkillSchema).min(1),
  resources: z.array(learningResourceSchema).min(1),
  phases: z.array(rolePhaseSchema).min(1),
}).strict();

export type LearningResource = z.infer<typeof learningResourceSchema>;
export type RoleSkill = z.infer<typeof roleSkillSchema>;
export type RolePhase = z.infer<typeof rolePhaseSchema>;
export type RoleBlueprint = z.infer<typeof roleBlueprintSchema>;
