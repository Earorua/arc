// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readAccountLinkCookie } from "../../app/server/account-link/cookie";
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
  THEN,
  type Fixture,
  type Provider,
} from "../helpers/auth-migration-fixture";
import { ACTIVE_STATES, arcRequest, linkCookie, seedIntent } from "../helpers/auth-migration-link";
import { callback, signStateCookie } from "../helpers/auth-migration-oauth";

const harness = fixtureHarness();

type OAuthState = {
  arcLinkContext: string;
  link: { userId: string };
  callbackURL: string;
  errorURL: string;
  oauthState: string;
  expiresAt: number;
};

type ArcFlow = {
  state: string;
  verification: ReturnType<typeof rows>[number];
  payload: OAuthState;
  proof: Awaited<ReturnType<typeof verifySignedLinkContext>>;
  provider: Provider;
  credential: string;
  cookie: string;
};

async function beginArc(f: Fixture, phase: "reauth" | "target"): Promise<ArcFlow> {
  const session = await loginCookie(f);
  const handlers = arcHandlers(f);
  let response: Response;
  let credential: string;

  if (phase === "reauth") {
    response = await handlers.start(arcRequest("start", session));
    const startedCredential = readAccountLinkCookie(new Headers({ cookie: cookiePairs(response.headers) }));
    if (!startedCredential) throw new Error("SYNTHETIC_LINK_CREDENTIAL_REQUIRED");
    credential = startedCredential;
  } else {
    // This is an explicitly synthetic verified grant precondition. It does not
    // simulate provider success or make a provider request.
    const grant = await seedIntent(f, "verified", "fresh-target-grant");
    credential = grant.credential;
    response = await handlers.continue(arcRequest("continue", `${session}; ${linkCookie(credential)}`));
  }

  expect(response.status).toBe(303);
  const authorization = new URL(response.headers.get("location") ?? "https://arc.invalid");
  const state = authorization.searchParams.get("state");
  expect(state).toBeTruthy();
  if (!state) throw new Error("SYNTHETIC_STATE_REQUIRED");

  const verification = rows(f, "verifications").find((row) =>
    JSON.parse(String(row.value)).oauthState === state);
  expect(verification).toBeDefined();
  if (!verification) throw new Error("SYNTHETIC_OAUTH_VERIFICATION_REQUIRED");

  const payload = JSON.parse(String(verification.value)) as OAuthState;
  const proof = await verifySignedLinkContext(NEW_SECRET, payload.arcLinkContext, "oauth", NOW);
  const provider = phase === "reauth" ? "google" : "github";
  expect(proof).toMatchObject({ kind: "oauth", userId: "owner-a", phase, provider });
  expect(payload.link.userId).toBe("owner-a");
  expect(payload.callbackURL).toBe(phase === "reauth" ? "/today?link=verified" : "/today?link=complete");
  expect(payload.errorURL).toBe(`/today?link=error&stage=${phase}`);
  expect(verification.identifier).not.toBe(state);

  return {
    state,
    verification,
    payload,
    proof,
    provider,
    credential,
    cookie: `${session}; ${cookiePairs(response.headers)}; ${linkCookie(credential)}`,
  };
}

