// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentAnalysisConfiguration } from "../../app/server/documents/policy";
import { HttpDocumentAnalysisProvider, type DocumentFetch, type DocumentProviderQualification } from "../../worker/document-executor/provider-http";

const config: DocumentAnalysisConfiguration = {
  provider: "Gateway / Synthetic", model: "model/version", apiKey: "offline-fixture-key",
  endpoint: "https://gateway.invalid/api/v1/chat/completions", providerPolicyId: "private-policy",
  routingPolicy: { policyVersion: "2026.11.1", providerOrder: ["synthetic/zone-a"], allowFallback: false, dataPolicy: "zdr-only" },
  priceVersion: "2026.11.1", userDailyMicroUsd: 500_000, globalDailyMicroUsd: 500_000, maxJobMicroUsd: 15_000,
  maxInputTokens: 16_000, maxOutputTokens: 4096, httpTimeoutMs: 180_000,
};
const qualification = {
  qualified: true, endpoint: config.endpoint, model: config.model, providerPolicyId: config.providerPolicyId,
  priceVersion: config.priceVersion, routingPolicy: config.routingPolicy, inputMicroUsdPerMillionTokens: 440_000,
  outputMicroUsdPerMillionTokens: 1_760_000, inputTokenBound: "utf8-bytes-plus-4096",
  receiptRoute: { providerName: "Synthetic", endpointId: "endpoint-zone-a" },
} as const satisfies DocumentProviderQualification;
const input = { textVersionId: "text-one", text: "private-source", segments: [{ id: "s", start: 0, end: 14 }],
  kind: "jd" as const, providerPolicyId: config.providerPolicyId, outputSchemaVersion: "2026.11.1" as const };
const candidate = { schemaVersion: "2026.11.1", items: [], reviewPoints: [] };
const completion = { id: "gen-test-one", model: config.model, usage: { cost: 0.0000073, prompt_tokens: 100, completion_tokens: 20 },
  choices: [{ message: { content: JSON.stringify(candidate) } }] };
const generation = { id: completion.id, model: config.model, provider_name: "Synthetic", native_tokens_prompt: 100,
  native_tokens_completion: 20, total_cost: 0.0000073, provider_responses: [{ status: 200, endpoint_id: "endpoint-zone-a" }] };
function adapter(read: () => Response | Promise<Response>, reply: object = completion) {
  const fetch = vi.fn<DocumentFetch>(async (_, init) => init?.method === "POST" ? Response.json(reply) : read());
  const provider = new HttpDocumentAnalysisProvider(config, { qualification, fetch });
  return { fetch, analyze: () => provider.analyze(input, new AbortController().signal) };
}
afterEach(() => vi.useRealTimers());

