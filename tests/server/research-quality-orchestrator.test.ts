import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchOrchestrator, type ResearchOrchestratorDependencies } from "../../app/server/research/orchestrator";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1ResearchBudgetRepository } from "../../app/server/research/d1-budget-repository";
import { D1EntitlementRepository } from "../../app/server/entitlements/d1-entitlement-repository";
import { D1AiRunSink } from "../../app/server/ai/d1-run-recorder";
import { EntitlementGate } from "../../app/server/entitlements/policy";
import { RESEARCH_PROVIDER_VERSIONS, ResearchProviderError, type ProviderResearchResult } from "../../app/server/research/provider";
import { researchCandidateSchema, researchRunPublicViewSchema } from "../../app/contracts/research";
import type { ResearchQualityDiagnosticObserver } from "../../app/server/research/quality-diagnostic";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createResearchD1, seedUser } from "../helpers/sqlite-d1";

const day = Date.parse("2026-08-31T00:00:00Z");
const context = { cohortEnabled: true, rateAllowed: true };
const input = { mutationId: "mutation-first", role: "Data Product Manager", locale: "en-US" as const };
const config = { configFingerprint: "trusted-config-v1", providerName: "openrouter" as const,
  versions: { ...RESEARCH_PROVIDER_VERSIONS, blueprintVersion: "2026.08.1", registryVersion: "2026.08.1", templateVersion: "2026.08.1" },
  activeTtlMs: 60_000, cacheDays: 7,
  budget: { dailyBudgetMicros: 10_000, monthlyBudgetMicros: 100_000, maximumMicros: 1200, researchMaximumMicros: 1000, repairMaximumMicros: 200 },
};
function output(costMicros = 110, overrides: Partial<ProviderResearchResult> = {}): ProviderResearchResult {
  return { content: JSON.stringify(validResearchCandidate), candidate: researchCandidateSchema.parse(validResearchCandidate), annotations: structuredClone(validAnnotations), actualModel: "actual/research", usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, costMicros, webSearchRequests: 1 }, ...overrides };
}
const databases: ReturnType<typeof createResearchD1>[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const db of databases.splice(0)) db.close(); });
function setup() {
  const db = createResearchD1(); databases.push(db); seedUser(db, "owner-a"); seedUser(db, "owner-b");
  let now = day + 1000; let serial = 0;
  const provider = { research: vi.fn(async () => output()), repair: vi.fn(async () => output(30, { actualModel: "actual/repair" })) };
  const fresh = (overrides: Partial<ResearchOrchestratorDependencies> = {}, disabled = false) => {
    const d1 = db as unknown as D1Database;
    const repository = new D1ResearchRepository(d1, { now: () => now, createId: () => `synthetic-id-${++serial}` });
    const budget = new D1ResearchBudgetRepository(d1, { now: () => now, createId: () => `synthetic-budget-${++serial}` });
    const quota = new D1EntitlementRepository(d1, { now: () => now, createId: () => `synthetic-quota-${++serial}` });
    const entitlements = new EntitlementGate(quota, { ARC_AI_ENABLED: disabled ? "false" : "true", ARC_AI_USER_DAILY_QUOTA: "10", ARC_AI_RATE_LIMIT_PER_MINUTE: "5" }, { now: () => new Date(now) });
    const audits = new D1AiRunSink(d1, { now: () => now, createId: () => `synthetic-audit-${++serial}` });
    const dependencies = { repository, budget, entitlements, audits, provider, config: structuredClone(config), now: () => now, createRequestId: () => "synthetic-request", ...overrides };
    return { orchestrator: new ResearchOrchestrator(dependencies), dependencies, repository, budget, quota, audits, entitlements };
  };
  return { db, provider, fresh, setNow: (value: number) => { now = value; }, ...fresh() };
}
type Fixture = ReturnType<typeof setup>;
function ledger(f: Fixture) {
  return { quotas: f.db.database.prepare("SELECT reservation_id,entry_kind,units,created_at FROM quota_ledger ORDER BY created_at,entry_kind").all(),
    costs: f.db.database.prepare("SELECT id,request_id,status,maximum_reserved_micros,settled_micros,day_bucket_id,month_bucket_id FROM ai_budget_reservations").all(),
    audits: f.db.database.prepare("SELECT request_id,purpose,status,error_code,model FROM ai_runs ORDER BY purpose").all() };
}

