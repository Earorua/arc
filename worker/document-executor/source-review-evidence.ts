import {
  documentCandidateReviewPointsSchema, locateCandidateQuote,
  type DocumentCandidate, type DocumentCandidateReviewPoint, type MaterialReferenceContext,
} from "../../app/contracts/documents";
import { findMaterialSkillEvidence } from "../../app/lib/materials/grounded-skill-terms";
import { statementBoundaries } from "./source-statements";
import { isRequirementLevelHeading } from "./source-requirement-evidence";

type EvidenceItem = Pick<DocumentCandidate, "kind" | "source" | "selfLevelHint"> &
  Partial<Pick<DocumentCandidate, "requirementLevel" | "skillLabels">>;
type Sources = Pick<MaterialReferenceContext, "text" | "segments">;
type Code = DocumentCandidateReviewPoint["code"];
type Source = DocumentCandidateReviewPoint["source"];
type Hint = DocumentCandidate["selfLevelHint"];

// Keep UTF-16 offsets stable. Quoted labels can still be the object of a real assertion
// ("the syllabus omits 'X'"), but a quoted example cannot assert the proposition inside it.
const quoted = /“[^“”]*”|「[^「」]*」|『[^『』]*』|‘(?:[^‘’]|’(?=[\p{L}]))*’|"(?:\\.|[^"\\])*"|(?<![\p{L}\p{N}])'(?:[^']|'(?=[\p{L}]))*'|\x60[^\x60]*\x60/gu;
function maskQuotes(text: string) {
  return text.replace(quoted, match => "Q" + " ".repeat(match.length - 1));
}

/** A sentence detached from an enclosing quotation loses who actually asserted it. */
export function isDetachedQuotedStatement(source: Source, sources: Sources) {
  const span = locateCandidateQuote(source, sources);
  return !span || Array.from(sources.text.matchAll(quoted)).some(match => match.index < span.start && match.index + match[0].length >= span.end);
}

function assertedSkillEvidence(text: string, label: string) {
  const evidence = findMaterialSkillEvidence(text, label);
  if (!evidence) return false;
  if (findMaterialSkillEvidence(maskQuotes(text), label) !== null) return true;
  // Quoting a tool name is different from quoting a proposition about that tool.
  return Array.from(text.matchAll(quoted)).some(match => match[0].slice(1, -1).trim() === evidence);
}

const hypothetical = /^(?:(?:if|whether|unless|suppose|assuming|example|for example)\b|如果|假如|假设|例如|举例)|[?？]\s*$/iu;
const deniedAssertion = /\b(?:it (?:is|was) (?:false|untrue|incorrect|unclear|uncertain|unknown)|it (?:is|was) not (?:true|the case)|no (?:evidence|reason to believe)|(?:did not|never) (?:say|claim)|(?:nobody|no one) (?:said|claimed)|wrong to (?:say|claim))\b|(?:不能|无法)(?:断言|确定|认定)|没有证据|并非事实|并非如此|不能说/iu;
function assertedClauses(masked: string) {
  return masked.replace(/\s+/gu, " ").split(/[;；]/u).map(clause => clause.trim())
    .filter(clause => clause && !hypothetical.test(clause) && !deniedAssertion.test(clause));
}

