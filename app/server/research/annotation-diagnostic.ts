import { providerCitationAnnotationSchema } from "../../contracts/research";
import { canonicalizePublicCitationUrl } from "./source-audit";

export type AnnotationDiagnosticIssueCode = "container-not-array" | "annotation-count-limit"
  | "citation-object-missing" | "citation-object-invalid" | "flat-citation-unsupported"
  | "url-missing" | "url-null" | "url-not-string" | "url-blank" | "url-too-long"
  | "title-null" | "title-not-string" | "title-blank" | "title-too-long" | "fallback-url-policy";

export type AnnotationDiagnostic = {
  state: "compatible" | "incompatible";
  container: "missing" | "null" | "array" | "other";
  count: number | null;
  recognizedCount: number | null;
  ignoredCount: number | null;
  issues: Array<{ index: number | null; code: AnnotationDiagnosticIssueCode }>;
  truncated: boolean;
};

const ISSUE_CODES = ["container-not-array", "annotation-count-limit", "citation-object-missing",
  "citation-object-invalid", "flat-citation-unsupported", "url-missing", "url-null", "url-not-string",
  "url-blank", "url-too-long", "title-null", "title-not-string", "title-blank", "title-too-long",
  "fallback-url-policy"] as const;
const ISSUE_CODE_ORDER = new Map<AnnotationDiagnosticIssueCode, number>(ISSUE_CODES.map((code, index) => [code, index]));
const ISSUE_CODE_SET = new Set<string>(ISSUE_CODES);
const STRUCTURAL_CODES = new Set<AnnotationDiagnosticIssueCode>([
  "citation-object-missing", "citation-object-invalid", "flat-citation-unsupported",
]);
const URL_CODES = new Set<AnnotationDiagnosticIssueCode>([
  "url-missing", "url-null", "url-not-string", "url-blank", "url-too-long",
]);
const TITLE_CODES = new Set<AnnotationDiagnosticIssueCode>([
  "title-null", "title-not-string", "title-blank", "title-too-long",
]);
const DIAGNOSTIC_KEYS = ["state", "container", "count", "recognizedCount", "ignoredCount", "issues", "truncated"] as const;
const ISSUE_KEYS = ["index", "code"] as const;

function ordinaryObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype && Object.getOwnPropertySymbols(value).length === 0;
}

function exactDataFields(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!ordinaryObject(value)) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).length !== keys.length) return null;
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function ownDataValue(value: Record<string, unknown>, key: string): { safe: boolean; present: boolean; value: unknown } {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return { safe: true, present: false, value: undefined };
  if (!("value" in descriptor)) return { safe: false, present: true, value: undefined };
  return { safe: true, present: true, value: descriptor.value };
}

function stringIssue(value: unknown, present: boolean, field: "url" | "title"): AnnotationDiagnosticIssueCode | null {
  if (!present || value === undefined) return field === "url" ? "url-missing" : null;
  if (value === null) return field === "url" ? "url-null" : "title-null";
  if (typeof value !== "string") return field === "url" ? "url-not-string" : "title-not-string";
  const parsed = providerCitationAnnotationSchema.shape[field].safeParse(value);
  if (parsed.success) return null;
  if (!value.trim()) return field === "url" ? "url-blank" : "title-blank";
  return field === "url" ? "url-too-long" : "title-too-long";
}

function finish(container: AnnotationDiagnostic["container"], count: number | null,
  recognizedCount: number | null, ignoredCount: number | null,
  allIssues: AnnotationDiagnostic["issues"]): AnnotationDiagnostic {
  const unique = new Map<string, AnnotationDiagnostic["issues"][number]>();
  for (const current of allIssues) unique.set(`${current.index ?? "null"}\u0000${current.code}`, current);
  const sorted = [...unique.values()].sort((left, right) => {
    const leftIndex = left.index === null ? -1 : left.index;
    const rightIndex = right.index === null ? -1 : right.index;
    return leftIndex - rightIndex || ISSUE_CODE_ORDER.get(left.code)! - ISSUE_CODE_ORDER.get(right.code)!;
  });
  return { state: sorted.length ? "incompatible" : "compatible", container, count, recognizedCount, ignoredCount,
    issues: sorted.slice(0, 16).map((current) => ({ ...current })), truncated: sorted.length > 16 };
}

