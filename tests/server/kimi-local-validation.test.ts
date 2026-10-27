// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { researchCandidateSchema } from "../../app/contracts/research";
import * as openRouterModule from "../../app/server/research/openrouter-provider";
import { RESEARCH_PROVIDER_VERSIONS, ResearchProviderError, type ProviderResearchRequest, type ResearchProvider } from "../../app/server/research/provider";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";

const request = { role: "Data Product Manager", locale: "en-US" } as const;
const key = "synthetic-dummy-credential";

function localFactory(): (options: { key: string; fetch?: typeof globalThis.fetch }) => ResearchProvider {
  const value = (openRouterModule as Record<string, unknown>).createKimiLocalValidationProvider;
  expect(value).toBeTypeOf("function");
  return value as (options: { key: string; fetch?: typeof globalThis.fetch }) => ResearchProvider;
}

function successResponse() {
  return Response.json({
    model: "moonshotai/kimi-k3",
    choices: [{ finish_reason: "stop", message: {
      content: JSON.stringify(validResearchCandidate),
      annotations: validAnnotations.map(({ type, url, title }) => ({ type, url_citation: { url, title } })),
    } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.1, server_tool_use: { web_search_requests: 2 } },
  });
}

async function providerFailure(promise: Promise<unknown>, code: string) {
  const error: unknown = await promise.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(ResearchProviderError);
  expect(error).toMatchObject({ code });
  return error as ResearchProviderError;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock("../../app/server/research/local-validation-profile.json");
  vi.resetModules();
});

