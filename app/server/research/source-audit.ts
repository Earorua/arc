import { z } from "zod";
import { calendarDateSchema, publicHttpsUrlSchema } from "../../contracts/intelligence";
import { providerCitationAnnotationSchema, type AuditedSource, type ResearchCandidate, type ResearchIssueCode } from "../../contracts/research";
import { canonicalJson, fingerprint } from "../../lib/planning/fingerprint";

const annotationListSchema = z.array(providerCitationAnnotationSchema).max(256);
const forbiddenSuffixes = ["onion", "alt", "lan", "home", "corp"];
const unsafeControl = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;
// Dangerous tags/attributes remain forbidden even when incomplete or adjacent to prose.
const unsafeMarkup = /<!--|<!doctype\b|<\/?(?:script|style|iframe|frame|frameset|img|svg|math|object|embed|link|meta|base)(?=[\s/>]|$)|<[a-z][a-z0-9:-]*\s[^<>]*\b(?:on[a-z]+\s*=|(?:href|src|action)\s*=\s*["']?\s*(?:javascript|vbscript|data):)/iu;
const htmlTagNames = new Set((
  "a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup "
  + "data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 "
  + "head header hgroup hr html i iframe img input ins kbd label legend li link main map mark math menu meta meter nav "
  + "noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section select "
  + "slot small source span strong style sub summary sup svg table tbody td template textarea tfoot th thead time title "
  + "tr track u ul var video wbr"
).split(" "));
// Prose such as `and a` is not an attribute assignment and cannot complete a tag.
const completeHtmlTag = /<\/?([a-z][a-z0-9-]*)(?:\s+[a-z_:][a-z0-9_.:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))*\s*\/?>/giu;
// Only instruction/prompt targets or explicitly system/prior/safety rules indicate control wording.
const unsafeInstruction = /\b(?:ignore|disregard|override|forget)\s+(?:(?:all|the|any|your|these|those)\s+)*(?:(?:previous|prior|earlier|above|system|developer|safety|security)\s+)*(?:instructions?|prompts?)\b|\b(?:ignore|disregard|override|forget)\s+(?:(?:all|the|any)\s+)*(?:previous|prior|earlier|above|system|developer|your|safety|security)\s+rules?\b|(?:^|\n)\s*(?:system|developer|assistant|tool)\s*:|\[\/?INST\]|<\|(?:im_start|im_end|system|assistant|endoftext)\|>/iu;
const unsafeSecret = /\bsk-(?:or-v1-|proj-)?[a-z0-9_-]{12,}|\bBearer\s+[a-z0-9._-]{12,}|\b(?:api[_-]?key|access[_-]?token|password)\s*[=:]\s*\S+/iu;

export class SourcePolicyError extends Error {
  constructor(readonly code: ResearchIssueCode) {
    super(`Research source rejected: ${code}`);
    this.name = "SourcePolicyError";
  }
}

export function canonicalizePublicCitationUrl(value: string): string {
  try {
    if (typeof value !== "string" || value.length > 2_048 || /[\u0000-\u0020\u007f]/u.test(value)) {
      throw new SourcePolicyError("unsafe-url");
    }
    const url = new URL(value);
    if (/[\u0000-\u001f\u007f]/u.test(decodeForSafety(value))) throw new SourcePolicyError("unsafe-url");
    url.hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
    const hostname = url.hostname;
    if (!publicHttpsUrlSchema.safeParse(url.href).success
      || hostname.length > 253
      || hostname.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))
      || forbiddenSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
      throw new SourcePolicyError("unsafe-url");
    }
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:api[_-]?key|access[_-]?token|password|authorization)$/iu.test(key)) throw new SourcePolicyError("unsafe-url");
      if (/^(?:utm_.*|gclid|fbclid)$/iu.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.href.length > 2_048) throw new SourcePolicyError("unsafe-url");
    return url.href;
  } catch {
    throw new SourcePolicyError("unsafe-url");
  }
}

export function auditResearchSources(candidate: ResearchCandidate, annotations: unknown, observedAt: string): { sources: AuditedSource[] } {
  if (!calendarDateSchema.safeParse(observedAt).success) throw new SourcePolicyError("invalid-schema");
  const parsed = annotationListSchema.safeParse(readBoundedResearchJson(annotations));
  if (!parsed.success) throw new SourcePolicyError("invalid-schema");

  const titles = new Map<string, string>();
  for (const annotation of parsed.data) {
    const canonicalUrl = canonicalizePublicCitationUrl(annotation.url);
    // Stable representative even if duplicate annotations arrive in another order.
    const previous = titles.get(canonicalUrl);
    if (previous === undefined || annotation.title < previous) titles.set(canonicalUrl, annotation.title);
  }

  const sources: AuditedSource[] = [];
  const seen = new Set<string>();
  for (const resource of candidate.resources) {
    const canonicalUrl = canonicalizePublicCitationUrl(resource.url);
    const title = titles.get(canonicalUrl);
    if (!title) throw new SourcePolicyError("unreferenced-url");
    if (seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);
    sources.push({ canonicalUrl, title, hostname: new URL(canonicalUrl).hostname,
      sourceTier: resource.sourceTier, observedAt,
      citationHash: fingerprint({ canonicalUrl }),
    });
  }
  return { sources };
}

