import { describe, expect, it } from "vitest";
import { completeNumberedStatementBoundaries, statementBoundaries } from "../../worker/document-executor/source-statements";
import { groundedStatementBoundaries, sourceMentionStatementBoundaries } from "../../worker/document-executor/source-review-evidence";

describe("complete numbered source-mention statements", () => {
  it("accepts the complete numbered statement while preserving its body and legacy coordinates", () => {
    const text = "1. I practiced SQL with a mentor.";
    const bounds = sourceMentionStatementBoundaries(text);
    expect(bounds.get(0)).toBe(text.length);
    expect(bounds.get(3)).toBe(text.length);
    expect([...statementBoundaries(text)]).toEqual([[0, 2], [3, text.length]]);
    expect([...groundedStatementBoundaries(text)]).toEqual([[0, 2], [3, text.length]]);
  });

  it.each([
    ["three ASCII digits", "123. SQL is required.", "123. SQL is required.", "SQL is required."],
    ["fullwidth digits", "１２. SQL is required.", "１２. SQL is required.", "SQL is required."],
    ["three fullwidth digits", "１２３. SQL is required.", "１２３. SQL is required.", "SQL is required."],
    ["indentation and tabs", "\t 1.\t SQL is required.  ", "1.\t SQL is required.", "SQL is required."],
    ["CRLF and heading", "Required skills:\r\n  1. SQL.\r\n", "1. SQL.", "SQL."],
    ["soft-wrapped qualifier", "1. I tested SQL\r\nunder supervision.", "1. I tested SQL\r\nunder supervision.", "I tested SQL\r\nunder supervision."],
    ["Chinese body", "１. 我在指导下清洗数据。", "１. 我在指导下清洗数据。", "我在指导下清洗数据。"],
    ["interior technical dot", "1. Node.js is required.", "1. Node.js is required.", "Node.js is required."],
    ["URL punctuation", "1. See https://learn.invalid/start?q=SQL for practice.", "1. See https://learn.invalid/start?q=SQL for practice.", "See https://learn.invalid/start?q=SQL for practice."],
  ])("keeps the full and body citations at the same original end for %s", (_label, text, full, body) => {
    const bounds = sourceMentionStatementBoundaries(text);
    const start = text.indexOf(full), bodyStart = text.indexOf(body), end = start + full.length;
    expect(bounds.get(start)).toBe(end);
    expect(bounds.get(bodyStart)).toBe(end);
    expect(text.slice(start, bounds.get(start))).toBe(full);
    expect(text.slice(bodyStart, bounds.get(bodyStart))).toBe(body);
  });

  it("uses UTF-16 offsets after an emoji paragraph without shifting indentation or CRLF", () => {
    const text = "🧪.\r\n\r\n  １２. SQL is required.";
    const bounds = sourceMentionStatementBoundaries(text);
    expect(bounds.get(0)).toBe(3);
    expect(bounds.get(9)).toBe(29);
    expect(bounds.get(13)).toBe(29);
    expect(text.slice(9, 29)).toBe("１２. SQL is required.");
    expect(text.slice(13, 29)).toBe("SQL is required.");
    expect([...groundedStatementBoundaries(text)]).toEqual([[0, 3], [9, 12], [13, 29]]);
  });

  it("keeps adjacent numbered entries separate and rejects a citation spanning both", () => {
    const first = "1. SQL is required.", second = "2. Python is optional.";
    const text = first + "\r\n  " + second, secondStart = text.indexOf(second);
    const bounds = sourceMentionStatementBoundaries(text);
    expect(bounds.get(0)).toBe(first.length);
    expect(bounds.get(3)).toBe(first.length);
    expect(bounds.get(secondStart)).toBe(text.length);
    expect(bounds.get(secondStart + 3)).toBe(text.length);
    expect(bounds.get(0)).not.toBe(text.length);
    expect(bounds.get(3)).not.toBe(text.length);
  });

  it("does not attach a later sentence on the same physical line", () => {
    const first = "1. SQL is required.", second = "Python is optional.";
    const text = first + " " + second, bounds = sourceMentionStatementBoundaries(text);
    expect(bounds.get(0)).toBe(first.length);
    expect(bounds.get(3)).toBe(first.length);
    expect(bounds.get(first.length + 1)).toBe(text.length);
  });

  it("requires the later soft-wrapped negation for both numbered and body citations", () => {
    const text = "1. I tested SQL\nbut did not practice independently.";
    const bounds = sourceMentionStatementBoundaries(text), cutEnd = text.indexOf("\n");
    expect(bounds.get(0)).toBe(text.length);
    expect(bounds.get(3)).toBe(text.length);
    expect(bounds.get(0)).not.toBe(cutEnd);
    expect(bounds.get(3)).not.toBe(cutEnd);
    expect(bounds.get(0)).not.toBe(2);
  });

  it.each([
    "I practiced SQL with a mentor.",
    "- I practiced SQL with a mentor.",
    "1.2 SQL is required.",
    "1.SQL is required.",
    "1.Node.js is required.",
    "1000. SQL is required.",
    "１０００. SQL is required.",
    "1000. \n",
    "Task 1. SQL is required.",
    "1． SQL is required.",
    "1) SQL is required.",
    "一、SQL is required.",
  ])("preserves existing boundaries without expanding unsupported numbered syntax in %s", text => {
    expect([...sourceMentionStatementBoundaries(text)]).toEqual([...groundedStatementBoundaries(text)]);
  });

  it.each([
    "1.", "1. \n", "１２.", "\t１２.\t\r\n", "  123.  ", "１. \r\n\r\n", "1.\nSQL is required.",
  ])("rejects an isolated ordinal as a complete fact in %s while leaving legacy bounds intact", text => {
    const start = text.search(/\S/u), base = groundedStatementBoundaries(text), before = [...base];
    expect(base.has(start)).toBe(true);
    expect(sourceMentionStatementBoundaries(text).has(start)).toBe(false);
    expect(completeNumberedStatementBoundaries(text, base).has(start)).toBe(false);
    expect([...base]).toEqual(before);
    expect([...groundedStatementBoundaries(text)]).toEqual(before);
  });

  it("removes an isolated ordinal between valid entries without connecting them", () => {
    const first = "1. SQL is required.", last = "3. Python is optional.";
    const text = first + "\r\n2. \r\n" + last, bounds = sourceMentionStatementBoundaries(text);
    expect(bounds.get(0)).toBe(first.length);
    expect(bounds.has(text.indexOf("2."))).toBe(false);
    expect(bounds.get(text.indexOf(last))).toBe(text.length);
    expect(bounds.get(text.indexOf("Python"))).toBe(text.length);
  });

  it("returns an independent map without changing the caller's body or ordinal boundaries", () => {
    const text = "1. SQL is required.", base = groundedStatementBoundaries(text), before = [...base];
    const bounds = completeNumberedStatementBoundaries(text, base);
    expect(bounds).not.toBe(base);
    expect(bounds.get(0)).toBe(text.length);
    expect(bounds.get(3)).toBe(text.length);
    expect([...base]).toEqual(before);
    bounds.delete(3);
    expect([...base]).toEqual(before);
  });

  it("does not invent a complete body boundary that the caller did not supply", () => {
    const text = "1. SQL is required.", base: ReadonlyMap<number, number> = new Map([[0, 2], [4, text.length]]);
    expect([...completeNumberedStatementBoundaries(text, base)]).toEqual([...base]);
  });

  it("preserves the existing leading-dot limitation instead of treating .NET as an interior dot", () => {
    const text = "1. .NET is required.", base = groundedStatementBoundaries(text);
    expect(base.get(3)).toBe(4);
    expect([...sourceMentionStatementBoundaries(text)]).toEqual([...base]);
    expect(sourceMentionStatementBoundaries(text).get(0)).not.toBe(text.length);
  });
});
