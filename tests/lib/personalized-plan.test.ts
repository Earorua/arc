import { describe, expect, it } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";
import {
  assessTodayBudget,
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

  it("distributes zero-weight phases evenly and deterministically", () => {
    const zeroWeightPhases = flagshipRole.phases.map((phase) => ({ ...phase, weeks: 0 }));

    const phases = redistributePhaseWeeks(zeroWeightPhases, 10);

    expect(phases.map((phase) => phase.weeks)).toEqual([3, 3, 2, 2]);
    expect(phases.reduce((total, phase) => total + phase.weeks, 0)).toBe(10);
  });

  it("returns an empty plan for an empty phase list", () => {
    expect(redistributePhaseWeeks([], 4)).toEqual([]);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1])(
    "rejects an invalid target of %s",
    (targetWeeks) => {
      expect(() => redistributePhaseWeeks(flagshipRole.phases, targetWeeks)).toThrowError(
        new RangeError("targetWeeks must be a finite positive number."),
      );
    },
  );

  it("rejects a non-number target with a clear type error", () => {
    expect(() => redistributePhaseWeeks(flagshipRole.phases, "10" as unknown as number)).toThrowError(
      new TypeError("targetWeeks must be a number."),
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "rejects invalid phase weight %s",
    (weeks) => {
      const phases = [{ ...flagshipRole.phases[0], weeks }];
      expect(() => redistributePhaseWeeks(phases, 4)).toThrowError(
        new RangeError("phases[0].weeks must be a finite non-negative number."),
      );
    },
  );

  it("formats whole and partial weekly hours readably", () => {
    expect(formatWeeklyBudget(420)).toBe("7 hours / week");
    expect(formatWeeklyBudget(90)).toBe("1 hour 30 minutes / week");
    expect(formatWeeklyBudget(30)).toBe("30 minutes / week");
  });

  it("uses the canonical flagship label and preserves a custom role as text", () => {
    expect(getRoleDisplayName(flagshipRole.id)).toBe("AI-Native Full-Stack Engineer");
    expect(getRoleDisplayName("数据产品经理 <script>")) .toBe("数据产品经理 <script>");
  });

  it("reports a budget shortfall without changing the unit estimate", () => {
    expect(assessTodayBudget(flagshipRole.today, 30)).toEqual({
      estimatedMinutes: 45,
      fits: false,
      shortfallMinutes: 15,
      weeklyMinutes: 30,
    });
    expect(flagshipRole.today.minutes).toBe(45);
    expect(assessTodayBudget(flagshipRole.today, 420)).toEqual({
      estimatedMinutes: 45,
      fits: true,
      shortfallMinutes: 0,
      weeklyMinutes: 420,
    });
  });
});
