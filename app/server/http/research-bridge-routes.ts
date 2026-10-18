import { z } from "zod";
import { canonicalJson } from "../../lib/planning/fingerprint";
import { ResearchBudgetError } from "../research/budget";
import { BridgeAuthError, signBridgeMessage, verifyBridgeMessage, type BridgeMessageContext, type BridgeNonceStore } from "../research/executor/auth";
import { parseBridgeBeginGrant } from "../research/executor/begin";
import { BRIDGE_BODY_LIMITS, BridgeBodyError, decodeBridgeJson, readBridgeBody } from "../research/executor/body";
import {
  BridgeContractError, encodeBridgeDto, matchAcceptedProof, matchBridgeMetadata, matchReceiptNotice,
  matchUnsentProof, parseAcceptedProof, parseReceiptNotice, type BridgeIdentity, type ImportAcknowledgement,
  type MaintenanceReply, type ReceiptNotice,
} from "../research/executor/bridge-contract";
import type { ResearchBridgeConnection } from "../research/executor/connection-config";
import type { ExecutorBridgeClient } from "../research/executor/executor-client";
import { BridgeTransportError } from "../research/executor/http-transport";
import { hashBridgeJob } from "../research/executor/job";
import { parseBridgeReceiptMetadata } from "../research/executor/receipt";
import { ResearchRepositoryError } from "../research/repository";
import type { SiteBridgeOperations } from "../research/site-bridge-operations";
export type { SiteBridgeOperations } from "../research/site-bridge-operations";
import type { SiteExecutionIdentity, SiteExecutionRecord } from "../research/site-execution-repository";

export type SiteBridgeHandlerDependencies = {
  connection: ResearchBridgeConnection;
  nonces: BridgeNonceStore;
  createOperations: (guard: () => void) => SiteBridgeOperations;
  executor: ExecutorBridgeClient;
  newExecutionAllowed: () => boolean;
  wallNow: () => number;
  monoNow: () => number;
};

type Operation = "begin" | "accepted" | "complete" | "metadata" | "maintenance" | "outbox";
type Route = Readonly<{ operation: Operation; path: string; collection: boolean; responseLimit: number }>;
const OPERATIONS: readonly Operation[] = [
  "begin", "accepted", "complete", "metadata", "maintenance", "outbox",
] as const;
const ROUTES: Readonly<Record<string, Route>> = Object.freeze(Object.fromEntries(OPERATIONS.map((operation) => {
  const path = `/api/internal/research-bridge/${operation}`;
  return [path, Object.freeze({ operation, path, collection: operation === "maintenance" || operation === "outbox",
    responseLimit: operation === "outbox" ? BRIDGE_BODY_LIMITS.outbox : BRIDGE_BODY_LIMITS.status })];
})));
const identitySchema = z.object({ jobId: z.uuid(), requestHash: z.string().length(64).regex(/^[0-9a-f]{64}$/u) }).strict();
const emptySchema = z.object({}).strict();
const NO_STORE = { "cache-control": "no-store", "content-type": "application/json" } as const;

class DeadlineFailure extends Error {}
class Deadline {
  readonly end: number;
  readonly controller = new AbortController();
  private fenced = false;
  private readonly timer: ReturnType<typeof setTimeout>;
  constructor(private readonly now: () => number) {
    this.end = this.read() + 5_000;
    this.timer = setTimeout(() => this.expire(), 5_000);
  }
  private read() {
    const value = this.now();
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - 5_000) throw new DeadlineFailure();
    return value;
  }
  remaining(limit = this.end) {
    if (this.fenced || this.controller.signal.aborted) throw new DeadlineFailure();
    const value = limit - this.read();
    if (value <= 0) throw new DeadlineFailure();
    return Math.max(1, Math.ceil(value));
  }
  ensure(limit = this.end) { void this.remaining(limit); }
  expire() { this.fenced = true; this.controller.abort(); }
  finish() { clearTimeout(this.timer); this.expire(); }
  async wait<T>(work: Promise<T>, limit = this.end): Promise<T> {
    const remaining = this.remaining(limit);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new DeadlineFailure()), remaining); });
      const value = await Promise.race([work, timeout]);
      this.ensure(limit);
      return value;
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
}

