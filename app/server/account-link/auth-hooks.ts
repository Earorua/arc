import {
  APIError,
  createAuthMiddleware,
  getAuthoritativeSessionFromCtx as betterAuthGetAuthoritativeSessionFromCtx,
  getOAuthState as betterAuthGetOAuthState,
} from "better-auth/api";
import {
  accountLinkProviderSchema,
  TARGET_OAUTH_RECOVERY_TTL_MS,
  type AccountLinkIntent,
  type AccountLinkPhase,
  type AccountLinkProvider,
} from "./contracts";
import {
  createSignedLinkContext,
  hashAccountLinkCredential,
  verifySignedLinkContext,
  type SignedLinkContext,
} from "./crypto";
import { readAccountLinkCookie } from "./cookie";
import type { AccountLinkRepository } from "./repository";
import {
  AccountLinkService,
  type AccountLinkCallbackSettlement,
  type SettleAccountLinkCallbackInput,
} from "./service";

const RESULT_URLS = {
  reauth: {
    success: "/today?link=verified",
    error: "/today?link=error&stage=reauth",
  },
  target: {
    success: "/today?link=complete",
    error: "/today?link=error&stage=target",
  },
} as const;
const TARGET_CONFLICT_URL = "/today?link=conflict";

const OAUTH_STATE_TTL_MS = TARGET_OAUTH_RECOVERY_TTL_MS;
const ARC_LINK_DENIAL = {
  code: "ARC_ACCOUNT_LINK_DENIED",
  message: "Account link request denied",
} as const;

type OAuthState = {
  callbackURL?: unknown;
  errorURL?: unknown;
  link?: { userId?: unknown } | null;
  arcLinkContext?: unknown;
  [key: string]: unknown;
};

type AuthoritativeSession = {
  user: { id: string };
  session?: Record<string, unknown>;
} | null;

export type AccountLinkAuthHookOptions = {
  secret: string;
  getRepository: () => AccountLinkRepository;
  now?: () => Date;
  createNonce?: () => string;
  getOAuthState?: () => Promise<OAuthState | null>;
  getAuthoritativeSessionFromCtx?: (context: never) => Promise<AuthoritativeSession>;
  listAccountsForUser: (
    userId: string,
    headers: Headers,
  ) => Promise<readonly AccountLinkProvider[]>;
  settleCallback?: (
    input: SettleAccountLinkCallbackInput,
  ) => Promise<AccountLinkCallbackSettlement | void>;
};

function denial(): APIError {
  return APIError.from("FORBIDDEN", ARC_LINK_DENIAL);
}

function expectedIntentProvider(intent: AccountLinkIntent, phase: AccountLinkPhase) {
  return phase === "reauth" ? intent.sourceProvider : intent.targetProvider;
}

function intentStatusMatches(
  intent: AccountLinkIntent,
  phase: AccountLinkPhase,
  targetStatuses: readonly AccountLinkIntent["status"][],
) {
  return phase === "reauth"
    ? intent.status === "pending_reauth"
    : targetStatuses.includes(intent.status);
}

function hasArcLinkContext(state: OAuthState): boolean {
  return Object.prototype.hasOwnProperty.call(state, "arcLinkContext");
}

function callbackProvider(context: { params?: unknown }): unknown {
  if (!context.params || typeof context.params !== "object") return undefined;
  return (context.params as { id?: unknown }).id;
}

function requestHeaders(context: { headers?: unknown }): Headers {
  return context.headers instanceof Headers ? context.headers : new Headers();
}

function responseHeaders(context: { context?: unknown }): Headers | null {
  if (!context.context || typeof context.context !== "object") return null;
  const headers = (context.context as { responseHeaders?: unknown }).responseHeaders;
  return headers instanceof Headers ? headers : null;
}

function callbackErrorCode(location: string | null) {
  let providerCode = "";
  if (location) {
    try {
      providerCode = new URL(location, "https://arc.invalid").searchParams.get("error") ?? "";
    } catch {
      providerCode = "";
    }
  }

  return providerCode;
}

