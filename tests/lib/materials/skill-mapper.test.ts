import { expect, it } from "vitest";
import { flagshipBlueprint } from "../../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../../app/data/flagship-unit-registry";
import { mapMaterialItems, adoptMaterialSelfAssessments } from "../../../app/lib/materials/skill-mapper";
const skillId = flagshipBlueprint.skills[0]!.id;
const item = {
    id: "fact",
    kind: "skill-claim" as const,
    text: skillId,
    origin: "user" as const,
    sourceRef: null,
    requirementLevel: null
};
it("maps exact existing skill tokens only with a complete matching registry", () => {
    expect(mapMaterialItems([item], flagshipBlueprint, flagshipUnitRegistry)[0]).toMatchObject({ status: "mapped", skillIds: [skillId] });
    expect(mapMaterialItems([{ ...item, text: "unlisted-xyz" }], flagshipBlueprint, flagshipUnitRegistry)[0]?.status).toBe("uncovered");
    expect(mapMaterialItems([item], flagshipBlueprint, { ...flagshipUnitRegistry, tracks: [] })[0]?.status).toBe("uncovered");
});
it("keeps existing assessments until an explicit legal adoption", () => {
    const existing = { [skillId]: "conceptual" as const };
    expect(adoptMaterialSelfAssessments(existing, null, flagshipBlueprint)).toEqual(existing);
    expect(() => adoptMaterialSelfAssessments(existing, { mode: "batch", decisions: [{ skillId, level: "independent", sourceItemIds: [] }] }, flagshipBlueprint)).toThrow();
    expect(adoptMaterialSelfAssessments(existing, { mode: "single", decisions: [{ skillId, level: "independent", sourceItemIds: [] }] }, flagshipBlueprint)[skillId]).toBe("independent");
});
it("uses versioned production aliases only for the matching published blueprint", () => {
    const react = { ...item, text: "使用 React.js 构建页面" };
    const web = { ...item, text: "使用 HTML 和 CSS 构建页面" };
    expect(mapMaterialItems([web], flagshipBlueprint, flagshipUnitRegistry)[0]).toMatchObject({ status: "mapped", skillIds: ["web-platform"] });
    expect(mapMaterialItems([react], flagshipBlueprint, flagshipUnitRegistry)[0]).toMatchObject({ status: "mapped", skillIds: ["react"] });
    const research = { ...flagshipBlueprint, id: "other-role" };
    const researchRegistry = { ...flagshipUnitRegistry, blueprintId: research.id };
    expect(mapMaterialItems([web], research, researchRegistry)[0]?.status).toBe("uncovered");
    expect(mapMaterialItems([{ ...item, text: "HTMLish" }], flagshipBlueprint, flagshipUnitRegistry)[0]?.status).toBe("uncovered");
});
