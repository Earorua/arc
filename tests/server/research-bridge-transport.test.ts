// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../../app/server/research/execution-policy";
import { signBridgeMessage, verifyBridgeMessage, type BridgeMessageContext } from "../../app/server/research/executor/auth";
import { parseBridgeBeginGrant } from "../../app/server/research/executor/begin";
import { encodeBridgeDto, parseAcceptedProof, parseReceiptNotice } from "../../app/server/research/executor/bridge-contract";
import { readResearchBridgeConnection } from "../../app/server/research/executor/connection-config";
import { CLOSED_PREFLIGHT_JOB_ID, parseClosedPreflightReply, parseClosedPreflightRequest } from "../../app/server/research/executor/closed-preflight";
import { D1BridgeNonceStore } from "../../app/server/research/executor/d1-nonce-store";
import { ExecutorBridgeClient } from "../../app/server/research/executor/executor-client";
import { BridgeTransport, BridgeTransportError } from "../../app/server/research/executor/http-transport";
import { hashBridgeJob, parseBridgeJob, type BridgeJob } from "../../app/server/research/executor/job";
import { encodeBridgeProviderReceipt, hashBridgeProviderReceipt, parseBridgeProviderReceipt, summarizeBridgeProviderReceipt } from "../../app/server/research/executor/receipt";
import { PublicOperationScope } from "../../app/server/research/public-operation-scope";
import { createGuardedD1 } from "../../app/server/research/site-bridge-factory";
import { SiteBridgeClient } from "../../worker/research-executor/site-client";
import { createResearchD1 } from "../helpers/sqlite-d1";
import { createSiteAdmissionFixture } from "../helpers/site-admission-fixture";

const WALL_NOW = 1_800_000_000_000;
const SITE_ORIGIN = "https://site.example";
const EXECUTOR_ORIGIN = "https://executor.example";
const encoder = new TextEncoder();

function connection() {
  const value = readResearchBridgeConnection({
    BETTER_AUTH_URL: SITE_ORIGIN,
    ARC_AI_RESEARCH_EXECUTOR_URL: EXECUTOR_ORIGIN,
    ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID: "testSite",
    ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX: "11".repeat(32),
    ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID: "testExecutor",
    ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX: "22".repeat(32),
  });
  if (!value) throw new Error("test connection invalid");
  return value;
}

async function genuineJob(): Promise<BridgeJob> {
  const fixture = createSiteAdmissionFixture();
  try { return parseBridgeJob((await fixture.createRemote()).execution.job); }
  finally { fixture.db.close(); }
}

async function grantFor(job: BridgeJob) {
  const beganAt = job.createdAt + 1_000;
  return parseBridgeBeginGrant({
    protocol: "arc-research-bridge-v1",
    jobId: job.jobId,
    requestHash: await hashBridgeJob(job),
    beganAt,
    executionExpiresAt: beganAt + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
  });
}

async function receiptFor(job: BridgeJob) {
  const grant = await grantFor(job);
  return parseBridgeProviderReceipt({
    grant,
    producedAt: grant.beganAt + 10,
    latencyMs: 10,
    outcome: { kind: "error", code: "timeout", retryable: true, charged: "unknown", actualModel: null, usage: null },
  });
}

function route(pathname: string) {
  return pathname.split("/").at(-1)!;
}

function responseContext(requestContext: BridgeMessageContext, status: number): BridgeMessageContext {
  return { ...requestContext, kind: "response", status };
}

afterEach(() => vi.restoreAllMocks());

