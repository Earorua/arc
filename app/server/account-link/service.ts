import {
  accountLinkProviderSchema,
  INTERNAL_PROOF_TTL_MS,
  PENDING_REAUTH_TTL_MS,
  projectAccountLinkIntent,
  safeAccountLinkStatusSchema,
  VERIFIED_GRANT_TTL_MS,
  AccountLinkError,
  type AccountLinkIntent,
  type AccountLinkPhase,
  type AccountLinkProvider,
} from "./contracts";
import type { SignedLinkContext } from "./crypto";
import type { AccountLinkRepository } from "./repository";

export type AccountLinkServiceDependencies = {
  repository: AccountLinkRepository;
  listAccounts: (headers: Headers) => Promise<AccountLinkProvider[]>;
  startProviderLink: (input: {
    headers: Headers;
    provider: AccountLinkProvider;
    phase: AccountLinkPhase;
    intent: AccountLinkIntent;
    internalProof: string;
  }) => Promise<{ url: string; headers: Headers }>;
  createCredential: () => string;
  hashCredential: (value: string) => Promise<string>;
  createProof: (input: SignedLinkContext) => Promise<string>;
  verifyProof: (
    token: string,
    kind: "internal" | "oauth",
    now: number,
  ) => Promise<SignedLinkContext>;
  createId: () => string;
  now: () => Date;
};

export type SettleAccountLinkCallbackInput = {
  headers: Headers;
  credential: string | null;
  oauthContextToken: string;
  provider: unknown;
  linkUserId: string;
  outcome:
    | { kind: "success" }
    | { kind: "error"; code: string };
};

const recognizedCallbackErrors = new Set([
  "OAUTH_CANCELLED",
  "LINK_CONFLICT",
  "STATE_INVALID",
  "OAUTH_FAILED",
]);

const emptyStatus = safeAccountLinkStatusSchema.parse({
  stage: null,
  targetProvider: null,
  expiresAt: null,
});

function domainError(code: AccountLinkError["code"], message: string) {
  return new AccountLinkError(code, message);
}

export class AccountLinkService {
  constructor(private readonly dependencies: AccountLinkServiceDependencies) {}

  async start(headers: Headers, userId: string, targetProvider: unknown) {
    const parsedTarget = accountLinkProviderSchema.safeParse(targetProvider);
    if (!parsedTarget.success) {
      throw domainError("NOT_CONFIGURED", "The requested provider is not configured");
    }

    const target = parsedTarget.data;
    const connectedProviders = await this.dependencies.listAccounts(headers);
    if (connectedProviders.includes(target)) {
      throw domainError("ALREADY_CONNECTED", "The requested provider is already connected");
    }

    const sourceProviders = connectedProviders.filter((provider) => provider !== target);
    if (sourceProviders.length !== 1) {
      throw domainError("NO_SOURCE_PROVIDER", "Exactly one source provider is required");
    }

    const source = sourceProviders[0];
    const operationTime = this.dependencies.now();
    const credential = this.dependencies.createCredential();
    const tokenHash = await this.dependencies.hashCredential(credential);
    const intent = await this.dependencies.repository.create({
      id: this.dependencies.createId(),
      tokenHash,
      userId,
      sourceProvider: source,
      targetProvider: target,
      expiresAt: new Date(operationTime.getTime() + PENDING_REAUTH_TTL_MS),
      now: operationTime,
    });

    try {
      const internalProof = await this.createInternalProof(
        intent,
        source,
        "reauth",
        operationTime,
      );
      const providerLink = await this.dependencies.startProviderLink({
        headers,
        provider: source,
        phase: "reauth",
        intent,
        internalProof,
      });
      return {
        intent,
        credential,
        authorizationUrl: providerLink.url,
        authHeaders: providerLink.headers,
      };
    } catch (error) {
      await this.bestEffortFailAfterOAuthStart(
        intent.id,
        userId,
        operationTime,
      );
      throw error;
    }
  }

  async status(userId: string, credential: string | null | undefined) {
    if (!credential) return emptyStatus;

    const operationTime = this.dependencies.now();
    const tokenHash = await this.dependencies.hashCredential(credential);
    const intent = await this.dependencies.repository.findByCredential(
      userId,
      tokenHash,
      operationTime,
    );
    return intent ? projectAccountLinkIntent(intent) : emptyStatus;
  }

