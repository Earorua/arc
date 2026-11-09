import { SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION, isSourceLinkedMaterialReviewProjection, type ConfirmedMaterialItem, type DocumentReviewDraft } from "../../contracts/documents";
import { findMaterialSkillEvidence, findMaterialSkillMention, groundMaterialSkillMentions, groundMaterialSkillTerms } from "./grounded-skill-terms";
import { supportsMaterialSelfLevelHint } from "./self-assessment-evidence";
import { sourceMentionStatementBoundaries } from "../../../worker/document-executor/source-review-evidence";

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

/** Recover a source term using the review's versioned grounding rules. */
export function findReviewedSourceTerm(text: string, label: string, projection: DocumentReviewDraft["reviewProjection"]): string | null {
  return projection === SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION
    ? findMaterialSkillMention(text, label)
    : findMaterialSkillEvidence(text, label);
}

/** Old reviews retain their literal edit rule; source-linked reviews use their versioned locator. */
export function supportsReviewedSkillLabel(text: string, label: string, projection: DocumentReviewDraft["reviewProjection"]) {
  return isSourceLinkedMaterialReviewProjection(projection)
    ? findReviewedSourceTerm(text, label, projection) !== null
    : containsMaterialSkillLabel(text, label);
}

export function labelForAddedSourceTerm(quote: string, fact: string, sourceTerm: string, projection?: DocumentReviewDraft["reviewProjection"]): string | null {
  const [label] = projection === SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION
    ? groundMaterialSkillMentions(quote, [sourceTerm])
    : groundMaterialSkillTerms(quote, [sourceTerm]);
  return label && findReviewedSourceTerm(fact, label, projection) !== null ? label : null;
}

function sourceMentionAssessmentText(text: string) {
  const start = text.length - text.trimStart().length, end = text.trimEnd().length;
  const prefix = /^[\d０-９]{1,3}\.[^\S\r\n]+/u.exec(text.slice(start, end));
  if (!prefix) return text;
  const bodyStart = start + prefix[0].length, bounds = sourceMentionStatementBoundaries(text);
  // Prepare only a complete numeric-dot entry's proven body. Keep attribution,
  // multiple statements and every stored fact/source field unchanged.
  return bounds.get(start) === end && bounds.get(bodyStart) === end ? text.slice(bodyStart, end) : text;
}

export function retainedMaterialSelfAssessmentHints(items: readonly ConfirmedMaterialItem[], hints: DocumentReviewDraft["selfAssessmentHints"], projection?: DocumentReviewDraft["reviewProjection"]) {
  return hints.filter(hint => {
    const item = items.find(item => item.id === hint.candidateId);
    if (!item || (item.kind !== "skill-claim" && item.kind !== "experience")) return false;
    const retainedLabel = item.skillLabels ? item.skillLabels.includes(hint.skillLabel) : item.origin === "extracted" || containsMaterialSkillLabel(item.text, hint.skillLabel);
    if (!retainedLabel) return false;
    const needsEvidence = isSourceLinkedMaterialReviewProjection(projection) || item.origin === "user";
    const text = projection === SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION ? sourceMentionAssessmentText(item.text) : item.text;
    return !needsEvidence || supportsMaterialSelfLevelHint({ kind: item.kind, text, labels: [hint.skillLabel], level: hint.level,
      sourceMentions: projection === SOURCE_MENTION_MATERIAL_REVIEW_PROJECTION });
  });
}
