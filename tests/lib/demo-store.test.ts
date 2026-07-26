import { describe, expect, it } from "vitest";
import { completeDemoUnit, createDemoState, loadDemoState, mergeSetup, saveDemoState } from "../../app/lib/demo-store";
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
    expect(twice.proofs[0].kind).toBe("completion");
    expect(twice.proofs[0].verified).toBe(true);
  });

  it("reports whether device storage accepted a write", () => {
    expect(saveDemoState(createDemoState(), { setItem() {} })).toBe(true);
    const storage = { setItem() { throw new Error("storage unavailable"); } };
    expect(saveDemoState(createDemoState(), storage)).toBe(false);
  });

  it("falls back to safe defaults when persisted JSON has the wrong shapes", () => {
    const state = loadDemoState({
      getItem: () => JSON.stringify({
        setup: {},
        completedUnitIds: "bad",
        proofs: [{ bad: true }],
      }),
    });

    expect(state.setup).toEqual(createDemoState().setup);
    expect(state.completedUnitIds).toEqual([]);
    expect(state.proofs).toEqual([]);
  });

  it("merges valid persisted fields and retains only valid progress", () => {
    const state = loadDemoState({
      getItem: () => JSON.stringify({
        setup: {
          roleId: "data-product-manager",
          level: "advanced",
          weeklyMinutes: 600,
          targetWeeks: 53,
        },
        completedUnitIds: ["unit-one", "", 9],
        proofs: [
          {
            id: "proof-local-completion",
            title: "A local completion",
            kind: "completion",
            skillIds: ["react"],
            verified: true,
          },
          {
            id: "proof-unit-one",
            title: "A verified deliverable",
            kind: "project",
            skillIds: ["product-thinking"],
            verified: true,
          },
          { id: "bad-proof", title: "Bad", kind: "invalid", skillIds: [], verified: true },
        ],
      }),
    });

    expect(state.setup).toEqual({
      roleId: "data-product-manager",
      level: "advanced",
      weeklyMinutes: 600,
      targetWeeks: 18,
    });
    expect(state.completedUnitIds).toEqual(["unit-one"]);
    expect(state.proofs).toEqual([
      {
        id: "proof-local-completion",
        title: "A local completion",
        kind: "completion",
        skillIds: ["react"],
        verified: true,
      },
      {
        id: "proof-unit-one",
        title: "A verified deliverable",
        kind: "project",
        skillIds: ["product-thinking"],
        verified: true,
      },
    ]);
  });
});
