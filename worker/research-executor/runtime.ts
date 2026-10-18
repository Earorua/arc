import { readResearchBridgeConnection } from "../../app/server/research/executor/connection-config";
import { D1BridgeNonceStore } from "../../app/server/research/executor/d1-nonce-store";
import { BridgeTransport } from "../../app/server/research/executor/http-transport";
import { resolveResearchBridgeFetch } from "../../app/server/research/executor/service-binding-transport";
import { OpenRouterResearchProvider } from "../../app/server/research/openrouter-provider";
import { ensureWorkflow } from "./bootstrap";
import { deliverReceipt } from "./delivery";
import { D1BridgeJobStore } from "./d1-job-store";
import type { ExecutorEnvironment } from "./environment";
import type { ResearchJobDependencies } from "./execute-job";
import { ExecutorReceiptStore } from "./receipt-store";
import { ExecutorMaintenanceStore } from "./maintenance-store";
import { readExecutorMaintenanceEnabled } from "./maintenance-policy";
import { SiteBridgeClient } from "./site-client";

export type ExecutorRuntimeOverrides = Readonly<{
  bridgeFetch?: typeof fetch;
  providerFetch?: typeof fetch;
  wallNow?: () => number;
  monoNow?: () => number;
}>;

function validDatabase(value: unknown): value is D1Database {
  return !!value && typeof value === "object" && typeof (value as D1Database).prepare === "function";
}

function validBucket(value: unknown): value is R2Bucket {
  return !!value && typeof value === "object"
    && typeof (value as R2Bucket).get === "function"
    && typeof (value as R2Bucket).put === "function"
    && typeof (value as R2Bucket).delete === "function";
}

function validWorkflow(value: unknown): value is Workflow<{ jobId: string }> {
  return !!value && typeof value === "object"
    && typeof (value as Workflow<{ jobId: string }>).create === "function"
    && typeof (value as Workflow<{ jobId: string }>).get === "function";
}

async function guardedResult<T>(guard: () => void, operation: () => Promise<T>): Promise<T> {
  guard();
  const result = await operation();
  guard();
  return result;
}

function createGuardedDatabase(db: D1Database, guard: () => void): D1Database {
  const owned = new WeakMap<object, D1PreparedStatement>();
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const invoke = <T>(method: "first" | "run" | "all" | "raw", args: unknown[]) => guardedResult(guard,
      () => (statement[method] as (...values: unknown[]) => Promise<T>).apply(statement, args));
    const wrapper = {
      bind: (...values: unknown[]) => { guard(); return wrap(statement.bind(...values)); },
      first: (...args: unknown[]) => invoke("first", args),
      run: () => invoke("run", []),
      all: () => invoke("all", []),
      raw: (...args: unknown[]) => invoke("raw", args),
    } as unknown as D1PreparedStatement;
    owned.set(wrapper as object, statement);
    return wrapper;
  };
  return {
    prepare: (query: string) => { guard(); return wrap(db.prepare(query)); },
    batch: <T>(statements: D1PreparedStatement[]) => {
      guard();
      const raw = statements.map((statement) => {
        const value = owned.get(statement as object);
        if (!value) throw new Error("Executor request rejected a foreign D1 statement");
        return value;
      });
      return guardedResult(guard, () => db.batch<T>(raw));
    },
    exec: () => { throw new Error("Executor request D1 exec is unavailable"); },
    withSession: () => { throw new Error("Executor request D1 sessions are unavailable"); },
    dump: () => { throw new Error("Executor request D1 dump is unavailable"); },
  } as D1Database;
}

function createGuardedBucket(bucket: R2Bucket, guard: () => void): Pick<R2Bucket, "get" | "put"> {
  const invoke = <T>(method: "get" | "put", args: unknown[]) => guardedResult(guard, () => {
    const operation = bucket[method] as unknown as (...values: unknown[]) => Promise<T>;
    return operation.apply(bucket, args);
  });
  return {
    get: ((...args: unknown[]) => invoke("get", args)) as R2Bucket["get"],
    put: ((...args: unknown[]) => invoke("put", args)) as R2Bucket["put"],
  };
}

function clocks(overrides: ExecutorRuntimeOverrides) {
  const wallNow = overrides.wallNow ?? Date.now;
  const monoNow = overrides.monoNow ?? (() => performance.now());
  if (typeof wallNow !== "function" || typeof monoNow !== "function") throw new Error("Executor runtime unavailable");
  return { wallNow, monoNow };
}

