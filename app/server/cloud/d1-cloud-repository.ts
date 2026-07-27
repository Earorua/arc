import {
  cloudSnapshotSchema,
  demoStateSchema,
  migrationResultSchema,
  proofItemSchema,
  type CloudSnapshot,
  type CompletionMutation,
  type MigrationRequest,
  type RepositoryMigrationResult,
  type RepositorySnapshot,
  type SetupAnswersInput,
} from "../../contracts/cloud-state";
import { completeDemoUnit, mergeSetup } from "../../lib/demo-store";
import type { CloudRepository } from "./repository";

type GoalRow = {
  id: string;
  role_id: string;
  level: SetupAnswersInput["level"];
  weekly_minutes: number;
  target_weeks: number;
  updated_at: number;
};

type EventRow = { task_id: string };

type ProofRow = {
  id: string;
  title: string;
  kind: "completion" | "commit" | "project" | "note" | "upload";
  skill_ids_json: string;
  verified: number | boolean;
};

type JsonRow = { response_json: string };
type MigrationRow = { result_json: string };

type RepositoryOptions = {
  createId: () => string;
  now: () => Date;
  hash: (value: string) => Promise<string>;
};

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const defaultOptions: RepositoryOptions = {
  createId: () => crypto.randomUUID(),
  now: () => new Date(),
  hash: sha256,
};

function parseStringArray(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("D1 returned an invalid string array.");
  }
  return parsed;
}

export class D1CloudRepository implements CloudRepository {
  private readonly options: RepositoryOptions;

  constructor(
    private readonly db: D1Database,
    options: Partial<RepositoryOptions> = {},
  ) {
    this.options = { ...defaultOptions, ...options };
  }

  private async findActiveGoal(userId: string): Promise<GoalRow | null> {
    return this.db.prepare(`
      SELECT id, role_id, level, weekly_minutes, target_weeks, updated_at
      FROM career_goals
      WHERE user_id = ?1 AND active_slot = 1
      LIMIT 1
    `).bind(userId).first<GoalRow>();
  }

  async getSnapshot(userId: string): Promise<RepositorySnapshot | null> {
    const goal = await this.findActiveGoal(userId);
    if (!goal) return null;

    const [eventRows, proofRows] = await Promise.all([
      this.db.prepare(`
        SELECT task_id
        FROM learning_events
        WHERE user_id = ?1 AND goal_id = ?2 AND kind = 'completed'
        ORDER BY created_at ASC
      `).bind(userId, goal.id).all<EventRow>(),
      this.db.prepare(`
        SELECT id, title, kind, skill_ids_json, verified
        FROM proof_items
        WHERE user_id = ?1 AND goal_id = ?2
        ORDER BY created_at ASC
      `).bind(userId, goal.id).all<ProofRow>(),
    ]);

    const state = demoStateSchema.parse({
      setup: {
        roleId: goal.role_id,
        level: goal.level,
        weeklyMinutes: goal.weekly_minutes,
        targetWeeks: goal.target_weeks,
      },
      completedUnitIds: [...new Set(eventRows.results.map((row) => row.task_id))],
      proofs: proofRows.results.map((row) => proofItemSchema.parse({
        id: row.id,
        title: row.title,
        kind: row.kind,
        skillIds: parseStringArray(row.skill_ids_json),
        verified: Boolean(row.verified),
      })),
    });

    return {
      ownerId: userId,
      state,
      activeGoalId: goal.id,
      revision: new Date(goal.updated_at).toISOString(),
    };
  }

  async getMigrationResult(userId: string, migrationId: string): Promise<RepositoryMigrationResult | null> {
    const row = await this.db.prepare(`
      SELECT result_json
      FROM migration_runs
      WHERE user_id = ?1 AND migration_id = ?2 AND status = 'completed'
      LIMIT 1
    `).bind(userId, migrationId).first<MigrationRow>();

    if (!row) return null;
    return { ownerId: userId, ...migrationResultSchema.parse(JSON.parse(row.result_json)) };
  }

