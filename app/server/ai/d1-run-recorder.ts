import { z } from "zod";
import type { AiRunRecord, AiRunSink, ResearchAiRunReader, ResearchAiRunRecord } from "./gateway";
import { providerUsageSchema } from "../../contracts/research";
import { canonicalJson } from "../../lib/planning/fingerprint";
import { readBoundedResearchJson } from "../research/source-audit";
import { ResearchRepositoryError } from "../research/repository";

const identity = z.string().min(1).max(160).refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));
const version = identity.max(64);
const researchSchema = z.object({
  userId: identity, requestId: identity, purpose: z.enum(["role-research", "role-research-repair"]),
  provider: z.enum(["openrouter", "deterministic-mock"]), model: z.string().max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/u).nullable(),
  promptVersion: version, inputSchemaVersion: version, outputSchemaVersion: version,
  status: z.enum(["accepted", "rejected", "failed"]), latencyMs: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  errorCode: z.enum(["repair-required", "invalid-result", "missing-key", "timeout", "rate", "balance", "unavailable", "filtered", "invalid-transport"]).nullable(),
  usage: providerUsageSchema.nullable(), charged: z.union([z.boolean(), z.literal("unknown")]),
}).strict().superRefine((record, context) => {
  if ((record.charged === false && record.usage !== null && record.usage.costMicros !== 0)
    || (record.status === "accepted" && record.errorCode !== null)
    || (record.status !== "accepted" && record.errorCode === null)
    || (record.status !== "failed" && record.charged === false)
    || (record.status === "rejected" && record.errorCode !== "invalid-result" && record.errorCode !== "repair-required")
    || (record.status === "failed" && (record.errorCode === "invalid-result" || record.errorCode === "repair-required"))
    || (record.errorCode === "repair-required" && (record.purpose !== "role-research" || record.status !== "rejected"))) context.addIssue({ code: "custom", message: "Inconsistent Research receipt" });
});
const usageEnvelope = z.object({ usage: providerUsageSchema.nullable(), charged: z.union([z.boolean(), z.literal("unknown")]), modelKnown: z.boolean() }).strict();
function validate(value: unknown): ResearchAiRunRecord {
  try { return researchSchema.parse(readBoundedResearchJson(value)); }
  catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
}

type D1RunOptions = {
  createId: () => string;
  now: () => number;
};

const defaultOptions: D1RunOptions = {
  createId: () => crypto.randomUUID(),
  now: () => Date.now(),
};

export class D1AiRunSink implements AiRunSink, ResearchAiRunReader {
  private readonly options: D1RunOptions;

  constructor(
    private readonly db: D1Database,
    options: Partial<D1RunOptions> = {},
  ) {
    this.options = { ...defaultOptions, ...options };
  }

  async record(record: AiRunRecord): Promise<void> {
    if (record.purpose !== "role-research-preview") return this.recordResearch(validate(record));
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

  async readResearchAttempt(userId: string, requestId: string): Promise<ResearchAiRunRecord | null> {
    try {
      identity.parse(userId); identity.parse(requestId);
      const row = await this.db.prepare("SELECT * FROM ai_runs WHERE user_id=?1 AND request_id=?2").bind(userId, requestId).first<Record<string, unknown>>();
      if (!row) return null;
      if (typeof row.usage_json !== "string" || row.usage_json.length > 2048) throw new Error();
      const usage = usageEnvelope.parse(JSON.parse(row.usage_json));
      if (!usage.modelKnown && row.model !== "unknown") throw new Error();
      return validate({ userId: row.user_id, requestId: row.request_id, purpose: row.purpose, provider: row.provider, model: usage.modelKnown ? row.model : null, promptVersion: row.prompt_version, inputSchemaVersion: row.input_schema_version, outputSchemaVersion: row.output_schema_version, status: row.status, latencyMs: row.latency_ms, errorCode: row.error_code, usage: usage.usage, charged: usage.charged });
    } catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
  }

  private async recordResearch(record: ResearchAiRunRecord): Promise<void> {
    try {
      await this.db.prepare(`INSERT INTO ai_runs (id,user_id,request_id,purpose,provider,model,prompt_version,input_schema_version,output_schema_version,status,usage_json,latency_ms,error_code,created_at)
        VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14) ON CONFLICT(user_id,request_id) DO NOTHING`).bind(
        this.options.createId(), record.userId, record.requestId, record.purpose, record.provider, record.model ?? "unknown", record.promptVersion, record.inputSchemaVersion, record.outputSchemaVersion, record.status,
        canonicalJson({ usage: record.usage, charged: record.charged, modelKnown: record.model !== null }), record.latencyMs, record.errorCode, this.options.now(),
      ).run();
      const saved = await this.readResearchAttempt(record.userId, record.requestId);
      if (!saved) throw new Error();
      if (canonicalJson(saved) !== canonicalJson(record)) throw new ResearchRepositoryError("CONFLICT");
    } catch (error) {
      if (error instanceof ResearchRepositoryError) throw error;
      throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    }
  }
}
