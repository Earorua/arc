import { historyIdSchema, historyOffsetSchema, planningHistorySchema, type PlanningHistory } from "../../contracts/planning-history";
import { PlanningNotFoundError, PlanningService, PlanningUnavailableError } from "./service";

type GoalRow = { id: string; role_id: string; target_weeks: number; weekly_minutes: number; created_at: number; has_workspace: number };

export class D1PlanningHistoryReader {
  constructor(private readonly db: D1Database, private readonly planning: Pick<PlanningService, "getSavedWorkspaceResponse">) {}

  async list(ownerId: string, offset = 0): Promise<PlanningHistory> {
    historyIdSchema.parse(ownerId);
    historyOffsetSchema.parse(offset);
    try {
      const result = await this.db.prepare(`SELECT g.id, g.role_id, g.target_weeks, g.weekly_minutes, g.created_at,
        EXISTS(SELECT 1 FROM planning_workspaces w WHERE w.user_id=g.user_id AND w.goal_id=g.id) AS has_workspace
        FROM career_goals g WHERE g.user_id=?1 AND g.status='archived' AND g.active_slot IS NULL
        ORDER BY g.created_at DESC, g.id ASC LIMIT 21 OFFSET ?2`).bind(ownerId, offset).all<GoalRow>();
      if (!result.success) throw new PlanningUnavailableError();
      return planningHistorySchema.parse({
        goals: result.results.slice(0, 20).map(row => ({
          id: row.id, roleId: row.role_id, targetWeeks: row.target_weeks,
          weeklyMinutes: row.weekly_minutes, createdAt: row.created_at, hasWorkspace: row.has_workspace === 1,
        })),
        nextOffset: result.results.length > 20 ? offset + 20 : null,
      });
    } catch { throw new PlanningUnavailableError(); }
  }

  async load(ownerId: string, goalId: string) {
    historyIdSchema.parse(ownerId);
    historyIdSchema.parse(goalId);
    let row: { id: string } | null;
    try {
      row = await this.db.prepare(`SELECT id FROM career_goals
        WHERE user_id=?1 AND id=?2 AND status='archived' AND active_slot IS NULL LIMIT 1`)
        .bind(ownerId, goalId).first<{ id: string }>();
    } catch { throw new PlanningUnavailableError(); }
    if (!row) throw new PlanningNotFoundError();
    return this.planning.getSavedWorkspaceResponse(ownerId, goalId);
  }
}
