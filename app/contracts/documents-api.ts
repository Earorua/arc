import { z } from "zod";
import {
  DOCUMENT_SCHEMA_VERSION, MAX_DOCUMENT_ITEMS_JSON_BYTES, adoptedMaterialEntriesSchema, adoptedMaterialScopeSchema, boundedMaterialJson, confirmedMaterialItemsSchema,
  documentKindSchema, documentReviewDraftSchema, documentSchema, documentTextSchema, documentVersionSchema,
  materialDigestSchema, materialGoalScopeSchema, materialIdSchema, materialOwnerIdSchema, materialRevisionSchema, materialScopeSchema, materialSelectionEntriesSchema, materialSelectionEntrySchema,
  materialSelectionRefSchema, materialSelectionSchema, materialSelfAssessmentHintsSchema, materialTimestampSchema, materialVersionSchema, materialReviewPointsSchema,
} from "./documents";
import {
  createMaterialContextRequestSchema, createMaterialContextResponseSchema, generatePlanningWithMaterialsRequestSchema,
  materialReplanRequestSchema, materialSha256, readMaterialContextRequestSchema, readMaterialContextResponseSchema,
  materialHistoryResponseSchema, materialReplanResponseSchema,
} from "./material-planning";
import { documentCapabilitiesSchema } from "./document-capabilities";
import { materialGenerationReceiptRequestSchema, materialGenerationReceiptResponseSchema } from "./material-recovery";
import { MAX_PLANNING_RESPONSE_BYTES, planningMutationResponseSchema } from "./planning-api";
import { canonicalJson } from "../lib/planning/fingerprint";