const privateFields = /researchQualityDiagnostic|quality-diagnostic-v1|semantic-validation|blueprintSchema|registrySchema|blueprintIssueCodes|registryIssueCodes|evidenceIssueCodes/u;
async function lifecycle(observer?: ResearchQualityDiagnosticObserver) {
  const f = setup();
  const orchestrator = f.fresh({ onQualityDiagnostic: observer }).orchestrator;
  const result = await orchestrator.start("owner-a", input, context);
  expect(result.state).toBe("ready");
  expect(researchRunPublicViewSchema.safeParse(result).success).toBe(true);
  const before = ledger(f);
  const again = await orchestrator.start("owner-a", input, context);
  const read = await orchestrator.get("owner-a", result.id);
  const wrongRead = await orchestrator.get("owner-b", result.id);
  await expect(f.repository.resolveReadyPackage("owner-b", result.id)).rejects.toBeDefined();
  const packageValue = await f.repository.resolveReadyPackage("owner-a", result.id);
  expect(again).toEqual(result); expect(read).toEqual(result); expect(wrongRead).toBeNull();
  expect(ledger(f)).toEqual(before);
  expect(f.provider.research).toHaveBeenCalledTimes(1); expect(f.provider.repair).not.toHaveBeenCalled();
  expect(before.costs).toEqual([expect.objectContaining({ settled_micros: 110, status: "settled" })]);
  const durable = Object.fromEntries(["research_runs", "research_packages", "ai_runs", "quota_ledger", "ai_budget_reservations", "ai_budget_buckets", "idempotency_records"].map((table) =>
    [table, f.db.database.prepare(`SELECT * FROM ${table}`).all()]));
  expect(JSON.stringify({ result, packageValue, durable })).not.toMatch(privateFields);
  f.db.close(); databases.splice(databases.indexOf(f.db), 1);
  expect(() => f.db.database.prepare("SELECT 1")).toThrow();
  return { result, ledger: before, durable, packageValue, wrongRead, again, read, disposed: true };
}

