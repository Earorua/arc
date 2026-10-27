// @vitest-environment node
import { spawnSync } from "node:child_process";
import { basename, dirname, resolve } from "node:path";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureResponse } from "../../scripts/live-research/validation";

const KEY_URL = "https://openrouter.ai/api/v1/key";
const RESEARCH_URL = "https://openrouter.ai/api/v1/chat/completions";
const key = "synthetic-native-transport-key";
const safeKeyData = { data: { limit: 5, limit_remaining: 5, limit_reset: null, usage: 0,
  is_management_key: false, is_provisioning_key: false, byok_usage: 0, expires_at: null } };

type DispatcherInit = RequestInit & { dispatcher?: unknown };
type NativeTransport = Readonly<{
  fetch: typeof globalThis.fetch;
  destroy: () => Promise<void>;
}>;

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("undici");
  vi.resetModules();
});

async function createTransport(fetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis), timeoutMs = 1_200_000) {
  const { createNativeResearchTransport } = await import("../../scripts/live-research/native-transport.mjs") as {
    createNativeResearchTransport: (nativeFetch: typeof globalThis.fetch, timeout: number) => Promise<NativeTransport>;
  };
  return createNativeResearchTransport(fetch, timeoutMs);
}

function removeCreatedSummary(stdout: string) {
  const created = /^Summary: ([^\r\n]+)$/mu.exec(stdout)?.[1];
  if (!created) return;
  const outputPath = resolve(created);
  expect(dirname(outputPath)).toBe(resolve("outputs/live-research"));
  expect(basename(outputPath)).toMatch(/^summary-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/u);
  unlinkSync(outputPath);
}

