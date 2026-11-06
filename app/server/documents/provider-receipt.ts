import { z } from "zod";
import { materialTimestampSchema } from "../../contracts/documents";

export { documentReceiptRouteSchema } from "./receipt-route.ts";
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const DOCUMENT_METADATA_TIMEOUT_MS = 30_000;
export const MAX_DOCUMENT_METADATA_ATTEMPTS = 3;
const offset = z.number().int().min(0).max(DOCUMENT_METADATA_TIMEOUT_MS);
const lookupSchema = z.object({
  startMs: offset, endMs: offset, httpStatus: z.number().int().min(100).max(599).nullable(),
  outcome: z.enum(["record", "unusable-record", "invalid-envelope", "http-status", "redirect", "transport-error", "body-error", "timeout", "aborted"]),
  retryAfterMs: offset.optional(),
}).strict();
export type DocumentMetadataLookup = z.infer<typeof lookupSchema>;
const extractionReadSchema = z.enum(["parsed", "output-limit", "incomplete-finish", "missing-content", "invalid-json", "invalid-shape", "invalid-source"]);
export type DocumentExtractionRead = z.infer<typeof extractionReadSchema>;
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
  metadataAttempts: z.number().int().min(0).max(MAX_DOCUMENT_METADATA_ATTEMPTS),
  // Only the new extractive policy records this fixed category after receipt verification.
  extractionRead: extractionReadSchema.optional(),
  // Historical records have only a count. New observations contain no URLs, headers, messages or bodies.
  metadataLookups: z.array(lookupSchema).max(MAX_DOCUMENT_METADATA_ATTEMPTS).optional(),
  sentAt: materialTimestampSchema, returnedAt: materialTimestampSchema, checkedAt: materialTimestampSchema,
}).strict().refine(audit => !audit.metadataLookups || (audit.metadataLookups.length === audit.metadataAttempts
  && audit.metadataLookups.every((row, i, rows) => row.endMs >= row.startMs && row.startMs >= (rows[i - 1]?.endMs ?? 0))),
  { message: "Invalid metadata lookup chronology" });
export type DocumentReceiptAudit = z.infer<typeof documentReceiptAuditSchema>;
