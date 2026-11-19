import { describe, expect, it } from "vitest";
import { explainMaterialPreview } from "../../../app/lib/materials/explanations";
describe("private material explanations", () => {
  it("uses fixed rule text and only known decision references", () => {
    const result = explainMaterialPreview({ confirmedItems: [], priorities: [{ skillId: "sql", tier: 0, itemIds: ["confirmed-a"] }], issues: [], uncoveredLabels: [] }, true);
    expect(result[0]).toMatchObject({ ruleId: "mandatory-gap-first-v1", changeKind: "reordered", skillId: "sql", reasonItemIds: ["confirmed-a"], sourceAvailability: "available" });
    expect(explainMaterialPreview({ confirmedItems: [], priorities: [], issues: [], uncoveredLabels: [] }, true)).toEqual([]);
  });
  it("replaces all private references and messages after source deletion", () => {
    const result = explainMaterialPreview({ confirmedItems: [], priorities: [{ skillId: "PRIVATE-MATERIAL-SENTINEL-7f91", tier: 0, itemIds: ["private-item"] }], issues: [], uncoveredLabels: ["private label"] }, false);
    expect(result).toEqual([{ ruleId: "source-unavailable-v1", changeKind: "unavailable", skillId: null, unitIds: [], reasonItemIds: [], message: "依据已删除", sourceAvailability: "unavailable" }]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE-MATERIAL");
  });
  it("keeps task limitations separate from priority and removes them after source deletion", () => {
    const preview = { confirmedItems: [], priorities: [], issues: [], uncoveredLabels: [], mappingDetails: [{
      itemId: "private-fact", termIndexes: [0], status: "mapped" as const, skillIds: ["sql"], basis: "literal" as const,
      taskCoverage: { status: "partial" as const, support: ["sql-schema" as const], remaining: "unassessed-scope" as const },
    }] };
    const result = explainMaterialPreview(preview, true);
    expect(result).toMatchObject([{ ruleId: "course-task-partial-v1", changeKind: "unapplied", reasonItemIds: ["private-fact"] }]);
    expect(result[0]?.message).toMatch(/其余要求尚未核验/);
    expect(result[0]?.message).toMatch(/不代表能力或采用优先级/);
    expect(explainMaterialPreview(preview, false)).toEqual(explainMaterialPreview(null, false));
  });
});
