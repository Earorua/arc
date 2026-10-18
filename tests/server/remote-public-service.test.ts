// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { fingerprint } from "../../app/lib/planning/fingerprint";
import { D1EntitlementRepository } from "../../app/server/entitlements/d1-entitlement-repository";
import { D1ResearchBudgetRepository } from "../../app/server/research/d1-budget-repository";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1SiteBridgeRepository } from "../../app/server/research/d1-site-bridge-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { signBridgeMessage, verifyBridgeMessage } from "../../app/server/research/executor/auth";
import { BRIDGE_BODY_LIMITS, readBridgeBody } from "../../app/server/research/executor/body";
import { encodeBridgeDto, type AcceptedProof } from "../../app/server/research/executor/bridge-contract";
import { readResearchBridgeConnection } from "../../app/server/research/executor/connection-config";
import { D1BridgeNonceStore } from "../../app/server/research/executor/d1-nonce-store";
import { ExecutorBridgeClient } from "../../app/server/research/executor/executor-client";
import { BridgeTransport } from "../../app/server/research/executor/http-transport";
import { hashBridgeJob, parseBridgeJob, type BridgeJob } from "../../app/server/research/executor/job";
import { readResearchPolicyConfiguration } from "../../app/server/research/production-policy";
import { RemoteResearchReader } from "../../app/server/research/remote-public-reader";
import { RemoteResearchService, type RemoteResearchServiceDependencies } from "../../app/server/research/remote-public-service";
import { ResearchRepositoryError } from "../../app/server/research/repository";
import { SiteAdmissionCoordinator } from "../../app/server/research/site-admission";
import { createGuardedD1, createSiteBridgeOperations } from "../../app/server/research/site-bridge-factory";
import { createD1OperationBarrier, TEST_BRIDGE_ENVIRONMENT, TEST_PRODUCTION_ENVIRONMENT } from "../helpers/research-bridge-fixture";
import { createSiteAdmissionFixture } from "../helpers/site-admission-fixture";
import { createResearchD1 } from "../helpers/sqlite-d1";

const NOW = Date.parse("2026-09-15T12:00:00.000Z");
const input = { role: "Data Product Manager", locale: "en-US", mutationId: "mutation-public-1" };
const gate = { cohortEnabled: true, rateAllowed: true };
const cleanup: (() => void)[] = [];
const forbidden: ReturnType<typeof vi.fn>[] = [];

afterEach(() => {
  for (const spy of forbidden.splice(0)) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.useRealTimers();
  cleanup.splice(0).forEach((dispose) => dispose());
});

