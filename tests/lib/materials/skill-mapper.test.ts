import { expect, it } from "vitest";
import { flagshipBlueprint } from "../../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../../app/data/flagship-unit-registry";
import { mapMaterialItems, mapMaterialItemTerms, adoptMaterialSelfAssessments, MATERIAL_MAPPING_VERSION } from "../../../app/lib/materials/skill-mapper";
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

it("maps English distributed tracing like its reviewed Chinese equivalent without borrowing another catalog", () => {
    const requirement = { ...item, kind: "requirement" as const, text: "Distributed tracing is preferred.",
      requirementLevel: "preferred" as const, skillLabels: ["distributed tracing"] };
    expect(mapMaterialItems([requirement], flagshipBlueprint, flagshipUnitRegistry))
      .toMatchObject([{ status: "mapped", skillIds: ["observability"] }]);
    const other = { ...flagshipBlueprint, id: "other-catalog" };
    expect(mapMaterialItems([requirement], other, { ...flagshipUnitRegistry, blueprintId: other.id }))
      .toMatchObject([{ status: "uncovered", skillIds: [] }]);
    expect(mapMaterialItems([{ ...requirement, skillLabels: [] }], flagshipBlueprint, flagshipUnitRegistry)).toEqual([]);
    expect(mapMaterialItems([{ ...requirement, skillLabels: ["distributed transactions"] }], flagshipBlueprint, flagshipUnitRegistry))
      .toMatchObject([{ status: "uncovered", skillIds: [] }]);
    expect(mapMaterialItems([requirement], other, { ...flagshipUnitRegistry, blueprintId: other.id }, {
      aliases: { version: "2026.11.3", skills: { observability: ["distributed tracing"] } },
    })).toMatchObject([{ status: "mapped", skillIds: ["observability"] }]);
});

it("versions contextual mappings independently while accepting every previous literal alias version", () => {
    expect(MATERIAL_MAPPING_VERSION).toBe("2026.11.5");
    const other = { ...flagshipBlueprint, id: "other-catalog" };
    for (const version of ["2026.11.2", "2026.11.3", "2026.11.4", "2026.11.5"] as const) {
      expect(mapMaterialItems([{ ...item, skillLabels: ["reviewed-term"] }], other,
        { ...flagshipUnitRegistry, blueprintId: other.id }, { aliases: { version, skills: { testing: ["reviewed-term"] } } }))
        .toMatchObject([{ status: "mapped", skillIds: ["testing"] }]);
    }
});

it("reports each retained raw term with its literal, contextual, ambiguous or uncovered result", () => {
    expect(mapMaterialItemTerms).toBeTypeOf("function");
    const reviewed = { ...item, text: "Use UI tokens for accessible component focus; keep SQL and unknown-topic.",
      skillLabels: ["SQL", "UI tokens", "shared-term", "unknown-topic"] };
    expect(mapMaterialItemTerms([reviewed], flagshipBlueprint, flagshipUnitRegistry, {
      aliases: { version: "2026.11.5", skills: { testing: ["shared-term"], react: ["shared-term"] } },
    })).toEqual([
      { itemId: "fact", term: "SQL", status: "mapped", skillIds: ["sql"], basis: "literal" },
      { itemId: "fact", term: "UI tokens", status: "mapped", skillIds: ["design-systems"], basis: "contextual" },
      { itemId: "fact", term: "shared-term", status: "ambiguous", skillIds: ["react", "testing"], basis: "literal" },
      { itemId: "fact", term: "unknown-topic", status: "uncovered", skillIds: [], basis: null },
    ]);
});

it("overrides one retained term while preserving all other automatic mappings", () => {
    const reviewed = { ...item, text: "UI tokens, SQL and Jest", skillLabels: ["UI tokens", "SQL", "Jest"] };
    expect(mapMaterialItems([reviewed], flagshipBlueprint, flagshipUnitRegistry, {
      termMappings: { fact: [{ skillLabel: "UI tokens", skillIds: ["design-systems"] }] },
    })).toEqual([{ itemId: "fact", status: "mapped", skillIds: ["design-systems", "sql", "testing"],
      labels: ["Accessible Design Systems", "SQL & Relational Modeling", "Automated Testing"] }]);
    expect(mapMaterialItemTerms).toBeTypeOf("function");
    expect(mapMaterialItemTerms([reviewed], flagshipBlueprint, flagshipUnitRegistry, {
      termMappings: { fact: [{ skillLabel: "UI tokens", skillIds: ["design-systems"] }] },
    }).map(({ term, basis }) => ({ term, basis }))).toEqual([
      { term: "UI tokens", basis: "manual" }, { term: "SQL", basis: "literal" }, { term: "Jest", basis: "literal" },
    ]);
});

