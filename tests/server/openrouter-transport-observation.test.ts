// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createKimiLocalValidationProvider, OpenRouterResearchProvider, OPENROUTER_LIMITS } from "../../app/server/research/openrouter-provider";
import { ResearchProviderError } from "../../app/server/research/provider";
import type { ResearchTransportDiagnostic } from "../../app/server/research/transport-diagnostic";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";

const request = { role: "Data Product Manager", locale: "en-US" } as const;

function wire(content = JSON.stringify(validResearchCandidate)) {
  return {
    model: "moonshotai/kimi-k3",
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, cost: 0.000002,
      server_tool_use: { web_search_requests: 1 } },
    choices: [{ finish_reason: "stop", message: { content,
      annotations: validAnnotations.map((value) => ({ type: value.type,
        url_citation: { url: value.url, title: value.title } })) } }],
  };
}

function harness(source: Response | ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>),
  handler: (diagnostic: Readonly<ResearchTransportDiagnostic>) => unknown = () => undefined) {
  const fetch = vi.fn<typeof globalThis.fetch>(typeof source === "function" ? source : async () => source);
  const callback = vi.fn(handler);
  const options = { key: "synthetic-transport-observation", fetch, onTransportDiagnostic: callback };
  return { provider: createKimiLocalValidationProvider(options), fetch, callback };
}

async function rejected(promise: Promise<unknown>, code: string, charged: boolean | "unknown" = "unknown") {
  const error = await promise.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(ResearchProviderError);
  expect(error).toMatchObject({ code, charged });
  return error as ResearchProviderError;
}

function observation(callback: ReturnType<typeof vi.fn>): Readonly<ResearchTransportDiagnostic> {
  expect(callback).toHaveBeenCalledOnce();
  const value = callback.mock.calls[0]?.[0] as Readonly<ResearchTransportDiagnostic>;
  expect(Object.isFrozen(value)).toBe(true);
  for (const elapsed of [value.headersElapsedMs, value.bodyEndElapsedMs, value.localCancellationElapsedMs]) {
    if (elapsed !== null) {
      expect(Number.isInteger(elapsed)).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(elapsed).toBeLessThanOrEqual(1_320_000);
    }
  }
  return value;
}

afterEach(() => vi.useRealTimers());

