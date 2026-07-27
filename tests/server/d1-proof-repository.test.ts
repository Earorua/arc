import { describe, expect, it } from "vitest";
import { D1ProofRepository } from "../../app/server/proof/d1-proof-repository";

class FakeStatement {
  values: unknown[] = [];

  constructor(private readonly db: FakeD1, readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    this.db.calls.push({ sql: this.sql, values });
    return this;
  }

  async first<T>() {
    return this.db.take(this.sql) as T | null;
  }

  async run() {
    this.db.runs.push({ sql: this.sql, values: this.values });
    return { success: true };
  }
}

class FakeD1 {
  readonly calls: Array<{ sql: string; values: unknown[] }> = [];
  readonly runs: Array<{ sql: string; values: unknown[] }> = [];
  private readonly responses: Array<{ match: string; value: unknown }> = [];

  when(match: string, value: unknown) {
    this.responses.push({ match, value });
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }

  take(sql: string) {
    const index = this.responses.findIndex((response) => sql.includes(response.match));
    if (index < 0) return null;
    return this.responses.splice(index, 1)[0].value;
  }
}

function repository(db: FakeD1) {
  return new D1ProofRepository(db as unknown as D1Database, () => 1_785_196_800_000);
}

describe("D1ProofRepository", () => {
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
      publicView: { title: "Architecture map" },
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
