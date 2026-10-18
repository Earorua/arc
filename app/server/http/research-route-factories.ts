import { z } from "zod";
import {
  researchErrorEnvelopeSchema,
  researchRetryRequestSchema,
  researchRunPublicViewSchema,
  researchSuccessEnvelopeSchema,
  researchRequestSchema,
  type ResearchErrorCode,
  type ResearchRecovery,
  type ResearchRunPublicView,
} from "../../contracts/research";
import { getD1 } from "../../../db/d1";
import { requireArcUser, UnauthenticatedError, type ArcUser } from "../auth/session";
import { D1OperationalEventSink } from "../observability/d1-events";
import { createOperationalEvent, type OperationalEvent } from "../observability/events";
import { ResearchRepositoryError } from "../research/repository";
import { createResearchServiceFactory } from "../research/service-factory";
import type { ResearchGateContext, ResearchOrchestrator } from "../research/orchestrator";
import { apiJson, applyResponseSafety, resolveRequestId } from "./api-response";
import { D1RateLimiter, RateLimitUnavailableError, type RateLimiter } from "./rate-limit";

const MAX_RESEARCH_REQUEST_BYTES = 16 * 1024;
const runIdSchema = z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

export type ResearchRouteService = Pick<ResearchOrchestrator, "start" | "get" | "retry">;

export type ResearchRouteDependencies = {
  requireUser(headers: Headers): Promise<ArcUser>;
  createReadService(): ResearchRouteService;
  createWriteService(): ResearchRouteService | null;
  rateLimiter: RateLimiter;
  cohortEnabled(userId: string): Promise<boolean>;
  deriveIpSubject(request: Request): Promise<string>;
  configuredOrigin(): string | null;
  recordEvent(event: OperationalEvent): Promise<void>;
  createRequestId?: () => string;
  now?: () => number;
  rateLimitPerMinute(): number;
};

type RouteConfig = Readonly<{
  route: string;
  scope: string;
  kind: "read" | "write";
}>;

type RouteResult = Readonly<{
  resultCode: ResearchErrorCode | "OK";
  response: Response;
}>;

class InvalidResearchRequestError extends Error {}
class HiddenResearchNotFoundError extends Error {}
class ResearchRouteUnavailableError extends Error {}

function fallbackRequestId() {
  try { return crypto.randomUUID(); }
  catch { return "request-unavailable"; }
}

function safeRequestId(candidate: string | null | undefined) {
  try { return resolveRequestId(candidate, fallbackRequestId); }
  catch { return fallbackRequestId(); }
}

function boundedRetryAfter(value: unknown) {
  return Number.isInteger(value) ? Math.min(3_600, Math.max(1, value as number)) : 60;
}

function publicError(
  code: ResearchErrorCode,
  message: string,
  status: number,
  requestId: string,
  recovery?: ResearchRecovery,
  run?: ResearchRunPublicView,
  retryAfter?: number,
) {
  const body = researchErrorEnvelopeSchema.parse({
    error: { code, message, ...(recovery ? { recovery } : {}) },
    ...(run ? { run } : {}),
    requestId,
  });
  return apiJson(body, requestId, {
    status,
    ...(status === 429 ? { headers: { "Retry-After": String(boundedRetryAfter(retryAfter)) } } : {}),
  });
}

