import { z } from "zod";
import { canonicalJson } from "../../app/lib/planning/fingerprint";
import { BridgeAuthError, signBridgeMessage, verifyBridgeMessage, type BridgeMessageContext,
  type BridgeNonceStore } from "../../app/server/research/executor/auth";
import { BRIDGE_BODY_LIMITS, BridgeBodyError, decodeBridgeJson, readBridgeBody } from "../../app/server/research/executor/body";
import { BridgeContractError, encodeBridgeDto, parseReceiptNotice,
  type AcceptedProof, type ExecutorStatus, type UnsentProof } from "../../app/server/research/executor/bridge-contract";
import type { ResearchBridgeConnection } from "../../app/server/research/executor/connection-config";
import { BridgeJobError, decodeBridgeJob, hashBridgeJob, type BridgeJob } from "../../app/server/research/executor/job";
import { encodeBridgeProviderReceipt } from "../../app/server/research/executor/receipt";
import { BridgeJobStoreError, type D1BridgeJobStore } from "./d1-job-store";
import { BridgeReceiptStoreError, type ExecutorReceiptStore } from "./receipt-store";
import { CLOSED_PREFLIGHT_JOB_ID, parseClosedPreflightRequest } from "../../app/server/research/executor/closed-preflight";
import type { SiteBridgeClient } from "./site-client";

type Operation = "submit" | "status" | "close" | "result" | "acknowledge" | "closed-preflight";
type Route = Readonly<{ operation: Operation; path: string; success: 200 | 202; responseLimit: number }>;
const OPERATIONS: readonly Operation[] = ["submit", "status", "close", "result", "acknowledge", "closed-preflight"];
const ROUTES: Readonly<Record<string, Route>> = Object.freeze(Object.fromEntries(OPERATIONS.map((operation) => {
  const path = `/internal/research-bridge/${operation}`;
  return [path, Object.freeze({ operation, path, success: operation === "submit" ? 202 : 200,
    responseLimit: operation === "result" ? BRIDGE_BODY_LIMITS.result : BRIDGE_BODY_LIMITS.status })];
})));
const identitySchema = z.object({ jobId: z.uuid(), requestHash: z.string().length(64).regex(/^[0-9a-f]{64}$/u) }).strict();
const NO_STORE = { "cache-control": "no-store", "content-type": "application/json" } as const;

export type ExecutorHttpRuntime = Readonly<{
  jobs: Pick<D1BridgeJobStore, "get" | "closeUnclaimed">;
  receipts: Pick<ExecutorReceiptStore, "recover" | "acknowledge">;
  ensureWorkflow(job: BridgeJob, guard?: () => void): Promise<AcceptedProof>;
  acceptNew: boolean;
  maintenanceEnabled?: boolean;
  closedPreflightAllowed?: boolean;
  site?: Pick<SiteBridgeClient, "outbox">;
  connection: ResearchBridgeConnection;
  nonces: BridgeNonceStore;
  wallNow: () => number;
  monoNow: () => number;
  forRequest?: (guard: () => void, signal: AbortSignal) => ExecutorHttpRuntime;
}>;

class DeadlineFailure extends Error {}
class Deadline {
  readonly controller = new AbortController();
  readonly end: number;
  private fenced = false;
  private readonly timer: ReturnType<typeof setTimeout>;
  constructor(private readonly now: () => number) {
    const start = this.read();
    this.end = start + 5_000;
    this.timer = setTimeout(() => this.expire(), 5_000);
  }
  private read() {
    const value = this.now();
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - 5_000) throw new DeadlineFailure();
    return value;
  }
  remaining() {
    if (this.fenced || this.controller.signal.aborted) throw new DeadlineFailure();
    const value = this.end - this.read();
    if (value <= 0) throw new DeadlineFailure();
    return Math.max(1, Math.ceil(value));
  }
  ensure() { void this.remaining(); }
  expire() { this.fenced = true; this.controller.abort(); }
  finish() { clearTimeout(this.timer); this.expire(); }
  async wait<T>(start: () => Promise<T>): Promise<T> {
    const remaining = this.remaining();
    const work = start();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { this.expire(); reject(new DeadlineFailure()); }, remaining);
      });
      const value = await Promise.race([work, timeout]);
      this.ensure();
      return value;
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
}

function generic(status: 401 | 404 | 405 | 503) {
  return new Response("{}", { status, headers: NO_STORE });
}

function classify(error: unknown): Readonly<{ status: number; code: "not-found" | "closed" | "conflict" | "unauthorized" | "invalid-message" | "temporary" }> {
  if (error instanceof DeadlineFailure) return { status: 503, code: "temporary" };
  if (error instanceof BridgeAuthError) return error.code === "unavailable"
    ? { status: 503, code: "temporary" }
    : { status: 401, code: "unauthorized" };
  if (error instanceof BridgeBodyError || error instanceof BridgeJobError || error instanceof z.ZodError) {
    return { status: 400, code: "invalid-message" };
  }
  if (error instanceof BridgeContractError) return error.code === "conflict"
    ? { status: 409, code: "conflict" } : error.code === "unavailable"
      ? { status: 503, code: "temporary" } : { status: 400, code: "invalid-message" };
  if (error instanceof BridgeJobStoreError || error instanceof BridgeReceiptStoreError) {
    if (error.code === "not-found") return { status: 404, code: "not-found" };
    if (error.code === "conflict") return { status: 409, code: "conflict" };
    if (error.code === "invalid-message") return { status: 400, code: "invalid-message" };
    return { status: 503, code: "temporary" };
  }
  return { status: 503, code: "temporary" };
}

