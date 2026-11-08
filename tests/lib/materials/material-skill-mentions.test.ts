import { expect, it } from "vitest";
import {
  findMaterialSkillEvidence,
  findMaterialSkillMention,
  groundMaterialSkillMentions,
  groundMaterialSkillTerms,
} from "../../../app/lib/materials/grounded-skill-terms";

function expectMention(quote: string, label: string, expected: string | null) {
  expect(findMaterialSkillMention).toBeTypeOf("function");
  expect(findMaterialSkillMention(quote, label)).toBe(expected);
}

function expectMentions(quote: string, terms: readonly string[], expected: readonly string[]) {
  expect(groundMaterialSkillMentions).toBeTypeOf("function");
  expect(groundMaterialSkillMentions(quote, terms)).toEqual(expected);
}

it.each([
  ["必须掌握键盘可访问性的基本检查。", "键盘可访问性", true],
  ["I cannot yet configure a Kubernetes cluster myself.", "configure a Kubernetes cluster", false],
  ["简介：熟悉 SQL，可独立完成报表。", "熟悉 SQL，可独立完成报表", true],
] as const)("retains the nominated source phrase without confusing a mention with evidence in %s", (quote, term, affirmative) => {
  expectMention(quote, term, term);
  expectMentions(quote, [term], [term]);
  expect(findMaterialSkillEvidence(quote, term)).toBe(affirmative ? term : null);
  expect(groundMaterialSkillTerms(quote, [term])).toEqual(affirmative ? [term] : []);
});

it.each([
  ["必须掌握键盘可访问性的基本检查。", "键盘可访问性"],
  ["提高可维护性的设计质量。", "可维护性"],
  ["记录可靠性的评估结果。", "可靠性"],
  ["检查一致性的约束。", "一致性"],
  ["检查可访问性的确切含义。", "可访问性"],
] as const)("shares the narrow Han nominal end boundary with affirmative evidence in %s", (quote, term) => {
  expect(findMaterialSkillEvidence(quote, term)).toBe(term);
  expect(groundMaterialSkillTerms(quote, [term])).toEqual([term]);
  expectMention(quote, term, term);
  expectMentions(quote, [term], [term]);
});

it.each([
  ["检查可访问性的。", "可访问性"],
  ["检查可访问性的，基本要求。", "可访问性"],
  ["检查可访问性的X。", "可访问性"],
  ["检查可访问性的1。", "可访问性"],
  ["检查可访问性的了。", "可访问性"],
  ["检查可访问性的的检查。", "可访问性"],
  ["检查可访问性的基本检查。", "性"],
  ["检查键盘可访问性的基本检查。", "盘可访问性"],
  ["检查可维护性的设计。", "护性"],
  ["检查可靠性的评估。", "靠性"],
  ["检查可访问性\u0301的基本要求。", "可访问性"],
  ["检查UI-可访问性的基本要求。", "可访问性"],
  ["标识符是urn:可访问性的基本检查。", "可访问性"],
  ["标识符是服务:可维护性的基本检查。", "可维护性"],
] as const)("does not broaden a Han end boundary past lexical protections in %s (%s)", (quote, term) => {
  expect(findMaterialSkillEvidence(quote, term)).toBeNull();
  expect(groundMaterialSkillTerms(quote, [term])).toEqual([]);
  expectMention(quote, term, null);
  expectMentions(quote, [term], []);
});

it("retains the Han topic in a denial without granting affirmative evidence", () => {
  const quote = "没有掌握键盘可访问性的基本检查。";
  expectMention(quote, "键盘可访问性", "键盘可访问性");
  expectMentions(quote, ["键盘可访问性"], ["键盘可访问性"]);
  expect(findMaterialSkillEvidence(quote, "键盘可访问性")).toBeNull();
  expect(groundMaterialSkillTerms(quote, ["键盘可访问性"])).toEqual([]);
});

