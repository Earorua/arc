import { z } from "zod";
import { BridgeAuthError, signBridgeMessage, verifyBridgeMessage, type BridgeMessageContext, type BridgeNonceStore } from "./auth";
import { BRIDGE_BODY_LIMITS, BridgeBodyError, bridgeByteLength, decodeBridgeJson, readBridgeBody } from "./body";
import { BridgeContractError, parseBridgeErrorBody } from "./bridge-contract";
import type { ResearchBridgeConnection } from "./connection-config";

export type BridgeOperation =
  | "submit" | "status" | "close" | "result" | "acknowledge"
  | "begin" | "accepted" | "complete" | "metadata" | "maintenance" | "outbox";

export type PreparedBridgeRequest = Readonly<{ jobId: string; body: Uint8Array }>;

export class BridgeTransportError extends Error {
  constructor(readonly kind: "temporary" | "authentication" | "protocol" | "conflict" | "not-found" | "closed") {
    super(`Research bridge transport failure: ${kind}`);
    this.name = "BridgeTransportError";
  }
}

type BridgeFetch = (request: Request) => Promise<Response>;
type Target = "site" | "executor";
type Route = Readonly<{ target: Target; path: string; success: number; responseLimit: number; collection: boolean }>;

const ROUTES: Readonly<Record<BridgeOperation, Route>> = Object.freeze({
  submit: Object.freeze({ target: "executor", path: "/internal/research-bridge/submit", success: 202, responseLimit: BRIDGE_BODY_LIMITS.status, collection: false }),
  status: Object.freeze({ target: "executor", path: "/internal/research-bridge/status", success: 200, responseLimit: BRIDGE_BODY_LIMITS.status, collection: false }),
  close: Object.freeze({ target: "executor", path: "/internal/research-bridge/close", success: 200, responseLimit: BRIDGE_BODY_LIMITS.status, collection: false }),
  result: Object.freeze({ target: "executor", path: "/internal/research-bridge/result", success: 200, responseLimit: BRIDGE_BODY_LIMITS.result, collection: false }),
  acknowledge: Object.freeze({ target: "executor", path: "/internal/research-bridge/acknowledge", success: 200, responseLimit: BRIDGE_BODY_LIMITS.status, collection: false }),
  begin: Object.freeze({ target: "site", path: "/api/internal/research-bridge/begin", success: 200, responseLimit: BRIDGE_BODY_LIMITS.status, collection: false }),
  accepted: Object.freeze({ target: "site", path: "/api/internal/research-bridge/accepted", success: 200, responseLimit: BRIDGE_BODY_LIMITS.status, collection: false }),
  complete: Object.freeze({ target: "site", path: "/api/internal/research-bridge/complete", success: 200, responseLimit: BRIDGE_BODY_LIMITS.status, collection: false }),
  metadata: Object.freeze({ target: "site", path: "/api/internal/research-bridge/metadata", success: 200, responseLimit: BRIDGE_BODY_LIMITS.status, collection: false }),
  maintenance: Object.freeze({ target: "site", path: "/api/internal/research-bridge/maintenance", success: 200, responseLimit: BRIDGE_BODY_LIMITS.status, collection: true }),
  outbox: Object.freeze({ target: "site", path: "/api/internal/research-bridge/outbox", success: 200, responseLimit: BRIDGE_BODY_LIMITS.outbox, collection: true }),
});

const uuid = z.uuid();
class DeadlineFailure extends Error {}

class Deadline {
  readonly end: number;
  private fenced = false;
  constructor(private readonly now: () => number, private readonly controller: AbortController) {
    const start = this.read();
    this.end = start + 5_000;
  }
  private read(): number {
    const value = this.now();
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - 5_000) throw new DeadlineFailure();
    return value;
  }
  remaining(): number {
    if (this.fenced || this.controller.signal.aborted) throw new DeadlineFailure();
    const value = this.end - this.read();
    if (value <= 0) { this.expire(); throw new DeadlineFailure(); }
    return Math.max(1, Math.ceil(value));
  }
  ensure(): void { void this.remaining(); }
  expire(): void { this.fenced = true; this.controller.abort(); }
  finish(): void { this.fenced = true; }
  async wait<T>(work: Promise<T>): Promise<T> {
    // The operation may already reject while synchronously cancelling this deadline.
    void work.catch(() => undefined);
    const remaining = this.remaining();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { this.expire(); reject(new DeadlineFailure()); }, remaining);
    });
    const aborted = new Promise<never>((_resolve, reject) => {
      abortListener = () => reject(new DeadlineFailure());
      this.controller.signal.addEventListener("abort", abortListener, { once: true });
      if (this.controller.signal.aborted) abortListener();
    });
    try {
      const value = await Promise.race([work, timeout, aborted]);
      this.ensure();
      return value;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (abortListener) this.controller.signal.removeEventListener("abort", abortListener);
    }
  }
}