class OperationGuard {
  private fenced = false;
  private readonly timer: ReturnType<typeof setTimeout>;
  constructor(private readonly deadline: Deadline, private readonly limit: number) {
    this.timer = setTimeout(() => { this.fenced = true; }, deadline.remaining(limit));
    this.ensure = this.ensure.bind(this);
  }
  ensure() {
    if (this.fenced) throw new DeadlineFailure();
    this.deadline.ensure(this.limit);
  }
  finish() { clearTimeout(this.timer); this.fenced = true; }
}

function generic(status: 401 | 404 | 405 | 503) { return new Response("{}", { status, headers: NO_STORE }); }

function classify(error: unknown): Readonly<{ status: number; code: "not-found" | "closed" | "conflict" | "unauthorized" | "invalid-message" | "temporary" }> {
  if (error instanceof DeadlineFailure) return { status: 503, code: "temporary" };
  if (error instanceof BridgeAuthError) return error.code === "unavailable"
    ? { status: 503, code: "temporary" }
    : { status: 401, code: "unauthorized" };
  if (error instanceof BridgeBodyError || error instanceof BridgeContractError) {
    if (error instanceof BridgeContractError && error.code === "conflict") return { status: 409, code: "conflict" };
    if (error instanceof BridgeContractError && error.code === "unavailable") return { status: 503, code: "temporary" };
    return { status: 400, code: "invalid-message" };
  }
  if (error instanceof z.ZodError) return { status: 400, code: "invalid-message" };
  if (error instanceof BridgeTransportError) {
    if (error.kind === "not-found") return { status: 404, code: "not-found" };
    if (error.kind === "closed") return { status: 409, code: "closed" };
    if (error.kind === "conflict") return { status: 409, code: "conflict" };
    if (error.kind === "authentication") return { status: 401, code: "unauthorized" };
    if (error.kind === "protocol") return { status: 400, code: "invalid-message" };
    return { status: 503, code: "temporary" };
  }
  if (error instanceof ResearchRepositoryError) {
    if (error.code === "NOT_FOUND") return { status: 404, code: "not-found" };
    if (error.code === "CONFLICT") return { status: 409, code: "conflict" };
    return { status: 503, code: "temporary" };
  }
  if (error instanceof ResearchBudgetError) return error.code === "CONFLICT"
    ? { status: 409, code: "conflict" } : { status: 503, code: "temporary" };
  return { status: 503, code: "temporary" };
}

function originalGrant(execution: SiteExecutionRecord) {
  if (execution.beganAt === null || execution.executionExpiresAt === null) throw new ResearchRepositoryError("CONFLICT");
  return parseBridgeBeginGrant({ protocol: execution.job.protocol, jobId: execution.jobId,
    requestHash: execution.requestHash, beganAt: execution.beganAt, executionExpiresAt: execution.executionExpiresAt });
}

function acknowledgement(notice: ReceiptNotice, accounting: ImportAcknowledgement["accounting"]): ImportAcknowledgement {
  return Object.freeze({ ...notice, accounting });
}

function sameIdentity(left: SiteExecutionIdentity, right: SiteExecutionIdentity): boolean {
  return left.ownerId === right.ownerId && left.runId === right.runId && left.requestId === right.requestId
    && left.jobId === right.jobId && left.requestHash === right.requestHash;
}

function exactFrozenGrant(value: unknown, execution: SiteExecutionRecord): boolean {
  return canonicalJson(value) === canonicalJson(originalGrant(execution));
}

async function lookupMatched(operations: SiteBridgeOperations, input: BridgeIdentity, deadline: Deadline) {
  const found = await deadline.wait(operations.bridge.lookup(input));
  const requestHash = await deadline.wait(hashBridgeJob(found.execution.job));
  if (requestHash !== input.requestHash || found.execution.jobId !== input.jobId) throw new ResearchRepositoryError("CONFLICT");
  return found;
}