  async importState(userId: string, request: MigrationRequest): Promise<RepositoryMigrationResult> {
    const replay = await this.getMigrationResult(userId, request.migrationId);
    if (replay) return replay;

    const activeGoal = await this.findActiveGoal(userId);
    const roleConflicts = activeGoal && activeGoal.role_id !== request.state.setup.roleId;
    if (roleConflicts && request.conflictResolution === "reject") {
      return {
        ownerId: userId,
        migrationId: request.migrationId,
        status: "conflict",
        activeGoalId: activeGoal.id,
        importedCompletionCount: 0,
        importedProofCount: 0,
        availableResolutions: ["archive-import", "activate-import"],
      };
    }

    const now = this.options.now().getTime();
    const newGoalRequired = !activeGoal || Boolean(roleConflicts);
    const importedGoalId = newGoalRequired ? this.options.createId() : activeGoal.id;
    const archivedImport = Boolean(activeGoal && roleConflicts && request.conflictResolution === "archive-import");
    const result = migrationResultSchema.parse({
      migrationId: request.migrationId,
      status: "imported",
      activeGoalId: archivedImport ? activeGoal?.id ?? null : importedGoalId,
      importedCompletionCount: request.state.completedUnitIds.length,
      importedProofCount: request.state.proofs.length,
      availableResolutions: [],
    });
    const statements: D1PreparedStatement[] = [];

    statements.push(this.db.prepare(`
      INSERT INTO learner_profiles (id, user_id, state_version, created_at, updated_at)
      VALUES (?1, ?2, 1, ?3, ?3)
      ON CONFLICT(user_id) DO UPDATE SET updated_at = excluded.updated_at
    `).bind(this.options.createId(), userId, now));

    if (activeGoal && roleConflicts && request.conflictResolution === "activate-import") {
      statements.push(this.db.prepare(`
        UPDATE career_goals
        SET status = 'archived', active_slot = NULL, updated_at = ?1
        WHERE id = ?2 AND user_id = ?3 AND active_slot = 1
      `).bind(now, activeGoal.id, userId));
    }

    if (newGoalRequired) {
      statements.push(this.db.prepare(`
        INSERT INTO career_goals (
          id, user_id, role_id, level, weekly_minutes, target_weeks,
          status, active_slot, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
      `).bind(
        importedGoalId,
        userId,
        request.state.setup.roleId,
        request.state.setup.level,
        request.state.setup.weeklyMinutes,
        request.state.setup.targetWeeks,
        archivedImport ? "archived" : "active",
        archivedImport ? null : 1,
        now,
      ));
    } else {
      statements.push(this.db.prepare(`
        UPDATE career_goals
        SET level = ?1, weekly_minutes = ?2, target_weeks = ?3, updated_at = ?4
        WHERE id = ?5 AND user_id = ?6 AND active_slot = 1
      `).bind(
        request.state.setup.level,
        request.state.setup.weeklyMinutes,
        request.state.setup.targetWeeks,
        now,
        importedGoalId,
        userId,
      ));
    }

    for (const unitId of request.state.completedUnitIds) {
      statements.push(this.db.prepare(`
        INSERT INTO learning_events (
          id, user_id, goal_id, task_id, mutation_id, kind, payload_json, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, 'completed', '{}', ?6)
        ON CONFLICT(user_id, mutation_id) DO NOTHING
      `).bind(
        this.options.createId(),
        userId,
        importedGoalId,
        unitId,
        `${request.migrationId}:unit:${unitId}`,
        now,
      ));
    }

    for (const proof of request.state.proofs) {
      statements.push(this.db.prepare(`
        INSERT INTO proof_items (
          id, user_id, goal_id, source_task_id, title, kind,
          skill_ids_json, verified, created_at, updated_at
        ) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?8)
      `).bind(
        this.options.createId(),
        userId,
        importedGoalId,
        proof.title,
        proof.kind,
        JSON.stringify(proof.skillIds),
        proof.verified ? 1 : 0,
        now,
      ));
    }

    statements.push(this.db.prepare(`
      INSERT INTO migration_runs (
        id, user_id, migration_id, request_hash, status,
        checkpoint_json, result_json, started_at, completed_at
      ) VALUES (?1, ?2, ?3, ?4, 'completed', '{}', ?5, ?6, ?6)
    `).bind(
      this.options.createId(),
      userId,
      request.migrationId,
      await this.options.hash(JSON.stringify(request)),
      JSON.stringify(result),
      now,
    ));

    try {
      await this.db.batch(statements);
    } catch (error) {
      const winner = await this.getMigrationResult(userId, request.migrationId);
      if (winner) return winner;
      throw error;
    }
    return { ownerId: userId, ...result };
  }

