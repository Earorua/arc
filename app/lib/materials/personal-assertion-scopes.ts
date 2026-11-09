import { findMaterialSkillEvidence } from "./grounded-skill-terms";
import { deniedAssertion, hypothetical, maskQuotes, quoted } from "./quotation-evidence";


export function assertedSkillEvidence(text: string, label: string) {
  const evidence = findMaterialSkillEvidence(text, label);
  if (!evidence) return false;
  if (findMaterialSkillEvidence(maskQuotes(text), label) !== null) return true;
  // Quoting a tool name is different from quoting a proposition about that tool.
  return Array.from(text.matchAll(quoted)).some(match => match[0].slice(1, -1).trim() === evidence);
}
const supervised = /\b(?:under (?:[\w'’-]+ ){0,2}(?:supervision|guidance|review)|with (?:[\w'’-]+ ){0,3}(?:guidance|supervision|review)|with (?:my|a|the) (?:mentor|instructor|supervisor)(?:['’]s help|(?=,))|(?:during|in|on) (?:a|my|the) supervised (?:placement|internship|exercise|workshop|lab|session|project))\b/iu;
const instructionalPractice = /\b(?:(?:using|following|followed)\s+(?:(?:[\w'’-]+)\s+){0,3}(?:tutorials?|runbooks?|examples?|review notes))\b/iu;
const deniedInstructionalPractice = /\b(?:without(?:\s+(?:using|following))?|(?:not|(?:isn|aren|wasn|weren)['’]t)\s+(?:using|following)|(?:used|using|following|followed)\s+(?:no|zero|none|neither|not(?:\s+even)?\s+(?:a|an|any|one))|never\s+(?:used|followed))\b[^.;]{0,45}\b(?:tutorials?|runbooks?|examples?|review notes)\b/iu;
export const chineseGuidance = /^(?:我|本人)?(?:之前|目前|此前|曾经|只|仅|曾|还)*(?:在[^，,；;。]{0,20}(?:指导|监督|辅导|带领|复核|审阅|review)\s*下|由[^，,；;。]{1,16}(?:指导|带领)|(?:跟随|跟着|按(?:照)?|依照)[^，,；;。]{0,18}?(?:教程|示例|样例|示范|演示|评审反馈)|(按(?:照)?指导))/iu;
export const practiceAction = /(?:练习|演练|复现|操作|使用|实现|完成|实践|调试|配置|部署|搭建|编写|制作|做过|执行|测试|修复|排查|构建|开发|设置|改成|改写)/u;
export const personalPassivePractice = new RegExp("^由(?:我|本人)(?=(?:亲自|独立|直接|负责|来|继续)*" + practiceAction.source + ")", "u");
const guidedNegation = /\b(?:without (?:any )?(?:guidance|supervision)|(?:under|with) (?:no|zero) (?:guidance|supervision)|(?:not|(?:isn|aren|wasn|weren)['’]t)\s+(?:under|with)\s+(?:[\w'’-]+\s+){0,3}(?:guidance|supervision|review))\b|(?:无须|无需|没有|未经|未受)(?:任何|导师|同伴|老师|他人|的)*(?:指导|监督|复核)|(?:下|指导[，,]\s*)(?:并|也|仍)?(?:未能|不会|没有|不曾|从未)/iu;
export function instructionalFragmentStart(part: string) {
  const heading = /^([^:：;；.。]{1,80})\s*[:：]\s*/u.exec(part);
  if (heading) {
    const title = heading[1]!.trim();
    const personal = /^(?:my(?: own)? )?(?:placement|internship|lab|exercise|practice project)$|^(?:我(?:的)?|本人(?:的)?)?(?:实习|练习|演练|项目)$/iu.test(title);
    // A bare named affiliation ("Cloud Fern 实习") is conventional résumé
    // context. It must have name-shaped words, never ownership or free prose.
    const affiliation = /^(.+?)\s+(?:实习|internship|placement)$/iu.exec(title)?.[1];
    const namedAffiliation = affiliation !== undefined
      && /^\p{Lu}[\p{L}\p{N}-]*(?:\s+\p{Lu}[\p{L}\p{N}-]*){1,4}$/u.test(affiliation)
      && !/\b(?:my|our|your|her|his|their|its|the|team|group|colleague|mentor|supervisor|report|example|sample|plan|planned|future|upcoming|proposed)\b/iu.test(affiliation);
    if (!personal && !namedAffiliation) return null;
  }
  const start = heading?.[0].length ?? 0, body = part.slice(start);
  return !deniedInstructionalPractice.test(body)
    && /^(?:followed|used)\s+(?:[\w'’-]+\s+){0,3}(?:runbooks?|tutorials?|examples?)\s+to\s+(?:inspect|configure|trace|test|build|write|debug|repair|implement|calibrate)\b/iu.test(body) ? start : null;
}
function guidedPractice(part: string, sourceMentions = false) {
  if (guidedNegation.test(part)) return false;
  // A resume can put a date/project before the personal assertion. Only discard
  // a context clause; another actor, report, denial or future plan is not context.
  const context = /^(?:\d{4}年)?(?:在|参与|练习|演练|实习|项目)[^，,；;。]{1,100}[，,]\s*/u.exec(part);
  const body = context && !/(?:团队|小组|我们|同事|导师|经理|他们|她们|表示|声称|说明|报告|计划|打算|将要|未|没有)/u.test(context[0])
    ? part.slice(context[0].length) : part;
  const zh = chineseGuidance.exec(body);
  if (zh) {
    const action = body.slice(zh[0].length).replace(/^[，,\s]*(?:我|本人)?/u, "");
    // V3 can use an already grounded direct cleaning predicate. Require the
    // whole assertion before the generic scan can skip into a later plan verb.
    // An unsegmented trailing task cannot borrow the cleaning action's guidance.
    if (sourceMentions && /^清洗|^对[^，,；;。!?！？]{1,80}清洗/u.test(action)) {
      const clause = action.replace(/[，,；;。.!?！？\s]+$/u, "").trim();
      const evidence = findMaterialSkillEvidence(clause, "data cleaning");
      return evidence !== null && evidence === clause;
    }
    const practice = practiceAction.exec(action);
    // The short “按指导” qualifier needs a direct practice verb, not a later
    // action inside a denial, plan, report, or another person's activity.
    if (!practice || (zh[1] && practice.index !== 0)) return false;
    // A verb's negative complement or a plan predicate does not assert practice.
    // Limit these checks to this action, before a separate clause about another task.
    // A dot followed by identifier characters belongs to a technical name, such as React.js.
    const assertion = action.slice(practice.index + practice[0].length).split(/[，,；;。!?！？]|\.(?![A-Za-z0-9_])/u, 1)[0]!;
    if (/^不了/u.test(assertion) || /是.*计划\s*$|的计划(?:尚|还|仍)?未执行/u.test(assertion)) return false;
    if (action.startsWith("由") && !personalPassivePractice.test(action)) return false;
    return !/^(?:团队|小组|我们|同事|其他人|学员们|他们|她们|安排|要求|让|叫|记录|说明|解释|报告|描述|计划|打算|准备|将|会|没有|未能|不会)/u.test(action);
  }
  if (instructionalFragmentStart(part) !== null) return true;
  if (!supervised.test(part) && !(instructionalPractice.test(part) && !deniedInstructionalPractice.test(part))) return false;
  // The speaker must actually practise. A fronted qualifier can precede I, while
  // a supervisor's/team's achievement or a plan to practise cannot supply a level.
  const actor = /\bI\s+/iu.exec(part);
  if (!actor) return false;
  const prefix = part.slice(0, actor.index);
  if (prefix && !(/^(?:with|under|during|in|on)\b/iu.test(prefix) && supervised.test(prefix))
    && !/^(?:at|in|on|during|with (?:a|my|the) (?:mentor|instructor|supervisor))\s+[^,;]{1,100},\s*$/iu.test(prefix)) return false;
  const action = part.slice(actor.index + actor[0].length);
  // "Did" alone is not affirmative practice when this actor denies the action.
  // Keep additive "not only" and negation in other assertion scopes separate.
  if (/^(?:(?:have|had|also|only|previously|personally)\s+)*did\s+not\b(?!\s+only\b)/iu.test(action)) return false;
  if (/\b(?:documented|reported|explained|described|recorded|noted|said|wrote)\b[^.;]{0,80}\b(?:that|how|whether)\b/iu.test(action)
    || /\b(?:my|our|the|a|an)\s+(?:colleagues?|team|manager|mentor|interns?|supervisor)\s+(?:used|built|practised|practiced|rehearsed|ran|wrote|made|tested|configured|implemented)\b/iu.test(action)) return false;
  return /^(?:(?:have|had|also|only|previously|personally)\s+)*(?:[\w-]+ed|built|ran|wrote|made|did|set|took|drew|used)\b/iu.test(action)
    && !/\b(?:planned|enrolled|hired|intended|asked|wanted|expected|hoped|watched|observed|pretended|claimed)\b/iu.test(action);
}

export function guidedSkillScope(raw: string, text: string, sourceMentions = false) {
  // A helper doing another task does not establish guidance for the learner's
  // preceding work. Require the learner's own practice and guidance together.
  if (!guidedPractice(text, sourceMentions)) return null;
  const fragment = instructionalFragmentStart(text);
  if (fragment !== null) return raw.slice(fragment);
  const actor = /\bI\s+/iu.exec(text);
  return actor ? raw.slice(actor.index) : raw;
}

export const scopeBreak = /[;；]|,?\s+\b(?:but|whereas|while|although|however|rather than|except for|excluding)\b\s*|,?\s+\band\s+(?=(?:I|we|our|they|my|she|he|the|have|had|never|not|independently)\b)|(?:,\s*|\s+and\s+)(?=(?:[\p{L}\p{N}_][\p{L}\p{N}_.+#'’-]*\s+){1,5}(?:is|are|was|were|has|have|uses?|used|requires?|manages?|maintains?)\b)|[,，]\s*(?=(?:I|not|except)\b)|[，,]?\s*(?:但是|不过|然而|而非|但(?=[\p{L}]))|[，,]\s*(?=(?:我|本人|同事|导师|团队|小组|他们|她们|(?:可|能|能够|可以|不能|无法)独立)|[^，,；;。]{1,35}由(?:导师|同伴|同事|老师|讲师|结对伙伴))/giu;
export const personalAssessmentHeading = /^(?:简介|个人简介|自我介绍|个人技能|个人能力|(?:my |personal )?(?:profile|summary))\s*[:：]\s*/iu;
const reportedAssessment = /^[^，,；;。.]{1,80}\b(?:said|say|says|reported|claimed|wrote)\s*[:,，]|^[^，,；;。.]{1,40}(?:(?:说|表示|声称|报告)(?:过)?|写道)\s*[:：,，]/iu;
export function assessmentScopes(quote: string, masked: string) {
  const scopes: { raw: string; text: string }[] = [];
  // Strip only conventional personal headings for matching, never attribution
  // such as a team's profile or quoted/reporting prose. Citations remain intact.
  let start = personalAssessmentHeading.exec(masked)?.[0].length ?? 0;
  type AssertionScope = "asserted" | "denied" | "embedded";
  let assertionScope: AssertionScope = "asserted";
  function reportedInRange(from: number, end: number) {
    const ending = masked[end] ?? "";
    const range = masked.slice(from, end) + (/^[,，:：]$/u.test(ending) ? ending : "");
    return reportedAssessment.test(range.replace(/\s+/gu, " ").trim());
  }
  function add(end: number, inherited: AssertionScope): AssertionScope {
    const text = masked.slice(start, end).replace(/\s+/gu, " ").trim();
    // Preserve the adjacent reporting comma without reading another range's
    // actor across an already recognized conjunction boundary.
    const next = inherited === "embedded" || hypothetical.test(text) || reportedInRange(start, end) ? "embedded"
      : inherited === "denied" || deniedAssertion.test(text) ? "denied" : "asserted";
    if (text && next === "asserted") scopes.push({ raw: quote.slice(start, end), text });
    return next;
  }
  for (const separator of masked.matchAll(scopeBreak)) {
    const prefix = masked.slice(start, separator.index).trim();
    // In “在导师指导下，我…”, the comma separates a shared qualifier from its
    // actor, not two tasks. Keep that qualifier attached to the actual action.
    const frontedGuidance = !/\bI\s+/iu.test(prefix) && /^(?:with|under|during|in|on)\b/iu.test(prefix) && supervised.test(prefix + ",");
    if (/^[，,]\s*$/u.test(separator[0]) && (chineseGuidance.exec(prefix)?.[0].length === prefix.length || frontedGuidance)) continue;
    assertionScope = add(separator.index, assertionScope);
    start = separator.index + separator[0].length;
    const next = masked.slice(start).trimStart();
    const nextEnd = start + (masked.slice(start).matchAll(scopeBreak).next().value?.index ?? masked.length - start);
    // Only a denial can end at a new direct personal contrast. An example,
    // condition or report continues to govern its nested clauses.
    if (assertionScope === "denied" && /^[\s，,]*(?:but|但是|但)\s*$/iu.test(separator[0])
      && /^(?:I\b|my experience\b|我(?!们|的)|本人(?!的|团队))/iu.test(next) && !reportedInRange(start, nextEnd)) assertionScope = "asserted";
  }
  add(masked.length, assertionScope);
  return scopes;
}


const englishConceptual = /^I(?:['’]m| am| was)\s+(?:(?:only|somewhat|basically)\s+)?familiar with\b|^I (?:have|had)\s+(?:(?:only|a|some|basic|conceptual|theoretical|limited)\s+)+(?:knowledge|understanding|familiarity) (?:of|with)\b|^my experience (?:with|of|in)\b.{1,60}\bis limited to reading\b|^I (?:have )?only read (?:about|the documentation for)\b|^I (?:(?:can|am able to) explain|(?:have )?explained)\s+(?!(?:how|that|whether)\b)\S/iu;
const chineseConceptual = /^(?:我|本人)?(?:目前|仅|只|基本|初步|比较)*(?:了解|熟悉)\s*[\p{L}\p{N}]|^(?:我|本人)?对[^，,；;。]{1,55}(?:只有|仅有|有|只有一点|有些)(?:基础|基本|初步|概念上|理论上)的?(?:了解|认识|理解)|^(?:我|本人)?(?:目前|此前|对[^，,。]{1,40})?(?:仅|只)?(?:读过|阅读过|有阅读[^，,。]{0,45}(?:经验|经历))|^(?:我|本人)(?:能|能够|可以)解释\s*[\p{L}\p{N}]/u;
export function conceptualAssessment(text: string) {
  return (englishConceptual.test(text) || chineseConceptual.test(text))
    && !/\b(?:familiar with|knowledge of|understanding of)\s+(?:(?:the|an?|this)\s+)?(?:example|sample|quotation|quote)\b|^(?:我|本人)?(?:熟悉|了解)(?:示例|例句|引文)/iu.test(text);
}
