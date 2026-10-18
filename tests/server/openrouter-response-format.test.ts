// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as responseFormatDiagnosticModule from "../../app/server/research/response-format-diagnostic";
import { createKimiLocalValidationProvider, OpenRouterResearchProvider } from "../../app/server/research/openrouter-provider";
import { ResearchProviderError, type ResearchProvider } from "../../app/server/research/provider";
import type { ProviderResultDiagnostic } from "../../app/server/research/result-diagnostic";
import type { ResearchTransportDiagnostic } from "../../app/server/research/transport-diagnostic";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";

const request = { role: "Data Product Manager", locale: "en-US" } as const;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("global network denied"); }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function failure(provider: Pick<ResearchProvider, "research">, code = "invalid-transport") {
  const error = await provider.research(request).catch((value: unknown) => value);
  expect(error).toBeInstanceOf(ResearchProviderError);
  expect(error).toMatchObject({ code, charged: "unknown" });
  return error;
}

function observed(callback: ReturnType<typeof vi.fn>): Readonly<ResearchTransportDiagnostic> {
  expect(callback).toHaveBeenCalledOnce();
  return callback.mock.calls[0]![0] as Readonly<ResearchTransportDiagnostic>;
}

function providerFor(response: Response, onTransportDiagnostic = vi.fn(),
  onResultDiagnostic?: (diagnostic: ProviderResultDiagnostic) => unknown) {
  const injected = vi.fn<typeof fetch>(async () => response);
  const provider = createKimiLocalValidationProvider({ key: "synthetic-format", fetch: injected,
    onTransportDiagnostic, onResultDiagnostic });
  return { provider, injected, onTransportDiagnostic };
}

