// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import * as openRouterModule from "../../app/server/research/openrouter-provider";
import { ResearchProviderError, type ResearchProvider } from "../../app/server/research/provider";
import { parseOpenRouterUsage, projectProviderResultDiagnostic,
  type ProviderResultDiagnostic as ResultDiagnostic } from "../../app/server/research/result-diagnostic";

type LocalFactory = (options: {
  key: string;
  fetch: typeof globalThis.fetch;
  onResultDiagnostic?: (diagnostic: ResultDiagnostic) => unknown;
}) => ResearchProvider;

const request = { role: "Data Product Manager", locale: "en-US" } as const;
const key = "synthetic-dummy-credential";
const validUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.000002,
  server_tool_use: { web_search_requests: 2 } };
const safeUsage = { promptTokens: 10, completionTokens: 20, totalTokens: 30, costMicros: 2, webSearchRequests: 2 };
const validWebSearchUsage = { container: "object" as const, requests: "valid" as const };
const missingWebSearchUsage = { container: "missing" as const, requests: "unavailable" as const };
const unavailableWebSearchUsage = { container: "unavailable" as const, requests: "unavailable" as const };
const legacyWebSearchDiagnostics = {
  webSearchUsage: validWebSearchUsage,
  webSearchUsageDetails: missingWebSearchUsage,
  webSearchUsageSource: "legacy" as const,
};
const response = (changes: Record<string, unknown> = {}) => Response.json({
  model: "moonshotai/kimi-k3",
  choices: [{ finish_reason: "stop", message: { content: "{}", annotations: [] } }],
  usage: validUsage,
  ...changes,
});
const factory = () => (openRouterModule as unknown as { createKimiLocalValidationProvider: LocalFactory })
  .createKimiLocalValidationProvider;

async function capture(payload: Response, observer: (diagnostic: ResultDiagnostic) => unknown = () => undefined) {
  const diagnostics: ResultDiagnostic[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async () => payload);
  const provider = factory()({ key, fetch, onResultDiagnostic: (diagnostic) => {
    diagnostics.push(diagnostic); return observer(diagnostic);
  } });
  const result = await provider.research(request).catch((value: unknown) => value);
  return { diagnostics, fetch, provider, result };
}

