import { z } from "zod";
import { env } from "cloudflare:workers";
import { readDocumentPolicy } from "../documents/policy";
import { MaterialContextService } from "../documents/context-builder";
import {
  generatePlanningRequestSchema,
  planningEventRequestSchema,
  planningMutationResponseSchema,
  planningWorkspaceResponseSchema,
  replanDecisionRequestSchema,
} from "../../contracts/planning-api";
import { MAX_PLANNING_RESPONSE_BYTES } from "../../contracts/planning-api";
export { MAX_PLANNING_RESPONSE_BYTES } from "../../contracts/planning-api";
import { flagshipUnitRegistry } from "../../data/flagship-unit-registry";
import { getD1 } from "../../../db/d1";
import { requireArcUser, UnauthenticatedError, type ArcUser } from "../auth/session";
import { BuiltinIntelligenceRepository } from "../intelligence/builtin-repository";
import { IntelligenceService } from "../intelligence/service";
import { D1OperationalEventSink } from "../observability/d1-events";
import { createOperationalEvent, type OperationalEvent } from "../observability/events";
import { PlanningInputError } from "../../lib/planning/path-builder";
import { D1PlanningRepository } from "../planning/d1-planning-repository";
import { PlanningSourceResolver } from "../planning/source-resolver";
import { D1PlanningReplayPackageReader, D1ResearchRepository } from "../research/d1-repository";
import {
  PlanningConflictError,
  PlanningInvalidInputError,
  PlanningNotFoundError,
  PlanningService,
  PlanningUnavailableError,
} from "../planning/service";
import { apiError, apiJson, applyResponseSafety, resolveRequestId, type ApiRecoveryAction } from "./api-response";
import { D1RateLimiter, RateLimitUnavailableError, type RateLimiter } from "./rate-limit";

const MAX_PLANNING_REQUEST_BYTES = 4 * 1024 * 1024;

type PlanningRouteService = Pick<PlanningService,
  "getWorkspaceResponse" | "generateResponse" | "appendEventResponse" |
  "acceptReplanResponse" | "discardReplanResponse">;

export type PlanningRouteDependencies = {
  requireUser(headers: Headers): Promise<ArcUser>;
  configuredOrigin?: () => string | null;
  createService(): PlanningRouteService;
  rateLimiter: RateLimiter;
  recordEvent(event: OperationalEvent): Promise<void>;
  createRequestId?: () => string;
  now?: () => number;
};

type RouteConfig = Readonly<{
  route: string;
  scope: string;
  limit: number;
  windowSeconds: number;
}>;

type RouteOutcome = Readonly<{
  body: unknown;
  counters?: Record<string, number>;
}>;

class InvalidPlanningBodyError extends Error {}
class ForbiddenPlanningOriginError extends Error {}

function requirePlanningWriteBoundary(request: Request, configured: string | null): void {
  let origin: string;
  try {
    if (!configured) throw new Error();
    const url = new URL(configured);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
    origin = url.origin;
  } catch { throw new PlanningUnavailableError(); }
  if (request.headers.get("origin") !== origin || new URL(request.url).origin !== origin
    || request.headers.get("sec-fetch-site") === "cross-site") throw new ForbiddenPlanningOriginError();
  if (request.headers.get("content-type")?.toLowerCase() !== "application/json") throw new InvalidPlanningBodyError();
}

async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  try {
    const raw = await readBoundedBody(request);
    const parsed = schema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) throw new InvalidPlanningBodyError();
    return parsed.data;
  } catch (error) {
    if (error instanceof InvalidPlanningBodyError) throw error;
    throw new InvalidPlanningBodyError();
  }
}

async function readBoundedBody(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed > MAX_PLANNING_REQUEST_BYTES) {
      await request.body?.cancel().catch(() => undefined);
      throw new InvalidPlanningBodyError();
    }
  }
  if (!request.body) throw new InvalidPlanningBodyError();
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PLANNING_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new InvalidPlanningBodyError();
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } catch (error) {
    if (error instanceof InvalidPlanningBodyError) throw error;
    await reader.cancel().catch(() => undefined);
    throw new InvalidPlanningBodyError();
  }
}

