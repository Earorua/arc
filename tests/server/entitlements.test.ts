import { describe, expect, it, vi } from "vitest";
import { EntitlementGate } from "../../app/server/entitlements/policy";
import type { EntitlementRepository } from "../../app/server/entitlements/repository";

function repository(usage = { userAcceptedUnits: 0, globalAcceptedUnits: 0 }) {
  return {
    readUsage: vi.fn().mockResolvedValue(usage),
    reserve: vi.fn().mockResolvedValue("reservation-1"),
    finalize: vi.fn().mockResolvedValue(undefined),
  } satisfies EntitlementRepository;
}

const enabledEnvironment = {
  ARC_AI_ENABLED: "true",
  ARC_AI_USER_DAILY_QUOTA: "3",
  ARC_AI_GLOBAL_DAILY_BUDGET_UNITS: "100",
  ARC_AI_RATE_LIMIT_PER_MINUTE: "2",
};

function request(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-owner",
    purpose: "role-research-preview",
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
    units: 1,
    cohortEnabled: true,
    rateAllowed: true,
    ...overrides,
  };
}

describe("EntitlementGate", () => {
  it("fails closed when globally disabled or configuration is invalid", async () => {
    const repo = repository();
    await expect(new EntitlementGate(repo, {
      ...enabledEnvironment,
      ARC_AI_ENABLED: "false",
    }).authorize(request())).resolves.toEqual({ allowed: false, reason: "disabled" });
    await expect(new EntitlementGate(repo, {
      ...enabledEnvironment,
      ARC_AI_USER_DAILY_QUOTA: "not-a-number",
    }).authorize(request())).resolves.toEqual({ allowed: false, reason: "disabled" });
    expect(repo.readUsage).not.toHaveBeenCalled();
  });

  it("denies users outside the enabled cohort", async () => {
    const repo = repository();
    await expect(new EntitlementGate(repo, enabledEnvironment).authorize(
      request({ cohortEnabled: false }),
    )).resolves.toEqual({ allowed: false, reason: "cohort" });
  });

  it("denies an endpoint rate decision before reserving quota", async () => {
    const repo = repository();
    await expect(new EntitlementGate(repo, enabledEnvironment).authorize(
      request({ rateAllowed: false }),
    )).resolves.toEqual({ allowed: false, reason: "rate" });
    expect(repo.reserve).not.toHaveBeenCalled();
  });

  it("denies exhausted user quota", async () => {
    const repo = repository({ userAcceptedUnits: 3, globalAcceptedUnits: 20 });
    await expect(new EntitlementGate(repo, enabledEnvironment).authorize(request()))
      .resolves.toEqual({ allowed: false, reason: "quota" });
  });

  it("denies an exhausted global budget", async () => {
    const repo = repository({ userAcceptedUnits: 1, globalAcceptedUnits: 100 });
    await expect(new EntitlementGate(repo, enabledEnvironment).authorize(request()))
      .resolves.toEqual({ allowed: false, reason: "budget" });
  });

  it("reserves an allowed call idempotently", async () => {
    const repo = repository({ userAcceptedUnits: 1, globalAcceptedUnits: 20 });
    const gate = new EntitlementGate(repo, enabledEnvironment, {
      now: () => new Date("2026-07-28T12:00:00.000Z"),
    });

    await expect(gate.authorize(request())).resolves.toEqual({
      allowed: true,
      reservationId: "reservation-1",
    });
    expect(repo.readUsage).toHaveBeenCalledWith(
      "user-owner",
      "role-research-preview",
      {
        startMs: Date.parse("2026-07-28T00:00:00.000Z"),
        endMs: Date.parse("2026-07-29T00:00:00.000Z"),
      },
    );
    expect(repo.reserve).toHaveBeenCalledWith(
      "user-owner",
      "role-research-preview",
      "00000000-0000-4000-8000-000000000001",
      1,
    );
  });
});