export const MAX_DOCUMENT_CREATE_BODY_BYTES = 512 * 1024;
export const MAX_DOCUMENT_API_RESPONSE_BYTES = 512 * 1024;
const emptyRequestSchema = z.object({}).strict();
const mutationFields = { mutationId: materialIdSchema };
const revisionMutationFields = { ...mutationFields, expectedRevision: materialRevisionSchema };
export const listDocumentsRequestSchema = z.object({ cursor: z.string().min(1).max(512).optional(), limit: z.number().int().min(1).max(30).optional() }).strict();
export const listDocumentsResponseSchema = boundedMaterialJson(z.object({ documents: z.array(documentSchema).max(30), nextCursor: z.string().min(1).max(512).nullable() }).strict(), MAX_DOCUMENT_API_RESPONSE_BYTES);
export const createDocumentRequestSchema = boundedMaterialJson(z.object({ kind: documentKindSchema, displayName: z.string().trim().min(1).max(200), text: documentTextSchema, ...mutationFields }).strict(), MAX_DOCUMENT_CREATE_BODY_BYTES);
export const documentVersionReceiptSchema = z.object({ documentId: materialIdSchema, documentVersionId: materialIdSchema, textVersionId: materialIdSchema, revision: materialRevisionSchema }).strict();
export const readDocumentRequestSchema = z.object({ documentId: materialIdSchema, versionId: materialIdSchema.optional() }).strict();
export const readDocumentResponseSchema = boundedMaterialJson(z.object({ document: documentSchema, version: documentVersionSchema, text: documentTextSchema }).strict().superRefine((response, ctx) => {
  if (response.version.documentId !== response.document.id) ctx.addIssue({ code: "custom", message: "Version must belong to document" });
  if (response.document.lifecycle !== "active" || response.version.state !== "ready") ctx.addIssue({ code: "custom", message: "Only retained active versions expose text" });
}), MAX_DOCUMENT_API_RESPONSE_BYTES);
export const createDocumentVersionRequestSchema = boundedMaterialJson(z.object({ documentId: materialIdSchema, text: documentTextSchema, ...revisionMutationFields }).strict(), MAX_DOCUMENT_CREATE_BODY_BYTES);
export const readDocumentReviewDraftRequestSchema = z.object({ documentId: materialIdSchema, textVersionId: materialIdSchema }).strict();
export const documentReviewDraftResponseSchema = boundedMaterialJson(z.object({ draft: documentReviewDraftSchema.nullable() }).strict(), MAX_DOCUMENT_ITEMS_JSON_BYTES + 1024);
export const saveDocumentReviewDraftRequestSchema = boundedMaterialJson(z.object({
  documentId: materialIdSchema, textVersionId: materialIdSchema, extractionId: materialIdSchema.nullable(),
  items: confirmedMaterialItemsSchema, selfAssessmentHints: materialSelfAssessmentHintsSchema, ...revisionMutationFields,
  reviewPoints: materialReviewPointsSchema.optional(),
}).strict(), MAX_DOCUMENT_ITEMS_JSON_BYTES);
export const saveDocumentReviewDraftResponseSchema = boundedMaterialJson(z.object({ draft: documentReviewDraftSchema }).strict(), MAX_DOCUMENT_ITEMS_JSON_BYTES + 1024);
export const createDocumentConfirmationRequestSchema = boundedMaterialJson(z.object({
  documentId: materialIdSchema, documentVersionId: materialIdSchema, textVersionId: materialIdSchema, reviewRevision: materialRevisionSchema,
  items: confirmedMaterialItemsSchema, ...revisionMutationFields,
}).strict().superRefine((request, ctx) => {
  for (const item of request.items) if (item.sourceRef && (item.sourceRef.documentId !== request.documentId || item.sourceRef.documentVersionId !== request.documentVersionId || item.sourceRef.textVersionId !== request.textVersionId)) ctx.addIssue({ code: "custom", message: "Confirmation contains a cross-version source" });
}), MAX_DOCUMENT_ITEMS_JSON_BYTES);
export const documentConfirmationResponseSchema = z.object({ confirmationId: materialIdSchema, revision: materialRevisionSchema }).strict();
export const createMaterialSelectionRequestSchema = z.object({ scope: materialScopeSchema, entries: materialSelectionEntriesSchema, ...mutationFields }).strict();
export const readMaterialSelectionRequestSchema = z.object({ selectionId: materialIdSchema }).strict();
export const updateMaterialSelectionRequestSchema = z.object({ selectionId: materialIdSchema, entries: materialSelectionEntriesSchema, ...revisionMutationFields }).strict();
export const readMaterialSelectionResponseSchema = z.object({
  selection: materialSelectionSchema,
  versions: z.array(z.object({ documentId: materialIdSchema, documentVersionId: materialIdSchema, state: z.enum(["active", "superseded", "revoked", "unavailable"]) }).strict()).max(5),
}).strict().superRefine((response, ctx) => {
  const versionKeys = response.versions.map(({ documentId, documentVersionId }) => `${documentId}:${documentVersionId}`);
  if (new Set(versionKeys).size !== versionKeys.length || response.selection.entries.length !== response.versions.length || response.selection.entries.some(({ documentId, documentVersionId }) => !versionKeys.includes(`${documentId}:${documentVersionId}`))) ctx.addIssue({ code: "custom", message: "Version statuses must exactly cover the selected versions" });
});
export const createDocumentConsentRequestSchema = z.object({ textVersionId: materialIdSchema, purpose: z.literal("analysis"), policyVersion: materialVersionSchema, providerPolicyId: materialIdSchema, ...mutationFields }).strict();
export const createDocumentConsentResponseSchema = z.object({ consentId: materialIdSchema }).strict();
export const documentConsentSchema = z.object({
  consentId: materialIdSchema, schemaVersion: z.literal(DOCUMENT_SCHEMA_VERSION), textVersionId: materialIdSchema,
  purpose: z.literal("analysis"), policyVersion: materialVersionSchema, providerPolicyId: materialIdSchema,
  grantedAt: materialTimestampSchema, revokedAt: materialTimestampSchema.nullable(),
}).strict();
export const createDocumentJobRequestSchema = z.object({ textVersionId: materialIdSchema, consentId: materialIdSchema, previousJobId: materialIdSchema.optional(), ...mutationFields }).strict();
export const createDocumentJobResponseSchema = z.object({ jobId: materialIdSchema, state: z.literal("queued") }).strict();
export const readDocumentJobRequestSchema = z.object({ jobId: materialIdSchema }).strict();
export const documentJobStateSchema = z.enum(["queued", "running", "succeeded", "failed", "cancel-requested", "cancelled", "revoked", "cost-unknown"]);
export const documentJobErrorCodeSchema = z.enum(["configuration", "aborted-before-send", "queue-expired", "consent-revoked", "document-revoked", "quota-exceeded", "input-too-large", "invalid-candidate", "outcome-unknown", "provider-failed"]);
export const documentJobResponseSchema = z.object({
  jobId: materialIdSchema, revision: materialRevisionSchema, state: documentJobStateSchema,
  costState: z.enum(["reserved", "settled", "held-unknown", "released"]), extractionId: materialIdSchema.nullable(), errorCode: documentJobErrorCodeSchema.nullable(),
}).strict().refine((job) => job.extractionId === null || job.state === "succeeded", "Only a validated success exposes an extraction reference");
export const cancelDocumentJobRequestSchema = z.object({ jobId: materialIdSchema, ...revisionMutationFields }).strict();
export const cancelDocumentJobResponseSchema = z.object({ jobId: materialIdSchema, revision: materialRevisionSchema, state: z.enum(["cancel-requested", "cancelled", "revoked"]) }).strict();
export const revokeDocumentConsentRequestSchema = z.object({ consentId: materialIdSchema, ...mutationFields }).strict();
export const revokeDocumentConsentResponseSchema = z.object({ consentId: materialIdSchema, state: z.literal("revoked"), cancellationRequested: z.boolean() }).strict();
export const deleteDocumentRequestSchema = z.object({ documentId: materialIdSchema, ...revisionMutationFields }).strict();
export const deleteDocumentResponseSchema = z.object({ deletionJobId: materialIdSchema, state: z.enum(["revoked", "cleanup-pending"]) }).strict();
export const readDocumentDeletionRequestSchema = z.object({ deletionJobId: materialIdSchema }).strict();
export const readDocumentDeletionResponseSchema = z.object({ deletionJobId: materialIdSchema, state: z.enum(["revoked", "cleaning", "failed", "completed"]), errorCode: z.enum(["cleanup-failed", "storage-unavailable"]).nullable() }).strict();
export const readDocumentMutationRequestSchema = z.object({ mutationId: materialIdSchema, endpoint: z.enum(["createDocument", "createDocumentVersion"]) }).strict();
export const readDocumentMutationResponseSchema = z.object({ receipt: documentVersionReceiptSchema.nullable() }).strict();
export const readDocumentExtractionRequestSchema = z.object({ documentId: materialIdSchema, extractionId: materialIdSchema }).strict();
export const readDocumentExtractionResponseSchema = boundedMaterialJson(z.object({ draft: documentReviewDraftSchema, expectedRevision: materialRevisionSchema }).strict(), MAX_DOCUMENT_ITEMS_JSON_BYTES + 1024);
export const adoptDocumentExtractionRequestSchema = z.object({ documentId: materialIdSchema, textVersionId: materialIdSchema, extractionId: materialIdSchema, ...revisionMutationFields }).strict();

