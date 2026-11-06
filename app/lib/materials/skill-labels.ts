import { GROUNDED_MATERIAL_REVIEW_PROJECTION, type ConfirmedMaterialItem, type DocumentReviewDraft } from "../../contracts/documents";
import { findMaterialSkillEvidence, groundMaterialSkillTerms } from "./grounded-skill-terms";

export function normalizeMaterialSkillLabel(label: string) {
  return label.normalize("NFKC").toLowerCase();
}

/** Allow an English skill word next to Chinese text, but not inside another English word. */
export function containsMaterialSkillLabel(text: string, label: string) {
  const normalized = normalizeMaterialSkillLabel(text), token = normalizeMaterialSkillLabel(label);
  let offset = normalized.indexOf(token);
  while (offset >= 0) {
    const before = normalized[offset - 1] ?? "", after = normalized[offset + token.length] ?? "";
    if (!/^[a-z0-9_]/u.test(token) || (!/[a-z0-9_]/u.test(before) && !/[a-z0-9_]/u.test(after))) return true;
    offset = normalized.indexOf(token, offset + 1);
  }
  return false;
}

/** Old reviews retain their literal edit rule. V2 accepts only a grounded source term or its reviewed equivalent. */
export function supportsReviewedSkillLabel(text: string, label: string, projection: DocumentReviewDraft["reviewProjection"]) {
  return projection === GROUNDED_MATERIAL_REVIEW_PROJECTION
    ? findMaterialSkillEvidence(text, label) !== null
    : containsMaterialSkillLabel(text, label);
}

export function labelForAddedSourceTerm(quote: string, fact: string, sourceTerm: string): string | null {
  const [label] = groundMaterialSkillTerms(quote, [sourceTerm]);
  return label && findMaterialSkillEvidence(fact, label) !== null ? label : null;
}

export function retainedMaterialSelfAssessmentHints(items: readonly ConfirmedMaterialItem[], hints: DocumentReviewDraft["selfAssessmentHints"]) {
  return hints.filter(hint => {
    const item = items.find(item => item.id === hint.candidateId);
    if (!item || (item.kind !== "skill-claim" && item.kind !== "experience")) return false;
    return item.skillLabels ? item.skillLabels.includes(hint.skillLabel) : item.origin === "extracted" || containsMaterialSkillLabel(item.text, hint.skillLabel);
  });
}
