import { D1AiRunSink } from "../ai/d1-run-recorder";
import { D1EntitlementRepository } from "../entitlements/d1-entitlement-repository";
import { createSiteBridgeHandler } from "../http/research-bridge-routes";
import type { SiteBridgeOperations } from "./site-bridge-operations";
import { D1ResearchBudgetRepository } from "./d1-budget-repository";
import { D1ResearchRepository } from "./d1-repository";
import { D1SiteBeginRepository } from "./d1-site-begin-repository";
import { D1SiteBridgeRepository } from "./d1-site-bridge-repository";
import { D1SiteExecutionRepository } from "./d1-site-execution-repository";
import { D1SiteExpiryRepository } from "./d1-site-expiry-repository";
import { D1SiteImportPublication } from "./d1-site-import-publication";
import { D1SiteImportRepository } from "./d1-site-import-repository";
import { readResearchBridgeConnection } from "./executor/connection-config";
import { D1BridgeNonceStore } from "./executor/d1-nonce-store";
import { ExecutorBridgeClient } from "./executor/executor-client";
import { BridgeTransport } from "./executor/http-transport";
import { readResearchPolicyConfiguration, type ResearchProductionEnvironment } from "./production-policy";
import { SiteAdmissionCoordinator } from "./site-admission";
import { SiteExpiryCoordinator } from "./site-expiry";
import { SiteImportCoordinator } from "./site-import";
import { siteSqlNow } from "./site-execution-sql";

export type ProductionSiteBridgeRuntime = Readonly<{
  environment: ResearchProductionEnvironment;
  getD1: () => D1Database;
  fetch?: typeof fetch;
  wallNow?: () => number;
  monoNow?: () => number;
}>;

function unavailable() {
  return async () => new Response("{}", {
    status: 503,
    headers: { "cache-control": "no-store", "content-type": "application/json" },
  });
}

async function guardedResult<T>(guard: () => void, operation: () => Promise<T>): Promise<T> {
  guard();
  const result = await operation();
  guard();
  return result;
}

export function createGuardedD1(db: D1Database, guard: () => void): D1Database {
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
        if (!value) throw new Error("Research bridge rejected a foreign D1 statement");
        return value;
      });
      return guardedResult(guard, () => db.batch<T>(raw));
    },
    exec: () => { throw new Error("Research bridge guarded D1 exec is unavailable"); },
    withSession: () => { throw new Error("Research bridge guarded D1 sessions are unavailable"); },
    dump: () => { throw new Error("Research bridge guarded D1 dump is unavailable"); },
  } as D1Database;
}

export function createSiteBridgeOperations(db: D1Database, guard: () => void,
  wallNow: () => number): SiteBridgeOperations {
  const guarded = createGuardedD1(db, guard);
  const options = { now: wallNow };
  const research = new D1ResearchRepository(guarded, options);
  const executions = new D1SiteExecutionRepository(guarded, research);
  const begin = new D1SiteBeginRepository(guarded, research, executions);
  const entitlements = new D1EntitlementRepository(guarded, options);
  const budget = new D1ResearchBudgetRepository(guarded, options);
  const bridge = new D1SiteBridgeRepository(guarded, research, executions);
  const importJournal = new D1SiteImportRepository(guarded, research, executions);
  const publication = new D1SiteImportPublication(guarded, research, executions);
  const audits = new D1AiRunSink(guarded, options);
  const imports = new SiteImportCoordinator({ imports: importJournal, publication, research,
    audits, entitlements, budget });
  const recovery = new D1SiteExpiryRepository(guarded, research, executions);
  const expiry = new SiteExpiryCoordinator({ repository: recovery, bridgeRepository: bridge,
    importer: imports, importJournal, entitlements, budget });
  const admission = new SiteAdmissionCoordinator({ research, executions, entitlements, budget, now: wallNow });
  const outboxEligibility = { isEligible: async (identity: Parameters<SiteBridgeOperations["outboxEligibility"]["isEligible"]>[0],
    expectedVersion: number) => {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error("invalid execution version");
    const row = await guarded.prepare(`SELECT 1 AS eligible
      FROM research_site_executions e
      JOIN research_runs r ON r.id=e.run_id AND r.user_id=e.user_id AND r.request_id=e.request_id
      WHERE e.user_id=?1 AND e.run_id=?2 AND e.request_id=?3 AND e.job_id=?4 AND e.request_hash=?5
        AND e.version=?6 AND r.execution_mode='cloudflare-workflow-v1' AND r.remote_quota_key=e.quota_key
        AND e.admission_state='admitted' AND e.began_at IS NULL AND e.queue_expires_at>${siteSqlNow}
      LIMIT 1`).bind(identity.ownerId, identity.runId, identity.requestId, identity.jobId,
      identity.requestHash, expectedVersion).first<Record<string, unknown>>();
    if (row === null) return false;
    if (row.eligible !== 1 || Object.keys(row).length !== 1) throw new Error("invalid outbox eligibility result");
    return true;
  } };
  return { bridge, begin, admission, imports, importJournal, expiry, recovery, budget, outboxEligibility };
}

export function createProductionSiteBridgeHandler(runtime: ProductionSiteBridgeRuntime) {
  const connection = readResearchBridgeConnection(runtime.environment);
  if (!connection) return unavailable();
  try {
    const db = runtime.getD1();
    const wallNow = runtime.wallNow ?? Date.now;
    const monoNow = runtime.monoNow ?? (() => performance.now());
    const nonces = new D1BridgeNonceStore(db);
    const executor = new ExecutorBridgeClient(new BridgeTransport({ connection, nonces,
      fetch: runtime.fetch ?? fetch, wallNow, monoNow }));
    const createOperations = (guard: () => void) => createSiteBridgeOperations(db, guard, wallNow);
    return createSiteBridgeHandler({ connection, nonces, createOperations, executor,
      newExecutionAllowed: () => readResearchPolicyConfiguration(runtime.environment)?.executor === "cloudflare-workflow-v1",
      wallNow, monoNow });
  } catch { return unavailable(); }
}
