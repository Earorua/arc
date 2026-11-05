import { z } from "zod";

/** Shared by the native Node registrars and Worker runtime; no application-only imports. */
export const documentReceiptRouteSchema = z.object({
  providerName: z.string().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9 ._()/-]*$/u),
  endpointId: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u),
  // Omission retains exact request-model matching; aliases are never inferred or normalized.
  generationModel: z.string().min(1).max(200).regex(/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u).optional(),
}).strict();
