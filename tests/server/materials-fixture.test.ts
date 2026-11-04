import { describe, expect, it } from "vitest";
import { buildLearningPaths } from "../../app/lib/planning/path-builder";
import { MATERIAL_PRIORITY_RULES, materialsPlanningFixture } from "../helpers/materials-fixture";

describe("phase-0 frozen planning acceptance fixture (phase-1 priority engine is not implemented)", () => {
  it("passes the existing path builder with four skills, 12 authored templates and 240 learning minutes", () => {
    const fixture = materialsPlanningFixture();
    expect(fixture.baseline.blueprint.skills.map(({ id }) => id)).toEqual(["foundation", "ui", "sql", "analytics"]);
    expect(fixture.baseline.registry.tracks.flatMap(({ templates }) => templates)).toHaveLength(12);
    const result = buildLearningPaths(fixture.baseline);
    expect(result.fullScope.units.map(({ templateId }) => templateId)).toEqual([
      "foundation-learn-01", "ui-learn-01", "sql-learn-01", "analytics-learn-01",
    ]);
    expect(result.fullScope.units.reduce((minutes, unit) => minutes + unit.estimatedMinutes, 0)).toBe(240);
    expect(result.infeasibleReason).toBeNull();
  });

  it("freezes all five required acceptance categories and proves each original task set is executable", () => {
    const fixture = materialsPlanningFixture();
    expect(fixture.scenarios.map(({ id }) => id)).toEqual([
      "no-materials", "jd-must", "resume-practice", "uncertain-sql", "uncovered-conflict", "independent-must", "jd-preferred",
    ]);
    for (const scenario of fixture.scenarios) {
      const original = buildLearningPaths(scenario.input).fullScope.units;
      expect(original.map(({ id }) => id), scenario.id).toEqual(scenario.expected.originalUnitIds);
      expect(original.map(({ templateId }) => templateId), scenario.id).toEqual(scenario.expected.originalTemplates);
      expect([...scenario.expected.initialUnitIds].sort(), scenario.id).toEqual(original.map(({ id }) => id).sort());
      expect(scenario.expected.initialUnitIds.map((id) => original.find((unit) => unit.id === id)!.templateId), scenario.id)
        .toEqual(scenario.expected.initialTemplates);
      const completed = new Set(scenario.expected.reorder.completedUnitIds);
      const unfinished = original.filter(({ id }) => !completed.has(id)).map(({ id }) => id);
      expect(scenario.expected.reorder.originalUnfinishedUnitIds, scenario.id).toEqual(unfinished);
      expect([...scenario.expected.reorder.expectedUnfinishedUnitIds].sort(), scenario.id).toEqual([...unfinished].sort());
      expect(scenario.expected.reorder.expectedUnfinishedUnitIds.some((id) => completed.has(id))).toBe(false);
      for (const order of [scenario.expected.initialUnitIds, scenario.expected.reorder.expectedUnfinishedUnitIds]) {
        const available = new Set(order === scenario.expected.initialUnitIds ? [] : completed);
        for (const id of order) {
          const unit = original.find((item) => item.id === id)!;
          expect(unit.prerequisiteUnitIds.every((dependency) => available.has(dependency)), `${scenario.id}: ${unit.templateId}`).toBe(true);
          available.add(id);
        }
      }
    }
  });

  it("freezes dependency inheritance and deterministic ready-set ranks without invoking a new algorithm", () => {
    const fixture = materialsPlanningFixture();
    const must = fixture.scenarios.find(({ id }) => id === "jd-must")!;
    expect(must.signals.requirements).toEqual([{ skillId: "analytics", level: "must" }]);
    expect(must.expected.initialTemplates).toEqual([
      "foundation-learn-01", "sql-learn-01", "analytics-learn-01", "ui-learn-01",
    ]);
    expect(MATERIAL_PRIORITY_RULES.ranks.map(({ rank }) => rank)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(MATERIAL_PRIORITY_RULES.compareOnlyReady).toBe(true);
    expect(MATERIAL_PRIORITY_RULES.prerequisiteInheritance).toBe("minimum-descendant-rank");
    expect(MATERIAL_PRIORITY_RULES.tieBreak).toEqual(["original-stable-order", "id"]);
  });

  it("keeps uncertain SQL calibration and learning, including learning after calibration is completed", () => {
    const uncertain = materialsPlanningFixture().scenarios.find(({ id }) => id === "uncertain-sql")!;
    expect(uncertain.expected.initialTemplates).toEqual([
      "foundation-learn-01", "sql-calibrate-01", "sql-learn-01", "analytics-learn-01", "ui-learn-01",
    ]);
    expect(uncertain.expected.reorder.completedUnitIds).toHaveLength(2);
    expect(uncertain.expected.reorder.expectedUnfinishedUnitIds.map((id) =>
      uncertain.expected.originalTemplates[uncertain.expected.originalUnitIds.indexOf(id)]))
      .toEqual(["sql-learn-01", "analytics-learn-01", "ui-learn-01"]);
  });

  it("records uncovered requirements, inert document URLs and unresolved conflicts without expanding the catalog", () => {
    const fixture = materialsPlanningFixture();
    const boundary = fixture.scenarios.find(({ id }) => id === "uncovered-conflict")!;
    expect(boundary.expected.uncovered).toEqual(["Kubernetes"]);
    expect(boundary.expected.reviewRequired).toEqual(["conflicting-sql-self-assessment", "untrusted-course-url"]);
    expect(boundary.signals.documentText).toContain("https://invalid.example/kubernetes-course");
    expect(boundary.expected.initialUnitIds).toEqual(boundary.expected.originalUnitIds);
    expect(fixture.baseline.registry.tracks.some(({ skillId }) => skillId === "kubernetes")).toBe(false);
    expect(fixture.baseline.blueprint.resources.some(({ url }) => url.includes("invalid.example"))).toBe(false);
  });

  it("freezes target-date protection for core plus must dependencies and explicit infeasibility", () => {
    const must = materialsPlanningFixture().scenarios.find(({ id }) => id === "jd-must")!;
    expect(must.expected.targetDate).toEqual({
      protectedSkillIds: ["foundation", "sql", "analytics"],
      protectedUnitIds: must.expected.initialUnitIds.slice(0, 3),
      protectedMinutes: 180,
      availableMinutes: 75,
      targetWeeks: 1,
      status: "infeasible",
    });
    expect(must.expected.targetDate!.protectedMinutes).toBeGreaterThan(must.expected.targetDate!.availableMinutes);
  });
});
