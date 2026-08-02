import { z } from "zod";
import type {
  ActiveProofShare,
  OwnedProof,
  ProofAssetMetadata,
  ProofRepository,
  ProofShareInput,
} from "./repository";

type ProofRow = {
  id: string;
  user_id: string;
  title: string;
  kind: OwnedProof["kind"];
  skill_ids_json: string;
  verified: number;
};

type AssetRow = {
  id: string;
  user_id: string;
  proof_id: string;
  object_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
};

type ShareRow = { token_hash: string; public_view_json: string };
const skillIdsSchema = z.array(z.string().min(1).max(160)).max(100);

export class D1ProofRepository implements ProofRepository {
  constructor(
    private readonly db: D1Database,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async getOwnedProof(userId: string, proofId: string): Promise<OwnedProof | null> {
    const row = await this.db.prepare(`
      SELECT id, user_id, title, kind, skill_ids_json, verified
      FROM proof_items
      WHERE user_id = ?1 AND id = ?2
      LIMIT 1
    `).bind(userId, proofId).first<ProofRow>();
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      kind: row.kind,
      skillIds: skillIdsSchema.parse(JSON.parse(row.skill_ids_json)),
      verified: Boolean(row.verified),
    };
  }

  async createAssetMetadata(metadata: ProofAssetMetadata): Promise<void> {
    await this.db.prepare(`
      INSERT INTO proof_assets (
        id, user_id, proof_id, object_key, filename, content_type, size_bytes, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    `).bind(
      metadata.id,
      metadata.userId,
      metadata.proofId,
      metadata.objectKey,
      metadata.filename,
      metadata.contentType,
      metadata.sizeBytes,
      this.now(),
    ).run();
  }

  async getOwnedAsset(userId: string, proofId: string): Promise<ProofAssetMetadata | null> {
    const row = await this.db.prepare(`
      SELECT id, user_id, proof_id, object_key, filename, content_type, size_bytes
      FROM proof_assets
      WHERE user_id = ?1 AND proof_id = ?2
      ORDER BY created_at DESC
      LIMIT 1
    `).bind(userId, proofId).first<AssetRow>();
    return row ? {
      id: row.id,
      userId: row.user_id,
      proofId: row.proof_id,
      objectKey: row.object_key,
      filename: row.filename,
      contentType: row.content_type,
      sizeBytes: Number(row.size_bytes),
    } : null;
  }

  async upsertShare(input: ProofShareInput): Promise<void> {
    const now = this.now();
    await this.db.prepare(`
      INSERT INTO public_proof_shares (
        id, user_id, proof_id, token_hash, published_fields_json,
        public_view_json, revoked_at, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?7)
      ON CONFLICT(user_id, proof_id) DO UPDATE SET
        token_hash = excluded.token_hash,
        published_fields_json = excluded.published_fields_json,
        public_view_json = excluded.public_view_json,
        revoked_at = NULL,
        updated_at = excluded.updated_at
    `).bind(
      input.id,
      input.userId,
      input.proofId,
      input.tokenHash,
      JSON.stringify(input.publishedFields),
      JSON.stringify(input.publicView),
      now,
    ).run();
  }

  async revokeShare(userId: string, proofId: string): Promise<boolean> {
    const row = await this.db.prepare(`
      UPDATE public_proof_shares
      SET revoked_at = ?1, updated_at = ?1
      WHERE user_id = ?2 AND proof_id = ?3 AND revoked_at IS NULL
      RETURNING id
    `).bind(this.now(), userId, proofId).first<{ id: string }>();
    return Boolean(row);
  }

  async getActiveShareByTokenHash(tokenHash: string): Promise<ActiveProofShare | null> {
    const row = await this.db.prepare(`
      SELECT token_hash, public_view_json
      FROM public_proof_shares
      WHERE token_hash = ?1 AND revoked_at IS NULL
      LIMIT 1
    `).bind(tokenHash).first<ShareRow>();
    if (!row) return null;
    return { tokenHash: row.token_hash, publicView: JSON.parse(row.public_view_json) };
  }
}
