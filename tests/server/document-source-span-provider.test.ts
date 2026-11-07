// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { validateDocumentExtraction } from "../../app/server/documents/extraction-validator";
import type { DocumentAnalysisConfiguration } from "../../app/server/documents/policy";
import { documentReceiptAuditSchema } from "../../app/server/documents/provider-receipt";
import { HttpDocumentAnalysisProvider, isDocumentProviderQualified, type DocumentProviderQualification } from "../../worker/document-executor/provider-http";
import { fixtureGenerationResponse } from "../helpers/document-generation-response";

const policy = "materials-openrouter-kimi-k31-pro-mxfp4-zdr-extractive-v1";
const config: DocumentAnalysisConfiguration = {
  provider: "OpenRouter / Moonshot AI", model: "moonshotai/kimi-k3.1-pro", endpoint: "https://openrouter.ai/api/v1/chat/completions",
  apiKey: "offline-fixture-credential", providerPolicyId: policy,
  routingPolicy: { policyVersion: "2026.11.3", providerOrder: ["moonshotai/mxfp4"], allowFallback: false, dataPolicy: "zdr-only" },
  priceVersion: "2026.11.3", userDailyMicroUsd: 2_000_000, globalDailyMicroUsd: 2_000_000,
  maxJobMicroUsd: 75_000, maxInputTokens: 16_000, maxOutputTokens: 4096, httpTimeoutMs: 1000,
};
const qualification: DocumentProviderQualification = {
  qualified: true, endpoint: config.endpoint, model: config.model, providerPolicyId: policy, priceVersion: config.priceVersion,
  routingPolicy: config.routingPolicy, receiptRoute: { providerName: "Moonshot AI", endpointId: "a3fafaac-f097-4ef1-86b3-842854dad5c6",
    generationModel: "moonshotai/kimi-k3.1-pro-20261023" },
  inputMicroUsdPerMillionTokens: 2_000_000, outputMicroUsdPerMillionTokens: 10_000_000, inputTokenBound: "utf8-bytes-plus-4096",
};
const quote = "Experience with event tracing is preferred.";
const documentText = "Operations role\n" + quote + "\nOwnership of the whole team is unclear.";
const segments = [{ id: "section-one", start: 0, end: documentText.length }];
const source = { segmentId: "section-one", quote };
const item = { kind: "requirement", source, requirementLevel: "preferred", skillLabels: ["event tracing"], selfLevelHint: null };
const point = { code: "team-attribution", source: { segmentId: "section-one", quote: "Ownership of the whole team is unclear." } };
const compact = { format: "source-spans-v1", items: [item], reviewPoints: [point] };

async function analyze(content: unknown, options: { finish?: unknown; kind?: "resume" | "jd" | "supplement"; native?: string; policyId?: string;
  text?: string; segments?: typeof segments; auditOk?: boolean; generationEnd?: Record<string, unknown>; generationEnvelope?: Record<string, unknown>;
  messageFields?: Record<string, unknown> } = {}) {
  const text = options.text ?? documentText;
  const providerPolicyId = options.policyId ?? policy;
  const request = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "POST") return Response.json({ id: "fixture-receipt", model: config.model,
      choices: [{ finish_reason: "finish" in options ? options.finish : "stop", native_finish_reason: options.native,
        message: { content: typeof content === "string" ? content : JSON.stringify(content), ...options.messageFields } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.000007 } });
    const response = fixtureGenerationResponse(new URL(String(url)).searchParams.get("id")!, config.model, {
      ...qualification.receiptRoute, endpointId: options.auditOk === false ? "wrong-frozen-endpoint" : qualification.receiptRoute.endpointId,
    });
    if (!options.generationEnd && !options.generationEnvelope) return response;
    const record = await response.json() as { data: Record<string, unknown> };
    return Response.json({ ...options.generationEnvelope, data: { ...record.data, ...options.generationEnd } });
  });
  const provider = new HttpDocumentAnalysisProvider({ ...config, providerPolicyId }, { fetch: request, qualification: { ...qualification, providerPolicyId } });
  const outcome = await provider.analyze({ text, segments: options.segments ?? [{ ...segments[0]!, end: text.length }], textVersionId: "text-one",
    kind: options.kind ?? "jd", providerPolicyId, outputSchemaVersion: "2026.11.1" }, new AbortController().signal);
  expect(request.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET"]);
  if (outcome.kind !== "received") throw new Error("Missing fixture receipt");
  return { outcome, body: JSON.parse(String(request.mock.calls[0]![1]?.body)) };
}

