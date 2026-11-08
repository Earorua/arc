import type { DocumentCandidate } from "../../contracts/documents";
import {
  assertedSkillEvidence, assessmentScopes, chineseGuidance, conceptualAssessment, guidedSkillScope,
  instructionalFragmentStart, personalAssessmentHeading, personalPassivePractice, practiceAction, scopeBreak,
} from "./personal-assertion-scopes";
import { maskQuotes, quoted } from "./quotation-evidence";

const englishPractice = /^(?:(?:have|had|am|was|been|do|did|also|only|currently|previously|personally|independently)\s+)*(?:not only\s+)?(?:us(?:e[ds]?|ing)|test(?:s|ed|ing)?|build(?:s|ing)?|built|writ(?:e[sn]?|ing)|wrote|implement(?:s|ed|ing)?|configur(?:e[ds]?|ing)|run(?:s|ning)?|ran|develop(?:s|ed|ing)?|maintain(?:s|ed|ing)?|debug(?:s|ged|ging)?|repair(?:s|ed|ing)?|modif(?:y|ies|ied|ying)|edit(?:s|ed|ing)?|chang(?:e[ds]?|ing)|analy[sz](?:e[ds]?|ing)|clean(?:s|ed|ing)?|deploy(?:s|ed|ing)?|install(?:s|ed|ing)?)\b/iu;
const englishClaim = /^(?:(?:am|was)\s+)?(?:proficient in|skilled (?:in|at)|experienced in|responsible for)\b|^(?:know|knows|knew)\b|^my (?:skills|responsibilities) (?:include|included)\b/iu;
const chinesePractice = new RegExp("^(?:" + practiceAction.source + "|用|修改|调整|维护|分析|清洗|负责)(?!不了)", "u");
const chineseClaim = /^(?:掌握|擅长)|^(?:能|能够|可以|可)(?:独立)?(?:使用|编写|测试|配置|开发|完成)/u;

function hasAssertionProse(body: string) {
  return /\b(?:I|my|our|we|you|your|they|their|he|his|she|her|the|a|an|no|not|never|without|cannot|will|would|plan|plans|hope|hopes|is|are|was|were|has|have|had|did|do|does|to|for|by|that|whether|supplied|provided|scheduled|arranged|recorded|documented|said|says|reported|claimed)\b/iu.test(body)
    || /^(?:我|本人|同事|导师|团队|小组|我们|他们|她们|由|没有|从未|未|不|无法|不能|计划|打算|将|希望|安排|记录|示例|例如)/u.test(body)
    || practiceAction.exec(body)?.index === 0
    || body.split(/\s+/u).some(word => englishPractice.test(word) || englishClaim.test(word));
}

