// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { signBridgeMessage, verifyBridgeMessage } from "../../app/server/research/executor/auth";
import { BRIDGE_BODY_LIMITS, readBridgeBody } from "../../app/server/research/executor/body";
import { encodeBridgeDto } from "../../app/server/research/executor/bridge-contract";
import { readResearchBridgeConnection } from "../../app/server/research/executor/connection-config";
import { D1BridgeNonceStore } from "../../app/server/research/executor/d1-nonce-store";
import { hashBridgeJob, parseBridgeJob } from "../../app/server/research/executor/job";
import { D1SiteBridgeRepository } from "../../app/server/research/d1-site-bridge-repository";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { readResearchPolicyConfiguration, type ResearchProductionEnvironment } from "../../app/server/research/production-policy";
import { createResearchServiceFactory, readResearchProductionConfiguration } from "../../app/server/research/service-factory";
import { createD1OperationBarrier, createResearchBridgeFixture, TEST_PRODUCTION_ENVIRONMENT } from "../helpers/research-bridge-fixture";
import { createSiteAdmissionFixture } from "../helpers/site-admission-fixture";
import { createResearchD1 } from "../helpers/sqlite-d1";

const NOW = Date.parse("2026-09-15T12:00:00.000Z");
const input = { role: "Data Product Manager", locale: "en-US", mutationId: "factory-mutation-1" };
const gate = { cohortEnabled: true, rateAllowed: true };
const cleanup: (() => void)[] = [];
const forbidden: ReturnType<typeof vi.fn>[] = [];
afterEach(() => {
  for (const spy of forbidden.splice(0)) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.useRealTimers();
  for (const dispose of cleanup.splice(0)) dispose();
});

function setup(changes: ResearchProductionEnvironment = {}) {
  const f = createSiteAdmissionFixture();
  const executorDb = createResearchD1();
  cleanup.push(() => { f.db.close(); executorDb.close(); });
  const keyRead = vi.fn(() => { throw new Error("Site must not read Provider key"); });
  const createProvider = vi.fn(() => { throw new Error("Site must not construct Provider"); });
  forbidden.push(keyRead, createProvider);
  const environment: ResearchProductionEnvironment = { ...TEST_PRODUCTION_ENVIRONMENT, ...changes };
  Object.defineProperty(environment, "OPENROUTER_API_KEY", { enumerable: true, get: keyRead });
  const connection = readResearchBridgeConnection(TEST_PRODUCTION_ENVIRONMENT)!;
  let wall = NOW; let mono = 0; let ids = 0;
  let db = f.db as unknown as D1Database;
  let beforeResponse: (() => Promise<void>) | null = null;
  const bridgeFetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = input instanceof Request && init === undefined ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    expect(path).toBe("/internal/research-bridge/submit");
    const jobId = request.headers.get("x-arc-bridge-job-id")!;
    const body = await readBridgeBody(request, { maxBytes: BRIDGE_BODY_LIMITS.request, timeoutMs: 1000 });
    await verifyBridgeMessage({ context: { direction: "site-to-executor", kind: "request", method: "POST", path,
      audience: connection.executorOrigin, jobId, status: null }, body, headers: request.headers,
      keyId: connection.siteToExecutor.keyId, keyBytes: connection.siteToExecutor.copyKeyBytes(),
      nonces: new D1BridgeNonceStore(executorDb as unknown as D1Database), now: () => wall });
    const job = parseBridgeJob(JSON.parse(new TextDecoder().decode(body)));
    const output = encodeBridgeDto({ jobId, requestHash: await hashBridgeJob(job), workflowId: jobId,
      workflowAcceptedAt: wall }, BRIDGE_BODY_LIMITS.status);
    await beforeResponse?.();
    const headers = await signBridgeMessage({ context: { direction: "site-to-executor", kind: "response", method: "POST", path,
      audience: connection.executorOrigin, jobId, status: 202 }, body: output,
      keyId: connection.siteToExecutor.keyId, keyBytes: connection.siteToExecutor.copyKeyBytes(), now: () => wall });
    return new Response(new Uint8Array(output), { status: 202, headers });
  });
  forbidden.push(vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network")));
  const runtime = { environment, getD1: vi.fn(() => db), createProvider, fetch: bridgeFetch,
    now: () => wall, monoNow: () => mono, createId: () => `factory-id-${++ids}` };
  const factory = createResearchServiceFactory(runtime);
  const createStored = async () => {
    const command = f.remoteCommand();
    return f.research.createRemoteOrReplay({ ...command, mutationId: input.mutationId,
      configFingerprint: readResearchPolicyConfiguration(TEST_PRODUCTION_ENVIRONMENT)!.configuration.configFingerprint });
  };
  return { f, runtime, factory, environment, keyRead, createProvider, bridgeFetch, createStored,
    setDb: (value: D1Database) => { db = value; }, setMono: (value: number) => { mono = value; },
    setWall: (value: number) => { wall = value; f.setAppNow(value); f.setSqlNow(value); },
    beforeResponse: (hook: () => Promise<void>) => { beforeResponse = hook; } };
}

