// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildResponseFormatDiagnostic, projectResponseFormatDiagnostic }
  from "../../app/server/research/response-format-diagnostic";

describe("response format classification", () => {
  it.each([
    [null, "missing"],
    ["", "other"],
    ["\t Application/JSON \t; charset=utf-8", "json"],
    ["APPLICATION/VND.API+JSON", "json"],
    ["application/problem+json; profile=test", "json"],
    ["text/html; charset=utf-8", "html"],
    ["text/event-stream", "sse"],
    ["text/plain", "text"],
    ["application/problem json", "other"],
    ["application/problem+json/extra", "other"],
    ["\rtext/plain", "other"],
    ["text/plain\n", "other"],
    ["\u00a0text/plain\u00a0", "other"],
    ["\u000btext/plain", "other"],
    ["text/plain\u000c", "other"],
    ["appl\u0131cation/json", "other"],
    ["text/event-\u017ftream", "other"],
    ["image/png", "other"],
  ] as const)("classifies Content-Type %j as %s", (contentType, expected) => {
    expect(buildResponseFormatDiagnostic("x", () => contentType).contentType).toBe(expected);
  });

  it("bounds Content-Type inspection at 512 characters before normalization", () => {
    const exact = "text/plain".padEnd(512, " ");
    expect(buildResponseFormatDiagnostic("x", () => exact).contentType).toBe("text");
    expect(buildResponseFormatDiagnostic("x", () => `${exact} `).contentType).toBe("other");
  });

  it("collapses a Content-Type read failure without exposing it", () => {
    const readContentType = vi.fn((): string | null => { throw new Error("secret-canary"); });
    const diagnostic = buildResponseFormatDiagnostic("secret-body", readContentType);
    expect(diagnostic).toEqual({ contentType: "unavailable", bodyPrefixKind: "other" });
    expect(JSON.stringify(diagnostic)).not.toContain("secret");
  });

  it.each([
    ["", "decoded-empty"],
    ["\t\n\r ", "ascii-whitespace-only"],
    ["  <HTML>", "html-like"],
    ["<!DoCtYpE HtMl\tlang=en>", "html-like"],
    ["<htmlx>", "other"],
    ["<html\u000b>", "other"],
    ["<html\u000c>", "other"],
    ["<!doctype html\u000b>", "other"],
    ["<!doctype html\u000c>", "other"],
    ["<htm\u217c>", "other"],
    ["data: {}", "sse-like"],
    ["event: update", "sse-like"],
    ["id: 1", "sse-like"],
    ["retry: 10", "sse-like"],
    [": comment", "sse-like"],
    ["Data: {}", "other"],
    ["d\u0251ta: {}", "other"],
    ["  {", "json-container-like"],
    ["\r\n[", "json-container-like"],
    ["\u00a0<html>", "other"],
    ["\u000b<html>", "other"],
    ["\u000c<html>", "other"],
    ["\ufeff<html>", "other"],
    [`${"x".repeat(64)}<html>`, "other"],
  ] as const)("classifies decoded body prefix %j as %s", (body, expected) => {
    expect(buildResponseFormatDiagnostic(body, () => null).bodyPrefixKind).toBe(expected);
  });

  it("preserves contradictory header and body classifications", () => {
    expect(buildResponseFormatDiagnostic("<html>", () => "application/json")).toEqual({
      contentType: "json",
      bodyPrefixKind: "html-like",
    });
  });

  it("follows the existing TextDecoder BOM behavior", () => {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array([0xef, 0xbb, 0xbf]));
    expect(decoded).toBe("");
    expect(buildResponseFormatDiagnostic(decoded, () => null).bodyPrefixKind).toBe("decoded-empty");
  });
});

describe("response format projection", () => {
  const valid = () => ({ contentType: "json", bodyPrefixKind: "html-like" } as const);

  it("returns an independent frozen pair", () => {
    const input: { contentType: string; bodyPrefixKind: string } = { ...valid() };
    const first = projectResponseFormatDiagnostic(input);
    const second = projectResponseFormatDiagnostic(input);
    input.contentType = "text";
    expect(first).toEqual(valid());
    expect(second).toEqual(valid());
    expect(first).not.toBe(input);
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it.each([
    null,
    [],
    {},
    { ...valid(), extra: "secret-canary" },
    { contentType: "invalid", bodyPrefixKind: "other" },
    { contentType: "json", bodyPrefixKind: "invalid" },
    Object.assign(Object.create(null), valid()),
    Object.assign(Object.create({ inherited: true }), valid()),
  ])("rejects a non-exact pair %#", (input) => {
    expect(projectResponseFormatDiagnostic(input)).toBeNull();
  });

  it("rejects symbols and accessors without invoking getters or toJSON", () => {
    const getter = vi.fn(() => "json");
    const accessor = Object.defineProperty({ bodyPrefixKind: "other" }, "contentType", {
      enumerable: true,
      get: getter,
    });
    const toJSON = vi.fn(() => ({ secret: "secret-canary" }));
    expect(projectResponseFormatDiagnostic(accessor)).toBeNull();
    expect(projectResponseFormatDiagnostic({ ...valid(), [Symbol("secret")]: true })).toBeNull();
    expect(projectResponseFormatDiagnostic({ ...valid(), toJSON })).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
  });

  it("rejects non-enumerable data fields", () => {
    const hidden = Object.defineProperty({ ...valid() }, "contentType", {
      value: "json",
      enumerable: false,
    });
    expect(projectResponseFormatDiagnostic(hidden)).toBeNull();
  });

  it("contains reflection failures", () => {
    const hostile = new Proxy({}, {
      getPrototypeOf() { throw new Error("secret-canary"); },
    });
    expect(projectResponseFormatDiagnostic(hostile)).toBeNull();
  });
});
