// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { researchCandidateSchema } from "../../app/contracts/research";
import { RESEARCH_PROVIDER_VERSIONS, RESEARCH_SEARCH_POLICY, ResearchProviderError,
  type ProviderRepairRequest } from "../../app/server/research/provider";
import { createKimiLocalValidationProvider, getKimiLocalValidationProfile,
  OpenRouterResearchProvider, type OpenRouterResearchConfig } from "../../app/server/research/openrouter-provider";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";

const REQUEST = { role: "Data Product Manager", locale: "en-US" } as const;
const KEY = "synthetic-dummy-credential";

function successResponse(): Response {
  return Response.json({
    model: "moonshotai/kimi-k3",
    choices: [{
      finish_reason: "stop",
      message: {
        content: JSON.stringify(validResearchCandidate),
        annotations: validAnnotations.map(({ type, url, title }) => ({ type, url_citation: { url, title } })),
      },
    }],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
      cost: 0.1,
      server_tool_use: { web_search_requests: 2 },
    },
  });
}

function capturedRequest(fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>) {
  const [url, init] = fetch.mock.calls[0]!;
  return {
    url,
    method: init?.method,
    redirect: init?.redirect,
    headers: init?.headers,
    body: JSON.parse(init?.body as string) as Record<string, unknown>,
  };
}

function configuredProvider(
  fetch: typeof globalThis.fetch,
  changes: Omit<Partial<OpenRouterResearchConfig>, "researchProfile"> & { researchProfile?: unknown } = {},
) {
  const config = {
    OPENROUTER_API_KEY: KEY,
    ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3",
    ARC_AI_MODEL_ECONOMY: "test/economy-fixed",
    researchTimeoutMs: 1_200_000,
    researchProfile: "kimi-low-output32k-v3",
    ...changes,
  };
  return new OpenRouterResearchProvider(config as OpenRouterResearchConfig, { fetch });
}

async function capturedFailure(promise: Promise<unknown>, code: string, charged: boolean | "unknown") {
  const error = await promise.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(ResearchProviderError);
  expect(error).toMatchObject({ code, charged });
  return error;
}

