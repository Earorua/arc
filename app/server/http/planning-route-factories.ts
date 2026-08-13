import { z } from "zod";
import {
  generatePlanningRequestSchema,
  planningEventRequestSchema,
  planningMutationResponseSchema,
  planningWorkspaceResponseSchema,
  replanDecisionRequestSchema,
} from "../../contracts/planning-api";
import { flagshipUnitRegistry } from "../../data/flagship-unit-registry";
import { getD1 } from "../../../db/d1";
import { requireArcUser, UnauthenticatedError, type ArcUser } from "../auth/session";
import { BuiltinIntelligenceRepository } from "../intelligence/builtin-repository";
import { IntelligenceService } from "../intelligence/service";
import { D1OperationalEventSink } from "../observability/d1-events";
import { createOperationalEvent, type OperationalEvent } from "../observability/events";
import { PlanningInputError } from "../../lib/planning/path-builder";
import { D1PlanningRepository } from "../planning/d1-planning-repository";
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
  "getWorkspace" | "generate" | "appendEvent" | "acceptReplan" | "discardReplan">;

export type PlanningRouteDependencies = {
  requireUser(headers: Headers): Promise<ArcUser>;
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
      && error.issues.some((issue) => /schema|version/iu.test(issue)) ? "rebuild" : "retry";
    return { resultCode: "PLANNING_UNAVAILABLE", response: apiError(
      "PLANNING_UNAVAILABLE", "Planning is temporarily unavailable.", 503, requestId, undefined, action,
    ) };
  }
  return { resultCode: "INTERNAL", response: apiError(
    "INTERNAL", "Arc could not complete this planning request.", 500, requestId,
  ) };
}

async function recordSafely(
  deps: PlanningRouteDependencies,
  input: Parameters<typeof createOperationalEvent>[0],
): Promise<void> {
  try { await deps.recordEvent(await createOperationalEvent(input)); }
  catch { /* Telemetry cannot alter an API result. */ }
}

async function runPlanningRoute(
  request: Request,
  deps: PlanningRouteDependencies,
  config: RouteConfig,
  action: (service: PlanningRouteService, userId: string) => Promise<RouteOutcome>,
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
    const workspace = await service.getWorkspace(userId);
    return { body: parseOutput(planningWorkspaceResponseSchema, { workspace }) };
  });
}

export function createPlanningGenerateHandler(deps: PlanningRouteDependencies) {
  return (request: Request) => runPlanningRoute(request, deps,
    writeConfig("/api/planning/generate", "planning:generate"), async (service, userId) => {
      const input = await parseBody(request, generatePlanningRequestSchema);
      const result = await service.generate(userId, input);
      return { body: parseOutput(planningMutationResponseSchema, { result }), counters: {
        writes: 1, plans: result.workspace.planVersions.length, daily_units: result.workspace.dailyUnits.length,
      } };
    });
}

export function createPlanningEventHandler(deps: PlanningRouteDependencies) {
  return (request: Request) => runPlanningRoute(request, deps,
    writeConfig("/api/planning/events", "planning:events"), async (service, userId) => {
      const input = await parseBody(request, planningEventRequestSchema);
      const result = await service.appendEvent(userId, input);
      return { body: parseOutput(planningMutationResponseSchema, { result }), counters: { writes: 1, events: 1 } };
    });
}

export function createPlanningReplanHandler(deps: PlanningRouteDependencies, decision: "accept" | "discard") {
  const route = `/api/planning/replans/${decision}`;
  return (request: Request) => runPlanningRoute(request, deps,
    writeConfig(route, `planning:replans:${decision}`), async (service, userId) => {
      const input = await parseBody(request, replanDecisionRequestSchema);
      const result = decision === "accept"
        ? await service.acceptReplan(userId, input)
        : await service.discardReplan(userId, input);
      return { body: parseOutput(planningMutationResponseSchema, { result }), counters: { writes: 1, events: 1 } };
    });
}

function parseOutput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PlanningUnavailableError(["response-schema"]);
  return parsed.data;
}

export const productionPlanningRouteDependencies: PlanningRouteDependencies = {
  requireUser: (headers) => requireArcUser(headers),
  createService: () => new PlanningService({
    repository: new D1PlanningRepository(getD1()),
    intelligence: new IntelligenceService(new BuiltinIntelligenceRepository()),
    registry: flagshipUnitRegistry,
  }),
  rateLimiter: { reserve: (request) => new D1RateLimiter(getD1()).reserve(request) },
  recordEvent: (event) => new D1OperationalEventSink(getD1()).record(event),
};
