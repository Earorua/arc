import { afterEach, describe, expect, it } from "vitest";
import { D1AiRunSink } from "../../app/server/ai/d1-run-recorder";
import type { AiRunRecord } from "../../app/server/ai/gateway";
import { createResearchD1, seedUser } from "../helpers/sqlite-d1";

type ResearchRecord = Extract<AiRunRecord, { purpose: "role-research" | "role-research-repair" }>;
const databases: ReturnType<typeof createResearchD1>[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function setup() {
  const db = createResearchD1(); databases.push(db); seedUser(db, "owner-a"); seedUser(db, "owner-b");
  const sink = new D1AiRunSink(db as unknown as D1Database);
  return { db, sink };
}
function record(overrides: Partial<ResearchRecord> = {}): ResearchRecord {
  return { userId: "owner-a", requestId: "attempt-research", purpose: "role-research", provider: "openrouter", model: "returned/model", promptVersion: "p-v1", inputSchemaVersion: "i-v1", outputSchemaVersion: "o-v1", status: "accepted", latencyMs: 42, errorCode: null, charged: true, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, costMicros: 15, webSearchRequests: 1 }, ...overrides };
}

describe("durable Research model audit", () => {
  it("round-trips Research and Repair independently and exact-replays without double recording", async () => {
    const { db, sink } = setup(); const first = record(); const repair = record({ requestId: "attempt-repair", purpose: "role-research-repair", model: null, usage: null, charged: "unknown" });
    await Promise.all([sink.record(first), sink.record(first)]); await sink.record(repair);
    const fresh = new D1AiRunSink(db as unknown as D1Database);
    await expect(fresh.readResearchAttempt("owner-a", first.requestId)).resolves.toEqual(first);
    await expect(fresh.readResearchAttempt("owner-a", repair.requestId)).resolves.toEqual(repair);
    await expect(fresh.readResearchAttempt("owner-b", first.requestId)).resolves.toBeNull();
    await expect(fresh.readResearchAttempt("owner-a", "absent-request")).resolves.toBeNull();
    expect(db.database.prepare("SELECT count(*) count FROM ai_runs").get()).toEqual({ count: 2 });
    expect(db.database.prepare("SELECT model FROM ai_runs WHERE request_id='attempt-repair'").get()).toEqual({ model: "unknown" });
  });

  it("rejects divergent request reuse and raw/unbounded/non-allowlisted audit fields", async () => {
    const { sink } = setup(); await sink.record(record());
    await expect(sink.record(record({ model: "different/model" }))).rejects.toMatchObject({ code: "CONFLICT" });
    for (const change of [{ content: "private prompt" }, { provider: "secret-route" }, { model: "bad model token" }, { errorCode: "raw provider error" }, { latencyMs: -1 }, { usage: { ...record().usage, raw: "secret" } }, { usage: { ...record().usage, totalTokens: 9 } }, { charged: false, usage: record().usage }, { userId: " owner-a" }]) {
      await expect(sink.record({ ...record(), requestId: "invalid-attempt", ...change } as AiRunRecord)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    }
  });

  it("rejects corrupted stored usage and wrong-purpose rows; preserves preview writes", async () => {
    const { sink, db } = setup();
    const preview = { userId: "owner-a", requestId: "attempt-preview", provider: "legacy-preview", model: "preview-model", promptVersion: "p-v1", inputSchemaVersion: "i-v1", outputSchemaVersion: "o-v1", status: "accepted" as const, latencyMs: 1, errorCode: null };
    await sink.record({ ...preview, purpose: "role-research-preview", model: "preview-model" });
    await sink.record({ ...preview, purpose: "role-research-preview", model: "legacy-replay-still-ignored" });
    await expect(sink.readResearchAttempt("owner-a", preview.requestId)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    await sink.record(record({ requestId: "research-other" }));
    db.database.prepare("UPDATE ai_runs SET usage_json=? WHERE request_id='research-other'").run('{"raw":"private"}');
    await expect(sink.readResearchAttempt("owner-a", "research-other")).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it.each([
    { status: "rejected", errorCode: "timeout" },
    { status: "failed", errorCode: "invalid-result" },
    { status: "accepted", charged: false, usage: null },
  ] as const)("rejects contradictory receipt verdict %j", async (change) => {
    const { sink } = setup();
    await expect(sink.record(record(change))).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });
});