describe("live Research native transport wiring", () => {
  it.each(["length", "complete"] as const)("scopes the dispatcher to the actual runner Research POST for a %s response", async (kind) => {
    const researchPayload = await fixtureResponse().json() as {
      choices: Array<{ finish_reason: string; message: { content: string } }>;
    };
    if (kind === "length") {
      researchPayload.choices[0]!.finish_reason = "length";
      researchPayload.choices[0]!.message.content = researchPayload.choices[0]!.message.content.slice(0, -1);
    }
    const script = [
      `const KEY_URL = ${JSON.stringify(KEY_URL)};`,
      `const RESEARCH_URL = ${JSON.stringify(RESEARCH_URL)};`,
      `const keyPayload = ${JSON.stringify(safeKeyData)};`,
      `const researchPayload = ${JSON.stringify(researchPayload)};`,
      "globalThis.fetch = async (url, init = {}) => {",
      "  if (url === KEY_URL) {",
      "    if (init.method !== 'GET' || init.dispatcher !== undefined) throw new Error('fixture-key-routing');",
      "    return Response.json(keyPayload);",
      "  }",
      "  if (url === RESEARCH_URL) {",
      "    if (init.method !== 'POST' || init.dispatcher === undefined) throw new Error('fixture-research-routing');",
      "    return Response.json(researchPayload);",
      "  }",
      "  throw new Error('fixture-destination-denied');",
      "};",
      "process.argv = ['node', 'runner', '--execute-one'];",
      "await import('./scripts/live-research/runner.mjs');",
    ].join("\n");
    const child = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      encoding: "utf8", input: key, timeout: 30_000,
    });
    try {
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(kind === "length" ? 1 : 0);
      expect(child.stdout).toContain(`"outcome": "${kind === "length" ? "incomplete" : "passed"}"`);
      if (kind === "length") {
        expect(child.stdout).toContain('"providerResultDiagnostic": {');
        expect(child.stdout).toContain('"finishReason": "length"');
      } else {
        expect(child.stdout).toContain('"runState": "ready"');
        expect(child.stdout).toContain('"planningGenerated": true');
      }
      expect(child.stdout).toContain('"costMicros": 100000');
      expect(child.stdout).toContain('"status": "settled"');
      expect(child.stdout).toContain('"settledMicros": 100000');
      expect(child.stdout).toContain('"realRequestCount": 2');
      expect(child.stdout).toContain('"researchRequestCount": 1');
      expect(child.stdout + child.stderr).not.toMatch(/synthetic-native-transport-key|fixture-/u);
    } finally {
      removeCreatedSummary(child.stdout);
    }
  }, 35_000);

  it("preserves the native GET init and response while adding one dispatcher only to the exact POST", async () => {
    const calls: Array<{ url: string | URL | Request; init?: DispatcherInit }> = [];
    const responses = [new Response("key"), new Response("research"), new Response("other")];
    const nativeFetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      calls.push({ url, init: init as DispatcherInit | undefined });
      return responses[calls.length - 1]!;
    });
    const scope = await createTransport(nativeFetch);
    const signal = new AbortController().signal;
    const getInit: DispatcherInit = { method: "GET", redirect: "error", headers: { authorization: "Bearer fixture" }, signal };
    const postInit: DispatcherInit = { method: "POST", redirect: "error", headers: { "content-type": "application/json" }, body: "{}", signal };
    try {
      await expect(scope.fetch(KEY_URL, getInit)).resolves.toBe(responses[0]);
      await expect(scope.fetch(RESEARCH_URL, postInit)).resolves.toBe(responses[1]);
      await expect(scope.fetch(`${RESEARCH_URL}?query=1`, postInit)).resolves.toBe(responses[2]);

      expect(calls[0]).toEqual({ url: KEY_URL, init: getInit });
      expect(calls[0]!.init).toBe(getInit);
      expect(calls[0]!.init!.dispatcher).toBeUndefined();
      expect(calls[1]!.url).toBe(RESEARCH_URL);
      expect(calls[1]!.init).not.toBe(postInit);
      expect(calls[1]!.init).toMatchObject({ method: "POST", redirect: "error", headers: postInit.headers,
        body: postInit.body, signal, dispatcher: expect.any(Object) });
      expect(calls[2]).toEqual({ url: `${RESEARCH_URL}?query=1`, init: postInit });
      expect(calls[2]!.init).toBe(postInit);
    } finally {
      await scope.destroy();
    }
  });

  it("rejects every non-fixed configuration before constructing an Agent", async () => {
    const construct = vi.fn();
    vi.doMock("undici", () => ({ Agent: class {
      constructor(options: unknown) { construct(options); }
      destroy() { return Promise.resolve(); }
    } }));
    await expect(createTransport(globalThis.fetch.bind(globalThis), 1_199_999)).rejects.toThrow("NATIVE_TRANSPORT_INVALID");
    await expect(createTransport(null as unknown as typeof globalThis.fetch)).rejects.toThrow("NATIVE_TRANSPORT_INVALID");
    expect(construct).not.toHaveBeenCalled();
  });

  it("constructs only the fixed 20-minute headers and body policy", async () => {
    const construct = vi.fn();
    const destroy = vi.fn(async () => undefined);
    vi.doMock("undici", () => ({ Agent: class {
      constructor(options: unknown) { construct(options); }
      destroy() { return destroy(); }
    } }));
    const scope = await createTransport(async () => new Response());
    expect(construct).toHaveBeenCalledExactlyOnceWith({ headersTimeout: 1_200_000, bodyTimeout: 1_200_000 });
    expect(construct.mock.calls[0]![0]).not.toHaveProperty("connect");
    expect(construct.mock.calls[0]![0]).not.toHaveProperty("interceptors");
    await scope.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("leaves the public global dispatcher and native Response identity unchanged in a clean process", () => {
    const script = [
      "const nativeFetch = globalThis.fetch.bind(globalThis);",
      "const NativeResponse = globalThis.Response;",
      "const { getGlobalDispatcher } = await import('undici');",
      "const before = getGlobalDispatcher();",
      "const { createNativeResearchTransport } = await import('./scripts/live-research/native-transport.mjs');",
      "const scope = await createNativeResearchTransport(nativeFetch, 1200000);",
      "const after = getGlobalDispatcher();",
      "const responseUnchanged = globalThis.Response === NativeResponse;",
      "await scope.destroy();",
      "process.stdout.write(JSON.stringify({ dispatcherUnchanged: before === after, responseUnchanged }));",
    ].join("\n");
    const child = spawnSync(process.execPath, ["--input-type=module", "--eval", script], { encoding: "utf8", timeout: 15_000 });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({ dispatcherUnchanged: true, responseUnchanged: true });
  }, 20_000);

  it("primes the cold native Response getter before dynamically importing public Undici", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "Response");
    if (!original) throw new Error("native-response-descriptor-unavailable");
    const order: string[] = [];
    Object.defineProperty(globalThis, "Response", { configurable: true, get() {
      order.push("native-response");
      return original.get ? original.get.call(globalThis) : original.value;
    } });
    vi.doMock("undici", () => {
      order.push("public-undici");
      return { Agent: class { destroy() { return Promise.resolve(); } } };
    });
    try {
      const scope = await createTransport(async () => new Response());
      await scope.destroy();
      expect(order.slice(0, 2)).toEqual(["native-response", "public-undici"]);
    } finally {
      Object.defineProperty(globalThis, "Response", original);
    }
  });

  it("allows delayed loopback headers and body through the selected Agent and closes every connection", async () => {
    let dispatcher: unknown;
    const scope = await createTransport(async (_url, init) => {
      dispatcher = (init as DispatcherInit).dispatcher;
      return new Response("captured");
    });
    await scope.fetch(RESEARCH_URL, { method: "POST" });
    const sockets = new Set<Socket>();
    let requestCount = 0;
    let response: ServerResponse | undefined;
    const server = createServer((_request, current) => {
      requestCount++;
      response = current;
      setTimeout(() => {
        current.writeHead(200, { "content-type": "text/plain" });
        current.write("delayed-");
        setTimeout(() => current.end("complete"), 40);
      }, 40);
    });
    server.on("connection", (socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    try {
      await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("loopback-address-unavailable");
      const received = await globalThis.fetch(`http://127.0.0.1:${address.port}/delayed`, { dispatcher } as DispatcherInit);
      await expect(received.text()).resolves.toBe("delayed-complete");
      expect(requestCount).toBe(1);
    } finally {
      response?.destroy();
      await scope.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      const closing = [...sockets].map((socket) =>
        new Promise<void>((resolveClosed) => socket.once("close", () => resolveClosed())));
      for (const socket of sockets) socket.destroy();
      await Promise.all(closing);
    }
    expect(sockets.size).toBe(0);
  }, 15_000);

  it.each(["headers", "body"] as const)("honors an external AbortSignal during delayed loopback %s", async (phase) => {
    let dispatcher: unknown;
    const scope = await createTransport(async (_url, init) => {
      dispatcher = (init as DispatcherInit).dispatcher;
      return new Response("captured");
    });
    await scope.fetch(RESEARCH_URL, { method: "POST" });
    const sockets = new Set<Socket>();
    let requestCount = 0;
    let signalRequest!: () => void;
    const requestReached = new Promise<void>((resolveReached) => { signalRequest = resolveReached; });
    const server = createServer((_request, response) => {
      requestCount++;
      if (phase === "body") { response.writeHead(200); response.write("partial"); response.flushHeaders(); }
      signalRequest();
    });
    server.on("connection", (socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("loopback-address-unavailable");
      const responsePending = globalThis.fetch(`http://127.0.0.1:${address.port}/${phase}`,
        { dispatcher, signal: controller.signal } as DispatcherInit);
      if (phase === "headers") {
        await requestReached;
        controller.abort();
        await expect(responsePending).rejects.toThrow();
      } else {
        await requestReached;
        const nativeResponse = await responsePending;
        reader = nativeResponse.body?.getReader();
        if (!reader) throw new Error("loopback-body-unavailable");
        const first = await reader.read();
        expect(first.done).toBe(false);
        expect(new TextDecoder().decode(first.value)).toBe("partial");
        const secondRead = reader.read();
        const secondReadFailure = expect(secondRead).rejects.toThrow();
        controller.abort();
        await secondReadFailure;
      }
      expect(controller.signal.aborted).toBe(true);
      expect(requestCount).toBe(1);
    } finally {
      if (reader) {
        try { await reader.cancel(); } catch { /* The abort can already have errored the stream. */ }
        try { reader.releaseLock(); } catch { /* A pending read would retain the lock. */ }
      }
      await scope.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      const closing = [...sockets].map((socket) =>
        new Promise<void>((resolveClosed) => socket.once("close", () => resolveClosed())));
      for (const socket of sockets) socket.destroy();
      await Promise.all(closing);
    }
    expect(sockets.size).toBe(0);
  }, 15_000);

  it("makes destroy idempotent and rejects a native cleanup failure", async () => {
    const failure = new Error("synthetic-destroy-failure");
    const destroy = vi.fn(async () => { throw failure; });
    vi.doMock("undici", () => ({ Agent: class { destroy() { return destroy(); } } }));
    const scope = await createTransport(async () => new Response());
    const first = scope.destroy();
    const second = scope.destroy();
    await expect(first).rejects.toBe(failure);
    await expect(second).rejects.toBe(failure);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("bounds a stalled destroy at 5 seconds and handles its later rejection", async () => {
    vi.useFakeTimers();
    let rejectDestroy!: (reason: Error) => void;
    const destroy = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectDestroy = reject; }));
    vi.doMock("undici", () => ({ Agent: class { destroy() { return destroy(); } } }));
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const scope = await createTransport(async () => new Response());
      const cleanup = scope.destroy();
      const assertion = expect(cleanup).rejects.toThrow("NATIVE_TRANSPORT_CLEANUP_TIMEOUT");
      await vi.advanceTimersByTimeAsync(4_999);
      expect(destroy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await assertion;
      rejectDestroy(new Error("synthetic-late-destroy-failure"));
      await vi.advanceTimersByTimeAsync(1);
      expect(unhandled).toEqual([]);
      await expect(scope.destroy()).rejects.toThrow("NATIVE_TRANSPORT_CLEANUP_TIMEOUT");
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("creates the scoped Agent only in the runner execute-one branch after strict profile validation", () => {
    const source = readFileSync("scripts/live-research/runner.mjs", "utf8");
    const helperSource = readFileSync("scripts/live-research/native-transport.mjs", "utf8");
    const executeBranch = source.indexOf("if (executeOne) {");
    const validateProfile = source.indexOf("getKimiLocalValidationProfile()", executeBranch);
    const createScope = source.indexOf("createNativeResearchTransport(outboundFetch, profile.researchTimeoutMs)", executeBranch);
    expect(executeBranch).toBeGreaterThan(-1);
    expect(validateProfile).toBeGreaterThan(executeBranch);
    expect(createScope).toBeGreaterThan(validateProfile);
    expect(source.match(/createNativeResearchTransport\(/gu)).toHaveLength(1);
    expect(source).toContain("let validationFetch = outboundFetch;");
    expect(source).toContain("await nativeTransport?.destroy()");
    expect(source).toContain('Live validation stopped (cleanup-incomplete).');
    expect(helperSource).not.toContain(".unref");
  });

  it("keeps non-Research modes Agent-free and closes Vite after profile or transport cleanup failure", () => {
    const fixtureRoot = mkdtempSync(resolve(tmpdir(), "arc-v8-native-runner-"));
    const scriptsDirectory = resolve(fixtureRoot, "scripts/live-research");
    const offlineDirectory = resolve(fixtureRoot, "tests/offline-uat");
    const marker = resolve(fixtureRoot, "lifecycle.txt");
    mkdirSync(scriptsDirectory, { recursive: true });
    mkdirSync(offlineDirectory, { recursive: true });
    writeFileSync(resolve(scriptsDirectory, "runner.mjs"), readFileSync("scripts/live-research/runner.mjs", "utf8"));
    writeFileSync(resolve(scriptsDirectory, "native-transport.mjs"), [
      "import { appendFileSync } from 'node:fs';",
      "appendFileSync(process.env.FIXTURE_MARKER, 'transport-import\\n');",
      "export async function createNativeResearchTransport(nativeFetch, timeoutMs) {",
      "  if (timeoutMs !== 1200000) throw new Error('bad-timeout');",
      "  appendFileSync(process.env.FIXTURE_MARKER, 'transport-create\\n');",
      "  return { fetch: nativeFetch, destroy: async () => {",
      "    appendFileSync(process.env.FIXTURE_MARKER, 'transport-destroy\\n');",
      "    if (process.env.FIXTURE_DESTROY_FAIL === '1') throw new Error('private-destroy-failure');",
      "  } };",
      "}",
    ].join("\n"));
    writeFileSync(resolve(offlineDirectory, "server.mjs"), [
      "import { appendFileSync } from 'node:fs';",
      "const mark = (value) => appendFileSync(process.env.FIXTURE_MARKER, value + '\\n');",
      "export async function createOfflineVite() {",
      "  mark('vite-create');",
      "  return { config: { cacheDir: null },",
      "    ssrLoadModule: async (id) => {",
      "      if (id.endsWith('/openrouter-provider.ts')) return { getKimiLocalValidationProfile: () => {",
      "        mark('profile-validate');",
      "        if (process.env.FIXTURE_INVALID_PROFILE === '1') throw new Error('private-profile-invalid');",
      "        return { researchTimeoutMs: 1200000 };",
      "      } };",
      "      if (id.endsWith('/validation.ts')) return { runValidation: async (options) => ({",
      "        mode: options.executeOne ? 'live-one' : options.checkKeyOnly ? 'key-check-only' : 'offline-dry-run',",
      "        timestamp: 'fixture-' + process.pid, outcome: 'passed', realRequestCount: 0 }) };",
      "      if (id.endsWith('/account-check.ts')) return { runAccountCheck: async () => ({",
      "        mode: 'account-check-only', timestamp: 'fixture-' + process.pid, outcome: 'completed', realRequestCount: 0 }) };",
      "      if (id.endsWith('/minimal-probe.ts')) return { runMinimalProbe: async () => ({",
      "        mode: 'minimal-probe', timestamp: 'fixture-' + process.pid, outcome: 'passed', realRequestCount: 0 }) };",
      "      throw new Error('fixture-module-denied');",
      "    },",
      "    close: async () => { mark('vite-close'); },",
      "  };",
      "}",
    ].join("\n"));
    const runnerUrl = pathToFileURL(resolve(scriptsDirectory, "runner.mjs")).href;
    const run = (args: string[], input: string, flags: Record<string, string> = {}) => {
      writeFileSync(marker, "");
      const script = `globalThis.fetch = async () => { throw new Error('external-fetch-denied'); }; process.argv = ${JSON.stringify(["node", "runner", ...args])}; await import(${JSON.stringify(runnerUrl)});`;
      const child = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
        encoding: "utf8", input, timeout: 15_000,
        env: { NODE_ENV: "test", SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP,
          FIXTURE_MARKER: marker, ...flags },
      });
      return { child, events: readFileSync(marker, "utf8").trim().split(/\r?\n/u).filter(Boolean) };
    };
    try {
      for (const [args, input, outcome] of [
        [[], "", "passed"],
        [["--check-key-only"], key, "passed"],
        [["--check-account-only"], key, "completed"],
        [["--probe-minimal"], key, "passed"],
      ] as const) {
        const { child, events } = run([...args], input);
        expect(child.error).toBeUndefined();
        expect(child.status, JSON.stringify({ args, stderr: child.stderr, events })).toBe(0);
        expect(child.stdout).toContain(`"outcome": "${outcome}"`);
        expect(events).toEqual(["vite-create", "vite-close"]);
      }

      for (const [args, input] of [
        [["--unknown"], ""],
        [["--execute-one"], "malformed synthetic input"],
      ] as const) {
        const rejected = run([...args], input);
        expect(rejected.child.status).toBe(1);
        expect(rejected.child.stdout).not.toContain("Summary:");
        expect(rejected.events).toEqual([]);
      }

      const invalid = run(["--execute-one"], key, { FIXTURE_INVALID_PROFILE: "1" });
      expect(invalid.child.status).toBe(1);
      expect(invalid.child.stdout).not.toContain("Summary:");
      expect(invalid.child.stderr).toContain("validation-incomplete");
      expect(invalid.child.stdout + invalid.child.stderr).not.toContain("private-profile-invalid");
      expect(invalid.events).toEqual(["vite-create", "profile-validate", "vite-close"]);

      const cleanupFailure = run(["--execute-one"], key, { FIXTURE_DESTROY_FAIL: "1" });
      expect(cleanupFailure.child.status).toBe(1);
      expect(cleanupFailure.child.stdout).toContain('"outcome": "passed"');
      expect(cleanupFailure.child.stdout).toContain("Summary:");
      expect(cleanupFailure.child.stderr).toContain("cleanup-incomplete");
      expect(cleanupFailure.child.stdout + cleanupFailure.child.stderr).not.toContain("private-destroy-failure");
      expect(cleanupFailure.events).toEqual(["vite-create", "profile-validate", "transport-import",
        "transport-create", "transport-destroy", "vite-close"]);
    } finally {
      const resolvedFixtureRoot = resolve(fixtureRoot);
      expect(dirname(resolvedFixtureRoot)).toBe(resolve(tmpdir()));
      expect(basename(resolvedFixtureRoot)).toMatch(/^arc-v8-native-runner-/u);
      rmSync(resolvedFixtureRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
