// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { D1BridgeJobStore } from "../../worker/research-executor/d1-job-store";
import { D1EntitlementRepository } from "../../app/server/entitlements/d1-entitlement-repository";
import { SiteAdmissionCoordinator } from "../../app/server/research/site-admission";
import { seedUser } from "../helpers/sqlite-d1";
import { createResearchExecutorPrivateFixture } from "../helpers/research-executor-private-fixture";

type Fixture = Awaited<ReturnType<typeof createResearchExecutorPrivateFixture>>;
const fixtures: Fixture[] = [];
async function fixture() {
  const value = await createResearchExecutorPrivateFixture();
  fixtures.push(value);
  return value;
}
async function additionalJob(f: Fixture, index: number) {
  const ownerId = `backlog-owner-${index}`;
  seedUser(f.siteDb, ownerId);
  const created = await f.research.createRemoteOrReplay({ ownerId, requestId: `backlog-request-${index}`,
    mutationId: `backlog-mutation-${index}`, rawRole: f.execution.job.role,
    normalizedRoleKey: "data product manager", locale: f.execution.job.locale,
    inputFingerprint: f.execution.job.inputFingerprint, configFingerprint: f.execution.job.configFingerprint,
    policy: { ...f.execution.policy, dailyBudgetMicros: 500_000_000, monthlyBudgetMicros: 1_000_000_000 } });
  if (!created.execution) throw new Error("missing backlog execution");
  const coordinator = new SiteAdmissionCoordinator({ research: f.research, executions: f.executions,
    budget: f.budget, entitlements: new D1EntitlementRepository(f.siteDb as unknown as D1Database, { now: f.wallNow }),
    now: f.wallNow });
  return (await coordinator.admitNew({ ownerId, runId: created.execution.runId, requestId: created.execution.requestId,
    jobId: created.execution.jobId, requestHash: created.execution.requestHash },
  { newCallsAllowed: true, cohortEnabled: true, rateAllowed: true })).execution;
}
afterEach(async () => {
  vi.useRealTimers();
  while (fixtures.length) await fixtures.pop()!.dispose();
});

