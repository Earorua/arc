// Local-only Node/workerd comparison of the committed mapping implementation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare, Log, LogLevel } from "miniflare";

const project = new URL("../../../", import.meta.url);
const contents = `
  import { mapMaterialItemTerms, mapMaterialItems } from "./app/lib/materials/skill-mapper";
  import { flagshipBlueprint } from "./app/data/flagship-blueprint";
  import { flagshipUnitRegistry } from "./app/data/flagship-unit-registry";
  export function inspect(data) {
    const blueprint = structuredClone(flagshipBlueprint), registry = structuredClone(flagshipUnitRegistry);
    if (data.research) { blueprint.id = "research-role"; registry.blueprintId = blueprint.id; }
    if (data.future) { registry.version = "2027.01.1"; }
    const items = [{ id: "fact", kind: "experience", origin: "user", sourceRef: null, requirementLevel: null, ...data.item }];
    return { terms: mapMaterialItemTerms(items, blueprint, registry, data.options), grouped: mapMaterialItems(items, blueprint, registry, data.options) };
  }
  export default { async fetch(req) { return Response.json(inspect(await req.json())); } };
`;
const compiled = await build({ stdin: { contents, resolveDir: fileURLToPath(project), loader: "ts" }, write: false, bundle: true, format: "esm", target: "es2022", platform: "browser" });
const script = compiled.outputFiles[0].text;
const node = await import(`data:text/javascript;base64,${Buffer.from(script).toString("base64")}`);
const config = JSON.parse(readFileSync(new URL("worker/document-executor/wrangler.local.jsonc", project)));
let outbound = 0;
const mf = new Miniflare({ cf: false, host: "127.0.0.1", log: new Log(LogLevel.ERROR), modules: true,
  compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags, script,
  outboundService: () => { outbound++; return new Response(null, { status: 503 }); } });
const make = (text, skillLabels, extra = {}) => ({ item: { text, skillLabels }, ...extra });
const cases = [
  ["ui-token", make("I designed UI tokens in Figma.", ["UI tokens", "Figma"]), [["mapped", ["design-systems"]], ["uncovered", []]]],
  ["figma-alone", make("I designed UI tokens in Figma.", ["Figma"]), [["uncovered", []]]],
  ["retained-only", make("I built React components and UI tokens in Figma.", ["UI tokens"]), [["mapped", ["design-systems"]]]],
  ["empty-retained", make("I built React components and UI tokens in Figma.", []), []],
  ["relational-modeling", make("I practiced data modeling with SQL and foreign keys.", ["data modeling"]), [["mapped", ["sql"]]]],
  ["financial-modeling", make("I used data modeling for financial forecasting.", ["data modeling"]), [["uncovered", []]]],
  ["runtime-logs", make("I inspected API logs for failed requests.", ["logs"]), [["mapped", ["observability"]]]],
  ["unrelated-clause", make("I read logs. We use API requests elsewhere.", ["logs"]), [["uncovered", []]]],
  ["oauth-token", make("I handle OAuth tokens in the UI.", ["tokens"]), [["uncovered", []]]],
  ["async-testing", make("I practiced asynchronous testing in TypeScript.", ["asynchronous testing"]), [["mapped", ["testing"]]]],
  ["chinese-modeling", make("我练习数据库的数据建模和外键设计。", ["数据建模"]), [["mapped", ["sql"]]]],
  ["research-isolation", make("I designed UI tokens in Figma.", ["UI tokens"], { research: true }), [["uncovered", []]]],
  ["version-isolation", make("I designed UI tokens in Figma.", ["UI tokens"], { future: true }), [["uncovered", []]]],
  ["per-term-omit", make("I built React components and UI tokens in Figma.", ["React", "UI tokens"], { options: { termMappings: { fact: [{ skillLabel: "UI tokens", skillIds: [] }] } } }), [["mapped", ["react"]], ["omitted", []]]],
  ["unadopted-topic", { item: { kind: "constraint", text: "I want to focus on SQL.", skillLabels: ["SQL"] } }, [["non-learning", []]]],
  ["adopted-topic", { item: { kind: "constraint", text: "I want to focus on SQL.", skillLabels: ["SQL"] }, options: { learningIntentItemIds: ["fact"] } }, [["mapped", ["sql"]]]],
  ["other-team-ui", make("I assemble mechanical components, while another team uses Figma.", ["components"]), [["uncovered", []]]],
  ["negative-ui", make("I design components for engines, not user interfaces.", ["components"]), [["uncovered", []]]],
  ["negative-database", make("I use modeling for clay sculptures, not databases.", ["modeling"]), [["uncovered", []]]],
  ["negative-telemetry", make("I inspect paper logs, not API telemetry.", ["logs"]), [["uncovered", []]]],
  ["other-team-ui-zh", make("我制作发动机组件，而另一组使用 Figma 设计界面。", ["组件"]), [["uncovered", []]]],
  ["negative-ui-zh", make("我设计机械组件，不涉及用户界面。", ["组件"]), [["uncovered", []]]],
  ["negative-database-zh", make("我给泥塑建模，而不是数据库建模。", ["建模"]), [["uncovered", []]]],
  ["other-actor-telemetry-zh", make("我查看日志，API 监控由同事负责。", ["日志"]), [["uncovered", []]]],
  ["paper-service-log", make("I maintain paper logs for customer service.", ["logs"]), [["uncovered", []]]],
  ["paper-service-log-zh", make("我整理客服的纸质服务日志。", ["日志"]), [["uncovered", []]]],
  ["physical-retry-tests", make("I schedule asynchronous tests for laboratory samples with retries.", ["asynchronous tests"]), [["uncovered", []]]],
  ["customer-request-tests", make("I schedule asynchronous tests for customer requests.", ["asynchronous tests"]), [["uncovered", []]]],
  ["physical-retry-tests-zh", make("我为实验室样本的重试安排异步测试。", ["异步测试"]), [["uncovered", []]]],
];
const checks = [];
try {
  for (const [name, input, expected] of cases) {
    const response = await mf.dispatchFetch("http://127.0.0.1/mapping", { method: "POST", body: JSON.stringify(input) });
    assert.equal(response.status, 200, name);
    const native = await response.json();
    assert.deepEqual(native, node.inspect(input), `${name}: Node/workerd`);
    assert.deepEqual(native.terms.map(term => [term.status, term.skillIds]), expected, name);
    checks.push({ name, passed: true });
  }
  assert.equal(outbound, 0);
  console.log(JSON.stringify({ checks, passed: checks.length, failed: 0, outbound, modelCalls: 0 }));
} finally { await mf.dispose(); }