function setup() {
  const f = createSiteAdmissionFixture();
  const remoteDb = createResearchD1();
  cleanup.push(() => { f.db.close(); remoteDb.close(); });
  const connection = readResearchBridgeConnection(TEST_BRIDGE_ENVIRONMENT)!;
  const selection = readResearchPolicyConfiguration(TEST_PRODUCTION_ENVIRONMENT)!;
  let db = f.db as unknown as D1Database;
  let mono = 0;
  let wall = NOW;
  let requestSequence = 0;
  let beforeResponse: ((job: BridgeJob, proof: AcceptedProof) => Promise<void>) | null = null;
  let loseResponse = false;
  const submitted: BridgeJob[] = [];
  const fetch = vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe("https://executor.test/internal/research-bridge/submit");
    const jobId = request.headers.get("x-arc-bridge-job-id")!;
    const body = await readBridgeBody(request, { maxBytes: BRIDGE_BODY_LIMITS.request, timeoutMs: 1000 });
    await verifyBridgeMessage({ context: { direction: "site-to-executor", kind: "request", method: "POST",
      path: url.pathname, audience: connection.executorOrigin, jobId, status: null }, body,
      headers: request.headers, keyId: connection.siteToExecutor.keyId,
      keyBytes: connection.siteToExecutor.copyKeyBytes(), nonces: new D1BridgeNonceStore(remoteDb as unknown as D1Database), now: () => wall });
    const job = parseBridgeJob(JSON.parse(new TextDecoder().decode(body)));
    submitted.push(job);
    const proof = { jobId, requestHash: await hashBridgeJob(job), workflowId: jobId, workflowAcceptedAt: wall };
    await beforeResponse?.(job, proof);
    if (loseResponse) throw new TypeError("synthetic response lost after acceptance");
    const output = encodeBridgeDto(proof, BRIDGE_BODY_LIMITS.status);
    const headers = await signBridgeMessage({ context: { direction: "site-to-executor", kind: "response", method: "POST",
      path: url.pathname, audience: connection.executorOrigin, jobId, status: 202 }, body: output,
      keyId: connection.siteToExecutor.keyId, keyBytes: connection.siteToExecutor.copyKeyBytes(), now: () => wall });
    return new Response(new Uint8Array(output), { status: 202, headers });
  });
  const reads = (guard: () => void) => {
    const guarded = createGuardedD1(db, guard);
    const research = new D1ResearchRepository(guarded, { now: () => wall });
    const executions = new D1SiteExecutionRepository(guarded, research);
    const bridge = new D1SiteBridgeRepository(guarded, research, executions);
    return { research, executions, bridge };
  };
  const reader = new RemoteResearchReader({ createReadRepositories: reads,
    createOperations: (guard) => createSiteBridgeOperations(db, guard, () => wall),
    createExecutor: () => null, legacy: { get: (owner, run) => f.research.getPublicRun(owner, run), recover: async () => null },
    monoNow: () => mono });
  const dependencies: RemoteResearchServiceDependencies = {
    reader, configuration: { ...selection.configuration, cacheDays: 30, configFingerprint: fingerprint(["synthetic-current-config"]) },
    monoNow: () => mono, createRequestId: () => `public-request-${++requestSequence}`, newCallsAllowed: () => true,
    createWriteRepositories: vi.fn((guard: () => void) => {
      const repositories = reads(guard);
      const guarded = createGuardedD1(db, guard);
      return { research: repositories.research, bridge: repositories.bridge,
        admission: new SiteAdmissionCoordinator({ research: repositories.research, executions: repositories.executions,
          entitlements: new D1EntitlementRepository(guarded, { now: () => wall }),
          budget: new D1ResearchBudgetRepository(guarded, { now: () => wall }), now: () => wall }) };
    }),
    createExecutor: vi.fn((guard: () => void) => new ExecutorBridgeClient(new BridgeTransport({ connection,
      nonces: new D1BridgeNonceStore(createGuardedD1(db, guard)), fetch, wallNow: () => wall, monoNow: () => mono }))),
  };
  forbidden.push(vi.spyOn(ExecutorBridgeClient.prototype, "status"), vi.spyOn(ExecutorBridgeClient.prototype, "result"),
    vi.spyOn(ExecutorBridgeClient.prototype, "close"), vi.spyOn(D1SiteBridgeRepository.prototype, "nextScan"));
  const service = new RemoteResearchService(dependencies);
  const execution = (runId: string, owner = "owner-a") => f.executions.read(owner, runId);
  return { f, reader, dependencies, service, fetch, submitted, execution,
    setDb: (value: D1Database) => { db = value; }, setMono: (value: number) => { mono = value; },
    setWall: (value: number) => { wall = value; f.setAppNow(value); f.setSqlNow(value); },
    onSubmit: (hook: typeof beforeResponse) => { beforeResponse = hook; }, loseResponse: () => { loseResponse = true; } };
}

