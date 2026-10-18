// @vitest-environment node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalJson } from "../../app/lib/planning/fingerprint";
import { hashBridgeJob } from "../../app/server/research/executor/job";
import { readResearchBridgeConnection } from "../../app/server/research/executor/connection-config";
import { D1BridgeNonceStore } from "../../app/server/research/executor/d1-nonce-store";
import { ExecutorBridgeClient } from "../../app/server/research/executor/executor-client";
import { BridgeTransport } from "../../app/server/research/executor/http-transport";
import { D1BridgeJobStore } from "../../worker/research-executor/d1-job-store";
import { runResearchJob } from "../../worker/research-executor/execute-job";
import { D1SmokeEvidence } from "../../worker/research-executor-smoke/evidence";
import { SCENARIOS } from "../../worker/research-executor-smoke/scenarios";
import { createExecutionRuntime, createHttpRuntime, createMaintenanceRuntime } from "../../worker/research-executor-smoke/runtime";
import { createResearchCloudSmokeFixture } from "../helpers/research-cloud-smoke-fixture";
import { TEST_PRODUCTION_ENVIRONMENT } from "../helpers/research-bridge-fixture";

const buildProbe = vi.hoisted(() => ({ mutation: "" }));
vi.mock("cloudflare:workers", () => ({ WorkflowEntrypoint: class {
  protected env: unknown;
  constructor(_context: unknown, environment: unknown) { this.env = environment; }
} }));
vi.mock("esbuild", async (load) => {
  const actual = await load<typeof import("esbuild")>();
  return { ...actual, build: async (options: import("esbuild").BuildOptions) => {
    if (!buildProbe.mutation) return actual.build(options);
    const mutation = buildProbe.mutation;
    const tamper: import("esbuild").Plugin = { name: "test-in-memory-boundary-probe", setup(api) {
      api.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
        const normalized = path.replaceAll("\\", "/");
        let contents = await readFile(path, "utf8");
        if (normalized.endsWith("/research-executor-smoke/executor-entry.ts")) {
          if (mutation === "exports") contents = contents.replace(/export \{ ResearchWorkflow \}[^;]+;/u, "");
          if (mutation === "default-export") contents = contents.replace("export default smokeWorker;", "");
          if (mutation === "local-leak") contents += '\nimport "../../tests/fixtures/research/cloud-smoke-local-executor-entry";';
        }
        if (normalized.endsWith("/research-executor-smoke/site-entry.ts") && mutation === "unexpected-importer") {
          contents += '\nimport * as escaped from "../research-executor/runtime"; console.log(escaped);';
        }
        if (normalized.endsWith("/research-executor/workflow.ts") && mutation === "missing-edge") {
          contents = contents.replace(/import \{ createExecutionRuntime, createMaintenanceRuntime \} from "\.\/runtime";/u,
            'const createExecutionRuntime = () => { throw Error("missing"); }; const createMaintenanceRuntime = createExecutionRuntime;');
        }
        if (normalized.endsWith("/research-executor/index.ts") && mutation === "extra-edge") {
          contents += '\nimport * as extra from "./runtime.ts"; console.log(extra);';
        }
        if (normalized.endsWith("/research-executor/index.ts") && mutation.startsWith("production-text:")) {
          contents += `\nconsole.log(${JSON.stringify(mutation.slice("production-text:".length))});`;
        }
        if (normalized.endsWith("/research-executor/runtime.ts") && mutation === "cycle") {
          contents += '\nimport * as cycle from "../research-executor-smoke/runtime"; console.log(cycle);';
        }
        return { contents, loader: "ts", resolveDir: resolve(path, "..") };
      });
    } };
    const result = await actual.build({ ...options, plugins: [tamper, ...(options.plugins ?? [])] });
    if (mutation.startsWith("missing-site:") && String(options.entryPoints).includes("site-entry.ts")) {
      delete result.metafile!.inputs[mutation.slice("missing-site:".length)];
    }
    return result;
  } };
});