function accepted(stored: Awaited<ReturnType<D1BridgeJobStore["get"]>>): AcceptedProof | null {
  if (!stored || stored.workflowAcceptedAt === null) return null;
  return Object.freeze({ jobId: stored.job.jobId, requestHash: stored.requestHash,
    workflowId: stored.job.jobId, workflowAcceptedAt: stored.workflowAcceptedAt });
}

function unsent(stored: NonNullable<Awaited<ReturnType<D1BridgeJobStore["get"]>>>): UnsentProof | null {
  if (stored.dispatchState !== "closed" || stored.dispatchAt === null) return null;
  return Object.freeze({ jobId: stored.job.jobId, requestHash: stored.requestHash,
    state: "closed", closedAt: stored.dispatchAt, grant: stored.grant });
}

async function matchedStored(runtime: ExecutorHttpRuntime, identity: { jobId: string; requestHash: string },
  deadline: Deadline) {
  const stored = await deadline.wait(() => runtime.jobs.get(identity.jobId));
  if (!stored) throw new BridgeJobStoreError("not-found");
  if (stored.requestHash !== identity.requestHash) throw new BridgeJobStoreError("conflict");
  return stored;
}

async function execute(runtime: ExecutorHttpRuntime, route: Route, body: Uint8Array,
  headerJobId: string, deadline: Deadline): Promise<unknown> {
  if (route.operation === "closed-preflight") {
    if (runtime.closedPreflightAllowed !== true || typeof runtime.site?.outbox !== "function") throw new ClosedSubmission();
    parseClosedPreflightRequest(decodeBridgeJson(body));
    if (headerJobId !== CLOSED_PREFLIGHT_JOB_ID) throw new BridgeContractError("conflict");
    if (await deadline.wait(() => runtime.jobs.get(CLOSED_PREFLIGHT_JOB_ID))) throw new BridgeContractError("conflict");
    const budget = Math.min(3_000, deadline.remaining() - 250);
    if (budget <= 0) throw new DeadlineFailure();
    const child = new AbortController();
    const abort = () => child.abort();
    const parent = deadline.controller.signal;
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new DeadlineFailure());
      child.signal.addEventListener("abort", onAbort, { once: true });
    });
    parent.addEventListener("abort", abort, { once: true });
    if (parent.aborted) abort();
    const timer = setTimeout(abort, budget);
    try {
      const site = runtime.site;
      const page = await deadline.wait(() => Promise.race([site.outbox({ signal: child.signal }), aborted]));
      if (child.signal.aborted) throw new DeadlineFailure();
      if (page.jobs.length !== 0 || page.next !== null) throw new BridgeContractError("conflict");
      deadline.ensure();
      return { executorClosed: true, jobAbsent: true, siteOutboxEmpty: true };
    } finally {
      clearTimeout(timer);
      parent.removeEventListener("abort", abort);
      if (onAbort) child.signal.removeEventListener("abort", onAbort);
    }
  }
  if (route.operation === "submit") {
    const job = decodeBridgeJob(body);
    if (job.jobId !== headerJobId) throw new BridgeContractError("conflict");
    const requestHash = await deadline.wait(() => hashBridgeJob(job));
    const existing = await deadline.wait(() => runtime.jobs.get(job.jobId));
    if (existing) {
      if (existing.requestHash !== requestHash || canonicalJson(existing.job) !== canonicalJson(job)) {
        throw new BridgeJobStoreError("conflict");
      }
    } else if (!runtime.acceptNew || runtime.maintenanceEnabled === false) throw new ClosedSubmission();
    if (runtime.maintenanceEnabled === false) {
      const proof = accepted(existing);
      if (!proof) throw new BridgeJobStoreError("unavailable");
      return proof;
    }
    return deadline.wait(() => runtime.ensureWorkflow(job, () => deadline.ensure()));
  }
  const decoded = decodeBridgeJson(body);
  if (route.operation === "result" || route.operation === "acknowledge") {
    const notice = parseReceiptNotice(decoded);
    if (notice.jobId !== headerJobId) throw new BridgeContractError("conflict");
    const stored = await matchedStored(runtime, notice, deadline);
    if (route.operation === "acknowledge") {
      const record = await deadline.wait(() => runtime.receipts.acknowledge(stored.job.jobId,
        notice.receiptHash, runtime.wallNow()));
      if (record.metadata.receiptHash !== notice.receiptHash) throw new BridgeContractError("conflict");
      return notice;
    }
    const record = await deadline.wait(() => runtime.receipts.recover(stored.job.jobId, runtime.wallNow()));
    if (!record || record.metadata.receiptHash !== notice.receiptHash) throw new BridgeReceiptStoreError("not-found");
    if (record.bodyState !== "available" || !record.receipt) throw new BridgeReceiptStoreError("not-found");
    return record.receipt;
  }
  const identity = identitySchema.parse(decoded);
  if (identity.jobId !== headerJobId) throw new BridgeContractError("conflict");
  let stored = await matchedStored(runtime, identity, deadline);
  if (route.operation === "close") {
    const closed = await deadline.wait(() => runtime.jobs.closeUnclaimed(stored.job, runtime.wallNow()));
    if (closed.dispatchState !== "closed" || closed.dispatchAt === null) throw new BridgeJobStoreError("conflict");
    return unsent(closed);
  }
  let receipt = null;
  if (stored.dispatchState === "claimed") {
    receipt = await deadline.wait(() => runtime.receipts.recover(stored.job.jobId, runtime.wallNow()));
  } else {
    const reread = await matchedStored(runtime, identity, deadline);
    stored = reread;
    if (stored.dispatchState === "claimed") {
      receipt = await deadline.wait(() => runtime.receipts.recover(stored.job.jobId, runtime.wallNow()));
      stored = await matchedStored(runtime, identity, deadline);
      if (stored.dispatchState !== "claimed") throw new BridgeJobStoreError("unavailable");
    }
  }
  return Object.freeze({ jobId: stored.job.jobId, requestHash: stored.requestHash,
    accepted: accepted(stored), dispatchState: stored.dispatchState, unsent: unsent(stored),
    metadata: receipt?.metadata ?? null, bodyState: receipt?.bodyState ?? null }) satisfies ExecutorStatus;
}

