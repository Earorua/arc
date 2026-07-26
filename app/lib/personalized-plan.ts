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
  if (phases.length === 0) return [];

  const minimumWeeks = phases.length;
  const safeTarget = Math.max(minimumWeeks, Math.round(targetWeeks));
  const sourceTotal = phases.reduce((total, phase) => total + phase.weeks, 0);
  const distributableWeeks = safeTarget - minimumWeeks;
  const allocations = phases.map((phase, index) => {
    const exactShare = sourceTotal > 0 ? (distributableWeeks * phase.weeks) / sourceTotal : 0;
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

export function constrainTodayUnit(unit: LearningUnit, weeklyMinutes: number): LearningUnit {
  return { ...unit, minutes: Math.min(unit.minutes, weeklyMinutes) };
}
