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
});
