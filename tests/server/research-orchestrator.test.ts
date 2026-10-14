import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchOrchestrator, type ResearchOrchestratorDependencies } from "../../app/server/research/orchestrator";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { D1ResearchBudgetRepository } from "../../app/server/research/d1-budget-repository";
import { D1EntitlementRepository } from "../../app/server/entitlements/d1-entitlement-repository";
import { D1AiRunSink } from "../../app/server/ai/d1-run-recorder";
import { EntitlementGate } from "../../app/server/entitlements/policy";
import { RESEARCH_PROVIDER_VERSIONS, ResearchProviderError, type ProviderResearchResult } from "../../app/server/research/provider";
import { researchCandidateSchema, researchRunPublicViewSchema } from "../../app/contracts/research";
import { deterministicId, fingerprint } from "../../app/lib/planning/fingerprint";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createResearchD1, seedUser } from "../helpers/sqlite-d1";

const day = Date.parse("2026-08-31T00:00:00Z");
const context = { cohortEnabled: true, rateAllowed: true };
const input = { mutationId: "mutation-first", role: "Data Product Manager", locale: "en-US" as const };
const remoteConfigFingerprint = fingerprint(["remote-orchestrator-config"]);
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
  let now = day + 1000;
  db.database.function("unixepoch", { varargs: true }, (...args: unknown[]) => {
    if (args.length === 0) return Math.floor(now / 1_000);
    if (args.length === 1 && args[0] === "subsec") return now / 1_000;
    throw new Error("Unexpected SQL clock call in orchestrator fixture");
  });
  const provider = { research: vi.fn(async () => output()), repair: vi.fn(async () => output(30, { actualModel: "actual/repair" })) };
  const fresh = (overrides: Partial<ResearchOrchestratorDependencies> = {}, disabled = false) => {
    const d1 = db as unknown as D1Database;
    const repository = new D1ResearchRepository(d1, { now: () => now });
    const budget = new D1ResearchBudgetRepository(d1, { now: () => now });
    const quota = new D1EntitlementRepository(d1, { now: () => now });
    const entitlements = new EntitlementGate(quota, { ARC_AI_ENABLED: disabled ? "false" : "true", ARC_AI_USER_DAILY_QUOTA: "10", ARC_AI_RATE_LIMIT_PER_MINUTE: "5" }, { now: () => new Date(now) });
    const audits = new D1AiRunSink(d1, { now: () => now });
    const executions = new D1SiteExecutionRepository(d1, repository);
    const dependencies = { repository, budget, entitlements, audits, provider, config: structuredClone(config), now: () => now,
      readRemoteExecution: executions.read.bind(executions), ...overrides };
    return { orchestrator: new ResearchOrchestrator(dependencies), dependencies, repository, executions, budget, quota, audits, entitlements };
  };
  return { db, provider, fresh, setNow: (value: number) => { now = value; }, ...fresh() };
}
type Fixture = ReturnType<typeof setup>;
function ledger(f: Fixture) {
  return { quotas: f.db.database.prepare("SELECT reservation_id,entry_kind,units,created_at FROM quota_ledger ORDER BY created_at,entry_kind").all(),
    costs: f.db.database.prepare("SELECT id,request_id,status,maximum_reserved_micros,settled_micros,day_bucket_id,month_bucket_id FROM ai_budget_reservations").all(),
    audits: f.db.database.prepare("SELECT request_id,purpose,status,error_code,model FROM ai_runs ORDER BY purpose").all() };
}
function pause() {
  let release!: () => void; let reached!: () => void;
  const at = new Promise<void>((resolve) => { reached = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { at, release, stop: async () => { reached(); await wait; } };
}

describe("ResearchOrchestrator state machine", () => {
  it.each(["queued", "admitted", "closed", "begun"] as const)("observes a persisted remote %s run through get, recover, and start without legacy work", async (state) => {
    const f = setup();
    const created = await f.repository.createRemoteOrReplay({
      ownerId: "owner-a", requestId: "request-remote-observe", mutationId: input.mutationId,
      rawRole: input.role, normalizedRoleKey: input.role.toLowerCase(), locale: input.locale,
      inputFingerprint: fingerprint([input.role.toLowerCase(), input.locale]), configFingerprint: remoteConfigFingerprint,
      policy: { cacheDays: 7, userDailyQuota: 10, dailyBudgetMicros: 10_000, monthlyBudgetMicros: 100_000, maximumMicros: 1200 },
    });
    if (!created.execution) throw new Error("expected durable remote execution");
    if (state === "admitted" || state === "begun") {
      const identity = { ownerId: created.execution.ownerId, runId: created.execution.runId, requestId: created.execution.requestId,
        jobId: created.execution.jobId, requestHash: created.execution.requestHash };
      const quota = await f.quota.admitRemoteResearch({ ...identity, userId: created.execution.ownerId, purpose: "role-research",
        idempotencyKey: created.execution.quotaKey, units: 1, dailyQuota: created.execution.policy.userDailyQuota,
        period: { startMs: day, endMs: day + 86_400_000 } });
      const budget = await f.budget.reserveRemote({ ...identity, expiresAt: created.execution.reservationExpiresAt,
        dailyBudgetMicros: created.execution.policy.dailyBudgetMicros, monthlyBudgetMicros: created.execution.policy.monthlyBudgetMicros,
        maximumMicros: created.execution.policy.maximumMicros });
      if (!quota.allowed || !budget.allowed) throw new Error("expected durable reservations");
      await f.executions.markAdmitted({ ...identity, expectedVersion: 0, quotaReservationId: quota.reservationId, budgetReservationId: budget.reservation.id });
      if (state === "begun") {
        const beganAt = day + 2_000;
        f.db.database.prepare("UPDATE research_site_executions SET began_at=?1,execution_expires_at=?1+1260000,version=version+1,updated_at=?1 WHERE run_id=?2")
          .run(beganAt, created.run.id);
        f.db.database.prepare("UPDATE research_runs SET state='researching',state_version=state_version+1,active_expires_at=?1,updated_at=?2 WHERE id=?3")
          .run(beganAt + 1_260_000, beganAt, created.run.id);
      }
    } else if (state === "closed") {
      await f.executions.closeBeforeBegin({ ownerId: created.execution.ownerId, runId: created.execution.runId,
        requestId: created.execution.requestId, jobId: created.execution.jobId, requestHash: created.execution.requestHash, reason: "denied" });
    }

    const service = f.fresh({ config: { ...structuredClone(config), configFingerprint: remoteConfigFingerprint } }, true);
    const remoteRead = vi.spyOn(service.executions, "read");
    service.dependencies.readRemoteExecution = service.executions.read.bind(service.executions);
    const reserve = vi.spyOn(service.budget, "reserve");
    const settle = vi.spyOn(service.budget, "settle");
    const authorize = vi.spyOn(service.entitlements, "authorizeResearch");
    const finalize = vi.spyOn(service.entitlements, "finalize");
    const record = vi.spyOn(service.audits, "record");
    const before = {
      run: f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1").get(created.run.id),
      execution: f.db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?1").get(created.run.id),
      ledger: ledger(f),
    };
    const expectedState = state === "closed" ? "failed" : state === "begun" ? "researching" : "queued";

    await expect(service.orchestrator.get("owner-a", created.run.id)).resolves.toMatchObject({ id: created.run.id, state: expectedState });
    await expect(service.orchestrator.recover("owner-a", { kind: "start", ...input })).resolves.toMatchObject({ id: created.run.id, state: expectedState });
    await expect(service.orchestrator.start("owner-a", input, { cohortEnabled: false, rateAllowed: false })).resolves
      .toMatchObject({ id: created.run.id, state: expectedState });

    expect(remoteRead).toHaveBeenCalledTimes(3);
    expect(reserve).not.toHaveBeenCalled(); expect(settle).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled(); expect(finalize).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled(); expect(f.provider.research).not.toHaveBeenCalled(); expect(f.provider.repair).not.toHaveBeenCalled();
    expect({
      run: f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1").get(created.run.id),
      execution: f.db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?1").get(created.run.id),
      ledger: ledger(f),
    }).toEqual(before);
  });

  it.each(["queued", "begun"] as const)("observes an expired remote %s run through get, recover, and start without legacy work", async (state) => {
    const f = setup();
    const created = await f.repository.createRemoteOrReplay({
      ownerId: "owner-a", requestId: `request-remote-expired-${state}`, mutationId: input.mutationId,
      rawRole: input.role, normalizedRoleKey: input.role.toLowerCase(), locale: input.locale,
      inputFingerprint: fingerprint([input.role.toLowerCase(), input.locale]), configFingerprint: remoteConfigFingerprint,
      policy: { cacheDays: 7, userDailyQuota: 10, dailyBudgetMicros: 10_000, monthlyBudgetMicros: 100_000, maximumMicros: 1200 },
    });
    if (!created.execution) throw new Error("expected durable remote execution");
    let absoluteExpiresAt = created.execution.job.queueExpiresAt;
    if (state === "begun") {
      const identity = { ownerId: created.execution.ownerId, runId: created.execution.runId, requestId: created.execution.requestId,
        jobId: created.execution.jobId, requestHash: created.execution.requestHash };
      const quota = await f.quota.admitRemoteResearch({ ...identity, userId: created.execution.ownerId, purpose: "role-research",
        idempotencyKey: created.execution.quotaKey, units: 1, dailyQuota: created.execution.policy.userDailyQuota,
        period: { startMs: day, endMs: day + 86_400_000 } });
      const budget = await f.budget.reserveRemote({ ...identity, expiresAt: created.execution.reservationExpiresAt,
        dailyBudgetMicros: created.execution.policy.dailyBudgetMicros, monthlyBudgetMicros: created.execution.policy.monthlyBudgetMicros,
        maximumMicros: created.execution.policy.maximumMicros });
      if (!quota.allowed || !budget.allowed) throw new Error("expected durable reservations");
      await f.executions.markAdmitted({ ...identity, expectedVersion: 0,
        quotaReservationId: quota.reservationId, budgetReservationId: budget.reservation.id });
      const beganAt = day + 2_000;
      absoluteExpiresAt = beganAt + 1_260_000;
      f.db.database.prepare("UPDATE research_site_executions SET began_at=?1,execution_expires_at=?1+1260000,version=version+1,updated_at=?1 WHERE run_id=?2")
        .run(beganAt, created.run.id);
      f.db.database.prepare("UPDATE research_runs SET state='researching',state_version=state_version+1,active_expires_at=?1,updated_at=?2 WHERE id=?3")
        .run(absoluteExpiresAt, beganAt, created.run.id);
    }
    f.setNow(absoluteExpiresAt + 1);

    const service = f.fresh({ config: { ...structuredClone(config), configFingerprint: remoteConfigFingerprint } }, true);
    const remoteRead = vi.spyOn(service.executions, "read");
    service.dependencies.readRemoteExecution = service.executions.read.bind(service.executions);
    const reserve = vi.spyOn(service.budget, "reserve");
    const settle = vi.spyOn(service.budget, "settle");
    const authorize = vi.spyOn(service.entitlements, "authorizeResearch");
    const finalize = vi.spyOn(service.entitlements, "finalize");
    const record = vi.spyOn(service.audits, "record");
    const before = {
      run: f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1").get(created.run.id),
      execution: f.db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?1").get(created.run.id),
      ledger: ledger(f),
    };
    const expectedState = state === "begun" ? "researching" : "queued";

    await expect(service.orchestrator.get("owner-a", created.run.id)).resolves.toMatchObject({ id: created.run.id, state: expectedState });
    await expect(service.orchestrator.recover("owner-a", { kind: "start", ...input })).resolves.toMatchObject({ id: created.run.id, state: expectedState });
    await expect(service.orchestrator.start("owner-a", input, { cohortEnabled: false, rateAllowed: false })).resolves
      .toMatchObject({ id: created.run.id, state: expectedState });

    expect(remoteRead).toHaveBeenCalledTimes(3);
    expect(reserve).not.toHaveBeenCalled(); expect(settle).not.toHaveBeenCalled();
    expect(authorize).not.toHaveBeenCalled(); expect(finalize).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
    expect(f.provider.research).not.toHaveBeenCalled(); expect(f.provider.repair).not.toHaveBeenCalled();
    expect({
      run: f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1").get(created.run.id),
      execution: f.db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?1").get(created.run.id),
      ledger: ledger(f),
    }).toEqual(before);
  });

  it("fails remote observation closed when its execution reader is absent, missing, or corrupt", async () => {
    for (const fault of ["absent", "missing", "corrupt"] as const) {
      const f = setup();
      const created = await f.repository.createRemoteOrReplay({
        ownerId: "owner-a", requestId: `request-remote-${fault}`, mutationId: `mutation-remote-${fault}`,
        rawRole: input.role, normalizedRoleKey: input.role.toLowerCase(), locale: input.locale,
        inputFingerprint: fingerprint([input.role.toLowerCase(), input.locale]), configFingerprint: remoteConfigFingerprint,
        policy: { cacheDays: 7, userDailyQuota: 10, dailyBudgetMicros: 10_000, monthlyBudgetMicros: 100_000, maximumMicros: 1200 },
      });
      if (fault === "missing") f.db.database.prepare("DELETE FROM research_site_executions WHERE run_id=?1").run(created.run.id);
      if (fault === "corrupt") {
        f.db.database.exec("DROP TRIGGER research_site_executions_identity_immutable");
        f.db.database.prepare("UPDATE research_site_executions SET validation_context_json='{}',version=version+1,updated_at=updated_at WHERE run_id=?1").run(created.run.id);
      }
      const overrides = fault === "absent" ? { readRemoteExecution: undefined } : {};
      const service = f.fresh({ config: { ...structuredClone(config), configFingerprint: remoteConfigFingerprint }, ...overrides }, true);
      await expect(service.orchestrator.get("owner-a", created.run.id)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
      expect(f.provider.research).not.toHaveBeenCalled(); expect(f.provider.repair).not.toHaveBeenCalled();
    }
  });

  it("checks remote mode before execute and rechecks persisted mode before catch can fail a run", async () => {
    const f = setup();
    const created = await f.repository.createRemoteOrReplay({
      ownerId: "owner-a", requestId: "request-remote-catch", mutationId: "mutation-remote-catch",
      rawRole: input.role, normalizedRoleKey: input.role.toLowerCase(), locale: input.locale,
      inputFingerprint: fingerprint([input.role.toLowerCase(), input.locale]), configFingerprint: remoteConfigFingerprint,
      policy: { cacheDays: 7, userDailyQuota: 10, dailyBudgetMicros: 10_000, monthlyBudgetMicros: 100_000, maximumMicros: 1200 },
    });
    const service = f.fresh({ config: { ...structuredClone(config), configFingerprint: remoteConfigFingerprint } }, true);
    const create = vi.spyOn(service.repository, "createOrReplay");
    const find = vi.spyOn(service.repository, "findFreshPackage");
    const transition = vi.spyOn(service.repository, "transition");

    create.mockResolvedValueOnce({ run: created.run, replayed: false });
    await expect(service.orchestrator.start("owner-a", { ...input, mutationId: "execute-mode-check" }, context))
      .resolves.toMatchObject({ id: created.run.id, state: "queued" });
    expect(find).not.toHaveBeenCalled(); expect(transition).not.toHaveBeenCalled();

    create.mockResolvedValueOnce({ run: { ...created.run, executionMode: "synchronous", remoteQuotaKey: null }, replayed: false });
    find.mockRejectedValueOnce(new Error("lost cache read"));
    await expect(service.orchestrator.start("owner-a", { ...input, mutationId: "catch-mode-check" }, context))
      .resolves.toMatchObject({ id: created.run.id, state: "queued" });
    expect(transition).not.toHaveBeenCalled();
    expect(f.provider.research).not.toHaveBeenCalled(); expect(f.provider.repair).not.toHaveBeenCalled();
  });

  it("recovers a normalized historical-config start identity without admitting or executing paid work", async () => {
    const f = setup();
    const normalizedRoleKey = "data product manager";
    const created = await f.repository.createOrReplay({ ownerId: "owner-a", requestId: "request-recover-start",
      mutationId: "mutation-recover-start", rawRole: "Data Product Manager", normalizedRoleKey, locale: "en-US",
      inputFingerprint: fingerprint([normalizedRoleKey, "en-US"]), configFingerprint: "old-config-v0",
      activeExpiresAt: day + 60_000 });
    const before = {
      runs: f.db.database.prepare("SELECT count(*) AS n FROM research_runs").get(),
      aliases: f.db.database.prepare("SELECT count(*) AS n FROM idempotency_records").get(),
      audits: f.db.database.prepare("SELECT count(*) AS n FROM ai_runs").get(),
    };
    const recovered = f.fresh({ config: { ...structuredClone(config), configFingerprint: "new-config-v2" } }, true);
    const reserve = vi.spyOn(recovered.budget, "reserve");
    const authorize = vi.spyOn(recovered.entitlements, "authorizeResearch");
    const record = vi.spyOn(recovered.audits, "record");

    await expect(recovered.orchestrator.recover("owner-a", {
      kind: "start", mutationId: "mutation-recover-start", role: " Ｄata   Product Manager ", locale: "en-US",
    })).resolves.toMatchObject({ id: created.run.id, state: "queued" });
    await expect(recovered.orchestrator.recover("owner-b", {
      kind: "start", mutationId: "mutation-recover-start", role: "Data Product Manager", locale: "en-US",
    })).resolves.toBeNull();
    expect(f.provider.research).not.toHaveBeenCalled(); expect(f.provider.repair).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled(); expect(authorize).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
    expect({ runs: f.db.database.prepare("SELECT count(*) AS n FROM research_runs").get(),
      aliases: f.db.database.prepare("SELECT count(*) AS n FROM idempotency_records").get(),
      audits: f.db.database.prepare("SELECT count(*) AS n FROM ai_runs").get() }).toEqual(before);
  });

  it("recovers terminal known-cost and expired unknown-cost runs without another provider call", async () => {
    const known = setup();
    known.provider.research.mockRejectedValue(new ResearchProviderError("timeout", true, true, {
      actualModel: "actual/research", usage: output(110).usage,
    }));
    const terminal = await known.orchestrator.start("owner-a", input, context);
    const knownLedger = ledger(known);
    await expect(known.fresh({}, true).orchestrator.recover("owner-a", { kind: "start", ...input }))
      .resolves.toMatchObject({ id: terminal.id, state: "failed" });
    expect(ledger(known)).toEqual(knownLedger);
    expect(known.provider.research).toHaveBeenCalledOnce();
    expect(known.provider.repair).not.toHaveBeenCalled();

    const unknown = setup(); const pending = pause();
    unknown.provider.research.mockImplementation(async () => { await pending.stop(); return output(); });
    const running = unknown.orchestrator.start("owner-a", input, context); await pending.at;
    unknown.setNow(day + 70_000);
    await expect(unknown.fresh({}, true).orchestrator.recover("owner-a", { kind: "start", ...input }))
      .resolves.toMatchObject({ state: "failed", failureCategory: "service-unavailable" });
    expect(ledger(unknown).costs).toEqual([expect.objectContaining({ status: "conservative-hold", settled_micros: 0 })]);
    expect(unknown.provider.research).toHaveBeenCalledOnce();
    expect(unknown.provider.repair).not.toHaveBeenCalled();
    pending.release(); await running.catch(() => undefined);
  });

  it("settles late known cost once through recover and never revives an expired Ready package", async () => {
    const late = setup(); const pending = pause();
    late.provider.research.mockImplementation(async () => { await pending.stop(); return output(110); });
    const running = late.orchestrator.start("owner-a", input, context); await pending.at;
    late.setNow(day + 70_000);
    const firstService = late.fresh({}, true);
    const firstReserve = vi.spyOn(firstService.budget, "reserve");
    const firstAuthorize = vi.spyOn(firstService.entitlements, "authorizeResearch");
    const firstRecord = vi.spyOn(firstService.audits, "record");
    const beforeExpiry = {
      runs: late.db.database.prepare("SELECT count(*) AS n FROM research_runs").get(),
      aliases: late.db.database.prepare("SELECT count(*) AS n FROM idempotency_records").get(),
      audits: late.db.database.prepare("SELECT count(*) AS n FROM ai_runs").get(),
    };
    await expect(firstService.orchestrator.recover("owner-a", { kind: "start", ...input }))
      .resolves.toMatchObject({ state: "failed", failureCategory: "service-unavailable" });
    expect(firstReserve).not.toHaveBeenCalled(); expect(firstAuthorize).not.toHaveBeenCalled(); expect(firstRecord).not.toHaveBeenCalled();
    expect({ runs: late.db.database.prepare("SELECT count(*) AS n FROM research_runs").get(),
      aliases: late.db.database.prepare("SELECT count(*) AS n FROM idempotency_records").get(),
      audits: late.db.database.prepare("SELECT count(*) AS n FROM ai_runs").get() }).toEqual(beforeExpiry);
    expect(late.provider.research).toHaveBeenCalledOnce(); expect(late.provider.repair).not.toHaveBeenCalled();

    const originalSettle = late.budget.settle.bind(late.budget);
    let failKnownSettlementOnce = true;
    const originalSettlement = vi.spyOn(late.budget, "settle").mockImplementation(async (ownerId, id, settlement) => {
      if (settlement.kind === "actual" && failKnownSettlementOnce) {
        failKnownSettlementOnce = false;
        throw new Error("simulated settlement interruption");
      }
      return originalSettle(ownerId, id, settlement);
    });
    pending.release(); await running.catch(() => undefined);
    expect(originalSettlement).toHaveBeenCalledWith(expect.any(String), expect.any(String), { kind: "actual", actualMicros: 110 });
    originalSettlement.mockRestore();
    expect(ledger(late).costs).toEqual([expect.objectContaining({ status: "conservative-hold", settled_micros: 0 })]);
    const usageAudit = late.db.database.prepare("SELECT status,error_code,usage_json FROM ai_runs WHERE purpose='role-research'").get() as { status: string; error_code: string | null; usage_json: string };
    expect({ status: usageAudit.status, errorCode: usageAudit.error_code, usage: JSON.parse(usageAudit.usage_json) }).toEqual({
      status: "rejected", errorCode: "invalid-result",
      usage: expect.objectContaining({ charged: true, usage: expect.objectContaining({ costMicros: 110 }) }),
    });
    const recovery = late.fresh({}, true);
    const reserve = vi.spyOn(recovery.budget, "reserve");
    const settle = vi.spyOn(recovery.budget, "settle");
    const authorize = vi.spyOn(recovery.entitlements, "authorizeResearch");
    const record = vi.spyOn(recovery.audits, "record");
    const beforeKnown = {
      runs: late.db.database.prepare("SELECT count(*) AS n FROM research_runs").get(),
      aliases: late.db.database.prepare("SELECT count(*) AS n FROM idempotency_records").get(),
      audits: late.db.database.prepare("SELECT count(*) AS n FROM ai_runs").get(),
    };
    await expect(recovery.orchestrator.recover("owner-a", { kind: "start", ...input })).resolves.toMatchObject({ state: "failed" });
    expect(settle).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledWith("owner-a", expect.any(String), { kind: "actual", actualMicros: 110 });
    expect(ledger(late).costs).toEqual([expect.objectContaining({ status: "settled", settled_micros: 110 })]);
    const once = ledger(late);
    await expect(recovery.orchestrator.recover("owner-a", { kind: "start", ...input })).resolves.toMatchObject({ state: "failed" });
    expect(settle).toHaveBeenCalledOnce();
    expect(ledger(late)).toEqual(once);
    expect(reserve).not.toHaveBeenCalled(); expect(authorize).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
    expect({ runs: late.db.database.prepare("SELECT count(*) AS n FROM research_runs").get(),
      aliases: late.db.database.prepare("SELECT count(*) AS n FROM idempotency_records").get(),
      audits: late.db.database.prepare("SELECT count(*) AS n FROM ai_runs").get() }).toEqual(beforeKnown);
    expect(late.provider.research).toHaveBeenCalledOnce(); expect(late.provider.repair).not.toHaveBeenCalled();

    const expired = setup();
    const readyRun = await expired.orchestrator.start("owner-a", input, context);
    expired.setNow(day + 8 * 86_400_000);
    const expiredRecovery = expired.fresh({}, true);
    const expiredReserve = vi.spyOn(expiredRecovery.budget, "reserve");
    const expiredAuthorize = vi.spyOn(expiredRecovery.entitlements, "authorizeResearch");
    const expiredRecord = vi.spyOn(expiredRecovery.audits, "record");
    const beforeExpired = ledger(expired);
    await expect(expiredRecovery.orchestrator.recover("owner-a", { kind: "start", ...input }))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    await expect(expiredRecovery.orchestrator.recover("owner-a", { kind: "start", ...input }))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect((await expired.repository.getRun("owner-a", readyRun.id))?.state).toBe("ready");
    expect(ledger(expired)).toEqual(beforeExpired);
    expect(expiredReserve).not.toHaveBeenCalled(); expect(expiredAuthorize).not.toHaveBeenCalled(); expect(expiredRecord).not.toHaveBeenCalled();
    expect(expired.provider.research).toHaveBeenCalledOnce(); expect(expired.provider.repair).not.toHaveBeenCalled();
  });
  it("validates strict client input before creating anything", async () => {
    const f = setup();
    for (const bad of [{ ...input, ownerId: "owner-b" }, { ...input, model: "cheap" }, { ...input, role: "x" }]) await expect(f.orchestrator.start("owner-a", bad, context)).rejects.toBeDefined();
    expect(f.db.database.prepare("SELECT count(*) count FROM research_runs").get()).toEqual({ count: 0 });
    expect(f.provider.research).not.toHaveBeenCalled();
  });

  it("orders create/cache/quota/cost/Researching/provider/Validating/validation/audit/terminal/settlement", async () => {
    const f = setup(); const events: string[] = [];
    for (const [object, method, label] of [[f.repository, "createOrReplay", "create"], [f.repository, "findFreshPackage", "cache"], [f.entitlements, "authorizeResearch", "quota"], [f.budget, "reserve", "cost"], [f.audits, "record", "audit"], [f.repository, "saveValidation", "terminal"], [f.entitlements, "finalize", "quota-settle"], [f.budget, "settle", "cost-settle"]] as const) {
      const original = object[method as keyof typeof object] as (...args: unknown[]) => Promise<unknown>;
      vi.spyOn(object as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>, method).mockImplementation(async (...args) => { events.push(label); return original.apply(object, args); });
    }
    const transition = f.repository.transition.bind(f.repository);
    vi.spyOn(f.repository, "transition").mockImplementation(async (command) => { events.push(command.to); return transition(command); });
    f.provider.research.mockImplementation(async () => { events.push("provider"); return output(); });
    const result = await f.orchestrator.start("owner-a", input, context);
    expect(result.state).toBe("ready"); expect(researchRunPublicViewSchema.safeParse(result).success).toBe(true);
    expect(events).toEqual(["create", "cache", "quota", "cost", "researching", "provider", "validating", "audit", "terminal", "quota-settle", "cost-settle"]);
    expect(ledger(f).costs).toEqual([expect.objectContaining({ settled_micros: 110, status: "settled" })]);
    expect(f.db.database.prepare("SELECT reserved_micros,settled_micros FROM ai_budget_buckets").all()).toEqual([{ reserved_micros: 0, settled_micros: 110 }, { reserved_micros: 0, settled_micros: 110 }]);
    expect(ledger(f).quotas).toContainEqual(expect.objectContaining({ entry_kind: "accepted", units: 1 }));
    expect(f.provider.repair).not.toHaveBeenCalled();
  });

  it("normalizes identity and concurrently coalesces active mutations with one provider call", async () => {
    const f = setup(); const pending = pause();
    f.provider.research.mockImplementation(async () => { await pending.stop(); return output(); });
    const initial = f.orchestrator.start("owner-a", { ...input, role: "Ｄata   Product Manager" }, context);
    await pending.at;
    const replay = await f.fresh().orchestrator.start("owner-a", { ...input, mutationId: "mutation-other", role: "data product manager" }, context);
    expect(replay.state).toBe("researching");
    pending.release(); const result = await initial; expect(result.id).toBe(replay.id);
    const again = await f.fresh({}, true).orchestrator.start("owner-a", { ...input, role: "Ｄata   Product Manager" }, { cohortEnabled: false, rateAllowed: false });
    expect(again.id).toBe(result.id); expect(f.provider.research).toHaveBeenCalledTimes(1);
  });

  it("binds shared fresh cache to a new owner without quota, provider, or audit duplication", async () => {
    const f = setup(); const original = await f.orchestrator.start("owner-a", input, context);
    const before = ledger(f);
    const cached = await f.fresh({}, true).orchestrator.start("owner-b", { ...input, mutationId: "mutation-cache" }, { cohortEnabled: false, rateAllowed: false });
    expect(cached).toMatchObject({ state: "ready", packageId: original.state === "ready" ? original.packageId : "bad" }); expect(cached.id).not.toBe(original.id);
    expect(ledger(f)).toEqual(before); expect(f.provider.research).toHaveBeenCalledTimes(1);
    await expect(f.orchestrator.get("owner-a", cached.id)).resolves.toBeNull();
    expect((await f.repository.getRun("owner-b", cached.id))?.stateVersion).toBe(1);
  });

  it.each(["cohort", "rate", "quota", "cost", "quota-replay", "cost-replay"])("denies %s without provider authority", async (kind) => {
    const f = setup(); let gate = context;
    if (kind === "cohort") gate = { ...context, cohortEnabled: false };
    if (kind === "rate") gate = { ...context, rateAllowed: false };
    if (kind === "quota") vi.spyOn(f.entitlements, "authorizeResearch").mockResolvedValue({ allowed: false, reason: "quota" });
    if (kind === "cost") vi.spyOn(f.budget, "reserve").mockResolvedValue({ allowed: false, reason: "budget" });
    if (kind === "quota-replay") {
      const original = f.entitlements.authorizeResearch.bind(f.entitlements);
      vi.spyOn(f.entitlements, "authorizeResearch").mockImplementation(async (request) => { const decision = await original(request); return decision.allowed ? { ...decision, replayed: true } : decision; });
    }
    if (kind === "cost-replay") {
      const original = f.budget.reserve.bind(f.budget);
      vi.spyOn(f.budget, "reserve").mockImplementation(async (request) => { const decision = await original(request); return decision.allowed ? { ...decision, replayed: true, providerAttemptAllowed: false } : decision; });
    }
    expect((await f.orchestrator.start("owner-a", input, gate)).state).toBe("failed");
    expect(f.provider.research).not.toHaveBeenCalled();
  });

  it("repairs only mechanically recoverable complete content once and sums both actual costs", async () => {
    const f = setup(); const malformed = JSON.stringify(validResearchCandidate).replace(/}$/, ",}");
    f.provider.research.mockResolvedValue(output(110, { candidate: null, content: malformed }));
    const result = await f.orchestrator.start("owner-a", input, context);
    expect(result.state).toBe("ready"); expect(f.provider.research).toHaveBeenCalledTimes(1); expect(f.provider.repair).toHaveBeenCalledTimes(1);
    expect(f.provider.repair).toHaveBeenCalledWith({ role: input.role, locale: input.locale, originalContent: malformed, annotations: validAnnotations });
    expect(ledger(f).costs).toEqual([expect.objectContaining({ status: "settled", settled_micros: 140 })]);
    expect(f.db.database.prepare("SELECT reserved_micros,settled_micros FROM ai_budget_buckets").all()).toEqual([{ reserved_micros: 0, settled_micros: 140 }, { reserved_micros: 0, settled_micros: 140 }]);
    expect(ledger(f).audits).toEqual([expect.objectContaining({ purpose: "role-research", error_code: "repair-required" }), expect.objectContaining({ purpose: "role-research-repair", status: "accepted" })]);
  });

  it("allows mechanical numeric-schema repair while preserving every factual value", async () => {
    const f = setup(); const content = JSON.stringify(validResearchCandidate).replace(/"weeks":(\d+)/u, '"weeks":"$1"');
    f.provider.research.mockResolvedValue(output(110, { candidate: null, content }));
    expect((await f.orchestrator.start("owner-a", input, context)).state).toBe("ready");
    expect(f.provider.repair).toHaveBeenCalledTimes(1);
  });

  it.each(["zero", "unknown", "partial-charged"])("distinguishes %s cost without assuming an offline fixture is free", async (kind) => {
    const f = setup();
    if (kind === "zero") f.provider.research.mockResolvedValue(output(0));
    if (kind === "unknown") f.provider.research.mockResolvedValue(output(0, { usage: null, actualModel: null }));
    if (kind === "partial-charged") f.provider.research.mockRejectedValue(new ResearchProviderError("invalid-transport", false, true, { actualModel: "actual/model", usage: null }));
    const result = await f.orchestrator.start("owner-a", input, context);
    expect(result.state).toBe(kind === "partial-charged" ? "failed" : "ready");
    expect(ledger(f).costs).toEqual([expect.objectContaining({ status: kind === "zero" ? "settled" : "conservative-hold", settled_micros: 0 })]);
  });

  it.each(["missing-citation", "unsafe-url", "domain-tier", "missing-unit", "missing-fields", "bad-json", "repair-disabled", "repair-new-facts"])("does not repair or accept unapproved content: %s", async (kind) => {
    const f = setup(); const candidate = researchCandidateSchema.parse(validResearchCandidate); let annotations = structuredClone(validAnnotations); let content: string;
    if (kind === "missing-citation") annotations = [];
    if (kind === "unsafe-url") candidate.resources[0].url = "http://127.0.0.1/private";
    if (kind === "domain-tier") for (const resource of candidate.resources) resource.sourceTier = "community";
    if (kind === "missing-unit") candidate.unitTemplates = [];
    content = JSON.stringify(candidate);
    if (kind === "missing-fields") content = '{"role":{"id":"only-role"}}';
    if (kind === "bad-json") content = "definitely not JSON";
    if (kind === "repair-disabled" || kind === "repair-new-facts") content = content.replace(/}$/, ",}");
    f.provider.research.mockResolvedValue(output(110, { candidate: null, content, annotations }));
    if (kind === "repair-new-facts") {
      const changed = researchCandidateSchema.parse(validResearchCandidate); changed.role.summary = "New invented facts with no support in the original response.";
      f.provider.repair.mockResolvedValue(output(30, { candidate: changed, content: JSON.stringify(changed) }));
    }
    const orchestrator = kind === "repair-disabled" ? f.fresh({ config: { ...config, budget: { ...config.budget, repairMaximumMicros: 0, maximumMicros: 1000 } } }).orchestrator : f.orchestrator;
    expect((await orchestrator.start("owner-a", input, context)).state).not.toBe("ready");
    expect(f.provider.repair).toHaveBeenCalledTimes(kind === "repair-new-facts" ? 1 : 0);
    expect(ledger(f).quotas).not.toContainEqual(expect.objectContaining({ entry_kind: "accepted" }));
  });

  it.each([false, true, "unknown"] as const)("settles provider failure with charged=%s without exposing provider details", async (charged) => {
    const f = setup(); f.provider.research.mockRejectedValue(new ResearchProviderError("timeout", true, charged, { actualModel: "actual/error-model", usage: charged === true ? output().usage : null }));
    const result = await f.orchestrator.start("owner-a", input, context);
    expect(result).toMatchObject({ state: "failed", failureCategory: "timeout", retryable: true });
    expect(JSON.stringify(result)).not.toContain("actual/error-model");
    expect(ledger(f).costs).toEqual([expect.objectContaining({ status: charged === false ? "released" : charged === true ? "settled" : "conservative-hold", settled_micros: charged === true ? 110 : 0 })]);
    expect(ledger(f).audits).toHaveLength(1);
  });

  it("audits charged invalid transport with the actual returned model, and never repairs truncation", async () => {
    const f = setup(); f.provider.research.mockRejectedValue(new ResearchProviderError("invalid-transport", false, true, { actualModel: "actual/invalid-output", usage: output().usage }));
    expect((await f.orchestrator.start("owner-a", input, context)).state).toBe("failed");
    expect(ledger(f).audits).toEqual([expect.objectContaining({ model: "actual/invalid-output", error_code: "invalid-transport" })]); expect(f.provider.repair).not.toHaveBeenCalled();
    expect(ledger(f).costs).toEqual([expect.objectContaining({ status: "settled", settled_micros: 110 })]);
  });

  it("refuses changed configuration on retry before any new quota/cost/provider work", async () => {
    const f = setup(); f.provider.research.mockRejectedValue(new ResearchProviderError("unavailable", true, false));
    const failed = await f.orchestrator.start("owner-a", input, context); const before = ledger(f);
    await expect(f.fresh({ config: { ...config, configFingerprint: "new-fixed-model-config" } }).orchestrator.retry("owner-a", failed.id, "mutation-retry", context)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(ledger(f)).toEqual(before); expect(f.provider.research).toHaveBeenCalledTimes(1);
  });

  it("requires working quota recovery capability before admitting a paid attempt", async () => {
    const f = setup(); vi.spyOn(f.entitlements, "readResearchReservation").mockRejectedValue(new Error("missing durable capability"));
    await expect(f.orchestrator.start("owner-a", input, context)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(f.provider.research).not.toHaveBeenCalled(); expect(ledger(f).costs).toHaveLength(0);
  });

  it("preflights both exact audit attempts before authority and fails closed when recovery read rejects", async () => {
    const f = setup(); const reads: Array<[string, string]> = [];
    const audits = { record: f.audits.record.bind(f.audits), readResearchAttempt: vi.fn(async (ownerId: string, requestId: string) => {
      reads.push([ownerId, requestId]); if (reads.length === 1) return null; throw new Error("private reader failure");
    }) };
    await expect(f.fresh({ audits }).orchestrator.start("owner-a", input, context)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    const run = f.db.database.prepare("SELECT id,request_id,state FROM research_runs").get() as { id: string; request_id: string; state: string };
    expect(reads.slice(0, 2)).toEqual((["role-research", "role-research-repair"] as const).map((purpose) => ["owner-a", deterministicId("research-attempt", ["owner-a", run.id, run.request_id, purpose])]));
    expect(run.state).toBe("failed"); expect(ledger(f)).toEqual({ quotas: [], costs: [], audits: [] });
    expect(f.provider.research).not.toHaveBeenCalled(); expect(f.provider.repair).not.toHaveBeenCalled();
  });

  it.each(["role-research", "role-research-repair"] as const)("rejects a pre-existing exact %s attempt before granting authority", async (purpose) => {
    const f = setup(); const lookup = f.repository.findFreshPackage.bind(f.repository);
    const reader = vi.spyOn(f.audits, "readResearchAttempt");
    vi.spyOn(f.repository, "findFreshPackage").mockImplementation(async (request) => {
      const cached = await lookup(request);
      const run = f.db.database.prepare("SELECT id,request_id FROM research_runs").get() as { id: string; request_id: string };
      await f.audits.record({ userId: "owner-a", requestId: deterministicId("research-attempt", ["owner-a", run.id, run.request_id, purpose]), purpose,
        provider: config.providerName, model: null, promptVersion: config.versions.promptVersion, inputSchemaVersion: config.versions.inputSchemaVersion,
        outputSchemaVersion: config.versions.outputSchemaVersion, status: "failed", latencyMs: 0, errorCode: "unavailable", usage: null, charged: "unknown" });
      reader.mockClear(); return cached;
    });
    await expect(f.orchestrator.start("owner-a", input, context)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    const run = f.db.database.prepare("SELECT id,request_id,state FROM research_runs").get() as { id: string; request_id: string; state: string };
    expect(reader.mock.calls.slice(0, 2)).toEqual((["role-research", "role-research-repair"] as const).map((candidatePurpose) => ["owner-a", deterministicId("research-attempt", ["owner-a", run.id, run.request_id, candidatePurpose])]));
    expect(run.state).toBe("failed"); expect(ledger(f).quotas).toEqual([]); expect(ledger(f).costs).toEqual([]); expect(ledger(f).audits).toHaveLength(1);
    expect(f.provider.research).not.toHaveBeenCalled(); expect(f.provider.repair).not.toHaveBeenCalled();
  });

  it("preserves known actual cost/model when a successful transport contains unsafe annotations", async () => {
    const f = setup(); f.provider.research.mockResolvedValue(output(110, { annotations: [{ type: "url_citation", url: validAnnotations[0].url, title: "<script>alert(1)</script>" }] }));
    expect((await f.orchestrator.start("owner-a", input, context)).state).toBe("failed");
    expect(ledger(f).audits).toEqual([expect.objectContaining({ model: "actual/research", error_code: "invalid-transport" })]);
    expect(ledger(f).costs).toEqual([expect.objectContaining({ status: "settled", settled_micros: 110 })]);
  });
});

describe("durable recovery across new instances on the same real SQLite", () => {
  it.each(["quota", "cost", "researching", "research-receipt", "repair-receipt", "terminal", "quota-settlement", "cost-settlement"])("recovers a process interrupted at %s without replaying a provider", async (point) => {
    const f = setup(); const pending = pause();
    if (point === "quota") { const original = f.entitlements.authorizeResearch.bind(f.entitlements); vi.spyOn(f.entitlements, "authorizeResearch").mockImplementation(async (request) => { const result = await original(request); await pending.stop(); return result; }); }
    if (point === "cost") { const original = f.budget.reserve.bind(f.budget); vi.spyOn(f.budget, "reserve").mockImplementation(async (request) => { const result = await original(request); await pending.stop(); return result; }); }
    if (point === "researching") { const original = f.repository.transition.bind(f.repository); vi.spyOn(f.repository, "transition").mockImplementation(async (command) => { const result = await original(command); if (command.to === "researching") await pending.stop(); return result; }); }
    if (point === "research-receipt" || point === "repair-receipt") {
      if (point === "repair-receipt") f.provider.research.mockResolvedValue(output(110, { candidate: null, content: JSON.stringify(validResearchCandidate).replace(/}$/, ",}") }));
      const original = f.audits.record.bind(f.audits); vi.spyOn(f.audits, "record").mockImplementation(async (record) => { await original(record); if (record.purpose === (point === "research-receipt" ? "role-research" : "role-research-repair")) await pending.stop(); });
    }
    if (point === "terminal") { const original = f.repository.saveValidation.bind(f.repository); vi.spyOn(f.repository, "saveValidation").mockImplementation(async (command) => { const result = await original(command); await pending.stop(); return result; }); }
    if (point === "quota-settlement") { const original = f.entitlements.finalize.bind(f.entitlements); vi.spyOn(f.entitlements, "finalize").mockImplementation(async (...args) => { await pending.stop(); return original(...args); }); }
    if (point === "cost-settlement") { const original = f.budget.settle.bind(f.budget); vi.spyOn(f.budget, "settle").mockImplementation(async (...args) => { await pending.stop(); return original(...args); }); }
    const running = f.orchestrator.start("owner-a", input, context); await pending.at;
    const stored = f.db.database.prepare("SELECT id,request_id,state FROM research_runs").get() as { id: string; request_id: string; state: string };
    const before = ledger(f); const calls = f.provider.research.mock.calls.length + f.provider.repair.mock.calls.length;
    const terminal = ["terminal", "quota-settlement", "cost-settlement"].includes(point);
    if (!terminal) expect((await f.fresh({}, true).orchestrator.get("owner-a", stored.id))?.state).toBe(stored.state);
    f.setNow(day + 86_400_000 + 1000);
    const recovered = await f.fresh({}, true).orchestrator.get("owner-a", stored.id);
    expect(recovered?.state).toBe(terminal ? "ready" : "failed");
    expect(f.provider.research.mock.calls.length + f.provider.repair.mock.calls.length).toBe(calls);
    const after = ledger(f);
    expect(after.quotas).toContainEqual(expect.objectContaining({ reservation_id: before.quotas[0].reservation_id, entry_kind: terminal ? "accepted" : "failed", units: terminal ? 1 : 0 }));
    if (point !== "quota") {
      const noProvider = point === "cost";
      expect(after.costs).toEqual([expect.objectContaining({ id: before.costs[0].id, request_id: stored.request_id, day_bucket_id: before.costs[0].day_bucket_id, month_bucket_id: before.costs[0].month_bucket_id, status: terminal ? "settled" : noProvider ? "released" : "conservative-hold", settled_micros: terminal ? 110 : 0 })]);
    }
    pending.release(); await running.catch(() => undefined);
    expect(f.provider.research.mock.calls.length + f.provider.repair.mock.calls.length).toBe(calls);
    if (point === "research-receipt" || point === "repair-receipt") {
      expect(ledger(f).quotas).toEqual(after.quotas); expect(ledger(f).audits).toEqual(after.audits);
      expect(ledger(f).costs).toEqual([expect.objectContaining({ id: before.costs[0].id, status: "settled", settled_micros: point === "repair-receipt" ? 140 : 110 })]);
    } else expect(ledger(f)).toEqual(after);
  });

  it("holds the combined reservation when Repair was authorized but its receipt is missing", async () => {
    const f = setup(); const pending = pause(); f.provider.research.mockResolvedValue(output(110, { candidate: null, content: JSON.stringify(validResearchCandidate).replace(/}$/, ",}") }));
    f.provider.repair.mockImplementation(async () => { await pending.stop(); return output(30); });
    const running = f.orchestrator.start("owner-a", input, context); await pending.at;
    const run = f.db.database.prepare("SELECT id FROM research_runs").get() as { id: string };
    f.setNow(day + 70_000); await f.fresh().orchestrator.get("owner-a", run.id);
    expect(ledger(f).costs).toEqual([expect.objectContaining({ maximum_reserved_micros: 1200, settled_micros: 0, status: "conservative-hold" })]);
    pending.release(); await running.catch(() => undefined);
    expect((await f.fresh().orchestrator.get("owner-a", run.id))?.state).toBe("failed");
    expect(f.provider.repair).toHaveBeenCalledTimes(1);
  });

  it("late complete receipts resolve a hold without changing expired failure, quota verdict, or calling again", async () => {
    const f = setup(); const pending = pause(); f.provider.research.mockResolvedValue(output(110, { candidate: null, content: JSON.stringify(validResearchCandidate).replace(/}$/, ",}") }));
    f.provider.repair.mockImplementation(async () => { await pending.stop(); return output(30); });
    const running = f.orchestrator.start("owner-a", input, context); await pending.at;
    const row = f.db.database.prepare("SELECT id FROM research_runs").get() as { id: string };
    f.setNow(day + 70_000); const initial = await f.fresh({}, true).orchestrator.get("owner-a", row.id);
    expect(initial?.state).toBe("failed");
    await f.fresh({}, true).orchestrator.get("owner-a", row.id);
    expect(ledger(f).costs).toEqual([expect.objectContaining({ status: "conservative-hold", settled_micros: 0 })]);
    pending.release(); await running.catch(() => undefined);
    expect((await f.fresh({}, true).orchestrator.get("owner-a", row.id))?.state).toBe("failed");
    expect(ledger(f).costs).toEqual([expect.objectContaining({ status: "settled", settled_micros: 140 })]);
    expect(ledger(f).quotas).toContainEqual(expect.objectContaining({ entry_kind: "failed", units: 0 }));
    expect(f.provider.research).toHaveBeenCalledTimes(1); expect(f.provider.repair).toHaveBeenCalledTimes(1);
  });

  it("records a late Research success as accounting evidence but cannot publish or start Repair", async () => {
    const f = setup(); const pending = pause(); f.provider.research.mockImplementation(async () => { await pending.stop(); return output(110); });
    const running = f.orchestrator.start("owner-a", input, context); await pending.at;
    const row = f.db.database.prepare("SELECT id FROM research_runs").get() as { id: string };
    f.setNow(day + 70_000); expect((await f.fresh().orchestrator.get("owner-a", row.id))?.state).toBe("failed");
    expect(ledger(f).costs).toEqual([expect.objectContaining({ status: "conservative-hold" })]);
    pending.release(); await running.catch(() => undefined);
    expect((await f.fresh().orchestrator.get("owner-a", row.id))?.state).toBe("failed");
    expect(ledger(f).audits).toHaveLength(1); expect(ledger(f).costs).toEqual([expect.objectContaining({ status: "settled", settled_micros: 110 })]);
    expect(f.provider.repair).not.toHaveBeenCalled();
  });

  it("cannot publish or revive a valid receipt arriving after the 660 second local validation lease", async () => {
    const f = setup(); const pending = pause();
    f.provider.research.mockImplementation(async () => { await pending.stop(); return output(110); });
    const local = f.fresh({ config: { ...structuredClone(config), activeTtlMs: 660_000 } });
    const running = local.orchestrator.start("owner-a", input, context); await pending.at;
    const row = f.db.database.prepare("SELECT id FROM research_runs").get() as { id: string };
    f.setNow(day + 661_001);
    expect((await f.fresh({ config: { ...structuredClone(config), activeTtlMs: 660_000 } }).orchestrator.get("owner-a", row.id))?.state).toBe("failed");
    pending.release(); await running.catch(() => undefined);
    const recovered = f.fresh({ config: { ...structuredClone(config), activeTtlMs: 660_000 } });
    expect((await recovered.orchestrator.get("owner-a", row.id))?.state).toBe("failed");
    await expect(recovered.repository.resolveReadyPackage("owner-a", row.id)).rejects.toBeDefined();
    expect(ledger(f).audits).toHaveLength(1);
    expect(ledger(f).costs).toEqual([expect.objectContaining({ status: "settled", settled_micros: 110 })]);
    expect(f.provider.research).toHaveBeenCalledOnce();
    expect(f.provider.repair).not.toHaveBeenCalled();
  });

  it("holds the first self-reclaimed expired success then settles it on a fresh reconciliation", async () => {
    const f = setup();
    f.provider.research.mockImplementation(async () => { f.setNow(day + 70_000); return output(110); });
    const first = await f.orchestrator.start("owner-a", input, context);
    expect(first.state).toBe("failed");
    expect(ledger(f).costs).toEqual([expect.objectContaining({ maximum_reserved_micros: 1200, status: "conservative-hold", settled_micros: 0 })]);
    expect(ledger(f).quotas).toContainEqual(expect.objectContaining({ entry_kind: "failed", units: 0 }));
    expect(ledger(f).audits).toEqual([expect.objectContaining({ purpose: "role-research", status: "rejected", error_code: "invalid-result" })]);
    expect(f.provider.research).toHaveBeenCalledTimes(1); expect(f.provider.repair).not.toHaveBeenCalled();
    const before = ledger(f);
    expect((await f.fresh({}, true).orchestrator.get("owner-a", first.id))?.state).toBe("failed");
    expect(ledger(f).costs).toEqual([expect.objectContaining({ id: before.costs[0].id, status: "settled", settled_micros: 110 })]);
    expect(ledger(f).quotas).toEqual(before.quotas); expect(ledger(f).audits).toEqual(before.audits);
    expect(f.provider.research).toHaveBeenCalledTimes(1); expect(f.provider.repair).not.toHaveBeenCalled();
  });

  it("missing audit at unfinalized Ready never accepts quota and keeps a conservative hold", async () => {
    const f = setup(); const pending = pause(); const original = f.repository.saveValidation.bind(f.repository);
    vi.spyOn(f.repository, "saveValidation").mockImplementation(async (command) => { const saved = await original(command); await pending.stop(); return saved; });
    const running = f.orchestrator.start("owner-a", input, context); await pending.at;
    const row = f.db.database.prepare("SELECT id FROM research_runs").get() as { id: string };
    f.db.database.prepare("DELETE FROM ai_runs").run();
    await expect(f.fresh().orchestrator.get("owner-a", row.id)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(ledger(f).quotas).toHaveLength(1);
    expect(ledger(f).costs).toEqual([expect.objectContaining({ status: "conservative-hold" })]);
    pending.release(); await running.catch(() => undefined);
  });

  it("settles a persisted Ready run from its original receipts after the package expires", async () => {
    const f = setup(); const pending = pause(); const original = f.repository.saveValidation.bind(f.repository);
    vi.spyOn(f.repository, "saveValidation").mockImplementation(async (command) => { const saved = await original(command); await pending.stop(); return saved; });
    const running = f.orchestrator.start("owner-a", input, context); await pending.at;
    const row = f.db.database.prepare("SELECT id,request_id FROM research_runs").get() as { id: string; request_id: string };
    const before = ledger(f); const providerCalls = f.provider.research.mock.calls.length + f.provider.repair.mock.calls.length;
    f.setNow(day + 8 * 86_400_000);
    await expect(f.fresh({}, true).orchestrator.get("owner-a", row.id)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(ledger(f).quotas).toContainEqual(expect.objectContaining({ reservation_id: before.quotas[0].reservation_id, entry_kind: "accepted", units: 1 }));
    expect(ledger(f).costs).toEqual([expect.objectContaining({ id: before.costs[0].id, request_id: row.request_id, day_bucket_id: before.costs[0].day_bucket_id, month_bucket_id: before.costs[0].month_bucket_id, status: "settled", settled_micros: 110 })]);
    expect(f.provider.research.mock.calls.length + f.provider.repair.mock.calls.length).toBe(providerCalls);
    pending.release(); await running.catch(() => undefined);
  });

  it("rejects proven receipts that contradict an already settled budget without overwriting it", async () => {
    const f = setup(); const ready = await f.orchestrator.start("owner-a", input, context);
    const row = f.db.database.prepare("SELECT usage_json FROM ai_runs").get() as { usage_json: string };
    const receipt = JSON.parse(row.usage_json); receipt.usage.costMicros = 900;
    f.db.database.prepare("UPDATE ai_runs SET usage_json=?").run(JSON.stringify(receipt));
    const before = ledger(f).costs;
    await expect(f.fresh().orchestrator.get("owner-a", ready.id)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(ledger(f).costs).toEqual(before);
  });

  it("does not newly accept quota when completed receipts contradict existing terminal cost", async () => {
    const f = setup(); const pending = pause(); const original = f.repository.saveValidation.bind(f.repository);
    vi.spyOn(f.repository, "saveValidation").mockImplementation(async (command) => { const saved = await original(command); await pending.stop(); return saved; });
    const running = f.orchestrator.start("owner-a", input, context); await pending.at;
    const row = f.db.database.prepare("SELECT id FROM research_runs").get() as { id: string };
    const budget = f.db.database.prepare("SELECT id FROM ai_budget_reservations").get() as { id: string };
    await f.budget.settle("owner-a", budget.id, { kind: "actual", actualMicros: 900 });
    await expect(f.fresh().orchestrator.get("owner-a", row.id)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(ledger(f).quotas).toHaveLength(1);
    pending.release(); await running.catch(() => undefined);
  });

  it("rejects a receipt version that disagrees with the durable published package after config changes", async () => {
    const f = setup(); const result = await f.orchestrator.start("owner-a", input, context);
    f.db.database.prepare("UPDATE ai_runs SET prompt_version='contradictory-prompt-version'").run();
    await expect(f.fresh({ config: { ...config, configFingerprint: "new-config" } }, true).orchestrator.get("owner-a", result.id)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("concurrent expired recovery wins exactly one terminal CAS and never replays the provider", async () => {
    const f = setup(); const pending = pause(); f.provider.research.mockImplementation(async () => { await pending.stop(); return output(); });
    const running = f.orchestrator.start("owner-a", input, context); await pending.at;
    const row = f.db.database.prepare("SELECT id FROM research_runs").get() as { id: string };
    f.setNow(day + 70_000);
    const recovered = await Promise.all([f.fresh({}, true).orchestrator.get("owner-a", row.id), f.fresh({}, true).orchestrator.get("owner-a", row.id)]);
    expect(recovered.map((r) => r?.state)).toEqual(["failed", "failed"]);
    expect((await f.repository.getRun("owner-a", row.id))?.stateVersion).toBe(2);
    expect(ledger(f).quotas).toHaveLength(2); expect(f.provider.research).toHaveBeenCalledTimes(1);
    pending.release(); await running.catch(() => undefined);
  });

  it("audit storage failure prevents publication and holds cost without a hidden second request", async () => {
    const f = setup(); vi.spyOn(f.audits, "record").mockRejectedValue(new Error("private storage detail"));
    await expect(f.orchestrator.start("owner-a", input, context)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    const row = f.db.database.prepare("SELECT id,state FROM research_runs").get() as { id: string; state: string };
    expect(row.state).toBe("failed"); expect(ledger(f).costs).toEqual([expect.objectContaining({ status: "conservative-hold" })]);
    await expect(f.fresh().orchestrator.get("owner-a", row.id)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(f.provider.research).toHaveBeenCalledTimes(1); expect(f.provider.repair).not.toHaveBeenCalled();
  });

  it("fails closed on missing terminal audit or unreadable recovery while preserving already-settled accounting", async () => {
    const f = setup(); const ready = await f.orchestrator.start("owner-a", input, context); const before = ledger(f);
    const fresh = f.fresh(); vi.spyOn(fresh.audits, "readResearchAttempt").mockRejectedValue(new Error("secret database failure"));
    await expect(fresh.orchestrator.get("owner-a", ready.id)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(ledger(f)).toEqual(before);
    f.db.database.prepare("DELETE FROM ai_runs").run();
    await expect(f.fresh().orchestrator.get("owner-a", ready.id)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(ledger(f).costs).toEqual(before.costs);
    await expect(f.fresh().orchestrator.get("owner-b", ready.id)).resolves.toBeNull();
  });

  it("explicit retry uses new request and reservations after expired recovery; replay never retries implicitly", async () => {
    const f = setup(); const pending = pause(); f.provider.research.mockImplementationOnce(async () => { await pending.stop(); return output(); });
    const running = f.orchestrator.start("owner-a", input, context); await pending.at;
    const row = f.db.database.prepare("SELECT id,request_id FROM research_runs").get() as { id: string; request_id: string };
    f.setNow(day + 70_000);
    expect((await f.fresh().orchestrator.start("owner-a", input, context)).state).toBe("failed"); expect(f.provider.research).toHaveBeenCalledTimes(1);
    const retried = await f.fresh().orchestrator.retry("owner-a", row.id, "mutation-retry", context);
    expect(retried.state).toBe("ready"); expect(retried.id).not.toBe(row.id);
    const retryRun = await f.repository.getRun("owner-a", retried.id); expect(retryRun?.requestId).not.toBe(row.request_id);
    expect(ledger(f).costs).toHaveLength(2); expect(new Set(ledger(f).costs.map((cost) => cost.id)).size).toBe(2);
    pending.release(); await running.catch(() => undefined);
    await f.fresh().orchestrator.retry("owner-a", row.id, "mutation-retry", context);
    expect(f.provider.research).toHaveBeenCalledTimes(2);
  });
});