  async continue(
    headers: Headers,
    userId: string,
    credential: string | null | undefined,
  ) {
    if (!credential) {
      throw domainError("INVALID_INTENT", "The account-link intent is missing");
    }

    const operationTime = this.dependencies.now();
    const tokenHash = await this.dependencies.hashCredential(credential);
    const intent = await this.dependencies.repository.findByCredential(
      userId,
      tokenHash,
      operationTime,
    );
    if (!intent) {
      throw domainError("INVALID_INTENT", "The account-link intent is invalid");
    }
    if (intent.status === "expired") {
      throw domainError("EXPIRED", "The verified grant has expired");
    }
    if (intent.status !== "verified") {
      const code = intent.status === "pending_reauth" ? "INVALID_INTENT" : "REPLAYED";
      throw domainError(code, "The verified grant is not available");
    }

    const consumed = await this.dependencies.repository.consume(
      intent.id,
      userId,
      operationTime,
    );
    if (!consumed) {
      throw domainError("REPLAYED", "The verified grant was already consumed");
    }

    try {
      const internalProof = await this.createInternalProof(
        consumed,
        consumed.targetProvider,
        "target",
        operationTime,
      );
      const providerLink = await this.dependencies.startProviderLink({
        headers,
        provider: consumed.targetProvider,
        phase: "target",
        intent: consumed,
        internalProof,
      });
      return {
        intent: consumed,
        authorizationUrl: providerLink.url,
        authHeaders: providerLink.headers,
      };
    } catch (error) {
      await this.bestEffortFailAfterOAuthStart(
        consumed.id,
        userId,
        operationTime,
      );
      throw error;
    }
  }

  async settleCallback(input: SettleAccountLinkCallbackInput): Promise<void> {
    const operationTime = this.dependencies.now();
    const context = await this.verifyOAuthContext(
      input.oauthContextToken,
      operationTime,
    );
    const parsedProvider = accountLinkProviderSchema.safeParse(input.provider);
    if (!parsedProvider.success || !input.credential) {
      throw domainError("IDENTITY_MISMATCH", "The callback identity did not match");
    }

    const tokenHash = await this.dependencies.hashCredential(input.credential);
    const intent = await this.dependencies.repository.findByCredential(
      context.userId,
      tokenHash,
      operationTime,
    );
    if (!intent) {
      throw domainError("IDENTITY_MISMATCH", "The callback intent did not match");
    }

    const expectedProvider = context.phase === "reauth"
      ? intent.sourceProvider
      : intent.targetProvider;
    const expectedStatus = context.phase === "reauth" ? "pending_reauth" : "consumed";
    const commonIdentityMatches =
      context.intentId === intent.id
      && context.userId === intent.userId
      && input.linkUserId === intent.userId
      && context.provider === parsedProvider.data
      && parsedProvider.data === expectedProvider
      && intent.status === expectedStatus;
    const reauthDeadlineIsValid =
      context.phase !== "reauth"
      || intent.expiresAt.getTime() > operationTime.getTime();

    if (!commonIdentityMatches || !reauthDeadlineIsValid) {
      await this.failIdentityMismatch(intent, context, operationTime);
      throw domainError("IDENTITY_MISMATCH", "The callback identity did not match");
    }

    if (input.outcome.kind === "error") {
      if (!recognizedCallbackErrors.has(input.outcome.code)) {
        await this.failIdentityMismatch(intent, context, operationTime);
        throw domainError("IDENTITY_MISMATCH", "The callback error was not recognized");
      }
      const failed = await this.dependencies.repository.fail(
        intent.id,
        intent.userId,
        input.outcome.code,
        operationTime,
      );
      if (!failed) {
        throw domainError("IDENTITY_MISMATCH", "The callback intent was no longer active");
      }
      return;
    }

    if (context.phase === "reauth") {
      const verified = await this.dependencies.repository.markVerified(
        intent.id,
        intent.userId,
        operationTime,
        new Date(operationTime.getTime() + VERIFIED_GRANT_TTL_MS),
      );
      if (!verified) {
        throw domainError("IDENTITY_MISMATCH", "The callback intent was no longer pending");
      }
      return;
    }

    const completed = await this.dependencies.repository.complete(
      intent.id,
      intent.userId,
      operationTime,
    );
    if (!completed) {
      throw domainError("IDENTITY_MISMATCH", "The callback intent was no longer consumed");
    }
  }

  private async createInternalProof(
    intent: AccountLinkIntent,
    provider: AccountLinkProvider,
    phase: AccountLinkPhase,
    operationTime: Date,
  ) {
    return await this.dependencies.createProof({
      kind: "internal",
      intentId: intent.id,
      userId: intent.userId,
      provider,
      phase,
      issuedAt: operationTime.getTime(),
      expiresAt: operationTime.getTime() + INTERNAL_PROOF_TTL_MS,
      nonce: this.dependencies.createId(),
    });
  }

  private async verifyOAuthContext(token: string, operationTime: Date) {
    try {
      return await this.dependencies.verifyProof(token, "oauth", operationTime.getTime());
    } catch {
      throw domainError("IDENTITY_MISMATCH", "The callback proof was invalid");
    }
  }

  private async failIdentityMismatch(
    intent: AccountLinkIntent,
    context: SignedLinkContext,
    operationTime: Date,
  ) {
    if (intent.id === context.intentId && intent.userId === context.userId) {
      await this.dependencies.repository.fail(
        intent.id,
        intent.userId,
        "IDENTITY_MISMATCH",
        operationTime,
      );
    }
  }

  private async bestEffortFailAfterOAuthStart(
    intentId: string,
    userId: string,
    operationTime: Date,
  ) {
    try {
      await this.dependencies.repository.fail(
        intentId,
        userId,
        "OAUTH_START_FAILED",
        operationTime,
      );
    } catch {
      // Preserve the provider-start error that caused this terminal transition attempt.
    }
  }
}
