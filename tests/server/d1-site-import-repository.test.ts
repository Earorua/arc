// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { D1SiteImportRepository, parseSiteImportIdentity } from "../../app/server/research/d1-site-import-repository";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1AiRunSink } from "../../app/server/ai/d1-run-recorder";
import { D1EntitlementRepository } from "../../app/server/entitlements/d1-entitlement-repository";
import { D1ResearchBudgetRepository } from "../../app/server/research/d1-budget-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { parseBridgeReceiptMetadata } from "../../app/server/research/executor/receipt";
import { summarizeBridgeProviderReceipt } from "../../app/server/research/executor/receipt";
import { createControlPoint } from "../helpers/site-admission-fixture";
import { createSiteImportFixture } from "../helpers/site-import-fixture";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import { canonicalJson } from "../../app/lib/planning/fingerprint";
import { hashSiteImportDecision, serializeSiteImportDecision } from "../../app/server/research/site-import-validation";
import { SqliteD1 } from "../helpers/sqlite-d1";

const open: Array<Awaited<ReturnType<typeof createSiteImportFixture>>> = [];
async function fixture() { const value = await createSiteImportFixture(); open.push(value); return value; }
afterEach(() => { for (const value of open.splice(0)) value.db.close(); });
const count = (f: Awaited<ReturnType<typeof fixture>>, table: string) =>
  (f.db.database.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
const effects = (f: Awaited<ReturnType<typeof fixture>>) => Object.fromEntries([
  "ai_runs", "research_packages", "quota_ledger", "ai_budget_reservations", "ai_budget_buckets",
].map((table) => [table, f.db.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
function interposedImports(f: Awaited<ReturnType<typeof fixture>>, beforeMarker: () => void) {
  const original = f.db.prepare.bind(f.db);
  let fired = false;
  const db = { prepare(sql: string) {
    const statement = original(sql);
    if (!sql.includes("UPDATE research_site_imports AS j SET phase=")) return statement;
    return { bind: (...args: unknown[]) => {
      const bound = statement.bind(...args);
      return { run: async () => {
        if (!fired) { fired = true; beforeMarker(); }
        return bound.run();
      } };
    } } as unknown as D1PreparedStatement;
  } } as D1Database;
  return { imports: new D1SiteImportRepository(db, f.research, f.executions), fired: () => fired };
}
async function advanceToFailedPhase2(f: Awaited<ReturnType<typeof fixture>>) {
  const row = f.db.database.prepare("SELECT created_at FROM research_site_imports WHERE run_id=?1")
    .get(f.identity.runId) as { created_at: number };
  const failedAt = row.created_at + 1;
  f.db.database.prepare(`UPDATE research_runs SET state='failed',state_version=state_version+1,
    retryable=1,active_slot=NULL,active_expires_at=NULL,error_code='interrupted',
    public_failure_category='timeout',updated_at=?1 WHERE id=?2`).run(failedAt, f.identity.runId);
  const terminal = await f.research.getRun(f.identity.ownerId, f.identity.runId);
  if (!terminal) throw new Error("missing terminal run");
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(canonicalJson(terminal)))), (value) => value.toString(16).padStart(2, "0")).join("");
  const resolution = { state: "failed", runVersion: terminal.stateVersion, packageId: null,
    terminalHash: digest, quotaStatus: "failed", resolvedAt: failedAt + 1 };
  f.db.database.prepare("UPDATE research_site_imports SET phase=1,version=1,updated_at=?1 WHERE run_id=?2")
    .run(failedAt, f.identity.runId);
  f.db.database.prepare(`UPDATE research_site_imports SET phase=2,version=2,resolution_json=?1,
    updated_at=?2 WHERE run_id=?3`).run(canonicalJson(resolution), failedAt + 1, f.identity.runId);
  f.setSqlNow(failedAt + 1);
  return { resolution, failedAt };
}
async function advanceToSyntheticQualityPhase2(f: Awaited<ReturnType<typeof fixture>>,
  state: "ready" | "needs-review", quality: unknown, candidate: unknown, packageId: string | null) {
  const row = f.db.database.prepare("SELECT created_at FROM research_site_imports WHERE run_id=?1")
    .get(f.identity.runId) as { created_at: number };
  const terminalAt = row.created_at + 1;
  f.db.database.prepare(`UPDATE research_runs SET state=?1,state_version=state_version+1,
    retryable=0,active_slot=NULL,active_expires_at=NULL,package_id=?2,
    quality_json=?3,candidate_json=?4,error_code=NULL,public_failure_category=NULL,
    updated_at=?5 WHERE id=?6`).run(state, packageId, JSON.stringify(quality),
      candidate === null ? null : JSON.stringify(candidate), terminalAt, f.identity.runId);
  const terminal = await f.research.getRun(f.identity.ownerId, f.identity.runId);
  if (!terminal) throw new Error("missing synthetic terminal run");
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(canonicalJson(terminal)))), (value) => value.toString(16).padStart(2, "0")).join("");
  const resolution = { state, runVersion: terminal.stateVersion, packageId,
    terminalHash: digest, quotaStatus: state === "ready" ? "accepted" : "rejected", resolvedAt: terminalAt + 1 };
  f.db.database.prepare("UPDATE research_site_imports SET phase=1,version=1,updated_at=?1 WHERE run_id=?2")
    .run(terminalAt, f.identity.runId);
  f.db.database.prepare(`UPDATE research_site_imports SET phase=2,version=2,resolution_json=?1,
    updated_at=?2 WHERE run_id=?3`).run(canonicalJson(resolution), terminalAt + 1, f.identity.runId);
  f.setSqlNow(terminalAt + 1);
  return resolution;
}
async function setupSyntheticMarkerStage(f: Awaited<ReturnType<typeof fixture>>, target: 3 | 4 | 5) {
  const captured = await f.imports.captureBody(f.identity, f.receipt);
  await f.audits.record(captured.audit);
  await advanceToFailedPhase2(f); // Synthetic terminal stage; publication is covered separately.
  await f.quota.finalize(f.execution.quotaReservationId!, "failed", 0);
  if (target >= 4) await f.imports.markQuota(f.identity, captured.metadata.receiptHash);
  if (target >= 4) await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, captured.settlement);
  if (target >= 5) await f.imports.markBudget(f.identity, captured.metadata.receiptHash);
  return captured;
}
function markerCall(f: Awaited<ReturnType<typeof fixture>>, imports: D1SiteImportRepository,
  target: 3 | 4 | 5, receiptHash: string) {
  return target === 3 ? imports.markQuota(f.identity, receiptHash)
    : target === 4 ? imports.markBudget(f.identity, receiptHash)
      : imports.finish(f.identity, receiptHash);
}

