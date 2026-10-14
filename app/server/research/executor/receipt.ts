import { z } from "zod";
import {
  providerCitationAnnotationSchema,
  providerUsageSchema,
  type ProviderCitationAnnotation,
  type ProviderUsage,
} from "../../../contracts/research";
import { canonicalJson } from "../../../lib/planning/fingerprint";
import { fitsUtf8, RESEARCH_PROVIDER_LIMITS } from "../provider";
import { parseBridgeBeginGrant, type BridgeBeginGrant } from "./begin";
import { BRIDGE_BODY_LIMITS, bridgeByteLength, decodeBridgeJson } from "./body";

export const BRIDGE_RECEIPT_RETENTION_MS = 86_400_000;

export class BridgeReceiptError extends Error {
  constructor(readonly code: "invalid-message" | "conflict" | "unavailable") {
    super(`Research bridge receipt failure: ${code}`);
    this.name = "BridgeReceiptError";
  }
}

export type BridgeProviderResponseOutcome = Readonly<{
  kind: "response";
  content: string;
  annotations: readonly Readonly<ProviderCitationAnnotation>[];
  actualModel: string | null;
  usage: Readonly<ProviderUsage> | null;
}>;

export type BridgeProviderErrorOutcome = Readonly<{
  kind: "error";
  code: "missing-key" | "timeout" | "rate" | "balance" | "unavailable" | "filtered" | "invalid-transport";
  retryable: boolean;
  charged: boolean | "unknown";
  actualModel: string | null;
  usage: Readonly<ProviderUsage> | null;
}>;

export type BridgeProviderReceipt = Readonly<{
  grant: BridgeBeginGrant;
  producedAt: number;
  latencyMs: number;
  outcome: BridgeProviderResponseOutcome | BridgeProviderErrorOutcome;
}>;

export type BridgeReceiptMetadata = Readonly<{
  grant: BridgeBeginGrant;
  receiptHash: string;
  producedAt: number;
  latencyMs: number;
  outcome:
    | Readonly<{
        kind: "response";
        actualModel: string | null;
        usage: Readonly<ProviderUsage> | null;
      }>
    | BridgeProviderErrorOutcome;
}>;

const safeTime = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const actualModelSchema = z.string().min(1).max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/u)
  .nullable();
const responseOutcomeSchema = z.object({
  kind: z.literal("response"),
  content: z.string().min(1).max(RESEARCH_PROVIDER_LIMITS.contentBytes).refine(
    (value) => value.trim().length > 0
      && fitsUtf8(value, RESEARCH_PROVIDER_LIMITS.contentBytes),
  ),
  annotations: z.array(providerCitationAnnotationSchema).max(256),
  actualModel: actualModelSchema,
  usage: providerUsageSchema.nullable(),
}).strict();
const errorOutcomeSchema = z.object({
  kind: z.literal("error"),
  code: z.enum([
    "missing-key",
    "timeout",
    "rate",
    "balance",
    "unavailable",
    "filtered",
    "invalid-transport",
  ]),
  retryable: z.boolean(),
  charged: z.union([z.boolean(), z.literal("unknown")]),
  actualModel: actualModelSchema,
  usage: providerUsageSchema.nullable(),
}).strict();
const responseMetadataOutcomeSchema = responseOutcomeSchema.omit({
  content: true,
  annotations: true,
});
const receiptHashSchema = z.string().length(64).regex(/^[0-9a-f]{64}$/u);
const receiptMetadataSchema = z.object({
  grant: z.unknown(),
  receiptHash: receiptHashSchema,
  producedAt: safeTime.max(Number.MAX_SAFE_INTEGER - BRIDGE_RECEIPT_RETENTION_MS),
  latencyMs: safeTime,
  outcome: z.discriminatedUnion("kind", [responseMetadataOutcomeSchema, errorOutcomeSchema]),
}).strict();
const receiptSchema = z.object({
  grant: z.unknown(),
  producedAt: safeTime.max(Number.MAX_SAFE_INTEGER - BRIDGE_RECEIPT_RETENTION_MS),
  latencyMs: safeTime,
  outcome: z.discriminatedUnion("kind", [responseOutcomeSchema, errorOutcomeSchema]),
}).strict();

