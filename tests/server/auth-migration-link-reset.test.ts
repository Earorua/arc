// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSignedLinkContext, verifySignedLinkContext } from "../../app/server/account-link/crypto";
import {
  arcHandlers,
  cleanupFixture,
  cookiePairs,
  fixtureHarness,
  loginCookie,
  NEW_SECRET,
  NOW,
  OLD_SECRET,
  ORIGIN,
  preservedRows,
  rows,
} from "../helpers/auth-migration-fixture";
import { ACTIVE_STATES, arcRequest, linkCookie, seedIntent } from "../helpers/auth-migration-link";

const harness = fixtureHarness();

describe("auth migration Arc reset acceptance", () => {
  it.each(ACTIVE_STATES)("makes old %s inert while permitting a fresh missing-target start", async (status) => {
    const f = await harness.fixture();
    const old = await seedIntent(f, status);
    for (const historical of ["completed", "failed", "expired"] as const) {
      await seedIntent(f, historical, `history-${historical}`);
    }
    const imported = rows(f, "account_link_intents");
    expect(await cleanupFixture(f)).toMatchObject({ intentsFailed: 1 });
    const expected = imported.map((row) => row.id === old.id
      ? { ...row, status: "failed", failure_code: "AUTH_MIGRATION_RESET", updated_at: NOW }
      : row);
    expect(rows(f, "account_link_intents")).toEqual(expected);

    const session = await loginCookie(f);
    const before = preservedRows(f);
    const accountsBefore = rows(f, "accounts");
    const handlers = arcHandlers(f);
    const oldCookies = `${session}; ${linkCookie(old.credential)}`;
    const statusResponse = await handlers.status(arcRequest("status", oldCookies));
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toMatchObject({ stage: "failed", targetProvider: "github" });
    const continued = await handlers.continue(arcRequest("continue", oldCookies));
    expect(continued.status).toBe(409);
    expect(await continued.json()).toMatchObject({ error: { code: "CONFLICT" } });
    expect(rows(f, "account_link_intents")).toEqual(expected);
    expect(rows(f, "verifications")).toEqual([]);

    const fresh = await handlers.start(arcRequest("start", session));
    expect(fresh.status).toBe(303);
    const authorization = new URL(fresh.headers.get("location")!);
    expect(authorization.searchParams.get("state")).toBeTruthy();
    expect(cookiePairs(fresh.headers)).not.toBe("");
    const all = rows(f, "account_link_intents");
    expect(all.filter((row) => expected.some((prior) => prior.id === row.id))).toEqual(expected);
    const created = all.filter((row) => !expected.some((prior) => prior.id === row.id));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      status: "pending_reauth",
      user_id: "owner-a",
      source_provider: "google",
      target_provider: "github",
    });
    expect(rows(f, "verifications")).toHaveLength(1);
    expect(JSON.parse(String(rows(f, "verifications")[0].value)).link.userId).toBe("owner-a");
    expect(rows(f, "accounts")).toEqual(accountsBefore);
    expect(preservedRows(f)).toEqual(before);
  });

  it.each(ACTIVE_STATES)("rejects old and current signed internal proofs for reset %s", async (status) => {
    const f = await harness.fixture();
    const old = await seedIntent(f, status);
    await cleanupFixture(f);
    const session = await loginCookie(f);
    const intentsBefore = rows(f, "account_link_intents");
    const accountsBefore = rows(f, "accounts");
    const businessBefore = preservedRows(f);
    const phase = status === "pending_reauth" ? "reauth" : "target";
    const provider = phase === "reauth" ? "google" : "github";

    for (const secret of [OLD_SECRET, NEW_SECRET]) {
      const proof = await createSignedLinkContext(secret, {
        kind: "internal",
        intentId: old.id,
        userId: "owner-a",
        provider,
        phase,
        issuedAt: NOW,
        expiresAt: NOW + 60_000,
        nonce: "synthetic-replay-proof",
      });
      if (secret === OLD_SECRET) {
        await expect(verifySignedLinkContext(NEW_SECRET, proof, "internal", NOW)).rejects.toThrow();
      } else {
        await expect(verifySignedLinkContext(NEW_SECRET, proof, "internal", NOW)).resolves.toMatchObject({
          intentId: old.id,
          userId: "owner-a",
        });
      }
      await expect(f.auth.api.linkSocialAccount({
        headers: new Headers({ origin: ORIGIN, cookie: session, "x-arc-link-proof": proof }),
        body: { provider, disableRedirect: true },
      })).rejects.toMatchObject({ status: "FORBIDDEN", body: { code: "ARC_ACCOUNT_LINK_DENIED" } });
      expect(rows(f, "account_link_intents")).toEqual(intentsBefore);
      expect(rows(f, "accounts")).toEqual(accountsBefore);
      expect(rows(f, "verifications")).toEqual([]);
      expect(preservedRows(f)).toEqual(businessBefore);
    }
  });

  it("keeps a completing intent's inserted target authoritative after reset", async () => {
    const f = await harness.fixture({ linkedBoth: true });
    const old = await seedIntent(f, "completing");
    const importedMappings = preservedRows(f).accountIdentities;
    await cleanupFixture(f);
    const session = await loginCookie(f);
    const intentsBefore = rows(f, "account_link_intents");
    expect(intentsBefore.find((row) => row.id === old.id)).toMatchObject({
      status: "failed",
      failure_code: "AUTH_MIGRATION_RESET",
      expires_at: NOW - 1,
    });
    const listed = await f.auth.api.listUserAccounts({ headers: new Headers({ cookie: session }) });
    expect(listed.map((row) => [row.id, row.providerId]).sort()).toEqual([
      ["github-a", "github"],
      ["google-a", "google"],
    ]);
    expect(listed.every((row) => row.scopes.length === 0)).toBe(true);
    const response = await arcHandlers(f).start(arcRequest("start", session));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "CONFLICT" } });
    expect(rows(f, "account_link_intents")).toEqual(intentsBefore);
    expect(preservedRows(f).accountIdentities).toEqual(importedMappings);
    expect(rows(f, "verifications")).toEqual([]);
  });
});
