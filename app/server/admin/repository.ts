export type AdminHealthSnapshot = {
  service: "ok" | "degraded";
  ai: {
    enabled: boolean;
    callsToday: number;
    acceptedToday: number;
    budgetUnitsToday: number;
  };
  migrations: { pending: number; failed24h: number; completed24h: number };
  failures: Array<{ requestId: string; route: string; code: string; occurredAt: string }>;
};

export interface AdminRepository {
  getHealthSnapshot(): Promise<AdminHealthSnapshot>;
}
