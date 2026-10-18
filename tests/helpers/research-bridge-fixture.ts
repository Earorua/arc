import { signBridgeMessage, verifyBridgeMessage } from "../../app/server/research/executor/auth";
import { BRIDGE_BODY_LIMITS, readBridgeBody } from "../../app/server/research/executor/body";
import { encodeBridgeDto, type ExecutorStatus, type ReceiptNotice, type UnsentProof } from "../../app/server/research/executor/bridge-contract";
import { readResearchBridgeConnection } from "../../app/server/research/executor/connection-config";
import { D1BridgeNonceStore } from "../../app/server/research/executor/d1-nonce-store";
import { BridgeTransport } from "../../app/server/research/executor/http-transport";
import { encodeBridgeProviderReceipt, summarizeBridgeProviderReceipt, type BridgeProviderReceipt } from "../../app/server/research/executor/receipt";
import { D1SiteBridgeRepository } from "../../app/server/research/d1-site-bridge-repository";
import { D1SiteExpiryRepository } from "../../app/server/research/d1-site-expiry-repository";
import { D1SiteImportPublication } from "../../app/server/research/d1-site-import-publication";
import { SiteExpiryCoordinator } from "../../app/server/research/site-expiry";
import { SiteImportCoordinator } from "../../app/server/research/site-import";
import { createSiteBridgeHandler } from "../../app/server/http/research-bridge-routes";
import { createProductionSiteBridgeHandler, createSiteBridgeOperations } from "../../app/server/research/site-bridge-factory";
import { readResearchPolicyConfiguration, type ResearchProductionEnvironment } from "../../app/server/research/production-policy";
import { ExecutorBridgeClient } from "../../app/server/research/executor/executor-client";
import { SiteBridgeClient } from "../../worker/research-executor/site-client";
import { createResearchD1 } from "./sqlite-d1";
import { createSiteImportFixture, validReceipt } from "./site-import-fixture";

export const TEST_BRIDGE_ENVIRONMENT = {
  BETTER_AUTH_URL: "https://site.test",
  ARC_AI_RESEARCH_EXECUTOR_URL: "https://executor.test",
  ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID: "site-test",
  ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX: "11".repeat(32),
  ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID: "executor-test",
  ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX: "22".repeat(32),
} as const;

export const TEST_PRODUCTION_ENVIRONMENT = {
  ...TEST_BRIDGE_ENVIRONMENT,
  ARC_ENVIRONMENT: "test",
  ARC_AI_ENABLED: "true",
  ARC_AI_RESEARCH_ENABLED: "true",
  ARC_AI_RESEARCH_PROFILE: "kimi-low-output32k-v3",
  ARC_AI_USER_DAILY_QUOTA: "3",
  ARC_AI_RATE_LIMIT_PER_MINUTE: "2",
  ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3",
  ARC_AI_MODEL_ECONOMY: "test/economy-fixed",
  ARC_AI_RESEARCH_TIMEOUT_MS: "1200000",
  ARC_AI_REPAIR_TIMEOUT_MS: "10000",
  ARC_AI_RESEARCH_CACHE_DAYS: "14",
  ARC_AI_SITE_DAILY_BUDGET_MICROS: "20000000",
  ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "100000000",
  ARC_AI_RESEARCH_MAX_COST_MICROS: "5000000",
  ARC_AI_REPAIR_MAX_COST_MICROS: "0",
  ARC_AI_IP_HASH_SALT: "synthetic-test-salt-value",
  ARC_AI_RESEARCH_EXECUTOR: "cloudflare-workflow-v1",
} as const;

export function createD1OperationBarrier(db: D1Database,
  shouldDelay: (sql: string, occurrence: number) => boolean,
  shouldDelayAfter: (sql: string, occurrence: number) => boolean = () => false) {
  const rawStatements = new WeakMap<object, Readonly<{ statement: D1PreparedStatement; sql: string }>>();
  let occurrence = 0;
  let expired = false;
  let lateStarts = 0;
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const resumed = new Promise<void>((resolve) => { release = resolve; });
  const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => {
    const wrapper = {
      bind: (...values: unknown[]) => wrap(statement.bind(...values), sql),
      first: async (...args: [string?]) => run("first", args),
      run: async () => run("run", []),
      all: async () => run("all", []),
      raw: async (options?: { columnNames?: boolean }) => run("raw", options === undefined ? [] : [options]),
    } as unknown as D1PreparedStatement;
    rawStatements.set(wrapper as object, { statement, sql });
    const run = async (method: "first" | "run" | "all" | "raw", args: unknown[]) => {
      occurrence += 1;
      if (expired) lateStarts += 1;
      if (shouldDelay(sql, occurrence)) { enter(); await resumed; }
      const result = await (statement[method] as (...values: unknown[]) => Promise<unknown>).apply(statement, args);
      if (shouldDelayAfter(sql, occurrence)) { enter(); await resumed; }
      return result;
    };
    return wrapper;
  };
  const guarded = {
    prepare: (sql: string) => wrap(db.prepare(sql), sql),
    batch: async <T>(statements: D1PreparedStatement[]) => {
      const entries = statements.map((statement) => {
        const raw = rawStatements.get(statement as object);
        if (!raw) throw new Error("foreign statement");
        return raw;
      });
      occurrence += 1;
      if (expired) lateStarts += 1;
      const sql = `BATCH:${entries.map((entry) => entry.sql).join("\n")}`;
      if (shouldDelay(sql, occurrence)) { enter(); await resumed; }
      const result = await db.batch<T>(entries.map((entry) => entry.statement));
      if (shouldDelayAfter(sql, occurrence)) { enter(); await resumed; }
      return result;
    },
    exec: (sql: string) => db.exec(sql),
    dump: () => db.dump(),
    withSession: () => { throw new Error("unused test session"); },
  } as D1Database;
  return { db: guarded, entered, release, expire: () => { expired = true; },
    renew: () => { expired = false; }, lateStarts: () => lateStarts };
}

