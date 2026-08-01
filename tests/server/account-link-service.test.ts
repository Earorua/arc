import { describe, expect, it, vi } from "vitest";
import {
  INTERNAL_PROOF_TTL_MS,
  PENDING_REAUTH_TTL_MS,
  VERIFIED_GRANT_TTL_MS,
  AccountLinkError,
  type AccountLinkIntent,
  type AccountLinkProvider,
} from "../../app/server/account-link/contracts";
import type { SignedLinkContext } from "../../app/server/account-link/crypto";
import type { AccountLinkRepository } from "../../app/server/account-link/repository";
import {
  AccountLinkService,
  type AccountLinkServiceDependencies,
} from "../../app/server/account-link/service";

const now = new Date("2026-08-01T12:00:00.000Z");
const rawCredential = "raw-browser-credential";
const tokenHash = "sha256:browser-credential";

function intent(overrides: Partial<AccountLinkIntent> = {}): AccountLinkIntent {
  return {
    id: "intent-1",
    tokenHash,
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

function oauthContext(overrides: Partial<SignedLinkContext> = {}): SignedLinkContext {
  return {
    kind: "oauth",
    intentId: "intent-1",
    userId: "user-1",
    provider: "github",
    phase: "reauth",
    issuedAt: now.getTime() - 1_000,
    expiresAt: now.getTime() + 60_000,
    nonce: "oauth-nonce",
    ...overrides,
  };
}

function dependencies(overrides: Partial<AccountLinkServiceDependencies> = {}) {
  const repository: AccountLinkRepository = {
    create: vi.fn(async (input) => intent({
      id: input.id,
      tokenHash: input.tokenHash,
      userId: input.userId,
      sourceProvider: input.sourceProvider,
      targetProvider: input.targetProvider,
      expiresAt: input.expiresAt,
      createdAt: input.now,
      updatedAt: input.now,
    })),
    findByCredential: vi.fn(async () => null),
    findByCredentialForAttribution: vi.fn(async () => null),
    findInFlightByOwnerAndTarget: vi.fn(async () => null),
    findById: vi.fn(async () => null),
    claimInternalProof: vi.fn(async () => false),
    reserveTargetCompletion: vi.fn(async () => false),
    markVerified: vi.fn(async () => null),
    consume: vi.fn(async () => null),
    complete: vi.fn(async () => false),
    fail: vi.fn(async () => false),
  };
  const deps: AccountLinkServiceDependencies = {
    repository,
    listAccounts: vi.fn(async () => ["github"] as AccountLinkProvider[]),
    startProviderLink: vi.fn(async () => ({
      url: "https://provider.example/authorize",
      headers: new Headers({ "set-cookie": "oauth-state=state" }),
    })),
    createCredential: vi.fn(() => rawCredential),
    hashCredential: vi.fn(async () => tokenHash),
    createProof: vi.fn(async () => "signed-internal-proof"),
    verifyProof: vi.fn(async () => oauthContext()),
    createId: vi.fn()
      .mockReturnValueOnce("intent-1")
      .mockReturnValueOnce("proof-nonce"),
    now: vi.fn(() => now),
    ...overrides,
  };
  return { deps, repository };
}

function expectAccountLinkError(code: AccountLinkError["code"]) {
  return expect.objectContaining({ name: "AccountLinkError", code });
}

describe("AccountLinkService", () => {
  it("starts source reauthentication with the only connected provider", async () => {
    const { deps, repository } = dependencies();
    const headers = new Headers({ cookie: "session=authoritative" });

    const result = await new AccountLinkService(deps).start(headers, "user-1", "google");

    expect(deps.listAccounts).toHaveBeenCalledWith(headers);
    expect(vi.mocked(deps.listAccounts).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(repository.create).mock.invocationCallOrder[0],
    );
    expect(repository.create).toHaveBeenCalledWith({
      id: "intent-1",
      tokenHash,
      userId: "user-1",
      sourceProvider: "github",
      targetProvider: "google",
      expiresAt: new Date(now.getTime() + PENDING_REAUTH_TTL_MS),
      now,
    });
    expect(deps.createProof).toHaveBeenCalledWith({
      kind: "internal",
      intentId: "intent-1",
      userId: "user-1",
      provider: "github",
      phase: "reauth",
      issuedAt: now.getTime(),
      expiresAt: now.getTime() + INTERNAL_PROOF_TTL_MS,
      nonce: "proof-nonce",
    });
    expect(deps.startProviderLink).toHaveBeenCalledWith({
      headers,
      provider: "github",
      phase: "reauth",
      intent: result.intent,
      internalProof: "signed-internal-proof",
    });
    expect(result).toMatchObject({
      credential: rawCredential,
      authorizationUrl: "https://provider.example/authorize",
    });
    expect(result.authHeaders.get("set-cookie")).toBe("oauth-state=state");
  });

  it("rejects invalid, already connected, missing-source, and ambiguous-source starts", async () => {
    const invalid = dependencies();
    await expect(new AccountLinkService(invalid.deps).start(
      new Headers(),
      "user-1",
      "microsoft",
    )).rejects.toEqual(expectAccountLinkError("NOT_CONFIGURED"));
    expect(invalid.deps.listAccounts).not.toHaveBeenCalled();

    for (const [accounts, code] of [
      [["google"], "ALREADY_CONNECTED"],
      [[], "NO_SOURCE_PROVIDER"],
      [["github", "github"], "NO_SOURCE_PROVIDER"],
    ] as const) {
      const fixture = dependencies({ listAccounts: vi.fn(async () => [...accounts]) });
      await expect(new AccountLinkService(fixture.deps).start(
        new Headers(),
        "user-1",
        "google",
      )).rejects.toEqual(expectAccountLinkError(code));
      expect(fixture.repository.create).not.toHaveBeenCalled();
    }
  });

  it("reconciles a completing start when the target appears on the authoritative recheck", async () => {
    const row = intent({ status: "completing", consumedAt: now });
    const listAccounts = vi.fn()
      .mockResolvedValueOnce(["github"])
      .mockResolvedValueOnce(["github", "google"]);
    const { deps, repository } = dependencies({ listAccounts });
    vi.mocked(repository.findInFlightByOwnerAndTarget).mockResolvedValue(row);
    vi.mocked(repository.complete).mockResolvedValue(true);

    await expect(new AccountLinkService(deps).start(
      new Headers(),
      "user-1",
      "google",
    )).rejects.toEqual(expectAccountLinkError("ALREADY_CONNECTED"));

    expect(listAccounts).toHaveBeenCalledTimes(2);
    expect(repository.complete).toHaveBeenCalledWith("intent-1", "user-1", now);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("does not replace an in-flight completing intent before its callback finishes", async () => {
    let row = intent({ status: "consumed", consumedAt: now });
    const accounts: AccountLinkProvider[] = ["github"];
    const { deps, repository } = dependencies({
      listAccounts: vi.fn(async () => [...accounts]),
    });
    vi.mocked(repository.reserveTargetCompletion).mockImplementation(async () => {
      if (row.status !== "consumed") return false;
      row = { ...row, status: "completing", updatedAt: now };
      return true;
    });
    vi.mocked(repository.findInFlightByOwnerAndTarget).mockImplementation(async () => row);
    vi.mocked(repository.complete).mockImplementation(async () => {
      if (row.status !== "completing") return false;
      row = { ...row, status: "completed", completedAt: now, updatedAt: now };
      return true;
    });

    await expect(repository.reserveTargetCompletion("intent-1", "user-1", now))
      .resolves.toBe(true);
    await expect(new AccountLinkService(deps).start(
      new Headers(),
      "user-1",
      "google",
    )).rejects.toEqual(expectAccountLinkError("REPLAYED"));

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.fail).not.toHaveBeenCalled();
    expect(row.status).toBe("completing");

    accounts.push("google");
    await expect(repository.complete("intent-1", "user-1", now)).resolves.toBe(true);
    expect(row.status).toBe("completed");
  });

  it("rejects a consumed in-flight start without rechecking or creating", async () => {
    const row = intent({ status: "consumed", consumedAt: now });
    const { deps, repository } = dependencies();
    vi.mocked(repository.findInFlightByOwnerAndTarget).mockResolvedValue(row);

    await expect(new AccountLinkService(deps).start(
      new Headers(),
      "user-1",
      "google",
    )).rejects.toEqual(expectAccountLinkError("REPLAYED"));

    expect(deps.listAccounts).toHaveBeenCalledTimes(1);
    expect(repository.complete).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("maps an atomic create conflict after a clean preflight to replayed", async () => {
    let callbackIntent = intent({ status: "verified", verifiedAt: now });
    const { deps, repository } = dependencies();
    vi.mocked(repository.findInFlightByOwnerAndTarget).mockImplementation(async () => {
      callbackIntent = { ...callbackIntent, status: "consumed", consumedAt: now };
      return null;
    });
    vi.mocked(repository.create).mockImplementation(async () => (
      callbackIntent.status === "consumed" ? null : intent()
    ));

    await expect(new AccountLinkService(deps).start(
      new Headers(),
      "user-1",
      "google",
    )).rejects.toEqual(expectAccountLinkError("REPLAYED"));

    expect(callbackIntent).toMatchObject({ status: "consumed", failureCode: null });
    expect(deps.listAccounts).toHaveBeenCalledTimes(2);
    expect(repository.create).toHaveBeenCalledOnce();
    expect(deps.createProof).not.toHaveBeenCalled();
    expect(deps.startProviderLink).not.toHaveBeenCalled();
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("maps an account inserted during atomic create to already connected", async () => {
    const accounts: AccountLinkProvider[] = ["github"];
    const { deps, repository } = dependencies({
      listAccounts: vi.fn(async () => [...accounts]),
    });
    vi.mocked(repository.findInFlightByOwnerAndTarget).mockResolvedValue(null);
    vi.mocked(repository.create).mockImplementation(async () => {
      accounts.push("google");
      return null;
    });

    await expect(new AccountLinkService(deps).start(
      new Headers(),
      "user-1",
      "google",
    )).rejects.toEqual(expectAccountLinkError("ALREADY_CONNECTED"));

    expect(deps.listAccounts).toHaveBeenCalledTimes(2);
    expect(repository.create).toHaveBeenCalledOnce();
    expect(deps.createProof).not.toHaveBeenCalled();
    expect(deps.startProviderLink).not.toHaveBeenCalled();
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("keeps the raw credential out of repository and proof inputs", async () => {
    const { deps, repository } = dependencies();

    const result = await new AccountLinkService(deps).start(new Headers(), "user-1", "google");

    expect(result.credential).toBe(rawCredential);
    expect(deps.hashCredential).toHaveBeenCalledWith(rawCredential);
    for (const call of [
      ...(vi.mocked(repository.create).mock.calls),
      ...(vi.mocked(deps.createProof).mock.calls),
      ...(vi.mocked(deps.startProviderLink).mock.calls),
    ]) {
      expect(JSON.stringify(call)).not.toContain(rawCredential);
    }
  });

  it("fails a created intent when source OAuth cannot start and preserves the provider error", async () => {
    const oauthError = new Error("provider unavailable");
    const { deps, repository } = dependencies({
      startProviderLink: vi.fn(async () => { throw oauthError; }),
    });
    vi.mocked(repository.fail).mockRejectedValue(new Error("failure transition unavailable"));

    await expect(new AccountLinkService(deps).start(
      new Headers(),
      "user-1",
      "google",
    )).rejects.toBe(oauthError);
    expect(repository.fail).toHaveBeenCalledWith(
      "intent-1",
      "user-1",
      "OAUTH_START_FAILED",
      now,
    );
  });

  it("returns the all-null status without hashing when no credential exists", async () => {
    const { deps, repository } = dependencies();

    await expect(new AccountLinkService(deps).status("user-1", null)).resolves.toEqual({
      stage: null,
      targetProvider: null,
      expiresAt: null,
    });
    expect(deps.hashCredential).not.toHaveBeenCalled();
    expect(repository.findByCredential).not.toHaveBeenCalled();
  });

  it("returns a fresh all-null status that cannot be poisoned by a previous caller", async () => {
    const { deps } = dependencies();
    const service = new AccountLinkService(deps);

    const first = await service.status("user-1", null);
    first.stage = "verified";
    first.targetProvider = "google";
    first.expiresAt = now.toISOString();

    await expect(service.status("user-1", null)).resolves.toEqual({
      stage: null,
      targetProvider: null,
      expiresAt: null,
    });
  });

  it("looks status up by owner and digest and returns only the safe projection", async () => {
    const { deps, repository } = dependencies();
    vi.mocked(repository.findByCredential).mockResolvedValue(intent({ status: "verified" }));

    const status = await new AccountLinkService(deps).status("user-1", rawCredential);

    expect(repository.findByCredential).toHaveBeenCalledWith("user-1", tokenHash, now);
    expect(status).toEqual({
      stage: "verified",
      targetProvider: "google",
      expiresAt: new Date(now.getTime() + PENDING_REAUTH_TTL_MS).toISOString(),
    });
    expect(Object.keys(status)).toEqual(["stage", "targetProvider", "expiresAt"]);
  });

  it("reconciles completing to completed from authoritative connected accounts", async () => {
    const completing = intent({ status: "completing", consumedAt: now });
    const { deps, repository } = dependencies();
    vi.mocked(repository.findByCredential).mockResolvedValue(completing);
    vi.mocked(deps.listAccounts).mockResolvedValue(["github", "google"]);
    vi.mocked(repository.complete).mockResolvedValue(true);
    const headers = new Headers({ cookie: "session=authoritative" });

    await expect(new AccountLinkService(deps).status(
      "user-1",
      rawCredential,
      headers,
    )).resolves.toMatchObject({ stage: "completed", targetProvider: "google" });
    expect(deps.listAccounts).toHaveBeenCalledWith(headers);
    expect(repository.complete).toHaveBeenCalledWith("intent-1", "user-1", now);
  });

  it("does not reconcile completing when the authoritative target account is absent", async () => {
    const completing = intent({ status: "completing", consumedAt: now });
    const { deps, repository } = dependencies();
    vi.mocked(repository.findByCredential).mockResolvedValue(completing);
    vi.mocked(deps.listAccounts).mockResolvedValue(["github"]);

    await expect(new AccountLinkService(deps).status(
      "user-1",
      rawCredential,
      new Headers({ cookie: "session=authoritative" }),
    )).resolves.toMatchObject({ stage: "completing", targetProvider: "google" });
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it("atomically consumes a verified grant before starting target OAuth", async () => {
    const verified = intent({ status: "verified" });
    const consumed = intent({ status: "consumed", consumedAt: now });
    const { deps, repository } = dependencies();
    vi.mocked(repository.findByCredential).mockResolvedValue(verified);
    let resolveConsume!: (value: AccountLinkIntent | null) => void;
    vi.mocked(repository.consume).mockReturnValue(new Promise((resolve) => {
      resolveConsume = resolve;
    }));

    const continuation = new AccountLinkService(deps).continue(
      new Headers(),
      "user-1",
      rawCredential,
    );

    await vi.waitFor(() => expect(repository.consume).toHaveBeenCalledOnce());
    expect(deps.createProof).not.toHaveBeenCalled();
    expect(deps.startProviderLink).not.toHaveBeenCalled();

    resolveConsume(consumed);
    const result = await continuation;

    expect(repository.consume).toHaveBeenCalledWith("intent-1", "user-1", now);
    expect(deps.createProof).toHaveBeenCalledWith(expect.objectContaining({
      kind: "internal",
      intentId: "intent-1",
      provider: "google",
      phase: "target",
      issuedAt: now.getTime(),
      expiresAt: now.getTime() + INTERNAL_PROOF_TTL_MS,
    }));
    expect(deps.startProviderLink).toHaveBeenCalledWith(expect.objectContaining({
      provider: "google",
      phase: "target",
      intent: consumed,
    }));
    expect(vi.mocked(repository.consume).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deps.startProviderLink).mock.invocationCallOrder[0],
    );
    expect(result.authorizationUrl).toBe("https://provider.example/authorize");
  });

  it.each([
    [null, null],
    [intent({ status: "pending_reauth" }), null],
    [intent({ status: "consumed" }), null],
    [intent({ status: "verified" }), null],
  ] as const)("never starts target OAuth after invalid or replayed consume %#", async (found, consumed) => {
    const { deps, repository } = dependencies();
    vi.mocked(repository.findByCredential).mockResolvedValue(found);
    vi.mocked(repository.consume).mockResolvedValue(consumed);

    await expect(new AccountLinkService(deps).continue(
      new Headers(),
      "user-1",
      rawCredential,
    )).rejects.toBeInstanceOf(AccountLinkError);
    expect(deps.createProof).not.toHaveBeenCalled();
    expect(deps.startProviderLink).not.toHaveBeenCalled();
  });

  it("fails a consumed intent when target OAuth cannot start and never restores verified", async () => {
    const oauthError = new Error("provider unavailable");
    const { deps, repository } = dependencies({
      startProviderLink: vi.fn(async () => { throw oauthError; }),
    });
    vi.mocked(repository.findByCredential).mockResolvedValue(intent({ status: "verified" }));
    vi.mocked(repository.consume).mockResolvedValue(intent({ status: "consumed", consumedAt: now }));
    vi.mocked(repository.fail).mockRejectedValue(new Error("failure transition unavailable"));

    await expect(new AccountLinkService(deps).continue(
      new Headers(),
      "user-1",
      rawCredential,
    )).rejects.toBe(oauthError);
    expect(repository.fail).toHaveBeenCalledWith(
      "intent-1",
      "user-1",
      "OAUTH_START_FAILED",
      now,
    );
    expect(repository.markVerified).not.toHaveBeenCalled();
  });

  it("settles source success only after binding proof, credential, user, provider, phase, status, and deadline", async () => {
    const pending = intent();
    const { deps, repository } = dependencies();
    vi.mocked(deps.verifyProof).mockResolvedValue(oauthContext());
    vi.mocked(repository.findByCredential).mockResolvedValue(pending);
    vi.mocked(repository.markVerified).mockResolvedValue(intent({ status: "verified" }));

    await new AccountLinkService(deps).settleCallback({
      headers: new Headers(),
      credential: rawCredential,
      oauthContextToken: "signed-oauth-context",
      provider: "github",
      linkUserId: "user-1",
      outcome: { kind: "success" },
    });

    expect(deps.verifyProof).toHaveBeenCalledWith(
      "signed-oauth-context",
      "oauth",
      now.getTime(),
    );
    expect(repository.findByCredential).toHaveBeenCalledWith("user-1", tokenHash, now);
    expect(repository.markVerified).toHaveBeenCalledWith(
      "intent-1",
      "user-1",
      now,
      new Date(now.getTime() + VERIFIED_GRANT_TTL_MS),
    );
  });

  it("fails closed when the repository rejects the reauth verified transition", async () => {
    const { deps, repository } = dependencies();
    vi.mocked(repository.findByCredential).mockResolvedValue(intent());
    vi.mocked(repository.markVerified).mockResolvedValue(null);

    await expect(new AccountLinkService(deps).settleCallback({
      headers: new Headers(),
      credential: rawCredential,
      oauthContextToken: "signed-oauth-context",
      provider: "github",
      linkUserId: "user-1",
      outcome: { kind: "success" },
    })).rejects.toEqual(expectAccountLinkError("IDENTITY_MISMATCH"));

    expect(repository.markVerified).toHaveBeenCalledOnce();
    expect(repository.complete).not.toHaveBeenCalled();
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("fails closed when the signed OAuth callback proof is invalid", async () => {
    const invalidToken = "invalid-oauth-token-must-not-leak";
    const { deps, repository } = dependencies();
    vi.mocked(deps.verifyProof).mockRejectedValue(new Error("invalid signature"));

    let caught: unknown;
    try {
      await new AccountLinkService(deps).settleCallback({
        headers: new Headers(),
        credential: rawCredential,
        oauthContextToken: invalidToken,
        provider: "github",
        linkUserId: "user-1",
        outcome: { kind: "success" },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toEqual(expectAccountLinkError("IDENTITY_MISMATCH"));
    expect(String(caught)).not.toContain(invalidToken);
    expect(deps.hashCredential).not.toHaveBeenCalled();
    expect(repository.findByCredential).not.toHaveBeenCalled();
    expect(repository.markVerified).not.toHaveBeenCalled();
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it("fails closed before hashing or lookup when the HttpOnly credential is missing", async () => {
    const { deps, repository } = dependencies();

    await expect(new AccountLinkService(deps).settleCallback({
      headers: new Headers(),
      credential: null,
      oauthContextToken: "signed-oauth-context",
      provider: "github",
      linkUserId: "user-1",
      outcome: { kind: "success" },
    })).rejects.toEqual(expectAccountLinkError("IDENTITY_MISMATCH"));

    expect(deps.verifyProof).toHaveBeenCalledWith(
      "signed-oauth-context",
      "oauth",
      now.getTime(),
    );
    expect(deps.hashCredential).not.toHaveBeenCalled();
    expect(repository.findByCredential).not.toHaveBeenCalled();
    expect(repository.markVerified).not.toHaveBeenCalled();
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it("fails closed when a wrong credential digest has no owner-scoped intent", async () => {
    const wrongCredential = "wrong-browser-credential-must-not-leak";
    const wrongDigest = "sha256:wrong-browser-credential";
    const { deps, repository } = dependencies({
      hashCredential: vi.fn(async () => wrongDigest),
    });
    vi.mocked(repository.findByCredential).mockResolvedValue(null);

    let caught: unknown;
    try {
      await new AccountLinkService(deps).settleCallback({
        headers: new Headers(),
        credential: wrongCredential,
        oauthContextToken: "signed-oauth-context",
        provider: "github",
        linkUserId: "user-1",
        outcome: { kind: "success" },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toEqual(expectAccountLinkError("IDENTITY_MISMATCH"));
    expect(String(caught)).not.toContain(wrongCredential);
    expect(deps.hashCredential).toHaveBeenCalledWith(wrongCredential);
    expect(repository.findByCredential).toHaveBeenCalledWith(
      "user-1",
      wrongDigest,
      now,
    );
    expect(repository.markVerified).not.toHaveBeenCalled();
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it.each([
    [oauthContext({ intentId: "wrong-intent" }), intent(), "github", "user-1"],
    [oauthContext({ userId: "wrong-user" }), intent(), "github", "user-1"],
    [oauthContext({ provider: "google" }), intent(), "github", "user-1"],
    [oauthContext({ phase: "target" }), intent(), "github", "user-1"],
    [oauthContext(), intent({ status: "verified" }), "github", "user-1"],
    [oauthContext(), intent({ expiresAt: now }), "github", "user-1"],
    [oauthContext(), intent(), "google", "user-1"],
    [oauthContext(), intent(), "github", "wrong-user"],
  ] as const)("fails closed on callback identity mismatch %#", async (proof, row, provider, linkUserId) => {
    const { deps, repository } = dependencies();
    vi.mocked(deps.verifyProof).mockResolvedValue(proof);
    vi.mocked(repository.findByCredential).mockResolvedValue(row);
    vi.mocked(repository.fail).mockResolvedValue(true);

    await expect(new AccountLinkService(deps).settleCallback({
      headers: new Headers(),
      credential: rawCredential,
      oauthContextToken: "signed-oauth-context",
      provider,
      linkUserId,
      outcome: { kind: "success" },
    })).rejects.toEqual(expectAccountLinkError("IDENTITY_MISMATCH"));
    expect(repository.markVerified).not.toHaveBeenCalled();
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it.each(["consumed", "completing", "completed"] as const)(
    "settles target success idempotently from %s without reusing the five-minute deadline",
    async (status) => {
    const consumed = intent({
      status,
      expiresAt: new Date(now.getTime() - 1),
      consumedAt: new Date(now.getTime() - 30_000),
      completedAt: status === "completed" ? now : null,
    });
    const { deps, repository } = dependencies();
    vi.mocked(deps.verifyProof).mockResolvedValue(oauthContext({
      provider: "google",
      phase: "target",
    }));
    vi.mocked(repository.findByCredential).mockResolvedValue(consumed);
    vi.mocked(repository.complete).mockResolvedValue(true);

    await new AccountLinkService(deps).settleCallback({
      headers: new Headers(),
      credential: rawCredential,
      oauthContextToken: "signed-target-context",
      provider: "google",
      linkUserId: "user-1",
      outcome: { kind: "success" },
    });

    expect(repository.complete).toHaveBeenCalledWith("intent-1", "user-1", now);
    expect(repository.markVerified).not.toHaveBeenCalled();
  });

  it("leaves completing unchanged when a concurrent callback error cannot see the target account yet", async () => {
    const { deps, repository } = dependencies();
    vi.mocked(deps.verifyProof).mockResolvedValue(oauthContext({
      provider: "google",
      phase: "target",
    }));
    vi.mocked(repository.findByCredential).mockResolvedValue(intent({ status: "completing" }));
    vi.mocked(deps.listAccounts).mockResolvedValue(["github"]);
    const headers = new Headers({ cookie: "session=authoritative" });

    await expect(new AccountLinkService(deps).settleCallback({
      headers,
      credential: rawCredential,
      oauthContextToken: "signed-target-context",
      provider: "google",
      linkUserId: "user-1",
      outcome: { kind: "error", code: "OAUTH_FAILED" },
    })).resolves.toEqual({ kind: "pending_completion" });

    expect(deps.listAccounts).toHaveBeenCalledWith(headers);
    expect(repository.fail).not.toHaveBeenCalled();
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it("completes a target error when authoritative accounts prove insertion succeeded", async () => {
    const { deps, repository } = dependencies();
    vi.mocked(deps.verifyProof).mockResolvedValue(oauthContext({
      provider: "google",
      phase: "target",
    }));
    vi.mocked(repository.findByCredential).mockResolvedValue(intent({ status: "completing" }));
    vi.mocked(deps.listAccounts).mockResolvedValue(["github", "google"]);
    vi.mocked(repository.complete).mockResolvedValue(true);
    const headers = new Headers({ cookie: "session=authoritative" });

    await expect(new AccountLinkService(deps).settleCallback({
      headers,
      credential: rawCredential,
      oauthContextToken: "signed-target-context",
      provider: "google",
      linkUserId: "user-1",
      outcome: { kind: "error", code: "OAUTH_FAILED" },
    })).resolves.toEqual({ kind: "authoritative_completion" });

    expect(repository.complete).toHaveBeenCalledWith("intent-1", "user-1", now);
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it("fails closed when the repository rejects the target completed transition", async () => {
    const { deps, repository } = dependencies();
    vi.mocked(deps.verifyProof).mockResolvedValue(oauthContext({
      provider: "google",
      phase: "target",
    }));
    vi.mocked(repository.findByCredential).mockResolvedValue(intent({ status: "consumed" }));
    vi.mocked(repository.complete).mockResolvedValue(false);

    await expect(new AccountLinkService(deps).settleCallback({
      headers: new Headers(),
      credential: rawCredential,
      oauthContextToken: "signed-target-context",
      provider: "google",
      linkUserId: "user-1",
      outcome: { kind: "success" },
    })).rejects.toEqual(expectAccountLinkError("IDENTITY_MISMATCH"));

    expect(repository.complete).toHaveBeenCalledOnce();
    expect(repository.markVerified).not.toHaveBeenCalled();
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it.each(["OAUTH_CANCELLED", "STATE_INVALID", "OAUTH_FAILED"])(
    "settles recognized callback error %s with its sanitized code",
    async (code) => {
      const { deps, repository } = dependencies();
      vi.mocked(repository.findByCredential).mockResolvedValue(intent());
      vi.mocked(repository.fail).mockResolvedValue(true);

      await new AccountLinkService(deps).settleCallback({
        headers: new Headers(),
        credential: rawCredential,
        oauthContextToken: "signed-oauth-context",
        provider: "github",
        linkUserId: "user-1",
        outcome: { kind: "error", code },
      });

      expect(repository.fail).toHaveBeenCalledWith("intent-1", "user-1", code, now);
    },
  );

  it("fails closed when the repository rejects a recognized error transition", async () => {
    const { deps, repository } = dependencies();
    vi.mocked(repository.findByCredential).mockResolvedValue(intent());
    vi.mocked(repository.fail).mockResolvedValue(false);

    await expect(new AccountLinkService(deps).settleCallback({
      headers: new Headers(),
      credential: rawCredential,
      oauthContextToken: "signed-oauth-context",
      provider: "github",
      linkUserId: "user-1",
      outcome: { kind: "error", code: "OAUTH_FAILED" },
    })).rejects.toEqual(expectAccountLinkError("IDENTITY_MISMATCH"));

    expect(repository.fail).toHaveBeenCalledOnce();
    expect(repository.markVerified).not.toHaveBeenCalled();
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it("maps an allowlisted target ownership conflict without provider or email leakage", async () => {
    const { deps, repository } = dependencies();
    vi.mocked(deps.verifyProof).mockResolvedValue(oauthContext({
      provider: "google",
      phase: "target",
    }));
    vi.mocked(repository.findByCredential).mockResolvedValue(intent({ status: "consumed" }));
    vi.mocked(repository.fail).mockResolvedValue(true);

    await new AccountLinkService(deps).settleCallback({
      headers: new Headers(),
      credential: rawCredential,
      oauthContextToken: "signed-target-context",
      provider: "google",
      linkUserId: "user-1",
      outcome: { kind: "error", code: "LINK_CONFLICT" },
    });

    expect(repository.fail).toHaveBeenCalledWith(
      "intent-1",
      "user-1",
      "LINK_CONFLICT",
      now,
    );
    expect(JSON.stringify(vi.mocked(repository.fail).mock.calls)).not.toMatch(/google|@/iu);
  });

  it("rejects unrecognized callback errors instead of persisting provider text", async () => {
    const { deps, repository } = dependencies();
    vi.mocked(repository.findByCredential).mockResolvedValue(intent());
    vi.mocked(repository.fail).mockResolvedValue(true);

    await expect(new AccountLinkService(deps).settleCallback({
      headers: new Headers(),
      credential: rawCredential,
      oauthContextToken: "signed-oauth-context",
      provider: "github",
      linkUserId: "user-1",
      outcome: { kind: "error", code: "github user someone@example.com owns account" },
    })).rejects.toEqual(expectAccountLinkError("IDENTITY_MISMATCH"));
    expect(repository.fail).toHaveBeenCalledWith(
      "intent-1",
      "user-1",
      "IDENTITY_MISMATCH",
      now,
    );
    expect(JSON.stringify(vi.mocked(repository.fail).mock.calls)).not.toContain("someone@example.com");
  });
});