async function maintainOne(dependencies: SiteBridgeHandlerDependencies, operations: SiteBridgeOperations, identity: SiteExecutionIdentity,
  deadline: Deadline, workEnd: number, signal: AbortSignal): Promise<void> {
  deadline.ensure(workEnd);
  let found = await deadline.wait(operations.bridge.lookup({ jobId: identity.jobId, requestHash: identity.requestHash }), workEnd);
  if (found.execution.beganAt === null) {
    await deadline.wait(operations.admission.reconcileBeforeBegin(found.identity), workEnd);
    return;
  }
  const journal = await deadline.wait(operations.importJournal.read(found.identity), workEnd);
  if (journal) await deadline.wait(operations.imports.reconcileMetadata(found.identity, journal.metadata), workEnd);
  deadline.ensure(workEnd);
  await deadline.wait(operations.expiry.reconcile(found.identity, null), workEnd);
  const recovery = await deadline.wait(operations.recovery.read(found.identity), workEnd);
  if (!recovery || !sameIdentity(recovery.identity, found.identity)
    || recovery.executionVersion !== found.execution.version || !recovery.quotaDone || !recovery.budgetDone
    || recovery.reason !== "expired-unknown" || recovery.unsent !== null) return;
  if (!found.execution.budgetReservationId) throw new ResearchRepositoryError("CONFLICT");
  const reservation = await deadline.wait(operations.budget.readReservation(found.identity.ownerId,
    found.execution.budgetReservationId), workEnd);
  if (!reservation || reservation.id !== found.execution.budgetReservationId
    || reservation.ownerId !== found.identity.ownerId || reservation.runId !== found.identity.runId
    || reservation.requestId !== found.identity.requestId
    || reservation.maximumMicros !== found.execution.policy.maximumMicros
    || reservation.expiresAt !== found.execution.reservationExpiresAt
    || reservation.status !== "conservative-hold" || reservation.settledMicros !== 0) return;
  deadline.ensure(workEnd);
  const status = await deadline.wait(dependencies.executor.status(found.execution.job, { signal }), workEnd);
  if (status.metadata) {
    found = await deadline.wait(operations.bridge.lookup({ jobId: identity.jobId, requestHash: identity.requestHash }), workEnd);
    const metadata = await deadline.wait(matchBridgeMetadata(status.metadata, found.execution.job), workEnd);
    if (!exactFrozenGrant(metadata.grant, found.execution)) throw new BridgeContractError("conflict");
    deadline.ensure(workEnd);
    if (status.bodyState === "available") {
      const notice = parseReceiptNotice({ jobId: status.jobId, requestHash: status.requestHash, receiptHash: metadata.receiptHash });
      const receipt = await deadline.wait(dependencies.executor.result(found.execution.job, notice,
        originalGrant(found.execution), { signal }), workEnd);
      await deadline.wait(operations.imports.complete(found.identity, receipt), workEnd);
    } else await deadline.wait(operations.imports.reconcileMetadata(found.identity, metadata), workEnd);
    return;
  }
  let proof = status.unsent;
  if (!proof && status.dispatchState === "unclaimed") {
    deadline.ensure(workEnd);
    proof = await deadline.wait(dependencies.executor.close(found.execution.job, { signal }), workEnd);
  }
  if (!proof) return;
  deadline.ensure(workEnd);
  found = await deadline.wait(operations.bridge.lookup({ jobId: identity.jobId, requestHash: identity.requestHash }), workEnd);
  const matched = await deadline.wait(matchUnsentProof(proof, found.execution.job), workEnd);
  if (matched.grant !== null && !exactFrozenGrant(matched.grant, found.execution)) throw new BridgeContractError("conflict");
  deadline.ensure(workEnd);
  await deadline.wait(operations.expiry.reconcile(found.identity, matched), workEnd);
}