function memoryBucket() {
  const objects = new Map<string, Uint8Array>();
  let putResult: "ok" | "null" | "throw" | "undefined" = "ok";
  const bucket = {
    async get(key: string) {
      expect(this).toBe(bucket);
      const bytes = objects.get(key);
      return bytes ? { key, etag: "fixture-etag", body: new Response(new Uint8Array(bytes)).body! } : null;
    },
    async put(key: string, bytes: Uint8Array, options: { onlyIf?: { etagDoesNotMatch?: string } }) {
      expect(this).toBe(bucket);
      if (putResult === "throw") throw Error("write unavailable");
      if (putResult === "undefined") return undefined;
      if (putResult === "null" || (options?.onlyIf?.etagDoesNotMatch === "*" && objects.has(key))) return null;
      objects.set(key, new Uint8Array(bytes)); return { key, etag: "fixture-etag" };
    },
    async delete(key: string) { expect(this).toBe(bucket); objects.delete(key); },
  };
  return { bucket: bucket as unknown as R2Bucket, objects, setPutResult: (value: typeof putResult) => { putResult = value; } };
}

function runtimeFixture() {
  vi.useFakeTimers({ toFake: ["Date"] });
  const fixture = createResearchCloudSmokeFixture();
  const storage = memoryBucket();
  const forbiddenFetch = vi.fn(() => { throw Error("Global network forbidden"); });
  vi.stubGlobal("fetch", forbiddenFetch);
  const binding = { fetch: vi.fn((request: Request) => fixture.dispatch(request)) } as unknown as Fetcher;
  const environment = { ...TEST_PRODUCTION_ENVIRONMENT, EXECUTOR_DB: fixture.executorDb as unknown as D1Database,
    EXECUTOR_RECEIPTS: storage.bucket, RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() } as unknown as Workflow<{ jobId: string }>,
    ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "true", SMOKE_SITE: binding };
  const keyRead = vi.fn(() => { throw Error("Real Provider key read forbidden"); });
  Object.defineProperty(environment, "OPENROUTER_API_KEY", { enumerable: true, get: keyRead });
  const start = async (id: (typeof SCENARIOS)[number]["id"]) => {
    for (const s of SCENARIOS) {
      const response = await fixture.signedStart(s.id);
      expect(response).toMatchObject({ status: 200, body: { backgroundAccepted: true } });
      if (s.id === id) return;
      await fixture.runWorkflow(s.id);
      vi.setSystemTime(Date.now() + 30_001);
      await fixture.runCron();
      // Each prerequisite uses real admission, execution, import and accounting.
      expect((await fixture.signedStatus(s.id)).body).toMatchObject({ state: "ready", settled: true });
    }
  };
  return { fixture, storage, environment, binding, forbiddenFetch, keyRead, start,
    evidence: new D1SmokeEvidence(environment.EXECUTOR_DB) };
}

