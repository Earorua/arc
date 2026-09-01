import { z } from "zod";
import { EntitlementRepositoryError, RESEARCH_QUOTA_PURPOSE, type ResearchQuotaDecision, type ResearchQuotaReservation } from "./repository";
import type {
  EntitlementFinalStatus,
  EntitlementRepository,
} from "./repository";

export type EntitlementDecision =
  | { allowed: true; reservationId: string }
  | { allowed: false; reason: "disabled" | "cohort" | "quota" | "rate" | "budget" };

export type EntitlementEnvironment = {
  ARC_AI_ENABLED?: string;
  ARC_AI_USER_DAILY_QUOTA?: string;
  ARC_AI_GLOBAL_DAILY_BUDGET_UNITS?: string;
  ARC_AI_RATE_LIMIT_PER_MINUTE?: string;
};

const policySchema = z.object({
  ARC_AI_ENABLED: z.enum(["true", "false"]).transform((value) => value === "true"),
  ARC_AI_USER_DAILY_QUOTA: z.coerce.number().int().min(0).max(100_000),
  ARC_AI_GLOBAL_DAILY_BUDGET_UNITS: z.coerce.number().int().min(0).max(10_000_000),
  ARC_AI_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).max(10_000),
}).strict();

const decimalInteger = (maximum: number) => z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(maximum));
const researchPolicySchema = z.object({
  ARC_AI_ENABLED: z.enum(["true", "false"]),
  ARC_AI_USER_DAILY_QUOTA: decimalInteger(100_000),
  ARC_AI_RATE_LIMIT_PER_MINUTE: decimalInteger(10_000),
});

const entitlementRequestSchema = z.object({
  userId: z.string().trim().min(1).max(160),
  purpose: z.string().trim().min(1).max(120),
  idempotencyKey: z.string().trim().min(8).max(128),
  units: z.number().int().min(1).max(1000),
  cohortEnabled: z.boolean(),
  rateAllowed: z.boolean(),
}).strict();

type EntitlementRequest = z.infer<typeof entitlementRequestSchema>;
type EntitlementOptions = { now: () => Date };

function utcDay(date: Date) {
  const startMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return { startMs, endMs: startMs + 24 * 60 * 60 * 1000 };
}

export class EntitlementGate {
  private readonly options: EntitlementOptions;

  constructor(
    private readonly repository: EntitlementRepository,
    private readonly environment: EntitlementEnvironment,
    options: Partial<EntitlementOptions> = {},
  ) {
    this.options = { now: () => new Date(), ...options };
  }

  async authorize(input: unknown): Promise<EntitlementDecision> {
    const policy = policySchema.safeParse(this.environment);
    const request = entitlementRequestSchema.safeParse(input);
    if (!policy.success || !request.success || !policy.data.ARC_AI_ENABLED || request.data.purpose === RESEARCH_QUOTA_PURPOSE) {
      return { allowed: false, reason: "disabled" };
    }
    if (!request.data.cohortEnabled) return { allowed: false, reason: "cohort" };
    if (!request.data.rateAllowed || policy.data.ARC_AI_RATE_LIMIT_PER_MINUTE === 0) {
      return { allowed: false, reason: "rate" };
    }

    try {
      const usage = await this.repository.readUsage(
        request.data.userId,
        request.data.purpose,
        utcDay(this.options.now()),
      );
      if (usage.userAcceptedUnits + request.data.units > policy.data.ARC_AI_USER_DAILY_QUOTA) {
        return { allowed: false, reason: "quota" };
      }
      if (usage.globalAcceptedUnits + request.data.units > policy.data.ARC_AI_GLOBAL_DAILY_BUDGET_UNITS) {
        return { allowed: false, reason: "budget" };
      }
      const reservationId = await this.repository.reserve(
        request.data.userId,
        request.data.purpose,
        request.data.idempotencyKey,
        request.data.units,
      );
      return { allowed: true, reservationId };
    } catch {
      return { allowed: false, reason: "disabled" };
    }
  }

  async authorizeResearch(input: unknown): Promise<ResearchQuotaDecision | Exclude<EntitlementDecision, { allowed: true }>> {
    const policy = researchPolicySchema.safeParse(this.environment);
    const request = entitlementRequestSchema.safeParse(input);
    if (!policy.success || !request.success || policy.data.ARC_AI_ENABLED !== "true" || request.data.purpose !== RESEARCH_QUOTA_PURPOSE || request.data.units !== 1) return { allowed: false, reason: "disabled" };
    if (!request.data.cohortEnabled) return { allowed: false, reason: "cohort" };
    if (!request.data.rateAllowed || !policy.data.ARC_AI_RATE_LIMIT_PER_MINUTE) return { allowed: false, reason: "rate" };
    if (!this.repository.admitResearch) return { allowed: false, reason: "disabled" };
    try {
      return await this.repository.admitResearch({ userId: request.data.userId, purpose: request.data.purpose, idempotencyKey: request.data.idempotencyKey, units: 1, dailyQuota: policy.data.ARC_AI_USER_DAILY_QUOTA, period: utcDay(this.options.now()) });
    } catch { return { allowed: false, reason: "disabled" }; }
  }

  finalize(
    reservationId: string,
    status: EntitlementFinalStatus,
    acceptedUnits: number,
  ): Promise<void> {
    return this.repository.finalize(reservationId, status, acceptedUnits);
  }

  // Recovery is owner-bound, but deliberately independent of today's admission policy.
  async readResearchReservation(userId: string, idempotencyKey: string): Promise<ResearchQuotaReservation | null> {
    try {
      const identity = z.string().min(1).max(160).refine((value) => value === value.trim() && !value.includes("\0"));
      identity.parse(userId); identity.min(8).max(128).parse(idempotencyKey);
      if (!this.repository.readResearchReservation) throw new Error();
      const row = await this.repository.readResearchReservation(userId, idempotencyKey);
      return row === null ? null : z.object({ reservationId: identity, createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), finalStatus: z.enum(["accepted", "rejected", "failed"]).nullable() }).strict().parse(row);
    } catch { throw new EntitlementRepositoryError("ENTITLEMENT_UNAVAILABLE"); }
  }
}

export type EntitlementAuthorizer = Pick<EntitlementGate, "authorize" | "finalize">;
export type { EntitlementRequest };
