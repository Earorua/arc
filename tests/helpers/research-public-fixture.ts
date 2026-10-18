import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { Miniflare } from "miniflare";
import { D1ResearchBudgetRepository } from "../../app/server/research/d1-budget-repository";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { D1BridgeNonceStore } from "../../app/server/research/executor/d1-nonce-store";
import { ExecutorBridgeClient } from "../../app/server/research/executor/executor-client";
import { BridgeTransport } from "../../app/server/research/executor/http-transport";
import { readResearchBridgeConnection } from "../../app/server/research/executor/connection-config";
import { createProductionSiteBridgeHandler } from "../../app/server/research/site-bridge-factory";
import { createExecutorBridgeHandler } from "../../worker/research-executor/http-routes";
import { runResearchJob } from "../../worker/research-executor/execute-job";
import { runExecutorMaintenance } from "../../worker/research-executor/maintenance";
import { createExecutionRuntime, createHttpRuntime, createMaintenanceRuntime } from "../../worker/research-executor/runtime";
import { SiteBridgeClient } from "../../worker/research-executor/site-client";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createResearchD1, seedUser } from "./sqlite-d1";
import { requireArcUser } from "../../app/server/auth/session";
import { createResearchServiceFactory, readResearchProductionConfiguration } from "../../app/server/research/service-factory";
import type { ResearchProductionEnvironment } from "../../app/server/research/production-policy";
import { createResearchStartHandler, createResearchGetHandler, createResearchRecoverHandler, createResearchRetryHandler } from "../../app/server/http/research-route-factories";
import { createResearchEligibilityHandler } from "../../app/server/http/research-eligibility-route";
import { D1RateLimiter } from "../../app/server/http/rate-limit";
import { D1OperationalEventSink } from "../../app/server/observability/d1-events";
import { SqliteD1 } from "./sqlite-d1";
import { TEST_BRIDGE_ENVIRONMENT, TEST_PRODUCTION_ENVIRONMENT } from "./research-bridge-fixture";

type Target = "site" | "executor";
export type PrivateInterceptor = (request: Request, dispatch: () => Promise<Response>) => Promise<Response>;
const routes = {
  site: new Set(["begin", "accepted", "complete", "metadata", "maintenance", "outbox"]),
  executor: new Set(["submit", "status", "close", "result", "acknowledge"]),
};

function openDb(filename: string, now: () => number) {
  const db = new SqliteD1(filename);
  db.database.exec("PRAGMA foreign_keys = ON");
  db.database.function("unixepoch", { varargs: true }, (...args: unknown[]) => {
    if (args.length === 0) return Math.floor(now() / 1_000);
    if (args.length === 1 && args[0] === "subsec") return now() / 1_000;
    throw new Error("unexpected SQL clock use");
  });
  return db;
}

