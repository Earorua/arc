import { describe, expect, it } from "vitest";
import {
  PENDING_REAUTH_TTL_MS,
  VERIFIED_GRANT_TTL_MS,
  accountLinkProviderSchema,
  canTransitionAccountLink,
  projectAccountLinkIntent,
} from "../../app/server/account-link/contracts";

describe("account-link contracts", () => {
  it("accepts only the configured social providers", () => {
    expect(accountLinkProviderSchema.parse("google")).toBe("google");
    expect(accountLinkProviderSchema.parse("github")).toBe("github");
    expect(() => accountLinkProviderSchema.parse("email-password")).toThrow();
  });

  it("locks the approved deadlines", () => {
    expect(PENDING_REAUTH_TTL_MS).toBe(10 * 60 * 1000);
    expect(VERIFIED_GRANT_TTL_MS).toBe(5 * 60 * 1000);
  });

  it("allows only the approved state transitions", () => {
    expect(canTransitionAccountLink("pending_reauth", "verified")).toBe(true);
    expect(canTransitionAccountLink("verified", "consumed")).toBe(true);
    expect(canTransitionAccountLink("consumed", "completed")).toBe(true);
    expect(canTransitionAccountLink("consumed", "verified")).toBe(false);
    expect(canTransitionAccountLink("completed", "verified")).toBe(false);
  });

  it("projects no secret or ownership-bearing fields", () => {
    expect(projectAccountLinkIntent({
      status: "verified",
      targetProvider: "google",
      expiresAt: new Date("2026-08-01T12:05:00.000Z"),
    })).toEqual({
      stage: "verified",
      targetProvider: "google",
      expiresAt: "2026-08-01T12:05:00.000Z",
    });
  });
});