describe("sealed smoke runtime", () => {
  it("requires the peer binding on all factories, rejects caller overrides and never reads a real key", async () => {
    const f = runtimeFixture();
    try {
      for (const factory of [createExecutionRuntime, createHttpRuntime, createMaintenanceRuntime]) {
        const missing = Object.defineProperties({}, Object.getOwnPropertyDescriptors(f.environment));
        Object.defineProperty(missing, "SMOKE_SITE", { value: undefined });
        expect(() => factory(missing as typeof f.environment)).toThrow(/smoke.*(binding|transport)|invalid smoke/iu);
        expect(() => factory(f.environment, { bridgeFetch: vi.fn(), providerFetch: vi.fn(), wallNow: () => 0 })).toThrow(/override/iu);
        expect(Object.isFrozen(factory(f.environment))).toBe(true);
      }
      expect(f.keyRead).not.toHaveBeenCalled(); expect(f.forbiddenFetch).not.toHaveBeenCalled();
    } finally { await f.fixture.dispose(); }
  });
  it("rejects a Provider call until the actual job read and production dispatch CAS have succeeded", async () => {
    const f = runtimeFixture(); const scenario = SCENARIOS[1]!;
    try {
      await f.start(scenario.id);
      const runtime = createExecutionRuntime(f.environment);
      await expect(runtime.provider.research({ role: scenario.role, locale: scenario.locale })).rejects.toThrow();
      await runtime.jobs.get(scenario.jobId);
      await expect(runtime.provider.research({ role: scenario.role, locale: scenario.locale })).rejects.toThrow();
      expect((await f.evidence.read(scenario.id))?.providerCalls).toBe(0);
      expect(f.forbiddenFetch).not.toHaveBeenCalled(); expect(f.keyRead).not.toHaveBeenCalled();
    } finally { await f.fixture.dispose(); }
  });
  it("keeps two execution closures isolated and permits mutable grant rereads only", async () => {
    const f = runtimeFixture(); const first = SCENARIOS[1]!; const second = SCENARIOS[2]!;
    try {
      await f.start(first.id);
      const original = await new D1BridgeJobStore(f.environment.EXECUTOR_DB).get(first.jobId);
      if (!original) throw Error("missing actual job");
      const nextJob = { ...original.job, jobId: second.jobId, requestId: second.requestId, role: second.role };
      await new D1BridgeJobStore(f.environment.EXECUTOR_DB).accept(nextJob, Date.now());
      const a = createExecutionRuntime(f.environment); const b = createExecutionRuntime(f.environment);
      await Promise.all([a.jobs.get(first.jobId), b.jobs.get(second.jobId)]);
      const reply = await a.site.begin(original.job);
      await a.jobs.recordBegin(original.job, reply.grant);
      expect(await a.jobs.claimDispatch(original.job, reply.grant, Date.now())).toBe(true);
      expect((await a.jobs.get(first.jobId))?.dispatchState).toBe("claimed");
      const value = await a.provider.research({ role: first.role, locale: first.locale });
      expect(value.content).toContain(first.role);
      expect((await f.evidence.read(first.id))?.providerCalls).toBe(1);
      expect((await f.evidence.read(second.id))?.providerCalls).toBe(0);
      await expect(a.jobs.get(second.jobId)).rejects.toThrow(/job/iu);
      await expect(a.provider.research({ role: first.role, locale: first.locale })).rejects.toThrow();
      expect((await b.jobs.get(second.jobId))?.job.jobId).toBe(second.jobId);
      expect(f.forbiddenFetch).not.toHaveBeenCalled();
    } finally { await f.fixture.dispose(); }
  });
  it.each(["missing", "hash", "immutable", "role"])("rejects %s job association before any synthetic effect", async (change) => {
    const f = runtimeFixture(); const scenario = SCENARIOS[1]!;
    try {
      await f.start(scenario.id);
      const runtime = createExecutionRuntime(f.environment);
      const stored = await runtime.jobs.get(scenario.jobId); if (!stored) throw Error("missing job");
      if (change === "missing") {
        await expect(runtime.jobs.get(SCENARIOS[2]!.jobId)).rejects.toThrow();
      } else {
        const job = { ...stored.job, ...(change === "immutable" ? { runId: "changed-run" } : {}),
          ...(change === "role" ? { role: "Wrong role" } : {}) };
        f.fixture.executorDb.database.prepare("UPDATE research_executor_jobs SET job_json=?1,request_hash=?2 WHERE job_id=?3")
          .run(canonicalJson(job), change === "hash" ? "a".repeat(64) : await hashBridgeJob(job), scenario.jobId);
        await expect(runtime.jobs.get(scenario.jobId)).rejects.toThrow();
      }
      await expect(runtime.provider.research({ role: scenario.role, locale: scenario.locale })).rejects.toThrow();
      expect((await f.evidence.read(scenario.id))?.providerCalls).toBe(0);
      expect(f.forbiddenFetch).not.toHaveBeenCalled();
    } finally { await f.fixture.dispose(); }
  });
  it.each(["after-r2", "after-d1"] as const)("delegates durable %s fault and leaves maintenance and HTTP recovery clean", async (id) => {
    const f = runtimeFixture(); const scenario = SCENARIOS.find(s => s.id === id)!;
    try {
      await f.start(id);
      const runtime = createExecutionRuntime(f.environment);
      const result = await runResearchJob(scenario.jobId, runtime);
      expect(result).toEqual({ jobId: scenario.jobId, state: "unavailable", receiptHash: null });
      expect(f.storage.objects.size).toBe(1);
      const rows = () => f.fixture.executorDb.database.prepare("SELECT receipt_hash FROM research_executor_results WHERE job_id=?1").all(scenario.jobId);
      expect(rows()).toHaveLength(id === "after-r2" ? 0 : 1);
      expect(await f.evidence.read(id)).toMatchObject({ providerCalls: 1, fault: { marker: id }, repairCalls: 0, rejections: 0 });
      const repaired = await createMaintenanceRuntime(f.environment).receipts.recover(scenario.jobId, Date.now());
      expect(repaired?.metadata.receiptHash).toMatch(/^[0-9a-f]{64}$/u);
      expect(rows()).toHaveLength(1);
      expect((await createHttpRuntime(f.environment).receipts.recover(scenario.jobId, Date.now()))?.metadata).toEqual(repaired?.metadata);
      expect((await runResearchJob(scenario.jobId, createExecutionRuntime(f.environment))).state).toBe("recorded");
      expect((await f.evidence.read(id))?.providerCalls).toBe(1);
      expect(f.forbiddenFetch).not.toHaveBeenCalled(); expect(f.keyRead).not.toHaveBeenCalled();
    } finally { await f.fixture.dispose(); }
  });
  it("keeps the real dispatch CAS as the single Provider gate for duplicate execution", async () => {
    const f = runtimeFixture(); const scenario = SCENARIOS[1]!;
    try {
      await f.start(scenario.id);
      const results = await Promise.all([runResearchJob(scenario.jobId, createExecutionRuntime(f.environment)),
        runResearchJob(scenario.jobId, createExecutionRuntime(f.environment))]);
      expect(results.map(result => result.state).sort()).toEqual(["already-claimed", "unavailable"]);
      expect((await f.evidence.read(scenario.id))?.providerCalls).toBe(1);
      expect(f.forbiddenFetch).not.toHaveBeenCalled();
    } finally { await f.fixture.dispose(); }
  });
  it.each(["null", "throw", "undefined"] as const)("does not mark a fault for an R2 %s outcome", async (outcome) => {
    const f = runtimeFixture(); const scenario = SCENARIOS[1]!;
    try {
      await f.start(scenario.id); f.storage.setPutResult(outcome);
      expect((await runResearchJob(scenario.jobId, createExecutionRuntime(f.environment))).state).toBe("unavailable");
      expect(f.storage.objects.size).toBe(0);
      expect((await f.evidence.read(scenario.id))?.fault).toBe(null);
    } finally { await f.fixture.dispose(); }
  });
});