function row(f: Fixture, sql: string, ...values: string[]) {
  return f.siteDb.database.prepare(sql).get(...values) as Record<string, unknown>;
}
function accounting(f: Fixture) {
  return {
    quota: f.siteDb.database.prepare("SELECT * FROM quota_ledger ORDER BY rowid").all(),
    budget: f.siteDb.database.prepare("SELECT * FROM ai_budget_buckets ORDER BY id").all(),
    reservations: f.siteDb.database.prepare("SELECT * FROM ai_budget_reservations ORDER BY id").all(),
  };
}
function recovery(f: Fixture) {
  return row(f, "SELECT reason,quota_done,budget_done,terminal_hash FROM research_site_recoveries WHERE job_id=?1", f.identity.jobId);
}
function frozenTerminal(f: Fixture) {
  return {
    failed: row(f, "SELECT * FROM research_runs WHERE id=?1", f.identity.runId),
    version: row(f, "SELECT version FROM research_site_executions WHERE job_id=?1", f.identity.jobId),
    hash: recovery(f)?.terminal_hash,
  };
}
function reservation(f: Fixture) {
  return row(f, "SELECT * FROM ai_budget_reservations WHERE id=?1", f.execution.budgetReservationId!);
}
function buckets(f: Fixture) {
  const value = reservation(f);
  return f.siteDb.database.prepare("SELECT id,reserved_micros,settled_micros FROM ai_budget_buckets WHERE id IN (?1,?2) ORDER BY id")
    .all(value.day_bucket_id as string, value.month_bucket_id as string) as Array<{ id: string; reserved_micros: number; settled_micros: number }>;
}
function expectHeld(f: Fixture) {
  expect(recovery(f)).toMatchObject({ reason: "expired-unknown", quota_done: 1, budget_done: 1 });
  expect(reservation(f)).toMatchObject({ status: "conservative-hold", settled_micros: 0,
    maximum_reserved_micros: f.execution.policy.maximumMicros });
  expect(frozenTerminal(f).failed.state).toBe("failed");
  expect(f.syntheticProviderCalls()).toBe(0);
}
async function boundedPass(f: Fixture) {
  f.setWallNow(f.wallNow() + 60_000);
  const result = await f.runCron();
  expect(result.visited.every((count) => count >= 0 && count <= 10)).toBe(true);
  return result;
}
async function begunWithoutProvider(f: Fixture, mode: "nullable" | "grant" | "claimed") {
  await f.executorClient.submit(f.execution.job);
  const { grant } = await f.siteClient.begin(f.execution.job);
  const jobs = new D1BridgeJobStore(f.executorDb as unknown as D1Database);
  if (mode !== "nullable") await jobs.recordBegin(f.execution.job, grant);
  if (mode === "claimed") expect(await jobs.claimDispatch(f.execution.job, grant, f.wallNow())).toBe(true);
  f.setWorkflowStatus(f.identity.jobId, "errored");
  f.setWallNow(grant.executionExpiresAt + 1_000);
  return grant;
}
async function expectReleasedOnce(f: Fixture, before: ReturnType<typeof frozenTerminal>, original: ReturnType<typeof reservation>,
  originalBuckets: ReturnType<typeof buckets>) {
  for (let pass = 0; pass < 3 && recovery(f).reason !== "executor-unsent"; pass++) await boundedPass(f);
  expect(recovery(f)).toMatchObject({ reason: "executor-unsent", quota_done: 1, budget_done: 1, terminal_hash: before.hash });
  expect(frozenTerminal(f)).toEqual(before);
  expect(reservation(f)).toMatchObject({ id: original.id, run_id: original.run_id, request_id: original.request_id,
    day_bucket_id: original.day_bucket_id, month_bucket_id: original.month_bucket_id,
    maximum_reserved_micros: original.maximum_reserved_micros, status: "released", settled_micros: 0 });
  expect(buckets(f)).toEqual(originalBuckets.map((value) => ({ ...value,
    reserved_micros: value.reserved_micros - Number(original.maximum_reserved_micros) })));
  expect(row(f, "SELECT count(*) n FROM quota_ledger WHERE reservation_id=?1 AND entry_kind<>'reserved'",
    f.execution.quotaReservationId!)).toEqual({ n: 1 });
  const settled = accounting(f);
  await f.reopen();
  await boundedPass(f);
  expect(accounting(f)).toEqual(settled);
  expect(frozenTerminal(f)).toEqual(before);
  expect(f.syntheticProviderCalls()).toBe(0);
  expect(f.repairCalls()).toBe(0);
  expect(f.workflowCreates()).toBe(1);
}

