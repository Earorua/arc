import { DOCUMENT_LIMITS } from "./policy";
export function prepareDocumentText(input: string): string {
    const text = input.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
    if (!text.trim() || text.includes("\0") || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text))
        throw new Error("INVALID_TEXT");
    if (Array.from(text).length > DOCUMENT_LIMITS.textCodePoints || new TextEncoder().encode(text).byteLength > DOCUMENT_LIMITS.textUtf8Bytes)
        throw new Error("TEXT_TOO_LARGE");
    return text;
}
export function readSourceSpan(text: string, start: number, end: number): string {
    const splits = (offset: number) => offset > 0 && offset < text.length && /[\uD800-\uDBFF]/u.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/u.test(text[offset]!);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > text.length || splits(start) || splits(end))
        throw new Error("SOURCE_RANGE_INVALID");
    return text.slice(start, end);
}
export function segmentDocumentText(text: string): {
    id: string;
    start: number;
    end: number;
}[] {
    const segments = [];
    for (let start = 0; start < text.length;) {
        let end = Math.min(start + 2000, text.length);
        if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1]!))
            end--;
        segments.push({ id: `segment-${segments.length + 1}`, start, end });
        start = end;
    }
    return segments;
}