function captureOutcome(promise: Promise<unknown>) {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

function expectCapturedFailure(
  outcome: Awaited<ReturnType<typeof captureOutcome>>,
  code: string,
  charged: boolean | "unknown",
) {
  expect(outcome.ok).toBe(false);
  if (outcome.ok) throw new Error("expected provider failure");
  expect(outcome.error).toBeInstanceOf(ResearchProviderError);
  expect(outcome.error).toMatchObject({ code, charged });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("production research execution policy", () => {
  it("sends the validated Kimi request with complete local request parity", async () => {
    const newConfig = {
      OPENROUTER_API_KEY: KEY,
      ARC_AI_MODEL_RESEARCH: "moonshotai/kimi-k3",
      ARC_AI_MODEL_ECONOMY: "test/economy-fixed",
      researchTimeoutMs: 1_200_000,
      researchProfile: "kimi-low-output32k-v3",
    };
    const productionFetch = vi.fn<typeof globalThis.fetch>(async () => successResponse());
    const localFetch = vi.fn<typeof globalThis.fetch>(async () => successResponse());
    const production = new OpenRouterResearchProvider(newConfig, { fetch: productionFetch });
    const local = createKimiLocalValidationProvider({ key: KEY, fetch: localFetch });

    await production.research(REQUEST);
    await local.research(REQUEST);

    const productionRequest = capturedRequest(productionFetch);
    const localRequest = capturedRequest(localFetch);
    expect(productionRequest).toEqual(localRequest);
    expect(productionFetch.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal);
    expect(localFetch.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal);
    expect(productionFetch.mock.calls[0]![1]!.signal).not.toBe(localFetch.mock.calls[0]![1]!.signal);

    expect(productionRequest.body).toMatchObject({
      model: "moonshotai/kimi-k3",
      stream: false,
      max_tokens: 32_768,
      reasoning: { effort: "low" },
      provider: { require_parameters: true, data_collection: "deny", zdr: true },
      max_tool_calls: 10,
      tools: [{ type: "openrouter:web_search", parameters: {
        engine: "exa",
        mode: "fast",
        max_results: 5,
        max_uses: 10,
        max_total_results: 50,
        max_characters: 2_000,
      } }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "arc_research_candidate",
          strict: true,
          schema: z.toJSONSchema(researchCandidateSchema, { target: "draft-7" }),
        },
      },
    });
    expect(productionRequest.body.tools).toEqual([{
      type: "openrouter:web_search",
      parameters: {
        engine: RESEARCH_SEARCH_POLICY.engine,
        mode: RESEARCH_SEARCH_POLICY.mode,
        max_results: RESEARCH_SEARCH_POLICY.maxResults,
        max_uses: RESEARCH_SEARCH_POLICY.maxUses,
        max_total_results: RESEARCH_SEARCH_POLICY.maxTotalResults,
        max_characters: RESEARCH_SEARCH_POLICY.maxCharacters,
      },
    }]);
    const messages = productionRequest.body.messages as Array<{ role: string; content: string }>;
    expect(messages.map(({ role }) => role)).toEqual(["system", "user"]);
    expect(JSON.parse(messages[1]!.content)).toEqual({ ...REQUEST, versions: RESEARCH_PROVIDER_VERSIONS });
    expect(messages[0]!.content).toContain("Apply kimi-complete-quality-v2.");
    expect(messages[0]!.content).toContain("Draft all seven sections: role, skills, prerequisiteEdges, resources, stages, unitTemplates, and evidence.");
    expect(messages[0]!.content).not.toContain("calibrate and reinforce are atomic with no checkpoints");
  });

  it("retains the legacy request when the selector is absent", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => successResponse());
    const provider = new OpenRouterResearchProvider({
      OPENROUTER_API_KEY: KEY,
      ARC_AI_MODEL_RESEARCH: "test/research-fixed",
      ARC_AI_MODEL_ECONOMY: "test/economy-fixed",
      researchTimeoutMs: 120_000,
    }, { fetch });

    await provider.research(REQUEST);

    const body = capturedRequest(fetch).body;
    expect(body).toMatchObject({ model: "test/research-fixed", max_tokens: 12_000 });
    expect(body).not.toHaveProperty("reasoning");
    expect((body.messages as Array<{ content: string }>)[0]!.content)
      .toContain("calibrate and reinforce are atomic with no checkpoints");
  });

  it.each([
    ["unknown", "unknown-profile"],
    ["blank", ""],
    ["whitespace", " "],
    ["null", null],
    ["number", 3],
    ["object", { profileId: "kimi-low-output32k-v3" }],
  ])("rejects an invalid %s selector before fetch", async (_name, researchProfile) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => successResponse());
    const provider = configuredProvider(fetch, { researchProfile });

    await capturedFailure(provider.research(REQUEST), "unavailable", false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong model", { ARC_AI_MODEL_RESEARCH: "test/research-fixed" }],
    ["missing model", { ARC_AI_MODEL_RESEARCH: undefined }],
    ["missing timeout", { researchTimeoutMs: undefined }],
    ["short timeout", { researchTimeoutMs: 1_199_999 }],
    ["long timeout", { researchTimeoutMs: 1_200_001 }],
  ])("rejects the selected profile with %s before fetch", async (_name, changes) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => successResponse());
    const provider = configuredProvider(fetch, changes);

    await capturedFailure(provider.research(REQUEST), "unavailable", false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { ...REQUEST, originalContent: "{}", annotations: [] },
    { role: "x" },
  ])("refuses direct repair for the selected profile before parsing or fetch", async (repairRequest) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => successResponse());
    const provider = configuredProvider(fetch);

    await capturedFailure(provider.repair(repairRequest as ProviderRepairRequest), "unavailable", false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the local launch-only field outside the shared seven-field execution policy", async () => {
    const executionPolicyModule = await import("../../app/server/research/execution-policy");
    const executionPolicy = executionPolicyModule.KIMI_RESEARCH_EXECUTION_POLICY;
    const localProfile = getKimiLocalValidationProfile();
    const { launcherTimeoutMs: _launcherTimeoutMs, ...localExecutionFields } = localProfile;

    expect(_launcherTimeoutMs).toBe(1_320_000);
    expect(Object.keys(executionPolicy)).toHaveLength(7);
    expect(executionPolicy).toEqual(localExecutionFields);
    expect(executionPolicy).not.toHaveProperty("launcherTimeoutMs");
    expect(Object.isFrozen(executionPolicy)).toBe(true);
    expect(executionPolicyModule.resolveResearchExecutionPolicy(undefined)).toBeUndefined();
    expect(executionPolicyModule.resolveResearchExecutionPolicy("kimi-low-output32k-v3")).toBe(executionPolicy);
    expect(executionPolicyModule.resolveResearchExecutionPolicy("")).toBeNull();
    expect(executionPolicyModule.resolveResearchExecutionPolicy("unknown-profile")).toBeNull();
    expect(executionPolicyModule.resolveResearchExecutionPolicy(3)).toBeNull();
  });

  it("uses one 1200000ms deadline while response headers are stalled", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>(() => undefined));
    const provider = configuredProvider(fetch);
    const pending = captureOutcome(provider.research(REQUEST));

    await vi.advanceTimersByTimeAsync(1_200_000);
    expectCapturedFailure(await pending, "timeout", "unknown");

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![1]!.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses one 1200000ms deadline while the body is stalled and releases its reader", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"model":"moonshotai/kimi-k3",'));
    }, cancel });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(stream));
    const provider = configuredProvider(fetch);
    const pending = captureOutcome(provider.research(REQUEST));

    await vi.advanceTimersByTimeAsync(1_200_000);
    expectCapturedFailure(await pending, "timeout", "unknown");

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![1]!.signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves only 1000ms of body budget after headers arrive at 1199000ms", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>((resolve) => {
      setTimeout(() => resolve(new Response(stream)), 1_199_000);
    }));
    const provider = configuredProvider(fetch);
    let settled = false;
    const pending = captureOutcome(provider.research(REQUEST))
      .finally(() => { settled = true; });

    await vi.advanceTimersByTimeAsync(1_199_000);
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expectCapturedFailure(await pending, "timeout", "unknown");

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![1]!.signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts a fully buffered response at 1199999ms and clears the deadline", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>((resolve) => {
      setTimeout(() => resolve(successResponse()), 1_199_999);
    }));
    const provider = configuredProvider(fetch);
    const pending = captureOutcome(provider.research(REQUEST));

    await vi.advanceTimersByTimeAsync(1_199_999);
    const outcome = await pending;
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw outcome.error;
    expect((outcome.value as Awaited<ReturnType<typeof provider.research>>).candidate).toEqual(validResearchCandidate);

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![1]!.signal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels headers that arrive after the deadline without retaining resources", async () => {
    vi.useFakeTimers();
    let resolveHeaders!: (response: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>((resolve) => { resolveHeaders = resolve; }));
    const provider = configuredProvider(fetch);
    const pending = captureOutcome(provider.research(REQUEST));

    await vi.advanceTimersByTimeAsync(1_200_000);
    expectCapturedFailure(await pending, "timeout", "unknown");
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    resolveHeaders(new Response(stream));
    await Promise.resolve();
    await Promise.resolve();

    expect(fetch).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores a body pull that settles after the deadline and retains no reader or timer", async () => {
    vi.useFakeTimers();
    let settlePull!: () => void;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull() { return new Promise<void>((resolve) => { settlePull = resolve; }); },
      cancel,
    });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(stream));
    const provider = configuredProvider(fetch);
    const pending = captureOutcome(provider.research(REQUEST));

    await vi.advanceTimersByTimeAsync(1_200_000);
    expectCapturedFailure(await pending, "timeout", "unknown");
    settlePull();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![1]!.signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
