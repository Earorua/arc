export type RecoveryIdentity = {
  operationId: string;
  sourceUserId: string;
  targetUserId: string;
  sourceAccountId: string;
  targetAccountId: string;
  sourceProvider: "github" | "google";
  targetProvider: "github" | "google";
  primaryPathId: string;
};

function identityValues(input: RecoveryIdentity) {
  return [input.operationId, input.sourceUserId, input.targetUserId,
    input.sourceAccountId, input.targetAccountId, input.sourceProvider,
    input.targetProvider, input.primaryPathId];
}

const matchingAudit = `SELECT 1 FROM account_recoveries WHERE
  id = ? AND source_user_id = ? AND target_user_id = ? AND source_account_id = ?
  AND target_account_id = ? AND source_provider = ? AND target_provider = ? AND primary_path_id = ?`;

const readyConditions = `
  EXISTS (SELECT 1 FROM accounts WHERE id = ? AND user_id = ? AND provider_id = ?)
  AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND user_id = ? AND provider_id = ?)
  AND (SELECT COUNT(*) FROM accounts WHERE user_id = ?) = 1
  AND (SELECT COUNT(*) FROM accounts WHERE user_id = ?) = 1
  AND NOT EXISTS (SELECT 1 FROM account_link_intents
    WHERE user_id IN (?, ?) AND status = 'completing')
  AND EXISTS (SELECT 1 FROM planning_workspaces w JOIN career_goals g
    ON g.user_id = w.user_id AND g.id = w.goal_id
    WHERE w.user_id = ? AND w.active_path_version_id = ? AND g.status = 'active')
  AND NOT EXISTS (SELECT 1 FROM account_recoveries
    WHERE source_user_id IN (?, ?) OR target_user_id = ? OR id = ?)`;

function readyValues(input: RecoveryIdentity) {
  return [input.sourceAccountId, input.sourceUserId, input.sourceProvider,
    input.targetAccountId, input.targetUserId, input.targetProvider,
    input.sourceUserId, input.targetUserId, input.sourceUserId, input.targetUserId,
    input.targetUserId, input.primaryPathId,
    input.sourceUserId, input.targetUserId, input.sourceUserId, input.operationId];
}

export async function inspectAccountRecovery(database: D1Database, input: RecoveryIdentity) {
  const row = await database.prepare(`SELECT
    CASE WHEN ${readyConditions} THEN 1 ELSE 0 END AS ready,
    CASE WHEN EXISTS (${matchingAudit})
      AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND user_id = ? AND provider_id = ?)
      AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND user_id = ? AND provider_id = ?)
      AND NOT EXISTS (SELECT 1 FROM accounts WHERE user_id = ?)
      THEN 1 ELSE 0 END AS completed,
    (SELECT COUNT(*) FROM career_goals WHERE user_id = ?) AS archivedGoalCount,
    (SELECT COUNT(*) FROM learning_tasks WHERE user_id = ?) AS archivedTaskCount,
    (SELECT COUNT(*) FROM proof_items WHERE user_id = ?) AS archivedProofCount,
    (SELECT active_path_version_id FROM planning_workspaces w JOIN career_goals g
      ON g.user_id = w.user_id AND g.id = w.goal_id
      WHERE w.user_id = ? AND g.status = 'active' LIMIT 1) AS primaryPathId
  `).bind(...readyValues(input), ...identityValues(input),
    input.sourceAccountId, input.targetUserId, input.sourceProvider,
    input.targetAccountId, input.targetUserId, input.targetProvider, input.sourceUserId,
    input.sourceUserId, input.sourceUserId, input.sourceUserId, input.targetUserId,
  ).first<{ ready: number; completed: number; archivedGoalCount: number; archivedTaskCount: number; archivedProofCount: number; primaryPathId: string | null }>();
  if (!row) throw new Error("Account recovery preconditions unavailable");
  return {
    operationId: input.operationId,
    status: row.completed ? "completed" as const : row.ready ? "ready" as const : "blocked" as const,
    primaryPathId: row.primaryPathId,
    archivedGoalCount: row.archivedGoalCount,
    archivedTaskCount: row.archivedTaskCount,
    archivedProofCount: row.archivedProofCount,
  };
}

export async function applyAccountRecovery(database: D1Database, input: RecoveryIdentity, now: number) {
  if (input.sourceUserId === input.targetUserId || input.sourceProvider === input.targetProvider) {
    throw new Error("Account recovery preconditions failed");
  }
  const before = await inspectAccountRecovery(database, input);
  if (before.status === "completed") return before;
  if (before.status !== "ready") throw new Error("Account recovery preconditions failed");

  // D1 executes a batch transactionally. Repeat every eligibility check inside it:
  // the preceding read is informative and must not authorize a stale write.
  await database.batch([
    database.prepare(`INSERT INTO account_recoveries
      (id,source_user_id,target_user_id,source_account_id,target_account_id,source_provider,target_provider,primary_path_id,created_at)
      SELECT ?,?,?,?,?,?,?,?,? WHERE ${readyConditions} ON CONFLICT DO NOTHING`
    ).bind(...identityValues(input), now, ...readyValues(input)),
    database.prepare(`UPDATE accounts SET user_id = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND provider_id = ? AND EXISTS (${matchingAudit})`
    ).bind(input.targetUserId, now, input.sourceAccountId, input.sourceUserId, input.sourceProvider, ...identityValues(input)),
    database.prepare(`DELETE FROM sessions WHERE user_id = ? AND EXISTS (${matchingAudit})
      AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND user_id = ?)`
    ).bind(input.sourceUserId, ...identityValues(input), input.sourceAccountId, input.targetUserId),
    database.prepare(`UPDATE account_link_intents SET status = 'failed', failure_code = 'ACCOUNT_RECOVERED', updated_at = ?
      WHERE user_id IN (?, ?) AND status IN ('pending_reauth','verified','consumed')
      AND EXISTS (${matchingAudit}) AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND user_id = ?)`
    ).bind(now, input.sourceUserId, input.targetUserId, ...identityValues(input), input.sourceAccountId, input.targetUserId),
  ]);
  const result = await inspectAccountRecovery(database, input);
  if (result.status !== "completed") throw new Error("Account recovery preconditions changed");
  return result;
}
