import { expect } from "vitest";
import { serializeSignedCookie } from "better-call";
import { cookiePairs, NEW_SECRET, ORIGIN, rows, type Fixture, type Provider } from "./auth-migration-fixture";

export async function signStateCookie(f: Fixture, state: string, secret = NEW_SECRET) {
  const cookie = (await f.auth.$context).createAuthCookie("state", { maxAge: 300 });
  return (await serializeSignedCookie(cookie.name, state, secret, cookie.attributes)).split(";", 1)[0];
}

export async function startSocial(f: Fixture, provider: Provider) {
  const response = await f.auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify({
      provider,
      callbackURL: `${ORIGIN}/today`,
      errorCallbackURL: `${ORIGIN}/today`,
      disableRedirect: true,
    }),
  }));
  expect(response.status).toBe(200);
  const payload = await response.json() as { url: string; redirect: boolean };
  expect(payload.redirect).toBe(false);
  const authorization = new URL(payload.url);
  expect(authorization.protocol).toBe("https:");
  const state = authorization.searchParams.get("state");
  expect(state).toBeTypeOf("string");
  if (!state) throw new Error("SYNTHETIC_STATE_REQUIRED");

  const cookieName = (await f.auth.$context).createAuthCookie("state").name;
  const cookie = cookiePairs(response.headers);
  expect(cookie.split("; ").some((value) => value.startsWith(`${cookieName}=`))).toBe(true);
  const stored = rows(f, "verifications");
  expect(stored).toHaveLength(1);
  expect(stored[0].identifier).not.toBe(state);
  expect(JSON.parse(String(stored[0].value)).oauthState).toBe(state);
  return { state, cookie, verification: stored[0] };
}

export function callback(f: Fixture, provider: Provider, state: string, cookie: string, parameter: "error" | "code", value: string) {
  const url = new URL(`${ORIGIN}/api/auth/callback/${provider}`);
  url.searchParams.set("state", state);
  url.searchParams.set(parameter, value);
  return f.auth.handler(new Request(url, { headers: { cookie } }));
}
