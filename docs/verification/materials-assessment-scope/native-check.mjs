// Offline, explicit-oracle comparison. Does not import evaluator gold or call a model.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare, Log, LogLevel } from "miniflare";

const project = new URL("../../../", import.meta.url);
const compiled = await build({ stdin: { contents: `
  import { readSourceSpanExtraction } from "./worker/document-executor/source-span-extraction";
  export function inspect(input) { return readSourceSpanExtraction(input.chat, input.sources, undefined, input.format); }
  export default { async fetch(request) { return Response.json(inspect(await request.json())); } };
`, resolveDir: fileURLToPath(project), loader: "ts" }, write: false, bundle: true,
format: "esm", target: "es2022", platform: "browser" });
const script = compiled.outputFiles[0].text;
const node = await import(`data:text/javascript;base64,${Buffer.from(script).toString("base64")}`);
const config = JSON.parse(readFileSync(new URL("worker/document-executor/wrangler.local.jsonc", project)));

function exercise(quote, terms, hint = null, options = {}) {
  const format = options.format ?? "source-spans-v2", text = options.text ?? quote;
  const source = { segmentId: "s", quote };
  const item = { kind: options.kind ?? "experience", source, requirementLevel: null, selfLevelHint: hint,
    [format === "source-spans-v2" ? "skillTerms" : "skillLabels"]: terms };
  return { format, sources: { text, segments: [{ id: "s", start: 0, end: text.length }] },
    chat: { choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ format,
      items: options.reviewOnly ? [] : [item], reviewPoints: options.suggest ? [{ code: options.suggest, source }] : [] }) } }] } };
}

const cases = [
  ["other-task-assistance-zh", exercise("我用 React 实现了原型，交互测试由结对伙伴协助。", ["React"], "guided"), null, []],
  ["other-task-assistance-en", exercise("Implemented a React prototype，交互测试由结对伙伴协助。", ["React"], "guided"), null, []],
  // The review may ask about the explicitly supervised testing, while the one
  // fact-wide hint must not also rate the prototype implementation.
  ["same-term-different-tasks", exercise("I built a React prototype, and I tested React under peer guidance.", ["React"], "guided"), null, ["confirm-self-assessment"]],
  ["same-task-guidance", exercise("我在导师指导下用 React 实现了原型。", ["React"], "guided"), "guided", ["confirm-self-assessment"]],
  ["same-task-guidance-en", exercise("I implemented a React prototype under peer guidance.", ["React"], "guided"), "guided", ["confirm-self-assessment"]],
  ["personal-profile-heading", exercise("简介：熟悉 SQL。", ["SQL"], "conceptual", { kind: "skill-claim" }), "conceptual", ["confirm-self-assessment"]],
  ["affirmative-capability-zh", exercise("我可独立完成 SQL 报表。", ["SQL"], null, { kind: "skill-claim" }), null, ["confirm-self-assessment"]],
  ["affirmative-capability-en", exercise("I can independently write SQL reports.", ["SQL"], null, { kind: "skill-claim" }), null, ["confirm-self-assessment"]],
  ["stated-limit-zh", exercise("我目前不能独立配置 Kubernetes 集群。", ["Kubernetes"], "uncertain", { kind: "skill-claim", suggest: "confirm-self-assessment" }), null, ["confirm-self-assessment"]],
  ["pending-authorship", exercise("本人是否编写查询待确认。", [], null, { reviewOnly: true }), null, ["missing-information"]],
  ["resolved-authorship", exercise("本人已确认编写了查询。", [], null, { reviewOnly: true, suggest: "missing-information" }), null, []],
  ["other-person-capability", exercise("同事可独立完成 SQL 报表。", ["SQL"], null, { kind: "skill-claim", suggest: "confirm-self-assessment" }), null, []],
  ["hypothetical-capability", exercise("如果我可独立完成 SQL 报表，就申请这个岗位。", ["SQL"], null, { kind: "skill-claim", suggest: "confirm-self-assessment" }), null, []],
  ["example-before-comma", exercise("例如，我熟悉 SQL。", ["SQL"], "conceptual", { kind: "skill-claim", suggest: "confirm-self-assessment" }), null, []],
  ["example-before-guidance", exercise("例如，我在导师指导下用 React 实现了原型。", ["React"], "guided", { kind: "skill-claim", suggest: "confirm-self-assessment" }), null, []],
  ["conditional-before-guidance", exercise("如果我完成了 React 原型，我在导师指导下测试 React。", ["React"], "guided", { kind: "skill-claim", suggest: "confirm-self-assessment" }), null, []],
  ["denied-report-before-comma", exercise("我没有说过，我熟悉 SQL。", ["SQL"], "conceptual", { kind: "skill-claim", suggest: "confirm-self-assessment" }), null, []],
  ["other-speaker-before-comma", exercise("导师说，我熟悉 SQL。", ["SQL"], "conceptual", { kind: "skill-claim", suggest: "confirm-self-assessment" }), null, []],
  ["named-speaker-en", exercise("Alice said, I am familiar with SQL.", ["SQL"], "conceptual", { kind: "skill-claim", suggest: "confirm-self-assessment" }), null, []],
  ["named-speaker-zh", exercise("张宁说，我熟悉 SQL。", ["SQL"], "conceptual", { kind: "skill-claim", suggest: "confirm-self-assessment" }), null, []],
  ["denied-premise-real-contrast-zh", exercise("没有证据说我能独立配置 React，但我熟悉 SQL。", ["SQL"], "conceptual", { kind: "skill-claim", suggest: "confirm-self-assessment" }), "conceptual", ["confirm-self-assessment"]],
  ["denied-premise-real-contrast-en", exercise("It is false that I configured React, but I am familiar with SQL.", ["SQL"], "conceptual", { kind: "skill-claim", suggest: "confirm-self-assessment" }), "conceptual", ["confirm-self-assessment"]],
  ["mid-sentence-report-zh", exercise("我完成了 React 原型，但导师说，我熟悉 SQL。", ["SQL"], "conceptual", { kind: "skill-claim", suggest: "confirm-self-assessment" }), null, []],
  ["mid-sentence-report-en", exercise("I built a React prototype, but Alice said, I am familiar with SQL.", ["SQL"], "conceptual", { kind: "skill-claim", suggest: "confirm-self-assessment" }), null, []],
  ["mid-sentence-reported-guidance", exercise("I built a React prototype, and my mentor said, I tested SQL under supervision.", ["SQL"], "guided", { kind: "skill-claim", suggest: "confirm-self-assessment" }), null, []],
  ["real-prefix-before-report-without-comma-zh", exercise("我熟悉 SQL 但导师说，我熟悉 React。", ["SQL"], "conceptual", { kind: "skill-claim", suggest: "confirm-self-assessment" }), "conceptual", ["confirm-self-assessment"]],
  ["real-prefix-before-report-without-comma-en", exercise("I am familiar with SQL but Alice said, I am familiar with React.", ["SQL"], "conceptual", { kind: "skill-claim", suggest: "confirm-self-assessment" }), "conceptual", ["confirm-self-assessment"]],
  ["guided-prefix-before-report-without-comma", exercise("I tested SQL under supervision and my mentor said, I tested React under supervision.", ["SQL"], "guided", { kind: "skill-claim", suggest: "confirm-self-assessment" }), "guided", ["confirm-self-assessment"]],
  ["same-term-tasks-without-and", exercise("I built a React prototype, I tested React under peer guidance.", ["React"], "guided", { kind: "skill-claim", suggest: "confirm-self-assessment" }), null, ["confirm-self-assessment"]],
  ["personal-profile-capability", exercise("个人简介：可独立完成 SQL 报表。", ["SQL"], null, { kind: "skill-claim" }), null, ["confirm-self-assessment"]],
  ["independently-before-action", exercise("I cannot independently configure Kubernetes clusters.", ["Kubernetes"], "uncertain", { kind: "skill-claim", suggest: "confirm-self-assessment" }), null, ["confirm-self-assessment"]],
  ["authorship-capability-limit", exercise("I cannot write SQL queries independently.", ["SQL"], "uncertain", { kind: "skill-claim", suggest: "confirm-self-assessment" }), null, ["confirm-self-assessment"]],
  ["personal-learning-limit", exercise("I have not designed a live experiment and want practice with experiment planning.", ["experiment planning"], null, { kind: "constraint" }), null, ["confirm-self-assessment"]],
  ["personal-learning-limit-another-task", exercise("I have not configured a staging service and need more practice with deployment.", ["deployment"], null, { kind: "constraint" }), null, ["confirm-self-assessment"]],
  ["denied-practice-intent", exercise("I have not designed a live experiment and do not want practice with experiment planning.", ["experiment planning"], null, { kind: "constraint", suggest: "confirm-self-assessment" }), null, []],
  ["hypothetical-learning-limit", exercise("If I have not designed a live experiment and want practice with experiment planning, I will ask the tutor.", ["experiment planning"], null, { kind: "constraint", suggest: "confirm-self-assessment" }), null, []],
  ["another-person-learning-limit", exercise("My colleague has not designed a live experiment and wants practice with experiment planning.", ["experiment planning"], null, { kind: "constraint", suggest: "confirm-self-assessment" }), null, []],
  ["constraint-familiarity-still-ineligible", exercise("I am familiar with SQL.", ["SQL"], null, { kind: "constraint", suggest: "confirm-self-assessment" }), null, []],
  ["preserved-v1", exercise("我用 React 实现了原型，交互测试由结对伙伴协助。", ["React"], "guided", { format: "source-spans-v1", suggest: "confirm-self-assessment" }), "guided", ["confirm-self-assessment"]],
];

