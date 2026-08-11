import { describe, expect, it } from "vitest";
import {
  PLANNING_SCHEMA_VERSION,
  type PlanVersion,
} from "../../../app/contracts/planning";
import { diffPlans } from "../../../app/lib/planning/plan-diff";

const DATES = [
  "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15",
  "2026-08-16", "2026-08-17", "2026-08-18",
];

function plan(
  id: string,
  placements: Readonly<Record<string, string>>,
  completionDate = "2026-08-18",
): PlanVersion {
  return {
    id,
    schemaVersion: PLANNING_SCHEMA_VERSION,
    generation: id === "active-plan" ? "initial" : "proposed",
    baseVersionId: id === "active-plan" ? null : "active-plan",
    replanReason: id === "active-plan" ? null : "delayed",
    planningDate: DATES[0]!,
    pathVersionId: "path-version",
    days: DATES.map((date) => {
      const unitId = Object.entries(placements).find(([, scheduledDate]) => scheduledDate === date)?.[0] ?? null;
      return {
        date,
        budgetMinutes: unitId ? 60 : 0,
        status: unitId ? "scheduled" as const : "rest" as const,
        primaryUnitId: unitId,
        stretchUnitId: null,
      };
    }),
    dailyUnitIds: Object.keys(placements),
    estimatedCompletionDate: completionDate,
    inputFingerprint: `${id}-fingerprint`,
    summary: `${id} summary`,
  };
}

describe("diffPlans", () => {
  it("classifies stable IDs and sorts by change rank, date, then ordinal ID", () => {
    const active = plan("active-plan", {
      "unit-z": "2026-08-12",
      "unit-b": "2026-08-13",
      "unit-r": "2026-08-14",
      "unit-u": "2026-08-15",
    }, "2026-08-18");
    const candidate = plan("candidate-plan", {
      "unit-a": "2026-08-13",
      "unit-z": "2026-08-14",
      "unit-u": "2026-08-15",
    }, "2026-08-20");

    const diff = diffPlans({ active, candidate, completedUnitIds: new Set() });

    expect(diff.items).toEqual([
      { unitId: "unit-a", change: "added", fromDate: null, toDate: "2026-08-13", reason: "Added to the candidate plan." },
      { unitId: "unit-z", change: "moved", fromDate: "2026-08-12", toDate: "2026-08-14", reason: "Moved from 2026-08-12 to 2026-08-14." },
      { unitId: "unit-b", change: "removed", fromDate: "2026-08-13", toDate: null, reason: "Removed from the candidate plan." },
      { unitId: "unit-r", change: "removed", fromDate: "2026-08-14", toDate: null, reason: "Removed from the candidate plan." },
      { unitId: "unit-u", change: "unchanged", fromDate: "2026-08-15", toDate: "2026-08-15", reason: "Remains scheduled for 2026-08-15." },
    ]);
    expect(diff).toMatchObject({
      basePlanVersionId: "active-plan",
      candidatePlanVersionId: "candidate-plan",
      previousEstimatedCompletionDate: "2026-08-18",
      nextEstimatedCompletionDate: "2026-08-20",
      summary: "Estimated completion moves from 2026-08-18 to 2026-08-20.",
    });
  });

  it("locks completed units to their historical date", () => {
    const active = plan("active-plan", { "unit-a": "2026-08-12" });
    const moved = plan("candidate-plan", { "unit-a": "2026-08-13" });
    const removed = plan("candidate-plan", {});

    for (const candidate of [moved, removed]) {
      expect(() => diffPlans({ active, candidate, completedUnitIds: new Set(["unit-a"]) }))
        .toThrowError(expect.objectContaining({ code: "COMPLETED_HISTORY_CHANGED" }));
    }
  });

  it("strict-parses plans and completed IDs without mutating inputs", () => {
    const active = plan("active-plan", { "unit-a": "2026-08-12" });
    const candidate = plan("candidate-plan", { "unit-a": "2026-08-12" });
    const before = JSON.stringify({ active, candidate });
    const completed = new Set(["unit-a"]);

    const first = diffPlans({ active, candidate, completedUnitIds: completed });
    const second = diffPlans({ active, candidate, completedUnitIds: completed });

    expect(JSON.stringify({ active, candidate })).toBe(before);
    expect([...completed]).toEqual(["unit-a"]);
    expect(first).toEqual(second);
    expect(first.id).toMatch(/^plan-diff-/u);
    expect(first.inputFingerprint).toMatch(/^p2-/u);
    expect(first.items[0]?.change).toBe("unchanged");
    expect(() => diffPlans({
      active: { ...active, extra: true } as unknown as PlanVersion,
      candidate,
      completedUnitIds: completed,
    })).toThrow();
    expect(diffPlans({ active, candidate, completedUnitIds: new Set(["historical-unit"]) }).items[0]?.change)
      .toBe("unchanged");
  });
});
