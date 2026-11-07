import { expect, it } from "vitest";
import { flagshipBlueprint } from "../../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../../app/data/flagship-unit-registry";
import { mapMaterialItems, mapMaterialItemTerms } from "../../../app/lib/materials/skill-mapper";

function fact(text: string, skillLabels: string[]) {
  return { id: "context-fact", kind: "experience" as const, origin: "user" as const,
    text, skillLabels, sourceRef: null, requirementLevel: null };
}

it.each([
  ["In Figma I maintain UI tokens for reusable component colors and focus states.", "UI tokens", "design-systems"],
  ["I maintain tokens for UI component focus and contrast.", "tokens", "design-systems"],
  ["I specify accessible UI components and keyboard focus states in Figma.", "components", "design-systems"],
  ["I design local states for UI controls, including loading, error and disabled feedback.", "local states", "design-systems"],
  ["在 Figma 中维护 UI 设计令牌、组件和焦点状态。", "设计令牌", "design-systems"],
  ["为 SQL 数据表关系建模，定义主键、外键和删除行为。", "建模", "sql"],
  ["I use relational modeling for schema keys and ownership.", "relational modeling", "sql"],
  ["I use modeling to define table relationships and foreign keys.", "modeling", "sql"],
  ["I inspect API logs to diagnose production errors and request latency.", "logs", "observability"],
  ["我通过服务运行日志定位接口故障。", "运行日志", "observability"],
  ["I correlate traces across HTTP requests to diagnose latency.", "traces", "observability"],
  ["I write async tests for API timeout and retry behavior.", "async tests", "testing"],
  ["I test asynchronous logic for request cancellation in software.", "test asynchronous logic", "testing"],
  ["为接口超时和重试编写异步测试。", "异步测试", "testing"],
] as const)("uses supported local context for %s [%s]", (text, term, skillId) => {
  const input = fact(text, [term]);
  const before = structuredClone(input);
  expect(mapMaterialItems([input], flagshipBlueprint, flagshipUnitRegistry))
    .toMatchObject([{ status: "mapped", skillIds: [skillId] }]);
  expect(mapMaterialItemTerms).toBeTypeOf("function");
  expect(mapMaterialItemTerms([input], flagshipBlueprint, flagshipUnitRegistry)).toEqual([
    { itemId: input.id, term, status: "mapped", skillIds: [skillId], basis: "contextual" },
  ]);
  expect(input).toEqual(before);
});

it.each([
  ["I use tokens.", "tokens"],
  ["I rotate OAuth access tokens for API requests.", "tokens"],
  ["I budget LLM tokens for model prompts.", "tokens"],
  ["I use Figma.", "Figma"],
  ["I make components.", "components"],
  ["I assemble mechanical components for a keyboard.", "components"],
  ["I keep local states.", "local states"],
  ["I practice financial modeling with SQL exports.", "financial modeling"],
  ["I practice financial modeling with SQL exports.", "modeling"],
  ["I use predictive modeling with database records.", "modeling"],
  ["I use modeling.", "modeling"],
  ["I stack woodworking logs beside the production workshop.", "logs"],
  ["I collect traces of paint on the workshop table.", "traces"],
  ["I inspect logs.", "logs"],
  ["I schedule asynchronous tests for laboratory samples.", "asynchronous tests"],
  ["I test asynchronous logic.", "test asynchronous logic"],
  ["I make components. In a separate project I maintain UI focus and keyboard states.", "components"],
] as const)("withholds unsupported contextual meanings for %s [%s]", (text, term) => {
  expect(mapMaterialItems([fact(text, [term])], flagshipBlueprint, flagshipUnitRegistry))
    .toEqual([{ itemId: "context-fact", status: "uncovered", skillIds: [], labels: [term] }]);
});

