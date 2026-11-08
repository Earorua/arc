import {
  documentCandidateReviewPointsSchema, locateCandidateQuote,
  type DocumentCandidate, type DocumentCandidateReviewPoint, type MaterialReferenceContext,
} from "../../app/contracts/documents";
import {
  deniedConflict, hasPersonalCapabilityQuestion, hasPersonalPracticeNeed, selfConflict,
  supportsMaterialSelfLevelHint, supportsSelfLevelHintInScope,
} from "../../app/lib/materials/self-assessment-evidence";
import { deniedAssertion, hypothetical, maskQuotes, quoted } from "../../app/lib/materials/quotation-evidence";
import { statementBoundaries } from "./source-statements";
import { isRequirementLevelHeading } from "./source-requirement-evidence";

type EvidenceItem = Pick<DocumentCandidate, "kind" | "source" | "selfLevelHint"> &
  Partial<Pick<DocumentCandidate, "requirementLevel" | "skillLabels">>;
type Sources = Pick<MaterialReferenceContext, "text" | "segments">;
type Code = DocumentCandidateReviewPoint["code"];
type Source = DocumentCandidateReviewPoint["source"];
type Hint = DocumentCandidate["selfLevelHint"];

/** A sentence detached from an enclosing quotation loses who actually asserted it. */
export function isDetachedQuotedStatement(source: Source, sources: Sources) {
  const span = locateCandidateQuote(source, sources);
  return !span || Array.from(sources.text.matchAll(quoted)).some(match => match.index < span.start && match.index + match[0].length >= span.end);
}

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
const requirementConflict = /\b(?:requirements?|priorities|job descriptions?)\s+(?:(?:for|of|on|about)\s+[^,;]{1,60}\s+)?(?:conflict|contradict|disagree|(?:are|were) inconsistent)\b|(?:要求|优先级|必备条件)(?:前后|相互|彼此|有|存在|表述)*(?:矛盾|冲突|不一致)/iu;
const dualPriority = /\b(?:both (?:mandatory|required) and (?:optional|preferred)|(?:mandatory|required) in one (?:section|paragraph|list) (?:but|and) (?:only )?(?:optional|preferred) in another|one (?:section|paragraph|list) (?:calls|lists|marks)\s+.{1,48}\s+(?:mandatory|required),?\s+(?:but|and)\s+another (?:calls|lists|marks) it (?:as )?(?:optional|preferred))\b|(?:同时|既)(?:被|列为|标为|是)*(?:必备|必需|必须)(?:又列为|又标为|和|又是)(?:可选|加分|优先)/iu;
const missingInformation = /\b(?:availability|available time|study time|work(?:ing)? time|time budget|hours|proficiency level|experience level|years of experience|requirement priority|(?:remote )?location|salary)\s*[:：]?\s*(?:(?:is|are|was|were|remains?)\s+)?(?:not (?:stated|specified|given|provided|documented)|unknown|unspecified|undocumented)\b|(?:可用(?:的)?(?:学习)?时间|学习时间|工作时间|时间预算|能力水平|要求优先级|(?:远程)?地点|薪酬|经验年限|个人职责|个人贡献)\s*[:：]?\s*(?:目前|仍|尚|未被|均|都)*(?:未(?:说明|明确|提供|填写|给出)|不详|未知)/iu;
const missingPersonalResponsibility = /^(?:本人|我)(?:是否(?:亲自|独立)?(?:编写|完成|实现|配置|设计|测试|部署)[^，,；;。]{1,60}|负责的(?:范围|部分|工作|职责))\s*(?:仍|尚)?(?:待确认|未确认|未明确)[。.]?$|^Whether I (?:personally )?(?:wrote|completed|implemented|configured|designed|tested|deployed)\b[^.;]{1,100}\s+(?:is|remains)\s+(?:unconfirmed|unknown|not (?:confirmed|specified))[.!]?$/iu;

/** A proposed level is optional, and an individual skill rating requires personal evidence. */
export function groundSourceSelfLevelHint(item: EvidenceItem): Hint {
  return supportsMaterialSelfLevelHint({ kind: item.kind, text: item.source.quote, labels: item.skillLabels, level: item.selfLevelHint }) ? item.selfLevelHint : null;
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
  // “Whether I wrote … remains unconfirmed” states an actual omission. Its
  // question-shaped subject must not be mistaken for a hypothetical assertion.
  if (masked.split(/[;；]/u).some(clause => missingPersonalResponsibility.test(clause.trim())
    && !/(?:并非|不是|不再)\s*(?:待确认|未确认|未明确)/u.test(clause))) codes.add("missing-information");
  const hint = anchors.some(({ item }) => item && (item.kind === "experience" || item.kind === "skill-claim")
    && item.selfLevelHint && supportsSelfLevelHintInScope(quote, masked, item.selfLevelHint, item.skillLabels));
  const personal = anchors.some(({ item }) => item?.kind === "experience" || item?.kind === "skill-claim");
  // An explicit unpractised learning need can remain a constraint and still
  // warrant a question. It does not supply a level or reclassify the fact.
  const learningLimit = anchors.some(({ item }) => item?.kind === "constraint")
    && hasPersonalPracticeNeed(quote, masked);
  const noItems = !anchors.some(anchor => anchor.item);
  const asked = anchors.some(anchor => anchor.code === "confirm-self-assessment");
  const labels = anchors.flatMap(anchor => anchor.item?.skillLabels ?? []);
  if (hint || learningLimit || ((personal || noItems) && hasPersonalCapabilityQuestion(quote, masked, personal))
    || (asked && personal && (["conceptual", "guided", "uncertain"] as const).some(level => supportsSelfLevelHintInScope(quote, masked, level, labels)))) {
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
