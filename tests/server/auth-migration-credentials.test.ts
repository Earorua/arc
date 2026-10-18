// @vitest-environment node
import { describe, expect, it } from "vitest";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import {
  cleanupFixture,
  fixtureHarness,
  login,
  makeAuth,
  NEW_SECRET,
  NOW,
  OLD_SECRET,
  ORIGIN,
  preservedRows,
  rows,
  sessionCookie,
  THEN,
  type Fixture,
} from "../helpers/auth-migration-fixture";

const harness = fixtureHarness();

async function getSession(f: Fixture, cookie: string) {
  const response = await f.auth.handler(new Request(
    `${ORIGIN}/api/auth/get-session?disableCookieCache=true&disableRefresh=true`,
    { headers: { cookie } },
  ));
  expect(response.status).toBe(200);
  return response.json();
}

describe("auth migration token and session acceptance", () => {
  it.each([undefined, "synthetic-fresh-refresh"])("re-encrypts fresh tokens; refresh=%s", async (refreshToken) => {
    const f = await harness.fixture();
    const before = preservedRows(f);
    const oldContext = await makeAuth(f.db, OLD_SECRET).$context;
    const newContext = await f.auth.$context;
    expect(typeof oldContext.secretConfig).toBe("object");
    expect(typeof newContext.secretConfig).toBe("object");
    if (typeof oldContext.secretConfig === "string" || typeof newContext.secretConfig === "string") {
      throw new Error("SYNTHETIC_ROTATION_CONFIG_REQUIRED");
    }
    expect(oldContext.secretConfig.currentVersion).toBe(1);
    expect(newContext.secretConfig.currentVersion).toBe(1);
    expect(oldContext.secretConfig.keys.get(1)).toBe(OLD_SECRET);
    expect(newContext.secretConfig.keys.get(1)).toBe(NEW_SECRET);

    const oldAccess = await symmetricEncrypt({ key: oldContext.secretConfig, data: "synthetic-old-access" });
    const oldRefresh = await symmetricEncrypt({ key: oldContext.secretConfig, data: "synthetic-old-refresh" });
    await expect(symmetricDecrypt({ key: oldContext.secretConfig, data: oldRefresh }))
      .resolves.toBe("synthetic-old-refresh");
    f.db.database.prepare("UPDATE accounts SET access_token=?,refresh_token=? WHERE id=?")
      .run(oldAccess, oldRefresh, "google-a");
    await cleanupFixture(f);
    expect(rows(f, "accounts").find((row) => row.id === "google-a"))
      .toMatchObject({ access_token: null, refresh_token: null, scope: null });

    const result = await login(f, "google", "a", { accessToken: "synthetic-fresh-access", refreshToken });
    expect(result.error).toBeNull();
    expect(result.data?.user.id).toBe("owner-a");
    const account = rows(f, "accounts").find((row) => row.id === "google-a")!;
    expect(account.access_token).toBeTypeOf("string");
    const access = String(account.access_token);
    expect(access).not.toBe("synthetic-fresh-access");
    expect(access).not.toBe(oldAccess);
    await expect(symmetricDecrypt({ key: newContext.secretConfig, data: access }))
      .resolves.toBe("synthetic-fresh-access");
    await expect(symmetricDecrypt({ key: oldContext.secretConfig, data: access })).rejects.toThrow();
    if (refreshToken === undefined) {
      expect(account.refresh_token).toBeNull();
    } else {
      expect(account.refresh_token).toBeTypeOf("string");
      await expect(symmetricDecrypt({ key: newContext.secretConfig, data: String(account.refresh_token) }))
        .resolves.toBe(refreshToken);
      await expect(symmetricDecrypt({ key: oldContext.secretConfig, data: String(account.refresh_token) }))
        .rejects.toThrow();
    }
    expect(account).toMatchObject({
      id_token: null,
      access_token_expires_at: null,
      refresh_token_expires_at: null,
      scope: null,
    });
    expect(preservedRows(f)).toEqual(before);
  });

  it("separates old signature rejection, deleted session rejection, and fresh owner acceptance", async () => {
    const f = await harness.fixture();
    f.db.database.prepare("INSERT INTO sessions(id,token,user_id,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?)")
      .run("imported-session", "synthetic-imported-token", "owner-a", NOW + 600_000, THEN, THEN);
    const imported = rows(f, "sessions");
    const oldSignature = await sessionCookie(f, "synthetic-imported-token", OLD_SECRET);
    expect(await getSession(f, oldSignature)).toBeNull();
    expect(rows(f, "sessions")).toEqual(imported);

    const currentSignature = await sessionCookie(f, "synthetic-imported-token");
    expect(await getSession(f, currentSignature)).toMatchObject({
      user: { id: "owner-a" },
      session: { id: "imported-session", userId: "owner-a" },
    });
    expect(rows(f, "sessions")).toEqual(imported);
    expect(await cleanupFixture(f)).toMatchObject({ sessionsRemoved: 1 });
    expect(rows(f, "sessions")).toEqual([]);
    expect(await getSession(f, currentSignature)).toBeNull();

    const fresh = await login(f);
    expect(fresh.error).toBeNull();
    expect(fresh.data?.user.id).toBe("owner-a");
    if (!fresh.data) throw new Error("SYNTHETIC_LOGIN_FAILED");
    expect(fresh.data.session.token).not.toBe("synthetic-imported-token");
    const freshCookie = await sessionCookie(f, fresh.data.session.token);
    expect(await getSession(f, freshCookie)).toMatchObject({
      user: { id: "owner-a" },
      session: { id: fresh.data.session.id, userId: "owner-a" },
    });
    expect(rows(f, "sessions")).toHaveLength(1);
    expect(rows(f, "sessions")[0].user_id).toBe("owner-a");
  });
});
