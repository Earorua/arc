import { expect, it } from "vitest";
import { prepareDocumentText, segmentDocumentText, readSourceSpan } from "../../app/server/documents/text";
it("normalizes only BOM and newlines and rejects invalid or oversized text", () => {
    expect(prepareDocumentText("\uFEFF经历\r\nA😀B\rC")).toBe("经历\nA😀B\nC");
    for (const text of [" ", "x\0y"])
        expect(() => prepareDocumentText(text)).toThrow("INVALID_TEXT");
    expect(() => prepareDocumentText("字".repeat(50001))).toThrow("TEXT_TOO_LARGE");
});
it("segments round trip UTF16 offsets without splitting emoji", () => {
    const text = "a".repeat(1999) + "😀" + "中".repeat(2001);
    const segments = segmentDocumentText(text);
    expect(segments.map((segment) => readSourceSpan(text, segment.start, segment.end)).join("")).toBe(text);
    expect(segments.every(({ start, end }) => end - start <= 2000)).toBe(true);
    expect(() => readSourceSpan(text, 1999, 2000)).toThrow("SOURCE_RANGE_INVALID");
});