let counter = 0;
const reportName = () => `t15p3-test-${Date.now()}-${counter++}`;
const buildSmoke = async (profile: unknown = "cloud") => {
  const builder = await import("../../scripts/build-research-executor-smoke.mjs");
  return builder.buildSmoke({ profile, reportName: reportName() });
};
afterEach(() => { buildProbe.mutation = ""; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("smoke build boundary", () => {
  it.each(["cloud", "local"])("builds the actual %s graph and separate production control", async (profile) => {
    const report = await buildSmoke(profile);
    expect(report).toMatchObject({ status: "passed", profile, deployable: profile === "cloud" });
    expect(report.executor.exports).toEqual(["ResearchWorkflow", "default"]);
    expect(report.site.exports).toEqual(["default"]);
    expect(report.aliasEdges.filter((edge: { kind: string }) => edge.kind === "runtime-rewrite")).toHaveLength(2);
    expect(report.aliasEdges.filter((edge: { kind: string }) => edge.kind === "runtime-bypass")).toHaveLength(1);
    expect(report.protectedBefore).toEqual(report.protectedAfter);
    expect(report.production.inputs.some((path: string) => path.includes("smoke") || path.startsWith("tests/"))).toBe(false);
    for (const graph of [report.executor, report.production]) {
      expect(graph.inputs).toContain("worker/research-executor/maintenance-policy.ts");
    }
    expect(report.inputHashes["worker/research-executor/maintenance-policy.ts"])
      .toBe(createHash("sha256").update(await readFile("worker/research-executor/maintenance-policy.ts")).digest("hex"));
    expect(report.site.inputs).toContain("worker/research-executor-smoke/replay.ts");
    expect(report.site.inputs).toContain("app/server/research/remote-public-reader.ts");
    expect(await readFile(report.production.output, "utf8"))
      .not.toMatch(/__local\/|\/_smoke\/|synthetic-task15|SMOKE_REPLAY_APPROVAL_JSON|SMOKE_REPLAY_INVENTORY_SHA256|arc-smoke-replay-v1/u);
    expect(report.timing.long).toEqual(profile === "cloud" ? { headersMs: 1_140_000, bodyMs: 30_000 } : { headersMs: 50, bodyMs: 25 });
    expect(report.policy).toMatchObject({ timeout: "21 minutes", retries: 0, providerDeadlineMs: 1_200_000 });
    if (profile === "cloud") {
      expect(report.executor.inputs).toContain("tests/fixtures/research/valid-candidate.ts");
      expect(report.executor.inputs.some((path: string) => path.includes("cloud-smoke-local") || path.startsWith("tests/helpers/"))).toBe(false);
    }
  }, 30_000);
  it("refuses an unsupported profile and extra runtime options", async () => {
    await expect(buildSmoke("preview")).rejects.toThrow(/profile/iu);
    const builder = await import("../../scripts/build-research-executor-smoke.mjs");
    await expect(builder.buildSmoke({ profile: "cloud", reportName: reportName(), duration: 1 })).rejects.toThrow(/option/iu);
  });
  it.each([
    ["missing-edge", /runtime.*edge/iu], ["extra-edge", /runtime.*edge/iu],
    ["unexpected-importer", /runtime.*importer/iu], ["cycle", /cycle/iu],
    ["exports", /export/iu], ["default-export", /export/iu], ["local-leak", /local.*(input|graph)|forbidden/iu],
    ...["SMOKE_REPLAY_APPROVAL_JSON", "SMOKE_REPLAY_INVENTORY_SHA256", "arc-smoke-replay-v1"].map(value => [`production-text:${value}`, /production/iu]),
    ...["worker/research-executor-smoke/replay.ts", "app/server/research/remote-public-reader.ts"].map(value => [`missing-site:${value}`, /site.*replay/iu]),
  ])("rejects %s without changing protected source", async (mutation, reason) => {
    buildProbe.mutation = mutation as string;
    const name = reportName();
    const builder = await import("../../scripts/build-research-executor-smoke.mjs");
    await expect(builder.buildSmoke({ profile: "cloud", reportName: name })).rejects.toThrow(reason as RegExp);
    const rejected = JSON.parse(await readFile(resolve("outputs/local-durable-executor-20260914/task15-smoke/build/cloud", name, "report.json"), "utf8"));
    expect(rejected).toMatchObject({ status: "failed", deployable: false });
    expect(rejected.protectedAfter).toEqual(rejected.protectedBefore);
  }, 30_000);
});

describe("scheduled delegation", () => {
  afterEach(() => { vi.doUnmock("../../worker/research-executor/index"); vi.resetModules(); });
  it.each(["ok", "full", "failure"])("delegates actual work even when the Cron observer is %s", async (state) => {
    const f = runtimeFixture();
    let finish!: () => void;
    const work = new Promise<void>(resolve => { finish = resolve; });
    const delegated = vi.fn((_event, _environment, context: ExecutionContext) => context.waitUntil(work));
    vi.doMock("../../worker/research-executor/index", () => ({ default: { fetch: vi.fn(), scheduled: delegated } }));
    vi.resetModules();
    try {
      if (state === "full") for (let i = 0; i < 256; i++) f.fixture.executorDb.database.prepare(
        "INSERT INTO smoke_cron_events(event_id,phase,at,outcome) VALUES(?1,'start',?2,NULL)").run(`cron-${i}`, i);
      if (state === "failure") f.fixture.executorDb.database.exec("DROP TABLE smoke_cron_events");
      const entry = (await import("../../worker/research-executor-smoke/executor-entry")).default;
      const waits: Promise<unknown>[] = [];
      const context = { waitUntil(promise: Promise<unknown>) { expect(this).toBe(context); waits.push(promise); } } as ExecutionContext;
      entry.scheduled({ scheduledTime: Date.now() } as ScheduledController, f.environment, context);
      expect(delegated).toHaveBeenCalledOnce(); expect(waits).toHaveLength(1);
      finish(); await Promise.all(waits);
      if (state === "ok") expect(await f.evidence.readCron()).toMatchObject([{ phase: "start", outcome: null }, { phase: "end", outcome: "ok" }]);
      expect(f.forbiddenFetch).not.toHaveBeenCalled();
    } finally { finish(); await f.fixture.dispose(); }
  });
  it("records rejected maintenance as error and keeps the delegated waitUntil rejection", async () => {
    const f = runtimeFixture();
    vi.doMock("../../worker/research-executor/index", () => ({ default: { fetch: vi.fn(), scheduled: (_e: unknown, _env: unknown, ctx: ExecutionContext) => {
      ctx.waitUntil(Promise.reject(Error("Actual delegated failure")));
    } } }));
    vi.resetModules();
    try {
      const entry = (await import("../../worker/research-executor-smoke/executor-entry")).default;
      const waits: Promise<unknown>[] = [];
      entry.scheduled({ scheduledTime: Date.now() } as ScheduledController, f.environment,
        { waitUntil(p: Promise<unknown>) { waits.push(p); } } as ExecutionContext);
      await expect(Promise.all(waits)).rejects.toThrow("Actual delegated failure");
      expect((await f.evidence.readCron()).find(row => row.phase === "end")?.outcome).toBe("error");
    } finally { await f.fixture.dispose(); }
  });
});

describe("local-only native binding controls", () => {
  it("awaits the delegated scheduled promises and returns a failure when they reject", async () => {
    const f = runtimeFixture();
    try {
      const smoke = (await import("../../worker/research-executor-smoke/executor-entry")).default;
      const entry = (await import("../fixtures/research/cloud-smoke-local-executor-entry")).default;
      let finish!: () => void; let entered!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; });
      const work = new Promise<void>(resolve => { finish = resolve; });
      const delegated = vi.spyOn(smoke, "scheduled").mockImplementation((_e, _env, ctx) => { ctx.waitUntil(work); entered(); });
      const request = () => new Request("https://executor.test/__local/cron", { method: "POST" });
      let returned = false;
      const pending = entry.fetch(request(), f.environment).then(response => { returned = true; return response; });
      await started; expect(returned).toBe(false); finish();
      expect((await pending).status).toBe(200); expect(delegated).toHaveBeenCalledOnce();
      delegated.mockImplementation((_e, _env, ctx) => { ctx.waitUntil(Promise.reject(Error("scheduled failure"))); });
      expect((await entry.fetch(request(), f.environment)).status).toBe(503);
    } finally { await f.fixture.dispose(); }
  });
  it("looks up only a fixed scenario through the actual Workflow binding status API", async () => {
    const f = runtimeFixture();
    const status = vi.fn(async () => ({ status: "complete", output: { state: "unavailable" } }));
    const get = vi.fn(async (id: string) => ({ id, status }));
    f.environment.RESEARCH_WORKFLOW = { create: vi.fn(), get } as unknown as Workflow<{ jobId: string }>;
    try {
      const entry = (await import("../fixtures/research/cloud-smoke-local-executor-entry")).default;
      const request = (body: unknown) => new Request("https://executor.test/__local/workflow-status", { method: "POST", body: JSON.stringify(body) });
      expect(await (await entry.fetch(request({ scenarioId: "after-r2" }), f.environment)).json())
        .toEqual({ status: "complete", output: { state: "unavailable" } });
      expect(get).toHaveBeenCalledExactlyOnceWith(SCENARIOS[1]!.jobId);
      expect(status).toHaveBeenCalledOnce();
      for (const body of [{ jobId: SCENARIOS[0]!.jobId }, { scenarioId: "unknown" }, { scenarioId: "long", duration: 1 }]) {
        expect((await entry.fetch(request(body), f.environment)).status).toBe(400);
      }
      expect(get).toHaveBeenCalledOnce(); expect(f.forbiddenFetch).not.toHaveBeenCalled();
    } finally { await f.fixture.dispose(); }
  });
});

