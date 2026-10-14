// @vitest-environment node

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BRIDGE_AUTH_PROTOCOL } from "../../app/server/research/executor/auth";
import type { ReceiptNotice } from "../../app/server/research/executor/bridge-contract";
import { BridgeTransportError } from "../../app/server/research/executor/http-transport";
import { BRIDGE_EXECUTOR_MODE, BRIDGE_QUEUE_TTL_MS, hashBridgeJob,
  parseBridgeJob } from "../../app/server/research/executor/job";
import { BRIDGE_RECEIPT_RETENTION_MS, decodeBridgeProviderReceipt, encodeBridgeProviderReceipt,
  summarizeBridgeProviderReceipt } from "../../app/server/research/executor/receipt";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../../app/server/research/execution-policy";
import { createProductionSiteBridgeHandler } from "../../app/server/research/site-bridge-factory";
import { D1BridgeJobStore } from "../../worker/research-executor/d1-job-store";
import { deliverReceipt } from "../../worker/research-executor/delivery";
import { runResearchJob } from "../../worker/research-executor/execute-job";
import { runExecutorMaintenance } from "../../worker/research-executor/maintenance";
import { ExecutorMaintenanceStore } from "../../worker/research-executor/maintenance-store";
import { BridgeReceiptStoreError, ExecutorReceiptStore } from "../../worker/research-executor/receipt-store";
import { createExecutorBridgeHandler } from "../../worker/research-executor/http-routes";
import { createHttpRuntime, createMaintenanceRuntime } from "../../worker/research-executor/runtime";
import { validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createResearchBridgeFixture, TEST_BRIDGE_ENVIRONMENT,
  TEST_PRODUCTION_ENVIRONMENT } from "../helpers/research-bridge-fixture";
import { createSiteImportFixture, validReceipt } from "../helpers/site-import-fixture";
import { SqliteD1 } from "../helpers/sqlite-d1";

const BASE_TIME = 1_800_000_000_000;
const simulators: Miniflare[] = [];

function migration(name: string): string {
  return readFileSync(resolve(process.cwd(), "worker/research-executor/migrations", name), "utf8")
    .replaceAll("--> statement-breakpoint", ";");
}

function createExecutorDb(filename = ":memory:", sqlNow: () => number = () => BASE_TIME): SqliteD1 {
  const db = new SqliteD1(filename);
  db.database.exec("PRAGMA foreign_keys = ON");
  db.database.function("unixepoch", { varargs: true }, (...args: unknown[]) => {
    if (args[0] === "subsec") return sqlNow() / 1_000;
    return Math.floor(sqlNow() / 1_000);
  });
  for (const name of ["0000_research_bridge_nonces.sql", "0001_research_executor_jobs.sql",
    "0002_research_executor_results.sql", "0003_research_executor_maintenance.sql"]) {
    db.database.exec(migration(name));
  }
  return db;
}

function reopenExecutorDb(filename: string, sqlNow: () => number = () => BASE_TIME): SqliteD1 {
  const db = new SqliteD1(filename);
  db.database.exec("PRAGMA foreign_keys = ON");
  db.database.function("unixepoch", { varargs: true }, (...args: unknown[]) => {
    if (args[0] === "subsec") return sqlNow() / 1_000;
    return Math.floor(sqlNow() / 1_000);
  });
  return db;
}

async function createBucket(): Promise<R2Bucket> {
  const simulator = new Miniflare({ modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    compatibilityDate: "2026-05-15", cf: false, r2Buckets: ["RECEIPTS"] });
  simulators.push(simulator);
  return await simulator.getR2Bucket("RECEIPTS") as unknown as R2Bucket;
}

function job(index = 1) {
  const suffix = index.toString(16).padStart(12, "0");
  return parseBridgeJob({
    protocol: BRIDGE_AUTH_PROTOCOL,
    executor: BRIDGE_EXECUTOR_MODE,
    jobId: `11111111-1111-4111-8111-${suffix}`,
    runId: `research-run-${index}`,
    requestId: `request-${index}`,
    inputFingerprint: `p2-${"1".repeat(32)}`,
    configFingerprint: `p2-${"2".repeat(32)}`,
    policyId: KIMI_RESEARCH_EXECUTION_POLICY.profileId,
    role: "Frontend Engineer",
    locale: "en-US",
    createdAt: BASE_TIME + index,
    queueExpiresAt: BASE_TIME + index + BRIDGE_QUEUE_TTL_MS,
  });
}

async function claim(jobs: D1BridgeJobStore, value: ReturnType<typeof job>, at = BASE_TIME + 100) {
  await jobs.accept(value, value.createdAt);
  const grant = { protocol: value.protocol, jobId: value.jobId,
    requestHash: await hashBridgeJob(value), beganAt: at,
    executionExpiresAt: at + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs };
  await jobs.recordBegin(value, grant);
  expect(await jobs.claimDispatch(value, grant, at + 1)).toBe(true);
  return grant;
}

function receipt(grant: Awaited<ReturnType<typeof claim>>, producedAt = BASE_TIME + 1_000) {
  return { grant, producedAt, latencyMs: 123,
    outcome: { kind: "response" as const, content: JSON.stringify(validResearchCandidate), annotations: [],
      actualModel: "openrouter/actual", usage: { promptTokens: 100, completionTokens: 200,
        totalTokens: 300, costMicros: 100_000, webSearchRequests: 0 } } };
}

function siteAcknowledgement(accounting: "held" | "settled" | "released") {
  return vi.fn(async (_job: unknown, notice: ReceiptNotice) => ({ ...notice, accounting }));
}

afterEach(async () => {
  vi.restoreAllMocks();
  while (simulators.length) await simulators.pop()!.dispose();
});