describe("research bridge transport and clients", () => {
  it("authenticates the fixed closed-preflight route and rejects tampering, replay and unsigned success", async () => {
    const conn = connection();
    const db = createResearchD1();
    const jobId = CLOSED_PREFLIGHT_JOB_ID;
    const body = encoder.encode(JSON.stringify({ executorClosed: true, jobAbsent: true, siteOutboxEmpty: true }));
    let headers: Headers | undefined;
    let mode = "valid";
    const fetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe("/internal/research-bridge/closed-preflight");
      headers ??= await signBridgeMessage({ context: { direction: "site-to-executor", kind: "response", method: "POST",
        path: "/internal/research-bridge/closed-preflight", audience: conn.executorOrigin, jobId, status: 200 },
        body, keyId: conn.siteToExecutor.keyId, keyBytes: conn.siteToExecutor.copyKeyBytes(), now: () => WALL_NOW });
      return new Response(mode === "tampered" ? encoder.encode("{}") : body,
        { status: 200, headers: mode === "unsigned" ? {} : headers });
    });
    const transport = new BridgeTransport({ connection: conn, nonces: new D1BridgeNonceStore(db as unknown as D1Database),
      fetch, wallNow: () => WALL_NOW, monoNow: () => 0 });
    const options = { target: "executor" as const, operation: "closed-preflight" as const,
      prepare: () => ({ jobId, body: encoder.encode("{}") }), decode: (bytes: Uint8Array) => parseClosedPreflightReply(JSON.parse(new TextDecoder().decode(bytes))) };
    try {
      expect(await transport.request(options)).toEqual({ executorClosed: true, jobAbsent: true, siteOutboxEmpty: true });
      await expect(transport.request(options)).rejects.toMatchObject({ kind: "authentication" });
      mode = "tampered";
      await expect(transport.request(options)).rejects.toMatchObject({ kind: "authentication" });
      mode = "unsigned";
      await expect(transport.request(options)).rejects.toMatchObject({ kind: "authentication" });
      await expect(transport.request({ ...options, target: "site" })).rejects.toMatchObject({ kind: "protocol" });
      await expect(transport.request({ ...options, operation: "unknown" as never })).rejects.toMatchObject({ kind: "protocol" });
      expect(fetch).toHaveBeenCalledTimes(4);
    } finally { db.close(); }
  });

  it.each(["wrong-path", "wrong-direction", "false", "extra-key"])("rejects a closed-preflight %s signed reply", async mode => {
    const conn = connection(); const nonces = { claim: vi.fn().mockResolvedValue(true) };
    const value = { executorClosed: true, jobAbsent: true, siteOutboxEmpty: mode === "false" ? false : true,
      ...(mode === "extra-key" ? { extra: true } : {}) };
    const body = encoder.encode(JSON.stringify(value));
    const headers = await signBridgeMessage({ context: { direction: mode === "wrong-direction" ? "executor-to-site" : "site-to-executor",
      kind: "response", method: "POST", path: mode === "wrong-path" ? "/internal/research-bridge/status" : "/internal/research-bridge/closed-preflight",
      audience: conn.executorOrigin, jobId: CLOSED_PREFLIGHT_JOB_ID, status: 200 },
      body, keyId: conn.siteToExecutor.keyId, keyBytes: conn.siteToExecutor.copyKeyBytes(), now: () => WALL_NOW });
    const transport = new BridgeTransport({ connection: conn, nonces, fetch: async () => new Response(body, { headers }),
      wallNow: () => WALL_NOW, monoNow: () => 0 });
    await expect(transport.request({ target: "executor", operation: "closed-preflight",
      prepare: () => ({ jobId: CLOSED_PREFLIGHT_JOB_ID, body: encoder.encode("{}") }),
      decode: bytes => parseClosedPreflightReply(JSON.parse(new TextDecoder().decode(bytes))) }))
      .rejects.toMatchObject({ kind: mode.startsWith("wrong") ? "authentication" : "protocol" });
    expect(nonces.claim).toHaveBeenCalledTimes(mode.startsWith("wrong") ? 0 : 1);
  });

  it("keeps the closed-preflight request and reply schemas strict", () => {
    expect(parseClosedPreflightRequest({})).toEqual({});
    for (const value of [null, [], { jobId: CLOSED_PREFLIGHT_JOB_ID }]) expect(() => parseClosedPreflightRequest(value)).toThrow();
    for (const value of [{}, null, { executorClosed: true, jobAbsent: true, siteOutboxEmpty: "true" }]) {
      expect(() => parseClosedPreflightReply(value)).toThrow();
    }
  });

  it("contains nonce rejection when public cancellation precedes the transport wait", async () => {
    const conn = connection();
    let mono = 0;
    const scope = new PublicOperationScope(() => mono);
    const rawPrepare = vi.fn(() => { throw new Error("raw D1 must remain fenced"); });
    const db = { prepare: rawPrepare } as unknown as D1Database;
    const guard = vi.fn(() => { mono = 4500; scope.ensure(); });
    const nonces = new D1BridgeNonceStore(createGuardedD1(db, guard));
    const jobId = "00000000-0000-4000-8000-000000000001";
    const body = encoder.encode("{}");
    const decode = vi.fn(() => "unexpected");
    const fetch = vi.fn(async (request: Request) => {
      const headers = await signBridgeMessage({
        context: { direction: "site-to-executor", kind: "response", method: "POST", path: new URL(request.url).pathname,
          audience: conn.executorOrigin, jobId, status: 200 },
        body, keyId: conn.siteToExecutor.keyId, keyBytes: conn.siteToExecutor.copyKeyBytes(), now: () => WALL_NOW,
      });
      return new Response(body, { status: 200, headers });
    });
    const transport = new BridgeTransport({ connection: conn, nonces, fetch, wallNow: () => WALL_NOW, monoNow: () => mono });
    const unhandled: unknown[] = [];
    const capture = (reason: unknown) => { unhandled.push(reason); };
    process.on("unhandledRejection", capture);
    try {
      await expect(transport.request({ target: "executor", operation: "status", signal: scope.signal,
        prepare: () => ({ jobId, body }), decode })).rejects.toMatchObject({ kind: "temporary" });
      await new Promise<void>((resolve) => setImmediate(resolve));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
      expect(guard).toHaveBeenCalledTimes(1);
      expect(rawPrepare).not.toHaveBeenCalled();
      expect(decode).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(scope.signal.aborted).toBe(true);
    } finally {
      scope.finish();
      process.removeListener("unhandledRejection", capture);
    }
  });

  it("invokes injected native-style fetch without a class receiver", async () => {
    const receivers: unknown[] = [];
    const fetch = async function (this: unknown) {
      receivers.push(this);
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return new Response(null, { status: 302 });
    };
    const transport = new BridgeTransport({ connection: connection(), nonces: { claim: vi.fn() }, fetch,
      wallNow: () => WALL_NOW, monoNow: () => 0 });
    await expect(transport.request({ target: "site", operation: "maintenance",
      prepare: () => ({ jobId: "collection", body: encoder.encode("{}") }), decode: vi.fn() }))
      .rejects.toMatchObject({ kind: "protocol" });
    expect(receivers).toEqual([undefined]);
  });

  it.each([300, 301, 302, 303, 304, 307, 308, 399])("rejects %i immediately for every Location without reading body or authenticating", async (status) => {
    for (const location of [null, `${SITE_ORIGIN}/other`, "https://other.invalid/other"]) {
      const nonces = { claim: vi.fn().mockResolvedValue(true) };
      const decode = vi.fn();
      const cancel = vi.fn(() => new Promise<void>(() => {}));
      const body = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 });
      const response = new Response(status === 304 ? null : body, { status,
        headers: location === null ? {} : { location } });
      const headersGet = vi.spyOn(response.headers, "get");
      const read = vi.spyOn(body, "getReader");
      const fetch = vi.fn(async (request: Request) => {
        expect(request.url).toBe(`${SITE_ORIGIN}/api/internal/research-bridge/maintenance`);
        expect(request.redirect).toBe("manual");
        return response;
      });
      const transport = new BridgeTransport({ connection: connection(), nonces, fetch,
        wallNow: () => WALL_NOW, monoNow: () => 0 });
      await expect(transport.request({ target: "site", operation: "maintenance",
        prepare: () => ({ jobId: "collection", body: encoder.encode("{}") }), decode }))
        .rejects.toMatchObject({ kind: "protocol" });
      expect(fetch).toHaveBeenCalledOnce();
      expect(headersGet).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledTimes(status === 304 ? 0 : 1);
      expect(nonces.claim).not.toHaveBeenCalled();
      expect(decode).not.toHaveBeenCalled();
    }
  });

  it("handles rejected redirect body cancellation without an unhandled rejection", async () => {
    const cancel = vi.fn(() => Promise.reject(new Error("synthetic cancellation failure")));
    const response = new Response(new ReadableStream({ cancel }, { highWaterMark: 0 }), { status: 302 });
    const nonces = { claim: vi.fn() };
    const decode = vi.fn();
    const fetch = vi.fn(async () => response);
    const transport = new BridgeTransport({ connection: connection(), nonces, fetch,
      wallNow: () => WALL_NOW, monoNow: () => 0 });
    await expect(transport.request({ target: "site", operation: "maintenance",
      prepare: () => ({ jobId: "collection", body: encoder.encode("{}") }), decode }))
      .rejects.toMatchObject({ kind: "protocol" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    expect(nonces.claim).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
  });

  it("runs all fixed client routes through signed POST requests and native SQLite nonce scopes", async () => {
    const job = await genuineJob();
    const conn = connection();
    const siteDb = createResearchD1();
    const executorDb = createResearchD1();
    const siteNonces = new D1BridgeNonceStore(siteDb as unknown as D1Database);
    const executorNonces = new D1BridgeNonceStore(executorDb as unknown as D1Database);
    const grant = await grantFor(job);
    const receipt = await receiptFor(job);
    const receiptHash = await hashBridgeProviderReceipt(receipt);
    const requestHash = await hashBridgeJob(job);
    const accepted = parseAcceptedProof({ jobId: job.jobId, requestHash, workflowId: job.jobId, workflowAcceptedAt: job.createdAt + 5 });
    const notice = parseReceiptNotice({ jobId: job.jobId, requestHash, receiptHash });
    const seen: Array<{ url: string; method: string; redirect: RequestRedirect; cache: RequestCache; contentType: string | null }> = [];

    const localFetch = async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const body = new Uint8Array(await request.arrayBuffer());
      const targetExecutor = url.origin === EXECUTOR_ORIGIN;
      const direction = targetExecutor ? "site-to-executor" : "executor-to-site";
      const credential = targetExecutor ? conn.siteToExecutor : conn.executorToSite;
      const requestContext: BridgeMessageContext = {
        direction,
        kind: "request",
        method: "POST",
        path: url.pathname,
        audience: url.origin,
        jobId: request.headers.get("x-arc-bridge-job-id")!,
        status: null,
      };
      await verifyBridgeMessage({
        context: requestContext,
        body,
        headers: request.headers,
        keyId: credential.keyId,
        keyBytes: credential.copyKeyBytes(),
        now: () => WALL_NOW,
        nonces: targetExecutor ? executorNonces : siteNonces,
      });
      seen.push({ url: request.url, method: request.method, redirect: request.redirect, cache: request.cache, contentType: request.headers.get("content-type") });
      const operation = route(url.pathname);
      const payload = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
      let output: unknown;
      let status = 200;
      if (operation === "submit") { status = 202; output = accepted; }
      else if (operation === "status") output = { jobId: job.jobId, requestHash, accepted, dispatchState: "claimed", unsent: null, metadata: await summarizeBridgeProviderReceipt(receipt), bodyState: "available" };
      else if (operation === "close") output = { jobId: job.jobId, requestHash, state: "closed", closedAt: job.createdAt + 20, grant: null };
      else if (operation === "result") output = receipt;
      else if (operation === "acknowledge" || operation === "accepted") output = payload;
      else if (operation === "begin") output = { grant, observedAt: grant.beganAt, remainingMs: KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs };
      else if (operation === "complete") output = { ...notice, accounting: "settled" };
      else if (operation === "metadata") output = { jobId: job.jobId, requestHash, receiptHash, accounting: "held" };
      else if (operation === "maintenance") output = { visited: 2, failed: 0 };
      else if (operation === "outbox") output = { jobs: [job], next: null };
      else throw new Error("unexpected local route");
      const responseBody = operation === "result" ? encodeBridgeProviderReceipt(output) : encodeBridgeDto(output, operation === "outbox" ? 16_384 : 4_096);
      const signed = await signBridgeMessage({ context: responseContext(requestContext, status), body: responseBody, keyId: credential.keyId, keyBytes: credential.copyKeyBytes(), now: () => WALL_NOW });
      signed.set("content-type", "application/json");
      signed.set("cache-control", "no-store");
      return new Response(responseBody, { status, headers: signed });
    };

    const siteTransport = new BridgeTransport({ connection: conn, nonces: siteNonces, fetch: localFetch, wallNow: () => WALL_NOW, monoNow: () => 10 });
    const executorTransport = new BridgeTransport({ connection: conn, nonces: executorNonces, fetch: localFetch, wallNow: () => WALL_NOW, monoNow: () => 10 });
    const executor = new ExecutorBridgeClient(siteTransport);
    const site = new SiteBridgeClient(executorTransport);

    await expect(executor.submit(job)).resolves.toEqual(accepted);
    await expect(executor.status(job)).resolves.toMatchObject({ dispatchState: "claimed", bodyState: "available" });
    await expect(executor.close(job)).resolves.toMatchObject({ state: "closed", grant: null });
    await expect(executor.result(job, notice, grant)).resolves.toEqual(receipt);
    await expect(executor.acknowledge(job, notice)).resolves.toEqual(notice);
    await expect(site.begin(job)).resolves.toMatchObject({ grant });
    await expect(site.accepted(job, accepted)).resolves.toEqual(accepted);
    await expect(site.complete(job, notice)).resolves.toMatchObject({ accounting: "settled" });
    await expect(site.metadata(job, await summarizeBridgeProviderReceipt(receipt))).resolves.toMatchObject({ accounting: "held" });
    await expect(site.maintenance()).resolves.toEqual({ visited: 2, failed: 0 });
    await expect(site.outbox()).resolves.toMatchObject({ jobs: [job], next: null });

    expect(seen).toHaveLength(11);
    expect(seen.every((entry) => entry.method === "POST" && entry.redirect === "manual" && entry.cache === "no-store" && entry.contentType === "application/json")).toBe(true);
    expect(seen.map((entry) => new URL(entry.url).search)).toEqual(Array(11).fill(""));
    const executorScopes = executorDb.database.prepare("SELECT DISTINCT scope FROM research_bridge_nonces ORDER BY scope").all() as Array<{ scope: string }>;
    const siteScopes = siteDb.database.prepare("SELECT DISTINCT scope FROM research_bridge_nonces ORDER BY scope").all() as Array<{ scope: string }>;
    expect(executorScopes).toEqual([{ scope: "executor-to-site:testExecutor" }, { scope: "site-to-executor:testSite" }]);
    expect(siteScopes).toEqual([{ scope: "executor-to-site:testExecutor" }, { scope: "site-to-executor:testSite" }]);
    siteDb.close();
    executorDb.close();
  });

  it("rejects invalid receiver-operation pairs before prepare, signing, or fetch", async () => {
    const db = createResearchD1();
    let prepared = 0;
    let fetched = 0;
    const transport = new BridgeTransport({ connection: connection(), nonces: new D1BridgeNonceStore(db as unknown as D1Database), fetch: async () => { fetched += 1; throw new Error("network denied"); }, wallNow: () => WALL_NOW, monoNow: () => 0 });
    await expect(transport.request({ target: "executor", operation: "begin", prepare: () => { prepared += 1; return { jobId: "collection", body: encoder.encode("{}") }; }, decode: () => ({}) }))
      .rejects.toMatchObject({ kind: "protocol" });
    await expect(transport.request({ target: "site", operation: "submit", prepare: () => { prepared += 1; return { jobId: "collection", body: encoder.encode("{}") }; }, decode: () => ({}) }))
      .rejects.toMatchObject({ kind: "protocol" });
    await expect(transport.request({ target: undefined, operation: "toString", prepare: () => { prepared += 1; return { jobId: "collection", body: encoder.encode("{}") }; }, decode: () => ({}) } as never))
      .rejects.toMatchObject({ kind: "protocol" });
    expect({ prepared, fetched }).toEqual({ prepared: 0, fetched: 0 });
    db.close();
  });

  it.each([
    ["changed signed body", "body"],
    ["changed response status", "status"],
    ["changed method", "method"],
    ["changed path", "path"],
    ["changed audience", "audience"],
    ["changed direction", "direction"],
    ["job substitution", "job"],
    ["wrong credential", "credential"],
  ])("classifies %s as authentication failure after reading the bounded body", async (_label, mutation) => {
    const job = await genuineJob();
    const conn = connection();
    const db = createResearchD1();
    const nonces = new D1BridgeNonceStore(db as unknown as D1Database);
    const requestHash = await hashBridgeJob(job);
    const goodBody = encodeBridgeDto({ jobId: job.jobId, requestHash, workflowId: job.jobId, workflowAcceptedAt: job.createdAt }, 4_096);
    const fetch = async (request: Request) => {
      const url = new URL(request.url);
      const actualStatus = mutation === "status" ? 503 : 202;
      const context: BridgeMessageContext = {
        direction: mutation === "direction" ? "executor-to-site" : "site-to-executor",
        kind: "response",
        method: mutation === "method" ? "GET" : "POST",
        path: mutation === "path" ? `${url.pathname}-tampered` : url.pathname,
        audience: mutation === "audience" ? SITE_ORIGIN : EXECUTOR_ORIGIN,
        jobId: mutation === "job" ? "00000000-0000-4000-8000-000000000099" : job.jobId,
        status: mutation === "status" ? 202 : actualStatus,
      };
      const signedBody = mutation === "body" ? encoder.encode("{}") : goodBody;
      const credential = mutation === "credential" ? conn.executorToSite : conn.siteToExecutor;
      const headers = await signBridgeMessage({ context, body: signedBody, keyId: credential.keyId, keyBytes: credential.copyKeyBytes(), now: () => WALL_NOW });
      return new Response(goodBody, { status: actualStatus, headers });
    };
    const client = new ExecutorBridgeClient(new BridgeTransport({ connection: conn, nonces, fetch, wallNow: () => WALL_NOW, monoNow: () => 0 }));
    await expect(client.submit(job)).rejects.toMatchObject({ kind: "authentication", name: "BridgeTransportError" });
    db.close();
  });

  it("rejects oversized and misleading-length response streams without decoding", async () => {
    const job = await genuineJob();
    const conn = connection();
    const db = createResearchD1();
    const body = new Uint8Array(4_097).fill(123);
    const fetch = async (request: Request) => {
      const url = new URL(request.url);
      const context: BridgeMessageContext = { direction: "site-to-executor", kind: "response", method: "POST", path: url.pathname, audience: SITE_ORIGIN, jobId: job.jobId, status: 202 };
      const headers = await signBridgeMessage({ context, body, keyId: conn.siteToExecutor.keyId, keyBytes: conn.siteToExecutor.copyKeyBytes(), now: () => WALL_NOW });
      headers.set("content-length", "2");
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(body.subarray(0, 2_000)); controller.enqueue(body.subarray(2_000)); controller.close(); } }), { status: 202, headers });
    };
    const client = new ExecutorBridgeClient(new BridgeTransport({ connection: conn, nonces: new D1BridgeNonceStore(db as unknown as D1Database), fetch, wallNow: () => WALL_NOW, monoNow: () => 0 }));
    await expect(client.submit(job)).rejects.toMatchObject({ kind: "protocol" });
    db.close();
  });

  it("classifies a response stream connection reset as temporary before auth or decode", async () => {
    const db = createResearchD1();
    let nonceClaims = 0;
    let decodes = 0;
    const transport = new BridgeTransport({
      connection: connection(),
      nonces: { claim: async () => { nonceClaims += 1; return true; } },
      fetch: async () => new Response(new ReadableStream({ start(stream) { stream.error(new TypeError("synthetic connection reset")); } })),
      wallNow: () => WALL_NOW,
      monoNow: () => 0,
    });
    await expect(transport.request({
      target: "site",
      operation: "maintenance",
      prepare: () => ({ jobId: "collection", body: encoder.encode("{}") }),
      decode: () => { decodes += 1; return {}; },
    })).rejects.toMatchObject({ kind: "temporary", name: "BridgeTransportError" });
    expect({ nonceClaims, decodes }).toEqual({ nonceClaims: 0, decodes: 0 });
    db.close();
  });

  it("uses one monotonic deadline across delayed prepare and never starts fetch after expiry", async () => {
    const db = createResearchD1();
    let mono = 0;
    let fetched = 0;
    const transport = new BridgeTransport({ connection: connection(), nonces: new D1BridgeNonceStore(db as unknown as D1Database), fetch: async () => { fetched += 1; throw new Error("must not fetch"); }, wallNow: () => WALL_NOW, monoNow: () => mono });
    const work = transport.request({
      target: "site",
      operation: "maintenance",
      prepare: async () => { mono = 5_001; return { jobId: "collection", body: encoder.encode("{}") }; },
      decode: () => ({ visited: 0, failed: 0 }),
    });
    await expect(work).rejects.toMatchObject({ kind: "temporary" });
    expect(fetched).toBe(0);
    db.close();
  });

  it("fences a real client proof digest past deadline before request signing or fetch", async () => {
    const job = await genuineJob();
    const requestHash = await hashBridgeJob(job);
    const proof = parseAcceptedProof({ jobId: job.jobId, requestHash, workflowId: job.jobId, workflowAcceptedAt: job.createdAt });
    const db = createResearchD1();
    let mono = 0;
    let fetched = 0;
    let digestCalls = 0;
    let digestEntered!: () => void;
    const entered = new Promise<void>((resolve) => { digestEntered = resolve; });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => {
      digestCalls += 1;
      digestEntered();
      await gate;
      return originalDigest(...args);
    });
    const client = new SiteBridgeClient(new BridgeTransport({
      connection: connection(),
      nonces: new D1BridgeNonceStore(db as unknown as D1Database),
      fetch: async () => { fetched += 1; throw new Error("fetch must remain fenced"); },
      wallNow: () => WALL_NOW,
      monoNow: () => mono,
    }));
    const pending = client.accepted(job, proof);
    await entered;
    mono = 5_001;
    release();
    await expect(pending).rejects.toMatchObject({ kind: "temporary" });
    expect({ digestCalls, fetched }).toEqual({ digestCalls: 1, fetched: 0 });
    db.close();
  });

  it("fences a delayed prepare immediately when the caller cancels", async () => {
    const db = createResearchD1();
    const controller = new AbortController();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let fetched = 0;
    const transport = new BridgeTransport({ connection: connection(), nonces: new D1BridgeNonceStore(db as unknown as D1Database), fetch: async () => { fetched += 1; throw new Error("must not fetch"); }, wallNow: () => WALL_NOW, monoNow: () => 0 });
    const pending = transport.request({
      target: "site", operation: "maintenance", signal: controller.signal,
      prepare: async () => { entered(); await gate; return { jobId: "collection", body: encoder.encode("{}") }; },
      decode: () => ({}),
    });
    await started;
    controller.abort();
    const canceledBeforeRelease = await Promise.race([
      pending.then(() => true, () => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 20)),
    ]);
    release();
    await pending.catch(() => undefined);
    expect(canceledBeforeRelease).toBe(true);
    expect(fetched).toBe(0);
    db.close();
  });

  it("copies the prepared routing identity before signing awaits", async () => {
    const conn = connection();
    const db = createResearchD1();
    const job = await genuineJob();
    const prepared = { jobId: job.jobId, body: encoder.encode("{}") };
    let digestEntered!: () => void;
    const entered = new Promise<void>((resolve) => { digestEntered = resolve; });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => { digestEntered(); await gate; return originalDigest(...args); });
    let observedHeader: string | null = null;
    const transport = new BridgeTransport({
      connection: conn,
      nonces: new D1BridgeNonceStore(db as unknown as D1Database),
      fetch: async (request) => { observedHeader = request.headers.get("x-arc-bridge-job-id"); throw new TypeError("synthetic transport end"); },
      wallNow: () => WALL_NOW,
      monoNow: () => 0,
    });
    const pending = transport.request({ target: "executor", operation: "submit", prepare: () => prepared, decode: () => ({}) });
    await entered;
    prepared.jobId = "00000000-0000-4000-8000-000000000099";
    release();
    await expect(pending).rejects.toMatchObject({ kind: "temporary" });
    expect(observedHeader).toBe(job.jobId);
    db.close();
  });

  it("honors cancellation before fetch", async () => {
    const db = createResearchD1();
    const controller = new AbortController();
    controller.abort();
    let fetched = 0;
    const transport = new BridgeTransport({ connection: connection(), nonces: new D1BridgeNonceStore(db as unknown as D1Database), fetch: async () => { fetched += 1; return Response.redirect("https://attacker.example", 302); }, wallNow: () => WALL_NOW, monoNow: () => 0 });
    await expect(transport.request({ target: "site", operation: "maintenance", prepare: () => ({ jobId: "collection", body: encoder.encode("{}") }), decode: () => ({}), signal: controller.signal }))
      .rejects.toMatchObject({ kind: "temporary" });
    expect(fetched).toBe(0);
    db.close();
  });

  it("classifies an ordinary fetch rejection as temporary at the fetch boundary", async () => {
    const db = createResearchD1();
    const transport = new BridgeTransport({
      connection: connection(),
      nonces: new D1BridgeNonceStore(db as unknown as D1Database),
      fetch: async () => { throw new Error("synthetic local transport failure"); },
      wallNow: () => WALL_NOW,
      monoNow: () => 0,
    });
    await expect(transport.request({ target: "site", operation: "maintenance", prepare: () => ({ jobId: "collection", body: encoder.encode("{}") }), decode: () => ({}) }))
      .rejects.toMatchObject({ kind: "temporary", name: "BridgeTransportError" });
    db.close();
  });

  it("refuses a returned redirect without following it", async () => {
    const conn = connection();
    const db = createResearchD1();
    let fetched = 0;
    const fetch = async (request: Request) => {
      fetched += 1;
      expect(request.redirect).toBe("manual");
      const url = new URL(request.url);
      const body = encodeBridgeDto({ code: "temporary" }, 4_096);
      const headers = await signBridgeMessage({
        context: { direction: "executor-to-site", kind: "response", method: "POST", path: url.pathname, audience: SITE_ORIGIN, jobId: "collection", status: 302 },
        body,
        keyId: conn.executorToSite.keyId,
        keyBytes: conn.executorToSite.copyKeyBytes(),
        now: () => WALL_NOW,
      });
      return new Response(body, { status: 302, headers });
    };
    const nonces = { claim: vi.fn().mockResolvedValue(true) };
    const decode = vi.fn();
    const transport = new BridgeTransport({ connection: conn, nonces, fetch, wallNow: () => WALL_NOW, monoNow: () => 0 });
    await expect(transport.request({ target: "site", operation: "maintenance", prepare: () => ({ jobId: "collection", body: encoder.encode("{}") }), decode }))
      .rejects.toMatchObject({ kind: "protocol" });
    expect(nonces.claim).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    expect(fetched).toBe(1);
    db.close();
  });

  it("shares nonce replay scope across request and response kinds", async () => {
    const job = await genuineJob();
    const conn = connection();
    const db = createResearchD1();
    const nonces = new D1BridgeNonceStore(db as unknown as D1Database);
    vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      if (array === null) throw new Error("test expected a typed array");
      new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(7);
      return array;
    });
    const requestBody = encoder.encode("{}");
    const requestContext: BridgeMessageContext = { direction: "site-to-executor", kind: "request", method: "POST", path: "/internal/research-bridge/submit", audience: EXECUTOR_ORIGIN, jobId: job.jobId, status: null };
    const requestHeaders = await signBridgeMessage({ context: requestContext, body: requestBody, keyId: conn.siteToExecutor.keyId, keyBytes: conn.siteToExecutor.copyKeyBytes(), now: () => WALL_NOW });
    await verifyBridgeMessage({ context: requestContext, body: requestBody, headers: requestHeaders, keyId: conn.siteToExecutor.keyId, keyBytes: conn.siteToExecutor.copyKeyBytes(), now: () => WALL_NOW, nonces });
    const requestHash = await hashBridgeJob(job);
    const responseBody = encodeBridgeDto({ jobId: job.jobId, requestHash, workflowId: job.jobId, workflowAcceptedAt: job.createdAt }, 4_096);
    const fetch = async (request: Request) => {
      const url = new URL(request.url);
      const headers = await signBridgeMessage({ context: { ...requestContext, kind: "response", path: url.pathname, status: 202 }, body: responseBody, keyId: conn.siteToExecutor.keyId, keyBytes: conn.siteToExecutor.copyKeyBytes(), now: () => WALL_NOW });
      return new Response(responseBody, { status: 202, headers });
    };
    const client = new ExecutorBridgeClient(new BridgeTransport({ connection: conn, nonces, fetch, wallNow: () => WALL_NOW, monoNow: () => 0 }));
    await expect(client.submit(job)).rejects.toMatchObject({ kind: "authentication" });
    expect(db.database.prepare("SELECT count(*) AS count FROM research_bridge_nonces WHERE scope='site-to-executor:testSite'").get()).toEqual({ count: 1 });
    db.close();
  });

  it("persists a verified nonce before rejecting a schema-invalid signed reply", async () => {
    const job = await genuineJob();
    const conn = connection();
    const db = createResearchD1();
    db.database.exec("CREATE TABLE task13_test_business_effects (id TEXT PRIMARY KEY)");
    let providerCalls = 0;
    const observedBridgeRequests: string[] = [];
    const globalFetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      providerCalls += 1;
      throw new Error("provider or unscoped global fetch denied");
    });
    const body = encoder.encode("{}");
    const fetch = async (request: Request) => {
      const url = new URL(request.url);
      if (url.href !== `${EXECUTOR_ORIGIN}/internal/research-bridge/submit`) {
        providerCalls += 1;
        throw new Error("non-fixed bridge or provider request denied");
      }
      observedBridgeRequests.push(url.href);
      const headers = await signBridgeMessage({ context: { direction: "site-to-executor", kind: "response", method: "POST", path: url.pathname, audience: EXECUTOR_ORIGIN, jobId: job.jobId, status: 202 }, body, keyId: conn.siteToExecutor.keyId, keyBytes: conn.siteToExecutor.copyKeyBytes(), now: () => WALL_NOW });
      return new Response(body, { status: 202, headers });
    };
    const client = new ExecutorBridgeClient(new BridgeTransport({ connection: conn, nonces: new D1BridgeNonceStore(db as unknown as D1Database), fetch, wallNow: () => WALL_NOW, monoNow: () => 0 }));
    const consumed = client.submit(job).then((value) => {
      db.database.prepare("INSERT INTO task13_test_business_effects (id) VALUES ('accepted')").run();
      return value;
    });
    await expect(consumed).rejects.toMatchObject({ kind: "protocol" });
    expect(db.database.prepare("SELECT scope,count(*) AS count FROM research_bridge_nonces GROUP BY scope").all()).toEqual([{ scope: "site-to-executor:testSite", count: 1 }]);
    expect(db.database.prepare("SELECT count(*) AS count FROM task13_test_business_effects").get()).toEqual({ count: 0 });
    expect(db.database.prepare("SELECT count(*) AS count FROM research_runs").get()).toEqual({ count: 0 });
    expect(db.database.prepare("SELECT count(*) AS count FROM research_site_executions").get()).toEqual({ count: 0 });
    expect(observedBridgeRequests).toEqual([`${EXECUTOR_ORIGIN}/internal/research-bridge/submit`]);
    expect(providerCalls).toBe(0);
    expect(globalFetch).not.toHaveBeenCalled();
    db.close();
  });

  it("rejects signed invalid UTF-8 after authentication and nonce persistence", async () => {
    const conn = connection();
    const db = createResearchD1();
    const body = new Uint8Array([0xff, 0xfe]);
    const headers = await signBridgeMessage({ context: { direction: "executor-to-site", kind: "response", method: "POST", path: "/api/internal/research-bridge/maintenance", audience: SITE_ORIGIN, jobId: "collection", status: 200 }, body, keyId: conn.executorToSite.keyId, keyBytes: conn.executorToSite.copyKeyBytes(), now: () => WALL_NOW });
    const transport = new BridgeTransport({ connection: conn, nonces: new D1BridgeNonceStore(db as unknown as D1Database), fetch: async () => new Response(body, { status: 200, headers }), wallNow: () => WALL_NOW, monoNow: () => 0 });
    await expect(transport.request({ target: "site", operation: "maintenance", prepare: () => ({ jobId: "collection", body: encoder.encode("{}") }), decode: (bytes) => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) }))
      .rejects.toMatchObject({ kind: "protocol" });
    expect(db.database.prepare("SELECT count(*) AS count FROM research_bridge_nonces").get()).toEqual({ count: 1 });
    db.close();
  });

  it("cancels a trickled response body in the middle of the shared deadline", async () => {
    const conn = connection();
    const db = createResearchD1();
    const controller = new AbortController();
    const fullBody = encodeBridgeDto({ visited: 0, failed: 0 }, 4_096);
    const headers = await signBridgeMessage({ context: { direction: "executor-to-site", kind: "response", method: "POST", path: "/api/internal/research-bridge/maintenance", audience: SITE_ORIGIN, jobId: "collection", status: 200 }, body: fullBody, keyId: conn.executorToSite.keyId, keyBytes: conn.executorToSite.copyKeyBytes(), now: () => WALL_NOW });
    let cancelObserved = false;
    const fetch = async () => new Response(new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(fullBody.subarray(0, 1));
        queueMicrotask(() => controller.abort());
      },
      cancel() { cancelObserved = true; },
    }), { status: 200, headers });
    const transport = new BridgeTransport({ connection: conn, nonces: new D1BridgeNonceStore(db as unknown as D1Database), fetch, wallNow: () => WALL_NOW, monoNow: () => 0 });
    await expect(transport.request({ target: "site", operation: "maintenance", signal: controller.signal, prepare: () => ({ jobId: "collection", body: encoder.encode("{}") }), decode: () => ({}) }))
      .rejects.toMatchObject({ kind: "temporary" });
    await vi.waitFor(() => expect(cancelObserved).toBe(true));
    db.close();
  });

  it("does not reset the deadline across prepare, HTTP, verification, and decode", async () => {
    const conn = connection();
    const db = createResearchD1();
    let mono = 0;
    let decoded = 0;
    const responseBody = encodeBridgeDto({ visited: 0, failed: 0 }, 4_096);
    const fetch = async () => {
      mono = 4_000;
      const headers = await signBridgeMessage({ context: { direction: "executor-to-site", kind: "response", method: "POST", path: "/api/internal/research-bridge/maintenance", audience: SITE_ORIGIN, jobId: "collection", status: 200 }, body: responseBody, keyId: conn.executorToSite.keyId, keyBytes: conn.executorToSite.copyKeyBytes(), now: () => WALL_NOW });
      return new Response(responseBody, { status: 200, headers });
    };
    const transport = new BridgeTransport({ connection: conn, nonces: new D1BridgeNonceStore(db as unknown as D1Database), fetch, wallNow: () => WALL_NOW, monoNow: () => mono });
    await expect(transport.request({
      target: "site", operation: "maintenance",
      prepare: async () => { mono = 2_000; return { jobId: "collection", body: encoder.encode("{}") }; },
      decode: async () => { decoded += 1; mono = 5_001; return { visited: 0, failed: 0 }; },
    })).rejects.toMatchObject({ kind: "temporary" });
    expect(decoded).toBe(1);
    db.close();
  });

  it("times out a real result receipt digest before release and never accepts it afterward", async () => {
    const fixture = createSiteAdmissionFixture();
    const nonceDb = createResearchD1();
    try {
      const job = parseBridgeJob((await fixture.createRemote()).execution.job);
      const businessCountsBefore = fixture.readCounts();
      const conn = connection();
      const grant = await grantFor(job);
      const receipt = await receiptFor(job);
      const notice = parseReceiptNotice({
        jobId: job.jobId,
        requestHash: await hashBridgeJob(job),
        receiptHash: await hashBridgeProviderReceipt(receipt),
      });
      const responseBody = encodeBridgeProviderReceipt(receipt);
      const responseHeaders = await signBridgeMessage({
        context: { direction: "site-to-executor", kind: "response", method: "POST", path: "/internal/research-bridge/result", audience: EXECUTOR_ORIGIN, jobId: job.jobId, status: 200 },
        body: responseBody,
        keyId: conn.siteToExecutor.keyId,
        keyBytes: conn.siteToExecutor.copyKeyBytes(),
        now: () => WALL_NOW,
      });
      fixture.db.database.exec("CREATE TABLE task13_test_business_effects (id TEXT PRIMARY KEY)");
      let providerCalls = 0;
      const observedBridgeRequests: string[] = [];
      const globalFetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        providerCalls += 1;
        throw new Error("provider or unscoped global fetch denied");
      });
      let mono = 0;
      let digestCalls = 0;
      let receiptDigestEntered!: () => void;
      const entered = new Promise<void>((resolve) => { receiptDigestEntered = resolve; });
      let receiptDigestFinished!: () => void;
      const finished = new Promise<void>((resolve) => { receiptDigestFinished = resolve; });
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
      vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => {
        const call = ++digestCalls;
        if (call === 5) {
          receiptDigestEntered();
          await gate;
        }
        const result = await originalDigest(...args);
        if (call === 1) mono = 2_000;
        if (call === 5) receiptDigestFinished();
        return result;
      });
      const client = new ExecutorBridgeClient(new BridgeTransport({
        connection: conn,
        nonces: new D1BridgeNonceStore(nonceDb as unknown as D1Database),
        fetch: async (request) => {
          const url = new URL(request.url);
          if (url.href !== `${EXECUTOR_ORIGIN}/internal/research-bridge/result`) {
            providerCalls += 1;
            throw new Error("non-fixed bridge or provider request denied");
          }
          observedBridgeRequests.push(url.href);
          mono = 4_900;
          return new Response(responseBody, { status: 200, headers: responseHeaders });
        },
        wallNow: () => WALL_NOW,
        monoNow: () => mono,
      }));
      const consumed = client.result(job, notice, grant).then((value) => {
        fixture.db.database.prepare("INSERT INTO task13_test_business_effects (id) VALUES ('accepted')").run();
        return value;
      });
      await entered;
      const beforeRelease = await Promise.race([
        consumed.then(() => ({ state: "fulfilled" as const }), (error: unknown) => ({ state: "rejected" as const, error })),
        new Promise<{ state: "pending" }>((resolve) => setTimeout(() => resolve({ state: "pending" }), 500)),
      ]);
      expect(beforeRelease).toMatchObject({ state: "rejected", error: { kind: "temporary" } });
      release();
      await finished;
      expect(digestCalls).toBe(5);
      expect(observedBridgeRequests).toEqual([`${EXECUTOR_ORIGIN}/internal/research-bridge/result`]);
      expect(providerCalls).toBe(0);
      expect(globalFetch).not.toHaveBeenCalled();
      expect(fixture.db.database.prepare("SELECT count(*) AS count FROM task13_test_business_effects").get()).toEqual({ count: 0 });
      expect(fixture.readCounts()).toEqual(businessCountsBefore);
      expect(nonceDb.database.prepare("SELECT count(*) AS count FROM research_bridge_nonces").get()).toEqual({ count: 1 });
    } finally {
      fixture.db.close();
      nonceDb.close();
    }
  });

  it("does not begin a nonce write when verification finishes after the deadline", async () => {
    const conn = connection();
    const db = createResearchD1();
    let mono = 0;
    const responseBody = encodeBridgeDto({ visited: 0, failed: 0 }, 4_096);
    const responseHeaders = await signBridgeMessage({ context: { direction: "executor-to-site", kind: "response", method: "POST", path: "/api/internal/research-bridge/maintenance", audience: SITE_ORIGIN, jobId: "collection", status: 200 }, body: responseBody, keyId: conn.executorToSite.keyId, keyBytes: conn.executorToSite.copyKeyBytes(), now: () => WALL_NOW });
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    let calls = 0;
    let verificationEntered!: () => void;
    const entered = new Promise<void>((resolve) => { verificationEntered = resolve; });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 2) { verificationEntered(); await gate; }
      return originalDigest(...args);
    });
    const transport = new BridgeTransport({ connection: conn, nonces: new D1BridgeNonceStore(db as unknown as D1Database), fetch: async () => new Response(responseBody, { status: 200, headers: responseHeaders }), wallNow: () => WALL_NOW, monoNow: () => mono });
    const pending = transport.request({ target: "site", operation: "maintenance", prepare: () => ({ jobId: "collection", body: encoder.encode("{}") }), decode: () => ({}) });
    await entered;
    mono = 5_001;
    release();
    await expect(pending).rejects.toMatchObject({ kind: "temporary" });
    expect(db.database.prepare("SELECT count(*) AS count FROM research_bridge_nonces").get()).toEqual({ count: 0 });
    db.close();
  });

  it("fences verification on caller cancellation before any nonce write starts", async () => {
    const conn = connection();
    const db = createResearchD1();
    const controller = new AbortController();
    const responseBody = encodeBridgeDto({ visited: 0, failed: 0 }, 4_096);
    const responseHeaders = await signBridgeMessage({ context: { direction: "executor-to-site", kind: "response", method: "POST", path: "/api/internal/research-bridge/maintenance", audience: SITE_ORIGIN, jobId: "collection", status: 200 }, body: responseBody, keyId: conn.executorToSite.keyId, keyBytes: conn.executorToSite.copyKeyBytes(), now: () => WALL_NOW });
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    let calls = 0;
    let verificationEntered!: () => void;
    const entered = new Promise<void>((resolve) => { verificationEntered = resolve; });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 2) { verificationEntered(); await gate; }
      return originalDigest(...args);
    });
    const transport = new BridgeTransport({ connection: conn, nonces: new D1BridgeNonceStore(db as unknown as D1Database), fetch: async () => new Response(responseBody, { status: 200, headers: responseHeaders }), wallNow: () => WALL_NOW, monoNow: () => 0 });
    const pending = transport.request({ target: "site", operation: "maintenance", signal: controller.signal, prepare: () => ({ jobId: "collection", body: encoder.encode("{}") }), decode: () => ({}) });
    await entered;
    controller.abort();
    const canceledBeforeRelease = await Promise.race([
      pending.then(() => true, () => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 20)),
    ]);
    release();
    await pending.catch(() => undefined);
    expect(canceledBeforeRelease).toBe(true);
    expect(db.database.prepare("SELECT count(*) AS count FROM research_bridge_nonces").get()).toEqual({ count: 0 });
    db.close();
  });

  it("maps a correctly signed 5xx response to temporary after authentication", async () => {
    const conn = connection();
    const db = createResearchD1();
    const body = encoder.encode("not-json");
    const headers = await signBridgeMessage({ context: { direction: "executor-to-site", kind: "response", method: "POST", path: "/api/internal/research-bridge/maintenance", audience: SITE_ORIGIN, jobId: "collection", status: 503 }, body, keyId: conn.executorToSite.keyId, keyBytes: conn.executorToSite.copyKeyBytes(), now: () => WALL_NOW });
    const transport = new BridgeTransport({ connection: conn, nonces: new D1BridgeNonceStore(db as unknown as D1Database), fetch: async () => new Response(body, { status: 503, headers }), wallNow: () => WALL_NOW, monoNow: () => 0 });
    await expect(transport.request({ target: "site", operation: "maintenance", prepare: () => ({ jobId: "collection", body: encoder.encode("{}") }), decode: () => ({}) }))
      .rejects.toMatchObject({ kind: "temporary" });
    db.close();
  });

  it("exposes only sanitized transport error kinds", () => {
    const error = new BridgeTransportError("protocol");
    expect(error).toMatchObject({ kind: "protocol", name: "BridgeTransportError", message: "Research bridge transport failure: protocol" });
    expect(JSON.stringify(error)).not.toContain("url");
  });
});
