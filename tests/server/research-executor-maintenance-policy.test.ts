// @vitest-environment node

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import productionWorker from "../../worker/research-executor/index";
import smokeWorker from "../../worker/research-executor-smoke/executor-entry";
import type { ExecutorEnvironment } from "../../worker/research-executor/environment";
import { createHttpRuntime } from "../../worker/research-executor/runtime";
import { createHttpRuntime as createSmokeHttpRuntime } from "../../worker/research-executor-smoke/runtime";
import { TEST_BRIDGE_ENVIRONMENT } from "../helpers/research-bridge-fixture";
import { SqliteD1 } from "../helpers/sqlite-d1";

vi.mock("cloudflare:workers", () => ({ WorkflowEntrypoint: class {} }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function untouchedEnvironment(value: string) {
  const touched = vi.fn(() => { throw new Error("unexpected resource access"); });
  const environment = Object.defineProperties({ ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED: value },
    Object.fromEntries(["EXECUTOR_DB", "EXECUTOR_RECEIPTS", "RESEARCH_WORKFLOW", "OPENROUTER_API_KEY"]
      .map(name => [name, { get: touched }])));
  return { environment: environment as ExecutorEnvironment, touched };
}

describe.each([["production", productionWorker], ["smoke", smokeWorker]] as const)("%s maintenance entrypoint", (_name, entry) => {
  it("stops before resources, observation, outbound work or waitUntil when disabled", async () => {
    const { environment, touched } = untouchedEnvironment("false");
    const outbound = vi.fn(() => { throw new Error("unexpected outbound request"); });
    vi.stubGlobal("fetch", outbound);
    const context = { waitUntil: vi.fn() } as unknown as ExecutionContext;
    expect(() => entry.scheduled({ scheduledTime: Date.now() } as ScheduledController, environment, context)).not.toThrow();
    await Promise.resolve();
    expect(touched).not.toHaveBeenCalled();
    expect(context.waitUntil).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });

  it.each(["FALSE", "", "secret-marker"])("rejects invalid mode %j generically before resource access", async value => {
    const { environment, touched } = untouchedEnvironment(value);
    const context = { waitUntil: vi.fn() } as unknown as ExecutionContext;
    expect(() => entry.scheduled({ scheduledTime: Date.now() } as ScheduledController, environment, context))
      .toThrow(/^Executor maintenance configuration unavailable$/u);
    await Promise.resolve();
    expect(touched).not.toHaveBeenCalled();
    expect(context.waitUntil).not.toHaveBeenCalled();
  });

  it.each([undefined, "true"])("preserves enabled maintenance and observations for %j", async value => {
    const db = new SqliteD1();
    for (const migration of ["0001_research_executor_jobs.sql", "0002_research_executor_results.sql",
      "0003_research_executor_maintenance.sql"]) {
      db.database.exec(readFileSync(`worker/research-executor/migrations/${migration}`, "utf8")
        .replaceAll("--> statement-breakpoint", ";"));
    }
    db.database.exec(readFileSync("worker/research-executor-smoke/migrations/0000_smoke_evidence.sql", "utf8"));
    db.database.prepare("UPDATE research_executor_maintenance_schedule SET generation=generation+1,lease_until=?1 WHERE singleton=1")
      .run(Date.now() + 60_000);
    const environment = { ...TEST_BRIDGE_ENVIRONMENT, ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED: value,
      EXECUTOR_DB: db as unknown as D1Database,
      EXECUTOR_RECEIPTS: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as R2Bucket,
      RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() } as never,
      get OPENROUTER_API_KEY(): never { throw new Error("unexpected Provider key read"); } };
    const work: Promise<unknown>[] = [];
    try {
      entry.scheduled({ scheduledTime: Date.now() } as ScheduledController, environment,
        { waitUntil: (promise: Promise<unknown>) => work.push(promise) } as unknown as ExecutionContext);
      expect(work).toHaveLength(1);
      await expect(work[0]).resolves.toEqual({ visited: [0, 0, 0] });
      expect(db.database.prepare("SELECT phase,outcome FROM smoke_cron_events ORDER BY phase DESC").all())
        .toEqual(entry === smokeWorker ? [{ phase: "start", outcome: null }, { phase: "end", outcome: "ok" }] : []);
    } finally { db.close(); }
  });

  it.each([undefined, "true"])("preserves scheduled rejection for %j", async value => {
    const db = new SqliteD1();
    db.database.exec(readFileSync("worker/research-executor-smoke/migrations/0000_smoke_evidence.sql", "utf8"));
    const environment = { ...TEST_BRIDGE_ENVIRONMENT, ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED: value,
      EXECUTOR_DB: db as unknown as D1Database,
      EXECUTOR_RECEIPTS: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as R2Bucket,
      RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() } as never };
    const work: Promise<unknown>[] = [];
    try {
      entry.scheduled({ scheduledTime: Date.now() } as ScheduledController, environment,
        { waitUntil: (promise: Promise<unknown>) => work.push(promise) } as unknown as ExecutionContext);
      expect(work).toHaveLength(1);
      await expect(work[0]).rejects.toThrow();
      expect(db.database.prepare("SELECT phase,outcome FROM smoke_cron_events ORDER BY phase DESC").all())
        .toEqual(entry === smokeWorker ? [{ phase: "start", outcome: null }, { phase: "end", outcome: "error" }] : []);
    } finally { db.close(); }
  });
});

it.each(["FALSE", "", "secret-marker"])("rejects invalid HTTP maintenance mode %j before constructing stores", value => {
  const { environment, touched } = untouchedEnvironment(value);
  expect(() => createHttpRuntime(environment)).toThrow(/^Executor maintenance configuration unavailable$/u);
  expect(touched).not.toHaveBeenCalled();
});

it("preserves disabled maintenance through the sealed smoke HTTP environment", () => {
  const db = new SqliteD1();
  const keyRead = vi.fn(() => { throw new Error("Provider key forbidden"); });
  const outbound = vi.fn(() => { throw new Error("outbound forbidden"); });
  vi.stubGlobal("fetch", outbound);
  const environment = { ...TEST_BRIDGE_ENVIRONMENT, ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED: "false",
    ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "true", EXECUTOR_DB: db as unknown as D1Database,
    EXECUTOR_RECEIPTS: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as R2Bucket,
    RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() } as never, SMOKE_SITE: { fetch: outbound } };
  Object.defineProperty(environment, "OPENROUTER_API_KEY", { get: keyRead });
  try {
    const runtime = createSmokeHttpRuntime(environment);
    expect(runtime).toMatchObject({ maintenanceEnabled: false, acceptNew: false });
    expect(runtime.forRequest(() => undefined, new AbortController().signal))
      .toMatchObject({ maintenanceEnabled: false, acceptNew: false });
    expect(keyRead).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  } finally { db.close(); }
});