describe("private material extraction from quoted source spans", () => {
  it.each(["jd", "resume", "supplement"] as const)("uses source text as the editable draft for %s and validates it through the site", async kind => {
    const { outcome, body } = await analyze(compact, { kind });
    expect(body.messages[0].content).toContain("source-spans-v1");
    expect(new TextEncoder().encode(JSON.stringify({ ...body, messages: [body.messages[0]] })).length).toBeLessThan(4096);
    expect(JSON.parse(body.messages[1].content)).toEqual({ kind, segments: [{ segmentId: "section-one", text: documentText }] });
    expect(body).not.toHaveProperty("tools");
    expect(outcome).toMatchObject({ actualMicroUsd: 7, audit: { status: "verified", extractionRead: "parsed" },
      candidate: { schemaVersion: "2026.11.1", items: [{ ...item, id: "candidate-1", text: quote }], reviewPoints: [point] } });
    const draft = validateDocumentExtraction(outcome.candidate, "owner", { ownerId: "owner", lifecycle: "active", documentId: "doc-one",
      documentVersionId: "version-one", textVersionId: "text-one", text: documentText, segments });
    expect(draft.items[0]).toMatchObject({ text: quote, origin: "extracted", requirementLevel: "preferred",
      sourceRef: { start: documentText.indexOf(quote), end: documentText.indexOf(quote) + quote.length } });
    expect(draft.reviewPoints[0]).toMatchObject({ code: "team-attribution", resolution: "unresolved" });
  });

  it.each([
    ["length", undefined, "output-limit"], ["stop", "length", "output-limit"], ["content_filter", undefined, "incomplete-finish"],
    ["tool_calls", undefined, "incomplete-finish"], [null, undefined, "incomplete-finish"], ["private-provider-sentinel", undefined, "incomplete-finish"],
  ] as const)("settles a verified bill but never delivers incomplete JSON even when syntactically valid (%s, %s)", async (finish, native, status) => {
    const { outcome } = await analyze(compact, { finish, native });
    expect(outcome).toMatchObject({ candidate: null, actualMicroUsd: 7, audit: { status: "verified", extractionRead: status } });
    expect(JSON.stringify(outcome)).not.toContain("private-provider-sentinel");
    expect(documentReceiptAuditSchema.safeParse(outcome.audit).success).toBe(true);
  });

  it.each([
    ["truncated JSON", "{", "invalid-json"],
    ["empty content", "  ", "missing-content"],
    ["legacy shape", { schemaVersion: "2026.11.1", items: [], reviewPoints: [] }, "invalid-shape"],
    ["free-form text override", { ...compact, items: [{ ...item, text: "Unsupported achievement" }] }, "invalid-shape"],
    ["invented source", { ...compact, items: [{ ...item, source: { ...source, quote: "Unsupported achievement" } }] }, "invalid-source"],
    ["invented review point source", { ...compact, reviewPoints: [{ ...point, source: { ...source, segmentId: "other" } }] }, "invalid-source"],
    ["invalid suggestion", { ...compact, items: [{ ...item, selfLevelHint: "guided" }] }, "invalid-shape"],
  ] as const)("records only a fixed reason for %s", async (_name, content, reason) => {
    const { outcome } = await analyze(content);
    expect(outcome).toMatchObject({ actualMicroUsd: 7, candidate: null, audit: { status: "verified", extractionRead: reason } });
    expect(JSON.stringify(outcome)).not.toContain("Unsupported achievement");
  });

  it("rejects an ambiguous literal and a quote cutting a Unicode pair", async () => {
    for (const [text, excerpt] of [["X X", "X"], ["😀", "\ud83d"]]) {
      const { outcome } = await analyze({ ...compact, items: [{ ...item, source: { ...source, quote: excerpt } }], reviewPoints: [] }, { text });
      expect(outcome).toMatchObject({ candidate: null, audit: { extractionRead: "invalid-source" } });
    }
  });

  it("does not parse or describe content when the paid receipt fails verification", async () => {
    const { outcome } = await analyze(compact, { auditOk: false });
    expect(outcome).toMatchObject({ candidate: null, audit: { status: "route-mismatch" } });
    expect(outcome.audit).not.toHaveProperty("extractionRead");
  });

  it.each([
    [{ native_finish_reason: "length" }, "output-limit"],
    [{ finish_reason: "content_filter" }, "incomplete-finish"],
    [{ cancelled: true }, "incomplete-finish"],
    [{ provider_responses: [{ status: 200, endpoint_id: qualification.receiptRoute.endpointId, finish_reason: "length" }] }, "output-limit"],
  ] as const)("honors explicit incomplete generation metadata even when chat reports stop", async (generationEnd, reason) => {
    const { outcome } = await analyze(compact, { generationEnd });
    expect(outcome).toMatchObject({ actualMicroUsd: 7, candidate: null, audit: { status: "verified", extractionRead: reason } });
  });

  it("requires an explicit level, including unspecified, for a role requirement", async () => {
    const { outcome } = await analyze({ ...compact, items: [{ ...item, requirementLevel: null }] });
    expect(outcome).toMatchObject({ candidate: null, audit: { extractionRead: "invalid-shape" } });
  });

  it("binds the new named Kimi policy to the standard route and approved generation version", () => {
    const otherRouting = { ...config.routingPolicy, providerOrder: ["another-provider"] };
    expect(isDocumentProviderQualified({ ...config, routingPolicy: otherRouting }, { ...qualification, routingPolicy: otherRouting })).toBe(false);
    const other = { ...qualification.receiptRoute, generationModel: config.model };
    expect(isDocumentProviderQualified(config, { ...qualification, receiptRoute: other })).toBe(false);
  });

  it.each([
    ["Our team delivered the design. It would be false to say I independently designed the system.", "I independently designed the system."],
    ["I can configure backups only under supervision.", "I can configure backups"],
    ["我并没有独立设计这个系统。", "独立设计这个系统。"],
  ])("rejects a quote that drops the surrounding statement's attribution or qualification", async (text, quote) => {
    const { outcome } = await analyze({ ...compact, items: [{ ...item, source: { ...source, quote } }], reviewPoints: [] }, { text });
    expect(outcome).toMatchObject({ candidate: null, audit: { extractionRead: "invalid-source" } });
  });

  it("does not mistake an artificial segment edge for the start of a new claim", async () => {
    const prefix = "It would be false to claim that ", quote = "I ran the migration alone.";
    const { outcome } = await analyze({ ...compact, items: [{ ...item, source: { ...source, quote } }], reviewPoints: [] },
      { text: prefix + quote, segments: [{ id: "first-part", start: 0, end: prefix.length }, { id: source.segmentId, start: prefix.length, end: prefix.length + quote.length }] });
    expect(outcome).toMatchObject({ candidate: null, audit: { extractionRead: "invalid-source" } });
  });
  it.each(["It would be false to say\nI independently designed the system.",
    "The team completed it. It would be false to say\nI independently designed the system."])(
    "keeps a layout-wrapped qualifying clause attached to its statement", async text => {
      const sourceRef = { ...source, quote: "I independently designed the system." };
      const { outcome } = await analyze({ ...compact, items: [{ ...item, source: sourceRef }], reviewPoints: [] }, { text });
      expect(outcome).toMatchObject({ candidate: null, audit: { extractionRead: "invalid-source" } });
    });

  it("uses a paired boundary for each fact instead of joining two independently complete sentences", async () => {
    const text = "The team built the pipeline. I documented it.";
    const { outcome } = await analyze({ ...compact, items: [{ ...item, source: { ...source, quote: text } }], reviewPoints: [] }, { text });
    expect(outcome).toMatchObject({ candidate: null, audit: { extractionRead: "invalid-source" } });
  });

  it.each(["负责月度经营分析。", "熟练使用 SQL。", "有异常检测经验。"])(
    "accepts a complete requirement under a Chinese JD heading or numbered list: %s", async quote => {
      const text = "数据分析师\n岗位职责：\n1、负责月度经营分析。\n任职要求：\n（1）熟练使用 SQL。\n加分项：\n有异常检测经验。";
      const { outcome } = await analyze({ ...compact, items: [{ ...item, source: { ...source, quote } }], reviewPoints: [] }, { text });
      expect(outcome).toMatchObject({ audit: { extractionRead: "parsed" }, candidate: { items: [{ text: quote }] } });
    });

  it.each([["Older work. New skill is helpful. Next duty.", "New skill is helpful", "New skill is helpful."],
    ["岗位说明\n• 需要核对故障时间线。\n地点待定。", "需要核对故障时间线", "需要核对故障时间线。"]])(
    "restores the actual sentence-ending mark in a complete fact inside a paragraph or bullet", async (text, quote, expected) => {
      const { outcome } = await analyze({ ...compact, items: [{ ...item, source: { ...source, quote } }], reviewPoints: [] }, { text });
      expect(outcome.candidate).toMatchObject({ items: [{ text: expected, source: { ...source, quote: expected } }] });
    });

  it("rejects identical observations before assigning local IDs", async () => {
    const { outcome } = await analyze({ ...compact, items: [item, { ...item }] });
    expect(outcome).toMatchObject({ candidate: null, audit: { extractionRead: "invalid-shape" } });
  });

  it.each([{ role: "tool" }, { tool_calls: { type: "function" } }])("quarantines a non-assistant or tool response", async messageFields => {
    const { outcome } = await analyze(compact, { messageFields });
    expect(outcome).toMatchObject({ candidate: null, audit: { extractionRead: "incomplete-finish", status: "verified" } });
  });

  it("honors cancellation on the outer generation envelope without losing the verified fee", async () => {
    const { outcome } = await analyze(compact, { generationEnvelope: { cancelled: true } });
    expect(outcome).toMatchObject({ candidate: null, actualMicroUsd: 7, audit: { status: "verified", extractionRead: "incomplete-finish" } });
  });
  it("records an explicit token limit even when another receipt reports a generic cancellation", async () => {
    const { outcome } = await analyze(compact, { finish: "length", generationEnvelope: { cancelled: true } });
    expect(outcome).toMatchObject({ candidate: null, actualMicroUsd: 7, audit: { status: "verified", extractionRead: "output-limit" } });
  });

  it("keeps the historical policy's full response contract and prompt", async () => {
    const legacy = { schemaVersion: "2026.11.1", items: [{ ...item, id: "row-one", text: "Earlier editable phrasing" }], reviewPoints: [] };
    const { outcome, body } = await analyze(legacy, { policyId: "materials-openrouter-kimi-k31-pro-mxfp4-zdr" });
    expect(outcome.candidate).toEqual(legacy);
    expect(body.messages[0].content).not.toContain("source-spans-v1");
  });
});

