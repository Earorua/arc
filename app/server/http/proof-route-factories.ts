import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  createProofRequestSchema,
  reviseProofRequestSchema,
  setProofVisibilityRequestSchema,
  withdrawProofRequestSchema,
} from "../../contracts/proof-ledger";
import { proofMutationResponseSchema, proofWorkspaceResponseSchema } from "../../contracts/proof-api";
import { flagshipBlueprint } from "../../data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../data/flagship-unit-registry";
import { getD1 } from "../../../db/d1";
import { requireArcUser, UnauthenticatedError, type ArcUser } from "../auth/session";
import { D1OperationalEventSink } from "../observability/d1-events";
import { createOperationalEvent, type OperationalEvent } from "../observability/events";
import { D1ProofRepository } from "../proof/d1-proof-repository";
import { D1PlanningRepository } from "../planning/d1-planning-repository";
import { PlanningSourceResolver } from "../planning/source-resolver";
import { D1ResearchRepository } from "../research/d1-repository";
import { BuiltinIntelligenceRepository } from "../intelligence/builtin-repository";
import { IntelligenceService } from "../intelligence/service";
import { ProofService, ProofServiceError } from "../proof/service";
import { R2ProofStorage, readProofJson } from "../proof/storage";
import { apiError, apiJson, applyResponseSafety, resolveRequestId } from "./api-response";
import { D1RateLimiter, RateLimitUnavailableError, type RateLimiter } from "./rate-limit";

const MAX_PROOF_REQUEST_BYTES = 1024 * 1024;
const proofIdSchema = z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

type ProofRouteService = Pick<ProofService,
  "getWorkspace" | "create" | "revise" | "withdraw" | "setVisibility">;

export type ProofRouteDependencies = {
  requireUser(headers: Headers): Promise<ArcUser>;
  createService(): ProofRouteService;
  rateLimiter: RateLimiter;
  recordEvent(event: OperationalEvent): Promise<void>;
  createRequestId?: () => string;
  now?: () => number;
};

type RouteConfig = Readonly<{ route: string; scope: string; limit: number; windowSeconds: number }>;
type RouteOutcome = Readonly<{ body: unknown; counters?: Record<string, number> }>;
class InvalidProofBodyError extends Error {}
class HiddenProofNotFoundError extends Error {}

async function readBoundedBody(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed > MAX_PROOF_REQUEST_BYTES) {
      await request.body?.cancel().catch(() => undefined);
      throw new InvalidProofBodyError();
    }
  }
  if (!request.body) throw new InvalidProofBodyError();
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PROOF_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new InvalidProofBodyError();
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } catch (error) {
    if (error instanceof InvalidProofBodyError) throw error;
    await reader.cancel().catch(() => undefined);
    throw new InvalidProofBodyError();
  }
}

async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  try {
    const parsed = schema.safeParse(JSON.parse(await readBoundedBody(request)) as unknown);
    if (!parsed.success) throw new InvalidProofBodyError();
    return parsed.data;
  } catch (error) {
    if (error instanceof InvalidProofBodyError) throw error;
    throw new InvalidProofBodyError();
  }
}

function pathId(input: string) {
  const parsed = proofIdSchema.safeParse(input);
  if (!parsed.success) throw new HiddenProofNotFoundError();
  return parsed.data;
}

function fallbackRequestId() {
  try { return crypto.randomUUID(); }
  catch { return "request-unavailable"; }
}

function safeRequestId(candidate: string | null | undefined) {
  try { return resolveRequestId(candidate, fallbackRequestId); }
  catch { return fallbackRequestId(); }
}

function errorResponse(error: unknown, requestId: string) {
  if (error instanceof UnauthenticatedError) return { code: "UNAUTHENTICATED", response: apiError(
    "UNAUTHENTICATED", "Sign in to use Arc proof.", 401, requestId, undefined, "sign-in",
  ) };
  if (error instanceof InvalidProofBodyError
    || error instanceof ProofServiceError && error.code === "INVALID_INPUT") {
    return { code: "INVALID_INPUT", response: apiError(
      "INVALID_INPUT", "Proof input is invalid.", 400, requestId,
    ) };
  }
  if (error instanceof HiddenProofNotFoundError
    || error instanceof ProofServiceError && error.code === "NOT_FOUND") {
    return { code: "NOT_FOUND", response: apiError(
      "NOT_FOUND", "Proof was not found.", 404, requestId,
    ) };
  }
  if (error instanceof ProofServiceError && error.code === "CONFLICT") return {
    code: "CONFLICT", response: apiError(
      "CONFLICT", "Proof state changed. Refresh and try again.", 409, requestId, undefined, "refresh",
    ),
  };
  if (error instanceof RateLimitUnavailableError
    || error instanceof ProofServiceError && error.code === "UNAVAILABLE") {
    return { code: "UNAVAILABLE", response: apiError(
      "UNAVAILABLE", "Proof is temporarily unavailable.", 503, requestId, undefined, "retry",
    ) };
  }
  return { code: "INTERNAL", response: apiError(
    "INTERNAL", "Arc could not complete this proof request.", 500, requestId,
  ) };
}

