// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as diagnosticModule from "../../scripts/live-research/fetch-diagnostic";
import { createGuardedTransport, SafeValidationError } from "../../scripts/live-research/transport";

const KEY_URL = "https://openrouter.ai/api/v1/key";
const RESEARCH_URL = "https://openrouter.ai/api/v1/chat/completions";
const key = "synthetic-native-fetch-diagnostic";
const safeKeyData = { data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0, is_management_key: false,
  is_provisioning_key: false, byok_usage: 0, expires_at: null } };

const request = () => ({
  method: "POST",
  redirect: "error" as const,
  headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: '{"CANARY-request-body":"unchanged"}',
});

function safeFailure(promise: Promise<Response>) {
  return promise.then(
    () => { throw new Error("expected guarded failure"); },
    (error: unknown) => error,
  );
}

function expectTransportDenied(error: unknown) {
  expect(error).toBeInstanceOf(SafeValidationError);
  expect(error).toMatchObject({ name: "SafeValidationError", code: "transport-denied", message: "transport-denied" });
  expect(error).not.toHaveProperty("cause");
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("GLOBAL-FETCH-DENIED"); }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("guarded Research native fetch observation", () => {
  it("observes one synthetic headers timeout after a real guarded key GET while preserving the safe error", async () => {
    const nativeError = Object.assign(new Error("CANARY-secret-message"), {
      cause: { code: "UND_ERR_HEADERS_TIMEOUT", privateToken: "CANARY-secret-token" },
    });
    const injectedFetch = vi.fn<typeof globalThis.fetch>((url) => {
      if (url === KEY_URL) return Promise.resolve(Response.json(safeKeyData));
      throw nativeError;
    });
    const observer = vi.fn();
    const transport = createGuardedTransport(key, injectedFetch, { onResearchFetchDiagnostic: observer });
    await transport.inspectKey();

    const error = await safeFailure(transport.fetch(RESEARCH_URL, request()));

    expectTransportDenied(error);
    expect(observer).toHaveBeenCalledOnce();
    expect(observer).toHaveBeenCalledWith({ version: "native-fetch-diagnostic-v1", kind: "headers-timeout" });
    expect(Object.isFrozen(observer.mock.calls[0]![0])).toBe(true);
    expect(transport.counts()).toEqual({ getCount: 1, postCount: 1, keyHttpStatus: 200, researchHttpStatus: null });
    await expect(transport.fetch(RESEARCH_URL, request())).rejects.toMatchObject({ name: "SafeValidationError", code: "transport-denied" });
    expect(observer).toHaveBeenCalledOnce();
    expect(injectedFetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(observer.mock.calls)).not.toContain("CANARY");
  });

  it("forwards the exact Research URL and init object without changing its body or headers", async () => {
    let capturedUrl: string | URL | Request | undefined;
    let capturedInit: RequestInit | undefined;
    const injectedFetch = vi.fn<typeof globalThis.fetch>((url, init) => {
      if (url === KEY_URL) return Promise.resolve(Response.json(safeKeyData));
      capturedUrl = url;
      capturedInit = init;
      return Promise.reject(Object.assign(new Error("CANARY"), { code: "ECONNRESET" }));
    });
    const observer = vi.fn();
    const transport = createGuardedTransport(key, injectedFetch, { onResearchFetchDiagnostic: observer });
    await transport.inspectKey();
    const init = request();

    expectTransportDenied(await safeFailure(transport.fetch(RESEARCH_URL, init)));
    expect(capturedUrl).toBe(RESEARCH_URL);
    expect(capturedInit).toBe(init);
    expect(capturedInit?.body).toBe('{"CANARY-request-body":"unchanged"}');
    expect(capturedInit?.headers).toBe(init.headers);
    expect(observer).toHaveBeenCalledWith({ version: "native-fetch-diagnostic-v1", kind: "socket" });
  });

  it.each([
    ["throws", () => { throw new Error("CANARY-observer-throw"); }],
    ["rejects", () => Promise.reject(new Error("CANARY-observer-reject"))],
    ["stays pending", () => new Promise<never>(() => undefined)],
  ] as const)("keeps the original failure when the observer %s", async (_label, observer) => {
    const injectedFetch = vi.fn<typeof globalThis.fetch>((url) => url === KEY_URL
      ? Promise.resolve(Response.json(safeKeyData))
      : Promise.reject(Object.assign(new Error("CANARY-native"), { code: "ETIMEDOUT" })));
    const transport = createGuardedTransport(key, injectedFetch, { onResearchFetchDiagnostic: observer });
    await transport.inspectKey();

    const outcome = await Promise.race([
      safeFailure(transport.fetch(RESEARCH_URL, request())),
      new Promise<"observer-was-awaited">((resolve) => setTimeout(() => resolve("observer-was-awaited"), 50)),
    ]);
    expect(outcome).not.toBe("observer-was-awaited");
    expectTransportDenied(outcome);
    expect(transport.counts()).toMatchObject({ getCount: 1, postCount: 1 });
  });

  it.each([
    ["undefined", undefined],
    ["a truthy non-function", { invalid: true } as unknown as (diagnostic: unknown) => unknown],
  ] as const)("does not inspect the exception when the observer is %s", async (_label, observer) => {
    let reflectionCalls = 0;
    const untrusted = new Proxy({}, {
      getOwnPropertyDescriptor() { reflectionCalls++; throw new Error("CANARY-reflection"); },
      getPrototypeOf() { reflectionCalls++; throw new Error("CANARY-reflection"); },
    });
    const injectedFetch = vi.fn<typeof globalThis.fetch>((url) => url === KEY_URL
      ? Promise.resolve(Response.json(safeKeyData))
      : Promise.reject(untrusted));
    const transport = createGuardedTransport(key, injectedFetch, { onResearchFetchDiagnostic: observer });
    await transport.inspectKey();

    expectTransportDenied(await safeFailure(transport.fetch(RESEARCH_URL, request())));
    expect(reflectionCalls).toBe(0);
  });

  it("falls back to other after classifier reflection failure", async () => {
    const untrusted = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("CANARY-reflection"); } });
    const injectedFetch = vi.fn<typeof globalThis.fetch>((url) => url === KEY_URL
      ? Promise.resolve(Response.json(safeKeyData)) : Promise.reject(untrusted));
    const observer = vi.fn();
    const transport = createGuardedTransport(key, injectedFetch, { onResearchFetchDiagnostic: observer });
    await transport.inspectKey();

    expectTransportDenied(await safeFailure(transport.fetch(RESEARCH_URL, request())));
    expect(observer).toHaveBeenCalledWith({ version: "native-fetch-diagnostic-v1", kind: "other" });
  });

  it("drops an observer call when projection rejects or throws", async () => {
    const injectedFetch = vi.fn<typeof globalThis.fetch>((url) => url === KEY_URL
      ? Promise.resolve(Response.json(safeKeyData))
      : Promise.reject(Object.assign(new Error("CANARY-native"), { code: "ENOTFOUND" })));
    const observer = vi.fn();

    for (const implementation of [() => null, () => { throw new Error("CANARY-projector"); }]) {
      vi.spyOn(diagnosticModule, "projectNativeFetchDiagnostic").mockImplementationOnce(implementation);
      const transport = createGuardedTransport(key, injectedFetch, { onResearchFetchDiagnostic: observer });
      await transport.inspectKey();
      expectTransportDenied(await safeFailure(transport.fetch(RESEARCH_URL, request())));
      transport.clear();
    }
    expect(observer).not.toHaveBeenCalled();
  });

  it("can emit other if classification itself throws", async () => {
    const originalBuild = diagnosticModule.buildNativeFetchDiagnostic;
    vi.spyOn(diagnosticModule, "buildNativeFetchDiagnostic")
      .mockImplementationOnce(() => { throw new Error("CANARY-classifier"); })
      .mockImplementation(originalBuild);
    const injectedFetch = vi.fn<typeof globalThis.fetch>((url) => url === KEY_URL
      ? Promise.resolve(Response.json(safeKeyData)) : Promise.reject(new Error("CANARY-native")));
    const observer = vi.fn();
    const transport = createGuardedTransport(key, injectedFetch, { onResearchFetchDiagnostic: observer });
    await transport.inspectKey();

    expectTransportDenied(await safeFailure(transport.fetch(RESEARCH_URL, request())));
    expect(observer).toHaveBeenCalledWith({ version: "native-fetch-diagnostic-v1", kind: "other" });
  });

  it("closes observation and releases the callback before a pending Research rejection settles", async () => {
    let rejectResearch!: (reason: unknown) => void;
    let reflectionCalls = 0;
    const lateRejection = new Proxy({}, {
      getOwnPropertyDescriptor() { reflectionCalls++; throw new Error("CANARY-late-descriptor"); },
      getPrototypeOf() { reflectionCalls++; throw new Error("CANARY-late-prototype"); },
    });
    const classifier = vi.spyOn(diagnosticModule, "buildNativeFetchDiagnostic");
    const injectedFetch = vi.fn<typeof globalThis.fetch>((url) => url === KEY_URL
      ? Promise.resolve(Response.json(safeKeyData))
      : new Promise<Response>((_resolve, reject) => { rejectResearch = reject; }));
    const observer = vi.fn();
    const transport = createGuardedTransport(key, injectedFetch, { onResearchFetchDiagnostic: observer });
    await transport.inspectKey();
    const pending = transport.fetch(RESEARCH_URL, request());

    transport.clear();
    rejectResearch(lateRejection);

    expectTransportDenied(await safeFailure(pending));
    expect(classifier).not.toHaveBeenCalled();
    expect(reflectionCalls).toBe(0);
    expect(observer).not.toHaveBeenCalled();
    expect(transport.counts()).toMatchObject({ getCount: 1, postCount: 1 });
    await expect(transport.fetch(RESEARCH_URL, request())).rejects.toMatchObject({ code: "transport-denied" });
  });
});

