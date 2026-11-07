import { MAX_MATERIAL_SKILL_LABELS_PER_ITEM } from "../../contracts/documents";

const graphemes = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("und", { granularity: "grapheme" }) : null;
const words = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("zh", { granularity: "word" }) : null;
const maxLabelLength = 100;
// Final sigma lowercases contextually; use the same form in a full label and in a source grapheme.
const fold = (term: string) => term.normalize("NFKC").toLowerCase().replace(/ς/gu, "σ");

// A cleaning action needs an explicit data object. For ambiguous objects such as
// records and fields, require a data-quality or data-domain qualifier as well.
const enQualifier = "(?:raw|source|missing|null|invalid|duplicate|incomplete|inconsistent|customer|order|sales|transaction|inventory|survey|sensor|sample|event|financial)";
const enObject = String.raw`(?:(?:${enQualifier}\s+){0,2}(?:datasets?|data\s+sets?|data)|(?:${enQualifier}\s+){1,2}(?:records?|rows?|values?|fields?|entries))`;
const enAction = String.raw`(?:clean(?:s|ed|ing)?|cleans(?:e|es|ed|ing))\s+(?:(?:the|our|my|their)\s+)?${enObject}`;
const zhQualifier = "(?:原始|缺失|空值|无效|重复|异常|不完整|不一致|客户|订单|销售|交易|库存|调查|传感器|样本|事件|财务)";
const zhObject = `(?:(?:${zhQualifier}){0,2}(?:数据集|数据)|(?:${zhQualifier}){1,2}(?:记录|行|字段|条目|数值|值)|空值|缺失值)`;
const cleaningActions = `${enAction}|清洗[了过]?${zhObject}|对${zhObject}(?:进行|做|开展)[了过]?清洗`;
const wholeCleaningAction = new RegExp(`^(?:${cleaningActions})$`, "u");
const cleaningSpans = new RegExp(cleaningActions, "gu");
const cleaningNames = ["data cleaning", "data cleansing", "数据清洗"];

// The first phrase is the stored label. These describe the same activity across
// inflections or languages. Tools, acronyms and role-specific mappings stay literal.
const reviewedForms: readonly (readonly string[])[] = [
  cleaningNames,
  ["data analysis", "analyze data", "analyzed data", "analyzing data", "analyse data", "analysed data", "analysing data", "数据分析", "分析数据", "分析了数据"],
  ["data visualization", "data visualisation", "visualize data", "visualized data", "visualizing data", "visualise data", "visualised data", "visualising data", "数据可视化"],
  ["code review", "code reviews", "review code", "reviewed code", "reviewing code", "代码评审", "代码审查", "审查代码"],
  ["usability testing", "usability test", "usability tests", "可用性测试"],
  ["financial modeling", "financial modelling", "财务建模"],
  ["spreadsheets", "spreadsheet", "电子表格"],
  ["unit testing", "unit test", "unit tests", "单元测试"],
  ["incremental loading", "增量加载"],
  ["component testing", "component test", "component tests", "组件测试"],
  ["dashboards", "dashboard"],
];

function reviewedGroup(token: string) {
  return wholeCleaningAction.test(token) ? cleaningNames : reviewedForms.find(group => group.includes(token));
}