it.each([
  "简介", "个人简介", "自我介绍", "个人技能", "个人能力",
  "profile", "personal profile", "my profile", "personal summary", "my summary",
])("recognizes the conventional personal heading %s only as a lexical delimiter", heading => {
  for (const prefix of ["", "Overview\n- ", "* ", "• "]) {
    const quote = `${prefix}${heading}：AuroraForge。`;
    expect(findMaterialSkillEvidence(quote, "AuroraForge")).toBe("AuroraForge");
    expect(groundMaterialSkillTerms(quote, ["AuroraForge"])).toEqual(["AuroraForge"]);
    expectMention(quote, "AuroraForge", "AuroraForge");
    expectMentions(quote, ["AuroraForge"], ["AuroraForge"]);
  }
});

it.each([
  "团队简介:AuroraForge", "Team profile:AuroraForge", "团队技能:AuroraForge",
  "报告：简介:AuroraForge", "Report profile:AuroraForge", "Alice's profile:AuroraForge",
  "He wrote profile:AuroraForge", "介绍：个人技能:AuroraForge", "Other:AuroraForge",
  "Read urn:AuroraForge", "https://profile:AuroraForge/setup", "profile:AuroraForgeHelper",
])("keeps team, attribution, report prefixes and partial names outside heading support in %s", quote => {
  expect(findMaterialSkillEvidence(quote, "AuroraForge")).toBeNull();
  expect(groundMaterialSkillTerms(quote, ["AuroraForge"])).toEqual([]);
  expectMention(quote, "AuroraForge", null);
  expectMentions(quote, ["AuroraForge"], []);
});

it("preserves a complete namespace after a heading while rejecting its parts", () => {
  const quote = "Profile:Orion:Forge.";
  expectMention(quote, "Orion:Forge", "Orion:Forge");
  expectMentions(quote, ["Orion:Forge", "Orion", "Forge"], ["Orion:Forge"]);
  expectMention(quote, "Orion", null);
  expectMention(quote, "Forge", null);
});

it.each([
  ["I have no experience with WAI-ARIA.", ["WAI-ARIA"]],
  ["We never used QuartzFlux or RasterWax.", ["QuartzFlux", "RasterWax"]],
  ["SQL experience isn't required.", ["SQL"]],
  ["I cannot currently use SQL.", ["SQL"]],
  ["I have never really used PostgreSQL.", ["PostgreSQL"]],
  ["I do not yet know how to use PostgreSQL.", ["PostgreSQL"]],
  ["I used neither SQL nor PostgreSQL.", ["SQL", "PostgreSQL"]],
  ["SQL and PostgreSQL are not prerequisites.", ["SQL", "PostgreSQL"]],
  ["Neither CaféFlux nor ΟΣ is required.", ["CaféFlux", "ΟΣ"]],
  ["No experience with Nova Flux or PostgreSQL is required.", ["Nova Flux", "PostgreSQL"]],
  ["No experience with WAI-ARIA, Node.js, or PostgreSQL is required.", ["WAI-ARIA", "Node.js", "PostgreSQL"]],
  ["SQL, CaféFlux, and PostgreSQL are not required.", ["SQL", "CaféFlux", "PostgreSQL"]],
  ["No experience with “SQL” or ‘PostgreSQL’ is required.", ["SQL", "PostgreSQL"]],
  ["No experience with “SQL or PostgreSQL” is required.", ["SQL", "PostgreSQL"]],
  ["我没有使用过 PostgreSQL。", ["PostgreSQL"]],
  ["岗位不要求有 SQL 经验。", ["SQL"]],
  ["无需有PostgreSQL、SQL或WAI-ARIA经验。", ["PostgreSQL", "SQL", "WAI-ARIA"]],
  ["SQL 和 PostgreSQL 经验并非必要。", ["SQL", "PostgreSQL"]],
] as const)("retains topics under attached English and Chinese denials in %s", (quote, terms) => {
  expectMentions(quote, terms, terms);
  expect(groundMaterialSkillTerms(quote, terms)).toEqual([]);
  for (const term of terms) {
    expectMention(quote, term, term);
    expect(findMaterialSkillEvidence(quote, term)).toBeNull();
  }
});

