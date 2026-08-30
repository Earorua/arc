export type EntitlementPeriod = {
  startMs: number;
  endMs: number;
};

export type EntitlementUsage = {
  userAcceptedUnits: number;
  globalAcceptedUnits: number;
};

export type EntitlementFinalStatus = "accepted" | "rejected" | "failed";

export const RESEARCH_QUOTA_PURPOSE = "role-research";
export type ResearchQuotaAdmission = {
  userId: string; purpose: string; idempotencyKey: string; units: number;
  dailyQuota: number; period: EntitlementPeriod;
};
export type ResearchQuotaDecision =
  | { allowed: false; reason: "quota" }
  | { allowed: true; reservationId: string; replayed: boolean; finalStatus: EntitlementFinalStatus | null };

export class EntitlementRepositoryError extends Error {
  constructor(readonly code: "CONFLICT" | "ENTITLEMENT_UNAVAILABLE") { super(code); this.name = "EntitlementRepositoryError"; }
}

export interface EntitlementRepository {
  // Optional for legacy preview adapters; Research must never fall back to reserve.
  admitResearch?(command: ResearchQuotaAdmission): Promise<ResearchQuotaDecision>;
  readUsage(
    userId: string,
    purpose: string,
    period: EntitlementPeriod,
  ): Promise<EntitlementUsage>;
  reserve(
    userId: string,
    purpose: string,
    idempotencyKey: string,
    units: number,
  ): Promise<string>;
  finalize(
    reservationId: string,
    status: EntitlementFinalStatus,
    acceptedUnits: number,
  ): Promise<void>;
}
