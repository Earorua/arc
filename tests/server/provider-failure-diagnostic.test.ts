// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterResearchProvider } from "../../app/server/research/openrouter-provider";
import { ResearchProviderError } from "../../app/server/research/provider";
import * as failureDiagnostics from "../../app/server/research/provider-failure-diagnostic";
import { type ProviderFailureDiagnostic } from "../../app/server/research/provider-failure-diagnostic";
import { fixtureResponse, runValidation } from "../../scripts/live-research/validation";

const request = { role: "Data Product Manager", locale: "en-US" } as const;
const config = { OPENROUTER_API_KEY: "synthetic-diagnostic-key", ARC_AI_MODEL_RESEARCH: "test/research-fixed" };
const canary = "CANARY-private-provider-evidence";
const permissionDiagnostic: ProviderFailureDiagnostic = {
  httpStatus: 403, location: "http-error", errorCode: 403, errorCodeState: "recognized",
  errorType: "permission_denied", errorTypeState: "recognized",
};
const permissionError = { code: 403, message: canary, metadata: { error_type: "permission_denied", raw: canary } };
const usage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.000002, server_tool_use: { web_search_requests: 2 } };
const safeUsage = { promptTokens: 10, completionTokens: 20, totalTokens: 30, costMicros: 2, webSearchRequests: 2 };
const keyFixture = { data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0, is_management_key: false, byok_usage: 0 } };
const keyUrl = "https://openrouter.ai/api/v1/key";
const researchUrl = "https://openrouter.ai/api/v1/chat/completions";

