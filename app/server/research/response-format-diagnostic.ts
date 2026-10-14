export type ResponseFormatDiagnostic = Readonly<{
  contentType: "missing" | "json" | "html" | "sse" | "text" | "other" | "unavailable";
  bodyPrefixKind: "decoded-empty" | "ascii-whitespace-only" | "html-like" | "sse-like"
    | "json-container-like" | "other";
}>;

const CONTENT_TYPES = Object.freeze([
  "missing", "json", "html", "sse", "text", "other", "unavailable",
] satisfies readonly ResponseFormatDiagnostic["contentType"][]);
const BODY_PREFIX_KINDS = Object.freeze([
  "decoded-empty", "ascii-whitespace-only", "html-like", "sse-like", "json-container-like", "other",
] satisfies readonly ResponseFormatDiagnostic["bodyPrefixKind"][]);

function isAsciiSpace(code: number): boolean {
  return code === 9 || code === 10 || code === 13 || code === 32;
}

function bodyPrefixKind(text: string): ResponseFormatDiagnostic["bodyPrefixKind"] {
  if (text.length === 0) return "decoded-empty";
  let start = 0;
  while (start < text.length && isAsciiSpace(text.charCodeAt(start))) start++;
  if (start === text.length) return "ascii-whitespace-only";
  const prefix = text.slice(start, start + 64);
  if (/^(?:<!doctype html|<html)(?:[\t\n\r ]|>)/i.test(prefix)) return "html-like";
  if (/^(?:data:|event:|id:|retry:|:)/u.test(prefix)) return "sse-like";
  if (prefix[0] === "{" || prefix[0] === "[") return "json-container-like";
  return "other";
}

function contentTypeKind(value: string | null): ResponseFormatDiagnostic["contentType"] {
  if (value === null) return "missing";
  if (value.length > 512) return "other";
  const mime = value.split(";", 1)[0]
    .replace(/^[\t ]+|[\t ]+$/gu, "")
    .replace(/[A-Z]/gu, (letter) => letter.toLowerCase());
  if (mime === "application/json" || /^application\/[!#$%&'*+.^_`|~0-9a-z-]+\+json$/u.test(mime)) return "json";
  if (mime === "text/html") return "html";
  if (mime === "text/event-stream") return "sse";
  if (mime === "text/plain") return "text";
  return "other";
}

export function buildResponseFormatDiagnostic(
  text: string,
  readContentType: () => string | null,
): ResponseFormatDiagnostic {
  let contentType: ResponseFormatDiagnostic["contentType"];
  try { contentType = contentTypeKind(readContentType()); }
  catch { contentType = "unavailable"; }
  return Object.freeze({ contentType, bodyPrefixKind: bodyPrefixKind(text) });
}

export function projectResponseFormatDiagnostic(input: unknown): ResponseFormatDiagnostic | null {
  try {
    const keys = ["contentType", "bodyPrefixKind"] as const;
    if (!input || typeof input !== "object" || Array.isArray(input)
      || Object.getPrototypeOf(input) !== Object.prototype || Object.getOwnPropertySymbols(input).length) return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Object.keys(descriptors).length !== keys.length) return null;
    const values: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      values[key] = descriptor.value;
    }
    if (!CONTENT_TYPES.includes(values.contentType as ResponseFormatDiagnostic["contentType"])
      || !BODY_PREFIX_KINDS.includes(values.bodyPrefixKind as ResponseFormatDiagnostic["bodyPrefixKind"])) return null;
    return Object.freeze({
      contentType: values.contentType as ResponseFormatDiagnostic["contentType"],
      bodyPrefixKind: values.bodyPrefixKind as ResponseFormatDiagnostic["bodyPrefixKind"],
    });
  } catch {
    return null;
  }
}
