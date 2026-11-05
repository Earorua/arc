import { z } from "zod";
import { materialTimestampSchema } from "../../contracts/documents";

export { documentReceiptRouteSchema } from "./receipt-route.ts";
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const usdLiteral = z.string().max(128).regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u);
export const documentReceiptAuditSchema = z.object({
  status: z.enum(["verified", "receipt-missing", "duplicate-receipt", "receipt-claim-failed", "metadata-unavailable",
    "metadata-timeout", "id-mismatch", "route-unverified", "route-mismatch", "model-mismatch", "usage-mismatch", "cost-conflict", "price-bound-exceeded"]),
  // Exact approved labels or a SHA-256 fingerprint of an unexpected label. Untrusted metadata never enters a report.
  actualModel: z.string().max(200).nullable(), actualProvider: z.string().max(100).nullable(),
  actualEndpointId: z.string().max(128).nullable(),
  costEvidenceVersion: z.literal("wire-decimal-v1").optional(),
  metadataInputTokens: count.nullable(), metadataOutputTokens: count.nullable(), metadataMicroUsd: count.nullable(),
  conflictingCostsUsd: z.object({ chat: usdLiteral, generation: usdLiteral }).strict().optional(),
  providerLatencyMs: count.nullable().optional(), providerGenerationMs: count.nullable().optional(),
  metadataAttempts: z.number().int().min(0).max(3),
  sentAt: materialTimestampSchema, returnedAt: materialTimestampSchema, checkedAt: materialTimestampSchema,
}).strict();
export type DocumentReceiptAudit = z.infer<typeof documentReceiptAuditSchema>;
