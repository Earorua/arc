import type {
  EntitlementFinalStatus,
  EntitlementPeriod,
  EntitlementRepository,
  EntitlementUsage,
} from "./repository";

type D1EntitlementOptions = {
  createId: () => string;
  now: () => number;
};

type UsageRow = { user_units: number; global_units: number };
type ReservationRow = {
  user_id: string;
  purpose: string;
  reservation_id: string;
  idempotency_key: string;
};

const defaultOptions: D1EntitlementOptions = {
  createId: () => crypto.randomUUID(),
  now: () => Date.now(),
};

export class D1EntitlementRepository implements EntitlementRepository {
  private readonly options: D1EntitlementOptions;

  constructor(
    private readonly db: D1Database,
    options: Partial<D1EntitlementOptions> = {},
  ) {
    this.options = { ...defaultOptions, ...options };
  }

  async readUsage(
    userId: string,
    purpose: string,
    period: EntitlementPeriod,
  ): Promise<EntitlementUsage> {
    const row = await this.db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN user_id = ?1 THEN units ELSE 0 END), 0) AS user_units,
        COALESCE(SUM(units), 0) AS global_units
      FROM quota_ledger
      WHERE purpose = ?2
        AND entry_kind = 'accepted'
        AND created_at >= ?3
        AND created_at < ?4
    `).bind(userId, purpose, period.startMs, period.endMs).first<UsageRow>();

    return {
      userAcceptedUnits: Number(row?.user_units ?? 0),
      globalAcceptedUnits: Number(row?.global_units ?? 0),
    };
  }

  private findReservation(userId: string, idempotencyKey: string) {
    return this.db.prepare(`
      SELECT user_id, purpose, reservation_id, idempotency_key
      FROM quota_ledger
      WHERE user_id = ?1 AND idempotency_key = ?2 AND entry_kind = 'reserved'
      LIMIT 1
    `).bind(userId, idempotencyKey).first<ReservationRow>();
  }

  async reserve(
    userId: string,
    purpose: string,
    idempotencyKey: string,
    units: number,
  ): Promise<string> {
    const replay = await this.findReservation(userId, idempotencyKey);
    if (replay) return replay.reservation_id;
    const reservationId = this.options.createId();
    try {
      await this.db.prepare(`
        INSERT INTO quota_ledger (
          id, user_id, purpose, reservation_id, idempotency_key,
          entry_kind, units, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, 'reserved', ?6, ?7)
      `).bind(
        this.options.createId(),
        userId,
        purpose,
        reservationId,
        idempotencyKey,
        units,
        this.options.now(),
      ).run();
      return reservationId;
    } catch (error) {
      const winner = await this.findReservation(userId, idempotencyKey);
      if (winner) return winner.reservation_id;
      throw error;
    }
  }

  async finalize(
    reservationId: string,
    status: EntitlementFinalStatus,
    acceptedUnits: number,
  ): Promise<void> {
    const reservation = await this.db.prepare(`
      SELECT user_id, purpose, reservation_id, idempotency_key
      FROM quota_ledger
      WHERE reservation_id = ?1 AND entry_kind = 'reserved'
      LIMIT 1
    `).bind(reservationId).first<ReservationRow>();
    if (!reservation) throw new Error("Entitlement reservation is unavailable.");

    const existing = await this.db.prepare(`
      SELECT reservation_id
      FROM quota_ledger
      WHERE user_id = ?1 AND idempotency_key = ?2 AND entry_kind = ?3
      LIMIT 1
    `).bind(reservation.user_id, reservation.idempotency_key, status).first<{ reservation_id: string }>();
    if (existing) return;

    await this.db.prepare(`
      INSERT INTO quota_ledger (
        id, user_id, purpose, reservation_id, idempotency_key,
        entry_kind, units, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    `).bind(
      this.options.createId(),
      reservation.user_id,
      reservation.purpose,
      reservation.reservation_id,
      reservation.idempotency_key,
      status,
      status === "accepted" ? Math.max(0, Math.floor(acceptedUnits)) : 0,
      this.options.now(),
    ).run();
  }
}