function harness(response: Response, onFailureDiagnostic = vi.fn<(diagnostic: ProviderFailureDiagnostic) => void>()) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => response);
  return { fetch, onFailureDiagnostic, provider: new OpenRouterResearchProvider(config, { fetch, onFailureDiagnostic }) };
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("OpenRouter failure diagnostic boundary", () => {
  it("reports only fixed diagnostic fields for a parsed HTTP 403 permission error", async () => {
    const onFailureDiagnostic = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
      id: canary, request_id: canary, error: { code: 403, message: canary,
        metadata: { error_type: "permission_denied", provider_code: canary, raw: canary, flagged_input: canary, reasons: [canary] } },
    }, { status: 403, headers: { "x-request-id": canary } }));
    const dependencies = { fetch, onFailureDiagnostic };
    const provider = new OpenRouterResearchProvider(config, dependencies);
    const error = await provider.research(request).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ResearchProviderError);
    expect(error).toMatchObject({ code: "unavailable", retryable: false, charged: false, actualModel: null, usage: null });
    expect(onFailureDiagnostic).toHaveBeenCalledOnce();
    expect(onFailureDiagnostic.mock.calls[0]).toEqual([{
      httpStatus: 403, location: "http-error", errorCode: 403, errorCodeState: "recognized",
      errorType: "permission_denied", errorTypeState: "recognized",
    }]);
    expect(JSON.stringify([error, onFailureDiagnostic.mock.calls])).not.toContain(canary);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(["top-level-error", "choice-error"] as const)("observes HTTP 200 %s without changing audited failure handling", async (location) => {
    const payload = { model: "test/actual", usage,
      ...(location === "top-level-error" ? { error: permissionError } : { choices: [{ error: permissionError }] }) };
    const { provider, fetch, onFailureDiagnostic } = harness(Response.json(payload));
    const error = await provider.research(request).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ResearchProviderError);
    expect(error).toMatchObject({ code: "unavailable", retryable: false, charged: true, actualModel: "test/actual", usage: safeUsage });
    expect(onFailureDiagnostic.mock.calls).toEqual([[{ ...permissionDiagnostic, httpStatus: 200, location }]]);
    expect(JSON.stringify([error, onFailureDiagnostic.mock.calls])).not.toContain(canary);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("retains contradictory HTTP and payload codes without remapping the failure", async () => {
    const { provider, onFailureDiagnostic } = harness(Response.json({ error: { code: 429, metadata: { error_type: "rate_limit_exceeded" } } }, { status: 403 }));
    const error = await provider.research(request).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "unavailable", retryable: false, charged: false });
    expect(onFailureDiagnostic.mock.calls).toEqual([[{ ...permissionDiagnostic, errorCode: 429, errorType: "rate_limit_exceeded" }]]);
  });

  it("does not observe a successful parsed response or change its result", async () => {
    const baseline = await harness(fixtureResponse()).provider.research(request);
    const { provider, onFailureDiagnostic } = harness(fixtureResponse());
    expect(await provider.research(request)).toEqual(baseline);
    expect(onFailureDiagnostic).not.toHaveBeenCalled();
  });

  it.each(["malformed-json", "incomplete-body", "non-record-outer", "finish-error"] as const)("does not observe %s outside parsed error paths", async (kind) => {
    const response = kind === "malformed-json" ? new Response('{"error":', { status: 403 })
      : kind === "incomplete-body" ? new Response(new ReadableStream({ start(controller) { controller.error(new Error(canary)); } }), { status: 403 })
      : kind === "non-record-outer" ? Response.json([], { status: 403 })
      : Response.json({ choices: [{ finish_reason: "error" }] });
    const { provider, onFailureDiagnostic } = harness(response);
    const error = await provider.research(request).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ResearchProviderError);
    expect(onFailureDiagnostic).not.toHaveBeenCalled();
    expect(JSON.stringify(error)).not.toContain(canary);
  });

  it("does not observe an incomplete body when the existing deadline cancels it", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const onFailureDiagnostic = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"error":{"code":403')); }, cancel,
    }), { status: 403 });
    const provider = new OpenRouterResearchProvider({ ...config, researchTimeoutMs: 10 }, {
      fetch: async () => response, onFailureDiagnostic,
    });
    const pending = provider.research(request).catch((value: unknown) => value);
    await vi.advanceTimersByTimeAsync(10);
    expect(await pending).toMatchObject({ code: "timeout", retryable: true, charged: "unknown" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(onFailureDiagnostic).not.toHaveBeenCalled();
  });

  it.each(["throw", "rejected-promise", "rejected-thenable", "never-resolves", "mutation"] as const)("isolates observer %s from the original error and billing evidence", async (kind) => {
    const snapshots: ProviderFailureDiagnostic[] = [];
    const onFailureDiagnostic = vi.fn<(diagnostic: ProviderFailureDiagnostic) => void>((diagnostic) => {
      snapshots.push({ ...diagnostic });
      if (kind === "throw") throw new Error(canary);
      if (kind === "rejected-promise") return Promise.reject(new Error(canary));
      if (kind === "rejected-thenable") return { then(_resolve: unknown, reject: (error: Error) => void) { reject(new Error(canary)); } };
      if (kind === "never-resolves") return new Promise<void>(() => {});
      diagnostic.httpStatus = 200; diagnostic.errorCode = 200; diagnostic.errorType = "unmapped";
      Object.assign(diagnostic, { usage: null, actualModel: canary, charged: false, raw: canary });
    });
    const { provider, fetch } = harness(Response.json({ error: permissionError, model: "test/actual", usage }, { status: 403 }), onFailureDiagnostic);
    const error = await provider.research(request).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ResearchProviderError);
    expect(error).toMatchObject({ code: "unavailable", retryable: false, charged: true, actualModel: "test/actual", usage: safeUsage });
    expect(snapshots).toEqual([permissionDiagnostic]);
    expect(JSON.stringify(error)).not.toContain(canary);
    expect(fetch).toHaveBeenCalledOnce();
    // Give rejected promises and assimilated thenables a turn to expose unhandled rejections.
    await new Promise<void>((resolve) => setImmediate(resolve));
  });

  it("hands each observer invocation a fresh flat object", async () => {
    const observations: ProviderFailureDiagnostic[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ error: permissionError }, { status: 403 }));
    const provider = new OpenRouterResearchProvider(config, { fetch, onFailureDiagnostic: (diagnostic) => { observations.push(diagnostic); } });
    await provider.research(request).catch(() => undefined);
    observations[0]!.errorCode = 200;
    await provider.research(request).catch(() => undefined);
    expect(observations).toHaveLength(2);
    expect(observations[1]).not.toBe(observations[0]);
    expect(observations[1]).toEqual(permissionDiagnostic);
    expect(Object.values(observations[1]!).every((value) => value === null || typeof value !== "object")).toBe(true);
  });
});

