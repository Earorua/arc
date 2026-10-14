import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { D1SiteBridgeRepository } from "../../app/server/research/d1-site-bridge-repository";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { createSiteAdmissionFixture } from "../helpers/site-admission-fixture";
import { createSiteImportFixture } from "../helpers/site-import-fixture";
import { SqliteD1 } from "../helpers/sqlite-d1";

function loseFirstAcceptanceInsertAck(db: D1Database): D1Database {
  let lose = true;
  const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement => ({
    bind: (...values: unknown[]) => wrap(statement.bind(...values), sql),
    first: <T>() => statement.first<T>(),
    all: <T>() => statement.all<T>(),
    run: async () => {
      const result = await statement.run();
      if (lose && sql.includes("INSERT INTO research_site_acceptances")) {
        lose = false;
        throw new Error("lost acceptance insert acknowledgement");
      }
      return result;
    },
  } as D1PreparedStatement);
  return {
    prepare: (sql: string) => wrap(db.prepare(sql), sql),
    batch: (statements: D1PreparedStatement[]) => db.batch(statements),
  } as D1Database;
}

describe("D1SiteBridgeRepository", () => {
  it("resolves ownership locally and records only one exact acceptance", async () => {
    const f = createSiteAdmissionFixture();
    try {
      const created = await f.createRemote();
      const repository = new D1SiteBridgeRepository(f.db as unknown as D1Database, f.research, f.executions);
      const proof = {
        jobId: created.execution.jobId,
        requestHash: created.execution.requestHash,
        workflowId: created.execution.jobId,
        workflowAcceptedAt: created.execution.createdAt + 1,
      } as const;
      const lookup = await repository.lookup({ jobId: proof.jobId, requestHash: proof.requestHash });
      expect(lookup.identity.ownerId).toBe("owner-a");
      await expect(repository.readAcceptance({ ...lookup.identity, ownerId: "owner-b" }))
        .rejects.toMatchObject({ code: "CONFLICT" });
      await expect(repository.recordAcceptance(proof)).resolves.toEqual(proof);
      await expect(repository.recordAcceptance(proof)).resolves.toEqual(proof);
      expect(f.db.database.prepare("SELECT count(*) AS n FROM research_site_acceptances").get())
        .toEqual({ n: 1 });
      await expect(repository.recordAcceptance({ ...proof, workflowAcceptedAt: proof.workflowAcceptedAt + 1 }))
        .rejects.toMatchObject({ code: "CONFLICT" });
    } finally {
      f.db.close();
    }
  });

  it("recovers an acceptance insert whose acknowledgement is lost", async () => {
    const f = createSiteAdmissionFixture();
    try {
      const created = await f.createRemote();
      const repository = new D1SiteBridgeRepository(
        loseFirstAcceptanceInsertAck(f.db as unknown as D1Database), f.research, f.executions,
      );
      const proof = { jobId: created.execution.jobId, requestHash: created.execution.requestHash,
        workflowId: created.execution.jobId, workflowAcceptedAt: created.execution.createdAt + 1 } as const;
      await expect(repository.recordAcceptance(proof)).resolves.toEqual(proof);
      expect(f.db.database.prepare("SELECT count(*) AS n FROM research_site_acceptances").get())
        .toEqual({ n: 1 });
    } finally {
      f.db.close();
    }
  });

  it("scans only admitted unbegun unexpired work and advances the durable cursor", async () => {
    const f = createSiteAdmissionFixture();
    try {
      const first = await f.createRemote();
      const reservations = await f.reserveAdmission(first.execution);
      const admitted = await f.executions.markAdmitted(f.admissionCommand(first.execution, reservations));
      await f.createRemote();
      const repository = new D1SiteBridgeRepository(f.db as unknown as D1Database, f.research, f.executions);
      await expect(repository.nextScan("outbox")).resolves.toMatchObject({ jobId: admitted.jobId });
      await expect(repository.nextScan("outbox")).resolves.toBeNull();
      const cursor = f.db.database.prepare("SELECT after_job_id,version FROM research_site_scan_cursors WHERE name='outbox'").get();
      expect(cursor).toEqual({ after_job_id: null, version: 2 });
    } finally {
      f.db.close();
    }
  });

  it("advances past a corrupt payload before returning a sanitized failure", async () => {
    const f = createSiteAdmissionFixture();
    try {
      const created = await f.createRemote();
      const reservations = await f.reserveAdmission(created.execution);
      const admitted = await f.executions.markAdmitted(f.admissionCommand(created.execution, reservations));
      const repository = new D1SiteBridgeRepository(f.db as unknown as D1Database, f.research, f.executions);
      f.db.database.prepare("UPDATE research_runs SET raw_role='tampered' WHERE id=?1").run(admitted.runId);
      await expect(repository.nextScan("outbox")).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
      expect(f.db.database.prepare(`SELECT after_job_id FROM research_site_scan_cursors
        WHERE name='outbox'`).get()).toEqual({ after_job_id: admitted.jobId });
      f.db.database.prepare("UPDATE research_runs SET raw_role=?1 WHERE id=?2")
        .run(admitted.job.role, admitted.runId);
      await expect(repository.nextScan("outbox")).resolves.toBeNull();
      await expect(repository.nextScan("outbox")).resolves.toMatchObject({ jobId: admitted.jobId });
    } finally {
      f.db.close();
    }
  });

  it("excludes pending, expired, begun, and closed executions from the outbox", async () => {
    const pending = createSiteAdmissionFixture();
    const expired = createSiteAdmissionFixture();
    const begun = await createSiteImportFixture();
    const closed = createSiteAdmissionFixture();
    try {
      await pending.createRemote();

      const expiredCreated = await expired.createRemote();
      const expiredReservations = await expired.reserveAdmission(expiredCreated.execution);
      await expired.executions.markAdmitted(expired.admissionCommand(expiredCreated.execution, expiredReservations));
      expired.setSqlNow(expiredCreated.execution.job.queueExpiresAt);

      const closedCreated = await closed.createRemote();
      await closed.executions.closeBeforeBegin(closed.closeCommand(closedCreated.execution, "interrupted"));

      for (const fixture of [pending, expired, begun, closed]) {
        const repository = new D1SiteBridgeRepository(
          fixture.db as unknown as D1Database, fixture.research, fixture.executions,
        );
        await expect(repository.nextScan("outbox")).resolves.toBeNull();
      }
    } finally {
      pending.db.close();
      expired.db.close();
      begun.db.close();
      closed.db.close();
    }
  });

  it("filters a legacy non-UUID sort key and continues through valid rows and wrap", async () => {
    const directory = mkdtempSync(join(tmpdir(), "site-bridge-legacy-key-"));
    expect(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}`)).toBe(true);
    expect(resolve(directory).split(sep).at(-1)?.startsWith("site-bridge-legacy-key-")).toBe(true);
    const filename = join(directory, "bridge.sqlite");
    const f = createSiteAdmissionFixture(filename);
    let reopened: SqliteD1 | null = null;
    try {
      const first = await f.createRemote("owner-a");
      const second = await f.createRemote("owner-b");
      const source = f.db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?1")
        .get(first.run.id) as Record<string, unknown>;
      const run = f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1")
        .get(first.run.id) as Record<string, unknown>;
      const legacyRun = { ...run, id: "legacy-poison-run", request_id: "legacy-poison-request",
        mutation_id: "legacy-poison-mutation", user_id: "legacy-poison-owner",
        remote_quota_key: "legacy-poison-quota" };
      f.db.database.prepare("INSERT INTO users (id,name,email,email_verified) VALUES (?1,?2,?3,0)")
        .run("legacy-poison-owner", "legacy", "legacy@example.test");
      f.db.database.prepare(`INSERT INTO research_runs (${Object.keys(legacyRun).join(",")})
        VALUES (${Object.keys(legacyRun).map(() => "?").join(",")})`).run(...Object.values(legacyRun) as never[]);
      const badJob = "00000000-0000-0000-0000-000000000001";
      const legacyExecution = { ...source, run_id: legacyRun.id, user_id: legacyRun.user_id,
        request_id: legacyRun.request_id, job_id: badJob, quota_key: legacyRun.remote_quota_key,
        job_json: JSON.stringify({ ...(JSON.parse(source.job_json as string) as Record<string, unknown>),
          jobId: badJob, runId: legacyRun.id, requestId: legacyRun.request_id }) };
      f.db.database.prepare(`INSERT INTO research_site_executions (${Object.keys(legacyExecution).join(",")})
        VALUES (${Object.keys(legacyExecution).map(() => "?").join(",")})`)
        .run(...Object.values(legacyExecution) as never[]);
      f.db.close();
      reopened = new SqliteD1(filename);
      reopened.database.exec("PRAGMA foreign_keys=ON");
      reopened.database.function("unixepoch", { varargs: true }, (...args: unknown[]) => {
        if (args.length === 1 && args[0] === "subsec") return first.execution.createdAt / 1_000;
        return Math.floor(first.execution.createdAt / 1_000);
      });
      const research = new D1ResearchRepository(reopened as unknown as D1Database, {
        now: () => first.execution.createdAt, createId: () => "unused", createJobId: () => crypto.randomUUID(),
      });
      const executions = new D1SiteExecutionRepository(reopened as unknown as D1Database, research);
      const repository = new D1SiteBridgeRepository(reopened as unknown as D1Database, research, executions);
      await expect(repository.nextScan("maintenance")).resolves.toMatchObject({ jobId: first.execution.jobId });
      await expect(repository.nextScan("maintenance")).resolves.toMatchObject({ jobId: second.execution.jobId });
      await expect(repository.nextScan("maintenance")).resolves.toBeNull();
      await expect(repository.nextScan("maintenance")).resolves.toMatchObject({ jobId: first.execution.jobId });
    } finally {
      reopened?.close();
      try { f.db.close(); } catch { /* closed before reopen */ }
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(["00000000-0000-0000-0000-000000000000",
    "ffffffff-ffff-ffff-ffff-ffffffffffff"])(
    "advances the cursor for parser-valid legacy UUID %s before rejecting its corrupt payload",
    async (legacyJob) => {
      const f = createSiteAdmissionFixture();
      try {
        const created = await f.createRemote("owner-a");
        const source = f.db.database.prepare("SELECT * FROM research_site_executions WHERE run_id=?1")
          .get(created.run.id) as Record<string, unknown>;
        const run = f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1")
          .get(created.run.id) as Record<string, unknown>;
        const suffix = legacyJob.startsWith("f") ? "max" : "nil";
        const ownerId = `legacy-${suffix}-owner`;
        const legacyRun = { ...run, id: `legacy-${suffix}-run`, request_id: `legacy-${suffix}-request`,
          mutation_id: `legacy-${suffix}-mutation`, user_id: ownerId,
          remote_quota_key: `legacy-${suffix}-quota` };
        f.db.database.prepare("INSERT INTO users (id,name,email,email_verified) VALUES (?1,?2,?3,0)")
          .run(ownerId, suffix, `${suffix}@example.test`);
        f.db.database.prepare(`INSERT INTO research_runs (${Object.keys(legacyRun).join(",")})
          VALUES (${Object.keys(legacyRun).map(() => "?").join(",")})`).run(...Object.values(legacyRun) as never[]);
        const execution = { ...source, run_id: legacyRun.id, user_id: ownerId,
          request_id: legacyRun.request_id, job_id: legacyJob, quota_key: legacyRun.remote_quota_key,
          job_json: JSON.stringify({ ...(JSON.parse(source.job_json as string) as Record<string, unknown>),
            jobId: legacyJob, runId: legacyRun.id, requestId: legacyRun.request_id }) };
        f.db.database.prepare(`INSERT INTO research_site_executions (${Object.keys(execution).join(",")})
          VALUES (${Object.keys(execution).map(() => "?").join(",")})`).run(...Object.values(execution) as never[]);
        const repository = new D1SiteBridgeRepository(f.db as unknown as D1Database, f.research, f.executions);
        if (legacyJob.startsWith("f")) await repository.nextScan("maintenance");
        await expect(repository.nextScan("maintenance")).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
        expect(f.db.database.prepare(`SELECT after_job_id FROM research_site_scan_cursors
          WHERE name='maintenance'`).get()).toEqual({ after_job_id: legacyJob });
      } finally { f.db.close(); }
    },
  );
});
