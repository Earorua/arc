// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResearchIssueCode } from "../../app/contracts/research";
import { D1AiRunSink } from "../../app/server/ai/d1-run-recorder";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import * as resultDiagnosticModule from "../../app/server/research/result-diagnostic";
import { fixtureResponse, runValidation } from "../../scripts/live-research/validation";
import { candidateWithMissingCitations } from "../fixtures/research/invalid-candidates";

const {
  projectResearchAttemptDiagnostic,
  projectResearchRunDiagnostic,
  projectValidationProviderResultDiagnostic,
} = resultDiagnosticModule;

const key = "synthetic-live-validation-key";
const owner = "live-validation-owner";
const safeKeyData = { data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0, is_management_key: false,
  is_provisioning_key: false, byok_usage: 0, expires_at: null } };
const KEY_URL = "https://openrouter.ai/api/v1/key";
const RESEARCH_URL = "https://openrouter.ai/api/v1/chat/completions";

type DiagnosticSummary = Awaited<ReturnType<typeof runValidation>>;
type ProviderPayload = Record<string, unknown> & {
  choices: Array<{ finish_reason?: unknown; error?: unknown; message: { content: unknown; annotations?: unknown } }>;
  usage?: unknown;
};

afterEach(() => { vi.restoreAllMocks(); });

async function payloadFixture(): Promise<ProviderPayload> {
  return fixtureResponse().json() as Promise<ProviderPayload>;
}

function validationFetch(change: (payload: ProviderPayload) => Response | void) {
  return vi.fn<typeof globalThis.fetch>(async (url) => {
    if (url === KEY_URL) return Response.json(safeKeyData);
    const payload = await payloadFixture();
    return change(payload) ?? Response.json(payload);
  });
}

function expectOneSyntheticRoundTrip(fetch: ReturnType<typeof validationFetch>, result: DiagnosticSummary) {
  expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
    [KEY_URL, "GET"], [RESEARCH_URL, "POST"],
  ]);
  expect(result).toMatchObject({
    mode: "live-one", realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, auditCount: 1,
    ownerWrongReadRejected: true, secondResearchRejected: true, databaseDisposed: true,
  });
}

const validProviderDiagnostic = () => ({
  outcome: "accepted" as const, reason: null, finishReasonState: "recognized" as const,
  finishReason: "stop" as const, usageIssueCodes: [],
  webSearchUsage: { container: "object" as const, requests: "valid" as const },
  webSearchUsageDetails: { container: "missing" as const, requests: "unavailable" as const },
  webSearchUsageSource: "legacy" as const,
});
const validQuality = (change: Record<string, unknown> = {}) => ({
  passed: true, issueCodes: [], skillCount: 4, sourceCount: 8, unitCount: 12, observedAt: "2026-09-10", ...change,
});

