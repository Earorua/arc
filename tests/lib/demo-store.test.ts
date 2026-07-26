import { describe, expect, it } from "vitest";
import { completeDemoUnit, createDemoState, mergeSetup, saveDemoState } from "../../app/lib/demo-store";
import { flagshipRole } from "../../app/data/flagship-role";

describe("demo store", () => {
  it("merges setup answers without erasing progress", () => {
    const state = completeDemoUnit(createDemoState(), flagshipRole.today);
    const next = mergeSetup(state, { roleId: flagshipRole.id, level: "beginner", weeklyMinutes: 420, targetWeeks: 18 });
    expect(next.completedUnitIds).toEqual([flagshipRole.today.id]);
    expect(next.setup.weeklyMinutes).toBe(420);
  });

  it("creates exactly one verified proof for an idempotent completion", () => {
    const once = completeDemoUnit(createDemoState(), flagshipRole.today);
    const twice = completeDemoUnit(once, flagshipRole.today);
    expect(twice.completedUnitIds).toEqual([flagshipRole.today.id]);
    expect(twice.proofs).toHaveLength(1);
    expect(twice.proofs[0].verified).toBe(true);
  });

  it("does not throw when device storage rejects a write", () => {
    const storage = { setItem() { throw new Error("storage unavailable"); } };
    expect(() => saveDemoState(createDemoState(), storage)).not.toThrow();
  });
});
