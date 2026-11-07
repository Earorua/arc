import { locateCandidateQuote, type DocumentCandidate, type MaterialReferenceContext } from "../../app/contracts/documents";

type Level = "must" | "preferred" | "unspecified";
type Sources = Pick<MaterialReferenceContext, "text" | "segments">;

// These are assertion patterns, not a skill vocabulary. New tool names have the
// same support as familiar ones; a provider's proposed level is never consulted.
const mandatory = [
  /\b(?:is|are|be|remains?)\s+(?:(?:strictly|absolutely|explicitly|both|a|an)\s+)?(?:required|mandatory|essential|a must|a prerequisite)\b/iu,
  /^(?:required|mandatory|essential)\s+(?:skills?|qualifications?|knowledge|experience|proficiency|expertise|competenc(?:e|y|ies)|ability|familiarity)\b/iu,
  /\b(?:required|mandatory|essential|must[- ]have)\s*[.!。！]?$/iu,
  /^(?:required|mandatory|essential|must[- ]have)(?:\s+(?:skills?|qualifications?|tools?|experience))?\s*[:：]\s*\S/iu,
  /\bmust\s+(?:have|be|know|understand|use|learn|demonstrate|possess|show|work|maintain|develop|deliver|support|manage|perform|complete|write|build|design|implement|troubleshoot|test)\b/iu,
  /^(?:(?:you|candidates?|applicants?)\s+)?need(?:s)?\s+to\s+\S|\b(?:you|candidates?|applicants?)\s+(?:are\s+)?required to\s+\S/iu,
  /^(?:(?:(?:the|this|our)\s+)?(?:role|position|job|employer|company)|we)\s+requires?\s+\S|^requires?\s+(?:experience|knowledge|familiarity|proficiency|expertise|the ability)\b/iu,
  /^(?:(?:you|the role|this role)\s+(?:(?:will|would)\s+be|are|is)\s+)?responsible for\s+\S|^(?:your|the role['’]s)\s+(?:duties|responsibilities)\s+include\s+\S/iu,
  /(?:必须|须要)(?:具备|掌握|熟悉|能够|能|使用|会|了解|完成|负责)|(?:需要|需|须)(?:具备|掌握|熟悉|能够|能|使用|会|了解|熟练|完成|负责)/u,
  /^(?:该岗位|本岗位|此职位)?负责\s*[\p{L}\p{N}]|(?:是|为|属于)(?:必备(?:技能|条件|项)?|必需(?:技能|条件|项)?|硬性要求)/u,
  /^(?:要求|任职要求|岗位要求|任职资格|任职必备|必须|必备(?:技能|条件)?|硬性要求)\s*[:：]\s*\S/u,
];
const preferred = [
  /\b(?:is|are|be|remains?)\s+(?:(?:strongly|particularly|especially|highly)\s+)?(?:preferred|desirable|a plus|an advantage|a bonus|nice[- ]to[- ]have)\b/iu,
  /\b(?:is|are|be)\s+optional(?=\s*(?:[.!。,;；]|$)|\s+for\b)/iu,
  /^(?:preferred|desirable|optional)\s+(?:skills?|qualifications?|knowledge|experience|proficiency|expertise|competenc(?:e|y|ies)|ability|familiarity)\b/iu,
  /\b(?:preferred|optional|desirable|nice[- ]to[- ]have|a plus|an advantage|a bonus)\s*[.!。！]?$/iu,
  /^(?:preferred|optional|desirable|nice[- ]to[- ]have|bonus)(?:\s+(?:skills?|qualifications?|tools?|experience))?\s*[:：]\s*\S/iu,
  /优先(?:考虑|录用)|优先(?=\s*(?:[，,。！;；]|$))|(?:是|为|属于)?加分项|更佳(?=\s*(?:[，,。！;；]|$))/u,
  /可选(?:的)?(?:技能|条件|项)?(?=\s*(?:[，,。！;；]|$))|^(?:加分项?|优先条件|可选技能)\s*[:：]\s*\S/u,
];
const mustWord = /\b(?:must|required|mandatory|essential)\b|(?:必须|必需|必备|硬性要求)/iu;
const preferredWord = /\b(?:preferred|optional|desirable|nice[- ]to[- ]have|a plus|an advantage|a bonus)\b|(?:可选|加分项|加分\s*[:：]|优先考虑|优先录用|优先[。；，\s]|更佳)/iu;

// Absence of a requirement does not mean preference. Conditions, reported examples
// and contradictory priorities are intentionally left for the user's review.
const qualified = /\b(?:not|no|never|without|neither|nor|cannot|can['’]t|won['’]t|(?:is|are|was|were|do|does|did|has|have|had|need|must|should|could|would)n['’]t|if|unless|whether|when|whenever|provided|assuming|suppose|hypothetically|maybe|possibly|perhaps|could|may|might|pending|except|excepting|conditionally)\b|\b(?:depending on|subject to|only (?:for|in|on)|where applicable|as (?:needed|applicable)|for example|for instance|such as|as an example|the (?:following )?example|an example|the sample|a sample)\b|\bwould\s+(?!be\s+(?:an advantage|a plus|a bonus|preferred|desirable)\b)\S|[?？]|(?:不(?:是|为|需|要求|必|可|应|用|属于|一定|强制|熟悉|会|掌握|能)|无需|无须|没有|未(?:必|要求)|并非|非(?:必需|必须|必要)|不能|不可|如果|假如|假设|若|仅在|仅限|只在|仅当|只有|除非|取决于|可能|或许|是否|按需|视情况|例如|示例|举例)/iu;
const uncertain = /\b(?:requirements?|priorities|priority|job descriptions?)\b[^.;]{0,60}\b(?:conflict|contradict|unclear|inconsistent|uncertain)|\b(?:false|untrue|incorrect|unclear|uncertain)\s+(?:that|whether)|(?:要求|优先级|必备条件)[^。；]{0,40}(?:矛盾|冲突|不一致|不确定|未明确)/iu;

const quoted = /“[^“”]*”|「[^「」]*」|『[^『』]*』|‘(?:[^‘’]|’(?=[\p{L}]))*’|"(?:\\.|[^"\\])*"|(?<![\p{L}\p{N}])'(?:[^']|'(?=[\p{L}]))*'|\x60[^\x60]*\x60/gu;
const listPrefix = /^(?:[-*•▪‣]\s+|[\d０-９]{1,3}\.\s+|(?:[\d０-９]{1,3}|[一二三四五六七八九十]{1,3})[、)）]\s*|[(（](?:[\d０-９]{1,3}|[一二三四五六七八九十]{1,3})[)）]\s*)/u;
const mustHeading = /^(?:(?:(?:job|role|minimum|mandatory|essential|basic)\s+)?(?:requirements|qualifications)|(?:required|mandatory|essential|must[- ]have)\s+(?:skills|qualifications|tools|experience|competencies)|required|mandatory|essential|must[- ]haves?|(?:(?:job|role|key)\s+)?responsibilities|duties|岗位职责|工作职责|任职要求|岗位要求|任职资格|任职必备|必须|必备|必备技能|必备条件|硬性要求|基本要求)$/iu;
const preferredHeading = /^(?:(?:preferred|optional|desirable|bonus)\s+(?:skills|qualifications|tools|experience|competencies)|nice[- ]to[- ]haves?|preferred|optional|加分项?|优先条件|优先要求|可选技能|可选条件)$/iu;
const exampleHeading = /^(?:(?:illustrative|quoted|hypothetical)\s+)?(?:examples?|samples?)$|^(?:示例|例子|举例|假设)$/iu;

function headingText(line: string) {
  return line.replace(/^#{1,6}\s+/u, "").replace(/\s+#{1,6}$/u, "")
    .replace(/[:：]\s*$/u, "").replace(/^(\*\*|__)(.*?)\1$/u, "$2").replace(/[:：]\s*$/u, "").trim();
}
function headingLevel(line: string): Level | null {
  const label = headingText(line);
  return mustHeading.test(label) ? "must" : preferredHeading.test(label) ? "preferred" : null;
}

export function isRequirementLevelHeading(line: string) {
  return headingLevel(line) !== null;
}

function surroundingScope(text: string, start: number): { level: Level; blocked: boolean; heading?: boolean } {
  let level: Level = "unspecified", blocked = false, fence = "", listIndent: number | null = null;
  const nested: { indent: number; level: Level; blocked: boolean }[] = [];
  for (const row of text.matchAll(/[^\r\n]*(?:\r\n|[\r\n]|$)/gu)) {
    if (!row[0]) break;
    const line = row[0].replace(/[\r\n]+$/u, ""), trimmed = line.trim();
    const here = start >= row.index && start < row.index + row[0].length;
    const marker = /^(`{3,}|~{3,})/u.exec(trimmed)?.[0];
    if (marker) {
      if (here) return { level: "unspecified" as const, blocked: true };
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = "";
      level = "unspecified"; nested.length = 0; listIndent = null;
      continue;
    }
    if (fence) {
      if (here) return { level: "unspecified" as const, blocked: true };
      continue;
    }
    if (/^>/u.test(trimmed)) {
      if (here) return { level: "unspecified" as const, blocked: true };
      level = "unspecified"; nested.length = 0; listIndent = null;
      continue;
    }
    const indent = line.length - line.trimStart().length, bullet = listPrefix.exec(trimmed);
    const body = bullet ? trimmed.slice(bullet[0].length) : trimmed;
    if (bullet) while (nested.length && nested[nested.length - 1]!.indent >= indent) nested.pop();
    const localHeading = headingLevel(body), example = exampleHeading.test(headingText(body));
    const headingLayout = /^#{1,6}\s|^(?:\*\*|__)|[:：]$/u.test(body);
    const qualifiedHeading = (headingLayout || (body.length <= 120 && !/[.!?。！？]/u.test(body))) && qualified.test(body);
    if (here) {
      const prefix = text.slice(row.index, start).trim();
      const startsEntry = !prefix || listPrefix.test(prefix + " ");
      const scope = nested[nested.length - 1] ?? { level, blocked };
      return { level: startsEntry && localHeading === null && !example && !headingLayout ? scope.level : "unspecified" as const,
        blocked: blocked || scope.blocked || example || qualifiedHeading, heading: localHeading !== null || example };
    }
    if (!trimmed) continue;
    if (bullet) {
      listIndent = indent;
      if (localHeading || example || headingLayout) nested.push({ indent, level: localHeading ?? "unspecified", blocked: example || qualifiedHeading });
      continue;
    }
    // A plain unlisted line ends the inherited list scope. This deliberately does
    // not guess that an arbitrary employer title is another requirement entry.
    if (listIndent !== null && indent > listIndent && !localHeading && !example && !headingLayout) continue;
    level = localHeading ?? "unspecified";
    blocked = example || qualifiedHeading;
    nested.length = 0; listIndent = null;
  }
  return { level: "unspecified" as const, blocked: false };
}

/** Ground a complete source statement in original document context, never transport edges. */
export function groundSourceRequirementLevel(source: DocumentCandidate["source"], sources: Sources): Level {
  const span = source.quote.trim() && locateCandidateQuote(source, sources);
  if (!span) return "unspecified";
  const scope = surroundingScope(sources.text, span.start);
  if (scope.blocked || scope.heading) return "unspecified";
  let quotedAssertion = false;
  const masked = sources.text.replace(quoted, (match: string, at: number) => {
    if (at < span.end && at + match.length > span.start &&
      ((at <= span.start && at + match.length >= span.end) || mandatory.some(pattern => pattern.test(match.slice(1, -1)))
        || preferred.some(pattern => pattern.test(match.slice(1, -1))))) quotedAssertion = true;
    return "Q" + " ".repeat(match.length - 1);
  }).slice(span.start, span.end).replace(/\s+/gu, " ").trim().replace(listPrefix, "");
  if (quotedAssertion || qualified.test(masked) || uncertain.test(masked)
    || (mustWord.test(masked) && preferredWord.test(masked))) return "unspecified";
  const must = mandatory.some(pattern => pattern.test(masked)), plus = preferred.some(pattern => pattern.test(masked));
  if (must || plus) return must === plus ? "unspecified" : must ? "must" : "preferred";
  // A local priority word with an unclear relation (for example, an optional
  // dependency) must not acquire the opposite priority from a section heading.
  if (mustWord.test(masked) || preferredWord.test(masked)) return "unspecified";
  return scope.level;
}
