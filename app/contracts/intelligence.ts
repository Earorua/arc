import { z } from "zod";

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1]!;
}

function isIpLiteral(hostname: string): boolean {
  if (hostname.includes(":")) return true;
  const octets = hostname.split(".");
  return octets.length === 4
    && octets.every((octet) => /^\d{1,3}$/u.test(octet) && Number(octet) <= 255);
}

const nonPublicDnsSuffixes = ["internal", "test", "invalid", "example", "home.arpa"];

function hasNonPublicDnsSuffix(hostname: string): boolean {
  return nonPublicDnsSuffixes.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.+$/u, "");
    return url.protocol === "https:"
      && url.username === ""
      && url.password === ""
      && hostname !== "localhost"
      && !hostname.endsWith(".localhost")
      && hostname !== "local"
      && !hostname.endsWith(".local")
      && hostname.includes(".")
      && !hasNonPublicDnsSuffix(hostname)
      && !isIpLiteral(hostname);
  } catch {
    return false;
  }
}

export const calendarDateSchema = z.string().refine(isCalendarDate, "Invalid calendar date");
export const publicHttpsUrlSchema = z.string().url().refine(isPublicHttpsUrl, "Public HTTPS URL required");

export function isIanaTimeZoneIdentifier(value: string): boolean {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z][A-Za-z0-9._+-]*)*$/u.test(value);
}

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
  url: publicHttpsUrlSchema,
  provider: z.string().trim().min(2).max(120),
  language: z.enum(["en", "zh-CN"]),
  cost: resourceCostSchema,
  format: resourceFormatSchema,
  sourceTier: sourceTierSchema,
  purpose: resourcePurposeSchema,
  estimatedMinutes: z.number().int().positive().nullable(),
  lastVerifiedAt: calendarDateSchema,
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
  updatedAt: calendarDateSchema,
  languagePolicy: z.literal("english-first"),
  skills: z.array(roleSkillSchema).min(1),
  resources: z.array(learningResourceSchema).min(1),
  phases: z.array(rolePhaseSchema).min(1),
}).strict();

export type LearningResource = z.infer<typeof learningResourceSchema>;
export type RoleSkill = z.infer<typeof roleSkillSchema>;
export type RolePhase = z.infer<typeof rolePhaseSchema>;
export type RoleBlueprint = z.infer<typeof roleBlueprintSchema>;
export type CalendarDate = z.infer<typeof calendarDateSchema>;
export type PublicHttpsUrl = z.infer<typeof publicHttpsUrlSchema>;
