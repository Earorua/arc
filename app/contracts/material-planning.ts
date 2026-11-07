import { z } from "zod";
import { calendarDateSchema } from "./intelligence";
import { availabilityVersionSchema, planningGenerateSourceSchema, planningSourceReferenceSchema, planningTargetSchema, skillAuditVersionSchema } from "./planning";
import { generatePlanningRequestSchema, materialPlanningReferenceSchema, planningMutationResponseSchema } from "./planning-api";
export { materialPlanningReferenceSchema } from "./planning-api";
import { canonicalJson } from "../lib/planning/fingerprint";
import {
  DOCUMENT_SCHEMA_VERSION, MAX_MATERIAL_CONTEXT_JSON_BYTES, MAX_MATERIAL_SKILL_LABELS_PER_ITEM, boundedMaterialJson, confirmedMaterialItemSchema,
  materialDigestSchema, materialGoalScopeSchema, materialIdSchema, materialOwnerIdSchema, materialRevisionSchema, materialScopeSchema,
  materialSelectionEntriesSchema, materialSelectionEntrySchema, materialSelectionRefSchema, materialTimestampSchema, materialVersionSchema,
} from "./documents";

export const materialContextDependencySchema = materialSelectionEntrySchema.extend({
  textVersionId: materialIdSchema, generation: materialRevisionSchema, confirmationDigest: materialDigestSchema,
}).strict();
export const materialSkillMappingSchema = z.object({
  confirmationId: materialIdSchema, itemId: materialIdSchema, skillId: materialIdSchema,
}).strict();
export const materialSkillMappingsSchema = z.array(materialSkillMappingSchema).max(500).refine(
  mappings => new Set(mappings.map(mapping => `${mapping.confirmationId}:${mapping.itemId}:${mapping.skillId}`)).size === mappings.length,
  "Duplicate explicit skill mappings",
);
export type MaterialSkillMappingChoice = z.infer<typeof materialSkillMappingSchema>;
const materialItemChoiceSchema = z.object({ confirmationId: materialIdSchema, itemId: materialIdSchema }).strict();
const itemChoiceKey = (item: { confirmationId: string; itemId: string }) => `${item.confirmationId}:${item.itemId}`;
export const materialLearningIntentsSchema = z.array(materialItemChoiceSchema).max(500).refine(
  items => new Set(items.map(itemChoiceKey)).size === items.length, "Duplicate learning intents",
);
export const materialTermMappingSchema = materialItemChoiceSchema.extend({
  skillLabel: z.string().trim().min(1).max(100),
  skillIds: z.array(materialIdSchema).max(64).refine(ids => new Set(ids).size === ids.length, "Duplicate mapped skills"),
}).strict();
export const materialTermMappingsSchema = z.array(materialTermMappingSchema).max(500 * MAX_MATERIAL_SKILL_LABELS_PER_ITEM).refine(
  mappings => new Set(mappings.map(mapping => `${itemChoiceKey(mapping)}:${mapping.skillLabel}`)).size === mappings.length,
  "Duplicate term mappings",
);
export type MaterialTermMappingChoice = z.infer<typeof materialTermMappingSchema>;
export type MaterialLearningIntentChoice = z.infer<typeof materialItemChoiceSchema>;
const materialChoicesShape = {
  skillMappings: materialSkillMappingsSchema.optional(),
  termMappings: materialTermMappingsSchema.optional(),
  learningIntents: materialLearningIntentsSchema.optional(),
};
function validateChoiceMix(value: { skillMappings?: MaterialSkillMappingChoice[]; termMappings?: MaterialTermMappingChoice[] }, ctx: z.RefinementCtx) {
  if (value.termMappings?.some(term => value.skillMappings?.some(item => itemChoiceKey(item) === itemChoiceKey(term)))) {
    ctx.addIssue({ code: "custom", path: ["termMappings"], message: "Cannot mix item and term mappings for one fact" });
  }
}
export const contextInputSnapshotSchema = boundedMaterialJson(z.object({
  schemaVersion: z.literal(DOCUMENT_SCHEMA_VERSION), ownerId: materialOwnerIdSchema,
  selectionRef: materialSelectionRefSchema, scope: materialScopeSchema, sourceReference: planningSourceReferenceSchema,
  dependencies: z.array(materialContextDependencySchema).max(5),
  ...materialChoicesShape,
  sourceVersions: z.object({ blueprintId: materialIdSchema, blueprintVersion: materialVersionSchema, registryId: materialIdSchema, registryVersion: materialVersionSchema, contentDigest: materialDigestSchema }).strict().optional(),
  audit: skillAuditVersionSchema, availability: availabilityVersionSchema, target: planningTargetSchema,
  planningDate: calendarDateSchema.max(10), selectedScope: z.enum(["full-scope", "target-date"]).nullable(),
  policyVersion: materialVersionSchema, mappingVersion: materialVersionSchema, explanationVersion: materialVersionSchema,
}).strict().superRefine((snapshot, ctx) => {
  const selected = materialSelectionEntriesSchema.safeParse(snapshot.dependencies.map(({ slot, documentId, documentVersionId, confirmationId }) => ({ slot, documentId, documentVersionId, confirmationId })));
  if (!selected.success) ctx.addIssue({ code: "custom", path: ["dependencies"], message: "Invalid or duplicate selected versions" });
  for (const field of ["skillMappings", "termMappings", "learningIntents"] as const) {
    if (snapshot[field]?.some(choice => !snapshot.dependencies.some(dependency => dependency.confirmationId === choice.confirmationId))) ctx.addIssue({ code: "custom", path: [field], message: "Choices must use selected confirmations" });
  }
  validateChoiceMix(snapshot, ctx);
  const reference = snapshot.sourceReference;
  const blueprintId = reference.source === "flagship" ? reference.roleId : reference.blueprintId;
  if (snapshot.audit.blueprintId !== blueprintId || (reference.source === "research" && snapshot.audit.blueprintVersion !== reference.blueprintVersion)) ctx.addIssue({ code: "custom", path: ["audit"], message: "Audit must match source blueprint" });
  if (snapshot.scope.kind === "draft" && snapshot.scope.previousGoalId !== null && reference.source !== "research") ctx.addIssue({ code: "custom", path: ["scope"], message: "A new goal requires ready Research" });
}), MAX_MATERIAL_CONTEXT_JSON_BYTES);
export type ContextInputSnapshot = z.infer<typeof contextInputSnapshotSchema>;
export type MaterialPlanningReference = z.infer<typeof materialPlanningReferenceSchema>;