describe("private Site and executor integration", () => {
  it("persists an admitted signed submission as one validated ready package after discarding the submit caller", async () => {
    const f = await fixture();
    const siteFile = f.siteDb.database.prepare("PRAGMA database_list").get() as { file: string };
    const executorFile = f.executorDb.database.prepare("PRAGMA database_list").get() as { file: string };
    expect(siteFile.file).not.toBe("");
    expect(executorFile.file).not.toBe("");
    expect(siteFile.file).not.toBe(executorFile.file);
    expect(f.execution.beganAt).toBeNull();
    const originalBuckets = buckets(f);
    await f.executorClient.submit(f.execution.job); // Intentionally discard the response and its caller graph.
    expect(row(f, "SELECT state FROM research_runs WHERE id=?1", f.identity.runId)).toEqual({ state: "queued" });
    expect(f.syntheticProviderCalls()).toBe(0);
    await f.reopen();
    const result = await f.runWorkflowBody(f.identity.jobId);
    expect(result.state).toBe("recorded");
    expect(f.syntheticProviderCalls()).toBe(1);
    expect(f.providerRequests).toHaveLength(1);
    expect(f.providerRequests[0]).toMatchObject({ model: "moonshotai/kimi-k3", stream: false, max_tokens: 32768 });
    // Receipt is saved in local R2 and native SQL before Cron exists. Recreate both graphs and R2.
    await f.reopen();
    f.setInterceptor("site", "complete", async (_request, dispatch) => {
      await dispatch();
      throw new Error("Site import committed but its acknowledgement was lost");
    });
    await f.runCron();
    f.setInterceptor("site", "complete", null);
    const ready = row(f, "SELECT * FROM research_runs WHERE id=?1", f.identity.runId);
    expect(ready).toMatchObject({ state: "ready", package_id: f.execution.validationContext.packageId });
    const value = await f.research.resolveReadyPackage(f.identity.ownerId, f.identity.runId);
    expect(value).toMatchObject({ id: f.execution.validationContext.packageId,
      blueprint: { version: f.execution.validationContext.blueprintVersion },
      registry: { version: f.execution.validationContext.registryVersion },
      qualityVersion: f.execution.validationContext.qualityVersion,
      modelConfigVersion: f.execution.validationContext.modelConfigVersion,
      promptVersion: f.execution.validationContext.promptVersion,
      inputSchemaVersion: f.execution.validationContext.inputSchemaVersion,
      outputSchemaVersion: f.execution.validationContext.outputSchemaVersion,
      observedAt: "2026-09-15", expiresAt: "2026-10-15" });
    expect(value.qualityReport).toEqual(JSON.parse(ready.quality_json as string));
    await expect(f.research.resolveReadyPackage("owner-b", f.identity.runId)).rejects.toThrow();
    for (const table of ["research_packages", "research_site_imports", "ai_runs", "ai_budget_reservations"]) {
      expect(row(f, `SELECT count(*) n FROM ${table}`)).toEqual({ n: 1 });
    }
    expect(row(f, "SELECT count(*) n FROM quota_ledger WHERE entry_kind<>'reserved'")).toEqual({ n: 1 });
    expect(buckets(f)).toEqual(originalBuckets.map((bucket) => ({ ...bucket,
      reserved_micros: bucket.reserved_micros - f.execution.policy.maximumMicros,
      settled_micros: bucket.settled_micros + 100_000 })));
    const journal = row(f, "SELECT * FROM research_site_imports");
    expect(journal).toMatchObject({ receipt_hash: result.receiptHash, phase: 5, decision_json: null });
    const fixed = { journal, accounting: accounting(f), ready };
    const status = await f.executorClient.status(f.execution.job);
    const notice = { jobId: f.identity.jobId, requestHash: f.identity.requestHash, receiptHash: result.receiptHash! };
    expect(status.metadata?.receiptHash).toBe(result.receiptHash);
    await Promise.all([f.siteClient.complete(f.execution.job, notice), f.siteClient.metadata(f.execution.job, status.metadata!)]);
    f.setNewCallsAllowed(false);
    await f.reopen();
    await boundedPass(f);
    expect({ journal: row(f, "SELECT * FROM research_site_imports"), accounting: accounting(f),
      ready: row(f, "SELECT * FROM research_runs WHERE id=?1", f.identity.runId) }).toEqual(fixed);
    expect(await f.research.resolveReadyPackage(f.identity.ownerId, f.identity.runId)).toEqual(value);
    expect(f.syntheticProviderCalls()).toBe(1);
    expect(f.repairCalls()).toBe(0);
    expect(f.workflowCreates()).toBe(1);
    for (const entry of f.traffic.filter((item) => ["submit", "accepted", "complete", "metadata"].includes(item.operation))) {
      expect(entry.response).not.toMatch(/"content"|"annotations"|sourceEvidence|synthetic-private-key/u);
    }
  }, 30_000);

  it.each([
    ["status", "nullable"], ["status", "grant"], ["close", "nullable"], ["close", "grant"],
  ] as const)("recovers %s uncertainty with %s executor grant after both persisted graphs restart", async (operation, mode) => {
    const f = await fixture();
    await begunWithoutProvider(f, mode);
    f.setInterceptor("executor", operation, async () => { throw new Error("synthetic temporary outage"); });
    await f.runCron();
    expectHeld(f);
    if (operation === "close") expect(f.traffic.some((item) => item.operation === "status" && item.status === 200)).toBe(true);
    const before = frozenTerminal(f);
    const original = reservation(f);
    const originalBuckets = buckets(f);
    const executorBefore = f.executorDb.database.prepare("SELECT * FROM research_executor_jobs").all();
    const cursors = f.executorDb.database.prepare("SELECT * FROM research_executor_maintenance_cursors ORDER BY category").all();
    const workflows = f.workflowRecords();
    f.setNewCallsAllowed(false);
    await f.reopen();
    expect(f.executorDb.database.prepare("SELECT * FROM research_executor_jobs").all()).toEqual(executorBefore);
    expect(f.executorDb.database.prepare("SELECT * FROM research_executor_maintenance_cursors ORDER BY category").all()).toEqual(cursors);
    expect(f.workflowRecords()).toEqual(workflows);
    expect(frozenTerminal(f)).toEqual(before);
    f.setInterceptor("executor", operation, null);
    await expectReleasedOnce(f, before, original, originalBuckets);
    const status = await f.executorClient.status(f.execution.job);
    expect(status.dispatchState).toBe("closed");
    expect(status.unsent?.grant === null).toBe(mode === "nullable");
  }, 30_000);

  it("keeps a claimed job without a receipt eligible and held across repeated closed-mode restarts", async () => {
    const f = await fixture();
    await begunWithoutProvider(f, "claimed");
    await f.runCron();
    expectHeld(f);
    const before = frozenTerminal(f);
    const held = accounting(f);
    f.setNewCallsAllowed(false);
    for (let pass = 0; pass < 2; pass++) {
      await f.reopen();
      expect((await boundedPass(f)).visited[0]).toBe(1);
      expectHeld(f);
      expect(accounting(f)).toEqual(held);
      expect(frozenTerminal(f)).toEqual(before);
    }
    expect(await f.executorClient.status(f.execution.job)).toMatchObject({ dispatchState: "claimed", metadata: null, unsent: null });
    expect(f.workflowCreates()).toBe(1);
  }, 30_000);

  it.each(["status", "close", "late-close"] as const)(
    "consumes the full 4500ms Site deadline during %s stalls, fences late work, and recovers once", async (mode) => {
      const f = await fixture();
      await begunWithoutProvider(f, "nullable");
      f.setNewCallsAllowed(false);
      let initial: ReturnType<typeof frozenTerminal> | undefined;
      let original: ReturnType<typeof reservation> | undefined;
      let originalBuckets: ReturnType<typeof buckets> | undefined;
      for (let pass = 0; pass < 2; pass++) {
        // Miniflare restarts use real timers. Only the tested handler/Cron graph uses the controlled clock.
        if (pass) { await f.reopen(); f.setWallNow(f.wallNow() + 60_000); }
        f.setInterceptor("site", "maintenance", async (_request, dispatch) => {
          const current = f.monoNow();
          vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
          f.setMonoNow(current);
          return dispatch();
        });
        let enter!: () => void;
        const entered = new Promise<void>((resolve) => { enter = resolve; });
        let aborted = false;
        let heldAtEntry: ReturnType<typeof accounting> | undefined;
        f.setInterceptor("executor", mode === "status" ? "status" : "close", async (request, dispatch) => {
          expectHeld(f); // Local SQL expiry, terminal quota and conservative budget must precede outbound I/O.
          heldAtEntry = accounting(f);
          initial ??= frozenTerminal(f);
          original ??= reservation(f);
          originalBuckets ??= buckets(f);
          const late = mode === "late-close" ? await dispatch() : undefined;
          enter();
          return new Promise<Response>((resolve, reject) => {
            request.signal.addEventListener("abort", () => {
              aborted = true;
              if (late) resolve(late); // The remote close committed, but its signed response arrives after cancellation.
              else reject(new DOMException("full-deadline injected stall", "AbortError"));
            }, { once: true });
          });
        });
        // A committed close is seen as closed on the next pass; test its lost response only once.
        if (mode === "late-close" && pass === 1) break;
        let running!: ReturnType<Fixture["runCron"]>;
        let reached = false;
        for (let attempt = 0; attempt < 3 && !reached; attempt++) {
          running = f.runCron();
          reached = await Promise.race([entered.then(() => true), running.then(() => false)]);
          if (!reached) {
            const current = f.monoNow();
            vi.useRealTimers();
            f.setMonoNow(current);
            f.setWallNow(f.wallNow() + 60_000);
          }
        }
        expect(reached).toBe(true);
        const started = f.monoNow();
        await vi.advanceTimersByTimeAsync(4_499);
        expect(aborted).toBe(false);
        expect(accounting(f)).toEqual(heldAtEntry);
        await vi.advanceTimersByTimeAsync(1);
        expect(aborted).toBe(true);
        expect(f.monoNow()).toBe(started + 4_500);
        expectHeld(f);
        expect(accounting(f)).toEqual(heldAtEntry);
        expect(frozenTerminal(f)).toEqual(initial);
        await vi.advanceTimersByTimeAsync(1_000);
        expect(accounting(f)).toEqual(heldAtEntry);
        expect(frozenTerminal(f)).toEqual(initial);
        expect(f.syntheticProviderCalls()).toBe(0);
        const current = f.monoNow();
        vi.useRealTimers();
        f.setMonoNow(current);
        await running;
      }
      f.setInterceptor("site", "maintenance", null);
      f.setInterceptor("executor", mode === "status" ? "status" : "close", null);
      await expectReleasedOnce(f, initial!, original!, originalBuckets!);
    }, 30_000,
  );
});