const groundedPolicy = "materials-openrouter-kimi-k31-pro-mxfp4-zdr-extractive-v2";
const practice = "I cleaned data using DuckDB.";
const obligation = "The role requires FlarnDock.";
const localSource = (quote: string) => ({ segmentId: "section-one", quote });
const grounded = {
  format: "source-spans-v2",
  items: [
    { kind: "experience", source: localSource(practice), requirementLevel: null, skillTerms: ["cleaned data", "DuckDB", "unrelated product"], selfLevelHint: null },
    { kind: "requirement", source: localSource(obligation), requirementLevel: "must", skillTerms: ["FlarnDock"], selfLevelHint: null },
  ],
  reviewPoints: [{ code: "uncovered-skill", source: localSource(obligation) }],
};
const localText = practice + " " + obligation;

describe("Kimi grounded terms and reviews", () => {
  it.each([false, true])("keeps an explicit unpractised learning constraint and its question with provider nomination=%s", async nominated => {
    const text = "I have not designed a live experiment and want practice with experiment planning.", source = localSource(text);
    const reviewPoints = [{ code: "confirm-self-assessment", source }];
    const { outcome } = await analyze({ format: "source-spans-v2", items: [{ kind: "constraint", source,
      skillTerms: ["experiment planning"], selfLevelHint: null, requirementLevel: null }], reviewPoints: nominated ? reviewPoints : [] },
    { policyId: groundedPolicy, kind: "resume", text });
    expect(outcome.candidate).toMatchObject({ items: [{ kind: "constraint", text, source,
      skillLabels: ["experiment planning"], selfLevelHint: null, requirementLevel: null }], reviewPoints });
    const draft = validateDocumentExtraction(outcome.candidate, "owner", { ownerId: "owner", lifecycle: "active", documentId: "doc-one",
      documentVersionId: "version-one", textVersionId: "text-one", text, segments: [{ id: "section-one", start: 0, end: text.length }] }, groundedPolicy);
    expect(draft.items[0]).toMatchObject({ kind: "constraint", text, skillLabels: ["experiment planning"], sourceRef: { start: 0, end: text.length } });
    expect(draft.selfAssessmentHints).toEqual([]);
    expect(draft.reviewPoints).toMatchObject([{ code: "confirm-self-assessment", resolution: "unresolved", sourceRef: { start: 0, end: text.length } }]);
  });

  it.each([
    "I have not designed a live experiment and do not want practice with experiment planning.",
    "I have not designed a live experiment and no longer want practice with experiment planning.",
    "If I have not designed a live experiment and want practice with experiment planning, I will ask.",
    "My mentor said, I have not designed a live experiment and want practice with experiment planning.",
    "My colleague has not designed a live experiment and wants practice with experiment planning.",
  ])("preserves a constraint without endorsing a denied or embedded practice wish: %s", async text => {
    const source = localSource(text);
    const { outcome } = await analyze({ format: "source-spans-v2", items: [{ kind: "constraint", source,
      skillTerms: ["experiment planning"], selfLevelHint: null, requirementLevel: null }],
      reviewPoints: [{ code: "confirm-self-assessment", source }] }, { policyId: groundedPolicy, kind: "resume", text });
    expect(outcome.candidate).toMatchObject({ items: [{ kind: "constraint", text, source, selfLevelHint: null }], reviewPoints: [] });
  });

  it("preserves compatible resume claims and a separate responsibility question through v2 decoding and site validation", async () => {
    const quotes = ["简介：熟悉 SQL，可独立完成报表。", "项目说明：所有 SQL 由导师提供，我只替换了日期参数。", "工作时间：未填写；本人是否编写查询待确认。"];
    const text = quotes.join("\n");
    const { outcome } = await analyze({ format: "source-spans-v2", items: quotes.map((quote, index) => ({
      kind: index === 0 ? "skill-claim" : index === 1 ? "experience" : "constraint", source: localSource(quote),
      skillTerms: index < 2 ? ["SQL"] : [], requirementLevel: null, selfLevelHint: index < 2 ? "uncertain" : null,
    })), reviewPoints: quotes.map(quote => ({ code: "conflicting-self-assessment", source: localSource(quote) })) },
    { policyId: groundedPolicy, kind: "resume", text });
    expect(outcome).toMatchObject({ audit: { extractionRead: "parsed" }, candidate: {
      items: quotes.map((quote, index) => ({ text: quote, source: localSource(quote), skillLabels: index < 2 ? ["SQL"] : [], selfLevelHint: null })),
      reviewPoints: [{ code: "confirm-self-assessment", source: localSource(quotes[0]!) }, { code: "missing-information", source: localSource(quotes[2]!) }],
    } });
    const draft = validateDocumentExtraction(outcome.candidate, "owner", { ownerId: "owner", lifecycle: "active", documentId: "doc-one",
      documentVersionId: "version-one", textVersionId: "text-one", text, segments: [{ id: "section-one", start: 0, end: text.length }] }, groundedPolicy);
    expect(draft.items.map(row => ({ text: row.text, labels: row.skillLabels, source: text.slice(row.sourceRef!.start, row.sourceRef!.end) })))
      .toEqual(quotes.map((quote, index) => ({ text: quote, labels: index < 2 ? ["SQL"] : [], source: quote })));
    expect(draft.selfAssessmentHints).toEqual([]);
    expect(draft.reviewPoints.map(row => ({ code: row.code, resolution: row.resolution, source: text.slice(row.sourceRef.start, row.sourceRef.end) })))
      .toEqual([{ code: "confirm-self-assessment", resolution: "unresolved", source: quotes[0] }, { code: "missing-information", resolution: "unresolved", source: quotes[2] }]);
  });

  it.each([
    ["我用 React 实现了原型，交互测试由结对伙伴协助。", "React", "guided", null, false],
    ["我在导师指导下用 React 实现了原型。", "React", "guided", "guided", true],
    ["个人简介：我熟悉 SQL。", "SQL", "conceptual", "conceptual", true],
    ["我目前不能独立配置 Kubernetes 集群。", "Kubernetes", "uncertain", null, true],
    ["I can independently write SQL reports.", "SQL", null, null, true],
    ["I built a React prototype, and I tested React under peer guidance.", "React", "guided", null, true],
    ["简介：可独立完成 SQL 报表。", "SQL", "uncertain", null, true],
    ["I cannot independently configure Kubernetes.", "Kubernetes", "uncertain", null, true],
    ["I cannot write SQL reports independently.", "SQL", "uncertain", null, true],
  ] as const)("projects the complete fact, exact terms and optional task-scoped hint for %s", async (text, label, proposed, hint, review) => {
    const { outcome } = await analyze({ format: "source-spans-v2", items: [{ kind: "skill-claim", source: localSource(text),
      skillTerms: [label], selfLevelHint: proposed, requirementLevel: null }], reviewPoints: [] }, { policyId: groundedPolicy, kind: "resume", text });
    const draft = validateDocumentExtraction(outcome.candidate, "owner", { ownerId: "owner", lifecycle: "active", documentId: "doc-one",
      documentVersionId: "version-one", textVersionId: "text-one", text, segments: [{ id: "section-one", start: 0, end: text.length }] }, groundedPolicy);
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0]).toMatchObject({ text, skillLabels: [label], sourceRef: { start: 0, end: text.length } });
    expect(draft.selfAssessmentHints).toEqual(hint ? [{ id: "hint-candidate-1-0", candidateId: "candidate-1", skillLabel: label, level: hint }] : []);
    expect(draft.reviewPoints.map(point => point.code)).toEqual(review ? ["confirm-self-assessment"] : []);
  });

  it.each([
    ["例如我负责 SQL 查询，我熟悉 SQL。", "SQL", "conceptual"],
    ["例如，我熟悉 SQL。", "SQL", "conceptual"],
    ["例如，我在导师指导下用 React 实现了原型。", "React", "guided"],
    ["简介：例如我负责 SQL 查询，我熟悉 SQL。", "SQL", "conceptual"],
    ["不能说我负责 SQL 查询，我熟悉 SQL。", "SQL", "conceptual"],
    ["我没有说过，我熟悉 SQL。", "SQL", "conceptual"],
    ["导师说，我熟悉 SQL。", "SQL", "conceptual"],
    ["如果我完成了 React 原型，我在导师指导下测试 React。", "React", "guided"],
    ["我完成了 React 原型，但导师说，我熟悉 SQL。", "SQL", "conceptual"],
    ["I built a React prototype, but Alice said, I am familiar with SQL.", "SQL", "conceptual"],
    ["I built a React prototype, and my mentor said, I tested SQL under supervision.", "SQL", "guided"],
  ] as const)("keeps a modal statement as a fact without adopting its nested self-assessment: %s", async (text, label, hint) => {
    const source = localSource(text);
    const { outcome } = await analyze({ format: "source-spans-v2", items: [{ kind: "skill-claim", source,
      skillTerms: [label], selfLevelHint: hint, requirementLevel: null }],
      reviewPoints: [{ code: "confirm-self-assessment", source }] }, { policyId: groundedPolicy, kind: "resume", text });
    expect(outcome.candidate).toMatchObject({ items: [{ text, source, skillLabels: [label], selfLevelHint: null }], reviewPoints: [] });
    const draft = validateDocumentExtraction(outcome.candidate, "owner", { ownerId: "owner", lifecycle: "active", documentId: "doc-one",
      documentVersionId: "version-one", textVersionId: "text-one", text, segments: [{ id: "section-one", start: 0, end: text.length }] }, groundedPolicy);
    expect(draft.items[0]).toMatchObject({ text, skillLabels: [label], sourceRef: { start: 0, end: text.length } });
    expect(draft.selfAssessmentHints).toEqual([]);
    expect(draft.reviewPoints).toEqual([]);
  });

  it.each(["resume", "jd", "supplement"] as const)("extracts source terms, preserves unknown tools and separates role coverage for %s", async kind => {
    const { outcome, body } = await analyze(grounded, { policyId: groundedPolicy, text: localText, kind });
    expect(body.messages[0].content).toContain("source-spans-v2");
    expect(body.messages[0].content).toContain("skillTerms");
    expect(new TextEncoder().encode(JSON.stringify({ ...body, messages: [body.messages[0]] })).length).toBeLessThan(4096);
    expect(JSON.parse(body.messages[1].content)).toEqual({ kind, segments: [{ segmentId: "section-one", text: localText }] });
    expect(body.provider).toMatchObject({ only: ["moonshotai/mxfp4"], allow_fallbacks: false, zdr: true, data_collection: "deny" });
    expect(outcome).toMatchObject({ actualMicroUsd: 7, audit: { status: "verified", extractionRead: "parsed" },
      candidate: { schemaVersion: "2026.11.1", items: [
        { id: "candidate-1", text: practice, skillLabels: ["data cleaning", "DuckDB"] },
        { id: "candidate-2", text: obligation, skillLabels: ["FlarnDock"], requirementLevel: "must" },
      ], reviewPoints: [] } });
  });

  it("keeps incomplete generations billable but unusable under the separately pinned policy", async () => {
    const { outcome } = await analyze(grounded, { policyId: groundedPolicy, text: localText, generationEnd: { native_finish_reason: "length" } });
    expect(outcome).toMatchObject({ actualMicroUsd: 7, candidate: null, audit: { status: "verified", extractionRead: "output-limit" } });
  });

  it("retains the action but withholds a model's unsupported level and its review question", async () => {
    const text = "I installed DuckDB.";
    const suggestion = { ...grounded, items: [{ kind: "experience", source: localSource(text), requirementLevel: null,
      skillTerms: ["DuckDB"], selfLevelHint: "guided" }], reviewPoints: [{ code: "confirm-self-assessment", source: localSource(text) }] };
    const { outcome } = await analyze(suggestion, { policyId: groundedPolicy, kind: "resume", text });
    expect(outcome.candidate).toMatchObject({ items: [{ text, skillLabels: ["DuckDB"], selfLevelHint: null }], reviewPoints: [] });
  });

  it("still rejects a level supplied for a job requirement", async () => {
    const bad = { ...grounded, items: [{ ...grounded.items[1]!, selfLevelHint: "guided" }], reviewPoints: [] };
    const { outcome } = await analyze(bad, { policyId: groundedPolicy, text: localText });
    expect(outcome).toMatchObject({ candidate: null, actualMicroUsd: 7, audit: { extractionRead: "invalid-shape" } });
  });

  it("keeps a JD familiarity requirement without accepting a model's personal assessment question", async () => {
    const text = "熟悉 SQL。", source = localSource(text);
    const { outcome } = await analyze({ format: "source-spans-v2", items: [{ kind: "requirement", source,
      skillTerms: ["SQL"], selfLevelHint: null, requirementLevel: "unspecified" }],
      reviewPoints: [{ code: "confirm-self-assessment", source }] }, { policyId: groundedPolicy, kind: "jd", text });
    expect(outcome.candidate).toMatchObject({ items: [{ text, skillLabels: ["SQL"], selfLevelHint: null }], reviewPoints: [] });
  });

  it("keeps a URL query and the following access restriction together in the fact and in its review", async () => {
    const text = "课后仅可在内网查看 https://learn.invalid/lesson?q=queue，访问前需登记。";
    const source = localSource(text);
    const { outcome } = await analyze({ format: "source-spans-v2", items: [{ kind: "constraint", source,
      skillTerms: [], selfLevelHint: null, requirementLevel: null }], reviewPoints: [] }, { policyId: groundedPolicy, text, kind: "supplement" });
    expect(outcome.candidate).toMatchObject({ items: [{ text, source }], reviewPoints: [{ code: "untrusted-resource-url", source }] });
  });

  it("never presents a personal level from a sentence quoted inside a multi-sentence example", async () => {
    const example = "I am familiar with DuckDB.";
    const text = "The manual gives this example: “First choose a tool. " + example + " Continue the worksheet.”";
    const source = localSource(example);
    const { outcome } = await analyze({ format: "source-spans-v2", items: [{ kind: "skill-claim", source,
      skillTerms: ["DuckDB"], selfLevelHint: "conceptual", requirementLevel: null }],
      reviewPoints: [{ code: "confirm-self-assessment", source }] }, { policyId: groundedPolicy, text, kind: "supplement" });
    expect(outcome).toMatchObject({ candidate: null, audit: { extractionRead: "invalid-source" } });
  });

  it.each([
    ["I am familiar with HTML, but my colleague uses PostgreSQL.", ["HTML", "PostgreSQL"], "conceptual", null, true],
    ["I rehearsed migrations under supervision, but I independently use PostgreSQL.", ["PostgreSQL"], "guided", null, true],
    ["I am familiar with log sampling, but I never used FakeTool.", ["log sampling", "invented"], "conceptual", "conceptual", true],
    ["- I am familiar with SQL.", ["SQL"], "conceptual", "conceptual", true],
    ["I am familiar with the example “My colleague uses PostgreSQL.”", ["PostgreSQL"], "conceptual", null, false],
    ["I am familiar with “PostgreSQL”.", ["PostgreSQL"], "conceptual", "conceptual", true],
    ["没有证据说我能独立配置 React，但我熟悉 SQL。", ["SQL"], "conceptual", "conceptual", true],
    ["It is false that I configured React, but I am familiar with SQL.", ["SQL"], "conceptual", "conceptual", true],
    ["我熟悉 SQL，但导师说，我熟悉 React。", ["SQL"], "conceptual", "conceptual", true],
    ["我熟悉 SQL 但导师说，我熟悉 React。", ["SQL"], "conceptual", "conceptual", true],
    ["I am familiar with SQL, but Alice said, I am familiar with React.", ["SQL"], "conceptual", "conceptual", true],
    ["I am familiar with SQL but Alice said, I am familiar with React.", ["SQL"], "conceptual", "conceptual", true],
    ["I tested SQL under supervision and my mentor said, I tested React under supervision.", ["SQL"], "guided", "guided", true],
    ["It is false that I configured React, but I am familiar with SQL but Alice said, I am familiar with React.", ["SQL"], "conceptual", "conceptual", true],
    ["I am familiar with SQL, but Alice said, I am familiar with React.", ["React"], "conceptual", null, true],
    ["I documented that my colleague used PostgreSQL under supervision.", ["PostgreSQL"], "guided", null, false],
    ["I explained how my colleague built PostgreSQL under supervision.", ["PostgreSQL"], "guided", null, false],
    ["我在导师指导下，安排同事使用 PostgreSQL。", ["PostgreSQL"], "guided", null, false],
  ] as const)("binds a level to the retained terms and the full-document assertion: %s", async (text, skillTerms, hint, expected, review) => {
    const source = localSource(text);
    const { outcome } = await analyze({ format: "source-spans-v2", items: [{ kind: "skill-claim", source,
      skillTerms, selfLevelHint: hint, requirementLevel: null }], reviewPoints: [] }, { policyId: groundedPolicy, text, kind: "resume" });
    expect(outcome.audit).toMatchObject({ extractionRead: "parsed" });
    expect(outcome.candidate).toMatchObject({ items: [{ selfLevelHint: expected }] });
    const candidate = outcome.candidate as { reviewPoints: { code: string }[] };
    expect(candidate.reviewPoints.some(point => point.code === "confirm-self-assessment")).toBe(review);
  });

  it.each(["labels", "priority", "kind", "list marker"])("rejects repeated v2 source facts even when the model varies %s", async variant => {
    const text = "- SQL and PostgreSQL are required.";
    const first = { kind: "requirement", source: localSource(text), requirementLevel: "must", skillTerms: ["SQL"], selfLevelHint: null };
    const second = { ...first,
      ...(variant === "labels" ? { skillTerms: ["PostgreSQL"] } : {}),
      ...(variant === "priority" ? { requirementLevel: "preferred" } : {}),
      ...(variant === "kind" ? { kind: "skill-claim", requirementLevel: null } : {}),
      ...(variant === "list marker" ? { source: localSource(text.slice(2)) } : {}),
    };
    const { outcome } = await analyze({ format: "source-spans-v2", items: [first, second], reviewPoints: [] }, { policyId: groundedPolicy, text });
    expect(outcome).toMatchObject({ candidate: null, actualMicroUsd: 7, audit: { status: "verified", extractionRead: "invalid-shape" } });
  });

  it("preserves separate source statements containing overlapping skill lists", async () => {
    const quotes = ["SQL and PostgreSQL are required.", "SQL is preferred for the optional analytics rotation."];
    const { outcome } = await analyze({ format: "source-spans-v2", items: quotes.map((quote, index) => ({
      kind: "requirement", source: localSource(quote), requirementLevel: index ? "preferred" : "must",
      skillTerms: index ? ["SQL"] : ["SQL", "PostgreSQL"], selfLevelHint: null,
    })), reviewPoints: [] }, { policyId: groundedPolicy, text: quotes.join(" ") });
    expect(outcome).toMatchObject({ audit: { extractionRead: "parsed" }, candidate: {
      items: [{ text: quotes[0], skillLabels: ["SQL", "PostgreSQL"], requirementLevel: "must" },
        { text: quotes[1], skillLabels: ["SQL"], requirementLevel: "preferred" }],
    } });
  });

  it("keeps source-grounded contradictory priorities unresolved before user review", async () => {
    const quotes = ["FlarnDock is required.", "FlarnDock is preferred."];
    const { outcome } = await analyze({ format: "source-spans-v2", items: quotes.map((quote, index) => ({
      kind: "requirement", source: localSource(quote), requirementLevel: index ? "preferred" : "must",
      skillTerms: ["FlarnDock"], selfLevelHint: null,
    })), reviewPoints: [] }, { policyId: groundedPolicy, text: quotes.join("\n") });
    expect(outcome).toMatchObject({ audit: { extractionRead: "parsed" }, candidate: {
      items: quotes.map(text => ({ text, requirementLevel: "unspecified" })),
      reviewPoints: quotes.map(quote => ({ code: "conflicting-requirement", source: localSource(quote) })),
    } });
  });

  it("does not downgrade a requirement for an unsupported model conflict warning", async () => {
    const text = "FlarnDock is required.";
    const { outcome } = await analyze({ format: "source-spans-v2", items: [{
      kind: "requirement", source: localSource(text), requirementLevel: "must", skillTerms: ["FlarnDock"], selfLevelHint: null,
    }], reviewPoints: [{ code: "conflicting-requirement", source: localSource(text) }] }, { policyId: groundedPolicy, text });
    expect(outcome).toMatchObject({ audit: { extractionRead: "parsed" }, candidate: {
      items: [{ text, requirementLevel: "must" }], reviewPoints: [],
    } });
  });

  it("still rejects an ambiguous complete fact when skill terms may repeat within a fact", async () => {
    const quote = "FlarnDock training and FlarnDock support are required.";
    const { outcome } = await analyze({ format: "source-spans-v2", items: [{
      kind: "requirement", source: localSource(quote), requirementLevel: "must", skillTerms: ["FlarnDock"], selfLevelHint: null,
    }], reviewPoints: [] }, { policyId: groundedPolicy, text: quote + "\n" + quote });
    expect(outcome).toMatchObject({ candidate: null, audit: { extractionRead: "invalid-source" } });
  });

  it.each([
    ["PostgreSQL is optional for this role.", "must", "preferred"],
    ["PostgreSQL is required for this role.", "preferred", "must"],
    ["We use PostgreSQL.", "must", "unspecified"],
    ["SQL is required, but PostgreSQL is optional.", "must", "unspecified"],
  ])("derives the requirement level from source evidence: %s", async (text, proposed, expected) => {
    const { outcome } = await analyze({ format: "source-spans-v2", items: [{ kind: "requirement", source: localSource(text),
      skillTerms: ["PostgreSQL"], selfLevelHint: null, requirementLevel: proposed }], reviewPoints: [] }, { policyId: groundedPolicy, text });
    expect(outcome).toMatchObject({ audit: { extractionRead: "parsed" }, candidate: { items: [{ text, requirementLevel: expected }] } });
  });

  it.each([["Required:", "must"], ["Must have", "must"], ["必备：", "must"], ["Preferred skills", "preferred"]])(
    "uses a complete unbulleted entry beneath the v2 heading %s", async (heading, expected) => {
      const text = heading + "\nSQL";
      const { outcome } = await analyze({ format: "source-spans-v2", items: [{ kind: "requirement", source: localSource("SQL"),
        skillTerms: ["SQL"], requirementLevel: "unspecified", selfLevelHint: null }], reviewPoints: [] }, { policyId: groundedPolicy, text });
      expect(outcome).toMatchObject({ audit: { extractionRead: "parsed" }, candidate: { items: [{ text: "SQL", skillLabels: ["SQL"], requirementLevel: expected }] } });
    });

  it("refuses downgraded and cross-version reply formats", async () => {
    const oldAtNew = await analyze(compact, { policyId: groundedPolicy });
    const newAtOld = await analyze(grounded, { policyId: policy, text: localText });
    for (const { outcome } of [oldAtNew, newAtOld]) {
      expect(outcome).toMatchObject({ candidate: null, actualMicroUsd: 7, audit: { status: "verified", extractionRead: "invalid-shape" } });
    }
  });

  it("binds the new policy to the same strict endpoint and refuses unimplemented versions", () => {
    const nextConfig = { ...config, providerPolicyId: groundedPolicy };
    const nextQualification = { ...qualification, providerPolicyId: groundedPolicy };
    expect(isDocumentProviderQualified(nextConfig, nextQualification)).toBe(true);
    expect(isDocumentProviderQualified(nextConfig, { ...nextQualification, receiptRoute: { ...qualification.receiptRoute, endpointId: "other" } })).toBe(false);
    const unimplemented = groundedPolicy.slice(0, -1) + "3";
    expect(isDocumentProviderQualified({ ...config, providerPolicyId: unimplemented }, { ...qualification, providerPolicyId: unimplemented })).toBe(false);
  });
});
