import { z } from "zod";

export const accountLinkProviderSchema = z.enum(["google", "github"]);
export type AccountLinkProvider = z.infer<typeof accountLinkProviderSchema>;

export const accountLinkStatusSchema = z.enum([
  "pending_reauth",
  "verified",
  "consumed",
  "completing",
  "completed",
  "failed",
  "expired",
]);
export type AccountLinkStatus = z.infer<typeof accountLinkStatusSchema>;

export const accountLinkPhaseSchema = z.enum(["reauth", "target"]);
export type AccountLinkPhase = z.infer<typeof accountLinkPhaseSchema>;

export const startAccountLinkSchema = z.object({
  targetProvider: accountLinkProviderSchema,
}).strict();

export const safeAccountLinkStatusSchema = z.object({
  stage: accountLinkStatusSchema.nullable(),
  targetProvider: accountLinkProviderSchema.nullable(),
  expiresAt: z.iso.datetime().nullable(),
}).strict();

export type AccountLinkIntent = {
  id: string;
  tokenHash: string;
  userId: string;
  sourceProvider: AccountLinkProvider;
  targetProvider: AccountLinkProvider;
  status: AccountLinkStatus;
  expiresAt: Date;
  verifiedAt: Date | null;
  consumedAt: Date | null;
  completedAt: Date | null;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const PENDING_REAUTH_TTL_MS = 10 * 60 * 1000;
export const VERIFIED_GRANT_TTL_MS = 5 * 60 * 1000;
export const INTERNAL_PROOF_TTL_MS = 60 * 1000;
export const COMPLETION_RECONCILIATION_TTL_MS = 10 * 60 * 1000;

const transitions: Record<AccountLinkStatus, readonly AccountLinkStatus[]> = {
  pending_reauth: ["verified", "failed", "expired"],
  verified: ["consumed", "failed", "expired"],
  consumed: ["completing", "completed", "failed"],
  completing: ["completed", "failed"],
  completed: [],
  failed: [],
  expired: [],
};

export function canTransitionAccountLink(from: AccountLinkStatus, to: AccountLinkStatus) {
  return transitions[from].includes(to);
}

export function projectAccountLinkIntent(
  intent: Pick<AccountLinkIntent, "status" | "targetProvider" | "expiresAt">,
) {
  return safeAccountLinkStatusSchema.parse({
    stage: intent.status,
    targetProvider: intent.targetProvider,
    expiresAt: intent.expiresAt.toISOString(),
  });
}

export class AccountLinkError extends Error {
  constructor(
    readonly code:
      | "NOT_CONFIGURED"
      | "NO_SOURCE_PROVIDER"
      | "ALREADY_CONNECTED"
      | "INVALID_INTENT"
      | "EXPIRED"
      | "REPLAYED"
      | "IDENTITY_MISMATCH"
      | "LINK_CONFLICT"
      | "OAUTH_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "AccountLinkError";
  }
}
