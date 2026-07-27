import { z } from "zod";

type FeatureFlagRow = { enabled: number; cohort_json: string };

const cohortSchema = z.object({
  userIds: z.array(z.string().trim().min(1).max(160)).max(1000).optional(),
}).strict();

export class D1FeatureCohort {
  constructor(private readonly db: D1Database) {}

  async allows(feature: string, userId: string): Promise<boolean> {
    if (!feature.trim() || !userId.trim()) return false;
    try {
      const row = await this.db.prepare(`
        SELECT enabled, cohort_json
        FROM feature_flags
        WHERE key = ?1
        LIMIT 1
      `).bind(feature).first<FeatureFlagRow>();
      if (!row?.enabled) return false;
      const parsed = cohortSchema.safeParse(JSON.parse(row.cohort_json));
      if (!parsed.success) return false;
      return parsed.data.userIds === undefined || parsed.data.userIds.includes(userId);
    } catch {
      return false;
    }
  }
}
