import {
  AccountLinkError,
  accountLinkProviderSchema,
  PENDING_REAUTH_TTL_MS,
  safeAccountLinkStatusSchema,
  startAccountLinkSchema,
  VERIFIED_GRANT_TTL_MS,
  type AccountLinkProvider,
} from "./contracts";
import {
  clearAccountLinkCookie,
  readAccountLinkCookie,
  serializeAccountLinkCookie,
} from "./cookie";
import {
  createAccountLinkCredential,
  createSignedLinkContext,
  hashAccountLinkCredential,
  verifySignedLinkContext,
} from "./crypto";
import { D1AccountLinkRepository } from "./d1-repository";
import { AccountLinkService } from "./service";
import { getD1 } from "../../../db/d1";
import { readAuthPolicy } from "../auth/policy";
import { getAuth, readRuntimeEnvironment } from "../auth/runtime";
import { requireArcUser, UnauthenticatedError, type ArcUser } from "../auth/session";
import { apiError, apiJson } from "../http/api-response";
import {
  D1RateLimiter,
  RateLimitUnavailableError,
  type RateLimiter,
} from "../http/rate-limit";
import { D1OperationalEventSink } from "../observability/d1-events";
import {
  createOperationalEvent,
  type OperationalEvent,
} from "../observability/events";

type AccountLinkHttpService = Pick<AccountLinkService, "start" | "status" | "continue">;

export type AccountLinkHttpDependencies = {
  requireUser: (headers: Headers) => Promise<ArcUser>;
  service: AccountLinkHttpService;
  readCredential: (headers: Headers) => string | null;
  serializeCredential: (value: string, maxAgeSeconds: number) => string;
  clearCredential: () => string;
  rateLimiter: RateLimiter;
  configuredOrigin: string | (() => string);
  recordEvent: (event: OperationalEvent) => Promise<void>;
  createRequestId?: () => string;
  now?: () => number;
};

type RouteName = "start" | "status" | "continue";

const routeConfigs: Record<RouteName, { limit: number; windowSeconds: number }> = {
  start: { limit: 5, windowSeconds: 10 * 60 },
  continue: { limit: 10, windowSeconds: 10 * 60 },
  status: { limit: 60, windowSeconds: 60 },
};

class InvalidAccountLinkInputError extends Error {}
class InvalidAccountLinkOriginError extends Error {}
class AccountLinkUnavailableError extends Error {}

const MAX_START_FORM_BYTES = 4 * 1024;

function configuredOrigin(value: AccountLinkHttpDependencies["configuredOrigin"]) {
  return typeof value === "function" ? value() : value;
}

function requireMutationOrigin(request: Request, expectedOrigin: string) {
  let actualOrigin: string;
  try {
    actualOrigin = new URL(request.headers.get("origin") ?? "invalid:").origin;
  } catch {
    throw new InvalidAccountLinkOriginError();
  }
  if (actualOrigin !== expectedOrigin) {
    throw new InvalidAccountLinkOriginError();
  }
}

function validStartFormContentType(value: string | null) {
  if (!value) return false;
  if (/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/iu.test(value)) {
    return true;
  }
  return /^multipart\/form-data\s*;\s*boundary=(?:"[0-9A-Za-z'()+_,./:=?-]{1,70}"|[0-9A-Za-z'()+_,./:=?-]{1,70})$/iu
    .test(value);
}

async function readBoundedStartForm(request: Request) {
  const contentType = request.headers.get("content-type");
  if (!validStartFormContentType(contentType)) throw new InvalidAccountLinkInputError();

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/u.test(declaredLength)) throw new InvalidAccountLinkInputError();
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length > MAX_START_FORM_BYTES) {
      throw new InvalidAccountLinkInputError();
    }
  }

  const reader = request.body?.getReader();
  if (!reader) throw new InvalidAccountLinkInputError();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_START_FORM_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The request is rejected regardless of transport cancellation support.
      }
      throw new InvalidAccountLinkInputError();
    }
    chunks.push(value);
  }

  const bounded = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bounded.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return await new Response(bounded, {
    headers: { "Content-Type": contentType as string },
  }).formData();
}

async function parseStartForm(request: Request) {
  try {
    const form = await readBoundedStartForm(request);
    const keys = [...form.keys()];
    const parsed = startAccountLinkSchema.safeParse({
      targetProvider: form.get("targetProvider"),
    });
    if (!parsed.success || keys.length !== 1 || keys[0] !== "targetProvider") {
      throw new InvalidAccountLinkInputError();
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof InvalidAccountLinkInputError) throw error;
    throw new InvalidAccountLinkInputError();
  }
}

