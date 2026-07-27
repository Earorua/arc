export type EntitlementPeriod = {
  startMs: number;
  endMs: number;
};

export type EntitlementUsage = {
  userAcceptedUnits: number;
  globalAcceptedUnits: number;
};

export type EntitlementFinalStatus = "accepted" | "rejected" | "failed";

export interface EntitlementRepository {
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
