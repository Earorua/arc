import { expect, it } from "vitest";
import { planningHistorySchema } from "../../app/contracts/planning-history";

const goal = { id: "old", roleId: "role", targetWeeks: 12, weeklyMinutes: 240, createdAt: 1, hasWorkspace: true };
it("accepts real totals and explicit unavailable progress without accepting impossible totals", () => {
  const parse = (progress: unknown) => planningHistorySchema.safeParse({ goals: [{ ...goal, progress }], nextOffset: null });
  expect(parse({ completedUnits: 2, totalUnits: 9 }).success).toBe(true);
  expect(parse(null).success).toBe(true);
  for (const progress of [{ completedUnits: 10, totalUnits: 9 }, { completedUnits: -1, totalUnits: 9 }, { completedUnits: 1.5, totalUnits: 9 }, { completedUnits: 0, totalUnits: 0 }, undefined]) {
    expect(parse(progress).success).toBe(false);
  }
  expect(planningHistorySchema.safeParse({ goals: [{ ...goal, hasWorkspace: false, progress: { completedUnits: 0, totalUnits: 9 } }], nextOffset: null }).success).toBe(false);
});
