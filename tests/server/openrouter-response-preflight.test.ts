// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import * as openRouterModule from "../../app/server/research/openrouter-provider";
import { ResearchProviderError, type ResearchProvider } from "../../app/server/research/provider";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";

const REQUEST = { role: "Data Product Manager", locale: "en-US" } as const;

type Preflight = {
  version: string;
  stage: string;
  annotations: unknown;
  candidateSchema: unknown;
};

type LocalFactory = (options: {
  key: string;
  fetch: typeof globalThis.fetch;
  onResponsePreflightDiagnostic?: (diagnostic: Preflight) => unknown;
}) => ResearchProvider;

const factory = () => (openRouterModule as unknown as {
  createKimiLocalValidationProvider: LocalFactory;
}).createKimiLocalValidationProvider;

function response(annotations: unknown = [{ type: "url_citation", url_citation: {
  url: "https://example.com/guide", title: "Example",
} }], changes: Record<string, unknown> = {}): Response {
  return Response.json({
    model: "moonshotai/kimi-k3",
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(validResearchCandidate), annotations } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.1,
      server_tool_use_details: { web_search_requests: 2 } },
    ...changes,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OpenRouter local response preflight observation", () => {
  it("observes complete content before preserving the annotation rejection and trusted charge", async () => {
    const applicationFetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error("global fetch must remain blocked");
    });
    vi.stubGlobal("fetch", applicationFetch);
    const injectedFetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
      model: "moonshotai/kimi-k3",
      choices: [{ finish_reason: "stop", message: {
        content: JSON.stringify(validResearchCandidate),
        annotations: [{ type: "url_citation", url_citation: {
          url: "https://example.com/guide", title: null,
        } }],
      } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.1,
        server_tool_use_details: { web_search_requests: 2 } },
    }));
    const callback = vi.fn<(diagnostic: Preflight) => unknown>();
    const provider = factory()({ key: "synthetic-preflight-key", fetch: injectedFetch,
      onResponsePreflightDiagnostic: callback });

    const error: unknown = await provider.research(REQUEST).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ResearchProviderError);
    expect(error).toMatchObject({
      code: "invalid-transport", charged: true, actualModel: "moonshotai/kimi-k3",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, costMicros: 100_000, webSearchRequests: 2 },
    });
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({
      version: "response-preflight-v2",
      stage: "complete-content-preflight",
      annotations: {
        state: "incompatible", container: "array", count: 1, recognizedCount: 1, ignoredCount: 0,
        issues: [{ index: 0, code: "title-null" }], truncated: false,
      },
      candidateSchema: { outcome: "accepted", reason: null, issues: [], truncated: false },
    });
    expect(injectedFetch).toHaveBeenCalledOnce();
    expect(applicationFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["accepted", [{ type: "url_citation", url_citation: { url: "https://example.com/guide", title: "Example" } }]],
    ["rejected", [{ type: "url_citation", url_citation: { url: "https://example.com/guide", title: null } }]],
  ] as const)("keeps %s provider result, audit, charge and byte-for-byte request body identical", async (outcome, annotations) => {
    const bodies: string[] = [];
    const callbacks: Preflight[] = [];
    const resultDiagnostics = [vi.fn(), vi.fn()];
    const makeFetch = () => vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      bodies.push(init?.body as string);
      return response(annotations);
    });
    const unobserved = factory()({ key: "synthetic-preflight-key", fetch: makeFetch(),
      ...({ onResultDiagnostic: resultDiagnostics[0] } as object) });
    const observed = factory()({ key: "synthetic-preflight-key", fetch: makeFetch(),
      onResponsePreflightDiagnostic: (diagnostic) => { callbacks.push(diagnostic); },
      ...({ onResultDiagnostic: resultDiagnostics[1] } as object) });
    const settle = async (provider: ResearchProvider) => provider.research(REQUEST)
      .then((value) => ({ kind: "accepted", value }), (error: ResearchProviderError) => ({ kind: "rejected", error: {
        code: error.code, retryable: error.retryable, charged: error.charged, actualModel: error.actualModel, usage: error.usage,
      } }));

    const [withoutObserver, withObserver] = await Promise.all([settle(unobserved), settle(observed)]);

    expect(withObserver).toEqual(withoutObserver);
    expect(withObserver.kind).toBe(outcome);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(resultDiagnostics[1].mock.calls).toEqual(resultDiagnostics[0].mock.calls);
    expect(callbacks).toHaveLength(1);
  });

  it.each([
    ["throws", () => { throw new Error("observer"); }],
    ["rejects", () => Promise.reject(new Error("observer"))],
    ["never settles", () => new Promise<void>(() => undefined)],
  ] as const)("does not await or expose a callback that %s", async (_name, callback) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response());
    const provider = factory()({ key: "synthetic-preflight-key", fetch, onResponsePreflightDiagnostic: callback });
    await expect(provider.research(REQUEST)).resolves.toMatchObject({
      actualModel: "moonshotai/kimi-k3", usage: { costMicros: 100_000, webSearchRequests: 2 },
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("emits one fresh value per complete research response", async () => {
    const seen: Preflight[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response());
    const provider = factory()({ key: "synthetic-preflight-key", fetch,
      onResponsePreflightDiagnostic: (diagnostic) => { seen.push(diagnostic); } });
    await provider.research(REQUEST);
    await provider.research(REQUEST);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual(seen[1]);
    expect(seen[0]).not.toBe(seen[1]);
    expect(seen[0]?.annotations).not.toBe(seen[1]?.annotations);
    expect(seen[0]?.candidateSchema).not.toBe(seen[1]?.candidateSchema);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["HTTP error", () => Response.json({ error: { code: 500 } }, { status: 500 })],
    ["top-level error", () => response([], { error: { code: 500 } })],
    ["missing choice", () => response([], { choices: [] })],
    ["multiple choices", () => response([], { choices: [
      { finish_reason: "stop", message: { content: "{}", annotations: [] } },
      { finish_reason: "stop", message: { content: "{}", annotations: [] } },
    ] })],
    ["non-stop finish", () => response([], { choices: [{ finish_reason: "length", message: { content: "{}", annotations: [] } }] })],
    ["blank content", () => response([], { choices: [{ finish_reason: "stop", message: { content: " ", annotations: [] } }] })],
    ["oversized content", () => response([], { choices: [{ finish_reason: "stop", message: {
      content: "x".repeat(196_609), annotations: [],
    } }] })],
    ["invalid outer JSON", () => new Response("{")],
    ["invalid outer UTF-8", () => new Response(new Uint8Array([0xff]))],
    ["declared oversized body", () => new Response("", { headers: {
      "Content-Length": String(openRouterModule.OPENROUTER_LIMITS.responseBytes + 1),
    } })],
  ] as const)("does not observe an incomplete %s response", async (_name, makeResponse) => {
    const callback = vi.fn();
    const provider = factory()({ key: "synthetic-preflight-key",
      fetch: vi.fn<typeof globalThis.fetch>(async () => makeResponse()), onResponsePreflightDiagnostic: callback });
    await expect(provider.research(REQUEST)).rejects.toBeInstanceOf(ResearchProviderError);
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not observe a transport failure", async () => {
    const callback = vi.fn();
    const provider = factory()({ key: "synthetic-preflight-key",
      fetch: vi.fn<typeof globalThis.fetch>(async () => { throw new Error("offline transport"); }),
      onResponsePreflightDiagnostic: callback });
    await expect(provider.research(REQUEST)).rejects.toMatchObject({ code: "unavailable" });
    expect(callback).not.toHaveBeenCalled();
  });

  it("keeps the standard research and Repair entrypoints dormant", async () => {
    const callback = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response());
    const provider = new openRouterModule.OpenRouterResearchProvider({
      OPENROUTER_API_KEY: "synthetic-preflight-key", ARC_AI_MODEL_RESEARCH: "test/research-fixed",
      ARC_AI_MODEL_ECONOMY: "test/economy-fixed", researchTimeoutMs: 20_000, repairTimeoutMs: 20_000,
    }, { fetch, ...({ onResponsePreflightDiagnostic: callback } as object) });
    await provider.research(REQUEST);
    await provider.repair({ ...REQUEST, originalContent: JSON.stringify(validResearchCandidate), annotations: validAnnotations });
    expect(callback).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