function transportError(error: unknown): BridgeTransportError {
  if (error instanceof BridgeTransportError) return error;
  if (error instanceof DeadlineFailure || (error instanceof DOMException && error.name === "AbortError")) return new BridgeTransportError("temporary");
  if (error instanceof BridgeAuthError) return new BridgeTransportError(
    error.code === "unavailable" ? "temporary" : "authentication",
  );
  if (error instanceof BridgeBodyError) {
    return new BridgeTransportError(
      error.code === "timeout" || error.code === "aborted" || error.code === "body-read"
        ? "temporary"
        : "protocol",
    );
  }
  if (error instanceof BridgeContractError) {
    if (error.code === "conflict") return new BridgeTransportError("conflict");
    return new BridgeTransportError(error.code === "unavailable" ? "temporary" : "protocol");
  }
  return new BridgeTransportError("protocol");
}

function classifyVerifiedError(status: number, body: Uint8Array): never {
  if (status >= 500 && status <= 599) throw new BridgeTransportError("temporary");
  let code: ReturnType<typeof parseBridgeErrorBody>["code"];
  try { code = parseBridgeErrorBody(decodeBridgeJson(body)).code; }
  catch { throw new BridgeTransportError("protocol"); }
  if (code === "temporary") throw new BridgeTransportError("temporary");
  if (code === "unauthorized") throw new BridgeTransportError("authentication");
  if (code === "conflict") throw new BridgeTransportError("conflict");
  if (code === "not-found") throw new BridgeTransportError("not-found");
  if (code === "closed") throw new BridgeTransportError("closed");
  throw new BridgeTransportError("protocol");
}

export class BridgeTransport {
  private readonly connection: ResearchBridgeConnection;
  private readonly nonces: BridgeNonceStore;
  private readonly bridgeFetch: BridgeFetch;
  private readonly wallNow: () => number;
  private readonly monoNow: () => number;

  constructor(options: Readonly<{
    connection: ResearchBridgeConnection;
    nonces: BridgeNonceStore;
    fetch: BridgeFetch;
    wallNow: () => number;
    monoNow: () => number;
  }>) {
    if (!options || typeof options.fetch !== "function" || typeof options.wallNow !== "function" || typeof options.monoNow !== "function" || !options.connection || !options.nonces) {
      throw new BridgeTransportError("protocol");
    }
    this.connection = options.connection;
    this.nonces = options.nonces;
    this.bridgeFetch = options.fetch;
    this.wallNow = options.wallNow;
    this.monoNow = options.monoNow;
  }