describe("executor persistent maintenance", () => {
  it("constructs a maintenance-only runtime without reading Provider credentials", async () => {
    const runtimeModule = await import("../../worker/research-executor/runtime");
    expect(runtimeModule).toHaveProperty("createMaintenanceRuntime");
    const db = createExecutorDb();
    const bucket = await createBucket();
    const environment = { ...TEST_BRIDGE_ENVIRONMENT,
      get OPENROUTER_API_KEY(): never { throw new Error("provider credential read by maintenance"); },
      EXECUTOR_DB: db as unknown as D1Database,
      EXECUTOR_RECEIPTS: bucket,
      RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() },
      ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "false",
    };
    const runtime = (runtimeModule as typeof runtimeModule & {
      createMaintenanceRuntime: (environment: unknown, overrides?: unknown) => Record<string, unknown>;
    }).createMaintenanceRuntime(environment, { bridgeFetch: vi.fn(), wallNow: () => BASE_TIME,
      monoNow: () => 1_000 });
    expect(Object.keys(runtime).sort()).toEqual([
      "acceptNew", "bootstrap", "delivery", "jobs", "monoNow", "receipts", "site", "store", "wallNow",
    ]);
    expect(runtime).not.toHaveProperty("provider");
    db.close();
  });

  it("schedules actual maintenance through waitUntil without Provider construction", async () => {
    const db = createExecutorDb();
    db.database.prepare(`UPDATE research_executor_maintenance_schedule
      SET generation=generation+1,lease_until=?1 WHERE singleton=1`).run(BASE_TIME + 30_000);
    const bucket = await createBucket();
    const environment = { ...TEST_BRIDGE_ENVIRONMENT,
      get OPENROUTER_API_KEY(): never { throw new Error("provider credential read by scheduled maintenance"); },
      EXECUTOR_DB: db as unknown as D1Database, EXECUTOR_RECEIPTS: bucket,
      RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() } as never,
      ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "false" };
    vi.spyOn(Date, "now").mockReturnValue(BASE_TIME);
    vi.doMock("cloudflare:workers", () => ({ WorkflowEntrypoint: class {} }));
    vi.resetModules();
    const worker = (await import("../../worker/research-executor/index")).default;
    let scheduled: Promise<unknown> | null = null;
    const context = { waitUntil: vi.fn((work: Promise<unknown>) => { scheduled = work; }) };

    worker.scheduled({} as ScheduledController, environment, context as unknown as ExecutionContext);

    expect(context.waitUntil).toHaveBeenCalledOnce();
    await expect(scheduled).resolves.toEqual({ visited: [0, 0, 0] });
    db.close();
  });

  it("keeps post-step local retry persistence after the five-second callback deadline", async () => {
    const fixture = await createResearchBridgeFixture();
    const executorDb = createExecutorDb();
    const bucket = await createBucket();
    const jobs = new D1BridgeJobStore(executorDb as unknown as D1Database);
    await jobs.accept(fixture.execution.job, fixture.wallNow());
    const persistedReceipt = validReceipt(fixture.execution);
    if (persistedReceipt.grant.beganAt === null || persistedReceipt.grant.executionExpiresAt === null) {
      throw new Error("missing synthetic executor grant");
    }
    const persistedGrant = { ...persistedReceipt.grant, beganAt: persistedReceipt.grant.beganAt,
      executionExpiresAt: persistedReceipt.grant.executionExpiresAt };
    await jobs.recordBegin(fixture.execution.job, persistedGrant);
    expect(await jobs.claimDispatch(fixture.execution.job, persistedGrant, fixture.wallNow())).toBe(true);
    const receiptStore = new ExecutorReceiptStore(executorDb as unknown as D1Database, bucket);
    const saved = await receiptStore.save({ ...persistedReceipt, grant: persistedGrant }, fixture.wallNow());
    let entered!: () => void;
    const barrier = new Promise<void>((resolve) => { entered = resolve; });
    const bridgeFetch: typeof fetch = async (input, init) => {
      const request = input instanceof Request && init === undefined ? input : new Request(input, init);
      entered();
      return new Promise<Response>((_resolve, reject) => request.signal.addEventListener("abort",
        () => reject(new Error("local abort-aware callback stall")), { once: true }));
    };
    vi.stubGlobal("fetch", bridgeFetch);
    vi.spyOn(Date, "now").mockImplementation(fixture.wallNow);
    const environment = { ...TEST_BRIDGE_ENVIRONMENT, EXECUTOR_DB: executorDb as unknown as D1Database,
      EXECUTOR_RECEIPTS: bucket, RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() } as never,
      ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "false", OPENROUTER_API_KEY: "synthetic-workflow-key" };
    vi.doMock("cloudflare:workers", () => ({ WorkflowEntrypoint: class {
      protected env: unknown;
      constructor(_ctx: unknown, env: unknown) { this.env = env; }
    } }));
    vi.resetModules();
    const { ResearchWorkflow } = await import("../../worker/research-executor/workflow");
    const instance = new ResearchWorkflow({} as ExecutionContext, environment);
    const reference = { jobId: fixture.execution.jobId, state: "recorded" as const,
      receiptHash: saved.metadata.receiptHash };
    const event = { payload: { jobId: fixture.execution.jobId }, instanceId: fixture.execution.jobId,
      timestamp: new Date(), workflowName: "ResearchWorkflow" };
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    try {
      const work = instance.run(event, { do: vi.fn().mockResolvedValue(reference) } as never);
      await barrier;
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(work).resolves.toEqual(reference);
      expect(executorDb.database.prepare(`SELECT receipt_hash,attempt_count,next_attempt_at,
        stopped_code,completed_at FROM research_executor_delivery WHERE job_id=?1`)
        .get(fixture.execution.jobId)).toEqual({ receipt_hash: saved.metadata.receiptHash,
        attempt_count: 1, next_attempt_at: fixture.wallNow() + 1_000,
        stopped_code: null, completed_at: null });
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      executorDb.close();
      fixture.db.close();
      fixture.clientDb.close();
    }
  });

  it("uses one SQL-clock-fenced lease CAS and persists fair keyset cursors across recreation", async () => {
    let sqlTime = BASE_TIME + 5;
    const db = createExecutorDb(":memory:", () => sqlTime);
    const jobs = new D1BridgeJobStore(db as unknown as D1Database);
    for (let index = 1; index <= 23; index++) await jobs.accept(job(index), BASE_TIME + index);
    const firstStore = new ExecutorMaintenanceStore(db as unknown as D1Database);

    await expect(firstStore.acquire(BASE_TIME - 30_000)).resolves.toBeNull();
    await expect(firstStore.acquire(BASE_TIME + 6)).resolves.toBeNull();
    const lease = await firstStore.acquire(BASE_TIME);
    expect(lease).toEqual({ generation: 1, first: 0 });
    await expect(firstStore.acquire(BASE_TIME)).resolves.toBeNull();
    const visited: string[] = [];
    for (let index = 0; index < 12; index++) visited.push((await firstStore.next("bootstrap", 1))!);
    expect(new Set(visited).size).toBe(12);
    expect(visited[0]).toBe(job(1).jobId);
    expect(visited[11]).toBe(job(12).jobId);
    expect(await firstStore.takePickupTurn(1)).toBe("existing");
    expect(await firstStore.takePickupTurn(1)).toBe("pickup");

    const recreated = new ExecutorMaintenanceStore(db as unknown as D1Database);
    expect(await recreated.next("bootstrap", 1)).toBe(job(13).jobId);
    sqlTime = BASE_TIME + 30_000;
    expect(await recreated.acquire(sqlTime)).toEqual({ generation: 2, first: 1 });
    await expect(recreated.next("bootstrap", 1)).resolves.toBeNull();
    const tail: string[] = [];
    for (let index = 0; index < 10; index++) tail.push((await recreated.next("bootstrap", 2))!);
    expect(tail).toEqual(Array.from({ length: 10 }, (_, index) => job(index + 14).jobId));
    expect(await recreated.next("bootstrap", 2)).toBeNull();
    expect(await recreated.next("bootstrap", 2)).toBe(job(1).jobId);
    db.close();
  });

  it("adds the maintenance schema without changing existing native executor rows", async () => {
    const db = new SqliteD1(":memory:");
    db.database.exec("PRAGMA foreign_keys = ON");
    db.database.function("unixepoch", { varargs: true }, () => BASE_TIME / 1_000);
    for (const name of ["0000_research_bridge_nonces.sql", "0001_research_executor_jobs.sql",
      "0002_research_executor_results.sql"]) db.database.exec(migration(name));
    const jobs = new D1BridgeJobStore(db as unknown as D1Database);
    const grant = await claim(jobs, job());
    const receipts = new ExecutorReceiptStore(db as unknown as D1Database, await createBucket());
    await receipts.save(receipt(grant), BASE_TIME + 2_000);
    db.database.prepare(`INSERT INTO research_bridge_nonces(scope,nonce,created_at,expires_at)
      VALUES(?1,?2,?3,?4)`).run("executor-to-site:test", "a".repeat(32), BASE_TIME, BASE_TIME + 1_000);
    const before = Object.fromEntries(["research_bridge_nonces", "research_executor_jobs",
      "research_executor_results"].map((table) => [table,
      db.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));

    db.database.exec(migration("0003_research_executor_maintenance.sql"));

    const after = Object.fromEntries(Object.keys(before).map((table) => [table,
      db.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
    expect(after).toEqual(before);
    expect(db.database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.database.prepare(`SELECT category,version,pickup_turn
      FROM research_executor_maintenance_cursors ORDER BY category`).all()).toEqual([
      { category: "bootstrap", version: 0, pickup_turn: 0 },
      { category: "results", version: 0, pickup_turn: 0 },
      { category: "site", version: 0, pickup_turn: 0 },
    ]);
    expect(() => db.database.exec(`UPDATE research_executor_maintenance_cursors
      SET category=NULL,version=version+1 WHERE category='bootstrap'`)).toThrow();
    expect(() => db.database.exec(`UPDATE research_executor_maintenance_schedule
      SET generation=generation+1,next_category=1.5 WHERE singleton=1`)).toThrow();
    db.close();
  });

  it("persists receipt identity, exponential retry bounds, permanent stop, and completion CAS", async () => {
    const db = createExecutorDb();
    const jobs = new D1BridgeJobStore(db as unknown as D1Database);
    const grant = await claim(jobs, job());
    const receipts = new ExecutorReceiptStore(db as unknown as D1Database, await createBucket());
    const saved = await receipts.save(receipt(grant), BASE_TIME + 2_000);
    const store = new ExecutorMaintenanceStore(db as unknown as D1Database);

    await store.scheduleReceipt(saved.metadata);
    let state = await store.readDelivery(job().jobId);
    expect(state).toMatchObject({ receiptHash: saved.metadata.receiptHash, attemptCount: 0,
      nextAttemptAt: saved.metadata.producedAt, stoppedCode: null, completedAt: null, version: 0 });
    for (let attempt = 0; attempt < 12; attempt++) {
      await store.defer(job().jobId, saved.metadata.receiptHash, state!.version,
        BASE_TIME + 10_000 + attempt, "temporary");
      const next = (await store.readDelivery(job().jobId))!;
      const delay = next.nextAttemptAt - (BASE_TIME + 10_000 + attempt);
      expect(delay).toBe(Math.min(300_000, 1_000 * 2 ** Math.min(attempt, 9)));
      state = next;
    }
    await store.defer(job().jobId, saved.metadata.receiptHash, state!.version, BASE_TIME + 40_000,
      "authentication");
    state = await store.readDelivery(job().jobId);
    expect(state).toMatchObject({ attemptCount: 13, stoppedCode: "authentication" });
    await expect(store.scheduleReceipt({ ...saved.metadata, receiptHash: "f".repeat(64) }))
      .rejects.toThrow();
    db.close();
  });

  it("delivers the fixed receipt, acknowledges before completing, and persists retry state", async () => {
    let now = BASE_TIME + 2_000;
    const db = createExecutorDb();
    const jobs = new D1BridgeJobStore(db as unknown as D1Database);
    const grant = await claim(jobs, job());
    const receipts = new ExecutorReceiptStore(db as unknown as D1Database, await createBucket());
    await receipts.save(receipt(grant), now);
    const store = new ExecutorMaintenanceStore(db as unknown as D1Database);
    const complete = vi.fn(async (_job: unknown, notice: { receiptHash: string }) => ({ ...notice,
      jobId: job().jobId, requestHash: grant.requestHash, accounting: "settled" as const }));
    const metadata = vi.fn();

    await deliverReceipt(job().jobId, { jobs, receipts, store, site: { complete, metadata },
      wallNow: () => now });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(metadata).not.toHaveBeenCalled();
    expect((await receipts.recover(job().jobId, now))!.siteAcknowledgedAt).toBe(now);
    expect(await store.readDelivery(job().jobId)).toMatchObject({ completedAt: now, stoppedCode: null });

    const otherDb = createExecutorDb();
    const otherJobs = new D1BridgeJobStore(otherDb as unknown as D1Database);
    const otherGrant = await claim(otherJobs, job());
    const otherReceipts = new ExecutorReceiptStore(otherDb as unknown as D1Database, await createBucket());
    await otherReceipts.save(receipt(otherGrant), now);
    const otherStore = new ExecutorMaintenanceStore(otherDb as unknown as D1Database);
    const temporary = vi.fn().mockRejectedValue(new BridgeTransportError("temporary"));
    await deliverReceipt(job().jobId, { jobs: otherJobs, receipts: otherReceipts, store: otherStore,
      site: { complete: temporary, metadata }, wallNow: () => now });
    expect(await otherStore.readDelivery(job().jobId)).toMatchObject({ attemptCount: 1,
      nextAttemptAt: now + 1_000, stoppedCode: null });
    now += 1_000;
    await deliverReceipt(job().jobId, { jobs: otherJobs, receipts: otherReceipts, store: otherStore,
      site: { complete, metadata }, wallNow: () => now });
    expect(await otherStore.readDelivery(job().jobId)).toMatchObject({ completedAt: now });
    db.close();
    otherDb.close();
  });

  it("permanently stops the native delivery ledger on an immutable receipt hash conflict", async () => {
    const db = createExecutorDb();
    const jobs = new D1BridgeJobStore(db as unknown as D1Database);
    const grant = await claim(jobs, job());
    const receipts = new ExecutorReceiptStore(db as unknown as D1Database, await createBucket());
    await receipts.save(receipt(grant), BASE_TIME + 2_000);
    const store = new ExecutorMaintenanceStore(db as unknown as D1Database);
    const acknowledgement = { jobId: job().jobId, requestHash: grant.requestHash,
      receiptHash: (await receipts.recover(job().jobId, BASE_TIME + 2_000))!.metadata.receiptHash,
      accounting: "held" as const };

    await deliverReceipt(job().jobId, { jobs,
      receipts: { recover: receipts.recover.bind(receipts),
        acknowledge: vi.fn().mockRejectedValue(new BridgeReceiptStoreError("conflict")) },
      store, site: { complete: vi.fn().mockResolvedValue(acknowledgement), metadata: vi.fn() },
      wallNow: () => BASE_TIME + 2_000 });

    expect(await store.readDelivery(job().jobId)).toMatchObject({
      stoppedCode: "conflict", attemptCount: 1,
    });
    db.close();
  });

  it("stops an existing ledger on its own immutable hash when recovered metadata conflicts", async () => {
    const db = createExecutorDb();
    const jobs = new D1BridgeJobStore(db as unknown as D1Database);
    const grant = await claim(jobs, job());
    const receipts = new ExecutorReceiptStore(db as unknown as D1Database, await createBucket());
    const saved = await receipts.save(receipt(grant), BASE_TIME + 2_000);
    const conflictingHash = saved.metadata.receiptHash === "f".repeat(64) ? "e".repeat(64) : "f".repeat(64);
    db.database.prepare(`INSERT INTO research_executor_delivery(job_id,receipt_hash,next_attempt_at)
      VALUES(?1,?2,?3)`).run(job().jobId, conflictingHash, BASE_TIME);
    const store = new ExecutorMaintenanceStore(db as unknown as D1Database);

    await expect(deliverReceipt(job().jobId, { jobs, receipts, store,
      site: { complete: vi.fn(), metadata: vi.fn() }, wallNow: () => BASE_TIME + 2_000 }))
      .resolves.toBeUndefined();

    expect(await store.readDelivery(job().jobId)).toMatchObject({
      receiptHash: conflictingHash, stoppedCode: "conflict", attemptCount: 1,
    });
    db.close();
  });

  it("recovers both R2-before-D1 and D1-before-return cuts after closing and reopening SQLite", async () => {
    const directory = mkdtempSync(join(tmpdir(), "executor-maintenance-cuts-"));
    const filename = join(directory, "executor.sqlite");
    expect(resolve(directory).split(sep).at(-1)?.startsWith("executor-maintenance-cuts-")).toBe(true);
    const bucket = await createBucket();
    let db: SqliteD1 | null = createExecutorDb(filename);
    try {
      const jobs = new D1BridgeJobStore(db as unknown as D1Database);
      const firstJob = job(1);
      const firstGrant = await claim(jobs, firstJob);
      const firstReceipt = receipt(firstGrant);
      const firstHash = await hashBridgeJob(firstJob);
      await bucket.put(`research-receipts/v1/${firstJob.jobId}/${firstHash}.json`,
        encodeBridgeProviderReceipt(firstReceipt), { onlyIf: { etagDoesNotMatch: "*" },
          httpMetadata: { contentType: "application/json" } });
      db.close();
      db = reopenExecutorDb(filename);
      const reopenedJobs = new D1BridgeJobStore(db as unknown as D1Database);
      const reopenedReceipts = new ExecutorReceiptStore(db as unknown as D1Database, bucket);
      const reopenedStore = new ExecutorMaintenanceStore(db as unknown as D1Database);
      const firstComplete = siteAcknowledgement("settled");
      await deliverReceipt(firstJob.jobId, { jobs: reopenedJobs, receipts: reopenedReceipts,
        store: reopenedStore, site: { complete: firstComplete, metadata: vi.fn() },
        wallNow: () => BASE_TIME + 2_000 });
      expect(firstComplete).toHaveBeenCalledOnce();
      expect(db.database.prepare(`SELECT receipt_hash,site_acknowledged_at
        FROM research_executor_results WHERE job_id=?1`).get(firstJob.jobId)).toMatchObject({
        site_acknowledged_at: BASE_TIME + 2_000,
      });

      const secondJob = job(2);
      const secondGrant = await claim(reopenedJobs, secondJob, BASE_TIME + 200);
      const fixed = await reopenedReceipts.save(receipt(secondGrant, BASE_TIME + 1_500), BASE_TIME + 2_000);
      db.close();
      db = reopenExecutorDb(filename);
      const finalJobs = new D1BridgeJobStore(db as unknown as D1Database);
      const finalReceipts = new ExecutorReceiptStore(db as unknown as D1Database, bucket);
      const finalStore = new ExecutorMaintenanceStore(db as unknown as D1Database);
      const secondComplete = siteAcknowledgement("held");
      await deliverReceipt(secondJob.jobId, { jobs: finalJobs, receipts: finalReceipts,
        store: finalStore, site: { complete: secondComplete, metadata: vi.fn() },
        wallNow: () => BASE_TIME + 2_000 });
      expect(secondComplete).toHaveBeenCalledOnce();
      expect(await finalStore.readDelivery(secondJob.jobId)).toMatchObject({
        receiptHash: fixed.metadata.receiptHash, completedAt: BASE_TIME + 2_000,
      });
    } finally {
      try { db?.close(); } catch { /* already closed for reopen */ }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(["before", "after"] as const)(
    "runs the paid body once and lets reopened Cron import an injected result-CAS %s cut",
    async (timing) => {
      const directory = mkdtempSync(join(tmpdir(), `executor-paid-cut-${timing}-`));
      expect(resolve(directory).split(sep).at(-1)?.startsWith(`executor-paid-cut-${timing}-`)).toBe(true);
      const siteFile = join(directory, "site.sqlite");
      const executorFile = join(directory, "executor.sqlite");
      const siteFixture = await createSiteImportFixture(siteFile);
      let wall = siteFixture.execution.beganAt! + 2_000;
      siteFixture.setSqlNow(wall);
      siteFixture.setAppNow(wall);
      const bucket = await createBucket();
      let siteDb: SqliteD1 | null = siteFixture.db;
      let executorDb: SqliteD1 | null = createExecutorDb(executorFile, () => wall);
      let providerCalls = 0;
      const workflow = { create: vi.fn(), get: vi.fn() };
      const makeExecutorEnvironment = (database: D1Database) => ({ ...TEST_BRIDGE_ENVIRONMENT,
        EXECUTOR_DB: database, EXECUTOR_RECEIPTS: bucket, RESEARCH_WORKFLOW: workflow as never,
        ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "false", OPENROUTER_API_KEY: "synthetic-unused" });
      const siteEnvironment = { ...TEST_PRODUCTION_ENVIRONMENT };
      let siteHandler: (request: Request) => Promise<Response>;
      let executorHandler: (request: Request) => Promise<Response>;
      const siteFetch: typeof fetch = async (input, init) => siteHandler(
        input instanceof Request && init === undefined ? input : new Request(input, init));
      const executorFetch: typeof fetch = async (input, init) => executorHandler(
        input instanceof Request && init === undefined ? input : new Request(input, init));
      const rebuildHandlers = () => {
        executorHandler = createExecutorBridgeHandler(createHttpRuntime(
          makeExecutorEnvironment(executorDb as unknown as D1Database),
          { bridgeFetch: siteFetch, wallNow: () => wall, monoNow: () => 1_000 }));
        siteHandler = createProductionSiteBridgeHandler({ environment: siteEnvironment,
          getD1: () => siteDb as unknown as D1Database, fetch: executorFetch,
          wallNow: () => wall, monoNow: () => 1_000 });
      };
      try {
        const value = siteFixture.execution.job;
        const baseJobs = new D1BridgeJobStore(executorDb as unknown as D1Database);
        await baseJobs.accept(value, value.createdAt);
        await baseJobs.recordWorkflowAccepted(value, value.jobId, value.createdAt + 1);
        rebuildHandlers();
        let armed = true;
        const guardedDb = { prepare: (sql: string) => {
          const statement = (executorDb as unknown as D1Database).prepare(sql);
          return { bind: (...values: unknown[]) => {
            const bound = statement.bind(...values);
            return { first: <T>(column?: string) => column === undefined
              ? bound.first<T>() : bound.first<T>(column),
            async run() {
              if (armed && timing === "before" && sql.includes("INSERT INTO research_executor_results")) {
                armed = false;
                throw new Error("cut-before-result-cas");
              }
              const result = await bound.run();
              if (armed && timing === "after" && sql.includes("INSERT INTO research_executor_results")) {
                armed = false;
                throw new Error("cut-after-result-cas");
              }
              return result;
            } } as D1PreparedStatement;
          } } as D1PreparedStatement;
        } } as D1Database;
        const executionRuntime = createHttpRuntime(makeExecutorEnvironment(guardedDb), {
          bridgeFetch: siteFetch, wallNow: () => wall, monoNow: () => 1_000,
        });
        const result = await runResearchJob(value.jobId, { jobs: executionRuntime.jobs,
          receipts: executionRuntime.receipts, site: executionRuntime.site,
          provider: { research: async () => {
            providerCalls += 1;
            return { content: JSON.stringify(validResearchCandidate), candidate: validResearchCandidate,
              annotations: [], actualModel: "openrouter/actual", usage: { promptTokens: 100,
              completionTokens: 200, totalTokens: 300, costMicros: 100_000, webSearchRequests: 0 } } as never;
          } }, wallNow: () => wall, monoNow: () => 1_000 });
        expect(result).toEqual({ jobId: value.jobId, state: "unavailable", receiptHash: null });
        expect(providerCalls).toBe(1);
        const receiptKey = `research-receipts/v1/${value.jobId}/${await hashBridgeJob(value)}.json`;
        const fixedBeforeRestart = await bucket.get(receiptKey);
        expect(fixedBeforeRestart).not.toBeNull();
        const fixedBytes = new Uint8Array(await fixedBeforeRestart!.arrayBuffer());
        const expectedReceiptHash = (await summarizeBridgeProviderReceipt(
          decodeBridgeProviderReceipt(fixedBytes))).receiptHash;
        siteDb.close();
        executorDb.close();
        wall += 1_000;
        siteDb = reopenExecutorDb(siteFile, () => wall);
        executorDb = reopenExecutorDb(executorFile, () => wall);
        rebuildHandlers();

        const cron = await runExecutorMaintenance(createMaintenanceRuntime(
          makeExecutorEnvironment(executorDb as unknown as D1Database),
          { bridgeFetch: siteFetch, wallNow: () => wall, monoNow: () => 1_000 }));

        expect(providerCalls).toBe(1);
        expect(cron.visited[2]).toBeGreaterThanOrEqual(1);
        const tombstone = JSON.parse(await (await bucket.get(receiptKey))!.text()) as {
          metadata: { receiptHash: string };
        };
        expect(tombstone.metadata.receiptHash).toBe(expectedReceiptHash);
        const executorResult = executorDb.database.prepare(`SELECT receipt_hash,site_acknowledged_at
          FROM research_executor_results WHERE job_id=?1`).get(value.jobId) as Record<string, unknown>;
        expect(executorResult).toMatchObject({ receipt_hash: expectedReceiptHash, site_acknowledged_at: wall });
        expect(executorDb.database.prepare(`SELECT receipt_hash,completed_at,stopped_code
          FROM research_executor_delivery WHERE job_id=?1`).get(value.jobId)).toEqual({
          receipt_hash: executorResult.receipt_hash, completed_at: wall, stopped_code: null,
        });
        expect(siteDb.database.prepare(`SELECT receipt_hash,phase FROM research_site_imports
          WHERE job_id=?1`).get(value.jobId)).toEqual({
          receipt_hash: executorResult.receipt_hash, phase: 5,
        });
        expect(siteDb.database.prepare("SELECT state FROM research_runs WHERE id=?1")
          .get(siteFixture.identity.runId)).toEqual({ state: "needs-review" });
        expect(workflow.create).not.toHaveBeenCalled();
      } finally {
        try { siteDb?.close(); } catch { /* already closed for reopen */ }
        try { executorDb?.close(); } catch { /* already closed for reopen */ }
        rmSync(directory, { recursive: true, force: true });
      }
    }, 20_000,
  );

  it("repeats the exact receipt after a lost acknowledgement and completes without changing metadata", async () => {
    const db = createExecutorDb();
    const jobs = new D1BridgeJobStore(db as unknown as D1Database);
    const grant = await claim(jobs, job());
    const receipts = new ExecutorReceiptStore(db as unknown as D1Database, await createBucket());
    const saved = await receipts.save(receipt(grant), BASE_TIME + 2_000);
    const store = new ExecutorMaintenanceStore(db as unknown as D1Database);
    let loseAck = true;
    const acknowledge = async (jobId: string, hash: string, now: number) => {
      const value = await receipts.acknowledge(jobId, hash, now);
      if (loseAck) { loseAck = false; throw new Error("lost acknowledgement after commit"); }
      return value;
    };
    const complete = siteAcknowledgement("settled");
    await deliverReceipt(job().jobId, { jobs,
      receipts: { recover: receipts.recover.bind(receipts), acknowledge }, store,
      site: { complete, metadata: vi.fn() }, wallNow: () => BASE_TIME + 2_000 });
    expect(await store.readDelivery(job().jobId)).toMatchObject({ attemptCount: 1,
      completedAt: null, nextAttemptAt: BASE_TIME + 3_000 });
    await deliverReceipt(job().jobId, { jobs,
      receipts: { recover: receipts.recover.bind(receipts), acknowledge }, store,
      site: { complete, metadata: vi.fn() }, wallNow: () => BASE_TIME + 3_000 });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(await store.readDelivery(job().jobId)).toMatchObject({ completedAt: BASE_TIME + 3_000 });
    expect((await receipts.recover(job().jobId, BASE_TIME + 3_000))!.metadata).toEqual(saved.metadata);
    db.close();
  });

  it("switches to metadata after retention and cleans up even when delivery is permanently stopped", async () => {
    const now = BASE_TIME + BRIDGE_RECEIPT_RETENTION_MS + 2_000;
    const db = createExecutorDb();
    const jobs = new D1BridgeJobStore(db as unknown as D1Database);
    const grant = await claim(jobs, job());
    const receipts = new ExecutorReceiptStore(db as unknown as D1Database, await createBucket());
    const saved = await receipts.save(receipt(grant, BASE_TIME + 1_000), BASE_TIME + 2_000);
    const store = new ExecutorMaintenanceStore(db as unknown as D1Database);
    const metadata = vi.fn().mockRejectedValue(new BridgeTransportError("conflict"));
    const complete = vi.fn();

    await deliverReceipt(job().jobId, { jobs, receipts, store, site: { complete, metadata },
      wallNow: () => now });
    expect(complete).not.toHaveBeenCalled();
    expect(metadata).toHaveBeenCalledTimes(1);
    expect(await store.readDelivery(job().jobId)).toMatchObject({ stoppedCode: "conflict" });
    const cleaned = await receipts.cleanup(job().jobId, now);
    expect(cleaned).toMatchObject({ bodyState: "removed", receipt: null,
      metadata: { receiptHash: saved.metadata.receiptHash } });
    db.close();
  });

  it.each(["first-failure", "stopped", "not-due"] as const)(
    "routes pickup through the durable acceptance ledger for %s",
    async (state) => {
      const wall = BASE_TIME + 100;
      const db = createExecutorDb(":memory:", () => wall);
      const bucket = await createBucket();
      const jobs = new D1BridgeJobStore(db as unknown as D1Database);
      const value = job();
      if (state !== "first-failure") {
        await jobs.accept(value, value.createdAt);
        await jobs.recordWorkflowAccepted(value, value.jobId, value.createdAt + 1);
      }
      const persisted = new ExecutorMaintenanceStore(db as unknown as D1Database);
      if (state !== "first-failure") {
        await persisted.ensureAcceptance(value.jobId, wall - 10);
        await persisted.deferAcceptance(value.jobId, wall - (state === "not-due" ? 500 : 10),
          state === "stopped" ? "authentication" : "temporary");
      }
      const bridgeFetch = vi.fn<typeof fetch>(async () => {
        throw new BridgeTransportError("temporary");
      });
      const workflowCreate = vi.fn(async ({ id }: { id: string }) => ({ id }));
      const runtime = createMaintenanceRuntime({ ...TEST_BRIDGE_ENVIRONMENT,
        EXECUTOR_DB: db as unknown as D1Database, EXECUTOR_RECEIPTS: bucket,
        RESEARCH_WORKFLOW: { create: workflowCreate, get: vi.fn() } as never,
        ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "true" }, {
        wallNow: () => wall, monoNow: () => 1_000, bridgeFetch,
      });
      try {
        await runExecutorMaintenance({ ...runtime,
          store: { ...runtime.store,
            acquire: vi.fn(async () => ({ generation: 1, first: 1 as const })),
            takePickupTurn: vi.fn(async () => "pickup" as const), next: vi.fn(async () => null) },
          site: { maintenance: vi.fn(async () => ({ visited: 0, failed: 0 })),
            outbox: vi.fn().mockResolvedValueOnce({ jobs: [value], next: null })
              .mockResolvedValue({ jobs: [], next: null }) },
        });
        const deliveryState = await persisted.readAcceptanceDelivery(value.jobId);
        if (state === "first-failure") {
          expect(deliveryState).toMatchObject({ acknowledgedAt: null, stoppedCode: null,
            nextAttemptAt: wall + 1_000 });
          expect(workflowCreate).toHaveBeenCalledOnce();
          expect(bridgeFetch).toHaveBeenCalledOnce();
        } else {
          expect(bridgeFetch).not.toHaveBeenCalled();
          expect(workflowCreate).not.toHaveBeenCalled();
          expect(deliveryState.stoppedCode).toBe(state === "stopped" ? "authentication" : null);
          expect(deliveryState.nextAttemptAt).toBeGreaterThan(wall);
        }
      } finally { db.close(); }
    },
  );

  it("carries the category guard through pickup before native Workflow creation", async () => {
    let mono = 1_000;
    const db = createExecutorDb();
    const bucket = await createBucket();
    const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => ({
      bind: (...values: unknown[]) => wrap(statement.bind(...values), sql),
      first: async (...args: [string?]) => {
        const value = args[0] === undefined ? await statement.first() : await statement.first(args[0]);
        if (sql.includes("FROM research_executor_jobs")) mono = 9_001;
        return value;
      },
      run: () => statement.run(), all: () => statement.all(),
      raw: (...args: never[]) => statement.raw(...args),
    } as unknown as D1PreparedStatement);
    const delayedDb = { prepare: (sql: string) => wrap(
      (db as unknown as D1Database).prepare(sql), sql) } as D1Database;
    const workflowCreate = vi.fn(async ({ id }: { id: string }) => ({ id }));
    const runtime = createMaintenanceRuntime({ ...TEST_BRIDGE_ENVIRONMENT,
      EXECUTOR_DB: delayedDb, EXECUTOR_RECEIPTS: bucket,
      RESEARCH_WORKFLOW: { create: workflowCreate, get: vi.fn() } as never,
      ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "true" }, {
      wallNow: () => BASE_TIME + 100, monoNow: () => mono,
      bridgeFetch: vi.fn(async () => { throw new Error("unexpected callback"); }),
    });
    try {
      await runExecutorMaintenance({ ...runtime,
        store: { ...runtime.store,
          acquire: vi.fn(async () => ({ generation: 1, first: 1 as const })),
          takePickupTurn: vi.fn(async () => "pickup" as const), next: vi.fn(async () => null) },
        site: { maintenance: vi.fn(async () => ({ visited: 0, failed: 0 })),
          outbox: vi.fn().mockResolvedValueOnce({ jobs: [job()], next: null })
            .mockResolvedValue({ jobs: [], next: null }) },
      });
      expect(workflowCreate).not.toHaveBeenCalled();
      expect(await new D1BridgeJobStore(db as unknown as D1Database).get(job().jobId)).toMatchObject({
        workflowAcceptedAt: null,
      });
      expect(db.database.prepare(`SELECT count(*) AS n FROM research_executor_acceptance_delivery
        WHERE job_id=?1`).get(job().jobId)).toEqual({ n: 0 });
    } finally { db.close(); }
  });

  it("recomputes outbound headroom after delayed preflight and persists stalled callback cleanup", async () => {
    let wall = BASE_TIME + BRIDGE_RECEIPT_RETENTION_MS + 2_000;
    let mono = 1_000;
    const db = createExecutorDb(":memory:", () => wall);
    const bucket = await createBucket();
    const jobs = new D1BridgeJobStore(db as unknown as D1Database);
    const grant = await claim(jobs, job());
    await jobs.recordWorkflowAccepted(job(), job().jobId, BASE_TIME + 10);
    const receipts = new ExecutorReceiptStore(db as unknown as D1Database, bucket);
    await receipts.save(receipt(grant), BASE_TIME + 2_000);
    const ledger = new ExecutorMaintenanceStore(db as unknown as D1Database);
    await ledger.ensureAcceptance(job().jobId, BASE_TIME + 10);
    await ledger.recordAcceptance(job().jobId, BASE_TIME + 10);
    let deliveryActive = false;
    let deliveryResultReads = 0;
    let delayedDeliveryPreflight = false;
    let enterPreflight!: () => void;
    const preflightBarrier = new Promise<void>((resolve) => { enterPreflight = resolve; });
    const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => ({
      bind: (...values: unknown[]) => wrap(statement.bind(...values), sql),
      first: async (...args: [string?]) => {
        const value = args[0] === undefined ? await statement.first() : await statement.first(args[0]);
        if (deliveryActive && sql.includes("FROM research_executor_results WHERE job_id")
          && ++deliveryResultReads === 1) {
          delayedDeliveryPreflight = true;
          enterPreflight();
          await new Promise<void>((resolve) => setTimeout(resolve, 3_000));
          mono += 3_000;
        }
        return value;
      },
      run: () => statement.run(), all: () => statement.all(),
      raw: (...args: never[]) => statement.raw(...args),
    } as unknown as D1PreparedStatement);
    const delayedDb = { prepare: (sql: string) => wrap(
      (db as unknown as D1Database).prepare(sql), sql) } as D1Database;
    let entered!: () => void;
    let barrier = new Promise<void>((resolve) => { entered = resolve; });
    const bridgeFetch: typeof fetch = async (input, init) => {
      const request = input instanceof Request && init === undefined ? input : new Request(input, init);
      entered();
      return new Promise<Response>((_resolve, reject) => request.signal.addEventListener("abort",
        () => reject(new Error("local abort-aware temporary stall")), { once: true }));
    };
    const runtime = createMaintenanceRuntime({ ...TEST_BRIDGE_ENVIRONMENT,
      EXECUTOR_DB: delayedDb, EXECUTOR_RECEIPTS: bucket,
      RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() } as never,
      ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "false" }, {
      wallNow: () => wall, monoNow: () => mono, bridgeFetch,
    });
    const firstCleanupAt = wall;
    try {
      for (let pass = 1; pass <= 2; pass++) {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        barrier = new Promise<void>((resolve) => { entered = resolve; });
        const work = runExecutorMaintenance({ ...runtime,
          delivery: async (...args) => {
            deliveryActive = true;
            try { return await runtime.delivery(...args); }
            finally { deliveryActive = false; }
          },
          site: { ...runtime.site, maintenance: vi.fn(async () => ({ visited: 0, failed: 0 })) },
        });
        if (pass === 1) {
          await preflightBarrier;
          expect(delayedDeliveryPreflight).toBe(true);
          await vi.advanceTimersByTimeAsync(3_000);
        }
        await barrier;
        await vi.advanceTimersByTimeAsync(pass === 1 ? 4_000 : 5_000);
        const atReservedHeadroom = await ledger.readDelivery(job().jobId);
        expect.soft(atReservedHeadroom?.attemptCount).toBe(pass);
        if (pass === 1 && atReservedHeadroom?.attemptCount === 0) {
          await vi.advanceTimersByTimeAsync(1_000);
        }
        await work;
        vi.useRealTimers();
        expect(await ledger.readDelivery(job().jobId)).toMatchObject({ attemptCount: pass,
          nextAttemptAt: wall + 1_000 * 2 ** (pass - 1), completedAt: null });
        expect(db.database.prepare(`SELECT cleanup_requested_at,body_removed_at
          FROM research_executor_results WHERE job_id=?1`).get(job().jobId)).toEqual({
          cleanup_requested_at: firstCleanupAt, body_removed_at: firstCleanupAt,
        });
        wall += 60_000;
      }
      expect((await receipts.recover(job().jobId, wall))!.bodyState).toBe("removed");
    } finally { vi.useRealTimers(); db.close(); }
  }, 20_000);

  it("tombstones every overdue receipt in a slow native backlog before retrying due callbacks", async () => {
    let wall = BASE_TIME + BRIDGE_RECEIPT_RETENTION_MS + 2_000;
    const db = createExecutorDb(":memory:", () => wall);
    const bucket = await createBucket();
    const jobs = new D1BridgeJobStore(db as unknown as D1Database);
    const receipts = new ExecutorReceiptStore(db as unknown as D1Database, bucket);
    const ledger = new ExecutorMaintenanceStore(db as unknown as D1Database);
    for (let index = 1; index <= 13; index++) {
      const value = job(index);
      const grant = await claim(jobs, value);
      await jobs.recordWorkflowAccepted(value, value.jobId, BASE_TIME + 50);
      await receipts.save(receipt(grant), BASE_TIME + 2_000);
      await ledger.ensureAcceptance(value.jobId, BASE_TIME + 50);
      await ledger.recordAcceptance(value.jobId, BASE_TIME + 50);
    }
    let reads = 0;
    let callbacks = 0;
    let readTarget = 0;
    let callbackTarget = 0;
    let resolveReads: (() => void) | undefined;
    let resolveCallbacks: (() => void) | undefined;
    const waitForReads = (target: number) => reads >= target ? Promise.resolve()
      : new Promise<void>((resolve) => { readTarget = target; resolveReads = resolve; });
    const waitForCallbacks = (target: number) => callbacks >= target ? Promise.resolve()
      : new Promise<void>((resolve) => { callbackTarget = target; resolveCallbacks = resolve; });
    const slowBucket = {
      get: async (...args: Parameters<R2Bucket["get"]>) => {
        const value = await (bucket.get as (...values: Parameters<R2Bucket["get"]>) =>
          ReturnType<R2Bucket["get"]>)(...args);
        reads += 1;
        if (reads >= readTarget) { resolveReads?.(); resolveReads = undefined; }
        await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
        return value;
      },
      put: (...args: Parameters<R2Bucket["put"]>) =>
        (bucket.put as (...values: Parameters<R2Bucket["put"]>) =>
          ReturnType<R2Bucket["put"]>)(...args),
      delete: bucket.delete.bind(bucket),
    } as R2Bucket;
    const bridgeFetch: typeof fetch = async (input, init) => {
      const request = input instanceof Request && init === undefined ? input : new Request(input, init);
      callbacks += 1;
      if (callbacks >= callbackTarget) { resolveCallbacks?.(); resolveCallbacks = undefined; }
      return new Promise<Response>((_resolve, reject) => request.signal.addEventListener("abort",
        () => reject(new Error("synthetic stalled callback")), { once: true }));
    };
    const runtime = createMaintenanceRuntime({ ...TEST_BRIDGE_ENVIRONMENT,
      EXECUTOR_DB: db as unknown as D1Database, EXECUTOR_RECEIPTS: slowBucket,
      RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() } as never,
      ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "false" }, {
      wallNow: () => wall, monoNow: () => performance.now(), bridgeFetch,
    });
    try {
      for (let pass = 0; pass < 15; pass++) {
        reads = 0;
        callbacks = 0;
        resolveReads = undefined;
        resolveCallbacks = undefined;
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
        const work = runExecutorMaintenance({ ...runtime,
          site: { ...runtime.site, maintenance: vi.fn(async () => ({ visited: 0, failed: 0 })) },
        });
        const expected = pass % 7 === 6 ? 1 : 2;
        await waitForReads(expected);
        if (pass < 7) {
          for (let read = 2; read <= 4; read++) {
            await vi.advanceTimersByTimeAsync(1_000);
            await waitForReads(expected * read);
          }
          await vi.advanceTimersByTimeAsync(1_000);
          await waitForCallbacks(expected);
          await vi.advanceTimersByTimeAsync(3_000);
          await waitForReads(expected * 5);
          await vi.advanceTimersByTimeAsync(1_000);
        } else {
          await vi.advanceTimersByTimeAsync(1_000);
          await waitForCallbacks(expected);
          await vi.advanceTimersByTimeAsync(5_000);
          await waitForReads(expected * 2);
          await vi.advanceTimersByTimeAsync(1_000);
          await waitForReads(expected * 3);
          await vi.advanceTimersByTimeAsync(1_000);
        }
        await work;
        vi.useRealTimers();
        wall += 60_000;
      }
      const rows = db.database.prepare(`SELECT attempt_count,stopped_code,completed_at,
        cleanup_requested_at,body_removed_at FROM research_executor_delivery
        JOIN research_executor_results USING(job_id) ORDER BY job_id`).all() as Array<{
          attempt_count: number; stopped_code: string | null; completed_at: number | null;
          cleanup_requested_at: number | null; body_removed_at: number | null;
        }>;
      expect(rows).toHaveLength(13);
      expect(rows.every((row) => row.attempt_count >= 2 && row.stopped_code === null
        && row.completed_at === null)).toBe(true);
      expect(rows.every((row) => row.cleanup_requested_at !== null
        && row.body_removed_at === row.cleanup_requested_at)).toBe(true);
      await expect(receipts.recover(job().jobId, wall)).resolves.toMatchObject({
        bodyState: "removed", receipt: null,
      });
    } finally { vi.useRealTimers(); db.close(); }
  }, 30_000);

  it("completes signed metadata accounting after a slow cleanup outage without repeating the paid cost", async () => {
    const fixture = await createSiteImportFixture();
    const storedReceipt = validReceipt(fixture.execution);
    if (storedReceipt.grant.beganAt === null || storedReceipt.grant.executionExpiresAt === null) {
      throw new Error("missing synthetic executor grant");
    }
    const storedGrant = { ...storedReceipt.grant, beganAt: storedReceipt.grant.beganAt,
      executionExpiresAt: storedReceipt.grant.executionExpiresAt };
    let wall = storedReceipt.producedAt + BRIDGE_RECEIPT_RETENTION_MS + 2_000;
    fixture.setSqlNow(wall);
    fixture.setAppNow(wall);
    const db = createExecutorDb(":memory:", () => wall);
    const bucket = await createBucket();
    const jobs = new D1BridgeJobStore(db as unknown as D1Database);
    await jobs.accept(fixture.execution.job, fixture.execution.createdAt);
    await jobs.recordBegin(fixture.execution.job, storedGrant);
    expect(await jobs.claimDispatch(fixture.execution.job, storedGrant,
      fixture.execution.beganAt! + 1)).toBe(true);
    await jobs.recordWorkflowAccepted(fixture.execution.job, fixture.execution.jobId,
      fixture.execution.createdAt + 1);
    const receipts = new ExecutorReceiptStore(db as unknown as D1Database, bucket);
    const saved = await receipts.save({ ...storedReceipt, grant: storedGrant }, storedReceipt.producedAt + 1);
    const ledger = new ExecutorMaintenanceStore(db as unknown as D1Database);
    await ledger.ensureAcceptance(fixture.execution.jobId, fixture.execution.createdAt + 1);
    await ledger.recordAcceptance(fixture.execution.jobId, fixture.execution.createdAt + 1);
    let reads = 0;
    let readTarget = 0;
    let resolveReads: (() => void) | undefined;
    const waitForReads = (target: number) => reads >= target ? Promise.resolve()
      : new Promise<void>((resolve) => { readTarget = target; resolveReads = resolve; });
    const slowBucket = {
      get: async (...args: Parameters<R2Bucket["get"]>) => {
        const value = await (bucket.get as (...values: Parameters<R2Bucket["get"]>) =>
          ReturnType<R2Bucket["get"]>)(...args);
        reads += 1;
        if (reads >= readTarget) { resolveReads?.(); resolveReads = undefined; }
        await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
        return value;
      },
      put: (...args: Parameters<R2Bucket["put"]>) =>
        (bucket.put as (...values: Parameters<R2Bucket["put"]>) =>
          ReturnType<R2Bucket["put"]>)(...args),
      delete: bucket.delete.bind(bucket),
    } as R2Bucket;
    const siteHandler = createProductionSiteBridgeHandler({ environment: TEST_PRODUCTION_ENVIRONMENT,
      getD1: () => fixture.db as unknown as D1Database,
      fetch: vi.fn(async () => { throw new Error("unexpected executor callback"); }),
      wallNow: () => wall, monoNow: () => performance.now() });
    let outage = true;
    let callbacks = 0;
    let resolveCallback: (() => void) | undefined;
    let callbackBarrier = new Promise<void>((resolve) => { resolveCallback = resolve; });
    const bridgeFetch: typeof fetch = async (input, init) => {
      const request = input instanceof Request && init === undefined ? input : new Request(input, init);
      callbacks += 1;
      resolveCallback?.();
      if (outage) return new Promise<Response>((_resolve, reject) => request.signal.addEventListener("abort",
        () => reject(new Error("synthetic metadata outage")), { once: true }));
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 4_000);
        request.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("healthy metadata response was starved"));
        }, { once: true });
      });
      return siteHandler(request);
    };
    const runtime = createMaintenanceRuntime({ ...TEST_BRIDGE_ENVIRONMENT,
      EXECUTOR_DB: db as unknown as D1Database, EXECUTOR_RECEIPTS: slowBucket,
      RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() } as never,
      ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "false" }, {
      wallNow: () => wall, monoNow: () => performance.now(), bridgeFetch,
    });
    const runPass = async () => {
      db.database.prepare(`UPDATE research_executor_maintenance_schedule
        SET generation=generation+1,lease_until=0,next_category=2 WHERE singleton=1`).run();
      reads = 0;
      resolveReads = undefined;
      callbackBarrier = new Promise<void>((resolve) => { resolveCallback = resolve; });
      const work = runExecutorMaintenance({ ...runtime,
        site: { ...runtime.site, maintenance: vi.fn(async () => ({ visited: 0, failed: 0 })) },
      });
      await waitForReads(1);
      if (outage) {
        for (let read = 2; read <= 4; read++) {
          await vi.advanceTimersByTimeAsync(1_000);
          await waitForReads(read);
        }
        await vi.advanceTimersByTimeAsync(1_000);
        await callbackBarrier;
        await vi.advanceTimersByTimeAsync(3_000);
        await waitForReads(5);
        await vi.advanceTimersByTimeAsync(1_000);
      } else {
        await vi.advanceTimersByTimeAsync(1_000);
        await callbackBarrier;
        await vi.advanceTimersByTimeAsync(4_000);
        await waitForReads(2);
        await vi.advanceTimersByTimeAsync(1_000);
        await waitForReads(3);
        await vi.advanceTimersByTimeAsync(1_000);
        await waitForReads(4);
        await vi.advanceTimersByTimeAsync(1_000);
      }
      await work;
    };
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    try {
      await runPass();
      expect(await ledger.readDelivery(fixture.execution.jobId)).toMatchObject({
        attemptCount: 1, completedAt: null, stoppedCode: null,
      });
      expect(db.database.prepare(`SELECT cleanup_requested_at,body_removed_at
        FROM research_executor_results WHERE job_id=?1`).get(fixture.execution.jobId))
        .toMatchObject({ body_removed_at: expect.any(Number) });
      outage = false;
      wall += 60_000;
      fixture.setSqlNow(wall);
      fixture.setAppNow(wall);
      await runPass();
      expect(callbacks).toBe(2);
      expect(await ledger.readDelivery(fixture.execution.jobId)).toMatchObject({
        receiptHash: saved.metadata.receiptHash, attemptCount: 1, completedAt: wall, stoppedCode: null,
      });
      expect(fixture.db.database.prepare(`SELECT receipt_hash,phase FROM research_site_imports
        WHERE job_id=?1`).get(fixture.execution.jobId)).toEqual({
        receipt_hash: saved.metadata.receiptHash, phase: 5,
      });
      expect(fixture.db.database.prepare(`SELECT id,status,settled_micros FROM ai_budget_reservations
        WHERE id=?1`).get(fixture.execution.budgetReservationId!)).toEqual({
        id: fixture.execution.budgetReservationId, status: "settled", settled_micros: 100_000,
      });
      await expect(receipts.recover(fixture.execution.jobId, wall)).resolves.toMatchObject({
        metadata: saved.metadata, bodyState: "removed", receipt: null,
      });
      const accountingSnapshot = {
        reservation: fixture.db.database.prepare(`SELECT * FROM ai_budget_reservations
          WHERE id=?1`).get(fixture.execution.budgetReservationId!),
        buckets: fixture.db.database.prepare("SELECT * FROM ai_budget_buckets ORDER BY id").all(),
        quota: fixture.db.database.prepare(`SELECT * FROM quota_ledger
          WHERE reservation_id=?1 ORDER BY rowid`).all(fixture.execution.quotaReservationId!),
        imported: fixture.db.database.prepare(`SELECT receipt_hash,phase FROM research_site_imports
          WHERE job_id=?1`).get(fixture.execution.jobId),
      };
      wall += 60_000;
      fixture.setSqlNow(wall);
      fixture.setAppNow(wall);
      db.database.prepare(`UPDATE research_executor_maintenance_schedule
        SET generation=generation+1,lease_until=0,next_category=2 WHERE singleton=1`).run();
      reads = 0;
      resolveReads = undefined;
      const replay = runExecutorMaintenance({ ...runtime,
        site: { ...runtime.site, maintenance: vi.fn(async () => ({ visited: 0, failed: 0 })) },
      });
      await waitForReads(1);
      for (let read = 2; read <= 4; read++) {
        await vi.advanceTimersByTimeAsync(1_000);
        await waitForReads(read);
      }
      await vi.advanceTimersByTimeAsync(1_000);
      await replay;
      expect(callbacks).toBe(2);
      expect({
        reservation: fixture.db.database.prepare(`SELECT * FROM ai_budget_reservations
          WHERE id=?1`).get(fixture.execution.budgetReservationId!),
        buckets: fixture.db.database.prepare("SELECT * FROM ai_budget_buckets ORDER BY id").all(),
        quota: fixture.db.database.prepare(`SELECT * FROM quota_ledger
          WHERE reservation_id=?1 ORDER BY rowid`).all(fixture.execution.quotaReservationId!),
        imported: fixture.db.database.prepare(`SELECT receipt_hash,phase FROM research_site_imports
          WHERE job_id=?1`).get(fixture.execution.jobId),
      }).toEqual(accountingSnapshot);
    } finally {
      vi.useRealTimers();
      db.close();
      fixture.db.close();
    }
  }, 20_000);

  it("rotates three bounded categories, suppresses pickup while closed, and never exceeds two in flight", async () => {
    let mono = 1_000;
    let inFlight = 0;
    let maximum = 0;
    const ids = Array.from({ length: 25 }, (_, index) => job(index + 1).jobId);
    const next = vi.fn(async () => ids.shift() ?? null);
    const acquire = vi.fn(async () => ({ generation: 1, first: 0 as const }));
    const visit = vi.fn(async () => {
      inFlight += 1;
      maximum = Math.max(maximum, inFlight);
      await Promise.resolve();
      mono += 10;
      inFlight -= 1;
    });
    const result = await runExecutorMaintenance({
      jobs: { accept: vi.fn(), get: vi.fn(async () => null) }, receipts: { recover: vi.fn(), cleanup: vi.fn() },
      store: { acquire, next, takePickupTurn: vi.fn(async () => "pickup" as const),
        ensureAcceptance: vi.fn(), readAcceptanceDelivery: vi.fn(), recordAcceptance: vi.fn(),
        deferAcceptance: vi.fn(), cleanupPriority: vi.fn(async () => true) },
      site: { maintenance: vi.fn(async () => { await visit(); return { visited: 1, failed: 0 }; }),
        outbox: vi.fn() }, bootstrap: visit, delivery: visit,
      acceptNew: false, wallNow: () => BASE_TIME, monoNow: () => mono,
    });
    expect(result.visited.every((count) => count <= 10)).toBe(true);
    expect(maximum).toBeLessThanOrEqual(2);
    expect(result.visited[0]).toBe(1);
    expect(result.visited[1]).toBeGreaterThan(0);
    expect(result.visited[2]).toBeGreaterThan(0);
    expect(result.visited.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(21);
    expect(result.visited).toEqual([1, 10, 10]);
  });

  it("does not hot-loop empty scans and passes a bounded signal to pickup", async () => {
    let mono = 1_000;
    const next = vi.fn(async () => null);
    const outbox = vi.fn(async (options?: { signal?: AbortSignal }) => {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      return { jobs: [], next: null };
    });
    const result = await runExecutorMaintenance({
      jobs: { accept: vi.fn(), get: vi.fn() }, receipts: { recover: vi.fn(), cleanup: vi.fn() },
      store: { acquire: vi.fn(async () => ({ generation: 1, first: 1 as const })), next,
        takePickupTurn: vi.fn().mockResolvedValueOnce("existing").mockResolvedValue("pickup"),
        ensureAcceptance: vi.fn(), readAcceptanceDelivery: vi.fn(), recordAcceptance: vi.fn(),
        deferAcceptance: vi.fn(), cleanupPriority: vi.fn(async () => true) },
      site: { maintenance: vi.fn(async () => ({ visited: 0, failed: 0 })), outbox },
      bootstrap: vi.fn(), delivery: vi.fn(), acceptNew: true, wallNow: () => BASE_TIME,
      monoNow: () => { mono += 10; return mono; },
    });
    expect(result.visited).toEqual([0, 0, 0]);
    expect(next.mock.calls.length).toBeLessThanOrEqual(2);
    expect(outbox).toHaveBeenCalledTimes(1);
  });

  it("runs cleanup after recover or delivery failure and rejects malformed cursor UUIDs in native SQL", async () => {
    const db = createExecutorDb();
    expect(() => db.database.prepare(`UPDATE research_executor_maintenance_cursors
      SET after_accepted_at=?1,after_job_id=?2,version=version+1 WHERE category='results'`)
      .run(BASE_TIME, "x".repeat(36))).toThrow();
    const cleanup = vi.fn(async () => null);
    const recover = vi.fn().mockRejectedValue(new Error("poisoned R2 row"));
    let mono = 1_000;
    await runExecutorMaintenance({
      jobs: { accept: vi.fn(), get: vi.fn() }, receipts: { recover, cleanup },
      store: { acquire: vi.fn(async () => ({ generation: 1, first: 2 as const })),
        next: vi.fn().mockResolvedValueOnce(job().jobId).mockResolvedValue(null),
        takePickupTurn: vi.fn(), ensureAcceptance: vi.fn(), readAcceptanceDelivery: vi.fn(),
        recordAcceptance: vi.fn(), deferAcceptance: vi.fn(), cleanupPriority: vi.fn(async () => true) },
      site: { maintenance: vi.fn(async () => ({ visited: 0, failed: 0 })), outbox: vi.fn() },
      bootstrap: vi.fn(), delivery: vi.fn(), acceptNew: false, wallNow: () => BASE_TIME,
      monoNow: () => { mono += 10; return mono; },
    });
    expect(cleanup).toHaveBeenCalledWith(job().jobId, BASE_TIME, expect.any(AbortSignal), expect.any(Function));
    db.close();
  });

  it("fences nested receipt work after a delayed D1 read crosses item cancellation", async () => {
    const db = createExecutorDb();
    const jobs = new D1BridgeJobStore(db as unknown as D1Database);
    const grant = await claim(jobs, job());
    const bucket = await createBucket();
    const receipts = new ExecutorReceiptStore(db as unknown as D1Database, bucket);
    await receipts.save(receipt(grant), BASE_TIME + 2_000);
    let release!: () => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    let armed = true;
    const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => ({
      bind: (...values: unknown[]) => wrap(statement.bind(...values), sql),
      first: async (...args: [string?]) => {
        const value = args[0] === undefined ? await statement.first() : await statement.first(args[0]);
        if (armed && sql.includes("FROM research_executor_results")) {
          armed = false;
          entered();
          await releasePromise;
        }
        return value;
      },
      run: () => statement.run(), all: () => statement.all(), raw: (...args: never[]) => statement.raw(...args),
    } as unknown as D1PreparedStatement);
    const delayedDb = {
      prepare: (sql: string) => wrap((db as unknown as D1Database).prepare(sql), sql),
      batch: <T>(statements: D1PreparedStatement[]) => (db as unknown as D1Database).batch<T>(statements),
    } as D1Database;
    let lateBucketGets = 0;
    let aborted = false;
    const countedBucket = new Proxy(bucket, { get(target, property, receiver) {
      if (property === "get") return (...args: Parameters<R2Bucket["get"]>) => {
        if (aborted) lateBucketGets += 1;
        return (target.get as (...values: Parameters<R2Bucket["get"]>) => ReturnType<R2Bucket["get"]>)(...args);
      };
      return Reflect.get(target, property, receiver) as unknown;
    } });
    const runtimeModule = await import("../../worker/research-executor/runtime");
    const runtime = runtimeModule.createMaintenanceRuntime({ ...TEST_BRIDGE_ENVIRONMENT,
      EXECUTOR_DB: delayedDb, EXECUTOR_RECEIPTS: countedBucket,
      RESEARCH_WORKFLOW: { create: vi.fn(), get: vi.fn() } as never,
      ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "false" }, { bridgeFetch: vi.fn(),
      wallNow: () => BASE_TIME + 2_000, monoNow: () => 1_000 });
    const controller = new AbortController();
    const work = runtime.delivery(job().jobId, controller.signal);
    await enteredPromise;
    aborted = true;
    controller.abort();
    release();
    await expect(work).resolves.toBeUndefined();
    expect(lateBucketGets).toBe(0);
    db.close();
  });

  it("continues later categories after a bounded pickup failure", async () => {
    let mono = 1_000;
    const delivery = vi.fn(async () => undefined);
    const maintenance = vi.fn(async () => ({ visited: 1, failed: 0 }));
    const next = vi.fn(async (category: "bootstrap" | "results") => category === "results"
      ? job().jobId : null);
    const result = await runExecutorMaintenance({
      jobs: { accept: vi.fn(), get: vi.fn() }, receipts: { recover: vi.fn(), cleanup: vi.fn() },
      store: { acquire: vi.fn(async () => ({ generation: 1, first: 1 as const })), next,
        takePickupTurn: vi.fn(async () => "pickup" as const), ensureAcceptance: vi.fn(),
        readAcceptanceDelivery: vi.fn(), recordAcceptance: vi.fn(), deferAcceptance: vi.fn(),
        cleanupPriority: vi.fn(async () => true) },
      site: { maintenance, outbox: vi.fn().mockRejectedValue(new BridgeTransportError("temporary")) },
      bootstrap: vi.fn(), delivery, acceptNew: true, wallNow: () => BASE_TIME,
      monoNow: () => { mono += 10; return mono; },
    });
    expect(result.visited).toEqual([1, 0, 10]);
    expect(delivery).toHaveBeenCalled();
    expect(maintenance).toHaveBeenCalledOnce();
  });

  it("advances the native cursor past a valid-UUID row with poisoned job JSON", async () => {
    const db = createExecutorDb();
    const valid = job(2);
    const jobs = new D1BridgeJobStore(db as unknown as D1Database);
    await jobs.accept(valid, BASE_TIME + 2);
    const poisonId = job(1).jobId;
    db.database.prepare(`INSERT INTO research_executor_jobs(
      job_id,request_hash,job_json,accepted_at,dispatch_state)
      VALUES(?1,?2,?3,?4,'unclaimed')`).run(poisonId, "a".repeat(64), "{}", BASE_TIME + 1);
    const store = new ExecutorMaintenanceStore(db as unknown as D1Database);
    const lease = await store.acquire(BASE_TIME);
    expect(await store.next("bootstrap", lease!.generation)).toBe(poisonId);
    await expect(jobs.get(poisonId)).rejects.toThrow();
    expect(await store.next("bootstrap", lease!.generation)).toBe(valid.jobId);
    db.close();
  });

  it("filters a legacy invalid 36-byte job sort key without poisoning native scan progress", async () => {
    const db = createExecutorDb();
    const valid = job(2);
    const jobs = new D1BridgeJobStore(db as unknown as D1Database);
    await jobs.accept(valid, BASE_TIME + 2);
    db.database.prepare(`INSERT INTO research_executor_jobs(
      job_id,request_hash,job_json,accepted_at,dispatch_state)
      VALUES(?1,?2,?3,?4,'unclaimed')`).run("x".repeat(36), "a".repeat(64), "{}", BASE_TIME + 1);
    const store = new ExecutorMaintenanceStore(db as unknown as D1Database);
    const lease = await store.acquire(BASE_TIME);
    expect(await store.next("bootstrap", lease!.generation)).toBe(valid.jobId);
    db.close();
  });

  it("filters a 36-byte legacy sort key with an extra hyphen outside UUID separators", async () => {
    const db = createExecutorDb();
    const valid = job(2);
    const jobs = new D1BridgeJobStore(db as unknown as D1Database);
    await jobs.accept(valid, BASE_TIME + 2);
    db.database.prepare(`INSERT INTO research_executor_jobs(
      job_id,request_hash,job_json,accepted_at,dispatch_state)
      VALUES(?1,?2,?3,?4,'unclaimed')`).run(
      "1111111--1111-4111-8111-000000000001", "a".repeat(64), "{}", BASE_TIME + 1);
    const store = new ExecutorMaintenanceStore(db as unknown as D1Database);
    const lease = await store.acquire(BASE_TIME);
    expect(await store.next("bootstrap", lease!.generation)).toBe(valid.jobId);
    db.close();
  });

  it("rechecks the monotonic category deadline inside a delayed selection before cursor mutation", async () => {
    let mono = 1_000;
    let cursorMutations = 0;
    const next = vi.fn(async (category: "bootstrap" | "results", _generation: number,
      _signal?: AbortSignal, guard?: () => void) => {
      if (category === "results") return null;
      mono = 9_001;
      guard?.();
      cursorMutations += 1;
      return job().jobId;
    });
    const result = await runExecutorMaintenance({
      jobs: { accept: vi.fn(), get: vi.fn() }, receipts: { recover: vi.fn(), cleanup: vi.fn() },
      store: { acquire: vi.fn(async () => ({ generation: 1, first: 1 as const })), next,
        takePickupTurn: vi.fn(async () => "existing" as const), ensureAcceptance: vi.fn(),
        readAcceptanceDelivery: vi.fn(), recordAcceptance: vi.fn(), deferAcceptance: vi.fn(),
        cleanupPriority: vi.fn(async () => true) },
      site: { maintenance: vi.fn(async () => ({ visited: 0, failed: 0 })), outbox: vi.fn() },
      bootstrap: vi.fn(), delivery: vi.fn(), acceptNew: false, wallNow: () => BASE_TIME,
      monoNow: () => mono,
    });
    expect(cursorMutations).toBe(0);
    expect(result.visited[1]).toBe(0);
  });

  it.each(["status", "close", "claimed"] as const)(
    "reopens both native runtimes after %s uncertainty and preserves conservative accounting authority",
    async (mode) => {
      const directory = mkdtempSync(join(tmpdir(), `executor-maintenance-${mode}-`));
      const siteFile = join(directory, "site.sqlite");
      const executorFile = join(directory, "executor.sqlite");
      expect(resolve(directory).split(sep).at(-1)?.startsWith(`executor-maintenance-${mode}-`)).toBe(true);
      const siteFixture = await createSiteImportFixture(siteFile);
      let wall = siteFixture.execution.executionExpiresAt! + 1_000;
      siteFixture.setSqlNow(wall);
      siteFixture.setAppNow(wall);
      const bucket = await createBucket();
      let siteDb: SqliteD1 | null = siteFixture.db;
      let executorDb: SqliteD1 | null = createExecutorDb(executorFile, () => wall);
      let providerReads = 0;
      let outage = mode !== "claimed";
      const workflow = { create: vi.fn(async () => { throw new Error("existing workflow must not be recreated"); }),
        get: vi.fn(async (id: string) => ({ id, status: async () => ({ status: "errored" }) })) };
      const makeExecutorEnvironment = () => ({ ...TEST_BRIDGE_ENVIRONMENT,
        EXECUTOR_DB: executorDb as unknown as D1Database, EXECUTOR_RECEIPTS: bucket,
        RESEARCH_WORKFLOW: workflow as never, ARC_RESEARCH_EXECUTOR_ACCEPT_NEW: "false",
        get OPENROUTER_API_KEY(): never { providerReads += 1; throw new Error("Provider forbidden in Cron"); } });
      const siteEnvironment = { ...TEST_PRODUCTION_ENVIRONMENT,
        ARC_AI_RESEARCH_ENABLED: "false", ARC_AI_RESEARCH_EXECUTOR: undefined };
      let siteHandler: (request: Request) => Promise<Response>;
      let executorHandler: (request: Request) => Promise<Response>;
      const siteFetch: typeof fetch = async (input, init) => siteHandler(
        input instanceof Request && init === undefined ? input : new Request(input, init));
      const executorFetch: typeof fetch = async (input, init) => {
        const request = input instanceof Request && init === undefined ? input : new Request(input, init);
        const operation = new URL(request.url).pathname.split("/").pop();
        if (outage && operation === mode) throw new Error(`temporary-${mode}`);
        return executorHandler(request);
      };
      const rebuildHandlers = () => {
        executorHandler = createExecutorBridgeHandler(createHttpRuntime(makeExecutorEnvironment(), {
          bridgeFetch: siteFetch, wallNow: () => wall, monoNow: () => 1_000,
        }));
        siteHandler = createProductionSiteBridgeHandler({ environment: siteEnvironment,
          getD1: () => siteDb as unknown as D1Database, fetch: executorFetch,
          wallNow: () => wall, monoNow: () => 1_000 });
      };
      try {
        const executorJobs = new D1BridgeJobStore(executorDb as unknown as D1Database);
        await executorJobs.accept(siteFixture.execution.job, siteFixture.execution.createdAt);
        await executorJobs.recordWorkflowAccepted(siteFixture.execution.job,
          siteFixture.execution.jobId, siteFixture.execution.createdAt + 1);
        if (mode === "claimed") {
          const grant = { protocol: siteFixture.execution.job.protocol, jobId: siteFixture.execution.jobId,
            requestHash: siteFixture.execution.requestHash, beganAt: siteFixture.execution.beganAt!,
            executionExpiresAt: siteFixture.execution.executionExpiresAt! };
          await executorJobs.recordBegin(siteFixture.execution.job, grant);
          expect(await executorJobs.claimDispatch(siteFixture.execution.job, grant,
            siteFixture.execution.beganAt! + 1_000)).toBe(true);
        }
        const acceptance = new ExecutorMaintenanceStore(executorDb as unknown as D1Database);
        await acceptance.ensureAcceptance(siteFixture.execution.jobId, siteFixture.execution.createdAt + 1);
        await acceptance.recordAcceptance(siteFixture.execution.jobId, siteFixture.execution.createdAt + 1);
        rebuildHandlers();
        await runExecutorMaintenance(createMaintenanceRuntime(makeExecutorEnvironment(), {
          bridgeFetch: siteFetch, wallNow: () => wall, monoNow: () => 1_000,
        }));
        const initialRecovery = siteDb.database.prepare(`SELECT reason,quota_done,budget_done,terminal_hash
          FROM research_site_recoveries WHERE job_id=?1`).get(siteFixture.identity.jobId) as Record<string, unknown>;
        expect(initialRecovery).toMatchObject({ reason: "expired-unknown", quota_done: 1, budget_done: 1 });
        const failedRow = siteDb.database.prepare("SELECT * FROM research_runs WHERE id=?1")
          .get(siteFixture.identity.runId);
        const executionVersion = siteDb.database.prepare(`SELECT version FROM research_site_executions
          WHERE job_id=?1`).get(siteFixture.identity.jobId);
        const reservationBefore = siteDb.database.prepare(`SELECT * FROM ai_budget_reservations
          WHERE id=?1`).get(siteFixture.execution.budgetReservationId!) as Record<string, unknown>;
        expect(reservationBefore).toMatchObject({ id: siteFixture.execution.budgetReservationId,
          run_id: siteFixture.identity.runId, request_id: siteFixture.identity.requestId,
          status: "conservative-hold", settled_micros: 0,
          maximum_reserved_micros: siteFixture.execution.policy.maximumMicros });
        if (typeof reservationBefore.day_bucket_id !== "string"
          || typeof reservationBefore.month_bucket_id !== "string") throw new Error("missing original buckets");
        const originalBucketIds = [reservationBefore.day_bucket_id, reservationBefore.month_bucket_id];
        expect(new Set(originalBucketIds).size).toBe(2);
        const originalBuckets = siteDb.database.prepare(`SELECT id,reserved_micros,settled_micros
          FROM ai_budget_buckets WHERE id IN (?1,?2) ORDER BY id`)
          .all(...originalBucketIds) as Array<Record<string, unknown>>;
        expect(originalBuckets).toHaveLength(2);
        expect(siteDb.database.prepare(`SELECT count(*) AS n FROM quota_ledger
          WHERE reservation_id=?1 AND entry_kind<>'reserved'`)
          .get(siteFixture.execution.quotaReservationId!)).toEqual({ n: 1 });
        expect(providerReads).toBe(0);

        siteDb.close();
        executorDb.close();
        wall += 60_000;
        siteDb = reopenExecutorDb(siteFile, () => wall);
        executorDb = reopenExecutorDb(executorFile, () => wall);
        outage = false;
        rebuildHandlers();
        for (let pass = 0; pass < 3; pass++) {
          await runExecutorMaintenance(createMaintenanceRuntime(makeExecutorEnvironment(), {
            bridgeFetch: siteFetch, wallNow: () => wall, monoNow: () => 1_000,
          }));
          wall += 30_000;
        }
        const finalRecovery = siteDb.database.prepare(`SELECT reason,quota_done,budget_done,terminal_hash
          FROM research_site_recoveries WHERE job_id=?1`).get(siteFixture.identity.jobId) as Record<string, unknown>;
        const finalReservation = siteDb.database.prepare(`SELECT * FROM ai_budget_reservations
          WHERE id=?1`).get(siteFixture.execution.budgetReservationId!) as Record<string, unknown>;
        expect(finalReservation).toMatchObject({
          id: reservationBefore.id, request_id: reservationBefore.request_id, run_id: reservationBefore.run_id,
          day_bucket_id: reservationBefore.day_bucket_id, month_bucket_id: reservationBefore.month_bucket_id,
          maximum_reserved_micros: reservationBefore.maximum_reserved_micros, settled_micros: 0,
        });
        const finalBuckets = siteDb.database.prepare(`SELECT id,reserved_micros,settled_micros
          FROM ai_budget_buckets WHERE id IN (?1,?2) ORDER BY id`)
          .all(...originalBucketIds) as Array<Record<string, unknown>>;
        if (mode === "claimed") {
          expect(finalRecovery).toMatchObject({ reason: "expired-unknown", quota_done: 1, budget_done: 1,
            terminal_hash: initialRecovery.terminal_hash });
          expect(siteDb.database.prepare(`SELECT status,settled_micros FROM ai_budget_reservations
            WHERE id=?1`).get(siteFixture.execution.budgetReservationId!))
            .toEqual({ status: "conservative-hold", settled_micros: 0 });
          expect(finalBuckets).toEqual(originalBuckets);
        } else {
          expect(finalRecovery).toMatchObject({ reason: "executor-unsent", quota_done: 1, budget_done: 1,
            terminal_hash: initialRecovery.terminal_hash });
          expect(siteDb.database.prepare(`SELECT status,settled_micros FROM ai_budget_reservations
            WHERE id=?1`).get(siteFixture.execution.budgetReservationId!))
            .toEqual({ status: "released", settled_micros: 0 });
          expect(finalBuckets).toEqual(originalBuckets.map((row) => ({ ...row,
            reserved_micros: Number(row.reserved_micros) - Number(reservationBefore.maximum_reserved_micros),
          })));
        }
        expect(siteDb.database.prepare(`SELECT count(*) AS n FROM quota_ledger
          WHERE reservation_id=?1 AND entry_kind<>'reserved'`)
          .get(siteFixture.execution.quotaReservationId!)).toEqual({ n: 1 });
        expect(siteDb.database.prepare("SELECT * FROM research_runs WHERE id=?1")
          .get(siteFixture.identity.runId)).toEqual(failedRow);
        expect(siteDb.database.prepare(`SELECT version FROM research_site_executions
          WHERE job_id=?1`).get(siteFixture.identity.jobId)).toEqual(executionVersion);
        const accountingSnapshot = {
          quota: siteDb.database.prepare(`SELECT * FROM quota_ledger WHERE reservation_id=?1 ORDER BY rowid`)
            .all(siteFixture.execution.quotaReservationId!),
          budget: siteDb.database.prepare(`SELECT * FROM ai_budget_buckets ORDER BY id`).all(),
          reservation: siteDb.database.prepare(`SELECT * FROM ai_budget_reservations WHERE id=?1`)
            .get(siteFixture.execution.budgetReservationId!),
        };
        const replay = await runExecutorMaintenance(createMaintenanceRuntime(makeExecutorEnvironment(), {
          bridgeFetch: siteFetch, wallNow: () => wall, monoNow: () => 1_000,
        }));
        expect(replay.visited[0]).toBe(mode === "claimed" ? 1 : 0);
        expect({
          quota: siteDb.database.prepare(`SELECT * FROM quota_ledger WHERE reservation_id=?1 ORDER BY rowid`)
            .all(siteFixture.execution.quotaReservationId!),
          budget: siteDb.database.prepare(`SELECT * FROM ai_budget_buckets ORDER BY id`).all(),
          reservation: siteDb.database.prepare(`SELECT * FROM ai_budget_reservations WHERE id=?1`)
            .get(siteFixture.execution.budgetReservationId!),
        }).toEqual(accountingSnapshot);
        expect(workflow.create).not.toHaveBeenCalled();
        expect(providerReads).toBe(0);
      } finally {
        try { siteDb?.close(); } catch { /* already closed for reopen */ }
        try { executorDb?.close(); } catch { /* already closed for reopen */ }
        rmSync(directory, { recursive: true, force: true });
      }
    }, 30_000,
  );
});