describe("remote public writes", () => {
  it("creates a fresh queued run and exposes only reread durable acceptance from one signed submit", async () => {
    const s = setup();
    expect(s.f.readCounts().researchRuns).toBe(0);
    const record = vi.spyOn(D1SiteBridgeRepository.prototype, "recordAcceptance");
    const read = vi.spyOn(D1SiteBridgeRepository.prototype, "readAcceptance");
    const view = await s.service.start("owner-a", input, gate);
    expect(view).toMatchObject({ state: "queued", backgroundAccepted: true, role: input.role });
    expect(s.submitted).toHaveLength(1);
    const execution = (await s.execution(view.id))!;
    expect(s.submitted[0]).toEqual(execution.job);
    expect(execution.requestHash).toBe(await hashBridgeJob(execution.job));
    expect(record).toHaveBeenCalledTimes(1);
    expect(read.mock.invocationCallOrder.some((order) => order > record.mock.invocationCallOrder[0])).toBe(true);
    expect(s.f.readCounts()).toMatchObject({ researchRuns: 1, siteExecutions: 1, quotaLedger: 1, aiBudgetReservations: 1 });
    expect(JSON.stringify(view)).not.toMatch(/jobId|requestHash|workflowId|reservation|openrouter|kimi|secret/i);
  });

  it("replays a mutation and active alias without readmitting or submitting, retaining fixed job and deadlines", async () => {
    const s = setup();
    const admit = vi.spyOn(SiteAdmissionCoordinator.prototype, "admitNew");
    const first = await s.service.start("owner-a", input, gate);
    const before = await s.execution(first.id);
    s.setWall(NOW + 3000);
    expect((await s.service.start("owner-a", input, gate)).id).toBe(first.id);
    expect((await s.service.start("owner-a", { ...input, mutationId: "mutation-public-alias" }, gate)).id).toBe(first.id);
    expect(await s.execution(first.id)).toEqual(before);
    expect(admit).toHaveBeenCalledTimes(1); expect(s.fetch).toHaveBeenCalledTimes(1);
    expect(s.f.readCounts()).toMatchObject({ researchRuns: 1, siteExecutions: 1, quotaLedger: 1, aiBudgetReservations: 1 });
  });

  it("honors a stored synchronous alias without inventing an execution", async () => {
    const s = setup(); const source = await s.f.research.createOrReplay(s.f.command());
    const admit = vi.spyOn(SiteAdmissionCoordinator.prototype, "admitNew");
    const view = await s.service.start("owner-a", input, gate);
    expect(view).toMatchObject({ id: source.run.id, state: "queued", backgroundAccepted: false });
    expect(admit).not.toHaveBeenCalled(); expect(s.fetch).not.toHaveBeenCalled();
  });

  it("treats recovered creation acknowledgement as replay without admitting the persisted pending job", async () => {
    const s = setup(); const db = s.f.db as unknown as D1Database;
    let lost = false;
    s.setDb(new Proxy(db, {
      get(target, key, receiver) {
        if (key === "batch") return async (statements: D1PreparedStatement[]) => {
          const result = await target.batch(statements);
          if (!lost) { lost = true; throw new Error("synthetic lost creation batch acknowledgement"); }
          return result;
        };
        const value: unknown = Reflect.get(target, key, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }));
    const admit = vi.spyOn(SiteAdmissionCoordinator.prototype, "admitNew");
    const view = await s.service.start("owner-a", input, gate);
    expect(view).toMatchObject({ state: "queued", backgroundAccepted: false });
    expect(await s.execution(view.id)).toMatchObject({ admissionState: "pending" });
    expect(lost).toBe(true); expect(admit).not.toHaveBeenCalled(); expect(s.fetch).not.toHaveBeenCalled();
    expect(s.f.readCounts()).toMatchObject({ researchRuns: 1, siteExecutions: 1, quotaLedger: 0, aiBudgetReservations: 0 });
  });

  it("normalizes the role exactly like the legacy service", async () => {
    const s = setup();
    const view = await s.service.start("owner-a", { ...input, role: "  Ｄａｔａ   Product\tManager  " }, gate);
    const run = (await s.f.research.getRun("owner-a", view.id))!;
    expect(run).toMatchObject({ rawRole: input.role, normalizedRoleKey: "data product manager",
      inputFingerprint: fingerprint(["data product manager", "en-US"]) });
  });

  it.each(["ownerId", "executor", "model", "url"])("rejects client %s controls before creating storage", async (key) => {
    const s = setup();
    await expect(s.service.start("owner-a", { ...input, [key]: "untrusted" }, gate)).rejects.toThrow();
    expect(s.dependencies.createWriteRepositories).not.toHaveBeenCalled(); expect(s.f.readCounts().researchRuns).toBe(0);
  });

  it.each([" owner-a", "owner-a\u0085"])("rejects invalid owner text %j before storage", async (owner) => {
    const s = setup(); await expect(s.service.start(owner, input, gate)).rejects.toThrow();
    expect(s.dependencies.createWriteRepositories).not.toHaveBeenCalled();
  });

  it("retries a terminal run using its original role/input and rejects changed fingerprints", async () => {
    const s = setup();
    const source = await s.f.createRemote();
    const { ownerId, runId, requestId, jobId, requestHash } = source.execution;
    await s.f.coordinator.admitNew({ ownerId, runId, requestId, jobId, requestHash }, { ...gate, newCallsAllowed: false });
    const retry = await s.service.retry("owner-a", source.run.id, "retry-public-1", gate);
    const run = (await s.f.research.getRun("owner-a", retry.id))!;
    expect(run).toMatchObject({ retryOfRunId: source.run.id, rawRole: source.run.rawRole,
      inputFingerprint: source.run.inputFingerprint, configFingerprint: source.run.configFingerprint });
    expect(retry).toMatchObject({ state: "queued", backgroundAccepted: true });
    const admit = vi.spyOn(SiteAdmissionCoordinator.prototype, "admitNew");
    expect((await s.service.retry("owner-a", source.run.id, "retry-public-1", gate)).id).toBe(retry.id);
    expect(admit).not.toHaveBeenCalled(); expect(s.fetch).toHaveBeenCalledTimes(1);
    s.dependencies.configuration.configFingerprint = fingerprint(["changed-config"]);
    await expect(s.service.retry("owner-a", source.run.id, "retry-public-2", gate)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("verifies retry ownership before admission or private access", async () => {
    const s = setup(); const source = await s.f.createRemote();
    const retry = vi.spyOn(D1ResearchRepository.prototype, "createRemoteRetry");
    await expect(s.service.retry("owner-b", source.run.id, "retry-public-hidden", gate)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(retry).not.toHaveBeenCalled(); expect(s.dependencies.createExecutor).not.toHaveBeenCalled();
    expect(s.f.readCounts().researchRuns).toBe(1);
  });

  it("returns fresh cache Ready without quota, budget or submit, including closed gates", async () => {
    const s = setup(); await s.f.createFreshCachePackage(); s.dependencies.newCallsAllowed = () => false;
    const view = await s.service.start("owner-a", input, { cohortEnabled: false, rateAllowed: false });
    expect(view).toMatchObject({ state: "ready", backgroundAccepted: false });
    expect(s.f.readCounts()).toMatchObject({ quotaLedger: 0, aiBudgetReservations: 0 });
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it.each(["new-call", "cohort", "rate"])("returns local closed admission when %s gate is denied", async (kind) => {
    const s = setup(); if (kind === "new-call") s.dependencies.newCallsAllowed = () => false;
    const view = await s.service.start("owner-a", input, { cohortEnabled: kind !== "cohort", rateAllowed: kind !== "rate" });
    expect(view).toMatchObject({ state: "failed", backgroundAccepted: false });
    expect(await s.execution(view.id)).toMatchObject({ admissionState: "closed", closeReason: "denied" });
    expect(s.fetch).not.toHaveBeenCalled(); expect(s.f.readCounts().quotaLedger).toBe(0);
  });

  it("uses actual admission to close an expired fresh queue before submit", async () => {
    const s = setup(); const create = D1ResearchRepository.prototype.createRemoteOrReplay;
    vi.spyOn(D1ResearchRepository.prototype, "createRemoteOrReplay").mockImplementationOnce(async function (this: D1ResearchRepository, command) {
      const created = await create.call(this, command); s.setWall(created.execution!.job.queueExpiresAt); return created;
    });
    const view = await s.service.start("owner-a", input, gate);
    expect(view.state).toBe("failed"); expect(await s.execution(view.id)).toMatchObject({ closeReason: "expired" });
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it("closes and rereads partial admission without filling in a second reservation", async () => {
    const s = setup(); const reserve = D1EntitlementRepository.prototype.admitRemoteResearch;
    vi.spyOn(D1EntitlementRepository.prototype, "admitRemoteResearch").mockImplementationOnce(async function (this: D1EntitlementRepository, command) {
      await reserve.call(this, command); throw new Error("synthetic lost quota acknowledgement");
    });
    const view = await s.service.start("owner-a", input, gate);
    expect(view).toMatchObject({ state: "failed", backgroundAccepted: false });
    expect(await s.execution(view.id)).toMatchObject({ admissionState: "closed", closeReason: "interrupted" });
    const execution = (await s.execution(view.id))!;
    expect(await s.f.quota.readResearchReservation("owner-a", execution.quotaKey)).toMatchObject({ finalStatus: "failed" });
    expect(D1EntitlementRepository.prototype.admitRemoteResearch).toHaveBeenCalledTimes(1);
    expect(s.f.readCounts().aiBudgetReservations).toBe(0);
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it("keeps the original admitted job after lost submit response and never resubmits a replay", async () => {
    const s = setup(); s.loseResponse();
    const view = await s.service.start("owner-a", input, gate);
    expect(view).toMatchObject({ state: "queued", backgroundAccepted: false });
    const stored = await s.execution(view.id);
    expect(stored).toMatchObject({ admissionState: "admitted", beganAt: null });
    expect((await s.service.start("owner-a", input, gate)).id).toBe(view.id);
    expect(await s.execution(view.id)).toEqual(stored); expect(s.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("returns persisted truth after acceptance acknowledgement loss (committed=%s)", async (committed) => {
    const s = setup(); const record = D1SiteBridgeRepository.prototype.recordAcceptance;
    vi.spyOn(D1SiteBridgeRepository.prototype, "recordAcceptance").mockImplementationOnce(async function (this: D1SiteBridgeRepository, proof) {
      if (committed) await record.call(this, proof);
      throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
    });
    const view = await s.service.start("owner-a", input, gate);
    expect(view).toMatchObject({ state: "queued", backgroundAccepted: committed });
    expect(s.f.readCounts()).toMatchObject({ researchRuns: 1, quotaLedger: 1, aiBudgetReservations: 1 });
    expect(s.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not swallow acceptance corruption or conflicts into a queued success", async () => {
    const s = setup(); vi.spyOn(D1SiteBridgeRepository.prototype, "recordAcceptance").mockRejectedValueOnce(new ResearchRepositoryError("CONFLICT"));
    await expect(s.service.start("owner-a", input, gate)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects an authenticated submit proof for the wrong immutable job hash", async () => {
    const s = setup();
    s.onSubmit(async (_job, proof) => { Object.assign(proof, { requestHash: "0".repeat(64) }); });
    await expect(s.service.start("owner-a", input, gate)).rejects.toMatchObject({ kind: "conflict" });
    expect(s.f.db.database.prepare("SELECT * FROM research_site_acceptances").all()).toHaveLength(0);
    expect(s.f.readCounts()).toMatchObject({ researchRuns: 1, quotaLedger: 1, aiBudgetReservations: 1 });
  });

  it("requires the persisted acceptance timestamp to match the recorded proof exactly", async () => {
    const s = setup(); const read = D1SiteBridgeRepository.prototype.readAcceptance;
    let reads = 0;
    vi.spyOn(D1SiteBridgeRepository.prototype, "readAcceptance").mockImplementation(async function (this: D1SiteBridgeRepository, identity) {
      const proof = await read.call(this, identity);
      return ++reads === 2 && proof ? { ...proof, workflowAcceptedAt: proof.workflowAcceptedAt + 1 } : proof;
    });
    await expect(s.service.start("owner-a", input, gate)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(reads).toBe(2);
  });

  it.each(["unavailable", "missing"] as const)("fails closed when mandatory post-record acceptance reread is %s", async (kind) => {
    const s = setup();
    const read = D1SiteBridgeRepository.prototype.readAcceptance;
    let reads = 0;
    vi.spyOn(D1SiteBridgeRepository.prototype, "readAcceptance").mockImplementation(async function (this: D1SiteBridgeRepository, identity) {
      if (++reads === 2) {
        if (kind === "missing") return null;
        throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
      }
      return read.call(this, identity);
    });
    // Actual recordAcceptance does its own first reread; the explicit service reread is second.
    await expect(s.service.start("owner-a", input, gate)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(reads).toBe(2);
    expect(s.f.db.database.prepare("SELECT * FROM research_site_acceptances").all()).toHaveLength(1);
  });

  it("observes legitimate concurrent begin instead of insisting every response stays queued", async () => {
    const s = setup();
    s.onSubmit(async (job) => {
      const row = s.f.db.database.prepare("SELECT run_id FROM research_site_executions WHERE job_id=?").get(job.jobId) as { run_id: string };
      const execution = (await s.execution(row.run_id))!;
      await s.f.begin.begin({ ownerId: execution.ownerId, runId: execution.runId, requestId: execution.requestId,
        jobId: execution.jobId, requestHash: execution.requestHash, newExecutionAllowed: true });
    });
    expect(await s.service.start("owner-a", input, gate)).toMatchObject({ state: "researching", backgroundAccepted: true });
    expect(s.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["creation", "admission", "local-read"])("reports unavailable for unknown %s outcomes without invented queued success", async (phase) => {
    const s = setup();
    if (phase === "creation") vi.spyOn(D1ResearchRepository.prototype, "createRemoteOrReplay").mockRejectedValueOnce(new Error("unknown storage outcome"));
    if (phase === "admission") vi.spyOn(SiteAdmissionCoordinator.prototype, "admitNew").mockRejectedValueOnce(new Error("unknown storage outcome"));
    if (phase === "local-read") vi.spyOn(s.reader, "readLocalView").mockRejectedValueOnce(new Error("unknown identity read"));
    await expect(s.service.start("owner-a", input, gate)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    if (phase !== "local-read") expect(s.fetch).not.toHaveBeenCalled();
  });

  it("delegates get and recover to the accepted owner-aware reader", async () => {
    const s = setup(); const get = vi.spyOn(s.reader, "get").mockResolvedValueOnce(null);
    const recover = vi.spyOn(s.reader, "recover").mockResolvedValueOnce(null);
    expect(await s.service.get("owner-b", "research-run-hidden")).toBeNull();
    expect(await s.service.recover("owner-b", { ...input, kind: "start" })).toBeNull();
    expect(get).toHaveBeenCalledWith("owner-b", "research-run-hidden");
    expect(recover).toHaveBeenCalledWith("owner-b", { ...input, kind: "start" });
    expect(s.dependencies.createWriteRepositories).not.toHaveBeenCalled();
  });
});

describe("one public write deadline", () => {
  it("uses at most 4500ms work plus 500ms read-only refresh across a stalled submit and stalled local read", async () => {
    const s = setup(); let submitEnter!: () => void; let readEnter!: () => void;
    const submitting = new Promise<void>((resolve) => { submitEnter = resolve; });
    const reading = new Promise<void>((resolve) => { readEnter = resolve; });
    let releaseSubmit!: () => void;
    const resumed = new Promise<void>((resolve) => { releaseSubmit = resolve; });
    s.onSubmit(async () => { submitEnter(); await resumed; });
    vi.spyOn(s.reader, "readLocalView").mockImplementation(async () => { readEnter(); return new Promise(() => {}); });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let settled = false;
    const pending = s.service.start("owner-a", input, gate).then(
      (view) => { settled = true; return { view, error: null }; },
      (error: unknown) => { settled = true; return { view: null, error }; });
    await Promise.race([submitting, pending.then((value) => { throw value.error ?? new Error("returned early"); })]);
    await vi.advanceTimersByTimeAsync(4500); await reading; expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(499); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).error).toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    releaseSubmit(); await vi.advanceTimersByTimeAsync(0);
    expect(s.fetch).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    expect(s.f.db.database.prepare("SELECT * FROM research_site_acceptances").all()).toHaveLength(0);
  });

  it.each(["start", "retry"] as const)("starts the 4500ms fence before the first %s database read", async (kind) => {
    const s = setup(); const source = kind === "retry" ? await s.f.createRemote() : null;
    const barrier = createD1OperationBarrier(s.f.db as unknown as D1Database, (_sql, count) => count === 1);
    s.setDb(barrier.db); vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = (kind === "start" ? s.service.start("owner-a", input, gate)
      : s.service.retry("owner-a", source!.run.id, "retry-deadline", gate)).then(
      (view) => ({ view, error: null }), (error: unknown) => ({ view: null, error }));
    await Promise.race([barrier.entered, pending.then((value) => { throw value.error ?? new Error("returned before initial read"); })]);
    await vi.advanceTimersByTimeAsync(4499);
    let settled = false; void pending.then(() => { settled = true; }); await Promise.resolve(); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).error).toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    barrier.expire(); barrier.release(); await vi.advanceTimersByTimeAsync(0);
    expect(barrier.lateStarts()).toBe(0); expect(s.fetch).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it("shares the initial DB, submit and nonce budget and fences late nonce continuation", async () => {
    const s = setup(); let nonceEntered!: () => void; let releaseNonce!: () => void;
    const entered = new Promise<void>((resolve) => { nonceEntered = resolve; });
    const resumed = new Promise<void>((resolve) => { releaseNonce = resolve; });
    const create = D1ResearchRepository.prototype.createRemoteOrReplay;
    vi.spyOn(D1ResearchRepository.prototype, "createRemoteOrReplay").mockImplementationOnce(async function (this: D1ResearchRepository, command) {
      const result = await create.call(this, command); s.setMono(4300); return result;
    });
    const claim = D1BridgeNonceStore.prototype.claim;
    let claims = 0;
    vi.spyOn(D1BridgeNonceStore.prototype, "claim").mockImplementation(async function (this: D1BridgeNonceStore, command) {
      if (++claims === 2) { nonceEntered(); await resumed; }
      return claim.call(this, command);
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = s.service.start("owner-a", input, gate);
    await Promise.race([entered, pending.then(() => { throw new Error("returned before nonce"); })]);
    await vi.advanceTimersByTimeAsync(199);
    let settled = false; void pending.then(() => { settled = true; }); await Promise.resolve(); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const view = await pending;
    expect(view).toMatchObject({ state: "queued", backgroundAccepted: false });
    releaseNonce(); await vi.advanceTimersByTimeAsync(0);
    const nonces = s.f.db.database.prepare("SELECT count(*) AS n FROM research_bridge_nonces").get() as { n: number };
    expect(nonces.n).toBe(0);
    expect(s.f.db.database.prepare("SELECT * FROM research_site_acceptances").all()).toHaveLength(0);
    expect(s.fetch).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });

  it("limits final local refresh to 500ms and never reuses stale queued state after a concurrent begin", async () => {
    const s = setup(); let enter!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const local = s.reader.readLocalView.bind(s.reader);
    vi.spyOn(s.reader, "readLocalView").mockImplementationOnce(async (scope, owner, run) => {
      await local(scope, owner, run);
      const execution = (await s.execution(run))!;
      await s.f.begin.begin({ ownerId: owner, runId: run, requestId: execution.requestId, jobId: execution.jobId,
        requestHash: execution.requestHash, newExecutionAllowed: true });
      enter(); return new Promise(() => {});
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = s.service.start("owner-a", input, gate).then(
      (view) => ({ view, error: null }), (error: unknown) => ({ view: null, error }));
    await Promise.race([entered, pending.then((value) => { throw value.error ?? new Error("returned early"); })]);
    await vi.advanceTimersByTimeAsync(499);
    let settled = false; void pending.then(() => { settled = true; }); await Promise.resolve(); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).error).toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
