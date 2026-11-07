// Exercise the checked-in decoder inside local workerd and compare it to the Node qualification path.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare, Log, LogLevel } from "miniflare";

const project = new URL("../../../../", import.meta.url);
const load = createRequire(new URL("package.json", project));
const { readSourceSpanExtraction } = load("./worker/document-executor/source-span-extraction.ts");
const config = JSON.parse(readFileSync(new URL("worker/document-executor/wrangler.local.jsonc", project)));
const compiled = await build({ stdin: { contents: `
  import {readSourceSpanExtraction} from "./worker/document-executor/source-span-extraction";
  export default {async fetch(req) {
    const data = await req.json();
    return Response.json(readSourceSpanExtraction(data.chat,data.sources,undefined,data.format));
  }};`, resolveDir: fileURLToPath(project), loader: "ts" }, write: false, bundle: true, format: "esm", target: "es2022", platform: "browser" });
let outbound = 0;
const mf = new Miniflare({ cf: false, host: "127.0.0.1", log: new Log(LogLevel.ERROR), modules: true,
  compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
  script: compiled.outputFiles[0].text, outboundService: () => { outbound++; return new Response(null, { status: 503 }); } });
function exercise(quote, skillTerms, options = {}) {
  const format = options.format ?? "source-spans-v2", source = { segmentId: "s", quote }, kind = options.kind ?? "experience";
  const item = { kind, source, requirementLevel: kind === "requirement" ? "must" : null, selfLevelHint: options.hint ?? null,
    ...(format === "source-spans-v2" ? { skillTerms } : { skillLabels: skillTerms }) };
  const text = options.text ?? quote;
  return { format, sources: { text, segments: [{ id: source.segmentId, start: 0, end: text.length }] },
    chat: { choices: [{ finish_reason: options.finish ?? "stop", message: { content: JSON.stringify({
      format, items: [item], reviewPoints: options.suggest ? [{ code: options.suggest, source }] : [],
    }) } }] } };
}
const cases = [
  ["bilingual-cleaning", exercise("我用 SQL 清洗空值记录。", ["SQL", "清洗空值记录", "invented"]), ["SQL", "data cleaning"], [], null],
  ["english-action", exercise("I cleaned transaction records with DuckDB.", ["cleaned transaction records", "DuckDB"]), ["data cleaning", "DuckDB"], [], null],
  ["novel-requirement", exercise("FlarnDock is required.", ["FlarnDock"], { kind: "requirement", suggest: "uncovered-skill" }), ["FlarnDock"], [], null],
  ["explicit-course-gap", exercise("The curriculum does not cover FlarnDock.", ["FlarnDock"], { kind: "constraint" }), null, ["uncovered-skill"], null],
  ["source-only-action", exercise("I installed DuckDB.", ["DuckDB"], { hint: "guided", suggest: "confirm-self-assessment" }), ["DuckDB"], [], null],
  ["preserved-v1", exercise("FlarnDock is required.", ["FlarnDock"], { kind: "requirement", format: "source-spans-v1", suggest: "uncovered-skill" }), ["FlarnDock"], ["uncovered-skill"], null],
  ["truncated", exercise("I used DuckDB.", ["DuckDB"], { finish: "length" }), null, [], null],
  ["coordinated-denial", exercise("SQL and PostgreSQL are not prerequisites for this role.", ["SQL", "PostgreSQL"], { kind: "requirement" }), [], [], null, "unspecified"],
  ["ordinary-react", exercise("Applicants must react quickly to production alerts.", ["React"], { kind: "requirement" }), [], [], null],
  ["technical-react-excel", exercise("I use react to build forms and Excel to analyze inventory.", ["React", "Excel"]), ["react", "Excel"], [], null],
  ["optional-jd", exercise("PostgreSQL is optional for this role.", ["PostgreSQL"], { kind: "requirement" }), ["PostgreSQL"], [], null, "preferred"],
  ["unclear-jd", exercise("We use PostgreSQL.", ["PostgreSQL"], { kind: "requirement" }), ["PostgreSQL"], [], null, "unspecified"],
  ["heading-jd", exercise("PostgreSQL", ["PostgreSQL"], { kind: "requirement", text: "## Required skills\n- PostgreSQL" }), ["PostgreSQL"], [], null, "must"],
  ["plain-heading-jd", exercise("SQL", ["SQL"], { kind: "requirement", text: "必备：\nSQL" }), ["SQL"], [], null, "must"],
  ["unicode-tool-list", exercise("Tools: CaféFlux, react and excel.", ["CaféFlux", "react", "excel"]), ["CaféFlux", "react", "excel"], [], null],
  ["multiword-tool-list", exercise("Tools: Azure Data Factory, react and excel.", ["Azure Data Factory", "react", "excel"]), ["Azure Data Factory", "react", "excel"], [], null],
  ["mixed-attribution", exercise("I am familiar with HTML, but my colleague uses PostgreSQL.", ["HTML", "PostgreSQL"], { hint: "conceptual" }), ["HTML", "PostgreSQL"], [], null],
  ["list-assessment", exercise("- I am familiar with SQL.", ["SQL"], { hint: "conceptual" }), ["SQL"], ["confirm-self-assessment"], "conceptual"],
  ["quoted-assessment", exercise("I am familiar with DuckDB.", ["DuckDB"], { hint: "conceptual", text: "The manual says “First choose a tool. I am familiar with DuckDB. Continue the worksheet.”" }), ["DuckDB"], [], null],
];
const checks = [];
try {
  for (const [name, input, labels, codes, hint, requirementLevel] of cases) {
    const response = await mf.dispatchFetch("http://127.0.0.1/inspect", { method: "POST", body: JSON.stringify(input) });
    if (response.status !== 200) throw new Error(name + " HTTP " + response.status + " " + (await response.text()).slice(0, 1000));
    const native = await response.json();
    assert.deepEqual(native, readSourceSpanExtraction(input.chat, input.sources, undefined, input.format), name);
    if (name === "truncated") assert.deepEqual(native, { candidate: null, extractionRead: "output-limit" });
    else if (name === "quoted-assessment") assert.deepEqual(native, { candidate: null, extractionRead: "invalid-source" });
    else {
      assert.equal(native.extractionRead, "parsed", name);
      const fact = native.candidate.items[0];
      assert.equal(fact.text, JSON.parse(input.chat.choices[0].message.content).items[0].source.quote);
      if (labels) assert.deepEqual(fact.skillLabels, labels, name);
      assert.equal(fact.selfLevelHint, hint);
      if (requirementLevel) assert.equal(fact.requirementLevel, requirementLevel);
      assert.deepEqual(native.candidate.reviewPoints.map(p => p.code), codes, name);
    }
    checks.push(name);
  }
} finally { await mf.dispose(); }
assert.equal(outbound, 0);
process.stdout.write(JSON.stringify({ mode: "local-workerd-vs-node", compatibilityDate: config.compatibility_date,
  checks, nodeAndWorkerIdentical: true, workerOutboundRequests: outbound, realModelCalls: 0 }, null, 2) + "\n");