describe("local provider result diagnostics", () => {
  it("accepts the details web-search usage alias and reports its bounded source", () => {
    const usage = { ...validUsage, server_tool_use: undefined,
      server_tool_use_details: { web_search_requests: 2 } };

    expect(parseOpenRouterUsage(usage, false)).toMatchObject({ success: true, data: safeUsage });
    expect(projectProviderResultDiagnostic({ choices: [{ finish_reason: "stop" }], usage }, false, null)).toEqual({
      outcome: "accepted",
      reason: null,
      finishReasonState: "recognized",
      finishReason: "stop",
      usageIssueCodes: [],
      webSearchUsage: missingWebSearchUsage,
      webSearchUsageDetails: { container: "object", requests: "valid" },
      webSearchUsageSource: "details",
    });
  });

  it.each([
    ["same count", 2, true, "both", 2],
    ["different counts", 3, false, "conflict", undefined],
  ] as const)("classifies both valid aliases with %s without summing", (_label, detailsCount, success, source, count) => {
    const usage = { ...validUsage, server_tool_use_details: { web_search_requests: detailsCount } };
    const parsed = parseOpenRouterUsage(usage, false);
    expect(parsed.success).toBe(success);
    if (success) expect(parsed).toMatchObject({ data: { webSearchRequests: count } });
    expect(projectProviderResultDiagnostic({ choices: [{ finish_reason: "stop" }], usage }, false, null))
      .toMatchObject({ usageIssueCodes: success ? [] : ["web-search-requests"],
        webSearchUsage: validWebSearchUsage, webSearchUsageDetails: validWebSearchUsage, webSearchUsageSource: source });
  });

  it.each([
    ["null container", null, { container: "null", requests: "unavailable" }],
    ["array container", [], { container: "invalid", requests: "unavailable" }],
    ["string container", "CANARY-private", { container: "invalid", requests: "unavailable" }],
    ["empty count", {}, { container: "object", requests: "missing" }],
    ["string count", { web_search_requests: "2" }, { container: "object", requests: "non-number" }],
  ] as const)("rejects a malformed %s even when the opposite alias is valid", (_label, malformed, diagnostic) => {
    for (const malformedField of ["server_tool_use", "server_tool_use_details"] as const) {
      const validField = malformedField === "server_tool_use" ? "server_tool_use_details" : "server_tool_use";
      const usage = { ...validUsage, server_tool_use: undefined,
        [malformedField]: malformed, [validField]: { web_search_requests: 2 } };
      expect(parseOpenRouterUsage(usage, false).success).toBe(false);
      const result = projectProviderResultDiagnostic({ choices: [{ finish_reason: "stop" }], usage }, false, null);
      expect(result.usageIssueCodes).toEqual(["web-search-requests"]);
      expect(result.webSearchUsageSource).toBe("invalid");
      expect(result[malformedField === "server_tool_use" ? "webSearchUsage" : "webSearchUsageDetails"])
        .toEqual(diagnostic);
      expect(result[malformedField === "server_tool_use" ? "webSearchUsageDetails" : "webSearchUsage"])
        .toEqual(validWebSearchUsage);
    }
  });

  it.each([
    ["minimum", 0, "valid"],
    ["maximum", 10, "valid"],
    ["negative", -1, "out-of-range"],
    ["fraction", 0.5, "non-integer"],
    ["NaN", Number.NaN, "non-finite"],
    ["Infinity", Number.POSITIVE_INFINITY, "non-finite"],
    ["above maximum", 11, "out-of-range"],
    ["string", "2", "non-number"],
  ] as const)("applies the bounded count validator to the details alias: %s", (_label, count, requestState) => {
    const usage = { ...validUsage, server_tool_use: undefined,
      server_tool_use_details: { web_search_requests: count } };
    const valid = requestState === "valid";
    expect(parseOpenRouterUsage(usage, false).success).toBe(valid);
    expect(projectProviderResultDiagnostic({ choices: [{ finish_reason: "stop" }], usage }, false, null))
      .toMatchObject({ usageIssueCodes: valid ? [] : ["web-search-requests"],
        webSearchUsage: missingWebSearchUsage,
        webSearchUsageDetails: { container: "object", requests: requestState },
        webSearchUsageSource: valid ? "details" : "invalid" });
  });

  it("defaults only a Repair response with both aliases absent and validates an explicit details count", () => {
    const absent = { ...validUsage, server_tool_use: undefined };
    const explicit = { ...absent, server_tool_use_details: { web_search_requests: 0 } };
    const invalidExplicit = { ...absent, server_tool_use_details: {} };
    expect(parseOpenRouterUsage(absent, false).success).toBe(false);
    expect(parseOpenRouterUsage(absent, true)).toMatchObject({ success: true,
      data: { ...safeUsage, webSearchRequests: 0 } });
    expect(parseOpenRouterUsage(explicit, true)).toMatchObject({ success: true,
      data: { ...safeUsage, webSearchRequests: 0 } });
    expect(parseOpenRouterUsage(invalidExplicit, true).success).toBe(false);
    expect(projectProviderResultDiagnostic({ choices: [{ finish_reason: "stop" }], usage: absent }, true, null))
      .toMatchObject({ usageIssueCodes: [], webSearchUsage: missingWebSearchUsage,
        webSearchUsageDetails: missingWebSearchUsage, webSearchUsageSource: "missing" });
    expect(projectProviderResultDiagnostic({ choices: [{ finish_reason: "stop" }], usage: explicit }, true, null))
      .toMatchObject({ usageIssueCodes: [], webSearchUsage: missingWebSearchUsage,
        webSearchUsageDetails: validWebSearchUsage, webSearchUsageSource: "details" });
  });

  it("does not infer search usage from tool totals, citations, results, or cost", () => {
    const usage = { ...validUsage, server_tool_use: undefined, tool_calls_requested: 2, tool_calls_executed: 2,
      citations: [{ url: "https://private.example.test" }], results: [{ content: "CANARY" }] };
    expect(parseOpenRouterUsage(usage, false).success).toBe(false);
    expect(projectProviderResultDiagnostic({ choices: [{ finish_reason: "stop" }], usage }, false, null))
      .toMatchObject({ usageIssueCodes: ["web-search-requests"], webSearchUsage: missingWebSearchUsage,
        webSearchUsageDetails: missingWebSearchUsage, webSearchUsageSource: "missing" });
    const containerOnly = { ...usage, server_tool_use: { tool_calls_requested: 2, tool_calls_executed: 2,
      citations: 2, results: 2, cost: 2 } };
    expect(parseOpenRouterUsage(containerOnly, false).success).toBe(false);
    expect(projectProviderResultDiagnostic({ choices: [{ finish_reason: "stop" }], usage: containerOnly }, false, null))
      .toMatchObject({ usageIssueCodes: ["web-search-requests"],
        webSearchUsage: { container: "object", requests: "missing" },
        webSearchUsageDetails: missingWebSearchUsage, webSearchUsageSource: "invalid" });
  });

  it("returns sorted unique issue codes for an invalid usage object", () => {
    const outer = { choices: [{ finish_reason: "stop" }], usage: {
      prompt_tokens: -1,
      completion_tokens: 10_000_001,
      total_tokens: "invalid",
      server_tool_use: { web_search_requests: 11 },
    } };
    expect(projectProviderResultDiagnostic(outer, false, null, parseOpenRouterUsage(outer.usage, false)).usageIssueCodes)
      .toEqual(["completion-tokens", "cost", "prompt-tokens", "total-tokens", "web-search-requests"]);
  });

  it("reports the missing web-search container shape without changing usage issue codes", () => {
    const usage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.000002 };

    expect(projectProviderResultDiagnostic({ choices: [{ finish_reason: "stop" }], usage }, false, null)).toEqual({
      outcome: "accepted",
      reason: null,
      finishReasonState: "recognized",
      finishReason: "stop",
      usageIssueCodes: ["web-search-requests"],
      webSearchUsage: missingWebSearchUsage,
      webSearchUsageDetails: missingWebSearchUsage,
      webSearchUsageSource: "missing",
    });
  });

  it("observes a missing finish reason and invalid missing usage without changing the failure", async () => {
    const diagnostics: ResultDiagnostic[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
      model: "moonshotai/kimi-k3",
      choices: [{ finish_reason: null, message: { content: "{}" } }],
    }));
    const provider = factory()({ key, fetch,
      onResultDiagnostic: (diagnostic) => diagnostics.push(diagnostic) });

    const error: unknown = await provider.research({ role: "Data Product Manager", locale: "en-US" })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ResearchProviderError);
    expect(error).toMatchObject({ code: "invalid-transport" });
    expect(diagnostics).toEqual([{
      outcome: "rejected",
      reason: "finish-not-stop",
      finishReasonState: "missing",
      finishReason: null,
      usageIssueCodes: ["usage-shape"],
      webSearchUsage: unavailableWebSearchUsage,
      webSearchUsageDetails: unavailableWebSearchUsage,
      webSearchUsageSource: "invalid",
    }]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    ["stop", "recognized", "stop"], ["length", "recognized", "length"],
    ["tool_calls", "recognized", "tool_calls"], ["content_filter", "recognized", "content_filter"],
    ["error", "recognized", "error"], [null, "missing", null], [undefined, "missing", null],
    [42, "invalid", null], ["max_tokens", "unrecognized", null],
  ] as const)("projects finish_reason %j into fixed state %s", (finishReason, finishReasonState, projected) => {
    const outer = { choices: [{ finish_reason: finishReason }], usage: validUsage };
    expect(projectProviderResultDiagnostic(outer, false, null)).toEqual({
      outcome: "accepted", reason: null, finishReasonState, finishReason: projected, usageIssueCodes: [],
      ...legacyWebSearchDiagnostics,
    });
  });

  it.each([
    undefined, null, {}, [], [{ finish_reason: "stop" }, { finish_reason: "stop" }], ["invalid"],
  ])("makes finish reason unavailable for invalid or multiple choices: %j", (choices) => {
    expect(projectProviderResultDiagnostic({ choices, usage: validUsage }, false, "choices-invalid")).toMatchObject({
      outcome: "rejected", reason: "choices-invalid", finishReasonState: "unavailable", finishReason: null,
    });
  });

  it("does not project a finish reason from a non-ordinary choice object", () => {
    const choice = Object.assign(new Date(0), { finish_reason: "stop" });
    expect(projectProviderResultDiagnostic({ choices: [choice], usage: validUsage }, false, "choices-invalid"))
      .toMatchObject({ finishReasonState: "unavailable", finishReason: null });
  });

  it.each([undefined, null, [], "usage", 1, true])("reports unavailable search shape for non-object usage: %j", (usage) => {
    expect(projectProviderResultDiagnostic({ choices: [{ finish_reason: "stop" }], usage }, false, null)).toEqual({
      outcome: "accepted", reason: null, finishReasonState: "recognized", finishReason: "stop",
      usageIssueCodes: ["usage-shape"], webSearchUsage: unavailableWebSearchUsage,
      webSearchUsageDetails: unavailableWebSearchUsage, webSearchUsageSource: "invalid",
    });
  });

  it("returns independent unavailable alias summaries", () => {
    const result = projectProviderResultDiagnostic({ choices: [{ finish_reason: "stop" }], usage: null }, false, null);
    expect(result.webSearchUsage).not.toBe(result.webSearchUsageDetails);
  });

  it.each([
    ["absent", undefined, "missing"],
    ["null", null, "null"],
    ["string", "CANARY-private", "invalid"],
    ["number", 7, "invalid"],
    ["array", [], "invalid"],
  ] as const)("reports %s web-search container shape without changing usage validation", (_label, serverToolUse, container) => {
    const usage = { ...validUsage, server_tool_use: serverToolUse };
    expect(projectProviderResultDiagnostic({ choices: [{ finish_reason: "stop" }], usage }, false, null)).toEqual({
      outcome: "accepted", reason: null, finishReasonState: "recognized", finishReason: "stop",
      usageIssueCodes: ["web-search-requests"], webSearchUsage: { container, requests: "unavailable" },
      webSearchUsageDetails: missingWebSearchUsage, webSearchUsageSource: container === "missing" ? "missing" : "invalid",
    });
  });

  it.each([
    ["absent", {}, "missing", ["web-search-requests"]],
    ["null", { web_search_requests: null }, "null", ["web-search-requests"]],
    ["string", { web_search_requests: "CANARY-private" }, "non-number", ["web-search-requests"]],
    ["boolean", { web_search_requests: true }, "non-number", ["web-search-requests"]],
    ["NaN", { web_search_requests: Number.NaN }, "non-finite", ["web-search-requests"]],
    ["Infinity", { web_search_requests: Number.POSITIVE_INFINITY }, "non-finite", ["web-search-requests"]],
    ["fraction", { web_search_requests: 0.5 }, "non-integer", ["web-search-requests"]],
    ["negative", { web_search_requests: -1 }, "out-of-range", ["web-search-requests"]],
    ["above maximum", { web_search_requests: 11 }, "out-of-range", ["web-search-requests"]],
    ["minimum", { web_search_requests: 0 }, "valid", []],
    ["maximum", { web_search_requests: 10 }, "valid", []],
  ] as const)("reports %s web-search request shape without retaining its value", (_label, serverToolUse, requests, issues) => {
    const usage = { ...validUsage, server_tool_use: serverToolUse };
    const result = projectProviderResultDiagnostic({ choices: [{ finish_reason: "stop" }], usage }, false, null);
    expect(result).toEqual({ outcome: "accepted", reason: null, finishReasonState: "recognized", finishReason: "stop",
      usageIssueCodes: issues, webSearchUsage: { container: "object", requests },
      webSearchUsageDetails: missingWebSearchUsage, webSearchUsageSource: requests === "valid" ? "legacy" : "invalid" });
    expect(JSON.stringify(result)).not.toContain("CANARY");
  });

  it.each([
    ["missing fields", {}, ["completion-tokens", "cost", "prompt-tokens", "total-tokens", "web-search-requests"]],
    ["prompt range", { ...validUsage, prompt_tokens: 10_000_001 }, ["prompt-tokens"]],
    ["completion type", { ...validUsage, completion_tokens: "20" }, ["completion-tokens"]],
    ["total integer", { ...validUsage, total_tokens: 30.5 }, ["total-tokens"]],
    ["cost missing", { ...validUsage, cost: undefined }, ["cost"]],
    ["search missing", { ...validUsage, server_tool_use: undefined }, ["web-search-requests"]],
    ["search range", { ...validUsage, server_tool_use: { web_search_requests: 11 } }, ["web-search-requests"]],
    ["token mismatch", { ...validUsage, total_tokens: 31 }, ["token-total-mismatch"]],
    ["token mismatch with missing cost", { ...validUsage, total_tokens: 31, cost: undefined },
      ["cost", "token-total-mismatch"]],
    ["token mismatch with missing search", { ...validUsage, total_tokens: 31, server_tool_use: undefined },
      ["token-total-mismatch", "web-search-requests"]],
    ["invalid token suppresses mismatch", { ...validUsage, prompt_tokens: -1, total_tokens: 31 }, ["prompt-tokens"]],
  ])("projects authoritative usage issue for %s", (_label, usage, expected) => {
    expect(projectProviderResultDiagnostic({ choices: [{ finish_reason: "stop" }], usage }, false, null).usageIssueCodes)
      .toEqual(expected);
  });

  it("accepts correctly rounded decimal cost and the Repair absent-search compatibility", () => {
    expect(parseOpenRouterUsage({ ...validUsage, cost: 0.0000011 }, false)).toMatchObject({ success: true,
      data: { ...safeUsage, costMicros: 2 } });
    const withoutSearch: Record<string, unknown> = { ...validUsage };
    Reflect.deleteProperty(withoutSearch, "server_tool_use");
    expect(parseOpenRouterUsage(withoutSearch, true)).toMatchObject({ success: true,
      data: { ...safeUsage, webSearchRequests: 0 } });
    expect(projectProviderResultDiagnostic({ choices: [{ finish_reason: "stop" }], usage: withoutSearch }, true, null))
      .toEqual({ outcome: "accepted", reason: null, finishReasonState: "recognized", finishReason: "stop",
        usageIssueCodes: [], webSearchUsage: missingWebSearchUsage, webSearchUsageDetails: missingWebSearchUsage,
        webSearchUsageSource: "missing" });
  });

  it.each([
    ["choices-invalid", { choices: [] }],
    ["choices-invalid", { choices: [
      { finish_reason: "stop", message: { content: "{}" } },
      { finish_reason: "stop", message: { content: "{}" } },
    ] }],
    ["choices-invalid", { choices: [null] }],
    ["content-invalid", { choices: [{ finish_reason: "stop", message: { content: " " } }] }],
    ["annotations-invalid", { choices: [{ finish_reason: "stop", message: { content: "{}", annotations: {} } }] }],
    ["annotations-invalid", { choices: [{ finish_reason: "stop", message: { content: "{}", annotations: [
      { type: "url_citation", url_citation: { url: "", title: "Private" } },
    ] } }] }],
    ["provider-error", { choices: [{ finish_reason: "error", message: { content: "{}" } }] }],
    ["filtered", { choices: [{ finish_reason: "content_filter", message: { content: "{}" } }] }],
    ["filtered", { choices: [{ finish_reason: "stop", message: { content: "{}", refusal: "private" } }] }],
    ["upstream-error", { error: { code: 429, message: "private" } }],
    ["upstream-error", { choices: [{ error: { code: 503 }, finish_reason: "stop", message: { content: "{}" } }] }],
  ] as const)("observes post-parse rejection reason %s exactly once", async (reason, changes) => {
    const { diagnostics, fetch, provider, result } = await capture(response(changes));
    expect(result).toBeInstanceOf(ResearchProviderError);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ outcome: "rejected", reason });
    expect(fetch).toHaveBeenCalledOnce();
    await expect(provider.repair({ ...request, originalContent: "{}", annotations: [] })).rejects.toMatchObject({ code: "unavailable" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("observes an explicit HTTP error as upstream-error while preserving its existing failure diagnostic path", async () => {
    const { diagnostics, result } = await capture(Response.json({ error: { code: 403, message: "private" } }, { status: 403 }));
    expect(result).toMatchObject({ code: "unavailable", charged: false });
    expect(diagnostics).toEqual([{
      outcome: "rejected", reason: "upstream-error", finishReasonState: "unavailable", finishReason: null,
      usageIssueCodes: ["usage-shape"],
      webSearchUsage: unavailableWebSearchUsage, webSearchUsageDetails: unavailableWebSearchUsage,
      webSearchUsageSource: "invalid",
    }]);
  });

  it("classifies a first non-stop choice before rejecting multiple choices and keeps finish unavailable", async () => {
    const { diagnostics } = await capture(response({ choices: [
      { finish_reason: "length", message: { content: "{}" } },
      { finish_reason: "stop", message: { content: "{}" } },
    ] }));
    expect(diagnostics).toEqual([{
      outcome: "rejected", reason: "finish-not-stop", finishReasonState: "unavailable", finishReason: null,
      usageIssueCodes: [],
      ...legacyWebSearchDiagnostics,
    }]);
  });

  it.each([
    new Response('{"broken":'), Response.json([]),
  ])("does not observe an outer parse failure", async (payload) => {
    const { diagnostics, result } = await capture(payload);
    expect(result).toBeInstanceOf(ResearchProviderError);
    expect(diagnostics).toEqual([]);
  });

  it.each(["sync-throw", "async-reject"] as const)("isolates observer %s on success and failure", async (kind) => {
    const observer = () => {
      if (kind === "sync-throw") throw new Error("observer-private");
      return Promise.reject(new Error("observer-private"));
    };
    const accepted = await capture(response(), observer);
    expect(accepted.result).toMatchObject({ content: "{}", usage: safeUsage, actualModel: "moonshotai/kimi-k3" });
    expect(accepted.diagnostics).toHaveLength(1);
    const rejected = await capture(response({ choices: [] }), observer);
    expect(rejected.result).toBeInstanceOf(ResearchProviderError);
    expect(rejected.diagnostics).toHaveLength(1);
    await new Promise<void>((resolve) => setImmediate(resolve));
  });

  it("emits fresh safe projections without retaining response data or mutable arrays", async () => {
    const canary = "CANARY-private-provider-result";
    const keyLike = "sk-or-v1-private-key-material";
    const privateUrl = "https://private.example.test/source";
    const payload = () => response({ id: keyLike, url: privateUrl, metadata: { raw: canary },
      choices: [{ finish_reason: null, message: { content: canary, metadata: { url: privateUrl } } }],
      usage: { prompt_tokens: keyLike, completion_tokens: 20, total_tokens: 30, cost: privateUrl,
        server_tool_use: { web_search_requests: canary }, raw: canary } });
    const first = await capture(payload());
    for (const forbidden of [canary, keyLike, privateUrl]) expect(JSON.stringify(first.diagnostics)).not.toContain(forbidden);
    expect(first.diagnostics[0]?.usageIssueCodes).toEqual(["cost", "prompt-tokens", "web-search-requests"]);
    expect(first.diagnostics[0]?.webSearchUsage).toEqual({ container: "object", requests: "non-number" });
    first.diagnostics[0]!.usageIssueCodes.push("usage-shape");
    first.diagnostics[0]!.webSearchUsage.requests = "valid";
    first.diagnostics[0]!.webSearchUsageDetails.requests = "valid";
    const second = await capture(payload());
    expect(second.diagnostics[0]).not.toBe(first.diagnostics[0]);
    expect(second.diagnostics[0]!.usageIssueCodes).not.toBe(first.diagnostics[0]!.usageIssueCodes);
    expect(second.diagnostics[0]!.webSearchUsage).not.toBe(first.diagnostics[0]!.webSearchUsage);
    expect(second.diagnostics[0]!.webSearchUsageDetails).not.toBe(first.diagnostics[0]!.webSearchUsageDetails);
    expect(second.diagnostics[0]!.usageIssueCodes).toEqual(["cost", "prompt-tokens", "web-search-requests"]);
    expect(second.diagnostics[0]!.webSearchUsage).toEqual({ container: "object", requests: "non-number" });
    expect(second.diagnostics[0]!.webSearchUsageDetails).toEqual(missingWebSearchUsage);
  });

  it("preserves identical success and failure boundaries with and without the callback", async () => {
    const baselineSuccess = factory()({ key, fetch: async () => response() });
    const observedSuccess = await capture(response());
    expect(observedSuccess.result).toEqual(await baselineSuccess.research(request));
    expect(observedSuccess.diagnostics).toEqual([{
      outcome: "accepted", reason: null, finishReasonState: "recognized", finishReason: "stop", usageIssueCodes: [],
      ...legacyWebSearchDiagnostics,
    }]);

    const badPayload = () => response({ usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.5 },
      error: { code: 503, message: "private" } });
    const baselineFailure = await factory()({ key, fetch: async () => badPayload() }).research(request).catch((value: unknown) => value);
    const observedFailure = await capture(badPayload());
    expect(observedFailure.result).toEqual(baselineFailure);
    expect(observedFailure.result).toMatchObject({ charged: true, usage: null, actualModel: "moonshotai/kimi-k3" });
    expect(observedFailure.diagnostics[0]).toMatchObject({ reason: "upstream-error",
      usageIssueCodes: ["web-search-requests"] });
  });

  it("does not add a result callback hook to the standard provider constructor", async () => {
    const onResultDiagnostic = vi.fn();
    const dependencies = { fetch: vi.fn<typeof globalThis.fetch>(async () => response()), onResultDiagnostic };
    const provider = new openRouterModule.OpenRouterResearchProvider({ OPENROUTER_API_KEY: key,
      ARC_AI_MODEL_RESEARCH: "test/model" }, dependencies);
    expect(await provider.research(request)).toMatchObject({ content: "{}", usage: safeUsage });
    expect(onResultDiagnostic).not.toHaveBeenCalled();
  });

  it("retains the exact local profile request while observing its result", async () => {
    const baselineFetch = vi.fn<typeof globalThis.fetch>(async () => response());
    const observedFetch = vi.fn<typeof globalThis.fetch>(async () => response());
    await factory()({ key, fetch: baselineFetch }).research(request);
    await factory()({ key, fetch: observedFetch, onResultDiagnostic: () => undefined }).research(request);
    expect(observedFetch.mock.calls[0]![0]).toBe(baselineFetch.mock.calls[0]![0]);
    expect({ ...observedFetch.mock.calls[0]![1], signal: undefined })
      .toEqual({ ...baselineFetch.mock.calls[0]![1], signal: undefined });
    expect(observedFetch.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(observedFetch.mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({ model: "moonshotai/kimi-k3", reasoning: { effort: "low" } });
  });
});
