import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { parseResearchBudgetEnvironment, ResearchBudgetGate, type BudgetDecision, type BudgetReservation } from "../../app/server/research/budget";

const environment = {
  ARC_AI_SITE_DAILY_BUDGET_MICROS: "1000",
  ARC_AI_SITE_MONTHLY_BUDGET_MICROS: "9000",
  ARC_AI_RESEARCH_MAX_COST_MICROS: "600",
  ARC_AI_REPAIR_MAX_COST_MICROS: "100",
};
const input = { ownerId: "owner-a", runId: "run-a", requestId: "request-a", expiresAt: 1_800_000_000_000 };

describe("Research cost policy", () => {
  it("encodes replay as never granting provider authority without excluding fresh terminal races", () => {
    type Base = { allowed: true; reservation: BudgetReservation };
    expectTypeOf<Base & { replayed: false; providerAttemptAllowed: true }>().toExtend<BudgetDecision>();
    expectTypeOf<Base & { replayed: false; providerAttemptAllowed: false }>().toExtend<BudgetDecision>();
    expectTypeOf<Base & { replayed: true; providerAttemptAllowed: false }>().toExtend<BudgetDecision>();
    // @ts-expect-error Replayed reservations must never grant another provider attempt.
    expectTypeOf<Base & { replayed: true; providerAttemptAllowed: true }>().toExtend<BudgetDecision>();
  });

  it("parses integer currency limits and reserves the combined research and repair maximum", async () => {
    const reserve = vi.fn().mockResolvedValue({ allowed: false, reason: "budget" });
    expect(parseResearchBudgetEnvironment(environment)).toEqual({ dailyBudgetMicros: 1000, monthlyBudgetMicros: 9000, maximumMicros: 700, researchMaximumMicros: 600, repairMaximumMicros: 100 });
    await expect(new ResearchBudgetGate({ reserve }, environment).authorize(input)).resolves.toEqual({ allowed: false, reason: "budget" });
    expect(reserve).toHaveBeenCalledWith({ ...input, dailyBudgetMicros: 1000, monthlyBudgetMicros: 9000, maximumMicros: 700 });
  });

  it.each([undefined, "", " ", "-1", "+1", "1.0", "1e3", " 1", "1 ", "NaN", "Infinity", "9007199254740992"])("fails closed on invalid currency config %s before a reservation", async (value) => {
    for (const key of Object.keys(environment)) {
      const invalid = { ...environment, [key]: value };
      const reserve = vi.fn();
      expect(parseResearchBudgetEnvironment(invalid)).toBeNull();
      await expect(new ResearchBudgetGate({ reserve }, invalid).authorize(input)).resolves.toEqual({ allowed: false, reason: "budget" });
      expect(reserve).not.toHaveBeenCalled();
    }
  });

  it("accepts zero limits but rejects unsafe combined maxima", () => {
    expect(parseResearchBudgetEnvironment(Object.fromEntries(Object.keys(environment).map((key) => [key, "0"])))).toEqual({ dailyBudgetMicros: 0, monthlyBudgetMicros: 0, maximumMicros: 0, researchMaximumMicros: 0, repairMaximumMicros: 0 });
    expect(parseResearchBudgetEnvironment({ ...environment, ARC_AI_RESEARCH_MAX_COST_MICROS: String(Number.MAX_SAFE_INTEGER) })).toBeNull();
  });

  it("allows Research with repair explicitly disabled and preserves both policy maxima", async () => {
    const reserve = vi.fn().mockResolvedValue({ allowed: false, reason: "budget" });
    const noRepair = { ...environment, ARC_AI_REPAIR_MAX_COST_MICROS: "0" };
    expect(parseResearchBudgetEnvironment(noRepair)).toMatchObject({ researchMaximumMicros: 600, repairMaximumMicros: 0, maximumMicros: 600 });
    await new ResearchBudgetGate({ reserve }, noRepair).authorize(input);
    expect(reserve).toHaveBeenCalledWith({ ...input, dailyBudgetMicros: 1000, monthlyBudgetMicros: 9000, maximumMicros: 600 });
  });

  it("does not expose raw storage failures or turn them into provider authority", async () => {
    const reserve = vi.fn().mockRejectedValue(new Error("sensitive SQL"));
    await expect(new ResearchBudgetGate({ reserve }, environment).authorize(input)).resolves.toEqual({ allowed: false, reason: "budget" });
  });

  it.each(["ARC_AI_SITE_DAILY_BUDGET_MICROS", "ARC_AI_SITE_MONTHLY_BUDGET_MICROS", "ARC_AI_RESEARCH_MAX_COST_MICROS"])("denies paid authority when %s is zero", async (key) => {
    const reserve = vi.fn();
    await expect(new ResearchBudgetGate({ reserve }, { ...environment, [key]: "0" }).authorize(input)).resolves.toEqual({ allowed: false, reason: "budget" });
    expect(reserve).not.toHaveBeenCalled();
  });
});