function errorResponse(error: unknown, requestId: string): RouteResult {
  if (error instanceof UnauthenticatedError) return { resultCode: "UNAUTHENTICATED", response: publicError(
    "UNAUTHENTICATED", "Sign in to use Arc research.", 401, requestId, "sign-in",
  ) };
  if (error instanceof InvalidResearchRequestError) return {
    resultCode: "INVALID_INPUT", response: publicError("INVALID_INPUT", "Research input is invalid.", 400, requestId),
  };
  if (error instanceof HiddenResearchNotFoundError
    || error instanceof ResearchRepositoryError && error.code === "NOT_FOUND") return {
    resultCode: "NOT_FOUND", response: publicError("NOT_FOUND", "Research run was not found.", 404, requestId),
  };
  if (error instanceof ResearchRepositoryError && error.code === "CONFLICT") return {
    resultCode: "CONFLICT", response: publicError(
      "CONFLICT", "Research state changed. Refresh and try again.", 409, requestId, "refresh",
    ),
  };
  if (error instanceof RateLimitUnavailableError || error instanceof ResearchRouteUnavailableError
    || error instanceof ResearchRepositoryError && error.code === "RESEARCH_UNAVAILABLE") return {
    resultCode: "RESEARCH_UNAVAILABLE", response: publicError(
      "RESEARCH_UNAVAILABLE", "Research is temporarily unavailable.", 503, requestId, "retry-or-flagship",
    ),
  };
  return { resultCode: "INTERNAL", response: publicError(
    "INTERNAL", "Arc could not complete this research request.", 500, requestId,
  ) };
}

function contentTypeIsJson(value: string | null) {
  return value !== null && /^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(value);
}

function requireMutationSecurity(request: Request, deps: ResearchRouteDependencies) {
  const configured = deps.configuredOrigin();
  if (!configured) throw new ResearchRouteUnavailableError();
  let expected: string;
  let actual: string;
  try {
    expected = new URL(configured).origin;
    actual = new URL(request.headers.get("origin") ?? "invalid:").origin;
  } catch { throw new InvalidResearchRequestError(); }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (actual !== expected || fetchSite !== "same-origin") {
    throw new InvalidResearchRequestError();
  }
  if (!contentTypeIsJson(request.headers.get("content-type"))) throw new InvalidResearchRequestError();
}

async function readBoundedBody(request: Request) {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_RESEARCH_REQUEST_BYTES)) {
    await request.body?.cancel().catch(() => undefined);
    throw new InvalidResearchRequestError();
  }
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidResearchRequestError();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let result = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESEARCH_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new InvalidResearchRequestError();
      }
      result += decoder.decode(chunk.value, { stream: true });
    }
    return result + decoder.decode();
  } catch (error) {
    if (error instanceof InvalidResearchRequestError) throw error;
    await reader.cancel().catch(() => undefined);
    throw new InvalidResearchRequestError();
  } finally {
    try { reader.releaseLock(); }
    catch { /* A body lifecycle failure cannot replace the boundary result. */ }
  }
}

async function cancelUnreadBody(request: Request) {
  if (!request.body || request.body.locked) return;
  try { await request.body.cancel(); }
  catch { /* Body cleanup cannot replace the primary route result. */ }
}

async function parseBody<T>(request: Request, schema: z.ZodType<T>) {
  try {
    const parsed = schema.safeParse(JSON.parse(await readBoundedBody(request)) as unknown);
    if (!parsed.success) throw new InvalidResearchRequestError();
    return parsed.data;
  } catch (error) {
    if (error instanceof InvalidResearchRequestError) throw error;
    throw new InvalidResearchRequestError();
  }
}

function pathRunId(value: string) {
  const parsed = runIdSchema.safeParse(value);
  if (!parsed.success) throw new HiddenResearchNotFoundError();
  return parsed.data;
}

async function reserve(deps: ResearchRouteDependencies, input: {
  scope: string;
  subject: string;
  limit: number;
}) {
  try {
    const result = await deps.rateLimiter.reserve({ ...input, windowSeconds: 60 });
    if (typeof result.allowed !== "boolean" || !Number.isInteger(result.retryAfterSeconds)) throw new Error();
    return result;
  } catch { throw new RateLimitUnavailableError(); }
}

function successResponse(run: unknown, requestId: string) {
  const parsed = researchRunPublicViewSchema.safeParse(run);
  if (!parsed.success) throw new ResearchRouteUnavailableError();
  return apiJson(researchSuccessEnvelopeSchema.parse({ run: parsed.data, requestId }), requestId);
}