/** Requests combine validated path, query and body fields; there are no HTTP handlers in phase 0. */
export const documentEndpointContracts = {
  listDocuments: { method: "GET", path: "/api/documents", request: listDocumentsRequestSchema, response: listDocumentsResponseSchema },
  createDocument: { method: "POST", path: "/api/documents", request: createDocumentRequestSchema, response: documentVersionReceiptSchema },
  readDocument: { method: "GET", path: "/api/documents/[documentId]", request: readDocumentRequestSchema, response: readDocumentResponseSchema },
  createDocumentVersion: { method: "POST", path: "/api/documents/[documentId]/versions", request: createDocumentVersionRequestSchema, response: documentVersionReceiptSchema },
  readDocumentReviewDraft: { method: "GET", path: "/api/documents/[documentId]/review-draft", request: readDocumentReviewDraftRequestSchema, response: documentReviewDraftResponseSchema },
  saveDocumentReviewDraft: { method: "PUT", path: "/api/documents/[documentId]/review-draft", request: saveDocumentReviewDraftRequestSchema, response: saveDocumentReviewDraftResponseSchema },
  createDocumentConfirmation: { method: "POST", path: "/api/documents/[documentId]/confirmations", request: createDocumentConfirmationRequestSchema, response: documentConfirmationResponseSchema },
  createMaterialSelection: { method: "POST", path: "/api/material-selections", request: createMaterialSelectionRequestSchema, response: materialSelectionRefSchema },
  readMaterialSelection: { method: "GET", path: "/api/material-selections/[selectionId]", request: readMaterialSelectionRequestSchema, response: readMaterialSelectionResponseSchema },
  updateMaterialSelection: { method: "PUT", path: "/api/material-selections/[selectionId]", request: updateMaterialSelectionRequestSchema, response: materialSelectionRefSchema },
  createDocumentConsent: { method: "POST", path: "/api/document-consents", request: createDocumentConsentRequestSchema, response: createDocumentConsentResponseSchema },
  createDocumentJob: { method: "POST", path: "/api/document-jobs", request: createDocumentJobRequestSchema, response: createDocumentJobResponseSchema },
  readDocumentJob: { method: "GET", path: "/api/document-jobs/[jobId]", request: readDocumentJobRequestSchema, response: documentJobResponseSchema },
  cancelDocumentJob: { method: "POST", path: "/api/document-jobs/[jobId]/cancel", request: cancelDocumentJobRequestSchema, response: cancelDocumentJobResponseSchema },
  revokeDocumentConsent: { method: "POST", path: "/api/document-consents/[consentId]/revoke", request: revokeDocumentConsentRequestSchema, response: revokeDocumentConsentResponseSchema },
  createMaterialContext: { method: "POST", path: "/api/planning/material-contexts", request: createMaterialContextRequestSchema, response: createMaterialContextResponseSchema },
  generatePlanning: { method: "POST", path: "/api/planning/generate", request: generatePlanningWithMaterialsRequestSchema, response: boundedMaterialJson(planningMutationResponseSchema, MAX_PLANNING_RESPONSE_BYTES) },
  materialReplan: { method: "POST", path: "/api/planning/material-replans", request: materialReplanRequestSchema, response: materialReplanResponseSchema },
  readMaterialContext: { method: "GET", path: "/api/planning/material-contexts/[contextVersionId]", request: readMaterialContextRequestSchema, response: readMaterialContextResponseSchema },
  deleteDocument: { method: "DELETE", path: "/api/documents/[documentId]", request: deleteDocumentRequestSchema, response: deleteDocumentResponseSchema },
  readDocumentDeletion: { method: "GET", path: "/api/document-deletions/[deletionJobId]", request: readDocumentDeletionRequestSchema, response: readDocumentDeletionResponseSchema },
  readDocumentCapabilities: { method: "GET", path: "/api/documents/capabilities", request: emptyRequestSchema, response: documentCapabilitiesSchema },
  readDocumentMutation: { method: "GET", path: "/api/document-mutations/[mutationId]", request: readDocumentMutationRequestSchema, response: readDocumentMutationResponseSchema },
  readDocumentExtraction: { method: "GET", path: "/api/documents/[documentId]/extractions/[extractionId]", request: readDocumentExtractionRequestSchema, response: readDocumentExtractionResponseSchema },
  adoptDocumentExtraction: { method: "POST", path: "/api/documents/[documentId]/adopt-extraction", request: adoptDocumentExtractionRequestSchema, response: saveDocumentReviewDraftResponseSchema },
  readMaterialHistory: { method: "GET", path: "/api/planning/material-history", request: z.object({ goalId: materialIdSchema }).strict(), response: materialHistoryResponseSchema },
  readAdoptedMaterials: { method: "GET", path: "/api/planning/adopted-materials",
    request: adoptedMaterialScopeSchema.extend({ checkDocumentIds: z.array(materialIdSchema).min(1).max(5).refine(ids => new Set(ids).size === ids.length).optional() }).strict(),
    response: z.object({ entries: adoptedMaterialEntriesSchema, detachedDocumentIds: z.array(materialIdSchema).min(1).max(5).optional() }).strict() },
  detachAdoptedMaterial: { method: "POST", path: "/api/planning/adopted-materials/detach",
    request: z.object({ scope: materialGoalScopeSchema, entry: materialSelectionEntrySchema, ...mutationFields }).strict(),
    response: adoptedMaterialScopeSchema.extend({ revision: materialRevisionSchema, documentId: materialIdSchema }).strict() },
  readMaterialGenerationReceipt: { method: "GET", path: "/api/planning/material-generation-receipts", request: materialGenerationReceiptRequestSchema, response: materialGenerationReceiptResponseSchema },
} as const;
export type DocumentEndpoint = keyof typeof documentEndpointContracts;
export type DocumentEndpointRequest<K extends DocumentEndpoint> = z.infer<(typeof documentEndpointContracts)[K]["request"]>;
export type DocumentEndpointResponse<K extends DocumentEndpoint> = z.infer<(typeof documentEndpointContracts)[K]["response"]>;
export const DOCUMENT_API_ERROR_STATUS = Object.freeze({
  "invalid-request": 400, unauthenticated: 401, forbidden: 403, "not-found": 404, conflict: 409, gone: 410,
  "payload-too-large": 413, "invalid-content": 422, "quota-exceeded": 429, unavailable: 503,
} as const);
export const documentApiErrorSchema = z.object({ code: z.enum(Object.keys(DOCUMENT_API_ERROR_STATUS) as [keyof typeof DOCUMENT_API_ERROR_STATUS, ...(keyof typeof DOCUMENT_API_ERROR_STATUS)[]]), status: z.number().int() }).strict()
  .refine((error) => error.status === DOCUMENT_API_ERROR_STATUS[error.code], "Error status must match the public error code");
