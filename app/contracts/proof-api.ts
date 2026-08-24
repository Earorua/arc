import { z } from "zod";
import { proofLedgerMutationResultSchema, proofLedgerWorkspaceSchema } from "./proof-ledger";

export const proofWorkspaceResponseSchema = z.object({
  workspace: proofLedgerWorkspaceSchema.nullable(),
}).strict();

export const proofMutationResponseSchema = z.object({
  result: proofLedgerMutationResultSchema,
}).strict();

export type ProofWorkspaceResponse = z.infer<typeof proofWorkspaceResponseSchema>;
export type ProofMutationResponse = z.infer<typeof proofMutationResponseSchema>;
