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

it("does not choose between different original spellings within the supplied quote", () => {
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
  ["I used CaféFlux and Go.", ["CaféFlux", "Go"]],
  ["I used Azure Data Factory, R and C.", ["Azure Data Factory", "R", "C"]],
  ["使用CaféFlux和Go。", ["CaféFlux", "Go"]],
] as const)("preserves the governing language context across a literal list in %s", (quote, labels) => {
  expect(groundMaterialSkillTerms(quote, labels)).toEqual(labels);
  for (const label of labels) expect(findMaterialSkillEvidence(quote, label)).toBe(label);
});

it.each([
  ["PostgreSQL experience is not necessary for this role.", ["PostgreSQL"]],
  ["I did not actually use PostgreSQL.", ["PostgreSQL"]],
  ["I cannot currently use SQL.", ["SQL"]],
  ["I have not recently used SQL.", ["SQL"]],
  ["I have never really used PostgreSQL.", ["PostgreSQL"]],
  ["I do not yet know how to use PostgreSQL.", ["PostgreSQL"]],
  ["I am not proficient in PostgreSQL.", ["PostgreSQL"]],
  ["There is no need to know SQL.", ["SQL"]],
  ["Not required: SQL and PostgreSQL.", ["SQL", "PostgreSQL"]],
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

it.each([
  ["Neither CaféFlux nor ΟΣ is required.", ["CaféFlux", "ΟΣ"]],
  ["No experience with Nova Flux or PostgreSQL is required.", ["Nova Flux", "PostgreSQL"]],
  ["SQL and Azure Data Factory are not prerequisites.", ["SQL", "Azure Data Factory"]],
  ["No experience with WAI-ARIA, Node.js, or PostgreSQL is required.", ["WAI-ARIA", "Node.js", "PostgreSQL"]],
  ["SQL, CaféFlux, and PostgreSQL are not required.", ["SQL", "CaféFlux", "PostgreSQL"]],
  ["Data analysis and code review are not prerequisites.", ["Data analysis", "code review"]],
  ["无需有PostgreSQL、SQL或ＷＡＩ－ＡＲＩＡ经验。", ["PostgreSQL", "SQL", "WAI-ARIA"]],
  ["SQL 和 PostgreSQL 经验并非必要。", ["SQL", "PostgreSQL"]],
] as const)("attaches an explicit denial to each member of the bounded list in %s", (quote, terms) => {
  expect(groundMaterialSkillTerms(quote, terms)).toEqual([]);
  for (const term of terms) expect(findMaterialSkillEvidence(quote, term)).toBeNull();
});

it.each([
  "I have no experience with “SQL”.",
  'I have no experience with "SQL".',
  "I have no experience with 'SQL'.",
  "I have no experience with ‘SQL’.",
  "I haven’t used 'SQL'.",
  "“SQL” is not required.",
  "岗位不要求有“SQL”经验。",
  "No experience with “SQL” or ‘PostgreSQL’ is required.",
  "No experience with “SQL or PostgreSQL” is required.",
])("keeps an attached denial visible through boundary quote wrappers in %s", quote => {
  expect(groundMaterialSkillTerms(quote, ["SQL", "PostgreSQL"])).toEqual([]);
  expect(findMaterialSkillEvidence(quote, "SQL")).toBeNull();
  expect(findMaterialSkillEvidence(quote, "PostgreSQL")).toBeNull();
});

it("preserves quoted evidence spelling and contractions outside the supported phrase", () => {
  expect(groundMaterialSkillTerms("I use “Ｃ＋＋” and ‘Cafe\u0301Flux’.", ["C++", "CaféFlux"]))
    .toEqual(["Ｃ＋＋", "Cafe\u0301Flux"]);
  expect(findMaterialSkillEvidence("I use “Cafe\u0301Flux”.", "CaféFlux")).toBe("Cafe\u0301Flux");
  expect(groundMaterialSkillTerms("I haven’t used QuartzFlux, but I use ‘SQL’.", ["QuartzFlux", "SQL"])).toEqual(["SQL"]);
  expect(findMaterialSkillEvidence("I use SQL’s formatter.", "SQL")).toBe("SQL");
});

it("scopes a denial over a source list even when it exceeds the nominated-label limit", () => {
  const names = Array.from({ length: 60 }, (_, index) => `Flux${index}`);
  const prefix = `No experience with ${names.join(", ")}, or PostgreSQL is required.`;
  const suffix = `SQL, ${names.join(", ")}, and PostgreSQL are not required.`;
  expect(prefix.length).toBeLessThanOrEqual(1000);
  expect(suffix.length).toBeLessThanOrEqual(1000);
  expect(findMaterialSkillEvidence(prefix, "PostgreSQL")).toBeNull();
  expect(findMaterialSkillEvidence(suffix, "SQL")).toBeNull();
});

it.each([
  ["SQL is required and PostgreSQL is not necessary.", ["SQL", "PostgreSQL"], ["SQL"]],
  ["I never used SQL and later used PostgreSQL.", ["SQL", "PostgreSQL"], ["PostgreSQL"]],
  ["Neither SQL nor PostgreSQL was used, but I tried QuartzFlux.", ["SQL", "PostgreSQL", "QuartzFlux"], ["QuartzFlux"]],
  ["No SQL experience is required; PostgreSQL is required.", ["SQL", "PostgreSQL"], ["PostgreSQL"]],
  ["I used SQL and PostgreSQL was never required.", ["SQL", "PostgreSQL"], ["SQL"]],
  ["Not only SQL but also PostgreSQL is required.", ["SQL", "PostgreSQL"], ["SQL", "PostgreSQL"]],
  ["无需有 SQL 经验，但需要 PostgreSQL。", ["SQL", "PostgreSQL"], ["PostgreSQL"]],
  ["不仅使用SQL，还使用PostgreSQL。", ["SQL", "PostgreSQL"], ["SQL", "PostgreSQL"]],
] as const)("keeps a denial within its clause in %s", (quote, terms, labels) => {
  expect(groundMaterialSkillTerms(quote, terms)).toEqual(labels);
  for (const label of labels) expect(findMaterialSkillEvidence(quote, label)).toBe(label);
});

it.each([
  "React quickly when incidents happen.",
  "Our engineers react faster.",
  "I can quickly react.",
  "Team members excel.",
  "Most candidates confidently excel.",
  "react",
  "excel",
  "People react more slowly to unclear alerts.",
  "I can react to customer feedback.",
  "We excel at explaining the data.",
  "I excel in customer communication.",
])("does not read ordinary verbs as tools in %s", quote => {
  expect(groundMaterialSkillTerms(quote, ["React", "Excel"])).toEqual([]);
  expect(findMaterialSkillEvidence(quote, "React")).toBeNull();
  expect(findMaterialSkillEvidence(quote, "Excel")).toBeNull();
});

it.each([
  ["Tools: React, Excel, and QuartzFlux.", ["React", "Excel", "QuartzFlux"]],
  ["Tools: react, excel.", ["react", "excel"]],
  ["Tools: CaféFlux, react and excel.", ["CaféFlux", "react", "excel"]],
  ["Tools: Azure Data Factory, react and excel.", ["Azure Data Factory", "react", "excel"]],
  ["I build react components and excel spreadsheets.", ["react", "excel"]],
  ["I use “react” to build forms and “Excel” to analyze inventory.", ["react", "Excel"]],
  ["Our engineers use React faster to build prototypes.", ["React"]],
  ["I built navigation with React Router.", ["React"]],
  ["I did actually use PostgreSQL.", ["PostgreSQL"]],
  ["I have really used PostgreSQL.", ["PostgreSQL"]],
  ["I do know how to use PostgreSQL.", ["PostgreSQL"]],
  ["I am proficient in PostgreSQL.", ["PostgreSQL"]],
  ["There is a need to know SQL.", ["SQL"]],
  ["Required: SQL and PostgreSQL.", ["SQL", "PostgreSQL"]],
  ["I used React and Excel for reporting.", ["React", "Excel"]],
  ["I built React components and Excel spreadsheets.", ["React", "Excel"]],
  ["I use react to build forms.", ["react"]],
  ["We use Excel at work.", ["Excel"]],
  ["React", ["React"]],
  ["Excel", ["Excel"]],
] as const)("preserves named tools in %s", (quote, labels) => {
  expect(groundMaterialSkillTerms(quote, labels)).toEqual(labels);
  for (const label of labels) expect(findMaterialSkillEvidence(quote, label)).toBe(label);
});

it.each([
  ["Required：AuroraForge integration.", "AuroraForge"],
  ["Must have:LumenKit experience.", "LumenKit"],
  ["Nice to have：distributed tracing 阅读经验。", "distributed tracing"],
  ["Optional tools：Élan Data Engine.", "Élan Data Engine"],
  ["Skills:Orion:Forge.", "Orion:Forge"],
  ["Requirements\n- Essential：ＣａｆéFlux。", "ＣａｆéFlux"],
] as const)("retains a literal term after an adjoining skill heading in %s", (quote, term) => {
  expect(groundMaterialSkillTerms(quote, [term])).toEqual([term]);
  expect(findMaterialSkillEvidence(quote, term)).toBe(term);
});

it.each([
  ["Required:AuroraForgeHelper.", "AuroraForge"],
  ["Required:PostgreSQL.", "SQL"],
  ["I used Orion:Forge.", "Forge"],
  ["Skills:Orion:Forge.", "Forge"],
  ["Read urn:AuroraForge for the identifier.", "AuroraForge"],
  ["See https://Required:AuroraForge/setup.", "AuroraForge"],
  ["Not required:AuroraForge.", "AuroraForge"],
  ["Tools:No AuroraForge experience.", "AuroraForge"],
] as const)("does not make an adjoining heading a shortcut past name or denial checks in %s", (quote, term) => {
  expect(groundMaterialSkillTerms(quote, [term])).toEqual([]);
  expect(findMaterialSkillEvidence(quote, term)).toBeNull();
});

it.each([
  ["The identifier is urn:DuckDB.", "DuckDB"],
  ["The identifier is urn:霜桥.", "霜桥"],
  ["The namespace is Orion::Flux.", "Flux"],
  ["The namespace is Orion::Flux.", "Orion"],
  ["标识符是服务:光羽。", "光羽"],
  ["Skills:Orion:Forge.", "Orion"],
] as const)("rejects a partial colon-delimited identifier independently of word segmentation in %s", (quote, term) => {
  expect(groundMaterialSkillTerms(quote, [term])).toEqual([]);
  expect(findMaterialSkillEvidence(quote, term)).toBeNull();
});

it.each([
  ["必备：NebulaKit。", "NebulaKit"],
  ["任职必备：LuminaDB。", "LuminaDB"],
  ["技能：MossWeave。", "MossWeave"],
  ["加分项：RadialMesh。", "RadialMesh"],
  ["技术栈：GlyphFlow。", "GlyphFlow"],
  ["I used these tools: AuroraForge.", "AuroraForge"],
  ["我使用了这些工具：光羽。", "光羽"],
  ["岗位摘要：PhaseDock 为必备。", "PhaseDock"],
  ["职位概述：PhaseDock 为加分项。", "PhaseDock"],
  ["任职清单：PhaseDock 为必备。", "PhaseDock"],
  ["Job summary:PhaseDock is required.", "PhaseDock"],
  ["Requirements:PhaseDock is required.", "PhaseDock"],
  ["Qualifications:PhaseDock is required.", "PhaseDock"],
  ["We used Orion::Flux.", "Orion::Flux"],
] as const)("preserves heading delimiters, spaced prose and complete names in %s", (quote, term) => {
  expect(groundMaterialSkillTerms(quote, [term])).toEqual([term]);
  expect(findMaterialSkillEvidence(quote, term)).toBe(term);
});

it.each([
  ["The draft says AuroraForge is required and AuroraForge is preferred.", "AuroraForge", "AuroraForge"],
  ["I used LumenKit for import and LumenKit for export.", "LumenKit", "LumenKit"],
  ["同一份补充说明同时写着 SQL 必备和 SQL 仅加分。", "SQL", "SQL"],
  ["I used “Ｃ＋＋” and later “Ｃ＋＋”.", "Ｃ＋＋", "Ｃ＋＋"],
  ["I cleaned data and then cleaned data.", "cleaned data", "data cleaning"],
] as const)("keeps one label for the same supported phrase repeated in %s", (quote, term, label) => {
  expect(groundMaterialSkillTerms(quote, [term, term])).toEqual([label]);
  expect(findMaterialSkillEvidence(quote, label)).toBe(term);
});

it.each([
  ["I never used LumenKit and never used LumenKit.", "LumenKit"],
  ["Read urn:StellarKit and urn:StellarKit.", "StellarKit"],
  ["I used LumenKitExtra and LumenKitExtra.", "LumenKit"],
] as const)("does not let repetition supply missing affirmative literal evidence in %s", (quote, term) => {
  expect(groundMaterialSkillTerms(quote, [term])).toEqual([]);
  expect(findMaterialSkillEvidence(quote, term)).toBeNull();
});

it.each([
  ["本周练习增量加载。", "增量加载", "incremental loading"],
  ["I added component tests for the payment panel.", "component tests", "component testing"],
  ["今天补充组件测试。", "组件测试", "component testing"],
  ["I prototyped a dashboard for maintenance scheduling.", "dashboard", "dashboards"],
] as const)("normalizes only the same named activity or noun in %s", (quote, phrase, label) => {
  expect(groundMaterialSkillTerms(quote, [phrase])).toEqual([label]);
  expect(findMaterialSkillEvidence(quote, label)).toBe(phrase);
  expect(groundMaterialSkillTerms(quote, [label])).toEqual([]);
});

it.each([
  ["我尚未接触增量加载。", "增量加载", "incremental loading"],
  ["Component tests are not required.", "Component tests", "component testing"],
  ["We never used dashboards.", "dashboards", "dashboards"],
] as const)("keeps a denial attached to a reviewed equivalent in %s", (quote, phrase, label) => {
  expect(groundMaterialSkillTerms(quote, [phrase])).toEqual([]);
  expect(findMaterialSkillEvidence(quote, label)).toBeNull();
});

it.each([
  ["I built a dashboard.", "analytics"],
  ["I built a dashboard.", "data visualization"],
  ["I test asynchronous logic.", "unit testing"],
  ["I test asynchronous logic.", "component testing"],
  ["我设计交互组件。", "component testing"],
  ["I loaded a cargo container.", "incremental loading"],
] as const)("does not promote a different or broader concept in %s to %s", (quote, label) => {
  expect(groundMaterialSkillTerms(quote, [label])).toEqual([]);
  expect(findMaterialSkillEvidence(quote, label)).toBeNull();
});
