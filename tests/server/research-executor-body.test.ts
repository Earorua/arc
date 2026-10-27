// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BRIDGE_BODY_LIMITS,
  BridgeBodyError,
  decodeBridgeJson,
  readBridgeBody,
} from "../../app/server/research/executor/body";

const encoder = new TextEncoder();

function responseFromChunks(chunks: Uint8Array[], headers?: HeadersInit): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }), { headers });
}

async function expectBodyError(work: Promise<unknown>, code: string) {
  const error = await work.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(BridgeBodyError);
  expect(error).toMatchObject({
    code,
    message: `Research bridge body failure: ${code}`,
    name: "BridgeBodyError",
  });
  return error as BridgeBodyError;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("research executor bridge body transport", () => {
  it("publishes the frozen endpoint byte limits", () => {
    expect(BRIDGE_BODY_LIMITS).toEqual({
      request: 4_096,
      status: 4_096,
      outbox: 16_384,
      result: 1_048_576,
    });
    expect(Object.isFrozen(BRIDGE_BODY_LIMITS)).toBe(true);
  });

  it("counts real bytes across chunks without trusting Content-Length", async () => {
    const response = responseFromChunks([
      new Uint8Array([123, 34, 120]),
      new Uint8Array([34, 58, 49, 125]),
    ], { "Content-Length": "1" });

    const bytes = await readBridgeBody(response, { maxBytes: 7, timeoutMs: 5_000 });

    expect(bytes).toEqual(new Uint8Array([123, 34, 120, 34, 58, 49, 125]));
    expect(decodeBridgeJson(bytes)).toEqual({ x: 1 });
    expect(response.body?.locked).toBe(false);
  });

  it("accepts an exact multibyte UTF-8 boundary split across chunks", async () => {
    const bytes = encoder.encode('{"emoji":"🙂"}');
    const response = responseFromChunks([
      bytes.slice(0, 11),
      bytes.slice(11, 13),
      bytes.slice(13),
    ]);

    const result = await readBridgeBody(response, { maxBytes: bytes.byteLength, timeoutMs: 5_000 });

    expect(result).toEqual(bytes);
    expect(decodeBridgeJson(result)).toEqual({ emoji: "🙂" });
  });

  it("rejects actual multibyte UTF-8 bytes over the limit despite a dishonest length", async () => {
    const bytes = encoder.encode('{"emoji":"🙂"}');
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, bytes.byteLength - 2));
        controller.enqueue(bytes.slice(bytes.byteLength - 2));
      },
      cancel,
    });
    const response = new Response(stream, { headers: { "Content-Length": "0" } });

    await expectBodyError(
      readBridgeBody(response, { maxBytes: bytes.byteLength - 1, timeoutMs: 5_000 }),
      "body-limit",
    );

    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });

  it("uses one whole-read deadline across multiple chunks", async () => {
    vi.useFakeTimers();
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) { streamController = controller; },
      cancel,
    }));
    const work = readBridgeBody(response, { maxBytes: 32, timeoutMs: 10 });
    const expectedFailure = expectBodyError(work, "timeout");

    await vi.advanceTimersByTimeAsync(6);
    streamController.enqueue(new Uint8Array([1]));
    await vi.advanceTimersByTimeAsync(4);

    await expectedFailure;
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });

  it("times out a stalled read even if cancellation itself never resolves", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }));
    const work = readBridgeBody(response, { maxBytes: 4_096, timeoutMs: 10 });
    const expectedFailure = expectBodyError(work, "timeout");

    await vi.advanceTimersByTimeAsync(10);

    await expectedFailure;
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });

  it("cancels a pre-aborted body without waiting for cancellation", async () => {
    const cancellation = new AbortController();
    cancellation.abort();
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }));

    await expectBodyError(
      readBridgeBody(response, { maxBytes: 32, timeoutMs: 100, signal: cancellation.signal }),
      "aborted",
    );

    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });

  it("aborts a pending read without waiting for cancellation", async () => {
    const cancellation = new AbortController();
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }));
    const work = readBridgeBody(response, {
      maxBytes: 32,
      timeoutMs: 5_000,
      signal: cancellation.signal,
    });
    const expectedFailure = expectBodyError(work, "aborted");

    cancellation.abort();

    await expectedFailure;
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });

  it("normalizes stream failures without leaking their marker or cause", async () => {
    const marker = "synthetic-sensitive-marker";
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) { controller.error(new Error(marker)); },
    }));

    const error = await expectBodyError(
      readBridgeBody(response, { maxBytes: 32, timeoutMs: 100 }),
      "body-read",
    );

    expect(String(error)).not.toContain(marker);
    expect(Object.prototype.hasOwnProperty.call(error, "cause")).toBe(false);
    expect(response.body?.locked).toBe(false);
  });

  it("returns empty bytes for a null body", async () => {
    const bytes = await readBridgeBody({ body: null }, { maxBytes: 32, timeoutMs: 100 });

    expect(bytes).toEqual(new Uint8Array());
  });

  it("normalizes an already locked body as a safe read failure", async () => {
    const response = responseFromChunks([new Uint8Array([1])]);
    const existingReader = response.body!.getReader();

    try {
      await expectBodyError(
        readBridgeBody(response, { maxBytes: 32, timeoutMs: 100 }),
        "body-read",
      );
      expect(response.body?.locked).toBe(true);
    } finally {
      existingReader.releaseLock();
    }
  });

  it.each([
    [0, 100],
    [-1, 100],
    [1.5, 100],
    [Number.NaN, 100],
    [Number.POSITIVE_INFINITY, 100],
    [BRIDGE_BODY_LIMITS.result + 1, 100],
    [32, 0],
    [32, -1],
    [32, 1.5],
    [32, Number.NaN],
    [32, Number.POSITIVE_INFINITY],
    [32, 30_001],
  ])("rejects invalid bounds maxBytes=%s timeoutMs=%s", async (maxBytes, timeoutMs) => {
    await expectBodyError(
      readBridgeBody({ body: null }, { maxBytes, timeoutMs }),
      "invalid-limit",
    );
  });

  it("removes its timer and abort listener after success", async () => {
    vi.useFakeTimers();
    const cancellation = new AbortController();
    const remove = vi.spyOn(cancellation.signal, "removeEventListener");
    const response = responseFromChunks([new Uint8Array([1, 2, 3])]);

    await expect(readBridgeBody(response, {
      maxBytes: 3,
      timeoutMs: 100,
      signal: cancellation.signal,
    })).resolves.toEqual(new Uint8Array([1, 2, 3]));

    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(response.body?.locked).toBe(false);
  });

  it("removes its timer and abort listener after failure", async () => {
    vi.useFakeTimers();
    const cancellation = new AbortController();
    const remove = vi.spyOn(cancellation.signal, "removeEventListener");
    const response = responseFromChunks([new Uint8Array([1, 2])]);

    await expectBodyError(readBridgeBody(response, {
      maxBytes: 1,
      timeoutMs: 100,
      signal: cancellation.signal,
    }), "body-limit");

    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(response.body?.locked).toBe(false);
  });

  it("keeps concurrent reads independent", async () => {
    let firstController!: ReadableStreamDefaultController<Uint8Array>;
    let secondController!: ReadableStreamDefaultController<Uint8Array>;
    const first = new Response(new ReadableStream<Uint8Array>({
      start(controller) { firstController = controller; },
    }));
    const second = new Response(new ReadableStream<Uint8Array>({
      start(controller) { secondController = controller; },
    }));

    const firstWork = readBridgeBody(first, { maxBytes: 2, timeoutMs: 100 });
    const secondWork = readBridgeBody(second, { maxBytes: 3, timeoutMs: 100 });
    secondController.enqueue(new Uint8Array([7, 8, 9]));
    secondController.close();
    firstController.enqueue(new Uint8Array([1, 2]));
    firstController.close();

    await expect(Promise.all([firstWork, secondWork])).resolves.toEqual([
      new Uint8Array([1, 2]),
      new Uint8Array([7, 8, 9]),
    ]);
    expect(first.body?.locked).toBe(false);
    expect(second.body?.locked).toBe(false);
  });

  it("checks monotonic time around immediate zero-byte chunks", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now++);
    const cancel = vi.fn();
    const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
      controller.enqueue(new Uint8Array());
    });
    const response = new Response(new ReadableStream<Uint8Array>({ pull, cancel }, {
      highWaterMark: 0,
    }));

    await expectBodyError(
      readBridgeBody(response, { maxBytes: 32, timeoutMs: 3 }),
      "timeout",
    );

    expect(pull.mock.calls.length).toBeLessThanOrEqual(2);
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });

  it("copies chunks before a producer can mutate their backing memory", async () => {
    const shared = new Uint8Array([1, 2]);
    let pullCount = 0;
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        if (pullCount === 1) {
          controller.enqueue(shared);
          return;
        }
        shared.fill(9);
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      },
    }, { highWaterMark: 0 }));

    await expect(readBridgeBody(response, { maxBytes: 3, timeoutMs: 100 }))
      .resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it("copies Buffer chunks whose slice method retains shared memory", async () => {
    const shared = Buffer.from([4, 5]);
    let pullCount = 0;
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        if (pullCount === 1) {
          controller.enqueue(shared);
          return;
        }
        shared.fill(9);
        controller.enqueue(new Uint8Array([6]));
        controller.close();
      },
    }, { highWaterMark: 0 }));

    await expect(readBridgeBody(response, { maxBytes: 3, timeoutMs: 100 }))
      .resolves.toEqual(new Uint8Array([4, 5, 6]));
  });

  it("decodes valid JSON after fatal UTF-8 validation", () => {
    expect(decodeBridgeJson(encoder.encode('{"ok":true}'))).toEqual({ ok: true });
  });

  it.each([
    ["invalid UTF-8", new Uint8Array([0xc3, 0x28])],
    ["invalid JSON", encoder.encode("{")],
  ])("normalizes %s as invalid-json", (_label, bytes) => {
    expect(() => decodeBridgeJson(bytes)).toThrow(expect.objectContaining({
      code: "invalid-json",
      message: "Research bridge body failure: invalid-json",
      name: "BridgeBodyError",
    }));
  });
});
