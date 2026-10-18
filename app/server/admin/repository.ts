import { z } from "zod";

const boundedIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const adminResearchHealthSchema = z.object({
  queued: boundedIntegerSchema,
  researching: boundedIntegerSchema,
  validating: boundedIntegerSchema,
  ready: boundedIntegerSchema,
  needsReview: boundedIntegerSchema,
  failed: boundedIntegerSchema,
  reservedMicros: boundedIntegerSchema,
  settledMicros: boundedIntegerSchema,
  conservativeHoldMicros: boundedIntegerSchema,
}).strict();

export const adminHealthSnapshotSchema = z.object({
  service: z.enum(["ok", "degraded"]),
  ai: z.object({
    enabled: z.boolean(),
    callsToday: boundedIntegerSchema,
    acceptedToday: boundedIntegerSchema,
    budgetUnitsToday: boundedIntegerSchema,
  }).strict(),
  research: adminResearchHealthSchema,
  migrations: z.object({
    pending: boundedIntegerSchema,
    failed24h: boundedIntegerSchema,
    completed24h: boundedIntegerSchema,
  }).strict(),
  failures: z.array(z.object({
    requestId: z.string().min(1).max(160),
    route: z.string().min(1).max(160),
    code: z.string().min(1).max(64),
    occurredAt: z.string().max(32).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
  }).strict()).max(12),
}).strict();

export type AdminHealthSnapshot = z.infer<typeof adminHealthSnapshotSchema>;

export interface AdminRepository {
  getHealthSnapshot(): Promise<AdminHealthSnapshot>;
}