describe("fixed Kimi local validation provider", () => {
  it("returns the strict immutable eight-field profile as a fresh projection", () => {
    const getter = (openRouterModule as Record<string, unknown>).getKimiLocalValidationProfile;
    expect(getter).toBeTypeOf("function");
    const first = (getter as () => Record<string, unknown>)();
    const second = (getter as () => Record<string, unknown>)();
    expect(first).toEqual({ profileId: "kimi-low-output32k-v3", model: "moonshotai/kimi-k3", reasoningEffort: "low",
      maxOutputTokens: 32_768, outputPolicyVersion: "kimi-complete-quality-v2",
      researchTimeoutMs: 1_200_000, activeTtlMs: 1_260_000, launcherTimeoutMs: 1_320_000 });
    expect(Object.keys(first)).toHaveLength(8);
    expect(Object.isFrozen(first)).toBe(true);
    expect(second).not.toBe(first);
  });

  it("posts one exact low-reasoning request through the shared contract", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => successResponse());
    const provider = localFactory()({ key, fetch });
    const result = await provider.research(request);
    expect(result.candidate).toEqual(validResearchCandidate);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init).toMatchObject({ method: "POST", redirect: "manual", headers: {
      Authorization: `Bearer ${key}`, "Content-Type": "application/json",
    }, signal: expect.any(AbortSignal) });
    const body = JSON.parse(init!.body as string);
    expect(Object.keys(body).sort()).toEqual(["max_tokens", "max_tool_calls", "messages", "model", "provider", "reasoning", "response_format", "stream", "tools"]);
    expect(body).toMatchObject({
      model: "moonshotai/kimi-k3", reasoning: { effort: "low" }, stream: false, max_tokens: 32_768, max_tool_calls: 10,
      tools: [{ type: "openrouter:web_search", parameters: { engine: "exa", mode: "fast", max_results: 5,
        max_uses: 10, max_total_results: 50, max_characters: 2000 } }],
      provider: { require_parameters: true, data_collection: "deny", zdr: true },
      response_format: { type: "json_schema", json_schema: { name: "arc_research_candidate", strict: true,
        schema: z.toJSONSchema(researchCandidateSchema, { target: "draft-7" }) } },
    });
    expect(JSON.parse(body.messages[1].content)).toEqual({ role: request.role, locale: request.locale, versions: RESEARCH_PROVIDER_VERSIONS });
  });

  it("rejects Repair and a missing injected fetch before transport", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const provider = localFactory()({ key, fetch });
    await providerFailure(provider.repair({ ...request, originalContent: "{}", annotations: [] }), "unavailable");
    expect(fetch).not.toHaveBeenCalled();
    expect(() => localFactory()({ key })).toThrow();
  });

  it("snapshots the key and rejects malformed request input asynchronously", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => successResponse());
    const options = { key, fetch };
    const provider = localFactory()(options);
    options.key = "mutated-after-construction";
    const pending = provider.research({ role: "x" } as unknown as ProviderResearchRequest);
    expect(pending).toBeInstanceOf(Promise);
    await providerFailure(pending, "invalid-transport");
    await provider.research(request);
    expect(fetch.mock.calls[0]![1]!.headers).toMatchObject({ Authorization: `Bearer ${key}` });
  });

  it.each(["headers", "body"] as const)("uses one 1200 second deadline for stalled %s and releases resources", async (phase) => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    let reached!: () => void;
    const reachedPost = new Promise<void>((resolve) => { reached = resolve; });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      reached();
      if (phase === "headers") return new Promise<Response>(() => undefined);
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new TextEncoder().encode('{"model":"moonshotai/kimi-k3",')); }, cancel,
      }), { status: 200 });
    });
    const provider = localFactory()({ key, fetch });
    let settled = false;
    const pending = providerFailure(provider.research(request), "timeout").finally(() => { settled = true; });
    await reachedPost;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(600_000);
    await pending;
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![1]!.signal?.aborted).toBe(true);
    if (phase === "body") expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a response arriving after timeout even when fetch ignores abort", async () => {
    vi.useFakeTimers();
    let resolveResponse!: (response: Response) => void;
    let reached!: () => void;
    const reachedPost = new Promise<void>((resolve) => { reached = resolve; });
    const fetch = vi.fn<typeof globalThis.fetch>(() => {
      reached();
      return new Promise<Response>((resolve) => { resolveResponse = resolve; });
    });
    const provider = localFactory()({ key, fetch });
    const pending = providerFailure(provider.research(request), "timeout");
    await reachedPost;
    await vi.advanceTimersByTimeAsync(1_200_000);
    await pending;
    const cancel = vi.fn();
    resolveResponse(new Response(new ReadableStream<Uint8Array>({ cancel })));
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not await a body cancellation hook that never settles", async () => {
    vi.useFakeTimers();
    let reached!: () => void;
    const reachedPost = new Promise<void>((resolve) => { reached = resolve; });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("{")); },
      cancel() { return new Promise<void>(() => undefined); },
    });
    const provider = localFactory()({ key, fetch: async () => { reached(); return new Response(stream); } });
    const pending = providerFailure(provider.research(request), "timeout");
    await reachedPost;
    await vi.advanceTimersByTimeAsync(1_200_000);
    await pending;
    expect(stream.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("malformed local validation profile", () => {
  it.each([
    ["missing field", { profileId: "kimi-low-output32k-v3", model: "moonshotai/kimi-k3", reasoningEffort: "low",
      maxOutputTokens: 32_768, outputPolicyVersion: "kimi-complete-quality-v2",
      researchTimeoutMs: 1_200_000, activeTtlMs: 1_260_000 }],
    ["extra field", { profileId: "kimi-low-output32k-v3", model: "moonshotai/kimi-k3", reasoningEffort: "low",
      maxOutputTokens: 32_768, outputPolicyVersion: "kimi-complete-quality-v2",
      researchTimeoutMs: 1_200_000, activeTtlMs: 1_260_000, launcherTimeoutMs: 1_320_000, override: true }],
    ["wrong literal", { profileId: "other", model: "moonshotai/kimi-k3", reasoningEffort: "high",
      maxOutputTokens: 32_768, outputPolicyVersion: "kimi-complete-quality-v2",
      researchTimeoutMs: 1_200_000, activeTtlMs: 1_260_000, launcherTimeoutMs: 1_320_000 }],
    ["unknown quality policy", { profileId: "kimi-low-output32k-v3", model: "moonshotai/kimi-k3", reasoningEffort: "low",
      maxOutputTokens: 32_768, outputPolicyVersion: "unknown-policy",
      researchTimeoutMs: 1_200_000, activeTtlMs: 1_260_000, launcherTimeoutMs: 1_320_000 }],
    ["non-integer and wrong order", { profileId: "kimi-low-output32k-v3", model: "moonshotai/kimi-k3", reasoningEffort: "low",
      maxOutputTokens: 32_768.5, outputPolicyVersion: "kimi-complete-quality-v2",
      researchTimeoutMs: 1_200_000.5, activeTtlMs: 1_190_000, launcherTimeoutMs: 1_180_000 }],
  ])("rejects %s before a key GET", async (_label, profile) => {
    vi.resetModules();
    vi.doMock("../../app/server/research/local-validation-profile.json", () => ({ default: profile }));
    const adapter = await import("../../app/server/research/openrouter-provider");
    expect(() => adapter.getKimiLocalValidationProfile()).toThrowError(expect.objectContaining({ code: "unavailable" }));
    const { runValidation } = await import("../../scripts/live-research/validation");
    const fetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("must-not-fetch"); });
    const result = await runValidation({ executeOne: true, key, fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ outcome: "incomplete", reason: "validation-incomplete", realRequestCount: 0,
      researchPolicy: null, researchElapsedMs: null, databaseDisposed: true });
  });
});