function skillToken(value: string) {
  const term = value.trim();
  if (!term || term.length > maxLabelLength) return null;
  const token = fold(term);
  if (/^(?:(?:no|not|never|without|cannot|[a-z]+n['’]t)\s+|从未|尚未|未使用|不会|不懂|不熟悉|没有使用)/u.test(token)) return null;
  return /[\p{L}\p{N}]/u.test(token) ? token : null;
}

// A normalized UTF-16 index can fall inside a ligature or a combining sequence.
// Only whole source graphemes have addressable endpoints.
function indexQuote(text: string) {
  const parts = graphemes ? Array.from(graphemes.segment(text), entry => entry.segment) : text.match(/\P{M}\p{M}*|\p{M}+/gu) ?? [];
  const offsets = new Map([[0, 0]]);
  let normalized = "", originalEnd = 0;
  for (const part of parts) {
    normalized += fold(part);
    originalEnd += part.length;
    offsets.set(normalized.length, originalEnd);
  }
  const boundaries = words ? new Set(Array.from(words.segment(normalized), entry => entry.index)) : null;
  boundaries?.add(normalized.length);
  return { text, normalized, offsets, boundaries };
}

// ICU versions disagree about colon boundaries. Explicit skill headings make
// that colon punctuation; a namespace or URI such as "urn:Tool" does not.
const englishSkillHeading = String.raw`(?:required|preferred|essential|mandatory|optional)(?:\s+(?:skills?|tools?|experience|qualifications?))?|(?:(?:job|role)\s+)?(?:requirements|qualifications|summary|overview)|must(?:\s+have)?|nice\s+to\s+have|bonus|skills?|tools?|technologies|languages?|(?:tech|technology)\s+stack`;
const chineseSkillHeading = "任职(?:要求|资格|必备|清单)|(?:岗位|职位)(?:要求|职责|摘要|概述)|工作(?:要求|职责)|要求清单|摘要|概述|硬性要求|基本要求|要求|必须|必备(?:技能|条件)?|加分项?|优先(?:条件|要求)?|可选(?:技能|条件)?|技能|工具|技术栈|(?:我|本人)(?:使用了?|采用了?)(?:这些|以下)?工具";
const skillHeadingPrefix = new RegExp(String.raw`(?:^|\n)\s*(?:[-*•]\s*)?(?:${englishSkillHeading}|${chineseSkillHeading})\s*:\s*$`, "u");

function wordBoundary(quote: ReturnType<typeof indexQuote>, index: number) {
  if (quote.boundaries) return quote.boundaries.has(index) || skillHeadingPrefix.test(quote.normalized.slice(0, index));
  const left = quote.normalized.slice(0, index).match(/[\p{L}\p{M}\p{N}_]$/u)?.[0];
  const right = quote.normalized.slice(index).match(/^[\p{L}\p{M}\p{N}_]/u)?.[0];
  return !left || !right || /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u.test(left + right);
}

// Match a denial attached to the term (or to a list it belongs to). Allow only
// words introducing a skill, so an unrelated negative clause cannot erase it.
const deniedEnglishPrefix = /\b(?:no|not|never|neither|without|cannot|[a-z]+n['’]t|lack(?:s|ed|ing)?|unfamiliar)\b(?:\s+(?:(?!only\b)[a-z]{1,30}ly|yet|ever|any|prior|hands-on|practical|experience|knowledge|exposure|proficiency|proficient|familiarity|familiar|able|with|of|in|to|how|do|know|use|used|using|work|worked|working|have|had|been|trained|learned|need|require|required)){0,6}\s*:?\s*$/u;
const deniedEnglishSuffix = /^\s+(?:experience\s+)?(?:(?:is|was|were|are|has|had|have)\s+(?:not|never)|(?:is|was|were|are|has|had|have)n['’]t)\s+(?:been\s+)?(?:used|required|needed|necessary|prerequisites?|covered|supported)\b/u;
const deniedChinesePrefix = /(?:没(?:有)?|未|不|无[需须]?)(?:\s*(?:曾经|曾|会|能|懂|擅长|需要|要求|具备|学过|学会|学习|接触|使用|用|掌握|熟悉|了解|参与|做|进行|过|有)){0,5}\s*$/u;
const deniedChineseSuffix = /^\s*(?:经验\s*)?(?:并非|并不|不|未|从未|没有)(?:必需|必备|必要|需要|要求|使用|用过)/u;

// A list may join short literal phrases, but cannot swallow a predicate or
// cross a sentence/contrast boundary. The source quote permits 1000 UTF-16
// units, so even one-character members cannot have more than 500 neighbors.
// This bound is separate from the eight nominated labels and adds no taxonomy.
const listJoin = String.raw`(?:\s*(?:,|、)\s*(?:(?:and|or|nor)\s+)?|\s+(?:and|or|nor)\s+|\s*[和或及]\s*)`;
const listIdentifier = String.raw`(?!(?:and|or|nor|but|yet|however|is|are|was|were|has|have|had|no|not|never|neither|only|also|used|using|use|required|necessary|later|then|i|we|you|they|can|could|must|should|will|would)\b)(?:(?![和或及但却])[\p{L}\p{M}\p{N}_#+/-]|\.(?=[\p{L}\p{N}])){1,100}`;
const listItem = `${listIdentifier}(?:[ \t]+${listIdentifier}){0,3}`;
const precedingList = `(?:${listItem}${listJoin}){0,500}`;
const followingList = `(?:${listJoin}${listItem}){0,500}`;
const deniedListPrefix = new RegExp(`(?:${deniedEnglishPrefix.source.slice(0, -1)}|${deniedChinesePrefix.source.slice(0, -1)})${precedingList}$`, "u");
const deniedListSuffix = new RegExp(`^${followingList}(?:${deniedEnglishSuffix.source.slice(1)}|${deniedChineseSuffix.source.slice(1)})`, "u");
const toolUsePrefix = new RegExp(String.raw`(?:\b(?:use|used|using|with|in|tools|skills|microsoft)|使用|采用|熟悉|学习|工具|技能)\s*:?\s*${precedingList}$`, "u");
const languageUsePrefix = new RegExp(String.raw`(?:\b(?:in|with|using|used|use|languages?|skills)|使用|采用|熟悉|学习|技能)\s*:?\s*${precedingList}$`, "u");
const affirmativeUse = /(?:\b(?:use|used|using|know|knew|learned|learnt|need|require)|使用|采用|熟悉|学习|需要|要求)\s*$/u;

// Ignore quotation wrappers only while reading grammar. Apostrophes inside a
// word still carry contractions/possessives; source evidence and offsets stay
// untouched. A letter sentinel preserves that distinction beside the term.
function withoutQuoteWrappers(context: string) {
  return context.replace(/["“”‘«»‹›「」『』]|(?<![a-z0-9])['’]|['’](?![a-z0-9])/gu, "");
}

function supportsTerm(before: string, after: string, token: string, original: string) {
  before = withoutQuoteWrappers(before + "a").slice(0, -1);
  after = withoutQuoteWrappers("a" + after).slice(1);
  if (deniedListPrefix.test(before) || deniedEnglishSuffix.test(after) || deniedChineseSuffix.test(after)
    || (!affirmativeUse.test(before) && deniedListSuffix.test(after))) return false;
  if (/^clean\s/u.test(token) && (/\b(?:the|some|with|using|used|have|had|received|needs?|requires?|from)\s+$/u.test(before)
    || /^\s+(?:is|was|will be|must be)\b/u.test(after))) return false;
  if (/^(?:cleaned|cleansed)\s/u.test(token) && /\b(?:the|with|used|using|received|downloaded|provided)\s+$/u.test(before)) return false;
  if (wholeCleaningAction.test(token) && /^(?:库|中心|机房|硬件|设备|\s+(?:cent(?:er|re)|racks?|cabinets?|hardware|cables?)\b)/u.test(after)) return false;
  if (token === "it") return original.normalize("NFKC") === "IT";
  if (token === "react" || token === "excel") {
    const toolUse = toolUsePrefix.test(before);
    if (!toolUse && (/\b(?:i|we|you|they|can|could|must|should|will|would)\s+$/u.test(before)
      || (token === "react" && /^\s+(?:(?:(?:more|less)\s+)?[a-z]+ly|faster|slower|better|worse|to|when|if)\b/u.test(after))
      || (token === "excel" && /^\s+(?:at|in)\b/u.test(after)))) return false;
    // Lowercase verb/tool homographs require positive technical context. This
    // deliberately withholds bare "react"/"excel" while keeping named tools.
    const technicalNoun = token === "react" ? /^\s+components?\b/u : /^\s+spreadsheets?\b/u;
    if (original.normalize("NFKC") === token && !toolUse && !technicalNoun.test(after)) return false;
  }
  if (["go", "r", "c"].includes(token)) {
    return (!before.trim() && /^[.!。\s]*$/u.test(after) && /^[A-Z]/u.test(original.normalize("NFKC")))
      || languageUsePrefix.test(before)
      || /^\s*(?:\b(?:language|code|programming|scripts?|packages?|developer)\b|语言|代码|脚本|开发)/u.test(after);
  }
  return true;
}

function* literalEvidence(quote: ReturnType<typeof indexQuote>, token: string) {
  for (let at = quote.normalized.indexOf(token); at >= 0; at = quote.normalized.indexOf(token, at + 1)) {
    const limit = at + token.length, start = quote.offsets.get(at), end = quote.offsets.get(limit);
    if (start === undefined || end === undefined || end - start > maxLabelLength) continue;
    const before = quote.normalized.slice(0, at), after = quote.normalized.slice(limit), original = quote.text.slice(start, end);
    if (!wordBoundary(quote, at) || (!wordBoundary(quote, limit) && !/^['’]s\b/u.test(after))) continue;
    // A word boundary can still be inside a technical name such as .NET, C++ or WAI-ARIA.
    if (/[.#+]$|[\p{L}\p{N}_]-$/u.test(before) || /^[#+]|^[.-][\p{L}\p{N}_]/u.test(after)) continue;
    // Do not depend on ICU joining a URI/namespace, including unfamiliar and
    // non-Latin names. Whitespace after a prose colon remains a word boundary.
    if ((before.endsWith(":") && !skillHeadingPrefix.test(before)) || /^:[\p{L}\p{M}\p{N}_:]/u.test(after)) continue;
    if (supportsTerm(before, after, token, original)) yield original;
  }
}

function uniqueEvidence(quote: ReturnType<typeof indexQuote>, forms: readonly string[]): string | null {
  let evidence: string | null = null;
  const phrases = forms === cleaningNames
    ? new Set([...forms, ...Array.from(quote.normalized.matchAll(cleaningSpans), match => match[0])]) : forms;
  for (const form of phrases) {
    for (const match of literalEvidence(quote, form)) {
      // Labels refer to the uniquely located fact, not to separate term offsets.
      // Repeating the same supported spelling does not make that fact ambiguous.
      // Distinct original phrases still need a more specific nomination.
      if (evidence !== null && evidence !== match) return null;
      evidence = match;
    }
  }
  return evidence;
}

/** Recover the verbatim support for a retained literal or reviewed equivalent. */
export function findMaterialSkillEvidence(text: string, label: string): string | null {
  const token = skillToken(label);
  if (!token) return null;
  const forms = reviewedGroup(token);
  return uniqueEvidence(indexQuote(text), forms ?? [token]);
}

/** Bind only the wire's nominated source phrases before emitting any canonical label. */
export function groundMaterialSkillTerms(quote: string, terms: readonly string[]): string[] {
  if (!terms.length) return [];
  const source = indexQuote(quote), labels = new Set<string>();
  for (const term of terms.slice(0, MAX_MATERIAL_SKILL_LABELS_PER_ITEM)) {
    const token = skillToken(term);
    if (!token) continue;
    const evidence = uniqueEvidence(source, [token]);
    if (!evidence) continue;
    const forms = reviewedGroup(token);
    if (forms && uniqueEvidence(source, forms) !== evidence) continue;
    labels.add(forms?.[0] ?? evidence);
  }
  return [...labels];
}