describe("bounded validation diagnostic projections", () => {
  it("copies only the fixed provider fields and returns fresh nested output", () => {
    const canary = "CANARY-provider-private";
    const input = { ...validProviderDiagnostic(), usageIssueCodes: ["cost", "web-search-requests"],
      webSearchUsage: { container: "object", requests: "non-number", privateValue: canary },
      webSearchUsageDetails: { container: "missing", requests: "unavailable", privateValue: canary },
      webSearchUsageSource: "invalid",
      apiKey: "sk-or-v1-private", url: "https://private.example.test", body: canary, metadata: { nested: canary } };
    const first = projectValidationProviderResultDiagnostic(input);
    const second = projectValidationProviderResultDiagnostic(input);

    expect(first).toEqual({ ...validProviderDiagnostic(), usageIssueCodes: ["cost", "web-search-requests"],
      webSearchUsage: { container: "object", requests: "non-number" },
      webSearchUsageDetails: { container: "missing", requests: "unavailable" }, webSearchUsageSource: "invalid" });
    expect(JSON.stringify(first)).not.toContain("CANARY");
    expect(JSON.stringify(first)).not.toContain("private.example.test");
    expect(JSON.stringify(first)).not.toContain("sk-or-v1");
    expect(first).not.toBe(second);
    expect(first!.usageIssueCodes).not.toBe(input.usageIssueCodes);
    expect(first!.webSearchUsage).not.toBe(input.webSearchUsage);
    expect(first!.webSearchUsageDetails).not.toBe(input.webSearchUsageDetails);
    input.usageIssueCodes.push("usage-shape");
    input.webSearchUsage.requests = "valid";
    input.webSearchUsageDetails.requests = "valid";
    expect(first!.usageIssueCodes).toEqual(["cost", "web-search-requests"]);
    expect(first!.webSearchUsage).toEqual({ container: "object", requests: "non-number" });
    expect(first!.webSearchUsageDetails).toEqual({ container: "missing", requests: "unavailable" });
  });

  it.each([
    ["legacy", { webSearchUsage: { container: "object", requests: "valid" },
      webSearchUsageDetails: { container: "missing", requests: "unavailable" }, webSearchUsageSource: "legacy" }],
    ["details", { webSearchUsage: { container: "missing", requests: "unavailable" },
      webSearchUsageDetails: { container: "object", requests: "valid" }, webSearchUsageSource: "details" }],
    ["both", { webSearchUsage: { container: "object", requests: "valid" },
      webSearchUsageDetails: { container: "object", requests: "valid" }, webSearchUsageSource: "both" }],
    ["conflict", { webSearchUsage: { container: "object", requests: "valid" },
      webSearchUsageDetails: { container: "object", requests: "valid" }, webSearchUsageSource: "conflict" }],
    ["missing", { webSearchUsage: { container: "missing", requests: "unavailable" },
      webSearchUsageDetails: { container: "missing", requests: "unavailable" }, webSearchUsageSource: "missing" }],
    ["invalid", { webSearchUsage: { container: "object", requests: "non-number" },
      webSearchUsageDetails: { container: "object", requests: "valid" }, webSearchUsageSource: "invalid" }],
    ["unavailable", { webSearchUsage: { container: "unavailable", requests: "unavailable" },
      webSearchUsageDetails: { container: "unavailable", requests: "unavailable" }, webSearchUsageSource: "invalid" }],
  ])("accepts a source-consistent %s search projection", (_label, search) => {
    expect(projectValidationProviderResultDiagnostic({ ...validProviderDiagnostic(), ...search })).toMatchObject(search);
  });

  it.each([
    ["missing field", { outcome: "accepted", reason: null, finishReasonState: "recognized", finishReason: "stop" }],
    ["outcome/reason mismatch", { ...validProviderDiagnostic(), outcome: "rejected" }],
    ["finish state mismatch", { ...validProviderDiagnostic(), finishReasonState: "missing" }],
    ["unknown enum", { ...validProviderDiagnostic(), reason: "CANARY-private" }],
    ["unsorted issues", { ...validProviderDiagnostic(), usageIssueCodes: ["usage-shape", "cost"] }],
    ["duplicate issues", { ...validProviderDiagnostic(), usageIssueCodes: ["cost", "cost"] }],
    ["missing search summary", { ...validProviderDiagnostic(), webSearchUsage: undefined }],
    ["missing details summary", { ...validProviderDiagnostic(), webSearchUsageDetails: undefined }],
    ["missing search source", { ...validProviderDiagnostic(), webSearchUsageSource: undefined }],
    ["unknown search container", { ...validProviderDiagnostic(), webSearchUsage: { container: "CANARY", requests: "valid" } }],
    ["unknown search requests", { ...validProviderDiagnostic(), webSearchUsage: { container: "object", requests: "CANARY" } }],
    ["object without request shape", { ...validProviderDiagnostic(), webSearchUsage: { container: "object", requests: "unavailable" } }],
    ["non-object with request shape", { ...validProviderDiagnostic(), webSearchUsage: { container: "missing", requests: "valid" } }],
    ["legacy shape with details source", { ...validProviderDiagnostic(), webSearchUsageSource: "details" }],
    ["details shape with legacy source", { ...validProviderDiagnostic(), webSearchUsage: { container: "missing", requests: "unavailable" },
      webSearchUsageDetails: { container: "object", requests: "valid" }, webSearchUsageSource: "legacy" }],
    ["missing shapes with invalid source", { ...validProviderDiagnostic(), webSearchUsage: { container: "missing", requests: "unavailable" },
      webSearchUsageSource: "invalid" }],
    ["one unavailable shape", { ...validProviderDiagnostic(), webSearchUsage: { container: "unavailable", requests: "unavailable" },
      webSearchUsageSource: "invalid" }],
    ["both valid with legacy source", { ...validProviderDiagnostic(),
      webSearchUsageDetails: { container: "object", requests: "valid" }, webSearchUsageSource: "legacy" }],
  ])("rejects an invalid provider diagnostic: %s", (_label, input) => {
    expect(projectValidationProviderResultDiagnostic(input)).toBeNull();
  });

  it("fails closed when a projected provider getter throws", () => {
    const input = { ...validProviderDiagnostic(), get outcome(): never { throw new Error("CANARY-getter"); } };
    expect(projectValidationProviderResultDiagnostic(input)).toBeNull();
    const nested = { ...validProviderDiagnostic(),
      webSearchUsage: { container: "object", get requests(): never { throw new Error("CANARY-nested-getter"); } } };
    expect(projectValidationProviderResultDiagnostic(nested)).toBeNull();
    const detailsNested = { ...validProviderDiagnostic(),
      webSearchUsageDetails: { container: "missing", get requests(): never { throw new Error("CANARY-details-getter"); } } };
    expect(projectValidationProviderResultDiagnostic(detailsNested)).toBeNull();
    const source = { ...validProviderDiagnostic(), get webSearchUsageSource(): never { throw new Error("CANARY-source-getter"); } };
    expect(projectValidationProviderResultDiagnostic(source)).toBeNull();
  });

  it.each([null, [], "diagnostic", 7, true])("rejects arbitrary non-record diagnostic input: %j", (input) => {
    expect(projectValidationProviderResultDiagnostic(input)).toBeNull();
    expect(projectResearchAttemptDiagnostic(input)).toBeNull();
    expect(projectResearchRunDiagnostic(input)).toBeNull();
  });

  it.each([
    ["accepted with an error", { status: "accepted", errorCode: "timeout", charged: true }],
    ["rejected without an error", { status: "rejected", errorCode: null, charged: true }],
    ["non-failed released", { status: "accepted", errorCode: null, charged: false }],
    ["rejected provider failure", { status: "rejected", errorCode: "timeout", charged: true }],
    ["failed validation result", { status: "failed", errorCode: "invalid-result", charged: true }],
    ["unknown status", { status: "CANARY", errorCode: null, charged: true }],
    ["unknown error", { status: "failed", errorCode: "CANARY", charged: "unknown" }],
    ["missing field", { status: "accepted", errorCode: null }],
  ])("rejects an inconsistent attempt diagnostic: %s", (_label, input) => {
    expect(projectResearchAttemptDiagnostic(input)).toBeNull();
  });

  it("projects only explicit attempt fields and isolates getter failures", () => {
    const source = { status: "rejected", errorCode: "invalid-result", charged: true,
      model: "sk-or-v1-private", identity: "CANARY", usage: { url: "https://private.example.test" } };
    const first = projectResearchAttemptDiagnostic(source);
    const second = projectResearchAttemptDiagnostic(source);
    expect(first).toEqual({ status: "rejected", errorCode: "invalid-result", charged: true });
    expect(first).not.toBe(second);
    expect(JSON.stringify(projectResearchAttemptDiagnostic(source))).not.toContain("private");
    expect(projectResearchAttemptDiagnostic({ ...source, get charged(): never { throw new Error("CANARY"); } })).toBeNull();
  });

  it("projects a complete bounded run diagnostic without retaining the report", () => {
    const canary = "CANARY-run-private";
    const source = { errorCode: "result-too-large", quality: validQuality({ passed: false,
      issueCodes: ["missing-unit"], skillCount: 64, sourceCount: 256, unitCount: 512 }),
      candidate: { body: canary }, metadata: { apiKey: "sk-or-v1-private", url: "https://private.example.test" } };
    const first = projectResearchRunDiagnostic(source);
    const second = projectResearchRunDiagnostic(source);
    const typedIssueCodes: ResearchIssueCode[] = first!.quality!.issueCodes;

    expect(typedIssueCodes).toEqual(["missing-unit"]);
    expect(first).toEqual({ errorCode: "result-too-large",
      quality: { passed: false, issueCodes: ["missing-unit"], skillCount: 64, sourceCount: 256, unitCount: 512 } });
    expect(JSON.stringify(first)).not.toContain("CANARY");
    expect(JSON.stringify(first)).not.toContain("observedAt");
    expect(first).not.toBe(second);
    expect(first!.quality!.issueCodes).not.toBe(source.quality.issueCodes);
    (source.quality.issueCodes as ResearchIssueCode[]).push("unsafe-url");
    expect(first!.quality!.issueCodes).toEqual(["missing-unit"]);
  });

  it.each(["CANARY-private-error", 7, { nested: "CANARY-private-error" }])(
    "maps an unknown run error value to unrecognized without leaking it: %j",
    (errorCode) => {
    const result = projectResearchRunDiagnostic({ errorCode, quality: null });
    expect(result).toEqual({ errorCode: "unrecognized", quality: null });
    expect(JSON.stringify(result)).not.toContain("CANARY");
    },
  );

  it.each([
    ["missing record", null],
    ["missing error", { quality: null }],
    ["missing quality", { errorCode: null }],
    ["incomplete quality", { errorCode: null, quality: { passed: true, issueCodes: [] } }],
    ["out-of-range quality", { errorCode: null, quality: validQuality({ unitCount: 513 }) }],
    ["inconsistent quality", { errorCode: null, quality: validQuality({ passed: false }) }],
    ["unknown quality issue", { errorCode: null, quality: validQuality({ passed: false, issueCodes: ["CANARY"] }) }],
    ["quality metadata", { errorCode: null, quality: validQuality({ metadata: "CANARY" }) }],
  ])("rejects an invalid run record or report: %s", (_label, input) => {
    expect(projectResearchRunDiagnostic(input)).toBeNull();
  });

  it("fails closed when a projected run getter throws", () => {
    expect(projectResearchRunDiagnostic({ errorCode: null, get quality(): never { throw new Error("CANARY"); } })).toBeNull();
  });
});

