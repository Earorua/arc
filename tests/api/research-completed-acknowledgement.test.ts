// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResearchPackage } from "../../app/contracts/research";
import { canonicalJson, fingerprint } from "../../app/lib/planning/fingerprint";
import { signBridgeMessage } from "../../app/server/research/executor/auth";
import { D1SiteImportPublication } from "../../app/server/research/d1-site-import-publication";
import { createResearchBridgeFixture } from "../helpers/research-bridge-fixture";
import { validReceipt } from "../helpers/site-import-fixture";

type Fixture = Awaited<ReturnType<typeof createResearchBridgeFixture>>;
const fixtures: Fixture[] = [];

async function fixture() {
  const value = await createResearchBridgeFixture();
  fixtures.push(value);
  return value;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0)) { f.db.close(); f.clientDb.close(); }
});

function otherHash(hash: string) { return (hash[0] === "0" ? "1" : "0") + hash.slice(1); }

async function signedComplete(f: Fixture, input: unknown) {
  const body = new TextEncoder().encode(JSON.stringify(input));
  const path = "/api/internal/research-bridge/complete";
  const headers = await signBridgeMessage({ context: { direction: "executor-to-site", kind: "request", method: "POST",
    path, audience: f.connection.siteOrigin, jobId: f.execution.jobId, status: null }, body,
    keyId: f.connection.executorToSite.keyId, keyBytes: f.connection.executorToSite.copyKeyBytes(), now: f.wallNow });
  headers.set("x-arc-bridge-job-id", f.execution.jobId);
  return new Request(`${f.connection.siteOrigin}${path}`, { method: "POST", headers, body });
}

async function prepareIncomplete(f: Fixture, phase: number) {
  const repository = f.newImports();
  const captured = await repository.captureBody(f.identity, validReceipt(f.execution));
  const hash = captured.metadata.receiptHash;
  if (phase >= 1) {
    await f.audits.record(captured.audit);
    await repository.markAudit(f.identity, hash);
  }
  if (phase >= 2) {
    await new D1SiteImportPublication(f.db as unknown as D1Database, f.research, f.executions).resolve(f.identity, hash);
  }
  if (phase >= 3) {
    await f.quota.finalize(f.execution.quotaReservationId!, "accepted", 1);
    await repository.markQuota(f.identity, hash);
  }
  if (phase >= 4) {
    await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, captured.settlement);
    await repository.markBudget(f.identity, hash);
  }
  expect(await repository.read(f.identity)).toMatchObject({ phase });
}

function corruptJournal(f: Fixture, mutate: () => void) {
  // Bypass only this in-memory fixture's write guards to exercise the strict read proof.
  f.db.database.exec("DROP TRIGGER research_site_imports_immutable_guard; DROP TRIGGER research_site_imports_lifecycle_guard");
  mutate();
}

