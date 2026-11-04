import { z } from "zod";
import { skillSelfLevelSchema } from "./planning";

export const DOCUMENT_SCHEMA_VERSION = "2026.11.1" as const;
export const MAX_DOCUMENT_TEXT_CODE_POINTS = 50_000;
export const MAX_DOCUMENT_TEXT_UTF8_BYTES = 256 * 1024;
export const MAX_DOCUMENT_ITEMS_JSON_BYTES = 128 * 1024;
export const MAX_MATERIAL_CONTEXT_JSON_BYTES = 256 * 1024;
export const materialIdSchema = z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
// Session owner IDs are opaque. Better Auth generates mixed-case IDs.
export const materialOwnerIdSchema = z.string().max(256).regex(/^[A-Za-z0-9_-]+$/u);
export const materialRevisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1);
export const materialVersionSchema = z.string().max(32).regex(/^\d{4}\.\d{2}\.\d+$/u);
export const materialTimestampSchema = z.string().max(64).datetime({ offset: true });
export const materialDigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
export const documentKindSchema = z.enum(["resume", "jd", "supplement"]);
export const documentLifecycleSchema = z.enum(["active", "revoked", "cleanup-pending", "deleted"]);
export const materialItemKindSchema = z.enum(["experience", "skill-claim", "requirement", "constraint"]);
export const materialRequirementLevelSchema = z.enum(["must", "preferred", "unspecified"]);
export const materialSelfLevelHintSchema = z.enum(["conceptual", "guided", "uncertain"]);
const shortTextSchema = z.string().trim().min(1).max(1000);

