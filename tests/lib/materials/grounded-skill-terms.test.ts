import { expect, it } from "vitest";
import { findMaterialSkillEvidence, groundMaterialSkillTerms } from "../../../app/lib/materials/grounded-skill-terms";

it("returns the original UTF-16 slice even when normalization changes its length", () => {
  const quote = "用Ｃ＋＋和Cafe\u0301Flux解析ﬃxtures，然后使用ＷＡＩ－ＡＲＩＡ。";
  expect(findMaterialSkillEvidence(quote, "c++")).toBe("Ｃ＋＋");
  expect(findMaterialSkillEvidence(quote, "CaféFlux")).toBe("Cafe\u0301Flux");
  expect(findMaterialSkillEvidence(quote, "ffixtures")).toBe("ﬃxtures");
  expect(findMaterialSkillEvidence(quote, "WAI-ARIA")).toBe("ＷＡＩ－ＡＲＩＡ");
});

it("retains requested tool names with their source spelling, including unfamiliar tools", () => {
  const quote = "使用WAI-ARIA、QuartzFlux和PostgreSQL。";
  expect(groundMaterialSkillTerms(quote, ["quartzflux", "wai-aria", "QuartzFlux", "other tool"]))
    .toEqual(["QuartzFlux", "WAI-ARIA"]);
  expect(groundMaterialSkillTerms(quote, [])).toEqual([]);
  expect(findMaterialSkillEvidence(quote, "design systems")).toBeNull();
  expect(findMaterialSkillEvidence(quote, "SQL")).toBeNull();
});

it.each([
  ["PostgreSQL", "SQL"], ["WAI-ARIA", "ARIA"], ["Node.js", "Node"], ["C++", "C"],
  ["C#", "C"], [".NET", "NET"], ["fancy_SQL", "SQL"], ["résuméTools", "Tools"],
  ["𐐐Flux", "Flux"], ["Aﬃ", "ff"], ["Reactive", "React"], ["Rusty", "Rust"],
])("rejects an incomplete name in %s (%s)", (quote, term) => {
  expect(findMaterialSkillEvidence(quote, term)).toBeNull();
});

it("requires one grounded occurrence within the supplied quote", () => {
  const quote = "After testing QuartzFluxish, we tried QuartzFlux.";
  expect(findMaterialSkillEvidence(quote, "QuartzFlux")).toBe("QuartzFlux");
  expect(findMaterialSkillEvidence("SQL and sql", "SQL")).toBeNull();
  expect(groundMaterialSkillTerms("SQL and sql", ["SQL"])).toEqual([]);
});

it("uses the review contract's eight-label and 100 UTF-16-unit limits without truncating names", () => {
  const limit = "𐐀".repeat(50), over = limit + "Z";
  const names = [limit, "FluxB", "FluxC", "FluxD", "FluxE", "FluxF", "FluxG", "FluxH", "FluxI"];
  expect(groundMaterialSkillTerms(names.join(", "), names)).toEqual(names.slice(0, 8));
  expect(groundMaterialSkillTerms(over, [over, limit, "  "])).toEqual([]);
  expect(findMaterialSkillEvidence(over, over)).toBeNull();
});

it.each([
  ["I CLEANED DATA before the migration.", "CLEANED DATA", "data cleaning"],
  ["I clean data on Tuesdays.", "clean data", "data cleaning"],
  ["After cleaning data, I wrote the change log.", "cleaning data", "data cleaning"],
  ["先清洗数据，再核对记录。", "清洗数据", "data cleaning"],
  ["工作内容包括数据分析。", "数据分析", "data analysis"],
  ["I visualised data for a book.", "visualised data", "data visualization"],
  ["每周负责代码评审。", "代码评审", "code review"],
  ["I ran usability tests for the studio.", "usability tests", "usability testing"],
  ["协助团队完成财务建模。", "财务建模", "financial modeling"],
])("grounds the reviewed equivalent in %s", (quote, phrase, label) => {
  expect(groundMaterialSkillTerms(quote, [phrase])).toEqual([label]);
  expect(findMaterialSkillEvidence(quote, label)).toBe(phrase);
});

