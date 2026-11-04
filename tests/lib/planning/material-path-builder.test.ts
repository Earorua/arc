import { describe, expect, it } from "vitest";
import { buildLearningPaths, createPathBuilder } from "../../../app/lib/planning/path-builder";
import { createMaterialOverlay } from "../../../app/lib/materials/planning-priority";
import { materialsPlanningFixture } from "../../helpers/materials-fixture";

describe("material learning paths", () => {
  for (const fixture of materialsPlanningFixture().scenarios) it(`applies frozen ${fixture.id} acceptance order without changing IDs or time`, () => {
    const overlay = createMaterialOverlay({ ...fixture.signals, audit: fixture.input.audit, knownSkillIds: fixture.input.blueprint.skills.map(s => s.id), semanticFingerprint: "a".repeat(64) });
    const before = JSON.stringify(fixture.input);
    const original = buildLearningPaths(fixture.input).fullScope;
    const result = buildLearningPaths({ ...fixture.input, materialOverlay: overlay }).fullScope;
    expect(result.units.map(unit => unit.id)).toEqual(fixture.expected.initialUnitIds);
    expect(result.units.map(unit => unit.templateId)).toEqual(fixture.expected.initialTemplates);
    expect(result.units.reduce((sum, unit) => sum + unit.estimatedMinutes, 0)).toBe(original.units.reduce((sum, unit) => sum + unit.estimatedMinutes, 0));
    expect(result.inputFingerprint).not.toBe(original.inputFingerprint);
    expect(JSON.stringify(fixture.input)).toBe(before);
    expect(buildLearningPaths(fixture.input).fullScope).toEqual(original);
  });
  it("protects confirmed must requirements and their dependencies under an impossible deadline", () => {
    const f = materialsPlanningFixture().scenarios.find(s => s.id === "jd-must")!;
    const materialOverlay = createMaterialOverlay({ ...f.signals, audit: f.input.audit, knownSkillIds: f.input.blueprint.skills.map(s => s.id), semanticFingerprint: "a".repeat(64) });
    const result = createPathBuilder(units => units.length > 1 ? "2026-12-30" : f.input.planningDate)({ ...f.input, materialOverlay });
    expect(result.targetDate).toBeNull();
    expect(result.infeasibleReason).toBeTruthy();
    expect(result.fullScope.units).toHaveLength(4);
  });
});