describe("per-generation document receipt audit", () => {
  const kimiModel = "moonshotai/kimi-k3.1-pro";
  const kimiRoute = "moonshotai/mxfp4";
  const defaultParameters = { max_completion_tokens: config.maxOutputTokens, temperature: 0 };
  it.each([
    { model: kimiModel, route: kimiRoute, parameters: { max_tokens: config.maxOutputTokens } },
    { model: kimiModel, route: "synthetic/zone-a", parameters: defaultParameters },
    { model: config.model, route: kimiRoute, parameters: defaultParameters },
  ])("sends the qualified token and sampling parameters for $model on $route", async ({ model, route, parameters }) => {
    const routingPolicy = { ...config.routingPolicy, providerOrder: [route] };
    const configForRoute = { ...config, model, routingPolicy, maxJobMicroUsd: 75_000 };
    const qualificationForRoute = {
      ...qualification, model, routingPolicy, inputMicroUsdPerMillionTokens: 2_000_000, outputMicroUsdPerMillionTokens: 10_000_000,
    };
    const fetch = vi.fn<DocumentFetch>(async (_, init) => init?.method === "POST"
      ? Response.json({ ...completion, model })
      : Response.json({ data: { ...generation, model } }));
    const provider = new HttpDocumentAnalysisProvider(configForRoute, { qualification: qualificationForRoute, fetch });

    const outcome = await provider.analyze(input, new AbortController().signal);
    expect(outcome).toMatchObject({ kind: "received", candidate, audit: { status: "verified" } });
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET"]);
    const body = JSON.parse(String(fetch.mock.calls[0]![1]!.body));
    expect({ max_tokens: body.max_tokens, max_completion_tokens: body.max_completion_tokens, temperature: body.temperature }).toEqual(parameters);
    expect(body).toMatchObject({
      model, stream: false, response_format: { type: "json_object" },
      provider: { only: [route], order: [route], allow_fallbacks: false, require_parameters: true,
        data_collection: "deny", zdr: true, max_price: { prompt: 2, completion: 10, request: 0 } },
    });
  });
  it("applies reviewed per-million prices, requires supported parameters and performs a bounded same-origin read by ID", async () => {
    const { fetch, analyze } = adapter(() => Response.json({ data: generation }));
    const outcome = await analyze();
    const [post, get] = fetch.mock.calls;
    expect(JSON.parse(String(post![1]!.body))).toMatchObject({
      max_completion_tokens: 4096, provider: { order: ["synthetic/zone-a"], only: ["synthetic/zone-a"],
        allow_fallbacks: false, require_parameters: true, data_collection: "deny", zdr: true,
        max_price: { prompt: 0.44, completion: 1.76, request: 0 } },
    });
    expect(JSON.parse(String(post![1]!.body))).not.toHaveProperty("max_tokens");
    expect(String(get![0])).toBe("https://gateway.invalid/api/v1/generation?id=gen-test-one");
    expect(get![1]).toMatchObject({ method: "GET", redirect: "manual", headers: { authorization: "Bearer offline-fixture-key" } });
    expect(get![1]).not.toHaveProperty("body");
    expect(outcome).toMatchObject({ kind: "received", candidate, receiptId: completion.id, actualMicroUsd: 7,
      audit: { status: "verified", actualProvider: "Synthetic", actualModel: config.model, actualEndpointId: "endpoint-zone-a",
        metadataAttempts: 1, metadataMicroUsd: 7, metadataInputTokens: 100, metadataOutputTokens: 20,
        sentAt: expect.any(String), returnedAt: expect.any(String), checkedAt: expect.any(String) } });
  });
  it.each([
    ["route-mismatch", { provider_name: "Other" }],
    ["route-mismatch", { provider_responses: [{ status: 200, endpoint_id: "endpoint-zone-b" }] }],
    ["route-unverified", { provider_responses: [] }],
    ["route-unverified", { provider_responses: [{ status: 503, endpoint_id: "endpoint-b" }, ...generation.provider_responses] }],
    ["model-mismatch", { model: "unknown-model" }],
    ["id-mismatch", { id: "some-other-generation" }],
    ["usage-mismatch", { native_tokens_prompt: 101 }],
    ["usage-mismatch", { native_tokens_completion: null }],
    ["usage-mismatch", { total_cost: 0.000010 }],
  ] as const)("quarantines the candidate on %s, separately preserving a known billed amount", async (status, changes) => {
    const { fetch, analyze } = adapter(() => Response.json({ data: { ...generation, ...changes } }));
    expect(await analyze()).toMatchObject({ kind: "received", candidate: null, actualMicroUsd: 7, audit: { status } });
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("uses matching generation cost when the chat response omitted cost; leaves incomplete usage unverified", async () => {
    const { analyze } = adapter(() => Response.json({ data: generation }), { ...completion, usage: { prompt_tokens: 100, completion_tokens: 20 } });
    expect(await analyze()).toMatchObject({ kind: "received", candidate: null, actualMicroUsd: 7, audit: { status: "usage-mismatch" } });
  });
  it("checks optional chat upstream evidence against the exact approved provider", async () => {
    const { analyze } = adapter(() => Response.json({ data: generation }), { ...completion, provider: "A different provider" });
    expect(await analyze()).toMatchObject({ kind: "received", candidate: null, actualMicroUsd: 7, audit: { status: "route-mismatch" } });
  });
  it("records bounded provider-reported timing when present and omits unrelated response fields", async () => {
    const { analyze } = adapter(() => Response.json({ data: { ...generation, latency: 101, generation_time: 1200, account_notes: input.text } }));
    const outcome = await analyze();
    expect(outcome).toMatchObject({ audit: { providerLatencyMs: 101, providerGenerationMs: 1200 } });
    expect(JSON.stringify(outcome)).not.toContain(input.text);
  });
  it("checks the actual token charge against the reviewed cap even if the full reservation covers it", async () => {
    const { analyze } = adapter(() => Response.json({ data: { ...generation, total_cost: 0.001 } }),
      { ...completion, usage: { ...completion.usage, cost: 0.001 } });
    expect(await analyze()).toMatchObject({ candidate: null, actualMicroUsd: 1000, audit: { status: "price-bound-exceeded" } });
  });
  it("retains known cost independently of the exact chat model and never echoes unknown metadata into evidence", async () => {
    const { analyze } = adapter(() => Response.json({ data: { ...generation, provider_name: config.apiKey, account: input.text } }),
      { ...completion, model: "wrong-chat-model" });
    const outcome = await analyze();
    expect(outcome).toMatchObject({ kind: "received", candidate: null, actualMicroUsd: 7, audit: { status: "model-mismatch" } });
    expect(JSON.stringify(outcome)).not.toContain(config.apiKey);
    expect(JSON.stringify(outcome)).not.toContain(input.text);
  });
  it("uses no redirect location or metadata-supplied address", async () => {
    const { fetch, analyze } = adapter(() => Response.redirect("https://other.invalid/steal", 307));
    expect(await analyze()).toMatchObject({ kind: "received", actualMicroUsd: 7, candidate: null, audit: { status: "metadata-unavailable" } });
    expect(fetch.mock.calls.map(([url]) => new URL(String(url)).origin)).toEqual(["https://gateway.invalid", "https://gateway.invalid"]);
  });
  it("never uses a credential or private input echoed in the ID as a metadata URL or journal receipt", async () => {
    for (const id of ["gen-" + config.apiKey, input.text, "gen-private-sou-fixture"]) {
      const { analyze, fetch } = adapter(() => Response.json({ data: generation }), { ...completion, id });
      const outcome = await analyze();
      expect(fetch.mock.calls.length).toBe(1);
      expect(outcome).toMatchObject({ kind: "received", actualMicroUsd: null, receiptId: null, candidate: null, audit: { status: "receipt-missing" } });
    }
  });
  it("rejects a result delivered after the wall-clock deadline even if the event loop has not dispatched its timer", async () => {
    vi.useFakeTimers();
    const { analyze } = adapter(() => { vi.setSystemTime(Date.now() + 30_001); return Response.json({ data: generation }); });
    expect(await analyze()).toMatchObject({ candidate: null, actualMicroUsd: 7, audit: { status: "metadata-timeout" } });
  });
  it("stops after three read-only lookups while the generation is not available", async () => {
    vi.useFakeTimers();
    const { fetch, analyze } = adapter(() => new Response(null, { status: 404 }));
    const pending = analyze(); await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ kind: "received", actualMicroUsd: 7, candidate: null, audit: { status: "metadata-unavailable", metadataAttempts: 3 } });
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET", "GET", "GET"]);
  });
  it.each(["headers", "body"] as const)("enforces the 30-second total even when metadata %s ignores abort", async phase => {
    vi.useFakeTimers();
    const stash = new ReadableStream<Uint8Array>({ pull: () => new Promise<void>(() => {}) });
    const { fetch, analyze } = adapter(() => phase === "headers" ? new Promise<Response>(() => {}) : new Response(stash));
    const pending = analyze(); await vi.advanceTimersByTimeAsync(29_999);
    let finished = false; void pending.then(() => { finished = true; }); await Promise.resolve();
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ kind: "received", actualMicroUsd: 7, candidate: null, audit: { status: "metadata-timeout", metadataAttempts: 1 } });
    expect(fetch.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
  });
  it("shares one deadline across transient attempts and cancels an oversized metadata body", async () => {
    vi.useFakeTimers(); let reads = 0;
    const { analyze } = adapter(() => {
      reads++;
      return reads === 1 ? new Promise<Response>(resolve => setTimeout(() => resolve(new Response(null, { status: 404 })), 18_000))
        : new Promise<Response>(() => {});
    });
    const pending = analyze(); await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toMatchObject({ audit: { status: "metadata-timeout", metadataAttempts: 2 } });
    let cancelled = false;
    const oversized = adapter(() => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(65_536)); }, cancel() { cancelled = true; } })));
    expect(await oversized.analyze()).toMatchObject({ candidate: null, actualMicroUsd: 7, audit: { status: "metadata-unavailable", metadataAttempts: 1 } });
    expect(cancelled).toBe(true);
  });
  it("rejects missing endpoint evidence, ambiguous provider order, unsafe endpoint paths and missing credentials before admission", async () => {
    const fetch = vi.fn<DocumentFetch>(); const beforeSend = vi.fn(async () => true);
    const routes = { ...config.routingPolicy, providerOrder: ["same-name", "variant"] };
    for (const [configuration, qualified] of [
      [config, { ...qualification, receiptRoute: undefined }], [{ ...config, routingPolicy: routes }, { ...qualification, routingPolicy: routes }],
      [{ ...config, endpoint: "https://gateway.invalid/other" }, { ...qualification, endpoint: "https://gateway.invalid/other" }],
      [{ ...config, endpoint: config.endpoint + "?login=key" }, { ...qualification, endpoint: config.endpoint + "?login=key" }],
      [{ ...config, apiKey: "" }, qualification],
    ] as const) {
      const provider = new HttpDocumentAnalysisProvider(configuration, { fetch, qualification: qualified as DocumentProviderQualification });
      await expect(provider.analyze(input, new AbortController().signal, beforeSend)).resolves.toMatchObject({ kind: "not-sent" });
    }
    expect(fetch).not.toHaveBeenCalled(); expect(beforeSend).not.toHaveBeenCalled();
  });
  it("calls admission exactly once, after local checks and immediately before the paid POST; refusal sends nothing", async () => {
    const steps: string[] = [];
    const fetch = vi.fn<DocumentFetch>(async (_, init) => { steps.push(init!.method!); return Response.json(init?.method === "POST" ? completion : { data: generation }); });
    const provider = new HttpDocumentAnalysisProvider(config, { fetch, qualification });
    await expect(provider.analyze(input, new AbortController().signal, async () => false)).resolves.toMatchObject({ kind: "not-sent" });
    await expect(provider.analyze(input, new AbortController().signal, async () => { throw new Error("denied"); })).resolves.toMatchObject({ kind: "not-sent" });
    await provider.analyze(input, new AbortController().signal, async () => { steps.push("fence"); return true; });
    expect(steps).toEqual(["fence", "POST", "GET"]);
  });
  it("refuses malformed URLs and wildcard route tags without input release or throwing", async () => {
    const wildcard = { ...config.routingPolicy, providerOrder: ["synthetic/*"] };
    const fetch = vi.fn<DocumentFetch>(); const beforeSend = vi.fn(async () => true);
    for (const [badConfig, badQualification] of [
      [{ ...config, endpoint: "not-a-url" }, { ...qualification, endpoint: "not-a-url" }],
      [{ ...config, routingPolicy: wildcard }, { ...qualification, routingPolicy: wildcard }],
    ] as const) {
      await expect(new HttpDocumentAnalysisProvider(badConfig, { fetch, qualification: badQualification })
        .analyze(input, new AbortController().signal, beforeSend)).resolves.toMatchObject({ kind: "not-sent" });
    }
    expect(beforeSend.mock.calls.length).toBe(0); expect(fetch.mock.calls.length).toBe(0);
  });
});