describe("Kimi local transport observation", () => {
  it("observes malformed outer JSON after a complete response body", async () => {
    const onTransportDiagnostic = vi.fn();
    const options = {
      key: "synthetic-transport-observation",
      fetch: vi.fn<typeof fetch>(async () => new Response('{"choices":', { status: 200 })),
      onTransportDiagnostic,
    };
    const provider = createKimiLocalValidationProvider(options);

    const error = await provider.research({ role: "Data Product Manager", locale: "en-US" }).catch((value: unknown) => value);

    expect(error).toMatchObject({ code: "invalid-transport", charged: "unknown" });
    expect(onTransportDiagnostic).toHaveBeenCalledOnce();
    expect(onTransportDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      version: "transport-diagnostic-v3",
      phase: "outer-json",
      reason: "invalid-json",
      bodyComplete: true,
      localCancellation: "none",
      localCancellationElapsedMs: null,
      nativeErrorKind: null,
      responseFormat: { contentType: "text", bodyPrefixKind: "json-container-like" },
    }));
  });

  it.each([
    [{ code: "UND_ERR_HEADERS_TIMEOUT", detail: "secret-canary" }, "headers-timeout"],
    [{ code: "UND_ERR_SOCKET", socket: { key: "secret-canary" } }, "socket"],
    [new DOMException("secret-canary", "AbortError"), "abort"],
    [{ cause: { code: "UND_ERR_BODY_TIMEOUT", message: "secret-canary" } }, "body-timeout"],
    [new Error("secret-canary"), "other"],
  ] as const)("classifies bounded injected fetch failure %#", async (nativeError, nativeErrorKind) => {
    const { provider, fetch, callback } = harness(async () => { throw nativeError; });
    await rejected(provider.research(request), "unavailable");
    expect(fetch).toHaveBeenCalledOnce();
    expect(observation(callback)).toMatchObject({ phase: "fetch", reason: "fetch-error", receivedBytes: 0,
      bodyComplete: false, localCancellation: "none", localCancellationElapsedMs: null,
      nativeErrorKind, headersElapsedMs: null, bodyEndElapsedMs: null });
    expect(JSON.stringify(callback.mock.calls)).not.toContain("secret-canary");
  });

  it("preserves the POST contract while observing a fetch failure", async () => {
    const { provider, fetch } = harness(async () => { throw new Error("secret-canary"); });
    await rejected(provider.research(request), "unavailable");
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({ model: "moonshotai/kimi-k3", stream: false, max_tokens: 32_768,
      reasoning: { effort: "low" }, provider: { require_parameters: true, data_collection: "deny", zdr: true },
      response_format: { type: "json_schema" } });
  });

  it("observes a fetch-rejected ResearchProviderError without replacing it", async () => {
    const original = new ResearchProviderError("rate", true, true, { actualModel: "safe/model", usage: null });
    const { provider, fetch, callback } = harness(async () => { throw original; });

    const caught = await provider.research(request).catch((value: unknown) => value);

    expect(caught).toBe(original);
    expect(caught).toMatchObject({ code: "rate", retryable: true, charged: true });
    expect(fetch).toHaveBeenCalledOnce();
    expect(observation(callback)).toMatchObject({ phase: "fetch", reason: "fetch-error", receivedBytes: 0,
      bodyComplete: false, localCancellation: "none", localCancellationElapsedMs: null,
      nativeErrorKind: "other", headersElapsedMs: null, bodyEndElapsedMs: null });
  });

  it.each([
    ["redirect", new Response(new ReadableStream<Uint8Array>({}), { status: 302 }), "redirect"],
    ["malformed length", new Response("{}", { headers: { "Content-Length": "12x" } }), "invalid-content-length"],
    ["excessive length", new Response("{}", { headers: { "Content-Length": String(OPENROUTER_LIMITS.responseBytes + 1) } }), "declared-body-too-large"],
    ["missing body", new Response(null), "missing-body"],
  ] as const)("observes header rejection: %s", async (_name, response, reason) => {
    const { provider, callback } = harness(response);
    await rejected(provider.research(request), "invalid-transport");
    const value = observation(callback);
    expect(value).toMatchObject({ phase: "headers", reason, receivedBytes: 0, bodyComplete: false,
      nativeErrorKind: null, bodyEndElapsedMs: null });
    expect(value.headersElapsedMs).not.toBeNull();
    if (response.body) expect(value).toMatchObject({ localCancellation: "reject-response-body",
      localCancellationElapsedMs: expect.any(Number) });
    else expect(value).toMatchObject({ localCancellation: "none", localCancellationElapsedMs: null });
  });

  it("does not claim cancellation when a header rejection has no body", async () => {
    const { provider, callback } = harness(new Response(null, { headers: { "Content-Length": "524289" } }));
    await rejected(provider.research(request), "invalid-transport");
    expect(observation(callback)).toMatchObject({ phase: "headers", reason: "declared-body-too-large",
      localCancellation: "none", localCancellationElapsedMs: null });
  });

  it("clamps the local v2 header elapsed time to 1320000", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValue(1_500_000);
    try {
      const { provider, callback } = harness(new Response(null));
      await rejected(provider.research(request), "invalid-transport");
      expect(observation(callback)).toMatchObject({ version: "transport-diagnostic-v3", phase: "headers",
        reason: "missing-body", headersElapsedMs: 1_320_000, responseFormat: null });
    } finally {
      now.mockRestore();
    }
  });

  it("publishes a header rejection only after its body cancellation attempt", async () => {
    const order: string[] = [];
    const cancel = vi.fn(() => { order.push("cancel"); });
    const callback = vi.fn(() => { order.push("observe"); });
    const { provider } = harness(new Response(new ReadableStream<Uint8Array>({ cancel }),
      { headers: { "Content-Length": "invalid" } }), callback);
    await rejected(provider.research(request), "invalid-transport");
    expect(cancel).toHaveBeenCalledOnce();
    expect(order).toEqual(["cancel", "observe"]);
  });

  it("accepts exactly 524288 bytes without a transport observation", async () => {
    const text = '{"choices":[]}' + " ".repeat(OPENROUTER_LIMITS.responseBytes - 14);
    expect(new TextEncoder().encode(text)).toHaveLength(OPENROUTER_LIMITS.responseBytes);
    const onResultDiagnostic = vi.fn();
    const callback = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(text));
    const provider = createKimiLocalValidationProvider({ key: "synthetic-transport-observation", fetch,
      onTransportDiagnostic: callback, onResultDiagnostic });
    await rejected(provider.research(request), "invalid-transport");
    expect(callback).not.toHaveBeenCalled();
    expect(onResultDiagnostic).toHaveBeenCalledOnce();
  });

  it("clamps an oversized chunk to 524289 and cancels before observation", async () => {
    const order: string[] = [];
    const cancel = vi.fn(() => { order.push("cancel"); });
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(OPENROUTER_LIMITS.responseBytes + 50));
    }, cancel });
    const callback = vi.fn(() => { order.push("observe"); });
    const { provider } = harness(new Response(stream), callback);
    await rejected(provider.research(request), "invalid-transport");
    expect(observation(callback)).toMatchObject({ phase: "body-read", reason: "body-too-large",
      receivedBytes: 524_289, bodyComplete: false, localCancellation: "reject-read-abort",
      nativeErrorKind: null, bodyEndElapsedMs: expect.any(Number), localCancellationElapsedMs: expect.any(Number) });
    expect(cancel).toHaveBeenCalledOnce();
    expect(order.at(-1)).toBe("observe");
  });

  it.each([
    ["chunk", new Uint8Array([0xc3, 0x28]), "utf8-chunk", false, "reject-read-abort"],
    ["flush", new Uint8Array([0xc3]), "utf8-flush", true, "none"],
  ] as const)("observes invalid UTF-8 at %s", async (_name, bytes, phase, bodyComplete, localCancellation) => {
    const { provider, callback } = harness(new Response(bytes));
    await rejected(provider.research(request), "invalid-transport");
    expect(observation(callback)).toMatchObject({ phase, reason: "invalid-utf8", receivedBytes: bytes.byteLength,
      bodyComplete, localCancellation, nativeErrorKind: null, bodyEndElapsedMs: expect.any(Number),
      localCancellationElapsedMs: localCancellation === "none" ? null : expect.any(Number) });
  });

  it.each([
    ['{"choices":', "outer-json", "invalid-json"],
    ["null", "outer-shape", "non-object"],
    ["[]", "outer-shape", "non-object"],
    ["42", "outer-shape", "non-object"],
    ['"scalar"', "outer-shape", "non-object"],
  ] as const)("observes complete outer rejection for %s", async (text, phase, reason) => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(text)); controller.close();
    }, cancel });
    const { provider, callback } = harness(new Response(stream));
    await rejected(provider.research(request), "invalid-transport");
    expect(observation(callback)).toMatchObject({ phase, reason, bodyComplete: true, localCancellation: "none",
      localCancellationElapsedMs: null, nativeErrorKind: null, bodyEndElapsedMs: expect.any(Number) });
    expect(cancel).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "UND_ERR_BODY_TIMEOUT" }, "body-timeout"],
    [{ code: "UND_ERR_SOCKET" }, "socket"],
    [new DOMException("secret-canary", "AbortError"), "abort"],
    [new Error("secret-canary"), "other"],
  ] as const)("classifies reader rejection %# and keeps the existing provider mapping", async (nativeError, nativeErrorKind) => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.error(nativeError); } });
    const { provider, callback } = harness(new Response(stream));
    await rejected(provider.research(request), "unavailable");
    expect(observation(callback)).toMatchObject({ phase: "body-read", reason: "body-read-error",
      bodyComplete: false, localCancellation: "reject-read-abort", nativeErrorKind,
      bodyEndElapsedMs: expect.any(Number), localCancellationElapsedMs: expect.any(Number) });
  });

  it("preserves an existing ResearchProviderError rejected by the reader", async () => {
    const original = new ResearchProviderError("rate", true, true, { actualModel: "safe/model", usage: null });
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.error(original); } });
    const { provider, callback } = harness(new Response(stream));
    const caught = await provider.research(request).catch((value: unknown) => value);
    expect(caught).toBe(original);
    expect(caught).toMatchObject({ code: "rate", retryable: true, charged: true });
    expect(observation(callback)).toMatchObject({ phase: "body-read", reason: "body-read-error", nativeErrorKind: "other" });
  });

  it("observes a deadline before headers once and ignores a late response settlement", async () => {
    vi.useFakeTimers();
    let resolve!: (response: Response) => void;
    const { provider, fetch, callback } = harness(() => new Promise<Response>((done) => { resolve = done; }));
    const pending = rejected(provider.research(request), "timeout");
    await vi.advanceTimersByTimeAsync(600_000);
    expect(callback).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(600_000);
    await pending;
    const value = observation(callback);
    expect(value).toMatchObject({ phase: "fetch", reason: "deadline", receivedBytes: 0, bodyComplete: false,
      version: "transport-diagnostic-v3", localCancellation: "deadline-abort", localCancellationElapsedMs: 1_200_000,
      responseFormat: null,
      nativeErrorKind: null, headersElapsedMs: null, bodyEndElapsedMs: null });
    const cancel = vi.fn();
    resolve(new Response(new ReadableStream<Uint8Array>({ cancel })));
    await Promise.resolve();
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0]?.[0]).toBe(value);
  });

  it("observes a body deadline after abort and cancellation attempts without being overwritten", async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const cancel = vi.fn(() => { order.push("cancel"); });
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"choices":'));
    }, cancel });
    const callback = vi.fn(() => { order.push("observe"); });
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      init?.signal?.addEventListener("abort", () => { order.push("abort"); });
      return new Response(stream);
    });
    const provider = createKimiLocalValidationProvider({ key: "synthetic-transport-observation", fetch,
      onTransportDiagnostic: callback });
    const pending = rejected(provider.research(request), "timeout");
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(callback).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(600_000);
    await pending;
    expect(observation(callback)).toMatchObject({ phase: "body-read", reason: "deadline", receivedBytes: 11,
      bodyComplete: false, version: "transport-diagnostic-v3", localCancellation: "deadline-abort",
      responseFormat: null,
      localCancellationElapsedMs: 1_200_000, bodyEndElapsedMs: 1_200_000, nativeErrorKind: null });
    expect(order[0]).toBe("abort");
    expect(order.at(-1)).toBe("observe");
    expect(cancel).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledOnce();
  });

  it.each([
    ["sync throw", () => { throw new Error("secret-canary"); }],
    ["async rejection", async () => { throw new Error("secret-canary"); }],
  ] as const)("isolates observer %s from the original error and cleanup", async (_name, callback) => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(OPENROUTER_LIMITS.responseBytes + 1));
    } });
    const { provider } = harness(new Response(stream), callback);
    await rejected(provider.research(request), "invalid-transport");
    await Promise.resolve();
    expect(stream.locked).toBe(false);
  });

  it("does not emit transport metadata for success or parsed-object semantic failure", async () => {
    const successCallback = vi.fn();
    const success = harness(Response.json(wire()), successCallback);
    expect((await success.provider.research(request)).candidate).toEqual(validResearchCandidate);
    expect(successCallback).not.toHaveBeenCalled();

    const resultCallback = vi.fn();
    const onResultDiagnostic = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ choices: [] }));
    const provider = createKimiLocalValidationProvider({ key: "synthetic-transport-observation", fetch,
      onTransportDiagnostic: resultCallback, onResultDiagnostic });
    await rejected(provider.research(request), "invalid-transport");
    expect(resultCallback).not.toHaveBeenCalled();
    expect(onResultDiagnostic).toHaveBeenCalledOnce();
  });

  it("keeps HTTP error payload handling on the existing result boundary", async () => {
    const { provider, callback } = harness(Response.json({ error: { code: 429, message: "secret-canary" } }, { status: 429 }));
    await rejected(provider.research(request), "rate", false);
    expect(callback).not.toHaveBeenCalled();
  });

  it("keeps the standard provider dormant from optional transport timing", async () => {
    const response = Response.json(wire());
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response);
    const provider = new OpenRouterResearchProvider({ OPENROUTER_API_KEY: "synthetic-standard-key",
      ARC_AI_MODEL_RESEARCH: "test/research", ARC_AI_MODEL_ECONOMY: "test/economy" }, { fetch });
    const now = vi.spyOn(performance, "now").mockImplementation(() => { throw new Error("diagnostic path invoked"); });
    try {
      expect((await provider.research(request)).candidate).toEqual(validResearchCandidate);
    } finally {
      now.mockRestore();
    }
  });
});
