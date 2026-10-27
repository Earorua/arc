// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { BridgeJob } from "../../app/server/research/executor/job";
import type { ProductionSiteBridgeRuntime } from "../../app/server/research/site-bridge-factory";
import type { ExecutorRuntimeOverrides } from "../../worker/research-executor/runtime";
import { OpenRouterResearchProvider } from "../../app/server/research/openrouter-provider";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../../app/server/research/execution-policy";
import { BRIDGE_BODY_LIMITS } from "../../app/server/research/executor/body";
import { SqliteD1 } from "../helpers/sqlite-d1";
import { D1SmokeEvidence } from "../../worker/research-executor-smoke/evidence";
import { createBridgeFetch, createSyntheticProviderFetch, waitForSmokeDelay } from "../../worker/research-executor-smoke/transports";
import { validateResearchCandidate } from "../../app/server/research/package-validator";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createSiteImportFixture } from "../helpers/site-import-fixture";
import { SCENARIOS, candidateForScenario, parseScenarioId, scenarioForJob } from "../../worker/research-executor-smoke/scenarios";
import { SMOKE_TIMING, type SmokeTiming } from "../../worker/research-executor-smoke/timing";

const forbiddenFetch = vi.fn<typeof globalThis.fetch>(() => { throw new Error("Network forbidden"); });
beforeEach(() => { forbiddenFetch.mockClear(); vi.stubGlobal("fetch", forbiddenFetch); });
afterEach(() => { expect(forbiddenFetch).not.toHaveBeenCalled(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function evidenceDb() {
  const db = new SqliteD1();
  db.database.exec(readFileSync("worker/research-executor-smoke/migrations/0000_smoke_evidence.sql", "utf8"));
  return { db, evidence: new D1SmokeEvidence(db as unknown as D1Database) };
}
async function fixtureJob(index = 0): Promise<BridgeJob> {
  const fixture = await createSiteImportFixture();
  try { const s = SCENARIOS[index]!; return { ...fixture.execution.job, jobId: s.jobId, requestId: s.requestId, role: s.role, locale: s.locale }; }
  finally { fixture.db.close(); }
}
function provider(fetch: typeof globalThis.fetch) {
  return new OpenRouterResearchProvider({ OPENROUTER_API_KEY: "synthetic-smoke-sentinel", ARC_AI_MODEL_RESEARCH: KIMI_RESEARCH_EXECUTION_POLICY.model,
    researchProfile: KIMI_RESEARCH_EXECUTION_POLICY.profileId, researchTimeoutMs: 1_200_000 }, { fetch });
}
function nextProviderWrite(evidence: D1SmokeEvidence): Promise<void> {
  let started!: () => void;
  const promise = new Promise<void>(resolve => { started = resolve; });
  vi.spyOn(evidence, "increment").mockImplementation(async (jobId, counter) => {
    await D1SmokeEvidence.prototype.increment.call(evidence, jobId, counter);
    if (counter === "provider") started();
  });
  return promise;
}
const immediate: SmokeTiming = { long: { headersMs: 0, bodyMs: 0 }, "after-r2": { headersMs: 0, bodyMs: 0 }, "after-d1": { headersMs: 0, bodyMs: 0 } };
async function adapterInput(job: BridgeJob) {
  let captured!: [Parameters<typeof globalThis.fetch>[0], RequestInit];
  await provider(async (input, init) => {
    captured = [input, init!];
    return Response.json({ model: KIMI_RESEARCH_EXECUTION_POLICY.model, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(candidateForScenario(scenarioForJob(job).id)),
      annotations: validAnnotations.map(({ type, url, title }) => ({ type, url_citation: { url, title } })) } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.000001, server_tool_use: { web_search_requests: 2 } } });
  }).research({ role: job.role, locale: job.locale });
  return captured;
}

describe("fixed smoke scenarios", () => {
  it("parses only exact IDs and matches an actual bridge job identity", async () => {
    const fixture = await createSiteImportFixture();
    try {
      for (const s of SCENARIOS) {
        expect(parseScenarioId(s.id)).toBe(s.id);
        const job = { ...fixture.execution.job, jobId: s.jobId, requestId: s.requestId, role: s.role, locale: s.locale };
        expect(scenarioForJob(job)).toEqual(s);
        for (const change of [{ jobId: fixture.execution.job.jobId }, { requestId: "unknown" }, { role: "Other Role" }, { locale: "zh-CN" as const }]) {
          expect(() => scenarioForJob({ ...job, ...change })).toThrow();
        }
      }
      expect(parseScenarioId("long")).toBe("long");
      for (const invalid of [null, {}, " long", "LONG", "after-r2 ", ["long"], "other"]) expect(() => parseScenarioId(invalid)).toThrow();
    } finally { fixture.db.close(); }
  });
  it("fixes cloud timing without environment or request overrides", () => {
    expect(SMOKE_TIMING).toEqual({ long: { headersMs: 1_140_000, bodyMs: 30_000 }, "after-r2": { headersMs: 10, bodyMs: 10 }, "after-d1": { headersMs: 10, bodyMs: 10 } });
    expect(Object.isFrozen(SMOKE_TIMING)).toBe(true);
    expect(Object.isFrozen(SMOKE_TIMING.long)).toBe(true);
  });
  it("isolates the global cache with three distinct valid role fixtures", async () => {
    expect(SCENARIOS.map(s => [s.id, s.role, s.roleId])).toEqual([
      ["long", "Data Product Manager", "data-product-manager"],
      ["after-r2", "Senior Data Product Manager", "senior-data-product-manager"],
      ["after-d1", "Lead Data Product Manager", "lead-data-product-manager"],
    ]);
    for (const field of ["ownerId", "otherOwnerId", "mutationId", "requestId", "jobId"] as const) {
      expect(new Set(SCENARIOS.map(s => s[field])).size).toBe(3);
    }
    expect(SCENARIOS.map(s => s.jobId)).toEqual([151, 152, 153].map(n => `00000000-0000-4000-8000-000000000${n}`));
    const fixture = await createSiteImportFixture();
    try {
      for (const scenario of SCENARIOS) {
        const candidate = candidateForScenario(scenario.id);
        expect(candidate.role).toEqual({ ...validResearchCandidate.role, name: scenario.role, id: scenario.roleId });
        expect({ ...candidate, role: validResearchCandidate.role }).toEqual(validResearchCandidate);
        expect(candidate).not.toBe(validResearchCandidate);
        expect(validateResearchCandidate(candidate, validAnnotations, fixture.execution.validationContext).ready).toBe(true);
      }
    } finally { fixture.db.close(); }
  });
});

describe("bounded durable smoke evidence", () => {
  it("preserves fixed start identity, immutable faults and bounded typed projections", async () => {
    const { db, evidence } = evidenceDb();
    try {
      await evidence.start("after-r2", 100);
      await evidence.start("after-r2", 200);
      await evidence.markFault(SCENARIOS[1]!.jobId, "after-r2", 300);
      await evidence.markFault(SCENARIOS[1]!.jobId, "after-r2", 400);
      expect(await evidence.read("after-r2")).toEqual({ scenarioId: "after-r2", jobId: SCENARIOS[1]!.jobId, ownerId: SCENARIOS[1]!.ownerId,
        mutationId: SCENARIOS[1]!.mutationId, requestId: SCENARIOS[1]!.requestId, startedAt: 100, providerCalls: 0, repairCalls: 0, rejections: 0,
        fault: { marker: "after-r2", at: 300 } });
      await expect(evidence.markFault(SCENARIOS[1]!.jobId, "after-d1", 500)).rejects.toThrow();
      expect(await evidence.read("long")).toBeNull();
      await expect(evidence.start("x".repeat(4097) as "long", 100)).rejects.toThrow();
      await expect(evidence.increment("x".repeat(4097), "provider")).rejects.toThrow();
      await expect(evidence.start("long", Number.MAX_SAFE_INTEGER + 1)).rejects.toThrow();
    } finally { db.close(); }
  });
  it("atomically adds concurrent counters from independent evidence instances", async () => {
    const { db, evidence } = evidenceDb();
    try {
      await evidence.start("long", 100);
      const peers = Array.from({ length: 8 }, () => new D1SmokeEvidence(db as unknown as D1Database));
      await Promise.all(Array.from({ length: 64 }, (_, i) => peers[i % 8]!.increment(SCENARIOS[0]!.jobId, "provider")));
      await evidence.increment(SCENARIOS[0]!.jobId, "repair");
      await evidence.increment(SCENARIOS[0]!.jobId, "rejection");
      expect(await evidence.read("long")).toMatchObject({ providerCalls: 64, repairCalls: 1, rejections: 1 });
      await expect(evidence.increment(SCENARIOS[1]!.jobId, "provider")).rejects.toThrow();
      await expect(evidence.increment(SCENARIOS[0]!.jobId, "raw-body" as "provider")).rejects.toThrow();
    } finally { db.close(); }
  });
  it("keeps bounded immutable Cron start/end evidence and rejects invalid values", async () => {
    const { db, evidence } = evidenceDb();
    try {
      await evidence.recordCron("cron-100", "start", 100);
      await evidence.recordCron("cron-100", "end", 200, "ok");
      await evidence.recordCron("cron-100", "start", 300);
      expect(await evidence.readCron()).toEqual([{ eventId: "cron-100", phase: "start", at: 100, outcome: null }, { eventId: "cron-100", phase: "end", at: 200, outcome: "ok" }]);
      await expect(evidence.recordCron("cron-100", "end", 300, "error")).rejects.toThrow();
      await expect(evidence.recordCron("x".repeat(65), "start", 100)).rejects.toThrow();
      await expect(evidence.recordCron("cron-200", "end", 100)).rejects.toThrow();
      await expect(evidence.recordCron("cron-200", "start", -1)).rejects.toThrow();
    } finally { db.close(); }
  });
  it("caps stored Cron rows and returns only the newest 64 without silently dropping new events", async () => {
    const { db, evidence } = evidenceDb();
    try {
      for (let i = 0; i < 128; i++) {
        await evidence.recordCron(`cron-${i}`, "start", i * 2);
        await evidence.recordCron(`cron-${i}`, "end", i * 2 + 1, "ok");
      }
      const events = await evidence.readCron();
      expect(events).toHaveLength(64); expect(events[0]!.at).toBe(192); expect(events.at(-1)!.at).toBe(255);
      await expect(evidence.recordCron("cron-128", "start", 256)).rejects.toThrow();
      await evidence.recordCron("cron-0", "start", 999);
      expect(db.database.prepare("SELECT COUNT(*) AS count FROM smoke_cron_events").get()!.count).toBe(256);
    } finally { db.close(); }
  });
  it("retains an increment committed before an ambiguous write failure", async () => {
    const { db, evidence } = evidenceDb();
    try {
      await evidence.start("long", 100);
      const failingDb = { prepare(sql: string) {
        const prepared = db.prepare(sql);
        return { bind(...values: unknown[]) { const bound = prepared.bind(...values); return { async run() { await bound.run(); throw new Error("lost write response"); } }; } };
      } } as unknown as D1Database;
      await expect(new D1SmokeEvidence(failingDb).increment(SCENARIOS[0]!.jobId, "provider")).rejects.toThrow("lost write response");
      expect(await evidence.read("long")).toMatchObject({ providerCalls: 1 });
    } finally { db.close(); }
  });
});

describe("sealed service binding fetch", () => {
  const origin = "https://site.test";
  const path = "/api/internal/research-bridge/begin";
  function request(url = origin + path, init: RequestInit = {}) {
    return new Request(url, { method: "POST", body: "{}", redirect: "manual", signal: new AbortController().signal, ...init });
  }
  it("routes every accepted private path to only its named binding and propagates abort", async () => {
    for (const [target, prefix, operations] of [
      ["site", "/api/internal/research-bridge/", ["begin", "accepted", "complete", "metadata", "maintenance", "outbox"]],
      ["executor", "/internal/research-bridge/", ["submit", "status", "close", "result", "acknowledge"]],
    ] as const) {
      const binding = { fetch: vi.fn(async (forwarded: Request) => { expect(forwarded.redirect).toBe("manual"); expect(await forwarded.text()).toBe("{}"); return Response.json({ ok: true }); }) };
      const fetch = createBridgeFetch(binding as unknown as Fetcher, origin, target);
      for (const operation of operations) expect((await fetch(request(origin + prefix + operation))).status).toBe(200);
      expect(binding.fetch).toHaveBeenCalledTimes(operations.length);
      const controller = new AbortController();
      await fetch(request(origin + prefix + operations[0], { signal: controller.signal }));
      controller.abort();
      expect(binding.fetch.mock.calls.at(-1)![0].signal.aborted).toBe(true);
    }
  });
  it("rejects missing binding, unknown target, noncanonical origin and cross audience before effects", () => {
    const binding = { fetch: vi.fn() };
    expect(() => createBridgeFetch(undefined as unknown as Fetcher, origin, "site")).toThrow();
    expect(() => createBridgeFetch(binding as unknown as Fetcher, origin, "other" as "site")).toThrow();
    for (const invalid of ["http://site.test", origin + "/path", origin + "?x=1", "https://u:p@site.test", "https://SITE.test"]) expect(() => createBridgeFetch(binding as unknown as Fetcher, invalid, "site")).toThrow();
    expect(binding.fetch).not.toHaveBeenCalled();
  });
  it.each([
    ["https://evil.test/api/internal/research-bridge/begin", {}],
    [origin + "/internal/research-bridge/submit", {}], [origin + path + "/", {}],
    [origin + path + "?delay=1", {}], [origin + path + "#x", {}],
    [origin + path, { method: "PUT" }], [origin + path, { redirect: "follow" }],
    [origin + path, { body: "x".repeat(BRIDGE_BODY_LIMITS.request + 1) }],
  ])("rejects bridge request %s %j before binding effect", async (url, init) => {
    const binding = { fetch: vi.fn() };
    await expect(createBridgeFetch(binding as unknown as Fetcher, origin, "site")(request(url, init as RequestInit))).rejects.toThrow();
    expect(binding.fetch).not.toHaveBeenCalled();
  });
  it("rejects already-aborted requests without a binding call", async () => {
    const binding = { fetch: vi.fn() }; const controller = new AbortController(); controller.abort();
    await expect(createBridgeFetch(binding as unknown as Fetcher, origin, "site")(request(undefined, { signal: controller.signal }))).rejects.toThrow();
    expect(binding.fetch).not.toHaveBeenCalled();
  });
  it("rejects a binding redirect without following it", async () => {
    const binding = { fetch: vi.fn(async () => new Response("", { status: 302, headers: { location: "https://evil.test" } })) };
    await expect(createBridgeFetch(binding as unknown as Fetcher, origin, "site")(request())).rejects.toThrow();
    expect(binding.fetch).toHaveBeenCalledOnce();
  });
  it("provides the factory fetch signature while rejecting alternate input and init", async () => {
    const binding = { fetch: vi.fn(async () => Response.json({})) };
    const fetch: typeof globalThis.fetch = createBridgeFetch(binding as unknown as Fetcher, origin, "site");
    const siteFetch: ProductionSiteBridgeRuntime["fetch"] = fetch;
    const executorFetch: ExecutorRuntimeOverrides["bridgeFetch"] = fetch;
    expect(siteFetch).toBe(executorFetch);
    await expect(fetch(origin + path)).rejects.toThrow();
    await expect(fetch(request(), { method: "PUT" })).rejects.toThrow();
    expect(binding.fetch).not.toHaveBeenCalled();
  });
});

describe("synthetic actual-adapter transport", () => {
  it("pins the accepted adapter system policy", async () => {
    const [, init] = await adapterInput(await fixtureJob());
    expect(createHash("sha256").update(JSON.parse(init.body as string).messages[0].content).digest("hex")).toBe("02a12e5a0ed8d2064ee24f1d3670f804649ca03cba11df20d3865b45c8ce8696");
  });
  it("runs two separate jobs through the unchanged adapter with isolated candidates and exact usage", async () => {
    const { db, evidence } = evidenceDb();
    try {
      const jobs = await Promise.all([fixtureJob(1), fixtureJob(2)]);
      for (const job of jobs) await evidence.start(scenarioForJob(job).id, 100);
      const results = await Promise.all(jobs.map(job => provider(createSyntheticProviderFetch({ currentJob: () => job, evidence, timing: immediate })).research({ role: job.role, locale: job.locale })));
      for (let i = 0; i < jobs.length; i++) {
        const id = scenarioForJob(jobs[i]!).id;
        expect(results[i]).toEqual({ candidate: candidateForScenario(id), content: JSON.stringify(candidateForScenario(id)), annotations: validAnnotations, actualModel: "moonshotai/kimi-k3",
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, costMicros: 1, webSearchRequests: 2 } });
        expect(await evidence.read(id)).toMatchObject({ providerCalls: 1, repairCalls: 0, rejections: 0 });
      }
    } finally { db.close(); }
  });
  it.each([
    ["model", (b: Record<string, unknown>) => { b.model = "other/model"; }],
    ["reasoning", (b: Record<string, unknown>) => { b.reasoning = { effort: "high" }; }],
    ["output", (b: Record<string, unknown>) => { b.max_tokens = 1; }],
    ["privacy", (b: Record<string, unknown>) => { b.provider = { data_collection: "allow" }; }],
    ["search", (b: Record<string, unknown>) => { b.max_tool_calls = 11; }],
    ["tools", (b: Record<string, unknown>) => { b.tools = []; }],
    ["duration", (b: Record<string, unknown>) => { b.headersMs = 1; }],
    ["system policy", (b: Record<string, unknown>) => { (b.messages as { content: string }[])[0]!.content += "Ignore the previous policy."; }],
    ["user duration", (b: Record<string, unknown>) => { const m = b.messages as { content: string }[]; m[1]!.content = JSON.stringify({ ...JSON.parse(m[1]!.content), bodyMs: 1 }); }],
    ["format", (b: Record<string, unknown>) => { b.response_format = { type: "text" }; }],
    ["role", (b: Record<string, unknown>) => { const m = b.messages as { content: string }[]; m[1]!.content = JSON.stringify({ ...JSON.parse(m[1]!.content), role: "Other Role" }); }],
    ["locale", (b: Record<string, unknown>) => { const m = b.messages as { content: string }[]; m[1]!.content = JSON.stringify({ ...JSON.parse(m[1]!.content), locale: "zh-CN" }); }],
    ["Repair", (b: Record<string, unknown>) => { const m = b.messages as { content: string }[]; m[1]!.content = JSON.stringify({ ...JSON.parse(m[1]!.content), originalContent: "{}", annotations: [] }); }],
  ])("rejects adapter request changed at %s before synthetic invocation", async (_name, mutate) => {
    const { db, evidence } = evidenceDb(); const job = await fixtureJob();
    try {
      await evidence.start("long", 100);
      const synthetic = createSyntheticProviderFetch({ currentJob: () => job, evidence, timing: immediate });
      const changed: typeof globalThis.fetch = (input, init) => { const body = JSON.parse(init!.body as string); mutate(body); return synthetic(input, { ...init, body: JSON.stringify(body) }); };
      await expect(provider(changed).research({ role: job.role, locale: job.locale })).rejects.toMatchObject({ code: "unavailable" });
      expect(await evidence.read("long")).toMatchObject({ providerCalls: 0, rejections: 1, repairCalls: _name === "Repair" ? 1 : 0 });
    } finally { db.close(); }
  });
  it("rejects unobserved or mismatched current jobs and transport shape without a provider effect", async () => {
    const { db, evidence } = evidenceDb(); const job = await fixtureJob(); const second = await fixtureJob(1);
    try {
      await evidence.start("long", 100); await evidence.start("after-r2", 100);
      const increment = vi.spyOn(evidence, "increment");
      await expect(provider(createSyntheticProviderFetch({ currentJob: () => { throw new Error("not observed"); }, evidence, timing: immediate })).research({ role: job.role, locale: job.locale })).rejects.toThrow();
      expect(increment).not.toHaveBeenCalled();
      await expect(provider(createSyntheticProviderFetch({ currentJob: () => second, evidence, timing: immediate })).research({ role: job.role, locale: job.locale })).rejects.toThrow();
      const synthetic = createSyntheticProviderFetch({ currentJob: () => job, evidence, timing: immediate });
      const [input, init] = await adapterInput(job);
      for (const [url, changed] of [["https://evil.test", init], [input, { ...init, method: "GET" }], [input, { ...init, redirect: "follow" }],
        [input, { ...init, signal: undefined }], [input, { ...init, body: "x".repeat(262_145) }], [input, { ...init, body: "{" }]] as const) {
        await expect(synthetic(url, changed as RequestInit)).rejects.toThrow();
      }
      expect(await evidence.read("long")).toMatchObject({ providerCalls: 0 });
      expect(await evidence.read("after-r2")).toMatchObject({ providerCalls: 0 });
    } finally { db.close(); }
  });
  it("holds real adapter headers and body for 19m30s using one deadline", async () => {
    const { db, evidence } = evidenceDb(); const job = await fixtureJob();
    try {
      await evidence.start("long", 100); vi.useFakeTimers();
      const started = nextProviderWrite(evidence);
      const done = vi.fn(); const pending = provider(createSyntheticProviderFetch({ currentJob: () => job, evidence, timing: SMOKE_TIMING })).research({ role: job.role, locale: job.locale }).then(done);
      await started; await vi.advanceTimersByTimeAsync(0); expect(vi.getTimerCount()).toBe(2);
      await vi.advanceTimersByTimeAsync(1_169_999); expect(done).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1); await pending; expect(done).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    } finally { db.close(); }
  });
  it("honors the unchanged adapter's shared 1,200,000ms header/body deadline", async () => {
    const { db, evidence } = evidenceDb(); const job = await fixtureJob();
    try {
      await evidence.start("long", 100); vi.useFakeTimers();
      const started = nextProviderWrite(evidence);
      const timing = { ...SMOKE_TIMING, long: { headersMs: 1_170_000, bodyMs: 60_000 } };
      const pending = provider(createSyntheticProviderFetch({ currentJob: () => job, evidence, timing })).research({ role: job.role, locale: job.locale });
      const rejected = expect(pending).rejects.toMatchObject({ code: "timeout" });
      await started; await vi.advanceTimersByTimeAsync(0); expect(vi.getTimerCount()).toBe(2);
      await vi.advanceTimersByTimeAsync(1_200_000); await rejected; expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(60_000); expect(vi.getTimerCount()).toBe(0);
    } finally { db.close(); }
  });
  it("clears header and body timers on abort/cancel with no late body delivery", async () => {
    const { db, evidence } = evidenceDb(); const job = await fixtureJob(); const [input, init] = await adapterInput(job);
    try {
      await evidence.start("long", 100); vi.useFakeTimers();
      const synthetic = createSyntheticProviderFetch({ currentJob: () => job, evidence, timing: SMOKE_TIMING });
      const controller = new AbortController();
      const started = nextProviderWrite(evidence);
      const pending = synthetic(input, { ...init, signal: controller.signal }); const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      await started; await vi.advanceTimersByTimeAsync(0); expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1); controller.abort(); await rejected; expect(vi.getTimerCount()).toBe(0);
      const bodyController = new AbortController();
      const bodyStarted = nextProviderWrite(evidence);
      const bodyPending = synthetic(input, { ...init, signal: bodyController.signal });
      await bodyStarted; await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1_140_000); const response = await bodyPending;
      await response.body!.cancel(); expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(30_001); expect(await response.body!.getReader().read()).toEqual({ done: true, value: undefined });
      const abortedStarted = nextProviderWrite(evidence);
      const abortedBody = synthetic(input, { ...init, signal: bodyController.signal });
      await abortedStarted; await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1_140_000); const abortedResponse = await abortedBody;
      const read = expect(abortedResponse.text()).rejects.toMatchObject({ name: "AbortError" }); bodyController.abort(); await read; expect(vi.getTimerCount()).toBe(0);
    } finally { db.close(); }
  });
  it.each(["headers", "body"])("does not complete %s after abort between timer firing and promise continuation", async phase => {
    const { db, evidence } = evidenceDb(); const job = await fixtureJob(); const [input, init] = await adapterInput(job);
    try {
      await evidence.start("long", 100); vi.useFakeTimers();
      const controller = new AbortController(); const started = nextProviderWrite(evidence);
      const timing = { ...immediate, long: { headersMs: phase === "headers" ? 10 : 0, bodyMs: 10 } };
      const pending = createSyntheticProviderFetch({ currentJob: () => job, evidence, timing })(input, { ...init, signal: controller.signal });
      await started; await vi.advanceTimersByTimeAsync(0);
      if (phase === "headers") {
        const failure = expect(pending).rejects.toMatchObject({ name: "AbortError" });
        vi.advanceTimersByTime(10); controller.abort(); await failure;
      } else {
        const response = await pending; const failure = expect(response.text()).rejects.toMatchObject({ name: "AbortError" });
        vi.advanceTimersByTime(10); controller.abort(); await failure;
      }
      expect(vi.getTimerCount()).toBe(0);
    } finally { db.close(); }
  });
});

describe("bounded delay primitive", () => {
  it("settles normal waits and clears abort listeners and timers", async () => {
    vi.useFakeTimers(); const controller = new AbortController(); const remove = vi.spyOn(controller.signal, "removeEventListener");
    const done = vi.fn(); const pending = waitForSmokeDelay(10, controller.signal).then(done);
    await vi.advanceTimersByTimeAsync(9); expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await pending; expect(remove).toHaveBeenCalledWith("abort", expect.any(Function)); expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects pre-aborted and invalid waits without timers", async () => {
    vi.useFakeTimers(); const controller = new AbortController(); controller.abort();
    await expect(waitForSmokeDelay(10, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    for (const ms of [-1, 0.1, NaN, Infinity, 1_170_001]) await expect(waitForSmokeDelay(ms, new AbortController().signal)).rejects.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