describe("first Research quality observer integration", () => {
  it.each(["observe", "throw", "reject", "pending", "mutate"] as const)("keeps complete result, accounting, ownership, replay and cleanup equivalent for %s", async (mode) => {
    const baseline = await lifecycle();
    let observed: unknown;
    const observer = vi.fn<ResearchQualityDiagnosticObserver>((diagnostic) => {
      observed = structuredClone(diagnostic);
      if (mode === "throw") throw Error("synthetic observer failure");
      if (mode === "reject") return Promise.reject(Error("synthetic async failure"));
      if (mode === "pending") return new Promise(() => {});
      if (mode === "mutate") { diagnostic.blueprintIssueCodes.push("prerequisite-cycle"); diagnostic.registrySchema.issues.push({ scope: "root", code: "other" }); }
    });
    expect(await lifecycle(observer)).toEqual(baseline);
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observed).toMatchObject({ version: "quality-diagnostic-v1", stage: "semantic-validation", blueprintIssueCodes: [], registryIssueCodes: [], evidenceIssueCodes: [] });
  });

  it("emits nothing for cache, mutation replay or repeated read after the first validation", async () => {
    const f = setup(); const observer = vi.fn();
    const orchestrator = f.fresh({ onQualityDiagnostic: observer }).orchestrator;
    const first = await orchestrator.start("owner-a", input, context);
    expect(observer).toHaveBeenCalledTimes(1); observer.mockClear();
    const before = ledger(f);
    expect(await orchestrator.start("owner-a", input, context)).toEqual(first);
    expect(await orchestrator.get("owner-a", first.id)).toEqual(first);
    expect(await orchestrator.get("owner-b", first.id)).toBeNull();
    const cached = await f.fresh({ onQualityDiagnostic: observer }, true).orchestrator.start("owner-b", { ...input, mutationId: "mutation-cached" }, { cohortEnabled: false, rateAllowed: false });
    expect(cached.state).toBe("ready"); expect(observer).not.toHaveBeenCalled();
    expect(ledger(f)).toEqual(before); expect(f.provider.research).toHaveBeenCalledTimes(1);
  });

  it.each(["trailing-comma", "numeric-schema"])("does not observe mechanical helper or synthetic Repair for %s", async (mode) => {
    const f = setup(); const observer = vi.fn();
    const content = mode === "trailing-comma" ? JSON.stringify(validResearchCandidate).replace(/}$/, ",}") : JSON.stringify(validResearchCandidate).replace(/"weeks":(\d+)/u, '"weeks":"$1"');
    f.provider.research.mockResolvedValue(output(110, { content, candidate: null }));
    const result = await f.fresh({ onQualityDiagnostic: observer }).orchestrator.start("owner-a", input, context);
    expect(result.state).toBe("ready"); expect(observer).not.toHaveBeenCalled();
    expect(f.provider.research).toHaveBeenCalledTimes(1); expect(f.provider.repair).toHaveBeenCalledTimes(1);
    expect(ledger(f).costs).toEqual([expect.objectContaining({ status: "settled", settled_micros: 140 })]);
    expect(ledger(f).audits).toHaveLength(2);
  });

  it.each(["unverified-free-access", "unverified-source-authority"] as const)("settles %s without repair or a plannable package", async issue => {
    const f = setup(); const observer = vi.fn();
    const candidate = researchCandidateSchema.parse(validResearchCandidate);
    candidate.resources[0]!.format = "course";
    candidate.resources[0]!.title = issue === "unverified-free-access" ? "Data product course — free trial" : "Data product course";
    candidate.resources[0]!.url = issue === "unverified-free-access" ? "https://developers.google.com/machine-learning/crash-course" : "https://www.woshipm.com/online/3569229.html";
    candidate.resources[0]!.provider = issue === "unverified-free-access" ? "Google" : "人人都是产品经理";
    const annotations: { type: "url_citation"; url: string; title: string }[] = structuredClone(validAnnotations);
    annotations[0]!.url = candidate.resources[0]!.url;
    f.provider.research.mockResolvedValue(output(110, { candidate, content: JSON.stringify(candidate), annotations }));
    const active = f.fresh({ onQualityDiagnostic: observer });
    const result = await active.orchestrator.start("owner-a", input, context);
    expect(result).toMatchObject({ state: "needs-review", quality: { issueCodes: [issue] } });
    expect(observer).toHaveBeenCalledOnce();
    expect(observer.mock.calls[0]![0].evidenceIssueCodes).toContain(issue);
    expect(f.provider.research).toHaveBeenCalledOnce();
    expect(f.provider.repair).not.toHaveBeenCalled();
    await expect(active.repository.resolveReadyPackage("owner-a", result.id)).rejects.toBeDefined();
    expect(ledger(f).costs).toEqual([expect.objectContaining({ settled_micros: 110, status: "settled" })]);
  });

  it("observes semantic rejection once without a helper or Repair observation", async () => {
    const f = setup(); const observer = vi.fn(); const candidate = researchCandidateSchema.parse(validResearchCandidate);
    candidate.prerequisiteEdges.push({ skillId: "data-modeling", prerequisiteSkillId: "experimentation" });
    f.provider.research.mockResolvedValue(output(110, { content: JSON.stringify(candidate) }));
    const result = await f.fresh({ onQualityDiagnostic: observer }).orchestrator.start("owner-a", input, context);
    expect(result).toMatchObject({ state: "needs-review", quality: { issueCodes: expect.arrayContaining(["invalid-graph"]) } });
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.calls[0]![0].blueprintIssueCodes).toContain("prerequisite-cycle");
    expect(f.provider.repair).not.toHaveBeenCalled();
    expect(ledger(f).costs).toEqual([expect.objectContaining({ settled_micros: 110, status: "settled" })]);
  });

  it.each(["provider", "annotation", "candidate", "source", "lease-before"])("emits no semantic observation on early %s failure", async (mode) => {
    const f = setup(); const observer = vi.fn(); const candidate = researchCandidateSchema.parse(validResearchCandidate);
    if (mode === "provider") f.provider.research.mockRejectedValue(new ResearchProviderError("timeout", false, false));
    if (mode === "annotation") f.provider.research.mockResolvedValue(output(110, { annotations: [{ type: "url_citation", url: "bad", title: "bad" }] }));
    if (mode === "candidate") f.provider.research.mockResolvedValue(output(110, { content: "{}", candidate: null }));
    if (mode === "source") { candidate.resources[0]!.url = "http://127.0.0.1/private"; f.provider.research.mockResolvedValue(output(110, { content: JSON.stringify(candidate) })); }
    if (mode === "lease-before") f.provider.research.mockImplementation(async () => { f.setNow(day + 61_001); return output(); });
    const result = await f.fresh({ onQualityDiagnostic: observer }).orchestrator.start("owner-a", input, context);
    expect(result.state).not.toBe("ready"); expect(observer).not.toHaveBeenCalled(); expect(f.provider.repair).not.toHaveBeenCalled();
  });
});