// Require a relation between a curriculum and absent instruction. A skill label or
// even a statement that someone needs to learn a skill says nothing about coverage.
const curriculumGaps = [
  /\b(?:curriculum|syllabus|courses?|training|learning (?:plan|path)|skill blueprint)\s+(?:(?:currently|still|presently)\s+)?(?:(?:do(?:es)? not|do(?:es)?n['’]t)(?:\s+yet)?\s+(?:cover|include|teach)|(?:omits?|excludes?)|has no coverage of|lacks?\s+(?:coverage of|(?:a |any )?(?:module|unit|lesson)(?:s)? (?:on|for)))\s+\S/iu,
  /\b(?:is|are|was|were)(?:(?:\s+(?:still|currently))?\s+not|n['’]t)\s+(?:yet )?(?:covered|included|taught) (?:by|in)\s+(?:(?:the|our|my|current|existing|introductory)\s+){0,4}(?:curriculum|syllabus|course|training|learning (?:plan|path)|skill blueprint)\b/iu,
  /\b(?:is|are) (?:outside|absent from|missing from)\s+(?:(?:the|our|my|current|existing)\s+){0,4}(?:curriculum|syllabus|course|training|learning (?:plan|path)|skill blueprint)\b/iu,
  /\b(?:is|are) not in (?:our|my|the) (?:current |existing )?(?:curriculum|syllabus|learning plan)\b|\b(?:syllabus|curriculum|course) no longer (?:covers|includes|teaches)\s+\S/iu,
  /\b(?:no|without)\s+(?:(?:current|available|verified)\s+)?(?:course|curriculum|training)\s+coverage (?:for|of|on)\s+\S|\bno (?:course|module|lesson|learning unit)s?\s+(?:covers?|teaches?|on|for)\s+\S/iu,
  /(?:课程|课纲|教学大纲|教学计划|学习(?:路线|计划|单元)|技能蓝图)(?:目前|当前|仍然|仍|暂时|还|暂|尚|也|并)*(?:没有|不曾|未曾|未|不)(?:涵盖|覆盖|包含|涉及|教授|收录)\s*[\p{L}\p{N}]/u,
  /(?:不在|尚未(?:列入|纳入)|未被纳入)(?:当前|现有|这份|本|该)*(?:课程|教学大纲|学习(?:计划|路线)|技能蓝图)(?:[的\s]*(?:覆盖)?范围|中|内)?/u,
  /(?:课程|教学大纲|学习(?:路线|计划)|技能蓝图)(?:目前|当前|仍然)?缺少(?:有关|关于|面向)[^，,。]{1,60}(?:课程|单元|模块|教学内容)/u,
];
function hasCurriculumGap(clause: string) {
  return curriculumGaps.some(pattern => {
    const match = pattern.exec(clause);
    return match && !/(?:\b(?:if|whether|unless)\b|是否|如果|假如)/iu.test(clause.slice(0, match.index + match[0].length));
  });
}

const urlTokens = /\bhttps?:\/\/[^\s<>"“”‘’「」『』，。；：！？（）【】]+/giu;
function urlLiteral(token: string) {
  let end = token.length;
  while (end > 0 && ".,;:!?)}]".includes(token[end - 1]!)) end--;
  return token.slice(0, end);
}
function hasLiteralUrl(quote: string) {
  return (quote.match(urlTokens) ?? []).some(token => URL.canParse(urlLiteral(token)));
}
export function groundedStatementBoundaries(text: string) {
  // ICU may see the query separator in a URL as sentence punctuation. Protect only
  // punctuation inside the literal; trailing prose punctuation still ends a statement.
  const layout = text.replace(urlTokens, token => {
    const literal = urlLiteral(token);
    return literal.replace(/[.!?]/gu, "x") + token.slice(literal.length);
  });
  return statementBoundaries(layout, isRequirementLevelHeading);
}

const instructionOverride = /^(?:(?:instructions? (?:for|to) (?:the )?(?:assistant|model)|assistant|system|ai|admin(?:istrator)?(?: override)?)\s*[:,，：]\s*)?(?:please\s+)?(?:ignore|disregard|discard|override|forget|bypass)\s+(?:(?:all|any|the|your|system|higher.priority|earlier|above|preceding|prior|previous|original)\s+){1,6}(?:instructions?|prompts?|rules?|safeguards?|constraints?)\b|^(?:(?:给|致)?(?:助手|模型|系统)[：:，,]\s*)?(?:请|务必|必须|现在)*(?:忽略|无视|绕过|覆盖)(?:之前|先前|此前|上面|上述|前面|原有|所有|全部|系统|的)*(?:指令|指示|提示词|规则)/iu;
const falsifiedResult = /^(?:(?:assistant|model|system|ai)\s*[:,，：]\s*)?(?:please\s+|you must\s+)?(?:mark|set|report|declare)\s+[^.;]{0,70}\b(?:skills?|proficiency|mastery|applicant|tasks?)\b[^.;]{0,25}\b(?:verified|mastered|complete)\b|^(?:请|务必|直接|强制|要求模型|要求助手)*(?:把|将)[^。]{0,48}(?:技能|能力|任务)[^。]{0,18}(?:标记|写|判定|设定)为(?:已验证|已掌握|已完成)/iu;
const commandToAssistant = /^(?:(?:assistant|model|ai)\s*[:,，：]\s*(?:follow|obey|execute) (?:this|the following) (?:instruction|command|directive)|(?:助手|模型)[：:，,]\s*请?(?:执行|遵循)(?:以下|这个)(?:指令|命令))\s*[:：]\s*/iu;

const groupAchievement = /\b(?:we|(?:our|my|the)(?:\s+[\w-]+){0,2}\s+(?:team|group))\s+(?:(?:successfully|jointly|collectively|has|have)\s+)*(?:built|delivered|deployed|completed|launched|shipped|migrated|implemented|released|developed|operated|reduced|increased)\b|(?:我们(?:的)?(?:团队|小组)?|我所在的(?:团队|小组)|团队|小组)(?:共同|成功|一起|合作)*(?:完成|交付|上线|搭建|迁移|实现|发布|开发|部署|运维)了?/iu;
const personalTeamScope = /\b(?:my (?:own )?(?:role|part|contribution)|my team)\b|(?:我(?:的|仅|只|负责|所在的)|个人(?:职责|贡献|分工))/iu;
const unclearTeamRole = /\b(?:individual (?:contribution|role|ownership)|my (?:own )?(?:role|part|contribution)|ownership of (?:the |our )?(?:whole )?team)\s+(?:is|was|remains)\s+(?:unclear|unknown|undocumented|not (?:stated|specified|described))\b|(?:团队|小组).{0,40}(?:个人(?:贡献|职责|分工)|我负责的部分)(?:仍|尚)?(?:不明|不清楚|未知|未(?:说明|写明|明确))/iu;
const selfConflict = /\b(?:self[- ](?:assessments?|ratings?)|(?:my|personal) (?:skill |proficiency )?(?:ratings?|assessments?))\s+(?:(?:for|of|on)\s+[^,;]{1,60}\s+)?(?:conflict|contradict|disagree|(?:are|were) inconsistent)\b|(?:自评|自我(?:评价|评估)|能力评估)(?:前后|相互|彼此|有|存在|表述)*(?:矛盾|冲突|不一致)/iu;
const requirementConflict = /\b(?:requirements?|priorities|job descriptions?)\s+(?:(?:for|of|on|about)\s+[^,;]{1,60}\s+)?(?:conflict|contradict|disagree|(?:are|were) inconsistent)\b|(?:要求|优先级|必备条件)(?:前后|相互|彼此|有|存在|表述)*(?:矛盾|冲突|不一致)/iu;
const dualPriority = /\b(?:both (?:mandatory|required) and (?:optional|preferred)|(?:mandatory|required) in one (?:section|paragraph|list) (?:but|and) (?:only )?(?:optional|preferred) in another|one (?:section|paragraph|list) (?:calls|lists|marks)\s+.{1,48}\s+(?:mandatory|required),?\s+(?:but|and)\s+another (?:calls|lists|marks) it (?:as )?(?:optional|preferred))\b|(?:同时|既)(?:被|列为|标为|是)*(?:必备|必需|必须)(?:又列为|又标为|和|又是)(?:可选|加分|优先)/iu;
const deniedConflict = /\b(?:(?:do(?:es)? not|never|no longer) (?:conflict|contradict|disagree)|no (?:remaining )?conflict|conflict (?:is|was|has been) resolved)\b|(?:没有|并无|不存在|已解决|并不)(?:矛盾|冲突)/iu;
const missingInformation = /\b(?:availability|available time|study time|work(?:ing)? time|time budget|hours|proficiency level|experience level|years of experience|requirement priority|(?:remote )?location|salary)\s*[:：]?\s*(?:(?:is|are|was|were|remains?)\s+)?(?:not (?:stated|specified|given|provided|documented)|unknown|unspecified|undocumented)\b|(?:可用(?:的)?(?:学习)?时间|学习时间|工作时间|时间预算|能力水平|要求优先级|(?:远程)?地点|薪酬|经验年限|个人职责|个人贡献)\s*[:：]?\s*(?:目前|仍|尚|未被|均|都)*(?:未(?:说明|明确|提供|填写|给出)|不详|未知)/iu;

const englishConceptual = /^I(?:['’]m| am| was)\s+(?:(?:only|somewhat|basically)\s+)?familiar with\b|^I (?:have|had)\s+(?:(?:only|a|some|basic|conceptual|theoretical|limited)\s+)+(?:knowledge|understanding|familiarity) (?:of|with)\b|^my experience (?:with|of|in)\b.{1,60}\bis limited to reading\b|^I (?:have )?only read (?:about|the documentation for)\b|^I (?:(?:can|am able to) explain|(?:have )?explained)\s+(?!(?:how|that|whether)\b)\S/iu;
const chineseConceptual = /^(?:我|本人)?(?:目前|仅|只|基本|初步|比较)*(?:了解|熟悉)\s*[\p{L}\p{N}]|^(?:我|本人)?对[^，,；;。]{1,55}(?:只有|仅有|有|只有一点|有些)(?:基础|基本|初步|概念上|理论上)的?(?:了解|认识|理解)|^(?:我|本人)?(?:目前|此前|对[^，,。]{1,40})?(?:仅|只)?(?:读过|阅读过|有阅读[^，,。]{0,45}(?:经验|经历))|^(?:我|本人)(?:能|能够|可以)解释\s*[\p{L}\p{N}]/u;
const supervised = /\b(?:under (?:[\w'’-]+ ){0,2}(?:supervision|guidance|review)|with (?:[\w'’-]+ ){0,3}(?:guidance|supervision|review)|with (?:my|a|the) (?:mentor|instructor|supervisor)(?:['’]s help|(?=,))|(?:during|in|on) (?:a|my|the) supervised (?:placement|internship|exercise|workshop|lab|session|project))\b/iu;
const instructionalPractice = /\b(?:(?:using|following|followed)\s+(?:(?:[\w'’-]+)\s+){0,3}(?:tutorials?|runbooks?|examples?|review notes))\b/iu;
const deniedInstructionalPractice = /\b(?:without(?:\s+(?:using|following))?|(?:not|(?:isn|aren|wasn|weren)['’]t)\s+(?:using|following)|(?:used|using|following|followed)\s+(?:no|zero|none|neither|not(?:\s+even)?\s+(?:a|an|any|one))|never\s+(?:used|followed))\b[^.;]{0,45}\b(?:tutorials?|runbooks?|examples?|review notes)\b/iu;
const selfUncertain = /^I(?:['’]m| am| remain)\s+(?:(?:still|currently)\s+)?(?:unsure|uncertain|not sure) (?:about (?:my|whether)|whether I|if I)\b|^我(?:目前|还|仍)?(?:不确定|不清楚)(?:自己|我|是否|能否)|^(?:我的|我对).{0,45}自评(?:仍|还)?不确定/iu;
const chineseGuidance = /^(?:我|本人)?(?:之前|目前|此前|曾经|只|仅|曾|还)*(?:在[^，,；;。]{0,20}(?:指导|监督|辅导|带领|复核|审阅|review)\s*下|由[^，,；;。]{1,16}(?:指导|带领)|(?:跟随|跟着|按(?:照)?|依照)[^，,；;。]{0,18}?(?:教程|示例|样例|示范|演示|评审反馈))/iu;
const practiceAction = /(?:练习|演练|复现|操作|使用|实现|完成|实践|调试|配置|部署|搭建|编写|制作|做过|执行|测试|修复|排查|构建|开发|设置|改成|改写)/u;
const personalPassivePractice = new RegExp("^由(?:我|本人)(?=(?:亲自|独立|直接|负责|来|继续)*" + practiceAction.source + ")", "u");
const guidedNegation = /\b(?:without (?:any )?(?:guidance|supervision)|(?:under|with) (?:no|zero) (?:guidance|supervision)|(?:not|(?:isn|aren|wasn|weren)['’]t)\s+(?:under|with)\s+(?:[\w'’-]+\s+){0,3}(?:guidance|supervision|review))\b|(?:无须|无需|没有|未经|未受)(?:任何|导师|同伴|老师|他人|的)*(?:指导|监督|复核)|(?:下|指导[，,]\s*)(?:并|也|仍)?(?:未能|不会|没有|不曾|从未)/iu;
function instructionalFragmentStart(part: string) {
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
function guidedPractice(part: string) {
  if (guidedNegation.test(part)) return false;
  // A resume can put a date/project before the personal assertion. Only discard
  // a context clause; another actor, report, denial or future plan is not context.
  const context = /^(?:\d{4}年)?(?:在|参与|练习|演练|实习|项目)[^，,；;。]{1,100}[，,]\s*/u.exec(part);
  const body = context && !/(?:团队|小组|我们|同事|导师|经理|他们|她们|表示|声称|说明|报告|计划|打算|将要|未|没有)/u.test(context[0])
    ? part.slice(context[0].length) : part;
  const zh = chineseGuidance.exec(body);
  if (zh) {
    const action = body.slice(zh[0].length).replace(/^[，,\s]*(?:我|本人)?/u, "");
    if (action.startsWith("由") && !personalPassivePractice.test(action)) return false;
    return !/^(?:团队|小组|我们|同事|其他人|学员们|他们|她们|安排|要求|让|叫|记录|说明|解释|报告|描述|计划|打算|准备|将|会|没有|未能|不会)/u.test(action) && practiceAction.test(action);
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
  if (/\b(?:documented|reported|explained|described|recorded|noted|said|wrote)\b[^.;]{0,80}\b(?:that|how|whether)\b/iu.test(action)
    || /\b(?:my|our|the|a|an)\s+(?:colleagues?|team|manager|mentor|interns?|supervisor)\s+(?:used|built|practised|practiced|rehearsed|ran|wrote|made|tested|configured|implemented)\b/iu.test(action)) return false;
  return /^(?:(?:have|had|also|only|previously|personally)\s+)*(?:[\w-]+ed|built|ran|wrote|made|did|set|took|drew|used)\b/iu.test(action)
    && !/\b(?:planned|enrolled|hired|intended|asked|wanted|expected|hoped|watched|observed|pretended|claimed)\b/iu.test(action);
}

function guidedSkillScope(raw: string, text: string) {
  // A trailing mentor contribution can support an assisted-practice suggestion,
  // but its own tools must not become the learner's skills.
  const help = /[，,]\s*[^，,；;。]{0,35}由(?:导师|同伴|同事|老师|讲师|结对伙伴)(?:协助|帮助|指导)/u.exec(text);
  if (help && !/(?:并非|不是|没有|未|不曾|从未|将|计划|打算|准备|待)/u.test(help[0])) {
    const own = text.slice(0, help.index);
    if (/^(?:我|本人)?(?:曾|以前|之前)?(?:用|使用)\s*\S.{0,80}(?:写过|编写|完成|实现|配置|搭建|练习|测试)/u.test(own)
      && !/(?:没有|并未|从未|未曾|计划|打算|将要|声称|报告)/u.test(own)) return raw.slice(0, help.index);
  }
  if (!guidedPractice(text)) return null;
  const fragment = instructionalFragmentStart(text);
  if (fragment !== null) return raw.slice(fragment);
  const actor = /\bI\s+/iu.exec(text);
  return actor ? raw.slice(actor.index) : raw;
}

function personalCapabilityQuestion(quote: string, masked: string) {
  // A stated limit can justify asking the user to assess themselves without
  // implying that they are uncertain, conceptual, guided, or entirely unskilled.
  return assessmentScopes(quote, masked).some(({ text }) =>
    /^I (?:(?:cannot|can['’]t)(?: yet)?|am not (?:yet )?able to)\s+(?:configure|design|build|implement|run|complete|deploy|test|debug|repair)\b[^.;]{0,160}\b(?:myself|independently|on my own)\b/iu.test(text)
    || /^I (?:have|had) not (?:yet )?(?:designed|built|implemented|run|completed|deployed|configured|tested)\b[^.;]{0,160}\b(?:want|need|would like)\s+(?:more )?practice\b/iu.test(text));
}

const scopeBreak = /[;；]|,?\s+\b(?:but|whereas|while|although|however|rather than|except for|excluding)\b\s*|,?\s+\band\s+(?=(?:I|we|our|they|my|she|he|the|have|had|never|not|independently)\b)|(?:,\s*|\s+and\s+)(?=(?:[\p{L}\p{N}_][\p{L}\p{N}_.+#'’-]*\s+){1,5}(?:is|are|was|were|has|have|uses?|used|requires?|manages?|maintains?)\b)|[,，]\s*(?=(?:not|except)\b)|[，,]?\s*(?:但是|不过|然而|而非|但(?=[\p{L}]))|[，,]\s*(?=(?:我(?:独立|还|也|负责)|同事|导师|团队|小组|他们|她们))/giu;
function assessmentScopes(quote: string, masked: string) {
  const scopes: { raw: string; text: string }[] = [];
  let start = 0;
  function add(end: number) {
    const text = masked.slice(start, end).replace(/\s+/gu, " ").trim();
    if (text && !hypothetical.test(text) && !deniedAssertion.test(text)) scopes.push({ raw: quote.slice(start, end), text });
  }
  for (const separator of masked.matchAll(scopeBreak)) {
    add(separator.index);
    start = separator.index + separator[0].length;
  }
  add(masked.length);
  return scopes;
}
function personalUncertainty(part: string) {
  return !deniedConflict.test(part) && !/\b(?:my|our) (?:team|colleague)['’]s\b|(?:团队|小组)的?(?:能力|自评)/iu.test(part)
    && (selfUncertain.test(part) || (/(?:\bmy\b|我|^自评)/iu.test(part) && selfConflict.test(part)));
}
function supportsLevel(quote: string, masked: string, proposed: NonNullable<Hint>, labels?: readonly string[]) {
  const scopes = assessmentScopes(quote, masked);
  if (proposed !== "uncertain" && scopes.some(scope => personalUncertainty(scope.text))) return false;
  const supported = scopes.flatMap(scope => {
    const raw = scope.raw.replace(/\s+/gu, " ").trim(), text = maskQuotes(raw);
    if (proposed === "guided") {
      const evidence = guidedSkillScope(raw, text);
      return evidence ? [evidence] : [];
    }
    return (proposed === "uncertain" ? personalUncertainty(text) : englishConceptual.test(text) || chineseConceptual.test(text)) ? [raw] : [];
  });
  if (!supported.length) return false;
  // In v2 these labels have already been grounded in the complete quote. Re-check
  // each against the supported clause(s) when part of the quote lies outside them.
  return !labels?.length || labels.every(label => supported.some(scope => assertedSkillEvidence(scope, label)));
}

/** A proposed level is optional, and an individual skill rating requires personal evidence. */
export function groundSourceSelfLevelHint(item: EvidenceItem): Hint {
  if (!item.selfLevelHint || (item.kind !== "experience" && item.kind !== "skill-claim")) return null;
  return supportsLevel(item.source.quote, maskQuotes(item.source.quote), item.selfLevelHint, item.skillLabels) ? item.selfLevelHint : null;
}

type Anchor = { start: number; end: number; code?: Code; item?: EvidenceItem; pairedConflict?: boolean };

// Compare asserted propositions, including review-only statements, instead of
// treating the model's proposed priority or a shared skill label as evidence.
const prioritySlot = /\b(?:(?:is|are)\s+)?(?:required|mandatory|must-have|preferred|optional|nice-to-have)\b|(?:仅)?(?:是|为|属于|列为|标为)?(?:必备(?:技能|条件|项)?|必需(?:条件|技能|项)?|加分(?:项)?|优先项|可选项)/giu;
const structuralRequirementLabel = /^(?:(?:role |job )?(?:summary|overview)|requirements?|qualifications?|岗位摘要|职位摘要|任职清单|要求清单|任职要求|岗位要求|岗位职责|摘要)\s*[:：]\s*/iu;
const conditionalPriority = /\b(?:not|no|never|if|unless|whether|might|may|isn['’]t|aren['’]t|depending|except)\b|(?:未|不|没有|如果|是否|可能|仅在|仅限|取决于)/iu;
function priorityAssertion(value: string) {
  let raw = value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim().replace(structuralRequirementLabel, "");
  // An unresolved precedence note does not change the first clause's subject.
  raw = raw.replace(/[;；]\s*(?:本|该|此)?(?:清单|摘要|章节|段落)[^;；。]{0,35}优先级(?:尚|仍)?未说明[。.]?$/u, "");
  const masked = maskQuotes(raw);
  const exclusive = /[,，]\s*(?:(?:but )?(?:it is |is )?not (?:required|mandatory)|不是必备|并非必备)[.!?。！？]*$/iu.exec(masked);
  if (exclusive && /\b(?:preferred|optional|nice-to-have)\b|(?:加分|可选)/iu.test(masked.slice(0, exclusive.index))) raw = raw.slice(0, exclusive.index);
  const text = maskQuotes(raw);
  if (hypothetical.test(text) || deniedAssertion.test(text) || conditionalPriority.test(text)
    || /\b(?:example|sample|said|says|claimed|claims)\b|(?:示例|举例|假设|声称)/iu.test(text)) return null;
  const matches = [...text.matchAll(prioritySlot)];
  if (matches.length !== 1) return null;
  const cue = matches[0]!;
  let subject = raw.slice(0, cue.index).trim();
  const quotedSubject = [...subject.matchAll(quoted)];
  if (quotedSubject.length === 1 && quotedSubject[0]!.index === 0 && quotedSubject[0]![0].length === subject.length) {
    const label = subject.slice(1, -1).trim();
    if (!/[.!?;:。！？；：]/u.test(label) && ![...label.matchAll(prioritySlot)].length) subject = label;
  }
  const qualifier = raw.slice(cue.index + cue[0].length).replace(/[.!?。！？]+$/u, "").trim();
  if (!subject || /\b(?:and|but|while|whereas)\b|(?:和|而|但)/iu.test(maskQuotes(subject))
    || (qualifier && !/^(?:for|in|on|at|during|among|to|as)\b|^(?:适用|面向|针对)/iu.test(qualifier))) return null;
  return { key: subject + " # " + qualifier, level: /required|mandatory|must-have|必备|必需/u.test(cue[0]) ? "must" as const : "preferred" as const };
}

function priorityAssertions(raw: string) {
  const single = priorityAssertion(raw);
  if (single) return [single];
  const text = maskQuotes(raw);
  if (hypothetical.test(text) || deniedAssertion.test(text) || /\b(?:example|sample)\b|(?:示例|举例|假设)/iu.test(text)) return [];
  const body = raw.replace(/^(?:同一份|本|该|此)[^。；]{0,20}(?:同时写着|同时列出)\s*/u, "");
  const parts = body.split(/\s+(?:and|but)\s+|和/u);
  if (parts.length !== 2) return [];
  const pair = parts.map(priorityAssertion);
  return pair.every(part => part !== null) ? pair : [];
}

function requirementSection(text: string, start: number) {
  let section = "";
  for (const line of text.matchAll(/[^\r\n]+/gu)) {
    if (line.index >= start) break;
    const value = line[0].trim();
    const heading = /^#{1,6}\s|^(?:\*\*|__)/u.test(value);
    if (line.index + line[0].length > start || (!heading && /[.!?。！？]/u.test(value)) || isRequirementLevelHeading(value)
      || structuralRequirementLabel.test(value.endsWith(":") || value.endsWith("：") ? value : value + ":")
      || [...maskQuotes(value).matchAll(prioritySlot)].length) continue;
    // An unrecognized standalone heading can identify another company or role.
    section = value.normalize("NFKC").toLowerCase();
  }
  return section;
}

function markPairedConflicts(anchors: Anchor[], text: string) {
  const groups = new Map<string, { must: Anchor[]; preferred: Anchor[] }>();
  const masked = maskQuotes(text);
  for (const anchor of anchors) {
    // Keep full-document quotation scope: an inner sentence of a quoted example
    // cannot become an assertion just because a statement boundary cuts it out.
    if (![...masked.slice(anchor.start, anchor.end).matchAll(prioritySlot)].length) continue;
    const section = requirementSection(text, anchor.start);
    for (const assertion of priorityAssertions(text.slice(anchor.start, anchor.end))) {
      const key = JSON.stringify([section, assertion.key]);
      const pair = groups.get(key) ?? { must: [], preferred: [] };
      pair[assertion.level].push(anchor);
      groups.set(key, pair);
    }
  }
  for (const { must, preferred } of groups.values()) {
    if (must.length && preferred.length) for (const anchor of [...must, ...preferred]) anchor.pairedConflict = true;
  }
}

function supportedCodes(quote: string, masked: string, anchors: Anchor[]) {
  const codes = new Set<Code>();
  if (hasLiteralUrl(quote)) codes.add("untrusted-resource-url");
  const addressed = commandToAssistant.exec(masked);
  if (addressed) {
    const directive = quote.slice(addressed[0].length).replace(/^["“‘'「『]\s*/u, "");
    if (instructionOverride.test(directive) || falsifiedResult.test(directive)) codes.add("prompt-injection");
  }
  const experience = anchors.some(anchor => anchor.item?.kind === "experience");
  const teamSuggested = anchors.some(anchor => anchor.code === "team-attribution");
  if (anchors.some(anchor => anchor.pairedConflict)) codes.add("conflicting-requirement");
  for (const clause of assertedClauses(masked)) {
    if (hasCurriculumGap(clause)) codes.add("uncovered-skill");
    if (instructionOverride.test(clause) || falsifiedResult.test(clause)) codes.add("prompt-injection");
    if (unclearTeamRole.test(clause) || (groupAchievement.test(clause) && (experience || teamSuggested || personalTeamScope.test(clause)))) codes.add("team-attribution");
    if (!deniedConflict.test(clause)) {
      if (selfConflict.test(clause)) codes.add("conflicting-self-assessment");
      if (requirementConflict.test(clause) || dualPriority.test(clause)) codes.add("conflicting-requirement");
    }
    if (missingInformation.test(clause)) codes.add("missing-information");
  }
  const hint = anchors.some(({ item }) => item && (item.kind === "experience" || item.kind === "skill-claim")
    && item.selfLevelHint && supportsLevel(quote, masked, item.selfLevelHint, item.skillLabels));
  const asked = anchors.some(anchor => anchor.code === "confirm-self-assessment");
  const labels = anchors.flatMap(anchor => anchor.item?.skillLabels ?? []);
  if (hint || (asked && ((["conceptual", "guided", "uncertain"] as const).some(level => supportsLevel(quote, masked, level, labels))
    || personalCapabilityQuestion(quote, masked)))) {
    codes.add("confirm-self-assessment");
  }
  return codes;
}

/** Ground unresolved reminders in complete, uniquely locatable statements. Never open links. */
export function groundSourceReviewPoints(
  points: readonly DocumentCandidateReviewPoint[], items: readonly EvidenceItem[], sources: Sources,
  bounds?: ReadonlyMap<number, number>,
): DocumentCandidateReviewPoint[] | null {
  if (points.length > 100 || items.length > 100) return null;
  const segments = [...sources.segments].sort((a, b) => a.start - b.start);
  const byId = new Map(segments.map(segment => [segment.id, segment]));
  if (byId.size !== segments.length || segments.some((segment, i) => i > 0 && segment.start < segments[i - 1]!.end)) return null;
  function locate(reference: Source) {
    const segment = byId.get(reference.segmentId);
    return segment && reference.quote.trim() ? locateCandidateQuote(reference, { text: sources.text, segments: [segment] }) : null;
  }
  const anchors: Anchor[] = [];
  for (const { code, source } of points) {
    const span = locate(source);
    if (!span) return null;
    anchors.push({ ...span, code });
  }
  for (const item of items) {
    const span = locate(item.source);
    if (!span) return null;
    anchors.push({ ...span, item });
  }

  // A list entry can have two valid starts (with and without its marker).
  // Keep its original outer bound for matching and use its text for the canonical citation.
  const entries = new Map<number, { start: number; outerStart: number }>();
  for (const [start, end] of bounds ?? groundedStatementBoundaries(sources.text)) {
    entries.set(end, { start, outerStart: entries.get(end)?.outerStart ?? start });
  }
  if (sources.text.trim() && !entries.size) return null;
  const masked = maskQuotes(sources.text);
  const statements: Anchor[] = [...entries].map(([end, { start }]) => ({ start, end }));
  markPairedConflicts(statements, sources.text);
  anchors.push(...statements.filter(anchor => anchor.pairedConflict));
  anchors.sort((a, b) => a.start - b.start);
  const result: DocumentCandidateReviewPoint[] = [];
  let anchorIndex = 0, segmentIndex = 0;
  for (const [end, { start, outerStart }] of entries) {
    const local: Anchor[] = [];
    while (anchorIndex < anchors.length && anchors[anchorIndex]!.start < end) {
      const anchor = anchors[anchorIndex++]!;
      if (anchor.start >= outerStart && anchor.end <= end) local.push(anchor);
    }
    const quote = sources.text.slice(start, end);
    const codes = supportedCodes(quote, masked.slice(start, end), local);
    if (!codes.size) continue;
    while (segmentIndex < segments.length && segments[segmentIndex]!.end <= start) segmentIndex++;
    const segment = segments[segmentIndex];
    if (!segment || segment.start > start || segment.end < end || quote.length > 1000 || result.length + codes.size > 100) return null;
    const source = { segmentId: segment.id, quote };
    const exact = locate(source);
    if (exact?.start !== start || exact.end !== end) return null;
    for (const code of codes) result.push({ code, source });
  }
  return documentCandidateReviewPointsSchema.safeParse(result).success ? result : null;
}