describe("production Research factory remote integration", () => {
  it("exposes credential-free configuration, rate and fresh service construction", () => {
    const s = setup();
    expect(readResearchProductionConfiguration(s.environment)).toEqual(readResearchPolicyConfiguration(s.environment)!.configuration);
    expect(s.factory.rateLimitPerMinute()).toBe(2);
    expect(s.factory.createNewCallService()).not.toBeNull();
    expect(s.factory.createRecoveryService()).toBeDefined();
    expect(s.bridgeFetch).not.toHaveBeenCalled();
  });

  it("starts with actual guarded admission and persisted signed acceptance, then reads/replays/recovers", async () => {
    const s = setup(); const service = s.factory.createNewCallService(); expect(service).not.toBeNull();
    const view = await service!.start("owner-a", input, gate);
    expect(view).toMatchObject({ state: "queued", backgroundAccepted: true });
    expect(await service!.get("owner-a", view.id)).toEqual(view);
    expect(await service!.recover("owner-a", { ...input, kind: "start" })).toEqual(view);
    expect(await service!.start("owner-a", input, gate)).toEqual(view);
    expect(await s.factory.createRecoveryService().get("owner-a", view.id)).toEqual(view);
    expect(await s.factory.createRecoveryService().recover("owner-a", { ...input, kind: "start" })).toEqual(view);
    expect(s.bridgeFetch).toHaveBeenCalledTimes(1);
    expect(s.f.readCounts()).toMatchObject({ researchRuns: 1, siteExecutions: 1, quotaLedger: 1, aiBudgetReservations: 1 });
    const execution = (await s.f.executions.read("owner-a", view.id))!;
    const bridge = new D1SiteBridgeRepository(s.f.db as unknown as D1Database, s.f.research, s.f.executions);
    expect(await bridge.readAcceptance(execution)).not.toBeNull();
    expect(JSON.stringify(view)).not.toMatch(/jobId|workflowId|requestHash|reservation|secret|kimi/u);
  });

  it("retries a terminal source through the production factory without Provider capabilities", async () => {
    const s = setup(); const source = await s.createStored();
    const execution = source.execution!;
    await s.f.executions.closeBeforeBegin(s.f.closeCommand(execution));
    const service = s.factory.createNewCallService(); expect(service).not.toBeNull();
    const view = await service!.retry("owner-a", source.run.id, "factory-retry-1", gate);
    expect(view).toMatchObject({ state: "queued", backgroundAccepted: true });
    expect(view.id).not.toBe(source.run.id);
    expect(await service!.recover("owner-a", { ...input, mutationId: "factory-retry-1", kind: "retry", sourceRunId: source.run.id })).toEqual(view);
    expect(s.bridgeFetch).toHaveBeenCalledTimes(1);
  });

  it.each(["", "unknown", "synchronous"])("rejects selector %j before DB, key, Provider or external requests", (selector) => {
    const s = setup({ ARC_AI_RESEARCH_EXECUTOR: selector });
    expect(readResearchProductionConfiguration(s.environment)).toBeNull();
    expect(s.factory.rateLimitPerMinute()).toBe(0); expect(s.factory.createNewCallService()).toBeNull();
    expect(s.runtime.getD1).not.toHaveBeenCalled(); expect(s.bridgeFetch).not.toHaveBeenCalled();
  });

  it.each([
    { ARC_AI_RESEARCH_EXECUTOR_URL: undefined }, { ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX: undefined },
    { ARC_AI_RESEARCH_PROFILE: undefined }, { ARC_AI_IP_HASH_SALT: "short" },
    { ARC_AI_RESEARCH_TIMEOUT_MS: "1200001" }, { ARC_AI_ENABLED: "false" }, { ARC_AI_RESEARCH_ENABLED: "false" },
  ])("rejects incomplete remote configuration before storage: %j", (changes) => {
    const s = setup(changes);
    expect(readResearchProductionConfiguration(s.environment)).toBeNull();
    expect(s.factory.createNewCallService()).toBeNull(); expect(s.factory.rateLimitPerMinute()).toBe(0);
    expect(s.runtime.getD1).not.toHaveBeenCalled(); expect(s.bridgeFetch).not.toHaveBeenCalled();
  });

  it.each([
    { ARC_AI_ENABLED: "false", ARC_AI_RESEARCH_ENABLED: "false" },
    { ARC_AI_RESEARCH_EXECUTOR: "unknown", ARC_AI_RESEARCH_PROFILE: undefined },
    { ARC_AI_RESEARCH_EXECUTOR: undefined, ARC_AI_RESEARCH_EXECUTOR_URL: undefined },
  ])("recovers by persisted remote mode despite changed new-call settings %j", async (changes) => {
    const s = setup(changes); const source = await s.createStored();
    const recovery = s.factory.createRecoveryService();
    const view = await recovery.get("owner-a", source.run.id);
    expect(view).toMatchObject({ id: source.run.id, state: "failed", failureCategory: "service-unavailable", backgroundAccepted: false });
    expect(await recovery.recover("owner-a", { ...input, kind: "start" })).toEqual(view);
    expect(s.bridgeFetch).not.toHaveBeenCalled();
    expect(s.f.readCounts()).toMatchObject({ quotaLedger: 0, aiBudgetReservations: 0 });
  });

  it("keeps accepted remote reads visible when new-call gates and bridge configuration are removed", async () => {
    const s = setup(); const service = s.factory.createNewCallService(); expect(service).not.toBeNull();
    const view = await service!.start("owner-a", input, gate);
    s.environment.ARC_AI_ENABLED = "false"; s.environment.ARC_AI_RESEARCH_ENABLED = "false";
    s.environment.ARC_AI_RESEARCH_EXECUTOR_URL = undefined;
    expect(s.factory.createNewCallService()).toBeNull();
    const recovery = s.factory.createRecoveryService();
    expect(await recovery.get("owner-a", view.id)).toEqual(view);
    expect(await recovery.recover("owner-a", { ...input, kind: "start" })).toEqual(view);
    expect(s.bridgeFetch).toHaveBeenCalledTimes(1);
  });

  it("does not expose write methods through recovery-only composition", async () => {
    const s = setup(); const recovery = s.factory.createRecoveryService();
    await expect(recovery.start("owner-a", input, gate)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    await expect(recovery.retry("owner-a", "missing-run", "factory-retry-1", gate)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(s.f.readCounts().researchRuns).toBe(0); expect(s.bridgeFetch).not.toHaveBeenCalled();
  });

  it("hides owner-B reads before remote transport and rejects owner-B retry", async () => {
    const s = setup(); const service = s.factory.createNewCallService(); expect(service).not.toBeNull();
    const view = await service!.start("owner-a", input, gate);
    expect(await s.factory.createRecoveryService().get("owner-b", view.id)).toBeNull();
    expect(await s.factory.createRecoveryService().recover("owner-b", { ...input, kind: "start" })).toBeNull();
    await expect(service!.retry("owner-b", view.id, "factory-retry-1", gate)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(s.bridgeFetch).toHaveBeenCalledTimes(1);
  });

  it("rechecks new-call gates at admission after service construction", async () => {
    const s = setup(); const service = s.factory.createNewCallService(); expect(service).not.toBeNull();
    s.environment.ARC_AI_RESEARCH_ENABLED = "false";
    expect(await service!.start("owner-a", input, gate)).toMatchObject({ state: "failed", backgroundAccepted: false });
    expect(s.f.readCounts()).toMatchObject({ quotaLedger: 0, aiBudgetReservations: 0 });
    expect(s.bridgeFetch).not.toHaveBeenCalled();
  });

  it("uses the operation fence for the Site signed-response nonce claim", async () => {
    const s = setup(); const service = s.factory.createNewCallService(); expect(service).not.toBeNull();
    const original = D1BridgeNonceStore.prototype.claim;
    let claims = 0;
    vi.spyOn(D1BridgeNonceStore.prototype, "claim").mockImplementation(async function (this: D1BridgeNonceStore, value) {
      claims += 1;
      if (claims === 2) s.setMono(4501); // First is executor request, second is Site response.
      return original.call(this, value);
    });
    const view = await service!.start("owner-a", input, gate);
    expect(view).toMatchObject({ state: "queued", backgroundAccepted: false });
    expect(claims).toBe(2);
    expect(s.f.db.database.prepare("SELECT count(*) AS n FROM research_bridge_nonces").get()).toMatchObject({ n: 0 });
    expect(s.f.db.database.prepare("SELECT count(*) AS n FROM research_site_acceptances").get()).toMatchObject({ n: 0 });
  });

  it("fences late admission writes after a stalled initial owned read", async () => {
    vi.useFakeTimers(); const s = setup();
    const barrier = createD1OperationBarrier(s.f.db as unknown as D1Database,
      (sql) => sql.includes("FROM research_runs"));
    s.setDb(barrier.db);
    const service = s.factory.createNewCallService(); expect(service).not.toBeNull();
    const result = service!.start("owner-a", input, gate).catch((error: unknown) => error);
    await barrier.entered; s.setMono(4501); barrier.expire(); await vi.advanceTimersByTimeAsync(4501);
    expect(await result).toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    barrier.release(); await vi.advanceTimersByTimeAsync(1);
    expect(barrier.lateStarts()).toBe(0); expect(s.f.readCounts().researchRuns).toBe(0);
    expect(s.bridgeFetch).not.toHaveBeenCalled();
  });

  it("preserves synchronous fingerprint/provider arguments and observes a remote alias without Provider work", async () => {
    const s = setup();
    const environment: ResearchProductionEnvironment = { ...TEST_PRODUCTION_ENVIRONMENT, ARC_AI_RESEARCH_EXECUTOR: undefined,
      OPENROUTER_API_KEY: "synthetic-test-key" };
    const research = vi.fn(async () => { throw new Error("must not invoke Provider for stored remote alias"); });
    const repair = vi.fn(async () => { throw new Error("must not repair stored remote alias"); });
    const createProvider = vi.fn(() => ({ research, repair }));
    const factory = createResearchServiceFactory({ environment, getD1: () => s.f.db as unknown as D1Database,
      createProvider, now: () => NOW, createId: () => "sync-request-1", fetch: s.bridgeFetch });
    const configuration = readResearchProductionConfiguration(environment)!;
    expect(configuration).toEqual(readResearchPolicyConfiguration(environment)!.configuration);
    expect(configuration.configFingerprint).toBe("p2-6e32d7563ab8083820f1c5128b673744");
    // Active aliases require the same frozen configuration; a selector change alone changes its fingerprint.
    const remote = await s.f.research.createRemoteOrReplay({ ...s.f.remoteCommand(), configFingerprint: configuration.configFingerprint });
    const service = factory.createNewCallService()!;
    expect(createProvider).toHaveBeenCalledExactlyOnceWith({ OPENROUTER_API_KEY: "synthetic-test-key",
      ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3", ARC_AI_MODEL_ECONOMY: "test/economy-fixed",
      researchTimeoutMs: 1200000, repairTimeoutMs: 10000, researchProfile: "kimi-low-output32k-v3" });
    expect(await service.start("owner-a", { ...input, mutationId: "sync-alias-mutation" }, gate)).toMatchObject({ id: remote.run.id, state: "queued" });
    expect(research).not.toHaveBeenCalled(); expect(repair).not.toHaveBeenCalled(); expect(s.bridgeFetch).not.toHaveBeenCalled();
  });

  it("delegates stored synchronous recovery unchanged with closed remote settings", async () => {
    const s = setup({ ARC_AI_ENABLED: "false" });
    const source = await s.f.research.createOrReplay(s.f.command());
    const original = D1ResearchRepository.prototype.getPublicRun;
    const read = vi.spyOn(D1ResearchRepository.prototype, "getPublicRun").mockImplementation(function (this: D1ResearchRepository, owner, run) {
      return original.call(this, owner, run);
    });
    expect(await s.factory.createRecoveryService().get("owner-a", source.run.id)).toMatchObject({ id: source.run.id, state: "queued", backgroundAccepted: false });
    expect(read).toHaveBeenCalled(); expect(s.bridgeFetch).not.toHaveBeenCalled();
  });

  it.each(["new-call", "recovery"])("pulls a begun remote receipt through the %s factory while never reading Site credentials", async (mode) => {
    const f = await createResearchBridgeFixture();
    cleanup.push(() => { f.db.close(); f.clientDb.close(); });
    const keyRead = vi.fn(() => { throw new Error("No Site key"); });
    const createProvider = vi.fn(() => { throw new Error("No Site Provider"); });
    forbidden.push(keyRead, createProvider, vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network")));
    const environment: ResearchProductionEnvironment = { ...TEST_PRODUCTION_ENVIRONMENT };
    Object.defineProperty(environment, "OPENROUTER_API_KEY", { get: keyRead });
    if (mode === "recovery") { environment.ARC_AI_ENABLED = "false"; environment.ARC_AI_RESEARCH_EXECUTOR = "unknown"; }
    const factory = createResearchServiceFactory({ environment, getD1: () => f.db as unknown as D1Database,
      createProvider, fetch: f.executorFetch, now: f.wallNow, monoNow: f.monoNow });
    const metadata = await f.metadata();
    f.setExecutorStatus({ jobId: f.execution.jobId, requestHash: f.execution.requestHash, dispatchState: "claimed",
      accepted: null, unsent: null, metadata, bodyState: "available" });
    const service = mode === "new-call" ? factory.createNewCallService() : factory.createRecoveryService();
    expect(service).not.toBeNull();
    const result = await service!.get("owner-a", f.execution.runId);
    expect(result).toMatchObject({ state: "ready", backgroundAccepted: false });
    expect(f.executorFetches()).toBe(2); expect(f.syntheticProviderCalls()).toBe(0);
    expect(await f.imports.reconcileMetadata(f.identity, metadata)).toMatchObject({ run: { state: "ready" } });
  });

  it("rejects a replay after a genuine remote-to-synchronous fingerprint change without invoking Provider", async () => {
    const s = setup(); await s.createStored();
    const research = vi.fn(async () => { throw new Error("No Provider replay"); });
    const repair = vi.fn(async () => { throw new Error("No Repair replay"); });
    const environment: ResearchProductionEnvironment = { ...TEST_PRODUCTION_ENVIRONMENT,
      ARC_AI_RESEARCH_EXECUTOR: undefined, OPENROUTER_API_KEY: "synthetic-test-key" };
    const factory = createResearchServiceFactory({ environment, getD1: () => s.f.db as unknown as D1Database,
      now: () => NOW, createProvider: () => ({ research, repair }), fetch: s.bridgeFetch });
    await expect(factory.createNewCallService()!.start("owner-a", input, gate)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(research).not.toHaveBeenCalled(); expect(repair).not.toHaveBeenCalled(); expect(s.bridgeFetch).not.toHaveBeenCalled();
    expect(await factory.createRecoveryService().recover("owner-a", { ...input, kind: "start" })).toMatchObject({ state: "failed" });
  });
});
