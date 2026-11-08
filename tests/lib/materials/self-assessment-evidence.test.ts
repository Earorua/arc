import { describe, expect, it } from "vitest";
import { supportsMaterialSelfLevelHint } from "../../../app/lib/materials/self-assessment-evidence";

describe("material self-assessment evidence", () => {
  it.each(["按指导示例完成 SQL 查询练习", "按照指导教程完成 SQL 查询练习"])("preserves longer instructional qualifiers beginning with guidance words: %s", text => {
    expect(supportsMaterialSelfLevelHint({ kind: "experience", text, labels: ["SQL"], level: "guided" })).toBe(true);
  });

  it.each([
    "按指导完成 SQL 查询练习",
    "按照指导完成 SQL 查询练习",
    "我按指导完成 SQL 查询练习",
    "我按照指导完成 SQL 查询练习",
    "按指导完成 ‘SQL’ 查询练习",
    "按指导，我完成 SQL 查询练习",
  ])("supports a short personal guidance qualifier followed by actual practice: %s", text => {
    expect(supportsMaterialSelfLevelHint({ kind: "experience", text, labels: ["SQL"], level: "guided" })).toBe(true);
  });

  it.each([
    "按指导没有完成 SQL 查询练习",
    "按指导未完成 SQL 查询练习",
    "按指导计划完成 SQL 查询练习",
    "按指导安排同事完成 SQL 查询练习",
    "按指导由同事完成 SQL 查询练习",
    "按指导同事完成 SQL 查询练习",
    "按指导团队完成 SQL 查询练习",
    "按指导，我的同事完成 SQL 查询练习",
    "按指导将完成 SQL 查询练习",
    "按指导记录 SQL 查询练习",
    "按指导 SQL 查询练习",
    "示例：“按指导完成 SQL 查询练习”",
    "没有按指导完成 SQL 查询练习",
    "完成 SQL 查询练习",
  ])("does not read another actor, denial or mere guidance words as short personal practice: %s", text => {
    expect(supportsMaterialSelfLevelHint({ kind: "experience", text, labels: ["SQL"], level: "guided" })).toBe(false);
  });

  it("supports a personal guided assertion", () => {
    expect(supportsMaterialSelfLevelHint({ kind: "experience", text: "I tested SQL under supervision.", labels: ["SQL"], level: "guided" })).toBe(true);
  });

  it("drops support when an edit attributes the same guided action to a colleague", () => {
    expect(supportsMaterialSelfLevelHint({ kind: "experience", text: "My colleague tested SQL under supervision.", labels: ["SQL"], level: "guided" })).toBe(false);
  });

  it.each(["experience", "skill-claim"] as const)("allows a supported level on %s", kind => {
    expect(supportsMaterialSelfLevelHint({ kind, text: "I am familiar with SQL.", labels: ["SQL"], level: "conceptual" })).toBe(true);
  });

  it.each(["requirement", "constraint"] as const)("does not assign a personal level to %s", kind => {
    expect(supportsMaterialSelfLevelHint({ kind, text: "I tested SQL under supervision.", labels: ["SQL"], level: "guided" })).toBe(false);
  });

  it("does not infer a level when none is proposed", () => {
    expect(supportsMaterialSelfLevelHint({ kind: "experience", text: "I tested SQL under supervision.", labels: ["SQL"], level: null })).toBe(false);
  });

  it.each([
    ["I have only basic familiarity with SQL.", "conceptual"],
    ["My experience with SQL is limited to reading the documentation.", "conceptual"],
    ["个人简介：我熟悉 SQL。", "conceptual"],
    ["简介：熟悉 SQL，可独立完成报表。", "conceptual"],
    ["I am unsure whether I can test SQL independently.", "uncertain"],
    ["我不确定自己能否独立测试 SQL。", "uncertain"],
    ["我的 SQL 自评前后矛盾。", "uncertain"],
    ["Under supervision, I tested SQL.", "guided"],
    ["With a mentor's guidance, I tested SQL.", "guided"],
    ["在导师指导下，我测试了 SQL。", "guided"],
    ["练习项目中，按讲师示例由本人亲自编写 SQL 查询。", "guided"],
    ["My placement: followed a runbook to configure SQL.", "guided"],
    ["I tested SQL not only using tutorials but also under supervision.", "guided"],
    ["I did not only test SQL under supervision.", "guided"],
    ["I tested SQL under supervision, but I did not configure React.", "guided"],
  ] as const)("preserves supported personal semantics in %s", (text, level) => {
    expect(supportsMaterialSelfLevelHint({ kind: "skill-claim", text, labels: ["SQL"], level })).toBe(true);
  });

  it.each([
    ["I tested 'SQL' under supervision.", "guided"],
    ["I am familiar with “SQL”.", "conceptual"],
  ] as const)("allows a quoted tool name within a personal assertion: %s", (text, level) => {
    expect(supportsMaterialSelfLevelHint({ kind: "experience", text, labels: ["SQL"], level })).toBe(true);
  });

  it.each([
    ["The example says ‘I tested SQL under supervision.’", "guided"],
    ["“I am familiar with SQL.”", "conceptual"],
    ["The slide quotes ‘I am unsure whether I can test SQL independently.’", "uncertain"],
    ["I am familiar with the example ‘SQL is required.’", "conceptual"],
  ] as const)("does not adopt a quoted proposition as personal evidence: %s", (text, level) => {
    expect(supportsMaterialSelfLevelHint({ kind: "experience", text, labels: ["SQL"], level })).toBe(false);
  });

  it.each([
    ["I tested SQL and React under supervision.", "guided", ["SQL", "React"], true],
    ["I am familiar with SQL and React.", "conceptual", ["SQL", "React"], true],
    ["I am familiar with SQL, but my colleague uses React.", "conceptual", ["SQL"], true],
    ["I am familiar with SQL, but my colleague uses React.", "conceptual", ["React"], false],
    ["I am familiar with SQL, but my colleague uses React.", "conceptual", ["SQL", "React"], false],
    ["With a mentor using React, I tested SQL under supervision.", "guided", ["SQL"], true],
    ["With a mentor using React, I tested SQL under supervision.", "guided", ["React"], false],
    ["With a mentor using React, I tested SQL under supervision.", "guided", ["SQL", "React"], false],
    ["I built a SQL prototype, and I tested SQL under peer guidance.", "guided", ["SQL"], false],
    ["我用 SQL 实现了原型，我在同伴指导下用 SQL 编写了测试。", "guided", ["SQL"], false],
    ["I am familiar with SQL, but I am unsure whether I can use SQL.", "conceptual", ["SQL"], false],
  ] as const)("keeps each nominated term inside its own support scope: %s / %s / %s", (text, level, labels, expected) => {
    expect(supportsMaterialSelfLevelHint({ kind: "experience", text, labels, level })).toBe(expected);
  });

  it.each([
    ["I tested SQL under supervision.", "guided"],
    ["I am familiar with SQL.", "conceptual"],
    ["I am unsure whether I can use SQL independently.", "uncertain"],
  ] as const)("accepts personal evidence without nominated labels: %s", (text, level) => {
    expect(supportsMaterialSelfLevelHint({ kind: "experience", text, level })).toBe(true);
    expect(supportsMaterialSelfLevelHint({ kind: "experience", text, labels: [], level })).toBe(true);
  });

  it.each([
    ["My colleague is familiar with SQL.", "conceptual"],
    ["I am unsure about my team's ability to test SQL.", "uncertain"],
    ["My SQL self-assessments no longer conflict.", "uncertain"],
    ["团队简介：熟悉 SQL。", "conceptual"],
    ["在讲师指导下，我的同事编写 SQL 查询。", "guided"],
    ["Her placement: followed a runbook to configure SQL.", "guided"],
    ["I built a SQL prototype, while my colleague tested it under supervision.", "guided"],
    ["I documented that my colleague tested SQL under supervision.", "guided"],
    ["I will test SQL under supervision.", "guided"],
    ["I enrolled my colleague in a SQL workshop under supervision.", "guided"],
    ["I installed SQL tooling.", "guided"],
    ["I can independently test SQL.", "uncertain"],
  ] as const)("requires a supported personal assessment, not another actor or ordinary action: %s", (text, level) => {
    expect(supportsMaterialSelfLevelHint({ kind: "experience", text, labels: ["SQL"], level })).toBe(false);
  });

  it.each([
    ["If I tested SQL under supervision, I would document it.", "guided"],
    ["If I built a SQL prototype, and I tested SQL under supervision.", "guided"],
    ["For example, I wrote SQL queries, and I am familiar with SQL.", "conceptual"],
    ["My mentor said, I tested SQL under supervision.", "guided"],
    ["导师说，我熟悉 SQL。", "conceptual"],
    ["It is false that I tested SQL under supervision.", "guided"],
    ["没有证据说我能独立配置 React，我熟悉 SQL。", "conceptual"],
    ["例如，我不熟悉 React，但我熟悉 SQL。", "conceptual"],
    ["I built a React prototype, but Alice said, I am familiar with SQL.", "conceptual"],
  ] as const)("preserves hypothetical, report and denial scope: %s", (text, level) => {
    expect(supportsMaterialSelfLevelHint({ kind: "experience", text, labels: ["SQL"], level })).toBe(false);
  });

  it.each([
    "I am not familiar with React, but I am familiar with SQL.",
    "It is false that I configured React, but I am familiar with SQL.",
    "I am familiar with SQL, but Alice said, I am familiar with React.",
  ])("retains a direct assessment across a contrast or a later report: %s", text => {
    expect(supportsMaterialSelfLevelHint({ kind: "skill-claim", text, labels: ["SQL"], level: "conceptual" })).toBe(true);
  });

  it.each([
    "I did not test SQL under supervision.",
    "I did not build SQL queries under supervision.",
    "I did not configure SQL under supervision.",
    "I personally did not use SQL under supervision.",
    "Under supervision, I did not test SQL.",
    "I never tested SQL under supervision.",
    "I tested SQL without supervision.",
    "I tested SQL not under supervision.",
    "I tested SQL without following tutorials.",
  ])("does not derive a guided hint from denied action or denied guidance: %s", text => {
    expect(supportsMaterialSelfLevelHint({ kind: "experience", text, labels: ["SQL"], level: "guided" })).toBe(false);
  });
});
