import { z } from "zod";

export const DOCUMENT_PAID_STEP_CONFIG = Object.freeze({
  retries: Object.freeze({ limit: 0, delay: "1 second", backoff: "constant" }),
  timeout: "4 minutes",
} as const);

const referenceId = z.string().min(1).max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const argsSchema = z.object({ jobId: referenceId, contractVersion: z.literal("2026.11.1") }).strict();
const outputSchema = z.object({
  jobId: referenceId,
  state: z.enum(["queued", "running", "succeeded", "failed", "cancel-requested", "cancelled", "revoked",
    "cost-unknown", "delivery-pending", "already-claimed"]),
  resultRef: referenceId.nullable(),
}).strict();
export type DocumentWorkflowArgs = z.infer<typeof argsSchema>;
export type DocumentWorkflowOutput = z.infer<typeof outputSchema>;

function parseReference<T>(schema: z.ZodType<T>, value: unknown): Readonly<T> {
  try {
    const parsed = schema.parse(value);
    if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > 4096) throw new Error();
    return Object.freeze(parsed);
  } catch {
    throw new Error("Document workflow unavailable");
  }
}

export function parseDocumentWorkflowArgs(value: unknown): Readonly<DocumentWorkflowArgs> {
  return parseReference(argsSchema, value);
}
export function parseDocumentWorkflowOutput(value: unknown): Readonly<DocumentWorkflowOutput> {
  return parseReference(outputSchema, value);
}
