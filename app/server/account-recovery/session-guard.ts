import { APIError } from "better-auth/api";

export async function isRetiredAccount(database: D1Database, userId: string) {
  return Boolean(await database.prepare(
    "SELECT 1 FROM account_recoveries WHERE source_user_id = ? LIMIT 1",
  ).bind(userId).first());
}

export async function rejectRetiredSession(database: D1Database, session: { id: string; userId: string }) {
  if (!await isRetiredAccount(database, session.userId)) return;
  await database.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?")
    .bind(session.id, session.userId).run();
  // A callback may have captured the old user before recovery. Check after the
  // insert, before cookies are issued. Better Auth can re-run an after-hook;
  // denial depends on the archive relationship, not the DELETE row count.
  throw APIError.from("UNAUTHORIZED", {
    code: "ACCOUNT_RECOVERED", message: "Your account was updated. Please sign in again.",
  });
}
