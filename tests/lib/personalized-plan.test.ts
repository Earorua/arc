import { describe, expect, it } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";
import {
  constrainTodayUnit,
  formatWeeklyBudget,
  getRoleDisplayName,
  redistributePhaseWeeks,
} from "../../app/lib/personalized-plan";

describe("personalized plan", () => {
  it.each([
    [4, [1, 1, 1, 1]],
    [10, [2, 3, 3, 2]],
    [18, [4, 5, 5, 4]],
    [52, [12, 14, 14, 12]],
  ])("redistributes %i target weeks without losing a week", (targetWeeks, expected) => {
    const phases = redistributePhaseWeeks(flagshipRole.phases, targetWeeks);

    expect(phases.map((phase) => phase.weeks)).toEqual(expected);
    expect(phases.reduce((total, phase) => total + phase.weeks, 0)).toBe(targetWeeks);
    expect(phases.every((phase) => phase.weeks >= 1)).toBe(true);
  });

  it("formats whole and partial weekly hours readably", () => {
    expect(formatWeeklyBudget(420)).toBe("7 hours / week");
    expect(formatWeeklyBudget(90)).toBe("1 hour 30 minutes / week");
    expect(formatWeeklyBudget(30)).toBe("30 minutes / week");
  });

  it("uses the canonical flagship label and preserves a custom role as text", () => {
    expect(getRoleDisplayName(flagshipRole.id)).toBe("AI-Native Full-Stack Engineer");
    expect(getRoleDisplayName("数据产品经理 <script>")) .toBe("数据产品经理 <script>");
  });

  it("caps today's unit to the available weekly minutes without changing its work", () => {
    const constrained = constrainTodayUnit(flagshipRole.today, 30);

    expect(constrained.minutes).toBe(30);
    expect(constrained.steps).toEqual(flagshipRole.today.steps);
    expect(constrained.deliverable).toBe(flagshipRole.today.deliverable);
    expect(constrained.skillIds).toEqual(flagshipRole.today.skillIds);
    expect(constrainTodayUnit(flagshipRole.today, 420).minutes).toBe(45);
  });
});