function safeRequestId(candidate: string | null | undefined): string {
  try { return resolveRequestId(candidate, fallbackRequestId); }
  catch { return fallbackRequestId(); }
}

function fallbackRequestId(): string {
  try { return crypto.randomUUID(); }
  catch { return "request-unavailable"; }
}

function errorResponse(error: unknown, requestId: string): { response: Response; resultCode: string } {
  if (error instanceof UnauthenticatedError) {
    return { resultCode: "UNAUTHENTICATED", response: apiError(
      "UNAUTHENTICATED", "Sign in to use Arc planning.", 401, requestId, undefined, "sign-in",
    ) };
  }
  if (error instanceof ForbiddenPlanningOriginError) {
    return { resultCode: "FORBIDDEN", response: apiError(
      "FORBIDDEN", "Planning writes require the configured same origin.", 403, requestId,
    ) };
  }
  if (error instanceof InvalidPlanningBodyError || error instanceof PlanningInputError
    || error instanceof PlanningInvalidInputError || error instanceof z.ZodError) {
    return { resultCode: "INVALID_INPUT", response: apiError(
      "INVALID_INPUT", "Planning input is invalid.", 400, requestId,
    ) };
  }
  if (error instanceof PlanningNotFoundError) {
    return { resultCode: "NOT_FOUND", response: apiError(
      "NOT_FOUND", "Planning workspace was not found.", 404, requestId,
    ) };
  }
  if (error instanceof PlanningConflictError) {
    return { resultCode: "CONFLICT", response: apiError(
      "CONFLICT", "Planning state changed. Refresh and try again.", 409, requestId, undefined, "refresh",
    ) };
  }
  if (error instanceof RateLimitUnavailableError || error instanceof PlanningUnavailableError) {
    const action: ApiRecoveryAction = error instanceof PlanningUnavailableError
      && error.reason === "version-mismatch" ? "rebuild" : "retry";
    const status = error instanceof PlanningUnavailableError
      && error.reason === "response-too-large" ? 500 : 503;
    return { resultCode: "PLANNING_UNAVAILABLE", response: apiError(
      "PLANNING_UNAVAILABLE", "Planning is temporarily unavailable.", status, requestId, undefined, action,
    ) };
  }
  return { resultCode: "INTERNAL", response: apiError(
    "INTERNAL", "Arc could not complete this planning request.", 500, requestId,
  ) };
}

async function recordSafely(
  deps: Omit<PlanningRouteDependencies, "createService">,
  input: Parameters<typeof createOperationalEvent>[0],
): Promise<void> {
  try { await deps.recordEvent(await createOperationalEvent(input)); }
  catch { /* Telemetry cannot alter an API result. */ }
}

export async function runPlanningRoute<Service>(
  request: Request,
  deps: Omit<PlanningRouteDependencies, "createService"> & { createService(): Service },
  config: RouteConfig,
  action: (service: Service, userId: string) => Promise<RouteOutcome>,
): Promise<Response> {
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
    if (request.method !== "GET" && request.method !== "HEAD" && deps.configuredOrigin) {
      requirePlanningWriteBoundary(request, deps.configuredOrigin());
    }
    const reservation = await deps.rateLimiter.reserve({
      scope: config.scope,
      subject: user.id,
      limit: config.limit,
      windowSeconds: config.windowSeconds,
    });
    if (!reservation.allowed) {
      resultCode = "RATE_LIMITED";
      response = apiError(
        "RATE_LIMITED", "Too many planning requests. Try again shortly.", 429, requestId,
        { "Retry-After": String(reservation.retryAfterSeconds) }, "retry",
      );
    } else {
      const outcome = await action(deps.createService(), user.id);
      assertPlanningResponseWireSize(outcome.body);
      resultCode = "OK";
      counters = outcome.counters ?? {};
      response = apiJson(outcome.body, requestId);
    }
  } catch (error) {
    const mapped = errorResponse(error, requestId);
    response = mapped.response;
    resultCode = mapped.resultCode;
  }

  await recordSafely(deps, {
    requestId,
    route: config.route,
    resultCode,
    latencyMs: Math.max(0, Math.round(now() - startedAt)),
    userId,
    counters,
  });
  return applyResponseSafety(response, requestId);
}

