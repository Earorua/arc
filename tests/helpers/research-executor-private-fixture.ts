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
import { createSiteAdmissionFixture } from "./site-admission-fixture";
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
export async function createResearchExecutorPrivateFixture() {
  const parent = realpathSync(tmpdir());
  const directory = mkdtempSync(join(parent, "arc-private-integration-"));
  const siteFile = join(directory, "site.sqlite");
  const executorFile = join(directory, "executor.sqlite");
  const workflowFile = join(directory, "workflow.json");
  let wall = Date.parse("2026-09-15T12:00:00.000Z");
  let mono = 1_000;
  let monoBase = performance.now();
  const monoNow = () => mono + performance.now() - monoBase;
  let providerCalls = 0;
  let repairCalls = 0;
  let workflowCreates = 0;
  let providerCost = 0.1;
  let newCallsAllowed = true;
  let disposed = false;
  const initial = createSiteAdmissionFixture(siteFile);
  let siteDb = initial.db;
  let executorDb = openDb(executorFile, () => wall);
  let simulator: Miniflare | undefined;
  const removeDirectory = () => {
    const owned = realpathSync(directory);
    const child = relative(parent, owned);
    if (!isAbsolute(owned) || child.includes(sep) || !child.startsWith("arc-private-integration-")
      || resolve(parent, child) !== owned) throw new Error("refusing cleanup outside owned temporary directory");
    rmSync(owned, { recursive: true, force: true });
  };
  try {
    for (const name of ["0000_research_bridge_nonces.sql", "0001_research_executor_jobs.sql",
      "0002_research_executor_results.sql", "0003_research_executor_maintenance.sql"]) {
      executorDb.database.exec(readFileSync(resolve(process.cwd(), "worker/research-executor/migrations", name), "utf8")
        .replaceAll("--> statement-breakpoint", ";"));
    }
    const created = await initial.createRemote();
    const admitted = await initial.coordinator.admitNew({ ownerId: created.execution.ownerId, runId: created.execution.runId,
      requestId: created.execution.requestId, jobId: created.execution.jobId, requestHash: created.execution.requestHash },
    { newCallsAllowed: true, cohortEnabled: true, rateAllowed: true });
    const execution = admitted.execution;
    const identity = { ownerId: execution.ownerId, runId: execution.runId, requestId: execution.requestId,
      jobId: execution.jobId, requestHash: execution.requestHash };
    // Close the seeded graph once, then use the same open-only path used by all subsequent restarts.
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
      siteHandler = createProductionSiteBridgeHandler({ environment: { ...TEST_PRODUCTION_ENVIRONMENT,
        ARC_AI_RESEARCH_ENABLED: newCallsAllowed ? "true" : "false" }, getD1: () => siteDb as unknown as D1Database,
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
      directory, siteFile, executorFile, execution, identity, traffic, providerRequests,
      get siteDb() { return siteDb; }, get executorDb() { return executorDb; },
      get siteClient() { return siteClient; }, get executorClient() { return executorClient; },
      get siteHandler() { return siteHandler; }, get executorHandler() { return executorHandler; },
      get research() { return research; }, get executions() { return executions; }, get budget() { return budget; },
      get bucket() { return bucket; },
      wallNow: () => wall, monoNow,
      runWorkflowBody: (jobId: string) => runResearchJob(jobId, createExecutionRuntime(environment(), overrides())),
      runCron: () => runExecutorMaintenance(createMaintenanceRuntime(environment(), overrides())),
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
      setWallNow: (value: number) => { wall = value; },
      setMonoNow: (value: number) => { mono = value; monoBase = performance.now(); },
      localFetch: (target: Target, request: Request) => transport(target)(request),
      reopen: async () => {
        siteDb.close();
        executorDb.close();
        await simulator!.dispose();
        siteDb = openDb(siteFile, () => wall);
        executorDb = openDb(executorFile, () => wall);
        await startR2();
        rebuild();
      },
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        siteDb.close();
        executorDb.close();
        await simulator!.dispose();
        removeDirectory();
      },
    };
  } catch (error) {
    try { siteDb.close(); } catch { /* initialization may already have closed this handle */ }
    try { executorDb.close(); } catch { /* initialization may already have closed this handle */ }
    await simulator?.dispose();
    removeDirectory();
    throw error;
  }
}
