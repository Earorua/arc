// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { researchCandidateSchema } from "../../app/contracts/research";
import { D1AiRunSink } from "../../app/server/ai/d1-run-recorder";
import { D1EntitlementRepository } from "../../app/server/entitlements/d1-entitlement-repository";
import { EntitlementGate } from "../../app/server/entitlements/policy";
import { D1ResearchBudgetRepository } from "../../app/server/research/d1-budget-repository";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import * as diagnosticModule from "../../app/server/research/result-diagnostic";
import { ResearchOrchestrator } from "../../app/server/research/orchestrator";
import { RESEARCH_PROVIDER_VERSIONS, type ProviderResearchResult } from "../../app/server/research/provider";
import { createResearchServiceFactory, type ResearchProductionEnvironment } from "../../app/server/research/service-factory";
import { fixtureResponse, runValidation } from "../../scripts/live-research/validation";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createResearchD1, seedUser, type SqliteD1 } from "../helpers/sqlite-d1";

const key = "synthetic-candidate-diagnostic-key";
const keyUrl = "https://openrouter.ai/api/v1/key";
const researchUrl = "https://openrouter.ai/api/v1/chat/completions";
const safeKeyData = { data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0,
  is_management_key: false, is_provisioning_key: false, byok_usage: 0, expires_at: null } };
const now = Date.parse("2026-09-11T06:00:00Z");
const context = { cohortEnabled: true, rateAllowed: true };
const directConfig = {
  configFingerprint: "candidate-cache-diagnostic-v1", providerName: "openrouter" as const,
  versions: { ...RESEARCH_PROVIDER_VERSIONS, blueprintVersion: "2026.08.1", registryVersion: "2026.08.1", templateVersion: "2026.08.1" },
  activeTtlMs: 60_000, cacheDays: 7,
  budget: { dailyBudgetMicros: 10_000, monthlyBudgetMicros: 100_000, maximumMicros: 1200,
    researchMaximumMicros: 1000, repairMaximumMicros: 200 },
};
const standardEnvironment: ResearchProductionEnvironment = {
  ARC_ENVIRONMENT: "production", BETTER_AUTH_URL: "https://candidate-diagnostic.example.test",
  ARC_AI_ENABLED: "true", ARC_AI_RESEARCH_ENABLED: "true", ARC_AI_USER_DAILY_QUOTA: "10",
  ARC_AI_RATE_LIMIT_PER_MINUTE: "2", ARC_AI_MODEL_RESEARCH: "test/research-fixed",
  ARC_AI_MODEL_ECONOMY: "test/repair-fixed", ARC_AI_RESEARCH_TIMEOUT_MS: "20000",
  ARC_AI_REPAIR_TIMEOUT_MS: "10000", ARC_AI_RESEARCH_CACHE_DAYS: "14",
  ARC_AI_SITE_DAILY_BUDGET_MICROS: "10000", ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "100000",
  ARC_AI_RESEARCH_MAX_COST_MICROS: "1000", ARC_AI_REPAIR_MAX_COST_MICROS: "200",
  ARC_AI_IP_HASH_SALT: "synthetic-candidate-diagnostic-salt", OPENROUTER_API_KEY: "synthetic-dummy-credential",
};

function candidateResult(): ProviderResearchResult {
  return {
    content: JSON.stringify(validResearchCandidate), candidate: researchCandidateSchema.parse(validResearchCandidate),
    annotations: structuredClone(validAnnotations), actualModel: "test/research-fixed",
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, costMicros: 100, webSearchRequests: 1 },
  };
}

function diagnosticLedger(db: SqliteD1) {
  return {
    quotas: db.database.prepare("SELECT reservation_id,entry_kind,units FROM quota_ledger ORDER BY created_at,entry_kind").all(),
    costs: db.database.prepare("SELECT request_id,status,maximum_reserved_micros,settled_micros FROM ai_budget_reservations ORDER BY created_at,id").all(),
    audits: db.database.prepare("SELECT request_id,purpose,status,error_code FROM ai_runs ORDER BY created_at,id").all(),
  };
}

afterEach(() => { vi.restoreAllMocks(); });

async function validationFetch(change?: (payload: {
  choices: Array<{ message: { content: string } }>;
}) => void) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
    if (url === keyUrl) return Response.json(safeKeyData);
    expect(url).toBe(researchUrl);
    const payload = await fixtureResponse().json() as {
      choices: Array<{ message: { content: string } }>;
    };
    change?.(payload);
    return Response.json(payload);
  });
  return { fetch, result: await runValidation({ executeOne: true, key, fetch }) };
}