it("keeps a deliberate per-term omission visible in details and out of grouped mappings", () => {
    const reviewed = { ...item, text: "SQL and Jest", skillLabels: ["SQL", "Jest"] };
    const options = { termMappings: { fact: [{ skillLabel: "SQL", skillIds: [] }] } };
    expect(mapMaterialItems([reviewed], flagshipBlueprint, flagshipUnitRegistry, options)).toEqual([
      { itemId: "fact", status: "mapped", skillIds: ["testing"], labels: ["Automated Testing"] },
    ]);
    expect(mapMaterialItemTerms).toBeTypeOf("function");
    expect(mapMaterialItemTerms([reviewed], flagshipBlueprint, flagshipUnitRegistry, options)[0]).toEqual({
      itemId: "fact", term: "SQL", status: "omitted", skillIds: [], basis: "manual",
    });
});

it("never recovers a deleted term, rescans an empty label list, or applies a non-exact override", () => {
    const reviewed = { ...item, text: "SQL and Jest and UI tokens for accessible UI components", skillLabels: ["Jest"] };
    const options = { termMappings: { fact: [{ skillLabel: "SQL", skillIds: ["sql"] },
      { skillLabel: "jest", skillIds: ["react"] }] } };
    expect(mapMaterialItems([reviewed], flagshipBlueprint, flagshipUnitRegistry, options)).toEqual([
      { itemId: "fact", status: "mapped", skillIds: ["testing"], labels: ["Automated Testing"] },
    ]);
    expect(mapMaterialItems([{ ...reviewed, skillLabels: [] }], flagshipBlueprint, flagshipUnitRegistry, options)).toEqual([]);
    expect(mapMaterialItemTerms).toBeTypeOf("function");
    expect(mapMaterialItemTerms([{ ...reviewed, skillLabels: [] }], flagshipBlueprint, flagshipUnitRegistry, options)).toEqual([]);
});

it("maps a constraint only after its exact item ID is separately adopted", () => {
    const constraint = { ...item, kind: "constraint" as const, text: "Practice SQL", skillLabels: ["SQL"] };
    const manual = { termMappings: { fact: [{ skillLabel: "SQL", skillIds: ["sql"] }] } };
    expect(mapMaterialItems([constraint], flagshipBlueprint, flagshipUnitRegistry, manual)).toEqual([
      { itemId: "fact", status: "non-learning", skillIds: [], labels: [] },
    ]);
    expect(mapMaterialItems([constraint], flagshipBlueprint, flagshipUnitRegistry, { ...manual, learningIntentItemIds: ["another-fact"] }))
      .toEqual([{ itemId: "fact", status: "non-learning", skillIds: [], labels: [] }]);
    expect(mapMaterialItems([constraint], flagshipBlueprint, flagshipUnitRegistry, { learningIntentItemIds: ["fact"] }))
      .toEqual([{ itemId: "fact", status: "mapped", skillIds: ["sql"], labels: ["SQL & Relational Modeling"] }]);
    expect(mapMaterialItemTerms).toBeTypeOf("function");
    expect(mapMaterialItemTerms([constraint], flagshipBlueprint, flagshipUnitRegistry, manual)).toEqual([
      { itemId: "fact", term: "SQL", status: "non-learning", skillIds: [], basis: null },
    ]);
});

it("preserves legacy whole-item overrides and rejects unknown IDs without inventing skills", () => {
    expect(mapMaterialItems([item], flagshipBlueprint, flagshipUnitRegistry, { userMappings: { fact: [] } }))
      .toEqual([{ itemId: "fact", status: "uncovered", skillIds: [], labels: [item.text] }]);
    expect(mapMaterialItemTerms).toBeTypeOf("function");
    expect(mapMaterialItemTerms([item], flagshipBlueprint, flagshipUnitRegistry, { userMappings: { fact: ["react", "sql"] } }))
      .toEqual([{ itemId: "fact", term: item.text, status: "mapped", skillIds: ["react", "sql"], basis: "manual" }]);
    expect(mapMaterialItemTerms([{ ...item, skillLabels: ["SQL"] }], flagshipBlueprint, flagshipUnitRegistry, {
      termMappings: { fact: [{ skillLabel: "SQL", skillIds: ["invented-skill"] }] },
    })).toEqual([{ itemId: "fact", term: "SQL", status: "uncovered", skillIds: [], basis: "manual" }]);
});

it("retains invalid legacy catalog labels without exposing invalid mapped skill IDs", () => {
    const incomplete = { ...flagshipUnitRegistry, tracks: [] };
    expect(mapMaterialItems([{ ...item, text: "SQL" }], flagshipBlueprint, incomplete)).toEqual([
      { itemId: "fact", status: "uncovered", skillIds: [], labels: ["SQL & Relational Modeling"] },
    ]);
    expect(mapMaterialItemTerms).toBeTypeOf("function");
    expect(mapMaterialItemTerms([{ ...item, skillLabels: ["SQL"] }], flagshipBlueprint, incomplete)).toEqual([
      { itemId: "fact", term: "SQL", status: "uncovered", skillIds: [], basis: null },
    ]);
});
