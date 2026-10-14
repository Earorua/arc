// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { D1SiteImportPublication } from "../../app/server/research/d1-site-import-publication";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";
import { createSiteImportFixture } from "../helpers/site-import-fixture";
import { canonicalJson, fingerprint } from "../../app/lib/planning/fingerprint";
import { normalizedPackageInserts } from "../../app/server/research/d1-publication";
import type { ResearchPackage } from "../../app/contracts/research";
import { researchCandidateSchema } from "../../app/contracts/research";

const open: Array<Awaited<ReturnType<typeof createSiteImportFixture>>> = [];
async function fixture() { const value = await createSiteImportFixture(); open.push(value); return value; }
afterEach(() => { for (const value of open.splice(0)) value.db.close(); });
type Fixture = Awaited<ReturnType<typeof fixture>>;
const tables = ["role_blueprints", "role_blueprint_versions", "role_skill_definitions",
  "role_skill_edges", "learning_resources", "resource_skill_links", "research_packages",
  "research_source_audits"] as const;
function normalized(f: Fixture) {
  return Object.fromEntries(tables.map((table) => [table,
    (f.db.database.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n]));
}
function accounting(f: Fixture) {
  return Object.fromEntries(["quota_ledger", "ai_budget_reservations", "ai_budget_buckets"].map((table) =>
    [table, f.db.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}
async function phase1(f: Fixture, kind: "ready" | "needs-review" | "error" = "ready") {
  const receipt = kind === "error" ? f.receipt : { ...f.receipt, outcome: { kind: "response",
    content: JSON.stringify(validResearchCandidate), annotations: kind === "ready" ? validAnnotations : [],
    actualModel: "openrouter/actual", usage: null } };
  const captured = await f.imports.captureBody(f.identity, receipt);
  expect(captured.decision?.kind).toBe(kind === "error" ? "failed" : kind);
  await f.audits.record(captured.audit);
  const marked = await f.imports.markAudit(f.identity, captured.metadata.receiptHash);
  expect(marked.phase).toBe(1);
  return marked;
}
function publication(f: Fixture) {
  return new D1SiteImportPublication(f.db as unknown as D1Database, f.research, f.executions);
}
function fanoutCandidate() {
  const candidate = researchCandidateSchema.parse(validResearchCandidate);
  const resource = candidate.resources[0]!;
  const base = candidate.unitTemplates[0]!;
  candidate.skills = Array.from({ length: 64 }, (_, index) => ({
    ...candidate.skills[0]!, id: `s${index}`, name: `Skill ${index}`,
    why: "Needed for work", masteryCriteria: ["Can explain it", "Can practice it"],
    resourceIds: [resource.id] }));
  candidate.prerequisiteEdges = candidate.skills.flatMap((skill, index) =>
    candidate.skills.slice(0, index).map((prerequisite) => ({
      skillId: skill.id, prerequisiteSkillId: prerequisite.id })));
  candidate.resources = [{ ...resource, skillIds: candidate.skills.map((skill) => skill.id) }];
  candidate.stages = [{ ...candidate.stages[0]!, skillIds: candidate.skills.map((skill) => skill.id) }];
  candidate.unitTemplates = candidate.skills.flatMap((skill) =>
    (["learn", "calibrate", "reinforce"] as const).map((kind) => ({
      ...base, id: `${skill.id}-${kind}`, skillId: skill.id, kind,
      title: "Unit", objective: "Learn", whyNow: "Now", buildTask: "Do it",
      completionCriteria: ["Done"], proofRequirement: "Proof", rubric: ["Pass"],
      primaryResourceId: resource.id, alternativeResourceIds: [],
      steps: [{ id: `${skill.id}-${kind}-step`, label: "Do", minutes: 60 }],
      checkpoints: [], estimatedMinutes: 60 })));
  candidate.evidence = candidate.skills.map((skill) => ({
    id: `${skill.id}-evidence`, skillId: skill.id, resourceId: resource.id }));
  return candidate;
}
async function seedExistingPackage(f: Fixture, marked: Awaited<ReturnType<typeof phase1>>) {
  if (marked.decision?.kind !== "ready") throw new Error("missing ready package");
  const run = await f.research.getRun(f.identity.ownerId, f.identity.runId);
  if (!run) throw new Error("missing run");
  const inserts = normalizedPackageInserts(marked.decision.package, run, marked.updatedAt,
    (sql, values) => f.db.prepare(`${sql} WHERE 1`).bind(...values));
  await f.db.batch(inserts);
}

function replaceBudgetBucketId(f: Fixture, bucket: "day" | "month", replacement: string) {
  const column = `${bucket}_bucket_id`;
  const row = f.db.database.prepare(`SELECT ${column} AS id FROM ai_budget_reservations WHERE id=?1`)
    .get(f.execution.budgetReservationId) as { id: string };
  f.db.database.exec("BEGIN");
  try {
    f.db.database.exec("PRAGMA defer_foreign_keys=ON");
    f.db.database.prepare("UPDATE ai_budget_buckets SET id=?1 WHERE id=?2").run(replacement, row.id);
    f.db.database.prepare(`UPDATE ai_budget_reservations SET ${column}=?1 WHERE id=?2`)
      .run(replacement, f.execution.budgetReservationId);
    f.db.database.exec("COMMIT");
  } catch (error) {
    f.db.database.exec("ROLLBACK");
    throw error;
  }
  expect(f.db.database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
}

async function publicationState(f: Fixture) {
  return {
    run: await f.research.getRun(f.identity.ownerId, f.identity.runId),
    journal: await f.imports.read(f.identity),
    normalized: normalized(f),
    accounting: accounting(f),
  };
}

describe("D1 site import publication", () => {
  it("publishes a locally validated, audited Ready receipt in one atomic batch", async () => {
    const f = await fixture();
    const captured = await phase1(f);
    const before = accounting(f);
    const execution = await f.executions.read(f.identity.ownerId, f.identity.runId);
    const result = await publication(f).resolve(f.identity, captured.metadata.receiptHash);
    expect(result).toMatchObject({ phase: 2, version: 2, resolution: { state: "ready", quotaStatus: "accepted",
      packageId: captured.decision?.kind === "ready" ? captured.decision.package.id : null } });
    expect(normalized(f)).toEqual({ role_blueprints: 1, role_blueprint_versions: 1,
      role_skill_definitions: validResearchCandidate.skills.length,
      role_skill_edges: validResearchCandidate.prerequisiteEdges.length,
      learning_resources: validResearchCandidate.resources.length,
      resource_skill_links: validResearchCandidate.resources.reduce((sum, resource) => sum + resource.skillIds.length, 0),
      research_packages: 1, research_source_audits: validResearchCandidate.resources.length });
    expect(accounting(f)).toEqual(before);
    expect(await f.executions.read(f.identity.ownerId, f.identity.runId)).toEqual(execution);
    expect(f.db.batches.at(-1)).toHaveLength(12);
  });

  it("rolls back every normalized table and terminal fact when any batch statement fails", async () => {
    for (let statement = 0; statement < 12; statement++) {
      const f = await fixture();
      const marked = await phase1(f);
      const beforeAccounting = accounting(f);
      const beforeRun = await f.research.getRun(f.identity.ownerId, f.identity.runId);
      f.db.failAtBatchStatement = statement;
      await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
        .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
      f.db.failAtBatchStatement = null;
      expect(Object.values(normalized(f)).every((value) => value === 0)).toBe(true);
      expect(accounting(f)).toEqual(beforeAccounting);
      expect(await f.research.getRun(f.identity.ownerId, f.identity.runId)).toEqual(beforeRun);
      expect((await f.imports.read(f.identity))?.phase).toBe(1);
    }
  });

  it.each([["needs-review", "needs-review", "rejected"], ["error", "failed", "failed"]] as const)
  ("resolves a %s decision without normalized rows", async (kind, state, quotaStatus) => {
    const f = await fixture();
    const marked = await phase1(f, kind);
    const before = accounting(f);
    const result = await publication(f).resolve(f.identity, marked.metadata.receiptHash);
    expect(result.resolution).toMatchObject({ state, quotaStatus, packageId: null });
    expect(Object.values(normalized(f)).every((value) => value === 0)).toBe(true);
    expect(accounting(f)).toEqual(before);
    expect(f.db.batches.at(-1)).toHaveLength(4);
  });

  it("resolves actual malformed response content as a safe failed decision", async () => {
    const f = await fixture();
    const receipt = { ...f.receipt, outcome: { kind: "response", content: "{bad-json",
      annotations: [], actualModel: "openrouter/actual", usage: null } };
    const captured = await f.imports.captureBody(f.identity, receipt);
    expect(captured.decision).toMatchObject({ kind: "failed", failureCategory: "invalid-result" });
    await f.audits.record(captured.audit);
    const marked = await f.imports.markAudit(f.identity, captured.metadata.receiptHash);
    const result = await publication(f).resolve(f.identity, marked.metadata.receiptHash);
    expect(result.resolution).toMatchObject({ state: "failed", quotaStatus: "failed", packageId: null });
    expect(Object.values(normalized(f)).every((value) => value === 0)).toBe(true);
  });

  it("resolves an already expired Ready decision as interrupted without package writes", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    f.setSqlNow(f.execution.executionExpiresAt!);
    const result = await publication(f).resolve(f.identity, marked.metadata.receiptHash);
    expect(result.resolution).toMatchObject({ state: "failed", quotaStatus: "failed", packageId: null });
    expect(await f.research.getRun(f.identity.ownerId, f.identity.runId)).toMatchObject({
      state: "failed", errorCode: "interrupted", failureCategory: "timeout", retryable: true,
      quality: null, candidate: null, packageId: null });
    expect(Object.values(normalized(f)).every((value) => value === 0)).toBe(true);
    expect(f.db.batches.at(-1)).toHaveLength(4);
  });

  it.each(["quota", "budget-bucket"] as const)
  ("does not turn a corrupt original %s reservation into a timeout verdict", async (kind) => {
    const f = await fixture();
    const marked = await phase1(f);
    f.setSqlNow(f.execution.executionExpiresAt!);
    if (kind === "quota") f.db.database.prepare(`UPDATE quota_ledger SET units=0
      WHERE reservation_id=?1 AND entry_kind='reserved'`).run(f.execution.quotaReservationId);
    else f.db.database.prepare(`UPDATE ai_budget_buckets SET period_start=period_start+86400000
      WHERE id=(SELECT day_bucket_id FROM ai_budget_reservations WHERE id=?1)`)
      .run(f.execution.budgetReservationId);
    await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect((await f.imports.read(f.identity))?.phase).toBe(1);
    expect((await f.research.getRun(f.identity.ownerId, f.identity.runId))?.state).toBe("researching");
  });

  it.each([
    ["released", { kind: "not-charged" }],
    ["conservative-hold", { kind: "unknown" }],
    ["settled", { kind: "actual", actualMicros: 1_000 }],
  ] as const)
  ("permits valid late %s budget structure after reservation expiry", async (status, settlement) => {
    const f = await fixture();
    const marked = await phase1(f);
    const saved = await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, settlement);
    expect(saved.status).toBe(status);
    f.setSqlNow(f.execution.reservationExpiresAt + 1);
    const result = await publication(f).resolve(f.identity, marked.metadata.receiptHash);
    expect(result.resolution).toMatchObject({ state: "failed", quotaStatus: "failed" });
    expect(Object.values(normalized(f)).every((value) => value === 0)).toBe(true);
  });

  it.each(["expired", "preserved-failed"] as const)
  ("preserves a real settled fee above the original reserve on the %s path", async (path) => {
    const f = await fixture();
    const receipt = { ...f.receipt, outcome: { kind: "response", content: JSON.stringify(validResearchCandidate),
      annotations: validAnnotations, actualModel: "openrouter/actual", usage: {
        promptTokens: 100, completionTokens: 200, totalTokens: 300,
        costMicros: 6_000_000, webSearchRequests: 0 } } };
    const captured = await f.imports.captureBody(f.identity, receipt);
    expect(captured.decision?.kind).toBe("ready");
    expect(captured.settlement).toEqual({ kind: "actual", actualMicros: 6_000_000 });
    await f.audits.record(captured.audit);
    const marked = await f.imports.markAudit(f.identity, captured.metadata.receiptHash);
    const settled = await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, marked.settlement);
    expect(settled).toMatchObject({ maximumMicros: 5_000_000, status: "settled", settledMicros: 6_000_000 });
    if (path === "expired") f.setSqlNow(f.execution.executionExpiresAt!);
    else f.db.database.prepare(`UPDATE research_runs SET state='failed',state_version=state_version+1,
      retryable=1,active_slot=NULL,active_expires_at=NULL,error_code='interrupted',
      public_failure_category='timeout' WHERE id=?1`).run(f.identity.runId);
    const beforeAccounting = accounting(f);
    const beforeRun = await f.research.getRun(f.identity.ownerId, f.identity.runId);
    const result = await publication(f).resolve(f.identity, marked.metadata.receiptHash);
    expect(result).toMatchObject({ phase: 2, resolution: { state: "failed", packageId: null } });
    expect(accounting(f)).toEqual(beforeAccounting);
    expect(Object.values(normalized(f)).every((value) => value === 0)).toBe(true);
    if (path === "preserved-failed") expect(await f.research.getRun(f.identity.ownerId, f.identity.runId)).toEqual(beforeRun);
    else expect((await f.research.getRun(f.identity.ownerId, f.identity.runId))?.state).toBe("failed");
  });

  it.each(["expired", "preserved-failed"] as const)
  ("permits intact late conservative-hold accounting on the %s path", async (path) => {
    const f = await fixture();
    const marked = await phase1(f);
    expect((await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!,
      { kind: "unknown" })).status).toBe("conservative-hold");
    if (path === "expired") f.setSqlNow(f.execution.executionExpiresAt!);
    else f.db.database.prepare(`UPDATE research_runs SET state='failed',state_version=state_version+1,
      retryable=1,active_slot=NULL,active_expires_at=NULL,error_code='interrupted',
      public_failure_category='timeout' WHERE id=?1`).run(f.identity.runId);
    const before = accounting(f);
    const result = await publication(f).resolve(f.identity, marked.metadata.receiptHash);
    expect(result).toMatchObject({ phase: 2, resolution: { state: "failed", packageId: null } });
    expect(accounting(f)).toEqual(before);
    expect(Object.values(normalized(f)).every((value) => value === 0)).toBe(true);
  });

  it("reads safe maximum original bucket versions while resolving an expired receipt", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    f.db.database.prepare(`UPDATE ai_budget_buckets SET version=?1 WHERE id IN
      (SELECT day_bucket_id FROM ai_budget_reservations WHERE id=?2 UNION
       SELECT month_bucket_id FROM ai_budget_reservations WHERE id=?2)`)
      .run(Number.MAX_SAFE_INTEGER, f.execution.budgetReservationId);
    f.setSqlNow(f.execution.executionExpiresAt!);
    const before = accounting(f);
    expect((await publication(f).resolve(f.identity, marked.metadata.receiptHash)).resolution)
      .toMatchObject({ state: "failed", packageId: null });
    expect(accounting(f)).toEqual(before);
    expect(Object.values(normalized(f)).every((value) => value === 0)).toBe(true);
  });

  it.each([
    ["day", "before-read", "expired", ""],
    ["month", "before-batch", "expired", `month-bucket\u00a0`],
    ["day", "before-batch", "ready", "x".repeat(161)],
    ["month", "before-read", "preserved-failed", "month-bucket "],
  ] as const)
  ("rejects malformed original %s bucket identity %s on the %s path",
    async (bucket, timing, path, replacement) => {
      const f = await fixture();
      const marked = await phase1(f);
      if (path === "expired") f.setSqlNow(f.execution.executionExpiresAt!);
      if (path === "preserved-failed") f.db.database.prepare(`UPDATE research_runs SET
        state='failed',state_version=state_version+1,retryable=1,active_slot=NULL,
        active_expires_at=NULL,error_code='interrupted',public_failure_category='timeout'
        WHERE id=?1`).run(f.identity.runId);
      let corruptedState: Awaited<ReturnType<typeof publicationState>> | null = null;
      if (timing === "before-read") {
        replaceBudgetBucketId(f, bucket, replacement);
        corruptedState = await publicationState(f);
      } else {
        const batch = f.db.batch.bind(f.db);
        f.db.batch = async (statements) => {
          replaceBudgetBucketId(f, bucket, replacement);
          corruptedState = await publicationState(f);
          return batch(statements);
        };
      }
      await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
        .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
      expect(corruptedState).not.toBeNull();
      expect(await publicationState(f)).toEqual(corruptedState);
      expect(Object.values(normalized(f)).every((count) => count === 0)).toBe(true);
    });

  it("rejects a bucket identity changed after the strict reservation read", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    const beforeRun = await f.research.getRun(f.identity.ownerId, f.identity.runId);
    const beforeJournal = await f.imports.read(f.identity);
    const execute = f.db.execute.bind(f.db);
    let corruptedAccounting: ReturnType<typeof accounting> | null = null;
    let corruptedNormalized: ReturnType<typeof normalized> | null = null;
    let changed = false;
    f.db.execute = (sql, values, mode) => {
      const result = execute(sql, values, mode);
      if (!changed && mode === "get"
        && sql.includes("SELECT r.*, u.user_id AS owner_id")
        && sql.includes("WHERE r.id=?1 AND u.user_id=?2")) {
        changed = true;
        replaceBudgetBucketId(f, "day", "day-bucket ");
        corruptedAccounting = accounting(f);
        corruptedNormalized = normalized(f);
      }
      return result;
    };
    await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(corruptedAccounting).not.toBeNull();
    expect(corruptedNormalized).not.toBeNull();
    expect(await f.research.getRun(f.identity.ownerId, f.identity.runId)).toEqual(beforeRun);
    expect(await f.imports.read(f.identity)).toEqual(beforeJournal);
    expect(accounting(f)).toEqual(corruptedAccounting);
    expect(normalized(f)).toEqual(corruptedNormalized);
  });

  it("accepts a valid 160 UTF-16 unit Unicode original bucket identity", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    const replacement = "💠".repeat(80);
    expect(replacement).toHaveLength(160);
    replaceBudgetBucketId(f, "day", replacement);
    expect(await f.budget.readReservation(f.identity.ownerId, f.execution.budgetReservationId!))
      .toMatchObject({ dayBucketId: replacement });
    const before = accounting(f);
    expect((await publication(f).resolve(f.identity, marked.metadata.receiptHash)).resolution)
      .toMatchObject({ state: "ready" });
    expect(accounting(f)).toEqual(before);
    expect(normalized(f).research_packages).toBe(1);
  });

  it.each(["expired", "preserved-failed"] as const)
  ("rejects uncovered late conservative-hold buckets on the %s path before read and batch", async (path) => {
    for (const bucket of ["day", "month"] as const) for (const timing of ["before-read", "before-batch"] as const) {
      const f = await fixture();
      const marked = await phase1(f);
      expect((await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!,
        { kind: "unknown" })).status).toBe("conservative-hold");
      if (path === "expired") f.setSqlNow(f.execution.executionExpiresAt!);
      else f.db.database.prepare(`UPDATE research_runs SET state='failed',state_version=state_version+1,
        retryable=1,active_slot=NULL,active_expires_at=NULL,error_code='interrupted',
        public_failure_category='timeout' WHERE id=?1`).run(f.identity.runId);
      const corrupt = () => f.db.database.prepare(`UPDATE ai_budget_buckets SET reserved_micros=0
        WHERE id=(SELECT ${bucket}_bucket_id FROM ai_budget_reservations WHERE id=?1)`)
        .run(f.execution.budgetReservationId);
      let beforeAccounting: ReturnType<typeof accounting> | null = null;
      if (timing === "before-read") { corrupt(); beforeAccounting = accounting(f); }
      else { const batch = f.db.batch.bind(f.db); f.db.batch = async (statements) => {
        corrupt(); beforeAccounting = accounting(f); return batch(statements);
      }; }
      const beforeRun = await f.research.getRun(f.identity.ownerId, f.identity.runId);
      await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
        .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
      expect(await f.research.getRun(f.identity.ownerId, f.identity.runId)).toEqual(beforeRun);
      expect((await f.imports.read(f.identity))?.phase).toBe(1);
      expect(Object.values(normalized(f)).every((value) => value === 0)).toBe(true);
      expect(beforeAccounting).not.toBeNull();
      expect(accounting(f)).toEqual(beforeAccounting);
    }
  });

  it.each([
    ["day", "created_at", -1, "expired"],
    ["day", "updated_at", 1.5, "preserved-failed"],
    ["month", "created_at", 8_640_000_000_000_001, "preserved-failed"],
    ["month", "updated_at", -1, "expired"],
  ] as const)
  ("rejects malformed original %s %s=%s on the %s path before read and batch",
    async (bucket, column, value, path) => {
      for (const timing of ["before-read", "before-batch"] as const) {
        const f = await fixture();
        const marked = await phase1(f);
        if (path === "expired") f.setSqlNow(f.execution.executionExpiresAt!);
        else f.db.database.prepare(`UPDATE research_runs SET state='failed',state_version=state_version+1,
          retryable=1,active_slot=NULL,active_expires_at=NULL,error_code='interrupted',
          public_failure_category='timeout' WHERE id=?1`).run(f.identity.runId);
        const corrupt = () => f.db.database.prepare(`UPDATE ai_budget_buckets SET ${column}=?1
          WHERE id=(SELECT ${bucket}_bucket_id FROM ai_budget_reservations WHERE id=?2)`)
          .run(value, f.execution.budgetReservationId);
        let beforeAccounting: ReturnType<typeof accounting> | null = null;
        if (timing === "before-read") { corrupt(); beforeAccounting = accounting(f); }
        else { const batch = f.db.batch.bind(f.db); f.db.batch = async (statements) => {
          corrupt(); beforeAccounting = accounting(f); return batch(statements);
        }; }
        const beforeRun = await f.research.getRun(f.identity.ownerId, f.identity.runId);
        await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
          .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
        expect(await f.research.getRun(f.identity.ownerId, f.identity.runId)).toEqual(beforeRun);
        expect((await f.imports.read(f.identity))?.phase).toBe(1);
        expect(Object.values(normalized(f)).every((count) => count === 0)).toBe(true);
        expect(beforeAccounting).not.toBeNull();
        expect(accounting(f)).toEqual(beforeAccounting);
      }
    });

  it.each(["quota", "budget-bucket"] as const)
  ("rolls back timeout if original %s accounting corrupts after observation", async (kind) => {
    const f = await fixture();
    const marked = await phase1(f);
    f.setSqlNow(f.execution.executionExpiresAt!);
    const original = f.db.batch.bind(f.db);
    f.db.batch = async (statements) => {
      if (kind === "quota") f.db.database.prepare(`UPDATE quota_ledger SET units=0
        WHERE reservation_id=?1 AND entry_kind='reserved'`).run(f.execution.quotaReservationId);
      else f.db.database.prepare(`UPDATE ai_budget_buckets SET period_start=period_start+86400000
        WHERE id=(SELECT day_bucket_id FROM ai_budget_reservations WHERE id=?1)`)
        .run(f.execution.budgetReservationId);
      return original(statements);
    };
    await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect((await f.imports.read(f.identity))?.phase).toBe(1);
    expect((await f.research.getRun(f.identity.ownerId, f.identity.runId))?.state).toBe("researching");
  });

  it("fails closed on corrupt original quota before publishing a local provider failure", async () => {
    const f = await fixture();
    const marked = await phase1(f, "error");
    f.db.database.prepare(`UPDATE quota_ledger SET units=0
      WHERE reservation_id=?1 AND entry_kind='reserved'`).run(f.execution.quotaReservationId);
    await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect((await f.imports.read(f.identity))?.phase).toBe(1);
    f.db.database.prepare(`UPDATE quota_ledger SET units=1
      WHERE reservation_id=?1 AND entry_kind='reserved'`).run(f.execution.quotaReservationId);
    expect((await publication(f).resolve(f.identity, marked.metadata.receiptHash)).resolution?.state)
      .toBe("failed");
  });

  it("replays a completed Ready terminal after both deadline and cache expiry", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    const saved = await publication(f).resolve(f.identity, marked.metadata.receiptHash);
    const batches = f.db.batches.length;
    f.setSqlNow(Date.parse("2026-11-01T00:00:00.000Z"));
    expect(await publication(f).resolve(f.identity, marked.metadata.receiptHash)).toEqual(saved);
    expect(f.db.batches).toHaveLength(batches);
  });

  it("binds an already failed run unchanged when recording phase 2", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    f.db.database.prepare(`UPDATE research_runs SET state='failed',state_version=state_version+1,
      retryable=1,active_slot=NULL,active_expires_at=NULL,error_code='interrupted',
      public_failure_category='timeout' WHERE id=?1`).run(f.identity.runId);
    const before = await f.research.getRun(f.identity.ownerId, f.identity.runId);
    const result = await publication(f).resolve(f.identity, marked.metadata.receiptHash);
    expect(result.resolution).toMatchObject({ state: "failed", runVersion: before?.stateVersion });
    expect(await f.research.getRun(f.identity.ownerId, f.identity.runId)).toEqual(before);
    expect(f.db.batches.at(-1)).toHaveLength(2);
  });

  it.each(["run", "journal"] as const)
  ("rolls back all package rows when the final %s CAS changes zero rows", async (target) => {
    const f = await fixture();
    const marked = await phase1(f);
    const before = accounting(f);
    f.db.database.exec(target === "run"
      ? `CREATE TRIGGER cancel_publication BEFORE UPDATE ON research_runs
        WHEN NEW.state='ready' BEGIN SELECT RAISE(IGNORE); END`
      : `CREATE TRIGGER cancel_publication BEFORE UPDATE ON research_site_imports
        WHEN NEW.phase=2 BEGIN SELECT RAISE(IGNORE); END`);
    await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(Object.values(normalized(f)).every((value) => value === 0)).toBe(true);
    expect((await f.imports.read(f.identity))?.phase).toBe(1);
    expect((await f.research.getRun(f.identity.ownerId, f.identity.runId))?.state).toBe("researching");
    expect(accounting(f)).toEqual(before);
  });

  it.each(["before-batch", "after-inserts"] as const)
  ("does not publish when SQL time crosses the deadline %s", async (timing) => {
    const f = await fixture();
    const marked = await phase1(f);
    const end = f.execution.executionExpiresAt!;
    if (timing === "before-batch") {
      const original = f.db.batch.bind(f.db);
      f.db.batch = async (statements) => { f.setSqlNow(end); return original(statements); };
    } else {
      const original = f.db.execute.bind(f.db);
      f.db.execute = (sql, values, mode) => {
        if (sql.includes("UPDATE research_runs AS r SET") && sql.includes("state=?1")) f.setSqlNow(end);
        return original(sql, values, mode);
      };
    }
    await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(Object.values(normalized(f)).every((value) => value === 0)).toBe(true);
    expect((await f.imports.read(f.identity))?.phase).toBe(1);
    const later = await publication(f).resolve(f.identity, marked.metadata.receiptHash);
    expect(later.resolution?.state).toBe("failed");
  });

  it.each(["quota", "budget"] as const)
  ("rejects a %s reservation invalidated after the observation", async (kind) => {
    const f = await fixture();
    const marked = await phase1(f);
    const original = f.db.batch.bind(f.db);
    f.db.batch = async (statements) => {
      if (kind === "quota") f.db.database.prepare(`UPDATE quota_ledger SET units=0
        WHERE reservation_id=?1 AND entry_kind='reserved'`).run(f.execution.quotaReservationId);
      else f.db.database.prepare(`UPDATE ai_budget_reservations SET status='released' WHERE id=?1`)
        .run(f.execution.budgetReservationId);
      return original(statements);
    };
    await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(Object.values(normalized(f)).every((value) => value === 0)).toBe(true);
    expect((await f.imports.read(f.identity))?.phase).toBe(1);
  });

  it("cannot resolve an active run whose version is exhausted", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    f.db.database.prepare("UPDATE research_runs SET state_version=?1 WHERE id=?2")
      .run(Number.MAX_SAFE_INTEGER, f.identity.runId);
    await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(Object.values(normalized(f)).every((value) => value === 0)).toBe(true);
  });

  it("metadata-only capture after expiry can only resolve failed", async () => {
    const f = await fixture();
    const receipt = { ...f.receipt, outcome: { kind: "response", content: JSON.stringify(validResearchCandidate),
      annotations: validAnnotations, actualModel: "openrouter/actual", usage: null } };
    const metadata = await f.metadata();
    expect(metadata.outcome.kind).toBe("error");
    const responseMetadata = await import("../../app/server/research/executor/receipt")
      .then(({ summarizeBridgeProviderReceipt }) => summarizeBridgeProviderReceipt(receipt));
    f.setSqlNow(f.execution.executionExpiresAt!);
    const captured = await f.imports.captureMetadata(f.identity, responseMetadata);
    await f.audits.record(captured.audit);
    const marked = await f.imports.markAudit(f.identity, captured.metadata.receiptHash);
    const result = await publication(f).resolve(f.identity, marked.metadata.receiptHash);
    expect(result.resolution?.state).toBe("failed");
    expect(Object.values(normalized(f)).every((value) => value === 0)).toBe(true);
  });

  it("reuses a complete exact existing package without normalized inserts", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    await seedExistingPackage(f, marked);
    const before = normalized(f);
    const result = await publication(f).resolve(f.identity, marked.metadata.receiptHash);
    expect(result.resolution?.state).toBe("ready");
    expect(normalized(f)).toEqual(before);
    expect(f.db.batches.at(-1)).toHaveLength(4);
  });

  it.each(["corrupt", "foreign", "fingerprint"] as const)
  ("rejects an existing %s package row without terminal mutation", async (kind) => {
    const f = await fixture();
    const marked = await phase1(f);
    await seedExistingPackage(f, marked);
    const packId = marked.decision?.kind === "ready" ? marked.decision.package.id : "";
    const assignment = kind === "corrupt" ? "package_json='{}'"
      : kind === "foreign" ? "normalized_role_key='foreign-role'"
        : "content_fingerprint='0'";
    f.db.database.prepare(`UPDATE research_packages SET ${assignment} WHERE id=?1`).run(packId);
    const before = normalized(f);
    await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
      .rejects.toMatchObject({ code: kind === "foreign" ? "CONFLICT" : "RESEARCH_UNAVAILABLE" });
    expect(normalized(f)).toEqual(before);
    expect((await f.research.getRun(f.identity.ownerId, f.identity.runId))?.state).toBe("researching");
    expect((await f.imports.read(f.identity))?.phase).toBe(1);
  });

  it("rejects a matching fingerprint row under a different package ID", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    await seedExistingPackage(f, marked);
    const packId = marked.decision?.kind === "ready" ? marked.decision.package.id : "";
    f.db.database.prepare("DELETE FROM research_source_audits WHERE package_id=?1").run(packId);
    f.db.database.prepare("UPDATE research_packages SET id='foreign-package' WHERE id=?1").run(packId);
    await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect((await f.research.getRun(f.identity.ownerId, f.identity.runId))?.state).toBe("researching");
  });

  it("preserves an already failed run's original ordinary JSON bytes", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    if (marked.decision?.kind !== "ready") throw new Error("missing ready quality");
    const quality = JSON.stringify(marked.decision.quality, null, 2);
    f.db.database.prepare(`UPDATE research_runs SET state='failed',state_version=state_version+1,
      retryable=1,active_slot=NULL,active_expires_at=NULL,error_code='interrupted',
      public_failure_category='timeout',quality_json=?1 WHERE id=?2`).run(quality, f.identity.runId);
    const result = await publication(f).resolve(f.identity, marked.metadata.receiptHash);
    expect(result.resolution?.state).toBe("failed");
    expect((f.db.database.prepare("SELECT quality_json FROM research_runs WHERE id=?1")
      .get(f.identity.runId) as { quality_json: string }).quality_json).toBe(quality);
  });

  it("rejects a schema-valid package substitution after phase 5 clears the decision", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    await publication(f).resolve(f.identity, marked.metadata.receiptHash);
    await f.quota.finalize(f.execution.quotaReservationId!, "accepted", 1);
    await f.imports.markQuota(f.identity, marked.metadata.receiptHash);
    await f.budget.settle(f.identity.ownerId, f.execution.budgetReservationId!, marked.settlement);
    await f.imports.markBudget(f.identity, marked.metadata.receiptHash);
    const finished = await f.imports.finish(f.identity, marked.metadata.receiptHash);
    expect(finished).toMatchObject({ phase: 5, decision: null });
    expect(await publication(f).resolve(f.identity, marked.metadata.receiptHash)).toEqual(finished);
    const row = f.db.database.prepare("SELECT package_json FROM research_packages WHERE id=?1")
      .get(finished.resolution!.packageId) as { package_json: string };
    const pack = JSON.parse(row.package_json) as ResearchPackage;
    pack.blueprint.name += " revised";
    const { contentFingerprint, ...content } = pack;
    expect(contentFingerprint).toBeTruthy();
    pack.contentFingerprint = fingerprint(canonicalJson(content));
    f.db.database.prepare(`UPDATE research_packages SET package_json=?1,content_fingerprint=?2
      WHERE id=?3`).run(JSON.stringify(pack), pack.contentFingerprint, pack.id);
    await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
  });

  it("keeps 64 skills and 2016 prerequisite edges within native D1 limits", async () => {
    const f = await fixture();
    const candidate = fanoutCandidate();
    expect(candidate.prerequisiteEdges).toHaveLength(2016);
    const content = JSON.stringify(candidate);
    expect(new TextEncoder().encode(content).byteLength).toBeLessThanOrEqual(196_608);
    const receipt = { ...f.receipt, outcome: { kind: "response", content,
      annotations: validAnnotations, actualModel: "openrouter/actual", usage: null } };
    const captured = await f.imports.captureBody(f.identity, receipt);
    expect(captured.decision?.kind).toBe("ready");
    await f.audits.record(captured.audit);
    const marked = await f.imports.markAudit(f.identity, captured.metadata.receiptHash);
    const result = await publication(f).resolve(f.identity, marked.metadata.receiptHash);
    expect(result.resolution?.state).toBe("ready");
    expect(normalized(f)).toMatchObject({ role_skill_definitions: 64, role_skill_edges: 2016 });
    expect(f.db.preparedSql.every((sql) => new TextEncoder().encode(sql).byteLength <= 100_000)).toBe(true);
  });

  it("recovers a committed publication after its batch acknowledgement is lost", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    let attempts = 0;
    const db = {
      prepare: (sql: string) => f.db.prepare(sql),
      batch: async (statements: D1PreparedStatement[]) => {
        attempts += 1;
        await f.db.batch(statements);
        throw new Error("lost batch acknowledgement");
      },
    } as unknown as D1Database;
    const uncertain = new D1SiteImportPublication(db, f.research, f.executions);
    const result = await uncertain.resolve(f.identity, marked.metadata.receiptHash);
    expect(result.resolution?.state).toBe("ready");
    expect(attempts).toBe(1);
    expect(normalized(f).research_packages).toBe(1);
  });

  it("coalesces two same-receipt publications even when their observed SQL times differ", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const reached = new Promise<void>((resolve) => { entered = resolve; });
    let attempts = 0;
    const db = {
      prepare: (sql: string) => f.db.prepare(sql),
      batch: async (statements: D1PreparedStatement[]) => {
        attempts += 1;
        if (attempts === 1) { entered(); await blocked; }
        return f.db.batch(statements);
      },
    } as unknown as D1Database;
    const first = new D1SiteImportPublication(db, f.research, f.executions)
      .resolve(f.identity, marked.metadata.receiptHash);
    await reached;
    f.setSqlNow(marked.updatedAt + 1);
    const second = await new D1SiteImportPublication(db, f.research, f.executions)
      .resolve(f.identity, marked.metadata.receiptHash);
    release();
    expect(await first).toEqual(second);
    expect(attempts).toBe(2);
    expect(normalized(f).research_packages).toBe(1);
  });

  it("retries one complete strict observation when a winner commits during the first run read", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    const stale = await f.research.getRun(f.identity.ownerId, f.identity.runId);
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const reached = new Promise<void>((resolve) => { entered = resolve; });
    let reads = 0;
    const runs = { getRun: async (ownerId: string, runId: string) => {
      reads += 1;
      if (reads === 1) { entered(); await blocked; return stale; }
      return f.research.getRun(ownerId, runId);
    } };
    const waiting = new D1SiteImportPublication(f.db as unknown as D1Database, runs, f.executions)
      .resolve(f.identity, marked.metadata.receiptHash);
    await reached;
    const winner = await publication(f).resolve(f.identity, marked.metadata.receiptHash);
    const batches = f.db.batches.length;
    release();
    expect(await waiting).toEqual(winner);
    expect(reads).toBe(2);
    expect(f.db.batches).toHaveLength(batches);
  });

  it("stops after two strict observations when a contradictory run snapshot persists", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    const stale = await f.research.getRun(f.identity.ownerId, f.identity.runId);
    await publication(f).resolve(f.identity, marked.metadata.receiptHash);
    const batches = f.db.batches.length;
    let reads = 0;
    const runs = { getRun: async () => { reads += 1; return stale; } };
    await expect(new D1SiteImportPublication(f.db as unknown as D1Database, runs, f.executions)
      .resolve(f.identity, marked.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(reads).toBe(2);
    expect(f.db.batches).toHaveLength(batches);
  });

  it("does not turn an already-failed race into a Ready publication", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    const original = f.db.batch.bind(f.db);
    f.db.batch = async (statements) => {
      f.db.database.prepare(`UPDATE research_runs SET state='failed',state_version=state_version+1,
        retryable=1,active_slot=NULL,active_expires_at=NULL,error_code='interrupted',
        public_failure_category='timeout' WHERE id=?1`).run(f.identity.runId);
      return original(statements);
    };
    await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(Object.values(normalized(f)).every((value) => value === 0)).toBe(true);
    expect((await f.imports.read(f.identity))?.phase).toBe(1);
    f.db.batch = original;
    expect((await publication(f).resolve(f.identity, marked.metadata.receiptHash)).resolution?.state)
      .toBe("failed");
  });

  it.each(["created_at", "retry_of_run_id"] as const)
  ("rolls back when the terminal row %s changes before journal CAS", async (column) => {
    const f = await fixture();
    const marked = await phase1(f);
    const before = await f.research.getRun(f.identity.ownerId, f.identity.runId);
    const original = f.db.execute.bind(f.db);
    f.db.execute = (sql, values, mode) => {
      if (sql.includes("UPDATE research_site_imports AS j SET phase=2")) {
        f.db.database.prepare(column === "created_at"
          ? "UPDATE research_runs SET created_at=created_at+1 WHERE id=?1"
          : "UPDATE research_runs SET retry_of_run_id=id WHERE id=?1").run(f.identity.runId);
      }
      return original(sql, values, mode);
    };
    await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(Object.values(normalized(f)).every((value) => value === 0)).toBe(true);
    expect(await f.research.getRun(f.identity.ownerId, f.identity.runId)).toEqual(before);
    expect((await f.imports.read(f.identity))?.phase).toBe(1);
  });

  it("rechecks exact existing package bytes in the terminal CAS after pre-read substitution", async () => {
    const f = await fixture();
    const marked = await phase1(f);
    await seedExistingPackage(f, marked);
    const before = normalized(f);
    const original = f.db.batch.bind(f.db);
    f.db.batch = async (statements) => {
      const row = f.db.database.prepare("SELECT package_json FROM research_packages WHERE id=?1")
        .get(marked.decision?.kind === "ready" ? marked.decision.package.id : "") as { package_json: string };
      f.db.database.prepare("UPDATE research_packages SET package_json=?1 WHERE id=?2")
        .run(JSON.stringify(JSON.parse(row.package_json), null, 2),
          marked.decision?.kind === "ready" ? marked.decision.package.id : "");
      return original(statements);
    };
    await expect(publication(f).resolve(f.identity, marked.metadata.receiptHash))
      .rejects.toMatchObject({ code: "RESEARCH_UNAVAILABLE" });
    expect(normalized(f)).toEqual(before);
    expect((await f.imports.read(f.identity))?.phase).toBe(1);
  });
});
