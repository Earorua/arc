import { z } from "zod";
import { calendarDateSchema } from "./intelligence";
import { availabilityVersionSchema, planningGenerateSourceSchema, planningSourceReferenceSchema, planningTargetSchema, skillAuditVersionSchema } from "./planning";
import { generatePlanningRequestSchema } from "./planning-api";
import { canonicalJson } from "../lib/planning/fingerprint";
import {
  DOCUMENT_SCHEMA_VERSION, MAX_MATERIAL_CONTEXT_JSON_BYTES, boundedMaterialJson, confirmedMaterialItemsSchema,
  materialDigestSchema, materialGoalScopeSchema, materialIdSchema, materialRevisionSchema, materialScopeSchema,
  materialSelectionEntriesSchema, materialSelectionEntrySchema, materialSelectionRefSchema, materialTimestampSchema, materialVersionSchema,
} from "./documents";

export const materialPlanningReferenceSchema = z.object({
  contextVersionId: materialIdSchema, selectionRef: materialSelectionRefSchema, previewToken: materialDigestSchema,
}).strict();
export const materialContextDependencySchema = materialSelectionEntrySchema.extend({
  textVersionId: materialIdSchema, generation: materialRevisionSchema, confirmationDigest: materialDigestSchema,
}).strict();
export const contextInputSnapshotSchema = boundedMaterialJson(z.object({
  schemaVersion: z.literal(DOCUMENT_SCHEMA_VERSION), ownerId: materialIdSchema,
  selectionRef: materialSelectionRefSchema, scope: materialScopeSchema, sourceReference: planningSourceReferenceSchema,
  dependencies: z.array(materialContextDependencySchema).max(5),
  audit: skillAuditVersionSchema, availability: availabilityVersionSchema, target: planningTargetSchema,
  planningDate: calendarDateSchema.max(10), selectedScope: z.enum(["full-scope", "target-date"]).nullable(),
  policyVersion: materialVersionSchema, mappingVersion: materialVersionSchema, explanationVersion: materialVersionSchema,
}).strict().superRefine((snapshot, ctx) => {
  const selected = materialSelectionEntriesSchema.safeParse(snapshot.dependencies.map(({ slot, documentId, documentVersionId, confirmationId }) => ({ slot, documentId, documentVersionId, confirmationId })));
  if (!selected.success) ctx.addIssue({ code: "custom", path: ["dependencies"], message: "Invalid or duplicate selected versions" });
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
  const { id: auditId, inputFingerprint: auditFingerprint, ...audit } = snapshot.audit;
  const { id: availabilityId, inputFingerprint: availabilityFingerprint, ...availability } = snapshot.availability;
  const { id: targetId, inputFingerprint: targetFingerprint, ...target } = snapshot.target;
  void auditId; void auditFingerprint; void availabilityId; void availabilityFingerprint; void targetId; void targetFingerprint;
  return {
    ...snapshot,
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
  confirmedItems: confirmedMaterialItemsSchema,
  priorities: z.array(z.object({ skillId: materialIdSchema, tier: z.number().int().min(0).max(5), itemIds: z.array(materialIdSchema).max(100) }).strict()).max(64),
  issues: z.array(z.object({ code: z.enum(["ambiguous-mapping", "self-assessment-conflict", "uncovered", "source-unavailable", "target-infeasible"]), itemIds: z.array(materialIdSchema).max(100), skillIds: z.array(materialIdSchema).max(64) }).strict()).max(100),
  uncoveredLabels: z.array(z.string().trim().min(1).max(100)).max(100),
}).strict(), MAX_MATERIAL_CONTEXT_JSON_BYTES);
export const createMaterialContextRequestSchema = boundedMaterialJson(z.object({
  selectionRef: materialSelectionRefSchema, scope: materialScopeSchema, source: planningGenerateSourceSchema,
  audit: skillAuditVersionSchema, availability: availabilityVersionSchema, target: planningTargetSchema,
  planningDate: calendarDateSchema.max(10), selectedScope: z.enum(["full-scope", "target-date"]).nullable(), mutationId: materialIdSchema,
}).strict().refine((request) => !(request.scope.kind === "draft" && request.scope.previousGoalId !== null && request.source.source !== "research"), "A new goal requires ready Research"), MAX_MATERIAL_CONTEXT_JSON_BYTES);
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