async function runRoute(
  request: Request,
  deps: ProofRouteDependencies,
  config: RouteConfig,
  action: (service: ProofRouteService, userId: string) => Promise<RouteOutcome>,
) {
  let requestId = "request-unavailable";
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  let userId: string | null = null;
  let resultCode = "INTERNAL";
  let counters: Record<string, number> = {};
  let response: Response;
  try {
    let candidate: string | undefined;
    try { candidate = (deps.createRequestId ?? (() => crypto.randomUUID()))(); }
    catch { candidate = undefined; }
    requestId = safeRequestId(candidate);
    const user = await deps.requireUser(request.headers);
    userId = user.id;
    const reservation = await deps.rateLimiter.reserve({
      scope: config.scope, subject: user.id, limit: config.limit, windowSeconds: config.windowSeconds,
    });
    if (!reservation.allowed) {
      resultCode = "RATE_LIMITED";
      response = apiError("RATE_LIMITED", "Too many proof requests. Try again shortly.", 429,
        requestId, { "Retry-After": String(reservation.retryAfterSeconds) }, "retry");
    } else {
      const outcome = await action(deps.createService(), user.id);
      resultCode = "OK";
      counters = outcome.counters ?? {};
      response = apiJson(outcome.body, requestId);
    }
  } catch (error) {
    const mapped = errorResponse(error, requestId);
    resultCode = mapped.code;
    response = mapped.response;
  }
  try {
    await deps.recordEvent(await createOperationalEvent({
      requestId, route: config.route, resultCode,
      latencyMs: Math.max(0, Math.round(now() - startedAt)), userId, counters,
    }));
  } catch { /* Telemetry never changes the response. */ }
  return applyResponseSafety(response, requestId);
}

const config = (route: string, scope: string, limit = 30): RouteConfig =>
  ({ route, scope, limit, windowSeconds: 60 });

function output<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ProofServiceError("UNAVAILABLE");
  return parsed.data;
}

export function createProofWorkspaceHandler(deps: ProofRouteDependencies) {
  return (request: Request) => runRoute(request, deps, config("/api/proofs/workspace", "proof:read", 120),
    async (service, userId) => ({
      body: output(proofWorkspaceResponseSchema, { workspace: await service.getWorkspace(userId) }),
    }));
}

export function createProofCreateHandler(deps: ProofRouteDependencies) {
  return (request: Request) => runRoute(request, deps, config("/api/proofs", "proof:create"),
    async (service, userId) => ({
      body: output(proofMutationResponseSchema, {
        result: await service.create(userId, await parseBody(request, createProofRequestSchema)),
      }), counters: { writes: 1 },
    }));
}

export function createProofReviseHandler(deps: ProofRouteDependencies, proofIdInput: string) {
  return (request: Request) => runRoute(request, deps, config("/api/proofs/[id]/versions", "proof:revise"),
    async (service, userId) => ({
      body: output(proofMutationResponseSchema, {
        result: await service.revise(userId, pathId(proofIdInput), await parseBody(request, reviseProofRequestSchema)),
      }), counters: { writes: 1 },
    }));
}

export function createProofWithdrawHandler(deps: ProofRouteDependencies, proofIdInput: string) {
  return (request: Request) => runRoute(request, deps, config("/api/proofs/[id]/withdraw", "proof:withdraw"),
    async (service, userId) => ({
      body: output(proofMutationResponseSchema, {
        result: await service.withdraw(userId, pathId(proofIdInput), await parseBody(request, withdrawProofRequestSchema)),
      }), counters: { writes: 1 },
    }));
}

export function createProofVisibilityHandler(deps: ProofRouteDependencies, proofIdInput: string) {
  return (request: Request) => runRoute(request, deps, config("/api/proofs/[id]/visibility", "proof:visibility"),
    async (service, userId) => ({
      body: output(proofMutationResponseSchema, {
        result: await service.setVisibility(userId, pathId(proofIdInput),
          await parseBody(request, setProofVisibilityRequestSchema)),
      }), counters: { writes: 1 },
    }));
}

export const productionProofRouteDependencies: ProofRouteDependencies = {
  requireUser: (headers) => requireArcUser(headers),
  createService: () => {
    const db = getD1();
    const repository = new D1ProofRepository(db);
    const storage = new R2ProofStorage(env.PROOF_ASSETS);
    const sourceResolver = new PlanningSourceResolver({
      intelligence: new IntelligenceService(new BuiltinIntelligenceRepository()),
      flagshipRegistry: flagshipUnitRegistry,
      researchRepository: new D1ResearchRepository(db),
    });
    return new ProofService({
      repository, blueprint: flagshipBlueprint, registry: flagshipUnitRegistry,
      planningSource: {
        repository: new D1PlanningRepository(db, { sourceResolver }),
        resolver: sourceResolver,
      },
      readJsonAsset: (key) => readProofJson(storage, key),
    });
  },
  rateLimiter: { reserve: (request) => new D1RateLimiter(getD1()).reserve(request) },
  recordEvent: (event) => new D1OperationalEventSink(getD1()).record(event),
};