export function utf8Bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }
export function countUnicodeCodePoints(value: string): number { return Array.from(value).length; }
export function normalizeDocumentText(value: string): string { return value.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n"); }
export function fitsJsonBytes(value: unknown, maximum: number): boolean {
  try { return utf8Bytes(JSON.stringify(value)) <= maximum; } catch { return false; }
}
export function boundedMaterialJson<T extends z.ZodType>(schema: T, maximum: number = MAX_DOCUMENT_ITEMS_JSON_BYTES) {
  return schema.refine((value) => fitsJsonBytes(value, maximum), "Serialized material exceeds byte limit");
}
function uniqueIds(items: readonly { id: string }[]): boolean { return new Set(items.map(({ id }) => id)).size === items.length; }
export const documentTextSchema = z.string().min(1).max(MAX_DOCUMENT_TEXT_CODE_POINTS * 2)
  .refine((text) => countUnicodeCodePoints(text) <= MAX_DOCUMENT_TEXT_CODE_POINTS, "Text exceeds Unicode code-point limit")
  .refine((text) => utf8Bytes(text) <= MAX_DOCUMENT_TEXT_UTF8_BYTES, "Text exceeds UTF-8 byte limit");

export const materialSourceRefSchema = z.object({
  documentId: materialIdSchema, documentVersionId: materialIdSchema, textVersionId: materialIdSchema,
  start: z.number().int().min(0).max(100_000), end: z.number().int().min(1).max(100_000),
}).strict().refine((value) => value.end > value.start, "Source range must be nonempty");

export const MATERIAL_HIGH_IMPACT_REVIEW_CODES = [
  "prompt-injection", "team-attribution", "conflicting-self-assessment", "conflicting-requirement",
  "uncovered-skill", "untrusted-resource-url",
] as const;
export const documentReviewPointCodeSchema = z.enum([
  "confirm-self-assessment", "prompt-injection", "team-attribution", "conflicting-self-assessment",
  "missing-information", "uncovered-skill", "untrusted-resource-url", "conflicting-requirement",
]);
export const documentCandidateReviewPointSchema = z.object({
  code: documentReviewPointCodeSchema,
  source: z.object({ segmentId: materialIdSchema, quote: z.string().min(1).max(1000) }).strict(),
}).strict();
export const documentCandidateReviewPointsSchema = boundedMaterialJson(z.array(documentCandidateReviewPointSchema).max(100)
  .refine(points => new Set(points.map(point => JSON.stringify([point.code, point.source.segmentId, point.source.quote]))).size === points.length, "Duplicate review points"));
export const materialReviewPointSchema = z.object({
  id: materialIdSchema, code: documentReviewPointCodeSchema, sourceRef: materialSourceRefSchema,
  resolution: z.enum(["unresolved", "confirmed", "ignored"]),
}).strict();
export const materialReviewPointsSchema = boundedMaterialJson(z.array(materialReviewPointSchema).max(100).refine(uniqueIds, "Duplicate review point IDs"));
export type MaterialReviewPoint = z.infer<typeof materialReviewPointSchema>;
export type DocumentCandidateReviewPoint = z.infer<typeof documentCandidateReviewPointSchema>;

export const confirmedMaterialItemSchema = z.object({
  id: materialIdSchema, kind: materialItemKindSchema, text: shortTextSchema,
  origin: z.enum(["extracted", "user"]), sourceRef: materialSourceRefSchema.nullable(),
  requirementLevel: materialRequirementLevelSchema.nullable(),
}).strict().superRefine((item, ctx) => {
  if (item.origin === "extracted" && item.sourceRef === null) ctx.addIssue({ code: "custom", message: "Extracted items require a source" });
  if (item.kind !== "requirement" && item.requirementLevel !== null) ctx.addIssue({ code: "custom", message: "Only requirements have a requirement level" });
});
export const documentCandidateSourceSchema = z.object({ segmentId: materialIdSchema, quote: z.string().min(1).max(1000) }).strict();
export const documentCandidateSchema = z.object({
  id: materialIdSchema, kind: materialItemKindSchema, text: shortTextSchema,
  requirementLevel: materialRequirementLevelSchema.nullable(),
  skillLabels: z.array(z.string().trim().min(1).max(100)).max(8).refine((labels) => new Set(labels).size === labels.length, "Duplicate skill labels"),
  selfLevelHint: materialSelfLevelHintSchema.nullable(), source: documentCandidateSourceSchema,
}).strict().superRefine((item, ctx) => {
  if (item.kind !== "requirement" && item.requirementLevel !== null) ctx.addIssue({ code: "custom", message: "Only requirements have a requirement level" });
  if (!["experience", "skill-claim"].includes(item.kind) && item.selfLevelHint !== null) ctx.addIssue({ code: "custom", message: "Only experience or skill claims have self-level hints" });
});
export const documentCandidatesSchema = boundedMaterialJson(z.array(documentCandidateSchema).max(100).refine(uniqueIds, "Duplicate candidate IDs"));
export const confirmedMaterialItemsSchema = boundedMaterialJson(z.array(confirmedMaterialItemSchema).max(100).refine(uniqueIds, "Duplicate item IDs"));
export const materialSelfAssessmentHintSchema = z.object({
  id: materialIdSchema, candidateId: materialIdSchema, skillLabel: z.string().trim().min(1).max(100), level: materialSelfLevelHintSchema,
}).strict();
export const materialSelfAssessmentHintsSchema = z.array(materialSelfAssessmentHintSchema).max(100).refine(uniqueIds, "Duplicate hint IDs");
export const materialSelfAssessmentAdoptionSchema = boundedMaterialJson(z.object({
  mode: z.enum(["single", "batch"]),
  decisions: z.array(z.object({
    skillId: materialIdSchema, level: skillSelfLevelSchema,
    sourceItemIds: z.array(materialIdSchema).max(100).refine((ids) => new Set(ids).size === ids.length, "Duplicate source items"),
  }).strict()).min(1).max(64),
}).strict().superRefine((adoption, ctx) => {
  if (new Set(adoption.decisions.map(({ skillId }) => skillId)).size !== adoption.decisions.length) ctx.addIssue({ code: "custom", message: "Duplicate skill decisions" });
  if (adoption.mode === "single" && adoption.decisions.length !== 1) ctx.addIssue({ code: "custom", message: "Single adoption requires one skill" });
  if (adoption.mode === "batch" && adoption.decisions.some(({ level }) => level === "independent")) ctx.addIssue({ code: "custom", message: "Independent requires individual selection" });
}));

export const materialSelectionEntrySchema = z.object({
  slot: documentKindSchema, documentId: materialIdSchema, documentVersionId: materialIdSchema, confirmationId: materialIdSchema,
}).strict();
function validateSelectionSlots(entries: { slot: string; documentId: string }[], ctx: z.RefinementCtx) {
  if (new Set(entries.map(({ documentId }) => documentId)).size !== entries.length) ctx.addIssue({ code: "custom", message: "A document may be selected once" });
  for (const [slot, maximum] of [["resume", 1], ["jd", 1], ["supplement", 3]] as const) {
    if (entries.filter((entry) => entry.slot === slot).length > maximum) ctx.addIssue({ code: "custom", message: `Too many ${slot} selections` });
  }
}
export const materialSelectionEntriesSchema = z.array(materialSelectionEntrySchema).max(5).superRefine(validateSelectionSlots);
export const adoptedMaterialEntriesSchema = z.array(materialSelectionEntrySchema.extend({
  textVersionId: materialIdSchema, revision: materialRevisionSchema,
})).max(5).superRefine(validateSelectionSlots);
export const materialSelectionRefSchema = z.object({ selectionId: materialIdSchema, selectionRevision: materialRevisionSchema }).strict();
export const materialDraftScopeSchema = z.object({ kind: z.literal("draft"), draftId: materialIdSchema, previousGoalId: materialIdSchema.nullable() }).strict();
export const materialGoalScopeSchema = z.object({ kind: z.literal("goal"), goalId: materialIdSchema, workspaceId: materialIdSchema, baseVersionId: materialIdSchema, revision: materialRevisionSchema }).strict();
export const adoptedMaterialScopeSchema = materialGoalScopeSchema.pick({ goalId: true, workspaceId: true, baseVersionId: true });
export const materialScopeSchema = z.discriminatedUnion("kind", [materialDraftScopeSchema, materialGoalScopeSchema]);
export const documentSchema = z.object({
  id: materialIdSchema, schemaVersion: z.literal(DOCUMENT_SCHEMA_VERSION), kind: documentKindSchema,
  displayName: z.string().trim().min(1).max(200), revision: materialRevisionSchema, generation: materialRevisionSchema,
  lifecycle: documentLifecycleSchema, currentDocumentVersionId: materialIdSchema, createdAt: materialTimestampSchema, updatedAt: materialTimestampSchema,
}).strict();
export const documentVersionSchema = z.object({
  id: materialIdSchema, documentId: materialIdSchema, textVersionId: materialIdSchema,
  schemaVersion: z.literal(DOCUMENT_SCHEMA_VERSION), revision: materialRevisionSchema,
  state: z.enum(["pending", "ready", "revoked", "cleanup-pending"]), parserVersion: materialVersionSchema,
  textDigest: materialDigestSchema, codePoints: z.number().int().min(1).max(MAX_DOCUMENT_TEXT_CODE_POINTS),
  utf8Bytes: z.number().int().min(1).max(MAX_DOCUMENT_TEXT_UTF8_BYTES), createdAt: materialTimestampSchema,
}).strict();
export const documentReviewDraftSchema = boundedMaterialJson(z.object({
  id: materialIdSchema, schemaVersion: z.literal(DOCUMENT_SCHEMA_VERSION), documentId: materialIdSchema,
  documentVersionId: materialIdSchema, textVersionId: materialIdSchema, extractionId: materialIdSchema.nullable(),
  origin: z.enum(["ai", "manual", "mixed"]), items: confirmedMaterialItemsSchema, selfAssessmentHints: materialSelfAssessmentHintsSchema,
  reviewPoints: materialReviewPointsSchema.optional(),
  revision: materialRevisionSchema, updatedAt: materialTimestampSchema,
}).strict().superRefine((draft, ctx) => {
  for (const item of draft.items) if (item.sourceRef && (item.sourceRef.documentId !== draft.documentId || item.sourceRef.documentVersionId !== draft.documentVersionId || item.sourceRef.textVersionId !== draft.textVersionId)) ctx.addIssue({ code: "custom", message: "Review sources must match the draft version" });
  for (const point of draft.reviewPoints ?? []) if (point.sourceRef.documentId !== draft.documentId || point.sourceRef.documentVersionId !== draft.documentVersionId || point.sourceRef.textVersionId !== draft.textVersionId) ctx.addIssue({ code: "custom", message: "Review point sources must match the draft version" });
  if (draft.origin !== "manual" && draft.extractionId === null) ctx.addIssue({ code: "custom", message: "AI and mixed drafts require extraction provenance" });
}));
export const documentConfirmationSchema = boundedMaterialJson(z.object({
  id: materialIdSchema, schemaVersion: z.literal(DOCUMENT_SCHEMA_VERSION), documentId: materialIdSchema,
  documentVersionId: materialIdSchema, textVersionId: materialIdSchema, reviewRevision: materialRevisionSchema,
  revision: materialRevisionSchema, origin: z.enum(["ai", "manual", "mixed"]), state: z.enum(["active", "revoked"]),
  items: confirmedMaterialItemsSchema, reviewPoints: materialReviewPointsSchema.optional(), createdAt: materialTimestampSchema,
}).strict().superRefine((confirmation, ctx) => {
  for (const point of confirmation.reviewPoints ?? []) if (point.sourceRef.documentId !== confirmation.documentId || point.sourceRef.documentVersionId !== confirmation.documentVersionId || point.sourceRef.textVersionId !== confirmation.textVersionId) ctx.addIssue({ code: "custom", message: "Review point sources must match the confirmation version" });
  for (const item of confirmation.items) if (item.sourceRef && (item.sourceRef.documentId !== confirmation.documentId || item.sourceRef.documentVersionId !== confirmation.documentVersionId || item.sourceRef.textVersionId !== confirmation.textVersionId)) ctx.addIssue({ code: "custom", message: "Confirmation sources must match the confirmation version" });
}));
export const materialSelectionSchema = z.object({
  selectionId: materialIdSchema, schemaVersion: z.literal(DOCUMENT_SCHEMA_VERSION), selectionRevision: materialRevisionSchema,
  scope: materialScopeSchema, entries: materialSelectionEntriesSchema, state: z.enum(["active", "bound", "revoked"]), boundGoalId: materialIdSchema.nullable(),
}).strict().refine((selection) => selection.state !== "bound" || selection.boundGoalId !== null, "Bound selections require a goal");

export type MaterialSourceRef = z.infer<typeof materialSourceRefSchema>;
export type DocumentCandidate = z.infer<typeof documentCandidateSchema>;
export type ConfirmedMaterialItem = z.infer<typeof confirmedMaterialItemSchema>;
export type Document = z.infer<typeof documentSchema>;
export type DocumentVersion = z.infer<typeof documentVersionSchema>;
export type DocumentReviewDraft = z.infer<typeof documentReviewDraftSchema>;
export type DocumentConfirmation = z.infer<typeof documentConfirmationSchema>;
export type MaterialSelection = z.infer<typeof materialSelectionSchema>;
export type MaterialSelectionEntry = z.infer<typeof materialSelectionEntrySchema>;
export type MaterialSelectionRef = z.infer<typeof materialSelectionRefSchema>;
export type MaterialScope = z.infer<typeof materialScopeSchema>;

/** Trusted repository records, never caller assertions or public DTOs. */
export type MaterialReferenceContext = Readonly<{
  ownerId: string; documentId: string; documentVersionId: string; textVersionId: string; lifecycle: string; text: string;
  segments: readonly Readonly<{ id: string; start: number; end: number }>[];
}>;
function validBoundary(text: string, offset: number): boolean {
  return Number.isInteger(offset) && offset >= 0 && offset <= text.length
    && !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/u.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/u.test(text[offset]!));
}
export function validateMaterialSourceRef(ref: unknown, ownerId: string, context: MaterialReferenceContext): boolean {
  const parsed = materialSourceRefSchema.safeParse(ref);
  return parsed.success && context.ownerId === ownerId && context.lifecycle === "active"
    && parsed.data.documentId === context.documentId && parsed.data.documentVersionId === context.documentVersionId
    && parsed.data.textVersionId === context.textVersionId && validBoundary(context.text, parsed.data.start) && validBoundary(context.text, parsed.data.end);
}
export function resolveCandidateSourceRef(source: unknown, ownerId: string, context: MaterialReferenceContext): MaterialSourceRef | null {
  const parsed = documentCandidateSourceSchema.safeParse(source);
  if (!parsed.success || ownerId !== context.ownerId || context.lifecycle !== "active") return null;
  const matching = context.segments.filter(({ id }) => id === parsed.data.segmentId);
  if (matching.length !== 1) return null;
  const segment = matching[0]!;
  if (!validBoundary(context.text, segment.start) || !validBoundary(context.text, segment.end) || segment.end <= segment.start) return null;
  const content = context.text.slice(segment.start, segment.end);
  const index = content.indexOf(parsed.data.quote);
  if (index < 0 || content.indexOf(parsed.data.quote, index + 1) !== -1) return null;
  const ref = { documentId: context.documentId, documentVersionId: context.documentVersionId, textVersionId: context.textVersionId, start: segment.start + index, end: segment.start + index + parsed.data.quote.length };
  return validateMaterialSourceRef(ref, ownerId, context) ? ref : null;
}
export function validateMaterialSelectionEntry(entry: unknown, ownerId: string, context: MaterialReferenceContext & Readonly<{
  confirmationId: string; confirmationDocumentVersionId: string; confirmationTextVersionId: string; confirmationState: string;
}>): boolean {
  const parsed = materialSelectionEntrySchema.safeParse(entry);
  return parsed.success && ownerId === context.ownerId && context.lifecycle === "active" && context.confirmationState === "active"
    && parsed.data.documentId === context.documentId && parsed.data.documentVersionId === context.documentVersionId
    && parsed.data.confirmationId === context.confirmationId && context.confirmationDocumentVersionId === context.documentVersionId
    && context.confirmationTextVersionId === context.textVersionId;
}
export function reviewDraftWriteDecision(current: unknown, request: Readonly<{ textVersionId: string; extractionId: string | null; expectedRevision: number }>): { kind: "write"; nextRevision: number } | { kind: "conflict" } {
  const parsed = documentReviewDraftSchema.safeParse(current);
  if (!parsed.success || parsed.data.revision !== request.expectedRevision || parsed.data.textVersionId !== request.textVersionId || parsed.data.extractionId !== request.extractionId) return { kind: "conflict" };
  return { kind: "write", nextRevision: parsed.data.revision + 1 };
}
export function lateExtractionDecision(input: Readonly<{ current: unknown; textVersionId: string; ownerMatches: boolean; generationMatches: boolean; consentValid: boolean; materialActive: boolean }>): "initialize" | "candidates-available" | "reject" {
  if (!input.ownerMatches || !input.generationMatches || !input.consentValid || !input.materialActive) return "reject";
  if (input.current === null) return "initialize";
  const draft = documentReviewDraftSchema.safeParse(input.current);
  if (!draft.success || draft.data.textVersionId !== input.textVersionId) return "reject";
  return draft.data.revision === 0 && draft.data.items.length === 0 && draft.data.selfAssessmentHints.length === 0 && draft.data.extractionId === null ? "initialize" : "candidates-available";
}
