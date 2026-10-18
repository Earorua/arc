// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { D1BridgeNonceStore } from "../../app/server/research/executor/d1-nonce-store";
import { ExecutorBridgeClient } from "../../app/server/research/executor/executor-client";
import { BridgeTransport } from "../../app/server/research/executor/http-transport";
import { createProductionSiteBridgeHandler } from "../../app/server/research/site-bridge-factory";
import type { ExecutorEnvironment } from "../../worker/research-executor/environment";
import { createExecutorBridgeHandler } from "../../worker/research-executor/http-routes";
import { createExecutionRuntime, createHttpRuntime, createMaintenanceRuntime } from "../../worker/research-executor/runtime";
import { validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createResearchBridgeFixture, TEST_BRIDGE_ENVIRONMENT } from "../helpers/research-bridge-fixture";
import { SqliteD1 } from "../helpers/sqlite-d1";

const cleanup: (() => void)[] = [];
const forbidden: ReturnType<typeof vi.fn>[] = [];
afterEach(() => {
  for (const spy of forbidden.splice(0)) expect(spy).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  for (const dispose of cleanup.splice(0)) dispose();
});

async function fixture() {
  const f = await createResearchBridgeFixture();
  const executorDb = new SqliteD1(":memory:");
  for (const name of ["0000_research_bridge_nonces.sql", "0001_research_executor_jobs.sql",
    "0002_research_executor_results.sql", "0003_research_executor_maintenance.sql"]) {
    executorDb.database.exec(readFileSync(resolve(process.cwd(), "worker/research-executor/migrations", name), "utf8").replaceAll("--> statement-breakpoint", ";"));
  }
  cleanup.push(() => { executorDb.close(); f.db.close(); f.clientDb.close(); });
  forbidden.push(vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Global network forbidden")));
  const executorBinding = { fetch: vi.fn(async (request: Request) => f.executorFetch(request)) };
  const siteEnvironment = { ...f.environment, ARC_AI_RESEARCH_BRIDGE_TRANSPORT: "service-binding-v1",
    ARC_RESEARCH_EXECUTOR: executorBinding };
  const handler = createProductionSiteBridgeHandler({ environment: siteEnvironment,
    getD1: () => f.db as unknown as D1Database, wallNow: f.wallNow, monoNow: f.monoNow });
  const siteBinding = { fetch: vi.fn(async (request: Request) => handler(request)) };
  const workflow = { create: vi.fn(async ({ id }: { id: string }) => ({ id })), get: vi.fn() };
  // These tests exercise bridge composition, so receipt storage must remain untouched.
  const unused = vi.fn(async () => { throw new Error("Unexpected receipt storage"); }); forbidden.push(unused);
  const environment: ExecutorEnvironment = { ...TEST_BRIDGE_ENVIRONMENT,
    ARC_AI_RESEARCH_BRIDGE_TRANSPORT: "service-binding-v1", ARC_RESEARCH_SITE: siteBinding,
    EXECUTOR_DB: executorDb as unknown as D1Database,
    EXECUTOR_RECEIPTS: { get: unused, put: unused, delete: unused } as unknown as R2Bucket,
    RESEARCH_WORKFLOW: workflow as never, ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "true" };
  const clocks = { wallNow: f.wallNow, monoNow: f.monoNow };
  return { f, executorDb, environment, siteEnvironment, executorBinding, siteBinding, handler, workflow, clocks };
}

describe("production private bridge composition", () => {
  it("uses the Site binding from the Executor HTTP request-scoped factory for signed acceptance", async () => {
    const s = await fixture();
    const runtime = createHttpRuntime(s.environment, s.clocks);
    const client = new ExecutorBridgeClient(new BridgeTransport({ connection: s.f.connection,
      nonces: new D1BridgeNonceStore(s.f.clientDb as unknown as D1Database),
      fetch: createExecutorBridgeHandler(runtime), ...s.clocks }));
    const accepted = await client.submit(s.f.execution.job);
    expect(accepted).toMatchObject({ jobId: s.f.execution.jobId, workflowId: s.f.execution.jobId });
    expect(await s.f.bridge.readAcceptance(s.f.identity)).toEqual(accepted);
    expect(s.siteBinding.fetch).toHaveBeenCalledOnce(); expect(s.workflow.create).toHaveBeenCalledOnce();
    expect(new URL(s.siteBinding.fetch.mock.calls[0]![0].url).pathname).toBe("/api/internal/research-bridge/accepted");
  });

  it("keeps execution bridge calls private and sends Provider requests only to the distinct Provider transport", async () => {
    const s = await fixture();
    const providerFetch = vi.fn<typeof fetch>(async () => Response.json({
      id: "synthetic-generation", model: "moonshotai/kimi-k3",
      choices: [{ message: { content: JSON.stringify(validResearchCandidate) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.000001 },
    }));
    const runtime = createExecutionRuntime({ ...s.environment, OPENROUTER_API_KEY: "synthetic-provider-key" },
      { ...s.clocks, providerFetch });
    const begin = await runtime.site.begin(s.f.execution.job);
    expect(begin.grant.jobId).toBe(s.f.execution.jobId);
    expect(await runtime.provider.research({ role: "Frontend Engineer", locale: "en-US" }))
      .toMatchObject({ actualModel: "moonshotai/kimi-k3", candidate: validResearchCandidate });
    expect(s.siteBinding.fetch).toHaveBeenCalledOnce(); expect(providerFetch).toHaveBeenCalledOnce();
    expect(providerFetch.mock.calls[0]![0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(JSON.parse(providerFetch.mock.calls[0]![1]!.body as string)).toMatchObject({ max_tokens: 32768 });
    expect(new URL(s.siteBinding.fetch.mock.calls[0]![0].url).origin).toBe(s.f.connection.siteOrigin);
  });

  it("pulls a signed receipt through the Site callback binding with admission closed", async () => {
    const s = await fixture();
    s.siteEnvironment.ARC_AI_ENABLED = "false"; s.siteEnvironment.ARC_AI_RESEARCH_ENABLED = "false";
    const runtime = createHttpRuntime(s.environment, s.clocks);
    const acknowledgement = await runtime.site.complete(s.f.execution.job, await s.f.notice());
    expect(acknowledgement).toMatchObject({ jobId: s.f.execution.jobId, receiptHash: (await s.f.metadata()).receiptHash });
    expect(s.executorBinding.fetch).toHaveBeenCalledOnce();
    expect(new URL(s.executorBinding.fetch.mock.calls[0]![0].url).pathname).toBe("/internal/research-bridge/result");
    expect(await s.f.research.getPublicRun("owner-a", s.f.execution.runId)).toMatchObject({ state: "ready" });
  });

  it("uses the private binding in both maintenance root and signal-scoped calls with new admission disabled", async () => {
    const s = await fixture();
    s.siteEnvironment.ARC_AI_ENABLED = "false"; s.siteEnvironment.ARC_AI_RESEARCH_ENABLED = "false";
    const runtime = createMaintenanceRuntime({ ...s.environment, ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "false" }, s.clocks);
    const signal = new AbortController().signal;
    expect(await runtime.site.outbox()).toEqual({ jobs: [], next: null });
    expect(await runtime.site.outbox({ signal })).toEqual({ jobs: [], next: null });
    await runtime.site.maintenance({ signal });
    expect(s.siteBinding.fetch.mock.calls.map(([request]) => new URL(request.url).pathname))
      .toEqual(["/api/internal/research-bridge/outbox", "/api/internal/research-bridge/outbox", "/api/internal/research-bridge/maintenance"]);
  });

  it.each(["missing", "invalid", "unknown-mode"])("fails closed for %s private transport across all runtime factories", async mode => {
    const s = await fixture(); const fallback = vi.fn();
    const environment = { ...s.environment, ARC_RESEARCH_SITE: mode === "invalid" ? { fetch: "bad" } : undefined,
      ARC_AI_RESEARCH_BRIDGE_TRANSPORT: mode === "unknown-mode" ? "unknown" : "service-binding-v1" } as unknown as ExecutorEnvironment;
    for (const create of [createHttpRuntime, createExecutionRuntime, createMaintenanceRuntime]) {
      expect(() => create(environment, { ...s.clocks, bridgeFetch: fallback, providerFetch: fallback })).toThrow("Executor runtime unavailable");
    }
    const getD1 = vi.fn(() => s.f.db as unknown as D1Database);
    const handler = createProductionSiteBridgeHandler({ environment: { ...s.siteEnvironment, ARC_RESEARCH_EXECUTOR: undefined }, getD1, fetch: fallback });
    expect((await handler(new Request("https://site.test/api/internal/research-bridge/begin"))).status).toBe(503);
    expect(getD1).not.toHaveBeenCalled(); expect(fallback).not.toHaveBeenCalled();
  });
});