  async request<T>(options: Readonly<{
    target: Target;
    operation: BridgeOperation;
    prepare: () => PreparedBridgeRequest | Promise<PreparedBridgeRequest>;
    decode: (bytes: Uint8Array) => T | Promise<T>;
    signal?: AbortSignal;
  }>): Promise<T> {
    const controller = new AbortController();
    let deadline: Deadline;
    try { deadline = new Deadline(this.monoNow, controller); }
    catch (error) { throw transportError(error); }
    let removeAbort: (() => void) | undefined;
    try {
      const target = options?.target;
      const operation = options?.operation;
      const prepare = options?.prepare;
      const decode = options?.decode;
      const signal = options?.signal;
      const route = typeof operation === "string" && Object.hasOwn(ROUTES, operation)
        ? ROUTES[operation]
        : undefined;
      if (
        (target !== "site" && target !== "executor")
        || !route
        || route.target !== target
        || typeof prepare !== "function"
        || typeof decode !== "function"
      ) throw new BridgeTransportError("protocol");
      if (signal) {
        const abort = () => deadline.expire();
        signal.addEventListener("abort", abort, { once: true });
        removeAbort = () => signal.removeEventListener("abort", abort);
        if (signal.aborted) abort();
      }
      if (controller.signal.aborted) throw new DeadlineFailure();
      deadline.ensure();

      const preparedInput = await deadline.wait(Promise.resolve().then(prepare));
      if (!preparedInput) throw new BridgeTransportError("protocol");
      const jobId = preparedInput.jobId;
      const preparedBody = preparedInput.body;
      if (!(preparedBody instanceof Uint8Array)) throw new BridgeTransportError("protocol");
      const expectedJobId = route.collection ? "collection" : uuid.safeParse(jobId).success ? jobId : null;
      if (expectedJobId === null || jobId !== expectedJobId || (route.collection && jobId !== "collection")) throw new BridgeTransportError("protocol");
      const body = new Uint8Array(preparedBody);
      const bodyLength = bridgeByteLength(body);
      if (bodyLength === 0 || bodyLength > BRIDGE_BODY_LIMITS.request) throw new BridgeTransportError("protocol");

      const origin = target === "executor" ? this.connection.executorOrigin : this.connection.siteOrigin;
      const credential = target === "executor" ? this.connection.siteToExecutor : this.connection.executorToSite;
      const direction = target === "executor" ? "site-to-executor" : "executor-to-site";
      const requestContext: BridgeMessageContext = {
        direction,
        kind: "request",
        method: "POST",
        path: route.path,
        audience: origin,
        jobId,
        status: null,
      };
      const headers = await deadline.wait(signBridgeMessage({ context: requestContext, body, keyId: credential.keyId, keyBytes: credential.copyKeyBytes(), now: this.wallNow }));
      headers.set("content-type", "application/json");
      headers.set("cache-control", "no-store");
      headers.set("x-arc-bridge-job-id", jobId);
      const request = new Request(`${origin}${route.path}`, { method: "POST", headers, body, redirect: "manual", cache: "no-store", signal: controller.signal });
      deadline.ensure();
      let responseWork: Promise<Response>;
      const bridgeFetch = this.bridgeFetch;
      try { responseWork = bridgeFetch(request); }
      catch { throw new BridgeTransportError("temporary"); }
      void responseWork.then((lateResponse) => {
        if (controller.signal.aborted && lateResponse instanceof Response) {
          void lateResponse.body?.cancel().catch(() => undefined);
        }
      }, () => undefined);
      let response: Response;
      try { response = await deadline.wait(responseWork); }
      catch (error) {
        if (error instanceof DeadlineFailure) throw error;
        throw new BridgeTransportError("temporary");
      }
      if (!(response instanceof Response)) throw new BridgeTransportError("protocol");
      if (response.status >= 300 && response.status <= 399) {
        void response.body?.cancel().catch(() => undefined);
        throw new BridgeTransportError("protocol");
      }
      const responseBody = await readBridgeBody(response, { maxBytes: route.responseLimit, timeoutMs: deadline.remaining(), signal: controller.signal });
      deadline.ensure();
      const responseContext: BridgeMessageContext = { ...requestContext, kind: "response", status: response.status };
      const guardedNonces: BridgeNonceStore = {
        claim: async (claim) => {
          deadline.ensure();
          const result = await deadline.wait(this.nonces.claim(claim));
          deadline.ensure();
          return result;
        },
      };
      await deadline.wait(verifyBridgeMessage({ context: responseContext, body: responseBody, headers: response.headers, keyId: credential.keyId, keyBytes: credential.copyKeyBytes(), now: this.wallNow, nonces: guardedNonces }));
      if (response.status !== route.success) classifyVerifiedError(response.status, responseBody);
      const result = await deadline.wait(Promise.resolve().then(() => decode(new Uint8Array(responseBody))));
      deadline.ensure();
      deadline.finish();
      return result;
    } catch (error) {
      let failure = error;
      try { deadline.ensure(); }
      catch { failure = new DeadlineFailure(); }
      deadline.expire();
      throw transportError(failure);
    } finally {
      removeAbort?.();
    }
  }
}
