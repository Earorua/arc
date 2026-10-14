// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { D1SiteBridgeRepository } from "../../app/server/research/d1-site-bridge-repository";
import { D1BridgeNonceStore } from "../../app/server/research/executor/d1-nonce-store";
import { ExecutorBridgeClient } from "../../app/server/research/executor/executor-client";
import { BridgeTransport } from "../../app/server/research/executor/http-transport";
import { createGuardedD1, createSiteBridgeOperations } from "../../app/server/research/site-bridge-factory";
import { RemoteResearchReader, type RemoteResearchReaderDependencies } from "../../app/server/research/remote-public-reader";
import { PublicOperationScope } from "../../app/server/research/public-operation-scope";
import { createD1OperationBarrier, createResearchBridgeFixture } from "../helpers/research-bridge-fixture";
import type { ExecutorStatus } from "../../app/server/research/executor/bridge-contract";
import { validReceipt } from "../helpers/site-import-fixture";
import { D1EntitlementRepository } from "../../app/server/entitlements/d1-entitlement-repository";
import { ResearchRepositoryError } from "../../app/server/research/repository";
import { SiteExecutionReadSkew } from "../../app/server/research/site-execution-repository";
import { encodeBridgeJob, hashBridgeJob } from "../../app/server/research/executor/job";

type Fixture = Awaited<ReturnType<typeof createResearchBridgeFixture>>;
const fixtures: Fixture[] = [];
const forbidden: ReturnType<typeof vi.fn>[] = [];