const mutationIdentitySchema = z.object({ ownerId: materialOwnerIdSchema, endpoint: z.enum(Object.keys(documentEndpointContracts) as [DocumentEndpoint, ...DocumentEndpoint[]]), mutationId: materialIdSchema, bodyDigest: materialDigestSchema }).strict();
export type DocumentMutationIdentity = z.infer<typeof mutationIdentitySchema>;
/** Call after request validation. Canonical payload includes path/query semantics; mutationId is part of the receipt key. */
export async function createDocumentMutationDigest(ownerId: string, endpoint: DocumentEndpoint, validatedPayload: unknown): Promise<string> {
  materialOwnerIdSchema.parse(ownerId);
  if (!Object.hasOwn(documentEndpointContracts, endpoint)) throw new TypeError("Unknown document endpoint");
  const canonicalPayload = JSON.parse(canonicalJson(validatedPayload)) as unknown;
  if (!canonicalPayload || Array.isArray(canonicalPayload) || typeof canonicalPayload !== "object") throw new TypeError("Mutation payload must be an object");
  const { mutationId, ...payload } = canonicalPayload as Record<string, unknown>;
  materialIdSchema.parse(mutationId);
  return materialSha256({ ownerId, endpoint, payload });
}
export function documentMutationReplayDecision(stored: unknown, incoming: unknown, dependenciesActive: boolean): "create" | "replay" | "conflict" | "gone" {
  const candidate = mutationIdentitySchema.safeParse(incoming);
  if (!candidate.success) return "conflict";
  if (!dependenciesActive) return "gone";
  if (stored === null) return "create";
  const previous = mutationIdentitySchema.safeParse(stored);
  return previous.success && canonicalJson(previous.data) === canonicalJson(candidate.data) ? "replay" : "conflict";
}
// This cap is applied to bytes actually consumed by the future streaming HTTP reader, never Content-Length alone.
export function isDocumentRequestBodyWithinLimit(receivedBytes: number): boolean {
  return Number.isSafeInteger(receivedBytes) && receivedBytes >= 0 && receivedBytes <= MAX_DOCUMENT_CREATE_BODY_BYTES;
}
export { emptyRequestSchema };