describe("D1 site import journal", () => {
  it("advances the audit marker only after the frozen audit is durable", async () => {
    const f = await fixture();
    const captured = await f.imports.captureBody(f.identity, f.receipt);
    await expect(f.imports.markAudit(f.identity, captured.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect((await f.imports.read(f.identity))?.phase).toBe(0);
    await f.audits.record(captured.audit);
    const marked = await f.imports.markAudit(f.identity, captured.metadata.receiptHash);
    expect(marked).toMatchObject({ phase: 1, version: 1, audit: captured.audit });
    expect(await f.imports.markAudit(f.identity, captured.metadata.receiptHash)).toEqual(marked);
  });

  it.each([
    ["latency_ms=latency_ms+1"],
    ["prompt_version='altered-version'"],
    ["model='altered-model'"],
    ["usage_json='{" + '"charged":false,"modelKnown":true,"usage":null' + "}'"],
  ])("rejects an altered durable audit: %s", async (assignment) => {
    const f = await fixture();
    const captured = await f.imports.captureBody(f.identity, f.receipt);
    await f.audits.record(captured.audit);
    f.db.database.prepare(`UPDATE ai_runs SET ${assignment} WHERE user_id=?1 AND request_id=?2`)
      .run(captured.audit.userId, captured.audit.requestId);
    await expect(f.imports.markAudit(f.identity, captured.metadata.receiptHash)).rejects.toThrow();
    expect((await f.imports.read(f.identity))?.phase).toBe(0);
  });

  it("coalesces concurrent audit markers and recovers a committed marker with lost acknowledgement", async () => {
    const f = await fixture();
    const captured = await f.imports.captureBody(f.identity, f.receipt);
    await f.audits.record(captured.audit);
    const original = f.db.prepare.bind(f.db);
    let writes = 0;
    const db = { prepare(sql: string) {
      const statement = original(sql);
      if (!sql.includes("UPDATE research_site_imports AS j SET phase=1")) return statement;
      return { bind: (...args: unknown[]) => {
        const bound = statement.bind(...args);
        return { run: async () => { writes += 1; await bound.run(); throw new Error("lost acknowledgement"); } };
      } } as unknown as D1PreparedStatement;
    } } as D1Database;
    const uncertain = new D1SiteImportRepository(db, f.research, f.executions);
    const [a, b] = await Promise.all([
      uncertain.markAudit(f.identity, captured.metadata.receiptHash),
      f.newImports().markAudit(f.identity, captured.metadata.receiptHash),
    ]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ phase: 1, version: 1 });
    expect(writes).toBeLessThanOrEqual(1);
  });

  it("does not retry a marker write rejected before commit and resumes on the next call", async () => {
    const f = await fixture();
    const captured = await f.imports.captureBody(f.identity, f.receipt);
    await f.audits.record(captured.audit);
    const original = f.db.prepare.bind(f.db);
    let attempts = 0;
    const db = { prepare(sql: string) {
      const statement = original(sql);
      if (!sql.includes("UPDATE research_site_imports AS j SET phase=1")) return statement;
      return { bind: () => ({ run: async () => {
        attempts += 1; throw new Error("storage rejected before marker commit");
      } }) } as unknown as D1PreparedStatement;
    } } as D1Database;
    const unavailable = new D1SiteImportRepository(db, f.research, f.executions);
    await expect(unavailable.markAudit(f.identity, captured.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(attempts).toBe(1);
    expect((await f.imports.read(f.identity))?.phase).toBe(0);
    expect(await f.imports.markAudit(f.identity, captured.metadata.receiptHash))
      .toMatchObject({ phase: 1, version: 1 });
  });

  it("proves a committed audit effect after its sink loses the write acknowledgement", async () => {
    const f = await fixture();
    const captured = await f.imports.captureBody(f.identity, f.receipt);
    const original = f.db.prepare.bind(f.db);
    let writes = 0;
    const db = { prepare(sql: string) {
      const statement = original(sql);
      if (!sql.includes("INSERT INTO ai_runs")) return statement;
      return { bind: (...args: unknown[]) => {
        const bound = statement.bind(...args);
        return { run: async () => { writes += 1; await bound.run(); throw new Error("lost audit effect ack"); } };
      } } as unknown as D1PreparedStatement;
    } } as D1Database;
    await expect(new D1AiRunSink(db).record(captured.audit)).rejects.toThrow();
    expect(writes).toBe(1);
    expect(await f.imports.markAudit(f.identity, captured.metadata.receiptHash))
      .toMatchObject({ phase: 1 });
    expect(count(f, "ai_runs")).toBe(1);
  });

  it("proves a committed quota effect after finalize loses the write acknowledgement", async () => {
    const f = await fixture();
    const captured = await f.imports.captureBody(f.identity, f.receipt);
    await advanceToFailedPhase2(f); // Synthetic terminal stage; publication is covered separately.
    const original = f.db.prepare.bind(f.db);
    let writes = 0;
    const db = { prepare(sql: string) {
      const statement = original(sql);
      if (!sql.includes("INSERT INTO quota_ledger(id,user_id,purpose,reservation_id,idempotency_key,entry_kind,units,created_at)")) return statement;
      return { bind: (...args: unknown[]) => {
        const bound = statement.bind(...args);
        return { run: async () => { writes += 1; await bound.run(); throw new Error("lost quota effect ack"); } };
      } } as unknown as D1PreparedStatement;
    } } as D1Database;
    await expect(new D1EntitlementRepository(db).finalize(f.execution.quotaReservationId!, "failed", 0))
      .rejects.toThrow();
    expect(writes).toBe(1);
    expect(await f.imports.markQuota(f.identity, captured.metadata.receiptHash))
      .toMatchObject({ phase: 3 });
    const ledger = f.db.database.prepare("SELECT entry_kind,units FROM quota_ledger WHERE reservation_id=?1 ORDER BY entry_kind")
      .all(f.execution.quotaReservationId);
    expect(ledger).toHaveLength(2);
  });

  it("proves a committed budget effect after settle loses the batch acknowledgement", async () => {
    const f = await fixture();
    const captured = await f.imports.captureBody(f.identity, f.receipt);
    await advanceToFailedPhase2(f); // Synthetic terminal stage; publication is covered separately.
    await f.quota.finalize(f.execution.quotaReservationId!, "failed", 0);
    await f.imports.markQuota(f.identity, captured.metadata.receiptHash);
    const originalBatch = f.db.batch.bind(f.db);
    let batches = 0;
    const db = { prepare: f.db.prepare.bind(f.db), batch: async (statements: D1PreparedStatement[]) => {
      batches += 1; await originalBatch(statements); throw new Error("lost budget effect ack");
    } } as unknown as D1Database;
    await expect(new D1ResearchBudgetRepository(db).settle(f.identity.ownerId,
      f.execution.budgetReservationId!, captured.settlement)).rejects.toThrow();
    expect(batches).toBe(1);
    expect(await f.imports.markBudget(f.identity, captured.metadata.receiptHash))
      .toMatchObject({ phase: 4 });
    const reservation = await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!);
    expect(reservation).toMatchObject({ status: "released", settledMicros: 0 });
    const buckets = await Promise.all([reservation!.dayBucketId, reservation!.monthBucketId]
      .map((id) => f.budget.readBucket(id)));
    expect(buckets.map((bucket) => [bucket?.reservedMicros, bucket?.settledMicros]))
      .toEqual([[0, 0], [0, 0]]);
  });

  it("proves terminal quota and budget before markers and clears the decision only after every effect", async () => {
    const f = await fixture();
    const captured = await f.imports.captureBody(f.identity, f.receipt);
    await f.audits.record(captured.audit);
    await advanceToFailedPhase2(f); // Synthetic terminal stage; publication is covered separately.
    const hash = captured.metadata.receiptHash;
    await expect(f.imports.markQuota(f.identity, hash)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect((await f.imports.read(f.identity))?.phase).toBe(2);
    await f.quota.finalize(f.execution.quotaReservationId!, "failed", 0);
    expect(await f.imports.markQuota(f.identity, hash)).toMatchObject({ phase: 3, version: 3 });
    await expect(f.imports.markBudget(f.identity, hash)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    await expect(f.imports.finish(f.identity, hash)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect((await f.imports.read(f.identity))?.decision).not.toBeNull();
    await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, captured.settlement);
    expect(await f.imports.markBudget(f.identity, hash)).toMatchObject({ phase: 4, version: 4 });
    expect(await f.imports.finish(f.identity, hash)).toMatchObject({ phase: 5, version: 5, decision: null });
  });

  it.each([
    ["reservation_id='quota-other'", "entry_kind='reserved'"],
    ["units=2", "entry_kind='reserved'"],
    ["entry_kind='rejected'", "entry_kind='failed'"],
    ["units=1", "entry_kind='failed'"],
  ])("does not mark an altered quota ledger: %s", async (assignment, where) => {
    const f = await fixture();
    const captured = await f.imports.captureBody(f.identity, f.receipt);
    await advanceToFailedPhase2(f); // Synthetic terminal stage; publication is covered separately.
    await f.quota.finalize(f.execution.quotaReservationId!, "failed", 0);
    f.db.database.prepare(`UPDATE quota_ledger SET ${assignment} WHERE reservation_id=?1 AND ${where}`)
      .run(f.execution.quotaReservationId);
    await expect(f.imports.markQuota(f.identity, captured.metadata.receiptHash)).rejects.toThrow();
    expect((await f.imports.read(f.identity))?.phase).toBe(2);
  });

  it("upgrades a conservative hold from the same original reservation to the first actual fee", async () => {
    const f = await fixture();
    const receipt = { ...f.receipt, outcome: { ...f.receipt.outcome, charged: true,
      actualModel: "openrouter/actual", usage: { promptTokens: 100, completionTokens: 200,
        totalTokens: 300, costMicros: 12_345, webSearchRequests: 0 } } };
    const captured = await f.imports.captureBody(f.identity, receipt);
    await advanceToFailedPhase2(f); // Synthetic terminal stage; publication is covered separately.
    await f.quota.finalize(f.execution.quotaReservationId!, "failed", 0);
    await f.imports.markQuota(f.identity, captured.metadata.receiptHash);
    const held = await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, { kind: "unknown" });
    const heldBuckets = await Promise.all([held.dayBucketId, held.monthBucketId].map((id) => f.budget.readBucket(id)));
    expect(heldBuckets.map((bucket) => bucket?.reservedMicros)).toEqual([held.maximumMicros, held.maximumMicros]);
    await expect(f.imports.markBudget(f.identity, captured.metadata.receiptHash)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    const settled = await f.budget.settle(f.identity.ownerId, held.id, captured.settlement);
    expect(settled).toMatchObject({ status: "settled", settledMicros: 12_345 });
    expect(await f.imports.markBudget(f.identity, captured.metadata.receiptHash)).toMatchObject({ phase: 4 });
    const buckets = await Promise.all([held.dayBucketId, held.monthBucketId].map((id) => f.budget.readBucket(id)));
    expect(buckets.map((bucket) => [bucket?.reservedMicros, bucket?.settledMicros])).toEqual([[0, 12_345], [0, 12_345]]);
  });

  it.each([
    { name: "unknown charged", usage: null, status: "conservative-hold", reserved: 5_000_000 },
    { name: "known actual zero", usage: { promptTokens: 0, completionTokens: 0,
      totalTokens: 0, costMicros: 0, webSearchRequests: 0 }, status: "settled", reserved: 0 },
  ] as const)("keeps $name accounting distinct through phase five and replay", async (scenario) => {
    const f = await fixture();
    const receipt = { ...f.receipt, outcome: { ...f.receipt.outcome,
      charged: true, usage: scenario.usage } };
    const captured = await f.imports.captureBody(f.identity, receipt);
    await f.audits.record(captured.audit);
    await advanceToFailedPhase2(f); // Synthetic terminal stage; publication is covered separately.
    await f.quota.finalize(f.execution.quotaReservationId!, "failed", 0);
    await f.imports.markQuota(f.identity, captured.metadata.receiptHash);
    const settled = await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, captured.settlement);
    expect(settled.status).toBe(scenario.status);
    const before = await Promise.all([settled.dayBucketId, settled.monthBucketId].map((id) => f.budget.readBucket(id)));
    expect(before.map((bucket) => [bucket?.reservedMicros, bucket?.settledMicros]))
      .toEqual([[scenario.reserved, 0], [scenario.reserved, 0]]);
    await f.imports.markBudget(f.identity, captured.metadata.receiptHash);
    const complete = await f.imports.finish(f.identity, captured.metadata.receiptHash);
    expect(complete).toMatchObject({ phase: 5, decision: null });
    expect(await f.newImports().finish(f.identity, captured.metadata.receiptHash)).toEqual(complete);
    expect(await Promise.all([settled.dayBucketId, settled.monthBucketId].map((id) => f.budget.readBucket(id))))
      .toEqual(before);
  });

  it.each(["ready", "needs-review"] as const)
  ("finishes a synthetic %s terminal run with ordinary JSON quality bytes", async (state) => {
    const f = await fixture();
    const receipt = { ...f.receipt, outcome: { kind: "response",
      content: JSON.stringify(validResearchCandidate),
      annotations: state === "ready" ? validAnnotations : [], actualModel: "openrouter/actual", usage: null } };
    const captured = await f.imports.captureBody(f.identity, receipt);
    expect(captured.decision?.kind).toBe(state);
    const decision = captured.decision;
    if (!decision || decision.kind === "failed") throw new Error("missing synthetic quality decision");
    const packageId = state === "ready" ? (await f.createFreshCachePackage("owner-b")).package.id : null;
    const candidate = decision.kind === "needs-review" ? decision.candidate : null;
    await f.audits.record(captured.audit);
    await advanceToSyntheticQualityPhase2(f, state, decision.quality, candidate, packageId);
    await f.quota.finalize(f.execution.quotaReservationId!, state === "ready" ? "accepted" : "rejected",
      state === "ready" ? 1 : 0);
    await f.imports.markQuota(f.identity, captured.metadata.receiptHash);
    await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, captured.settlement);
    await f.imports.markBudget(f.identity, captured.metadata.receiptHash);
    expect(await f.imports.finish(f.identity, captured.metadata.receiptHash))
      .toMatchObject({ phase: 5, decision: null, resolution: { state } });
  });

  it.each([{ kind: "not-charged" } as const, { kind: "actual", actualMicros: 999 } as const])
  ("rejects conflicting terminal budget settlement %j", async (wrongSettlement) => {
    const f = await fixture();
    const receipt = { ...f.receipt, outcome: { ...f.receipt.outcome, charged: true,
      actualModel: "openrouter/actual", usage: { promptTokens: 100, completionTokens: 200,
        totalTokens: 300, costMicros: 12_345, webSearchRequests: 0 } } };
    const captured = await f.imports.captureBody(f.identity, receipt);
    await advanceToFailedPhase2(f); // Synthetic terminal stage; publication is covered separately.
    await f.quota.finalize(f.execution.quotaReservationId!, "failed", 0);
    await f.imports.markQuota(f.identity, captured.metadata.receiptHash);
    const wrong = await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, wrongSettlement);
    const before = await Promise.all([wrong.dayBucketId, wrong.monthBucketId].map((id) => f.budget.readBucket(id)));
    await expect(f.imports.markBudget(f.identity, captured.metadata.receiptHash)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect((await f.imports.read(f.identity))?.phase).toBe(3);
    expect(await Promise.all([wrong.dayBucketId, wrong.monthBucketId].map((id) => f.budget.readBucket(id)))).toEqual(before);
  });

  it("does not mark budget after its bucket version becomes unsafe between proof and SQL", async () => {
    const f = await fixture();
    const captured = await f.imports.captureBody(f.identity, f.receipt);
    await advanceToFailedPhase2(f); // Synthetic terminal stage; publication is covered separately.
    await f.quota.finalize(f.execution.quotaReservationId!, "failed", 0);
    await f.imports.markQuota(f.identity, captured.metadata.receiptHash);
    const reservation = await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, captured.settlement);
    const attempted = interposedImports(f, () => f.db.database.prepare(
      "UPDATE ai_budget_buckets SET version=-1 WHERE id=?1").run(reservation.dayBucketId));
    await expect(attempted.imports.markBudget(f.identity, captured.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(attempted.fired()).toBe(true);
    expect((await f.imports.read(f.identity))?.phase).toBe(3);
  });

  it.each([
    ["UPDATE ai_budget_reservations SET created_at=created_at+86400000 WHERE id=?1", "reservation"],
    ["UPDATE ai_budget_buckets SET updated_at=8640000000000001 WHERE id=?1", "day"],
    ["UPDATE ai_budget_buckets SET reserved_micros=9007199254740991,settled_micros=1 WHERE id=?1", "day"],
  ])("keeps phase three when budget proof changes before SQL: %s", async (statement, target) => {
    const f = await fixture();
    const captured = await f.imports.captureBody(f.identity, f.receipt);
    await advanceToFailedPhase2(f); // Synthetic terminal stage; publication is covered separately.
    await f.quota.finalize(f.execution.quotaReservationId!, "failed", 0);
    await f.imports.markQuota(f.identity, captured.metadata.receiptHash);
    const settled = await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, captured.settlement);
    const attempted = interposedImports(f, () => f.db.database.prepare(statement)
      .run(target === "day" ? settled.dayBucketId : settled.id));
    await expect(attempted.imports.markBudget(f.identity, captured.metadata.receiptHash)).rejects.toThrow();
    expect(attempted.fired()).toBe(true);
    expect((await f.imports.read(f.identity))?.phase).toBe(3);
  });

  it("accepts the largest safe bucket version for a read-only marker", async () => {
    const f = await fixture();
    const captured = await f.imports.captureBody(f.identity, f.receipt);
    await advanceToFailedPhase2(f); // Synthetic terminal stage; publication is covered separately.
    await f.quota.finalize(f.execution.quotaReservationId!, "failed", 0);
    await f.imports.markQuota(f.identity, captured.metadata.receiptHash);
    const settled = await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, captured.settlement);
    f.db.database.prepare("UPDATE ai_budget_buckets SET version=9007199254740991 WHERE id=?1")
      .run(settled.dayBucketId);
    expect(await f.imports.markBudget(f.identity, captured.metadata.receiptHash)).toMatchObject({ phase: 4 });
  });

  it("keeps phase four and decision when audit changes between finish proof and SQL", async () => {
    const f = await fixture();
    const captured = await f.imports.captureBody(f.identity, f.receipt);
    await f.audits.record(captured.audit);
    await advanceToFailedPhase2(f); // Synthetic terminal stage; publication is covered separately.
    await f.quota.finalize(f.execution.quotaReservationId!, "failed", 0);
    await f.imports.markQuota(f.identity, captured.metadata.receiptHash);
    await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, captured.settlement);
    await f.imports.markBudget(f.identity, captured.metadata.receiptHash);
    const attempted = interposedImports(f, () => f.db.database.prepare(
      "UPDATE ai_runs SET latency_ms=latency_ms+1 WHERE user_id=?1 AND request_id=?2")
      .run(captured.audit.userId, captured.audit.requestId));
    await expect(attempted.imports.finish(f.identity, captured.metadata.receiptHash))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(attempted.fired()).toBe(true);
    expect((await f.imports.read(f.identity))?.phase).toBe(4);
    expect((await f.imports.read(f.identity))?.decision).not.toBeNull();
  });

  it.each([
    ["UPDATE quota_ledger SET entry_kind='rejected' WHERE reservation_id=?1 AND entry_kind='failed'", "quota"],
    ["UPDATE ai_budget_reservations SET status='conservative-hold' WHERE id=?1", "budget"],
    ["UPDATE research_runs SET retryable=0 WHERE id=?1", "run"],
  ])("keeps the decision when %s changes immediately before finish SQL", async (statement, target) => {
    const f = await fixture();
    const captured = await f.imports.captureBody(f.identity, f.receipt);
    await f.audits.record(captured.audit);
    await advanceToFailedPhase2(f); // Synthetic terminal stage; publication is covered separately.
    await f.quota.finalize(f.execution.quotaReservationId!, "failed", 0);
    await f.imports.markQuota(f.identity, captured.metadata.receiptHash);
    await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, captured.settlement);
    await f.imports.markBudget(f.identity, captured.metadata.receiptHash);
    const targetId = target === "quota" ? f.execution.quotaReservationId
      : target === "budget" ? f.execution.budgetReservationId : f.identity.runId;
    const attempted = interposedImports(f, () => f.db.database.prepare(statement).run(targetId));
    await expect(attempted.imports.finish(f.identity, captured.metadata.receiptHash)).rejects.toThrow();
    expect(attempted.fired()).toBe(true);
    const row = f.db.database.prepare("SELECT phase,decision_json FROM research_site_imports WHERE run_id=?1")
      .get(f.identity.runId) as { phase: number; decision_json: string | null };
    expect(row.phase).toBe(4);
    expect(row.decision_json).not.toBeNull();
  });

  it("rereads the whole journal and quota proof when a terminal effect and marker interleave", async () => {
    const f = await fixture();
    const captured = await f.imports.captureBody(f.identity, f.receipt);
    await advanceToFailedPhase2(f); // Synthetic terminal stage; publication is covered separately.
    const gate = createControlPoint();
    const original = f.db.prepare.bind(f.db);
    let blocked = false;
    let observations = 0;
    const db = { prepare(sql: string) {
      const statement = original(sql);
      if (!sql.includes("FROM quota_ledger WHERE reservation_id=?1 LIMIT 3")) return statement;
      return { bind: (...args: unknown[]) => {
        const bound = statement.bind(...args);
        return { all: async () => {
          const result = await bound.all();
          if (!blocked) { blocked = true; await gate.wait(); }
          return result;
        } };
      } } as unknown as D1PreparedStatement;
    } } as D1Database;
    const runs = { getRun: async (ownerId: string, runId: string) => {
      observations += 1; return f.research.getRun(ownerId, runId);
    } };
    const racing = new D1SiteImportRepository(db, runs, f.executions);
    const pending = racing.markQuota(f.identity, captured.metadata.receiptHash);
    await gate.entered;
    await f.quota.finalize(f.execution.quotaReservationId!, "failed", 0);
    await f.imports.markQuota(f.identity, captured.metadata.receiptHash);
    gate.resume();
    await expect(pending).resolves.toMatchObject({ phase: 3, version: 3 });
    expect(observations).toBe(2);
  });

  it("rereads the whole journal and budget proof when settlement and marker interleave", async () => {
    const f = await fixture();
    const captured = await f.imports.captureBody(f.identity, f.receipt);
    await advanceToFailedPhase2(f); // Synthetic terminal stage; publication is covered separately.
    await f.quota.finalize(f.execution.quotaReservationId!, "failed", 0);
    await f.imports.markQuota(f.identity, captured.metadata.receiptHash);
    const gate = createControlPoint();
    const original = f.db.prepare.bind(f.db);
    let blocked = false;
    let observations = 0;
    const db = { prepare(sql: string) {
      const statement = original(sql);
      if (!sql.includes("SELECT r.*, u.user_id AS owner_id")) return statement;
      return { bind: (...args: unknown[]) => {
        const bound = statement.bind(...args);
        return { first: async () => {
          const result = await bound.first();
          if (!blocked) { blocked = true; await gate.wait(); }
          return result;
        } };
      } } as unknown as D1PreparedStatement;
    } } as D1Database;
    const runs = { getRun: async (ownerId: string, runId: string) => {
      observations += 1; return f.research.getRun(ownerId, runId);
    } };
    const racing = new D1SiteImportRepository(db, runs, f.executions);
    const pending = racing.markBudget(f.identity, captured.metadata.receiptHash);
    await gate.entered;
    await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, captured.settlement);
    await f.imports.markBudget(f.identity, captured.metadata.receiptHash);
    gate.resume();
    await expect(pending).resolves.toMatchObject({ phase: 4, version: 4 });
    expect(observations).toBe(2);
  });

  it.each([3, 4, 5] as const)
  ("makes one %i marker write attempt before commit and resumes from the durable effect", async (target) => {
    const f = await fixture();
    const captured = await setupSyntheticMarkerStage(f, target);
    const before = effects(f);
    const original = f.db.prepare.bind(f.db);
    let attempts = 0;
    const db = { prepare(sql: string) {
      const statement = original(sql);
      if (!sql.includes(`UPDATE research_site_imports AS j SET phase=${target}`)) return statement;
      return { bind: () => ({ run: async () => {
        attempts += 1; throw new Error("marker rejected before commit");
      } }) } as unknown as D1PreparedStatement;
    } } as D1Database;
    const interrupted = new D1SiteImportRepository(db, f.research, f.executions);
    await expect(markerCall(f, interrupted, target, captured.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(attempts).toBe(1);
    expect((await f.imports.read(f.identity))?.phase).toBe(target - 1);
    expect(effects(f)).toEqual(before);
    expect(await markerCall(f, f.imports, target, captured.metadata.receiptHash))
      .toMatchObject({ phase: target, version: target });
    expect(effects(f)).toEqual(before);
  });

  it.each([3, 4, 5] as const)
  ("recovers a committed %i marker after its acknowledgement is lost", async (target) => {
    const f = await fixture();
    const captured = await setupSyntheticMarkerStage(f, target);
    const before = effects(f);
    const original = f.db.prepare.bind(f.db);
    let attempts = 0;
    const db = { prepare(sql: string) {
      const statement = original(sql);
      if (!sql.includes(`UPDATE research_site_imports AS j SET phase=${target}`)) return statement;
      return { bind: (...args: unknown[]) => {
        const bound = statement.bind(...args);
        return { run: async () => {
          attempts += 1; await bound.run(); throw new Error("marker committed but acknowledgement lost");
        } };
      } } as unknown as D1PreparedStatement;
    } } as D1Database;
    const interrupted = new D1SiteImportRepository(db, f.research, f.executions);
    expect(await markerCall(f, interrupted, target, captured.metadata.receiptHash))
      .toMatchObject({ phase: target, version: target });
    expect(attempts).toBe(1);
    expect(await markerCall(f, f.newImports(), target, captured.metadata.receiptHash))
      .toMatchObject({ phase: target, version: target });
    expect(effects(f)).toEqual(before);
  });

  it.each([3, 4, 5] as const)
  ("coalesces concurrent %i markers without changing the accounting effects", async (target) => {
    const f = await fixture();
    const captured = await setupSyntheticMarkerStage(f, target);
    const before = effects(f);
    const [first, second] = await Promise.all([
      markerCall(f, f.imports, target, captured.metadata.receiptHash),
      markerCall(f, f.newImports(), target, captured.metadata.receiptHash),
    ]);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ phase: target, version: target });
    expect(effects(f)).toEqual(before);
  });
  it("captures the first original receipt once at phase zero without effects", async () => {
    const f = await fixture();
    const before = effects(f);
    const first = await f.imports.captureBody(f.identity, f.receipt);
    expect(first).toMatchObject({ phase: 0, version: 0, mode: "body",
      metadata: { outcome: { kind: "error", code: "timeout" } } });
    expect(await f.newImports().captureBody(f.identity, f.receipt)).toEqual(first);
    expect(count(f, "research_site_imports")).toBe(1);
    expect(effects(f)).toEqual(before);
  });

  it("conflicts on another receipt hash or altered canonical metadata", async () => {
    const f = await fixture();
    await f.imports.captureBody(f.identity, f.receipt);
    await expect(f.imports.captureBody(f.identity, { ...f.receipt, latencyMs: 124 }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    const metadata = await f.metadata();
    await expect(f.imports.captureMetadata(f.identity, { ...metadata, receiptHash: "f".repeat(64) }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(count(f, "research_site_imports")).toBe(1);
  });

  it("snapshots identity and receipt before awaiting storage and never invokes accessors", async () => {
    const f = await fixture();
    let touched = false;
    const unsafe = Object.defineProperty({ ...f.identity }, "jobId", { enumerable: true,
      get: () => { touched = true; return f.identity.jobId; } });
    expect(() => parseSiteImportIdentity(unsafe)).toThrowError("RESEARCH_UNAVAILABLE");
    expect(touched).toBe(false);
    let receiptGetterTouched = false;
    const unsafeReceipt = Object.defineProperty({ ...f.receipt }, "outcome", { enumerable: true,
      get: () => { receiptGetterTouched = true; return f.receipt.outcome; } });
    await expect(f.imports.captureBody(f.identity, unsafeReceipt))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(receiptGetterTouched).toBe(false);
    const gate = createControlPoint();
    const runs = { getRun: async (ownerId: string, runId: string) => {
      await gate.wait(); return f.research.getRun(ownerId, runId);
    } };
    const imports = new D1SiteImportRepository(f.db as unknown as D1Database, runs, f.executions);
    const receipt = structuredClone(f.receipt);
    const identity = { ...f.identity };
    const pending = imports.captureBody(identity, receipt);
    await gate.entered;
    receipt.outcome.code = "rate";
    identity.requestId = "mutated-later";
    gate.resume();
    await expect(pending).resolves.toMatchObject({ metadata: { outcome: { code: "timeout" } } });
    expect(touched).toBe(false);
  });

  it("allows response metadata at SQL deadline equality but not before it", async () => {
    const f = await fixture();
    const metadata = parseBridgeReceiptMetadata({ ...await f.metadata(), receiptHash: "a".repeat(64),
      outcome: { kind: "response", actualModel: "openrouter/actual", usage: null } });
    f.setSqlNow(f.execution.executionExpiresAt! - 1);
    await expect(f.imports.captureMetadata(f.identity, metadata))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(count(f, "research_site_imports")).toBe(0);
    f.setSqlNow(f.execution.executionExpiresAt!);
    const saved = await f.imports.captureMetadata(f.identity, metadata);
    expect(saved).toMatchObject({ mode: "metadata-only", phase: 0, decision: {
      kind: "failed", errorCode: "interrupted", failureCategory: "timeout" },
    audit: { status: "failed", errorCode: "unavailable", charged: true } });
    expect(await f.imports.captureMetadata(f.identity, metadata)).toEqual(saved);
  });

  it("replays body-first response metadata before deadline without changing the local decision", async () => {
    const f = await fixture();
    const receipt = { ...f.receipt, outcome: { kind: "response", content: JSON.stringify(validResearchCandidate),
      annotations: validAnnotations, actualModel: "openrouter/actual", usage: null } };
    const body = await f.imports.captureBody(f.identity, receipt);
    expect(body.decision?.kind).toBe("ready");
    const metadata = await summarizeBridgeProviderReceipt(receipt);
    expect(await f.imports.captureMetadata(f.identity, metadata)).toEqual(body);
    await expect(f.imports.captureMetadata(f.identity, { ...metadata, latencyMs: metadata.latencyMs + 1 }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(count(f, "research_site_imports")).toBe(1);
  });

  it("keeps metadata-first failed decision when the matching full body arrives later", async () => {
    const f = await fixture();
    const receipt = { ...f.receipt, outcome: { kind: "response", content: JSON.stringify(validResearchCandidate),
      annotations: validAnnotations, actualModel: "openrouter/actual", usage: null } };
    const metadata = await summarizeBridgeProviderReceipt(receipt);
    f.setSqlNow(f.execution.executionExpiresAt!);
    const first = await f.imports.captureMetadata(f.identity, metadata);
    expect(first.decision).toMatchObject({ kind: "failed", errorCode: "interrupted" });
    expect(await f.imports.captureBody(f.identity, receipt)).toEqual(first);
    expect(count(f, "research_site_imports")).toBe(1);
  });

  it("permits metadata-only fee capture for an already-failed unexpired run without rewriting it", async () => {
    const f = await fixture();
    const metadata = parseBridgeReceiptMetadata({ ...await f.metadata(), receiptHash: "b".repeat(64),
      outcome: { kind: "response", actualModel: "openrouter/actual", usage: {
        promptTokens: 1, completionTokens: 2, totalTokens: 3, costMicros: 42, webSearchRequests: 0 } } });
    f.db.database.prepare(`UPDATE research_runs SET state='failed',state_version=state_version+1,
      retryable=1,active_slot=NULL,active_expires_at=NULL,error_code='interrupted',
      public_failure_category='timeout',updated_at=?1 WHERE id=?2`)
      .run(f.execution.beganAt! + 1, f.identity.runId);
    f.setSqlNow(f.execution.beganAt! + 2);
    const beforeRun = f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1").get(f.identity.runId);
    const beforeEffects = effects(f);
    const saved = await f.imports.captureMetadata(f.identity, metadata);
    expect(saved).toMatchObject({ mode: "metadata-only", settlement: { kind: "actual", actualMicros: 42 } });
    expect(f.db.database.prepare("SELECT * FROM research_runs WHERE id=?1").get(f.identity.runId)).toEqual(beforeRun);
    expect(effects(f)).toEqual(beforeEffects);
  });

  it("reconstructs error metadata and refuses a declared hash mismatch", async () => {
    const f = await fixture();
    const metadata = await f.metadata();
    await expect(f.imports.captureMetadata(f.identity, { ...metadata, receiptHash: "f".repeat(64) }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(count(f, "research_site_imports")).toBe(0);
    const saved = await f.imports.captureMetadata(f.identity, metadata);
    expect(saved.mode).toBe("body");
    expect(await f.imports.captureBody(f.identity, f.receipt)).toEqual(saved);
  });

  it("retries one transient incoherent observation and fails closed on persistent contradiction", async () => {
    const f = await fixture();
    let observations = 0;
    const transient = { getRun: async (ownerId: string, runId: string) => {
      observations += 1;
      const run = await f.research.getRun(ownerId, runId);
      return observations === 1 && run ? { ...run, configFingerprint: "other-config" } : run;
    } };
    const imports = new D1SiteImportRepository(f.db as unknown as D1Database, transient, f.executions);
    await expect(imports.captureBody(f.identity, f.receipt)).resolves.toMatchObject({ phase: 0 });
    expect(observations).toBe(3); // two before insert, one confirmation read
    const broken = { getRun: async (ownerId: string, runId: string) => {
      const run = await f.research.getRun(ownerId, runId);
      return run ? { ...run, configFingerprint: "other-config" } : run;
    } };
    await expect(new D1SiteImportRepository(f.db as unknown as D1Database, broken, f.executions).read(f.identity))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("rereads a complete context once after a terminal commit crosses the run and journal reads", async () => {
    const f = await fixture();
    await f.imports.captureBody(f.identity, f.receipt);
    const gate = createControlPoint();
    let observations = 0;
    const runs = { getRun: async (ownerId: string, runId: string) => {
      observations += 1;
      const snapshot = await f.research.getRun(ownerId, runId);
      if (observations === 1) await gate.wait();
      return snapshot;
    } };
    const imports = new D1SiteImportRepository(f.db as unknown as D1Database, runs, f.executions);
    const pending = imports.read(f.identity);
    await gate.entered;
    const { resolution } = await advanceToFailedPhase2(f);
    gate.resume();
    await expect(pending).resolves.toMatchObject({ phase: 2, resolution });
    expect(observations).toBe(2);
  });

  it("rejects a stored decision digest or canonical metadata change", async () => {
    const f = await fixture();
    await f.imports.captureBody(f.identity, f.receipt);
    f.db.database.exec("DROP TRIGGER research_site_imports_immutable_guard");
    f.db.database.exec("DROP TRIGGER research_site_imports_lifecycle_guard");
    f.db.database.prepare("UPDATE research_site_imports SET decision_hash=?1 WHERE run_id=?2")
      .run("f".repeat(64), f.identity.runId);
    await expect(f.imports.read(f.identity)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it.each(["receipt_hash", "version", "receipt_metadata_json"])("rejects corrupted stored %s", async (column) => {
    const f = await fixture();
    await f.imports.captureBody(f.identity, f.receipt);
    f.db.database.exec("DROP TRIGGER research_site_imports_immutable_guard");
    f.db.database.exec("DROP TRIGGER research_site_imports_lifecycle_guard");
    const value = column === "version" ? 1 : column === "receipt_hash" ? "f".repeat(64)
      : canonicalJson({ ...await f.metadata(), latencyMs: 999 });
    f.db.database.prepare(`UPDATE research_site_imports SET ${column}=?1 WHERE run_id=?2`)
      .run(value, f.identity.runId);
    await expect(f.imports.read(f.identity)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it.each(["validation_context_json", "audit_json", "settlement_json"])("rejects corrupted stored %s", async (column) => {
    const f = await fixture();
    const saved = await f.imports.captureBody(f.identity, f.receipt);
    const value = column === "validation_context_json"
      ? canonicalJson({ ...saved.validationContext, packageId: "research-package-other" })
      : column === "audit_json" ? canonicalJson({ ...saved.audit, latencyMs: saved.audit.latencyMs + 1 })
        : canonicalJson({ kind: "unknown" });
    f.db.database.exec("DROP TRIGGER research_site_imports_immutable_guard");
    f.db.database.exec("DROP TRIGGER research_site_imports_lifecycle_guard");
    f.db.database.prepare(`UPDATE research_site_imports SET ${column}=?1 WHERE run_id=?2`)
      .run(value, f.identity.runId);
    await expect(f.imports.read(f.identity)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("reads a valid deep Ready decision without shrinking package depth", async () => {
    const f = await fixture();
    const receipt = { ...f.receipt, outcome: { kind: "response", content: JSON.stringify(validResearchCandidate),
      annotations: validAnnotations, actualModel: "openrouter/actual", usage: null } };
    const saved = await f.imports.captureBody(f.identity, receipt);
    expect(saved.decision?.kind).toBe("ready");
    expect((await f.imports.read(f.identity))?.decision).toEqual(saved.decision);
  });

  it("recovers the exact inserted row after a committed INSERT loses its acknowledgement", async () => {
    const f = await fixture();
    const original = f.db.prepare.bind(f.db);
    let inserts = 0;
    const db = { prepare(sql: string) {
      const statement = original(sql);
      if (!sql.includes("INSERT INTO research_site_imports")) return statement;
      inserts += 1;
      return { bind: (...args: unknown[]) => {
        const bound = statement.bind(...args);
        return { run: async () => { await bound.run(); throw new Error("lost acknowledgement"); } };
      } } as unknown as D1PreparedStatement;
    } } as D1Database;
    const imports = new D1SiteImportRepository(db, f.research, f.executions);
    const first = await imports.captureBody(f.identity, f.receipt);
    expect(first).toMatchObject({ phase: 0, mode: "body" });
    expect(inserts).toBe(1);
    expect(count(f, "research_site_imports")).toBe(1);
    expect(await f.newImports().captureBody(f.identity, f.receipt)).toEqual(first);
  });

  it("coalesces concurrent first captures to one immutable row and no effects", async () => {
    const f = await fixture();
    const before = effects(f);
    const [a, b] = await Promise.all([
      f.imports.captureBody(f.identity, f.receipt), f.newImports().captureBody(f.identity, f.receipt),
    ]);
    expect(a).toEqual(b);
    expect(count(f, "research_site_imports")).toBe(1);
    expect(effects(f)).toEqual(before);
  });

  it("makes one INSERT attempt then fails closed if storage rejects before commit", async () => {
    const f = await fixture();
    const before = effects(f);
    const original = f.db.prepare.bind(f.db);
    let attempts = 0;
    const db = { prepare(sql: string) {
      const statement = original(sql);
      if (!sql.includes("INSERT INTO research_site_imports")) return statement;
      attempts += 1;
      const rejected = { bind: () => ({ run: async () => { throw new Error("storage rejected before commit"); } }) };
      return rejected as unknown as D1PreparedStatement;
    } } as D1Database;
    const imports = new D1SiteImportRepository(db, f.research, f.executions);
    await expect(imports.captureBody(f.identity, f.receipt)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(attempts).toBe(1);
    expect(count(f, "research_site_imports")).toBe(0);
    expect(effects(f)).toEqual(before);
  });

  it("replays the saved journal through a fresh SQLite connection", async () => {
    const dir = mkdtempSync(join(tmpdir(), "site-import-"));
    const path = join(dir, "journal.sqlite");
    let first: Awaited<ReturnType<typeof createSiteImportFixture>> | null = null;
    let reopened: SqliteD1 | null = null;
    try {
      first = await createSiteImportFixture(path);
      const saved = await first.imports.captureBody(first.identity, first.receipt);
      const identity = first.identity;
      const receipt = first.receipt;
      first.db.close(); first = null;
      reopened = new SqliteD1(path);
      reopened.database.exec("PRAGMA foreign_keys=ON");
      const db = reopened as unknown as D1Database;
      const research = new D1ResearchRepository(db);
      const executions = new D1SiteExecutionRepository(db, research);
      const imports = new D1SiteImportRepository(db, research, executions);
      expect(await imports.captureBody(identity, receipt)).toEqual(saved);
      expect((reopened.database.prepare("SELECT count(*) AS n FROM research_site_imports").get() as { n: number }).n).toBe(1);
    } finally {
      if (reopened) reopened.close();
      if (first) first.db.close();
      const target = resolve(dir);
      if (!target.startsWith(`${resolve(tmpdir())}${sep}`) || !basename(target).startsWith("site-import-"))
        throw new Error("Refusing to remove an unexpected fixture directory");
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("rejects foreign, mismatched and unbegun identities without creating a journal", async () => {
    const f = await fixture();
    await expect(f.imports.read({ ...f.identity, runId: "research-run-missing" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(f.imports.captureBody({ ...f.identity, ownerId: "owner-b" }, f.receipt))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(f.imports.captureBody({ ...f.identity, requestId: "another-request" }, f.receipt))
      .rejects.toMatchObject({ code: "CONFLICT" });
    await expect(f.imports.captureBody({ ...f.identity, jobId: "11111111-1111-4111-8111-111111111111" }, f.receipt))
      .rejects.toMatchObject({ code: "CONFLICT" });
    await expect(f.imports.captureBody({ ...f.identity, requestHash: "f".repeat(64) }, f.receipt))
      .rejects.toMatchObject({ code: "CONFLICT" });
    const pending = await f.createRemote("owner-b");
    const pendingIdentity = { ownerId: pending.execution.ownerId, runId: pending.execution.runId,
      requestId: pending.execution.requestId, jobId: pending.execution.jobId,
      requestHash: pending.execution.requestHash };
    await expect(f.imports.captureBody(pendingIdentity, f.receipt))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(count(f, "research_site_imports")).toBe(0);
  });

  it("does not attach imports to synchronous or admitted unbegun runs", async () => {
    const f = await fixture();
    const synchronous = await f.research.createOrReplay(f.command("owner-b"));
    await expect(f.imports.captureBody({ ...f.identity, ownerId: "owner-b", runId: synchronous.run.id,
      requestId: synchronous.run.requestId }, f.receipt))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    const g = await fixture();
    const pending = await g.createRemote("owner-b");
    const reservations = await g.reserveAdmission(pending.execution);
    const admitted = await g.executions.markAdmitted(g.admissionCommand(pending.execution, reservations));
    await expect(g.imports.captureBody({ ownerId: admitted.ownerId, runId: admitted.runId,
      requestId: admitted.requestId, jobId: admitted.jobId, requestHash: admitted.requestHash }, g.receipt))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(count(f, "research_site_imports")).toBe(0);
    expect(count(g, "research_site_imports")).toBe(0);
  });

  it("does not attach an import to a cached closure", async () => {
    const f = await fixture();
    const cached = await f.createFreshCachePackage("owner-b");
    const pending = await f.createRemote("owner-b");
    const closed = await f.research.attachRemoteCachedPackage({ ownerId: pending.execution.ownerId,
      runId: pending.execution.runId, requestId: pending.execution.requestId,
      jobId: pending.execution.jobId, requestHash: pending.execution.requestHash,
      expectedRunVersion: pending.run.stateVersion, expectedExecutionVersion: pending.execution.version,
      package: cached.package });
    await expect(f.imports.captureBody({ ownerId: closed.execution.ownerId, runId: closed.execution.runId,
      requestId: closed.execution.requestId, jobId: closed.execution.jobId,
      requestHash: closed.execution.requestHash }, f.receipt))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(count(f, "research_site_imports")).toBe(0);
  });

  it("rejects a recomputed but substituted error decision", async () => {
    const f = await fixture();
    await f.imports.captureBody(f.identity, f.receipt);
    const decision = { kind: "failed", quality: null, errorCode: "rate",
      failureCategory: "rate-limited", retryable: true };
    f.db.database.exec("DROP TRIGGER research_site_imports_immutable_guard");
    f.db.database.exec("DROP TRIGGER research_site_imports_lifecycle_guard");
    f.db.database.prepare("UPDATE research_site_imports SET decision_json=?1,decision_hash=?2 WHERE run_id=?3")
      .run(serializeSiteImportDecision(decision, f.execution.validationContext),
        await hashSiteImportDecision(decision, f.execution.validationContext), f.identity.runId);
    await expect(f.imports.read(f.identity)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("validates terminal resolution and original accepted audit after decision cleanup", async () => {
    const f = await fixture();
    const receipt = { ...f.receipt, outcome: { kind: "response", content: JSON.stringify(validResearchCandidate),
      annotations: validAnnotations, actualModel: "openrouter/actual", usage: null } };
    const captured = await f.imports.captureBody(f.identity, receipt);
    expect(captured.audit.status).toBe("accepted");
    const { resolution, failedAt } = await advanceToFailedPhase2(f);
    for (const phase of [3, 4, 5]) f.db.database.prepare(`UPDATE research_site_imports
      SET phase=?1,version=?1,decision_json=CASE WHEN ?1=5 THEN NULL ELSE decision_json END,
      updated_at=?2 WHERE run_id=?3`).run(phase, failedAt + phase, f.identity.runId);
    const completed = await f.imports.read(f.identity);
    expect(completed).toMatchObject({ phase: 5, decision: null, audit: { status: "accepted" }, resolution });
    f.db.database.exec("DROP TRIGGER research_site_imports_immutable_guard");
    f.db.database.exec("DROP TRIGGER research_site_imports_lifecycle_guard");
    for (const altered of [
      { ...resolution, terminalHash: "f".repeat(64) },
      { ...resolution, quotaStatus: "accepted" },
      { ...resolution, resolvedAt: captured.createdAt - 1 },
    ]) {
      f.db.database.prepare("UPDATE research_site_imports SET resolution_json=?1 WHERE run_id=?2")
        .run(canonicalJson(altered), f.identity.runId);
      await expect(f.imports.read(f.identity)).rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    }
  });
});
