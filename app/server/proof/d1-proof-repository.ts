import { z } from "zod";
import {
  proofLedgerMutationResultSchema,
  proofLedgerWorkspaceSchema,
  proofReviewEventSchema,
  proofVersionSchema,
  skillEvidenceProjectionSchema,
  PROOF_LEDGER_SCHEMA_VERSION,
  type ProofLedgerMutationResult,
  type ProofLedgerWorkspace,
  type ProofReviewEvent,
  type ProofVersion,
  type SkillEvidenceProjection,
} from "../../contracts/proof-ledger";
import type {
  ActiveProofShare,
  OwnedProof,
  ProofAssetMetadata,
  ProofRepository,
  ProofShareInput,
  ProofMutationLookup,
  ProofOwnerGoal,
  SaveProofMutationCommand,
  OwnedProofSnapshot,
} from "./repository";
import {
  ProofRepositoryConflictError,
  ProofRepositoryUnavailableError,
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
const boundedIdArraySchema = z.array(z.string().min(1).max(256)).max(2000);
const completionCriteriaSchema = z.array(z.string().min(1).max(500)).max(8);
const reasonCodesSchema = z.array(z.string().min(1).max(128)).max(32);
const D1_PROOF_VALUE_MAX_BYTES = 1_900_000;
const IDEMPOTENCY_SCOPE_PREFIX = "proof-ledger:";

type GoalRow = { id: string };
type IdempotencyRow = { response_json: string };
type RevisionRow = { revision: number };
type VersionRow = {
  id: string; proof_id: string; version_number: number; schema_version: string;
  daily_unit_id: string | null; title: string; kind: ProofVersion["kind"]; summary: string;
  artifact_url: string | null; asset_id: string | null; skill_ids_json: string;
  completion_criteria_json: string; visibility: ProofVersion["visibility"]; created_at: number;
  supersedes_version_id: string | null; goal_id?: string;
};
type ReviewRow = {
  id: string; proof_id: string; version_id: string; sequence: number; mutation_id: string;
  kind: ProofReviewEvent["kind"]; state_after: ProofReviewEvent["stateAfter"];
  visibility_after: ProofReviewEvent["visibilityAfter"]; validator_key: string | null;
  outcome: ProofReviewEvent["outcome"]; reason_codes_json: string; occurred_at: number;
};
type ProjectionRow = {
  skill_id: string; audience: SkillEvidenceProjection["audience"];
  status: SkillEvidenceProjection["status"]; completed_unit_ids_json: string;
  proof_id: string | null; version_id: string | null; latest_use_at: number | null;
};

const storedMutationSchema = z.object({
  schemaVersion: z.literal(PROOF_LEDGER_SCHEMA_VERSION),
  ownerId: z.string().min(1).max(256),
  goalId: z.string().min(1).max(256),
  result: z.unknown(),
}).strict();

export class D1ProofRepository implements ProofRepository {
  constructor(
    private readonly db: D1Database,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async findActiveGoal(ownerId: string): Promise<ProofOwnerGoal | null> {
    const row = await this.db.prepare(`SELECT id FROM career_goals
      WHERE user_id = ?1 AND active_slot = 1 LIMIT 1`).bind(ownerId).first<GoalRow>();
    return row ? { ownerId, goalId: row.id } : null;
  }

  async load(scope: ProofOwnerGoal): Promise<ProofLedgerWorkspace | null> {
    try {
      const latest = await this.db.prepare(`SELECT response_json FROM idempotency_records
        WHERE user_id = ?1 AND scope = ?2 ORDER BY created_at DESC LIMIT 1`)
        .bind(scope.ownerId, scopeFor(scope.goalId)).first<IdempotencyRow>();
      if (!latest) return null;
      const stored = parseStoredMutation(latest.response_json, scope);
      const [versionRows, reviewRows, projectionRows] = await Promise.all([
        this.db.prepare(`SELECT id,proof_id,version_number,schema_version,daily_unit_id,title,kind,
          summary,artifact_url,asset_id,skill_ids_json,completion_criteria_json,visibility,created_at,
          supersedes_version_id FROM proof_versions
          WHERE user_id = ?1 AND goal_id = ?2 ORDER BY proof_id,version_number`)
          .bind(scope.ownerId, scope.goalId).all<VersionRow>(),
        this.db.prepare(`SELECT id,proof_id,version_id,sequence,mutation_id,kind,state_after,
          visibility_after,validator_key,outcome,reason_codes_json,occurred_at FROM proof_review_events
          WHERE user_id = ?1 AND goal_id = ?2 ORDER BY proof_id,sequence`)
          .bind(scope.ownerId, scope.goalId).all<ReviewRow>(),
        this.db.prepare(`SELECT skill_id,audience,status,completed_unit_ids_json,proof_id,version_id,
          latest_use_at FROM user_skill_projections
          WHERE user_id = ?1 AND goal_id = ?2 ORDER BY audience,skill_id`)
          .bind(scope.ownerId, scope.goalId).all<ProjectionRow>(),
      ]);
      const workspace = proofLedgerWorkspaceSchema.parse({
        ...stored.result.workspace,
        versions: versionRows.results.map(parseVersionRow),
        reviews: reviewRows.results.map(parseReviewRow),
        projections: projectionRows.results.map(parseProjectionRow),
      });
      if (workspace.goalId !== scope.goalId) throw new Error("goal mismatch");
      return workspace;
    } catch (error) {
      if (error instanceof ProofRepositoryUnavailableError) throw error;
      throw new ProofRepositoryUnavailableError();
    }
  }

  async findMutation(input: ProofMutationLookup): Promise<ProofLedgerMutationResult | null> {
    try {
      const row = await this.db.prepare(`SELECT response_json FROM idempotency_records
        WHERE user_id = ?1 AND scope = ?2 AND mutation_id = ?3 LIMIT 1`)
        .bind(input.ownerId, scopeFor(input.goalId), input.mutationId).first<IdempotencyRow>();
      return row ? parseStoredMutation(row.response_json, input).result : null;
    } catch (error) {
      if (error instanceof ProofRepositoryUnavailableError) throw error;
      throw new ProofRepositoryUnavailableError();
    }
  }

  async saveMutation(command: SaveProofMutationCommand): Promise<ProofLedgerMutationResult> {
    const result = parseMutationResult(command.result);
    if (result.workspace.goalId !== command.goalId
      || result.workspace.revision !== command.baseRevision + 1) {
      throw new ProofRepositoryConflictError();
    }
    const replay = await this.findMutation(command);
    if (replay) return replay;
    const revisionRow = await this.db.prepare(`SELECT COUNT(DISTINCT mutation_id) AS revision
      FROM proof_review_events WHERE user_id = ?1 AND goal_id = ?2`)
      .bind(command.ownerId, command.goalId).first<RevisionRow>();
    if (Number(revisionRow?.revision ?? 0) !== command.baseRevision) {
      throw new ProofRepositoryConflictError();
    }

    const mutationReviews = result.workspace.reviews.filter(
      ({ mutationId }) => mutationId === command.mutationId,
    );
    if (mutationReviews.length === 0) throw new ProofRepositoryUnavailableError();
    const newVersionIds = new Set(mutationReviews
      .filter(({ kind }) => kind === "drafted" || kind === "submitted")
      .map(({ versionId }) => versionId));
    const newVersions = result.workspace.versions.filter(({ id }) => newVersionIds.has(id));
    const now = this.now();
    const statements: D1PreparedStatement[] = [];
    for (const version of newVersions) {
      statements.push(this.db.prepare(`INSERT OR IGNORE INTO proof_items
        (id,user_id,goal_id,source_task_id,title,kind,skill_ids_json,verified,created_at,updated_at)
        VALUES (?1,?2,?3,NULL,?4,'project',?5,0,?6,?6)`)
        .bind(version.proofId, command.ownerId, command.goalId, version.title,
          JSON.stringify(version.skillIds), now));
      statements.push(insertVersion(this.db, command, version));
    }
    statements.push(...mutationReviews.map((review) => insertReview(this.db, command, review)));
    statements.push(...projectionStatements(
      this.db,
      command,
      result.workspace.projections.filter(({ audience }) => audience === "internal"),
      "internal",
      now,
    ));
    statements.push(...projectionStatements(
      this.db,
      command,
      result.workspace.projections.filter(({ audience }) => audience === "public"),
      "public",
      now,
    ));
    statements.push(this.db.prepare(`INSERT INTO idempotency_records
      (id,user_id,scope,mutation_id,response_json,created_at)
      VALUES (?1,?2,?3,?4,
        CASE WHEN (SELECT COUNT(DISTINCT mutation_id) FROM proof_review_events
          WHERE user_id = ?2 AND goal_id = ?7) = ?8 THEN ?5 ELSE NULL END,?6)`)
      .bind(`proof-mutation-${command.mutationId}`, command.ownerId, scopeFor(command.goalId),
        command.mutationId, serializeStoredMutation(command, result), now, command.goalId,
        result.workspace.revision));
    try {
      await this.db.batch(statements);
    } catch (error) {
      const winner = await this.findMutation(command);
      if (winner) return winner;
      if (isConstraintError(error)) throw new ProofRepositoryConflictError();
      throw new ProofRepositoryUnavailableError();
    }
    return structuredClone(result);
  }

  async getOwnedProof(userId: string, proofId: string): Promise<OwnedProof | null> {
    const row = await this.db.prepare(`
      SELECT id, user_id, title, kind, skill_ids_json, verified
      FROM proof_items
      WHERE user_id = ?1 AND id = ?2
      LIMIT 1
    `).bind(userId, proofId).first<ProofRow>();
    if (!row) return null;
    try {
      return {
        id: row.id,
        userId: row.user_id,
        title: row.title,
        kind: row.kind,
        skillIds: parseBoundedJson(row.skill_ids_json, skillIdsSchema),
        verified: Boolean(row.verified),
      };
    } catch {
      throw new ProofRepositoryUnavailableError();
    }
  }

  async getOwnedProofSnapshot(userId: string, proofId: string): Promise<OwnedProofSnapshot | null> {
    try {
      const row = await this.db.prepare(`SELECT id,goal_id,proof_id,version_number,schema_version,
        daily_unit_id,title,kind,summary,artifact_url,asset_id,skill_ids_json,
        completion_criteria_json,visibility,created_at,supersedes_version_id
        FROM proof_versions WHERE user_id = ?1 AND proof_id = ?2
          AND goal_id = (SELECT id FROM career_goals WHERE user_id = ?1 AND active_slot = 1 LIMIT 1)
        ORDER BY version_number DESC LIMIT 1`).bind(userId, proofId).first<VersionRow>();
      if (row) {
        return { source: "ledger", userId, goalId: row.goal_id ?? "", version: parseVersionRow(row) };
      }
      const proof = await this.getOwnedProof(userId, proofId);
      return proof ? { source: "legacy", proof } : null;
    } catch {
      throw new ProofRepositoryUnavailableError();
    }
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
    try {
      return { tokenHash: row.token_hash, publicView: parseBoundedJson(row.public_view_json, z.unknown()) };
    } catch {
      throw new ProofRepositoryUnavailableError();
    }
  }
}

function scopeFor(goalId: string) {
  return `${IDEMPOTENCY_SCOPE_PREFIX}${goalId}`;
}

function parseMutationResult(input: unknown): ProofLedgerMutationResult {
  try { return proofLedgerMutationResultSchema.parse(input); }
  catch { throw new ProofRepositoryUnavailableError(); }
}

function parseStoredMutation(raw: string, scope: ProofOwnerGoal) {
  try {
    const stored = parseBoundedJson(raw, storedMutationSchema);
    if (stored.ownerId !== scope.ownerId || stored.goalId !== scope.goalId) throw new Error("scope mismatch");
    return { ...stored, result: proofLedgerMutationResultSchema.parse(stored.result) };
  } catch {
    throw new ProofRepositoryUnavailableError();
  }
}

function serializeStoredMutation(
  command: ProofMutationLookup,
  result: ProofLedgerMutationResult,
) {
  const value = JSON.stringify({
    schemaVersion: PROOF_LEDGER_SCHEMA_VERSION,
    ownerId: command.ownerId,
    goalId: command.goalId,
    result,
  });
  if (byteLength(value) > D1_PROOF_VALUE_MAX_BYTES) throw new ProofRepositoryUnavailableError();
  return value;
}

function parseVersionRow(row: VersionRow): ProofVersion {
  return proofVersionSchema.parse({
    id: row.id,
    proofId: row.proof_id,
    versionNumber: Number(row.version_number),
    schemaVersion: row.schema_version,
    dailyUnitId: row.daily_unit_id,
    title: row.title,
    kind: row.kind,
    summary: row.summary,
    artifactUrl: row.artifact_url,
    assetId: row.asset_id,
    skillIds: parseBoundedJson(row.skill_ids_json, boundedIdArraySchema),
    completionCriteria: parseBoundedJson(row.completion_criteria_json, completionCriteriaSchema),
    visibility: row.visibility,
    createdAt: new Date(Number(row.created_at)).toISOString(),
    supersedesVersionId: row.supersedes_version_id,
  });
}

function parseReviewRow(row: ReviewRow): ProofReviewEvent {
  return proofReviewEventSchema.parse({
    id: row.id,
    proofId: row.proof_id,
    versionId: row.version_id,
    sequence: Number(row.sequence),
    mutationId: row.mutation_id,
    kind: row.kind,
    stateAfter: row.state_after,
    visibilityAfter: row.visibility_after,
    validatorKey: row.validator_key,
    outcome: row.outcome,
    reasonCodes: parseBoundedJson(row.reason_codes_json, reasonCodesSchema),
    occurredAt: new Date(Number(row.occurred_at)).toISOString(),
  });
}

function parseProjectionRow(row: ProjectionRow): SkillEvidenceProjection {
  return skillEvidenceProjectionSchema.parse({
    skillId: row.skill_id,
    audience: row.audience,
    status: row.status,
    completedUnitIds: parseBoundedJson(row.completed_unit_ids_json, boundedIdArraySchema),
    strongestProofId: row.proof_id,
    strongestVersionId: row.version_id,
    latestUsedAt: row.latest_use_at === null ? null : new Date(Number(row.latest_use_at)).toISOString(),
  });
}

function insertVersion(
  db: D1Database,
  command: ProofOwnerGoal,
  version: ProofVersion,
): D1PreparedStatement {
  return db.prepare(`INSERT INTO proof_versions
    (id,user_id,goal_id,proof_id,version_number,schema_version,daily_unit_id,title,kind,summary,
     artifact_url,asset_id,skill_ids_json,completion_criteria_json,visibility,supersedes_version_id,created_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)`)
    .bind(version.id, command.ownerId, command.goalId, version.proofId, version.versionNumber,
      version.schemaVersion, version.dailyUnitId, version.title, version.kind, version.summary,
      version.artifactUrl, version.assetId, JSON.stringify(version.skillIds),
      JSON.stringify(version.completionCriteria), version.visibility, version.supersedesVersionId,
      Date.parse(version.createdAt));
}

function insertReview(
  db: D1Database,
  command: ProofOwnerGoal,
  review: ProofReviewEvent,
): D1PreparedStatement {
  return db.prepare(`INSERT INTO proof_review_events
    (id,user_id,goal_id,proof_id,version_id,sequence,mutation_id,kind,state_after,visibility_after,
     validator_key,outcome,reason_codes_json,occurred_at,created_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?14)`)
    .bind(review.id, command.ownerId, command.goalId, review.proofId, review.versionId,
      review.sequence, review.mutationId, review.kind, review.stateAfter, review.visibilityAfter,
      review.validatorKey, review.outcome, JSON.stringify(review.reasonCodes), Date.parse(review.occurredAt));
}

function projectionStatements(
  db: D1Database,
  command: ProofOwnerGoal,
  projections: SkillEvidenceProjection[],
  audience: SkillEvidenceProjection["audience"],
  now: number,
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [db.prepare(`DELETE FROM user_skill_projections
    WHERE user_id = ?1 AND goal_id = ?2 AND audience = '${audience}'`)
    .bind(command.ownerId, command.goalId)];
  statements.push(...projections.map((projection) => db.prepare(`INSERT INTO user_skill_projections
    (user_id,goal_id,skill_id,audience,schema_version,status,proof_id,version_id,
     completed_unit_ids_json,latest_use_at,updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`)
    .bind(command.ownerId, command.goalId, projection.skillId, projection.audience,
      PROOF_LEDGER_SCHEMA_VERSION, projection.status, projection.strongestProofId,
      projection.strongestVersionId, JSON.stringify(projection.completedUnitIds),
      projection.latestUsedAt === null ? null : Date.parse(projection.latestUsedAt), now)));
  return statements;
}

function parseBoundedJson<T>(raw: string, schema: z.ZodType<T>): T {
  if (byteLength(raw) > D1_PROOF_VALUE_MAX_BYTES) throw new Error("stored JSON exceeds limit");
  return schema.parse(JSON.parse(raw) as unknown);
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function isConstraintError(error: unknown) {
  return error instanceof Error && /constraint|unique|foreign key|not null/iu.test(error.message);
}