/** Snapshot untrusted JSON before schema parsing: never invoke getters/toJSON or retain controls. */
export function readBoundedResearchJson(value: unknown): unknown {
  let nodes = 0;
  let textLength = 0;
  const stack = new Set<object>();
  function copy(input: unknown, depth: number): unknown {
    nodes += 1;
    if (nodes > 250_000 || depth > 12) throw new SourcePolicyError("invalid-schema");
    if (typeof input === "string") {
      textLength += input.length;
      if (input.length > 8_192 || textLength > 16_000_000) throw new SourcePolicyError("invalid-schema");
      const decoded = decodeForSafety(input);
      if (unsafeControl.test(decoded) || hasUnsafeMarkup(decoded) || unsafeInstruction.test(decoded) || unsafeSecret.test(decoded)) {
        throw new SourcePolicyError("unsafe-content");
      }
      return input;
    }
    if (input === null || typeof input === "boolean") return input;
    if (typeof input === "number" && Number.isFinite(input)) return input;
    if (typeof input !== "object" || stack.has(input)) throw new SourcePolicyError("invalid-schema");
    const array = Array.isArray(input);
    if (Object.getPrototypeOf(input) !== (array ? Array.prototype : Object.prototype)) throw new SourcePolicyError("invalid-schema");
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Object.getOwnPropertySymbols(input).length || Object.keys(descriptors).length > 4_097) throw new SourcePolicyError("invalid-schema");
    stack.add(input);
    try {
      const result: Record<string, unknown> = {};
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (array && key === "length") continue;
        textLength += key.length;
        if (key.length > 8_192 || textLength > 16_000_000) throw new SourcePolicyError("invalid-schema");
        if (!("value" in descriptor) || !descriptor.enumerable) throw new SourcePolicyError("invalid-schema");
        Object.defineProperty(result, key, { value: copy(descriptor.value, depth + 1), enumerable: true });
      }
      if (!array) return result;
      const length = descriptors.length?.value;
      if (!Number.isInteger(length) || length < 0 || length > 4_096 || Object.keys(result).length !== length) throw new SourcePolicyError("invalid-schema");
      const values = [];
      for (let index = 0; index < length; index += 1) {
        if (!Object.hasOwn(result, String(index))) throw new SourcePolicyError("invalid-schema");
        values.push(result[String(index)]);
      }
      return values;
    } finally { stack.delete(input); }
  }
  try {
    // canonicalJson also enforces the repository's plain-JSON identity policy.
    return JSON.parse(canonicalJson(copy(value, 0))) as unknown;
  } catch (error) {
    if (error instanceof SourcePolicyError) throw error;
    throw new SourcePolicyError("invalid-schema");
  }
}

function hasUnsafeMarkup(value: string): boolean {
  if (unsafeMarkup.test(value)) return true;
  for (const match of value.matchAll(completeHtmlTag)) {
    if (!htmlTagNames.has(match[1]!.toLowerCase())) continue;
    // Bare identifier<Type> and identifier<other> comparisons stay text. A closing
    // HTML tag or any assigned attribute still identifies actual markup.
    const adjacentTechnicalText = /^<[a-z][a-z0-9-]*>$/iu.test(match[0])
      && /[\p{L}\p{N}_$]$/u.test(value.slice(0, match.index));
    if (!adjacentTechnicalText) return true;
  }
  return false;
}

// Inspect common transport encodings without changing the persisted/plain-text content.
function decodeForSafety(value: string): string {
  let decoded = value;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const previous = decoded;
    decoded = decoded.replace(/&#(?:x([a-f0-9]{1,6})|(\d{1,7}));?|&(lt|gt|amp|quot);/giu, (entity, hex: string | undefined, decimal: string | undefined, named: string | undefined) => {
      if (named) return ({ lt: "<", gt: ">", amp: "&", quot: '"' } as Record<string, string>)[named.toLowerCase()]!;
      const code = Number.parseInt(hex ?? decimal!, hex ? 16 : 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    });
    try { decoded = decodeURIComponent(decoded); } catch { /* Ordinary prose may contain a literal percent sign. */ }
    if (decoded === previous) break;
  }
  return decoded;
}
