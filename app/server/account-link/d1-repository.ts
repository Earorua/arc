import { z } from "zod";
import {
  accountLinkProviderSchema,
  accountLinkStatusSchema,
  type AccountLinkIntent,
} from "./contracts";
import type { AccountLinkRepository } from "./repository";

const failureCodePattern = /^[A-Z][A-Z0-9_]{0,63}$/u;
const timestampSchema = z.number().int().nonnegative();
const nullableTimestampSchema = timestampSchema.nullable();

const accountLinkIntentRowSchema = z.object({
  id: z.string(),
  token_hash: z.string(),
  user_id: z.string(),
  source_provider: accountLinkProviderSchema,
  target_provider: accountLinkProviderSchema,
  status: accountLinkStatusSchema,
  expires_at: timestampSchema,
  verified_at: nullableTimestampSchema,
  consumed_at: nullableTimestampSchema,
  completed_at: nullableTimestampSchema,
  failure_code: z.string().regex(failureCodePattern).nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
}).strict();

const selectedColumns = `
  id, token_hash, user_id, source_provider, target_provider, status,
  expires_at, verified_at, consumed_at, completed_at, failure_code,
  created_at, updated_at
`;

function mapRow(row: unknown): AccountLinkIntent {
  const parsed = accountLinkIntentRowSchema.parse(row);
  return {
    id: parsed.id,
    tokenHash: parsed.token_hash,
    userId: parsed.user_id,
    sourceProvider: parsed.source_provider,
    targetProvider: parsed.target_provider,
    status: parsed.status,
    expiresAt: new Date(parsed.expires_at),
    verifiedAt: parsed.verified_at === null ? null : new Date(parsed.verified_at),
    consumedAt: parsed.consumed_at === null ? null : new Date(parsed.consumed_at),
    completedAt: parsed.completed_at === null ? null : new Date(parsed.completed_at),
    failureCode: parsed.failure_code,
    createdAt: new Date(parsed.created_at),
    updatedAt: new Date(parsed.updated_at),
  };
}

export class D1AccountLinkRepository implements AccountLinkRepository {
  constructor(private readonly db: D1Database) {}

  async create(input: Parameters<AccountLinkRepository["create"]>[0]): Promise<AccountLinkIntent> {
    const now = input.now.getTime();
    const expiresAt = input.expiresAt.getTime();
    const supersede = this.db.prepare(`
      UPDATE account_link_intents
      SET status = 'failed', failure_code = 'SUPERSEDED', updated_at = ?1
      WHERE user_id = ?2 AND target_provider = ?3
        AND status IN ('pending_reauth', 'verified')
    `).bind(now, input.userId, input.targetProvider);
    const insert = this.db.prepare(`
      INSERT INTO account_link_intents (
        id, token_hash, user_id, source_provider, target_provider, status,
        expires_at, verified_at, consumed_at, completed_at, failure_code,
        created_at, updated_at
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5, 'pending_reauth',
        ?6, NULL, NULL, NULL, NULL, ?7, ?7
      )
    `).bind(
      input.id,
      input.tokenHash,
      input.userId,
      input.sourceProvider,
      input.targetProvider,
      expiresAt,
      now,
    );

    await this.db.batch([supersede, insert]);

    return {
      id: input.id,
      tokenHash: input.tokenHash,
      userId: input.userId,
      sourceProvider: input.sourceProvider,
      targetProvider: input.targetProvider,
      status: "pending_reauth",
      expiresAt: new Date(expiresAt),
      verifiedAt: null,
      consumedAt: null,
      completedAt: null,
      failureCode: null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  async findByCredential(
    userId: string,
    tokenHash: string,
    now: Date,
  ): Promise<AccountLinkIntent | null> {
    await this.db.prepare(`
      UPDATE account_link_intents
      SET status = 'expired', updated_at = ?1
      WHERE user_id = ?2 AND token_hash = ?3
        AND status IN ('pending_reauth', 'verified')
        AND expires_at <= ?1
    `).bind(now.getTime(), userId, tokenHash).run();

    const row = await this.db.prepare(`
      SELECT ${selectedColumns}
      FROM account_link_intents
      WHERE user_id = ?1 AND token_hash = ?2
      LIMIT 1
    `).bind(userId, tokenHash).first<unknown>();
    return row === null ? null : mapRow(row);
  }

  async findById(id: string): Promise<AccountLinkIntent | null> {
    const row = await this.db.prepare(`
      SELECT ${selectedColumns}
      FROM account_link_intents
      WHERE id = ?1
      LIMIT 1
    `).bind(id).first<unknown>();
    return row === null ? null : mapRow(row);
  }

  async markVerified(
    id: string,
    userId: string,
    now: Date,
    expiresAt: Date,
  ): Promise<AccountLinkIntent | null> {
    const result = await this.db.prepare(`
      UPDATE account_link_intents
      SET status = 'verified', verified_at = ?1, expires_at = ?2, updated_at = ?1
      WHERE id = ?3 AND user_id = ?4
        AND status = 'pending_reauth' AND expires_at > ?1
    `).bind(now.getTime(), expiresAt.getTime(), id, userId).run();
    return result.meta.changes === 1 ? this.findById(id) : null;
  }

  async consume(id: string, userId: string, now: Date): Promise<AccountLinkIntent | null> {
    const result = await this.db.prepare(`
      UPDATE account_link_intents
      SET status = 'consumed', consumed_at = ?1, updated_at = ?1
      WHERE id = ?2 AND user_id = ?3
        AND status = 'verified' AND expires_at > ?1
    `).bind(now.getTime(), id, userId).run();
    return result.meta.changes === 1 ? this.findById(id) : null;
  }

  async complete(id: string, userId: string, now: Date): Promise<boolean> {
    const result = await this.db.prepare(`
      UPDATE account_link_intents
      SET status = 'completed', completed_at = ?1, updated_at = ?1
      WHERE id = ?2 AND user_id = ?3 AND status = 'consumed'
    `).bind(now.getTime(), id, userId).run();
    return result.meta.changes === 1;
  }

  async fail(id: string, userId: string, code: string, now: Date): Promise<boolean> {
    if (!failureCodePattern.test(code)) {
      throw new Error("Account link failure code must be a sanitized stable category.");
    }
    const result = await this.db.prepare(`
      UPDATE account_link_intents
      SET status = 'failed', failure_code = ?1, updated_at = ?2
      WHERE id = ?3 AND user_id = ?4
        AND (
          status = 'consumed'
          OR (status IN ('pending_reauth', 'verified') AND expires_at > ?2)
        )
    `).bind(code, now.getTime(), id, userId).run();
    return result.meta.changes === 1;
  }
}