async function maintenance(dependencies: SiteBridgeHandlerDependencies, operations: SiteBridgeOperations, deadline: Deadline): Promise<MaintenanceReply> {
  const workEnd = deadline.end - 500;
  const controller = new AbortController();
  const abort = () => controller.abort();
  deadline.controller.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), deadline.remaining(workEnd));
  let visited = 0;
  let failed = 0;
  try {
    while (visited < 10) {
      deadline.ensure(workEnd);
      const identity = await deadline.wait(operations.bridge.nextScan("maintenance"), workEnd);
      if (!identity) break;
      visited += 1;
      try { await maintainOne(dependencies, operations, identity, deadline, workEnd, controller.signal); }
      catch (error) { failed += 1; if (error instanceof DeadlineFailure) break; }
    }
  } finally {
    clearTimeout(timer);
    deadline.controller.signal.removeEventListener("abort", abort);
    controller.abort();
  }
  return Object.freeze({ visited, failed });
}

async function execute(dependencies: SiteBridgeHandlerDependencies, operations: SiteBridgeOperations, route: Route, body: Uint8Array,
  jobId: string, deadline: Deadline): Promise<unknown> {
  const input = decodeBridgeJson(body);
  if (route.collection) {
    emptySchema.parse(input);
    if (route.operation === "maintenance") return maintenance(dependencies, operations, deadline);
    if (!dependencies.newExecutionAllowed()) return Object.freeze({ jobs: Object.freeze([]), next: null });
    const identity = await deadline.wait(operations.bridge.nextScan("outbox"));
    if (!identity) return Object.freeze({ jobs: Object.freeze([]), next: null });
    const found = await deadline.wait(operations.bridge.lookup({ jobId: identity.jobId, requestHash: identity.requestHash }));
    const eligible = await deadline.wait(operations.outboxEligibility.isEligible(found.identity, found.execution.version));
    deadline.ensure();
    if (!eligible || !dependencies.newExecutionAllowed()) return Object.freeze({ jobs: Object.freeze([]), next: null });
    return Object.freeze({ jobs: Object.freeze([found.execution.job]), next: null });
  }
  if (route.operation === "begin") {
    const identity = identitySchema.parse(input);
    if (identity.jobId !== jobId) throw new BridgeContractError("conflict");
    const found = await lookupMatched(operations, identity, deadline);
    deadline.ensure();
    return operations.begin.begin({ ...found.identity, newExecutionAllowed: dependencies.newExecutionAllowed() });
  }
  if (route.operation === "accepted") {
    const proof = parseAcceptedProof(input);
    if (proof.jobId !== jobId) throw new BridgeContractError("conflict");
    const found = await deadline.wait(operations.bridge.lookup({ jobId: proof.jobId, requestHash: proof.requestHash }));
    await deadline.wait(matchAcceptedProof(proof, found.execution.job));
    deadline.ensure();
    return operations.bridge.recordAcceptance(proof);
  }
  if (route.operation === "complete") {
    const notice = parseReceiptNotice(input);
    if (notice.jobId !== jobId) throw new BridgeContractError("conflict");
    const found = await deadline.wait(operations.bridge.lookup({ jobId: notice.jobId, requestHash: notice.requestHash }));
    await deadline.wait(matchReceiptNotice(notice, found.execution.job));
    deadline.ensure();
    const completed = await deadline.wait(operations.imports.readCompleted(found.identity, notice.receiptHash));
    if (completed) return acknowledgement(notice, completed.accounting);
    deadline.ensure();
    const receipt = await deadline.wait(dependencies.executor.result(found.execution.job, notice,
      originalGrant(found.execution), { signal: deadline.controller.signal }));
    deadline.ensure();
    const result = await deadline.wait(operations.imports.complete(found.identity, receipt));
    return acknowledgement(notice, result.accounting);
  }
  const metadata = parseBridgeReceiptMetadata(input);
  if (metadata.grant.jobId !== jobId) throw new BridgeContractError("conflict");
  const found = await deadline.wait(operations.bridge.lookup({ jobId: metadata.grant.jobId, requestHash: metadata.grant.requestHash }));
  const matched = await deadline.wait(matchBridgeMetadata(metadata, found.execution.job));
  if (canonicalJson(matched.grant) !== canonicalJson(originalGrant(found.execution))) throw new BridgeContractError("conflict");
  deadline.ensure();
  const result = await deadline.wait(operations.imports.reconcileMetadata(found.identity, matched));
  return acknowledgement(parseReceiptNotice({ jobId: matched.grant.jobId, requestHash: matched.grant.requestHash,
    receiptHash: matched.receiptHash }), result.accounting);
}

