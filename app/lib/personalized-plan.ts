import { flagshipRole } from "../data/flagship-role";
import type { LearningUnit, PlanPhase } from "../domain/learning";

export function getRoleDisplayName(roleId: string): string {
  return roleId === flagshipRole.id ? "AI-Native Full-Stack Engineer" : roleId;
}

export function formatWeeklyBudget(weeklyMinutes: number): string {
  const hours = Math.floor(weeklyMinutes / 60);
  const minutes = weeklyMinutes % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);

  return `${parts.join(" ")} / week`;
}

export function redistributePhaseWeeks(
  phases: ReadonlyArray<PlanPhase>,
  targetWeeks: number,
): PlanPhase[] {
  if (typeof targetWeeks !== "number") {
    throw new TypeError("targetWeeks must be a number.");
  }
  if (!Number.isFinite(targetWeeks) || targetWeeks <= 0) {
    throw new RangeError("targetWeeks must be a finite positive number.");
  }

  phases.forEach((phase, index) => {
    if (typeof phase.weeks !== "number") {
      throw new TypeError(`phases[${index}].weeks must be a number.`);
    }
    if (!Number.isFinite(phase.weeks) || phase.weeks < 0) {
      throw new RangeError(`phases[${index}].weeks must be a finite non-negative number.`);
    }
  });

  if (phases.length === 0) return [];

  const minimumWeeks = phases.length;
  const safeTarget = Math.max(minimumWeeks, Math.round(targetWeeks));
  const distributableWeeks = safeTarget - minimumWeeks;
  const maximumWeight = Math.max(...phases.map((phase) => phase.weeks));

  if (maximumWeight === 0) {
    const evenShare = Math.floor(distributableWeeks / phases.length);
    const indexedRemainder = distributableWeeks % phases.length;
    return phases.map((phase, index) => ({
      ...phase,
      weeks: 1 + evenShare + (index < indexedRemainder ? 1 : 0),
    }));
  }

  const normalizedWeights = phases.map((phase) => phase.weeks / maximumWeight);
  const normalizedTotal = normalizedWeights.reduce((total, weight) => total + weight, 0);
  const allocations = phases.map((_, index) => {
    const exactShare = (normalizedWeights[index] / normalizedTotal) * distributableWeeks;
    const wholeShare = Math.floor(exactShare);
    return { index, remainder: exactShare - wholeShare, weeks: 1 + wholeShare };
  });
  let unallocated = safeTarget - allocations.reduce((total, allocation) => total + allocation.weeks, 0);

  [...allocations]
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .forEach((allocation) => {
      if (unallocated <= 0) return;
      allocations[allocation.index].weeks += 1;
      unallocated -= 1;
    });

  return phases.map((phase, index) => ({ ...phase, weeks: allocations[index].weeks }));
}

export interface TodayBudgetAssessment {
  estimatedMinutes: number;
  fits: boolean;
  shortfallMinutes: number;
  weeklyMinutes: number;
}

export function assessTodayBudget(unit: LearningUnit, weeklyMinutes: number): TodayBudgetAssessment {
  const shortfallMinutes = Math.max(0, unit.minutes - weeklyMinutes);
  return {
    estimatedMinutes: unit.minutes,
    fits: shortfallMinutes === 0,
    shortfallMinutes,
    weeklyMinutes,
  };
}
