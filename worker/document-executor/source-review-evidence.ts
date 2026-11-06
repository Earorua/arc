import {
  documentCandidateReviewPointsSchema, locateCandidateQuote,
  type DocumentCandidate, type DocumentCandidateReviewPoint, type MaterialReferenceContext,
} from "../../app/contracts/documents";
import { findMaterialSkillEvidence } from "../../app/lib/materials/grounded-skill-terms";
import { statementBoundaries } from "./source-statements";

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
  return statementBoundaries(layout);
}

const instructionOverride = /^(?:(?:instructions? (?:for|to) (?:the )?(?:assistant|model)|assistant|system|ai)\s*[:,，：]\s*)?(?:please\s+)?(?:ignore|disregard|override|forget|bypass)\s+(?:(?:all|any|the|your|system|higher.priority|earlier|above|preceding|prior|previous|original)\s+){1,6}(?:instructions?|prompts?|rules?|safeguards?)\b|^(?:(?:给|致)?(?:助手|模型|系统)[：:，,]\s*)?(?:请|务必|必须|现在)*(?:忽略|无视|绕过|覆盖)(?:之前|先前|此前|上面|上述|前面|原有|所有|全部|系统|的)*(?:指令|指示|提示词|规则)/iu;
const falsifiedResult = /^(?:(?:assistant|model|system|ai)\s*[:,，：]\s*)?(?:please\s+|you must\s+)?(?:mark|set|report|declare)\s+[^.;]{0,70}\b(?:skills?|proficiency|mastery|applicant|tasks?)\b[^.;]{0,25}\b(?:verified|mastered|complete)\b|^(?:请|务必|直接|强制|要求模型|要求助手)*(?:把|将)[^。]{0,48}(?:技能|能力|任务)[^。]{0,18}(?:标记|写|判定|设定)为(?:已验证|已掌握|已完成)/iu;
const commandToAssistant = /^(?:(?:assistant|model|ai)\s*[:,，：]\s*(?:follow|obey|execute) (?:this|the following) (?:instruction|command|directive)|(?:助手|模型)[：:，,]\s*请?(?:执行|遵循)(?:以下|这个)(?:指令|命令))\s*[:：]\s*/iu;

const groupAchievement = /\b(?:we|(?:our|my|the)(?:\s+[\w-]+){0,2}\s+(?:team|group))\s+(?:(?:successfully|jointly|collectively|has|have)\s+)*(?:built|delivered|deployed|completed|launched|shipped|migrated|implemented|released|developed|operated|reduced|increased)\b|(?:我们(?:的)?(?:团队|小组)?|我所在的(?:团队|小组)|团队|小组)(?:共同|成功|一起|合作)*(?:完成|交付|上线|搭建|迁移|实现|发布|开发|部署|运维)了?/iu;
const personalTeamScope = /\b(?:my (?:own )?(?:role|part|contribution)|my team)\b|(?:我(?:的|仅|只|负责|所在的)|个人(?:职责|贡献|分工))/iu;
const unclearTeamRole = /\b(?:individual (?:contribution|role|ownership)|my (?:own )?(?:role|part|contribution)|ownership of (?:the |our )?(?:whole )?team)\s+(?:is|was|remains)\s+(?:unclear|unknown|undocumented|not (?:stated|specified|described))\b|(?:团队|小组).{0,40}(?:个人(?:贡献|职责|分工)|我负责的部分)(?:仍|尚)?(?:不明|不清楚|未知|未(?:说明|写明|明确))/iu;
const selfConflict = /\b(?:self[- ](?:assessments?|ratings?)|(?:my|personal) (?:skill |proficiency )?(?:ratings?|assessments?))\s+(?:(?:for|of|on)\s+[^,;]{1,60}\s+)?(?:conflict|contradict|disagree|(?:are|were) inconsistent)\b|(?:自评|自我(?:评价|评估)|能力评估)(?:前后|相互|彼此|有|存在|表述)*(?:矛盾|冲突|不一致)/iu;
const requirementConflict = /\b(?:requirements?|priorities|job descriptions?)\s+(?:(?:for|of|on|about)\s+[^,;]{1,60}\s+)?(?:conflict|contradict|disagree|(?:are|were) inconsistent)\b|(?:要求|优先级|必备条件)(?:前后|相互|彼此|有|存在|表述)*(?:矛盾|冲突|不一致)/iu;
const dualPriority = /\b(?:both (?:mandatory|required) and (?:optional|preferred)|(?:mandatory|required) in one (?:section|paragraph|list) (?:but|and) (?:only )?(?:optional|preferred) in another|one (?:section|paragraph|list) (?:calls|lists|marks)\s+.{1,48}\s+(?:mandatory|required),?\s+(?:but|and)\s+another (?:calls|lists|marks) it (?:as )?(?:optional|preferred))\b|(?:同时|既)(?:被|列为|标为|是)*(?:必备|必需|必须)(?:又列为|又标为|和|又是)(?:可选|加分|优先)/iu;
const deniedConflict = /\b(?:(?:do(?:es)? not|never|no longer) (?:conflict|contradict|disagree)|no (?:remaining )?conflict|conflict (?:is|was|has been) resolved)\b|(?:没有|并无|不存在|已解决|并不)(?:矛盾|冲突)/iu;
const missingInformation = /\b(?:availability|study time|time budget|hours|proficiency level|experience level|requirement priority)\s+(?:(?:is|are|was|were|remains?)\s+)?(?:not (?:stated|specified|given|provided|documented)|unknown|unspecified|undocumented)\b|(?:可用(?:的)?(?:学习)?时间|学习时间|时间预算|能力水平|要求优先级)(?:目前|仍|尚|未被)*(?:未(?:说明|明确|提供|填写|给出)|不详|未知)/iu;