function consistentArrayIssues(issues: AnnotationDiagnostic["issues"], count: number,
  recognizedCount: number, truncated: boolean): boolean {
  const byIndex = new Map<number, AnnotationDiagnosticIssueCode[]>();
  for (const current of issues) {
    if (current.index === null) return false;
    const codes = byIndex.get(current.index) ?? [];
    codes.push(current.code);
    byIndex.set(current.index, codes);
  }
  if (byIndex.size > recognizedCount) return false;
  for (const codes of byIndex.values()) {
    if (codes.some((code) => STRUCTURAL_CODES.has(code)) && codes.length !== 1) return false;
    if (codes.filter((code) => URL_CODES.has(code)).length > 1) return false;
    if (codes.filter((code) => TITLE_CODES.has(code)).length > 1) return false;
    if (codes.includes("fallback-url-policy") && codes.length !== 1) return false;
  }
  if (!truncated) return true;
  const last = issues[issues.length - 1]!;
  const lastCodes = byIndex.get(last.index!)!;
  const possibleAtLastIndex = lastCodes.length === 1 && URL_CODES.has(lastCodes[0]!);
  const possibleAtLaterIndex = count > last.index! + 1 && recognizedCount > byIndex.size;
  return possibleAtLastIndex || possibleAtLaterIndex;
}

export function buildAnnotationDiagnostic(annotations: unknown): AnnotationDiagnostic | null {
  try {
    if (annotations === undefined) return finish("missing", 0, 0, 0, []);
    if (annotations === null) return finish("null", 0, 0, 0, []);
    if (!Array.isArray(annotations)) return finish("other", null, null, null,
      [{ index: null, code: "container-not-array" }]);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(annotations, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor) || typeof lengthDescriptor.value !== "number") return null;
    const count = lengthDescriptor.value;
    if (count > 256) return finish("array", 257, null, null, [{ index: null, code: "annotation-count-limit" }]);
    let recognizedCount = 0;
    let ignoredCount = 0;
    const issues: AnnotationDiagnostic["issues"] = [];
    for (let index = 0; index < count; index += 1) {
      const entryDescriptor = Object.getOwnPropertyDescriptor(annotations, String(index));
      if (entryDescriptor && !("value" in entryDescriptor)) return null;
      const entry = entryDescriptor && "value" in entryDescriptor ? entryDescriptor.value : undefined;
      if (!ordinaryObject(entry)) { ignoredCount += 1; continue; }
      const type = ownDataValue(entry, "type");
      if (!type.safe) return null;
      if (type.value !== "url_citation") { ignoredCount += 1; continue; }
      recognizedCount += 1;
      const nested = ownDataValue(entry, "url_citation");
      if (!nested.safe) return null;
      if (!nested.present || nested.value === undefined) {
        const flatUrl = ownDataValue(entry, "url");
        const flatTitle = ownDataValue(entry, "title");
        if (!flatUrl.safe || !flatTitle.safe) return null;
        issues.push({ index, code: flatUrl.present || flatTitle.present
          ? "flat-citation-unsupported" : "citation-object-missing" });
        continue;
      }
      if (!ordinaryObject(nested.value)) {
        issues.push({ index, code: "citation-object-invalid" });
        continue;
      }
      const url = ownDataValue(nested.value, "url");
      const title = ownDataValue(nested.value, "title");
      if (!url.safe || !title.safe) return null;
      const urlProblem = stringIssue(url.value, url.present, "url");
      const titleProblem = stringIssue(title.value, title.present, "title");
      if (urlProblem) issues.push({ index, code: urlProblem });
      if (titleProblem) issues.push({ index, code: titleProblem });
      if (!urlProblem && title.value === undefined) {
        const parsedUrl = providerCitationAnnotationSchema.shape.url.safeParse(url.value);
        try { canonicalizePublicCitationUrl(parsedUrl.data!); }
        catch { issues.push({ index, code: "fallback-url-policy" }); }
      }
    }
    return finish("array", count, recognizedCount, ignoredCount, issues);
  } catch { return null; }
}

