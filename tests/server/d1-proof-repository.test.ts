import { describe, expect, it } from "vitest";
import type { ProofLedgerMutationResult } from "../../app/contracts/proof-ledger";
import { D1ProofRepository } from "../../app/server/proof/d1-proof-repository";
import { ProofRepositoryConflictError, ProofRepositoryUnavailableError } from "../../app/server/proof/repository";

type Call = { sql: string; values: unknown[] };

class FakeStatement {
  values: unknown[] = [];

  constructor(private readonly db: FakeD1, readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    this.db.calls.push({ sql: this.sql, values });
    return this;
  }

  async first<T>() {
    return this.db.takeFirst(this.sql) as T | null;
  }

  async all<T>() {
    return { success: true, results: this.db.takeAll(this.sql) as T[] };
  }

  async run() {
    this.db.runs.push({ sql: this.sql, values: this.values });
    return { success: true };
  }
}

class FakeD1 {
  readonly calls: Call[] = [];
  readonly runs: Call[] = [];
  readonly batches: Call[][] = [];
  readonly committedBatches: Call[][] = [];
  batchError: Error | null = null;
  private readonly firstResponses: Array<{ match: string; value: unknown }> = [];
  private readonly allResponses: Array<{ match: string; value: unknown[] }> = [];

  when(match: string, value: unknown) {
    this.firstResponses.push({ match, value });
  }