it("retains a nominated topic in a denial list longer than the nomination limit", () => {
  const names = Array.from({ length: 60 }, (_, index) => `Flux${index}`);
  const quote = `No experience with ${names.join(", ")}, or PostgreSQL is required.`;
  expectMentions(quote, ["PostgreSQL"], ["PostgreSQL"]);
  expectMention(quote, "PostgreSQL", "PostgreSQL");
  expect(findMaterialSkillEvidence(quote, "PostgreSQL")).toBeNull();
});

it.each([
  ["SQL is required, but PostgreSQL is not necessary.", ["SQL", "PostgreSQL"], ["SQL"]],
  ["Neither SQL nor PostgreSQL was used, but I tried QuartzFlux.", ["SQL", "PostgreSQL", "QuartzFlux"], ["QuartzFlux"]],
  ["无需有 SQL 经验，但需要 PostgreSQL。", ["SQL", "PostgreSQL"], ["PostgreSQL"]],
  ["I never used SQL, but I now use SQL.", ["SQL", "SQL"], ["SQL"]],
] as const)("keeps mention and affirmative selection distinct across clauses in %s", (quote, terms, affirmed) => {
  expectMentions(quote, terms, [...new Set(terms)]);
  expect(groundMaterialSkillTerms(quote, terms)).toEqual(affirmed);
  for (const term of terms) expectMention(quote, term, term);
});

it.each([
  ["I haven't cleaned data.", "cleaned data", "data cleaning"],
  ["我尚未清洗数据。", "清洗数据", "data cleaning"],
  ["I have never analyzed data.", "analyzed data", "data analysis"],
  ["I haven't reviewed code.", "reviewed code", "code review"],
  ["Component tests are not required.", "Component tests", "component testing"],
  ["我尚未接触增量加载。", "增量加载", "incremental loading"],
] as const)("normalizes a denied reviewed equivalent only after literal nomination in %s", (quote, phrase, label) => {
  expectMentions(quote, [phrase], [label]);
  expectMention(quote, label, phrase);
  expectMentions(quote, [label], []);
  expect(findMaterialSkillEvidence(quote, label)).toBeNull();
  expect(groundMaterialSkillTerms(quote, [phrase])).toEqual([]);
});

it("does not mine un-nominated text or reverse-infer a different label", () => {
  const quote = "I haven't cleaned data or used WAI-ARIA, but I built a dashboard.";
  expectMentions(quote, [], []);
  expectMentions(quote, ["WAI-ARIA"], ["WAI-ARIA"]);
  expectMentions(quote, ["data cleaning", "analytics", "design systems", "data visualization"], []);
  expectMention(quote, "analytics", null);
  expectMention("We use retrieval augmented generation.", "RAG", null);
});

it.each([
  ["I never used SQL, but I use sql.", "SQL"],
  ["I never used ＳＱＬ, but I use SQL.", "SQL"],
  ["I never cleaned data, but I am cleaning data.", "data cleaning"],
] as const)("does not choose a source spelling across affirmative and denied phrases in %s", (quote, label) => {
  expectMention(quote, label, null);
  expectMentions(quote, [label], []);
});

it("withholds a canonical label when two nominated reviewed forms are ambiguous", () => {
  const quote = "I never cleaned data, but I am cleaning data.";
  expectMentions(quote, ["cleaned data", "cleaning data"], []);
  expect(findMaterialSkillEvidence(quote, "data cleaning")).toBe("cleaning data");
});

it("retains repeated original spellings and a grammatical possessive", () => {
  expectMention("I never used LumenKit and never used LumenKit.", "LumenKit", "LumenKit");
  expectMentions("I never used LumenKit and never used LumenKit.", ["LumenKit", "LumenKit"], ["LumenKit"]);
  expectMention("I haven't used QuartzFlux’s formatter.", "QuartzFlux", "QuartzFlux");
});

