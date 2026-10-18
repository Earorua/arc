// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSiteAdmissionFixture } from "../helpers/site-admission-fixture";
import type { SiteExecutionIdentity, SiteExecutionRecord } from "../../app/server/research/site-execution-repository";
import { SqliteD1 } from "../helpers/sqlite-d1";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { D1EntitlementRepository } from "../../app/server/entitlements/d1-entitlement-repository";
import { D1ResearchBudgetRepository } from "../../app/server/research/d1-budget-repository";
import { SiteAdmissionCoordinator } from "../../app/server/research/site-admission";

const OPEN_GATE = Object.freeze({ newCallsAllowed: true, cohortEnabled: true, rateAllowed: true });
const CLOSED_GATE = Object.freeze({ newCallsAllowed: false, cohortEnabled: false, rateAllowed: false });

function identity(execution: SiteExecutionRecord): SiteExecutionIdentity {
  return {
    ownerId: execution.ownerId,
    runId: execution.runId,
    requestId: execution.requestId,
    jobId: execution.jobId,
    requestHash: execution.requestHash,
  };
}

describe("Site admission coordinator", () => {
  const databases: Array<ReturnType<typeof createSiteAdmissionFixture>["db"]> = [];
  const directories: string[] = [];
  const fixture = () => {
    const value = createSiteAdmissionFixture();
    databases.push(value.db);
    return value;
  };

  afterEach(() => {
    vi.restoreAllMocks();
    while (databases.length) databases.pop()!.close();
    while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true });
  });

  it("admits a fresh remote execution only after both durable reservations", async () => {
    const f = fixture();
    const created = await f.createRemote();
    const order: string[] = [];
    vi.spyOn(f.quota, "admitRemoteResearch").mockImplementation(async (command) => {
      order.push("quota");
      return await Reflect.apply(Object.getPrototypeOf(f.quota).admitRemoteResearch, f.quota, [command]);
    });
    vi.spyOn(f.budget, "reserveRemote").mockImplementation(async (command) => {
      order.push("budget");
      return await Reflect.apply(Object.getPrototypeOf(f.budget).reserveRemote, f.budget, [command]);
    });
    vi.spyOn(f.executions, "markAdmitted").mockImplementation(async (command) => {
      order.push("admitted");
      return await Reflect.apply(Object.getPrototypeOf(f.executions).markAdmitted, f.executions, [command]);
    });

    const result = await f.coordinator.admitNew(identity(created.execution), OPEN_GATE);

    expect(order).toEqual(["quota", "budget", "admitted"]);
    expect(f.quota.admitRemoteResearch).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: created.execution.ownerId,
      runId: created.execution.runId,
      requestId: created.execution.requestId,
      jobId: created.execution.jobId,
      requestHash: created.execution.requestHash,
      userId: created.execution.ownerId,
      idempotencyKey: created.execution.quotaKey,
      dailyQuota: created.execution.policy.userDailyQuota,
      period: {
        startMs: Date.parse("2026-09-15T00:00:00.000Z"),
        endMs: Date.parse("2026-09-16T00:00:00.000Z"),
      },
    }));
    expect(f.budget.reserveRemote).toHaveBeenCalledWith(expect.objectContaining({
      expiresAt: created.execution.reservationExpiresAt,
      dailyBudgetMicros: created.execution.policy.dailyBudgetMicros,
      monthlyBudgetMicros: created.execution.policy.monthlyBudgetMicros,
      maximumMicros: created.execution.policy.maximumMicros,
    }));
    expect(result.run.state).toBe("queued");
    expect(result.execution).toMatchObject({ admissionState: "admitted", beganAt: null });
    expect(await f.quota.readResearchReservation(result.execution.ownerId, result.execution.quotaKey))
      .toMatchObject({ reservationId: result.execution.quotaReservationId, finalStatus: null });
    expect(await f.budget.findReservation(result.execution.ownerId, result.execution.runId, result.execution.requestId))
      .toMatchObject({ id: result.execution.budgetReservationId, status: "reserved" });
  });

  it("uses the original pre-midnight quota reservation for admission and observation after midnight", async () => {
    const f = fixture();
    const beforeMidnight = Date.parse("2026-09-15T23:59:30.000Z");
    const afterMidnight = Date.parse("2026-09-16T00:00:05.000Z");
    f.setAppNow(beforeMidnight); f.setSqlNow(beforeMidnight);
    const created = await f.createRemote();
    const reservations = await f.reserveAdmission(created.execution);
    const quotaBefore = f.db.database.prepare(`SELECT id,user_id,purpose,reservation_id,idempotency_key,
      entry_kind,units,created_at FROM quota_ledger ORDER BY id`).all();
    const deadlinesBefore = f.db.database.prepare(`SELECT r.active_expires_at,e.job_json,e.reservation_expires_at
      FROM research_runs r JOIN research_site_executions e ON e.run_id=r.id WHERE r.id=?1`).get(created.run.id);
    f.setAppNow(afterMidnight); f.setSqlNow(afterMidnight);

    const admitted = await f.executions.markAdmitted(f.admissionCommand(created.execution, reservations));
    const quotaReserve = vi.spyOn(f.quota, "admitRemoteResearch");
    const budgetReserve = vi.spyOn(f.budget, "reserveRemote");
    const observed = await f.coordinator.reconcileBeforeBegin(identity(admitted));

    expect(observed.execution).toMatchObject({ admissionState: "admitted", ...reservations });
    expect(quotaReserve).not.toHaveBeenCalled();
    expect(budgetReserve).not.toHaveBeenCalled();
    expect(f.db.database.prepare(`SELECT id,user_id,purpose,reservation_id,idempotency_key,
      entry_kind,units,created_at FROM quota_ledger ORDER BY id`).all()).toEqual(quotaBefore);
    expect(f.db.database.prepare(`SELECT r.active_expires_at,e.job_json,e.reservation_expires_at
      FROM research_runs r JOIN research_site_executions e ON e.run_id=r.id WHERE r.id=?1`).get(created.run.id))
      .toEqual(deadlinesBefore);
    expect(afterMidnight).toBeLessThan(created.execution.job.queueExpiresAt);
  });

  it("uses a fresh global cache before disabled new-call gates without accounting writes", async () => {
    const f = fixture();
    const cached = await f.createFreshCachePackage("owner-a");
    const created = await f.createRemote("owner-b");
    const before = f.readCounts();
    const quota = vi.spyOn(f.quota, "admitRemoteResearch");
    const budget = vi.spyOn(f.budget, "reserveRemote");

    const result = await f.coordinator.admitNew(identity(created.execution), CLOSED_GATE);

    expect(result.run).toMatchObject({ state: "ready", packageId: cached.package.id });
    expect(result.execution).toMatchObject({ admissionState: "closed", closeReason: "cached" });
    expect(f.readCounts()).toEqual(before);
    expect(quota).not.toHaveBeenCalled();
    expect(budget).not.toHaveBeenCalled();
  });

  it("closes a cache miss denied by any snapshotted gate without reservations", async () => {
    const f = fixture();
    const created = await f.createRemote();
    const quota = vi.spyOn(f.quota, "admitRemoteResearch");
    const budget = vi.spyOn(f.budget, "reserveRemote");

    const result = await f.coordinator.admitNew(identity(created.execution), {
      ...OPEN_GATE,
      rateAllowed: false,
    });

    expect(result.run).toMatchObject({ state: "failed", retryable: true, errorCode: "admission-denied" });
    expect(result.execution).toMatchObject({ admissionState: "closed", closeReason: "denied" });
    expect(quota).not.toHaveBeenCalled();
    expect(budget).not.toHaveBeenCalled();
    expect(f.readCounts()).toMatchObject({ quotaLedger: 0, aiBudgetReservations: 0 });
  });

  it.each(["sql", "app"] as const)("honors the %s clock deadline without creating a partial admission", async (clock) => {
    const f = fixture();
    const created = await f.createRemote();
    if (clock === "sql") f.setSqlNow(created.execution.job.queueExpiresAt);
    else f.setAppNow(created.execution.job.queueExpiresAt);
    const budgetReserve = vi.spyOn(f.budget, "reserveRemote");

    const result = await f.coordinator.admitNew(identity(created.execution), OPEN_GATE);

    expect(result.execution).toMatchObject({ admissionState: "closed", closeReason: clock === "app" ? "expired" : "denied" });
    expect(await f.quota.readResearchReservation(created.execution.ownerId, created.execution.quotaKey)).toBeNull();
    expect(await f.budget.findReservation(created.execution.ownerId, created.execution.runId, created.execution.requestId)).toBeNull();
    expect(budgetReserve).not.toHaveBeenCalled();
  });

  it.each(["quota", "budget"] as const)("reconciles an existing partial %s reservation without filling the missing side", async (kind) => {
    const f = fixture();
    const created = await f.createRemote();
    if (kind === "quota") await f.quota.admitRemoteResearch(f.quotaCommand(created.execution));
    else await f.budget.reserveRemote(f.budgetCommand(created.execution));
    const quotaReserve = vi.spyOn(f.quota, "admitRemoteResearch");
    const budgetReserve = vi.spyOn(f.budget, "reserveRemote");

    const result = await f.coordinator.admitNew(identity(created.execution), OPEN_GATE);

    expect(result.execution).toMatchObject({ admissionState: "closed", closeReason: "interrupted" });
    expect(quotaReserve).not.toHaveBeenCalled();
    expect(budgetReserve).not.toHaveBeenCalled();
    const quota = await f.quota.readResearchReservation(created.execution.ownerId, created.execution.quotaKey);
    const budget = await f.budget.findReservation(created.execution.ownerId, created.execution.runId, created.execution.requestId);
    expect(quota).toEqual(kind === "quota" ? expect.objectContaining({ finalStatus: "failed" }) : null);
    expect(budget).toEqual(kind === "budget" ? expect.objectContaining({ status: "released" }) : null);
  });

  it.each(["quota", "budget", "both"] as const)(
    "discovers and releases %s reservation commits immediately before the actual close batch",
    async (kind) => {
      const f = fixture();
      const created = await f.createRemote();
      let enter!: () => void; let resume!: () => void;
      const entered = new Promise<void>((resolve) => { enter = resolve; });
      const resumed = new Promise<void>((resolve) => { resume = resolve; });
      const batch = f.db.batch.bind(f.db); let paused = false;
      f.db.batch = async (statements) => {
        const sql = statements.map((statement) => (statement as unknown as { sql?: string }).sql ?? "");
        if (!paused && sql.some((value) => value.includes("SET admission_state='closed'"))) {
          paused = true;
          enter();
          await resumed;
        }
        return batch(statements);
      };

      const recovery = f.coordinator.reconcileBeforeBegin(identity(created.execution));
      await entered;
      let quotaReservationId: string | null = null;
      let budgetReservationId: string | null = null;
      if (kind === "quota" || kind === "both") {
        const quota = await f.quota.admitRemoteResearch(f.quotaCommand(created.execution));
        if (!quota.allowed) throw new Error("expected quota reservation before closure");
        quotaReservationId = quota.reservationId;
      }
      if (kind === "budget" || kind === "both") {
        const budget = await f.budget.reserveRemote(f.budgetCommand(created.execution));
        if (!budget.allowed) throw new Error("expected budget reservation before closure");
        budgetReservationId = budget.reservation.id;
      }
      const quotaReserve = vi.spyOn(f.quota, "admitRemoteResearch");
      const budgetReserve = vi.spyOn(f.budget, "reserveRemote");
      resume();
      const result = await recovery;

      expect(result.execution).toMatchObject({ admissionState: "closed", closeReason: "interrupted" });
      expect(quotaReserve).not.toHaveBeenCalled();
      expect(budgetReserve).not.toHaveBeenCalled();
      expect(await f.quota.readResearchReservation(created.execution.ownerId, created.execution.quotaKey))
        .toEqual(quotaReservationId === null ? null : expect.objectContaining({ reservationId: quotaReservationId, finalStatus: "failed" }));
      expect(await f.budget.findReservation(created.execution.ownerId, created.execution.runId, created.execution.requestId))
        .toEqual(budgetReservationId === null ? null : expect.objectContaining({ id: budgetReservationId, status: "released" }));
    },
  );

  it.each(["quota", "budget", "admitted"] as const)("recovers a lost %s acknowledgement without a second reservation", async (point) => {
    const f = fixture();
    const created = await f.createRemote();
    const originalQuota = f.quota.admitRemoteResearch.bind(f.quota);
    const originalBudget = f.budget.reserveRemote.bind(f.budget);
    const originalAdmit = f.executions.markAdmitted.bind(f.executions);
    const quotaSpy = vi.spyOn(f.quota, "admitRemoteResearch");
    const budgetSpy = vi.spyOn(f.budget, "reserveRemote");
    if (point === "quota") quotaSpy.mockImplementationOnce(async (command) => { await originalQuota(command); throw new Error("lost quota acknowledgement"); });
    if (point === "budget") budgetSpy.mockImplementationOnce(async (command) => { await originalBudget(command); throw new Error("lost budget acknowledgement"); });
    if (point === "admitted") vi.spyOn(f.executions, "markAdmitted").mockImplementationOnce(async (command) => { await originalAdmit(command); throw new Error("lost admitted acknowledgement"); });

    const result = await f.coordinator.admitNew(identity(created.execution), OPEN_GATE);

    expect(quotaSpy).toHaveBeenCalledTimes(1);
    expect(budgetSpy).toHaveBeenCalledTimes(point === "quota" ? 0 : 1);
    if (point === "admitted") {
      expect(result.execution).toMatchObject({ admissionState: "admitted" });
      expect(await f.quota.readResearchReservation(created.execution.ownerId, created.execution.quotaKey)).toMatchObject({ finalStatus: null });
      expect(await f.budget.findReservation(created.execution.ownerId, created.execution.runId, created.execution.requestId)).toMatchObject({ status: "reserved" });
    } else {
      expect(result.execution).toMatchObject({ admissionState: "closed", closeReason: "interrupted" });
      expect(await f.quota.readResearchReservation(created.execution.ownerId, created.execution.quotaKey)).toMatchObject({ finalStatus: "failed" });
      const budget = await f.budget.findReservation(created.execution.ownerId, created.execution.runId, created.execution.requestId);
      expect(budget).toEqual(point === "budget" ? expect.objectContaining({ status: "released" }) : null);
    }
  });

  it("returns an admitted unexpired replay only after independently verifying both reservations", async () => {
    const f = fixture();
    const created = await f.createRemote();
    const first = await f.coordinator.admitNew(identity(created.execution), OPEN_GATE);
    const quotaReserve = vi.spyOn(f.quota, "admitRemoteResearch");
    const budgetReserve = vi.spyOn(f.budget, "reserveRemote");

    await expect(f.coordinator.reconcileBeforeBegin(identity(first.execution))).resolves.toEqual(first);
    expect(quotaReserve).not.toHaveBeenCalled();
    expect(budgetReserve).not.toHaveBeenCalled();
  });

  it("rejects an admitted execution whose paired public run is no longer queued", async () => {
    const f = fixture();
    const created = await f.createRemote();
    const admitted = await f.coordinator.admitNew(identity(created.execution), OPEN_GATE);
    f.db.database.prepare(`UPDATE research_runs SET state='failed',state_version=state_version+1,retryable=1,
      active_slot=NULL,active_expires_at=NULL,error_code='service-failed',public_failure_category='service-unavailable',updated_at=?1
      WHERE id=?2 AND execution_mode='cloudflare-workflow-v1'`).run(created.run.createdAt, created.run.id);

    await expect(f.coordinator.reconcileBeforeBegin(identity(admitted.execution)))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects a terminal pair created after markAdmitted succeeds but before final readback", async () => {
    const f = fixture();
    const created = await f.createRemote();
    const markAdmitted = f.executions.markAdmitted.bind(f.executions);
    vi.spyOn(f.executions, "markAdmitted").mockImplementationOnce(async (command) => {
      const admitted = await markAdmitted(command);
      f.db.database.prepare(`UPDATE research_runs SET state='failed',state_version=state_version+1,retryable=1,
        active_slot=NULL,active_expires_at=NULL,error_code='service-failed',public_failure_category='service-unavailable',updated_at=?1
        WHERE id=?2 AND execution_mode='cloudflare-workflow-v1'`).run(created.run.createdAt, created.run.id);
      return admitted;
    });

    await expect(f.coordinator.admitNew(identity(created.execution), OPEN_GATE))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(await f.executions.read(created.execution.ownerId, created.execution.runId))
      .toMatchObject({ admissionState: "admitted" });
  });

  it.each(["quota", "budget"] as const)("closes and reconciles when the durable %s reread fails after both reserve writes", async (kind) => {
    const f = fixture();
    const created = await f.createRemote();
    if (kind === "quota") {
      const original = f.quota.readResearchReservation.bind(f.quota);
      let calls = 0;
      vi.spyOn(f.quota, "readResearchReservation").mockImplementation(async (...args) => {
        calls += 1;
        if (calls === 2) throw new Error("lost durable quota read");
        return original(...args);
      });
    } else {
      const original = f.budget.findReservation.bind(f.budget);
      let calls = 0;
      vi.spyOn(f.budget, "findReservation").mockImplementation(async (...args) => {
        calls += 1;
        if (calls === 2) throw new Error("lost durable budget read");
        return original(...args);
      });
    }

    const result = await f.coordinator.admitNew(identity(created.execution), OPEN_GATE);
    expect(result.execution).toMatchObject({ admissionState: "closed", closeReason: "interrupted" });
    expect(await f.quota.readResearchReservation(created.execution.ownerId, created.execution.quotaKey)).toMatchObject({ finalStatus: "failed" });
    expect(await f.budget.findReservation(created.execution.ownerId, created.execution.runId, created.execution.requestId)).toMatchObject({ status: "released" });
  });

  it("closes an admitted execution after its queue deadline and releases both durable reservations", async () => {
    const f = fixture();
    const created = await f.createRemote();
    const admitted = await f.coordinator.admitNew(identity(created.execution), OPEN_GATE);
    f.setAppNow(admitted.execution.job.queueExpiresAt);
    f.setSqlNow(admitted.execution.job.queueExpiresAt);

    const result = await f.coordinator.reconcileBeforeBegin(identity(admitted.execution));

    expect(result.execution).toMatchObject({ admissionState: "closed", closeReason: "expired" });
    expect(await f.quota.readResearchReservation(result.execution.ownerId, result.execution.quotaKey)).toMatchObject({ finalStatus: "failed" });
    expect(await f.budget.findReservation(result.execution.ownerId, result.execution.runId, result.execution.requestId)).toMatchObject({ status: "released" });
  });

  it("rejects admission and reconciliation for a coherent future begun execution without accounting side effects", async () => {
    const f = fixture();
    const created = await f.createRemote();
    const reservations = await f.reserveAdmission(created.execution);
    const admitted = await f.executions.markAdmitted(f.admissionCommand(created.execution, reservations));
    const beganAt = admitted.createdAt + 1_000;
    f.db.database.prepare("UPDATE research_site_executions SET began_at=?1,execution_expires_at=?1+1260000,version=version+1,updated_at=?1 WHERE run_id=?2")
      .run(beganAt, admitted.runId);
    f.db.database.prepare("UPDATE research_runs SET state='researching',state_version=state_version+1,active_expires_at=?1,updated_at=?2 WHERE id=?3")
      .run(beganAt + 1_260_000, beganAt, admitted.runId);
    const quotaReserve = vi.spyOn(f.quota, "admitRemoteResearch");
    const budgetReserve = vi.spyOn(f.budget, "reserveRemote");
    const quotaFinalize = vi.spyOn(f.quota, "finalize");
    const budgetRelease = vi.spyOn(f.budget, "releaseRemoteBeforeBegin");
    const before = {
      run: f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1").get(admitted.runId),
      execution: f.db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?1").get(admitted.runId),
      quota: f.db.database.prepare("SELECT * FROM quota_ledger ORDER BY id").all(),
      budget: f.db.database.prepare("SELECT * FROM ai_budget_reservations ORDER BY id").all(),
      buckets: f.db.database.prepare("SELECT * FROM ai_budget_buckets ORDER BY id").all(),
    };

    await expect(f.coordinator.admitNew(identity(admitted), OPEN_GATE)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(f.coordinator.reconcileBeforeBegin(identity(admitted))).rejects.toMatchObject({ code: "CONFLICT" });

    expect(quotaReserve).not.toHaveBeenCalled(); expect(budgetReserve).not.toHaveBeenCalled();
    expect(quotaFinalize).not.toHaveBeenCalled(); expect(budgetRelease).not.toHaveBeenCalled();
    expect({
      run: f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1").get(admitted.runId),
      execution: f.db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?1").get(admitted.runId),
      quota: f.db.database.prepare("SELECT * FROM quota_ledger ORDER BY id").all(),
      budget: f.db.database.prepare("SELECT * FROM ai_budget_reservations ORDER BY id").all(),
      buckets: f.db.database.prepare("SELECT * FROM ai_budget_buckets ORDER BY id").all(),
    }).toEqual(before);
  });

  it("continues the independent budget release when quota finalization fails and resumes later", async () => {
    const f = fixture();
    const created = await f.createRemote();
    await f.reserveAdmission(created.execution);
    const originalFinalize = f.quota.finalize.bind(f.quota);
    vi.spyOn(f.quota, "finalize").mockRejectedValueOnce(new Error("quota unavailable"));

    await expect(f.coordinator.reconcileBeforeBegin(identity(created.execution)))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(await f.executions.read(created.execution.ownerId, created.execution.runId)).toMatchObject({ admissionState: "closed" });
    expect(await f.budget.findReservation(created.execution.ownerId, created.execution.runId, created.execution.requestId)).toMatchObject({ status: "released" });

    vi.mocked(f.quota.finalize).mockImplementation(originalFinalize);
    const recovered = await f.coordinator.reconcileBeforeBegin(identity(created.execution));
    expect(recovered.execution.admissionState).toBe("closed");
    expect(await f.quota.readResearchReservation(created.execution.ownerId, created.execution.quotaKey)).toMatchObject({ finalStatus: "failed" });
  });

  it("releases the known-unsent budget when quota finalization and its acknowledgement reread both fail", async () => {
    const f = fixture();
    const created = await f.createRemote();
    await f.reserveAdmission(created.execution);
    const readReservation = f.quota.readResearchReservation.bind(f.quota);
    let reads = 0;
    vi.spyOn(f.quota, "finalize").mockRejectedValueOnce(new Error("quota finalization unavailable"));
    vi.spyOn(f.quota, "readResearchReservation").mockImplementation(async (...args) => {
      reads += 1;
      if (reads === 2) throw new Error("quota acknowledgement read unavailable");
      return readReservation(...args);
    });
    const release = vi.spyOn(f.budget, "releaseRemoteBeforeBegin");

    await expect(f.coordinator.reconcileBeforeBegin(identity(created.execution)))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(await f.executions.read(created.execution.ownerId, created.execution.runId))
      .toMatchObject({ admissionState: "closed" });
    expect(release).toHaveBeenCalledTimes(1);
    expect(await f.budget.findReservation(created.execution.ownerId, created.execution.runId, created.execution.requestId))
      .toMatchObject({ status: "released" });

    vi.mocked(f.quota.readResearchReservation).mockImplementation(readReservation);
    await expect(f.coordinator.reconcileBeforeBegin(identity(created.execution))).resolves.toMatchObject({
      execution: { admissionState: "closed" },
    });
    expect(await f.quota.readResearchReservation(created.execution.ownerId, created.execution.quotaKey))
      .toMatchObject({ finalStatus: "failed" });
  });

  it("keeps a closed execution recoverable when budget release fails before commit", async () => {
    const f = fixture();
    const created = await f.createRemote();
    await f.reserveAdmission(created.execution);
    const originalRelease = f.budget.releaseRemoteBeforeBegin.bind(f.budget);
    vi.spyOn(f.budget, "releaseRemoteBeforeBegin").mockRejectedValueOnce(new Error("budget unavailable before commit"));

    await expect(f.coordinator.reconcileBeforeBegin(identity(created.execution)))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(await f.executions.read(created.execution.ownerId, created.execution.runId)).toMatchObject({ admissionState: "closed" });
    expect(await f.budget.findReservation(created.execution.ownerId, created.execution.runId, created.execution.requestId)).toMatchObject({ status: "reserved" });

    vi.mocked(f.budget.releaseRemoteBeforeBegin).mockImplementation(originalRelease);
    await expect(f.coordinator.reconcileBeforeBegin(identity(created.execution))).resolves.toMatchObject({
      execution: { admissionState: "closed" },
    });
    expect(await f.budget.findReservation(created.execution.ownerId, created.execution.runId, created.execution.requestId)).toMatchObject({ status: "released" });
  });

  it("recovers a lost atomic closure acknowledgement before releasing existing reservations", async () => {
    const f = fixture();
    const created = await f.createRemote();
    await f.reserveAdmission(created.execution);
    const batch = f.db.batch.bind(f.db);
    let lost = false;
    f.db.batch = async (statements) => {
      const result = await batch(statements);
      if (!lost && statements.length === 4) { lost = true; throw new Error("lost closure acknowledgement"); }
      return result;
    };

    const result = await f.coordinator.reconcileBeforeBegin(identity(created.execution));
    expect(result.execution).toMatchObject({ admissionState: "closed", closeReason: "interrupted" });
    expect(await f.quota.readResearchReservation(created.execution.ownerId, created.execution.quotaKey)).toMatchObject({ finalStatus: "failed" });
    expect(await f.budget.findReservation(created.execution.ownerId, created.execution.runId, created.execution.requestId)).toMatchObject({ status: "released" });
  });

  it("reopens repository instances and resumes a partial pending admission", async () => {
    const directory = mkdtempSync(join(tmpdir(), "site-admission-coordinator-"));
    directories.push(directory);
    const path = join(directory, "research.db");
    const f = createSiteAdmissionFixture(path);
    const created = await f.createRemote();
    await f.quota.admitRemoteResearch(f.quotaCommand(created.execution));
    f.db.close();

    const reopened = new SqliteD1(path);
    databases.push(reopened);
    reopened.database.exec("PRAGMA foreign_keys = ON");
    const research = new D1ResearchRepository(reopened as unknown as D1Database, { now: () => Date.parse("2026-09-15T12:00:00.000Z") });
    const executions = new D1SiteExecutionRepository(reopened as unknown as D1Database, research);
    const quota = new D1EntitlementRepository(reopened as unknown as D1Database);
    const budget = new D1ResearchBudgetRepository(reopened as unknown as D1Database);
    const coordinator = new SiteAdmissionCoordinator({ research, executions, entitlements: quota, budget, now: () => Date.parse("2026-09-15T12:00:00.000Z") });

    const result = await coordinator.reconcileBeforeBegin(identity(created.execution));
    expect(result.execution).toMatchObject({ admissionState: "closed", closeReason: "interrupted" });
    expect(await quota.readResearchReservation(created.execution.ownerId, created.execution.quotaKey)).toMatchObject({ finalStatus: "failed" });
    expect(await budget.findReservation(created.execution.ownerId, created.execution.runId, created.execution.requestId)).toBeNull();
  });

  it.each(["quota", "budget"] as const)("recovers a lost %s finalization acknowledgement", async (point) => {
    const f = fixture();
    const created = await f.createRemote();
    await f.reserveAdmission(created.execution);
    if (point === "quota") {
      const original = f.quota.finalize.bind(f.quota);
      vi.spyOn(f.quota, "finalize").mockImplementationOnce(async (...args) => { await original(...args); throw new Error("lost quota finalization acknowledgement"); });
    } else {
      const original = f.budget.releaseRemoteBeforeBegin.bind(f.budget);
      vi.spyOn(f.budget, "releaseRemoteBeforeBegin").mockImplementationOnce(async (command) => { await original(command); throw new Error("lost budget release acknowledgement"); });
    }

    const result = await f.coordinator.reconcileBeforeBegin(identity(created.execution));
    expect(result.execution.admissionState).toBe("closed");
    expect(await f.quota.readResearchReservation(created.execution.ownerId, created.execution.quotaKey)).toMatchObject({ finalStatus: "failed" });
    expect(await f.budget.findReservation(created.execution.ownerId, created.execution.runId, created.execution.requestId)).toMatchObject({ status: "released" });
  });

  it.each(["accepted", "rejected"] as const)("preserves an existing terminal quota %s result and reports conflict", async (status) => {
    const f = fixture();
    const created = await f.createRemote();
    const reservations = await f.reserveAdmission(created.execution);
    await f.executions.closeBeforeBegin(f.closeCommand(created.execution, "interrupted"));
    await f.quota.finalize(reservations.quotaReservationId, status, status === "accepted" ? 1 : 0);

    await expect(f.coordinator.reconcileBeforeBegin(identity(created.execution)))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(await f.quota.readResearchReservation(created.execution.ownerId, created.execution.quotaKey)).toMatchObject({ finalStatus: status });
    expect(await f.budget.findReservation(created.execution.ownerId, created.execution.runId, created.execution.requestId)).toMatchObject({ status: "reserved" });
  });

  it.each(["settled", "conservative-hold"] as const)("preserves an existing budget %s result and reports conflict before quota mutation", async (status) => {
    const f = fixture();
    const created = await f.createRemote();
    const reservations = await f.reserveAdmission(created.execution);
    await f.executions.closeBeforeBegin(f.closeCommand(created.execution, "interrupted"));
    await f.budget.settle(created.execution.ownerId, reservations.budgetReservationId,
      status === "settled" ? { kind: "actual", actualMicros: 1 } : { kind: "unknown" });

    await expect(f.coordinator.reconcileBeforeBegin(identity(created.execution)))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(await f.quota.readResearchReservation(created.execution.ownerId, created.execution.quotaKey)).toMatchObject({ finalStatus: null });
    expect(await f.budget.findReservation(created.execution.ownerId, created.execution.runId, created.execution.requestId)).toMatchObject({ status });
  });

  it("rejects a mismatched identity before reading or writing accounting", async () => {
    const f = fixture();
    const created = await f.createRemote();
    const quotaRead = vi.spyOn(f.quota, "readResearchReservation");
    const budgetRead = vi.spyOn(f.budget, "findReservation");
    const quotaReserve = vi.spyOn(f.quota, "admitRemoteResearch");
    const budgetReserve = vi.spyOn(f.budget, "reserveRemote");

    await expect(f.coordinator.admitNew({ ...identity(created.execution), requestId: "wrong-request" }, OPEN_GATE))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(quotaRead).not.toHaveBeenCalled();
    expect(budgetRead).not.toHaveBeenCalled();
    expect(quotaReserve).not.toHaveBeenCalled();
    expect(budgetReserve).not.toHaveBeenCalled();
  });

  it("snapshots strict identity and gate envelopes before the first await", async () => {
    const f = fixture();
    const created = await f.createRemote();
    const getRun = vi.spyOn(f.research, "getRun");
    await expect(f.coordinator.admitNew({ ...identity(created.execution), extra: true } as never, OPEN_GATE))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    await expect(f.coordinator.admitNew(identity(created.execution), { ...OPEN_GATE, extra: true } as never))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(getRun).not.toHaveBeenCalled();
  });

  it("accepts the existing long research-id grammar at the input boundary", async () => {
    const f = fixture();
    const getRun = vi.spyOn(f.research, "getRun").mockResolvedValue(null);
    const longRunId = `research-${"a".repeat(170)}`;
    await expect(f.coordinator.reconcileBeforeBegin({
      ownerId: "owner-a",
      runId: longRunId,
      requestId: "request-long",
      jobId: "00000000-0000-4000-8000-000000000001",
      requestHash: "a".repeat(64),
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(getRun).toHaveBeenCalledWith("owner-a", longRunId);
  });
});