it("requires literal input at extraction and limits reviewed labels to equal meanings", () => {
  const quote = "I cleaned data, built a report, and tried WAI-ARIA.";
  expect(groundMaterialSkillTerms(quote, ["data cleaning", "analytics", "design systems"])).toEqual([]);
  expect(findMaterialSkillEvidence(quote, "analytics")).toBeNull();
  expect(findMaterialSkillEvidence(quote, "design systems")).toBeNull();
  expect(findMaterialSkillEvidence("We use retrieval augmented generation.", "RAG")).toBeNull();
  expect(findMaterialSkillEvidence("I practised data cleaning.", "清洗数据")).toBe("data cleaning");
});

it("withholds a canonical label when its evidence could point to two different phrases", () => {
  const quote = "After cleaning data, we cleaned data again.";
  expect(findMaterialSkillEvidence(quote, "data cleaning")).toBeNull();
  expect(groundMaterialSkillTerms(quote, ["cleaned data", "cleaning data"])).toEqual([]);
});

it.each([
  ["I haven't cleaned data.", "cleaned data", "data cleaning"],
  ["I have no experience with WAI-ARIA.", "WAI-ARIA", "WAI-ARIA"],
  ["We never used QuartzFlux or RasterWax.", "RasterWax", "RasterWax"],
  ["SQL experience isn't required.", "SQL", "SQL"],
  ["我尚未清洗数据。", "清洗数据", "data cleaning"],
  ["我没有使用过 PostgreSQL。", "PostgreSQL", "PostgreSQL"],
])("withholds a label supported only by an explicit denial in %s", (quote, term, label) => {
  expect(groundMaterialSkillTerms(quote, [term])).toEqual([]);
  expect(findMaterialSkillEvidence(quote, label)).toBeNull();
});

it("keeps evidence affirmed in a separate clause and limits negation to what it qualifies", () => {
  expect(groundMaterialSkillTerms("We never used RasterWax but used QuartzFlux.", ["RasterWax", "QuartzFlux"])).toEqual(["QuartzFlux"]);
  expect(findMaterialSkillEvidence("我未做过财务建模，但每天清洗数据。", "data cleaning")).toBe("清洗数据");
  expect(findMaterialSkillEvidence("Without supervision I cleaned data.", "data cleaning")).toBe("cleaned data");
  expect(findMaterialSkillEvidence("Not only SQL but other tools too.", "SQL")).toBe("SQL");
});

it("does not derive an activity from an adjective or a tool from a plain word", () => {
  expect(findMaterialSkillEvidence("We received clean data.", "data cleaning")).toBeNull();
  expect(findMaterialSkillEvidence("I go to meetings.", "Go")).toBeNull();
  expect(findMaterialSkillEvidence("I received a grade of C.", "C")).toBeNull();
  expect(findMaterialSkillEvidence("I used it for inventory.", "IT")).toBeNull();
  expect(groundMaterialSkillTerms("I wrote the service in Go.", ["Go"])).toEqual(["Go"]);
  expect(groundMaterialSkillTerms("使用R语言处理样本。", ["R"])).toEqual(["R"]);
});

it.each([
  ["I cleaned transaction records ahead of the audit.", "cleaned transaction records"],
  ["Cleaning missing values was part of the survey.", "Cleaning missing values"],
  ["We cleansed the duplicate sensor rows before calibration.", "cleansed the duplicate sensor rows"],
  ["I cleaned\nthe order dataset before export.", "cleaned\nthe order dataset"],
  ["清洗空值记录后再交付。", "清洗空值记录"],
  ["我对订单数据做清洗，然后核对样本。", "对订单数据做清洗"],
  ["核查前先清洗了重复交易记录。", "清洗了重复交易记录"],
  ["上周对传感器数据进行了清洗。", "对传感器数据进行了清洗"],
])("binds a data-cleaning action and its explicit object in %s", (quote, phrase) => {
  expect(groundMaterialSkillTerms(quote, [phrase])).toEqual(["data cleaning"]);
  expect(findMaterialSkillEvidence(quote, "data cleaning")).toBe(phrase);
});

