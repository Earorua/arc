// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deterministicId, fingerprint } from "../../app/lib/planning/fingerprint";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { buildSiteExecutionInsert, D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { encodeBridgeJob, hashBridgeJob } from "../../app/server/research/executor/job";
import { RESEARCH_CONFIGURATION_VERSIONS } from "../../app/server/research/production-policy";
import type { CreateRemoteResearchRunCommand, RemoteCreationPolicy } from "../../app/server/research/repository";
import { ResearchRepositoryError } from "../../app/server/research/repository";
import { createControlPoint, createSiteAdmissionFixture } from "../helpers/site-admission-fixture";
import { createResearchD1, seedUser, SqliteD1 } from "../helpers/sqlite-d1";

const NOW = Date.parse("2026-09-15T12:00:00.000Z");
const POLICY: RemoteCreationPolicy = Object.freeze({ cacheDays: 30, userDailyQuota: 3, dailyBudgetMicros: 20_000_000, monthlyBudgetMicros: 100_000_000, maximumMicros: 5_000_000 });
const open = new Set<SqliteD1>();
const dirs = new Set<string>();

afterEach(() => {
  vi.restoreAllMocks();
  for (const db of open) db.close();
  open.clear();
  for (const dir of dirs) {
    const target = resolve(dir);
    if (!target.startsWith(`${resolve(tmpdir())}${sep}`) || !basename(target).startsWith("site-execution-")) {
      throw new Error("Refusing to remove an unexpected fixture directory");
    }
    rmSync(target, { recursive: true, force: true });
  }
  dirs.clear();
});

function command(mutationId = "mutation-remote-1", requestId = "request-remote-1"): CreateRemoteResearchRunCommand {
  return { ownerId: "owner-a", requestId, mutationId, rawRole: "Data Product Manager", normalizedRoleKey: "data product manager", locale: "en-US", inputFingerprint: fingerprint(["data product manager", "en-US"]), configFingerprint: fingerprint(["synthetic-current-config"]), policy: { ...POLICY } };
}

function setup(filename?: string) {
  const db = createResearchD1(filename);
  open.add(db);
  seedUser(db, "owner-a"); seedUser(db, "owner-b");
  let run = 0; let job = 0;
  let currentNow = NOW;
  const repository = new D1ResearchRepository(db as unknown as D1Database, {
    now: () => currentNow,
    createId: () => `research-run-${++run}`,
    createJobId: () => `00000000-0000-4000-8000-${String(++job).padStart(12, "0")}`,
  });
  return {
    db,
    repository,
    executions: new D1SiteExecutionRepository(db as unknown as D1Database, repository),
    setNow: (value: number) => { currentNow = value; },
  };
}

async function makeFailed(db: SqliteD1, repository: D1ResearchRepository, created: Awaited<ReturnType<D1ResearchRepository["createRemoteOrReplay"]>>, retryable = true) {
  db.database.prepare(`UPDATE research_runs SET state='failed',state_version=state_version+1,retryable=?1,
    active_slot=NULL,active_expires_at=NULL,error_code='service-failed',public_failure_category='service-unavailable',updated_at=?2
    WHERE id=?3 AND execution_mode='cloudflare-workflow-v1'`).run(retryable ? 1 : 0, NOW, created.run.id);
  return repository.getRun(created.run.ownerId, created.run.id);
}

function identityForCache(execution: NonNullable<Awaited<ReturnType<D1ResearchRepository["createRemoteOrReplay"]>>["execution"]>) {
  return {
    ownerId: execution.ownerId,
    runId: execution.runId,
    requestId: execution.requestId,
    jobId: execution.jobId,
    requestHash: execution.requestHash,
  };
}