function byString(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
/** Preserve all semantic values; omit only explicitly named metadata, never recursively strip keys. */
export function normalizeContextInputSnapshot(input: unknown) {
  const snapshot = contextInputSnapshotSchema.parse(input);
  const { skillMappings, termMappings, learningIntents, ...semanticSnapshot } = snapshot;
  const { id: auditId, inputFingerprint: auditFingerprint, ...audit } = snapshot.audit;
  const { id: availabilityId, inputFingerprint: availabilityFingerprint, ...availability } = snapshot.availability;
  const { id: targetId, inputFingerprint: targetFingerprint, ...target } = snapshot.target;
  void auditId; void auditFingerprint; void availabilityId; void availabilityFingerprint; void targetId; void targetFingerprint;
  return {
    ...semanticSnapshot,
    ...(skillMappings?.length ? { skillMappings: [...skillMappings].sort((left, right) => byString(`${left.confirmationId}:${left.itemId}:${left.skillId}`, `${right.confirmationId}:${right.itemId}:${right.skillId}`)) } : {}),
    ...(termMappings?.length ? { termMappings: termMappings.map(mapping => ({ ...mapping, skillIds: [...mapping.skillIds].sort(byString) })).sort((left, right) => byString(`${itemChoiceKey(left)}:${left.skillLabel}`, `${itemChoiceKey(right)}:${right.skillLabel}`)) } : {}),
    ...(learningIntents?.length ? { learningIntents: [...learningIntents].sort((left, right) => byString(itemChoiceKey(left), itemChoiceKey(right))) } : {}),
    dependencies: [...snapshot.dependencies].sort((left, right) => byString(`${left.slot}:${left.documentId}`, `${right.slot}:${right.documentId}`)),
    audit: { ...audit, answers: audit.answers.map((answer) => ({ ...answer, evidenceRefs: [...answer.evidenceRefs].sort(byString) })).sort((left, right) => byString(left.skillId, right.skillId)), evidence: [...audit.evidence].sort((left, right) => byString(left.id, right.id)) },
    availability: { ...availability, exceptions: [...availability.exceptions].sort((left, right) => byString(left.date, right.date)) },
    target,
  };
}
export async function materialSha256(value: unknown): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function createMaterialContextFingerprint(input: unknown): Promise<string> { return materialSha256(normalizeContextInputSnapshot(input)); }

export const materialContextPreviewSchema = boundedMaterialJson(z.object({
  overlay: z.object({ skillRanks: z.record(materialIdSchema, z.number().int().min(0).max(5)), mandatorySkillIds: z.array(materialIdSchema).max(64), semanticFingerprint: materialDigestSchema, policyVersion: materialVersionSchema }).strict().optional(),
  planning: z.object({ fullScope: z.object({ estimatedCompletionDate: calendarDateSchema, totalMinutes: z.number().int().nonnegative() }).strict(), targetDate: z.object({ estimatedCompletionDate: calendarDateSchema, totalMinutes: z.number().int().nonnegative() }).strict().nullable(), infeasibleReason: z.string().max(1000).nullable() }).strict().optional(),
  confirmedItems: z.array(confirmedMaterialItemSchema).max(500).refine(items => new Set(items.map(item => item.id)).size === items.length, "Duplicate item IDs"),
  itemReferences: z.array(z.object({ id: materialIdSchema, confirmationId: materialIdSchema, itemId: materialIdSchema, learningIntentEligible: z.boolean().optional() }).strict()).max(500).optional(),
  ...materialChoicesShape,
  // Equivalent results share one row; terms reference retained label indexes, -1 is legacy confirmed text.
  mappingDetails: z.array(z.object({ itemId: materialIdSchema, termIndexes: z.array(z.number().int().min(-1).max(MAX_MATERIAL_SKILL_LABELS_PER_ITEM - 1)).min(1).max(MAX_MATERIAL_SKILL_LABELS_PER_ITEM),
    status: z.enum(["mapped", "ambiguous", "uncovered", "non-learning", "omitted"]), skillIds: z.array(materialIdSchema).max(64), basis: z.enum(["literal", "contextual", "manual"]).nullable(),
  }).strict()).max(500 * MAX_MATERIAL_SKILL_LABELS_PER_ITEM).optional(),
  priorities: z.array(z.object({ skillId: materialIdSchema, tier: z.number().int().min(0).max(5), itemIds: z.array(materialIdSchema).max(500),
    practiceItemIds: z.array(materialIdSchema).max(500).optional(), learningIntentItemIds: z.array(materialIdSchema).max(500).optional(),
  }).strict()).max(64),
  // One individual ambiguity per fact, three shared groups and the target issue.
  issues: z.array(z.object({ code: z.enum(["ambiguous-mapping", "self-assessment-conflict", "uncovered", "source-unavailable", "target-infeasible", "learning-intent-not-adopted", "mapping-omitted"]), itemIds: z.array(materialIdSchema).max(500), skillIds: z.array(materialIdSchema).max(64) }).strict()).max(504),
  uncoveredLabels: z.array(z.string().trim().min(1).max(100)).max(500 * MAX_MATERIAL_SKILL_LABELS_PER_ITEM),
}).strict(), MAX_MATERIAL_CONTEXT_JSON_BYTES);
export const createMaterialContextRequestSchema = boundedMaterialJson(z.object({
  selectionRef: materialSelectionRefSchema, scope: materialScopeSchema, source: planningGenerateSourceSchema,
  ...materialChoicesShape,
  audit: skillAuditVersionSchema, availability: availabilityVersionSchema, target: planningTargetSchema,
  planningDate: calendarDateSchema.max(10), selectedScope: z.enum(["full-scope", "target-date"]).nullable(), mutationId: materialIdSchema,
}).strict().refine((request) => !(request.scope.kind === "draft" && request.scope.previousGoalId !== null && request.source.source !== "research"), "A new goal requires ready Research").superRefine(validateChoiceMix), MAX_MATERIAL_CONTEXT_JSON_BYTES);
export const createMaterialContextResponseSchema = boundedMaterialJson(z.object({ contextVersionId: materialIdSchema, previewToken: materialDigestSchema, preview: materialContextPreviewSchema }).strict(), MAX_MATERIAL_CONTEXT_JSON_BYTES);
export const materialReplanRequestSchema = z.object({
  scope: materialGoalScopeSchema, selectionRef: materialSelectionRefSchema, contextVersionId: materialIdSchema, previewToken: materialDigestSchema, mutationId: materialIdSchema,
}).strict();
export const readMaterialContextRequestSchema = z.object({ contextVersionId: materialIdSchema }).strict();
export const readMaterialContextResponseSchema = boundedMaterialJson(z.object({
  contextVersionId: materialIdSchema, state: z.literal("active"), expiresAt: materialTimestampSchema, preview: materialContextPreviewSchema,
}).strict(), MAX_MATERIAL_CONTEXT_JSON_BYTES);

// New opt-in contract only: existing schemas and no-material requests remain unchanged.
const withMaterialsSchema = z.object({
  mutationId: materialIdSchema, planningDate: calendarDateSchema.max(10), audit: skillAuditVersionSchema,
  availability: availabilityVersionSchema, target: planningTargetSchema, selectedScope: z.enum(["full-scope", "target-date"]).nullable(),
  roleId: z.literal("ai-native-full-stack-engineer").optional(), source: planningGenerateSourceSchema.optional(),
  newGoal: z.object({ previousGoalId: materialIdSchema }).strict().optional(), materials: materialPlanningReferenceSchema,
}).strict().superRefine((request, ctx) => {
  const { materials, ...legacyRequest } = request;
  void materials;
  if (!generatePlanningRequestSchema.safeParse(legacyRequest).success) ctx.addIssue({ code: "custom", message: "Existing generation constraints must remain valid" });
});
export const generatePlanningWithMaterialsRequestSchema = z.union([generatePlanningRequestSchema, withMaterialsSchema]);

export type MaterialReplayOperation = "read-history" | "learning-event" | "regenerate" | "mutation-retry" | "accept-proposal";
/** A pure decision contract. Every flag must come from fresh owner-bound repository checks. */
export function materialContextReplayDecision(input: Readonly<{
  operation: string; ownerMatches: boolean; contextState: string; unexpired: boolean;
  versionsMatch: boolean; selectionMatches: boolean; scopeMatches: boolean; sourceMatches: boolean;
}>): "allow" | "public-only" | "not-found" | "gone" | "conflict" {
  if (!input.ownerMatches) return "not-found";
  if (input.operation === "read-history" || input.operation === "learning-event") return "public-only";
  if (!["regenerate", "mutation-retry", "accept-proposal"].includes(input.operation)) return "conflict";
  if (input.contextState !== "active" || !input.unexpired) return "gone";
  return input.versionsMatch && input.selectionMatches && input.scopeMatches && input.sourceMatches ? "allow" : "conflict";
}

export const materialExplanationSchema = z.object({
  ruleId: z.string().max(100), changeKind: z.enum(["reordered", "protected", "assessment", "uncovered", "unapplied", "unavailable"]),
  skillId: materialIdSchema.nullable(), unitIds: z.array(materialIdSchema).max(2048), reasonItemIds: z.array(materialIdSchema).max(500),
  message: z.string().max(1000), sourceAvailability: z.enum(["available", "unavailable"]),
}).strict();
export const materialHistoryResponseSchema = boundedMaterialJson(z.object({ plans: z.array(z.object({
  planVersionId: materialIdSchema, contextVersionId: materialIdSchema, kind: z.enum(["generation", "proposal", "accepted"]),
  proposalState: z.enum(["pending", "discarded", "revoked", "unknown"]).optional(),
  sourceAvailability: z.enum(["available", "unavailable"]), explanations: z.array(materialExplanationSchema).max(700),
}).strict()).max(200) }).strict(), MAX_MATERIAL_CONTEXT_JSON_BYTES);
export const materialReplanResponseSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("proposed"), planning: planningMutationResponseSchema, unappliedChanges: z.array(z.string().max(1000)).max(10) }).strict(),
  z.object({ outcome: z.literal("no-change"), message: z.string().max(1000), unappliedChanges: z.array(z.string().max(1000)).max(10) }).strict(),
]);
export type MaterialReplanResponse = z.infer<typeof materialReplanResponseSchema>;
export type MaterialHistoryResponse = z.infer<typeof materialHistoryResponseSchema>;