  private async getIdempotentSnapshot(
    userId: string,
    scope: string,
    mutationId: string,
  ): Promise<RepositorySnapshot | null> {
    const row = await this.db.prepare(`
      SELECT response_json
      FROM idempotency_records
      WHERE user_id = ?1 AND scope = ?2 AND mutation_id = ?3
      LIMIT 1
    `).bind(userId, scope, mutationId).first<JsonRow>();

    if (!row) return null;
    return { ownerId: userId, ...cloudSnapshotSchema.parse(JSON.parse(row.response_json)) };
  }

  async saveSetup(
    userId: string,
    mutationId: string,
    setup: SetupAnswersInput,
  ): Promise<RepositorySnapshot> {
    const replay = await this.getIdempotentSnapshot(userId, "setup", mutationId);
    if (replay) return replay;
    const current = await this.getSnapshot(userId);
    if (!current) throw new Error("Arc cloud workspace is unavailable.");

    const snapshot: CloudSnapshot = {
      state: mergeSetup(current.state, setup),
      activeGoalId: current.activeGoalId,
      revision: mutationId,
    };
    const now = this.options.now().getTime();
    await this.db.batch([
      this.db.prepare(`
        UPDATE career_goals
        SET role_id = ?1, level = ?2, weekly_minutes = ?3, target_weeks = ?4, updated_at = ?5
        WHERE id = ?6 AND user_id = ?7 AND active_slot = 1
      `).bind(
        setup.roleId,
        setup.level,
        setup.weeklyMinutes,
        setup.targetWeeks,
        now,
        current.activeGoalId,
        userId,
      ),
      this.db.prepare(`
        INSERT INTO idempotency_records (id, user_id, scope, mutation_id, response_json, created_at)
        VALUES (?1, ?2, 'setup', ?3, ?4, ?5)
      `).bind(this.options.createId(), userId, mutationId, JSON.stringify(snapshot), now),
    ]);
    return { ownerId: userId, ...snapshot };
  }

  async recordCompletion(userId: string, request: CompletionMutation): Promise<RepositorySnapshot> {
    const replay = await this.getIdempotentSnapshot(userId, "completion", request.mutationId);
    if (replay) return replay;
    const current = await this.getSnapshot(userId);
    if (!current) throw new Error("Arc cloud workspace is unavailable.");

    const snapshot = cloudSnapshotSchema.parse({
      state: completeDemoUnit(current.state, {
        id: request.unitId,
        title: request.title,
        deliverable: request.deliverable,
        skillIds: request.skillIds,
        minutes: 1,
        steps: [],
      }),
      activeGoalId: current.activeGoalId,
      revision: request.mutationId,
    });
    const now = this.options.now().getTime();
    const proof = snapshot.state.proofs.find((item) => item.id === `proof-${request.unitId}`);
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`
        INSERT INTO learning_events (
          id, user_id, goal_id, task_id, mutation_id, kind, payload_json, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, 'completed', '{}', ?6)
        ON CONFLICT(user_id, mutation_id) DO NOTHING
      `).bind(
        this.options.createId(),
        userId,
        current.activeGoalId,
        request.unitId,
        request.mutationId,
        now,
      ),
    ];

    if (proof) {
      statements.push(this.db.prepare(`
        INSERT INTO proof_items (
          id, user_id, goal_id, source_task_id, title, kind,
          skill_ids_json, verified, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
        ON CONFLICT(user_id, source_task_id) DO NOTHING
      `).bind(
        proof.id,
        userId,
        current.activeGoalId,
        request.unitId,
        proof.title,
        proof.kind,
        JSON.stringify(proof.skillIds),
        proof.verified ? 1 : 0,
        now,
      ));
    }

    statements.push(this.db.prepare(`
      INSERT INTO idempotency_records (id, user_id, scope, mutation_id, response_json, created_at)
      VALUES (?1, ?2, 'completion', ?3, ?4, ?5)
    `).bind(this.options.createId(), userId, request.mutationId, JSON.stringify(snapshot), now));

    await this.db.batch(statements);
    return { ownerId: userId, ...snapshot };
  }
}