function appendSetCookies(target: Headers, source: Headers) {
  const enhanced = source as Headers & { getSetCookie?: () => string[] };
  const cookies = enhanced.getSetCookie?.() ?? [];
  for (const [name, value] of source) {
    if (name.toLowerCase() !== "set-cookie") target.append(name, value);
  }
  if (cookies.length > 0) {
    for (const cookie of cookies) target.append("Set-Cookie", cookie);
    return;
  }
  const cookie = source.get("set-cookie");
  if (cookie) target.append("Set-Cookie", cookie);
}

function redirectResponse(
  authorizationUrl: string,
  upstreamHeaders: Headers,
  arcCookie: string | null,
  requestId: string,
) {
  const headers = new Headers();
  appendSetCookies(headers, upstreamHeaders);
  if (arcCookie) headers.append("Set-Cookie", arcCookie);
  headers.set("Location", authorizationUrl);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Request-Id", requestId);
  return new Response(null, { status: 303, headers });
}

function clearCookieHeaders(deps: AccountLinkHttpDependencies) {
  const headers = new Headers();
  headers.append("Set-Cookie", deps.clearCredential());
  return headers;
}

function mappedError(
  error: unknown,
  requestId: string,
  deps: AccountLinkHttpDependencies,
) {
  if (error instanceof UnauthenticatedError) {
    return apiError("UNAUTHENTICATED", "Sign in again to continue.", 401, requestId);
  }
  if (error instanceof InvalidAccountLinkInputError) {
    return apiError("INVALID_INPUT", "Choose a valid sign-in method.", 400, requestId);
  }
  if (error instanceof InvalidAccountLinkOriginError) {
    return apiError("FORBIDDEN", "This request could not be verified.", 403, requestId);
  }
  if (error instanceof RateLimitUnavailableError) {
    return apiError("UNAVAILABLE", "Connection could not start. Try again.", 503, requestId);
  }
  if (error instanceof AccountLinkUnavailableError) {
    return apiError("UNAVAILABLE", "Connection could not start. Try again.", 503, requestId);
  }
  if (error instanceof AccountLinkError) {
    if (error.code === "NOT_CONFIGURED" || error.code === "NO_SOURCE_PROVIDER") {
      return apiError("INVALID_INPUT", "Choose a valid sign-in method.", 400, requestId);
    }
    if (error.code === "ALREADY_CONNECTED" || error.code === "LINK_CONFLICT") {
      return apiError("CONFLICT", "That sign-in method is already connected.", 409, requestId);
    }
    if (error.code === "EXPIRED") {
      return apiError(
        "CONFLICT",
        "Verification expired. Start again.",
        409,
        requestId,
        clearCookieHeaders(deps),
      );
    }
    if (
      error.code === "REPLAYED"
      || error.code === "INVALID_INTENT"
      || error.code === "IDENTITY_MISMATCH"
    ) {
      return apiError(
        "CONFLICT",
        "Connection wasn't completed. Start again.",
        409,
        requestId,
        clearCookieHeaders(deps),
      );
    }
    if (error.code === "OAUTH_FAILED") {
      return apiError("UNAVAILABLE", "Connection could not start. Try again.", 503, requestId);
    }
  }
  return apiError(
    "INTERNAL",
    "Connection could not be completed. Nothing changed.",
    500,
    requestId,
  );
}

async function reserveRateLimit(
  deps: AccountLinkHttpDependencies,
  route: RouteName,
  userId: string,
) {
  const config = routeConfigs[route];
  try {
    return await deps.rateLimiter.reserve({
      scope: `account-link:${route}`,
      subject: userId,
      limit: config.limit,
      windowSeconds: config.windowSeconds,
    });
  } catch {
    throw new RateLimitUnavailableError();
  }
}

async function recordResult(
  deps: AccountLinkHttpDependencies,
  input: {
    requestId: string;
    route: RouteName;
    resultCode: string;
    startedAt: number;
    userId: string | null;
  },
) {
  const now = deps.now ?? (() => Date.now());
  try {
    const event = await createOperationalEvent({
      requestId: input.requestId,
      route: `/api/account-link/${input.route}`,
      resultCode: input.resultCode,
      latencyMs: Math.max(0, Math.round(now() - input.startedAt)),
      userId: input.userId,
      counters: {},
    });
    await deps.recordEvent(event);
  } catch {
    // Telemetry is intentionally best-effort and never changes the account-link result.
  }
}

