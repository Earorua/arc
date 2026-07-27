import { describe, expect, it } from "vitest";
import { readAuthPolicy } from "../../app/server/auth/policy";

describe("Arc auth policy", () => {
  it("exposes only Google and GitHub with same-origin callbacks", () => {
    const policy = readAuthPolicy({
      BETTER_AUTH_URL: "https://arc.example.com",
      BETTER_AUTH_SECRET: "s".repeat(32),
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
      GITHUB_CLIENT_ID: "github-id",
      GITHUB_CLIENT_SECRET: "github-secret",
    });

    expect(policy.enabledProviders).toEqual(["google", "github"]);
    expect(policy.callbackUrls).toEqual({
      google: "https://arc.example.com/api/auth/callback/google",
      github: "https://arc.example.com/api/auth/callback/github",
    });
    expect(policy.isReady).toBe(true);
  });

  it("keeps auth disabled when credentials are incomplete", () => {
    const policy = readAuthPolicy({ BETTER_AUTH_URL: "https://arc.example.com" });

    expect(policy.enabledProviders).toEqual([]);
    expect(policy.isReady).toBe(false);
  });

  it("rejects non-https production origins", () => {
    expect(() => readAuthPolicy({
      ARC_ENVIRONMENT: "production",
      BETTER_AUTH_URL: "http://arc.example.com",
    })).toThrow("HTTPS");
  });

  it("keeps auth disabled when the session secret is shorter than 32 characters", () => {
    const policy = readAuthPolicy({
      BETTER_AUTH_URL: "https://arc.example.com",
      BETTER_AUTH_SECRET: "too-short",
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
    });

    expect(policy.isReady).toBe(false);
  });
});