class ClosedSubmission extends Error {}

async function signedResponse(runtime: ExecutorHttpRuntime, context: BridgeMessageContext,
  value: unknown, status: number, limit: number, deadline: Deadline, receipt = false): Promise<Response> {
  const body = receipt ? encodeBridgeProviderReceipt(value) : encodeBridgeDto(value, limit);
  const headers = await deadline.wait(() => signBridgeMessage({ context: { ...context, kind: "response", status }, body,
    keyId: runtime.connection.siteToExecutor.keyId,
    keyBytes: runtime.connection.siteToExecutor.copyKeyBytes(), now: runtime.wallNow }));
  headers.set("cache-control", "no-store");
  headers.set("content-type", "application/json");
  return new Response(body, { status, headers });
}

export function createExecutorBridgeHandler(runtime: ExecutorHttpRuntime) {
  return async (request: Request): Promise<Response> => {
    let deadline: Deadline;
    try { deadline = new Deadline(runtime.monoNow); } catch { return generic(503); }
    const abort = () => deadline.expire();
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) abort();
    let context: BridgeMessageContext | null = null;
    let route: Route | undefined;
    let activeRuntime = runtime;
    try {
      const url = new URL(request.url);
      route = ROUTES[url.pathname];
      if (request.method !== "POST") return generic(route && url.origin === runtime.connection.executorOrigin ? 405 : 404);
      if (!route || url.origin !== runtime.connection.executorOrigin || url.search !== "" || url.hash !== ""
        || request.headers.get("origin") !== null) return generic(404);
      const jobId = request.headers.get("x-arc-bridge-job-id");
      if (!jobId || !z.uuid().safeParse(jobId).success) return generic(401);
      context = { direction: "site-to-executor", kind: "request", method: "POST", path: route.path,
        audience: runtime.connection.executorOrigin, jobId, status: null };
      const body = await readBridgeBody(request, { maxBytes: BRIDGE_BODY_LIMITS.request,
        timeoutMs: deadline.remaining(), signal: deadline.controller.signal });
      activeRuntime = runtime.forRequest?.(() => deadline.ensure(), deadline.controller.signal) ?? runtime;
      const guardedNonces: BridgeNonceStore = { claim: async (claim) => {
        deadline.ensure();
        const result = await deadline.wait(() => activeRuntime.nonces.claim(claim));
        deadline.ensure();
        return result;
      } };
      const verifiedContext = context;
      await deadline.wait(() => verifyBridgeMessage({ context: verifiedContext, body, headers: request.headers,
        keyId: runtime.connection.siteToExecutor.keyId,
        keyBytes: runtime.connection.siteToExecutor.copyKeyBytes(), nonces: guardedNonces, now: runtime.wallNow }));
      const output = await execute(activeRuntime, route, body, jobId, deadline);
      return await signedResponse(activeRuntime, context, output, route.success, route.responseLimit, deadline,
        route.operation === "result");
    } catch (error) {
      if (!context || !route) return generic(401);
      const failure = error instanceof ClosedSubmission
        ? { status: 409, code: "closed" as const } : classify(error);
      if (failure.status === 401) return generic(401);
      try {
        return await signedResponse(activeRuntime, context, { code: failure.code }, failure.status,
          BRIDGE_BODY_LIMITS.status, deadline);
      } catch { return generic(503); }
    } finally {
      request.signal.removeEventListener("abort", abort);
      deadline.finish();
    }
  };
}
