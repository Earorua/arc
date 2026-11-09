import type { DocumentCandidate } from "../../contracts/documents";
import { maskQuotes } from "./quotation-evidence";
import { assertedSkillEvidence, assessmentScopes, conceptualAssessment, guidedSkillScope, personalAssessmentHeading } from "./personal-assertion-scopes";

type Hint = DocumentCandidate["selfLevelHint"];

export const selfConflict = /\b(?:self[- ](?:assessments?|ratings?)|(?:my|personal) (?:skill |proficiency )?(?:ratings?|assessments?))\s+(?:(?:for|of|on)\s+[^,;]{1,60}\s+)?(?:conflict|contradict|disagree|(?:are|were) inconsistent)\b|(?:自评|自我(?:评价|评估)|能力评估)(?:前后|相互|彼此|有|存在|表述)*(?:矛盾|冲突|不一致)/iu;
export const deniedConflict = /\b(?:(?:do(?:es)? not|never|no longer) (?:conflict|contradict|disagree)|no (?:remaining )?conflict|conflict (?:is|was|has been) resolved)\b|(?:没有|并无|不存在|已解决|并不)(?:矛盾|冲突)/iu;
const selfUncertain = /^I(?:['’]m| am| remain)\s+(?:(?:still|currently)\s+)?(?:unsure|uncertain|not sure) (?:about (?:my|whether)|whether I|if I)\b|^我(?:目前|还|仍)?(?:不确定|不清楚)(?:自己|我|是否|能否)|^(?:我的|我对).{0,45}自评(?:仍|还)?不确定/iu;

function personalPracticeNeed(text: string) {
  // The same speaker must affirm wanting practice, not merely mention a wish
  // that is negated or belongs to another person later in the sentence.
  return /^I (?:have|had) not (?:yet )?(?:designed|built|implemented|run|completed|deployed|configured|tested)\b[^.;]{0,160}\band\s+(?:(?:do|still|now)\s+)?(?:want|need|would like)\s+(?:more )?practice\b/iu.test(text);
}

export function hasPersonalCapabilityQuestion(quote: string, masked: string, allowImplicit: boolean, sourceMentions = false) {
  // Review a directly stated ability, limit or learning scope independently of
  // whether one optional level can safely apply to every term in the whole fact.
  const headedPersonalAbility = allowImplicit && personalAssessmentHeading.test(masked);
  return assessmentScopes(quote, masked).some(({ raw, text }) => {
    // An unanchored “熟悉 SQL” could be a JD requirement. First-person evidence
    // can stand alone; implicit résumé phrasing needs a personal fact candidate.
    if (!allowImplicit && !/^(?:I\b|my\b|我|本人)|\bI\s+|[，,]\s*(?:我|本人)/iu.test(text)) return false;
    return conceptualAssessment(text) || (selfUncertain.test(text) && personalUncertainty(text)) || guidedSkillScope(raw, text, sourceMentions) !== null
    || /^I (?:(?:can|cannot|can['’]t)(?: yet)?|am (?:not )?(?:yet )?able to)\s+(?:independently\s+(?:configure|design|build|implement|run|complete|deploy|test|debug|repair|write|use)\b|(?:configure|design|build|implement|run|complete|deploy|test|debug|repair|write|use)\b[^.;]{0,160}\b(?:myself|independently|on my own)\b)/iu.test(text)
    || ((headedPersonalAbility || /^(?:我|本人)/u.test(text))
      && /^(?:我|本人)?(?:目前|现在|还|仍|尚)*(?:能|能够|可以|可|不能|无法)独立(?:配置|设计|构建|实现|运行|完成|部署|测试|调试|修复|编写|使用)\s*[\p{L}\p{N}]/u.test(text))
    || personalPracticeNeed(text);
  });
}
function personalUncertainty(part: string) {
  return !deniedConflict.test(part) && !/\b(?:my|our) (?:team|colleague)['’]s\b|(?:团队|小组)的?(?:能力|自评)/iu.test(part)
    && (selfUncertain.test(part) || (/(?:\bmy\b|我|^自评)/iu.test(part) && selfConflict.test(part)));
}
/** Retain document-wide quotation masking when reviewing a statement slice. */
export function supportsSelfLevelHintInScope(quote: string, masked: string, proposed: NonNullable<Hint>, labels?: readonly string[], sourceMentions = false) {
  const scopes = assessmentScopes(quote, masked);
  if (proposed !== "uncertain" && scopes.some(scope => personalUncertainty(scope.text))) return false;
  const supported = scopes.map(scope => {
    const raw = scope.raw.replace(/\s+/gu, " ").trim(), text = maskQuotes(raw);
    if (proposed === "guided") {
      const evidence = guidedSkillScope(raw, text, sourceMentions);
      return evidence;
    }
    return (proposed === "uncertain" ? personalUncertainty(text) : conceptualAssessment(text)) ? raw : null;
  });
  if (!supported.some(Boolean)) return false;
  // In v2 these labels have already been grounded in the complete quote. Re-check
  // each against the supported clause(s) when part of the quote lies outside them.
  // A repeated term in a second, unsupported task must not inherit the first
  // task's level. The wire contract still has only one optional hint per fact.
  return !labels?.length || labels.every(label => supported.some(scope => scope !== null && assertedSkillEvidence(scope, label))
    && scopes.every((scope, index) => !assertedSkillEvidence(scope.raw, label)
      || supported[index] !== null && assertedSkillEvidence(supported[index]!, label)));
}

/** Check a proposed per-fact level using the fact's current personal evidence. */
export function supportsMaterialSelfLevelHint(input: {
  kind: DocumentCandidate["kind"];
  text: string;
  labels?: readonly string[];
  level: DocumentCandidate["selfLevelHint"];
  sourceMentions?: boolean;
}): boolean {
  if (!input.level || (input.kind !== "experience" && input.kind !== "skill-claim")) return false;
  return supportsSelfLevelHintInScope(input.text, maskQuotes(input.text), input.level, input.labels, input.sourceMentions);
}

/** A learning-limit reminder is separate from assigning a self-level hint. */
export function hasPersonalPracticeNeed(quote: string, masked: string) {
  return assessmentScopes(quote, masked).some(({ text }) => personalPracticeNeed(text));
}