it.each([
  ["I cleaned warehouse hardware.", "cleaned warehouse hardware"],
  ["We are cleaning windows before the survey.", "cleaning windows"],
  ["I cleaned the data center racks.", "cleaned the data"],
  ["They cleaned vinyl records.", "cleaned vinyl records"],
  ["我清洗数据库机房的冷却管道。", "清洗数据"],
  ["我对仓库设备做清洗。", "对仓库设备做清洗"],
  ["We received clean transaction records.", "clean transaction records"],
])("does not turn a different object or an adjective into data cleaning in %s", (quote, phrase) => {
  expect(groundMaterialSkillTerms(quote, [phrase])).not.toContain("data cleaning");
  expect(findMaterialSkillEvidence(quote, "data cleaning")).toBeNull();
});

it("requires the nominated action, even when the quote contains another reviewed activity", () => {
  const quote = "I cleaned inventory records and used a spreadsheet to track repairs.";
  expect(groundMaterialSkillTerms(quote, ["spreadsheet"])).toEqual(["spreadsheets"]);
  expect(groundMaterialSkillTerms(quote, ["data cleaning"])).toEqual([]);
});

it.each([
  ["I updated the spreadsheets.", "spreadsheets", "spreadsheets"],
  ["每周整理电子表格。", "电子表格", "spreadsheets"],
  ["We wrote unit tests for each package.", "unit tests", "unit testing"],
  ["后来为这个模块补充单元测试。", "单元测试", "unit testing"],
])("retains the original source form for the reviewed term in %s", (quote, phrase, label) => {
  expect(groundMaterialSkillTerms(quote, [phrase])).toEqual([label]);
  expect(findMaterialSkillEvidence(quote, label)).toBe(phrase);
});

it("preserves a novel identifier under Unicode case folding and a grammatical possessive", () => {
  expect(groundMaterialSkillTerms("I ran ΟΣ.", ["ΟΣ"])).toEqual(["ΟΣ"]);
  expect(findMaterialSkillEvidence("I ran ΟΣ.", "ος")).toBe("ΟΣ");
  expect(groundMaterialSkillTerms("I used QuartzFlux’s formatter.", ["QuartzFlux"])).toEqual(["QuartzFlux"]);
});

it("avoids turning a denied phrase or a supplied result into an activity", () => {
  expect(groundMaterialSkillTerms("I do not know QuartzFlux.", ["QuartzFlux", "not know QuartzFlux"])).toEqual([]);
  expect(groundMaterialSkillTerms("我不懂财务建模。", ["财务建模", "不懂财务建模"])).toEqual([]);
  expect(findMaterialSkillEvidence("We received cleaned transaction records.", "data cleaning")).toBeNull();
});

it("allows an explicitly named programming language in a list governed by the same verb", () => {
  expect(groundMaterialSkillTerms("I used Kotlin and Go for the two clients.", ["Go"])).toEqual(["Go"]);
});

it.each([
  ["PostgreSQL experience is not necessary for this role.", ["PostgreSQL"]],
  ["I used neither SQL nor PostgreSQL.", ["SQL", "PostgreSQL"]],
  ["SQL and PostgreSQL are not prerequisites for this role.", ["SQL", "PostgreSQL"]],
  ["岗位不要求有 SQL 经验。", ["SQL"]],
  ["无需有 PostgreSQL 或 SQL 经验。", ["PostgreSQL", "SQL"]],
  ["Applicants must react quickly to production alerts.", ["React"]],
  ["Excel at explaining complex trade-offs.", ["Excel"]],
] as const)("withholds terms that would turn a denial or an ordinary verb into a skill in %s", (quote, words) => {
  expect(groundMaterialSkillTerms(quote, words)).toEqual([]);
  for (const word of words) expect(findMaterialSkillEvidence(quote, word)).toBeNull();
});

it("retains named technology across contrasting clauses and distinguishes technical use from a verb", () => {
  expect(groundMaterialSkillTerms("SQL is required, but PostgreSQL is not necessary.", ["SQL", "PostgreSQL"])).toEqual(["SQL"]);
  expect(groundMaterialSkillTerms("I use react to build forms and Excel to analyze inventory.", ["React", "Excel"])).toEqual(["react", "Excel"]);
});
