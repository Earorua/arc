export type ResearchBudgetEnvironment = {
  ARC_AI_SITE_DAILY_BUDGET_MICROS?: string;
  ARC_AI_SITE_MONTHLY_BUDGET_MICROS?: string;
  ARC_AI_RESEARCH_MAX_COST_MICROS?: string;
  ARC_AI_REPAIR_MAX_COST_MICROS?: string;
};
export type ResearchBudgetLimits = { dailyBudgetMicros: number; monthlyBudgetMicros: number; maximumMicros: number; researchMaximumMicros: number; repairMaximumMicros: number };
export type BudgetReserveCommand = Pick<ResearchBudgetLimits, "dailyBudgetMicros" | "monthlyBudgetMicros" | "maximumMicros"> & { ownerId: string; runId: string; requestId: string; expiresAt: number };
export type BudgetSettlement = { kind: "actual"; actualMicros: number } | { kind: "not-charged" } | { kind: "unknown" };
export type BudgetReservation = {
  id: string; ownerId: string; runId: string; requestId: string; dayBucketId: string; monthBucketId: string;
  maximumMicros: number; settledMicros: number; status: "reserved" | "settled" | "conservative-hold" | "released";
  expiresAt: number; createdAt: number; updatedAt: number;
};
export type BudgetBucket = { id: string; scope: "site"; periodKind: "day" | "month"; periodStart: number; reservedMicros: number; settledMicros: number; version: number; createdAt: number; updatedAt: number };
export type BudgetDecision =
  | { allowed: false; reason: "budget" }
  | { allowed: true; reservation: BudgetReservation; replayed: true; providerAttemptAllowed: false }
  | { allowed: true; reservation: BudgetReservation; replayed: false; providerAttemptAllowed: boolean };
export interface ResearchBudgetRepository {
  reserve(command: BudgetReserveCommand): Promise<BudgetDecision>;
  settle(ownerId: string, reservationId: string, settlement: BudgetSettlement): Promise<BudgetReservation>;
  readReservation(ownerId: string, reservationId: string): Promise<BudgetReservation | null>;
  findReservation(ownerId: string, runId: string, requestId: string): Promise<BudgetReservation | null>;
  readBucket(bucketId: string): Promise<BudgetBucket | null>;
}
export class ResearchBudgetError extends Error {
  constructor(readonly code: "CONFLICT" | "NOT_FOUND" | "BUDGET_UNAVAILABLE") { super(code); this.name = "ResearchBudgetError"; }
}
export function parseResearchBudgetEnvironment(environment: ResearchBudgetEnvironment): ResearchBudgetLimits | null {
  const parse = (value: unknown): number | null => typeof value === "string" && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  const dailyBudgetMicros = parse(environment.ARC_AI_SITE_DAILY_BUDGET_MICROS);
  const monthlyBudgetMicros = parse(environment.ARC_AI_SITE_MONTHLY_BUDGET_MICROS);
  const researchMaximumMicros = parse(environment.ARC_AI_RESEARCH_MAX_COST_MICROS);
  const repairMaximumMicros = parse(environment.ARC_AI_REPAIR_MAX_COST_MICROS);
  if (dailyBudgetMicros === null || monthlyBudgetMicros === null || researchMaximumMicros === null || repairMaximumMicros === null) return null;
  const maximumMicros = researchMaximumMicros + repairMaximumMicros;
  return Number.isSafeInteger(maximumMicros) ? { dailyBudgetMicros, monthlyBudgetMicros, maximumMicros, researchMaximumMicros, repairMaximumMicros } : null;
}
export class ResearchBudgetGate {
  constructor(private readonly repository: Pick<ResearchBudgetRepository, "reserve">, private readonly environment: ResearchBudgetEnvironment) {}
  async authorize(input: Omit<BudgetReserveCommand, keyof ResearchBudgetLimits>): Promise<BudgetDecision> {
    try {
      const limits = parseResearchBudgetEnvironment(this.environment);
      // Zero is valid accounting, but there is no configured free-provider mode.
      if (!limits || !limits.dailyBudgetMicros || !limits.monthlyBudgetMicros || !limits.researchMaximumMicros) return { allowed: false, reason: "budget" };
      const { dailyBudgetMicros, monthlyBudgetMicros, maximumMicros } = limits;
      return await this.repository.reserve({ ...input, dailyBudgetMicros, monthlyBudgetMicros, maximumMicros });
    } catch { return { allowed: false, reason: "budget" }; }
  }
}
