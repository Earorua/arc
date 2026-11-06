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
it("maps the confirmed bilingual unit-testing concept only in a catalog that teaches it", () => {
    const words = { ...item, text: "为支付接口编写单元测试。", skillLabels: ["unit testing"] };
    expect(mapMaterialItems([words], flagshipBlueprint, flagshipUnitRegistry)).toMatchObject([{ status: "mapped", skillIds: ["testing"] }]);
    const other = { ...flagshipBlueprint, id: "separate-catalog" };
    expect(mapMaterialItems([words], other, { ...flagshipUnitRegistry, blueprintId: other.id })).toMatchObject([{ status: "uncovered", skillIds: [] }]);
    expect(mapMaterialItems([{ ...words, skillLabels: [] }], flagshipBlueprint, flagshipUnitRegistry)).toEqual([]);
    // Existing callers can still supply their original, versioned vocabulary.
    expect(mapMaterialItems([words], other, { ...flagshipUnitRegistry, blueprintId: other.id }, {
      aliases: { version: "2026.11.2", skills: { testing: ["unit testing"] } },
    })).toMatchObject([{ status: "mapped", skillIds: ["testing"] }]);
});
it("maps each retained literal skill word through its own blueprint and leaves unknown words uncovered", () => {
    const reviewed = { ...item, text: "SQL was removed during review", skillLabels: ["Jest", "Vitest", "OpenTelemetry", "unlisted-xyz"] };
    const mapped = mapMaterialItems([reviewed], flagshipBlueprint, flagshipUnitRegistry);
    expect(mapped.filter(result => result.status === "mapped").flatMap(result => result.skillIds).sort()).toEqual(["observability", "testing"]);
    expect(mapped.filter(result => result.status === "uncovered").flatMap(result => result.labels)).toEqual(["unlisted-xyz"]);
    expect(mapMaterialItems([{ ...reviewed, skillLabels: [] }], flagshipBlueprint, flagshipUnitRegistry).flatMap(result => result.skillIds)).toEqual([]);
    expect(mapMaterialItems([reviewed], flagshipBlueprint, flagshipUnitRegistry, { userMappings: { fact: ["react"] } }).flatMap(result => result.skillIds)).toEqual(["react"]);
    const research = { ...flagshipBlueprint, id: "other-role" };
    expect(mapMaterialItems([{ ...reviewed, skillLabels: ["Vitest"] }], research, { ...flagshipUnitRegistry, blueprintId: research.id })[0]?.status).toBe("uncovered");
});
