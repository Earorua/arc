import { z } from "zod";
import { researchRecoverRequestSchema, researchRequestSchema, researchPackageSchema } from "../contracts/research";

export const RESEARCH_RECOVERY_STORAGE_KEY = "arc:role-research:v2";
export const LEGACY_RESEARCH_RECOVERY_STORAGE_KEY = "arc:role-research:v1";
export const RESEARCH_RECOVERY_MAX_BYTES = 2_048;

export type ResearchRecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const ownerHintSchema = z.string().regex(/^owner-[0-9a-f]{16}$/u);
const pendingSchema = z.object({
  version: z.literal(2),
  ownerHint: ownerHintSchema,
  state: z.literal("pending"),
  recovery: researchRecoverRequestSchema,
}).strict();
const knownSchema = z.object({
  version: z.literal(2),
  ownerHint: ownerHintSchema,
  state: z.literal("known"),
  runId: researchPackageSchema.shape.id,
  role: researchRequestSchema.shape.role,
  locale: researchRequestSchema.shape.locale,
}).strict();
const recoveryStorageSchema = z.discriminatedUnion("state", [pendingSchema, knownSchema]);
const legacySchema = z.object({
  runId: researchPackageSchema.shape.id,
  role: researchRequestSchema.shape.role,
  locale: researchRequestSchema.shape.locale,
}).strict();

export type PendingResearchRecovery = z.infer<typeof pendingSchema>;
export type KnownResearchRecovery = z.infer<typeof knownSchema>;
export type ResearchRecoveryRecord = z.infer<typeof recoveryStorageSchema>;
export type LegacyResearchRecovery = z.infer<typeof legacySchema>;
export type StorageReadResult<T> = { status: "found"; record: T } | { status: "absent" } | { status: "unavailable" };

const utf8Size = (value: string) => new TextEncoder().encode(value).byteLength;

function ownerHint(ownerId: string) {
  // This value is only a compact account-change hint; the server remains the
  // authority. Two independent 32-bit hashes avoid storing the account ID.
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const byte of new TextEncoder().encode(ownerId)) {
    first = Math.imul(first ^ byte, 0x01000193) >>> 0;
    second = Math.imul(second ^ byte, 0x85ebca6b) >>> 0;
  }
  return `owner-${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

export function createPendingResearchRecovery(ownerId: string, recovery: PendingResearchRecovery["recovery"]): PendingResearchRecovery {
  return pendingSchema.parse({ version: 2, ownerHint: ownerHint(ownerId), state: "pending", recovery });
}

export function createKnownResearchRecovery(ownerId: string, identity: Omit<KnownResearchRecovery, "version" | "ownerHint" | "state">): KnownResearchRecovery {
  return knownSchema.parse({ version: 2, ownerHint: ownerHint(ownerId), state: "known", ...identity });
}

function remove(storage: ResearchRecoveryStorage, key: string) {
  try { storage.removeItem(key); } catch { /* The in-memory mask remains authoritative for rendering. */ }
}

export function readResearchRecovery(storage: ResearchRecoveryStorage, ownerId: string): StorageReadResult<ResearchRecoveryRecord> {
  let raw: string | null;
  try { raw = storage.getItem(RESEARCH_RECOVERY_STORAGE_KEY); }
  catch { return { status: "unavailable" }; }
  if (raw === null) return { status: "absent" };
  if (utf8Size(raw) > RESEARCH_RECOVERY_MAX_BYTES) {
    remove(storage, RESEARCH_RECOVERY_STORAGE_KEY);
    return { status: "absent" };
  }
  try {
    const parsed = recoveryStorageSchema.safeParse(JSON.parse(raw) as unknown);
    if (parsed.success && parsed.data.ownerHint === ownerHint(ownerId)) return { status: "found", record: parsed.data };
  } catch { /* Invalid browser data is discarded below. */ }
  remove(storage, RESEARCH_RECOVERY_STORAGE_KEY);
  return { status: "absent" };
}

export function readLegacyResearchRecovery(storage: ResearchRecoveryStorage): StorageReadResult<LegacyResearchRecovery> {
  let raw: string | null;
  try { raw = storage.getItem(LEGACY_RESEARCH_RECOVERY_STORAGE_KEY); }
  catch { return { status: "unavailable" }; }
  if (raw === null) return { status: "absent" };
  if (utf8Size(raw) > RESEARCH_RECOVERY_MAX_BYTES) {
    remove(storage, LEGACY_RESEARCH_RECOVERY_STORAGE_KEY);
    return { status: "absent" };
  }
  try {
    const parsed = legacySchema.safeParse(JSON.parse(raw) as unknown);
    if (parsed.success) return { status: "found", record: parsed.data };
  } catch { /* Invalid browser data is discarded below. */ }
  remove(storage, LEGACY_RESEARCH_RECOVERY_STORAGE_KEY);
  return { status: "absent" };
}

export function saveResearchRecovery(storage: ResearchRecoveryStorage, record: ResearchRecoveryRecord) {
  const parsed = recoveryStorageSchema.safeParse(record);
  if (!parsed.success) return false;
  const serialized = JSON.stringify(parsed.data);
  if (utf8Size(serialized) > RESEARCH_RECOVERY_MAX_BYTES) return false;
  try {
    storage.setItem(RESEARCH_RECOVERY_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export function removeLegacyResearchRecovery(storage: ResearchRecoveryStorage) {
  remove(storage, LEGACY_RESEARCH_RECOVERY_STORAGE_KEY);
}

export function clearResearchRecovery(storage: ResearchRecoveryStorage) {
  remove(storage, RESEARCH_RECOVERY_STORAGE_KEY);
  remove(storage, LEGACY_RESEARCH_RECOVERY_STORAGE_KEY);
}