describe("Kimi local response format observation", () => {
  it.each([
    [" ".repeat(1_100), "ascii-whitespace-only"],
    ["<html>".padEnd(1_100, " "), "html-like"],
    ["data: {}".padEnd(1_100, " "), "sse-like"],
    ['{"choices":'.padEnd(1_100, " "), "json-container-like"],
  ] as const)("classifies a completed malformed body %#", async (body, kind) => {
    expect(new TextEncoder().encode(body)).toHaveLength(1_100);
    const observed = vi.fn();
    const injected = vi.fn<typeof fetch>(async () => new Response(body));
    const provider = createKimiLocalValidationProvider({
      key: "synthetic-format",
      fetch: injected,
      onTransportDiagnostic: observed,
    });

    await expect(provider.research(request)).rejects.toMatchObject({
      code: "invalid-transport",
      charged: "unknown",
    });
    expect(observed).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      version: "transport-diagnostic-v3",
      phase: "outer-json",
      reason: "invalid-json",
      receivedBytes: 1_100,
      responseFormat: { contentType: "text", bodyPrefixKind: kind },
    }));
    expect(injected).toHaveBeenCalledOnce();
  });

  it.each([
    ["application/json", "<html>", { contentType: "json", bodyPrefixKind: "html-like" }],
    ["text/html", "data: {}", { contentType: "html", bodyPrefixKind: "sse-like" }],
    ["text/event-stream", "{", { contentType: "sse", bodyPrefixKind: "json-container-like" }],
  ] as const)("keeps contradictory header and body evidence for %s", async (contentType, body, responseFormat) => {
    const harness = providerFor(new Response(body, { headers: { "Content-Type": contentType } }));
    await failure(harness.provider);
    expect(observed(harness.onTransportDiagnostic)).toMatchObject({
      version: "transport-diagnostic-v3",
      phase: "outer-json",
      responseFormat,
    });
  });

  it("records unavailable when Content-Type inspection throws", async () => {
    const response = new Response("<html>");
    const originalGet = response.headers.get.bind(response.headers);
    vi.spyOn(response.headers, "get").mockImplementation((name) => {
      if (name.toLowerCase() === "content-type") throw new Error("secret-canary");
      return originalGet(name);
    });
    const harness = providerFor(response);
    await failure(harness.provider);
    expect(observed(harness.onTransportDiagnostic)).toMatchObject({
      responseFormat: { contentType: "unavailable", bodyPrefixKind: "html-like" },
    });
    expect(JSON.stringify(harness.onTransportDiagnostic.mock.calls)).not.toContain("secret-canary");
  });

  it("uses the decoder result for a BOM-only body", async () => {
    const harness = providerFor(new Response(new Uint8Array([0xef, 0xbb, 0xbf])));
    await failure(harness.provider);
    expect(observed(harness.onTransportDiagnostic)).toMatchObject({
      receivedBytes: 3,
      responseFormat: { contentType: "missing", bodyPrefixKind: "decoded-empty" },
    });
  });

  it("classifies a complete malformed body at the exact response cap without cancelling it", async () => {
    const cancel = vi.fn();
    const bytes = new Uint8Array(524_288).fill(32);
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); }, cancel });
    const harness = providerFor(new Response(stream));
    await failure(harness.provider);
    expect(observed(harness.onTransportDiagnostic)).toMatchObject({
      receivedBytes: 524_288,
      bodyComplete: true,
      responseFormat: { contentType: "missing", bodyPrefixKind: "ascii-whitespace-only" },
    });
    expect(cancel).not.toHaveBeenCalled();
    expect(stream.locked).toBe(false);
  });

  it.each([
    ["valid JSON scalar", new Response("1"), "outer-shape", "non-object"],
    ["invalid UTF-8", new Response(new Uint8Array([0xff])), "utf8-chunk", "invalid-utf8"],
    ["oversized body", new Response(new Uint8Array(524_289)), "body-read", "body-too-large"],
  ] as const)("does not classify %s", async (_label, response, phase, reason) => {
    const classify = vi.spyOn(responseFormatDiagnosticModule, "buildResponseFormatDiagnostic");
    const harness = providerFor(response);
    await failure(harness.provider);
    expect(observed(harness.onTransportDiagnostic)).toMatchObject({
      version: "transport-diagnostic-v3",
      phase,
      reason,
      responseFormat: null,
    });
    expect(classify).not.toHaveBeenCalled();
  });

  it("keeps valid Unicode JSON split into single bytes on the result boundary", async () => {
    const classify = vi.spyOn(responseFormatDiagnosticModule, "buildResponseFormatDiagnostic");
    const bytes = new TextEncoder().encode('{"choices":[],"label":"雪"}');
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    } });
    const transport = vi.fn();
    const result = vi.fn();
    const harness = providerFor(new Response(stream), transport, result);
    await failure(harness.provider);
    expect(transport).not.toHaveBeenCalled();
    expect(result).toHaveBeenCalledOnce();
    expect(classify).not.toHaveBeenCalled();
  });

  it("keeps standard Research and Repair outside response format observation", async () => {
    const classify = vi.spyOn(responseFormatDiagnosticModule, "buildResponseFormatDiagnostic");
    const injected = vi.fn<typeof fetch>(async () => new Response("<html>"));
    const provider = new OpenRouterResearchProvider({
      OPENROUTER_API_KEY: "synthetic-standard-key",
      ARC_AI_MODEL_RESEARCH: "test/research",
      ARC_AI_MODEL_ECONOMY: "test/economy",
    }, { fetch: injected });

    await failure(provider);
    const repairError = await provider.repair({ role: request.role, locale: request.locale,
      originalContent: JSON.stringify(validResearchCandidate), annotations: validAnnotations })
      .catch((value: unknown) => value);
    expect(repairError).toMatchObject({ code: "invalid-transport", charged: "unknown" });
    expect(injected).toHaveBeenCalledTimes(2);
    expect(classify).not.toHaveBeenCalled();
  });

  it("contains classifier failure while preserving the original transport error", async () => {
    vi.spyOn(responseFormatDiagnosticModule, "buildResponseFormatDiagnostic")
      .mockImplementation(() => { throw new Error("secret-canary"); });
    const harness = providerFor(new Response("<html>"));
    await failure(harness.provider);
    expect(observed(harness.onTransportDiagnostic)).toMatchObject({
      version: "transport-diagnostic-v3",
      phase: "outer-json",
      responseFormat: null,
    });
    expect(JSON.stringify(harness.onTransportDiagnostic.mock.calls)).not.toContain("secret-canary");
  });

  it.each([
    ["synchronous throw", () => { throw new Error("secret-canary"); }],
    ["asynchronous rejection", async () => { throw new Error("secret-canary"); }],
    ["pending callback", () => new Promise<never>(() => undefined)],
  ] as const)("isolates observer %s from the provider result and stream cleanup", async (_label, handler) => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode("<html>"));
      controller.close();
    } });
    const observer = vi.fn(handler);
    const harness = providerFor(new Response(stream), observer);
    await failure(harness.provider);
    await Promise.resolve();
    expect(observer).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });
});