const englishConceptual = /^I(?:['’]m| am| was)\s+(?:(?:only|somewhat|basically)\s+)?familiar with\b|^I (?:have|had)\s+(?:(?:only|a|some|basic|conceptual|theoretical|limited)\s+)+(?:knowledge|understanding|familiarity) (?:of|with)\b|^my experience (?:with|of|in)\b.{1,60}\bis limited to reading\b|^I (?:have )?only read (?:about|the documentation for)\b/iu;
const chineseConceptual = /^(?:我|本人)?(?:目前|仅|只|基本|初步|比较)*(?:了解|熟悉)\s*[\p{L}\p{N}]|^(?:我|本人)?对[^，,；;。]{1,55}(?:只有|仅有|有|只有一点|有些)(?:基础|基本|初步|概念上|理论上)的?(?:了解|认识|理解)|^(?:我|本人)?(?:目前|此前|对[^，,。]{1,40})?(?:仅|只)(?:读过|阅读过|有阅读[^，,。]{0,45}(?:经验|经历))/u;
const supervised = /\b(?:under (?:[\w'’-]+ ){0,2}(?:supervision|guidance|review)|with (?:[\w'’-]+ ){0,3}(?:guidance|supervision)|with (?:my|a|the) (?:mentor|instructor|supervisor)['’]s help|(?:during|in|on) (?:a|my|the) supervised (?:placement|internship|exercise|workshop|lab|session|project))\b/iu;
const selfUncertain = /^I(?:['’]m| am| remain)\s+(?:(?:still|currently)\s+)?(?:unsure|uncertain|not sure) (?:about (?:my|whether)|whether I|if I)\b|^我(?:目前|还|仍)?(?:不确定|不清楚)(?:自己|我|是否|能否)|^(?:我的|我对).{0,45}自评(?:仍|还)?不确定/iu;
const chineseGuidance = /^(?:我|本人)?(?:之前|目前|此前|曾经|只|仅|曾|还)*(?:在[^，,；;。]{0,20}(?:指导|监督|辅导|带领|复核|审阅|review)\s*下|由[^，,；;。]{1,16}(?:指导|带领)|(?:跟随|跟着|按(?:照)?|依照)[^，,；;。]{0,18}?(?:教程|示例|样例|示范|演示))/iu;
const practiceAction = /(?:练习|演练|复现|操作|使用|实现|完成|实践|调试|配置|部署|搭建|编写|制作|做过|执行|测试|修复|排查|构建|开发)/u;
const guidedNegation = /\b(?:without (?:any )?(?:guidance|supervision)|(?:under|with) (?:no|zero) (?:guidance|supervision)|my (?:colleagues?|team)|the (?:team|interns?))\b|(?:无须|无需|没有|未经|未受)(?:任何|导师|同伴|老师|他人|的)*(?:指导|监督|复核)|(?:下|指导[，,]\s*)(?:并|也|仍)?(?:未能|不会|没有|不曾|从未)/iu;
function guidedPractice(part: string) {
  if (guidedNegation.test(part)) return false;
  const zh = chineseGuidance.exec(part);
  if (zh) {
    const action = part.slice(zh[0].length);
    return !/^[，,\s]*(?:团队|小组|我们|同事|其他人|学员们|他们|她们)/u.test(action) && practiceAction.test(action);
  }
  if (!supervised.test(part)) return false;
  // The speaker must actually practise. A fronted qualifier can precede I, while
  // a supervisor's/team's achievement or a plan to practise cannot supply a level.
  const actor = /\bI\s+/iu.exec(part);
  if (!actor) return false;
  const prefix = part.slice(0, actor.index);
  if (prefix && (!/^(?:with|under|during|in|on)\b/iu.test(prefix) || !supervised.test(prefix))) return false;
  const action = part.slice(actor.index + actor[0].length);
  return /^(?:(?:have|had|also|only|previously|personally)\s+)*(?:[\w-]+ed|built|ran|wrote|made|did|set|took|drew|used)\b/iu.test(action)
    && !/\b(?:planned|enrolled|hired|intended|asked|wanted|expected|hoped|watched|observed|pretended|claimed)\b/iu.test(action);
}

const scopeBreak = /[;；]|,?\s+\b(?:but|whereas|while|although|however|rather than|except for|excluding)\b\s*|,?\s+\band\s+(?=(?:I|we|our|they|my|she|he|the|have|had|never|not|independently)\b)|[,，]\s*(?=(?:not|except)\b)|[，,]?\s*(?:但是|不过|然而|而非|但(?=[\p{L}]))|[，,]\s*(?=(?:我(?:独立|还|也|负责)|同事|导师|团队|小组|他们|她们))/giu;
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
  const supported = scopes.filter(({ text }) => {
    if (proposed === "uncertain") return personalUncertainty(text);
    if (proposed === "conceptual") return englishConceptual.test(text) || chineseConceptual.test(text);
    return guidedPractice(text);
  });
  if (!supported.length) return false;
  // In v2 these labels have already been grounded in the complete quote. Re-check
  // each against the supported clause(s) when part of the quote lies outside them.
  if (supported.length === 1 && supported[0]!.raw === quote) return true;
  return !labels?.length || labels.every(label => supported.some(scope => findMaterialSkillEvidence(scope.raw, label) !== null));
}

/** A proposed level is optional, and an individual skill rating requires personal evidence. */
export function groundSourceSelfLevelHint(item: EvidenceItem): Hint {
  if (!item.selfLevelHint || (item.kind !== "experience" && item.kind !== "skill-claim")) return null;
  return supportsLevel(item.source.quote, maskQuotes(item.source.quote), item.selfLevelHint, item.skillLabels) ? item.selfLevelHint : null;
}

type Anchor = { start: number; end: number; code?: Code; item?: EvidenceItem; pairedConflict?: boolean };

// Compare only an explicitly required/preferred version of the same proposition.
// The grounded name and every remaining qualifier, actor and object form the key.
// A shared skill label by itself cannot establish a contradiction.
const prioritySlot = /\b(?:(?:is|are)\s+)?(?:required|mandatory|must-have|preferred|optional|nice-to-have)\b|(?:是|属于|列为|标为)?(?:必备(?:技能|条件|项)?|必需(?:条件|技能|项)?|加分项|优先项|可选项)/giu;
function markPairedConflicts(anchors: Anchor[], masked: string) {
  const groups = new Map<string, { must: Anchor[]; preferred: Anchor[] }>();
  for (const anchor of anchors) {
    const item = anchor.item;
    if (item?.kind !== "requirement" || !item.skillLabels || item.skillLabels.length !== 1
      || (item.requirementLevel !== "must" && item.requirementLevel !== "preferred")) continue;
    const line = masked.slice(anchor.start, anchor.end).normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
    const skill = item.skillLabels[0]!.normalize("NFKC").toLowerCase().trim();
    if (!skill || !line.includes(skill) || assertedClauses(line).length !== 1
      || /\b(?:not|no|never|if|unless|whether|might|may|isn['’]t|aren['’]t)\b|(?:未|不|没有|如果|是否|可能)/iu.test(line)) continue;
    const matches = [...line.matchAll(prioritySlot)];
    if (matches.length !== 1) continue;
    const cue = matches[0]!;
    const explicit = /required|mandatory|must-have|必备|必需/u.test(cue[0]) ? "must" : "preferred";
    if (explicit !== item.requirementLevel) continue;
    const neutral = line.slice(0, cue.index) + " # " + line.slice(cue.index + cue[0].length);
    const signature = neutral.replace(/[.!?。！？]+$/u, "").replace(/\s+/gu, " ").trim();
    const key = JSON.stringify([skill, signature]);
    const pair = groups.get(key) ?? { must: [], preferred: [] };
    pair[explicit].push(anchor);
    groups.set(key, pair);
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
  if (hint || (asked && (["conceptual", "guided", "uncertain"] as const).some(level => supportsLevel(quote, masked, level)))) {
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
  anchors.sort((a, b) => a.start - b.start);

  // A list entry can have two valid starts (with and without its marker).
  // Keep its original outer bound for matching and use its text for the canonical citation.
  const entries = new Map<number, { start: number; outerStart: number }>();
  for (const [start, end] of bounds ?? groundedStatementBoundaries(sources.text)) {
    entries.set(end, { start, outerStart: entries.get(end)?.outerStart ?? start });
  }
  if (sources.text.trim() && !entries.size) return null;
  const masked = maskQuotes(sources.text);
  markPairedConflicts(anchors, masked);
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