describe("private native backlog and transport boundaries", () => {
  it("rotates more than twenty rows in every native category past a poisoned first row across restarts", async () => {
    const f = await fixture();
    const records = [f.execution];
    for (let index = 1; index <= 24; index++) records.push(await additionalJob(f, index));
    for (const execution of records) {
      await f.executorClient.submit(execution.job);
      expect((await f.runWorkflowBody(execution.jobId)).state).toBe("recorded");
    }
    expect(f.syntheticProviderCalls()).toBe(25);
    // Corrupt only an executor payload, keeping a legal sort key and real native schema constraints.
    const poisoned = f.executorDb.database.prepare("SELECT job_id FROM research_executor_jobs ORDER BY accepted_at,job_id LIMIT 1")
      .get() as { job_id: string };
    f.executorDb.database.prepare("UPDATE research_executor_jobs SET job_json='{}' WHERE job_id=?1").run(poisoned.job_id);
    f.setWallNow(f.wallNow() + 86_400_000 + 1_000);
    f.setNewCallsAllowed(false);
    const firstCategories: number[] = [];
    for (let pass = 0; pass < 8; pass++) {
      const before = f.executorDb.database.prepare("SELECT next_category FROM research_executor_maintenance_schedule").get() as { next_category: number };
      firstCategories.push(before.next_category);
      const started = f.monoNow();
      const result = await boundedPass(f);
      expect(f.monoNow() - started).toBeLessThan(30_000);
      expect(result.visited.every((count) => count <= 10)).toBe(true);
      if (pass === 0) expect(result.visited.slice(1)).toEqual([10, 10]);
      if (pass === 1) {
        const cursors = f.executorDb.database.prepare("SELECT * FROM research_executor_maintenance_cursors ORDER BY category").all();
        await f.reopen();
        expect(f.executorDb.database.prepare("SELECT * FROM research_executor_maintenance_cursors ORDER BY category").all()).toEqual(cursors);
      }
    }
    expect(firstCategories).toEqual([0, 1, 2, 0, 1, 2, 0, 1]);
    expect(f.executorDb.database.prepare("SELECT count(*) n FROM research_executor_acceptance_delivery WHERE acknowledged_at IS NOT NULL").get()).toEqual({ n: 24 });
    expect(f.executorDb.database.prepare("SELECT count(*) n FROM research_executor_results WHERE body_removed_at IS NOT NULL").get()).toEqual({ n: 24 });
    // Metadata delivery may resolve a row before the Site expiry scan reaches it.
    expect(row(f, "SELECT count(*) n FROM research_runs WHERE state='failed'")).toEqual({ n: 25 });
    expect(row(f, "SELECT count(*) n FROM quota_ledger WHERE entry_kind<>'reserved'")).toEqual({ n: 25 });
    expect(row(f, "SELECT count(*) n FROM ai_budget_reservations WHERE status='conservative-hold'")).toEqual({ n: 1 });
    expect(row(f, "SELECT count(*) n FROM ai_budget_reservations WHERE status='settled' AND settled_micros=100000")).toEqual({ n: 24 });
    expect(row(f, "SELECT count(*) n FROM research_packages")).toEqual({ n: 0 });
    expect(f.workflowCreates()).toBe(25);
    expect(f.syntheticProviderCalls()).toBe(25);
    expect(f.repairCalls()).toBe(0);
  }, 60_000);

  it("rejects unknown origins and paths before business effects and separates authentication nonces", async () => {
    const f = await fixture();
    const before = accounting(f);
    for (const url of ["https://unknown.test/internal/research-bridge/submit", "https://executor.test/internal/research-bridge/nope",
      "https://executor.test/internal/research-bridge/submit?redirect=1", "http://executor.test/internal/research-bridge/submit"]) {
      await expect(f.localFetch("executor", new Request(url, { method: "POST", body: "{}" }))).rejects.toThrow("rejected");
    }
    expect(f.executorDb.database.prepare("SELECT count(*) n FROM research_executor_jobs").get()).toEqual({ n: 0 });
    expect(accounting(f)).toEqual(before);
    // Alter complete signed request bytes before the real handler authenticates them.
    f.setInterceptor("executor", "submit", async (request) => f.executorHandler(new Request(request.url,
      { method: "POST", headers: request.headers, body: `${await request.text()} ` })));
    await expect(f.executorClient.submit(f.execution.job)).rejects.toThrow();
    expect(f.executorDb.database.prepare("SELECT count(*) n FROM research_executor_jobs").get()).toEqual({ n: 0 });
    expect(accounting(f)).toEqual(before);
    f.setInterceptor("executor", "submit", null);
    await f.executorClient.submit(f.execution.job);
    const jobsBefore = f.executorDb.database.prepare("SELECT * FROM research_executor_jobs").all();
    const nonceCount = () => f.executorDb.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get() as { n: number };
    const noncesBefore = nonceCount().n;
    f.setInterceptor("executor", "status", async (_request, dispatch) => {
      const response = await dispatch();
      return new Response(`${await response.text()} `, { status: response.status, headers: response.headers });
    });
    await expect(f.executorClient.status(f.execution.job)).rejects.toThrow();
    expect(nonceCount().n).toBe(noncesBefore + 1); // The real handler consumed an authenticated request nonce.
    expect(f.executorDb.database.prepare("SELECT * FROM research_executor_jobs").all()).toEqual(jobsBefore);
    expect(accounting(f)).toEqual(before);
    expect(f.syntheticProviderCalls()).toBe(0);
  });
});