function stores(environment: ExecutorEnvironment, database: D1Database = environment.EXECUTOR_DB,
  bucket: Pick<R2Bucket, "get" | "put"> = environment.EXECUTOR_RECEIPTS) {
  if (!validDatabase(database) || !validBucket(environment?.EXECUTOR_RECEIPTS)) {
    throw new Error("Executor runtime unavailable");
  }
  const jobs = new D1BridgeJobStore(database);
  const receipts = new ExecutorReceiptStore(database, bucket);
  return { jobs, receipts };
}

function bridge(environment: ExecutorEnvironment, overrides: ExecutorRuntimeOverrides,
  database: D1Database = environment.EXECUTOR_DB) {
  const connection = readResearchBridgeConnection(environment);
  if (!connection) throw new Error("Executor runtime unavailable");
  const { wallNow, monoNow } = clocks(overrides);
  const bridgeFetch = resolveResearchBridgeFetch(environment, connection, "site", overrides.bridgeFetch);
  if (typeof bridgeFetch !== "function" || !validDatabase(database)) {
    throw new Error("Executor runtime unavailable");
  }
  const nonces = new D1BridgeNonceStore(database);
  const site = new SiteBridgeClient(new BridgeTransport({ connection, nonces,
    fetch: bridgeFetch, wallNow, monoNow }));
  return { connection, nonces, site, wallNow, monoNow };
}

export function createExecutionRuntime(
  environment: ExecutorEnvironment,
  overrides: ExecutorRuntimeOverrides = {},
): ResearchJobDependencies {
  const { jobs, receipts } = stores(environment);
  const { site, wallNow, monoNow } = bridge(environment, overrides);
  const providerFetch = overrides.providerFetch ?? globalThis.fetch;
  if (typeof providerFetch !== "function") throw new Error("Executor runtime unavailable");
  const adapter = new OpenRouterResearchProvider({ OPENROUTER_API_KEY: environment.OPENROUTER_API_KEY,
    ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3", researchProfile: "kimi-low-output32k-v3",
    researchTimeoutMs: 1_200_000 }, { fetch: providerFetch });
  const provider = Object.freeze({ research: adapter.research.bind(adapter) });
  return Object.freeze({ jobs, receipts, site, provider, wallNow, monoNow });
}

export function createHttpRuntime(
  environment: ExecutorEnvironment,
  overrides: ExecutorRuntimeOverrides = {},
) {
  const maintenanceEnabled = readExecutorMaintenanceEnabled(environment);
  const acceptNew = maintenanceEnabled && environment.ARC_RESEARCH_EXECUTOR_ACCEPT_NEW === "true";
  const { jobs, receipts } = stores(environment);
  if (!validWorkflow(environment.RESEARCH_WORKFLOW)) throw new Error("Executor runtime unavailable");
  const { connection, nonces, site, wallNow, monoNow } = bridge(environment, overrides);
  const workflow = environment.RESEARCH_WORKFLOW;
  const bootstrap = (job: Parameters<typeof ensureWorkflow>[0], guard?: () => void) => ensureWorkflow(job,
    { jobs, workflow, site, wallNow, guard });
  const forRequest = (guard: () => void, signal: AbortSignal) => {
    guard();
    const database = createGuardedDatabase(environment.EXECUTOR_DB, guard);
    const bucket = createGuardedBucket(environment.EXECUTOR_RECEIPTS, guard);
    const requestStores = stores(environment, database, bucket);
    const requestBridge = bridge(environment, overrides, database);
    const requestBootstrap = (job: Parameters<typeof ensureWorkflow>[0], extraGuard?: () => void) => {
      const combined = () => { guard(); extraGuard?.(); };
      return ensureWorkflow(job, { jobs: requestStores.jobs, workflow, site: requestBridge.site,
        wallNow, guard: combined, signal });
    };
    return Object.freeze({ ...requestStores, site: requestBridge.site, ensureWorkflow: requestBootstrap,
      maintenanceEnabled, acceptNew,
      connection, nonces: requestBridge.nonces, wallNow, monoNow });
  };
  return Object.freeze({ jobs, receipts, site, ensureWorkflow: bootstrap,
    maintenanceEnabled, acceptNew,
    connection, nonces, wallNow, monoNow, forRequest });
}