let outbound = 0;
const mf = new Miniflare({ cf: false, host: "127.0.0.1", log: new Log(LogLevel.ERROR), modules: true,
  compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags, script,
  outboundService: () => { outbound++; return new Response(null, { status: 503 }); } });
const checks = [];
try {
  for (const [name, input, hint, codes] of cases) {
    const response = await mf.dispatchFetch("http://127.0.0.1/inspect", { method: "POST", body: JSON.stringify(input) });
    assert.equal(response.status, 200, name);
    const actual = await response.json();
    assert.deepEqual(actual, node.inspect(input), name + ": runtime equivalence");
    assert.equal(actual.extractionRead, "parsed", name);
    const proposed = JSON.parse(input.chat.choices[0].message.content).items;
    assert.equal(actual.candidate.items.length, proposed.length, name + ": fact preservation");
    if (proposed.length) {
      assert.equal(actual.candidate.items[0].text, proposed[0].source.quote, name + ": unchanged quote");
      assert.deepEqual(actual.candidate.items[0].source, proposed[0].source, name + ": unchanged source");
      assert.equal(actual.candidate.items[0].selfLevelHint, hint, name + ": hint scope");
    }
    assert.deepEqual(actual.candidate.reviewPoints.map(point => point.code), codes, name + ": review scope");
    for (const point of actual.candidate.reviewPoints) assert.ok(input.sources.text.includes(point.source.quote), name + ": review source");
    checks.push(name);
  }
} finally { await mf.dispose(); }
assert.equal(outbound, 0);
process.stdout.write(JSON.stringify({ mode: "offline-assessment-scope-node-workerd", compatibilityDate: config.compatibility_date,
  checks, nodeAndWorkerIdentical: true, workerOutboundRequests: outbound, realModelCalls: 0 }, null, 2) + "\n");