function invalidMessage(): never {
  throw new BridgeReceiptError("invalid-message");
}

export function parseBridgeProviderReceipt(input: unknown): BridgeProviderReceipt {
  try {
    const bytes = new TextEncoder().encode(canonicalJson(input));
    if (bytes.byteLength > BRIDGE_BODY_LIMITS.result) throw new Error();
    const value = receiptSchema.parse(decodeBridgeJson(bytes));
    const grant = parseBridgeBeginGrant(value.grant);
    const usage = value.outcome.usage === null
      ? null
      : Object.freeze({ ...value.outcome.usage });
    const outcome: BridgeProviderResponseOutcome | BridgeProviderErrorOutcome = value.outcome.kind === "response"
      ? Object.freeze({
        ...value.outcome,
        annotations: Object.freeze(value.outcome.annotations.map(
          (annotation) => Object.freeze({ ...annotation }),
        )),
        usage,
      })
      : Object.freeze({ ...value.outcome, usage });
    return Object.freeze({
      grant,
      producedAt: value.producedAt,
      latencyMs: value.latencyMs,
      outcome,
    });
  } catch {
    return invalidMessage();
  }
}

export function encodeBridgeProviderReceipt(input: unknown): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(canonicalJson(parseBridgeProviderReceipt(input)));
  if (bytes.byteLength > BRIDGE_BODY_LIMITS.result) return invalidMessage();
  return bytes;
}

export function decodeBridgeProviderReceipt(bytes: Uint8Array): BridgeProviderReceipt {
  try {
    const actualBytes = bridgeByteLength(bytes);
    if (actualBytes === 0 || actualBytes > BRIDGE_BODY_LIMITS.result) throw new Error();
    return parseBridgeProviderReceipt(decodeBridgeJson(bytes));
  } catch {
    return invalidMessage();
  }
}

export function matchBridgeProviderReceipt(
  input: unknown,
  expectedGrant: BridgeBeginGrant,
): BridgeProviderReceipt {
  const receipt = parseBridgeProviderReceipt(input);
  let expected: BridgeBeginGrant;
  try {
    expected = parseBridgeBeginGrant(expectedGrant);
  } catch {
    return invalidMessage();
  }
  if (canonicalJson(receipt.grant) !== canonicalJson(expected)) {
    throw new BridgeReceiptError("conflict");
  }
  return receipt;
}

export async function hashBridgeProviderReceipt(input: unknown): Promise<string> {
  const bytes = encodeBridgeProviderReceipt(input);
  try {
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
    return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
  } catch {
    throw new BridgeReceiptError("unavailable");
  }
}

/** Validates bounded metadata syntax; without the receipt body it cannot recompute receiptHash. */
export function parseBridgeReceiptMetadata(input: unknown): BridgeReceiptMetadata {
  try {
    const bytes = new TextEncoder().encode(canonicalJson(input));
    if (bytes.byteLength === 0 || bytes.byteLength > BRIDGE_BODY_LIMITS.status) throw new Error();
    const value = receiptMetadataSchema.parse(decodeBridgeJson(bytes));
    const grant = parseBridgeBeginGrant(value.grant);
    const usage = value.outcome.usage === null
      ? null
      : Object.freeze({ ...value.outcome.usage });
    const outcome = Object.freeze({ ...value.outcome, usage });
    return Object.freeze({
      grant,
      receiptHash: value.receiptHash,
      producedAt: value.producedAt,
      latencyMs: value.latencyMs,
      outcome,
    });
  } catch {
    return invalidMessage();
  }
}

export async function summarizeBridgeProviderReceipt(input: unknown): Promise<BridgeReceiptMetadata> {
  const receipt = parseBridgeProviderReceipt(input);
  const hashPromise = hashBridgeProviderReceipt(receipt);
  const receiptHash = await hashPromise;
  return parseBridgeReceiptMetadata({
    grant: receipt.grant,
    receiptHash,
    producedAt: receipt.producedAt,
    latencyMs: receipt.latencyMs,
    outcome: receipt.outcome.kind === "response"
      ? {
          kind: receipt.outcome.kind,
          actualModel: receipt.outcome.actualModel,
          usage: receipt.outcome.usage,
        }
      : receipt.outcome,
  });
}
