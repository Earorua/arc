import { describe, expect, it } from "vitest";
import { prioritizeReadyNodes, createMaterialOverlay } from "../../../app/lib/materials/planning-priority";
import { materialsPlanningFixture } from "../../helpers/materials-fixture";
import { buildLearningPaths } from "../../../app/lib/planning/path-builder";

describe("material ready-set priorities", () => {
  for (const fixture of materialsPlanningFixture().scenarios) it(fixture.id, () => {
    const overlay = createMaterialOverlay({ ...fixture.signals, audit: fixture.input.audit, knownSkillIds: fixture.input.blueprint.skills.map(s => s.id), semanticFingerprint: "a".repeat(64) });
    const original = buildLearningPaths(fixture.input).fullScope;
    const completed = new Set(fixture.expected.reorder.completedUnitIds);
    const order = prioritizeReadyNodes(original.units.filter(unit => !completed.has(unit.id)).map((unit, originalIndex) => ({ id: unit.id, prerequisiteIds: unit.prerequisiteUnitIds, originalIndex, rank: overlay.skillRanks[unit.skillId] ?? 5 })), completed);
    expect(order).toEqual(fixture.expected.reorder.expectedUnfinishedUnitIds);
  });
  it("rejects missing prerequisites, cycles and duplicate IDs", () => {
    const node = { id: "a", rank: 0, originalIndex: 0, prerequisiteIds: ["missing"] };
    expect(() => prioritizeReadyNodes([node])).toThrow("MISSING_DEPENDENCY");
    expect(() => prioritizeReadyNodes([{ ...node, prerequisiteIds: ["a"] }])).toThrow("DEPENDENCY_CYCLE");
    expect(() => prioritizeReadyNodes([node, node])).toThrow("DUPLICATE_NODE");
  });
});
