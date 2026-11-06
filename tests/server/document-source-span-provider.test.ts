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
