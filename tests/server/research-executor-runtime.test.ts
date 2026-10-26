// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../../app/server/research/execution-policy";
import { BRIDGE_AUTH_PROTOCOL, signBridgeMessage } from "../../app/server/research/executor/auth";
import { parseBridgeBeginReply } from "../../app/server/research/executor/begin";
import { BRIDGE_BODY_LIMITS } from "../../app/server/research/executor/body";
import { encodeBridgeDto } from "../../app/server/research/executor/bridge-contract";
import { CLOSED_PREFLIGHT_JOB_ID, parseClosedPreflightReply } from "../../app/server/research/executor/closed-preflight";
import { readResearchBridgeConnection } from "../../app/server/research/executor/connection-config";
import { D1BridgeNonceStore } from "../../app/server/research/executor/d1-nonce-store";
import { ExecutorBridgeClient } from "../../app/server/research/executor/executor-client";
import { BridgeTransport, BridgeTransportError } from "../../app/server/research/executor/http-transport";
import { BRIDGE_EXECUTOR_MODE, BRIDGE_QUEUE_TTL_MS, hashBridgeJob, parseBridgeJob } from "../../app/server/research/executor/job";
import { encodeBridgeProviderReceipt, parseBridgeProviderReceipt,
  summarizeBridgeProviderReceipt } from "../../app/server/research/executor/receipt";
import { OpenRouterResearchProvider } from "../../app/server/research/openrouter-provider";
import { ResearchProviderError } from "../../app/server/research/provider";
import { createProductionSiteBridgeHandler } from "../../app/server/research/site-bridge-factory";
import { ensureWorkflow } from "../../worker/research-executor/bootstrap";
import { D1BridgeJobStore } from "../../worker/research-executor/d1-job-store";
import { runResearchJob } from "../../worker/research-executor/execute-job";
import { createExecutorBridgeHandler, type ExecutorHttpRuntime } from "../../worker/research-executor/http-routes";
import { ExecutorReceiptStore } from "../../worker/research-executor/receipt-store";
import { createExecutionRuntime, createHttpRuntime } from "../../worker/research-executor/runtime";
import { PAID_STEP_CONFIG } from "../../worker/research-executor/workflow-policy";
import { SiteBridgeClient } from "../../worker/research-executor/site-client";
import { validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createResearchBridgeFixture, TEST_BRIDGE_ENVIRONMENT } from "../helpers/research-bridge-fixture";
import { validReceipt } from "../helpers/site-import-fixture";
import { SqliteD1 } from "../helpers/sqlite-d1";

const BASE_TIME = 1_800_000_000_000;
const JOB_ID = "11111111-1111-4111-8111-111111111111";

describe("workflow RPC reference boundary", () => {
  async function boundary() {
    const delivery = vi.fn().mockResolvedValue(undefined);
    vi.doMock("cloudflare:workers", () => ({ WorkflowEntrypoint: class {} }));
    vi.doMock("../../worker/research-executor/runtime", () => ({
      createExecutionRuntime: () => ({}), createMaintenanceRuntime: () => ({ delivery }),
    }));
    vi.resetModules();
    const { ResearchWorkflow } = await import("../../worker/research-executor/workflow");
    const instance = new ResearchWorkflow({} as ExecutionContext, {} as never);
    return { delivery, run: (value: unknown) => instance.run({ payload: { jobId: JOB_ID },
      instanceId: JOB_ID, timestamp: new Date(), workflowName: "ResearchWorkflow" },
    { do: vi.fn().mockResolvedValue(value) } as never) };
  }
  afterEach(() => {
    vi.doUnmock("../../worker/research-executor/runtime");
    vi.doUnmock("cloudflare:workers");
    vi.resetModules();
  });
  const reference = () => ({ jobId: JOB_ID, state: "recorded", receiptHash: "a".repeat(64) });

  it.each(["plain", "frozen", "native-disposer"])("copies %s to a fresh frozen primitive reference", async (kind) => {
    const { run, delivery } = await boundary();
    const value = reference();
    const dispose = vi.fn(function (this: unknown) { expect(this).toBe(value); expect(delivery).not.toHaveBeenCalled(); });
    if (kind === "frozen") Object.freeze(value);
    if (kind === "native-disposer") Object.defineProperty(value, Symbol.dispose,
      { value: dispose, enumerable: false, writable: true, configurable: true });
    const result = await run(value);
    expect(result).toEqual(reference());
    expect(result).not.toBe(value);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Reflect.ownKeys(result).sort()).toEqual(["jobId", "receiptHash", "state"]);
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(4_096);
    expect(dispose).toHaveBeenCalledTimes(kind === "native-disposer" ? 1 : 0);
    expect(delivery).toHaveBeenCalledOnce();
  });

  it("preserves all permitted states and recorded null without maintenance", async () => {
    const { run, delivery } = await boundary();
    for (const state of ["recorded", "already-claimed", "closed", "unavailable"]) {
      const value = { ...reference(), state, receiptHash: null };
      expect(await run(value)).toEqual(value);
    }
    expect(delivery).not.toHaveBeenCalled();
  });

  it("rejects invalid shapes and primitive fields without invoking getters or coercion", async () => {
    const { run, delivery } = await boundary();
    const executed = vi.fn(() => "a".repeat(64));
    const getter = reference();
    Object.defineProperty(getter, "receiptHash", { enumerable: true, get: executed });
    const hidden = Object.defineProperty(reference(), "secret", { value: 1 });
    const hiddenField = Object.defineProperty(reference(), "receiptHash", { value: null, enumerable: false });
    const toJSON = Object.defineProperty(reference(), "toJSON", { value: executed });
    const cyclic = { ...reference(), receiptHash: {} as Record<string, unknown> };
    cyclic.receiptHash.self = cyclic;
    const invalid: unknown[] = [null, 1, [], Object.create(null), { ...reference(), extra: 1 }, hidden,
      hiddenField, getter, toJSON, cyclic, { ...reference(), jobId: "wrong" },
      { ...reference(), state: "wrong" }, { ...reference(), receiptHash: "A".repeat(64) },
      { ...reference(), receiptHash: "a".repeat(63) }, { ...reference(), receiptHash: undefined },
      { ...reference(), state: "closed" }, { ...reference(), state: "unavailable" },
      { ...reference(), state: "already-claimed" },
      { ...reference(), receiptHash: new String("a".repeat(64)) },
      { ...reference(), receiptHash: { toString: executed, toJSON: executed } },
      { ...reference(), receiptHash: BigInt(1) }, { ...reference(), state: new String("recorded") },
      { ...reference(), jobId: new String(JOB_ID) }];
    for (const value of invalid) await expect(run(value)).rejects.toThrow("Research workflow unavailable");
    expect(executed).not.toHaveBeenCalled();
    expect(delivery).not.toHaveBeenCalled();
  });

  it("only permits the exact native disposal symbol and descriptor", async () => {
    const { run, delivery } = await boundary();
    const dispose = vi.fn();
    const base = { value: dispose, enumerable: false, writable: true, configurable: true };
    const variants: Array<[symbol, PropertyDescriptor]> = [
      [Symbol("Symbol.dispose"), base], [Symbol.asyncDispose, base],
      [Symbol.dispose, { ...base, enumerable: true }], [Symbol.dispose, { ...base, writable: false }],
      [Symbol.dispose, { ...base, configurable: false }], [Symbol.dispose, { ...base, value: 1 }],
      [Symbol.dispose, { get: dispose, configurable: true }],
    ];
    for (const [symbol, descriptor] of variants) {
      await expect(run(Object.defineProperty(reference(), symbol, descriptor))).rejects.toThrow("Research workflow unavailable");
    }
    const extra = Object.defineProperty(reference(), Symbol.dispose, base);
    Object.defineProperty(extra, Symbol("extra"), base);
    await expect(run(extra)).rejects.toThrow("Research workflow unavailable");
    const invalid = Object.defineProperty({ ...reference(), jobId: "wrong" }, Symbol.dispose, base);
    await expect(run(invalid)).rejects.toThrow("Research workflow unavailable");
    expect(dispose).not.toHaveBeenCalled();
    expect(delivery).not.toHaveBeenCalled();
  });

  it("sanitizes a throwing disposer before maintenance", async () => {
    const { run, delivery } = await boundary();
    const dispose = vi.fn(() => { throw new Error("private details"); });
    const value = Object.defineProperty(reference(), Symbol.dispose,
      { value: dispose, enumerable: false, writable: true, configurable: true });
    await expect(run(value)).rejects.toThrow(/^Research workflow unavailable$/u);
    expect(dispose).toHaveBeenCalledOnce();
    expect(delivery).not.toHaveBeenCalled();
  });
});

function job(overrides: Record<string, unknown> = {}) {
  return parseBridgeJob({
    protocol: BRIDGE_AUTH_PROTOCOL,
    executor: BRIDGE_EXECUTOR_MODE,
    jobId: JOB_ID,
    runId: "research-run-1",
    requestId: "request-1",
    inputFingerprint: `p2-${"1".repeat(32)}`,
    configFingerprint: `p2-${"2".repeat(32)}`,
    policyId: KIMI_RESEARCH_EXECUTION_POLICY.profileId,
    role: "Frontend Engineer",
    locale: "en-US",
    createdAt: BASE_TIME,
    queueExpiresAt: BASE_TIME + BRIDGE_QUEUE_TTL_MS,
    ...overrides,
  });
}

const simulators: Miniflare[] = [];

function migration(name: string): string {
  return readFileSync(resolve(process.cwd(), "worker/research-executor/migrations", name), "utf8")
    .replaceAll("--> statement-breakpoint", ";");
}

function createExecutorDb(): SqliteD1 {
  const db = new SqliteD1(":memory:");
  db.database.exec("PRAGMA foreign_keys = ON");
  for (const name of ["0000_research_bridge_nonces.sql", "0001_research_executor_jobs.sql",
    "0002_research_executor_results.sql", "0003_research_executor_maintenance.sql"]) db.database.exec(migration(name));
  return db;
}

async function createBucket(): Promise<R2Bucket> {
  const simulator = new Miniflare({ modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    compatibilityDate: "2026-05-15", cf: false, r2Buckets: ["RECEIPTS"] });
  simulators.push(simulator);
  const bucket = await simulator.getR2Bucket("RECEIPTS");
  return {
    get: ((key: string, options?: R2GetOptions) => options === undefined
      ? bucket.get(key) : bucket.get(key, options as never)) as R2Bucket["get"],
    put: ((key: string, value: Parameters<R2Bucket["put"]>[1], options?: R2PutOptions) => options === undefined
      ? bucket.put(key, value as never) : bucket.put(key, value as never, options as never)) as R2Bucket["put"],
    delete: ((keys: string | string[]) => bucket.delete(keys)) as R2Bucket["delete"],
  } as R2Bucket;
}