describe("verified completed Site import acknowledgements", () => {
  it("acknowledges completed replay within five seconds at 250 ms per Site D1 roundtrip", async () => {
    const f = await fixture();
    const notice = await f.notice();
    const first = await f.siteClient.complete(f.execution.job, notice);
    const before = f.businessSnapshot();
    const beforeFetches = f.executorFetches();
    const start = f.monoNow();
    let roundtrips = 0;
    let readBatches = 0;
    let insideBatch = false;
    const businessWrites: string[] = [];
    const execute = f.db.execute.bind(f.db);
    const batch = f.db.batch.bind(f.db);
    f.setExecutorEntry(() => { throw new Error("completed replay must not fetch a result"); });
    vi.spyOn(f.db, "execute").mockImplementation((sql, values, mode) => {
      if (!insideBatch) { roundtrips += 1; f.advanceMono(250); }
      if (!/^\s*SELECT\b/iu.test(sql) && !sql.includes("research_bridge_nonces")) businessWrites.push(sql);
      return execute(sql, values, mode);
    });
    vi.spyOn(f.db, "batch").mockImplementation(async (statements) => {
      roundtrips += 1;
      readBatches += 1;
      f.advanceMono(250);
      insideBatch = true;
      try { return await batch(statements); }
      finally { insideBatch = false; }
    });
    let acknowledgement: unknown;
    let failure: unknown;
    try { acknowledgement = await f.siteClient.complete(f.execution.job, notice); }
    catch (error) { failure = error; }
    console.log(JSON.stringify({ diagnostic: "completed-ack-250ms-roundtrip", synthetic: true,
      delayPerRoundtripMs: 250, roundtrips, readBatches, elapsedLogicalMs: f.monoNow() - start,
      failureKind: (failure as { kind?: string } | undefined)?.kind ?? null }));

    expect(failure).toBeUndefined();
    expect(acknowledgement).toEqual(first);
    expect(f.monoNow() - start).toBeLessThan(5000);
    expect(f.executorFetches()).toBe(beforeFetches);
    expect(f.businessSnapshot()).toEqual(before);
    expect(businessWrites).toEqual([]);
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it("returns the same signed acknowledgement without result availability or business writes", async () => {
    const f = await fixture();
    const notice = await f.notice();
    const first = await f.siteClient.complete(f.execution.job, notice);
    const before = f.businessSnapshot();
    const beforeFetches = f.executorFetches();
    const beforeBatches = f.db.batches.length;
    const businessWrites: string[] = [];
    const execute = f.db.execute.bind(f.db);
    vi.spyOn(f.db, "execute").mockImplementation((sql, values, mode) => {
      if (!/^\s*SELECT\b/iu.test(sql) && !sql.includes("research_bridge_nonces")) businessWrites.push(sql);
      return execute(sql, values, mode);
    });
    f.setExecutorEntry(() => { throw new Error("synthetic result unavailable"); });

    await expect(f.siteClient.complete(f.execution.job, notice)).resolves.toEqual(first);

    expect(f.executorFetches()).toBe(beforeFetches);
    expect(f.businessSnapshot()).toEqual(before);
    expect(f.db.batches.slice(beforeBatches).flat().every((sql) => /^\s*SELECT\b/iu.test(sql))).toBe(true);
    expect(businessWrites).toEqual([]);
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it.each([null, 0, 1, 2, 3, 4])("requires a verified remote result for journal phase %s", async (phase) => {
    const f = await fixture();
    const notice = await f.notice();
    if (phase !== null) await prepareIncomplete(f, phase);
    const before = f.businessSnapshot();
    const beforeFetches = f.executorFetches();
    f.setExecutorEntry(() => { throw new Error("synthetic result unavailable"); });

    await expect(f.siteClient.complete(f.execution.job, notice)).rejects.toMatchObject({ kind: "temporary" });
    expect(f.executorFetches()).toBe(beforeFetches + 1);
    expect(f.businessSnapshot()).toEqual(before);

    f.setExecutorEntry(null);
    await expect(f.siteClient.complete(f.execution.job, notice)).resolves.toMatchObject({
      ...notice, accounting: "settled",
    });
    expect(f.executorFetches()).toBe(beforeFetches + 2);
    expect(await f.newImports().read(f.identity)).toMatchObject({ phase: 5, decision: null });
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it.each([0, 1, 2, 3, 4, 5])("rejects a different receipt hash at phase %s before fetching a result", async (phase) => {
    const f = await fixture();
    const notice = await f.notice();
    if (phase === 5) await f.siteClient.complete(f.execution.job, notice);
    else await prepareIncomplete(f, phase);
    const before = f.businessSnapshot();
    const beforeFetches = f.executorFetches();

    await expect(f.siteClient.complete(f.execution.job, { ...notice, receiptHash: otherHash(notice.receiptHash) }))
      .rejects.toMatchObject({ kind: "conflict" });
    expect(f.executorFetches()).toBe(beforeFetches);
    expect(f.businessSnapshot()).toEqual(before);
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it.each([
    { name: "request hash", change: (f: Fixture, notice: Awaited<ReturnType<Fixture["notice"]>>) =>
      ({ ...notice, requestHash: otherHash(f.execution.requestHash) }), status: 409 },
    { name: "job ID", change: (_f: Fixture, notice: Awaited<ReturnType<Fixture["notice"]>>) =>
      ({ ...notice, jobId: "00000000-0000-4000-8000-000000000099" }), status: 409 },
    { name: "caller-supplied owner", change: (_f: Fixture, notice: Awaited<ReturnType<Fixture["notice"]>>) =>
      ({ ...notice, ownerId: "owner-b" }), status: 400 },
  ])("rejects a signed completed notice with the wrong $name", async ({ change, status }) => {
    const f = await fixture();
    const notice = await f.notice();
    await f.siteClient.complete(f.execution.job, notice);
    const before = f.businessSnapshot();
    const beforeFetches = f.executorFetches();

    expect((await f.handler(await signedComplete(f, change(f, notice)))).status).toBe(status);
    expect(f.executorFetches()).toBe(beforeFetches);
    expect(f.businessSnapshot()).toEqual(before);
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it("still requires HMAC authentication and a fresh nonce for an already completed import", async () => {
    const f = await fixture();
    const notice = await f.notice();
    await f.siteClient.complete(f.execution.job, notice);
    const before = f.businessSnapshot();
    const beforeFetches = f.executorFetches();
    const invalid = await signedComplete(f, notice);
    invalid.headers.set("x-arc-bridge-signature", "00".repeat(32));
    expect((await f.handler(invalid)).status).toBe(401);
    const signed = await signedComplete(f, notice);
    const duplicate = new Request(signed.url, { method: "POST", headers: signed.headers, body: JSON.stringify(notice) });
    expect((await f.handler(signed)).status).toBe(200);
    expect((await f.handler(duplicate)).status).toBe(401);
    expect(f.executorFetches()).toBe(beforeFetches);
    expect(f.businessSnapshot()).toEqual(before);
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it.each([
    { name: "publication package", corrupt: (f: Fixture) => {
      const row = f.db.database.prepare("SELECT package_json FROM research_packages").get() as { package_json: string };
      const pack = JSON.parse(row.package_json) as ResearchPackage;
      pack.blueprint.name += " revised";
      const { contentFingerprint: _oldFingerprint, ...content } = pack;
      pack.contentFingerprint = fingerprint(canonicalJson(content));
      f.db.database.prepare("UPDATE research_packages SET package_json=?1,content_fingerprint=?2 WHERE id=?3")
        .run(JSON.stringify(pack), pack.contentFingerprint, pack.id);
    } },
    { name: "audit", corrupt: (f: Fixture) => {
      f.db.database.exec("UPDATE ai_runs SET latency_ms=latency_ms+1 WHERE purpose='role-research'");
    } },
    { name: "quota", corrupt: (f: Fixture) => {
      f.db.database.exec("UPDATE quota_ledger SET entry_kind='rejected',units=0 WHERE entry_kind='accepted'");
    } },
    { name: "original budget maximum", corrupt: (f: Fixture) => {
      f.db.database.exec("UPDATE ai_budget_reservations SET maximum_reserved_micros=maximum_reserved_micros-1");
    } },
    { name: "original budget expiry", corrupt: (f: Fixture) => {
      f.db.database.exec("UPDATE ai_budget_reservations SET expires_at=expires_at-1");
    } },
    { name: "original day bucket", corrupt: (f: Fixture) => {
      f.db.database.exec("UPDATE ai_budget_buckets SET period_start=period_start+86400000 WHERE period_kind='day'");
    } },
    { name: "settlement", corrupt: (f: Fixture) => {
      f.db.database.exec("UPDATE ai_budget_reservations SET settled_micros=settled_micros+1");
    } },
    { name: "terminal version", corrupt: (f: Fixture) => {
      f.db.database.exec("UPDATE research_runs SET state_version=state_version+1");
    } },
    { name: "run owner", corrupt: (f: Fixture) => {
      // Simulate persisted corruption beyond the in-memory database's normal write constraint.
      f.db.database.exec("PRAGMA foreign_keys=OFF");
      f.db.database.exec("UPDATE research_runs SET user_id='owner-b'");
      f.db.database.exec("PRAGMA foreign_keys=ON");
    } },
    { name: "journal request identity", corrupt: (f: Fixture) => corruptJournal(f, () => {
      f.db.database.exec("UPDATE research_site_imports SET request_id='foreign-request'");
    }) },
    { name: "journal frozen grant", corrupt: (f: Fixture) => corruptJournal(f, () => {
      const row = f.db.database.prepare("SELECT receipt_metadata_json FROM research_site_imports")
        .get() as { receipt_metadata_json: string };
      const metadata = JSON.parse(row.receipt_metadata_json);
      metadata.grant.beganAt += 1;
      metadata.grant.executionExpiresAt += 1;
      f.db.database.prepare("UPDATE research_site_imports SET receipt_metadata_json=?1").run(canonicalJson(metadata));
    }) },
  ])("rejects corrupt completed $name proof without fallback to the result endpoint", async ({ corrupt }) => {
    const f = await fixture();
    const notice = await f.notice();
    await f.siteClient.complete(f.execution.job, notice);
    corrupt(f);
    const before = f.businessSnapshot();
    const beforeFetches = f.executorFetches();

    await expect(f.siteClient.complete(f.execution.job, notice)).rejects.toThrow();
    expect(f.executorFetches()).toBe(beforeFetches);
    expect(f.businessSnapshot()).toEqual(before);
    expect(f.syntheticProviderCalls()).toBe(0);
  });

  it.each([1009, 1151])("stays within five seconds with 150 ms Site reads and an unused %s ms result hook", async (nestedResultMs) => {
    const f = await fixture();
    const notice = await f.notice();
    await f.siteClient.complete(f.execution.job, notice);
    const before = f.businessSnapshot();
    const start = f.monoNow();
    let nestedCalls = 0;
    let d1Calls = 0;
    f.setExecutorEntry(() => { nestedCalls += 1; f.advanceMono(nestedResultMs); });
    const execute = f.db.execute.bind(f.db);
    vi.spyOn(f.db, "execute").mockImplementation((...args) => {
      d1Calls += 1;
      f.advanceMono(150);
      return execute(...args);
    });

    await expect(f.siteClient.complete(f.execution.job, notice)).resolves.toMatchObject({ accounting: "settled" });
    expect(nestedCalls).toBe(0);
    expect(f.monoNow() - start).toBeLessThan(5000);
    expect(f.businessSnapshot()).toEqual(before);
    expect(f.syntheticProviderCalls()).toBe(0);
    console.log(JSON.stringify({ diagnostic: "completed-local-proof", synthetic: true,
      perSiteD1Ms: 150, unusedNestedResultMs: nestedResultMs, d1Calls, nestedCalls, elapsedLogicalMs: f.monoNow() - start }));
  });
});