it.each([
  ["I assemble mechanical components, while another team uses Figma.", "components"],
  ["I design components for engines, not user interfaces.", "components"],
  ["I use modeling for clay sculptures, not databases.", "modeling"],
  ["I inspect paper logs, not API telemetry.", "logs"],
  ["我制作发动机组件，而另一组使用 Figma 设计界面。", "组件"],
  ["我设计机械组件，不涉及用户界面。", "组件"],
  ["我给泥塑建模，而不是数据库建模。", "建模"],
  ["我查看日志，API 监控由同事负责。", "日志"],
  ["I assemble mechanical components while another team uses Figma.", "components"],
  ["Another team uses Figma while I assemble mechanical components.", "components"],
  ["I design components for engines rather than user interface components.", "components"],
  ["I use modeling for clay sculptures but my colleague models databases.", "modeling"],
  ["I inspect paper logs although our service emits API telemetry.", "logs"],
  ["I design mechanical components and another team uses Figma.", "components"],
  ["I use modeling and the database team handles SQL.", "modeling"],
  ["I inspect logs and my colleague owns API telemetry.", "logs"],
  ["我制作发动机组件而另一组使用 Figma 设计界面。", "组件"],
  ["我使用建模制作泥塑但是同事维护数据库。", "建模"],
  ["我查看日志同时同事负责 API 监控。", "日志"],
  ["我设计机械组件而非用户界面组件。", "组件"],
  ["I design components that are not user interfaces.", "components"],
  ["I use modeling without databases.", "modeling"],
  ["我给泥塑建模而不是数据库建模。", "建模"],
  ["我查看日志但不涉及接口追踪。", "日志"],
  ["I write async tests for laboratory samples, while another team maintains software.", "async tests"],
  ["我做异步测试，但软件由另一组开发。", "异步测试"],
] as const)("does not borrow a qualifier across scope or denial in %s [%s]", (text, term) => {
  const input = fact(text, [term]);
  expect(mapMaterialItemTerms([input], flagshipBlueprint, flagshipUnitRegistry)).toEqual([
    { itemId: "context-fact", term, status: "uncovered", skillIds: [], basis: null },
  ]);
});

it.each([
  ["I design UI components, while another team builds engines.", "components", "design-systems"],
  ["I build engines, but I design components for UI controls.", "components", "design-systems"],
  ["我制作发动机零件，但设计界面组件的焦点状态。", "界面组件", "design-systems"],
  ["I use modeling for relational tables, not clay sculptures.", "modeling", "sql"],
  ["I inspect API logs, not paper journals.", "logs", "observability"],
  ["I do not build engines, but I design UI components.", "components", "design-systems"],
  ["我通过接口日志定位故障，不查看纸质记录。", "日志", "observability"],
  ["我不做机械零件，但维护界面组件的键盘焦点状态。", "界面组件", "design-systems"],
] as const)("retains affirmative same-clause evidence in %s [%s]", (text, term, skillId) => {
  expect(mapMaterialItemTerms([fact(text, [term])], flagshipBlueprint, flagshipUnitRegistry)).toEqual([
    { itemId: "context-fact", term, status: "mapped", skillIds: [skillId], basis: "contextual" },
  ]);
});

it.each([
  ["I maintain paper logs for customer service.", "logs"],
  ["我整理客服的纸质服务日志。", "日志"],
  ["I maintain service logs for restaurant staff.", "logs"],
  ["I inspect logs of restaurant service requests.", "logs"],
  ["I inspect transport logs for delivery requests and service latency.", "logs"],
  ["我整理餐厅服务请求日志。", "日志"],
  ["我检查运输运行日志中的服务延迟和故障。", "运行日志"],
  ["I inspect logs of service requests.", "logs"],
] as const)("requires an explicit technical domain for operational words in %s [%s]", (text, term) => {
  expect(mapMaterialItemTerms([fact(text, [term])], flagshipBlueprint, flagshipUnitRegistry)).toEqual([
    { itemId: "context-fact", term, status: "uncovered", skillIds: [], basis: null },
  ]);
});

it.each([
  ["I inspect software service logs for failed requests and latency.", "logs"],
  ["I inspect API service request logs for production failures.", "logs"],
  ["I correlate runtime traces for service request latency.", "traces"],
  ["我检查软件服务请求日志定位故障和延迟。", "日志"],
  ["我检查服务器日志中的服务请求。", "日志"],
  ["我检查运行时日志中的请求失败。", "日志"],
] as const)("keeps explicit technical service-request evidence in %s [%s]", (text, term) => {
  expect(mapMaterialItemTerms([fact(text, [term])], flagshipBlueprint, flagshipUnitRegistry)).toEqual([
    { itemId: "context-fact", term, status: "mapped", skillIds: ["observability"], basis: "contextual" },
  ]);
});