describe("auth migration actual Arc callback acceptance", () => {
  it.each(["reauth", "target"] as const)("settles an actual %s cancellation through the Arc callback hooks", async (phase) => {
    const f = await harness.fixture();
    await cleanupFixture(f);
    const flow = await beginArc(f, phase);
    const before = preservedRows(f);
    const accountsBefore = rows(f, "accounts");

    const response = await callback(f, flow.provider, flow.state, flow.cookie, "error", "access_denied");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(flow.payload.errorURL);
    expect(rows(f, "verifications")).toEqual([]);
    expect(rows(f, "account_link_intents").find((row) => row.id === flow.proof.intentId)).toMatchObject({
      user_id: "owner-a",
      status: "failed",
      failure_code: "OAUTH_CANCELLED",
    });
    expect(rows(f, "accounts")).toEqual(accountsBefore);
    expect(preservedRows(f)).toEqual(before);
  });

  it.each(ACTIVE_STATES)("keeps pre-reset %s OAuth state inert even after an attacker restores the row", async (status) => {
    const f = await harness.fixture();
    await cleanupFixture(f);
    const phase = status === "pending_reauth" ? "reauth" : "target";
    const flow = await beginArc(f, phase);

    const desiredStatus = status;
    f.db.database.prepare(`UPDATE account_link_intents SET status=?,expires_at=?,verified_at=?,consumed_at=?,updated_at=? WHERE id=?`)
      .run(
        desiredStatus,
        ["consumed", "completing"].includes(status) ? NOW - 1 : NOW + 600_000,
        status === "pending_reauth" ? null : THEN,
        ["consumed", "completing"].includes(status) ? THEN : null,
        THEN,
        flow.proof.intentId,
      );
    const importedIntents = rows(f, "account_link_intents");
    expect(await cleanupFixture(f)).toMatchObject({
      intentsFailed: 1,
      verificationsRemoved: 1,
      sessionsRemoved: 1,
    });
    expect(rows(f, "verifications")).toEqual([]);
    const resetIntents = importedIntents.map((row) => ({
      ...row,
      status: "failed",
      failure_code: "AUTH_MIGRATION_RESET",
      updated_at: NOW,
    }));
    expect(rows(f, "account_link_intents")).toEqual(resetIntents);

    const freshSession = await loginCookie(f);
    const accountsBefore = rows(f, "accounts");
    const sessionsBefore = rows(f, "sessions");
    const preservedBefore = preservedRows(f);
    for (const secret of [OLD_SECRET, NEW_SECRET]) {
      const signedProof = await createSignedLinkContext(secret, flow.proof);
      await expect(verifySignedLinkContext(secret, signedProof, "oauth", NOW)).resolves.toEqual(flow.proof);
      if (secret === OLD_SECRET) {
        await expect(verifySignedLinkContext(NEW_SECRET, signedProof, "oauth", NOW)).rejects.toThrow();
      } else {
        await expect(verifySignedLinkContext(NEW_SECRET, signedProof, "oauth", NOW)).resolves.toEqual(flow.proof);
      }

      // A direct fixture-only reinsertion proves that the Arc hook binds the
      // callback to the failed intent. Migration code never restores this row.
      f.db.database.prepare(`INSERT INTO verifications(id,identifier,value,expires_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?)`).run(
        flow.verification.id,
        flow.verification.identifier,
        JSON.stringify({ ...flow.payload, arcLinkContext: signedProof }),
        flow.verification.expires_at,
        flow.verification.created_at,
        flow.verification.updated_at,
      );
      const replayCookie = `${freshSession}; ${await signStateCookie(f, flow.state)}; ${linkCookie(flow.credential)}`;
      const response = await callback(f, flow.provider, flow.state, replayCookie, "error", "access_denied");

      expect(response.status).toBe(302);
      expect(await response.json()).toEqual({ code: "ARC_ACCOUNT_LINK_DENIED", message: "Account link request denied" });
      expect(response.headers.get("location")).toBeNull();
      expect(rows(f, "verifications")).toEqual([]);
      expect(rows(f, "account_link_intents")).toEqual(resetIntents);
      expect(rows(f, "accounts")).toEqual(accountsBefore);
      expect(rows(f, "sessions")).toEqual(sessionsBefore);
      expect(preservedRows(f)).toEqual(preservedBefore);
    }
  });

  it("isolates Arc status, continue, and callback settlement to the original owner", async () => {
    const f = await harness.fixture();
    await cleanupFixture(f);
    const flow = await beginArc(f, "reauth");
    const otherSession = await loginCookie(f, "b");
    const intentsBefore = rows(f, "account_link_intents");
    const accountsBefore = rows(f, "accounts");
    const preservedBefore = preservedRows(f);
    const otherCookies = `${otherSession}; ${await signStateCookie(f, flow.state)}; ${linkCookie(flow.credential)}`;

    const statusResponse = await arcHandlers(f).status(arcRequest("status", `${otherSession}; ${linkCookie(flow.credential)}`));
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toEqual({ stage: null, targetProvider: null, expiresAt: null });
    const continueResponse = await arcHandlers(f).continue(arcRequest("continue", `${otherSession}; ${linkCookie(flow.credential)}`));
    expect(continueResponse.status).toBe(409);
    expect(await continueResponse.json()).toMatchObject({ error: { code: "CONFLICT" } });
    const callbackResponse = await callback(f, flow.provider, flow.state, otherCookies, "error", "access_denied");
    expect(callbackResponse.status).toBe(302);
    expect(await callbackResponse.json()).toEqual({ code: "ARC_ACCOUNT_LINK_DENIED", message: "Account link request denied" });
    expect(callbackResponse.headers.get("location")).toBeNull();
    expect(rows(f, "verifications")).toEqual([]);
    expect(rows(f, "account_link_intents")).toEqual(intentsBefore);
    expect(rows(f, "accounts")).toEqual(accountsBefore);
    expect(preservedRows(f)).toEqual(preservedBefore);
  });

  it("lists accounts by the session owner and denies both direct link-social bypass forms", async () => {
    const f = await harness.fixture({ linkedBoth: true });
    await cleanupFixture(f);
    const ownerACookie = await loginCookie(f, "a");
    const ownerBCookie = await loginCookie(f, "b");
    const preservedBefore = preservedRows(f);
    const accountsBefore = rows(f, "accounts");
    for (const [cookie, expectedIds] of [
      [ownerACookie, ["github-a", "google-a"]],
      [ownerBCookie, ["google-b"]],
    ] as const) {
      const response = await f.auth.handler(new Request(`${ORIGIN}/api/auth/list-accounts?userId=owner-a`, {
        headers: { cookie },
      }));
      expect(response.status).toBe(200);
      const listed = await response.json() as Array<{ id: string; scopes: string[] }>;
      expect(listed.map((account) => account.id).sort()).toEqual(expectedIds);
      expect(listed.every((account) => account.scopes.length === 0)).toBe(true);
    }

    for (const body of [
      { provider: "github", disableRedirect: true },
      { provider: "github", idToken: { token: "synthetic-forged-id-token" } },
    ]) {
      const response = await f.auth.handler(new Request(`${ORIGIN}/api/auth/link-social`, {
        method: "POST",
        headers: { cookie: ownerACookie, origin: ORIGIN, "content-type": "application/json" },
        body: JSON.stringify(body),
      }));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ code: "ARC_ACCOUNT_LINK_DENIED", message: "Account link request denied" });
    }
    expect(rows(f, "verifications")).toEqual([]);
    expect(rows(f, "account_link_intents")).toEqual([]);
    expect(rows(f, "accounts")).toEqual(accountsBefore);
    expect(preservedRows(f)).toEqual(preservedBefore);
  });
});
