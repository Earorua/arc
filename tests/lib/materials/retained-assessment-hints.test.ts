import { describe, expect, it } from "vitest";
import { GROUNDED_MATERIAL_REVIEW_PROJECTION, type ConfirmedMaterialItem, type DocumentReviewDraft } from "../../../app/contracts/documents";
import { retainedMaterialSelfAssessmentHints } from "../../../app/lib/materials/skill-labels";

const guidedHint: DocumentReviewDraft["selfAssessmentHints"][number] = {
  id: "hint-fact-0", candidateId: "fact", skillLabel: "SQL", level: "guided",
};
const sourceRef = { documentId: "document", documentVersionId: "version", textVersionId: "text", start: 0, end: 31 };
function fact(text: string, changes: Partial<ConfirmedMaterialItem> = {}): ConfirmedMaterialItem {
  return { id: "fact", kind: "experience", text, origin: "user", sourceRef, requirementLevel: null, skillLabels: ["SQL"], ...changes };
}

describe("retained material self-assessment hints", () => {
  for (const projection of [undefined, GROUNDED_MATERIAL_REVIEW_PROJECTION]) {
    describe(projection ?? "historical projection", () => {
      for (const qualifier of ["按指导", "按照指导", "在导师指导下"]) {
        it.each([
          ["完成不了 React.js 组件练习", false],
          ["完成 React.js 组件练习是我下周的计划。", false],
          ["完成 React.js 组件练习的计划尚未执行。", false],
          ["完成 React.js 组件练习后，我记录了结果。", true],
          ["完成 React.js 组件练习，明天计划阅读 CSS 文档。", true],
          ["完成 React.js 组件练习，但我无法完成 CSS 页面。", true],
          ["完成 React.js 组件练习. 阅读 CSS 文档是我下周的计划。", true],
          ["完成 React.js 组件练习.阅读 CSS 文档是我下周的计划。", true],
          ["完成 React.js 组件练习。阅读 CSS 文档是我下周的计划。", true],
        ] as const)(`keeps the whole dotted-skill action after ${qualifier}: %s`, (action, supported) => {
          const hint = { ...guidedHint, skillLabel: "React.js" };
          expect(retainedMaterialSelfAssessmentHints([fact(qualifier + action, { skillLabels: ["React.js"] })], [hint], projection))
            .toEqual(supported ? [hint] : []);
        });

        it.each([
          ["完成不了 SQL 查询练习", false],
          ["完成 SQL 查询练习是我下周的计划。", false],
          ["完成 SQL 查询练习的计划尚未执行。", false],
          ["完成 SQL 查询练习后，我记录了结果。", true],
          ["完成 SQL 查询练习，明天计划阅读 React 文档。", true],
          ["完成 SQL 查询练习，但我无法完成 React 页面。", true],
        ] as const)(`retains the hint only for the asserted current action after ${qualifier}: %s`, (action, supported) => {
          expect(retainedMaterialSelfAssessmentHints([fact(qualifier + action)], [guidedHint], projection)).toEqual(supported ? [guidedHint] : []);
        });
      }

      it.each([
        "My colleague tested SQL under supervision.",
        "I will test SQL under supervision.",
        "If I tested SQL under supervision, I would document it.",
        "I did not test SQL under supervision.",
        "The example says ‘I tested SQL under supervision.’",
        "I tested SQL.",
        "I tested SQL without supervision.",
      ])("drops a user's edit without the original personal guided evidence: %s", text => {
        expect(retainedMaterialSelfAssessmentHints([fact(text)], [guidedHint], projection)).toEqual([]);
      });

      it.each(["I tested SQL under supervision.", "I tested 'SQL' under supervision.", "按指导完成 SQL 查询练习"])("retains the original hint for supported personal practice: %s", text => {
        const retained = retainedMaterialSelfAssessmentHints([fact(text)], [guidedHint], projection);
        expect(retained).toEqual([guidedHint]);
        expect(retained[0]).toBe(guidedHint);
      });

      it("drops a conceptual hint when the edited familiarity belongs to a colleague", () => {
        const hint = { ...guidedHint, level: "conceptual" as const };
        expect(retainedMaterialSelfAssessmentHints([fact("My colleague is familiar with SQL.")], [hint], projection)).toEqual([]);
      });

      it("retains the original personal uncertainty without changing its level", () => {
        const hint = { ...guidedHint, level: "uncertain" as const };
        expect(retainedMaterialSelfAssessmentHints([fact("I am unsure whether I can test SQL independently.")], [hint], projection)).toEqual([hint]);
      });

      it("does not turn an inability statement into uncertainty or create a missing hint", () => {
        const items = [fact("I cannot independently test SQL.")];
        expect(retainedMaterialSelfAssessmentHints(items, [guidedHint], projection)).toEqual([]);
        expect(retainedMaterialSelfAssessmentHints(items, [{ ...guidedHint, level: "uncertain" }], projection)).toEqual([]);
        expect(retainedMaterialSelfAssessmentHints(items, [], projection)).toEqual([]);
      });
    });
  }

  it("checks each retained hint against its own skill rather than another skill's guidance", () => {
    const reactHint = { ...guidedHint, id: "hint-fact-1", skillLabel: "React" };
    const items = [fact("I tested SQL under supervision, but my colleague tested React under supervision.", { skillLabels: ["SQL", "React"] })];
    expect(retainedMaterialSelfAssessmentHints(items, [guidedHint, reactHint], GROUNDED_MATERIAL_REVIEW_PROJECTION)).toEqual([guidedHint]);
  });

  it("does not borrow a helper's tool as the learner's guided practice", () => {
    const reactHint = { ...guidedHint, id: "hint-fact-1", skillLabel: "React" };
    const items = [fact("With a mentor using React, I tested SQL under supervision.", { skillLabels: ["SQL", "React"] })];
    expect(retainedMaterialSelfAssessmentHints(items, [guidedHint, reactHint], GROUNDED_MATERIAL_REVIEW_PROJECTION)).toEqual([guidedHint]);
  });

  it("drops a repeated term whose other task does not support that level", () => {
    expect(retainedMaterialSelfAssessmentHints([fact("I built a SQL prototype, and I tested SQL under peer guidance.")], [guidedHint], GROUNDED_MATERIAL_REVIEW_PROJECTION)).toEqual([]);
  });

  it("cannot upgrade or mint a hint when a supported source term is added", () => {
    const items = [fact("I tested SQL and React under supervision.", { skillLabels: ["SQL", "React"] })];
    expect(retainedMaterialSelfAssessmentHints(items, [guidedHint], GROUNDED_MATERIAL_REVIEW_PROJECTION)).toEqual([guidedHint]);
    expect(retainedMaterialSelfAssessmentHints(items, [{ ...guidedHint, level: "conceptual" }], GROUNDED_MATERIAL_REVIEW_PROJECTION)).toEqual([]);
    expect(retainedMaterialSelfAssessmentHints(items, [], GROUNDED_MATERIAL_REVIEW_PROJECTION)).toEqual([]);
  });

  it.each([
    { name: "deleted fact", items: [] },
    { name: "empty word list", items: [fact("I tested SQL under supervision.", { skillLabels: [] })] },
    { name: "removed word", items: [fact("I tested SQL under supervision.", { skillLabels: ["React"] })] },
    { name: "requirement", items: [fact("I tested SQL under supervision.", { kind: "requirement", requirementLevel: "must" })] },
    { name: "constraint", items: [fact("I tested SQL under supervision.", { kind: "constraint" })] },
  ])("preserves item, kind, and retained-word membership guards for $name", ({ items }) => {
    expect(retainedMaterialSelfAssessmentHints(items, [guidedHint], GROUNDED_MATERIAL_REVIEW_PROJECTION)).toEqual([]);
  });

  it("preserves an untouched historical extracted summary even when it omits guidance", () => {
    expect(retainedMaterialSelfAssessmentHints([fact("Tested SQL.", { origin: "extracted" })], [guidedHint])).toEqual([guidedHint]);
    expect(retainedMaterialSelfAssessmentHints([fact("Tested databases.", { origin: "extracted", skillLabels: undefined })], [guidedHint])).toEqual([guidedHint]);
  });

  it("revalidates historical user edits even when no projection or word list was supplied", () => {
    expect(retainedMaterialSelfAssessmentHints([fact("My colleague tested SQL under supervision.", { skillLabels: undefined })], [guidedHint])).toEqual([]);
    expect(retainedMaterialSelfAssessmentHints([fact("I tested SQL under supervision.", { skillLabels: undefined })], [guidedHint])).toEqual([guidedHint]);
    expect(retainedMaterialSelfAssessmentHints([fact("I tested MySQL under supervision.", { skillLabels: undefined })], [guidedHint])).toEqual([]);
  });

  it("revalidates grounded extracted facts as well as user edits", () => {
    expect(retainedMaterialSelfAssessmentHints([fact("My colleague tested SQL under supervision.", { origin: "extracted" })], [guidedHint], GROUNDED_MATERIAL_REVIEW_PROJECTION)).toEqual([]);
    expect(retainedMaterialSelfAssessmentHints([fact("I tested SQL under supervision.", { origin: "extracted" })], [guidedHint], GROUNDED_MATERIAL_REVIEW_PROJECTION)).toEqual([guidedHint]);
  });
});
