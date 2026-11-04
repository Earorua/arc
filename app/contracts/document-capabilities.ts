import { z } from "zod";
import { materialIdSchema, materialVersionSchema } from "./documents";

export const documentCapabilitiesSchema = z.object({
  documentsEnabled: z.boolean(), analysisEnabled: z.boolean(), planningEnabled: z.boolean(),
  hasDocuments: z.boolean(), providerLabel: z.string().min(1).max(200).nullable(),
  providerPolicyId: materialIdSchema.nullable(), policyVersion: materialVersionSchema.nullable(),
  reason: z.enum(["ready", "disabled", "configuration-incomplete", "qualification-required"]),
}).strict();
export type DocumentCapabilities = z.infer<typeof documentCapabilitiesSchema>;
