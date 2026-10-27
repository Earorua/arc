// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { signBridgeMessage, verifyBridgeMessage } from "../../app/server/research/executor/auth";
import { readResearchBridgeConnection, type ResearchBridgeEnvironment } from "../../app/server/research/executor/connection-config";
import { createResearchServiceBindingFetch, resolveResearchBridgeFetch,
  type ResearchBridgeTarget, type ResearchServiceBinding } from "../../app/server/research/executor/service-binding-transport";
import { TEST_BRIDGE_ENVIRONMENT } from "../helpers/research-bridge-fixture";

const connection = readResearchBridgeConnection(TEST_BRIDGE_ENVIRONMENT)!;
const unavailable = "Research bridge transport unavailable";
const paths = {
  executor: ["submit", "status", "close", "result", "acknowledge"].map(operation => `/internal/research-bridge/${operation}`),
  site: ["begin", "accepted", "complete", "metadata", "maintenance", "outbox"].map(operation => `/api/internal/research-bridge/${operation}`),
};
const origin = (target: ResearchBridgeTarget) => target === "site" ? connection.siteOrigin : connection.executorOrigin;
function request(url = `${connection.executorOrigin}${paths.executor[0]}`, init: RequestInit = {}) {
  return new Request(url, { method: "POST", redirect: "manual", body: "{}", ...init });
}
function binding() { return { fetch: vi.fn(async (_request: Request) => new Response("{}")) }; }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("production service-binding selection", () => {
  it("preserves legacy override/global selection only when mode is absent", () => {
    const legacy = vi.fn(); const global = vi.fn(); vi.stubGlobal("fetch", global);
    expect(resolveResearchBridgeFetch({}, connection, "executor", legacy)).toBe(legacy);
    expect(resolveResearchBridgeFetch({}, connection, "site")).toBe(global);
    expect(resolveResearchBridgeFetch({}, connection, "site", "bad" as never)).toBeNull();
    vi.stubGlobal("fetch", undefined);
    expect(resolveResearchBridgeFetch({}, connection, "site")).toBeNull();
  });

  it.each(["site", "executor"] as const)("selects only the %s binding without admission or Provider configuration", async target => {
    const selected = binding(); const other = binding(); const fallback = vi.fn();
    vi.stubGlobal("fetch", fallback);
    const environment = { ARC_AI_RESEARCH_BRIDGE_TRANSPORT: "service-binding-v1",
      ARC_RESEARCH_SITE: target === "site" ? selected : other,
      ARC_RESEARCH_EXECUTOR: target === "executor" ? selected : other,
      get OPENROUTER_API_KEY(): never { throw new Error("must not read Provider key"); } };
    const transport = resolveResearchBridgeFetch(environment, connection, target, fallback)!;
    await transport(request(`${origin(target)}${paths[target][0]}`));
    expect(selected.fetch).toHaveBeenCalledOnce(); expect(other.fetch).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it.each([undefined, null, {}, { fetch: "bad" }, { get fetch(): never { throw new Error("secret"); } }])(
    "fails closed for a missing or invalid private binding", value => {
      const fallback = vi.fn(); vi.stubGlobal("fetch", fallback);
      const environment = { ARC_AI_RESEARCH_BRIDGE_TRANSPORT: "service-binding-v1", ARC_RESEARCH_EXECUTOR: value,
        ARC_RESEARCH_SITE: binding() } as unknown as ResearchBridgeEnvironment;
      expect(resolveResearchBridgeFetch(environment, connection, "executor", fallback)).toBeNull();
      expect(fallback).not.toHaveBeenCalled();
    });

  it.each(["", "SERVICE-BINDING-V1", "service-binding-v2", "https", null, 1])("rejects unknown mode %j without fallback", mode => {
    const fallback = vi.fn(); vi.stubGlobal("fetch", fallback);
    expect(resolveResearchBridgeFetch({ ARC_AI_RESEARCH_BRIDGE_TRANSPORT: mode,
      ARC_RESEARCH_EXECUTOR: binding() } as ResearchBridgeEnvironment, connection, "executor", fallback)).toBeNull();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("rejects invalid target and canonical peer origin without echoing values", () => {
    const environment = { ARC_AI_RESEARCH_BRIDGE_TRANSPORT: "service-binding-v1", ARC_RESEARCH_EXECUTOR: binding() };
    for (const mode of [undefined, "service-binding-v1"]) {
      expect(resolveResearchBridgeFetch({ ...environment, ARC_AI_RESEARCH_BRIDGE_TRANSPORT: mode }, connection, "wrong" as never)).toBeNull();
    }
    for (const peer of ["http://executor.test", "https://secret@executor.test", "https://executor.test/",
      "https://executor.test/path", "https://executor.test?secret", "https://executor.test#secret", `https://${"x".repeat(250)}.test`]) {
      expect(resolveResearchBridgeFetch(environment, { ...connection, executorOrigin: peer }, "executor")).toBeNull();
      expect(() => createResearchServiceBindingFetch(binding(), peer, "executor")).toThrow(unavailable);
    }
    expect(() => createResearchServiceBindingFetch(binding(), connection.executorOrigin, "wrong" as never)).toThrow(unavailable);
    expect(() => createResearchServiceBindingFetch({ fetch: null } as never, connection.executorOrigin, "executor")).toThrow(unavailable);
  });
});

describe("bounded private service-binding adapter", () => {
  it.each(["site", "executor"] as const)("preserves exact signed bytes, headers, URL and receiver for all %s routes", async target => {
    const controller = new AbortController();
    const body = new TextEncoder().encode('{ "message": "桥接", "order": [2, 1] }\n');
    const credential = target === "site" ? connection.executorToSite : connection.siteToExecutor;
    const direction = target === "site" ? "executor-to-site" : "site-to-executor";
    let forwarded: Request | undefined;
    const service: ResearchServiceBinding = { async fetch(value) {
      expect(this).toBe(service); forwarded = value;
      expect(new Uint8Array(await value.arrayBuffer())).toEqual(body);
      return new Response("ok");
    } };
    const transport = createResearchServiceBindingFetch(service, origin(target), target);
    for (const path of paths[target]) {
      const jobId = path.endsWith("maintenance") || path.endsWith("outbox") ? "collection" : "11111111-1111-4111-8111-111111111111";
      const context = { direction, kind: "request", method: "POST", path, audience: origin(target), jobId, status: null } as const;
      const headers = await signBridgeMessage({ context, body, keyId: credential.keyId, keyBytes: credential.copyKeyBytes(), now: () => 1_800_000_000_000 });
      headers.set("x-arc-bridge-job-id", jobId);
      const original = request(`${origin(target)}${path}`, { body, headers, signal: controller.signal });
      expect(await (await transport(original)).text()).toBe("ok");
      expect(forwarded).not.toBe(original); expect(forwarded!.url).toBe(original.url);
      expect(forwarded!.redirect).toBe("manual"); expect([...forwarded!.headers]).toEqual([...headers]);
      await verifyBridgeMessage({ context, body, headers: forwarded!.headers, keyId: credential.keyId,
        keyBytes: credential.copyKeyBytes(), nonces: { claim: async () => true }, now: () => 1_800_000_000_000 });
    }
    controller.abort(); expect(forwarded!.signal.aborted).toBe(true);
  });

  it.each([
    ["wrong origin", "https://other.test/internal/research-bridge/submit", {}],
    ["http", "http://executor.test/internal/research-bridge/submit", {}],
    ["query", "https://executor.test/internal/research-bridge/submit?secret=1", {}],
    ["fragment", "https://executor.test/internal/research-bridge/submit#secret", {}],
    ["unknown route", "https://executor.test/internal/research-bridge/unknown", {}],
    ["wrong direction", "https://executor.test/api/internal/research-bridge/begin", {}],
    ["method", undefined, { method: "PUT" }],
    ["redirect", undefined, { redirect: "follow" }],
    ["Origin header", undefined, { headers: { Origin: "https://site.test" } }],
  ] as const)("rejects %s before forwarding", async (_label, url, init) => {
    const service = binding(); const transport = createResearchServiceBindingFetch(service, connection.executorOrigin, "executor");
    await expect(transport(request(url, init))).rejects.toThrow(unavailable);
    expect(service.fetch).not.toHaveBeenCalled();
  });

  it("rejects non-Request inputs and a second init argument", async () => {
    const service = binding(); const transport = createResearchServiceBindingFetch(service, connection.executorOrigin, "executor");
    await expect(transport(request().url)).rejects.toThrow(unavailable);
    await expect(transport(new URL(request().url))).rejects.toThrow(unavailable);
    await expect(transport(request(), {})).rejects.toThrow(unavailable);
    expect(service.fetch).not.toHaveBeenCalled();
  });

  it("accepts 4096 bytes and cancels an oversized body before forwarding", async () => {
    const service = binding(); const transport = createResearchServiceBindingFetch(service, connection.executorOrigin, "executor");
    await transport(request(undefined, { body: new Uint8Array(4096) }));
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4097)); }, cancel });
    await expect(transport(request(undefined, { body, duplex: "half" } as RequestInit))).rejects.toThrow(unavailable);
    expect(cancel).toHaveBeenCalledOnce(); expect(service.fetch).toHaveBeenCalledOnce();
  });

  it("bounds a stalled body to five seconds and cancels it", async () => {
    vi.useFakeTimers(); const cancel = vi.fn(); const service = binding();
    const transport = createResearchServiceBindingFetch(service, connection.executorOrigin, "executor");
    const pending = transport(request(undefined, { body: new ReadableStream({ cancel }), duplex: "half" } as RequestInit));
    const assertion = expect(pending).rejects.toThrow(unavailable);
    await vi.advanceTimersByTimeAsync(5000); await assertion;
    expect(cancel).toHaveBeenCalledOnce(); expect(service.fetch).not.toHaveBeenCalled();
  });

  it.each(["before", "during"])("cancels an aborted request %s body read without forwarding", async when => {
    const controller = new AbortController(); const cancel = vi.fn(); const service = binding();
    const transport = createResearchServiceBindingFetch(service, connection.executorOrigin, "executor");
    if (when === "before") controller.abort(new Error("private abort reason"));
    const pending = transport(request(undefined, { body: new ReadableStream({ cancel }), duplex: "half", signal: controller.signal } as RequestInit));
    if (when === "during") controller.abort(new Error("private abort reason"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError", message: unavailable });
    expect(cancel).toHaveBeenCalledOnce(); expect(service.fetch).not.toHaveBeenCalled();
  });

  it.each([300, 301, 302, 307, 308, 399, "redirected"])("cancels and rejects response %s", async status => {
    const cancel = vi.fn(); const response = new Response(new ReadableStream({ cancel }), { status: typeof status === "number" ? status : 200 });
    if (status === "redirected") Object.defineProperty(response, "redirected", { value: true });
    const service = { fetch: vi.fn(async () => response) };
    await expect(createResearchServiceBindingFetch(service, connection.executorOrigin, "executor")(request())).rejects.toThrow(unavailable);
    expect(cancel).toHaveBeenCalledOnce(); expect(service.fetch).toHaveBeenCalledOnce();
  });

  it("cancels a late binding response after abort and preserves the forwarded signal", async () => {
    const controller = new AbortController(); const cancel = vi.fn();
    let entered!: () => void; const ready = new Promise<void>(resolve => { entered = resolve; });
    let finish!: (response: Response) => void;
    const service = { fetch: vi.fn(async (value: Request) => {
      entered(); const response = await new Promise<Response>(resolve => { finish = resolve; });
      expect(value.signal.aborted).toBe(true); return response;
    }) };
    const pending = createResearchServiceBindingFetch(service, connection.executorOrigin, "executor")(request(undefined, { signal: controller.signal }));
    await ready; controller.abort(); finish(new Response(new ReadableStream({ cancel })));
    await expect(pending).rejects.toMatchObject({ name: "AbortError", message: unavailable });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([new Error("private key material"), new DOMException("private reason", "AbortError")])("sanitizes binding errors without retry", async error => {
    const service = { fetch: vi.fn(async () => { throw error; }) };
    await expect(createResearchServiceBindingFetch(service, connection.executorOrigin, "executor")(request())).rejects.toThrow(/^Research bridge transport unavailable$/u);
    expect(service.fetch).toHaveBeenCalledOnce();
  });
});
