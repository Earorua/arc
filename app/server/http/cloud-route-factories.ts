import { z } from "zod";
import {
  completionMutationSchema,
  migrationRequestSchema,
  workspaceMutationSchema,
  type CloudSnapshot,
  type MigrationResult,
} from "../../contracts/cloud-state";
import { getD1 } from "../../../db/d1";
import { requireArcUser, UnauthenticatedError, type ArcUser } from "../auth/session";
import { D1CloudRepository } from "../cloud/d1-cloud-repository";
import { ResearchSetupConflictError } from "../cloud/repository";
import { CloudService } from "../cloud/service";
import { D1OperationalEventSink } from "../observability/d1-events";
import {
  createOperationalEvent,
  type OperationalEvent,
} from "../observability/events";
import { apiError, apiJson } from "./api-response";
import {
  D1RateLimiter,
  RateLimitUnavailableError,
  type RateLimiter,
} from "./rate-limit";

type CloudRouteService = Pick<
  CloudService,
  "getWorkspace" | "saveSetup" | "importLocalState" | "recordCompletion"
>;

export type CloudRouteDependencies = {
  requireUser: (headers: Headers) => Promise<ArcUser>;
  createService: () => CloudRouteService;
  rateLimiter: RateLimiter;
  recordEvent: (event: OperationalEvent) => Promise<void>;
  createRequestId?: () => string;
  now?: () => number;
};

type RouteOutcome = {
  body: unknown;
  resultCode?: string;
  counters?: Record<string, number>;
};

type RouteConfig = {
  route: string;
  scope: string;
  limit: number;
  windowSeconds: number;
};

class InvalidInputError extends Error {}
class CloudConflictError extends Error {}

async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  try {
    const input: unknown = await request.json();
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new InvalidInputError();
    return parsed.data;
  } catch (error) {
    if (error instanceof InvalidInputError) throw error;
    throw new InvalidInputError();
  }
}

async function recordOperationalEvent(
  deps: CloudRouteDependencies,
  input: {
    requestId: string;
    route: string;
    resultCode: string;
    latencyMs: number;
    userId: string | null;
    counters: Record<string, number>;
  },
): Promise<void> {
  try {
    const event = await createOperationalEvent(input);
    await deps.recordEvent(event);
  } catch {
    // Operational telemetry is intentionally best-effort and never changes the API result.
  }
}

async function runAuthenticatedRoute(
  request: Request,
  deps: CloudRouteDependencies,
  config: RouteConfig,
  action: (userId: string) => Promise<RouteOutcome>,
): Promise<Response> {
  const requestId = (deps.createRequestId ?? (() => crypto.randomUUID()))();
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  let userId: string | null = null;
  let resultCode = "INTERNAL";
  let counters: Record<string, number> = {};
  let response: Response;

  try {
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
        "RATE_LIMITED",
        "Too many requests. Try again shortly.",
        429,
        requestId,
        { "Retry-After": String(reservation.retryAfterSeconds) },
      );
    } else {
      const outcome = await action(user.id);
      resultCode = outcome.resultCode ?? "OK";
      counters = outcome.counters ?? {};
      response = apiJson(outcome.body, requestId);
    }
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      resultCode = "UNAUTHENTICATED";
      response = apiError("UNAUTHENTICATED", "Sign in to use Arc cloud state.", 401, requestId);
    } else if (error instanceof InvalidInputError) {
      resultCode = "INVALID_INPUT";
      response = apiError("INVALID_INPUT", "The request body is invalid.", 400, requestId);
    } else if (error instanceof CloudConflictError || error instanceof ResearchSetupConflictError) {
      resultCode = "CONFLICT";
      response = apiError("CONFLICT", "An active cloud goal already exists.", 409, requestId);
    } else if (error instanceof RateLimitUnavailableError) {
      resultCode = "UNAVAILABLE";
      response = apiError("UNAVAILABLE", "This operation is temporarily unavailable.", 503, requestId);
    } else {
      resultCode = "INTERNAL";
      response = apiError("INTERNAL", "Arc could not complete this request.", 500, requestId);
    }
  }

  await recordOperationalEvent(deps, {
    requestId,
    route: config.route,
    resultCode,
    latencyMs: Math.max(0, Math.round(now() - startedAt)),
    userId,
    counters,
  });
  return response;
}

export function createWorkspaceHandlers(deps: CloudRouteDependencies) {
  return {
    GET(request: Request) {
      return runAuthenticatedRoute(request, deps, {
        route: "/api/workspace",
        scope: "workspace:read",
        limit: 120,
        windowSeconds: 60,
      }, async (userId) => ({
        body: { snapshot: await deps.createService().getWorkspace(userId) },
      }));
    },
    PUT(request: Request) {
      return runAuthenticatedRoute(request, deps, {
        route: "/api/workspace",
        scope: "workspace:write",
        limit: 30,
        windowSeconds: 60,
      }, async (userId) => {
        const mutation = await parseJson(request, workspaceMutationSchema);
        const snapshot: CloudSnapshot = await deps.createService().saveSetup(userId, mutation);
        return { body: { snapshot }, counters: { writes: 1 } };
      });
    },
  };
}

export function createMigrationHandler(deps: CloudRouteDependencies) {
  return (request: Request) => runAuthenticatedRoute(request, deps, {
    route: "/api/migrations/local-state",
    scope: "migration:local-state",
    limit: 5,
    windowSeconds: 300,
  }, async (userId) => {
    const migration = await parseJson(request, migrationRequestSchema);
    const result: MigrationResult = await deps.createService().importLocalState(userId, migration);
    if (result.status === "conflict") throw new CloudConflictError();
    return {
      body: { result },
      counters: {
        imported_completions: result.importedCompletionCount,
        imported_proofs: result.importedProofCount,
      },
    };
  });
}

export function createLearningEventHandler(deps: CloudRouteDependencies) {
  return (request: Request) => runAuthenticatedRoute(request, deps, {
    route: "/api/learning/events",
    scope: "learning:events",
    limit: 60,
    windowSeconds: 60,
  }, async (userId) => {
    const mutation = await parseJson(request, completionMutationSchema);
    const snapshot: CloudSnapshot = await deps.createService().recordCompletion(userId, mutation);
    return { body: { snapshot }, counters: { completions: 1 } };
  });
}

export const productionCloudRouteDependencies: CloudRouteDependencies = {
  requireUser: (headers) => requireArcUser(headers),
  createService: () => new CloudService(new D1CloudRepository(getD1())),
  rateLimiter: {
    reserve: (request) => new D1RateLimiter(getD1()).reserve(request),
  },
  recordEvent: (event) => new D1OperationalEventSink(getD1()).record(event),
};