function resumeSkillFragment(raw: string) {
  const body = raw.replace(/^(?:skills?|technologies|tools)\s*[:：]\s*/iu, "");
  // A bare resume list is useful, but free prose about an actor or a predicate
  // cannot become a skill list merely because the fact has a personal kind.
  if (hasAssertionProse(body)) return false;
  return /^[\p{L}\p{N}][\p{L}\p{N}_.+#/-]*(?:[ \t]+[\p{L}\p{N}][\p{L}\p{N}_.+#/-]*){0,2}(?:(?:\s*[,、]\s*|\s+(?:and|or)\s+)[\p{L}\p{N}][\p{L}\p{N}_.+#/-]*(?:[ \t]+[\p{L}\p{N}][\p{L}\p{N}_.+#/-]*){0,2})*[。.!]?$/u.test(body);
}

function followingActorBoundary(text: string) {
  for (const comma of text.matchAll(/,\s*/gu)) {
    const following = text.slice(comma.index + comma[0].length).replace(/^and\s+/iu, "");
    // A leading practice/claim verb continues the same actor. A noun phrase
    // before that predicate introduces another assertion; reuse the existing
    // experience predicates instead of recognizing names or skills as actors.
    if (englishPractice.test(following) || englishClaim.test(following)) continue;
    const words = following.split(/\s+/u);
    for (let length = 1; length <= 5 && length < words.length; length++) {
      if (!/^[\p{L}\p{N}'’_-]+$/u.test(words[length - 1]!)) break;
      const predicate = words.slice(length).join(" ");
      if (englishPractice.test(predicate) || englishClaim.test(predicate)) return comma.index;
    }
  }
  return null;
}

function personalExperienceScope(raw: string) {
  const normalized = raw.replace(/\s+/gu, " ").trim();
  // Shared guided parsing can locate a resume fragment or a learner after a
  // fronted qualifier. Its level decision is never the experience decision.
  const guided = guidedSkillScope(normalized, maskQuotes(normalized));
  let evidence = guided ?? normalized;
  let text = maskQuotes(evidence);
  if (guided && !chineseGuidance.test(text)) {
    const comma = /[，,]\s*/u.exec(text);
    if (comma && chineseGuidance.test(text.slice(comma.index + comma[0].length))) {
      evidence = evidence.slice(comma.index + comma[0].length);
      text = maskQuotes(evidence);
    }
  }
  const guidance = chineseGuidance.exec(text);
  if (guidance) {
    evidence = evidence.slice(guidance[0].length).replace(/^[，,\s]+/u, "");
    text = maskQuotes(evidence);
  }
  const passive = personalPassivePractice.exec(text);
  if (passive) {
    evidence = evidence.slice(passive[0].length);
    text = maskQuotes(evidence);
  }
  const actor = /^(?:I\s+|I['’]m\s+|(?:我|本人)(?!的|们))/iu.exec(text);
  const action = (actor ? text.slice(actor[0].length) : text)
    .replace(/^(?:(?:目前|现在|正在|曾经|曾|亲自|独立|直接|只|仅|已经|已|来|继续))+/u, "");
  // These checks describe the asserted action, not its degree of assistance.
  const firstClause = action.split(/[，,；;。!?！？]|\.(?=\s|$)/u, 1)[0]!;
  if (/(?:是[^，,；;。]*计划|的计划)/u.test(firstClause)) return null;
  const capable = /^(?:can|am able to)\s+/iu.exec(action);
  const englishAction = englishPractice.exec(action);
  // The object must be the work itself, not an embedded proposition or a
  // report about someone else's work, even when the learner wrote that report.
  if (englishAction && /^\s+(?:that|how|whether|(?:(?:an?|the)\s+)?(?:(?:reports?|summar(?:y|ies)|notes?)\s+(?:about|on|of)|plans?\s+to))\b/iu.test(action.slice(englishAction[0].length))) return null;
  const practice = englishAction !== null || chinesePractice.test(action)
    || instructionalFragmentStart(action) !== null;
  const claim = conceptualAssessment("I " + action) || conceptualAssessment("I am " + action)
    || conceptualAssessment(action) || englishClaim.test(action) || chineseClaim.test(action)
    || capable !== null && englishPractice.test(action.slice(capable[0].length));
  if (!practice && !claim && (actor || !resumeSkillFragment(evidence))) return null;
  const prefix = normalized.slice(0, normalized.length - evidence.length);
  const reportPurpose = /\s+to\s+(?:record|document|report|describe|explain)\b/iu.exec(text);
  const nextActor = followingActorBoundary(text);
  evidence = evidence.slice(0, Math.min(reportPurpose?.index ?? evidence.length, nextActor ?? evidence.length));
  // An outer action cannot make a quoted proposition personal. Reuse the
  // existing quotation and prose rules without imposing a bare fragment's
  // label shape on literal tool objects such as '.NET' or 'SQL Server'.
  const quotedProposition = Array.from(evidence.matchAll(quoted))
    .some(match => hasAssertionProse(match[0].slice(1, -1).trim()));
  return {
    evidence,
    whole: !quotedProposition && !reportPurpose && nextActor === null && !practiceAction.test(prefix)
      && !prefix.split(/\s+/u).some(word => englishPractice.test(word)),
  };
}

function uncoveredText(text: string, scopes: readonly { raw: string }[]) {
  const masked = maskQuotes(text);
  let uncovered = masked.replace(personalAssessmentHeading, heading => " ".repeat(heading.length))
    .replace(scopeBreak, separator => " ".repeat(separator.length));
  let end = 0;
  for (const scope of scopes) {
    const start = text.indexOf(scope.raw, end);
    if (start < end) return text;
    end = start + scope.raw.length;
    uncovered = uncovered.slice(0, start) + " ".repeat(scope.raw.length) + uncovered.slice(end);
  }
  // assessmentScopes deliberately omits embedded/denied ranges. A confirmed
  // whole-fact relation cannot silently discard one of those ranges.
  return uncovered;
}

function experienceAssertionScopes(text: string) {
  const masked = maskQuotes(text);
  const original = assessmentScopes(text, masked);
  const excluded = uncoveredText(text, original);
  const scopes: typeof original = [];
  // A soft line wrap must not detach a modal/denial from its action. Replacing
  // each whitespace code unit retains the original source coordinates.
  const sentenceMask = masked.replace(/\s/gu, " ");
  // Segment the original UTF-16 mask, so quoted punctuation cannot split an
  // assertion and technical names retain their spelling. Reapply the same
  // scope parser within sentences, intersecting with its original allowed
  // ranges: an earlier example/report/condition can never become personal.
  for (const sentence of new Intl.Segmenter("und", { granularity: "sentence" }).segment(sentenceMask)) {
    const raw = text.slice(sentence.index, sentence.index + sentence.segment.length);
    let end = 0;
    for (const scope of assessmentScopes(raw, sentence.segment)) {
      const start = raw.indexOf(scope.raw, end);
      end = start + scope.raw.length;
      if (start >= 0 && !excluded.slice(sentence.index + start, sentence.index + end).trim()) scopes.push(scope);
    }
  }
  return scopes;
}

/** Require personal practice or a personal skill claim for the original source target. */
export function supportsMaterialExperience(input: {
  kind: DocumentCandidate["kind"];
  text: string;
  target: { kind: "terms"; terms: readonly string[] } | { kind: "confirmed-whole-fact" };
}): boolean {
  if (input.kind !== "experience" && input.kind !== "skill-claim") return false;
  const scopes = experienceAssertionScopes(input.text);
  const supported = scopes.map(scope => personalExperienceScope(scope.raw));
  if (input.target.kind === "terms") {
    // Different occurrences can express different limits. Some real personal
    // practice supports experience without asserting every use or a given level.
    return input.target.terms.length > 0 && input.target.terms.every(term =>
      supported.some(scope => scope !== null && assertedSkillEvidence(scope.evidence, term)));
  }
  return scopes.length > 0 && !uncoveredText(input.text, scopes).trim()
    && supported.some(scope => scope?.whole)
    && scopes.every((scope, index) => supported[index]?.whole
      // A result note can continue the learner's preceding activity. It does
      // not create term evidence or authorize a different actor's task.
      || index > 0 && supported[index - 1]?.whole
        && /^(?:documenting|recording) (?:the )?(?:results|output)\b/iu.test(scope.text)
        && !/\b(?:of|from)\b/iu.test(scope.text));
}