async function runRoute(
  request: Request,
  deps: AccountLinkHttpDependencies,
  route: RouteName,
  action: (user: ArcUser, requestId: string) => Promise<Response>,
) {
  const requestId = (deps.createRequestId ?? (() => crypto.randomUUID()))();
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  let userId: string | null = null;
  let resultCode = "INTERNAL";
  let response: Response;
  try {
    const user = await deps.requireUser(request.headers);
    userId = user.id;
    if (route !== "status") {
      let expectedOrigin: string;
      try {
        expectedOrigin = configuredOrigin(deps.configuredOrigin);
      } catch (error) {
        if (error instanceof InvalidAccountLinkOriginError) throw error;
        throw new AccountLinkUnavailableError();
      }
      requireMutationOrigin(request, expectedOrigin);
    }
    const reservation = await reserveRateLimit(deps, route, user.id);
    if (!reservation.allowed) {
      resultCode = "RATE_LIMITED";
      response = apiError(
        "RATE_LIMITED",
        "Too many attempts. Wait before trying again.",
        429,
        requestId,
        { "Retry-After": String(reservation.retryAfterSeconds) },
      );
    } else {
      response = await action(user, requestId);
      resultCode = "OK";
    }
  } catch (error) {
    response = mappedError(error, requestId, deps);
    resultCode = response.status === 401
      ? "UNAUTHENTICATED"
      : response.status === 403
        ? "FORBIDDEN"
        : response.status === 429
          ? "RATE_LIMITED"
          : response.status === 503
            ? "UNAVAILABLE"
            : response.status === 409
              ? "CONFLICT"
              : response.status === 400
                ? "INVALID_INPUT"
                : "INTERNAL";
  }
  await recordResult(deps, { requestId, route, resultCode, startedAt, userId });
  return response;
}

export function createAccountLinkHandlers(deps: AccountLinkHttpDependencies) {
  return {
    start(request: Request) {
      return runRoute(request, deps, "start", async (user, requestId) => {
        const input = await parseStartForm(request);
        const result = await deps.service.start(request.headers, user.id, input.targetProvider);
        return redirectResponse(
          result.authorizationUrl,
          result.authHeaders,
          deps.serializeCredential(result.credential, PENDING_REAUTH_TTL_MS / 1000),
          requestId,
        );
      });
    },
    status(request: Request) {
      return runRoute(request, deps, "status", async (user, requestId) => {
        const credential = deps.readCredential(request.headers);
        const rawStatus = await deps.service.status(user.id, credential, request.headers);
        const status = safeAccountLinkStatusSchema.parse({
          stage: rawStatus.stage,
          targetProvider: rawStatus.targetProvider,
          expiresAt: rawStatus.expiresAt,
        });
        const headers = new Headers();
        if (status.stage && ["completed", "failed", "expired"].includes(status.stage)) {
          headers.append("Set-Cookie", deps.clearCredential());
        } else if (status.stage === "verified" && credential) {
          const expiresAt = Date.parse(status.expiresAt ?? "");
          const remainingMs = expiresAt - (deps.now ?? (() => Date.now()))();
          if (Number.isFinite(remainingMs) && remainingMs > 0) {
            const maxAge = Math.min(
              VERIFIED_GRANT_TTL_MS / 1000,
              Math.max(1, Math.ceil(remainingMs / 1000)),
            );
            headers.append("Set-Cookie", deps.serializeCredential(credential, maxAge));
          }
        }
        return apiJson(status, requestId, { headers });
      });
    },
    continue(request: Request) {
      return runRoute(request, deps, "continue", async (user, requestId) => {
        const credential = deps.readCredential(request.headers);
        const result = await deps.service.continue(request.headers, user.id, credential);
        return redirectResponse(
          result.authorizationUrl,
          result.authHeaders,
          credential
            ? deps.serializeCredential(credential, PENDING_REAUTH_TTL_MS / 1000)
            : null,
          requestId,
        );
      });
    },
  };
}

type ProductionAuth = {
  api: {
    listUserAccounts(input: { headers: Headers }): Promise<Array<{ providerId: string }>>;
    linkSocialAccount(input: {
      headers: Headers;
      body: { provider: AccountLinkProvider; disableRedirect: true };
      returnHeaders: true;
    }): Promise<{
      response: { url: string | null | undefined; redirect: boolean };
      headers: Headers;
    }>;
  };
};

