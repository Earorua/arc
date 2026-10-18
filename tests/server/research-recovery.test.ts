import { afterEach, describe, expect, it } from "vitest";
import { fingerprint } from "../../app/lib/planning/fingerprint";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { ResearchRepositoryError } from "../../app/server/research/repository";
import { createResearchD1, seedUser } from "../helpers/sqlite-d1";

const databases: ReturnType<typeof createResearchD1>[] = [];

afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
});

describe("research recovery repository", () => {
  it("does not silently turn a remote retry source into a synchronous replacement", async () => {
    const db = createResearchD1(); seedUser(db, "owner-a");
    const repository = new D1ResearchRepository(db as unknown as D1Database, {
      now: () => Date.parse("2026-09-13T00:00:00.000Z"),
      createId: (() => { let id = 0; return () => `recovery-mode-${++id}`; })(),
      createJobId: () => "00000000-0000-4000-8000-000000000001",
    });
    const source = await repository.createRemoteOrReplay({ ownerId: "owner-a", requestId: "request-remote-source", mutationId: "mutation-remote-source", rawRole: "Data Product Manager", normalizedRoleKey: "data product manager", locale: "en-US", inputFingerprint: "p2-00000000000000000000000000000000", configFingerprint: "p2-11111111111111111111111111111111", policy: { cacheDays: 30, userDailyQuota: 3, dailyBudgetMicros: 20_000_000, monthlyBudgetMicros: 100_000_000, maximumMicros: 5_000_000 } });
    db.database.prepare(`UPDATE research_runs SET state='failed',state_version=1,retryable=1,
      active_slot=NULL,active_expires_at=NULL,error_code='service-failed',public_failure_category='service-unavailable',updated_at=?1
      WHERE id=?2 AND execution_mode='cloudflare-workflow-v1'`).run(Date.parse("2026-09-13T00:00:00.000Z"), source.run.id);
    await expect(repository.createRetry({ ownerId: "owner-a", runId: source.run.id, requestId: "request-sync-retry", mutationId: "mutation-sync-retry", activeExpiresAt: Date.parse("2026-09-13T00:01:00.000Z") })).rejects.toMatchObject({ code: "CONFLICT" });
    db.close();
  });
  it("finds the original owner run by its coherent start identity without creating another run", async () => {
    const db = createResearchD1();
    databases.push(db);
    seedUser(db, "owner-a");
    const ids = ["research-run-recovery-1", "research-alias-recovery-1"];
    const repository = new D1ResearchRepository(db as unknown as D1Database, {
      now: () => Date.parse("2026-09-13T00:00:00.000Z"),
      createId: () => ids.shift()!,
    });
    const normalizedRoleKey = "data product manager";
    const inputFingerprint = fingerprint([normalizedRoleKey, "en-US"]);
    const created = await repository.createOrReplay({
      ownerId: "owner-a",
      requestId: "request-recovery-1",
      mutationId: "mutation-recovery-1",
      rawRole: "Data Product Manager",
      normalizedRoleKey,
      locale: "en-US",
      inputFingerprint,
      configFingerprint: "historical-config-1",
      activeExpiresAt: Date.parse("2026-09-13T00:01:00.000Z"),
    });

    const found = await repository.findRecoveryRun({
      ownerId: "owner-a",
      mutationId: created.run.mutationId,
      normalizedRoleKey,
      locale: "en-US",
      inputFingerprint,
      retryOfRunId: null,
    });

    expect(found?.id).toBe(created.run.id);
    expect(db.database.prepare("SELECT count(*) AS n FROM research_runs").get()).toEqual({ n: 1 });
  });

  it("uses the direct owner mutation only when no alias exists and hides identity mismatches", async () => {
    const db = createResearchD1(); databases.push(db); seedUser(db, "owner-a"); seedUser(db, "owner-b");
    let serial = 0;
    const repository = new D1ResearchRepository(db as unknown as D1Database, {
      now: () => Date.parse("2026-09-13T00:00:00.000Z"), createId: () => `recovery-direct-${++serial}`,
    });
    const normalizedRoleKey = "data product manager";
    const inputFingerprint = fingerprint([normalizedRoleKey, "en-US"]);
    const created = await repository.createOrReplay({ ownerId: "owner-a", requestId: "request-direct-1",
      mutationId: "mutation-direct-1", rawRole: "Data Product Manager", normalizedRoleKey, locale: "en-US",
      inputFingerprint, configFingerprint: "historical-config-1", activeExpiresAt: Date.parse("2026-09-13T00:01:00Z") });
    db.database.prepare("DELETE FROM idempotency_records WHERE user_id=? AND mutation_id=?").run("owner-a", "mutation-direct-1");
    const identity = { mutationId: "mutation-direct-1", normalizedRoleKey, locale: "en-US" as const, inputFingerprint, retryOfRunId: null };

    await expect(repository.findRecoveryRun({ ownerId: "owner-a", ...identity })).resolves.toMatchObject({ id: created.run.id });
    await expect(repository.findRecoveryRun({ ownerId: "owner-b", ...identity })).resolves.toBeNull();
    await expect(repository.findRecoveryRun({ ownerId: "owner-a", ...identity, normalizedRoleKey: "other role" })).resolves.toBeNull();
    await expect(repository.findRecoveryRun({ ownerId: "owner-a", ...identity, locale: "zh-CN" })).resolves.toBeNull();
    await expect(repository.findRecoveryRun({ ownerId: "owner-a", ...identity, inputFingerprint: "wrong-input" })).resolves.toBeNull();
    await expect(repository.findRecoveryRun({ ownerId: "owner-a", ...identity, retryOfRunId: "research-source-1" })).resolves.toBeNull();
  });

  it("gives an owned alias precedence and safely rejects malformed owned alias data", async () => {
    const db = createResearchD1(); databases.push(db); seedUser(db, "owner-a");
    let serial = 0;
    const repository = new D1ResearchRepository(db as unknown as D1Database, {
      now: () => Date.parse("2026-09-13T00:00:00.000Z"), createId: () => `recovery-alias-${++serial}`,
    });
    const normalizedRoleKey = "data product manager";
    const inputFingerprint = fingerprint([normalizedRoleKey, "en-US"]);
    await repository.createOrReplay({ ownerId: "owner-a", requestId: "request-alias-1", mutationId: "mutation-alias-1",
      rawRole: "Data Product Manager", normalizedRoleKey, locale: "en-US", inputFingerprint,
      configFingerprint: "historical-config-1", activeExpiresAt: Date.parse("2026-09-13T00:01:00Z") });
    const identity = { ownerId: "owner-a", mutationId: "mutation-alias-1", normalizedRoleKey,
      locale: "en-US" as const, inputFingerprint, retryOfRunId: null };
    const aliasRow = db.database.prepare("SELECT response_json FROM idempotency_records WHERE user_id=? AND mutation_id=?").get("owner-a", "mutation-alias-1") as { response_json: string };
    const mismatchedIntent = { ...JSON.parse(aliasRow.response_json), retryOfRunId: "research-source-1" };
    db.database.prepare("UPDATE idempotency_records SET response_json=? WHERE user_id=? AND mutation_id=?").run(JSON.stringify(mismatchedIntent), "owner-a", "mutation-alias-1");
    await expect(repository.findRecoveryRun(identity)).resolves.toBeNull();

    db.database.prepare("UPDATE idempotency_records SET response_json=? WHERE user_id=? AND mutation_id=?").run('{"runId":', "owner-a", "mutation-alias-1");
    await expect(repository.findRecoveryRun(identity)).rejects.toEqual(new ResearchRepositoryError("RESEARCH_UNAVAILABLE"));
  });

  it("allows a start alias to recover a legally joined retry target and detects target identity corruption", async () => {
    const db = createResearchD1(); databases.push(db); seedUser(db, "owner-a");
    let serial = 0;
    const repository = new D1ResearchRepository(db as unknown as D1Database, {
      now: () => Date.parse("2026-09-13T00:00:00.000Z"), createId: () => `recovery-join-${++serial}`,
    });
    const normalizedRoleKey = "data product manager";
    const inputFingerprint = fingerprint([normalizedRoleKey, "en-US"]);
    const create = (mutationId: string, requestId: string) => repository.createOrReplay({ ownerId: "owner-a", requestId,
      mutationId, rawRole: "Data Product Manager", normalizedRoleKey, locale: "en-US" as const, inputFingerprint,
      configFingerprint: "historical-config-1", activeExpiresAt: Date.parse("2026-09-13T00:01:00Z") });
    const source = await create("mutation-source-1", "request-source-1");
    await repository.transition({ id: source.run.id, ownerId: "owner-a", expectedVersion: 0, from: "queued", to: "failed",
      retryable: true, errorCode: "interrupted", failureCategory: "service-unavailable" });
    const target = await repository.createRetry({ ownerId: "owner-a", requestId: "request-retry-target-1",
      mutationId: "mutation-retry-target-1", runId: source.run.id, activeExpiresAt: Date.parse("2026-09-13T00:01:00Z") });
    const joined = await create("mutation-start-joined-1", "request-start-joined-1");
    expect(joined.run.id).toBe(target.run.id);

    const identity = { ownerId: "owner-a", mutationId: "mutation-start-joined-1", normalizedRoleKey,
      locale: "en-US" as const, inputFingerprint, retryOfRunId: null };
    const before = {
      runs: db.database.prepare("SELECT count(*) AS n FROM research_runs").get(),
      aliases: db.database.prepare("SELECT count(*) AS n FROM idempotency_records").get(),
      audits: db.database.prepare("SELECT count(*) AS n FROM ai_runs").get(),
    };
    await expect(repository.findRecoveryRun(identity)).resolves.toMatchObject({ id: target.run.id, retryOfRunId: source.run.id });
    await expect(repository.findRecoveryRun({
      ...identity, mutationId: "mutation-retry-target-1", retryOfRunId: source.run.id,
    })).resolves.toMatchObject({ id: target.run.id, retryOfRunId: source.run.id });
    expect({
      runs: db.database.prepare("SELECT count(*) AS n FROM research_runs").get(),
      aliases: db.database.prepare("SELECT count(*) AS n FROM idempotency_records").get(),
      audits: db.database.prepare("SELECT count(*) AS n FROM ai_runs").get(),
    }).toEqual(before);

    db.database.prepare("UPDATE research_runs SET input_fingerprint='corrupt-input' WHERE id=?").run(target.run.id);
    await expect(repository.findRecoveryRun(identity)).rejects.toEqual(new ResearchRepositoryError("RESEARCH_UNAVAILABLE"));
  });

  it("recovers a retry alias whose source intent differs from the joined start target", async () => {
    const db = createResearchD1(); databases.push(db); seedUser(db, "owner-a");
    let serial = 0;
    const repository = new D1ResearchRepository(db as unknown as D1Database, {
      now: () => Date.parse("2026-09-13T00:00:00.000Z"), createId: () => `recovery-retry-join-${++serial}`,
    });
    const normalizedRoleKey = "data product manager";
    const inputFingerprint = fingerprint([normalizedRoleKey, "en-US"]);
    const command = (mutationId: string, requestId: string) => ({ ownerId: "owner-a", requestId, mutationId,
      rawRole: "Data Product Manager", normalizedRoleKey, locale: "en-US" as const, inputFingerprint,
      configFingerprint: "historical-config-1", activeExpiresAt: Date.parse("2026-09-13T00:01:00Z") });
    const source = await repository.createOrReplay(command("mutation-source-different-1", "request-source-different-1"));
    await repository.transition({ id: source.run.id, ownerId: "owner-a", expectedVersion: 0, from: "queued", to: "failed",
      retryable: true, errorCode: "interrupted", failureCategory: "service-unavailable" });
    const target = await repository.createOrReplay(command("mutation-start-target-1", "request-start-target-1"));
    expect(target.run.retryOfRunId).toBeNull();
    const joined = await repository.createRetry({ ownerId: "owner-a", requestId: "request-retry-joined-1",
      mutationId: "mutation-retry-joined-1", runId: source.run.id, activeExpiresAt: Date.parse("2026-09-13T00:01:00Z") });
    expect(joined.run.id).toBe(target.run.id);
    expect(joined.run.retryOfRunId).toBeNull();
    const identity = { ownerId: "owner-a", mutationId: "mutation-retry-joined-1", normalizedRoleKey,
      locale: "en-US" as const, inputFingerprint, retryOfRunId: source.run.id };
    const before = {
      runs: db.database.prepare("SELECT count(*) AS n FROM research_runs").get(),
      aliases: db.database.prepare("SELECT count(*) AS n FROM idempotency_records").get(),
      quotas: db.database.prepare("SELECT count(*) AS n FROM quota_ledger").get(),
      costs: db.database.prepare("SELECT count(*) AS n FROM ai_budget_reservations").get(),
      audits: db.database.prepare("SELECT count(*) AS n FROM ai_runs").get(),
    };

    await expect(repository.findRecoveryRun(identity)).resolves.toMatchObject({ id: target.run.id, retryOfRunId: null });
    await expect(repository.findRecoveryRun({ ...identity, retryOfRunId: "recovery-wrong-source" })).resolves.toBeNull();
    expect({
      runs: db.database.prepare("SELECT count(*) AS n FROM research_runs").get(),
      aliases: db.database.prepare("SELECT count(*) AS n FROM idempotency_records").get(),
      quotas: db.database.prepare("SELECT count(*) AS n FROM quota_ledger").get(),
      costs: db.database.prepare("SELECT count(*) AS n FROM ai_budget_reservations").get(),
      audits: db.database.prepare("SELECT count(*) AS n FROM ai_runs").get(),
    }).toEqual(before);
  });
});
