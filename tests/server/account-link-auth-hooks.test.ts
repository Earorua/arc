import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PENDING_REAUTH_TTL_MS,
  type AccountLinkIntent,
} from "../../app/server/account-link/contracts";
import {
  createSignedLinkContext,
  verifySignedLinkContext,
  type SignedLinkContext,
} from "../../app/server/account-link/crypto";
import { ACCOUNT_LINK_COOKIE } from "../../app/server/account-link/cookie";
import type { AccountLinkRepository } from "../../app/server/account-link/repository";
import {
  createAccountLinkAuthHooks,
  type AccountLinkAuthHookOptions,
} from "../../app/server/account-link/auth-hooks";

const now = new Date("2026-08-01T12:00:00.000Z");
const secret = "s".repeat(32);

function intent(overrides: Partial<AccountLinkIntent> = {}): AccountLinkIntent {
  return {
    id: "intent-1",
    tokenHash: "sha256:credential",
    userId: "user-1",
    sourceProvider: "github",
    targetProvider: "google",
    status: "pending_reauth",
    expiresAt: new Date(now.getTime() + PENDING_REAUTH_TTL_MS),
    verifiedAt: null,
    consumedAt: null,
    completedAt: null,
    failureCode: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

type ProofClaimingRepository = AccountLinkRepository & {
  claimInternalProof: ReturnType<typeof vi.fn>;
};

function repository(row: AccountLinkIntent | null = intent()): ProofClaimingRepository {
  return {
    create: vi.fn(),
    findByCredential: vi.fn(async () => row),
    findByCredentialForAttribution: vi.fn(async () => row),
    findInFlightByOwnerAndTarget: vi.fn(async () => null),
    findById: vi.fn(async () => row),
    claimInternalProof: vi.fn(async () => true),
    reserveTargetCompletion: vi.fn(async () => true),
    markVerified: vi.fn(),
    consume: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(async () => true),
  } as unknown as ProofClaimingRepository;
}

function contextToken(overrides: Partial<SignedLinkContext> = {}) {
  return createSignedLinkContext(secret, {
    kind: "internal",
    intentId: "intent-1",
    userId: "user-1",
    provider: "github",
    phase: "reauth",
    issuedAt: now.getTime(),
    expiresAt: now.getTime() + 60_000,
    nonce: "nonce-1",
    ...overrides,
  });
}

function hookFixture(overrides: Partial<AccountLinkAuthHookOptions> = {}) {
  const repo = repository();
  const settleCallback = vi.fn<NonNullable<AccountLinkAuthHookOptions["settleCallback"]>>(
    async () => undefined,
  );
  const getOAuthState = vi.fn(async () => null);
  const getAuthoritativeSessionFromCtx = vi.fn(async () => ({
    session: { id: "session-1", userId: "user-1" },
    user: { id: "user-1" },
  }));
  const listAccountsForUser = vi.fn(async () => ["github"] as const);
  const options: AccountLinkAuthHookOptions = {
    secret,
    getRepository: () => repo,
    now: () => now,
    createNonce: () => "oauth-nonce",
    getOAuthState,
    getAuthoritativeSessionFromCtx,
    listAccountsForUser,
    settleCallback,
    ...overrides,
  };
  return {
    hooks: createAccountLinkAuthHooks(options),
    repo,
    settleCallback,
    getOAuthState,
    getAuthoritativeSessionFromCtx,
    listAccountsForUser,
  };
}

function middlewareInput(input: Record<string, unknown>) {
  return {
    method: "POST",
    body: {},
    query: {},
    params: {},
    headers: new Headers(),
    context: {},
    ...input,
  } as never;
}

function oauthState(token: string, phase: "reauth" | "target" = "reauth") {
  return {
    callbackURL: phase === "reauth"
      ? "/today?link=verified"
      : "/today?link=complete",
    errorURL: phase === "reauth"
      ? "/today?link=error&stage=reauth"
      : "/today?link=error&stage=target",
    codeVerifier: "verifier",
    expiresAt: now.getTime() + 60_000,
    link: { email: "provider@example.com", userId: "user-1" },
    arcLinkContext: token,
  };
}

describe("account-link Better Auth hooks", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("rejects a direct link-social request without an internal proof", async () => {
    const { hooks } = hookFixture();

    await expect(hooks.hooks.before(middlewareInput({
      path: "/link-social",
      body: { provider: "github" },
    }))).rejects.toMatchObject({
      name: "APIError",
      status: "FORBIDDEN",
      body: { code: "ARC_ACCOUNT_LINK_DENIED" },
    } satisfies Partial<APIError>);
  });

  it("rejects link-social idToken linking before any account or OAuth mutation", async () => {
    const proof = await contextToken();
    const getRepository = vi.fn(() => repository());
    const getAuthoritativeSessionFromCtx = vi.fn(async () => ({ user: { id: "user-1" } }));
    const { hooks } = hookFixture({ getRepository, getAuthoritativeSessionFromCtx });
    const body = {
      provider: "github",
      idToken: { token: "provider-id-token" },
      additionalData: { injected: "untrusted" },
    };

    await expect(hooks.hooks.before(middlewareInput({
      path: "/link-social",
      headers: new Headers({ "x-arc-link-proof": proof }),
      body,
    }))).rejects.toMatchObject({ body: { code: "ARC_ACCOUNT_LINK_DENIED" } });

    expect(getRepository).not.toHaveBeenCalled();
    expect(getAuthoritativeSessionFromCtx).not.toHaveBeenCalled();
    expect(body).toEqual({
      provider: "github",
      idToken: { token: "provider-id-token" },
      additionalData: { injected: "untrusted" },
    });
  });

  it.each([
    ["session user", {}, { getAuthoritativeSessionFromCtx: vi.fn(async () => ({ user: { id: "other-user" } })) }],
    ["proof user", { userId: "other-user" }, {}],
    ["proof intent", { intentId: "other-intent" }, {}],
    ["request provider", {}, {}, "google"],
    ["proof provider", { provider: "google" }, {}, "google"],
    ["proof phase", { phase: "target", provider: "google" }, {}, "google"],
  ] as const)("rejects a link-social %s binding mismatch", async (
    _label,
    proofOverrides,
    optionOverrides,
    requestProvider: "google" | "github" = "github",
  ) => {
    const proof = await contextToken(proofOverrides);
    const { hooks } = hookFixture(optionOverrides as Partial<AccountLinkAuthHookOptions>);

    await expect(hooks.hooks.before(middlewareInput({
      path: "/link-social",
      headers: new Headers({ "x-arc-link-proof": proof }),
      body: { provider: requestProvider },
    }))).rejects.toMatchObject({ body: { code: "ARC_ACCOUNT_LINK_DENIED" } });
  });

  it("rejects a link-social intent whose status is wrong for its phase", async () => {
    const proof = await contextToken();
    const repo = repository(intent({ status: "consumed" }));
    const { hooks } = hookFixture({ getRepository: () => repo });

    await expect(hooks.hooks.before(middlewareInput({
      path: "/link-social",
      headers: new Headers({ "x-arc-link-proof": proof }),
      body: { provider: "github" },
    }))).rejects.toMatchObject({ body: { code: "ARC_ACCOUNT_LINK_DENIED" } });
  });

  it("replaces browser additionalData and fixes the source result URLs", async () => {
    const proof = await contextToken();
    const body = {
      provider: "github",
      callbackURL: "/attacker-success?secret=value",
      errorCallbackURL: "/attacker-error?email=provider@example.com",
      additionalData: { arcLinkContext: "forged", injected: "untrusted" },
    };
    const { hooks } = hookFixture();

    await hooks.hooks.before(middlewareInput({
      path: "/link-social",
      headers: new Headers({ "x-arc-link-proof": proof }),
      body,
    }));

    expect(body.callbackURL).toBe("/today?link=verified");
    expect(body.errorCallbackURL).toBe("/today?link=error&stage=reauth");
    expect(Object.keys(body.additionalData)).toEqual(["arcLinkContext"]);
    const oauth = await verifySignedLinkContext(
      secret,
      body.additionalData.arcLinkContext,
      "oauth",
      now.getTime(),
    );
    expect(oauth).toMatchObject({
      intentId: "intent-1",
      userId: "user-1",
      provider: "github",
      phase: "reauth",
      expiresAt: intent().expiresAt.getTime(),
    });
  });

  it("issues a ten-minute target OAuth context and target result URLs", async () => {
    const proof = await contextToken({ phase: "target", provider: "google" });
    const repo = repository(intent({ status: "consumed" }));
    const body = { provider: "google", additionalData: { untrusted: true } };
    const { hooks } = hookFixture({ getRepository: () => repo });

    await hooks.hooks.before(middlewareInput({
      path: "/link-social",
      headers: new Headers({ "x-arc-link-proof": proof }),
      body,
    }));

    expect(body).toMatchObject({
      callbackURL: "/today?link=complete",
      errorCallbackURL: "/today?link=error&stage=target",
    });
    const oauth = await verifySignedLinkContext(
      secret,
      (body.additionalData as unknown as { arcLinkContext: string }).arcLinkContext,
      "oauth",
      now.getTime(),
    );
    expect(oauth.expiresAt).toBe(now.getTime() + 10 * 60_000);
  });

  it("durably claims an internal proof once and rejects its replay", async () => {
    const proof = await contextToken();
    const repo = repository();
    vi.mocked(repo.claimInternalProof)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const { hooks } = hookFixture({ getRepository: () => repo });
    const request = () => middlewareInput({
      path: "/link-social",
      headers: new Headers({ "x-arc-link-proof": proof }),
      body: { provider: "github" },
    });

    await expect(hooks.hooks.before(request())).resolves.toBeUndefined();
    await expect(hooks.hooks.before(request()))
      .rejects.toMatchObject({ body: { code: "ARC_ACCOUNT_LINK_DENIED" } });

    expect(repo.claimInternalProof).toHaveBeenCalledTimes(2);
    expect(repo.claimInternalProof).toHaveBeenNthCalledWith(1, {
      intentId: "intent-1",
      userId: "user-1",
      provider: "github",
      phase: "reauth",
      issuedAt: now,
      now,
    });
  });

  it("blocks source creation and reserves target completion before permitting account creation", async () => {
    const reauthToken = await createSignedLinkContext(secret, {
      ...(await contextPayload("reauth")),
      kind: "oauth",
    });
    const targetToken = await createSignedLinkContext(secret, {
      ...(await contextPayload("target")),
      kind: "oauth",
    });
    let state = oauthState(reauthToken);
    const repo = repository();
    const { hooks } = hookFixture({
      getRepository: () => repo,
      getOAuthState: vi.fn(async () => state),
    });
    const accountCreate = hooks.databaseHooks.account.create.before;

    const callbackContext = {
      headers: new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` }),
    };
    await expect(accountCreate(
      { userId: "user-1", providerId: "github" } as never,
      callbackContext,
    ))
      .resolves.toBe(false);

    state = oauthState(targetToken, "target");
    vi.mocked(repo.findById).mockResolvedValue(intent({ status: "consumed" }));
    await expect(accountCreate(
      { userId: "user-1", providerId: "google" } as never,
      callbackContext,
    ))
      .resolves.toBe(true);
    expect(repo.reserveTargetCompletion).toHaveBeenCalledWith("intent-1", "user-1", now);

    vi.mocked(repo.reserveTargetCompletion).mockResolvedValue(false);
    await expect(accountCreate(
      { userId: "user-1", providerId: "google" } as never,
      callbackContext,
    )).rejects.toMatchObject({ body: { code: "ARC_ACCOUNT_LINK_DENIED" } });
  });

  it("completes after account insertion and retries idempotently in the endpoint after hook", async () => {
    const token = await createSignedLinkContext(secret, {
      ...(await contextPayload("target")),
      kind: "oauth",
    });
    let row = intent({ status: "consumed", consumedAt: now });
    const repo = repository(row);
    vi.mocked(repo.findById).mockImplementation(async () => row);
    vi.mocked(repo.findByCredential).mockImplementation(async () => row);
    vi.mocked(repo.reserveTargetCompletion).mockImplementation(async () => {
      if (row.status !== "consumed") return false;
      row = intent({ status: "completing", consumedAt: now, updatedAt: now });
      return true;
    });
    vi.mocked(repo.complete)
      .mockRejectedValueOnce(new Error("transient D1 completion failure"))
      .mockImplementationOnce(async () => {
        row = intent({
          status: "completed",
          consumedAt: now,
          completedAt: now,
          updatedAt: now,
        });
        return true;
      });
    const getOAuthState = vi.fn(async () => oauthState(token, "target"));
    const hooks = createAccountLinkAuthHooks({
      secret,
      getRepository: () => repo,
      now: () => now,
      createNonce: () => "oauth-nonce",
      getOAuthState,
      getAuthoritativeSessionFromCtx: vi.fn(async () => ({ user: { id: "user-1" } })),
      listAccountsForUser: vi.fn(async () => ["github"] as const),
    });
    const callbackContext = {
      headers: new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` }),
    };

    await expect(hooks.databaseHooks.account.create.before(
      { userId: "user-1", providerId: "google" } as never,
      callbackContext,
    )).resolves.toBe(true);
    expect(row.status).toBe("completing");

    const accountInserted = true;
    await expect(hooks.databaseHooks.account.create.after(
      { userId: "user-1", providerId: "google" } as never,
      callbackContext,
    )).resolves.toBeUndefined();
    expect(accountInserted).toBe(true);
    expect(row.status).toBe("completing");

    const responseHeaders = new Headers({ location: "/today?link=complete" });
    await hooks.hooks.after(middlewareInput({
      path: "/callback/:id",
      params: { id: "google" },
      headers: callbackContext.headers,
      context: { responseHeaders },
    }));

    expect(repo.complete).toHaveBeenCalledTimes(2);
    expect(row.status).toBe("completed");
    expect(responseHeaders.get("location")).toBe("/today?link=complete");
  });

  it.each(["completing", "completed"] as const)(
    "preserves exact target success from %s when completion settlement retry fails",
    async (status) => {
    const token = await createSignedLinkContext(secret, {
      ...(await contextPayload("target")),
      kind: "oauth",
    });
    const repo = repository(intent({ status, consumedAt: now }));
    const settleCallback = vi.fn(async () => {
      throw new Error("completion storage unavailable");
    });
    const { hooks } = hookFixture({
      getRepository: () => repo,
      getOAuthState: vi.fn(async () => oauthState(token, "target")),
      settleCallback,
    });
    const responseHeaders = new Headers({ location: "/today?link=complete" });

    await expect(hooks.hooks.after(middlewareInput({
      path: "/callback/:id",
      params: { id: "google" },
      headers: new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` }),
      context: { responseHeaders },
    }))).resolves.toBeUndefined();

    expect(responseHeaders.get("location")).toBe("/today?link=complete");
    expect(repo.fail).not.toHaveBeenCalled();
  });

  it("turns a target error into exact success when settlement proves authoritative completion", async () => {
    const token = await createSignedLinkContext(secret, {
      ...(await contextPayload("target")),
      kind: "oauth",
    });
    const repo = repository(intent({ status: "completing", consumedAt: now }));
    const settleCallback = vi.fn(async () => ({
      kind: "authoritative_completion" as const,
    }));
    const { hooks } = hookFixture({
      getRepository: () => repo,
      getOAuthState: vi.fn(async () => oauthState(token, "target")),
      settleCallback,
    });
    const responseHeaders = new Headers({
      location: "/today?link=error&stage=target&error=invalid_code",
    });

    await hooks.hooks.after(middlewareInput({
      path: "/callback/:id",
      params: { id: "google" },
      headers: new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` }),
      context: { responseHeaders },
    }));

    expect(responseHeaders.get("location")).toBe("/today?link=complete");
    expect(repo.fail).not.toHaveBeenCalled();
  });

  it("uses the default settlement path to reconcile an already-created target account", async () => {
    const token = await createSignedLinkContext(secret, {
      ...(await contextPayload("target")),
      kind: "oauth",
    });
    const repo = repository(intent({ status: "completing", consumedAt: now }));
    vi.mocked(repo.complete).mockResolvedValue(true);
    const listAccountsForUser = vi.fn(async () => ["github", "google"] as const);
    const { hooks } = hookFixture({
      getRepository: () => repo,
      getOAuthState: vi.fn(async () => oauthState(token, "target")),
      listAccountsForUser,
      settleCallback: undefined,
    });
    const requestHeaderSet = new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` });
    const responseHeaders = new Headers({
      location: "/today?link=error&stage=target&error=invalid_code",
    });

    await hooks.hooks.after(middlewareInput({
      path: "/callback/:id",
      params: { id: "google" },
      headers: requestHeaderSet,
      context: { responseHeaders },
    }));

    expect(listAccountsForUser).toHaveBeenCalledWith("user-1", requestHeaderSet);
    expect(repo.complete).toHaveBeenCalledWith("intent-1", "user-1", now);
    expect(repo.fail).not.toHaveBeenCalled();
    expect(responseHeaders.get("location")).toBe("/today?link=complete");
  });

  it("denies target account creation before mutation when the HttpOnly credential is absent", async () => {
    const targetToken = await createSignedLinkContext(secret, {
      ...(await contextPayload("target")),
      kind: "oauth",
    });
    const repo = repository(intent({ status: "consumed" }));
    const { hooks } = hookFixture({
      getRepository: () => repo,
      getOAuthState: vi.fn(async () => oauthState(targetToken, "target")),
    });

    await expect(hooks.databaseHooks.account.create.before(
      { userId: "user-1", providerId: "google" } as never,
      {},
    )).rejects.toMatchObject({ body: { code: "ARC_ACCOUNT_LINK_DENIED" } });
  });

  it("leaves ordinary OAuth account creation unchanged and fails closed on forged Arc state", async () => {
    const getOAuthState = vi.fn()
      .mockResolvedValueOnce({ link: { userId: "user-1" } })
      .mockResolvedValueOnce({ link: { userId: "user-1" }, arcLinkContext: "forged" });
    const { hooks } = hookFixture({ getOAuthState });
    const accountCreate = hooks.databaseHooks.account.create.before;

    await expect(accountCreate({ userId: "user-1", providerId: "github" } as never, null))
      .resolves.toBeUndefined();
    await expect(accountCreate({ userId: "user-1", providerId: "github" } as never, null))
      .rejects.toMatchObject({ body: { code: "ARC_ACCOUNT_LINK_DENIED" } });
  });

  it("settles an exact source success against the state owner and current session", async () => {
    const token = await createSignedLinkContext(secret, {
      ...(await contextPayload("reauth")),
      kind: "oauth",
    });
    const { hooks, settleCallback } = hookFixture({
      getOAuthState: vi.fn(async () => oauthState(token)),
    });
    const responseHeaders = new Headers({ location: "/today?link=verified" });

    await hooks.hooks.after(middlewareInput({
      path: "/callback/:id",
      params: { id: "github" },
      headers: new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` }),
      context: { responseHeaders },
    }));

    expect(settleCallback).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      credential: "credential",
      oauthContextToken: token,
      provider: "github",
      linkUserId: "user-1",
      outcome: { kind: "success" },
    });
    expect(responseHeaders.get("location")).toBe("/today?link=verified");
  });

  it.each([
    ["access_denied", "OAUTH_CANCELLED", "/today?link=error&stage=target"],
    ["account_already_linked_to_different_user", "LINK_CONFLICT", "/today?link=conflict"],
    ["state_mismatch", "STATE_INVALID", "/today?link=error&stage=target"],
    ["invalid_code", "OAUTH_FAILED", "/today?link=error&stage=target"],
  ])("settles callback error %s as %s and removes provider detail", async (
    providerError,
    code,
    expectedLocation,
  ) => {
    const token = await createSignedLinkContext(secret, {
      ...(await contextPayload("target")),
      kind: "oauth",
    });
    const repo = repository(intent({ status: "consumed" }));
    const { hooks, settleCallback } = hookFixture({
      getRepository: () => repo,
      getOAuthState: vi.fn(async () => oauthState(token, "target")),
    });
    settleCallback.mockResolvedValue({ kind: "settled" });
    const responseHeaders = new Headers({
      location: `/today?link=error&stage=target&error=${providerError}&error_description=sensitive`,
    });

    await hooks.hooks.after(middlewareInput({
      path: "/callback/:id",
      params: { id: "google" },
      headers: new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` }),
      context: { responseHeaders },
    }));

    expect(settleCallback).toHaveBeenCalledWith(expect.objectContaining({
      outcome: { kind: "error", code },
    }));
    expect(responseHeaders.get("location")).toBe(expectedLocation);
  });

  it.each([
    "https://arc.example.com/today?link=error&stage=target&error=account_already_linked_to_different_user",
    "/other?link=error&stage=target&error=account_already_linked_to_different_user",
    "/today?link=error&stage=reauth&error=account_already_linked_to_different_user",
  ])("does not classify provider errors from a non-server phase error route: %s", async (location) => {
    const token = await createSignedLinkContext(secret, {
      ...(await contextPayload("target")),
      kind: "oauth",
    });
    const repo = repository(intent({ status: "consumed" }));
    const { hooks, settleCallback } = hookFixture({
      getRepository: () => repo,
      getOAuthState: vi.fn(async () => oauthState(token, "target")),
    });

    await hooks.hooks.after(middlewareInput({
      path: "/callback/:id",
      params: { id: "google" },
      headers: new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` }),
      context: { responseHeaders: new Headers({ location }) },
    }));

    expect(settleCallback).toHaveBeenCalledWith(expect.objectContaining({
      outcome: { kind: "error", code: "OAUTH_FAILED" },
    }));
  });

  it("does not classify a source identity mismatch as a target link conflict", async () => {
    const token = await createSignedLinkContext(secret, {
      ...(await contextPayload("reauth")),
      kind: "oauth",
    });
    const { hooks, settleCallback } = hookFixture({
      getOAuthState: vi.fn(async () => oauthState(token)),
    });

    await hooks.hooks.after(middlewareInput({
      path: "/callback/:id",
      params: { id: "github" },
      headers: new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` }),
      context: {
        responseHeaders: new Headers({
          location: "/today?link=error&stage=reauth&error=account_already_linked_to_different_user",
        }),
      },
    }));

    expect(settleCallback).toHaveBeenCalledWith(expect.objectContaining({
      outcome: { kind: "error", code: "OAUTH_FAILED" },
    }));
  });

  it("does not classify an arbitrary callback location as success", async () => {
    const token = await createSignedLinkContext(secret, {
      ...(await contextPayload("reauth")),
      kind: "oauth",
    });
    const { hooks, settleCallback } = hookFixture({
      getOAuthState: vi.fn(async () => oauthState(token)),
    });
    const responseHeaders = new Headers({ location: "/attacker-success" });

    await hooks.hooks.after(middlewareInput({
      path: "/callback/:id",
      params: { id: "github" },
      headers: new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` }),
      context: { responseHeaders },
    }));

    expect(settleCallback).toHaveBeenCalledWith(expect.objectContaining({
      outcome: { kind: "error", code: "OAUTH_FAILED" },
    }));
    expect(responseHeaders.get("location")).toBe("/today?link=error&stage=reauth");
  });

  it("does not classify an absolute copy of the relative success URL as exact", async () => {
    const token = await createSignedLinkContext(secret, {
      ...(await contextPayload("reauth")),
      kind: "oauth",
    });
    const { hooks, settleCallback } = hookFixture({
      getOAuthState: vi.fn(async () => oauthState(token)),
    });
    const responseHeaders = new Headers({
      location: "https://arc.example.com/today?link=verified",
    });

    await hooks.hooks.after(middlewareInput({
      path: "/callback/:id",
      params: { id: "github" },
      headers: new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` }),
      context: { responseHeaders },
    }));

    expect(settleCallback).toHaveBeenCalledWith(expect.objectContaining({
      outcome: { kind: "error", code: "OAUTH_FAILED" },
    }));
    expect(responseHeaders.get("location")).toBe("/today?link=error&stage=reauth");
  });

  it("leaves an ordinary sign-in callback untouched without loading D1", async () => {
    const getRepository = vi.fn(() => repository());
    const settleCallback = vi.fn(async () => undefined);
    const { hooks } = hookFixture({ getRepository, settleCallback });
    const responseHeaders = new Headers({ location: "/today" });

    await hooks.hooks.after(middlewareInput({
      path: "/callback/:id",
      params: { id: "github" },
      context: { responseHeaders },
    }));

    expect(responseHeaders.get("location")).toBe("/today");
    expect(getRepository).not.toHaveBeenCalled();
    expect(settleCallback).not.toHaveBeenCalled();
  });

  it.each([
    ["state_mismatch", "pending_reauth", "github", "/today?link=error&stage=reauth"],
    ["state_not_found", "consumed", "google", "/today?link=error&stage=target"],
    ["state_not_found", "completing", "google", "/today?link=error&stage=target"],
    ["state_expired", "pending_reauth", "github", "/today?link=error&stage=reauth"],
  ] as const)(
    "sanitizes attributed null-state callback error %s without mutating its intent",
    async (providerError, status, provider, expectedLocation) => {
      const row = intent({ status });
      const repo = repository(row);
      const { hooks, settleCallback, getAuthoritativeSessionFromCtx } = hookFixture({
        getRepository: () => repo,
        getOAuthState: vi.fn(async () => null),
      });
      const responseHeaders = new Headers({
        location: `/api/auth/error?error=${providerError}&error_description=provider%40example.com`,
      });

      await hooks.hooks.after(middlewareInput({
        path: "/callback/:id",
        params: { id: provider },
        headers: new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` }),
        context: { responseHeaders },
      }));

      expect(getAuthoritativeSessionFromCtx).toHaveBeenCalledOnce();
      expect(repo.findByCredentialForAttribution).toHaveBeenCalled();
      expect(repo.findByCredential).not.toHaveBeenCalled();
      expect(repo.fail).not.toHaveBeenCalled();
      expect(settleCallback).not.toHaveBeenCalled();
      expect(responseHeaders.get("location")).toBe(expectedLocation);
      expect(responseHeaders.get("location")).not.toMatch(/error_description|@/u);
    },
  );

  it("sanitizes an expired source-reauth state error without rewriting the terminal intent", async () => {
    const repo = repository(intent({
      status: "expired",
      expiresAt: now,
      updatedAt: now,
    }));
    const { hooks } = hookFixture({
      getRepository: () => repo,
      getOAuthState: vi.fn(async () => null),
    });
    const responseHeaders = new Headers({
      location: "/api/auth/error?error=state_expired&error_description=provider%40example.com",
    });

    await hooks.hooks.after(middlewareInput({
      path: "/callback/:id",
      params: { id: "github" },
      headers: new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` }),
      context: { responseHeaders },
    }));

    expect(repo.fail).not.toHaveBeenCalled();
    expect(responseHeaders.get("location")).toBe("/today?link=error&stage=reauth");
  });

  it("does not attribute an expired intent to a target-provider null-state callback", async () => {
    const repo = repository(intent({ status: "expired", expiresAt: now }));
    const { hooks } = hookFixture({
      getRepository: () => repo,
      getOAuthState: vi.fn(async () => null),
    });
    const original = "/api/auth/error?error=state_expired";
    const responseHeaders = new Headers({ location: original });

    await hooks.hooks.after(middlewareInput({
      path: "/callback/:id",
      params: { id: "google" },
      headers: new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` }),
      context: { responseHeaders },
    }));

    expect(repo.fail).not.toHaveBeenCalled();
    expect(responseHeaders.get("location")).toBe(original);
  });

  it("preserves ordinary null-state OAuth behavior when no active Arc intent is attributable", async () => {
    const repo = repository(null);
    const { hooks } = hookFixture({
      getRepository: () => repo,
      getOAuthState: vi.fn(async () => null),
    });
    const original = "/api/auth/error?error=state_mismatch";
    const responseHeaders = new Headers({ location: original });

    await hooks.hooks.after(middlewareInput({
      path: "/callback/:id",
      params: { id: "github" },
      headers: new Headers({ cookie: `${ACCOUNT_LINK_COOKIE}=credential` }),
      context: { responseHeaders },
    }));

    expect(repo.fail).not.toHaveBeenCalled();
    expect(responseHeaders.get("location")).toBe(original);
  });

  it("fails closed on a signed-context field with an invalid signature", async () => {
    const { hooks, settleCallback } = hookFixture({
      getOAuthState: vi.fn(async () => oauthState("invalid.signature")),
    });

    const responseHeaders = new Headers({
      location: "/today?link=error&stage=reauth&error_description=sensitive",
    });
    await expect(hooks.hooks.after(middlewareInput({
      path: "/callback/:id",
      params: { id: "github" },
      context: { responseHeaders },
    }))).rejects.toMatchObject({ body: { code: "ARC_ACCOUNT_LINK_DENIED" } });
    expect(responseHeaders.get("location")).toBeNull();
    expect(settleCallback).not.toHaveBeenCalled();
  });
});

async function contextPayload(phase: "reauth" | "target"): Promise<SignedLinkContext> {
  return {
    kind: "oauth",
    intentId: "intent-1",
    userId: "user-1",
    provider: phase === "reauth" ? "github" : "google",
    phase,
    issuedAt: now.getTime(),
    expiresAt: phase === "reauth"
      ? now.getTime() + PENDING_REAUTH_TTL_MS
      : now.getTime() + 10 * 60_000,
    nonce: "oauth-nonce",
  };
}
