import { z } from "zod";
import { SCENARIOS, parseScenarioId, type SmokeScenarioId } from "./scenarios";
export type SmokeCounter = "provider" | "repair" | "rejection";
export interface SmokeEvidence { increment(jobId: string, counter: SmokeCounter): Promise<void> }
const time = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const count = z.number().int().min(0).max(10_000);
const eventIdSchema = z.string().min(1).max(64).regex(/^cron-[0-9]{1,16}$/u);
const phaseSchema = z.enum(["start", "end"]);
const outcomeSchema = z.enum(["ok", "error"]);
const rowSchema = z.object({
  scenario_id: z.enum(["long", "after-r2", "after-d1"]), job_id: z.uuid(),
  owner_id: z.string().min(1).max(64), mutation_id: z.string().min(1).max(64), request_id: z.string().min(1).max(64),
  started_at: time, provider_calls: count, repair_calls: count, rejections: count,
  fault_marker: z.enum(["after-r2", "after-d1"]).nullable(), fault_at: time.nullable(),
}).strict();
const cronSchema = z.object({ event_id: eventIdSchema, phase: phaseSchema, at: time, outcome: outcomeSchema.nullable() }).strict()
  .refine(v => (v.phase === "start") === (v.outcome === null));
export type SmokeScenarioEvidence = Readonly<{
  scenarioId: SmokeScenarioId; jobId: string; ownerId: string; mutationId: string; requestId: string; startedAt: number;
  providerCalls: number; repairCalls: number; rejections: number; fault: Readonly<{ marker: "after-r2" | "after-d1"; at: number }> | null;
}>;
export type SmokeCronEvidence = Readonly<{ eventId: string; phase: "start" | "end"; at: number; outcome: "ok" | "error" | null }>;
function unavailable(): never { throw new Error("Smoke evidence unavailable"); }
function scenarioByJob(jobId: string) {
  const scenario = SCENARIOS.find(s => s.jobId === jobId);
  if (!scenario) return unavailable();
  return scenario;
}
function checkWrite(result: D1Result, requireChange = false): void {
  if (result.success !== true || (requireChange && result.meta.changes !== 1)) unavailable();
}
export class D1SmokeEvidence implements SmokeEvidence {
  constructor(private readonly db: D1Database) {
    if (!db || typeof db.prepare !== "function") unavailable();
  }
  async start(id: SmokeScenarioId, at: number): Promise<void> {
    const s = SCENARIOS.find(s => s.id === parseScenarioId(id))!;
    time.parse(at);
    checkWrite(await this.db.prepare(`INSERT INTO smoke_scenarios (scenario_id,job_id,owner_id,mutation_id,request_id,started_at)
      VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(scenario_id) DO NOTHING`).bind(s.id, s.jobId, s.ownerId, s.mutationId, s.requestId, at).run());
    if (!await this.read(id)) unavailable();
  }
  async read(id: SmokeScenarioId): Promise<SmokeScenarioEvidence | null> {
    const s = SCENARIOS.find(s => s.id === parseScenarioId(id))!;
    const raw = await this.db.prepare(`SELECT scenario_id,job_id,owner_id,mutation_id,request_id,started_at,
      provider_calls,repair_calls,rejections,fault_marker,fault_at FROM smoke_scenarios WHERE scenario_id=?1`).bind(s.id).first();
    if (raw === null) return null;
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) return unavailable();
    const r = parsed.data;
    if (r.job_id !== s.jobId || r.owner_id !== s.ownerId || r.mutation_id !== s.mutationId || r.request_id !== s.requestId
      || (r.fault_marker === null) !== (r.fault_at === null) || (r.fault_marker !== null && r.fault_marker !== s.id)) unavailable();
    return Object.freeze({ scenarioId: s.id, jobId: s.jobId, ownerId: s.ownerId, mutationId: s.mutationId, requestId: s.requestId,
      startedAt: r.started_at, providerCalls: r.provider_calls, repairCalls: r.repair_calls, rejections: r.rejections,
      fault: r.fault_marker === null ? null : Object.freeze({ marker: r.fault_marker, at: r.fault_at! }) });
  }
  async increment(jobId: string, counter: SmokeCounter): Promise<void> {
    const s = scenarioByJob(jobId);
    const columns = { provider: "provider_calls", repair: "repair_calls", rejection: "rejections" } as const;
    if (counter !== "provider" && counter !== "repair" && counter !== "rejection") unavailable();
    const column = columns[counter];
    checkWrite(await this.db.prepare(`UPDATE smoke_scenarios SET ${column}=${column}+1
      WHERE scenario_id=?1 AND job_id=?2 AND ${column}<10000`).bind(s.id, s.jobId).run(), true);
  }
  async markFault(jobId: string, marker: "after-r2" | "after-d1", at: number): Promise<void> {
    const s = scenarioByJob(jobId);
    if (marker !== s.id || (marker !== "after-r2" && marker !== "after-d1")) unavailable();
    time.parse(at);
    checkWrite(await this.db.prepare(`UPDATE smoke_scenarios SET fault_marker=?1,fault_at=?2
      WHERE job_id=?3 AND scenario_id=?1 AND fault_marker IS NULL`).bind(marker, at, jobId).run());
    if ((await this.read(s.id))?.fault?.marker !== marker) unavailable();
  }
  async recordCron(eventId: string, phase: "start" | "end", at: number, outcome?: "ok" | "error"): Promise<void> {
    eventIdSchema.parse(eventId); phaseSchema.parse(phase); time.parse(at);
    if (phase === "start" ? outcome !== undefined : !outcomeSchema.safeParse(outcome).success) unavailable();
    checkWrite(await this.db.prepare(`INSERT INTO smoke_cron_events(event_id,phase,at,outcome)
      SELECT ?1,?2,?3,?4 WHERE (SELECT COUNT(*) FROM smoke_cron_events)<256
        AND (?2='start' OR EXISTS (SELECT 1 FROM smoke_cron_events WHERE event_id=?1 AND phase='start' AND at<=?3))
      ON CONFLICT(event_id,phase) DO NOTHING`).bind(eventId, phase, at, outcome ?? null).run());
    const row = await this.db.prepare("SELECT event_id,phase,at,outcome FROM smoke_cron_events WHERE event_id=?1 AND phase=?2").bind(eventId, phase).first();
    const parsed = cronSchema.safeParse(row);
    if (!parsed.success || parsed.data.outcome !== (outcome ?? null)) unavailable();
  }
  async readCron(): Promise<readonly SmokeCronEvidence[]> {
    const result = await this.db.prepare("SELECT event_id,phase,at,outcome FROM smoke_cron_events ORDER BY at DESC,event_id DESC,phase LIMIT 64").all();
    if (result.success !== true || !Array.isArray(result.results) || result.results.length > 64) unavailable();
    return Object.freeze(result.results.map(raw => {
      const parsed = cronSchema.safeParse(raw); if (!parsed.success) return unavailable();
      const r = parsed.data; return Object.freeze({ eventId: r.event_id, phase: r.phase, at: r.at, outcome: r.outcome });
    }).reverse());
  }
}
