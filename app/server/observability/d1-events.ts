import {
  operationalEventSchema,
  type OperationalEvent,
  type OperationalEventSink,
} from "./events";

type D1EventOptions = {
  createId: () => string;
  now: () => number;
};

const defaultOptions: D1EventOptions = {
  createId: () => crypto.randomUUID(),
  now: () => Date.now(),
};

export class D1OperationalEventSink implements OperationalEventSink {
  private readonly options: D1EventOptions;

  constructor(
    private readonly db: D1Database,
    options: Partial<D1EventOptions> = {},
  ) {
    this.options = { ...defaultOptions, ...options };
  }

  async record(input: OperationalEvent): Promise<void> {
    const event = operationalEventSchema.parse(input);
    await this.db.prepare(`
      INSERT INTO operational_events (
        id, request_id, route, result_code, latency_ms,
        user_surrogate, counters_json, occurred_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    `).bind(
      this.options.createId(),
      event.requestId,
      event.route,
      event.resultCode,
      event.latencyMs,
      event.userSurrogate,
      JSON.stringify(event.counters),
      this.options.now(),
    ).run();
  }
}
