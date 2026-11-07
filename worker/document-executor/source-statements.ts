// Keep UTF-16 offsets in the original document, including across soft-wrapped lines and transport chunks.
const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("en", { granularity: "sentence" }) : null;
const listPrefix = /^(?:[-*•▪‣]\s+|[\d０-９]{1,3}\.\s+|(?:[\d０-９]{1,3}|[一二三四五六七八九十]{1,3})[、)）]\s*|[(（](?:[\d０-９]{1,3}|[一二三四五六七八九十]{1,3})[)）]\s*)/u;
const sectionHeading = /^(?:岗位职责|工作职责|职位描述|任职要求|岗位要求|任职资格|优先条件|加分项|工作经历|项目经历|技能|responsibilities|requirements|preferred qualifications|work experience|skills)\s*[:：]?$/iu;
export function statementBoundaries(text: string, additionalHeading?: (line: string) => boolean) {
  const bounds = new Map<number, number>();
  if (!segmenter) return bounds;
  const layout = text.replace(/[^\r\n]*(?:\r\n|[\r\n]|$)/gu, (line: string, at: number) => {
    // Consume an unterminated final line once rather than retrying a newline search at every offset.
    if (!line.endsWith("\r") && !line.endsWith("\n")) return line;
    const trimmed = line.trim(), next = text.slice(at + line.length, at + line.length + 128).trimStart();
    // Explicit headings, a tagged title, blank lines, and list markers are structural breaks.
    // Other single newlines may just wrap a qualifying clause, including negations.
    const title = at === 0 && (/^\[[^\]\r\n]{1,64}\][^.!?。！？]{0,100}$/u.test(trimmed)
      || /^.{0,80}(?:\brole|\bjob description|\br[eé]sum[eé]|\bCV|岗位|职位|简历)$/iu.test(trimmed));
    if (!trimmed || title || sectionHeading.test(trimmed) || additionalHeading?.(trimmed) || /^#{1,6}\s/u.test(trimmed) || listPrefix.test(next)) return line;
    return line.replace(/[\r\n]/gu, " ");
  });
  for (const { segment, index } of segmenter.segment(layout)) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const start = index + segment.length - segment.trimStart().length, end = start + trimmed.length;
    bounds.set(start, end);
    const bullet = listPrefix.exec(trimmed);
    if (bullet) bounds.set(start + bullet[0].length, end);
  }
  return bounds;
}