function isServerPhaseErrorLocation(location: string | null, phase: AccountLinkPhase) {
  if (!location?.startsWith("/") || location.startsWith("//")) return false;
  try {
    const parsed = new URL(location, "https://arc.invalid");
    const allowedParameters = new Set(["link", "stage", "error", "error_description"]);
    return parsed.origin === "https://arc.invalid"
      && parsed.pathname === "/today"
      && parsed.searchParams.get("link") === "error"
      && parsed.searchParams.get("stage") === phase
      && parsed.searchParams.has("error")
      && [...parsed.searchParams.keys()].every((key) => allowedParameters.has(key));
  } catch {
    return false;
  }
}

function mapCallbackError(location: string | null, phase: AccountLinkPhase) {
  if (!isServerPhaseErrorLocation(location, phase)) return "OAUTH_FAILED";
  const providerCode = callbackErrorCode(location);
  if (["access_denied", "oauth_cancelled", "cancelled", "user_cancelled"]
    .includes(providerCode)) {
    return "OAUTH_CANCELLED";
  }
  if (phase === "target" && providerCode === "account_already_linked_to_different_user") {
    return "LINK_CONFLICT";
  }
  if ([
    "state_mismatch",
    "state_not_found",
    "state_expired",
    "invalid_state",
    "invalid_callback_request",
  ].includes(providerCode)) {
    return "STATE_INVALID";
  }
  return "OAUTH_FAILED";
}