describe("local validation candidate diagnostics", () => {
  it("reports an accepted initial candidate after the orchestrator normalizes a legal JSON fence", async () => {
    const { fetch, result } = await validationFetch((payload) => {
      payload.choices[0]!.message.content = `\`\`\`json\n${payload.choices[0]!.message.content}\n\`\`\``;
    });

    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      [keyUrl, "GET"], [researchUrl, "POST"],
    ]);
    expect(result).toMatchObject({
      outcome: "passed", reason: null, runState: "ready", quality: { passed: true, issueCodes: [] },
      researchCandidateDiagnostic: { outcome: "accepted", reason: null, issues: [], truncated: false },
      usage: { totalTokens: 9000, costMicros: 100000, webSearchRequests: 2 },
      reservation: { status: "settled", maximumMicros: 5000000, settledMicros: 100000 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      ownerWrongReadRejected: true, secondResearchRejected: true,
      freshAccountActivated: true, planningGenerated: true, databaseDisposed: true,
    });
    expect(result.planningUnitCount).toBeGreaterThan(0);
  });

  it("reports a bounded actual-parser schema failure while preserving the existing failed-quality path", async () => {
    const { fetch, result } = await validationFetch((payload) => {
      const candidate = structuredClone(validResearchCandidate) as unknown as Record<string, unknown>;
      delete candidate.evidence;
      candidate.privateBody = "CANARY-private-body";
      payload.choices[0]!.message.content = JSON.stringify(candidate);
    });

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "research-failed", runState: "failed",
      quality: { passed: false, issueCodes: [], issueCount: 0 },
      researchCandidateDiagnostic: {
        outcome: "rejected", reason: "schema-rejected",
        issues: [
          { path: "$", code: "unrecognized-keys" },
          { path: "evidence", code: "invalid-type" },
        ],
        truncated: false,
      },
      researchRunDiagnostic: { errorCode: "invalid-result", quality: { passed: false, issueCodes: ["invalid-schema"] } },
      usage: { totalTokens: 9000, costMicros: 100000, webSearchRequests: 2 },
      reservation: { status: "settled", settledMicros: 100000 },
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
      ownerWrongReadRejected: true, secondResearchRejected: true,
      freshAccountActivated: false, planningGenerated: false, planningUnitCount: 0, databaseDisposed: true,
    });
    expect(JSON.stringify(result.researchCandidateDiagnostic)).not.toContain("CANARY");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("isolates a candidate diagnostic projector failure from the successful business result", async () => {
    vi.spyOn(diagnosticModule, "projectValidationCandidateDiagnostic").mockImplementation(() => {
      throw new Error("CANARY-projector-failure");
    });
    const { fetch, result } = await validationFetch();

    expect(result).toMatchObject({
      outcome: "passed", reason: null, runState: "ready", quality: { passed: true },
      researchCandidateDiagnostic: null,
      usage: { totalTokens: 9000, costMicros: 100000 },
      reservation: { status: "settled", settledMicros: 100000 },
      ownerWrongReadRejected: true, secondResearchRejected: true,
      freshAccountActivated: true, planningGenerated: true, databaseDisposed: true,
    });
    expect(JSON.stringify(result)).not.toContain("CANARY");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("has no candidate parse opportunity during key-check-only validation", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(safeKeyData));
    const result = await runValidation({ checkKeyOnly: true, key, fetch });
    expect(result).toMatchObject({ outcome: "passed", runState: null, researchRequestCount: 0,
      researchCandidateDiagnostic: null, databaseDisposed: true });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps an accepted candidate diagnostic separate from missing usage evidence", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      if (url === keyUrl) return Response.json(safeKeyData);
      const payload = await fixtureResponse().json() as Record<string, unknown>;
      const usage = payload.usage as Record<string, unknown>;
      delete usage.server_tool_use;
      return Response.json(payload);
    });
    const result = await runValidation({ executeOne: true, key, fetch });
    expect(result).toMatchObject({
      outcome: "incomplete", reason: "validation-incomplete", runState: "ready",
      researchCandidateDiagnostic: { outcome: "accepted", reason: null, issues: [], truncated: false },
      usage: null, reservation: { status: "conservative-hold", settledMicros: 0 },
      freshAccountActivated: true, planningGenerated: true, databaseDisposed: true,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("has no candidate parse opportunity when the synthetic key check fails", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("denied", { status: 401 }));
    const result = await runValidation({ executeOne: true, key, fetch });
    expect(result).toMatchObject({ outcome: "incomplete", runState: null, researchRequestCount: 0,
      researchCandidateDiagnostic: null, usage: null, reservation: null, databaseDisposed: true });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not construct or emit candidate diagnostics when a fresh cache serves another owner", async () => {
    const db = createResearchD1();
    const close = vi.spyOn(db, "close");
    const build = vi.spyOn(diagnosticModule, "buildResearchCandidateDiagnostic");
    try {
      seedUser(db, "cache-owner-a"); seedUser(db, "cache-owner-b");
      const d1 = db as unknown as D1Database;
      const provider = { research: vi.fn(async () => candidateResult()), repair: vi.fn(async () => candidateResult()) };
      const createService = (observer: (diagnostic: diagnosticModule.ResearchCandidateDiagnostic) => unknown, disabled = false) => {
        const repository = new D1ResearchRepository(d1, { now: () => now });
        const budget = new D1ResearchBudgetRepository(d1, { now: () => now });
        const entitlements = new EntitlementGate(new D1EntitlementRepository(d1, { now: () => now }), {
          ARC_AI_ENABLED: disabled ? "false" : "true", ARC_AI_USER_DAILY_QUOTA: "10", ARC_AI_RATE_LIMIT_PER_MINUTE: "5",
        }, { now: () => new Date(now) });
        const audits = new D1AiRunSink(d1, { now: () => now });
        return { repository, orchestrator: new ResearchOrchestrator({ repository, budget, entitlements, audits,
          provider, config: structuredClone(directConfig), now: () => now, onCandidateDiagnostic: observer }) };
      };
      const firstObserver = vi.fn();
      const first = createService(firstObserver);
      const original = await first.orchestrator.start("cache-owner-a", {
        mutationId: "candidate-cache-first", role: "Data Product Manager", locale: "en-US",
      }, context);
      expect(original.state).toBe("ready");
      expect(firstObserver).toHaveBeenCalledOnce();
      expect(build).toHaveBeenCalledOnce();

      const before = diagnosticLedger(db);
      firstObserver.mockClear(); build.mockClear();
      const cachedObserver = vi.fn();
      const cachedService = createService(cachedObserver, true);
      const cached = await cachedService.orchestrator.start("cache-owner-b", {
        mutationId: "candidate-cache-second", role: "Data Product Manager", locale: "en-US",
      }, { cohortEnabled: false, rateAllowed: false });

      expect(cached).toMatchObject({ state: "ready", packageId: original.state === "ready" ? original.packageId : "unreachable" });
      expect(cached.id).not.toBe(original.id);
      expect(provider.research).toHaveBeenCalledOnce();
      expect(provider.repair).not.toHaveBeenCalled();
      expect(cachedObserver).not.toHaveBeenCalled();
      expect(build).not.toHaveBeenCalled();
      expect(diagnosticLedger(db)).toEqual(before);
      await expect(cachedService.orchestrator.get("cache-owner-a", cached.id)).resolves.toBeNull();
      expect((await cachedService.repository.getRun("cache-owner-b", cached.id))?.stateVersion).toBe(1);
    } finally { db.close(); }
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps the standard service factory free of candidate diagnostic construction", async () => {
    const db = createResearchD1();
    const close = vi.spyOn(db, "close");
    const build = vi.spyOn(diagnosticModule, "buildResearchCandidateDiagnostic");
    try {
      seedUser(db, "factory-owner");
      const provider = { research: vi.fn(async () => candidateResult()), repair: vi.fn(async () => candidateResult()) };
      const createProvider = vi.fn(() => provider);
      const factory = createResearchServiceFactory({
        environment: standardEnvironment, getD1: () => db as unknown as D1Database,
        createProvider, now: () => now,
      });
      const service = factory.createNewCallService();
      expect(service).not.toBeNull();
      const result = await service!.start("factory-owner", {
        mutationId: "candidate-standard-factory", role: "Data Product Manager", locale: "en-US",
      }, context);

      expect(result.state).toBe("ready");
      expect(createProvider).toHaveBeenCalledOnce();
      expect(createProvider).toHaveBeenCalledWith(expect.objectContaining({
        ARC_AI_MODEL_RESEARCH: "test/research-fixed", researchTimeoutMs: 20_000,
      }));
      expect(provider.research).toHaveBeenCalledOnce();
      expect(provider.repair).not.toHaveBeenCalled();
      expect(build).not.toHaveBeenCalled();
      const ledger = diagnosticLedger(db);
      expect(ledger.quotas).toHaveLength(2);
      expect(ledger.quotas).toContainEqual(expect.objectContaining({ entry_kind: "accepted", units: 1 }));
      expect(ledger.costs).toEqual([expect.objectContaining({
        status: "settled", maximum_reserved_micros: 1200, settled_micros: 100,
      })]);
      expect(ledger.audits).toEqual([expect.objectContaining({
        purpose: "role-research", status: "accepted", error_code: null,
      })]);
      await expect(service!.get("factory-owner", result.id)).resolves.toMatchObject({ id: result.id, state: "ready" });
    } finally { db.close(); }
    expect(close).toHaveBeenCalledOnce();
  });
});
