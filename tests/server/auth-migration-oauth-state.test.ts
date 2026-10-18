// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cleanupFixture, fixtureHarness, makeAuth, OLD_SECRET, preservedRows, rows } from "../helpers/auth-migration-fixture";
import { callback, signStateCookie, startSocial } from "../helpers/auth-migration-oauth";

const harness = fixtureHarness();

describe("auth migration actual OAuth state acceptance", () => {
  it.each(["google", "github"] as const)("consumes genuine fresh %s state without token exchange", async (provider) => {
    const f = await harness.fixture();
    const before = preservedRows(f);
    const start = await startSocial(f, provider);

    const response = await callback(f, provider, start.state, start.cookie, "error", "access_denied");
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/today");
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(rows(f, "verifications")).toEqual([]);
    expect(rows(f, "sessions")).toEqual([]);
    expect(preservedRows(f)).toEqual(before);

    const replay = await callback(f, provider, start.state, start.cookie, "code", "synthetic-never-exchange");
    expect(replay.status).toBe(302);
    expect(new URL(replay.headers.get("location")!).searchParams.get("error")).toBe("state_mismatch");
  });

  it.each(["google", "github"] as const)("rejects cleaned %s state before provider exchange even with a current-key cookie", async (provider) => {
    const f = await harness.fixture();
    const before = preservedRows(f);
    const old = { ...f, auth: makeAuth(f.db, OLD_SECRET) };
    const start = await startSocial(old, provider);
    expect(await cleanupFixture(f)).toMatchObject({ verificationsRemoved: 1 });
    expect(rows(f, "verifications")).toEqual([]);

    for (const cookie of [start.cookie, await signStateCookie(f, start.state)]) {
      const response = await callback(f, provider, start.state, cookie, "code", "synthetic-never-exchange");
      expect(response.status).toBe(302);
      expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("state_mismatch");
      expect(rows(f, "verifications")).toEqual([]);
      expect(rows(f, "sessions")).toEqual([]);
      expect(preservedRows(f)).toEqual(before);
    }
  });
});