export function projectAnnotationDiagnostic(input: unknown): AnnotationDiagnostic | null {
  try {
    const value = exactDataFields(input, DIAGNOSTIC_KEYS);
    if (!value || (value.state !== "compatible" && value.state !== "incompatible")
      || !["missing", "null", "array", "other"].includes(value.container as string)
      || typeof value.truncated !== "boolean" || !Array.isArray(value.issues)) return null;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value.issues, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor) || typeof lengthDescriptor.value !== "number"
      || lengthDescriptor.value > 16 || Object.getOwnPropertySymbols(value.issues).length
      || Object.keys(Object.getOwnPropertyDescriptors(value.issues)).length !== lengthDescriptor.value + 1) return null;
    const issues: AnnotationDiagnostic["issues"] = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value.issues, String(index));
      if (!descriptor || !("value" in descriptor)) return null;
      const rawIssue = descriptor.value;
      const item = exactDataFields(rawIssue, ISSUE_KEYS);
      if (!item || !(item.index === null || Number.isInteger(item.index) && (item.index as number) >= 0 && (item.index as number) <= 255)
        || typeof item.code !== "string" || !ISSUE_CODE_SET.has(item.code)) throw new Error();
      issues.push({ index: item.index as number | null, code: item.code as AnnotationDiagnosticIssueCode });
    }
    const count = value.count;
    const recognizedCount = value.recognizedCount;
    const ignoredCount = value.ignoredCount;
    const container = value.container as AnnotationDiagnostic["container"];
    if (container === "missing" || container === "null") {
      if (count !== 0 || recognizedCount !== 0 || ignoredCount !== 0 || issues.length) return null;
    } else if (container === "other") {
      if (count !== null || recognizedCount !== null || ignoredCount !== null
        || issues.length !== 1 || issues[0]?.index !== null || issues[0]?.code !== "container-not-array") return null;
    } else if (count === 257) {
      if (recognizedCount !== null || ignoredCount !== null) return null;
    } else if (!Number.isInteger(count) || (count as number) < 0 || (count as number) > 256
      || !Number.isInteger(recognizedCount) || (recognizedCount as number) < 0 || (recognizedCount as number) > 256
      || !Number.isInteger(ignoredCount) || (ignoredCount as number) < 0 || (ignoredCount as number) > 256
      || (recognizedCount as number) + (ignoredCount as number) !== count) return null;
    const sorted = [...issues].sort((left, right) => {
      const leftIndex = left.index === null ? -1 : left.index;
      const rightIndex = right.index === null ? -1 : right.index;
      return leftIndex - rightIndex || ISSUE_CODE_ORDER.get(left.code)! - ISSUE_CODE_ORDER.get(right.code)!;
    });
    if (issues.some((current, index) => current.index !== sorted[index]?.index || current.code !== sorted[index]?.code)
      || new Set(issues.map((current) => `${current.index ?? "null"}\u0000${current.code}`)).size !== issues.length
      || (value.state === "compatible") !== (issues.length === 0) || value.truncated && issues.length !== 16) return null;
    if (container === "other" && (issues.length !== 1 || issues[0]?.index !== null || issues[0]?.code !== "container-not-array")) return null;
    if (container === "array" && count === 257
      && (issues.length !== 1 || issues[0]?.index !== null || issues[0]?.code !== "annotation-count-limit")) return null;
    if (container === "array" && count !== 257 && issues.some((current) => current.index === null
      || current.index! >= (count as number) || current.code === "container-not-array" || current.code === "annotation-count-limit")) return null;
    if (container === "array" && count !== 257
      && !consistentArrayIssues(issues, count as number, recognizedCount as number, value.truncated)) return null;
    return { state: value.state, container, count: count as number | null,
      recognizedCount: recognizedCount as number | null, ignoredCount: ignoredCount as number | null,
      issues: issues.map((current) => ({ ...current })), truncated: value.truncated };
  } catch { return null; }
}
