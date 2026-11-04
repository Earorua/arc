import { z } from "zod";
import { materialIdSchema } from "./documents";
export const materialGenerationReceiptRequestSchema = z.object({ mutationId: materialIdSchema, contextVersionId: materialIdSchema, goalId: materialIdSchema }).strict();
export const materialGenerationReceiptResponseSchema = z.object({ state: z.enum(["committed", "uncommitted"]), previewExpired: z.boolean() }).strict();