async function grantFor(value: ReturnType<typeof job>) {
  return {
    protocol: BRIDGE_AUTH_PROTOCOL,
    jobId: value.jobId,
    requestHash: await hashBridgeJob(value),
    beganAt: BASE_TIME + 10,
    executionExpiresAt: BASE_TIME + 10 + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
  } as const;
}

async function replyFor(value: ReturnType<typeof job>, remainingMs: number = KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs) {
  return parseBridgeBeginReply({ grant: await grantFor(value),
    observedAt: BASE_TIME + 10 + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs - remainingMs, remainingMs });
}

function providerResult() {
  return { content: JSON.stringify(validResearchCandidate), candidate: validResearchCandidate, annotations: [],
    actualModel: "moonshotai/kimi-k3", usage: { promptTokens: 10, completionTokens: 20,
      totalTokens: 30, costMicros: 1, webSearchRequests: 2 } } as const;
}

function interceptRun(db: SqliteD1, fragment: string, timing: "before" | "after"): Pick<D1Database, "prepare"> {
  let armed = true;
  return { prepare(sql: string) {
    const statement = db.prepare(sql);
    return { bind(...values: unknown[]) {
      const bound = statement.bind(...values);
      return {
        first: <T>(column?: string) => column === undefined ? bound.first<T>() : bound.first<T>(column),
        async run() {
          if (armed && timing === "before" && sql.includes(fragment)) {
            armed = false;
            throw new Error("synthetic-private-before-commit");
          }
          const result = await bound.run();
          if (armed && timing === "after" && sql.includes(fragment)) {
            armed = false;
            throw new Error("synthetic-private-lost-ack");
          }
          return result;
        },
      } as D1PreparedStatement;
    } } as D1PreparedStatement;
  } };
}

async function signedRequest(operation: "close" | "result" | "status" | "submit", value: ReturnType<typeof job>, body: Uint8Array) {
  const connection = readResearchBridgeConnection(TEST_BRIDGE_ENVIRONMENT)!;
  const path = `/internal/research-bridge/${operation}`;
  const headers = await signBridgeMessage({ context: { direction: "site-to-executor", kind: "request",
    method: "POST", path, audience: connection.executorOrigin, jobId: value.jobId, status: null }, body,
  keyId: connection.siteToExecutor.keyId, keyBytes: connection.siteToExecutor.copyKeyBytes(), now: () => BASE_TIME });
  headers.set("x-arc-bridge-job-id", value.jobId);
  const requestBody = new Uint8Array(body).buffer as ArrayBuffer;
  return new Request(`${connection.executorOrigin}${path}`, { method: "POST", headers, body: requestBody });
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  const settled = await Promise.allSettled(simulators.splice(0).map((simulator) => simulator.dispose()));
  const rejected = settled.find((result) => result.status === "rejected");
  if (rejected?.status === "rejected") throw rejected.reason;
});

