// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DocumentCandidate, MaterialReferenceContext } from "../../app/contracts/documents";
import { groundSourceRequirementLevel } from "../../worker/document-executor/source-requirement-evidence";

type Sources = Pick<MaterialReferenceContext, "text" | "segments">;
const source = (quote: string, segmentId = "section"): DocumentCandidate["source"] => ({ segmentId, quote });
const document = (text: string): Sources => ({ text, segments: [{ id: "section", start: 0, end: text.length }] });
const level = (quote: string, text = quote) => groundSourceRequirementLevel(source(quote), document(text));

describe("source-grounded requirement levels", () => {
  it.each([
    ["PostgreSQL is optional for this role.", "preferred"],
    ["PostgreSQL is required for this role.", "must"],
    ["Experience with FlarnDock is preferred.", "preferred"],
    ["Proficiency in FlarnDock is essential.", "must"],
    ["FlarnDock experience required.", "must"],
    ["FlarnDock is a required skill.", "must"],
    ["Experience with “FlarnDock” is required.", "must"],
    ["Preferred: familiarity with FlarnDock.", "preferred"],
    ["Required skills: FlarnDock and QuantumCompass.", "must"],
    ["Candidates must be able to troubleshoot phase drift.", "must"],
    ["You need to understand phase drift.", "must"],
    ["This role requires familiarity with phase drift.", "must"],
    ["We require experience with FlarnDock.", "must"],
    ["You will be responsible for tracing phase drift.", "must"],
    ["Responsible for maintaining the beam profiler.", "must"],
    ["Knowledge of FlarnDock is a plus.", "preferred"],
    ["Experience with FlarnDock would be an advantage.", "preferred"],
    ["必须掌握流式校验。", "must"],
    ["需具备流式校验经验。", "must"],
    ["需要熟悉流式校验。", "must"],
    ["负责月度经营分析。", "must"],
    ["流式校验是必备技能。", "must"],
    ["熟悉流式校验者优先。", "preferred"],
    ["流式校验是加分项。", "preferred"],
    ["流式校验为可选技能。", "preferred"],
    ["加分项：流式校验。", "preferred"],
    ["任职要求：熟练使用 FlarnDock。", "must"],
  ] as const)("derives %s from explicit wording", (quote, expected) => {
    expect(level(quote)).toBe(expected);
  });

  it.each([
    "SQL",
    "FlarnDock",
    "We use FlarnDock.",
    "PostgreSQL is not required for this role.",
    "PostgreSQL isn't mandatory.",
    "PostgreSQL is not optional.",
    "No prior PostgreSQL experience is required.",
    "PostgreSQL is required only if the role includes night shifts.",
    "If assigned to support, candidates must use PostgreSQL.",
    "PostgreSQL may be required.",
    "PostgreSQL is required, subject to the project assignment.",
    "Is PostgreSQL required?",
    "PostgreSQL is required and FlarnDock is optional.",
    "PostgreSQL is both mandatory and preferred.",
    "PostgreSQL mandatory, FlarnDock optional.",
    "PostgreSQL preferred and FlarnDock required.",
    "PostgreSQL is required where applicable.",
    "PostgreSQL is required except for interns.",
    "PostgreSQL hasn't been required.",
    "The requirements conflict: PostgreSQL is required.",
    "The priorities for PostgreSQL are unclear; it is required in an example.",
    "The example says PostgreSQL is required.",
    "PostgreSQL is required in the following example.",
    "It is false that PostgreSQL is required.",
    "The handbook quotes “PostgreSQL is required.”",
    "不要求掌握流式校验。",
    "无需具备流式校验经验。",
    "流式校验并非必备技能。",
    "如果安排夜班，必须掌握流式校验。",
    "仅限轮岗时需要掌握流式校验。",
    "流式校验可能是必备技能。",
    "流式校验既是必备技能又是加分项。",
    "要求前后矛盾：流式校验是必备技能。",
    "示例写道“流式校验是必备技能。”",
    "PostgreSQL supports optional columns.",
    "We discuss preferred qualifications in this workshop.",
    "The required flag describes the input schema.",
    "Required skills",
    "Preferred qualifications",
    "流式校验使用优先队列。",
  ])("leaves absent or qualified priority for user review: %s", quote => {
    expect(level(quote)).toBe("unspecified");
  });

  it.each([
    ["Requirements\n- FlarnDock", "FlarnDock", "must"],
    ["Required:\n- FlarnDock", "FlarnDock", "must"],
    ["Mandatory:\n- FlarnDock", "FlarnDock", "must"],
    ["必备：\n- FlarnDock", "FlarnDock", "must"],
    ["## Required skills\n\n- FlarnDock", "FlarnDock", "must"],
    ["**Preferred qualifications**\n1. FlarnDock", "FlarnDock", "preferred"],
    ["岗位要求：\n（1）熟练使用 FlarnDock。", "熟练使用 FlarnDock。", "must"],
    ["加分项：\n有流式校验经验。", "有流式校验经验。", "preferred"],
    ["Requirements\n- Beam tuning\n- FlarnDock", "FlarnDock", "must"],
    ["Responsibilities\n- Maintain the beam profiler.", "Maintain the beam profiler.", "must"],
    ["Requirements\n- FlarnDock is optional.", "FlarnDock is optional.", "preferred"],
    ["Preferred skills\n- FlarnDock is required.", "FlarnDock is required.", "must"],
    ["Requirements\n- FlarnDock is not required.", "FlarnDock is not required.", "unspecified"],
    ["Requirements\n- FlarnDock may be needed.", "FlarnDock may be needed.", "unspecified"],
    ["Requirements\n- SQL and PostgreSQL are optional dependencies.", "SQL and PostgreSQL are optional dependencies.", "unspecified"],
    ["Requirements\n- PostgreSQL supports optional columns.", "PostgreSQL supports optional columns.", "unspecified"],
    ["Requirements\n- Preferred tools:\n  - FlarnDock", "FlarnDock", "preferred"],
    ["Requirements\n- Preferred tools:\n  - Other tool\n- FlarnDock", "FlarnDock", "must"],
  ] as const)("uses an applicable heading in %s", (text, quote, expected) => {
    expect(level(quote, text)).toBe(expected);
  });

  it.each([
    "Requirements\n- Beam tuning\n## Benefits\n- FlarnDock",
    "Requirements\n- Beam tuning\nOther company\n- FlarnDock",
    "Requirements\n- Beam tuning\n\nBeta Corporation\n- FlarnDock",
    "Requirements\n- Beam tuning\nAbout the company:\n- FlarnDock",
    "Requirements\n- Beam tuning\n**Other notes**\n- FlarnDock",
    "Requirements\n- Beam tuning\nWe discuss preferred qualifications.\n- FlarnDock",
    "Preferred qualifications are discussed below.\n- FlarnDock",
    "Requirements\n- Other department:\n  - FlarnDock",
    "Requirements\n- Beam tuning\n---\n- FlarnDock",
  ])("does not carry a heading into another section: %s", text => {
    expect(level("FlarnDock", text)).toBe("unspecified");
  });

  it.each([
    ["The worksheet says: “Begin. PostgreSQL is required. End.”", "PostgreSQL is required."],
    ["Requirements\n- The note says “FlarnDock is optional.”", "The note says “FlarnDock is optional.”"],
    ["Requirements\n- The note says “FlarnDock is required and PostgreSQL is optional.”", "The note says “FlarnDock is required and PostgreSQL is optional.”"],
    ["Required skills (if assigned to support):\n- PostgreSQL is required.", "PostgreSQL is required."],
    ["Requirements\n- If assigned to support:\n  - PostgreSQL is required.", "PostgreSQL is required."],
    ["Example:\nPostgreSQL is required.", "PostgreSQL is required."],
    ["```text\nRequirements\nPostgreSQL is required.\n```", "PostgreSQL is required."],
    ["> Requirements\n> PostgreSQL is required.", "PostgreSQL is required."],
    ["示例：\n必须掌握流式校验。", "必须掌握流式校验。"],
  ])("checks assertion context outside the source span: %s", (text, quote) => {
    expect(level(quote, text)).toBe("unspecified");
  });

  it("uses original document headings across transport segments", () => {
    const quote = "FlarnDock", text = "Required skills\n- " + quote;
    const start = text.indexOf(quote);
    const sources = { text, segments: [{ id: "prefix", start: 0, end: start }, { id: "section", start, end: text.length }] };
    expect(groundSourceRequirementLevel(source(quote), sources)).toBe("must");
  });

  it("retains original quotation scope across transport segments", () => {
    const quote = "PostgreSQL is required.", text = "The sample says “Begin. " + quote + " End.”";
    const start = text.indexOf(quote);
    const sources = { text, segments: [{ id: "prefix", start: 0, end: start }, { id: "section", start, end: text.length }] };
    expect(groundSourceRequirementLevel(source(quote), sources)).toBe("unspecified");
  });

  it("resolves repeated literals using their own supplied segments", () => {
    const quote = "FlarnDock", first = "Required skills\n- " + quote + "\n", text = first + "Preferred skills\n- " + quote;
    const sources = { text, segments: [{ id: "first", start: 0, end: first.length }, { id: "second", start: first.length, end: text.length }] };
    expect(groundSourceRequirementLevel(source(quote, "first"), sources)).toBe("must");
    expect(groundSourceRequirementLevel(source(quote, "second"), sources)).toBe("preferred");
  });

  it("does not ground invalid or ambiguous references", () => {
    expect(level("invented", "Required: FlarnDock.")).toBe("unspecified");
    expect(level("FlarnDock", "Required: FlarnDock and FlarnDock.")).toBe("unspecified");
  });
});
