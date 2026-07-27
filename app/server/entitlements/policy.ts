import { z } from "zod";
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
    if (!policy.success || !request.success || !policy.data.ARC_AI_ENABLED) {
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

  finalize(
    reservationId: string,
    status: EntitlementFinalStatus,
    acceptedUnits: number,
  ): Promise<void> {
    return this.repository.finalize(reservationId, status, acceptedUnits);
  }
}

export type EntitlementAuthorizer = Pick<EntitlementGate, "authorize" | "finalize">;
export type { EntitlementRequest };