function writeResponse(run: unknown, requestId: string): RouteResult {
  const parsed = researchRunPublicViewSchema.safeParse(run);
  if (!parsed.success) throw new ResearchRouteUnavailableError();
  if (parsed.data.state === "needs-review") return {
    resultCode: "RESEARCH_NEEDS_REVIEW",
    response: publicError(
      "RESEARCH_NEEDS_REVIEW", "Research needs review before it can be used.", 422,
      requestId, "retry-or-flagship", parsed.data,
    ),
  };
  if (parsed.data.state === "failed") {
    if (parsed.data.failureCategory === "rate-limited") return {
      resultCode: "RATE_LIMITED",
      response: publicError(
        "RATE_LIMITED", "Too many research requests. Try again shortly.", 429,
        requestId, "retry", parsed.data, 60,
      ),
    };
    if (parsed.data.failureCategory === "allowance-reached") return {
      resultCode: "ALLOWANCE_REACHED",
      response: publicError(
        "ALLOWANCE_REACHED", "The current Research allowance has been reached.", 429,
        requestId, "use-flagship", parsed.data, 60,
      ),
    };
    return {
      resultCode: "RESEARCH_UNAVAILABLE",
      response: publicError(
        "RESEARCH_UNAVAILABLE", "Research is temporarily unavailable.", 503,
        requestId, "retry-or-flagship", parsed.data,
      ),
    };
  }
  return { resultCode: "OK", response: successResponse(parsed.data, requestId) };
}

async function recordSafely(deps: ResearchRouteDependencies, input: Parameters<typeof createOperationalEvent>[0]) {
  try { await deps.recordEvent(await createOperationalEvent(input)); }
  catch { /* Telemetry cannot change a Research result. */ }
}

async function runRoute<T>(
  request: Request,
  deps: ResearchRouteDependencies,
  config: RouteConfig,
  prepare: () => Promise<T>,
  action: (
    service: ResearchRouteService,
    userId: string,
    input: T,
    gate: ResearchGateContext,
    requestId: string,
  ) => Promise<RouteResult>,
  beforeCohort?: (service: ResearchRouteService, userId: string, input: T) => Promise<void>,
) {
  let requestId = "request-unavailable";
  const now = deps.now ?? Date.now;
  const startedAt = now();
  let userId: string | null = null;
  let resultCode = "INTERNAL";
  let response: Response;
  try {
    let candidate: string | undefined;
    try { candidate = (deps.createRequestId ?? (() => crypto.randomUUID()))(); }
    catch { candidate = undefined; }
    requestId = safeRequestId(candidate);
    const user = await deps.requireUser(request.headers);
    userId = user.id;
    const input = await prepare();
    const limit = config.kind === "read" ? 120 : deps.rateLimitPerMinute();
    if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new ResearchRouteUnavailableError();
    const service = config.kind === "read" ? deps.createReadService() : deps.createWriteService();
    if (!service) throw new ResearchRouteUnavailableError();
    const account = await reserve(deps, { scope: `${config.scope}:account`, subject: user.id, limit });
    if (!account.allowed) {
      resultCode = "RATE_LIMITED";
      response = publicError(
        "RATE_LIMITED", "Too many research requests. Try again shortly.", 429,
        requestId, "retry", undefined, account.retryAfterSeconds,
      );
    } else if (config.kind === "write") {
      let ipSubject: string;
      try { ipSubject = await deps.deriveIpSubject(request); }
      catch { throw new ResearchRouteUnavailableError(); }
      const ip = await reserve(deps, { scope: `${config.scope}:ip`, subject: ipSubject, limit });
      if (!ip.allowed) {
        resultCode = "RATE_LIMITED";
        response = publicError(
          "RATE_LIMITED", "Too many research requests. Try again shortly.", 429,
          requestId, "retry", undefined, ip.retryAfterSeconds,
        );
      } else {
        await beforeCohort?.(service, user.id, input);
        const cohortEnabled = await deps.cohortEnabled(user.id);
        if (!cohortEnabled) {
          resultCode = "ALLOWANCE_REACHED";
          response = publicError(
            "ALLOWANCE_REACHED", "The current Research allowance has been reached.", 429,
            requestId, "use-flagship", undefined, 60,
          );
        } else {
          const result = await action(
            service, user.id, input, { cohortEnabled: true, rateAllowed: true }, requestId,
          );
          response = result.response;
          resultCode = result.resultCode;
        }
      }
    } else {
      const result = await action(
        service, user.id, input, { cohortEnabled: false, rateAllowed: false }, requestId,
      );
      response = result.response;
      resultCode = result.resultCode;
    }
  } catch (error) {
    if (config.kind === "write") await cancelUnreadBody(request);
    const mapped = errorResponse(error, requestId);
    resultCode = mapped.resultCode;
    response = mapped.response;
  }
  await recordSafely(deps, {
    requestId,
    route: config.route,
    resultCode,
    latencyMs: Math.max(0, Math.round(now() - startedAt)),
    userId,
    counters: {},
  });
  return applyResponseSafety(response, requestId);
}