describe("pure provider failure classification", () => {
  const errorTypes = [
    "context_length_exceeded", "max_tokens_exceeded", "token_limit_exceeded", "string_too_long", "authentication",
    "permission_denied", "payment_required", "rate_limit_exceeded", "provider_overloaded", "provider_unavailable",
    "invalid_request", "invalid_prompt", "not_found", "precondition_failed", "payload_too_large", "unprocessable",
    "content_policy_violation", "refusal", "invalid_image", "image_too_large", "image_too_small", "unsupported_image_format",
    "image_not_found", "image_download_failed", "server", "timeout", "unmapped",
  ];
  const extract = (error: unknown, status: unknown = 403) => failureDiagnostics.extractProviderFailureDiagnostic(status, "http-error", error);

  it.each(errorTypes)("recognizes only the exact documented error type %s", (errorType) => {
    expect(extract({ code: 403, metadata: { error_type: errorType } })).toEqual({ ...permissionDiagnostic, errorType });
  });

  it.each([100, 200, 403, 599])("preserves valid numeric error code %s independently of HTTP status", (errorCode) => {
    expect(extract({ code: errorCode })).toEqual({ ...permissionDiagnostic, errorCode, errorType: null, errorTypeState: "missing" });
  });

  it.each([undefined, null])("marks absent/null code %s missing", (code) => {
    expect(extract({ code })).toMatchObject({ errorCode: null, errorCodeState: "missing" });
  });

  it.each([99, 600, 403.5, -1, NaN, Infinity, -Infinity, "403", true, {}, []].map((code) => [code]))("rejects malformed error code %j", (code) => {
    expect(extract({ code })).toMatchObject({ errorCode: null, errorCodeState: "invalid" });
  });

  it.each([undefined, null])("marks absent/null metadata error type %s missing", (error_type) => {
    expect(extract({ metadata: { error_type } })).toMatchObject({ errorType: null, errorTypeState: "missing" });
  });

  it.each([403, true, {}, [], NaN].map((type) => [type]))("rejects non-string metadata error type %j", (error_type) => {
    expect(extract({ metadata: { error_type } })).toMatchObject({ errorType: null, errorTypeState: "invalid" });
  });

  it.each(["", canary, "PERMISSION_DENIED", " permission_denied", "permission_denied ", "permission_denied:" + canary, "toString", "__proto__"])("does not disclose or normalize unknown type %s", (error_type) => {
    const result = extract({ metadata: { error_type } });
    expect(result).toMatchObject({ errorType: null, errorTypeState: "unrecognized" });
    expect(JSON.stringify(result)).not.toContain(canary);
  });

  it.each([undefined, null])("classifies missing error container %s without status inference", (error) => {
    expect(extract(error)).toEqual({ ...permissionDiagnostic, errorCode: null, errorCodeState: "missing", errorType: null, errorTypeState: "missing" });
  });

  it.each([canary, 403, true, [], [{ code: 403, metadata: { error_type: "permission_denied" } }]].map((error) => [error]))("classifies malformed error container %j as invalid", (error) => {
    expect(extract(error)).toEqual({ ...permissionDiagnostic, errorCode: null, errorCodeState: "invalid", errorType: null, errorTypeState: "invalid" });
  });

  it.each([undefined, null])("classifies missing metadata container %s without other-field inference", (metadata) => {
    expect(extract({ code: 403, type: "permission_denied", message: "permission_denied", metadata })).toEqual({ ...permissionDiagnostic, errorType: null, errorTypeState: "missing" });
  });

  it.each([canary, 403, true, [], [{ error_type: "permission_denied" }]].map((metadata) => [metadata]))("classifies malformed metadata container %j as invalid", (metadata) => {
    expect(extract({ code: 403, metadata })).toEqual({ ...permissionDiagnostic, errorType: null, errorTypeState: "invalid" });
  });

  it.each([undefined, null, "403", NaN, Infinity, 99, 600, 403.5, {}, []].map((status) => [status]))("drops invalid HTTP status %j without coercion", (status) => {
    expect(failureDiagnostics.extractProviderFailureDiagnostic(status, "choice-error", permissionError)).toEqual({ ...permissionDiagnostic, httpStatus: null, location: "choice-error" });
  });

  it.each([100, 200, 599])("retains valid HTTP status %s", (httpStatus) => {
    expect(extract(permissionError, httpStatus)).toEqual({ ...permissionDiagnostic, httpStatus });
  });

  it("returns only new primitive fields and never retains source metadata", () => {
    const source = { ...permissionError, metadata: { ...permissionError.metadata, provider_code: canary, provider_name: canary, model: canary,
      request_id: canary, generation_id: canary, flagged_input: canary, reasons: [canary], prompt: canary, identity: canary } };
    const result = extract(source);
    source.code = 429; source.metadata.error_type = "timeout";
    expect(result).toEqual(permissionDiagnostic);
    result.errorCode = 200;
    expect(source.code).toBe(429);
    expect(JSON.stringify(result)).not.toContain(canary);
  });

  it("has no imports or implicit side-effect channels", () => {
    const source = readFileSync("app/server/research/provider-failure-diagnostic.ts", "utf8");
    expect(source).not.toMatch(/^\s*import\s|import\(|process\.|globalThis\.|fetch\(|console\.|localStorage|sessionStorage/mu);
  });
});

describe("local validation failure diagnostic summary", () => {
  it("retains one synthetic GET and one failed POST with an independent safe diagnostic snapshot", async () => {
    const extracted: ProviderFailureDiagnostic[] = [];
    const originalExtract = failureDiagnostics.extractProviderFailureDiagnostic;
    vi.spyOn(failureDiagnostics, "extractProviderFailureDiagnostic").mockImplementation((...args) => {
      const result = originalExtract(...args); extracted.push(result); return result;
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      if (url === keyUrl) { expect(init?.method).toBe("GET"); return Response.json(keyFixture); }
      expect(url).toBe(researchUrl); expect(init?.method).toBe("POST");
      return Response.json({ error: permissionError, id: canary }, { status: 403, headers: { "x-request-id": canary } });
    });
    const summary = await runValidation({ executeOne: true, key: config.OPENROUTER_API_KEY, fetch });
    expect(summary).toMatchObject({ mode: "live-one", outcome: "incomplete", reason: "research-failed", runState: "failed",
      realRequestCount: 2, researchRequestCount: 1, repairRequestCount: 0, keyHttpStatus: 200, researchHttpStatus: 403,
      auditCount: 1, databaseDisposed: true, planningGenerated: false, researchFailureDiagnostic: permissionDiagnostic });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(extracted).toHaveLength(1);
    expect(summary.researchFailureDiagnostic).not.toBe(extracted[0]);
    extracted[0]!.errorCode = 200;
    Object.assign(extracted[0]!, { raw: canary });
    expect(summary.researchFailureDiagnostic).toEqual(permissionDiagnostic);
    expect(JSON.stringify(summary)).not.toMatch(/CANARY|synthetic-diagnostic-key/u);
  });

  it.each(["offline", "key-only", "success"] as const)("leaves diagnostic null for %s", async (mode) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => url === keyUrl ? Response.json(keyFixture) : fixtureResponse());
    const summary = await runValidation({ ...(mode === "key-only" ? { checkKeyOnly: true } : mode === "success" ? { executeOne: true } : {}),
      key: config.OPENROUTER_API_KEY, fetch });
    expect(summary).toMatchObject({ outcome: "passed", researchFailureDiagnostic: null, databaseDisposed: true });
    expect(fetch).toHaveBeenCalledTimes(mode === "offline" ? 0 : mode === "key-only" ? 1 : 2);
  });
});