describe("live Research result diagnostics", () => {
  it("surfaces bounded provider, attempt, and run diagnostics for an invalid result", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      if (url === KEY_URL) return Response.json(safeKeyData);
      const payload = await fixtureResponse().json() as Record<string, unknown> & {
        choices: Array<{ message: { content: string } }>;
      };
      delete payload.usage;
      payload.choices[0]!.message.content = "{}";
      return Response.json(payload);
    });

    const result = await runValidation({ executeOne: true, key, fetch }) as DiagnosticSummary;

    expect(result).toMatchObject({
      outcome: "incomplete",
      reason: "research-failed",
      runState: "failed",
      failureCategory: "invalid-result",
      usage: null,
      reservation: { status: "conservative-hold" },
      planningGenerated: false,
      databaseDisposed: true,
      providerResultDiagnostic: { outcome: "accepted", reason: null, finishReasonState: "recognized", finishReason: "stop",
        usageIssueCodes: ["usage-shape"], webSearchUsage: { container: "unavailable", requests: "unavailable" },
        webSearchUsageDetails: { container: "unavailable", requests: "unavailable" }, webSearchUsageSource: "invalid" },
      researchAttemptDiagnostic: { status: "rejected", errorCode: "invalid-result", charged: true },
      researchRunDiagnostic: { errorCode: "invalid-result", quality: { passed: false, issueCodes: ["invalid-schema"] } },
    });
    expectOneSyntheticRoundTrip(fetch, result);
  });

  it.each([
    ["null finish", (payload: ProviderPayload) => { payload.choices[0]!.finish_reason = null; },
      { outcome: "rejected", reason: "finish-not-stop", finishReasonState: "missing", finishReason: null },
      { status: "failed", errorCode: "invalid-transport", charged: true }, "invalid-transport"],
    ["length finish", (payload: ProviderPayload) => { payload.choices[0]!.finish_reason = "length"; },
      { outcome: "rejected", reason: "finish-not-stop", finishReasonState: "recognized", finishReason: "length" },
      { status: "failed", errorCode: "invalid-transport", charged: true }, "invalid-transport"],
    ["invalid content", (payload: ProviderPayload) => { payload.choices[0]!.message.content = null; },
      { outcome: "rejected", reason: "content-invalid", finishReasonState: "recognized", finishReason: "stop" },
      { status: "failed", errorCode: "invalid-transport", charged: true }, "invalid-transport"],
    ["invalid annotations", (payload: ProviderPayload) => { payload.choices[0]!.message.annotations = {}; },
      { outcome: "rejected", reason: "annotations-invalid", finishReasonState: "recognized", finishReason: "stop" },
      { status: "failed", errorCode: "invalid-transport", charged: true }, "invalid-transport"],
    ["choice error", (payload: ProviderPayload) => { payload.choices[0]!.error = { code: 429, message: "CANARY" }; },
      { outcome: "rejected", reason: "upstream-error", finishReasonState: "recognized", finishReason: "stop" },
      { status: "failed", errorCode: "rate", charged: true }, "rate"],
  ] as const)("keeps business behavior intact for %s", async (_label, change, providerDiagnostic, attemptDiagnostic, runError) => {
    const fetch = validationFetch(change);
    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "research-failed", runState: "failed", planningGenerated: false,
      freshAccountActivated: false, usage: { totalTokens: 9000, costMicros: 100000 },
      reservation: { status: "settled", settledMicros: 100000 },
      providerResultDiagnostic: { ...providerDiagnostic, usageIssueCodes: [],
        webSearchUsage: { container: "object", requests: "valid" },
        webSearchUsageDetails: { container: "missing", requests: "unavailable" }, webSearchUsageSource: "legacy" },
      researchAttemptDiagnostic: attemptDiagnostic,
      researchRunDiagnostic: { errorCode: runError, quality: null },
    });
    expect(JSON.stringify(result.providerResultDiagnostic)).not.toContain("CANARY");
    expectOneSyntheticRoundTrip(fetch, result);
  });

  it("isolates an upstream HTTP error with no execution evidence", async () => {
    const fetch = validationFetch(() => Response.json({ error: { code: 401, message: "CANARY-private" } }, { status: 401 }));
    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "research-failed", runState: "failed", failureCategory: "service-unavailable",
      actualModel: null, usage: null, reservation: { status: "released", settledMicros: 0 },
      providerResultDiagnostic: { outcome: "rejected", reason: "upstream-error", finishReasonState: "unavailable",
        finishReason: null, usageIssueCodes: ["usage-shape"],
        webSearchUsage: { container: "unavailable", requests: "unavailable" },
        webSearchUsageDetails: { container: "unavailable", requests: "unavailable" }, webSearchUsageSource: "invalid" },
      researchAttemptDiagnostic: { status: "failed", errorCode: "unavailable", charged: false },
      researchRunDiagnostic: { errorCode: "unavailable", quality: null },
      planningGenerated: false, freshAccountActivated: false,
    });
    expect(JSON.stringify(result)).not.toContain("CANARY");
    expectOneSyntheticRoundTrip(fetch, result);
  });

  it("keeps the result diagnostic null when the outer response is malformed", async () => {
    const fetch = validationFetch(() => Response.json([]));
    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "research-failed", runState: "failed", failureCategory: "invalid-result",
      actualModel: null, usage: null, reservation: { status: "conservative-hold" }, providerResultDiagnostic: null,
      researchAttemptDiagnostic: { status: "failed", errorCode: "invalid-transport", charged: "unknown" },
      researchRunDiagnostic: { errorCode: "invalid-transport", quality: null },
      planningGenerated: false, freshAccountActivated: false,
    });
    expectOneSyntheticRoundTrip(fetch, result);
  });

  it("reports accepted diagnostics for a ready run and preserves planning and settlement", async () => {
    const fetch = validationFetch(() => undefined);
    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      outcome: "passed", reason: null, runState: "ready", quality: { passed: true, issueCodes: [] },
      usage: { totalTokens: 9000, costMicros: 100000 }, reservation: { status: "settled", settledMicros: 100000 },
      providerResultDiagnostic: validProviderDiagnostic(),
      researchAttemptDiagnostic: { status: "accepted", errorCode: null, charged: true },
      researchRunDiagnostic: { errorCode: null, quality: { passed: true, issueCodes: [] } },
      planningGenerated: true, freshAccountActivated: true,
    });
    expect(result.planningUnitCount).toBeGreaterThan(0);
    expectOneSyntheticRoundTrip(fetch, result);
  });

  it("accepts the details usage alias through the SQLite validation flow", async () => {
    const fetch = validationFetch((payload) => {
      const usage = payload.usage as Record<string, unknown>;
      const legacy = usage.server_tool_use;
      delete usage.server_tool_use;
      usage.server_tool_use_details = legacy;
    });
    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      outcome: "passed", reason: null, runState: "ready",
      usage: { totalTokens: 9000, costMicros: 100000, webSearchRequests: 2 },
      reservation: { status: "settled", settledMicros: 100000 },
      providerResultDiagnostic: { ...validProviderDiagnostic(),
        webSearchUsage: { container: "missing", requests: "unavailable" },
        webSearchUsageDetails: { container: "object", requests: "valid" }, webSearchUsageSource: "details" },
      planningGenerated: true, freshAccountActivated: true,
    });
    expectOneSyntheticRoundTrip(fetch, result);
  });

  it.each([
    ["invalid", (usage: Record<string, unknown>) => {
      delete usage.server_tool_use;
      usage.server_tool_use_details = null;
    }, { legacy: { container: "missing", requests: "unavailable" },
      details: { container: "null", requests: "unavailable" }, source: "invalid" }],
    ["conflict", (usage: Record<string, unknown>) => {
      usage.server_tool_use_details = { web_search_requests: 3 };
    }, { legacy: { container: "object", requests: "valid" },
      details: { container: "object", requests: "valid" }, source: "conflict" }],
  ] as const)("keeps %s dual-path usage on conservative hold", async (_label, change, expected) => {
    const fetch = validationFetch((payload) => { change(payload.usage as Record<string, unknown>); });
    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "validation-incomplete", runState: "ready", usage: null,
      reservation: { status: "conservative-hold", settledMicros: 0 },
      providerResultDiagnostic: { usageIssueCodes: ["web-search-requests"],
        webSearchUsage: expected.legacy, webSearchUsageDetails: expected.details,
        webSearchUsageSource: expected.source },
      planningGenerated: true, freshAccountActivated: true,
    });
    expectOneSyntheticRoundTrip(fetch, result);
  });

  it("keeps a missing-usage ready run on conservative hold while preserving planning", async () => {
    const fetch = validationFetch((payload) => { delete payload.usage; });
    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "validation-incomplete", runState: "ready", quality: { passed: true }, usage: null,
      reservation: { status: "conservative-hold", settledMicros: 0 },
      providerResultDiagnostic: { ...validProviderDiagnostic(), usageIssueCodes: ["usage-shape"],
        webSearchUsage: { container: "unavailable", requests: "unavailable" },
        webSearchUsageDetails: { container: "unavailable", requests: "unavailable" }, webSearchUsageSource: "invalid" },
      researchAttemptDiagnostic: { status: "accepted", errorCode: null, charged: true },
      researchRunDiagnostic: { errorCode: null, quality: { passed: true, issueCodes: [] } },
      planningGenerated: true, freshAccountActivated: true,
    });
    expect(result.planningUnitCount).toBeGreaterThan(0);
    expectOneSyntheticRoundTrip(fetch, result);
  });

  it("keeps a missing search count on conservative hold and delivers its bounded shape summary", async () => {
    const fetch = validationFetch((payload) => {
      const usage = payload.usage as { server_tool_use: Record<string, unknown> };
      delete usage.server_tool_use.web_search_requests;
    });

    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "validation-incomplete", runState: "ready", quality: { passed: true }, usage: null,
      reservation: { status: "conservative-hold", settledMicros: 0 },
      providerResultDiagnostic: { ...validProviderDiagnostic(), usageIssueCodes: ["web-search-requests"],
        webSearchUsage: { container: "object", requests: "missing" }, webSearchUsageSource: "invalid" },
      researchAttemptDiagnostic: { status: "accepted", errorCode: null, charged: true },
      researchRunDiagnostic: { errorCode: null, quality: { passed: true, issueCodes: [] } },
      planningGenerated: true, freshAccountActivated: true,
    });
    expect(result.planningUnitCount).toBeGreaterThan(0);
    expectOneSyntheticRoundTrip(fetch, result);
  });

  it("reports retained quality for a needs-review run without activating planning", async () => {
    const fetch = validationFetch((payload) => {
      payload.choices[0]!.message.content = JSON.stringify(candidateWithMissingCitations());
    });
    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({
      outcome: "incomplete", reason: "quality-needs-review", runState: "needs-review",
      quality: { passed: false, issueCodes: expect.arrayContaining(["missing-skill-source"]) },
      reservation: { status: "settled", settledMicros: 100000 }, providerResultDiagnostic: validProviderDiagnostic(),
      researchAttemptDiagnostic: { status: "rejected", errorCode: "invalid-result", charged: true },
      researchRunDiagnostic: { errorCode: null,
        quality: { passed: false, issueCodes: expect.arrayContaining(["missing-skill-source"]) } },
      planningGenerated: false, freshAccountActivated: false, planningUnitCount: 0,
    });
    expectOneSyntheticRoundTrip(fetch, result);
  });

  it("isolates a fault in the extra run observation after the terminal public read", async () => {
    const originalPublic = D1ResearchRepository.prototype.getPublicRun;
    const originalRun = D1ResearchRepository.prototype.getRun;
    let armed = false;
    let injected = 0;
    vi.spyOn(D1ResearchRepository.prototype, "getPublicRun").mockImplementation(async function(
      this: D1ResearchRepository, ownerId, runId,
    ) {
      const result = await originalPublic.call(this, ownerId, runId);
      if (ownerId === owner && result?.state === "ready") armed = true;
      return result;
    });
    vi.spyOn(D1ResearchRepository.prototype, "getRun").mockImplementation(async function(
      this: D1ResearchRepository, ownerId, runId,
    ) {
      if (armed && ownerId === owner) {
        armed = false;
        injected++;
        throw new Error("CANARY-extra-summary-read");
      }
      return originalRun.call(this, ownerId, runId);
    });
    const fetch = validationFetch(() => undefined);

    const result = await runValidation({ executeOne: true, key, fetch });

    expect(injected).toBe(1);
    expect(result).toMatchObject({ outcome: "passed", reason: null, runState: "ready", researchRunDiagnostic: null,
      reservation: { status: "settled", settledMicros: 100000 }, planningGenerated: true, freshAccountActivated: true,
      databaseDisposed: true });
    expectOneSyntheticRoundTrip(fetch, result);
  });

  it("isolates a getter fault in the provider-to-summary projection", async () => {
    vi.spyOn(resultDiagnosticModule, "projectProviderResultDiagnostic").mockReturnValue({
      get outcome(): never { throw new Error("CANARY-provider-getter"); },
      reason: null, finishReasonState: "recognized", finishReason: "stop", usageIssueCodes: [],
      webSearchUsage: { container: "object", requests: "valid" },
      webSearchUsageDetails: { container: "missing", requests: "unavailable" }, webSearchUsageSource: "legacy",
    });
    const fetch = validationFetch(() => undefined);

    const result = await runValidation({ executeOne: true, key, fetch });

    expect(result).toMatchObject({ outcome: "passed", reason: null, runState: "ready", providerResultDiagnostic: null,
      researchAttemptDiagnostic: { status: "accepted", errorCode: null, charged: true },
      researchRunDiagnostic: { errorCode: null, quality: { passed: true } },
      reservation: { status: "settled", settledMicros: 100000 }, planningGenerated: true, freshAccountActivated: true,
      databaseDisposed: true });
    expectOneSyntheticRoundTrip(fetch, result);
  });

  it.each(["status", "errorCode", "charged"] as const)(
    "isolates a %s getter fault in the extra receipt projection after the terminal public read",
    async (field) => {
      const originalPublic = D1ResearchRepository.prototype.getPublicRun;
      const originalReceipt = D1AiRunSink.prototype.readResearchAttempt;
      let armed = false;
      let injected = 0;
      vi.spyOn(D1ResearchRepository.prototype, "getPublicRun").mockImplementation(async function(
        this: D1ResearchRepository, ownerId, runId,
      ) {
        const result = await originalPublic.call(this, ownerId, runId);
        if (ownerId === owner && result?.state === "ready") armed = true;
        return result;
      });
      vi.spyOn(D1AiRunSink.prototype, "readResearchAttempt").mockImplementation(async function(
        this: D1AiRunSink, ownerId, requestId,
      ) {
        const receipt = await originalReceipt.call(this, ownerId, requestId);
        if (!armed || ownerId !== owner || receipt === null) return receipt;
        armed = false;
        injected++;
        return Object.defineProperty({ ...receipt }, field, {
          configurable: true, enumerable: true, get(): never { throw new Error("CANARY-receipt-getter"); },
        });
      });
      const fetch = validationFetch(() => undefined);

      const result = await runValidation({ executeOne: true, key, fetch });

      expect(injected).toBe(1);
      expect(result).toMatchObject({ outcome: "passed", reason: null, runState: "ready", actualModel: "moonshotai/kimi-k3",
        usage: { totalTokens: 9000, costMicros: 100000 }, researchAttemptDiagnostic: null,
        researchRunDiagnostic: { errorCode: null, quality: { passed: true } }, reservation: { status: "settled" },
        planningGenerated: true, freshAccountActivated: true, databaseDisposed: true });
      expectOneSyntheticRoundTrip(fetch, result);
    },
  );
});
