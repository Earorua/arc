import type { AccountLinkIntent, AccountLinkProvider } from "./contracts";

export interface AccountLinkRepository {
  create(input: {
    id: string;
    tokenHash: string;
    userId: string;
    sourceProvider: AccountLinkProvider;
    targetProvider: AccountLinkProvider;
    expiresAt: Date;
    now: Date;
  }): Promise<AccountLinkIntent | null>;
  findByCredential(
    userId: string,
    tokenHash: string,
    now: Date,
  ): Promise<AccountLinkIntent | null>;
  findByCredentialForAttribution(
    userId: string,
    tokenHash: string,
  ): Promise<AccountLinkIntent | null>;
  findInFlightByOwnerAndTarget(
    userId: string,
    targetProvider: AccountLinkProvider,
  ): Promise<AccountLinkIntent | null>;
  findById(id: string): Promise<AccountLinkIntent | null>;
  claimInternalProof(input: {
    intentId: string;
    userId: string;
    provider: AccountLinkProvider;
    phase: "reauth" | "target";
    issuedAt: Date;
    now: Date;
  }): Promise<boolean>;
  reserveTargetCompletion(id: string, userId: string, now: Date): Promise<boolean>;
  markVerified(
    id: string,
    userId: string,
    now: Date,
    expiresAt: Date,
  ): Promise<AccountLinkIntent | null>;
  consume(id: string, userId: string, now: Date): Promise<AccountLinkIntent | null>;
  complete(id: string, userId: string, now: Date): Promise<boolean>;
  failStaleCompletion(input: {
    id: string;
    userId: string;
    targetProvider: AccountLinkProvider;
    cutoff: Date;
    now: Date;
  }): Promise<boolean>;
  fail(id: string, userId: string, code: string, now: Date): Promise<boolean>;
}