describe("private native scheduling deadlines", () => {
  it("bounds a stalled eight-second category to two requests in flight and resumes a 25-row bootstrap backlog fairly", async () => {
    const f = await fixture();
    const records = [f.execution];
    for (let index = 1; index <= 24; index++) records.push(await additionalJob(f, index));
    for (const execution of records) await f.executorClient.submit(execution.job);
    const creates = f.workflowCreates();
    let active = 0;
    let maximum = 0;
    const durations: number[] = [];
    let entered = 0;
    let wake: (() => void) | undefined;
    let target = 2;
    const waitFor = (count: number) => {
      target = count;
      return entered >= count ? Promise.resolve() : new Promise<void>((resolve) => { wake = resolve; });
    };
    f.setInterceptor("site", "accepted", async (request) => {
      const start = f.monoNow();
      active += 1;
      maximum = Math.max(maximum, active);
      entered += 1;
      if (entered >= target) { wake?.(); wake = undefined; }
      return new Promise<Response>((_resolve, reject) => request.signal.addEventListener("abort", () => {
        active -= 1;
        durations.push(f.monoNow() - start);
        reject(new DOMException("bootstrap category stall", "AbortError"));
      }, { once: true }));
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    f.setMonoNow(1_000);
    const running = f.runCron();
    await waitFor(2);
    expect(maximum).toBe(2);
    await vi.advanceTimersByTimeAsync(5_000);
    await waitFor(4);
    await vi.advanceTimersByTimeAsync(3_000);
    const result = await running;
    expect(result.visited.every((count) => count <= 10)).toBe(true);
    expect(maximum).toBe(2);
    expect(active).toBe(0);
    expect(durations).toEqual([5_000, 5_000, 2_000, 2_000]);
    const attempts = f.executorDb.database.prepare("SELECT sum(attempt_count) n FROM research_executor_acceptance_delivery").get();
    expect(attempts).toEqual({ n: 4 });
    const schedule = f.executorDb.database.prepare("SELECT * FROM research_executor_maintenance_schedule").get();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.executorDb.database.prepare("SELECT * FROM research_executor_maintenance_schedule").get()).toEqual(schedule);
    expect(f.executorDb.database.prepare("SELECT sum(attempt_count) n FROM research_executor_acceptance_delivery").get()).toEqual(attempts);
    vi.useRealTimers();
    f.setMonoNow(39_000);
    f.setInterceptor("site", "accepted", null);
    await f.reopen();
    for (let pass = 0; pass < 6; pass++) await boundedPass(f);
    expect(f.executorDb.database.prepare("SELECT count(*) n FROM research_executor_acceptance_delivery WHERE acknowledged_at IS NOT NULL").get()).toEqual({ n: 25 });
    expect(f.traffic.some((entry) => entry.operation === "outbox")).toBe(true);
    expect(f.workflowCreates()).toBe(creates);
    expect(f.syntheticProviderCalls()).toBe(0);
    expect(f.repairCalls()).toBe(0);
  }, 60_000);
});