describe("HTTP maintenance stop", () => {
  async function harness(maintenance: string | undefined = "false") {
    const executorDb = createExecutorDb();
    const clientDb = createExecutorDb();
    const workflow = { create: vi.fn(), get: vi.fn() };
    const bridgeFetch = vi.fn<typeof fetch>(async () => { throw new Error("unexpected Site call"); });
    const environment = { ...TEST_BRIDGE_ENVIRONMENT, EXECUTOR_DB: executorDb as unknown as D1Database,
      EXECUTOR_RECEIPTS: await createBucket(), RESEARCH_WORKFLOW: workflow as never,
      ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "true", ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED: maintenance,
      get OPENROUTER_API_KEY(): never { throw new Error("unexpected Provider credential access"); } };
    const runtime = createHttpRuntime(environment, { wallNow: () => BASE_TIME + 4, monoNow: () => 1_000, bridgeFetch });
    const client = new ExecutorBridgeClient(new BridgeTransport({ connection: runtime.connection,
      nonces: new D1BridgeNonceStore(clientDb), fetch: createExecutorBridgeHandler(runtime),
      wallNow: () => BASE_TIME + 4, monoNow: () => 1_000 }));
    return { executorDb, clientDb, runtime, client, workflow, bridgeFetch,
      dispose: () => { executorDb.close(); clientDb.close(); } };
  }

  it("overrides admission in both root and request runtimes and rejects unknown signed submits", async () => {
    const f = await harness();
    try {
      expect(f.runtime).toMatchObject({ maintenanceEnabled: false, acceptNew: false });
      expect(f.runtime.forRequest(() => undefined, new AbortController().signal))
        .toMatchObject({ maintenanceEnabled: false, acceptNew: false });
      await expect(f.client.submit(job())).rejects.toMatchObject({ kind: "closed" });
      expect(await f.runtime.jobs.get(JOB_ID)).toBeNull();
      expect(f.workflow.create).not.toHaveBeenCalled();
      expect(f.workflow.get).not.toHaveBeenCalled();
      expect(f.bridgeFetch).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("returns the exact persisted accepted proof without repeating bootstrap or Site acceptance", async () => {
    const f = await harness();
    try {
      const value = job();
      await f.runtime.jobs.accept(value, BASE_TIME);
      const stored = await f.runtime.jobs.recordWorkflowAccepted(value, value.jobId, BASE_TIME + 1);
      const accept = vi.spyOn(D1BridgeJobStore.prototype, "accept");
      await expect(f.client.submit(value)).resolves.toEqual({ jobId: value.jobId,
        requestHash: stored.requestHash, workflowId: value.jobId, workflowAcceptedAt: BASE_TIME + 1 });
      expect(accept).not.toHaveBeenCalled();
      expect(f.workflow.create).not.toHaveBeenCalled();
      expect(f.workflow.get).not.toHaveBeenCalled();
      expect(f.bridgeFetch).not.toHaveBeenCalled();
      expect(await f.runtime.jobs.get(value.jobId)).toEqual(stored);
    } finally { f.dispose(); }
  });

  it("returns signed temporary for matching unaccepted work without bootstrapping or closing it", async () => {
    const f = await harness();
    try {
      const value = job();
      const before = await f.runtime.jobs.accept(value, BASE_TIME);
      const accept = vi.spyOn(D1BridgeJobStore.prototype, "accept");
      await expect(f.client.submit(value)).rejects.toMatchObject({ kind: "temporary" });
      expect(accept).not.toHaveBeenCalled();
      expect(await f.runtime.jobs.get(value.jobId)).toEqual(before);
      expect(f.workflow.create).not.toHaveBeenCalled();
      expect(f.workflow.get).not.toHaveBeenCalled();
      expect(f.bridgeFetch).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it("keeps signed conflicts ahead of stopped existing-submit recovery", async () => {
    const f = await harness();
    try {
      const value = job();
      await f.runtime.jobs.accept(value, BASE_TIME);
      await f.runtime.jobs.recordWorkflowAccepted(value, value.jobId, BASE_TIME + 1);
      await expect(f.client.submit(job({ role: "Different Engineer" }))).rejects.toMatchObject({ kind: "conflict" });
      expect(f.workflow.create).not.toHaveBeenCalled();
      expect(f.bridgeFetch).not.toHaveBeenCalled();
    } finally { f.dispose(); }
  });

  it.each([undefined, "true"])("retains signed existing-submit bootstrap with admission closed and mode %j", async maintenance => {
    const fixture = await createResearchBridgeFixture();
    const executorDb = createExecutorDb();
    const clientDb = createExecutorDb();
    const value = fixture.execution.job;
    const workflow = { create: vi.fn(async () => ({ id: value.jobId })), get: vi.fn() };
    const bridgeFetch = vi.fn<typeof fetch>(async (input, init) => fixture.handler(
      input instanceof Request && init === undefined ? input : new Request(input, init)));
    try {
      const runtime = createHttpRuntime({ ...TEST_BRIDGE_ENVIRONMENT,
        EXECUTOR_DB: executorDb as unknown as D1Database, EXECUTOR_RECEIPTS: await createBucket(),
        RESEARCH_WORKFLOW: workflow as never, ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "false",
        ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED: maintenance },
      { bridgeFetch, wallNow: fixture.wallNow, monoNow: fixture.monoNow });
      await runtime.jobs.accept(value, fixture.wallNow());
      const client = new ExecutorBridgeClient(new BridgeTransport({ connection: runtime.connection,
        nonces: new D1BridgeNonceStore(clientDb), fetch: createExecutorBridgeHandler(runtime),
        wallNow: fixture.wallNow, monoNow: fixture.monoNow }));
      const proof = await client.submit(value);
      expect(proof.workflowId).toBe(value.jobId);
      expect(workflow.create).toHaveBeenCalledOnce();
      expect(await fixture.bridge.readAcceptance(fixture.identity)).toEqual(proof);
      expect(runtime).toMatchObject({ maintenanceEnabled: true, acceptNew: false });
      expect(runtime.forRequest(() => undefined, new AbortController().signal))
        .toMatchObject({ maintenanceEnabled: true, acceptNew: false });
    } finally { executorDb.close(); clientDb.close(); fixture.db.close(); fixture.clientDb.close(); }
  });
});

describe("research executor runtime", () => {
  it("uses the production zero-retry 21 minute paid-step policy", () => {
    expect(PAID_STEP_CONFIG).toEqual({ retries: { limit: 0, delay: "1 second" }, timeout: "21 minutes" });
    expect(Object.isFrozen(PAID_STEP_CONFIG)).toBe(true);
  });

  it("creates and durably records only the job-id workflow before Site acceptance", async () => {
    const value = job();
    const stored = { job: value, requestHash: "a".repeat(64), acceptedAt: BASE_TIME,
      workflowAcceptedAt: null, grant: null, dispatchState: "unclaimed", dispatchAt: null } as const;
    const accepted = { ...stored, workflowAcceptedAt: BASE_TIME + 1 };
    const jobs = {
      accept: vi.fn().mockResolvedValue(stored),
      recordWorkflowAccepted: vi.fn().mockResolvedValue(accepted),
    };
    const workflow = {
      create: vi.fn().mockResolvedValue({ id: JOB_ID, status: vi.fn() }),
      get: vi.fn(),
    };
    const site = { accepted: vi.fn(async (_job, proof) => proof) };

    const proof = await ensureWorkflow(value, { jobs, workflow, site, wallNow: () => BASE_TIME + 1 });

    expect(workflow.create).toHaveBeenCalledWith({ id: JOB_ID, params: { jobId: JOB_ID } });
    expect(jobs.recordWorkflowAccepted).toHaveBeenCalledWith(value, JOB_ID, BASE_TIME + 1);
    expect(site.accepted).toHaveBeenCalledWith(value, proof);
    expect(proof).toEqual({ jobId: JOB_ID, requestHash: "a".repeat(64), workflowId: JOB_ID,
      workflowAcceptedAt: BASE_TIME + 1 });
  });

  it("recovers a lost create acknowledgement only through the same workflow instance", async () => {
    const db = createExecutorDb();
    const value = job();
    const jobs = new D1BridgeJobStore(db);
    const status = vi.fn().mockResolvedValue({ status: "complete" });
    const workflow = { create: vi.fn().mockRejectedValue(new Error("lost acknowledgement")),
      get: vi.fn().mockResolvedValue({ id: value.jobId, status }) };
    const site = { accepted: vi.fn(async (_job, proof) => proof) };

    const proof = await ensureWorkflow(value, { jobs, workflow: workflow as never, site: site as never,
      wallNow: () => BASE_TIME + 1 });

    expect(workflow.get).toHaveBeenCalledWith(value.jobId);
    expect(status).toHaveBeenCalledOnce();
    expect(site.accepted).toHaveBeenCalledWith(value, proof);
    expect((await jobs.get(value.jobId))?.workflowAcceptedAt).toBe(BASE_TIME + 1);
    db.close();
  });

  it("passes the outer request abort signal to Site acceptance", async () => {
    const value = job();
    const stored = { job: value, requestHash: await hashBridgeJob(value), acceptedAt: BASE_TIME,
      workflowAcceptedAt: BASE_TIME + 1, grant: null, dispatchState: "unclaimed", dispatchAt: null } as const;
    const site = { accepted: vi.fn(async (_job, proof) => proof) };
    const controller = new AbortController();

    await ensureWorkflow(value, { jobs: { accept: vi.fn().mockResolvedValue(stored),
      recordWorkflowAccepted: vi.fn() }, workflow: { create: vi.fn(), get: vi.fn() }, site,
    wallNow: () => BASE_TIME + 1, signal: controller.signal } as never);

    expect(site.accepted).toHaveBeenCalledWith(value, expect.objectContaining({ jobId: value.jobId }),
      { signal: controller.signal });
  });

  it("uses the accepted immutable job after caller mutation and conflicts on same-id different content", async () => {
    const db = createExecutorDb();
    const jobs = new D1BridgeJobStore(db);
    const mutable = { ...job() } as ReturnType<typeof job> & { role: string };
    const workflow = { create: vi.fn(async ({ id }: { id: string }) => ({ id, status: vi.fn() })), get: vi.fn() };
    const site = { accepted: vi.fn(async (_job, proof) => proof) };
    const pending = ensureWorkflow(mutable, { jobs, workflow: workflow as never, site: site as never,
      wallNow: () => BASE_TIME + 1 });
    mutable.role = "Mutated role";
    await pending;

    expect(workflow.create).toHaveBeenCalledWith({ id: JOB_ID, params: { jobId: JOB_ID } });
    expect(site.accepted.mock.calls[0]![0].role).toBe("Frontend Engineer");
    await expect(ensureWorkflow(job({ role: "Different Engineer" }), { jobs,
      workflow: workflow as never, site: site as never, wallNow: () => BASE_TIME + 2 }))
      .rejects.toMatchObject({ code: "conflict" });
    expect(workflow.create).toHaveBeenCalledOnce();
    db.close();
  });

  it("does not start create or Site acceptance after the shared bootstrap deadline expires", async () => {
    const value = job();
    let release!: (stored: unknown) => void;
    let expired = false;
    const accepted = new Promise((resolve) => { release = resolve; });
    const jobs = { accept: vi.fn(() => accepted), recordWorkflowAccepted: vi.fn() };
    const workflow = { create: vi.fn(), get: vi.fn() };
    const site = { accepted: vi.fn() };
    const pending = ensureWorkflow(value, { jobs: jobs as never, workflow: workflow as never,
      site: site as never, wallNow: () => BASE_TIME, guard: () => { if (expired) throw new Error("expired"); } });
    expired = true;
    release({ job: value, requestHash: await hashBridgeJob(value), acceptedAt: BASE_TIME,
      workflowAcceptedAt: null, grant: null, dispatchState: "unclaimed", dispatchAt: null });

    await expect(pending).rejects.toThrow("expired");
    expect(workflow.create).not.toHaveBeenCalled();
    expect(jobs.recordWorkflowAccepted).not.toHaveBeenCalled();
    expect(site.accepted).not.toHaveBeenCalled();
  });

  it("lets one real SQLite CAS winner make one actual fixed OpenRouter request", async () => {
    const db = createExecutorDb();
    const value = job();
    const jobs = new D1BridgeJobStore(db);
    await jobs.accept(value, BASE_TIME);
    const bucket = await createBucket();
    const receipts = new ExecutorReceiptStore(db, bucket);
    const grant = { protocol: BRIDGE_AUTH_PROTOCOL, jobId: value.jobId,
      requestHash: await hashBridgeJob(value), beganAt: BASE_TIME + 10,
      executionExpiresAt: BASE_TIME + 10 + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs } as const;
    const site = { begin: vi.fn(async () => parseBridgeBeginReply({ grant,
      observedAt: BASE_TIME + 10, remainingMs: KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs })) };
    const providerFetch = vi.fn<typeof fetch>(async () => Response.json({
      model: "moonshotai/kimi-k3", usage: { prompt_tokens: 10, completion_tokens: 20,
        total_tokens: 30, cost: 0.000001, server_tool_use: { web_search_requests: 2 } },
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(validResearchCandidate), annotations: [] } }],
    }));
    const provider = new OpenRouterResearchProvider({ OPENROUTER_API_KEY: "synthetic-executor-key",
      ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3", researchProfile: "kimi-low-output32k-v3",
      researchTimeoutMs: 1_200_000 }, { fetch: providerFetch });
    const repair = vi.spyOn(provider, "repair");
    const dependencies = { jobs, receipts, site, provider, wallNow: () => BASE_TIME + 20, monoNow: () => 1_000 };

    const outcomes = await Promise.all([
      runResearchJob(value.jobId, dependencies), runResearchJob(value.jobId, dependencies),
    ]);

    expect(outcomes.map((entry) => entry.state).sort()).toEqual(["already-claimed", "recorded"]);
    expect(providerFetch).toHaveBeenCalledOnce();
    expect(repair).not.toHaveBeenCalled();
    expect(JSON.parse(providerFetch.mock.calls[0]![1]!.body as string)).toMatchObject({
      model: "moonshotai/kimi-k3", reasoning: { effort: "low" }, max_tokens: 32_768,
      max_tool_calls: 10, provider: { require_parameters: true, data_collection: "deny", zdr: true },
      tools: [{ type: "openrouter:web_search", parameters: { engine: "exa", mode: "fast",
        max_uses: 10, max_results: 5, max_total_results: 50, max_characters: 2000 } }],
    });
    expect((await receipts.recover(value.jobId, BASE_TIME + 20))?.bodyState).toBe("available");
    expect((await runResearchJob(value.jobId, dependencies)).state).toBe("recorded");
    expect(providerFetch).toHaveBeenCalledOnce();
    db.close();
  });

  it("does not fetch after a lost claim acknowledgement leaves the durable CAS claimed", async () => {
    const db = createExecutorDb();
    const value = job();
    const baseJobs = new D1BridgeJobStore(db);
    await baseJobs.accept(value, BASE_TIME);
    const jobs = new D1BridgeJobStore(interceptRun(db, "SET dispatch_state = 'claimed'", "after"));
    const receipts = new ExecutorReceiptStore(db, await createBucket());
    const provider = { research: vi.fn().mockResolvedValue(providerResult()) };
    const result = await runResearchJob(value.jobId, { jobs, receipts,
      site: { begin: vi.fn().mockResolvedValue(await replyFor(value)) }, provider,
      wallNow: () => BASE_TIME + 20, monoNow: () => 1_000 });

    expect(result.state).toBe("unavailable");
    expect(provider.research).not.toHaveBeenCalled();
    expect((await baseJobs.get(value.jobId))?.dispatchState).toBe("claimed");
    expect(await receipts.recover(value.jobId, BASE_TIME + 20)).toBeNull();
    db.close();
  });

  it("reuses the original grant after a lost begin acknowledgement and consumes the reduced lease", async () => {
    const db = createExecutorDb();
    const value = job();
    const baseJobs = new D1BridgeJobStore(db);
    await baseJobs.accept(value, BASE_TIME);
    const bucket = await createBucket();
    const firstJobs = new D1BridgeJobStore(interceptRun(db, "SET grant_json =", "after"));
    const firstReply = await replyFor(value);
    const secondReply = await replyFor(value, KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs - 10_000);
    const site = { begin: vi.fn()
      .mockResolvedValueOnce(firstReply).mockResolvedValueOnce(secondReply) };
    const provider = { research: vi.fn().mockResolvedValue(providerResult()) };
    const first = await runResearchJob(value.jobId, { jobs: firstJobs,
      receipts: new ExecutorReceiptStore(db, bucket), site, provider,
      wallNow: () => BASE_TIME + 20, monoNow: () => 1_000 });
    const second = await runResearchJob(value.jobId, { jobs: baseJobs,
      receipts: new ExecutorReceiptStore(db, bucket), site, provider,
      wallNow: () => BASE_TIME + 30, monoNow: () => 2_000 });

    expect(first.state).toBe("unavailable");
    expect(second.state).toBe("recorded");
    expect(site.begin).toHaveBeenCalledTimes(2);
    expect(secondReply.grant).toEqual(firstReply.grant);
    expect((await baseJobs.get(value.jobId))?.grant).toEqual(firstReply.grant);
    expect(provider.research).toHaveBeenCalledOnce();
    db.close();
  });

  it("closes before claim when begin and D1 time leave less than the full provider budget", async () => {
    const db = createExecutorDb();
    const value = job();
    const actualJobs = new D1BridgeJobStore(db);
    await actualJobs.accept(value, BASE_TIME);
    let mono = 0;
    const jobs = { get: (id: string) => actualJobs.get(id),
      recordBegin: async (...args: Parameters<D1BridgeJobStore["recordBegin"]>) => {
        const result = await actualJobs.recordBegin(...args); mono += 31_000; return result;
      },
      claimDispatch: (...args: Parameters<D1BridgeJobStore["claimDispatch"]>) => actualJobs.claimDispatch(...args),
      closeUnclaimed: (...args: Parameters<D1BridgeJobStore["closeUnclaimed"]>) => actualJobs.closeUnclaimed(...args) };
    const provider = { research: vi.fn().mockResolvedValue(providerResult()) };
    const result = await runResearchJob(value.jobId, { jobs, receipts: new ExecutorReceiptStore(db, await createBucket()),
      site: { begin: vi.fn().mockResolvedValue(await replyFor(value)) }, provider,
      wallNow: () => BASE_TIME + 20, monoNow: () => mono });

    expect(result.state).toBe("closed");
    expect(provider.research).not.toHaveBeenCalled();
    expect((await actualJobs.get(value.jobId))?.dispatchState).toBe("closed");
    db.close();
  });

  it("leaves a conservative claim when the strict final budget check expires before fetch", async () => {
    const db = createExecutorDb();
    const value = job();
    const actualJobs = new D1BridgeJobStore(db);
    await actualJobs.accept(value, BASE_TIME);
    let mono = 0;
    const jobs = { get: (id: string) => actualJobs.get(id),
      recordBegin: (...args: Parameters<D1BridgeJobStore["recordBegin"]>) => actualJobs.recordBegin(...args),
      claimDispatch: async (...args: Parameters<D1BridgeJobStore["claimDispatch"]>) => {
        const claimed = await actualJobs.claimDispatch(...args); mono += 31_000; return claimed;
      }, closeUnclaimed: (...args: Parameters<D1BridgeJobStore["closeUnclaimed"]>) => actualJobs.closeUnclaimed(...args) };
    const provider = { research: vi.fn().mockResolvedValue(providerResult()) };
    const receipts = new ExecutorReceiptStore(db, await createBucket());
    const result = await runResearchJob(value.jobId, { jobs, receipts,
      site: { begin: vi.fn().mockResolvedValue(await replyFor(value)) }, provider,
      wallNow: () => BASE_TIME + 20, monoNow: () => mono });

    expect(result.state).toBe("unavailable");
    expect(provider.research).not.toHaveBeenCalled();
    expect((await actualJobs.get(value.jobId))?.dispatchState).toBe("claimed");
    expect(await receipts.recover(value.jobId, BASE_TIME + 20)).toBeNull();
    db.close();
  });

  it("persists bounded provider failures once without automatic retry", async () => {
    const db = createExecutorDb();
    const value = job();
    const jobs = new D1BridgeJobStore(db);
    await jobs.accept(value, BASE_TIME);
    const receipts = new ExecutorReceiptStore(db, await createBucket());
    const provider = { research: vi.fn().mockRejectedValue(new ResearchProviderError("rate", true, true,
      { actualModel: "moonshotai/kimi-k3", usage: providerResult().usage })) };
    const result = await runResearchJob(value.jobId, { jobs, receipts,
      site: { begin: vi.fn().mockResolvedValue(await replyFor(value)) }, provider,
      wallNow: () => BASE_TIME + 20, monoNow: () => 1_000 });
    const recovered = await receipts.recover(value.jobId, BASE_TIME + 20);

    expect(result.state).toBe("recorded");
    expect(provider.research).toHaveBeenCalledOnce();
    expect(recovered?.receipt?.outcome).toEqual({ kind: "error", code: "rate", retryable: true,
      charged: true, actualModel: "moonshotai/kimi-k3", usage: providerResult().usage });
    db.close();
  });

  it("keeps a safe claimed state when R2 rejects the receipt and never requests research twice", async () => {
    const db = createExecutorDb();
    const value = job();
    const jobs = new D1BridgeJobStore(db);
    await jobs.accept(value, BASE_TIME);
    const bucket = await createBucket();
    const failingBucket = { get: bucket.get.bind(bucket),
      put: vi.fn().mockRejectedValue(new Error("synthetic-private-r2-put")) };
    const provider = { research: vi.fn().mockResolvedValue(providerResult()) };
    const common = { jobs, site: { begin: vi.fn().mockResolvedValue(await replyFor(value)) }, provider,
      wallNow: () => BASE_TIME + 20, monoNow: () => 1_000 };
    const first = await runResearchJob(value.jobId,
      { ...common, receipts: new ExecutorReceiptStore(db, failingBucket) });
    const second = await runResearchJob(value.jobId,
      { ...common, receipts: new ExecutorReceiptStore(db, bucket) });

    expect(first.state).toBe("unavailable");
    expect(second.state).toBe("already-claimed");
    expect(provider.research).toHaveBeenCalledOnce();
    expect((await jobs.get(value.jobId))?.dispatchState).toBe("claimed");
    expect(db.database.prepare("SELECT count(*) AS count FROM research_executor_results").get()).toEqual({ count: 0 });
    db.close();
  });

  it.each(["before", "after"] as const)("recovers a receipt after a result CAS %s-commit failure without a second request", async (timing) => {
    const db = createExecutorDb();
    const value = job();
    const jobs = new D1BridgeJobStore(db);
    await jobs.accept(value, BASE_TIME);
    const bucket = await createBucket();
    const provider = { research: vi.fn().mockResolvedValue(providerResult()) };
    const common = { jobs, site: { begin: vi.fn().mockResolvedValue(await replyFor(value)) }, provider,
      wallNow: () => BASE_TIME + 20, monoNow: () => 1_000 };
    const first = await runResearchJob(value.jobId, { ...common,
      receipts: new ExecutorReceiptStore(interceptRun(db, "INSERT INTO research_executor_results", timing), bucket) });
    const rowsAfterFirst = (db.database.prepare("SELECT count(*) AS count FROM research_executor_results").get() as { count: number }).count;
    const second = await runResearchJob(value.jobId,
      { ...common, receipts: new ExecutorReceiptStore(db, bucket) });

    expect(first.state).toBe("unavailable");
    expect(rowsAfterFirst).toBe(timing === "before" ? 0 : 1);
    expect(second.state).toBe("recorded");
    expect(provider.research).toHaveBeenCalledOnce();
    expect((db.database.prepare("SELECT count(*) AS count FROM research_executor_results").get() as { count: number }).count).toBe(1);
    db.close();
  });

  it("records an unexpected provider transport throw as a bounded non-retryable unknown-charge receipt", async () => {
    const db = createExecutorDb();
    const value = job();
    const jobs = new D1BridgeJobStore(db);
    await jobs.accept(value, BASE_TIME);
    const receipts = new ExecutorReceiptStore(db, await createBucket());
    const provider = { research: vi.fn().mockRejectedValue(new Error("synthetic-private-provider")) };
    const result = await runResearchJob(value.jobId, { jobs, receipts,
      site: { begin: vi.fn().mockResolvedValue(await replyFor(value)) }, provider,
      wallNow: () => BASE_TIME + 20, monoNow: () => 1_000 });

    expect(result.state).toBe("recorded");
    expect((await receipts.recover(value.jobId, BASE_TIME + 20))?.receipt?.outcome).toEqual({
      kind: "error", code: "unavailable", retryable: false, charged: "unknown", actualModel: null, usage: null,
    });
    db.close();
  });

  it("returns a signed successful submit response before fencing its deadline", async () => {
    const executorDb = createExecutorDb();
    const clientDb = createExecutorDb();
    const connection = readResearchBridgeConnection(TEST_BRIDGE_ENVIRONMENT)!;
    const value = job();
    const requestHash = await hashBridgeJob(value);
    const proof = { jobId: value.jobId, requestHash, workflowId: value.jobId, workflowAcceptedAt: BASE_TIME + 1 };
    const runtime = { jobs: { get: vi.fn().mockResolvedValue(null), closeUnclaimed: vi.fn() },
      receipts: { recover: vi.fn(), acknowledge: vi.fn() }, ensureWorkflow: vi.fn().mockResolvedValue(proof),
      acceptNew: true, connection, nonces: new D1BridgeNonceStore(executorDb),
      wallNow: () => BASE_TIME, monoNow: () => 1_000 } satisfies ExecutorHttpRuntime;
    const handler = createExecutorBridgeHandler(runtime);
    const client = new ExecutorBridgeClient(new BridgeTransport({ connection,
      nonces: new D1BridgeNonceStore(clientDb), fetch: handler, wallNow: () => BASE_TIME, monoNow: () => 1_000 }));

    await expect(client.submit(value)).resolves.toEqual(proof);
    expect(runtime.ensureWorkflow).toHaveBeenCalledWith(value, expect.any(Function));
    executorDb.close(); clientDb.close();
  });

  it("does not start close after a signed request deadline expires during lookup", async () => {
    const executorDb = createExecutorDb();
    const connection = readResearchBridgeConnection(TEST_BRIDGE_ENVIRONMENT)!;
    const value = job();
    const requestHash = await hashBridgeJob(value);
    let mono = 1_000;
    const closeUnclaimed = vi.fn();
    const runtime = { jobs: { get: vi.fn(async () => { mono = 6_001; return {
      job: value, requestHash, acceptedAt: BASE_TIME, workflowAcceptedAt: null,
      grant: null, dispatchState: "unclaimed" as const, dispatchAt: null }; }), closeUnclaimed },
      receipts: { recover: vi.fn(), acknowledge: vi.fn() }, ensureWorkflow: vi.fn(), acceptNew: false,
      connection, nonces: new D1BridgeNonceStore(executorDb), wallNow: () => BASE_TIME, monoNow: () => mono } satisfies ExecutorHttpRuntime;
    const body = encodeBridgeDto({ jobId: value.jobId, requestHash }, BRIDGE_BODY_LIMITS.request);
    const response = await createExecutorBridgeHandler(runtime)(await signedRequest("close", value, body));

    expect(response.status).toBe(503);
    expect(closeUnclaimed).not.toHaveBeenCalled();
    executorDb.close();
  });

  it("fences native close storage after its internal read crosses the request deadline", async () => {
    const executorDb = createExecutorDb();
    const value = job();
    await new D1BridgeJobStore(executorDb).accept(value, BASE_TIME);
    let mono = 1_000;
    let jobReads = 0;
    const starts: Readonly<{ kind: "first" | "run"; mono: number; sql: string }>[] = [];
    const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => ({
      bind: (...values: unknown[]) => wrap(statement.bind(...values), sql),
      async first<T>(column?: string) {
        starts.push({ kind: "first", mono, sql });
        const result = column === undefined ? await statement.first<T>() : await statement.first<T>(column);
        if (sql.includes("FROM research_executor_jobs") && ++jobReads === 2) mono = 6_001;
        return result;
      },
      async run() {
        starts.push({ kind: "run", mono, sql });
        return statement.run();
      },
    } as D1PreparedStatement);
    const instrumentedDb = { prepare: (sql: string) => wrap(executorDb.prepare(sql), sql) } as D1Database;
    const environment = { ...TEST_BRIDGE_ENVIRONMENT, EXECUTOR_DB: instrumentedDb,
      EXECUTOR_RECEIPTS: await createBucket(), RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() } as never };
    const runtime = createHttpRuntime(environment, { wallNow: () => BASE_TIME, monoNow: () => mono,
      bridgeFetch: vi.fn(async () => { throw new Error("unexpected Site request"); }) });
    const requestHash = await hashBridgeJob(value);
    const body = encodeBridgeDto({ jobId: value.jobId, requestHash }, BRIDGE_BODY_LIMITS.request);

    const response = await createExecutorBridgeHandler(runtime)(await signedRequest("close", value, body));
    const row = executorDb.database.prepare(
      "SELECT dispatch_state,dispatch_at FROM research_executor_jobs WHERE job_id=?",
    ).get(value.jobId) as { dispatch_state: string; dispatch_at: number | null };

    expect(response.status).toBe(503);
    expect(starts.filter((operation) => operation.mono >= 6_000)).toEqual([]);
    expect(row).toEqual({ dispatch_state: "unclaimed", dispatch_at: null });
    executorDb.close();
  });

  it("keeps a committed native close recoverable when its acknowledgement crosses the request deadline", async () => {
    const executorDb = createExecutorDb();
    const value = job();
    await new D1BridgeJobStore(executorDb).accept(value, BASE_TIME);
    let mono = 1_000;
    const starts: Readonly<{ kind: "first" | "run"; mono: number; sql: string }>[] = [];
    const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => ({
      bind: (...values: unknown[]) => wrap(statement.bind(...values), sql),
      async first<T>(column?: string) {
        starts.push({ kind: "first", mono, sql });
        return column === undefined ? statement.first<T>() : statement.first<T>(column);
      },
      async run() {
        starts.push({ kind: "run", mono, sql });
        const result = await statement.run();
        if (sql.includes("SET dispatch_state = 'closed'")) mono = 6_001;
        return result;
      },
    } as D1PreparedStatement);
    const environment = { ...TEST_BRIDGE_ENVIRONMENT,
      EXECUTOR_DB: { prepare: (sql: string) => wrap(executorDb.prepare(sql), sql) } as D1Database,
      EXECUTOR_RECEIPTS: await createBucket(), RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() } as never };
    const runtime = createHttpRuntime(environment, { wallNow: () => BASE_TIME, monoNow: () => mono,
      bridgeFetch: vi.fn(async () => { throw new Error("unexpected Site request"); }) });
    const requestHash = await hashBridgeJob(value);
    const body = encodeBridgeDto({ jobId: value.jobId, requestHash }, BRIDGE_BODY_LIMITS.request);

    const response = await createExecutorBridgeHandler(runtime)(await signedRequest("close", value, body));
    const row = executorDb.database.prepare(
      "SELECT dispatch_state,dispatch_at FROM research_executor_jobs WHERE job_id=?",
    ).get(value.jobId) as { dispatch_state: string; dispatch_at: number | null };

    expect(response.status).toBe(503);
    expect(starts.filter((operation) => operation.mono >= 6_000)).toEqual([]);
    expect(row).toEqual({ dispatch_state: "closed", dispatch_at: BASE_TIME });
    executorDb.close();
  });

  it("does not read an R2 result body after get acknowledges past the request deadline", async () => {
    const executorDb = createExecutorDb();
    const value = job();
    const grant = await grantFor(value);
    const jobs = new D1BridgeJobStore(executorDb);
    await jobs.accept(value, BASE_TIME);
    await jobs.recordBegin(value, grant);
    await jobs.claimDispatch(value, grant, BASE_TIME + 1);
    const receipt = parseBridgeProviderReceipt({ grant, producedAt: BASE_TIME + 2, latencyMs: 1,
      outcome: { kind: "response", content: providerResult().content, annotations: [],
        actualModel: providerResult().actualModel, usage: providerResult().usage } });
    const receiptHash = summarizeBridgeProviderReceipt(receipt).then((metadata) => metadata.receiptHash);
    const bytes = encodeBridgeProviderReceipt(receipt);
    let mono = 1_000;
    let bodyReads = 0;
    const body = new Response(bytes).body!;
    const bucket = {
      async get() {
        mono = 6_001;
        return { etag: "synthetic-etag", body: {
          getReader() { bodyReads += 1; return body.getReader(); },
          cancel: (reason?: unknown) => body.cancel(reason),
        } } as unknown as R2ObjectBody;
      },
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as R2Bucket;
    const environment = { ...TEST_BRIDGE_ENVIRONMENT, EXECUTOR_DB: executorDb as unknown as D1Database,
      EXECUTOR_RECEIPTS: bucket, RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() } as never };
    const runtime = createHttpRuntime(environment, { wallNow: () => BASE_TIME + 3, monoNow: () => mono,
      bridgeFetch: vi.fn(async () => { throw new Error("unexpected Site request"); }) });
    const requestHash = await hashBridgeJob(value);
    const notice = { jobId: value.jobId, requestHash, receiptHash: await receiptHash };
    const requestBody = encodeBridgeDto(notice, BRIDGE_BODY_LIMITS.request);

    const response = await createExecutorBridgeHandler(runtime)(await signedRequest("result", value, requestBody));

    expect(response.status).toBe(503);
    expect(bodyReads).toBe(0);
    expect(executorDb.database.prepare("SELECT count(*) AS count FROM research_executor_results").get())
      .toEqual({ count: 0 });
    executorDb.close();
  });

  it("isolates concurrent request guards when one native read is aborted", async () => {
    const executorDb = createExecutorDb();
    const firstJob = job();
    const secondJob = job({ jobId: "22222222-2222-4222-8222-222222222222", requestId: "request-2" });
    const setup = new D1BridgeJobStore(executorDb);
    await setup.accept(firstJob, BASE_TIME);
    await setup.accept(secondJob, BASE_TIME);
    let releaseFirst: (() => void) | undefined;
    const held = new Promise<void>((resolveHeld) => { releaseFirst = resolveHeld; });
    let announceFirst: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolveStarted) => { announceFirst = resolveStarted; });
    let delayed = false;
    const wrap = (statement: D1PreparedStatement, sql: string, values: unknown[] = []): D1PreparedStatement => ({
      bind: (...next: unknown[]) => wrap(statement.bind(...next), sql, next),
      async first<T>(column?: string) {
        const result = column === undefined ? await statement.first<T>() : await statement.first<T>(column);
        if (!delayed && sql.includes("FROM research_executor_jobs") && values[0] === firstJob.jobId) {
          delayed = true;
          announceFirst?.();
          await held;
        }
        return result;
      },
      run: () => statement.run(),
    } as D1PreparedStatement);
    const environment = { ...TEST_BRIDGE_ENVIRONMENT,
      EXECUTOR_DB: { prepare: (sql: string) => wrap(executorDb.prepare(sql), sql) } as D1Database,
      EXECUTOR_RECEIPTS: await createBucket(), RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() } as never };
    const runtime = createHttpRuntime(environment, { wallNow: () => BASE_TIME, monoNow: () => 1_000,
      bridgeFetch: vi.fn(async () => { throw new Error("unexpected Site request"); }) });
    const handler = createExecutorBridgeHandler(runtime);
    const firstBody = encodeBridgeDto({ jobId: firstJob.jobId,
      requestHash: await hashBridgeJob(firstJob) }, BRIDGE_BODY_LIMITS.request);
    const secondBody = encodeBridgeDto({ jobId: secondJob.jobId,
      requestHash: await hashBridgeJob(secondJob) }, BRIDGE_BODY_LIMITS.request);
    const controller = new AbortController();
    const preparedFirst = await signedRequest("close", firstJob, firstBody);
    const firstResponse = handler(new Request(preparedFirst, { signal: controller.signal }));
    await firstStarted;
    controller.abort();

    const secondResponse = await handler(await signedRequest("close", secondJob, secondBody));
    releaseFirst?.();
    const expiredResponse = await firstResponse;

    expect(secondResponse.status).toBe(200);
    expect(expiredResponse.status).toBe(503);
    expect((await setup.get(firstJob.jobId))?.dispatchState).toBe("unclaimed");
    expect((await setup.get(secondJob.jobId))?.dispatchState).toBe("closed");
    executorDb.close();
  });

  it("returns signed invalid-message for an authenticated malformed submit without business effects", async () => {
    const executorDb = createExecutorDb();
    const connection = readResearchBridgeConnection(TEST_BRIDGE_ENVIRONMENT)!;
    const value = job();
    const jobs = { get: vi.fn(), closeUnclaimed: vi.fn() };
    const receipts = { recover: vi.fn(), acknowledge: vi.fn() };
    const ensureWorkflow = vi.fn();
    const runtime = { jobs, receipts, ensureWorkflow, acceptNew: true, connection,
      nonces: new D1BridgeNonceStore(executorDb), wallNow: () => BASE_TIME, monoNow: () => 1_000 };
    const body = encodeBridgeDto({}, BRIDGE_BODY_LIMITS.request);
    const response = await createExecutorBridgeHandler(runtime)(await signedRequest("submit", value, body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "invalid-message" });
    expect(jobs.get).not.toHaveBeenCalled();
    expect(jobs.closeUnclaimed).not.toHaveBeenCalled();
    expect(receipts.recover).not.toHaveBeenCalled();
    expect(receipts.acknowledge).not.toHaveBeenCalled();
    expect(ensureWorkflow).not.toHaveBeenCalled();
    executorDb.close();
  });

  it.each(["before", "after"] as const)("returns signed temporary when executor nonce persistence fails %s commit", async (timing) => {
    const executorDb = createExecutorDb();
    const clientDb = createExecutorDb();
    const value = job();
    let nonceAttempts = 0;
    let businessStarts = 0;
    const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => ({
      bind: (...values: unknown[]) => wrap(statement.bind(...values), sql),
      async run() {
        if (sql.includes("INSERT INTO research_bridge_nonces")) {
          nonceAttempts += 1;
          if (timing === "after") await statement.run();
          throw new Error("synthetic executor nonce unavailable");
        }
        businessStarts += 1;
        return statement.run();
      },
      async first<T>(column?: string) {
        businessStarts += 1;
        return column === undefined ? statement.first<T>() : statement.first<T>(column);
      },
    } as D1PreparedStatement);
    const bucketCalls = vi.fn();
    const workflowCalls = vi.fn();
    const environment = { ...TEST_BRIDGE_ENVIRONMENT,
      EXECUTOR_DB: { prepare: (sql: string) => wrap(executorDb.prepare(sql), sql) } as D1Database,
      EXECUTOR_RECEIPTS: { get: bucketCalls, put: bucketCalls, delete: bucketCalls } as unknown as R2Bucket,
      RESEARCH_WORKFLOW: { create: workflowCalls, get: workflowCalls } as never,
      ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "true" };
    const runtime = createHttpRuntime(environment, { wallNow: () => BASE_TIME, monoNow: () => 1_000,
      bridgeFetch: vi.fn(async () => { throw new Error("unexpected Site request"); }) });
    const handler = createExecutorBridgeHandler(runtime);
    let status = 0;
    let signed = false;
    const connection = readResearchBridgeConnection(environment)!;
    const client = new ExecutorBridgeClient(new BridgeTransport({ connection,
      nonces: new D1BridgeNonceStore(clientDb), wallNow: () => BASE_TIME, monoNow: () => 1_000,
      fetch: async (request) => {
        const response = await handler(request);
        status = response.status;
        signed = response.headers.has("x-arc-bridge-signature");
        return response;
      } }));

    await expect(client.submit(value)).rejects.toMatchObject({ kind: "temporary" });
    expect({ status, signed, nonceAttempts, businessStarts,
      workflowCalls: workflowCalls.mock.calls.length, bucketCalls: bucketCalls.mock.calls.length }).toEqual({
      status: 503, signed: true, nonceAttempts: 1, businessStarts: 0, workflowCalls: 0, bucketCalls: 0,
    });
    expect(executorDb.database.prepare("SELECT count(*) AS count FROM research_bridge_nonces").get())
      .toEqual({ count: timing === "after" ? 1 : 0 });
    expect(executorDb.database.prepare("SELECT count(*) AS count FROM research_executor_jobs").get())
      .toEqual({ count: 0 });
    expect(executorDb.database.prepare("SELECT count(*) AS count FROM research_executor_results").get())
      .toEqual({ count: 0 });
    executorDb.close(); clientDb.close();
  });

  it.each(["before", "after"] as const)("returns signed temporary when Site nonce persistence fails %s commit", async (timing) => {
    const fixture = await createResearchBridgeFixture();
    const before = JSON.stringify(fixture.businessSnapshot());
    const nonceBefore = (fixture.db.database.prepare(
      "SELECT count(*) AS count FROM research_bridge_nonces",
    ).get() as { count: number }).count;
    let nonceAttempts = 0;
    let businessStarts = 0;
    let downstreamFetches = 0;
    const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => ({
      bind: (...values: unknown[]) => wrap(statement.bind(...values), sql),
      async run() {
        if (sql.includes("INSERT INTO research_bridge_nonces")) {
          nonceAttempts += 1;
          if (timing === "after") await statement.run();
          throw new Error("synthetic Site nonce unavailable");
        }
        businessStarts += 1;
        return statement.run();
      },
      async first<T>(column?: string) {
        businessStarts += 1;
        return column === undefined ? statement.first<T>() : statement.first<T>(column);
      },
      async all<T>() { businessStarts += 1; return statement.all<T>(); },
    } as D1PreparedStatement);
    const handler = createProductionSiteBridgeHandler({ environment: fixture.environment,
      getD1: () => ({ prepare: (sql: string) => wrap(fixture.db.prepare(sql), sql) }) as D1Database,
      fetch: async () => { downstreamFetches += 1; throw new Error("unexpected downstream fetch"); },
      wallNow: fixture.wallNow, monoNow: fixture.monoNow });
    let status = 0;
    let signed = false;
    const client = new SiteBridgeClient(new BridgeTransport({ connection: fixture.connection,
      nonces: new D1BridgeNonceStore(fixture.clientDb as unknown as D1Database),
      wallNow: fixture.wallNow, monoNow: fixture.monoNow,
      fetch: async (request) => {
        const response = await handler(request);
        status = response.status;
        signed = response.headers.has("x-arc-bridge-signature");
        return response;
      } }));

    await expect(client.begin(fixture.execution.job)).rejects.toMatchObject({ kind: "temporary" });
    expect({ status, signed, nonceAttempts, businessStarts, downstreamFetches }).toEqual({
      status: 503, signed: true, nonceAttempts: 1, businessStarts: 0, downstreamFetches: 0,
    });
    expect(JSON.stringify(fixture.businessSnapshot())).toBe(before);
    expect((fixture.db.database.prepare("SELECT count(*) AS count FROM research_bridge_nonces")
      .get() as { count: number }).count - nonceBefore).toBe(timing === "after" ? 1 : 0);
    fixture.db.close(); fixture.clientDb.close();
  });

  it.each(["before", "after"] as const)("keeps response nonce persistence %s-commit failure temporary without decoding", async (timing) => {
    const executorDb = createExecutorDb();
    const clientDb = createExecutorDb();
    const value = job();
    const jobs = new D1BridgeJobStore(executorDb);
    const originalStored = await jobs.accept(value, BASE_TIME);
    const environment = { ...TEST_BRIDGE_ENVIRONMENT, EXECUTOR_DB: executorDb as unknown as D1Database,
      EXECUTOR_RECEIPTS: await createBucket(), RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() } as never };
    const handler = createExecutorBridgeHandler(createHttpRuntime(environment, {
      wallNow: () => BASE_TIME, monoNow: () => 1_000,
      bridgeFetch: vi.fn(async () => { throw new Error("unexpected Site request"); }),
    }));
    let localNonceAttempts = 0;
    const localNonces = new D1BridgeNonceStore({ prepare(sql: string) {
      const statement = clientDb.prepare(sql);
      return { bind(...values: unknown[]) {
        const bound = statement.bind(...values);
        return { async run() {
          localNonceAttempts += 1;
          if (timing === "after") await bound.run();
          throw new Error("synthetic local response nonce unavailable");
        }, first: bound.first.bind(bound) } as unknown as D1PreparedStatement;
      } } as D1PreparedStatement;
    } } as D1Database);
    let responseStatus = 0;
    let responseSigned = false;
    const decode = vi.fn();
    const transport = new BridgeTransport({ connection: readResearchBridgeConnection(environment)!,
      nonces: localNonces, wallNow: () => BASE_TIME, monoNow: () => 1_000,
      fetch: async (request) => {
        const response = await handler(request);
        responseStatus = response.status;
        responseSigned = response.headers.has("x-arc-bridge-signature");
        return response;
      } });
    const requestHash = await hashBridgeJob(value);
    const body = encodeBridgeDto({ jobId: value.jobId, requestHash }, BRIDGE_BODY_LIMITS.request);

    await expect(transport.request({ target: "executor", operation: "status",
      prepare: () => ({ jobId: value.jobId, body }), decode })).rejects.toMatchObject({ kind: "temporary" });
    expect({ responseStatus, responseSigned, localNonceAttempts, decodeCalls: decode.mock.calls.length })
      .toEqual({ responseStatus: 200, responseSigned: true, localNonceAttempts: 1, decodeCalls: 0 });
    expect(executorDb.database.prepare("SELECT count(*) AS count FROM research_bridge_nonces").get())
      .toEqual({ count: 1 });
    expect(clientDb.database.prepare("SELECT count(*) AS count FROM research_bridge_nonces").get())
      .toEqual({ count: timing === "after" ? 1 : 0 });
    expect(await jobs.get(value.jobId)).toEqual(originalStored);
    executorDb.close(); clientDb.close();
  });

  it("keeps tampered HMAC and replay failures authentication-only with no business authority", async () => {
    const executorDb = createExecutorDb();
    const value = job();
    const environment = { ...TEST_BRIDGE_ENVIRONMENT, EXECUTOR_DB: executorDb as unknown as D1Database,
      EXECUTOR_RECEIPTS: await createBucket(), RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() } as never };
    const handler = createExecutorBridgeHandler(createHttpRuntime(environment, {
      wallNow: () => BASE_TIME, monoNow: () => 1_000,
      bridgeFetch: vi.fn(async () => { throw new Error("unexpected Site request"); }),
    }));
    const requestHash = await hashBridgeJob(value);
    const body = encodeBridgeDto({ jobId: value.jobId, requestHash }, BRIDGE_BODY_LIMITS.request);
    const tampered = await signedRequest("status", value, body);
    tampered.headers.set("x-arc-bridge-signature", "00".repeat(32));

    const tamperedResponse = await handler(tampered);
    expect(tamperedResponse.status).toBe(401);
    expect(tamperedResponse.headers.has("x-arc-bridge-signature")).toBe(false);
    expect(executorDb.database.prepare("SELECT count(*) AS count FROM research_bridge_nonces").get())
      .toEqual({ count: 0 });

    const replay = await signedRequest("status", value, body);
    const replayBytes = new Uint8Array(await replay.arrayBuffer());
    const first = await handler(new Request(replay.url, { method: "POST", headers: replay.headers,
      body: new Uint8Array(replayBytes) }));
    const second = await handler(new Request(replay.url, { method: "POST", headers: replay.headers,
      body: new Uint8Array(replayBytes) }));
    expect(first.status).toBe(404);
    expect(first.headers.has("x-arc-bridge-signature")).toBe(true);
    expect(second.status).toBe(401);
    expect(second.headers.has("x-arc-bridge-signature")).toBe(false);
    expect(executorDb.database.prepare("SELECT count(*) AS count FROM research_bridge_nonces").get())
      .toEqual({ count: 1 });
    expect(executorDb.database.prepare("SELECT count(*) AS count FROM research_executor_jobs").get())
      .toEqual({ count: 0 });
    executorDb.close();
  });

  it("records the exact Site acceptance after both create and Site acknowledgement loss", async () => {
    const fixture = await createResearchBridgeFixture();
    const executorDb = createExecutorDb();
    const bucket = await createBucket();
    const status = vi.fn().mockResolvedValue({ status: "errored" });
    const workflow = { create: vi.fn().mockRejectedValue(new Error("lost-create-ack")),
      get: vi.fn().mockResolvedValue({ id: fixture.execution.job.jobId, status }) };
    let loseAccepted = true;
    const bridgeFetch: typeof fetch = async (input, init) => {
      const request = input instanceof Request && init === undefined ? input : new Request(input, init);
      const response = await fixture.handler(request);
      if (loseAccepted && new URL(request.url).pathname.endsWith("/accepted")) {
        loseAccepted = false;
        throw new Error("lost-site-ack");
      }
      return response;
    };
    const environment = { ...TEST_BRIDGE_ENVIRONMENT, EXECUTOR_DB: executorDb as unknown as D1Database,
      EXECUTOR_RECEIPTS: bucket, RESEARCH_WORKFLOW: workflow as never,
      ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "true" };
    const firstRuntime = createHttpRuntime(environment, { bridgeFetch,
      wallNow: fixture.wallNow, monoNow: fixture.monoNow });
    await expect(firstRuntime.ensureWorkflow(fixture.execution.job)).rejects.toThrow();
    const stored = await firstRuntime.jobs.get(fixture.execution.job.jobId);
    expect(stored?.workflowAcceptedAt).not.toBeNull();
    const replayFetch: typeof fetch = async (input, init) => fixture.handler(
      input instanceof Request && init === undefined ? input : new Request(input, init));
    const replayRuntime = createHttpRuntime(environment, { bridgeFetch: replayFetch,
      wallNow: fixture.wallNow, monoNow: fixture.monoNow });
    const proof = await replayRuntime.ensureWorkflow(fixture.execution.job);

    expect(workflow.get).toHaveBeenCalledWith(fixture.execution.job.jobId);
    expect(status).toHaveBeenCalledOnce();
    expect(await fixture.bridge.readAcceptance(fixture.identity)).toEqual(proof);
    expect(proof.workflowAcceptedAt).toBe(stored?.workflowAcceptedAt);
    executorDb.close();
  });

  it("replays the actual Site begin authority with the original grant and reduced remaining time", async () => {
    const fixture = await createResearchBridgeFixture();
    const executorDb = createExecutorDb();
    const value = fixture.execution.job;
    const baseJobs = new D1BridgeJobStore(executorDb);
    await baseJobs.accept(value, fixture.wallNow());
    const bucket = await createBucket();
    const replies: Awaited<ReturnType<typeof fixture.siteClient.begin>>[] = [];
    const site = { begin: async (input: typeof value) => {
      const reply = await fixture.siteClient.begin(input);
      replies.push(reply);
      if (replies.length === 1) throw new Error("lost-authenticated-site-begin-reply");
      fixture.advanceMono(10_000);
      return reply;
    } };
    const provider = { research: vi.fn().mockResolvedValue(providerResult()) };
    const first = await runResearchJob(value.jobId, {
      jobs: baseJobs,
      receipts: new ExecutorReceiptStore(executorDb, bucket), site, provider,
      wallNow: fixture.wallNow, monoNow: fixture.monoNow,
    });
    const grantAfterFirst = (await baseJobs.get(value.jobId))?.grant;
    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.setWall(fixture.wallNow() + 20);
    fixture.setSqlNow(replies[0]!.observedAt + 10_000);
    const second = await runResearchJob(value.jobId, { jobs: baseJobs,
      receipts: new ExecutorReceiptStore(executorDb, bucket), site, provider,
      wallNow: fixture.wallNow, monoNow: fixture.monoNow });

    expect(first.state).toBe("unavailable");
    expect(grantAfterFirst).toBeNull();
    expect(second.state).toBe("recorded");
    expect(replies).toHaveLength(2);
    expect(replies[1]!.grant).toEqual(replies[0]!.grant);
    expect(replies[1]!.remainingMs).toBeLessThan(replies[0]!.remainingMs);
    expect((await baseJobs.get(value.jobId))?.grant).toEqual(replies[0]!.grant);
    expect(provider.research).toHaveBeenCalledOnce();
    executorDb.close();
  });

  it.each([false, true])("preserves signed recovery identities with maintenance stopped=%j", async stopped => {
    const executorDb = createExecutorDb();
    const clientDb = createExecutorDb();
    const bucket = await createBucket();
    const jobs = new D1BridgeJobStore(executorDb);
    const receipts = new ExecutorReceiptStore(executorDb, bucket);
    const value = job();
    const grant = await grantFor(value);
    await jobs.accept(value, BASE_TIME);
    await jobs.recordWorkflowAccepted(value, value.jobId, BASE_TIME + 1);
    await jobs.recordBegin(value, grant);
    await jobs.claimDispatch(value, grant, BASE_TIME + 2);
    const saved = await receipts.save(parseBridgeProviderReceipt({ grant, producedAt: BASE_TIME + 3,
      latencyMs: 20, outcome: { kind: "response", content: providerResult().content,
        annotations: [], actualModel: "moonshotai/kimi-k3", usage: providerResult().usage } }), BASE_TIME + 3);
    const proof = { jobId: value.jobId, requestHash: await hashBridgeJob(value), workflowId: value.jobId,
      workflowAcceptedAt: BASE_TIME + 1 };
    const connection = readResearchBridgeConnection(TEST_BRIDGE_ENVIRONMENT)!;
    const ensure = vi.fn().mockResolvedValue(proof);
    const workflow = { create: vi.fn(), get: vi.fn() };
    const siteFetch = vi.fn<typeof fetch>(async () => { throw new Error("unexpected Site call"); });
    const runtime = stopped ? createHttpRuntime({ ...TEST_BRIDGE_ENVIRONMENT,
      EXECUTOR_DB: executorDb as unknown as D1Database, EXECUTOR_RECEIPTS: bucket,
      RESEARCH_WORKFLOW: workflow as never, ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "true",
      ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED: "false" },
    { bridgeFetch: siteFetch, wallNow: () => BASE_TIME + 4, monoNow: () => 1_000 })
      : { jobs, receipts, ensureWorkflow: ensure, acceptNew: false, connection,
        nonces: new D1BridgeNonceStore(executorDb), wallNow: () => BASE_TIME + 4, monoNow: () => 1_000 };
    const client = new ExecutorBridgeClient(new BridgeTransport({ connection,
      nonces: new D1BridgeNonceStore(clientDb), fetch: createExecutorBridgeHandler(runtime),
      wallNow: () => BASE_TIME + 4, monoNow: () => 1_000 }));
    const notice = { jobId: value.jobId, requestHash: proof.requestHash, receiptHash: saved.metadata.receiptHash };

    await expect(client.submit(job({ jobId: "22222222-2222-4222-8222-222222222222" })))
      .rejects.toMatchObject({ kind: "closed" } satisfies Partial<BridgeTransportError>);
    await expect(client.submit(value)).resolves.toEqual(proof);
    expect(ensure).toHaveBeenCalledTimes(stopped ? 0 : 1);
    await expect(client.status(value)).resolves.toMatchObject({ dispatchState: "claimed",
      accepted: proof, metadata: saved.metadata, bodyState: "available" });
    await expect(client.result(value, notice, grant)).resolves.toEqual(saved.receipt);
    await expect(client.acknowledge(value, notice)).resolves.toEqual(notice);
    const unclaimed = job({ jobId: "33333333-3333-4333-8333-333333333333", requestId: "request-3" });
    await jobs.accept(unclaimed, BASE_TIME);
    await expect(client.close(unclaimed)).resolves.toMatchObject({ state: "closed", grant: null });
    await expect(client.close(value)).rejects.toMatchObject({ kind: "conflict" });
    expect(workflow.create).not.toHaveBeenCalled();
    expect(workflow.get).not.toHaveBeenCalled();
    expect(siteFetch).not.toHaveBeenCalled();
    executorDb.close(); clientDb.close();
  });

  it("returns a consistent claimed status when native claim and receipt fixation race its first read", async () => {
    const executorDb = createExecutorDb();
    const clientDb = createExecutorDb();
    const bucket = await createBucket();
    const actualJobs = new D1BridgeJobStore(executorDb);
    const receipts = new ExecutorReceiptStore(executorDb, bucket);
    const value = job();
    const grant = await grantFor(value);
    await actualJobs.accept(value, BASE_TIME);
    const connection = readResearchBridgeConnection(TEST_BRIDGE_ENVIRONMENT)!;
    let reads = 0;
    const jobs = { get: async (id: string) => {
      const snapshot = await actualJobs.get(id);
      if (++reads === 1) {
        await actualJobs.recordBegin(value, grant);
        await actualJobs.claimDispatch(value, grant, BASE_TIME + 1);
        await receipts.save(parseBridgeProviderReceipt({ grant, producedAt: BASE_TIME + 2, latencyMs: 1,
          outcome: { kind: "response", content: providerResult().content, annotations: [],
            actualModel: "moonshotai/kimi-k3", usage: providerResult().usage } }), BASE_TIME + 2);
      }
      return snapshot;
    }, closeUnclaimed: (...args: Parameters<D1BridgeJobStore["closeUnclaimed"]>) => actualJobs.closeUnclaimed(...args) };
    const runtime = { jobs, receipts, ensureWorkflow: vi.fn(), acceptNew: false, connection,
      nonces: new D1BridgeNonceStore(executorDb), wallNow: () => BASE_TIME + 3, monoNow: () => 1_000 };
    const client = new ExecutorBridgeClient(new BridgeTransport({ connection,
      nonces: new D1BridgeNonceStore(clientDb), fetch: createExecutorBridgeHandler(runtime),
      wallNow: () => BASE_TIME + 3, monoNow: () => 1_000 }));

    await expect(client.status(value)).resolves.toMatchObject({ dispatchState: "claimed",
      metadata: expect.objectContaining({ grant }), bodyState: "available" });
    expect(reads).toBeGreaterThanOrEqual(2);
    executorDb.close(); clientDb.close();
  });

  it("separates paid execution from HTTP capability and uses the exact Workflow step contract", async () => {
    const executorDb = createExecutorDb();
    const bucket = await createBucket();
    const workflowBinding = { create: vi.fn(), get: vi.fn() };
    const environment = { ...TEST_BRIDGE_ENVIRONMENT, EXECUTOR_DB: executorDb as unknown as D1Database,
      EXECUTOR_RECEIPTS: bucket, RESEARCH_WORKFLOW: workflowBinding as never,
      ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "true", OPENROUTER_API_KEY: "synthetic-workflow-key" };
    const execution = createExecutionRuntime(environment, { bridgeFetch: vi.fn(), providerFetch: vi.fn(),
      wallNow: () => BASE_TIME, monoNow: () => 1_000 });
    const httpEnvironment = new Proxy(environment, { get(target, property, receiver) {
      if (property === "OPENROUTER_API_KEY") throw new Error("HTTP read provider key");
      return Reflect.get(target, property, receiver);
    } });
    const http = createHttpRuntime(httpEnvironment, { bridgeFetch: vi.fn(),
      wallNow: () => BASE_TIME, monoNow: () => 1_000 });
    expect(Object.keys(execution.provider)).toEqual(["research"]);
    expect(execution.provider).not.toHaveProperty("repair");
    expect(http).not.toHaveProperty("provider");

    vi.doMock("cloudflare:workers", () => ({ WorkflowEntrypoint: class {
      protected env: unknown;
      constructor(_ctx: unknown, env: unknown) { this.env = env; }
    } }));
    vi.resetModules();
    const { ResearchWorkflow } = await import("../../worker/research-executor/workflow");
    const instance = new ResearchWorkflow({} as ExecutionContext, environment);
    const reference = { jobId: JOB_ID, state: "unavailable" as const, receiptHash: null };
    const stepDo = vi.fn().mockResolvedValue(reference);
    const step = { do: stepDo } as never;
    const event = { payload: { jobId: JOB_ID }, instanceId: JOB_ID, timestamp: new Date(),
      workflowName: "ResearchWorkflow" };

    await expect(instance.run(event, step)).resolves.toEqual(reference);
    expect(stepDo).toHaveBeenCalledWith("research-once", PAID_STEP_CONFIG, expect.any(Function));
    await expect(instance.run({ ...event, instanceId: "22222222-2222-4222-8222-222222222222" }, step))
      .rejects.toThrow("Research workflow unavailable");
    executorDb.close();
  });

  it.each([
    { maintenance: undefined, transient: false },
    { maintenance: "false", transient: false },
    { maintenance: "false", transient: true },
  ])("retains real-factory Workflow delivery for $maintenance with transient failure=$transient", async ({ maintenance, transient }) => {
    const fixture = await createResearchBridgeFixture();
    const executorDb = createExecutorDb();
    const bucket = await createBucket();
    const jobs = new D1BridgeJobStore(executorDb);
    await jobs.accept(fixture.execution.job, fixture.wallNow());
    const persistedReceipt = validReceipt(fixture.execution);
    if (persistedReceipt.grant.beganAt === null || persistedReceipt.grant.executionExpiresAt === null) {
      throw new Error("missing synthetic executor grant");
    }
    const persistedGrant = { ...persistedReceipt.grant, beganAt: persistedReceipt.grant.beganAt,
      executionExpiresAt: persistedReceipt.grant.executionExpiresAt };
    const storedReceipt = { ...persistedReceipt, grant: persistedGrant };
    await jobs.recordBegin(fixture.execution.job, persistedGrant);
    expect(await jobs.claimDispatch(fixture.execution.job, persistedGrant, fixture.wallNow())).toBe(true);
    const receiptStore = new ExecutorReceiptStore(executorDb as unknown as D1Database, bucket);
    const saved = await receiptStore.save(storedReceipt, fixture.wallNow());
    const notice = await fixture.notice();
    expect(saved.metadata.receiptHash).toBe(notice.receiptHash);
    const bridgeFetch = vi.fn<typeof fetch>(async (input, init) => {
      if (transient) throw new Error("synthetic transient Site outage");
      return fixture.handler(input instanceof Request && init === undefined ? input : new Request(input, init));
    });
    vi.stubGlobal("fetch", bridgeFetch);
    vi.spyOn(Date, "now").mockImplementation(fixture.wallNow);
    const workflowBinding = { create: vi.fn(), get: vi.fn() };
    const environment = { ...TEST_BRIDGE_ENVIRONMENT, EXECUTOR_DB: executorDb as unknown as D1Database,
      EXECUTOR_RECEIPTS: bucket, RESEARCH_WORKFLOW: workflowBinding as never,
      ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "false", ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED: maintenance,
      OPENROUTER_API_KEY: "synthetic-workflow-key" };
    vi.doMock("cloudflare:workers", () => ({ WorkflowEntrypoint: class {
      protected env: unknown;
      constructor(_ctx: unknown, env: unknown) { this.env = env; }
    } }));
    vi.resetModules();
    const { ResearchWorkflow } = await import("../../worker/research-executor/workflow");
    const instance = new ResearchWorkflow({} as ExecutionContext, environment);
    const reference = { jobId: notice.jobId, state: "recorded" as const, receiptHash: notice.receiptHash };
    const stepDo = vi.fn().mockResolvedValue(reference);
    const event = { payload: { jobId: notice.jobId }, instanceId: notice.jobId,
      timestamp: new Date(), workflowName: "ResearchWorkflow" };

    const returned = await instance.run(event, { do: stepDo } as never);

    expect(returned).toEqual(reference);
    expect(JSON.stringify(returned)).not.toContain("content");
    expect(bridgeFetch.mock.calls.filter(([input]) => new URL(
      input instanceof Request ? input.url : input.toString()).pathname.endsWith("/complete"))).toHaveLength(1);
    expect(await receiptStore.recover(notice.jobId, fixture.wallNow())).toMatchObject({
      receipt: saved.receipt, bodyState: "available", siteAcknowledgedAt: transient ? null : fixture.wallNow(),
    });
    expect(executorDb.database.prepare(`SELECT receipt_hash,completed_at,stopped_code
      FROM research_executor_delivery WHERE job_id=?1`).get(notice.jobId)).toEqual({
      receipt_hash: notice.receiptHash, completed_at: transient ? null : fixture.wallNow(), stopped_code: null,
    });
    if (transient) {
      const delivery = executorDb.database.prepare("SELECT next_attempt_at FROM research_executor_delivery WHERE job_id=?1")
        .get(notice.jobId) as { next_attempt_at: number };
      expect(delivery.next_attempt_at).toBeGreaterThan(fixture.wallNow());
    }
    executorDb.close();
  });
});