export type AccountLinkProductionRuntime = {
  requireUser: (headers: Headers) => Promise<ArcUser>;
  getD1: () => D1Database;
  getAuth: () => ProductionAuth;
  readEnvironment: typeof readRuntimeEnvironment;
  createRequestId: () => string;
  createId: () => string;
  now: () => Date;
};

const defaultProductionRuntime: AccountLinkProductionRuntime = {
  requireUser: (headers) => requireArcUser(headers),
  getD1,
  getAuth: getAuth as unknown as () => ProductionAuth,
  readEnvironment: readRuntimeEnvironment,
  createRequestId: () => crypto.randomUUID(),
  createId: () => crypto.randomUUID(),
  now: () => new Date(),
};

async function listConnectedAccounts(
  runtime: AccountLinkProductionRuntime,
  headers: Headers,
): Promise<AccountLinkProvider[]> {
  const rows = await runtime.getAuth().api.listUserAccounts({ headers });
  const providers: AccountLinkProvider[] = [];
  for (const row of rows) {
    const provider = accountLinkProviderSchema.safeParse(row.providerId);
    if (provider.success && !providers.includes(provider.data)) providers.push(provider.data);
  }
  return providers;
}

function createProductionService(runtime: AccountLinkProductionRuntime) {
  const environment = runtime.readEnvironment();
  const policy = readAuthPolicy(environment);
  const secret = environment.BETTER_AUTH_SECRET;
  if (!policy.isReady || !secret) throw new AccountLinkUnavailableError();
  const db = runtime.getD1();
  return new AccountLinkService({
    repository: new D1AccountLinkRepository(db),
    listAccounts: (headers) => listConnectedAccounts(runtime, headers),
    startProviderLink: async ({ headers, provider, internalProof }) => {
      const proofHeaders = new Headers(headers);
      proofHeaders.set("X-Arc-Link-Proof", internalProof);
      const result = await runtime.getAuth().api.linkSocialAccount({
        headers: proofHeaders,
        body: { provider, disableRedirect: true },
        returnHeaders: true,
      });
      if (!result.response.url) {
        throw new AccountLinkError("OAUTH_FAILED", "Provider authorization did not start");
      }
      return { url: result.response.url, headers: result.headers };
    },
    createCredential: createAccountLinkCredential,
    hashCredential: hashAccountLinkCredential,
    createProof: (context) => createSignedLinkContext(secret, context),
    verifyProof: (token, kind, currentTime) => verifySignedLinkContext(
      secret,
      token,
      kind,
      currentTime,
    ),
    createId: runtime.createId,
    now: runtime.now,
  });
}

function lazyProductionService(runtime: AccountLinkProductionRuntime): AccountLinkHttpService {
  async function invoke<T>(action: (service: AccountLinkService) => Promise<T>): Promise<T> {
    try {
      return await action(createProductionService(runtime));
    } catch (error) {
      if (error instanceof AccountLinkError) throw error;
      throw new AccountLinkUnavailableError();
    }
  }
  return {
    start: (...args) => invoke((service) => service.start(...args)),
    status: (...args) => invoke((service) => service.status(...args)),
    continue: (...args) => invoke((service) => service.continue(...args)),
  };
}

export function createProductionAccountLinkDependencies(
  runtime: AccountLinkProductionRuntime = defaultProductionRuntime,
): AccountLinkHttpDependencies {
  return {
    requireUser: async (headers) => {
      try {
        return await runtime.requireUser(headers);
      } catch (error) {
        if (error instanceof UnauthenticatedError) throw error;
        throw new AccountLinkUnavailableError();
      }
    },
    service: lazyProductionService(runtime),
    readCredential: readAccountLinkCookie,
    serializeCredential: serializeAccountLinkCookie,
    clearCredential: clearAccountLinkCookie,
    rateLimiter: {
      reserve: (request) => new D1RateLimiter(runtime.getD1()).reserve(request),
    },
    configuredOrigin: () => {
      const environment = runtime.readEnvironment();
      const policy = readAuthPolicy(environment);
      if (!policy.isReady) throw new AccountLinkUnavailableError();
      return new URL(policy.origin).origin;
    },
    recordEvent: (event) => new D1OperationalEventSink(runtime.getD1()).record(event),
    createRequestId: runtime.createRequestId,
    now: () => runtime.now().getTime(),
  };
}

export function createProductionAccountLinkHandlers(
  runtime: AccountLinkProductionRuntime = defaultProductionRuntime,
) {
  return createAccountLinkHandlers(createProductionAccountLinkDependencies(runtime));
}
