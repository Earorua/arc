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
  }): Promise<AccountLinkIntent>;
  findByCredential(
    userId: string,
    tokenHash: string,
    now: Date,
  ): Promise<AccountLinkIntent | null>;
  findById(id: string): Promise<AccountLinkIntent | null>;
  markVerified(
    id: string,
    userId: string,
    now: Date,
    expiresAt: Date,
  ): Promise<AccountLinkIntent | null>;
  consume(id: string, userId: string, now: Date): Promise<AccountLinkIntent | null>;
  complete(id: string, userId: string, now: Date): Promise<boolean>;
  fail(id: string, userId: string, code: string, now: Date): Promise<boolean>;
}