/** Only adapters for local HTTP, Workflow scheduling and clocks are synthetic. Business code is real. */
export async function createResearchPublicFixture(options: { publicOrigin?: string; wallNow?: number } = {}) {
  const parent = realpathSync(tmpdir());
  const directory = mkdtempSync(join(parent, "arc-public-integration-"));
  const siteFile = join(directory, "site.sqlite");
  const executorFile = join(directory, "executor.sqlite");
  const workflowFile = join(directory, "workflow.json");
  let wall = options.wallNow ?? Date.now();
  const publicOrigin = options.publicOrigin ?? TEST_BRIDGE_ENVIRONMENT.BETTER_AUTH_URL;
  let mono = 1_000;
  let monoBase = performance.now();
  const monoNow = () => mono + performance.now() - monoBase;
  let providerCalls = 0;
  let repairCalls = 0;
  let workflowCreates = 0;
  let providerCost = 0.1;
  let newCallsAllowed = true;
  let disposed = false;
  let siteDb!: SqliteD1;
  let keyReads = 0;
  let siteProviders = 0;
  let bridgeEnabled = true;
  let transitioning = false;
  let transition: Promise<void> | undefined;
  let disposal: Promise<void> | undefined;
  const pending = new Set<Promise<unknown>>();
  const track = <T>(work: () => Promise<T>): Promise<T> => {
    if (disposed || transitioning) return Promise.reject(new Error("fixture is not available"));
    const result = work(); pending.add(result);
    void result.finally(() => pending.delete(result)).catch(() => undefined);
    return result;
  };
  let executorDb!: SqliteD1;
  let simulator: Miniflare | undefined;
  const removeDirectory = () => {
    const owned = realpathSync(directory);
    const child = relative(parent, owned);
    if (!isAbsolute(owned) || child.includes(sep) || !child.startsWith("arc-public-integration-")
      || resolve(parent, child) !== owned) throw new Error("refusing cleanup outside owned temporary directory");
    rmSync(owned, { recursive: true, force: true });
  };
  const closeDatabases = () => {
    try { siteDb?.close(); } catch { /* A failed rebuild may already have closed this handle. */ }
    try { executorDb?.close(); } catch { /* A failed rebuild may already have closed this handle. */ }
  };
  try {
    siteDb = createResearchD1(siteFile);
    for (const owner of ["owner-a", "owner-b"]) seedUser(siteDb, owner);
    siteDb.database.prepare("INSERT INTO feature_flags (key,enabled,cohort_json) VALUES ('role-research-beta',1,?1)").run(JSON.stringify({ userIds: ["owner-a", "owner-b"] }));
    executorDb = openDb(executorFile, () => wall);
    for (const name of ["0000_research_bridge_nonces.sql", "0001_research_executor_jobs.sql",
      "0002_research_executor_results.sql", "0003_research_executor_maintenance.sql"]) {
      executorDb.database.exec(readFileSync(resolve(process.cwd(), "worker/research-executor/migrations", name), "utf8")
        .replaceAll("--> statement-breakpoint", ";"));
    }
    // Migration and users/cohort only; reopen through the same clock-aware path as recovery.
    siteDb.close();
    siteDb = openDb(siteFile, () => wall);
    writeFileSync(workflowFile, "{}", { flag: "wx" });
    const readWorkflows = (): Record<string, string> => JSON.parse(readFileSync(workflowFile, "utf8"));
    const connection = readResearchBridgeConnection(TEST_BRIDGE_ENVIRONMENT);
    if (!connection) throw new Error("synthetic bridge connection unavailable");
    let bucket!: R2Bucket;
    let siteHandler!: (request: Request) => Promise<Response>;
    let executorHandler!: (request: Request) => Promise<Response>;
    let siteClient!: SiteBridgeClient;
    let executorClient!: ExecutorBridgeClient;
    let research!: D1ResearchRepository;
    let executions!: D1SiteExecutionRepository;
    let budget!: D1ResearchBudgetRepository;
    let workflow!: Workflow<{ jobId: string }>;
    let factory!: ReturnType<typeof createResearchServiceFactory>;
    let siteEnvironment!: ResearchProductionEnvironment;
    const interceptors = new Map<string, PrivateInterceptor>();
    const traffic: Array<{ target: Target; operation: string; status: number; response: string }> = [];
    const transport = (target: Target): typeof fetch => async (input, init) => {
      const source = input instanceof Request && init === undefined ? input : new Request(input, init);
      const url = new URL(source.url);
      const prefix = target === "site" ? "/api/internal/research-bridge/" : "/internal/research-bridge/";
      const operation = url.pathname.slice(prefix.length);
      if (url.protocol !== "https:" || url.origin !== (target === "site" ? connection.siteOrigin : connection.executorOrigin)
        || !url.pathname.startsWith(prefix) || !routes[target].has(operation) || url.search || url.hash
        || url.username || url.password || source.method !== "POST") throw new Error("synthetic router rejected unknown outbound request");
      const request = new Request(source.url, { method: source.method, headers: source.headers,
        body: await source.arrayBuffer(), signal: source.signal, redirect: "manual" });
      const dispatch = async () => {
        if (request.signal.aborted) throw new DOMException("local transport cancelled", "AbortError");
        const result = await (target === "site" ? siteHandler : executorHandler)(request);
        const bytes = await result.arrayBuffer();
        traffic.push({ target, operation, status: result.status, response: new TextDecoder().decode(bytes) });
        return new Response(bytes, { status: result.status, headers: result.headers });
      };
      return interceptors.get(`${target}:${operation}`)?.(request, dispatch) ?? dispatch();
    };
    const siteFetch = transport("site");
    const executorFetch = transport("executor");
    const providerRequests: Array<Record<string, unknown>> = [];
    const providerFetch: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      if (request.url !== "https://openrouter.ai/api/v1/chat/completions" || request.method !== "POST") {
        throw new Error("synthetic router rejected outbound Provider request");
      }
      const body = await request.json() as Record<string, unknown>;
      providerRequests.push(body);
      if (body.model !== "moonshotai/kimi-k3") {
        repairCalls += 1;
        throw new Error("repair or unexpected model requested");
      }
      providerCalls += 1;
      return Response.json({ model: "moonshotai/kimi-k3", usage: { prompt_tokens: 100, completion_tokens: 200,
        total_tokens: 300, cost: providerCost, server_tool_use: { web_search_requests: 0 } }, choices: [{ finish_reason: "stop",
        message: { content: JSON.stringify(validResearchCandidate), annotations: validAnnotations.map((annotation) => ({
          type: annotation.type, url_citation: { url: annotation.url, title: annotation.title },
        })) } }] });
    };
    const environment = () => ({ ...TEST_BRIDGE_ENVIRONMENT, EXECUTOR_DB: executorDb as unknown as D1Database,
      EXECUTOR_RECEIPTS: bucket, RESEARCH_WORKFLOW: workflow,
      ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: newCallsAllowed ? "true" : "false", OPENROUTER_API_KEY: "synthetic-private-key" });
    const overrides = () => ({ bridgeFetch: siteFetch, providerFetch, wallNow: () => wall, monoNow });
    const rebuild = () => {
      // New adapter object; persisted fixture Workflow IDs survive independently of the runtime graph.
      workflow = {
        create: async ({ id }: { id: string }) => {
          workflowCreates += 1;
          const records = readWorkflows();
          if (records[id]) throw new Error("Workflow instance already exists");
          records[id] = "queued";
          writeFileSync(workflowFile, JSON.stringify(records));
          return { id };
        },
        get: async (id: string) => {
          if (!readWorkflows()[id]) throw new Error("Workflow instance absent");
          return { id, status: async () => ({ status: readWorkflows()[id] }) };
        },
      } as unknown as Workflow<{ jobId: string }>;
      research = new D1ResearchRepository(siteDb as unknown as D1Database, { now: () => wall });
      executions = new D1SiteExecutionRepository(siteDb as unknown as D1Database, research);
      budget = new D1ResearchBudgetRepository(siteDb as unknown as D1Database, { now: () => wall });
      siteEnvironment = { ...TEST_PRODUCTION_ENVIRONMENT,
        ARC_AI_RESEARCH_ENABLED: newCallsAllowed ? "true" : "false",
        ...(bridgeEnabled ? {} : { ARC_AI_RESEARCH_EXECUTOR_URL: undefined }) };
      Object.defineProperty(siteEnvironment, "OPENROUTER_API_KEY", { enumerable: true, get: () => { keyReads++; throw new Error("Site Provider key forbidden"); } });
      factory = createResearchServiceFactory({ environment: siteEnvironment, getD1: () => siteDb as unknown as D1Database,
        fetch: executorFetch, now: () => wall, monoNow, createProvider: () => { siteProviders++; throw new Error("Site Provider forbidden"); } });
      siteHandler = createProductionSiteBridgeHandler({ environment: siteEnvironment, getD1: () => siteDb as unknown as D1Database,
      fetch: executorFetch, wallNow: () => wall, monoNow });
      executorHandler = createExecutorBridgeHandler(createHttpRuntime(environment(), overrides()));
      executorClient = new ExecutorBridgeClient(new BridgeTransport({ connection,
        nonces: new D1BridgeNonceStore(siteDb as unknown as D1Database), fetch: executorFetch, wallNow: () => wall, monoNow }));
      siteClient = new SiteBridgeClient(new BridgeTransport({ connection,
        nonces: new D1BridgeNonceStore(executorDb as unknown as D1Database), fetch: siteFetch, wallNow: () => wall, monoNow }));
    };
    const startR2 = async () => {
      simulator = new Miniflare({ modules: true, script: "export default { fetch() { throw new Error('unexpected worker request') } }",
        compatibilityDate: "2026-05-15", cf: false, r2Buckets: ["RECEIPTS"], r2Persist: join(directory, "r2"),
        outboundService: () => { throw new Error("Miniflare unknown outbound request rejected"); } });
      bucket = await simulator.getR2Bucket("RECEIPTS") as unknown as R2Bucket;
    };
    await startR2();
    rebuild();
    return {
      directory, siteFile, executorFile, traffic, providerRequests, publicOrigin,
      get siteDb() { return siteDb; }, get executorDb() { return executorDb; },
      get siteClient() { return siteClient; }, get executorClient() { return executorClient; },
      get siteHandler() { return siteHandler; }, get executorHandler() { return executorHandler; },
      get research() { return research; }, get executions() { return executions; }, get budget() { return budget; },
      get bucket() { return bucket; },
      wallNow: () => wall, monoNow,
      dispatch: (request: Request, owner: string | null) => track(async () => {
        // Session is captured for this request, never inferred from public JSON or mutable harness state.
        const shared = {
          requireUser: (headers: Headers) => requireArcUser(headers, async () =>
            owner === "owner-a" || owner === "owner-b" ? { user: { id: owner, name: owner, email: owner + "@example.test" } } : null),
          rateLimiter: new D1RateLimiter(siteDb as unknown as D1Database, { now: () => wall }),
          recordEvent: new D1OperationalEventSink(siteDb as unknown as D1Database).record.bind(new D1OperationalEventSink(siteDb as unknown as D1Database)),
          now: () => wall,
        };
        const deps = { ...shared, createReadService: factory.createRecoveryService, createWriteService: factory.createNewCallService,
          cohortEnabled: factory.cohortEnabled, configuredOrigin: () => publicOrigin,
          deriveIpSubject: factory.deriveIpSubject, rateLimitPerMinute: factory.rateLimitPerMinute };
        const path = new URL(request.url).pathname;
        if (path === "/api/intelligence/research" && request.method === "POST") return createResearchStartHandler(deps)(request);
        if (path === "/api/intelligence/research/recover" && request.method === "POST") return createResearchRecoverHandler(deps)(request);
        if (path === "/api/intelligence/research/eligibility" && request.method === "GET") return createResearchEligibilityHandler({ ...shared,
          configured: () => readResearchProductionConfiguration(siteEnvironment) !== null, cohortEnabled: factory.cohortEnabled })(request);
        const match = /^\/api\/intelligence\/research\/([a-z0-9-]+)(\/retry)?$/u.exec(path);
        if (match && request.method === (match[2] ? "POST" : "GET")) return (match[2]
          ? createResearchRetryHandler(deps, match[1]) : createResearchGetHandler(deps, match[1]))(request);
        return Response.json({ error: "Unknown fixture route" }, { status: 404 });
      }),
      request: (path: string, input?: unknown) => new Request(new URL(path, publicOrigin), { method: input === undefined ? "GET" : "POST",
        headers: { origin: publicOrigin, "sec-fetch-site": "same-origin", "content-type": "application/json", "cf-connecting-ip": "127.0.0.1" },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }) }),
      ownedJob: async (owner: string, runId: string) => {
        const run = await research.getRun(owner, runId);
        if (!run) throw new Error("Owned public run not found");
        const execution = await executions.read(owner, runId);
        if (!execution) throw new Error("Owned execution not found");
        return execution;
      },
      businessCounts: (): Record<string, number> => ({
        ...Object.fromEntries(["research_runs", "research_site_executions", "research_site_acceptances", "research_site_imports", "ai_budget_reservations", "ai_runs", "research_packages", "career_goals", "planning_workspaces", "daily_units"]
          .map(table => [table, (siteDb.database.prepare("SELECT count(*) n FROM " + table).get() as { n: number }).n])),
        ...Object.fromEntries(["research_executor_jobs", "research_executor_results"].map(table => [table, (executorDb.database.prepare("SELECT count(*) n FROM " + table).get() as { n: number }).n])),
      }),
      collectionCursors: () => ({ site: siteDb.database.prepare("SELECT * FROM research_site_scan_cursors ORDER BY name").all(),
        executor: executorDb.database.prepare("SELECT * FROM research_executor_maintenance_cursors ORDER BY category").all() }),
      runWorkflowBody: (jobId: string) => track(async () => {
        const records = readWorkflows();
        if (!records[jobId]) throw new Error("Only an existing durable Workflow may run");
        records[jobId] = "running"; writeFileSync(workflowFile, JSON.stringify(records));
        try {
          const result = await runResearchJob(jobId, createExecutionRuntime(environment(), overrides()));
          const current = readWorkflows(); current[jobId] = "complete"; writeFileSync(workflowFile, JSON.stringify(current));
          return result;
        } catch (error) {
          const current = readWorkflows(); current[jobId] = "errored"; writeFileSync(workflowFile, JSON.stringify(current));
          throw error;
        }
      }),
      runCron: () => track(() => runExecutorMaintenance(createMaintenanceRuntime(environment(), overrides()))),
      siteKeyReads: () => keyReads, siteProviderCreates: () => siteProviders,
      syntheticProviderCalls: () => providerCalls, repairCalls: () => repairCalls,
      workflowCreates: () => workflowCreates, workflowRecords: readWorkflows,
      setWorkflowStatus: (jobId: string, status: string) => {
        const records = readWorkflows();
        if (!records[jobId]) throw new Error("missing durable Workflow");
        records[jobId] = status;
        writeFileSync(workflowFile, JSON.stringify(records));
      },
      setProviderCost: (cost: number) => { providerCost = cost; },
      setInterceptor: (target: Target, operation: string, interceptor: PrivateInterceptor | null) => {
        if (!routes[target].has(operation)) throw new Error("unknown fixture route");
        if (interceptor) interceptors.set(`${target}:${operation}`, interceptor);
        else interceptors.delete(`${target}:${operation}`);
      },
      setNewCallsAllowed: (value: boolean) => { newCallsAllowed = value; rebuild(); },
      setBridgeEnabled: (value: boolean) => { bridgeEnabled = value; rebuild(); },
      setWallNow: (value: number) => { wall = value; },
      setMonoNow: (value: number) => { mono = value; monoBase = performance.now(); },
      localFetch: (target: Target, request: Request) => transport(target)(request),
      reopen: () => {
        if (disposed || transitioning) throw new Error("fixture transition already active");
        transitioning = true;
        transition = (async () => {
          await Promise.allSettled([...pending]);
          closeDatabases();
          await simulator!.dispose();
          siteDb = openDb(siteFile, () => wall);
          executorDb = openDb(executorFile, () => wall);
          await startR2();
          rebuild();
        })().finally(() => { transitioning = false; });
        return transition;
      },
      dispose: () => {
        if (disposal) return disposal;
        disposed = true;
        disposal = (async () => {
          await transition?.catch(() => undefined);
          await Promise.allSettled([...pending]);
          closeDatabases();
          await simulator?.dispose();
          removeDirectory();
        })();
        return disposal;
      },
    };
  } catch (error) {
    closeDatabases();
    await simulator?.dispose();
    removeDirectory();
    throw error;
  }
}