describe("D1 site execution repository", () => {
  it("atomically closes an unpaid remote execution around a fresh global cache hit", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const cached = await fixture.createFreshCachePackage("owner-a");
    const created = await fixture.createRemote("owner-b");
    const beforeCounts = fixture.readCounts();

    const result = await fixture.research.attachRemoteCachedPackage({
      ownerId: created.execution.ownerId,
      runId: created.execution.runId,
      requestId: created.execution.requestId,
      jobId: created.execution.jobId,
      requestHash: created.execution.requestHash,
      expectedRunVersion: created.run.stateVersion,
      expectedExecutionVersion: created.execution.version,
      package: cached.package,
    });

    expect(result.run).toMatchObject({ state: "ready", packageId: cached.package.id, stateVersion: 1 });
    expect(result.execution).toMatchObject({ admissionState: "closed", closeReason: "cached", version: 1 });
    expect(result.execution.closedAt).toBe(NOW);
    expect(fixture.readCounts()).toEqual(beforeCounts);
    expect(fixture.db.batches.at(-1)).toHaveLength(4);
  });

  it("replays only the exact cached closure while durable accounting remains empty", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const cached = await fixture.createFreshCachePackage();
    const created = await fixture.createRemote();
    const command = {
      ...identityForCache(created.execution),
      expectedRunVersion: created.run.stateVersion,
      expectedExecutionVersion: created.execution.version,
      package: cached.package,
    };
    const first = await fixture.research.attachRemoteCachedPackage(command);
    await expect(fixture.research.attachRemoteCachedPackage(command)).resolves.toEqual(first);
    await expect(fixture.research.attachRemoteCachedPackage({
      ...command,
      expectedRunVersion: first.run.stateVersion,
      expectedExecutionVersion: first.execution.version,
    })).rejects.toMatchObject({ code: "CONFLICT" });

    fixture.db.database.prepare(`INSERT INTO quota_ledger
      (id,user_id,purpose,reservation_id,idempotency_key,entry_kind,units,created_at)
      VALUES('late-ledger','owner-a','role-research','late-reservation',?1,'reserved',1,?2)`)
      .run(created.execution.quotaKey, NOW);
    await expect(fixture.research.attachRemoteCachedPackage(command))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it.each(["queue", "package"] as const)("uses the SQL clock to reject an expired %s and leaves the pair unchanged", async (kind) => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const cached = await fixture.createFreshCachePackage();
    const created = await fixture.createRemote();
    fixture.setSqlNow(kind === "queue"
      ? created.execution.job.queueExpiresAt
      : Date.parse(`${cached.package.expiresAt}T00:00:00.000Z`));

    await expect(fixture.research.attachRemoteCachedPackage({
      ...identityForCache(created.execution),
      expectedRunVersion: created.run.stateVersion,
      expectedExecutionVersion: created.execution.version,
      package: cached.package,
    })).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    await expect(fixture.executions.read(created.run.ownerId, created.run.id)).resolves.toEqual(created.execution);
    await expect(fixture.research.getRun(created.run.ownerId, created.run.id)).resolves.toEqual(created.run);
  });

  it("rejects SQL-expired package bytes while the original queue and application cache clock remain live", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const cached = await fixture.createFreshCachePackage();
    const packageExpiresAt = Date.parse(`${cached.package.expiresAt}T00:00:00.000Z`);
    fixture.setAppNow(packageExpiresAt - 60_000);
    fixture.setSqlNow(packageExpiresAt - 60_000);
    const created = await fixture.createRemote("owner-b");
    expect(created.execution.job.queueExpiresAt).toBe(packageExpiresAt + 60_000);
    await expect(fixture.research.findFreshPackage({
      normalizedRoleKey: created.run.normalizedRoleKey,
      locale: created.run.locale,
      configFingerprint: created.run.configFingerprint,
      now: packageExpiresAt - 60_000,
    })).resolves.not.toBeNull();
    fixture.setSqlNow(packageExpiresAt);
    const before = fixture.readCounts();

    await expect(fixture.research.attachRemoteCachedPackage({
      ...identityForCache(created.execution),
      expectedRunVersion: created.run.stateVersion,
      expectedExecutionVersion: created.execution.version,
      package: cached.package,
    })).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    await expect(fixture.research.getRun(created.run.ownerId, created.run.id)).resolves.toEqual(created.run);
    await expect(fixture.executions.read(created.run.ownerId, created.run.id)).resolves.toEqual(created.execution);
    expect(fixture.readCounts()).toEqual(before);
  });

  it.each(["quota", "budget"] as const)("rejects a cache attachment after a pending %s reservation", async (kind) => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const cached = await fixture.createFreshCachePackage();
    const created = await fixture.createRemote();
    if (kind === "quota") await fixture.quota.admitRemoteResearch(fixture.quotaCommand(created.execution));
    else await fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));

    await expect(fixture.research.attachRemoteCachedPackage({
      ...identityForCache(created.execution),
      expectedRunVersion: created.run.stateVersion,
      expectedExecutionVersion: created.execution.version,
      package: cached.package,
    })).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    await expect(fixture.executions.read(created.run.ownerId, created.run.id)).resolves.toEqual(created.execution);
  });

  it("rejects mismatched package bytes and every target cache identity field before lifecycle writes", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const cached = await fixture.createFreshCachePackage();
    const altered = structuredClone(cached.package);
    altered.blueprint.summary = `${altered.blueprint.summary} altered`;
    const created = await fixture.createRemote();
    await expect(fixture.research.attachRemoteCachedPackage({
      ...identityForCache(created.execution),
      expectedRunVersion: 0,
      expectedExecutionVersion: 0,
      package: altered,
    })).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    await expect(fixture.executions.read(created.run.ownerId, created.run.id)).resolves.toEqual(created.execution);

    for (const mismatch of ["role", "locale", "config"] as const) {
      const otherInput = fixture.remoteCommand();
      const override = mismatch === "role"
        ? { rawRole: "UX Designer", normalizedRoleKey: "ux designer", inputFingerprint: fingerprint(["ux designer", "en-US"]) }
        : mismatch === "locale"
          ? { locale: "zh-CN" as const, inputFingerprint: fingerprint(["data product manager", "zh-CN"]) }
          : { configFingerprint: fingerprint(["other-config"]) };
      const other = await fixture.research.createRemoteOrReplay({ ...otherInput, ...override });
      if (!other.execution) throw new Error("expected remote execution");
      await expect(fixture.research.attachRemoteCachedPackage({
        ...identityForCache(other.execution),
        expectedRunVersion: 0,
        expectedExecutionVersion: 0,
        package: cached.package,
      })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(fixture.executions.read(other.run.ownerId, other.run.id)).resolves.toEqual(other.execution);
    }
  });

  it("rejects cache attachment after a remote execution has begun", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const cached = await fixture.createFreshCachePackage();
    const created = await fixture.createRemote();
    const reservations = await fixture.reserveAdmission(created.execution);
    const admitted = await fixture.executions.markAdmitted(fixture.admissionCommand(created.execution, reservations));
    const beganAt = NOW + 1;
    fixture.db.database.prepare("UPDATE research_site_executions SET began_at=?1,execution_expires_at=?1+1260000,version=version+1,updated_at=?1 WHERE run_id=?2")
      .run(beganAt, created.run.id);
    fixture.db.database.prepare("UPDATE research_runs SET state='researching',state_version=state_version+1,active_expires_at=?1,updated_at=?2 WHERE id=?3")
      .run(beganAt + 1_260_000, beganAt, created.run.id);

    await expect(fixture.research.attachRemoteCachedPackage({
      ...identityForCache(admitted),
      expectedRunVersion: 0,
      expectedExecutionVersion: admitted.version,
      package: cached.package,
    })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rolls back the cached execution close when the final Ready update matches zero rows", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const cached = await fixture.createFreshCachePackage();
    const created = await fixture.createRemote();
    const prepare = fixture.db.prepare.bind(fixture.db);
    fixture.db.prepare = ((sql: string) => prepare(sql.startsWith("UPDATE research_runs AS r\n      SET state='ready'") ? `${sql} AND 0` : sql)) as typeof fixture.db.prepare;

    await expect(fixture.research.attachRemoteCachedPackage({
      ...identityForCache(created.execution),
      expectedRunVersion: 0,
      expectedExecutionVersion: 0,
      package: cached.package,
    })).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    await expect(fixture.executions.read(created.run.ownerId, created.run.id)).resolves.toEqual(created.execution);
    await expect(fixture.research.getRun(created.run.ownerId, created.run.id)).resolves.toEqual(created.run);
  });

  it("recovers a lost cache batch acknowledgement only when the full cached result is still exact", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const cached = await fixture.createFreshCachePackage();
    const created = await fixture.createRemote();
    const batch = fixture.db.batch.bind(fixture.db);
    fixture.db.batch = async (statements) => {
      const result = await batch(statements);
      if (statements.length === 4) throw new Error("lost cache acknowledgement");
      return result;
    };

    const result = await fixture.research.attachRemoteCachedPackage({
      ...identityForCache(created.execution),
      expectedRunVersion: 0,
      expectedExecutionVersion: 0,
      package: cached.package,
    });
    expect(result.run).toMatchObject({ state: "ready", packageId: cached.package.id });
    expect(result.execution).toMatchObject({ admissionState: "closed", closeReason: "cached" });
  });

  it.each(["normal", "lost-ack"] as const)("rejects the %s cache readback when durable accounting appears after commit", async (mode) => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const cached = await fixture.createFreshCachePackage();
    const created = await fixture.createRemote();
    const batch = fixture.db.batch.bind(fixture.db);
    fixture.db.batch = async (statements) => {
      const result = await batch(statements);
      if (statements.length === 4) {
        fixture.db.database.prepare(`INSERT INTO quota_ledger
          (id,user_id,purpose,reservation_id,idempotency_key,entry_kind,units,created_at)
          VALUES('late-ledger','owner-a','role-research','late-reservation',?1,'reserved',1,?2)`)
          .run(created.execution.quotaKey, NOW);
        if (mode === "lost-ack") throw new Error("lost cache acknowledgement");
      }
      return result;
    };

    await expect(fixture.research.attachRemoteCachedPackage({
      ...identityForCache(created.execution),
      expectedRunVersion: 0,
      expectedExecutionVersion: 0,
      package: cached.package,
    })).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("marks an open remote execution admitted only with both durable reservations", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    const reservations = await fixture.reserveAdmission(created.execution);

    const admitted = await fixture.executions.markAdmitted(fixture.admissionCommand(created.execution, reservations));
    expect(admitted).toMatchObject({
      admissionState: "admitted",
      version: 1,
      quotaReservationId: reservations.quotaReservationId,
      budgetReservationId: reservations.budgetReservationId,
      admittedAt: NOW,
      updatedAt: NOW,
    });
    await expect(fixture.research.getRun(created.run.ownerId, created.run.id)).resolves.toMatchObject({ state: "queued", stateVersion: 0 });
    await expect(fixture.executions.markAdmitted(fixture.admissionCommand(created.execution, reservations))).resolves.toEqual(admitted);
    await expect(fixture.executions.markAdmitted({
      ...fixture.admissionCommand(created.execution, reservations),
      budgetReservationId: "budget-conflict",
    })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it.each(["quota", "budget"] as const)("rejects admission when the %s reservation is missing", async (missing) => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    const quota = missing === "quota" ? null : await fixture.quota.admitRemoteResearch(fixture.quotaCommand(created.execution));
    const budget = missing === "budget" ? null : await fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));
    if (quota && !quota.allowed || budget && !budget.allowed) throw new Error("admission fixture reservation denied");
    await expect(fixture.executions.markAdmitted(fixture.admissionCommand(created.execution, {
      quotaReservationId: quota?.reservationId ?? "quota-missing",
      budgetReservationId: budget?.reservation.id ?? "budget-missing",
    }))).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(fixture.executions.read(created.run.ownerId, created.run.id)).resolves.toMatchObject({ admissionState: "pending", version: 0 });
  });

  it("rejects terminal and corrupt-parent quota reservations", async () => {
    for (const corruption of ["terminal", "corrupt-parent"] as const) {
      const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
      const created = await fixture.createRemote();
      const reservations = await fixture.reserveAdmission(created.execution);
      if (corruption === "terminal") {
        await fixture.quota.finalize(reservations.quotaReservationId, "failed", 0);
      } else {
        fixture.db.database.prepare(`INSERT INTO quota_ledger(
          id,user_id,purpose,reservation_id,idempotency_key,entry_kind,units,created_at
        ) VALUES('quota-corrupt-child','owner-b','role-research',?1,'corrupt-child-key','failed',0,?2)`)
          .run(reservations.quotaReservationId, NOW);
      }
      await expect(fixture.executions.markAdmitted(fixture.admissionCommand(created.execution, reservations)))
        .rejects.toMatchObject({ code: "CONFLICT" });
    }
  });

  it.each(["wrong-id", "wrong-owner", "wrong-request", "wrong-maximum", "wrong-expiry", "released", "held"] as const)(
    "rejects incompatible budget evidence: %s",
    async (kind) => {
      const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
      const created = await fixture.createRemote();
      const reservations = await fixture.reserveAdmission(created.execution);
      let budgetReservationId = reservations.budgetReservationId;
      if (kind === "wrong-id") budgetReservationId = "budget-missing";
      if (kind === "wrong-owner") {
        const foreign = await fixture.createRemote("owner-b");
        const decision = await fixture.budget.reserveRemote(fixture.budgetCommand(foreign.execution));
        if (!decision.allowed) throw new Error("foreign budget fixture denied");
        budgetReservationId = decision.reservation.id;
      }
      if (kind === "wrong-request") fixture.db.database.prepare("UPDATE ai_budget_reservations SET request_id='request-corrupt' WHERE id=?1").run(budgetReservationId);
      if (kind === "wrong-maximum") fixture.db.database.prepare("UPDATE ai_budget_reservations SET maximum_reserved_micros=maximum_reserved_micros-1 WHERE id=?1").run(budgetReservationId);
      if (kind === "wrong-expiry") fixture.db.database.prepare("UPDATE ai_budget_reservations SET expires_at=expires_at+1 WHERE id=?1").run(budgetReservationId);
      if (kind === "released") await fixture.budget.settle(created.execution.ownerId, budgetReservationId, { kind: "not-charged" });
      if (kind === "held") await fixture.budget.settle(created.execution.ownerId, budgetReservationId, { kind: "unknown" });
      await expect(fixture.executions.markAdmitted({
        ...fixture.admissionCommand(created.execution, reservations),
        budgetReservationId,
      })).rejects.toMatchObject({ code: "CONFLICT" });
    },
  );

  it.each(["closed", "begun", "expired", "exhausted-version"] as const)("does not admit a %s execution", async (kind) => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    const reservations = await fixture.reserveAdmission(created.execution);
    const admission = fixture.admissionCommand(created.execution, reservations);
    if (kind === "closed") {
      fixture.db.database.prepare(`UPDATE research_site_executions SET admission_state='closed',closed_at=?1,
        close_reason='denied',version=version+1,updated_at=?1 WHERE run_id=?2`).run(NOW, created.run.id);
    } else if (kind === "begun") {
      await fixture.executions.markAdmitted(admission);
      fixture.db.database.prepare("UPDATE research_site_executions SET began_at=?1,execution_expires_at=?1+1260000,version=version+1,updated_at=?1 WHERE run_id=?2")
        .run(NOW + 1, created.run.id);
      fixture.db.database.prepare("UPDATE research_runs SET active_expires_at=?1 WHERE id=?2")
        .run(NOW + 1 + 1_260_000, created.run.id);
    } else if (kind === "expired") {
      fixture.setSqlNow(created.execution.job.queueExpiresAt);
    } else {
      // The lifecycle trigger is intentionally removed only to model a durable
      // version that no lawful sequence can reach during a unit test.
      fixture.db.database.exec("DROP TRIGGER research_site_executions_lifecycle_guard");
      fixture.db.database.prepare("UPDATE research_site_executions SET version=?1 WHERE run_id=?2")
        .run(Number.MAX_SAFE_INTEGER, created.run.id);
    }
    await expect(fixture.executions.markAdmitted(admission)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it.each(["quota-terminal", "deadline"] as const)("fences actual admission after a delayed %s change", async (change) => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    const reservations = await fixture.reserveAdmission(created.execution);
    const point = createControlPoint();
    const prepare = fixture.db.prepare.bind(fixture.db); let wrapped = false;
    fixture.db.prepare = ((sql: string) => {
      const statement = prepare(sql);
      if (wrapped || !sql.includes("UPDATE research_site_executions AS e")) return statement;
      wrapped = true;
      const bind = statement.bind.bind(statement);
      statement.bind = ((...values: unknown[]) => {
        const bound = bind(...values); const run = bound.run.bind(bound);
        bound.run = async () => { await point.wait(); return run(); };
        return bound;
      }) as typeof statement.bind;
      return statement;
    }) as typeof fixture.db.prepare;
    const pending = fixture.executions.markAdmitted(fixture.admissionCommand(created.execution, reservations));
    await point.entered;
    if (change === "quota-terminal") await fixture.quota.finalize(reservations.quotaReservationId, "failed", 0);
    else fixture.setSqlNow(created.execution.job.queueExpiresAt);
    point.resume();
    await expect(pending).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(fixture.executions.read(created.run.ownerId, created.run.id)).resolves.toMatchObject({ admissionState: "pending", version: 0 });
  });

  it("recovers the exact admitted state after losing the UPDATE acknowledgement", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    const reservations = await fixture.reserveAdmission(created.execution);
    const prepare = fixture.db.prepare.bind(fixture.db); let wrapped = false;
    fixture.db.prepare = ((sql: string) => {
      const statement = prepare(sql);
      if (wrapped || !sql.includes("UPDATE research_site_executions AS e")) return statement;
      wrapped = true;
      const bind = statement.bind.bind(statement);
      statement.bind = ((...values: unknown[]) => {
        const bound = bind(...values); const run = bound.run.bind(bound);
        bound.run = async () => { await run(); throw new Error("lost admission acknowledgement"); };
        return bound;
      }) as typeof statement.bind;
      return statement;
    }) as typeof fixture.db.prepare;
    await expect(fixture.executions.markAdmitted(fixture.admissionCommand(created.execution, reservations)))
      .resolves.toMatchObject({ admissionState: "admitted", version: 1, ...reservations });
  });

  it("does not mutate a corrupt stored execution before strict validation", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    const reservations = await fixture.reserveAdmission(created.execution);
    // Drop only the immutable-field trigger to create corruption that the
    // repository must detect; the lifecycle trigger remains active.
    fixture.db.database.exec("DROP TRIGGER research_site_executions_identity_immutable");
    fixture.db.database.prepare("UPDATE research_site_executions SET validation_context_json='{}',version=version+1,updated_at=?1 WHERE run_id=?2")
      .run(NOW, created.run.id);
    await expect(fixture.executions.markAdmitted({
      ...fixture.admissionCommand(created.execution, reservations),
      expectedVersion: 1,
    }))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(fixture.db.database.prepare("SELECT admission_state,version FROM research_site_executions WHERE run_id=?1")
      .get(created.run.id)).toEqual({ admission_state: "pending", version: 1 });
  });

  it("atomically closes a pending execution and terminalizes its queued remote run", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    const result = await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution, "denied"));
    expect(result.execution).toMatchObject({
      admissionState: "closed",
      version: 1,
      closedAt: NOW,
      closeReason: "denied",
      beganAt: null,
      executionExpiresAt: null,
    });
    expect(result.run).toMatchObject({
      state: "failed",
      stateVersion: 1,
      retryable: true,
      errorCode: "admission-denied",
      failureCategory: "service-unavailable",
      activeExpiresAt: null,
    });
  });

  it.each([
    ["denied", "admission-denied", "service-unavailable"],
    ["expired", "interrupted", "timeout"],
    ["interrupted", "interrupted", "service-unavailable"],
  ] as const)("closes admitted and pending executions with the immutable %s mapping", async (reason, errorCode, failureCategory) => {
    for (const state of ["pending", "admitted"] as const) {
      const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
      const created = await fixture.createRemote();
      let before = created.execution;
      if (state === "admitted") {
        const reservations = await fixture.reserveAdmission(before);
        before = await fixture.executions.markAdmitted(fixture.admissionCommand(before, reservations));
      }
      if (reason === "expired") fixture.setSqlNow(before.job.queueExpiresAt + 1);
      const result = await fixture.executions.closeBeforeBegin(fixture.closeCommand(before, reason));
      expect(result.execution).toMatchObject({
        admissionState: "closed",
        closeReason: reason,
        version: before.version + 1,
        quotaReservationId: before.quotaReservationId,
        budgetReservationId: before.budgetReservationId,
        admittedAt: before.admittedAt,
      });
      expect(result.run).toMatchObject({ state: "failed", stateVersion: 1, retryable: true, errorCode, failureCategory });
      const replay = await fixture.executions.closeBeforeBegin(fixture.closeCommand(before, reason));
      expect(replay).toEqual(result);
      await expect(fixture.executions.closeBeforeBegin(fixture.closeCommand(before, reason === "denied" ? "interrupted" : "denied")))
        .rejects.toMatchObject({ code: "CONFLICT" });
    }
  });

  it("rolls back execution closure when the paired run update loses its CAS", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    const prepare = fixture.db.prepare.bind(fixture.db);
    fixture.db.prepare = ((sql: string) => prepare(sql.startsWith("UPDATE research_runs AS close_run") ? `${sql} AND 0` : sql)) as typeof fixture.db.prepare;
    await expect(fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution)))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    await expect(fixture.executions.read(created.run.ownerId, created.run.id)).resolves.toEqual(created.execution);
    await expect(fixture.research.getRun(created.run.ownerId, created.run.id)).resolves.toEqual(created.run);
    expect(fixture.db.batches.at(-1)).toHaveLength(4);
    expect(fixture.db.batches.at(-1)?.[1]).toContain("lifecycle_assertion");
    expect(fixture.db.batches.at(-1)?.[3]).toContain("lifecycle_assertion");
  });

  it("recovers one immutable closure after losing the batch acknowledgement", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    fixture.setSqlNow(NOW + 7_000);
    const batch = fixture.db.batch.bind(fixture.db); let lost = false;
    fixture.db.batch = async (statements) => {
      const result = await batch(statements);
      if (!lost && statements.length === 4) { lost = true; throw new Error("lost closure acknowledgement"); }
      return result;
    };
    const result = await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution, "interrupted"));
    expect(result.execution).toMatchObject({ closedAt: NOW + 7_000, closeReason: "interrupted", version: 1 });
    fixture.setSqlNow(NOW + 20_000);
    await expect(fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution, "interrupted"))).resolves.toEqual(result);
  });

  it("rejects closure after a future begin fixture and does not infer unsent from state version", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    const reservations = await fixture.reserveAdmission(created.execution);
    const admitted = await fixture.executions.markAdmitted(fixture.admissionCommand(created.execution, reservations));
    const beganAt = NOW + 1;
    fixture.db.database.prepare("UPDATE research_site_executions SET began_at=?1,execution_expires_at=?1+1260000,version=version+1,updated_at=?1 WHERE run_id=?2")
      .run(beganAt, created.run.id);
    fixture.db.database.prepare("UPDATE research_runs SET state='researching',state_version=state_version+1,active_expires_at=?1,updated_at=?2 WHERE id=?3")
      .run(beganAt + 1_260_000, beganAt, created.run.id);
    await expect(fixture.executions.closeBeforeBegin(fixture.closeCommand(admitted)))
      .rejects.toMatchObject({ code: "CONFLICT" });
    await expect(fixture.executions.read(created.run.ownerId, created.run.id)).resolves.toMatchObject({ admissionState: "admitted", beganAt });
  });

  it("preserves committed reservations through close and prevents admitted replay from a terminal run", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    const reservations = await fixture.reserveAdmission(created.execution);
    const admitted = await fixture.executions.markAdmitted(fixture.admissionCommand(created.execution, reservations));
    const closed = await fixture.executions.closeBeforeBegin(fixture.closeCommand(admitted, "denied"));
    expect(closed.execution).toMatchObject({ admissionState: "closed", ...reservations });
    await expect(fixture.quota.readResearchReservation(admitted.ownerId, admitted.quotaKey)).resolves
      .toMatchObject({ reservationId: reservations.quotaReservationId, finalStatus: null });
    await expect(fixture.budget.findReservation(admitted.ownerId, admitted.runId, admitted.requestId)).resolves
      .toMatchObject({ id: reservations.budgetReservationId, status: "reserved" });
    await expect(fixture.executions.markAdmitted(fixture.admissionCommand(created.execution, reservations)))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects an admitted replay when the paired public run independently became terminal", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    const reservations = await fixture.reserveAdmission(created.execution);
    await fixture.executions.markAdmitted(fixture.admissionCommand(created.execution, reservations));
    fixture.db.database.prepare(`UPDATE research_runs SET state='failed',state_version=state_version+1,retryable=1,
      active_slot=NULL,active_expires_at=NULL,error_code='service-failed',public_failure_category='service-unavailable',updated_at=?1
      WHERE id=?2 AND execution_mode='cloudflare-workflow-v1'`).run(NOW, created.run.id);
    await expect(fixture.executions.markAdmitted(fixture.admissionCommand(created.execution, reservations)))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lets an atomic close win against the delayed actual admitted UPDATE without reopening the pair", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    const reservations = await fixture.reserveAdmission(created.execution);
    const point = createControlPoint();
    const prepare = fixture.db.prepare.bind(fixture.db); let wrapped = false;
    fixture.db.prepare = ((sql: string) => {
      const statement = prepare(sql);
      if (wrapped || !sql.includes("UPDATE research_site_executions AS e")) return statement;
      wrapped = true;
      const bind = statement.bind.bind(statement);
      statement.bind = ((...values: unknown[]) => {
        const bound = bind(...values); const run = bound.run.bind(bound);
        bound.run = async () => { await point.wait(); return run(); };
        return bound;
      }) as typeof statement.bind;
      return statement;
    }) as typeof fixture.db.prepare;

    const pendingAdmission = fixture.executions.markAdmitted(fixture.admissionCommand(created.execution, reservations));
    await point.entered;
    const closed = await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution, "interrupted"));
    point.resume();

    await expect(pendingAdmission).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(fixture.executions.read(created.run.ownerId, created.run.id)).resolves.toEqual(closed.execution);
    await expect(fixture.research.getRun(created.run.ownerId, created.run.id)).resolves.toEqual(closed.run);
    expect(closed.execution).toMatchObject({ admissionState: "closed", quotaReservationId: null, budgetReservationId: null });
  });

  it.each(["quota", "budget"] as const)("blocks a delayed actual %s reservation after real closure", async (kind) => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    let populatedBudgetBefore: unknown[] | null = null;
    if (kind === "budget") {
      const existing = await fixture.createRemote("owner-b");
      await expect(fixture.budget.reserveRemote(fixture.budgetCommand(existing.execution)))
        .resolves.toMatchObject({ allowed: true, replayed: false });
      populatedBudgetBefore = fixture.db.database.prepare(`SELECT id,period_kind,reserved_micros,
        settled_micros,version FROM ai_budget_buckets ORDER BY id`).all();
    }
    const created = await fixture.createRemote();
    const point = createControlPoint();
    if (kind === "quota") {
      const prepare = fixture.db.prepare.bind(fixture.db); let paused = false;
      fixture.db.prepare = ((sql: string) => {
        const statement = prepare(sql);
        if (paused || !sql.includes("INSERT INTO quota_ledger") || !sql.includes("research_site_executions")) return statement;
        paused = true;
        const bind = statement.bind.bind(statement);
        statement.bind = ((...values: unknown[]) => {
          const bound = bind(...values); const run = bound.run.bind(bound);
          bound.run = async () => { await point.wait(); return run(); };
          return bound;
        }) as typeof statement.bind;
        return statement;
      }) as typeof fixture.db.prepare;
      const pending = fixture.quota.admitRemoteResearch(fixture.quotaCommand(created.execution));
      await point.entered;
      await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution));
      point.resume();
      await expect(pending).resolves.toEqual({ allowed: false, reason: "quota" });
    } else {
      const batch = fixture.db.batch.bind(fixture.db); let paused = false;
      fixture.db.batch = async (statements) => {
        const sql = (statements[2] as unknown as { sql?: string } | undefined)?.sql;
        if (!paused && typeof sql === "string" && sql.includes("INSERT INTO ai_budget_reservations")) {
          paused = true;
          await point.wait();
        }
        return batch(statements);
      };
      const pending = fixture.budget.reserveRemote(fixture.budgetCommand(created.execution));
      await point.entered;
      await fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution));
      point.resume();
      await expect(pending).resolves.toEqual({ allowed: false, reason: "budget" });
    }
    expect(fixture.db.database.prepare(kind === "quota"
      ? "SELECT count(*) count FROM quota_ledger"
      : "SELECT count(*) count FROM ai_budget_reservations").get()).toEqual({ count: kind === "quota" ? 0 : 1 });
    if (kind === "budget") {
      expect(fixture.db.database.prepare("SELECT count(*) count FROM ai_budget_reservations WHERE run_id=?1")
        .get(created.run.id)).toEqual({ count: 0 });
      expect(fixture.db.database.prepare(`SELECT id,period_kind,reserved_micros,
        settled_micros,version FROM ai_budget_buckets ORDER BY id`).all()).toEqual(populatedBudgetBefore);
    }
  });

  it("does not close a malformed stored execution before strict validation", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    fixture.db.database.exec("DROP TRIGGER research_site_executions_identity_immutable");
    fixture.db.database.prepare("UPDATE research_site_executions SET validation_context_json='{}',version=version+1,updated_at=?1 WHERE run_id=?2")
      .run(NOW, created.run.id);
    await expect(fixture.executions.closeBeforeBegin(fixture.closeCommand(created.execution)))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(fixture.db.database.prepare("SELECT admission_state,version FROM research_site_executions WHERE run_id=?1")
      .get(created.run.id)).toEqual({ admission_state: "pending", version: 1 });
  });

  it("snapshots markAdmitted input before its first storage await", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    const reservations = await fixture.reserveAdmission(created.execution);
    const command = fixture.admissionCommand(created.execution, reservations);
    const point = createControlPoint(); let paused = false;
    const executions = new D1SiteExecutionRepository(fixture.db as unknown as D1Database, {
      getRun: async (ownerId, runId) => {
        if (!paused) { paused = true; await point.wait(); }
        return fixture.research.getRun(ownerId, runId);
      },
    });
    const pending = executions.markAdmitted(command);
    await point.entered;
    const mutable = command as { requestId: string; quotaReservationId: string; budgetReservationId: string };
    mutable.requestId = "request-mutated"; mutable.quotaReservationId = "quota-mutated"; mutable.budgetReservationId = "budget-mutated";
    point.resume();
    await expect(pending).resolves.toMatchObject({ admissionState: "admitted", ...reservations });
  });

  it("snapshots closeBeforeBegin input before its first storage await", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    const command = fixture.closeCommand(created.execution, "denied");
    const point = createControlPoint(); let paused = false;
    const executions = new D1SiteExecutionRepository(fixture.db as unknown as D1Database, {
      getRun: async (ownerId, runId) => {
        if (!paused) { paused = true; await point.wait(); }
        return fixture.research.getRun(ownerId, runId);
      },
    });
    const pending = executions.closeBeforeBegin(command);
    await point.entered;
    const mutable = command as { requestId: string; reason: "denied" | "expired" | "interrupted" };
    mutable.requestId = "request-mutated"; mutable.reason = "interrupted";
    point.resume();
    await expect(pending).resolves.toMatchObject({ execution: { closeReason: "denied" }, run: { errorCode: "admission-denied" } });
  });

  it("rejects unsafe lifecycle command shapes before storage", async () => {
    const fixture = createSiteAdmissionFixture(); open.add(fixture.db);
    const created = await fixture.createRemote();
    const close = fixture.closeCommand(created.execution);
    const values = [
      { ...close, unknown: true },
      Object.assign({ ...close }, { [Symbol("secret")]: true }),
      Object.defineProperty({ ...close }, "reason", { enumerable: true, get: () => "denied" }),
      Object.assign(Object.create(null), close),
    ];
    for (const value of values) {
      await expect(fixture.executions.closeBeforeBegin(value)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    }
    expect(fixture.db.preparedSql.filter((sql) => sql.startsWith("UPDATE research_site_executions AS e"))).toHaveLength(0);
  });

  it("atomically creates one immutable remote run, alias, and execution snapshot", async () => {
    const { db, repository, executions } = setup();
    const created = await repository.createRemoteOrReplay(command());
    expect(created.replayed).toBe(false);
    expect(created.run).toMatchObject({ id: "research-run-1", requestId: "request-remote-1", state: "queued", executionMode: "cloudflare-workflow-v1", activeExpiresAt: NOW + 120_000 });
    expect(created.execution).toMatchObject({ ownerId: "owner-a", runId: created.run.id, requestId: created.run.requestId, jobId: "00000000-0000-4000-8000-000000000001", quotaKey: created.run.remoteQuotaKey, policy: POLICY, admissionState: "pending", version: 0, reservationExpiresAt: NOW + 1_380_000, beganAt: null, executionExpiresAt: null, createdAt: NOW, updatedAt: NOW });
    expect(created.execution?.job).toMatchObject({ runId: created.run.id, requestId: created.run.requestId, createdAt: NOW, queueExpiresAt: NOW + 120_000 });
    expect(created.execution?.validationContext).toMatchObject(RESEARCH_CONFIGURATION_VERSIONS);
    expect(created.execution?.validationContext.observedAt).toBe("2026-09-15");
    expect(created.execution?.validationContext.expiresAt).toBe("2026-10-15");
    expect(created.execution?.requestHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(created.execution?.quotaKey).toBe(deterministicId("research-quota", ["owner-a", created.run.id, created.run.requestId]));
    expect(created.execution?.validationContext.packageId).toBe(deterministicId("research-package", ["owner-a", created.run.id, created.run.requestId]));
    expect(created.execution?.requestHash).toBe(await hashBridgeJob(created.execution?.job));
    const stored = db.database.prepare("SELECT job_json FROM research_site_executions WHERE run_id=?").get(created.run.id) as { job_json: string };
    expect(stored.job_json).toBe(new TextDecoder().decode(encodeBridgeJob(created.execution?.job)));
    expect(await executions.read("owner-a", created.run.id)).toEqual(created.execution);
    expect(await executions.read("owner-b", created.run.id)).toBeNull();
    expect(db.database.prepare("SELECT count(*) count FROM research_runs").get()).toEqual({ count: 1 });
    expect(db.database.prepare("SELECT count(*) count FROM idempotency_records").get()).toEqual({ count: 1 });
    expect(db.database.prepare("SELECT count(*) count FROM research_site_executions").get()).toEqual({ count: 1 });
    expect(db.batches.at(-1)).toHaveLength(4);
    expect(db.batches.at(-1)?.at(-1)).toContain("lifecycle_assertion");
    expect(() => buildSiteExecutionInsert(db as unknown as D1Database, { ...created.execution!, admissionState: "admitted" }))
      .toThrow(new ResearchRepositoryError("RESEARCH_UNAVAILABLE"));
  });

  it.each([
    ["owner bound", { ...command(), ownerId: "o".repeat(161) }],
    ["request bound", { ...command(), requestId: "r".repeat(161) }],
    ["unsafe integer", { ...command(), policy: { ...POLICY, dailyBudgetMicros: Number.MAX_SAFE_INTEGER + 1 } }],
    ["unknown field", { ...command(), unknown: true }],
    ["symbol", Object.assign(command(), { [Symbol("secret")]: true })],
    ["accessor", Object.defineProperty(command(), "policy", { enumerable: true, get: () => POLICY })],
  ])("rejects an untrusted remote command before writes: %s", async (_name, value) => {
    const { db, repository } = setup();
    await expect(repository.createRemoteOrReplay(value as CreateRemoteResearchRunCommand)).rejects
      .toEqual(new ResearchRepositoryError("RESEARCH_UNAVAILABLE"));
    expect(db.batches).toHaveLength(0);
    expect(db.database.prepare("SELECT count(*) count FROM research_runs").get()).toEqual({ count: 0 });
  });

  it("leaves no writes when canonical job hashing fails", async () => {
    const { db, repository } = setup();
    vi.spyOn(globalThis.crypto.subtle, "digest").mockRejectedValue(new Error("digest unavailable"));
    await expect(repository.createRemoteOrReplay(command())).rejects.toEqual(new ResearchRepositoryError("RESEARCH_UNAVAILABLE"));
    expect(db.batches).toHaveLength(0);
    expect(db.database.prepare("SELECT count(*) count FROM research_runs").get()).toEqual({ count: 0 });
  });

  it.each([0, 1, 2, 3])("rolls back every write when remote batch statement %i fails", async (index) => {
    const { db, repository } = setup(); db.failAtBatchStatement = index;
    await expect(repository.createRemoteOrReplay(command())).rejects.toEqual(new ResearchRepositoryError("RESEARCH_UNAVAILABLE"));
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]).toHaveLength(4);
    for (const table of ["research_runs", "idempotency_records", "research_site_executions"]) {
      expect(db.database.prepare(`SELECT count(*) count FROM ${table}`).get()).toEqual({ count: 0 });
    }
  });

  it("rolls back when the execution write matches zero rows and the real lifecycle assertion fires", async () => {
    const { db, repository } = setup();
    const prepare = db.prepare.bind(db);
    db.prepare = ((sql: string) => {
      if (!sql.startsWith("INSERT INTO research_site_executions")) return prepare(sql);
      const zeroRowStatement = prepare("UPDATE research_runs SET updated_at=updated_at WHERE 0");
      return { bind: () => zeroRowStatement } as unknown as D1PreparedStatement;
    }) as typeof db.prepare;
    await expect(repository.createRemoteOrReplay(command())).rejects
      .toEqual(new ResearchRepositoryError("RESEARCH_UNAVAILABLE"));
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]).toHaveLength(4);
    expect(db.batches[0]?.[2]).toContain("WHERE 0");
    expect(db.batches[0]?.[3]).toContain("lifecycle_assertion");
    for (const table of ["research_runs", "idempotency_records", "research_site_executions"]) {
      expect(db.database.prepare(`SELECT count(*) count FROM ${table}`).get()).toEqual({ count: 0 });
    }
  });

  it("recovers the exact committed execution after a lost batch acknowledgement", async () => {
    const { db, repository } = setup();
    const batch = db.batch.bind(db); let first = true;
    db.batch = async (statements) => { const result = await batch(statements); if (first) { first = false; throw new Error("lost acknowledgement"); } return result; };
    const created = await repository.createRemoteOrReplay(command());
    expect(created).toMatchObject({ replayed: true, run: { id: "research-run-1" }, execution: { jobId: "00000000-0000-4000-8000-000000000001" } });
  });

  it("replays same-mutation and active-equivalent races without attaching a new job", async () => {
    const same = setup();
    const sameResults = await Promise.all([same.repository.createRemoteOrReplay(command()), same.repository.createRemoteOrReplay(command())]);
    expect(new Set(sameResults.map(value => value.run.id))).toEqual(new Set(["research-run-1"]));
    expect(new Set(sameResults.map(value => value.execution?.jobId))).toEqual(new Set(["00000000-0000-4000-8000-000000000001"]));
    expect(same.db.database.prepare("SELECT count(*) count FROM research_site_executions").get()).toEqual({ count: 1 });

    const active = setup();
    const results = await Promise.all([
      active.repository.createRemoteOrReplay(command("mutation-active-a", "request-active-a")),
      active.repository.createRemoteOrReplay(command("mutation-active-b", "request-active-b")),
    ]);
    expect(new Set(results.map(value => value.run.id)).size).toBe(1);
    expect(new Set(results.map(value => value.execution?.jobId)).size).toBe(1);
    expect(active.db.database.prepare("SELECT count(*) count FROM idempotency_records").get()).toEqual({ count: 2 });
  });

  it("replays stored identities through alias and direct recovery despite changed caller metadata", async () => {
    const { db, repository } = setup(); const original = await repository.createRemoteOrReplay(command());
    const alias = await repository.createRemoteOrReplay({ ...command(), requestId: "changed-request", rawRole: "Changed Role" });
    expect(alias.execution).toEqual(original.execution);
    db.database.prepare("DELETE FROM idempotency_records WHERE user_id=? AND mutation_id=?").run("owner-a", "mutation-remote-1");
    const direct = await repository.createRemoteOrReplay(command());
    expect(direct.execution).toEqual(original.execution);
  });

  it("retains the original immutable policy and deadlines when replay policy changes", async () => {
    const { repository } = setup();
    const original = await repository.createRemoteOrReplay(command());
    const changedPolicy = { ...POLICY, cacheDays: 1, maximumMicros: 1 };
    const alias = await repository.createRemoteOrReplay({ ...command(), policy: changedPolicy });
    const active = await repository.createRemoteOrReplay({ ...command("mutation-policy-active", "request-policy-active"), policy: changedPolicy });
    expect(alias.execution).toEqual(original.execution);
    expect(active.execution).toEqual(original.execution);
    expect(alias.execution?.validationContext.expiresAt).toBe("2026-10-15");
    expect(alias.execution?.reservationExpiresAt).toBe(NOW + 1_380_000);
  });

  it("returns the execution for the alias winner when an active-join alias insert loses a race", async () => {
    const { db, repository } = setup();
    const historical = await repository.createRemoteOrReplay(command("mutation-historical", "request-historical"));
    await makeFailed(db, repository, historical);
    const active = await repository.createRemoteOrReplay(command("mutation-active", "request-active"));
    const historicalAlias = db.database.prepare("SELECT response_json FROM idempotency_records WHERE mutation_id=?").get("mutation-historical") as { response_json: string };
    const prepare = db.prepare.bind(db);
    let injected = false;
    db.prepare = ((sql: string) => {
      const statement = prepare(sql);
      if (!sql.startsWith("INSERT INTO idempotency_records")) return statement;
      return {
        bind: (...values: unknown[]) => {
          const bound = statement.bind(...values);
          if (values[3] !== "mutation-race-winner") return bound;
          return {
            run: async () => {
              if (!injected) {
                injected = true;
                db.database.prepare("INSERT INTO idempotency_records (id,user_id,scope,mutation_id,response_json,created_at) VALUES (?,?,?,?,?,?)")
                  .run("manual-race-alias", "owner-a", "role-research", "mutation-race-winner", historicalAlias.response_json, NOW);
              }
              return bound.run();
            },
          } as D1PreparedStatement;
        },
      } as D1PreparedStatement;
    }) as typeof db.prepare;
    const replay = await repository.createRemoteOrReplay(command("mutation-race-winner", "request-race-winner"));
    expect(replay.run.id).toBe(historical.run.id);
    expect(replay.execution?.runId).toBe(historical.run.id);
    expect(replay.execution?.jobId).toBe(historical.execution?.jobId);
    expect(replay.execution?.jobId).not.toBe(active.execution?.jobId);
  });

  it("returns a synchronous active winner with no execution and leaves its classification unchanged", async () => {
    const { repository, executions } = setup();
    const value = command();
    const synchronous = await repository.createOrReplay({
      ownerId: value.ownerId, requestId: value.requestId, mutationId: value.mutationId,
      rawRole: value.rawRole, normalizedRoleKey: value.normalizedRoleKey, locale: value.locale,
      inputFingerprint: value.inputFingerprint, configFingerprint: value.configFingerprint,
      activeExpiresAt: NOW + 60_000,
    });
    const remote = await repository.createRemoteOrReplay(command("mutation-remote-mixed", "request-remote-mixed"));
    expect(remote).toMatchObject({ replayed: true, run: { id: synchronous.run.id, executionMode: "synchronous" }, execution: null });
    await expect(executions.read("owner-a", synchronous.run.id)).resolves.toBeNull();
  });

  it("does not persist an alias when an active remote winner has a corrupt execution", async () => {
    const { db, repository } = setup();
    await repository.createRemoteOrReplay(command("mutation-corrupt-active", "request-corrupt-active"));
    db.database.exec("DROP TRIGGER research_site_executions_identity_immutable");
    db.database.exec("DROP TRIGGER research_site_executions_lifecycle_guard");
    db.database.prepare("UPDATE research_site_executions SET validation_context_json='{}'").run();
    await expect(repository.createRemoteOrReplay(command("mutation-no-orphan", "request-no-orphan"))).rejects
      .toEqual(new ResearchRepositoryError("RESEARCH_UNAVAILABLE"));
    expect(db.database.prepare("SELECT count(*) count FROM idempotency_records WHERE mutation_id=?").get("mutation-no-orphan")).toEqual({ count: 0 });
  });

  it("fails unavailable when an owned remote run has no execution row", async () => {
    const { db, repository, executions } = setup();
    const created = await repository.createRemoteOrReplay(command());
    db.database.prepare("DELETE FROM research_site_executions WHERE run_id=?").run(created.run.id);
    await expect(executions.read("owner-a", created.run.id)).rejects
      .toEqual(new ResearchRepositoryError("RESEARCH_UNAVAILABLE"));
  });

  it.each(["job_id", "request_hash", "job_json", "validation_context_json"])("fails closed for corrupt stored %s", async (column) => {
    const { db, repository } = setup(); const created = await repository.createRemoteOrReplay(command());
    const row = db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?").get(created.run.id) as Record<string, unknown>;
    const replacement = column === "request_hash" ? "0".repeat(64) : column === "job_json" ? "{}" : column === "validation_context_json" ? "{}" : "00000000-0000-4000-8000-000000000999";
    const controlled = {
      prepare(sql: string) {
        if (!sql.includes("FROM research_site_executions")) return db.prepare(sql);
        return { bind: () => ({ first: async () => ({ ...row, [column]: replacement }) }) } as unknown as D1PreparedStatement;
      },
    } as D1Database;
    const executions = new D1SiteExecutionRepository(controlled, repository);
    await expect(executions.read("owner-a", created.run.id)).rejects.toEqual(new ResearchRepositoryError("RESEARCH_UNAVAILABLE"));
  });

  it.each(["missing", "malformed", "unbegun-pair"])(
    "fails closed for a %s stored execution deadline",
    async (kind) => {
      const { db, repository } = setup();
      const created = await repository.createRemoteOrReplay(command());
      const row = db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?")
        .get(created.run.id) as Record<string, unknown>;
      const corrupted = { ...row };
      if (kind === "missing") delete corrupted.execution_expires_at;
      else corrupted.execution_expires_at = kind === "malformed" ? "invalid" : NOW + 1_260_000;
      const controlled = {
        prepare(sql: string) {
          if (!sql.includes("FROM research_site_executions")) return db.prepare(sql);
          return { bind: () => ({ first: async () => corrupted }) } as unknown as D1PreparedStatement;
        },
      } as D1Database;
      const executions = new D1SiteExecutionRepository(controlled, repository);
      await expect(executions.read("owner-a", created.run.id)).rejects
        .toEqual(new ResearchRepositoryError("RESEARCH_UNAVAILABLE"));
    },
  );

  it("requires stored job JSON to equal the canonical parsed codec bytes", async () => {
    const { db, repository } = setup();
    const created = await repository.createRemoteOrReplay(command());
    const row = db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?").get(created.run.id) as Record<string, unknown>;
    const noncanonicalJob = JSON.parse(row.job_json as string) as Record<string, unknown>;
    noncanonicalJob.role = "Ｄａｔａ   Product Manager";
    const jobJson = JSON.stringify(noncanonicalJob, Object.keys(noncanonicalJob).sort());
    const controlled = {
      prepare(sql: string) {
        if (!sql.includes("FROM research_site_executions")) return db.prepare(sql);
        return { bind: () => ({ first: async () => ({ ...row, job_json: jobJson }) }) } as unknown as D1PreparedStatement;
      },
    } as D1Database;
    await expect(new D1SiteExecutionRepository(controlled, repository).read("owner-a", created.run.id))
      .rejects.toEqual(new ResearchRepositoryError("RESEARCH_UNAVAILABLE"));
  });

  it("snapshots caller input before an awaited job hash", async () => {
    const { repository } = setup(); const callerPolicy = { ...POLICY }; const value = { ...command(), policy: callerPolicy }; const point = createControlPoint();
    const digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
    vi.spyOn(globalThis.crypto.subtle, "digest").mockImplementation(async (...args) => { await point.wait(); return digest(...args); });
    const pending = repository.createRemoteOrReplay(value);
    await point.entered;
    value.rawRole = "Mutated Role"; callerPolicy.cacheDays = 1;
    point.resume();
    const created = await pending;
    expect(created.execution?.job.role).toBe("Data Product Manager");
    expect(created.execution?.policy.cacheDays).toBe(30);
  });

  it("snapshots a stored row before the read-path hash await", async () => {
    const { db, repository } = setup();
    const created = await repository.createRemoteOrReplay(command());
    const row = db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?").get(created.run.id) as Record<string, unknown>;
    const controlled = {
      prepare(sql: string) {
        if (!sql.includes("FROM research_site_executions")) return db.prepare(sql);
        return { bind: () => ({ first: async () => row }) } as unknown as D1PreparedStatement;
      },
    } as D1Database;
    const point = createControlPoint();
    const digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
    vi.spyOn(globalThis.crypto.subtle, "digest").mockImplementation(async (...args) => { await point.wait(); return digest(...args); });
    const pending = new D1SiteExecutionRepository(controlled, repository).read("owner-a", created.run.id);
    await point.entered;
    row.job_json = "{}"; row.cache_days = 1;
    point.resume();
    await expect(pending).resolves.toEqual(created.execution);
  });

  it("stores the provider-normalized remote role in both run and job", async () => {
    const { repository } = setup();
    const created = await repository.createRemoteOrReplay({ ...command(), rawRole: "Ｄａｔａ   Product Manager" });
    expect(created.run.rawRole).toBe("Data Product Manager");
    expect(created.execution?.job.role).toBe(created.run.rawRole);
  });

  it("creates a legitimate remote retry with new run, request, and job identities", async () => {
    const { db, repository, setNow } = setup(); const source = await repository.createRemoteOrReplay(command()); await makeFailed(db, repository, source);
    const retried = await repository.createRemoteRetry({ ownerId: "owner-a", runId: source.run.id, requestId: "request-remote-2", mutationId: "mutation-remote-2", currentConfigFingerprint: source.run.configFingerprint, policy: { ...POLICY } });
    expect(retried).toMatchObject({ replayed: false, run: { id: "research-run-3", requestId: "request-remote-2", retryOfRunId: source.run.id }, execution: { jobId: "00000000-0000-4000-8000-000000000002", requestId: "request-remote-2" } });
    await expect(repository.createRemoteRetry({ ownerId: "owner-a", runId: source.run.id, requestId: "request-remote-3", mutationId: "mutation-remote-3", currentConfigFingerprint: fingerprint(["changed"]), policy: POLICY })).rejects.toMatchObject({ code: "CONFLICT" });
    setNow(NOW + 86_400_000);
    const replay = await repository.createRemoteRetry({ ownerId: "owner-a", runId: source.run.id, requestId: "changed-replay-request", mutationId: "mutation-remote-2", currentConfigFingerprint: source.run.configFingerprint, policy: { ...POLICY, cacheDays: 1 } });
    expect(replay.replayed).toBe(true);
    expect(replay.run).toEqual(retried.run);
    expect(replay.execution).toEqual(retried.execution);
  });

  it("validates remote retry source ownership, terminal retryability, and request identity", async () => {
    const active = setup();
    const activeSource = await active.repository.createRemoteOrReplay(command());
    const retry = (overrides: Partial<Parameters<D1ResearchRepository["createRemoteRetry"]>[0]> = {}) => active.repository.createRemoteRetry({
      ownerId: "owner-a",
      runId: activeSource.run.id,
      requestId: "request-retry-validation",
      mutationId: "mutation-retry-validation",
      currentConfigFingerprint: activeSource.run.configFingerprint,
      policy: POLICY,
      ...overrides,
    });
    await expect(retry({ ownerId: "owner-b" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(retry()).rejects.toMatchObject({ code: "CONFLICT" });
    await makeFailed(active.db, active.repository, activeSource, false);
    await expect(retry()).rejects.toMatchObject({ code: "CONFLICT" });

    const retryable = setup();
    const retryableSource = await retryable.repository.createRemoteOrReplay(command());
    await makeFailed(retryable.db, retryable.repository, retryableSource);
    const valid = (overrides: Partial<Parameters<D1ResearchRepository["createRemoteRetry"]>[0]> = {}) => retryable.repository.createRemoteRetry({
      ownerId: "owner-a",
      runId: retryableSource.run.id,
      requestId: "request-retry-validation",
      mutationId: "mutation-retry-validation",
      currentConfigFingerprint: retryableSource.run.configFingerprint,
      policy: POLICY,
      ...overrides,
    });
    await expect(valid({ requestId: retryableSource.run.requestId })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(valid({ currentConfigFingerprint: fingerprint(["stale-config"]) })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("reads the original execution after its remote run becomes terminal", async () => {
    const { db, repository, executions } = setup();
    const created = await repository.createRemoteOrReplay(command());
    await makeFailed(db, repository, created);
    await expect(executions.read("owner-a", created.run.id)).resolves.toEqual(created.execution);
    await expect(repository.createRemoteOrReplay(command())).resolves.toMatchObject({
      replayed: true,
      execution: created.execution,
    });
  });

  it("validates a begun active run against its original began deadline", async () => {
    const { db, repository, executions } = setup();
    const created = await repository.createRemoteOrReplay(command());
    const beganAt = NOW + 1_000;
    db.database.prepare(`UPDATE research_site_executions
      SET admission_state='admitted',version=1,quota_reservation_id=?1,budget_reservation_id=?2,
        admitted_at=?3,began_at=?4,execution_expires_at=?4+1260000,updated_at=?4 WHERE run_id=?5`)
      .run("quota-reservation-1", "budget-reservation-1", NOW + 500, beganAt, created.run.id);
    db.database.prepare("UPDATE research_runs SET state='researching',active_expires_at=?1,updated_at=?2 WHERE id=?3")
      .run(beganAt + 1_260_000, beganAt, created.run.id);
    await expect(executions.read("owner-a", created.run.id)).resolves.toMatchObject({
      beganAt, executionExpiresAt: beganAt + 1_260_000,
    });
    db.database.prepare("UPDATE research_runs SET active_expires_at=?1 WHERE id=?2")
      .run(created.execution!.job.queueExpiresAt, created.run.id);
    await expect(executions.read("owner-a", created.run.id)).rejects
      .toEqual(new ResearchRepositoryError("RESEARCH_UNAVAILABLE"));
  });

  it("accepts a valid durable historical context version snapshot", async () => {
    const { db, repository } = setup();
    const created = await repository.createRemoteOrReplay(command());
    const row = db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?").get(created.run.id) as Record<string, unknown>;
    const context = JSON.parse(row.validation_context_json as string) as Record<string, unknown>;
    context.promptVersion = "research-prompt-v0";
    context.qualityVersion = "research-quality-v0";
    const historical = JSON.stringify(context, Object.keys(context).sort());
    const controlled = {
      prepare(sql: string) {
        if (!sql.includes("FROM research_site_executions")) return db.prepare(sql);
        return { bind: () => ({ first: async () => ({ ...row, validation_context_json: historical }) }) } as unknown as D1PreparedStatement;
      },
    } as D1Database;
    const reader = new D1SiteExecutionRepository(controlled, repository);
    await expect(reader.read("owner-a", created.run.id)).resolves.toMatchObject({
      validationContext: { promptVersion: "research-prompt-v0", qualityVersion: "research-quality-v0" },
    });
  });

  it("normalizes a synchronous source role before creating its remote retry snapshot", async () => {
    const { repository } = setup();
    const base = command("mutation-sync-source", "request-sync-source");
    const source = await repository.createOrReplay({
      ownerId: base.ownerId, requestId: base.requestId, mutationId: base.mutationId,
      rawRole: "Ｄａｔａ   Product Manager", normalizedRoleKey: base.normalizedRoleKey, locale: base.locale,
      inputFingerprint: base.inputFingerprint, configFingerprint: base.configFingerprint,
      activeExpiresAt: NOW + 60_000,
    });
    await repository.transition({ id: source.run.id, ownerId: "owner-a", expectedVersion: 0, from: "queued", to: "failed", retryable: true, errorCode: "service-failed", failureCategory: "service-unavailable" });
    const retried = await repository.createRemoteRetry({ ownerId: "owner-a", runId: source.run.id, requestId: "request-normalized-retry", mutationId: "mutation-normalized-retry", currentConfigFingerprint: source.run.configFingerprint, policy: POLICY });
    expect(retried.run.rawRole).toBe("Data Product Manager");
    expect(retried.execution?.job.role).toBe(retried.run.rawRole);
  });

  it("reopens a file-backed database with the exact original job, context, and deadlines", async () => {
    const dir = mkdtempSync(join(tmpdir(), "site-execution-")); dirs.add(dir);
    const path = join(dir, "research.sqlite");
    const first = setup(path); const created = await first.repository.createRemoteOrReplay(command()); first.db.close(); open.delete(first.db);
    const reopened = new SqliteD1(path); open.add(reopened); reopened.database.exec("PRAGMA foreign_keys = ON");
    const repository = new D1ResearchRepository(reopened as unknown as D1Database, { now: () => NOW + 99_000 });
    const execution = await new D1SiteExecutionRepository(reopened as unknown as D1Database, repository).read("owner-a", created.run.id);
    expect(execution).toEqual(created.execution);
  });
});