it.each([
  ["I schedule asynchronous tests for laboratory samples with retries.", "asynchronous tests"],
  ["I schedule asynchronous tests for customer requests.", "asynchronous tests"],
  ["我为实验室样本的重试安排异步测试。", "异步测试"],
] as const)("requires an explicit software domain for asynchronous testing in %s [%s]", (text, term) => {
  expect(mapMaterialItemTerms([fact(text, [term])], flagshipBlueprint, flagshipUnitRegistry)).toEqual([
    { itemId: "context-fact", term, status: "uncovered", skillIds: [], basis: null },
  ]);
});

it.each([
  ["I write asynchronous tests in TypeScript for laboratory sample software retries.", "asynchronous tests"],
  ["我为实验室样本管理软件的接口代码编写异步测试。", "异步测试"],
] as const)("keeps explicit software testing evidence regardless of application domain in %s [%s]", (text, term) => {
  expect(mapMaterialItemTerms([fact(text, [term])], flagshipBlueprint, flagshipUnitRegistry)).toEqual([
    { itemId: "context-fact", term, status: "mapped", skillIds: ["testing"], basis: "contextual" },
  ]);
});

it("requires the exact ready flagship blueprint and complete published registry", () => {
  const input = fact("Use UI tokens for accessible component focus states.", ["UI tokens"]);
  const variants: [typeof flagshipBlueprint, typeof flagshipUnitRegistry][] = [
    [{ ...flagshipBlueprint, id: "research-role" }, { ...flagshipUnitRegistry, blueprintId: "research-role" }],
    [{ ...flagshipBlueprint, version: "2026.09.1" }, { ...flagshipUnitRegistry, blueprintVersion: "2026.09.1" }],
    [{ ...flagshipBlueprint, status: "draft" as const }, flagshipUnitRegistry],
    [flagshipBlueprint, { ...flagshipUnitRegistry, id: "research-units" }],
    [flagshipBlueprint, { ...flagshipUnitRegistry, version: "2026.09.1" }],
    [flagshipBlueprint, { ...flagshipUnitRegistry, tracks: [] }],
  ];
  for (const [blueprint, registry] of variants) {
    expect(mapMaterialItems([input], blueprint, registry))
      .toEqual([{ itemId: "context-fact", status: "uncovered", skillIds: [], labels: ["UI tokens"] }]);
  }
});

it("prioritizes reviewed literal aliases and preserves their ambiguity before contextual inference", () => {
  const input = fact("Use UI tokens for accessible component focus states.", ["UI tokens"]);
  const options = { aliases: { version: "2026.11.4" as const, skills: { testing: ["UI tokens"], react: ["UI tokens"] } } };
  expect(mapMaterialItems([input], flagshipBlueprint, flagshipUnitRegistry, options))
    .toMatchObject([{ status: "ambiguous", skillIds: ["react", "testing"] }]);
});

it("does not recover dropped words or infer a framework from retained UI components", () => {
  const input = fact("I use React, SQL and UI components with accessible focus and keyboard states.", ["UI components"]);
  expect(mapMaterialItems([input], flagshipBlueprint, flagshipUnitRegistry))
    .toMatchObject([{ status: "mapped", skillIds: ["design-systems"] }]);
  expect(mapMaterialItems([{ ...input, skillLabels: [] }], flagshipBlueprint, flagshipUnitRegistry)).toEqual([]);
});

it("keeps Figma uncovered separately from a retained or removed UI token capability", () => {
  const input = fact("In Figma I maintain UI tokens for reusable component colors and focus states.", ["Figma", "UI tokens"]);
  expect(mapMaterialItemTerms([input], flagshipBlueprint, flagshipUnitRegistry)).toEqual([
    { itemId: "context-fact", term: "Figma", status: "uncovered", skillIds: [], basis: null },
    { itemId: "context-fact", term: "UI tokens", status: "mapped", skillIds: ["design-systems"], basis: "contextual" },
  ]);
  expect(mapMaterialItems([{ ...input, skillLabels: ["Figma"] }], flagshipBlueprint, flagshipUnitRegistry))
    .toEqual([{ itemId: "context-fact", status: "uncovered", skillIds: [], labels: ["Figma"] }]);
});

it("leaves old whole-text facts on the literal mapping path", () => {
  const legacy = { ...fact("Use UI tokens for accessible component focus states.", ["UI tokens"]), skillLabels: undefined };
  expect(mapMaterialItems([legacy], flagshipBlueprint, flagshipUnitRegistry))
    .toEqual([{ itemId: "context-fact", status: "uncovered", skillIds: [], labels: [legacy.text] }]);
});