const readConfig: RouteConfig = {
  route: "/api/planning/workspace", scope: "planning:read", limit: 120, windowSeconds: 60,
};
const writeConfig = (route: string, scope: string): RouteConfig => ({ route, scope, limit: 30, windowSeconds: 60 });

export function createPlanningWorkspaceHandler(deps: PlanningRouteDependencies) {
  return (request: Request) => runPlanningRoute(request, deps, readConfig, async (service, userId) => {
    return { body: parseOutput(planningWorkspaceResponseSchema, await service.getWorkspaceResponse(userId)) };
  });
}

export function createPlanningGenerateHandler(deps: PlanningRouteDependencies) {
  return (request: Request) => runPlanningRoute(request, deps,
    writeConfig("/api/planning/generate", "planning:generate"), async (service, userId) => {
      const input = await parseBody(request, generatePlanningRequestSchema);
      const response = await service.generateResponse(userId, input);
      return { body: parseOutput(planningMutationResponseSchema, response), counters: {
        writes: 1, plans: response.result.workspace.planVersions.length,
        daily_units: response.result.workspace.dailyUnits.length,
      } };
    });
}

export function createPlanningEventHandler(deps: PlanningRouteDependencies) {
  return (request: Request) => runPlanningRoute(request, deps,
    writeConfig("/api/planning/events", "planning:events"), async (service, userId) => {
      const input = await parseBody(request, planningEventRequestSchema);
      const response = await service.appendEventResponse(userId, input);
      return { body: parseOutput(planningMutationResponseSchema, response), counters: { writes: 1, events: 1 } };
    });
}

export function createPlanningReplanHandler(deps: PlanningRouteDependencies, decision: "accept" | "discard") {
  const route = `/api/planning/replans/${decision}`;
  return (request: Request) => runPlanningRoute(request, deps,
    writeConfig(route, `planning:replans:${decision}`), async (service, userId) => {
      const input = await parseBody(request, replanDecisionRequestSchema);
      const response = decision === "accept"
        ? await service.acceptReplanResponse(userId, input)
        : await service.discardReplanResponse(userId, input);
      return { body: parseOutput(planningMutationResponseSchema, response), counters: { writes: 1, events: 1 } };
    });
}

function parseOutput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PlanningUnavailableError(["response-schema"]);
  return parsed.data;
}

export function assertPlanningResponseWireSize(value: unknown): void {
  let serialized: string;
  try { serialized = JSON.stringify(value); }
  catch { throw new PlanningUnavailableError(["response-serialization"]); }
  if (typeof serialized !== "string"
    || new TextEncoder().encode(serialized).byteLength > MAX_PLANNING_RESPONSE_BYTES) {
    throw new PlanningUnavailableError([], "response-too-large");
  }
}

export function createProductionPlanningService(): PlanningService {
    const db = getD1();
    const intelligence = new IntelligenceService(new BuiltinIntelligenceRepository());
    const sourceResolver = new PlanningSourceResolver({
      intelligence,
      flagshipRegistry: flagshipUnitRegistry,
      researchRepository: new D1ResearchRepository(db),
      replayPackageReader: new D1PlanningReplayPackageReader(db),
    });
    const policy = readDocumentPolicy(env as unknown as Record<string, unknown>);
    const repository = new D1PlanningRepository(db, { sourceResolver, allowMaterialAcceptance: policy.planningEnabled });
    return new PlanningService({
      repository, sourceResolver,
      ...(policy.planningEnabled ? { materials: new MaterialContextService({ db, sourceResolver, planningRepository: repository }) } : {}),
    });
}

export const productionPlanningRouteDependencies: PlanningRouteDependencies = {
  requireUser: (headers) => requireArcUser(headers),
  configuredOrigin: () => typeof env.BETTER_AUTH_URL === "string" ? env.BETTER_AUTH_URL : null,
  createService: createProductionPlanningService,
  rateLimiter: { reserve: (request) => new D1RateLimiter(getD1()).reserve(request) },
  recordEvent: (event) => new D1OperationalEventSink(getD1()).record(event),
};