function interceptFirst(db: D1Database, intercept: (sql: string, read: () => Promise<unknown>) => Promise<unknown>): D1Database {
  const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => new Proxy(statement, {
    get(target, key, receiver) {
      if (key === "bind") return (...values: unknown[]) => wrap(target.bind(...values), sql);
      if (key === "first") return (...values: unknown[]) => intercept(sql,
        () => (target.first as (...args: unknown[]) => Promise<unknown>).apply(target, values));
      const value: unknown = Reflect.get(target, key, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return new Proxy(db, {
    get(target, key, receiver) {
      if (key === "prepare") return (sql: string) => wrap(target.prepare(sql), sql);
      const value: unknown = Reflect.get(target, key, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

afterEach(() => {
  for (const spy of forbidden.splice(0)) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.useRealTimers();
  for (const f of fixtures.splice(0)) { expect(f.syntheticProviderCalls()).toBe(0); f.db.close(); f.clientDb.close(); }
});

async function setup(options: { connection?: boolean; db?: (f: Fixture) => D1Database;
  fetch?: (f: Fixture) => typeof fetch; change?: (dependencies: RemoteResearchReaderDependencies) => void } = {}) {
  const f = await createResearchBridgeFixture(); fixtures.push(f);
  const businessDb = options.db?.(f) ?? f.db as unknown as D1Database;
  const legacy = { get: vi.fn((owner: string, id: string) => f.research.getPublicRun(owner, id)), recover: vi.fn() };
  const reads = vi.fn((guard: () => void) => {
    const guarded = createGuardedD1(businessDb, guard);
    const research = new D1ResearchRepository(guarded, { now: f.wallNow });
    const executions = new D1SiteExecutionRepository(guarded, research);
    const bridge = new D1SiteBridgeRepository(guarded, research, executions);
    return { research, executions, bridge };
  });
  const operations = vi.fn((guard: () => void) => createSiteBridgeOperations(businessDb, guard, f.wallNow));
  const executors: ExecutorBridgeClient[] = [];
  const dependencies: RemoteResearchReaderDependencies = {
    createReadRepositories: reads, createOperations: operations, legacy, monoNow: f.monoNow,
    createExecutor: vi.fn((guard: () => void) => {
      if (options.connection === false) return null;
      const client = new ExecutorBridgeClient(new BridgeTransport({ connection: f.connection,
        nonces: new D1BridgeNonceStore(createGuardedD1(businessDb, guard)),
        fetch: options.fetch?.(f) ?? f.executorFetch, wallNow: f.wallNow, monoNow: f.monoNow }));
      executors.push(client); return client;
    }),
  };
  options.change?.(dependencies);
  const reader = new RemoteResearchReader(dependencies);
  forbidden.push(vi.spyOn(ExecutorBridgeClient.prototype, "submit"), vi.spyOn(ExecutorBridgeClient.prototype, "acknowledge"));
  // The read path may only reconcile the owned record; no collection or admission authority.
  const originalOperations = dependencies.createOperations;
  dependencies.createOperations = (guard) => {
    const op = originalOperations(guard);
    forbidden.push(vi.spyOn(op.begin, "begin"), vi.spyOn(op.admission, "admitNew"), vi.spyOn(op.bridge, "nextScan"));
    return op;
  };
  const status = (patch: Partial<ExecutorStatus> = {}): ExecutorStatus => ({ jobId: f.identity.jobId,
    requestHash: f.identity.requestHash, accepted: null, dispatchState: "claimed", unsent: null,
    metadata: null, bodyState: null, ...patch });
  f.setExecutorStatus(status());
  return { f, reader, reads, operations, dependencies, legacy, executors, status };
}

describe("owner-first remote public reader", () => {
  it.each(["direct", "lookup", "read-skew", "unchanged"] as const)(
    "repair r5 invalidates queued fallback after %s refresh evidence before a stalled owned read", async (path) => {
      let phase = 0; let block = false; let injected = false; let enter!: () => void;
      const entered = new Promise<void>((resolve) => { enter = resolve; });
      const { f, reader, dependencies } = await setup({ connection: false, db: (fixture) =>
        interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
          if (path === "read-skew" && phase === 2 && !injected && sql.includes("SELECT * FROM research_site_executions")) {
            injected = true; await begin(); block = true;
          }
          return read();
        }) });
      const queued = await f.createRemote("owner-b");
      const admitted = await f.executions.markAdmitted(f.admissionCommand(queued.execution, await f.reserveAdmission(queued.execution)));
      const identity = { ownerId: admitted.ownerId, runId: admitted.runId, requestId: admitted.requestId,
        jobId: admitted.jobId, requestHash: admitted.requestHash };
      const begin = () => f.begin.begin({ ...identity, newExecutionAllowed: true });
      const create = dependencies.createReadRepositories;
      dependencies.createReadRepositories = (guard) => {
        const repositories = create(guard);
        if (++phase === 2) {
          const getRun = repositories.research.getRun.bind(repositories.research);
          vi.spyOn(repositories.research, "getRun").mockImplementation((...args) => {
            if (block) { enter(); return new Promise(() => {}); }
            return getRun(...args);
          });
          if (path === "direct" || path === "unchanged") {
            const read = repositories.executions.read.bind(repositories.executions);
            vi.spyOn(repositories.executions, "read").mockImplementationOnce(async (...args) => {
              if (path === "direct") { injected = true; await begin(); }
              const execution = await read(...args); block = true; return execution;
            });
          } else if (path === "lookup") {
            const lookup = repositories.bridge.lookup.bind(repositories.bridge);
            vi.spyOn(repositories.bridge, "lookup").mockImplementationOnce(async (input) => {
              injected = true; await begin();
              const found = await lookup(input); block = true; return found;
            });
          }
        }
        return repositories;
      };
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      let settled = false;
      const pending = reader.get(identity.ownerId, identity.runId).then(
        (view) => { settled = true; return { view, error: null }; },
        (error: unknown) => { settled = true; return { view: null, error }; });
      await entered;
      await vi.advanceTimersByTimeAsync(499); expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const result = await pending;
      if (path === "unchanged") expect(result.view).toMatchObject({ id: identity.runId, state: "queued" });
      else expect(result.error).toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
      expect(injected).toBe(path !== "unchanged"); expect(phase).toBe(2);
      expect((await f.research.getRun(identity.ownerId, identity.runId))?.state).toBe(path === "unchanged" ? "queued" : "researching");
      expect(dependencies.createExecutor).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    });

  it.each(["already-begun", "execution-read-skew", "run-advanced"] as const)(
    "repair r5 invalidates queued fallback on the native %s admission marker before stalled rereads", async (kind) => {
      let admissionArmed = false; let injected = false; let block = false; let phase = 0;
      let enterWork!: () => void; let enterRefresh!: () => void;
      const workEntered = new Promise<void>((resolve) => { enterWork = resolve; });
      const refreshEntered = new Promise<void>((resolve) => { enterRefresh = resolve; });
      const { f, reader, dependencies } = await setup({ connection: false, db: (fixture) =>
        interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
          if (admissionArmed && !injected && kind !== "already-begun" && sql.includes("SELECT * FROM research_site_executions")) {
            const row = kind === "run-advanced" ? await read() : null;
            injected = true; await begin(); block = true;
            return kind === "run-advanced" ? row : read();
          }
          return read();
        }) });
      const queued = await f.createRemote("owner-b");
      const admitted = await f.executions.markAdmitted(f.admissionCommand(queued.execution, await f.reserveAdmission(queued.execution)));
      const identity = { ownerId: admitted.ownerId, runId: admitted.runId, requestId: admitted.requestId,
        jobId: admitted.jobId, requestHash: admitted.requestHash };
      const begin = () => f.begin.begin({ ...identity, newExecutionAllowed: true });
      const createReads = dependencies.createReadRepositories;
      dependencies.createReadRepositories = (guard) => {
        const repositories = createReads(guard); const currentPhase = ++phase;
        const getRun = repositories.research.getRun.bind(repositories.research);
        vi.spyOn(repositories.research, "getRun").mockImplementation((...args) => {
          if (block) { (currentPhase === 1 ? enterWork : enterRefresh)(); return new Promise(() => {}); }
          return getRun(...args);
        });
        return repositories;
      };
      const createOperations = dependencies.createOperations;
      dependencies.createOperations = (guard) => {
        const operations = createOperations(guard);
        const reconcile = operations.admission.reconcileBeforeBegin.bind(operations.admission);
        vi.spyOn(operations.admission, "reconcileBeforeBegin").mockImplementationOnce(async (input) => {
          admissionArmed = true;
          if (kind === "already-begun") { injected = true; await begin(); block = true; }
          return reconcile(input);
        });
        return operations;
      };
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      let settled = false;
      const pending = reader.get(identity.ownerId, identity.runId).then(
        (view) => { settled = true; return { view, error: null }; },
        (error: unknown) => { settled = true; return { view: null, error }; });
      await workEntered;
      await vi.advanceTimersByTimeAsync(4499); expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1); await refreshEntered;
      await vi.advanceTimersByTimeAsync(499); expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect((await pending).error).toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
      expect(injected).toBe(true); expect(phase).toBe(2); expect(vi.getTimerCount()).toBe(0);
      expect((await f.research.getRun(identity.ownerId, identity.runId))?.state).toBe("researching");
      expect(dependencies.createExecutor).not.toHaveBeenCalled();
    });

  it.each((["current-run", "after-view", "downstream-skew", "admission-skew"] as const)
    .flatMap((path) => [false, true].map((drift) => ({ path, drift }))))(
    "repair r4 preserves frozen policy across $path continuation (drift=$drift)", async ({ path, drift }) => {
      let injected = false; let executionReads = 0; let admissionArmed = false;
      let transition!: () => Promise<unknown>;
      const { f, reader, dependencies, operations } = await setup({ connection: false, db: (fixture) =>
        interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
          const executionRead = sql.includes("SELECT * FROM research_site_executions");
          if (executionRead) executionReads += 1;
          if (!injected && ((path === "downstream-skew" && executionRead && executionReads === 2)
            || (path === "admission-skew" && admissionArmed && executionRead))) {
            injected = true; await transition();
          }
          const row = await read() as Record<string, unknown> | null;
          if (!injected && ((path === "current-run" && executionRead && executionReads === 1)
            || (path === "after-view" && sql.includes("FROM research_site_acceptances")))) {
            injected = true; await transition(); return row;
          }
          return row && executionRead && injected && drift
            ? { ...row, user_daily_quota: Number(row.user_daily_quota) + 1 } : row;
        }) });
      let identity = f.identity;
      if (path === "after-view") transition = () => f.imports.complete(f.identity, validReceipt(f.execution));
      else {
        const queued = await f.createRemote("owner-b");
        const admitted = await f.executions.markAdmitted(f.admissionCommand(queued.execution, await f.reserveAdmission(queued.execution)));
        identity = { ownerId: admitted.ownerId, runId: admitted.runId, requestId: admitted.requestId,
          jobId: admitted.jobId, requestHash: admitted.requestHash };
        transition = () => f.begin.begin({ ...identity, newExecutionAllowed: true });
      }
      const create = dependencies.createOperations;
      dependencies.createOperations = (guard) => { admissionArmed = true; return create(guard); };
      if (drift) {
        await expect(reader.get(identity.ownerId, identity.runId)).rejects.toBeInstanceOf(ResearchRepositoryError);
        expect(dependencies.createExecutor).not.toHaveBeenCalled();
        expect(operations).toHaveBeenCalledTimes(path === "admission-skew" ? 1 : 0);
      } else {
        await expect(reader.get(identity.ownerId, identity.runId)).resolves.toMatchObject({
          id: identity.runId, state: path === "after-view" ? "ready" : "researching" });
      }
      expect(injected).toBe(true); expect(f.executorFetches()).toBe(0);
    });

  it.each(["reservation", "grant", "context", "lifecycle-version"] as const)(
    "repair r4 rejects assigned %s drift across the direct terminal reread", async (field) => {
      let executionReads = 0;
      const { f, reader } = await setup({ connection: false, db: (fixture) =>
        interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
          const row = await read() as Record<string, unknown> | null;
          if (!row || !sql.includes("SELECT * FROM research_site_executions")) return row;
          if (++executionReads === 1) {
            await fixture.imports.complete(fixture.identity, validReceipt(fixture.execution)); return row;
          }
          if (field === "reservation") return { ...row, quota_reservation_id: "different-valid-reservation" };
          if (field === "grant") return { ...row, began_at: Number(row.began_at) + 1,
            execution_expires_at: Number(row.execution_expires_at) + 1, updated_at: Number(row.updated_at) + 1 };
          if (field === "lifecycle-version") return { ...row, version: Number(row.version) + 1 };
          const context = JSON.parse(String(row.validation_context_json)) as Record<string, unknown>;
          const expiresAt = new Date(Number(row.created_at) + (Number(row.cache_days) + 1) * 86_400_000).toISOString().slice(0, 10);
          return { ...row, cache_days: Number(row.cache_days) + 1,
            validation_context_json: JSON.stringify({ ...context, expiresAt }) };
        }) });
      const scope = new PublicOperationScope(f.monoNow);
      try {
        await expect(reader.readLocalView(scope, f.identity.ownerId, f.identity.runId)).rejects.toBeInstanceOf(ResearchRepositoryError);
      } finally { scope.finish(); }
      expect(executionReads).toBe(2);
    });

  it("repair r4 permits genuine admission then begin after the initial pending execution read", async () => {
    let injected = false;
    const { f, reader } = await setup({ connection: false, db: (fixture) =>
      interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
        const row = await read();
        if (!injected && sql.includes("SELECT * FROM research_site_executions")) {
          injected = true; await transition();
        }
        return row;
      }) });
    const queued = await f.createRemote("owner-b");
    const transition = async () => {
      const admitted = await f.executions.markAdmitted(f.admissionCommand(queued.execution, await f.reserveAdmission(queued.execution)));
      return f.begin.begin({ ownerId: admitted.ownerId, runId: admitted.runId, requestId: admitted.requestId,
        jobId: admitted.jobId, requestHash: admitted.requestHash, newExecutionAllowed: true });
    };
    await expect(reader.get(queued.run.ownerId, queued.run.id)).resolves.toMatchObject({ state: "researching" });
    expect(injected).toBe(true); expect(f.executorFetches()).toBe(0);
  });

  it("repair r4 retains the observed frozen policy into the separate read-only refresh", async () => {
    let refresh = false;
    const { f, reader, dependencies } = await setup({ connection: false, db: (fixture) =>
      interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
        const row = await read() as Record<string, unknown> | null;
        return row && refresh && sql.includes("SELECT * FROM research_site_executions")
          ? { ...row, user_daily_quota: Number(row.user_daily_quota) + 1 } : row;
      }) });
    const create = dependencies.createReadRepositories; let compositions = 0;
    dependencies.createReadRepositories = (guard) => { refresh = ++compositions === 2; return create(guard); };
    await expect(reader.get(f.identity.ownerId, f.identity.runId)).rejects.toBeInstanceOf(ResearchRepositoryError);
    expect(refresh).toBe(true); expect(compositions).toBe(2); expect(f.executorFetches()).toBe(0);
  });

  it("repair r4 rejects a newly assigned reservation after an observed closure", async () => {
    let refresh = false;
    const { f, reader, dependencies } = await setup({ connection: false, db: (fixture) =>
      interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
        const row = await read() as Record<string, unknown> | null;
        return row && refresh && sql.includes("SELECT * FROM research_site_executions")
          ? { ...row, quota_reservation_id: "later-quota", budget_reservation_id: "later-budget",
            admitted_at: row.created_at, version: Number(row.version) + 1 } : row;
      }) });
    const queued = await f.createRemote("owner-b");
    const identity = { ownerId: queued.execution.ownerId, runId: queued.execution.runId,
      requestId: queued.execution.requestId, jobId: queued.execution.jobId, requestHash: queued.execution.requestHash };
    await f.executions.closeBeforeBegin({ ...identity, reason: "interrupted" });
    const create = dependencies.createReadRepositories; let compositions = 0;
    dependencies.createReadRepositories = (guard) => { refresh = ++compositions === 2; return create(guard); };
    await expect(reader.get(identity.ownerId, identity.runId)).rejects.toBeInstanceOf(ResearchRepositoryError);
    expect(refresh).toBe(true); expect(compositions).toBe(2);
  });

  it.each([0, 1])("repair r3 rereads exact begin at the native bridge lookup with SQL clock advance %i", async (clockAdvance) => {
    let injected = false;
    const { f, reader, dependencies, reads } = await setup({ connection: false, db: (fixture) =>
      interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
        if (!injected && sql.includes("SELECT user_id,run_id,request_id,job_id,request_hash")) {
          injected = true; fixture.advanceMono(4400);
          await begin();
        }
        return read();
      }) });
    const queued = await f.createRemote("owner-b");
    const execution = await f.executions.markAdmitted(f.admissionCommand(queued.execution, await f.reserveAdmission(queued.execution)));
    const identity = { ownerId: execution.ownerId, runId: execution.runId, requestId: execution.requestId,
      jobId: execution.jobId, requestHash: execution.requestHash };
    f.setSqlNow(execution.updatedAt + clockAdvance);
    const begin = () => f.begin.begin({ ...identity, newExecutionAllowed: true });
    const lookupCalls: ReturnType<typeof vi.spyOn>[] = [];
    const create = dependencies.createReadRepositories;
    dependencies.createReadRepositories = (guard) => {
      const repositories = create(guard);
      lookupCalls.push(vi.spyOn(repositories.bridge, "lookup"));
      return repositories;
    };
    await expect(reader.get(identity.ownerId, identity.runId)).resolves.toMatchObject({ id: identity.runId, state: "researching" });
    expect(injected).toBe(true); expect(reads).toHaveBeenCalledTimes(2);
    expect(lookupCalls[0]).toHaveBeenCalledTimes(2); // Initial comparison plus the single work-scope reread.
    expect(lookupCalls[1]).toHaveBeenCalledTimes(1); // Separate read-only refresh.
    const after = (await f.executions.read(identity.ownerId, identity.runId))!;
    expect(after).toMatchObject({ ...identity, job: execution.job, version: execution.version + 1,
      beganAt: execution.updatedAt + clockAdvance, updatedAt: execution.updatedAt + clockAdvance });
    expect(f.executorFetches()).toBe(0);
  });

  it.each(["pending", "admitted"] as const)("repair r3 rereads an exact %s closure at the native bridge lookup", async (admission) => {
    let injected = false;
    const { f, reader, dependencies } = await setup({ connection: false, db: (fixture) =>
      interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
        if (!injected && sql.includes("SELECT user_id,run_id,request_id,job_id,request_hash")) {
          injected = true; await close();
        }
        return read();
      }) });
    const queued = await f.createRemote("owner-b");
    const execution = admission === "admitted"
      ? await f.executions.markAdmitted(f.admissionCommand(queued.execution, await f.reserveAdmission(queued.execution)))
      : queued.execution;
    const identity = { ownerId: execution.ownerId, runId: execution.runId, requestId: execution.requestId,
      jobId: execution.jobId, requestHash: execution.requestHash };
    f.setSqlNow(execution.updatedAt + (admission === "pending" ? 1 : 0));
    const close = () => f.executions.closeBeforeBegin({ ...identity, reason: "interrupted" });
    const lookupCalls: ReturnType<typeof vi.spyOn>[] = [];
    const create = dependencies.createReadRepositories;
    dependencies.createReadRepositories = (guard) => {
      const repositories = create(guard); lookupCalls.push(vi.spyOn(repositories.bridge, "lookup")); return repositories;
    };
    await expect(reader.get(identity.ownerId, identity.runId)).resolves.toMatchObject({ id: identity.runId, state: "failed" });
    expect(injected).toBe(true); expect(lookupCalls[0]).toHaveBeenCalledTimes(2);
    expect(lookupCalls[1]).toHaveBeenCalledTimes(1);
    expect(await f.executions.read(identity.ownerId, identity.runId)).toMatchObject({ ...identity, job: execution.job,
      admissionState: "closed", version: execution.version + 1, beganAt: null, executionExpiresAt: null });
    expect(dependencies.createExecutor).not.toHaveBeenCalled();
  });

  it.each(["policy", "version", "updated-at", "grant", "run-version", "run-lease", "run-updated-at"] as const)(
    "repair r3 rejects %s corruption accompanying begin at the native bridge lookup", async (field) => {
      let injected = false; let lookups = 0;
      const { f, reader, dependencies, operations } = await setup({ connection: false, db: (fixture) =>
        interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
          if (sql.includes("SELECT user_id,run_id,request_id,job_id,request_hash")) {
            lookups += 1;
            if (!injected) { await begin(); injected = true; }
          }
          const row = await read() as Record<string, unknown>;
          if (injected && sql.includes("SELECT * FROM research_site_executions")) {
            if (field === "policy") return { ...row, cache_days: Number(row.cache_days) + 1 };
            if (field === "version") return { ...row, version: Number(row.version) + 1 };
            if (field === "updated-at") return { ...row, updated_at: Number(row.updated_at) + 1 };
            if (field === "grant") return { ...row, execution_expires_at: Number(row.execution_expires_at) + 1 };
          }
          if (injected && sql.includes("SELECT * FROM research_runs")) {
            if (field === "run-version") return { ...row, state_version: Number(row.state_version) - 1 };
            if (field === "run-lease") return { ...row, active_expires_at: Number(row.active_expires_at) + 1 };
            if (field === "run-updated-at") return { ...row, updated_at: Number(row.updated_at) + 1 };
          }
          return row;
        }) });
      const queued = await f.createRemote("owner-b");
      const execution = await f.executions.markAdmitted(f.admissionCommand(queued.execution, await f.reserveAdmission(queued.execution)));
      const begin = () => f.begin.begin({ ownerId: execution.ownerId, runId: execution.runId,
        requestId: execution.requestId, jobId: execution.jobId, requestHash: execution.requestHash, newExecutionAllowed: true });
      await expect(reader.get(execution.ownerId, execution.runId)).rejects.toBeInstanceOf(ResearchRepositoryError);
      expect(injected).toBe(true); expect(lookups).toBe(1);
      expect(operations).not.toHaveBeenCalled();
      expect(dependencies.createExecutor).not.toHaveBeenCalled();
    });

  it("repair r3 keeps only the remaining 100ms for the successful lookup transition reread", async () => {
    let lookups = 0; let enter!: () => void; let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const resumed = new Promise<void>((resolve) => { release = resolve; });
    const { f, reader, reads, operations } = await setup({ connection: false, db: (fixture) =>
      interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
        if (sql.includes("SELECT user_id,run_id,request_id,job_id,request_hash")) {
          lookups += 1;
          if (lookups === 1) { fixture.advanceMono(4400); await begin(); }
          if (lookups === 2) { enter(); await resumed; }
        }
        return read();
      }) });
    const queued = await f.createRemote("owner-b");
    const execution = await f.executions.markAdmitted(f.admissionCommand(queued.execution, await f.reserveAdmission(queued.execution)));
    const begin = () => f.begin.begin({ ownerId: execution.ownerId, runId: execution.runId,
      requestId: execution.requestId, jobId: execution.jobId, requestHash: execution.requestHash, newExecutionAllowed: true });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let settled = false;
    const pending = expect(reader.get(execution.ownerId, execution.runId)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    void pending.then(() => { settled = true; });
    await entered;
    await vi.advanceTimersByTimeAsync(99); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await pending;
    expect(reads).toHaveBeenCalledTimes(1); expect(lookups).toBe(2); expect(operations).not.toHaveBeenCalled();
    release(); await new Promise<void>((resolve) => setImmediate(resolve));
    expect(lookups).toBe(2); expect(vi.getTimerCount()).toBe(0);
  });

  it("repair r3 rejects frozen policy drift on the single transition reread", async () => {
    let injected = false; let executionReads = 0;
    const { f, reader } = await setup({ connection: false, db: (fixture) =>
      interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
        if (!injected && sql.includes("SELECT user_id,run_id,request_id,job_id,request_hash")) {
          injected = true; await begin();
        }
        const row = await read() as Record<string, unknown>;
        if (sql.includes("SELECT * FROM research_site_executions") && ++executionReads >= 3) {
          return { ...row, user_daily_quota: Number(row.user_daily_quota) + 1 };
        }
        return row;
      }) });
    const queued = await f.createRemote("owner-b");
    const execution = await f.executions.markAdmitted(f.admissionCommand(queued.execution, await f.reserveAdmission(queued.execution)));
    const begin = () => f.begin.begin({ ownerId: execution.ownerId, runId: execution.runId,
      requestId: execution.requestId, jobId: execution.jobId, requestHash: execution.requestHash, newExecutionAllowed: true });
    const scope = new PublicOperationScope(f.monoNow);
    try {
      await expect(reader.readLocalView(scope, execution.ownerId, execution.runId)).rejects.toMatchObject({ code: "CONFLICT" });
    } finally { scope.finish(); }
    expect(injected).toBe(true); expect(executionReads).toBe(3);
  });

  it("repair r3 rereads a native closure whose run statement observes a later SQL clock", async () => {
    let injected = false;
    const { f, reader } = await setup({ connection: false, db: (fixture) =>
      interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
        if (!injected && sql.includes("SELECT user_id,run_id,request_id,job_id,request_hash")) {
          injected = true;
          const closed = await close();
          expect(closed.run.updatedAt).toBe(closed.execution.updatedAt + 1);
        }
        return read();
      }) });
    const queued = await f.createRemote("owner-b");
    const execution = await f.executions.markAdmitted(f.admissionCommand(queued.execution, await f.reserveAdmission(queued.execution)));
    const identity = { ownerId: execution.ownerId, runId: execution.runId, requestId: execution.requestId,
      jobId: execution.jobId, requestHash: execution.requestHash };
    f.setSqlNow(execution.updatedAt);
    f.db.database.function("reader_close_clock_tick", () => { f.setSqlNow(execution.updatedAt + 1); return 1; });
    f.db.database.exec(`CREATE TRIGGER reader_close_clock AFTER UPDATE OF admission_state ON research_site_executions
      WHEN NEW.admission_state='closed' BEGIN SELECT reader_close_clock_tick(); END`);
    const close = () => f.executions.closeBeforeBegin({ ...identity, reason: "interrupted" });
    await expect(reader.get(identity.ownerId, identity.runId)).resolves.toMatchObject({ id: identity.runId, state: "failed" });
    expect(injected).toBe(true);
  });

  it("repair r2 rejects native acceptance SELECT failure even when a terminal import commits concurrently", async () => {
    let injected = false; let acceptanceAttempts = 0;
    const { f, reader, dependencies } = await setup({ connection: false, db: (fixture) =>
      interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
        if (sql.includes("FROM research_site_acceptances")) {
          acceptanceAttempts += 1;
          if (!injected) {
            injected = true;
            await fixture.imports.complete(fixture.identity, validReceipt(fixture.execution));
            throw new Error("injected native acceptance SELECT failure");
          }
        }
        return read();
      }) });
    await expect(reader.get("owner-a", f.identity.runId)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(injected).toBe(true); expect(acceptanceAttempts).toBe(1);
    expect((await f.research.getRun("owner-a", f.identity.runId))?.state).toBe("ready");
    expect(dependencies.createExecutor).not.toHaveBeenCalled();
  });

  it.each(["unavailable", "conflict"] as const)("repair r2 rejects independent admission %s despite concurrent begin", async (failure) => {
    const { f, reader } = await setup({ connection: false });
    const queued = await f.createRemote("owner-b");
    const execution = await f.executions.markAdmitted(f.admissionCommand(queued.execution, await f.reserveAdmission(queued.execution)));
    const identity = { ownerId: execution.ownerId, runId: execution.runId, requestId: execution.requestId,
      jobId: execution.jobId, requestHash: execution.requestHash };
    const error = new ResearchRepositoryError(failure === "conflict" ? "CONFLICT" : "RESEARCH_UNAVAILABLE");
    const reservationRead = vi.spyOn(D1EntitlementRepository.prototype, "readResearchReservation").mockImplementationOnce(async () => {
      await f.begin.begin({ ...identity, newExecutionAllowed: true });
      throw error;
    });
    await expect(reader.get(identity.ownerId, identity.runId)).rejects.toBe(error);
    expect(reservationRead).toHaveBeenCalledTimes(1);
    expect((await f.research.getRun(identity.ownerId, identity.runId))?.state).toBe("researching");
  });

  it("repair r2 rejects generic snapshot CONFLICT even when the same run advances", async () => {
    const { f, reader, dependencies } = await setup({ connection: false });
    const create = dependencies.createReadRepositories;
    let injected = false;
    const error = new ResearchRepositoryError("CONFLICT");
    dependencies.createReadRepositories = (guard) => {
      const repositories = create(guard);
      const read = repositories.bridge.readAcceptance.bind(repositories.bridge);
      vi.spyOn(repositories.bridge, "readAcceptance").mockImplementation(async (identity) => {
        if (!injected) {
          injected = true; await f.imports.complete(f.identity, validReceipt(f.execution)); throw error;
        }
        return read(identity);
      });
      return repositories;
    };
    await expect(reader.get("owner-a", f.identity.runId)).rejects.toBe(error);
    expect(injected).toBe(true);
  });

  it("repair r2 rejects an immutable execution mismatch accompanying a legitimate version advance", async () => {
    let injected = false;
    const { f, reader } = await setup({ connection: false, db: (fixture) =>
      interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
        if (!injected && sql.includes("SELECT * FROM research_site_executions")) {
          injected = true;
          await fixture.imports.complete(fixture.identity, validReceipt(fixture.execution));
          const row = await read() as Record<string, unknown>;
          return { ...row, request_hash: "0".repeat(64) };
        }
        return read();
      }) });
    await expect(reader.get("owner-a", f.identity.runId)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(injected).toBe(true);
    expect((await f.research.getRun("owner-a", f.identity.runId))?.state).toBe("ready");
  });

  it.each([1, 2])("repair r2 rejects a corrupt old queue lease at read %i even when begin advances the run", async (corruptRead) => {
    let reads = 0; let injected = false;
    const { f, reader } = await setup({ connection: false, db: (fixture) =>
      interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
        if (sql.includes("SELECT * FROM research_runs") && ++reads === corruptRead) {
          const row = await read() as Record<string, unknown>;
          return { ...row, active_expires_at: Number(row.active_expires_at) + 1 };
        }
        if (!injected && sql.includes("SELECT * FROM research_site_executions")) {
          injected = true; await begin();
        }
        return read();
      }) });
    const queued = await f.createRemote("owner-b");
    const execution = await f.executions.markAdmitted(f.admissionCommand(queued.execution, await f.reserveAdmission(queued.execution)));
    const begin = () => f.begin.begin({ ownerId: execution.ownerId, runId: execution.runId,
      requestId: execution.requestId, jobId: execution.jobId, requestHash: execution.requestHash, newExecutionAllowed: true });
    await expect(reader.get(execution.ownerId, execution.runId)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(injected).toBe(true);
    expect((await f.research.getRun(execution.ownerId, execution.runId))?.state).toBe("researching");
  });

  it("repair r2 rereads begin between admission execution read and final owned run read", async () => {
    let armed = false; let injected = false;
    const { f, reader, dependencies } = await setup({ connection: false, db: (fixture) =>
      interceptFirst(fixture.db as unknown as D1Database, async (sql, read) => {
        const row = await read();
        if (armed && !injected && sql.includes("SELECT * FROM research_site_executions")) {
          injected = true; await begin();
        }
        return row;
      }) });
    const queued = await f.createRemote("owner-b");
    const execution = await f.executions.markAdmitted(f.admissionCommand(queued.execution, await f.reserveAdmission(queued.execution)));
    const begin = () => f.begin.begin({ ownerId: execution.ownerId, runId: execution.runId,
      requestId: execution.requestId, jobId: execution.jobId, requestHash: execution.requestHash, newExecutionAllowed: true });
    const create = dependencies.createOperations;
    dependencies.createOperations = (guard) => { armed = true; return create(guard); };
    await expect(reader.get(execution.ownerId, execution.runId)).resolves.toMatchObject({ state: "researching" });
    expect(injected).toBe(true); expect(f.executorFetches()).toBe(0);
  });

  it("repair r2 rejects a downstream skew that replaces an already observed job identity", async () => {
    const { f, reader, dependencies } = await setup({ connection: false });
    const queued = await f.createRemote("owner-b");
    const execution = await f.executions.markAdmitted(f.admissionCommand(queued.execution, await f.reserveAdmission(queued.execution)));
    const oldRun = (await f.research.getRun(execution.ownerId, execution.runId))!;
    const create = dependencies.createReadRepositories;
    let injected = false;
    dependencies.createReadRepositories = (guard) => {
      const repositories = create(guard);
      const read = repositories.bridge.readAcceptance.bind(repositories.bridge);
      vi.spyOn(repositories.bridge, "readAcceptance").mockImplementation(async (identity) => {
        if (!injected) {
          injected = true;
          await f.begin.begin({ ...identity, newExecutionAllowed: true });
          const job = { ...execution.job, jobId: "00000000-0000-4000-8000-888888888888" };
          const hash = await hashBridgeJob(job);
          f.db.database.exec("DROP TRIGGER research_site_executions_identity_immutable; DROP TRIGGER research_site_executions_lifecycle_guard");
          f.db.database.prepare("UPDATE research_site_executions SET job_id=?,request_hash=?,job_json=? WHERE run_id=?")
            .run(job.jobId, hash, new TextDecoder().decode(encodeBridgeJob(job)), execution.runId);
          const replacement = (await f.executions.read(execution.ownerId, execution.runId))!;
          throw new SiteExecutionReadSkew(oldRun, replacement);
        }
        return read(identity);
      });
      return repositories;
    };
    await expect(reader.get(execution.ownerId, execution.runId)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(injected).toBe(true);
  });

  it("returns unavailable at 4500ms when the initial owner read never resolves", async () => {
    let barrier!: ReturnType<typeof createD1OperationBarrier>;
    const { f, reader, operations } = await setup({ db: (fixture) => {
      barrier = createD1OperationBarrier(fixture.db as unknown as D1Database, (_sql, n) => n === 1);
      return barrier.db;
    } });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = expect(reader.get("owner-a", f.identity.runId)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    await barrier.entered;
    await vi.advanceTimersByTimeAsync(4500); await pending;
    barrier.expire(); barrier.release();
    await Promise.resolve(); await Promise.resolve();
    expect(barrier.lateStarts()).toBe(0); expect(operations).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a never-resolving status body and refreshes through separate read-only capabilities", async () => {
    let entered!: () => void;
    const entry = new Promise<void>((resolve) => { entered = resolve; });
    const { f, reader, reads, operations, dependencies } = await setup({ fetch: () => async () => {
      entered(); return new Response(new ReadableStream({ start() {} }));
    } });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = reader.get("owner-a", f.identity.runId);
    await entry;
    await vi.advanceTimersByTimeAsync(4500);
    await expect(pending).resolves.toMatchObject({ state: "researching", backgroundAccepted: false });
    expect(reads).toHaveBeenCalledTimes(2); expect(operations).toHaveBeenCalledTimes(1);
    expect(dependencies.createExecutor).toHaveBeenCalledTimes(1);
    for (const [guard] of reads.mock.calls) expect(() => guard()).toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives result only the time remaining after status and fences a late result response", async () => {
    const { f, reader, status } = await setup();
    f.setExecutorStatus(status({ metadata: await f.metadata(), bodyState: "available" }));
    let enter!: () => void; let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const resumed = new Promise<void>((resolve) => { release = resolve; });
    f.setExecutorEntry(async (request) => {
      if (request.url.endsWith("/status")) f.advanceMono(4400);
      if (request.url.endsWith("/result")) { enter(); await resumed; }
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = reader.get("owner-a", f.identity.runId);
    await entered;
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toMatchObject({ state: "researching" });
    release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(await f.newImports().read(f.identity)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("caps the final refresh at 500ms, never extends the expired work phase", async () => {
    let refreshBarrier!: ReturnType<typeof createD1OperationBarrier>;
    let refreshEntered!: Promise<void>;
    let enterFetch!: () => void;
    const fetchEntered = new Promise<void>((resolve) => { enterFetch = resolve; });
    const { f, reader, dependencies } = await setup({ fetch: () => async () => {
      enterFetch(); return new Promise<Response>(() => {});
    } });
    const read = dependencies.createReadRepositories;
    let compositions = 0;
    dependencies.createReadRepositories = (guard) => {
      if (++compositions === 1) return read(guard);
      refreshBarrier = createD1OperationBarrier(f.db as unknown as D1Database, (_sql, n) => n === 1);
      refreshEntered = refreshBarrier.entered;
      const db = createGuardedD1(refreshBarrier.db, guard);
      const research = new D1ResearchRepository(db, { now: f.wallNow });
      const executions = new D1SiteExecutionRepository(db, research);
      return { research, executions, bridge: new D1SiteBridgeRepository(db, research, executions) };
    };
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = reader.get("owner-a", f.identity.runId);
    await fetchEntered;
    await vi.advanceTimersByTimeAsync(4500);
    await refreshEntered;
    let settled = false; void pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(499); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ state: "researching" });
    refreshBarrier.expire(); refreshBarrier.release();
    await Promise.resolve(); await Promise.resolve();
    expect(refreshBarrier.lateStarts()).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });

  it("fences a pending response nonce claim and schedules no later database work", async () => {
    let barrier!: ReturnType<typeof createD1OperationBarrier>;
    const { f, reader } = await setup({ db: (fixture) => {
      barrier = createD1OperationBarrier(fixture.db as unknown as D1Database,
        (sql) => sql.includes("INSERT INTO research_bridge_nonces"));
      return barrier.db;
    } });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = reader.get("owner-a", f.identity.runId);
    await barrier.entered;
    await vi.advanceTimersByTimeAsync(4500);
    await expect(pending).resolves.toMatchObject({ state: "researching" });
    barrier.expire(); barrier.release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(barrier.lateStarts()).toBe(0);
    expect(await f.newImports().read(f.identity)).toBeNull();
  });

  it("returns null for another owner before any execution or remote lookup", async () => {
    const { f, reader, operations, dependencies } = await setup();
    const read = vi.spyOn(D1SiteExecutionRepository.prototype, "read");
    const lookup = vi.spyOn(D1SiteBridgeRepository.prototype, "lookup");
    await expect(reader.get("owner-b", f.identity.runId)).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled(); expect(lookup).not.toHaveBeenCalled();
    expect(operations).not.toHaveBeenCalled(); expect(dependencies.createExecutor).not.toHaveBeenCalled();
  });

  it("fences a late close proof and leaves the SQL conservative hold for the next read", async () => {
    const { f, reader, status } = await setup();
    f.setSqlNow(f.execution.executionExpiresAt!);
    await f.expiry.reconcile(f.identity, null);
    f.setExecutorStatus(status({ dispatchState: "unclaimed" }));
    f.setCloseProof({ jobId: f.identity.jobId, requestHash: f.identity.requestHash, state: "closed",
      closedAt: f.execution.executionExpiresAt!, grant: null });
    let enter!: () => void; let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const resumed = new Promise<void>((resolve) => { release = resolve; });
    f.setExecutorEntry(async (request) => { if (request.url.endsWith("/close")) { enter(); await resumed; } });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = reader.get("owner-a", f.identity.runId);
    await entered;
    await vi.advanceTimersByTimeAsync(4500);
    await expect(pending).resolves.toMatchObject({ state: "failed" });
    const before = f.businessSnapshot();
    release(); await new Promise<void>((resolve) => setImmediate(resolve));
    expect(f.businessSnapshot()).toEqual(before);
    expect((await f.recovery.read(f.identity))?.reason).toBe("expired-unknown");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reconciles a committed import journal on the next read after a delayed native acknowledgement", async () => {
    let barrier!: ReturnType<typeof createD1OperationBarrier>;
    let delayed = false;
    const { f, reader, status } = await setup({ db: (fixture) => {
      barrier = createD1OperationBarrier(fixture.db as unknown as D1Database, () => false,
        (sql) => { if (!delayed && sql.includes("INSERT INTO research_site_imports (")) { delayed = true; return true; } return false; });
      return barrier.db;
    } });
    f.setExecutorStatus(status({ metadata: await f.metadata(), bodyState: "available" }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = reader.get("owner-a", f.identity.runId);
    await barrier.entered;
    await vi.advanceTimersByTimeAsync(4500);
    await expect(pending).resolves.toMatchObject({ state: "researching" });
    expect((await f.newImports().read(f.identity))?.phase).toBe(0);
    barrier.expire(); barrier.release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(barrier.lateStarts()).toBe(0);
    barrier.renew();
    await expect(reader.get("owner-a", f.identity.runId)).resolves.toMatchObject({ state: "ready" });
    expect((await f.newImports().read(f.identity))?.phase).toBe(5);
    expect(f.executorFetches()).toBe(2);
  });

  it.each(["begin", "terminal"] as const)("rereads one legitimate concurrent %s without mixing grants or resetting the budget", async (change) => {
    let barrier!: ReturnType<typeof createD1OperationBarrier>;
    let blocked = false;
    const { f, reader } = await setup({ connection: false, db: (fixture) => {
      barrier = createD1OperationBarrier(fixture.db as unknown as D1Database,
        (sql) => { if (!blocked && sql.includes("SELECT * FROM research_site_executions")) { blocked = true; return true; } return false; });
      return barrier.db;
    } });
    let identity = f.identity;
    if (change === "begin") {
      const queued = await f.createRemote("owner-b");
      const admitted = await f.executions.markAdmitted(f.admissionCommand(queued.execution, await f.reserveAdmission(queued.execution)));
      identity = { ownerId: admitted.ownerId, runId: admitted.runId, requestId: admitted.requestId,
        jobId: admitted.jobId, requestHash: admitted.requestHash };
    }
    const pending = reader.get(identity.ownerId, identity.runId);
    await barrier.entered;
    if (change === "begin") await f.begin.begin({ ...identity, newExecutionAllowed: true });
    else await f.imports.complete(identity, validReceipt(f.execution));
    barrier.release();
    await expect(pending).resolves.toMatchObject({ state: change === "begin" ? "researching" : "ready" });
    expect(f.executorFetches()).toBe(0);
  });

  it.each(["corruption", "database-error"] as const)("rejects later %s instead of using an earlier verified snapshot", async (failure) => {
    const { f, reader, dependencies } = await setup();
    if (failure === "corruption") f.setExecutorEntry(() => {
      f.db.database.prepare("UPDATE research_runs SET input_fingerprint='corrupt' WHERE id=?").run(f.identity.runId);
    });
    else {
      const create = dependencies.createReadRepositories; let count = 0;
      dependencies.createReadRepositories = (guard) => {
        const repositories = create(guard);
        if (++count > 1) vi.spyOn(repositories.research, "getRun").mockRejectedValue(new Error("injected database read error"));
        return repositories;
      };
    }
    await expect(reader.get("owner-a", f.identity.runId)).rejects.toThrow();
    expect(f.executorFetches()).toBe(1);
  });

  it("rejects a refresh timeout after observing a newer run instead of returning the old verified view", async () => {
    const { f, reader, dependencies } = await setup();
    f.setExecutorEntry(async () => { await f.imports.complete(f.identity, validReceipt(f.execution)); });
    const create = dependencies.createReadRepositories;
    let count = 0; let enter!: () => void; let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const resumed = new Promise<void>((resolve) => { release = resolve; });
    dependencies.createReadRepositories = (guard) => {
      const repositories = create(guard);
      if (++count > 1) {
        const read = repositories.executions.read.bind(repositories.executions);
        vi.spyOn(repositories.executions, "read").mockImplementation(async (...args) => {
          enter(); await resumed; guard(); return read(...args);
        });
      }
      return repositories;
    };
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = expect(reader.get("owner-a", f.identity.runId)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    await entered;
    await vi.advanceTimersByTimeAsync(500); await pending;
    release(); await new Promise<void>((resolve) => setImmediate(resolve));
    expect((await f.research.getRun("owner-a", f.identity.runId))?.state).toBe("ready");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rereads a begin racing the already-validated unbegun admission branch", async () => {
    const { f, reader, dependencies } = await setup({ connection: false });
    const queued = await f.createRemote("owner-b");
    const execution = await f.executions.markAdmitted(f.admissionCommand(queued.execution, await f.reserveAdmission(queued.execution)));
    const create = dependencies.createOperations;
    dependencies.createOperations = (guard) => {
      const operations = create(guard);
      const reconcile = operations.admission.reconcileBeforeBegin.bind(operations.admission);
      vi.spyOn(operations.admission, "reconcileBeforeBegin").mockImplementationOnce(async (identity) => {
        await f.begin.begin({ ...identity, newExecutionAllowed: true });
        return reconcile(identity);
      });
      return operations;
    };
    await expect(reader.get(execution.ownerId, execution.runId)).resolves.toMatchObject({ state: "researching" });
  });

  it("delegates proven synchronous history to legacy get after fencing the work scope", async () => {
    const { f, reader, legacy, reads, operations } = await setup();
    const created = await f.research.createOrReplay(f.command("owner-b"));
    await expect(reader.get("owner-b", created.run.id)).resolves.toMatchObject({ id: created.run.id, backgroundAccepted: false });
    expect(legacy.get).toHaveBeenCalledWith("owner-b", created.run.id);
    expect(operations).not.toHaveBeenCalled();
    expect(() => reads.mock.calls[0][0]()).toThrow();
  });

  it("normalizes recover role and matches exact mutation and retry source without creating work", async () => {
    const { f, reader } = await setup({ connection: false });
    const run = (await f.research.getRun("owner-a", f.identity.runId))!;
    const input = { kind: "start", role: "  Ｄａｔａ   Product Manager  ", locale: "en-US", mutationId: run.mutationId };
    await expect(reader.recover("owner-a", input)).resolves.toMatchObject({ id: run.id });
    for (const bad of [{ ...input, mutationId: "other-mutation" }, { ...input, kind: "retry", sourceRunId: "source-other" },
      { ...input, locale: "zh-CN" }, { ...input, role: "different role" }]) {
      await expect(reader.recover("owner-a", bad)).resolves.toBeNull();
    }
    await expect(reader.recover("owner-b", input)).resolves.toBeNull();
    await expect(reader.recover("owner-a", { ...input, jobId: f.identity.jobId })).rejects.toThrow();
    expect(f.readCounts().researchRuns).toBe(1);
  });

  it("recovers an actual remote retry only with its persisted retry source", async () => {
    const { f, reader } = await setup({ connection: false });
    f.setSqlNow(f.execution.executionExpiresAt!);
    await f.expiry.reconcile(f.identity, null);
    const retry = await f.research.createRemoteRetry({ ownerId: "owner-a", runId: f.identity.runId,
      requestId: "request-retry-test", mutationId: "mutation-retry-test",
      currentConfigFingerprint: f.execution.job.configFingerprint, policy: f.execution.policy });
    const input = { kind: "retry", role: "Data Product Manager", locale: "en-US",
      mutationId: retry.run.mutationId, sourceRunId: f.identity.runId };
    await expect(reader.recover("owner-a", input)).resolves.toMatchObject({ id: retry.run.id });
    await expect(reader.recover("owner-a", { ...input, sourceRunId: "different-source" })).resolves.toBeNull();
    await expect(reader.recover("owner-b", input)).resolves.toBeNull();
  });

  it("keeps a stateVersion-one remote run remote and never infers acceptance from status", async () => {
    const { f, reader, legacy, status } = await setup();
    expect((await f.research.getRun("owner-a", f.identity.runId))?.stateVersion).toBe(1);
    f.setExecutorStatus(status({ accepted: { jobId: f.identity.jobId, requestHash: f.identity.requestHash,
      workflowId: f.identity.jobId, workflowAcceptedAt: f.wallNow() } }));
    await expect(reader.get("owner-a", f.identity.runId)).resolves.toMatchObject({ state: "researching", backgroundAccepted: false });
    expect(legacy.get).not.toHaveBeenCalled(); expect(f.executorFetches()).toBe(1);
  });

  it("enriches only an exact persisted acceptance and keeps all private protocol data outside the DTO", async () => {
    const { f, reader } = await setup({ connection: false });
    await f.bridge.recordAcceptance({ jobId: f.identity.jobId, requestHash: f.identity.requestHash,
      workflowId: f.identity.jobId, workflowAcceptedAt: f.wallNow() });
    const view = await reader.get("owner-a", f.identity.runId);
    expect(view?.backgroundAccepted).toBe(true);
    const text = JSON.stringify(view);
    for (const secret of [f.identity.jobId, f.identity.requestHash, "receiptHash", "executor.test", "requestId"]) expect(text).not.toContain(secret);
  });

  it.each(["request_id", "remote_quota_key", "input_fingerprint", "config_fingerprint", "raw_role", "locale"])(
    "fails closed for persisted run %s corruption", async (column) => {
      const { f, reader } = await setup({ connection: false });
      if (column === "remote_quota_key") f.db.database.exec("DROP TRIGGER research_runs_execution_classification_immutable");
      f.db.database.prepare(`UPDATE research_runs SET ${column}=? WHERE id=?`)
        .run(column === "locale" ? "zh-CN" : "wrong-value", f.identity.runId);
      await expect(reader.get("owner-a", f.identity.runId)).rejects.toThrow();
    });

  it.each(["request_hash", "job_id", "job_json", "execution_expires_at"])("fails closed for execution %s corruption", async (column) => {
    const { f, reader } = await setup({ connection: false });
    f.db.database.exec("DROP TRIGGER research_site_executions_identity_immutable; DROP TRIGGER research_site_executions_lifecycle_guard; DROP TRIGGER research_site_executions_begin_deadline_guard");
    f.db.database.exec("PRAGMA ignore_check_constraints=ON");
    const wrong = column === "request_hash" ? "0".repeat(64) : column === "job_id" ? "00000000-0000-4000-8000-999999999999"
      : column === "job_json" ? "{}" : f.execution.executionExpiresAt! + 1;
    f.db.database.prepare(`UPDATE research_site_executions SET ${column}=? WHERE run_id=?`).run(wrong, f.identity.runId);
    f.db.database.exec("PRAGMA ignore_check_constraints=OFF");
    await expect(reader.get("owner-a", f.identity.runId)).rejects.toThrow();
  });

  it("rejects mismatched persisted acceptance instead of stale public success", async () => {
    const { f, reader } = await setup({ connection: false });
    await f.bridge.recordAcceptance({ jobId: f.identity.jobId, requestHash: f.identity.requestHash,
      workflowId: f.identity.jobId, workflowAcceptedAt: f.wallNow() });
    f.db.database.exec("DROP TRIGGER research_site_acceptances_immutable_update");
    f.db.database.prepare("UPDATE research_site_acceptances SET request_hash=?").run("0".repeat(64));
    await expect(reader.get("owner-a", f.identity.runId)).rejects.toThrow();
  });

  it("pulls a live signed result and imports it without waiting for expiry", async () => {
    const { f, reader, status } = await setup();
    f.setExecutorStatus(status({ metadata: await f.metadata(), bodyState: "available" }));
    const view = await reader.get("owner-a", f.identity.runId);
    expect(view).toMatchObject({ state: "ready", backgroundAccepted: false });
    expect(f.executorFetches()).toBe(2);
    expect((await f.newImports().read(f.identity))?.phase).toBe(5);
    expect((await f.budget.readReservation("owner-a", f.execution.budgetReservationId!))?.status).toBe("settled");
  });

  it("pulls a late available body for accounting without reviving the expired public run", async () => {
    const { f, reader, status } = await setup();
    f.setSqlNow(f.execution.executionExpiresAt!);
    f.setExecutorStatus(status({ metadata: await f.metadata(), bodyState: "available" }));
    await expect(reader.get("owner-a", f.identity.runId)).resolves.toMatchObject({ state: "failed" });
    expect((await f.budget.readReservation("owner-a", f.execution.budgetReservationId!))?.status).toBe("settled");
    expect(f.db.database.prepare("SELECT count(*) AS n FROM research_packages").get()).toEqual({ n: 0 });
    expect(f.executorFetches()).toBe(2);
  });

  it.each(["missing", "removed"] as const)("settles matched metadata with %s body without publishing a package", async (bodyState) => {
    const { f, reader, status } = await setup();
    f.setSqlNow(f.execution.executionExpiresAt!);
    f.setExecutorStatus(status({ metadata: await f.metadata(), bodyState }));
    await expect(reader.get("owner-a", f.identity.runId)).resolves.toMatchObject({ state: "failed" });
    expect(f.executorFetches()).toBe(1);
    expect(f.db.database.prepare("SELECT count(*) AS n FROM research_packages").get()).toEqual({ n: 0 });
    expect((await f.budget.readReservation("owner-a", f.execution.budgetReservationId!))?.status).toBe("settled");
  });

  it("resumes an existing import journal with connection missing and skips status for complete journal", async () => {
    const { f, reader } = await setup({ connection: false });
    f.setSqlNow(f.execution.executionExpiresAt!);
    await f.newImports().captureMetadata(f.identity, await f.metadata());
    await expect(reader.get("owner-a", f.identity.runId)).resolves.toMatchObject({ state: "failed" });
    expect((await f.newImports().read(f.identity))?.phase).toBe(5);
    expect(f.executorFetches()).toBe(0);
  });

  it("fails closed on a live missing body while SQL forbids metadata-only import", async () => {
    const { f, reader, status } = await setup();
    f.setExecutorStatus(status({ metadata: await f.metadata(), bodyState: "missing" }));
    await expect(reader.get("owner-a", f.identity.runId)).rejects.toThrow();
    expect(await f.newImports().read(f.identity)).toBeNull();
  });

  it("reconciles unbegun pending and expired runs locally, leaves admitted live queued", async () => {
    const { f, reader } = await setup({ connection: false });
    const pending = await f.createRemote("owner-b");
    await expect(reader.get("owner-b", pending.run.id)).resolves.toMatchObject({ state: "failed" });
    const live = await f.createRemote("owner-b");
    await f.executions.markAdmitted(f.admissionCommand(live.execution, await f.reserveAdmission(live.execution)));
    await expect(reader.get("owner-b", live.run.id)).resolves.toMatchObject({ state: "queued" });
    f.setSqlNow(live.execution.job.queueExpiresAt);
    f.setWall(live.execution.job.queueExpiresAt);
    await expect(reader.get("owner-b", live.run.id)).resolves.toMatchObject({ state: "failed" });
    expect(f.executorFetches()).toBe(0);
  });

  it("lets SQL expire a begun run even without a connection", async () => {
    const { f, reader } = await setup({ connection: false });
    f.setSqlNow(f.execution.executionExpiresAt!);
    await expect(reader.get("owner-a", f.identity.runId)).resolves.toMatchObject({ state: "failed" });
    expect((await f.recovery.read(f.identity))?.reason).toBe("expired-unknown");
    expect((await f.budget.readReservation("owner-a", f.execution.budgetReservationId!))?.status).toBe("conservative-hold");
  });

  it("never closes a live unclaimed execution; only closes a SQL-proven expired hold", async () => {
    const { f, reader, status } = await setup();
    f.setExecutorStatus(status({ dispatchState: "unclaimed" }));
    const proof = { jobId: f.identity.jobId, requestHash: f.identity.requestHash, state: "closed" as const,
      closedAt: f.execution.executionExpiresAt!, grant: null };
    f.setCloseProof(proof);
    await expect(reader.get("owner-a", f.identity.runId)).resolves.toMatchObject({ state: "researching" });
    expect(f.executorFetches()).toBe(1);
    f.setSqlNow(f.execution.executionExpiresAt!);
    await expect(reader.get("owner-a", f.identity.runId)).resolves.toMatchObject({ state: "failed" });
    expect(f.executorFetches()).toBe(3);
    expect((await f.recovery.read(f.identity))?.reason).toBe("executor-unsent");
    expect((await f.budget.readReservation("owner-a", f.execution.budgetReservationId!))?.status).toBe("released");
  });

  it("validates the original stored grant even when signed remote metadata otherwise matches", async () => {
    const { f, reader, status } = await setup();
    const metadata = await f.metadata();
    f.setExecutorStatus(status({ metadata: { ...metadata, grant: { ...metadata.grant,
      beganAt: metadata.grant.beganAt + 1, executionExpiresAt: metadata.grant.executionExpiresAt + 1 } }, bodyState: "removed" }));
    await expect(reader.get("owner-a", f.identity.runId)).rejects.toThrow();
    expect(await f.newImports().read(f.identity)).toBeNull();
  });

  it.each(["null", "wrong"] as const)("checks a status unsent proof with %s original grant", async (grantKind) => {
    const { f, reader, status } = await setup();
    f.setSqlNow(f.execution.executionExpiresAt!);
    const metadata = await f.metadata();
    const proof = { jobId: f.identity.jobId, requestHash: f.identity.requestHash, state: "closed" as const,
      closedAt: f.execution.executionExpiresAt!, grant: grantKind === "null" ? null : { ...metadata.grant,
        beganAt: metadata.grant.beganAt + 1, executionExpiresAt: metadata.grant.executionExpiresAt + 1 } };
    f.setExecutorStatus(status({ dispatchState: "closed", unsent: proof }));
    if (grantKind === "wrong") {
      await expect(reader.get("owner-a", f.identity.runId)).rejects.toThrow();
      expect((await f.budget.readReservation("owner-a", f.execution.budgetReservationId!))?.status).toBe("conservative-hold");
    } else {
      await expect(reader.get("owner-a", f.identity.runId)).resolves.toMatchObject({ state: "failed" });
      expect((await f.budget.readReservation("owner-a", f.execution.budgetReservationId!))?.status).toBe("released");
    }
    expect(f.executorFetches()).toBe(1);
  });

  it("does not turn a signed 404 into an unsent proof or release an expired hold", async () => {
    const { f, reader } = await setup();
    f.setSqlNow(f.execution.executionExpiresAt!); f.setExecutorStatus(null);
    await expect(reader.get("owner-a", f.identity.runId)).rejects.toThrow();
    expect((await f.budget.readReservation("owner-a", f.execution.budgetReservationId!))?.status).toBe("conservative-hold");
    expect(f.executorFetches()).toBe(1);
  });

  it("provides a reusable local view under a caller's existing scope without a fresh work window", async () => {
    const { f, reader, dependencies, operations } = await setup();
    const scope = new PublicOperationScope(f.monoNow);
    await expect(reader.readLocalView(scope, "owner-a", f.identity.runId)).resolves.toMatchObject({ state: "researching" });
    expect(dependencies.createExecutor).not.toHaveBeenCalled(); expect(operations).not.toHaveBeenCalled();
    scope.finish();
    await expect(reader.readLocalView(scope, "owner-a", f.identity.runId)).rejects.toThrow();
  });
});
