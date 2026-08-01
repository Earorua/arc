import { describe, expect, it } from "vitest";
import {
  AccountLinkError,
  type AccountLinkStatus,
  INTERNAL_PROOF_TTL_MS,
  PENDING_REAUTH_TTL_MS,
  VERIFIED_GRANT_TTL_MS,
  accountLinkPhaseSchema,
  accountLinkProviderSchema,
  accountLinkStatusSchema,
  canTransitionAccountLink,
  projectAccountLinkIntent,
  safeAccountLinkStatusSchema,
  startAccountLinkSchema,
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
    expect(INTERNAL_PROOF_TTL_MS).toBe(60 * 1000);
  });

  it("allows only the approved state transitions", () => {
    const statuses: readonly AccountLinkStatus[] = ["pending_reauth", "verified", "consumed", "completed", "failed", "expired"];
    const successors: Record<AccountLinkStatus, readonly AccountLinkStatus[]> = {
      pending_reauth: ["verified", "failed", "expired"],
      verified: ["consumed", "failed", "expired"],
      consumed: ["completed", "failed"],
      completed: [],
      failed: [],
      expired: [],
    };

    for (const from of statuses) {
      for (const to of statuses) {
        expect(canTransitionAccountLink(from, to)).toBe(successors[from].includes(to));
      }
    }
  });

  it("validates account-link statuses and phases", () => {
    for (const status of ["pending_reauth", "verified", "consumed", "completed", "failed", "expired"]) {
      expect(accountLinkStatusSchema.parse(status)).toBe(status);
    }
    expect(() => accountLinkStatusSchema.parse("unknown")).toThrow();
    expect(accountLinkPhaseSchema.parse("reauth")).toBe("reauth");
    expect(accountLinkPhaseSchema.parse("target")).toBe("target");
    expect(() => accountLinkPhaseSchema.parse("other")).toThrow();
  });

  it("strictly validates start and safe account-link payloads", () => {
    expect(() => startAccountLinkSchema.parse({ targetProvider: "google", extra: true })).toThrow();
    expect(() => startAccountLinkSchema.parse({ targetProvider: "email-password" })).toThrow();
    expect(safeAccountLinkStatusSchema.parse({
      stage: null,
      targetProvider: null,
      expiresAt: null,
    })).toEqual({
      stage: null,
      targetProvider: null,
      expiresAt: null,
    });
    expect(() => safeAccountLinkStatusSchema.parse({
      stage: null,
      targetProvider: null,
      expiresAt: null,
      extra: true,
    })).toThrow();
  });

  it("preserves account-link error details", () => {
    const error = new AccountLinkError("EXPIRED", "The intent has expired");

    expect(error.code).toBe("EXPIRED");
    expect(error.name).toBe("AccountLinkError");
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