async function signedResponse(dependencies: SiteBridgeHandlerDependencies, context: BridgeMessageContext,
  value: unknown, status: number, limit: number, deadline: Deadline): Promise<Response> {
  const body = encodeBridgeDto(value, limit);
  const headers = await deadline.wait(signBridgeMessage({ context: { ...context, kind: "response", status }, body,
    keyId: dependencies.connection.executorToSite.keyId,
    keyBytes: dependencies.connection.executorToSite.copyKeyBytes(), now: dependencies.wallNow }));
  headers.set("cache-control", "no-store");
  headers.set("content-type", "application/json");
  return new Response(body, { status, headers });
}

export function createSiteBridgeHandler(dependencies: SiteBridgeHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    let deadline: Deadline;
    try { deadline = new Deadline(dependencies.monoNow); } catch { return generic(503); }
    const abort = () => deadline.expire();
    request.signal.addEventListener("abort", abort, { once: true });
    if (request.signal.aborted) abort();
    let context: BridgeMessageContext | null = null;
    let route: Route | undefined;
    let operationGuard: OperationGuard | undefined;
    try {
      const url = new URL(request.url);
      route = ROUTES[url.pathname];
      if (request.method !== "POST") return generic(route && url.origin === dependencies.connection.siteOrigin ? 405 : 404);
      if (!route || url.origin !== dependencies.connection.siteOrigin || url.search !== "" || url.hash !== ""
        || request.headers.get("origin") !== null) return generic(404);
      const jobId = request.headers.get("x-arc-bridge-job-id");
      if (!jobId || (route.collection ? jobId !== "collection" : !z.uuid().safeParse(jobId).success)) return generic(401);
      context = { direction: "executor-to-site", kind: "request", method: "POST", path: route.path,
        audience: dependencies.connection.siteOrigin, jobId, status: null };
      operationGuard = new OperationGuard(deadline, route.operation === "maintenance" ? deadline.end - 500 : deadline.end);
      const operations = dependencies.createOperations(operationGuard.ensure);
      operationGuard.ensure();
      const body = await readBridgeBody(request, { maxBytes: BRIDGE_BODY_LIMITS.request,
        timeoutMs: Math.min(30_000, deadline.remaining()), signal: deadline.controller.signal });
      const guardedNonces: BridgeNonceStore = { claim: async (claim) => {
        deadline.ensure();
        return deadline.wait(dependencies.nonces.claim(claim));
      } };
      await deadline.wait(verifyBridgeMessage({ context, body, headers: request.headers,
        keyId: dependencies.connection.executorToSite.keyId,
        keyBytes: dependencies.connection.executorToSite.copyKeyBytes(), nonces: guardedNonces, now: dependencies.wallNow }));
      const output = await deadline.wait(execute(dependencies, operations, route, body, jobId, deadline));
      const response = await signedResponse(dependencies, context, output, 200, route.responseLimit, deadline);
      return response;
    } catch (error) {
      if (!context || !route) return generic(401);
      const failure = classify(error);
      try {
        return await signedResponse(dependencies, context, { code: failure.code }, failure.status,
          BRIDGE_BODY_LIMITS.status, deadline);
      } catch { return generic(503); }
    } finally {
      request.signal.removeEventListener("abort", abort);
      operationGuard?.finish();
      deadline.finish();
    }
  };
}