  whenAll(match: string, value: unknown[]) {
    this.allResponses.push({ match, value });
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  async batch(statements: FakeStatement[]) {
    const calls = statements.map(({ sql, values }) => ({ sql, values }));
    this.batches.push(calls);
    if (this.batchError) {
      const error = this.batchError;
      this.batchError = null;
      throw error;
    }
    this.committedBatches.push(calls);
    return statements.map(() => ({ success: true, meta: { changes: 1 } }));
  }

  takeFirst(sql: string) {
    const index = this.firstResponses.findIndex((response) => sql.includes(response.match));
    if (index < 0) return null;
    return this.firstResponses.splice(index, 1)[0].value;
  }

  takeAll(sql: string) {
    const index = this.allResponses.findIndex((response) => sql.includes(response.match));
    if (index < 0) return [];
    return this.allResponses.splice(index, 1)[0].value;
  }
}

function repository(db: FakeD1) {
  return new D1ProofRepository(db as unknown as D1Database, () => 1_785_196_800_000);
}

function dailyUnit() {
  return {
    id: "daily-unit-1", planVersionId: "plan-active", templateId: "testing-learn-01",
    templateVersion: "2026.08.1", checkpointId: null, skillId: "testing", kind: "learn" as const,
    scheduledDate: "2026-08-17", slot: "primary" as const, required: true,
    objective: "Build a focused regression.", whyNow: "It protects the evidence boundary.",
    primaryResourceId: "testing-official", alternativeResourceIds: [],
    steps: [{ id: "test", label: "Write the focused regression", minutes: 35 }],
    buildTask: "Write a regression.", completionCriteria: ["The regression passes."],
    proofRequirement: "Save the test output.", rubric: ["Incomplete", "Complete"], estimatedMinutes: 35,
  };
}

function result(revision = 1): ProofLedgerMutationResult {
  return {
    outcome: "demonstrated",
    workspace: {
      id: "workspace-1",
      goalId: "goal-1",
      schemaVersion: "2026.08.1",
      revision,
      versions: [{
        id: "version-1",
        proofId: "proof-1",
        versionNumber: 1,
        schemaVersion: "2026.08.1",
        dailyUnitId: "daily-1",
        title: "Architecture map",
        kind: "document",
        summary: "Trace the request boundary.",
        artifactUrl: "https://example.com/proof",
        assetId: null,
        skillIds: ["systems"],
        completionCriteria: ["Trace is complete"],
        visibility: "private",
        createdAt: "2026-08-17T00:00:00.000Z",
        supersedesVersionId: null,
      }],
      reviews: [{
        id: "review-submitted",
        proofId: "proof-1",
        versionId: "version-1",
        sequence: 1,
        mutationId: "mutation-1",
        kind: "submitted",
        stateAfter: "pending_review",
        visibilityAfter: "private",
        validatorKey: null,
        outcome: null,
        reasonCodes: [],
        occurredAt: "2026-08-17T00:00:00.000Z",
      }, {
        id: "review-1",
        proofId: "proof-1",
        versionId: "version-1",
        sequence: 2,
        mutationId: "mutation-1",
        kind: "structural_passed",
        stateAfter: "demonstrated",
        visibilityAfter: "private",
        validatorKey: null,
        outcome: "passed",
        reasonCodes: [],
        occurredAt: "2026-08-17T00:00:00.000Z",
      }],
      projections: [
        {
          skillId: "systems", audience: "internal", status: "demonstrated",
          completedUnitIds: [], strongestProofId: "proof-1", strongestVersionId: "version-1",
          latestUsedAt: "2026-08-17T00:00:00.000Z",
        },
        {
          skillId: "systems", audience: "public", status: "exploring",
          completedUnitIds: [], strongestProofId: null, strongestVersionId: null, latestUsedAt: null,
        },
      ],
    },
  };
}

function storedMutation(value = result()) {
  return JSON.stringify({
    schemaVersion: "2026.08.1",
    ownerId: "user-owner",
    goalId: "goal-1",
    result: value,
  });
}

function seedLedgerLoad(db: FakeD1) {
  const occurredAt = Date.parse("2026-08-17T00:00:00.000Z");
  db.when("FROM idempotency_records", { response_json: storedMutation() });
  db.whenAll("FROM proof_versions", [{
    id: "version-1", proof_id: "proof-1", version_number: 1, schema_version: "2026.08.1",
    daily_unit_id: "daily-1", title: "Architecture map", kind: "document",
    summary: "Trace the request boundary.", artifact_url: "https://example.com/proof", asset_id: null,
    skill_ids_json: '["systems"]', completion_criteria_json: '["Trace is complete"]',
    visibility: "private", created_at: occurredAt, supersedes_version_id: null,
  }]);
  db.whenAll("FROM proof_review_events", [{
    id: "review-submitted", proof_id: "proof-1", version_id: "version-1", sequence: 1,
    mutation_id: "mutation-1", kind: "submitted", state_after: "pending_review",
    visibility_after: "private", validator_key: null, outcome: null, reason_codes_json: "[]",
    occurred_at: occurredAt,
  }, {
    id: "review-1", proof_id: "proof-1", version_id: "version-1", sequence: 2,
    mutation_id: "mutation-1", kind: "structural_passed", state_after: "demonstrated",
    visibility_after: "private", validator_key: null, outcome: "passed", reason_codes_json: "[]",
    occurred_at: occurredAt,
  }]);
  db.whenAll("FROM user_skill_projections", [
    { skill_id: "systems", audience: "internal", status: "demonstrated", completed_unit_ids_json: "[]",
      proof_id: "proof-1", version_id: "version-1", latest_use_at: occurredAt },
    { skill_id: "systems", audience: "public", status: "exploring", completed_unit_ids_json: "[]",
      proof_id: null, version_id: null, latest_use_at: null },
  ]);
}

describe("D1ProofRepository", () => {
  it("loads a strict ledger workspace with owner and goal bound on every data query", async () => {
    const db = new FakeD1();
    seedLedgerLoad(db);

    await expect(repository(db).load({ ownerId: "user-owner", goalId: "goal-1" }))
      .resolves.toEqual(result().workspace);
    for (const call of db.calls) {
      expect(call.values).toEqual(expect.arrayContaining(["user-owner"]));
      expect(call.sql).toMatch(/user_id\s*=\s*\?\d/iu);
      if (!call.sql.includes("idempotency_records")) {
        expect(call.values).toEqual(expect.arrayContaining(["goal-1"]));
        expect(call.sql).toMatch(/goal_id\s*=\s*\?\d/iu);
      }
    }
  });

  it("treats malformed ledger JSON as repository unavailability", async () => {
    const db = new FakeD1();
    db.when("FROM idempotency_records", { response_json: storedMutation() });
    db.whenAll("FROM proof_versions", [{
      id: "version-1", proof_id: "proof-1", version_number: 1, schema_version: "2026.08.1",
      daily_unit_id: null, title: "x", kind: "document", summary: "x", artifact_url: null,
      asset_id: null, skill_ids_json: "not-json", completion_criteria_json: "[]",
      visibility: "private", created_at: 1_776_038_400_000, supersedes_version_id: null,
    }]);
    db.whenAll("FROM proof_review_events", []);
    db.whenAll("FROM user_skill_projections", []);

    await expect(repository(db).load({ ownerId: "user-owner", goalId: "goal-1" }))
      .rejects.toBeInstanceOf(ProofRepositoryUnavailableError);
  });

  it("persists one mutation atomically in canonical table order", async () => {
    const db = new FakeD1();
    db.when("COUNT(DISTINCT mutation_id)", { revision: 0 });
    const saved = result();

    await expect(repository(db).saveMutation({
      ownerId: "user-owner", goalId: "goal-1", mutationId: "mutation-1",
      baseRevision: 0, result: saved,
    })).resolves.toEqual(saved);

    const sql = db.committedBatches[0]!.map((call) => call.sql);
    expect(sql).toHaveLength(9);
    expect(sql[0]).toContain("INSERT OR IGNORE INTO proof_items");
    expect(sql[1]).toContain("INSERT INTO proof_versions");
    expect(sql[2]).toContain("INSERT INTO proof_review_events");
    expect(sql[3]).toContain("INSERT INTO proof_review_events");
    expect(sql[4]).toContain("audience = 'internal'");
    expect(sql[5]).toContain("INSERT INTO user_skill_projections");
    expect(sql[6]).toContain("audience = 'public'");
    expect(sql[7]).toContain("INSERT INTO user_skill_projections");
    expect(sql[8]).toContain("INSERT INTO idempotency_records");
    expect(sql[0]).toMatch(/skill_ids_json,verified[\s\S]+VALUES \([^)]*0,/u);
  });

  it("rejects a stale revision before starting a batch", async () => {
    const db = new FakeD1();
    db.when("COUNT(DISTINCT mutation_id)", { revision: 2 });

    await expect(repository(db).saveMutation({
      ownerId: "user-owner", goalId: "goal-1", mutationId: "mutation-1",
      baseRevision: 0, result: result(),
    })).rejects.toBeInstanceOf(ProofRepositoryConflictError);
    expect(db.batches).toEqual([]);
  });

  it("replays an identical mutation and leaves failed batches uncommitted", async () => {
    const replayDb = new FakeD1();
    replayDb.when("FROM idempotency_records", { response_json: storedMutation() });
    await expect(repository(replayDb).saveMutation({
      ownerId: "user-owner", goalId: "goal-1", mutationId: "mutation-1",
      baseRevision: 0, result: result(),
    })).resolves.toEqual(result());
    expect(replayDb.batches).toEqual([]);

    const failingDb = new FakeD1();
    failingDb.when("COUNT(DISTINCT mutation_id)", { revision: 0 });
    failingDb.batchError = new Error("D1 batch failed");
    await expect(repository(failingDb).saveMutation({
      ownerId: "user-owner", goalId: "goal-1", mutationId: "mutation-1",
      baseRevision: 0, result: result(),
    })).rejects.toBeInstanceOf(ProofRepositoryUnavailableError);
    expect(failingDb.committedBatches).toEqual([]);
  });

  it("returns the latest ledger version or falls back to the legacy root", async () => {
    const ledgerDb = new FakeD1();
    ledgerDb.when("FROM proof_versions", {
      id: "version-1", proof_id: "proof-1", version_number: 1, schema_version: "2026.08.1",
      daily_unit_id: null, title: "Architecture map", kind: "document", summary: "Summary",
      artifact_url: "https://example.com/proof", asset_id: null, skill_ids_json: '["systems"]',
      completion_criteria_json: "[]", visibility: "private", created_at: 1_776_038_400_000,
      supersedes_version_id: null, goal_id: "goal-1",
    });
    await expect(repository(ledgerDb).getOwnedProofSnapshot("user-owner", "proof-1"))
      .resolves.toMatchObject({ source: "ledger", userId: "user-owner", goalId: "goal-1",
        version: { id: "version-1" } });

    const legacyDb = new FakeD1();
    legacyDb.when("FROM proof_items", {
      id: "proof-1", user_id: "user-owner", title: "Legacy", kind: "project",
      skill_ids_json: '["systems"]', verified: 1,
    });
    await expect(repository(legacyDb).getOwnedProofSnapshot("user-owner", "proof-1"))
      .resolves.toMatchObject({ source: "legacy", proof: { id: "proof-1", verified: true } });
  });

  it("binds owner and proof ID when reading private proof data", async () => {
    const db = new FakeD1();
    db.when("FROM proof_items", {
      id: "proof-1",
      user_id: "user-owner",
      title: "Architecture map",
      kind: "project",
      skill_ids_json: '["systems"]',
      verified: 1,
    });

    await expect(repository(db).getOwnedProof("user-owner", "proof-1")).resolves.toEqual({
      id: "proof-1",
      userId: "user-owner",
      title: "Architecture map",
      kind: "project",
      skillIds: ["systems"],
      verified: true,
    });
    expect(db.calls[0].values).toEqual(["user-owner", "proof-1"]);
    expect(db.calls[0].sql).toContain("WHERE user_id = ?1 AND id = ?2");
  });

  it("resolves a linked Daily Unit by unit ID within the active plan", async () => {
    const db = new FakeD1();
    db.when("FROM daily_units", { payload_json: JSON.stringify(dailyUnit()) });

    await expect(repository(db).getOwnedDailyUnit({ ownerId: "user-owner", goalId: "goal-1" }, "daily-unit-1"))
      .resolves.toEqual(dailyUnit());

    expect(db.calls[0].values).toEqual(["user-owner", "goal-1", "daily-unit-1"]);
    expect(db.calls[0].sql).toMatch(/unit_id\s*=\s*\?3/u);
    expect(db.calls[0].sql).toMatch(/active_plan_version_id/u);
  });

  it("writes searchable asset metadata and reads it through owner scope", async () => {
    const db = new FakeD1();
    const repo = repository(db);
    await repo.createAssetMetadata({
      id: "asset-1",
      userId: "user-owner",
      proofId: "proof-1",
      objectKey: "user-owner/proof-1/asset-1",
      filename: "proof.pdf",
      contentType: "application/pdf",
      sizeBytes: 512,
    });
    db.when("FROM proof_assets", {
      id: "asset-1",
      user_id: "user-owner",
      proof_id: "proof-1",
      object_key: "user-owner/proof-1/asset-1",
      filename: "proof.pdf",
      content_type: "application/pdf",
      size_bytes: 512,
    });

    await expect(repo.getOwnedAsset("user-owner", "proof-1")).resolves.toMatchObject({
      id: "asset-1",
      objectKey: "user-owner/proof-1/asset-1",
    });
    expect(db.runs[0].sql).toContain("INSERT INTO proof_assets");
    expect(db.calls.at(-1)?.values).toEqual(["user-owner", "proof-1"]);
  });

  it("stores only the token hash and renews a share idempotently", async () => {
    const db = new FakeD1();
    const rawToken = "A".repeat(43);
    await repository(db).upsertShare({
      id: "share-1",
      userId: "user-owner",
      proofId: "proof-1",
      tokenHash: "hash-only",
      publishedFields: ["title"],
      publicView: { schemaVersion: "2026.08.1", title: "Architecture map" },
    });

    expect(db.runs[0].sql).toContain("ON CONFLICT(user_id, proof_id) DO UPDATE");
    expect(db.runs[0].values).toContain("hash-only");
    expect(JSON.stringify(db.runs[0].values)).not.toContain(rawToken);
  });

  it("revokes by owner and resolves only unrevoked token hashes", async () => {
    const db = new FakeD1();
    db.when("UPDATE public_proof_shares", { id: "share-1" });
    db.when("FROM public_proof_shares", {
      token_hash: "hash-only",
      public_view_json: '{"title":"Architecture map"}',
    });
    const repo = repository(db);

    await expect(repo.revokeShare("user-owner", "proof-1")).resolves.toBe(true);
    await expect(repo.getActiveShareByTokenHash("hash-only")).resolves.toEqual({
      tokenHash: "hash-only",
      publicView: { title: "Architecture map" },
    });
    expect(db.calls[0].values).toEqual([1_785_196_800_000, "user-owner", "proof-1"]);
    expect(db.calls[1].values).toEqual(["hash-only"]);
    expect(db.calls[1].sql).toContain("revoked_at IS NULL");
  });
});
