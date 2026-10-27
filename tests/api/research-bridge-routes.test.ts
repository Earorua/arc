// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { signBridgeMessage } from "../../app/server/research/executor/auth";
import { D1BridgeNonceStore } from "../../app/server/research/executor/d1-nonce-store";
import { BridgeTransport } from "../../app/server/research/executor/http-transport";
import { hashBridgeJob } from "../../app/server/research/executor/job";
import { SiteBridgeClient } from "../../worker/research-executor/site-client";
import { createGuardedD1, createProductionSiteBridgeHandler } from "../../app/server/research/site-bridge-factory";
import { createD1OperationBarrier, createResearchBridgeFixture, TEST_PRODUCTION_ENVIRONMENT } from "../helpers/research-bridge-fixture";
import { validReceipt } from "../helpers/site-import-fixture";

describe("private Site research bridge routes", () => {
  it("imports a matched executor result through the real coordinator and converges repeated metadata", async () => {
    const f = await createResearchBridgeFixture();
    expect("OPENROUTER_API_KEY" in f.environment).toBe(false);
    f.setNewExecutionAllowed(false);
    const notice = await f.notice();
    const first = await f.siteClient.complete(f.execution.job, notice);
    const second = await f.siteClient.metadata(f.execution.job, await f.metadata());
    expect(first).toMatchObject({ receiptHash: notice.receiptHash, accounting: "settled" });
    expect(second).toEqual(first);
    expect(await f.research.getRun("owner-b", f.identity.runId)).toBeNull();
    expect(f.db.database.prepare("SELECT count(*) n FROM ai_runs").get()).toEqual({ n: 1 });
    expect(f.db.database.prepare("SELECT count(*) n FROM quota_ledger WHERE entry_kind<>'reserved'").get()).toEqual({ n: 1 });
    expect(f.db.database.prepare("SELECT count(*) n FROM research_packages").get()).toEqual({ n: 1 });
    expect(f.db.database.prepare("SELECT phase FROM research_site_imports").get()).toEqual({ phase: 5 });
    expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))?.status).toBe("settled");
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it("claims the service nonce for a signed invalid DTO but starts no business mutation", async () => {
    const f = await createResearchBridgeFixture();
    const businessBefore = f.businessSnapshot();
    const body = new TextEncoder().encode('{"ownerId":"owner-b"}');
    const path = "/api/internal/research-bridge/accepted";
    const headers = await signBridgeMessage({ context: { direction: "executor-to-site", kind: "request", method: "POST",
      path, audience: f.connection.siteOrigin, jobId: f.execution.jobId, status: null }, body,
      keyId: f.connection.executorToSite.keyId, keyBytes: f.connection.executorToSite.copyKeyBytes(), now: f.wallNow });
    headers.set("x-arc-bridge-job-id", f.execution.jobId);
    const before = f.db.database.prepare("SELECT count(*) n FROM research_site_acceptances").get();
    const response = await f.handler(new Request(`${f.connection.siteOrigin}${path}`, { method: "POST", headers, body }));
    expect(response.status).toBe(400);
    expect(f.db.database.prepare("SELECT count(*) n FROM research_bridge_nonces WHERE scope='executor-to-site:executor-test'").get()).toEqual({ n: 1 });
    expect(f.db.database.prepare("SELECT count(*) n FROM research_site_acceptances").get()).toEqual(before);
    expect(f.businessSnapshot()).toEqual(businessBefore);
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it("rejects a wrong HMAC before nonce or business effects", async () => {
    const f = await createResearchBridgeFixture();
    const businessBefore = f.businessSnapshot();
    const body = new TextEncoder().encode("{}");
    const path = "/api/internal/research-bridge/begin";
    const headers = await signBridgeMessage({ context: { direction: "executor-to-site", kind: "request", method: "POST",
      path, audience: f.connection.siteOrigin, jobId: f.execution.jobId, status: null }, body,
      keyId: f.connection.siteToExecutor.keyId, keyBytes: f.connection.siteToExecutor.copyKeyBytes(), now: f.wallNow });
    headers.set("x-arc-bridge-job-id", f.execution.jobId);
    expect((await f.handler(new Request(`${f.connection.siteOrigin}${path}`, { method: "POST", headers, body }))).status).toBe(401);
    expect(f.db.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()).toEqual({ n: 0 });
    expect(f.businessSnapshot()).toEqual(businessBefore);
  });

  it("rejects a canonical session-cookie-only request before nonce or business effects", async () => {
    const f = await createResearchBridgeFixture();
    const businessBefore = f.businessSnapshot();
    const requestHash = await hashBridgeJob(f.execution.job);
    const body = new TextEncoder().encode(JSON.stringify({ jobId: f.execution.jobId, requestHash }));
    const path = "/api/internal/research-bridge/begin";
    const response = await f.handler(new Request(`${f.connection.siteOrigin}${path}`, { method: "POST",
      headers: { cookie: "better-auth.session_token=synthetic-session", "content-type": "application/json",
        "x-arc-bridge-job-id": f.execution.jobId }, body }));
    expect(response.status).toBe(401);
    expect(f.db.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()).toEqual({ n: 0 });
    expect(f.businessSnapshot()).toEqual(businessBefore);
    expect(f.executorFetches()).toBe(0);
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it("fences a delayed signature verification before nonce claim", async () => {
    const f = await createResearchBridgeFixture();
    const requestHash = await hashBridgeJob(f.execution.job);
    const body = new TextEncoder().encode(JSON.stringify({ jobId: f.execution.jobId, requestHash }));
    const path = "/api/internal/research-bridge/begin";
    const headers = await signBridgeMessage({ context: { direction: "executor-to-site", kind: "request", method: "POST",
      path, audience: f.connection.siteOrigin, jobId: f.execution.jobId, status: null }, body,
      keyId: f.connection.executorToSite.keyId, keyBytes: f.connection.executorToSite.copyKeyBytes(), now: f.wallNow });
    headers.set("x-arc-bridge-job-id", f.execution.jobId);
    let entered!: () => void;
    let resume!: () => void;
    const atVerify = new Promise<void>((resolve) => { entered = resolve; });
    const resumed = new Promise<void>((resolve) => { resume = resolve; });
    const original = crypto.subtle.verify.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, "verify").mockImplementation(async (...args) => {
      entered(); await resumed; return original(...args);
    });
    try {
      const pending = f.handler(new Request(`${f.connection.siteOrigin}${path}`, { method: "POST", headers, body }));
      await atVerify;
      f.advanceMono(5_001);
      resume();
      expect((await pending).status).toBe(503);
      expect(f.db.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()).toEqual({ n: 0 });
    } finally { spy.mockRestore(); }
  });

  it("persists a matched acceptance and returns the original begin grant while the new-call gate is closed", async () => {
    const f = await createResearchBridgeFixture();
    const requestHash = await hashBridgeJob(f.execution.job);
    const proof = { jobId: f.execution.jobId, requestHash, workflowId: f.execution.jobId,
      workflowAcceptedAt: f.execution.createdAt + 10 };
    f.setNewExecutionAllowed(false);
    await expect(f.siteClient.accepted(f.execution.job, proof)).resolves.toEqual(proof);
    const reply = await f.siteClient.begin(f.execution.job);
    expect(reply.grant).toEqual({ protocol: f.execution.job.protocol, jobId: f.execution.jobId, requestHash,
      beganAt: f.execution.beganAt, executionExpiresAt: f.execution.executionExpiresAt });
    expect(f.db.database.prepare("SELECT count(*) n FROM research_site_acceptances").get()).toEqual({ n: 1 });
    const queued = await f.createRemote("owner-b");
    const admitted = (await f.coordinator.admitNew({ ownerId: queued.execution.ownerId, runId: queued.execution.runId,
      requestId: queued.execution.requestId, jobId: queued.execution.jobId, requestHash: queued.execution.requestHash },
      { newCallsAllowed: true, cohortEnabled: true, rateAllowed: true })).execution;
    await expect(f.siteClient.begin(admitted.job)).rejects.toBeDefined();
    expect((await f.executions.read(admitted.ownerId, admitted.runId))?.beganAt).toBeNull();
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it("rejects noncanonical paths, methods, origins, receiver operations, and oversized bodies before business effects", async () => {
    const f = await createResearchBridgeFixture();
    f.setNewExecutionAllowed(false);
    const businessBefore = f.businessSnapshot();
    const urls = [
      `${f.connection.siteOrigin}/api/internal/research-bridge/begin?x=1`,
      `${f.connection.siteOrigin}/internal/research-bridge/status`,
      `https://other.test/api/internal/research-bridge/begin`,
    ];
    for (const url of urls) expect((await f.handler(new Request(url, { method: "POST", body: "{}" }))).status).toBeGreaterThanOrEqual(400);
    expect((await f.handler(new Request(`${f.connection.siteOrigin}/api/internal/research-bridge/begin`, {
      method: "POST", headers: { origin: "https://browser.test" }, body: "{}",
    }))).status).toBe(404);
    expect((await f.handler(new Request(`${f.connection.siteOrigin}/api/internal/research-bridge/begin`, { method: "GET" }))).status).toBe(405);
    expect((await f.handler(new Request(`${f.connection.siteOrigin}/api/internal/research-bridge/begin`, {
      method: "POST", headers: { "x-arc-bridge-job-id": f.execution.jobId }, body: "x".repeat(4_097) }))).status).toBe(400);
    expect(f.db.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()).toEqual({ n: 0 });
    expect(f.businessSnapshot()).toEqual(businessBefore);
    expect(f.executorFetches()).toBe(0);
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it("returns an empty outbox while the new-call gate is closed without advancing its durable cursor", async () => {
    const f = await createResearchBridgeFixture();
    f.setNewExecutionAllowed(false);
    const before = f.db.database.prepare("SELECT * FROM research_site_scan_cursors WHERE name='outbox'").get();
    await expect(f.siteClient.outbox()).resolves.toEqual({ jobs: [], next: null });
    expect(f.db.database.prepare("SELECT * FROM research_site_scan_cursors WHERE name='outbox'").get()).toEqual(before);
  });

  it("rejects a tampered signed response before decoding it", async () => {
    const f = await createResearchBridgeFixture();
    const client = new SiteBridgeClient(new BridgeTransport({ connection: f.connection,
      nonces: new D1BridgeNonceStore(f.clientDb as unknown as D1Database), wallNow: f.wallNow,
      monoNow: f.monoNow, fetch: async (request) => {
        const response = await f.handler(request);
        const bytes = new Uint8Array(await response.arrayBuffer());
        bytes[bytes.length - 1] = bytes[bytes.length - 1] === 125 ? 124 : 125;
        return new Response(bytes, { status: response.status, headers: response.headers });
      } }));
    await expect(client.outbox()).rejects.toMatchObject({ kind: "authentication" });
  });

  it("runs SQL expiry before optional executor HTTP and retains unknown accounting on a signed 404", async () => {
    const f = await createResearchBridgeFixture();
    f.setSqlNow(f.execution.executionExpiresAt!);
    let observedAtExecutorEntry = false;
    f.setExecutorEntry(async () => {
      observedAtExecutorEntry = true;
      expect((await f.research.getRun(f.identity.ownerId, f.identity.runId))?.state).toBe("failed");
      expect(await f.recovery.read(f.identity)).toMatchObject({ reason: "expired-unknown",
        quotaDone: true, budgetDone: true, unsent: null });
      expect(await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))
        .toMatchObject({ status: "conservative-hold", settledMicros: 0 });
    });
    const reply = await f.siteClient.maintenance();
    expect(reply.visited).toBe(1);
    expect(observedAtExecutorEntry).toBe(true);
    expect((await f.recovery.read(f.identity))?.reason).toBe("expired-unknown");
    expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))?.status).toBe("conservative-hold");
    expect(f.executorFetches()).toBe(1);
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it("does not infer expiry or call the executor when only the app clock is ahead of authoritative SQL time", async () => {
    const f = await createResearchBridgeFixture();
    f.setWall(f.execution.executionExpiresAt! + 1);
    await expect(f.siteClient.maintenance()).resolves.toEqual({ visited: 0, failed: 0 });
    expect(await f.recovery.read(f.identity)).toBeNull();
    expect(f.executorFetches()).toBe(0);
  });

  it("visits a forced stale-clock candidate without expiring SQL-active work or calling the executor", async () => {
    const f = await createResearchBridgeFixture();
    f.setWall(f.execution.executionExpiresAt! + 1);
    const runBefore = await f.research.getRun(f.identity.ownerId, f.identity.runId);
    const executionBefore = await f.executions.read(f.identity.ownerId, f.identity.runId);
    const budgetBefore = await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!);
    await expect(f.createForcedMaintenanceClient().maintenance()).resolves.toEqual({ visited: 1, failed: 0 });
    expect(await f.research.getRun(f.identity.ownerId, f.identity.runId)).toEqual(runBefore);
    expect(await f.executions.read(f.identity.ownerId, f.identity.runId)).toEqual(executionBefore);
    expect(await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!)).toEqual(budgetBefore);
    expect(await f.recovery.read(f.identity)).toBeNull();
    expect(f.executorFetches()).toBe(0);
  });

  it("finishes an existing native import journal before remote recovery while the new-call gate is closed", async () => {
    const f = await createResearchBridgeFixture();
    f.setNewExecutionAllowed(false);
    await f.newImports().captureBody(f.identity, validReceipt(f.execution));
    expect(f.db.database.prepare("SELECT phase FROM research_site_imports").get()).toEqual({ phase: 0 });
    await expect(f.siteClient.maintenance()).resolves.toMatchObject({ visited: 1, failed: 0 });
    expect(f.db.database.prepare("SELECT phase FROM research_site_imports").get()).toEqual({ phase: 5 });
    expect(f.executorFetches()).toBe(0);
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it("returns at most one admitted unbegun job without hidden admission or begin", async () => {
    const f = await createResearchBridgeFixture();
    const queued = await f.createRemote("owner-b");
    const identity = { ownerId: queued.execution.ownerId, runId: queued.execution.runId,
      requestId: queued.execution.requestId, jobId: queued.execution.jobId, requestHash: queued.execution.requestHash };
    const admitted = (await f.coordinator.admitNew(identity,
      { newCallsAllowed: true, cohortEnabled: true, rateAllowed: true })).execution;
    const page = await f.siteClient.outbox();
    expect(page.jobs).toHaveLength(1);
    expect(page.jobs[0]?.jobId).toBe(admitted.jobId);
    expect((await f.executions.read(admitted.ownerId, admitted.runId))?.beganAt).toBeNull();
  });

  it("returns an empty outbox when SQL expiry wins after selector acknowledgement is delayed", async () => {
    const f = await createResearchBridgeFixture();
    const queued = await f.createRemote("owner-b");
    const identity = { ownerId: queued.execution.ownerId, runId: queued.execution.runId,
      requestId: queued.execution.requestId, jobId: queued.execution.jobId, requestHash: queued.execution.requestHash };
    const admitted = (await f.coordinator.admitNew(identity,
      { newCallsAllowed: true, cohortEnabled: true, rateAllowed: true })).execution;
    const barrier = createD1OperationBarrier(f.db as unknown as D1Database, () => false,
      (sql) => sql.includes("e.admission_state='admitted' AND e.began_at IS NULL"));
    const production = createProductionSiteBridgeHandler({ environment: f.environment,
      getD1: () => barrier.db, fetch: f.executorFetch, wallNow: f.wallNow, monoNow: f.monoNow });
    const client = new SiteBridgeClient(new BridgeTransport({ connection: f.connection,
      nonces: new D1BridgeNonceStore(f.clientDb as unknown as D1Database), wallNow: f.wallNow,
      monoNow: f.monoNow, fetch: production }));
    const cursorBefore = f.db.database.prepare("SELECT * FROM research_site_scan_cursors WHERE name='outbox'")
      .get() as { version: number };
    const pending = client.outbox();
    await barrier.entered;
    f.setSqlNow(admitted.job.queueExpiresAt);
    barrier.release();
    await expect(pending).resolves.toEqual({ jobs: [], next: null });
    const cursorAfter = f.db.database.prepare("SELECT * FROM research_site_scan_cursors WHERE name='outbox'")
      .get() as { version: number };
    expect(cursorAfter.version).toBe(cursorBefore.version + 1);
    expect((await f.executions.read(admitted.ownerId, admitted.runId))?.beganAt).toBeNull();
    expect(f.executorFetches()).toBe(0);
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it("returns an empty outbox when the production gate closes after selection", async () => {
    const f = await createResearchBridgeFixture();
    const queued = await f.createRemote("owner-b");
    const identity = { ownerId: queued.execution.ownerId, runId: queued.execution.runId,
      requestId: queued.execution.requestId, jobId: queued.execution.jobId, requestHash: queued.execution.requestHash };
    const admitted = (await f.coordinator.admitNew(identity,
      { newCallsAllowed: true, cohortEnabled: true, rateAllowed: true })).execution;
    const barrier = createD1OperationBarrier(f.db as unknown as D1Database, () => false,
      (sql) => sql.includes("e.admission_state='admitted' AND e.began_at IS NULL"));
    const production = createProductionSiteBridgeHandler({ environment: f.environment,
      getD1: () => barrier.db, fetch: f.executorFetch, wallNow: f.wallNow, monoNow: f.monoNow });
    const client = new SiteBridgeClient(new BridgeTransport({ connection: f.connection,
      nonces: new D1BridgeNonceStore(f.clientDb as unknown as D1Database), wallNow: f.wallNow,
      monoNow: f.monoNow, fetch: production }));
    const cursorBefore = f.db.database.prepare("SELECT * FROM research_site_scan_cursors WHERE name='outbox'")
      .get() as { version: number };
    const pending = client.outbox();
    await barrier.entered;
    f.setNewExecutionAllowed(false);
    barrier.release();
    await expect(pending).resolves.toEqual({ jobs: [], next: null });
    const cursorAfter = f.db.database.prepare("SELECT * FROM research_site_scan_cursors WHERE name='outbox'")
      .get() as { version: number };
    expect(cursorAfter.version).toBe(cursorBefore.version + 1);
    expect((await f.executions.read(admitted.ownerId, admitted.runId))?.beganAt).toBeNull();
    expect(f.executorFetches()).toBe(0);
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it("keeps a completed unknown sidecar eligible and releases only after a matched irreversible closed proof", async () => {
    const f = await createResearchBridgeFixture();
    f.setSqlNow(f.execution.executionExpiresAt!);
    await f.siteClient.maintenance();
    await f.siteClient.maintenance(); // bounded end-of-scan wrap
    const requestHash = await hashBridgeJob(f.execution.job);
    const unsent = { jobId: f.execution.jobId, requestHash, state: "closed" as const,
      closedAt: f.execution.executionExpiresAt!, grant: null };
    f.setExecutorStatus({ jobId: f.execution.jobId, requestHash, accepted: null,
      dispatchState: "closed", unsent, metadata: null, bodyState: null });
    await f.siteClient.maintenance();
    expect((await f.recovery.read(f.identity))?.reason).toBe("executor-unsent");
    expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))?.status).toBe("released");
    expect(f.executorFetches()).toBe(3);
  });

  it("leaves a claimed job without metadata conservatively held and eligible for later recheck", async () => {
    const f = await createResearchBridgeFixture();
    f.setSqlNow(f.execution.executionExpiresAt!);
    const requestHash = await hashBridgeJob(f.execution.job);
    f.setExecutorStatus({ jobId: f.execution.jobId, requestHash, accepted: null,
      dispatchState: "claimed", unsent: null, metadata: null, bodyState: null });
    await f.siteClient.maintenance();
    await f.siteClient.maintenance();
    await f.siteClient.maintenance();
    expect((await f.recovery.read(f.identity))?.reason).toBe("expired-unknown");
    expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))?.status).toBe("conservative-hold");
    expect(f.executorFetches()).toBe(3);
  });

  it.each(["released", "settled"] as const)(
    "contains an earlier coordinator failure for a contradictory %s reservation",
    async (status) => {
      const f = await createResearchBridgeFixture();
      f.setSqlNow(f.execution.executionExpiresAt!);
      await f.siteClient.maintenance();
      const before = f.executorFetches();
      f.db.database.prepare(`UPDATE ai_budget_reservations SET status=?1,settled_micros=?2
        WHERE id=?3`).run(status, status === "settled" ? 1 : 0, f.execution.budgetReservationId!);
      await expect(f.createForcedMaintenanceClient().maintenance()).resolves.toMatchObject({ visited: 1, failed: 1 });
      expect(f.executorFetches()).toBe(before);
      expect(f.syntheticProviderCalls()).toBe(0);
    },
  );

  it("skips optional remote work after a real concurrent recovery upgrade resets the budget marker", async () => {
    const f = await createResearchBridgeFixture();
    f.setSqlNow(f.execution.executionExpiresAt!);
    await f.siteClient.maintenance();
    const beforeFetches = f.executorFetches();
    let reconciled = false;
    let recoveryReadOrdinal = 0;
    const barrier = createD1OperationBarrier(f.db as unknown as D1Database,
      (sql, occurrence) => {
        if (!reconciled || !sql.includes("FROM research_site_recoveries WHERE job_id=?1 LIMIT 1")) return false;
        recoveryReadOrdinal = occurrence;
        return true;
      });
    const client = f.createObservedMaintenanceClient(barrier.db, () => { reconciled = true; });
    const pending = client.maintenance();
    await barrier.entered;
    expect(recoveryReadOrdinal).toBeGreaterThan(0);
    expect(await f.recovery.read(f.identity)).toMatchObject({ reason: "expired-unknown",
      quotaDone: true, budgetDone: true });
    const proof = { jobId: f.execution.jobId, requestHash: f.execution.requestHash,
      state: "closed" as const, closedAt: f.execution.executionExpiresAt!,
      grant: { protocol: f.execution.job.protocol, jobId: f.execution.jobId,
        requestHash: f.execution.requestHash, beganAt: f.execution.beganAt!,
        executionExpiresAt: f.execution.executionExpiresAt! } };
    await expect(f.recovery.terminate(f.identity, proof)).resolves.toMatchObject({
      reason: "executor-unsent", quotaDone: true, budgetDone: false,
    });
    barrier.release();
    await expect(pending).resolves.toEqual({ visited: 1, failed: 0 });
    expect(f.executorFetches()).toBe(beforeFetches);
    expect(await f.recovery.read(f.identity)).toMatchObject({ reason: "executor-unsent",
      quotaDone: true, budgetDone: false });
  });

  it.each(["released", "settled"] as const)(
    "skips optional remote work after a concurrent valid %s observation",
    async (status) => {
      const f = await createResearchBridgeFixture();
      f.setSqlNow(f.execution.executionExpiresAt!);
      await f.siteClient.maintenance();
      const beforeFetches = f.executorFetches();
      let reconciled = false;
      let budgetReadOrdinal = 0;
      const barrier = createD1OperationBarrier(f.db as unknown as D1Database,
        (sql, occurrence) => {
          if (!reconciled || !sql.includes("FROM ai_budget_reservations r JOIN research_runs u")) return false;
          budgetReadOrdinal = occurrence;
          return true;
        });
      const client = f.createObservedMaintenanceClient(barrier.db, () => { reconciled = true; });
      const pending = client.maintenance();
      await barrier.entered;
      expect(budgetReadOrdinal).toBeGreaterThan(0);
      expect(await f.recovery.read(f.identity)).toMatchObject({ reason: "expired-unknown",
        quotaDone: true, budgetDone: true });
      const settlement = status === "released" ? { kind: "not-charged" as const }
        : { kind: "actual" as const, actualMicros: 1 };
      await expect(f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, settlement))
        .resolves.toMatchObject({ status });
      barrier.expire();
      barrier.release();
      await expect(pending).resolves.toEqual({ visited: 1, failed: 0 });
      expect(f.executorFetches()).toBe(beforeFetches);
      expect(barrier.lateStarts()).toBe(0);
      expect(await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))
        .toMatchObject({ status });
    },
  );

  it("starts no follow-up after the final recovery observation crosses the deadline", async () => {
    const f = await createResearchBridgeFixture();
    f.setSqlNow(f.execution.executionExpiresAt!);
    await f.siteClient.maintenance();
    const beforeFetches = f.executorFetches();
    let reconciled = false;
    let recoveryReadOrdinal = 0;
    const barrier = createD1OperationBarrier(f.db as unknown as D1Database, () => false,
      (sql, occurrence) => {
        if (!reconciled || !sql.includes("FROM research_site_recoveries WHERE job_id=?1 LIMIT 1")) return false;
        recoveryReadOrdinal = occurrence;
        return true;
      });
    const client = f.createObservedMaintenanceClient(barrier.db, () => { reconciled = true; });
    const pending = client.maintenance().catch((error: unknown) => error);
    await barrier.entered;
    expect(recoveryReadOrdinal).toBeGreaterThan(0);
    expect(await f.recovery.read(f.identity)).toMatchObject({ reason: "expired-unknown",
      quotaDone: true, budgetDone: true });
    expect(await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))
      .toMatchObject({ status: "conservative-hold", settledMicros: 0 });
    await expect(f.siteClient.outbox()).resolves.toEqual({ jobs: [], next: null });
    f.advanceMono(4_501);
    barrier.expire();
    barrier.release();
    await pending;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(f.executorFetches()).toBe(beforeFetches);
    expect(barrier.lateStarts()).toBe(0);
  });

  it("fences follow-up after a terminalization batch acknowledgement crosses the deadline", async () => {
    const f = await createResearchBridgeFixture();
    f.setSqlNow(f.execution.executionExpiresAt!);
    const before = f.executorFetches();
    const barrier = createD1OperationBarrier(f.db as unknown as D1Database, () => false,
      (sql) => sql.startsWith("BATCH:") && sql.includes("UPDATE research_runs AS r SET"));
    const production = createProductionSiteBridgeHandler({ environment: TEST_PRODUCTION_ENVIRONMENT,
      getD1: () => barrier.db, fetch: f.executorFetch, wallNow: f.wallNow, monoNow: f.monoNow });
    const client = new SiteBridgeClient(new BridgeTransport({ connection: f.connection,
      nonces: new D1BridgeNonceStore(f.clientDb as unknown as D1Database), wallNow: f.wallNow,
      monoNow: f.monoNow, fetch: production }));
    const pending = client.maintenance().catch((error: unknown) => error);
    await barrier.entered;
    f.advanceMono(4_501);
    barrier.expire();
    barrier.release();
    await pending;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(f.executorFetches()).toBe(before);
    expect(barrier.lateStarts()).toBe(0);
    expect(f.db.database.prepare(`SELECT quota_done,budget_done FROM research_site_recoveries
      WHERE job_id=?1`).get(f.execution.jobId)).toEqual({ quota_done: 0, budget_done: 0 });
  });

  it.each(["metadata", "proof"] as const)("rejects %s with a non-original frozen grant before local effects", async (kind) => {
    const f = await createResearchBridgeFixture();
    f.setSqlNow(f.execution.executionExpiresAt!);
    await f.siteClient.maintenance();
    const requestHash = await hashBridgeJob(f.execution.job);
    const wrongGrant = { protocol: f.execution.job.protocol, jobId: f.execution.jobId, requestHash,
      beganAt: f.execution.beganAt! + 1, executionExpiresAt: f.execution.executionExpiresAt! + 1 };
    if (kind === "metadata") {
      const metadata = await f.metadata();
      f.setExecutorStatus({ jobId: f.execution.jobId, requestHash, accepted: null,
        dispatchState: "claimed", unsent: null, metadata: { ...metadata, grant: wrongGrant }, bodyState: "removed" });
    } else {
      const unsent = { jobId: f.execution.jobId, requestHash, state: "closed" as const,
        closedAt: f.execution.executionExpiresAt!, grant: wrongGrant };
      f.setExecutorStatus({ jobId: f.execution.jobId, requestHash, accepted: null,
        dispatchState: "closed", unsent, metadata: null, bodyState: null });
    }
    const before = f.businessSnapshot();
    await expect(f.createForcedMaintenanceClient().maintenance()).resolves.toMatchObject({ visited: 1, failed: 1 });
    expect(f.businessSnapshot()).toEqual(before);
    expect((await f.recovery.read(f.identity))?.reason).toBe("expired-unknown");
  });

  it("prevents a real coordinator continuation from starting SQL after the maintenance deadline", async () => {
    const f = await createResearchBridgeFixture();
    f.setSqlNow(f.execution.executionExpiresAt!);
    let importReads = 0;
    const barrier = createD1OperationBarrier(f.db as unknown as D1Database, (sql) => {
      if (!sql.includes("FROM research_site_imports")) return false;
      importReads += 1;
      return importReads === 2;
    });
    const production = createProductionSiteBridgeHandler({ environment: TEST_PRODUCTION_ENVIRONMENT,
      getD1: () => barrier.db, fetch: async () => { throw new Error("executor HTTP must not start"); },
      wallNow: f.wallNow, monoNow: f.monoNow });
    const client = new SiteBridgeClient(new BridgeTransport({ connection: f.connection,
      nonces: new D1BridgeNonceStore(f.clientDb as unknown as D1Database), wallNow: f.wallNow,
      monoNow: f.monoNow, fetch: production }));
    const pending = client.maintenance().catch((error: unknown) => error);
    await barrier.entered;
    f.advanceMono(4_501);
    barrier.expire();
    barrier.release();
    await pending;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(barrier.lateStarts()).toBe(0);
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it("keeps forced discovery on the request guard after a delayed second journal read", async () => {
    const f = await createResearchBridgeFixture();
    f.setSqlNow(f.execution.executionExpiresAt!);
    const nativePrepare = f.db.prepare.bind(f.db);
    let journalReads = 0;
    let fenced = false;
    let lateStarts = 0;
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const resumed = new Promise<void>((resolve) => { release = resolve; });
    const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => {
      const run = async (method: "first" | "run" | "all" | "raw", args: unknown[]) => {
        if (fenced) lateStarts += 1;
        const output = await (statement[method] as (...values: unknown[]) => Promise<unknown>)
          .apply(statement, args);
        if (sql.includes("FROM research_site_imports") && ++journalReads === 2) { enter(); await resumed; }
        return output;
      };
      return { bind: (...values: unknown[]) => wrap(statement.bind(...values), sql),
        first: (...args: [string?]) => run("first", args), run: () => run("run", []),
        all: () => run("all", []), raw: (...args: unknown[]) => run("raw", args) } as unknown as D1PreparedStatement;
    };
    f.db.prepare = ((sql: string) => {
      return wrap(nativePrepare(sql), sql);
    }) as typeof f.db.prepare;
    const pending = f.createForcedMaintenanceClient().maintenance().catch((error: unknown) => error);
    await entered;
    f.advanceMono(4_501);
    fenced = true;
    release();
    await pending;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(lateStarts).toBe(0);
    expect(f.executorFetches()).toBe(0);
  });

  it("isolates concurrent request guards when cancellation fences delayed native SQL", async () => {
    const f = await createResearchBridgeFixture();
    f.setSqlNow(f.execution.executionExpiresAt!);
    let importReads = 0;
    const barrier = createD1OperationBarrier(f.db as unknown as D1Database, (sql) => {
      if (!sql.includes("FROM research_site_imports")) return false;
      importReads += 1;
      return importReads === 2;
    });
    const production = createProductionSiteBridgeHandler({ environment: TEST_PRODUCTION_ENVIRONMENT,
      getD1: () => barrier.db, fetch: async () => { throw new Error("executor HTTP must not start"); },
      wallNow: f.wallNow, monoNow: f.monoNow });
    const client = new SiteBridgeClient(new BridgeTransport({ connection: f.connection,
      nonces: new D1BridgeNonceStore(f.clientDb as unknown as D1Database), wallNow: f.wallNow,
      monoNow: f.monoNow, fetch: production }));
    const controller = new AbortController();
    const pending = client.maintenance({ signal: controller.signal }).catch((error: unknown) => error);
    await barrier.entered;
    await expect(client.outbox()).resolves.toMatchObject({ jobs: expect.any(Array), next: null });
    barrier.expire();
    controller.abort();
    barrier.release();
    await pending;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(barrier.lateStarts()).toBe(0);
    barrier.renew();
    await expect(client.maintenance()).resolves.toMatchObject({ visited: expect.any(Number), failed: expect.any(Number) });
  });

  it("propagates request cancellation into an in-flight executor transport", async () => {
    const f = await createResearchBridgeFixture();
    f.setSqlNow(f.execution.executionExpiresAt!);
    let enter!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    let transportAborted = false;
    f.setExecutorEntry(async (request) => {
      enter();
      await new Promise<void>((resolve) => {
        if (request.signal.aborted) resolve();
        else request.signal.addEventListener("abort", () => resolve(), { once: true });
      });
      transportAborted = request.signal.aborted;
      throw new Error("synthetic cancelled executor request");
    });
    const controller = new AbortController();
    const pending = f.siteClient.maintenance({ signal: controller.signal }).catch((error: unknown) => error);
    await entered;
    controller.abort();
    await pending;
    expect(transportAborted).toBe(true);
    expect(await f.recovery.read(f.identity)).toMatchObject({ reason: "expired-unknown",
      quotaDone: true, budgetDone: true, unsent: null });
    expect(await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))
      .toMatchObject({ status: "conservative-hold", settledMicros: 0 });
  });

  it("guards bound statements, unwraps only owned batches, and preserves native batch atomicity", async () => {
    const f = await createResearchBridgeFixture();
    let firstOpen = true;
    const first = createGuardedD1(f.db as unknown as D1Database, () => {
      if (!firstOpen) throw new Error("first request fenced");
    });
    const second = createGuardedD1(f.db as unknown as D1Database, () => undefined);
    const bound = first.prepare("SELECT count(*) AS n FROM research_runs WHERE user_id=?1").bind(f.identity.ownerId);
    await expect(bound.first()).resolves.toEqual({ n: 1 });
    firstOpen = false;
    await expect(bound.first()).rejects.toThrow("first request fenced");
    firstOpen = true;
    const raw = (f.db as unknown as D1Database).prepare("SELECT 1 AS ok");
    const crossRequest = second.prepare("SELECT 1 AS ok");
    await expect(Promise.resolve().then(() => first.batch([raw]))).rejects.toThrow("foreign D1 statement");
    await expect(Promise.resolve().then(() => first.batch([crossRequest]))).rejects.toThrow("foreign D1 statement");

    const scope = "executor-to-site:atomic";
    const nonce = "ab".repeat(16);
    const insert = `INSERT INTO research_bridge_nonces(scope,nonce,expires_at,created_at)
      VALUES (?1,?2,?3,?4)`;
    const one = first.prepare(insert).bind(scope, nonce, 2, 1);
    const duplicate = first.prepare(insert).bind(scope, nonce, 2, 1);
    await expect(first.batch([one, duplicate])).rejects.toBeDefined();
    expect(f.db.database.prepare("SELECT count(*) AS n FROM research_bridge_nonces WHERE scope=?1 AND nonce=?2")
      .get(scope, nonce)).toEqual({ n: 0 });
  });

  it("does not create request-scoped operations for an already-aborted signed request", async () => {
    const f = await createResearchBridgeFixture();
    const before = f.businessSnapshot();
    const requestHash = await hashBridgeJob(f.execution.job);
    const body = new TextEncoder().encode(JSON.stringify({ jobId: f.execution.jobId, requestHash }));
    const path = "/api/internal/research-bridge/begin";
    const headers = await signBridgeMessage({ context: { direction: "executor-to-site", kind: "request", method: "POST",
      path, audience: f.connection.siteOrigin, jobId: f.execution.jobId, status: null }, body,
      keyId: f.connection.executorToSite.keyId, keyBytes: f.connection.executorToSite.copyKeyBytes(), now: f.wallNow });
    headers.set("x-arc-bridge-job-id", f.execution.jobId);
    const controller = new AbortController();
    controller.abort();
    const response = await f.handler(new Request(`${f.connection.siteOrigin}${path}`,
      { method: "POST", headers, body, signal: controller.signal }));
    expect(response.status).toBe(503);
    expect(f.businessSnapshot()).toEqual(before);
    expect(f.db.database.prepare("SELECT count(*) n FROM research_bridge_nonces").get()).toEqual({ n: 0 });
  });

  it("permits a committed native batch but fences later effects, then resumes exactly once on a fresh request", async () => {
    const f = await createResearchBridgeFixture();
    const barrier = createD1OperationBarrier(f.db as unknown as D1Database, () => false,
      (sql) => sql.startsWith("BATCH:") && sql.includes("UPDATE research_runs AS r SET"));
    const production = createProductionSiteBridgeHandler({ environment: TEST_PRODUCTION_ENVIRONMENT,
      getD1: () => barrier.db, fetch: f.executorFetch, wallNow: f.wallNow, monoNow: f.monoNow });
    const client = new SiteBridgeClient(new BridgeTransport({ connection: f.connection,
      nonces: new D1BridgeNonceStore(f.clientDb as unknown as D1Database), wallNow: f.wallNow,
      monoNow: f.monoNow, fetch: production }));
    const notice = await f.notice();
    const pending = client.complete(f.execution.job, notice).catch((error: unknown) => error);
    await barrier.entered;
    f.advanceMono(5_001);
    barrier.expire();
    barrier.release();
    await pending;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(barrier.lateStarts()).toBe(0);
    expect(f.db.database.prepare("SELECT phase FROM research_site_imports").get()).toEqual({ phase: 2 });
    expect(f.db.database.prepare("SELECT count(*) n FROM ai_runs").get()).toEqual({ n: 1 });
    expect(f.db.database.prepare("SELECT count(*) n FROM quota_ledger WHERE entry_kind<>'reserved'").get()).toEqual({ n: 0 });
    expect((await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))?.status).toBe("reserved");
    barrier.renew();
    await expect(client.complete(f.execution.job, notice)).resolves.toMatchObject({ receiptHash: notice.receiptHash });
    expect(f.db.database.prepare("SELECT phase FROM research_site_imports").get()).toEqual({ phase: 5 });
    expect(f.db.database.prepare("SELECT count(*) n FROM ai_runs").get()).toEqual({ n: 1 });
    expect(f.db.database.prepare("SELECT count(*) n FROM quota_ledger WHERE entry_kind<>'reserved'").get()).toEqual({ n: 1 });
    expect(f.db.database.prepare("SELECT count(*) n FROM research_packages").get()).toEqual({ n: 1 });
    expect(f.syntheticProviderCalls()).toBe(0);
  });
});
