import type { AccountLinkStatus } from "../../app/server/account-link/contracts";
import { serializeAccountLinkCookie } from "../../app/server/account-link/cookie";
import { hashAccountLinkCredential } from "../../app/server/account-link/crypto";
import { NOW, ORIGIN, THEN, type Fixture } from "./auth-migration-fixture";

export const ACTIVE_STATES = ["pending_reauth", "verified", "consumed", "completing"] as const;

export async function seedIntent(f: Fixture, status: AccountLinkStatus, id = `old-${status}`) {
  const credential = `synthetic-credential-${id}`;
  const expired = ["consumed", "completing", "expired"].includes(status);
  f.db.database.prepare(`INSERT INTO account_link_intents(
    id,token_hash,user_id,source_provider,target_provider,status,expires_at,verified_at,
    consumed_at,completed_at,failure_code,created_at,updated_at
  ) VALUES (?,?,?,'google','github',?,?,?,?,?,?,?,?)`).run(
    id,
    await hashAccountLinkCredential(credential),
    "owner-a",
    status,
    expired ? NOW - 1 : NOW + 600_000,
    status === "pending_reauth" ? null : THEN,
    ["consumed", "completing", "completed"].includes(status) ? THEN : null,
    status === "completed" ? THEN : null,
    status === "failed" ? "PREEXISTING_FAILURE" : null,
    THEN,
    THEN,
  );
  return { id, credential };
}

export function linkCookie(credential: string) {
  return serializeAccountLinkCookie(credential, 600).split(";", 1)[0];
}

export function arcRequest(route: "start" | "continue" | "status", cookie: string) {
  const headers = new Headers({ origin: ORIGIN, cookie });
  if (route === "start") headers.set("content-type", "application/x-www-form-urlencoded");
  return new Request(`${ORIGIN}/api/account-link/${route}`, {
    method: route === "status" ? "GET" : "POST",
    headers,
    ...(route === "start" ? { body: new URLSearchParams({ targetProvider: "github" }) } : {}),
  });
}
