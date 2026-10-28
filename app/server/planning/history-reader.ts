import { historyIdSchema, historyOffsetSchema, planningHistorySchema, type PlanningHistory } from "../../contracts/planning-history";
import { learningPathVersionSchema } from "../../contracts/planning";
import { PlanningNotFoundError, PlanningService, PlanningUnavailableError } from "./service";

type GoalRow = { id: string; role_id: string; target_weeks: number; weekly_minutes: number; created_at: number; has_workspace: number; active_path_version_id: string | null; path_payload: string | null; completed_unit_ids: string };

export class D1PlanningHistoryReader {
  constructor(private readonly db: D1Database, private readonly planning: Pick<PlanningService, "getSavedWorkspaceResponse">) {}

  async list(ownerId: string, offset = 0): Promise<PlanningHistory> {
    historyIdSchema.parse(ownerId);
    historyOffsetSchema.parse(offset);
    try {
      const result = await this.db.prepare(`SELECT g.id, g.role_id, g.target_weeks, g.weekly_minutes, g.created_at,
        (w.id IS NOT NULL) AS has_workspace, w.active_path_version_id, p.payload_json AS path_payload,
        (SELECT json_group_array(DISTINCT e.unit_id) FROM planning_events e
          WHERE e.user_id=g.user_id AND e.goal_id=g.id AND e.workspace_id=w.id
            AND e.sequence<w.next_sequence AND e.kind='completed' AND e.unit_id IS NOT NULL) AS completed_unit_ids
        FROM career_goals g
        LEFT JOIN planning_workspaces w ON w.user_id=g.user_id AND w.goal_id=g.id
        LEFT JOIN learning_path_versions p ON p.user_id=g.user_id AND p.goal_id=g.id AND p.id=w.active_path_version_id
        WHERE g.user_id=?1 AND g.status='archived' AND g.active_slot IS NULL
        ORDER BY g.created_at DESC, g.id ASC LIMIT 21 OFFSET ?2`).bind(ownerId, offset).all<GoalRow>();
      if (!result.success) throw new PlanningUnavailableError();
      return planningHistorySchema.parse({
        goals: result.results.slice(0, 20).map(row => ({
          id: row.id, roleId: row.role_id, targetWeeks: row.target_weeks,
          weeklyMinutes: row.weekly_minutes, createdAt: row.created_at, hasWorkspace: row.has_workspace === 1,
          progress: savedProgress(row),
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

function savedProgress(row: GoalRow): PlanningHistory["goals"][number]["progress"] {
  if (!row.has_workspace || !row.path_payload) return null;
  try {
    const path = learningPathVersionSchema.parse(JSON.parse(row.path_payload));
    if (path.id !== row.active_path_version_id) return null;
    const completed: unknown = JSON.parse(row.completed_unit_ids);
    if (!Array.isArray(completed) || completed.some(id => typeof id !== "string")) return null;
    const completedIds = new Set(completed);
    return { completedUnits: path.units.filter(unit => completedIds.has(unit.id)).length, totalUnits: path.units.length };
  } catch { return null; }
}
