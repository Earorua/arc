import { documentExtractionSchema, GROUNDED_MATERIAL_REVIEW_PROJECTION, type DocumentCandidate, type MaterialReferenceContext } from "../../app/contracts/documents";
import { supportsMaterialSelfLevelHint, supportsSelfLevelHintInScope, hasPersonalCapabilityQuestion } from "../../app/lib/materials/self-assessment-evidence";
import { guidedSkillScope, assessmentScopes } from "../../app/lib/materials/personal-assertion-scopes";
import { maskQuotes } from "../../app/lib/materials/quotation-evidence";
import { retainedMaterialSelfAssessmentHints } from "../../app/lib/materials/skill-labels";
import { supportsMaterialExperience } from "../../app/lib/materials/experience-evidence";
import { validateDocumentExtraction, serializeDocumentExtraction, validateStoredDocumentExtraction } from "../../app/server/documents/extraction-validator";
import { KIMI_GROUNDED_TERMS_POLICY_ID } from "../../app/server/documents/policy";
import { groundSourceSelfLevelHint, groundSourceReviewPoints } from "../../worker/document-executor/source-review-evidence";
import { readSourceSpanExtraction } from "../../worker/document-executor/source-span-extraction";

export const guidedCleaningPositive = [
  ["natural", "我在指导下清洗数据。", "清洗数据"],
  ["aspect", "我在指导下清洗了数据。", "清洗了数据"],
  ["fronted", "在导师指导下，我清洗数据。", "清洗数据"],
  ["short guidance", "我按指导清洗数据。", "清洗数据"],
  ["qualified object", "我在指导下对原始数据进行清洗。", "对原始数据进行清洗"],
] as const;
export const guidedCleaningNegative = [
  ["denial", "我在指导下没有清洗数据。", "清洗数据"],
  ["future", "我在指导下计划清洗数据。", "清洗数据"],
  ["other actor", "同事在指导下清洗数据。", "清洗数据"],
  ["fronted other actor", "在导师指导下，我的同事清洗数据。", "清洗数据"],
  ["report", "我报告说，我在指导下清洗数据。", "清洗数据"],
  ["quotation", "示例：“我在指导下清洗数据。”", "清洗数据"],
  ["condition", "如果我在指导下清洗数据，我会记录过程。", "清洗数据"],
  ["nominal topic", "我在指导下数据清洗。", "数据清洗"],
  ["unexecuted plan", "我在指导下清洗数据的计划尚未执行。", "清洗数据"],
] as const;
export const guidedCleaningHint = { id: "hint-candidate-1-0", candidateId: "candidate-1", skillLabel: "data cleaning", level: "guided" as const };

export function cleaningReference(text: string): MaterialReferenceContext {
  return { ownerId: "owner", lifecycle: "active", documentId: "doc-cleaning", documentVersionId: "version-cleaning", textVersionId: "text-cleaning",
    text, segments: [{ id: "segment-1", start: 0, end: text.length }] };
}
export function cleaningCandidate(text: string, options: { quote?: string; labels?: string[]; level?: DocumentCandidate["selfLevelHint"]; kind?: DocumentCandidate["kind"] } = {}) {
  const kind = options.kind ?? "experience", source = { segmentId: "segment-1", quote: options.quote ?? text };
  const item: DocumentCandidate = { id: "candidate-1", kind, text: source.quote, source, skillLabels: options.labels ?? ["data cleaning"],
    requirementLevel: kind === "requirement" ? "unspecified" : null, selfLevelHint: options.level === undefined ? "guided" : options.level };
  return { schemaVersion: "2026.11.1" as const, items: [item], reviewPoints: [] };
}
export function decodeCleaning(text: string, terms: string[], options: Parameters<typeof cleaningCandidate>[1] = {}, format: "source-spans-v1" | "source-spans-v2" | "source-spans-v3" = "source-spans-v3") {
  const item = cleaningCandidate(text, options).items[0]!;
  const wire = { format, items: [{ kind: item.kind, source: item.source, requirementLevel: item.requirementLevel, selfLevelHint: item.selfLevelHint,
    ...(format === "source-spans-v1" ? { skillLabels: terms } : { skillTerms: terms }) }], reviewPoints: [] };
  return readSourceSpanExtraction({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(wire) } }] }, cleaningReference(text), undefined, format);
}
export function parsedCleaning(text: string, terms: string[], options: Parameters<typeof cleaningCandidate>[1] = {}) {
  const decoded = decodeCleaning(text, terms, options);
  if (decoded.extractionRead !== "parsed") throw new Error(`Unexpected cleaning decode: ${decoded.extractionRead}`);
  return documentExtractionSchema.parse(decoded.candidate);
}

/** Replayed against the pre-change fixture: omitted mode and historical contracts stay unchanged. */
export function legacyCleaningObservations() {
  const rows = [guidedCleaningPositive[0], ["explicit practice", "我在指导下练习清洗数据。", "清洗数据"],
    guidedCleaningNegative[0], guidedCleaningNegative[2], guidedCleaningNegative[5], guidedCleaningNegative[8],
    ["mixed same label", "我在指导下清洗数据，但我独立清洗数据。", "清洗数据"]] as const;
  return rows.map(([id, text, term]) => {
    const reference = cleaningReference(text), masked = maskQuotes(text), candidate = cleaningCandidate(text), item = candidate.items[0]!;
    const edited = { id: item.id, kind: item.kind, text, origin: "user" as const, sourceRef: null, requirementLevel: item.requirementLevel, skillLabels: item.skillLabels };
    return { id, text, term,
      defaultHint: supportsMaterialSelfLevelHint({ kind: item.kind, text, labels: item.skillLabels, level: "guided" }),
      scopeHint: supportsSelfLevelHintInScope(text, masked, "guided", item.skillLabels),
      question: hasPersonalCapabilityQuestion(text, masked, true),
      scopes: assessmentScopes(text, masked).map(scope => guidedSkillScope(scope.raw, scope.text)),
      groundHint: groundSourceSelfLevelHint(item), groundPoints: groundSourceReviewPoints([], [item], reference),
      experience: supportsMaterialExperience({ kind: "experience", text, target: { kind: "terms", terms: ["data cleaning"] } }),
      edited: [undefined, GROUNDED_MATERIAL_REVIEW_PROJECTION].map(projection => retainedMaterialSelfAssessmentHints([edited], [guidedCleaningHint], projection)),
      v1: decodeCleaning(text, [term], {}, "source-spans-v1"), v2: decodeCleaning(text, [term], {}, "source-spans-v2"),
      legacy: validateStoredDocumentExtraction(JSON.stringify(candidate), "owner", reference),
      literal: validateStoredDocumentExtraction(serializeDocumentExtraction(candidate), "owner", reference),
      v2Site: validateDocumentExtraction(candidate, "owner", reference, KIMI_GROUNDED_TERMS_POLICY_ID),
      v2Stored: validateStoredDocumentExtraction(serializeDocumentExtraction(candidate, KIMI_GROUNDED_TERMS_POLICY_ID), "owner", reference),
    };
  });
}