describe("actual bundled entrypoints with denied global fetch", () => {
  it("boots the cloud artifact in native Workerd and refuses a missing mandatory binding without egress", async () => {
    const report = await buildSmoke("cloud");
    const outbound = vi.fn(() => { throw Error("Native outbound denied"); });
    const native = new Miniflare({ modules: true, scriptPath: resolve(report.executor.output), cf: false,
      compatibilityDate: "2026-05-15", bindings: TEST_PRODUCTION_ENVIRONMENT,
      d1Databases: ["EXECUTOR_DB"], r2Buckets: ["EXECUTOR_RECEIPTS"],
      workflows: { RESEARCH_WORKFLOW: { name: "task15-build-negative", className: "ResearchWorkflow" } },
      outboundService: outbound });
    try {
      const response = await native.dispatchFetch("https://executor.test/internal/research-bridge/submit", { method: "POST", body: "{}" });
      expect(response.status).toBe(503); expect(await response.text()).toBe("{}");
      expect(outbound).not.toHaveBeenCalled();
    } finally { await native.dispose(); }
  }, 60_000);
  it.each(["cloud", "local"])("exercises the sealed %s Workflow and Worker composition", async (profile) => {
    const report = await buildSmoke(profile);
    const f = runtimeFixture(); const scenario = SCENARIOS[1]!;
    try {
      const entry = await import(/* @vite-ignore */ resolve(report.executor.output)) as typeof import("../../worker/research-executor-smoke/executor-entry");
      const scheduled: Promise<unknown>[] = [];
      entry.default.scheduled({ scheduledTime: Date.now() } as ScheduledController, f.environment,
        { waitUntil(promise: Promise<unknown>) { scheduled.push(promise); } } as ExecutionContext);
      await Promise.all(scheduled);
      expect(vi.mocked(f.binding.fetch).mock.calls.map(([request]) => request instanceof Request ? new URL(request.url).pathname : null))
        .toContain("/api/internal/research-bridge/maintenance");
      expect(f.forbiddenFetch).not.toHaveBeenCalled();
      await f.start(scenario.id);
      const missing = Object.defineProperties({}, Object.getOwnPropertyDescriptors(f.environment));
      Object.defineProperty(missing, "SMOKE_SITE", { value: undefined });
      const missingEnvironment = missing as typeof f.environment;
      expect((await entry.default.fetch(new Request("https://executor.test/internal/research-bridge/status", { method: "POST" }), missingEnvironment)).status).toBe(503);
      const event = { payload: { jobId: scenario.jobId }, instanceId: scenario.jobId, timestamp: new Date(), workflowName: "ResearchWorkflow" };
      const step = { do: vi.fn(async (_name, _policy, work: () => Promise<unknown>) => work()) };
      await expect(new entry.ResearchWorkflow({} as ExecutionContext, missingEnvironment).run(event, step as never)).rejects.toThrow();
      expect(step.do).not.toHaveBeenCalled();
      const result = await new entry.ResearchWorkflow({} as ExecutionContext, f.environment).run(event, step as never);
      expect(result).toEqual({ jobId: scenario.jobId, state: "unavailable", receiptHash: null });
      expect(step.do).toHaveBeenCalledWith("research-once", { retries: { limit: 0, delay: "1 second" }, timeout: "21 minutes" }, expect.any(Function));
      expect(await f.evidence.read(scenario.id)).toMatchObject({ providerCalls: 1, fault: { marker: "after-r2" } });
      expect(f.forbiddenFetch).not.toHaveBeenCalled(); expect(f.keyRead).not.toHaveBeenCalled();
      if (profile === "cloud") expect((await entry.default.fetch(new Request("https://executor.test/__local/cron", { method: "POST" }), f.environment)).status).toBe(404);
      const site = await import(/* @vite-ignore */ resolve(report.site.output)) as typeof import("../../worker/research-executor-smoke/site-entry");
      const response = await site.default.fetch(await f.fixture.makeRequest("status", "long"), f.fixture.environment);
      expect(response.status).toBe(200);
      expect(f.forbiddenFetch).not.toHaveBeenCalled();
    } finally { await f.fixture.dispose(); }
  }, 30_000);

  it.each(["cloud", "local"])("stops scheduled work and signed admission through the sealed %s bundle", async profile => {
    const report = await buildSmoke(profile);
    const f = runtimeFixture();
    try {
      // Seed an authentic envelope through the existing signed fixture, then test a new identity.
      await f.start("long");
      const stored = await new D1BridgeJobStore(f.environment.EXECUTOR_DB).get(SCENARIOS[0]!.jobId);
      expect(stored).not.toBeNull();
      const unknown = { ...stored!.job, jobId: SCENARIOS[1]!.jobId };
      const environment = Object.defineProperties({}, Object.getOwnPropertyDescriptors(f.environment));
      Object.defineProperty(environment, "ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED", { value: "false" });
      const entry = await import(/* @vite-ignore */ resolve(report.executor.output)) as typeof import("../../worker/research-executor-smoke/executor-entry");
      const beforeCron = f.fixture.executorDb.database.prepare("SELECT * FROM smoke_cron_events ORDER BY event_id,phase").all();
      const context = { waitUntil: vi.fn() } as unknown as ExecutionContext;
      entry.default.scheduled({ scheduledTime: Date.now() } as ScheduledController, environment as typeof f.environment, context);
      await Promise.resolve();
      expect(context.waitUntil).not.toHaveBeenCalled();
      expect(f.fixture.executorDb.database.prepare("SELECT * FROM smoke_cron_events ORDER BY event_id,phase").all()).toEqual(beforeCron);
      const connection = readResearchBridgeConnection(TEST_PRODUCTION_ENVIRONMENT)!;
      const client = new ExecutorBridgeClient(new BridgeTransport({ connection,
        nonces: new D1BridgeNonceStore(f.fixture.siteDb as unknown as D1Database),
        fetch: request => entry.default.fetch(request, environment as typeof f.environment),
        wallNow: Date.now, monoNow: () => performance.now() }));
      await expect(client.submit(unknown)).rejects.toMatchObject({ kind: "closed" });
      expect(await new D1BridgeJobStore(f.environment.EXECUTOR_DB).get(unknown.jobId)).toBeNull();
      expect(f.environment.RESEARCH_WORKFLOW.create).not.toHaveBeenCalled();
      expect(f.environment.RESEARCH_WORKFLOW.get).not.toHaveBeenCalled();
      expect(f.binding.fetch).not.toHaveBeenCalled();
      expect(f.forbiddenFetch).not.toHaveBeenCalled();
      expect(f.keyRead).not.toHaveBeenCalled();
    } finally { await f.fixture.dispose(); }
  }, 30_000);
});