export async function createResearchBridgeFixture() {
  const base = await createSiteImportFixture();
  const clientDb = createResearchD1();
  const connection = readResearchBridgeConnection(TEST_BRIDGE_ENVIRONMENT);
  if (!connection) throw new Error("invalid synthetic bridge connection");
  let wall = base.execution.beganAt! + 2_000;
  let mono = 1_000;
  let providerCalls = 0;
  const environment: ResearchProductionEnvironment = { ...TEST_PRODUCTION_ENVIRONMENT };
  let siteFetches = 0;
  let executorFetches = 0;
  let executorStatus: ExecutorStatus | null = null;
  let closeProof: UnsentProof | null = null;
  let executorEntry: ((request: Request) => void | Promise<void>) | null = null;
  const initialReceipt = validReceipt(base.execution);
  if (initialReceipt.grant.beganAt === null || initialReceipt.grant.executionExpiresAt === null) {
    throw new Error("synthetic execution was not begun");
  }
  let receipt: BridgeProviderReceipt = { ...initialReceipt, grant: { ...initialReceipt.grant,
    beganAt: initialReceipt.grant.beganAt, executionExpiresAt: initialReceipt.grant.executionExpiresAt } };

  const bridge = new D1SiteBridgeRepository(base.db as unknown as D1Database, base.research, base.executions);
  const publication = new D1SiteImportPublication(base.db as unknown as D1Database, base.research, base.executions);
  const imports = new SiteImportCoordinator({ imports: base.imports, publication, research: base.research,
    audits: base.audits, entitlements: base.quota, budget: base.budget });
  const recovery = new D1SiteExpiryRepository(base.db as unknown as D1Database, base.research, base.executions);
  const expiry = new SiteExpiryCoordinator({ repository: recovery, bridgeRepository: bridge, importer: imports,
    importJournal: base.imports, entitlements: base.quota, budget: base.budget });

  const executorNonces = new D1BridgeNonceStore(clientDb as unknown as D1Database);
  const executorFetch: typeof globalThis.fetch = async (input, init): Promise<Response> => {
    const request = input instanceof Request && init === undefined ? input : new Request(input, init);
    executorFetches += 1;
    if (request.url.includes("openrouter")) { providerCalls += 1; throw new Error("provider fetch forbidden"); }
    await executorEntry?.(request);
    const url = new URL(request.url);
    const operation = url.pathname.split("/").pop()!;
    const jobId = request.headers.get("x-arc-bridge-job-id")!;
    const body = await readBridgeBody(request, { maxBytes: BRIDGE_BODY_LIMITS.request, timeoutMs: 1_000 });
    await verifyBridgeMessage({ context: { direction: "site-to-executor", kind: "request", method: "POST",
      path: url.pathname, audience: connection.executorOrigin, jobId, status: null }, body,
      headers: request.headers, keyId: connection.siteToExecutor.keyId,
      keyBytes: connection.siteToExecutor.copyKeyBytes(), nonces: executorNonces, now: () => wall });
    let status = 200;
    let output: Uint8Array;
    if (operation === "result") output = encodeBridgeProviderReceipt(receipt);
    else if (operation === "status" && executorStatus) output = encodeBridgeDto(executorStatus, BRIDGE_BODY_LIMITS.status);
    else if (operation === "close" && closeProof) output = encodeBridgeDto(closeProof, BRIDGE_BODY_LIMITS.status);
    else { status = 404; output = encodeBridgeDto({ code: "not-found" }, BRIDGE_BODY_LIMITS.status); }
    const headers = await signBridgeMessage({ context: { direction: "site-to-executor", kind: "response", method: "POST",
      path: url.pathname, audience: connection.executorOrigin, jobId, status }, body: output,
      keyId: connection.siteToExecutor.keyId, keyBytes: connection.siteToExecutor.copyKeyBytes(), now: () => wall });
    const responseBody = new Uint8Array(output.byteLength);
    responseBody.set(output);
    return new Response(responseBody, { status, headers });
  };
  const wallNow = () => wall;
  const monoNow = () => mono;
  const handler = createProductionSiteBridgeHandler({ environment,
    getD1: () => base.db as unknown as D1Database, fetch: executorFetch, wallNow, monoNow });
  const siteFetch = async (request: Request) => { siteFetches += 1; return handler(request); };
  const siteClient = new SiteBridgeClient(new BridgeTransport({ connection, nonces: new D1BridgeNonceStore(
    clientDb as unknown as D1Database), fetch: siteFetch, wallNow, monoNow }));
  const metadata = () => summarizeBridgeProviderReceipt(receipt);
  const notice = async (): Promise<ReceiptNotice> => { const value = await metadata(); return {
    jobId: value.grant.jobId, requestHash: value.grant.requestHash, receiptHash: value.receiptHash }; };
  const businessSnapshot = () => Object.fromEntries([
    "research_runs", "research_site_executions", "research_site_acceptances", "research_site_recoveries",
    "research_site_imports", "quota_ledger", "ai_budget_reservations", "ai_budget_buckets", "ai_runs",
    "research_packages",
  ].map((table) => [table, base.db.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  const createMaintenanceClient = (businessDb: D1Database, afterReconcile?: () => void) => {
    let offered = false;
    const directExecutor = new ExecutorBridgeClient(new BridgeTransport({ connection, nonces: executorNonces,
      fetch: executorFetch, wallNow, monoNow }));
    const directHandler = createSiteBridgeHandler({ connection,
      nonces: new D1BridgeNonceStore(base.db as unknown as D1Database),
      createOperations: (guard) => {
        const operations = createSiteBridgeOperations(businessDb, guard, wallNow);
        const actual = operations.bridge;
        const forcedBridge = {
          lookup: (value: Parameters<typeof actual.lookup>[0]) => actual.lookup(value),
          recordAcceptance: (value: Parameters<typeof actual.recordAcceptance>[0]) => actual.recordAcceptance(value),
          readAcceptance: (value: Parameters<typeof actual.readAcceptance>[0]) => actual.readAcceptance(value),
          nextScan: async (name: Parameters<typeof actual.nextScan>[0]) => {
            if (name !== "maintenance" || offered) return null;
            offered = true;
            return base.identity;
          },
        };
        const observedExpiry = afterReconcile ? new Proxy(operations.expiry, {
          get: (target, property, receiver) => property === "reconcile"
            ? async (...args: Parameters<typeof operations.expiry.reconcile>) => {
              await target.reconcile(...args);
              afterReconcile();
            }
            : Reflect.get(target, property, receiver),
        }) : operations.expiry;
        return { ...operations, bridge: forcedBridge, expiry: observedExpiry };
      },
      executor: directExecutor,
      newExecutionAllowed: () => readResearchPolicyConfiguration(environment)?.executor === "cloudflare-workflow-v1",
      wallNow, monoNow });
    return new SiteBridgeClient(new BridgeTransport({ connection,
      nonces: new D1BridgeNonceStore(clientDb as unknown as D1Database),
      fetch: async (request) => directHandler(request), wallNow, monoNow }));
  };
  const createForcedMaintenanceClient = () => createMaintenanceClient(base.db as unknown as D1Database);
  return { ...base, connection, clientDb, bridge, imports, recovery, expiry, environment, handler, siteClient,
    metadata, notice, setReceipt: (value: BridgeProviderReceipt) => { receipt = value; },
    setExecutorStatus: (value: ExecutorStatus | null) => { executorStatus = value; },
    setCloseProof: (value: UnsentProof | null) => { closeProof = value; },
    setExecutorEntry: (value: ((request: Request) => void | Promise<void>) | null) => { executorEntry = value; },
    setWall: (value: number) => { wall = value; }, setMono: (value: number) => { mono = value; },
    setNewExecutionAllowed: (value: boolean) => { environment.ARC_AI_RESEARCH_ENABLED = value ? "true" : "false"; },
    wallNow, monoNow,
    advanceMono: (value: number) => { mono += value; }, syntheticProviderCalls: () => providerCalls,
    siteFetches: () => siteFetches, executorFetches: () => executorFetches, executorFetch, businessSnapshot,
    createForcedMaintenanceClient,
    createObservedMaintenanceClient: (businessDb: D1Database, afterReconcile: () => void) =>
      createMaintenanceClient(businessDb, afterReconcile) };
}