describe("excluded guarded transport paths", () => {
  it("does not observe a key GET rejection", async () => {
    const observer = vi.fn();
    const transport = createGuardedTransport(key, () => Promise.reject(new Error("CANARY-key")), {
      onResearchFetchDiagnostic: observer,
    });
    await expect(transport.inspectKey()).rejects.toMatchObject({ name: "SafeValidationError", code: "key-check-failed" });
    expect(observer).not.toHaveBeenCalled();
  });

  it("does not observe prefetch guard denials", async () => {
    const injectedFetch = vi.fn<typeof globalThis.fetch>(() => Promise.resolve(Response.json(safeKeyData)));
    const observer = vi.fn();
    const transport = createGuardedTransport(key, injectedFetch, { onResearchFetchDiagnostic: observer });
    await expect(transport.fetch(RESEARCH_URL, request())).rejects.toMatchObject({ code: "transport-denied" });
    await expect(transport.fetch("https://canary.invalid/private", request())).rejects.toMatchObject({ code: "transport-denied" });
    expect(observer).not.toHaveBeenCalled();
    expect(injectedFetch).not.toHaveBeenCalled();
  });

  it.each(["302", "redirected"] as const)("does not observe a returned %s response denial", async (kind) => {
    const injectedFetch = vi.fn<typeof globalThis.fetch>((url) => {
      if (url === KEY_URL) return Promise.resolve(Response.json(safeKeyData));
      if (kind === "302") return Promise.resolve(new Response("CANARY", { status: 302 }));
      const response = new Response("CANARY", { status: 200 });
      Object.defineProperty(response, "redirected", { value: true });
      return Promise.resolve(response);
    });
    const observer = vi.fn();
    const transport = createGuardedTransport(key, injectedFetch, { onResearchFetchDiagnostic: observer });
    await transport.inspectKey();
    await expect(transport.fetch(RESEARCH_URL, request())).rejects.toMatchObject({ code: "transport-denied" });
    expect(observer).not.toHaveBeenCalled();
  });

  it("does not observe successful HTTP or a later reader rejection", async () => {
    const stream = new ReadableStream<Uint8Array>({ pull() { throw new Error("CANARY-reader"); } });
    const injectedFetch = vi.fn<typeof globalThis.fetch>((url) => url === KEY_URL
      ? Promise.resolve(Response.json(safeKeyData)) : Promise.resolve(new Response(stream, { status: 200 })));
    const observer = vi.fn();
    const transport = createGuardedTransport(key, injectedFetch, { onResearchFetchDiagnostic: observer });
    await transport.inspectKey();

    const response = await transport.fetch(RESEARCH_URL, request());
    await expect(response.body!.getReader().read()).rejects.toThrow("CANARY-reader");
    expect(observer).not.toHaveBeenCalled();
    expect(transport.counts()).toEqual({ getCount: 1, postCount: 1, keyHttpStatus: 200, researchHttpStatus: 200 });
  });

  it("classifies an undifferentiated native redirect:error rejection only as other", async () => {
    const injectedFetch = vi.fn<typeof globalThis.fetch>((url) => url === KEY_URL
      ? Promise.resolve(Response.json(safeKeyData)) : Promise.reject(new TypeError("CANARY-redirect blocked")));
    const observer = vi.fn();
    const transport = createGuardedTransport(key, injectedFetch, { onResearchFetchDiagnostic: observer });
    await transport.inspectKey();

    expectTransportDenied(await safeFailure(transport.fetch(RESEARCH_URL, request())));
    expect(observer).toHaveBeenCalledWith({ version: "native-fetch-diagnostic-v1", kind: "other" });
  });
});