it("returns whole original graphemes under NFKC, combining marks and ligatures", () => {
  const quote = "I never used Ｃ＋＋, Cafe\u0301Flux, ﬃxtures, or ＷＡＩ－ＡＲＩＡ.";
  const terms = ["C++", "CaféFlux", "ffixtures", "WAI-ARIA"];
  const originals = ["Ｃ＋＋", "Cafe\u0301Flux", "ﬃxtures", "ＷＡＩ－ＡＲＩＡ"];
  expectMentions(quote, terms, originals);
  terms.forEach((term, index) => expectMention(quote, term, originals[index]));
  expect(groundMaterialSkillTerms(quote, terms)).toEqual([]);
});

it.each([
  ["PostgreSQL", "SQL"], ["WAI-ARIA", "ARIA"], ["Node.js", "Node"], ["C++", "C"],
  ["C#", "C"], [".NET", "NET"], ["fancy_SQL", "SQL"], ["résuméTools", "Tools"],
  ["𐐐Flux", "Flux"], ["Aﬃ", "ff"], ["ﬃ", "f"], ["Cafe\u0301", "Cafe"],
  ["Reactive", "React"], ["Rusty", "Rust"], ["Orion::Flux", "Flux"],
])("preserves whole technical names, words and graphemes in %s (%s)", (quote, term) => {
  expectMention(quote, term, null);
  expectMentions(quote, [term], []);
});

it("uses the same eight-nomination and 100 UTF-16-unit limits", () => {
  const limit = "𐐀".repeat(50), over = limit + "Z";
  const names = [limit, "FluxB", "FluxC", "FluxD", "FluxE", "FluxF", "FluxG", "FluxH", "FluxI"];
  const quote = `I never used ${names.join(", ")}.`;
  expectMentions(quote, names, names.slice(0, 8));
  expectMention(quote, limit, limit);
  expectMentions(over, [over, limit, "  ", "!!!"], []);
  expectMention(over, over, null);
  expectMentions("FluxI", [...Array<string>(8).fill("absent"), "FluxI"], []);
  expectMention("a\u0301".repeat(51), "á".repeat(51), null);
});

it.each([
  "not know SQL", "no SQL", "never used SQL", "without SQL", "cannot use SQL", "haven't used SQL",
  "从未使用SQL", "尚未使用SQL", "未使用SQL", "不会SQL", "不懂SQL", "不熟悉SQL", "没有使用SQL",
])("rejects the negative label itself in both modes: %s", label => {
  expectMention(label, label, null);
  expectMentions(label, [label], []);
  expect(findMaterialSkillEvidence(label, label)).toBeNull();
  expect(groundMaterialSkillTerms(label, [label])).toEqual([]);
});

it.each([
  ["I do not react quickly.", "React"], ["We never excel at explaining data.", "Excel"],
  ["react", "React"], ["excel", "Excel"], ["I do not go to meetings.", "Go"],
  ["I did not receive a grade of C.", "C"], ["I never used it for inventory.", "IT"],
  ["We never received clean transaction records.", "clean transaction records"],
  ["We never received cleaned transaction records.", "cleaned transaction records"],
  ["I never cleaned the data center racks.", "cleaned the data"],
  ["我没有清洗数据库机房的冷却管道。", "清洗数据"],
])("does not remove homograph or cleaning-object checks together with denial checks in %s", (quote, term) => {
  expectMention(quote, term, null);
  expectMentions(quote, [term], []);
});

it("keeps other cleaning objects literal without promoting them to data cleaning", () => {
  const quote = "I never cleaned warehouse hardware.";
  expectMentions(quote, ["cleaned warehouse hardware"], ["cleaned warehouse hardware"]);
  expectMention(quote, "data cleaning", null);
});