describe("closed connectivity Executor", () => {
  function harness(overrides: Record<string, unknown> = {}) {
    const db = createExecutorDb();
    const clientDb = createExecutorDb();
    const unused = vi.fn(async () => { throw new Error("Forbidden business capability"); });
    const site = { outbox: vi.fn(async (_options: { signal?: AbortSignal }) => ({ jobs: [], next: null })) };
    const runtime = { jobs: { get: vi.fn(async () => null), closeUnclaimed: unused },
      receipts: { recover: unused, acknowledge: unused }, ensureWorkflow: unused,
      acceptNew: false, maintenanceEnabled: false, closedPreflightAllowed: true, site,
      connection: readResearchBridgeConnection(TEST_BRIDGE_ENVIRONMENT)!, nonces: new D1BridgeNonceStore(db),
      wallNow: () => BASE_TIME, monoNow: () => 0, ...overrides } as ExecutorHttpRuntime;
    const transport = new BridgeTransport({ connection: runtime.connection, nonces: new D1BridgeNonceStore(clientDb),
      fetch: createExecutorBridgeHandler(runtime), wallNow: runtime.wallNow, monoNow: runtime.monoNow });
    const call = (body: unknown = {}, jobId = CLOSED_PREFLIGHT_JOB_ID, signal?: AbortSignal) => transport.request({
      target: "executor", operation: "closed-preflight", signal,
      prepare: () => ({ jobId, body: new TextEncoder().encode(JSON.stringify(body)) }),
      decode: bytes => parseClosedPreflightReply(JSON.parse(new TextDecoder().decode(bytes))) });
    return { runtime, site, call, unused, db, clientDb, dispose() {
      expect(unused).not.toHaveBeenCalled(); db.close(); clientDb.close();
    } };
  }

  it("checks only fixed absence and one bounded outbox before signing strict booleans", async () => {
    const f = harness();
    try {
      expect(await f.call()).toEqual({ executorClosed: true, jobAbsent: true, siteOutboxEmpty: true });
      expect(f.runtime.jobs.get).toHaveBeenCalledExactlyOnceWith(CLOSED_PREFLIGHT_JOB_ID);
      expect(f.site.outbox).toHaveBeenCalledOnce();
      expect(f.site.outbox.mock.calls[0]![0].signal).toBeInstanceOf(AbortSignal);
    } finally { f.dispose(); }
  });

  it.each([false, undefined])("fails closed without explicit allowed capability %s", async flag => {
    const f = harness({ closedPreflightAllowed: flag });
    try { await expect(f.call()).rejects.toBeDefined(); expect(f.runtime.jobs.get).not.toHaveBeenCalled();
      expect(f.site.outbox).not.toHaveBeenCalled(); } finally { f.dispose(); }
  });

  it("rejects a missing outbox capability without reading a job", async () => {
    const f = harness({ site: undefined });
    try { await expect(f.call()).rejects.toBeDefined(); expect(f.runtime.jobs.get).not.toHaveBeenCalled(); }
    finally { f.dispose(); }
  });

  it("rejects any existing fixed job without receipt recovery, closing or execution", async () => {
    const f = harness();
    vi.mocked(f.runtime.jobs.get).mockResolvedValue({ job: job(), dispatchState: "claimed" } as never);
    try { await expect(f.call()).rejects.toMatchObject({ kind: "conflict" }); expect(f.site.outbox).not.toHaveBeenCalled(); }
    finally { f.dispose(); }
  });

  it.each([{ extra: true }, null, []])("rejects nonempty or malformed input %j", async body => {
    const f = harness();
    try { await expect(f.call(body)).rejects.toBeDefined(); expect(f.runtime.jobs.get).not.toHaveBeenCalled(); }
    finally { f.dispose(); }
  });

  it("rejects another valid UUID before lookup", async () => {
    const f = harness();
    try { await expect(f.call({}, JOB_ID)).rejects.toMatchObject({ kind: "conflict" });
      expect(f.runtime.jobs.get).not.toHaveBeenCalled(); } finally { f.dispose(); }
  });

  it.each([{ jobs: [job()], next: null }, { jobs: [], next: JOB_ID }])("rejects nonempty outbox %j", async page => {
    const f = harness(); f.site.outbox.mockResolvedValue(page as never);
    try { await expect(f.call()).rejects.toBeDefined(); } finally { f.dispose(); }
  });

  it("aborts the inner outbox within three seconds and rejects its late result", async () => {
    const f = harness();
    let signal: AbortSignal | undefined; let release!: () => void; let enter!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    f.site.outbox.mockImplementation(async options => {
      signal = options.signal; enter(); await new Promise<void>(resolve => { release = resolve; });
      return { jobs: [], next: null };
    });
    try {
      const pending = f.call().then(() => "PASS", () => "FAIL");
      await entered;
      expect(await pending).toBe("FAIL"); expect(signal?.aborted).toBe(true);
      release(); await new Promise(resolve => setImmediate(resolve));
      expect(f.site.outbox).toHaveBeenCalledOnce();
      expect(f.clientDb.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()).toEqual({ n: 1 });
    } finally { release?.(); f.dispose(); }
  });

  it.each([
    ["false", "false", "service-binding-v1", true], ["true", "false", "service-binding-v1", false],
    ["false", "true", "service-binding-v1", false], [undefined, "false", "service-binding-v1", false],
    ["false", undefined, "service-binding-v1", false], ["FALSE", "false", "service-binding-v1", false],
    ["false", "false", undefined, false], ["false", "false", "unknown", false],
  ])("requires exact raw flags/mode %j %j %j", (acceptNew, maintenance, mode, allowed) => {
    const db = createExecutorDb(); const unused = vi.fn();
    const environment = { ...TEST_BRIDGE_ENVIRONMENT, EXECUTOR_DB: db as unknown as D1Database,
      EXECUTOR_RECEIPTS: { get: unused, put: unused, delete: unused } as unknown as R2Bucket,
      RESEARCH_WORKFLOW: { create: unused, get: unused } as never,
      ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: acceptNew, ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED: maintenance,
      ARC_AI_RESEARCH_BRIDGE_TRANSPORT: mode, ARC_RESEARCH_SITE: { fetch: unused } };
    try {
      if (mode === "unknown") expect(() => createHttpRuntime(environment)).toThrow();
      else {
        const runtime = createHttpRuntime(environment);
        expect(runtime).toMatchObject({ closedPreflightAllowed: allowed });
        expect(runtime.forRequest(() => undefined, new AbortController().signal)).toMatchObject({ closedPreflightAllowed: allowed });
      }
      expect(unused).not.toHaveBeenCalled();
    } finally { db.close(); }
  });
});
