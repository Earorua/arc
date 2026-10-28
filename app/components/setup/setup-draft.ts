import { z } from "zod";
import { setupAnswersSchema } from "../../contracts/cloud-state";
import { skillSelfLevelSchema } from "../../contracts/planning";

const prefix = "arc:setup-draft:v1:";
const maxAge = 30 * 24 * 60 * 60 * 1000;
const minuteDraft = z.union([z.number().finite().min(0).max(100000), z.string().max(12)]);
export const setupSourceSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("flagship"), roleId: z.literal("ai-native-full-stack-engineer") }).strict(),
  z.object({ source: z.literal("research"), researchRunId: z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u) }).strict(),
]);
export const legacyDraftSchema = z.object({
  step: z.number().int().min(0).max(3), customRole: z.string().max(200),
  furthestStep: z.number().int().min(0).max(3).optional(),
  answers: z.object({ roleId: z.string().max(200), level: z.enum(["new", "beginner", "intermediate", "advanced"]), weeklyMinutes: z.number().finite().min(0).max(100000), targetWeeks: z.number().finite().min(0).max(100000) }).strict(),
  source: setupSourceSchema, adaptiveSelected: z.boolean(), adaptiveStarted: z.boolean(),
}).strict();
export const adaptiveDraftSchema = z.object({
  stageIndex: z.number().int().min(0).max(3),
  furthestStep: z.number().int().min(1).max(3).optional(),
  auditDraft: z.object({
    levels: z.record(z.string().max(256), skillSelfLevelSchema),
    evidence: z.record(z.string().max(256), z.array(z.object({ id: z.string().max(256), kind: z.enum(["repository", "deployment", "project", "document", "other"]), url: z.string().max(2048), note: z.string().max(300) }).strict()).max(3)),
  }).strict(),
  availabilityDraft: z.object({ timeZone: z.string().max(100), weekdays: z.object({ monday: minuteDraft, tuesday: minuteDraft, wednesday: minuteDraft, thursday: minuteDraft, friday: minuteDraft, saturday: minuteDraft, sunday: minuteDraft }).strict(), exceptions: z.array(z.object({ date: z.string().max(10), minutes: z.number().finite().min(0).max(100000), reason: z.string().max(300).nullable() }).strict()).max(90) }).strict(),
  planningInstant: z.string().datetime().optional(),
  buildAttempt: z.object({ key: z.string().max(200000), mutationId: z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u) }).strict().nullable().optional(),
  targetWeeks: z.number().finite().min(0).max(100000), selectedScope: z.enum(["full-scope", "target-date"]).nullable(),
}).strict();
export const firstCreationAttemptSchema = z.object({ mutationId: z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u), activationId: z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u), source: setupSourceSchema, setup: setupAnswersSchema, goalId: z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).optional(), phase: z.enum(["activation", "generate"]) }).strict().refine((value) => value.phase !== "generate" || Boolean(value.goalId));
export const timeEditDraftSchema = adaptiveDraftSchema.shape.availabilityDraft;
export const goalAttemptSchema = z.object({ mutationId: z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u), previousGoalId: z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u) }).strict();
export const activationAttemptSchema = z.object({ key: z.string().max(10000), id: z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u) }).strict();
export type LegacySetupDraft = z.infer<typeof legacyDraftSchema>;
const envelopeSchema = z.object({ version: z.literal(1), owner: z.string().min(1).max(300), source: z.string().max(1000), updatedAt: z.number().finite(), data: z.unknown() }).strict();
const ownerPrefix = (owner: string) => `${prefix}${encodeURIComponent(owner)}:`;
const keyFor = (owner: string, source: string) => `${ownerPrefix(owner)}${encodeURIComponent(source)}`;

export function readSetupDraft<T>(owner: string | undefined, source: string, schema: z.ZodType<T>): T | null {
  if (!owner || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(keyFor(owner, source));
    if (!raw || raw.length > 256000) return null;
    const parsed = envelopeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.owner !== owner || parsed.data.source !== source
      || Date.now() - parsed.data.updatedAt > maxAge || parsed.data.updatedAt > Date.now() + 60000) return null;
    const value = schema.safeParse(parsed.data.data);
    return value.success ? value.data : null;
  } catch { return null; }
}

export function writeSetupDraft<T>(owner: string | undefined, source: string, schema: z.ZodType<T>, data: T): boolean {
  if (!owner || typeof window === "undefined") return true;
  try {
    const value = schema.parse(data);
    const raw = JSON.stringify({ version: 1, owner, source, updatedAt: Date.now(), data: value });
    if (raw.length > 256000) return false;
    localStorage.setItem(keyFor(owner, source), raw); return true;
  } catch { return false; }
}

export function removeSetupDraft(owner: string | undefined, source: string): void {
  if (!owner || typeof window === "undefined") return;
  try { localStorage.removeItem(keyFor(owner, source)); } catch { /* Keep saved work available if browser storage fails. */ }
}

export function clearSetupDrafts(owner: string | undefined): void {
  if (!owner || typeof window === "undefined") return;
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    for (const key of keys) if (key?.startsWith(ownerPrefix(owner))) localStorage.removeItem(key);
  } catch { /* Storage failure must never affect research recovery or the saved plan. */ }
}

// Called only by the explicit guest handoff button. Research state is owned by
// its controller and is never transferred, reset, or stored in this namespace.
export function claimGuestSetupDraft(owner: string): LegacySetupDraft | null {
  if (owner === "guest") return null;
  const draft = readSetupDraft("guest", "flow", legacyDraftSchema);
  if (!draft || draft.source.source === "research") return null;
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    const copied: string[] = [];
    for (const key of keys) {
      if (!key?.startsWith(ownerPrefix("guest"))) continue;
      const source = decodeURIComponent(key.slice(ownerPrefix("guest").length));
      if (!source.startsWith("adaptive:flagship:")) continue;
      const adaptive = readSetupDraft("guest", source, adaptiveDraftSchema);
      if (adaptive && writeSetupDraft(owner, source, adaptiveDraftSchema, adaptive)) copied.push(key);
    }
    if (!writeSetupDraft(owner, "flow", legacyDraftSchema, draft)) return null;
    copied.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem(keyFor("guest", "flow"));
    return draft;
  } catch { return null; }
}

export function readPendingCreation(owner: string | undefined) {
  const attempt = readSetupDraft(owner, "first-creation", firstCreationAttemptSchema);
  const flow = readSetupDraft(owner, "flow", legacyDraftSchema);
  return attempt && flow?.adaptiveStarted && JSON.stringify(flow.source) === JSON.stringify(attempt.source) ? attempt : null;
}