export function createMaintenanceRuntime(
  environment: ExecutorEnvironment,
  overrides: ExecutorRuntimeOverrides = {},
) {
  const base = stores(environment);
  if (!validWorkflow(environment.RESEARCH_WORKFLOW)) throw new Error("Executor runtime unavailable");
  const { wallNow, monoNow } = bridge(environment, overrides);
  const store = new ExecutorMaintenanceStore(environment.EXECUTOR_DB);
  const workflow = environment.RESEARCH_WORKFLOW;
  const scope = (signal: AbortSignal, extraGuard?: () => void) => {
    const guard = () => {
      if (signal.aborted) throw new DOMException("Executor maintenance aborted", "AbortError");
      extraGuard?.();
    };
    guard();
    const database = createGuardedDatabase(environment.EXECUTOR_DB, guard);
    const bucket = createGuardedBucket(environment.EXECUTOR_RECEIPTS, guard);
    const scopedStores = stores(environment, database, bucket);
    const scopedBridge = bridge(environment, overrides, database);
    return Object.freeze({ ...scopedStores, store: new ExecutorMaintenanceStore(database),
      site: scopedBridge.site, guard });
  };
  const jobs = Object.freeze({
    accept: (job: Parameters<D1BridgeJobStore["accept"]>[0], now: number,
      signal?: AbortSignal, guard?: () => void) => signal
      ? scope(signal, guard).jobs.accept(job, now) : base.jobs.accept(job, now),
    get: (jobId: string, signal?: AbortSignal, guard?: () => void) => signal
      ? scope(signal, guard).jobs.get(jobId) : base.jobs.get(jobId),
  });
  const receipts = Object.freeze({
    recover: (jobId: string, now: number, signal?: AbortSignal, guard?: () => void) => signal
      ? scope(signal, guard).receipts.recover(jobId, now) : base.receipts.recover(jobId, now),
    cleanup: (jobId: string, now: number, signal?: AbortSignal, guard?: () => void) => signal
      ? scope(signal, guard).receipts.cleanup(jobId, now) : base.receipts.cleanup(jobId, now),
  });
  const maintenanceStore = Object.freeze({
    acquire: (now: number, signal?: AbortSignal, guard?: () => void) => signal
      ? scope(signal, guard).store.acquire(now) : store.acquire(now),
    next: (category: "bootstrap" | "results", generation: number, signal?: AbortSignal, guard?: () => void) => signal
      ? scope(signal, guard).store.next(category, generation) : store.next(category, generation),
    takePickupTurn: (generation: number, signal?: AbortSignal, guard?: () => void) => signal
      ? scope(signal, guard).store.takePickupTurn(generation) : store.takePickupTurn(generation),
    ensureAcceptance: (jobId: string, now: number, signal?: AbortSignal, guard?: () => void) => signal
      ? scope(signal, guard).store.ensureAcceptance(jobId, now) : store.ensureAcceptance(jobId, now),
    readAcceptanceDelivery: (jobId: string, signal?: AbortSignal, guard?: () => void) => signal
      ? scope(signal, guard).store.readAcceptanceDelivery(jobId) : store.readAcceptanceDelivery(jobId),
    recordAcceptance: (jobId: string, now: number, signal?: AbortSignal, guard?: () => void) => signal
      ? scope(signal, guard).store.recordAcceptance(jobId, now) : store.recordAcceptance(jobId, now),
    deferAcceptance: (jobId: string, now: number,
      failure: Parameters<ExecutorMaintenanceStore["deferAcceptance"]>[2], signal?: AbortSignal, guard?: () => void) => signal
      ? scope(signal, guard).store.deferAcceptance(jobId, now, failure) : store.deferAcceptance(jobId, now, failure),
    cleanupPriority: (jobId: string, now: number, signal?: AbortSignal, guard?: () => void) => signal
      ? scope(signal, guard).store.cleanupPriority(jobId, now) : store.cleanupPriority(jobId, now),
  });
  const requestSite = (signal?: AbortSignal) => signal ? scope(signal).site : bridge(environment, overrides).site;
  const site = Object.freeze({
    maintenance: (options: { signal?: AbortSignal } = {}) => requestSite(options.signal).maintenance(options),
    outbox: (options: { signal?: AbortSignal } = {}) => requestSite(options.signal).outbox(options),
  });
  const bootstrap = async (job: Parameters<typeof ensureWorkflow>[0], signal: AbortSignal, guard?: () => void) => {
    const scoped = scope(signal, guard);
    return ensureWorkflow(job, { jobs: scoped.jobs, workflow, site: scoped.site,
      wallNow, guard: scoped.guard, signal });
  };
  const delivery = async (jobId: string, signal: AbortSignal, guard?: () => void,
    outboundBudget?: () => number) => {
    const scoped = scope(signal, guard);
    try {
      await deliverReceipt(jobId, { jobs: scoped.jobs, receipts: scoped.receipts,
        store: scoped.store, site: scoped.site, wallNow, signal, outboundBudget });
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  };
  return Object.freeze({ jobs, receipts, store: maintenanceStore, site, bootstrap, delivery,
    acceptNew: environment.ARC_RESEARCH_EXECUTOR_ACCEPT_NEW === "true", wallNow, monoNow });
}