export function createResearchStartHandler(deps: ResearchRouteDependencies) {
  return createWriteHandler(deps, {
    route: "/api/intelligence/research", scope: "research:start", kind: "write",
  }, async (request) => {
    requireMutationSecurity(request, deps);
    return parseBody(request, researchRequestSchema);
  }, (service, userId, input, gate) => service.start(userId, input, gate));
}

function createWriteHandler<T>(
  deps: ResearchRouteDependencies,
  config: RouteConfig,
  prepare: (request: Request) => Promise<T>,
  invoke: (service: ResearchRouteService, userId: string, input: T, gate: ResearchGateContext) => Promise<ResearchRunPublicView>,
  beforeCohort?: (service: ResearchRouteService, userId: string, input: T) => Promise<void>,
) {
  return (request: Request) => runRoute(request, deps, config, () => prepare(request),
    async (service, userId, input, gate, requestId) =>
      writeResponse(await invoke(service, userId, input, gate), requestId), beforeCohort);
}

export function createResearchGetHandler(deps: ResearchRouteDependencies, runIdInput: string) {
  return (request: Request) => runRoute(request, deps, {
      route: "/api/intelligence/research/[id]", scope: "research:read", kind: "read",
    }, async () => pathRunId(runIdInput), async (service, userId, runId, _gate, requestId) => {
      const run = await service.get(userId, runId);
      if (!run) throw new HiddenResearchNotFoundError();
      return { resultCode: "OK", response: successResponse(run, requestId) };
    });
}

export function createResearchRetryHandler(deps: ResearchRouteDependencies, runIdInput: string) {
  return createWriteHandler(deps, {
    route: "/api/intelligence/research/[id]/retry", scope: "research:retry", kind: "write",
  }, async (request) => {
    requireMutationSecurity(request, deps);
    const runId = pathRunId(runIdInput);
    const input = await parseBody(request, researchRetryRequestSchema);
    return { runId, mutationId: input.mutationId };
  }, (service, userId, input, gate) => service.retry(userId, input.runId, input.mutationId, gate),
  async (service, userId, input) => {
    if (!await service.get(userId, input.runId)) throw new HiddenResearchNotFoundError();
  });
}

const productionServiceFactory = createResearchServiceFactory();

export const productionResearchRouteDependencies: ResearchRouteDependencies = {
  requireUser: (headers) => requireArcUser(headers),
  createReadService: () => productionServiceFactory.createRecoveryService(),
  createWriteService: () => productionServiceFactory.createNewCallService(),
  rateLimiter: { reserve: (request) => new D1RateLimiter(getD1()).reserve(request) },
  cohortEnabled: (userId) => productionServiceFactory.cohortEnabled(userId),
  deriveIpSubject: (request) => productionServiceFactory.deriveIpSubject(request),
  configuredOrigin: () => productionServiceFactory.configuredOrigin(),
  recordEvent: (event) => new D1OperationalEventSink(getD1()).record(event),
  rateLimitPerMinute: () => productionServiceFactory.rateLimitPerMinute(),
};