export function createAccountLinkAuthHooks(options: AccountLinkAuthHookOptions) {
  const now = options.now ?? (() => new Date());
  const createNonce = options.createNonce ?? (() => crypto.randomUUID());
  const getOAuthState = options.getOAuthState ?? betterAuthGetOAuthState;
  const getAuthoritativeSession = options.getAuthoritativeSessionFromCtx
    ?? (betterAuthGetAuthoritativeSessionFromCtx as never);

  async function verifyContext(token: unknown, kind: "internal" | "oauth") {
    if (typeof token !== "string" || token.length === 0) throw denial();
    try {
      return await verifySignedLinkContext(options.secret, token, kind, now().getTime());
    } catch {
      throw denial();
    }
  }

  async function loadBoundIntent(
    context: SignedLinkContext,
    repository = options.getRepository(),
    targetStatuses: readonly AccountLinkIntent["status"][] = [
      "consumed",
      "completing",
      "completed",
    ],
  ) {
    const intent = await repository.findById(context.intentId);
    const operationTime = now().getTime();
    if (
      !intent
      || intent.id !== context.intentId
      || intent.userId !== context.userId
      || expectedIntentProvider(intent, context.phase) !== context.provider
      || !intentStatusMatches(intent, context.phase, targetStatuses)
      || (context.phase === "reauth" && intent.expiresAt.getTime() <= operationTime)
    ) {
      throw denial();
    }
    return intent;
  }

  async function requireOwnerSession(context: never, ownerId: string) {
    let session: AuthoritativeSession;
    try {
      session = await getAuthoritativeSession(context);
    } catch {
      throw denial();
    }
    if (!session || session.user.id !== ownerId) throw denial();
    return session;
  }

  async function validateCallbackContext(
    endpointContext: never,
    state: OAuthState,
    provider: unknown,
  ) {
    const signed = await verifyContext(state.arcLinkContext, "oauth");
    const parsedProvider = accountLinkProviderSchema.safeParse(provider);
    const stateOwner = state.link?.userId;
    if (
      !parsedProvider.success
      || typeof stateOwner !== "string"
      || stateOwner !== signed.userId
      || parsedProvider.data !== signed.provider
      || state.callbackURL !== RESULT_URLS[signed.phase].success
      || state.errorURL !== RESULT_URLS[signed.phase].error
    ) {
      throw denial();
    }
    const repository = options.getRepository();
    const intent = await loadBoundIntent(signed, repository);
    if (intent.userId !== stateOwner) throw denial();
    await requireOwnerSession(endpointContext, stateOwner);
    const headers = requestHeaders(endpointContext);
    const credential = readAccountLinkCookie(headers);
    if (!credential) throw denial();
    const credentialIntent = await repository.findByCredential(
      signed.userId,
      await hashAccountLinkCredential(credential),
      now(),
    );
    if (!credentialIntent || credentialIntent.id !== intent.id) throw denial();
    return {
      signed,
      intent,
      provider: parsedProvider.data,
      stateOwner,
      repository,
      credential,
    };
  }

  async function settle(
    repository: AccountLinkRepository,
    input: SettleAccountLinkCallbackInput,
  ) {
    if (options.settleCallback) {
      return await options.settleCallback(input);
    }

    const unavailable = async () => {
      throw new Error("Unavailable outside account-link orchestration");
    };
    const service = new AccountLinkService({
      repository,
      listAccounts: async (headers) => [
        ...await options.listAccountsForUser(input.linkUserId, headers),
      ],
      startProviderLink: unavailable,
      createCredential: () => {
        throw new Error("Unavailable outside account-link orchestration");
      },
      hashCredential: hashAccountLinkCredential,
      createProof: (context) => createSignedLinkContext(options.secret, context),
      verifyProof: (token, kind, currentTime) => verifySignedLinkContext(
        options.secret,
        token,
        kind,
        currentTime,
      ),
      createId: createNonce,
      now,
    });
    return await service.settleCallback(input);
  }

  async function settleAttributableInvalidState(ctx: never) {
    const headers = responseHeaders(ctx);
    const location = headers?.get("location") ?? null;
    if (!["state_mismatch", "state_not_found", "state_expired"]
      .includes(callbackErrorCode(location))) {
      return;
    }

    const incomingHeaders = requestHeaders(ctx);
    const credential = readAccountLinkCookie(incomingHeaders);
    if (!credential) return;

    let session: AuthoritativeSession;
    try {
      session = await getAuthoritativeSession(ctx);
    } catch {
      return;
    }
    if (!session) return;

    const repository = options.getRepository();
    const intent = await repository.findByCredentialForAttribution(
      session.user.id,
      await hashAccountLinkCredential(credential),
    );
    if (!intent || intent.userId !== session.user.id) return;

    const provider = accountLinkProviderSchema.safeParse(callbackProvider(ctx));
    if (intent.status === "expired") {
      if (provider.success && provider.data === intent.sourceProvider) {
        headers?.set("location", RESULT_URLS.reauth.error);
      }
      return;
    }
    if (
      intent.status !== "pending_reauth"
      && intent.status !== "consumed"
      && intent.status !== "completing"
    ) return;

    const phase = intent.status === "pending_reauth" ? "reauth" : "target";
    if (!provider.success || provider.data !== expectedIntentProvider(intent, phase)) return;
    headers?.set("location", RESULT_URLS[phase].error);
  }

  const before = createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/link-social") return;

    const body = ctx.body && typeof ctx.body === "object"
      ? ctx.body as Record<string, unknown>
      : null;
    if (!body) throw denial();
    if (body.idToken !== undefined) throw denial();
    const proof = await verifyContext(ctx.getHeader("x-arc-link-proof"), "internal");
    const requestedProvider = accountLinkProviderSchema.safeParse(body?.provider);
    if (!requestedProvider.success || requestedProvider.data !== proof.provider) {
      throw denial();
    }

    await requireOwnerSession(ctx as never, proof.userId);
    const repository = options.getRepository();
    const intent = await loadBoundIntent(proof, repository, ["consumed"]);
    if (intent.userId !== proof.userId) throw denial();

    const operationDate = now();
    if (!await repository.claimInternalProof({
      intentId: proof.intentId,
      userId: proof.userId,
      provider: proof.provider,
      phase: proof.phase,
      issuedAt: new Date(proof.issuedAt),
      now: operationDate,
    })) {
      throw denial();
    }

    const operationTime = operationDate.getTime();
    const expiresAt = proof.phase === "reauth"
      ? intent.expiresAt.getTime()
      : operationTime + OAUTH_STATE_TTL_MS;
    const oauthContext = await createSignedLinkContext(options.secret, {
      kind: "oauth",
      intentId: intent.id,
      userId: intent.userId,
      provider: requestedProvider.data,
      phase: proof.phase,
      issuedAt: operationTime,
      expiresAt,
      nonce: createNonce(),
    });

    body.callbackURL = RESULT_URLS[proof.phase].success;
    body.errorCallbackURL = RESULT_URLS[proof.phase].error;
    body.additionalData = { arcLinkContext: oauthContext };
  });

  const after = createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/callback/:id") return;

    let state: OAuthState | null;
    try {
      state = await getOAuthState();
    } catch {
      throw denial();
    }
    if (!state) {
      await settleAttributableInvalidState(ctx as never);
      return;
    }
    if (!hasArcLinkContext(state)) return;

    const headers = responseHeaders(ctx);
    const location = headers?.get("location") ?? null;
    headers?.delete("location");
    const bound = await validateCallbackContext(
      ctx as never,
      state,
      callbackProvider(ctx),
    );
    const expected = RESULT_URLS[bound.signed.phase];
    const outcome = location === expected.success
      ? { kind: "success" as const }
      : { kind: "error" as const, code: mapCallbackError(location, bound.signed.phase) };

    try {
      const settlement = await settle(bound.repository, {
        headers: requestHeaders(ctx),
        credential: bound.credential,
        oauthContextToken: state.arcLinkContext as string,
        provider: bound.provider,
        linkUserId: bound.stateOwner,
        outcome,
      });
      headers?.set(
        "location",
        outcome.kind === "success" || settlement?.kind === "authoritative_completion"
          ? expected.success
          : bound.signed.phase === "target"
              && outcome.code === "LINK_CONFLICT"
              && settlement?.kind === "settled"
            ? TARGET_CONFLICT_URL
          : expected.error,
      );
    } catch {
      if (
        bound.signed.phase === "target"
        && outcome.kind === "success"
        && (bound.intent.status === "completing" || bound.intent.status === "completed")
      ) {
        headers?.set("location", expected.success);
        return;
      }
      headers?.set("location", expected.error);
      throw denial();
    }
  });

  const accountCreateBefore = async (
    account: { userId?: unknown; providerId?: unknown },
    endpointContext: unknown,
  ) => {
    let state: OAuthState | null;
    try {
      state = await getOAuthState();
    } catch {
      throw denial();
    }
    if (!state || !hasArcLinkContext(state)) return undefined;
    if (!endpointContext) throw denial();

    const bound = await validateCallbackContext(
      endpointContext as never,
      state,
      account.providerId,
    );
    if (account.userId !== bound.stateOwner) throw denial();
    if (bound.signed.phase === "reauth") return false;
    if (!await bound.repository.reserveTargetCompletion(
      bound.intent.id,
      bound.intent.userId,
      now(),
    )) {
      throw denial();
    }
    return true;
  };

  const accountCreateAfter = async (
    account: { userId?: unknown; providerId?: unknown },
    endpointContext: unknown,
  ) => {
    let state: OAuthState | null;
    try {
      state = await getOAuthState();
    } catch {
      return;
    }
    if (!state || !hasArcLinkContext(state) || !endpointContext) return;

    let bound: Awaited<ReturnType<typeof validateCallbackContext>>;
    try {
      bound = await validateCallbackContext(
        endpointContext as never,
        state,
        account.providerId,
      );
    } catch {
      return;
    }
    if (
      bound.signed.phase !== "target"
      || account.userId !== bound.stateOwner
    ) return;

    try {
      await bound.repository.complete(bound.intent.id, bound.intent.userId, now());
    } catch {
      // The endpoint after hook and authenticated status reconciliation retry this completion.
    }
  };

  return {
    hooks: { before, after },
    databaseHooks: {
      account: {
        create: {
          before: accountCreateBefore,
          after: accountCreateAfter,
        },
      },
    },
  };
}
