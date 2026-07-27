import type { AiRunRecord, AiRunSink } from "./gateway";

type D1RunOptions = {
  createId: () => string;
  now: () => number;
};

const defaultOptions: D1RunOptions = {
  createId: () => crypto.randomUUID(),
  now: () => Date.now(),
};

export class D1AiRunSink implements AiRunSink {
  private readonly options: D1RunOptions;

  constructor(
    private readonly db: D1Database,
    options: Partial<D1RunOptions> = {},
  ) {
    this.options = { ...defaultOptions, ...options };
  }

  async record(record: AiRunRecord): Promise<void> {
    await this.db.prepare(`
      INSERT INTO ai_runs (
        id, user_id, request_id, purpose, provider, model,
        prompt_version, input_schema_version, output_schema_version,
        status, usage_json, latency_ms, error_code, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, '{}', ?11, ?12, ?13)
      ON CONFLICT(user_id, request_id) DO NOTHING
    `).bind(
      this.options.createId(),
      record.userId,
      record.requestId,
      record.purpose,
      record.provider,
      record.model,
      record.promptVersion,
      record.inputSchemaVersion,
      record.outputSchemaVersion,
      record.status,
      record.latencyMs,
      record.errorCode,
      this.options.now(),
    ).run();
  }
}
