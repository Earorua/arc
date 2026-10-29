import { candidateFromContent, fitsUtf8, RESEARCH_PROVIDER_LIMITS } from "./provider";
import { extractResearchJson } from "./research-content";
import { projectValidationCandidateDiagnostic, type ResearchCandidateDiagnostic } from "./result-diagnostic";
import { buildAnnotationDiagnostic, projectAnnotationDiagnostic, type AnnotationDiagnostic } from "./annotation-diagnostic";

export type ResearchResponsePreflightDiagnostic = {
  /** v1 inspected raw content; v2 uses the same extraction as Site import. */
  version: "response-preflight-v1" | "response-preflight-v2";
  stage: "complete-content-preflight";
  annotations: AnnotationDiagnostic | null;
  candidateSchema: ResearchCandidateDiagnostic | null;
};

const RESPONSE_KEYS = ["version", "stage", "annotations", "candidateSchema"] as const;
const ANNOTATION_KEYS = ["state", "container", "count", "recognizedCount", "ignoredCount", "issues", "truncated"] as const;
const ANNOTATION_ISSUE_KEYS = ["index", "code"] as const;
const CANDIDATE_KEYS = ["outcome", "reason", "issues", "truncated"] as const;
const CANDIDATE_ISSUE_KEYS = ["path", "code"] as const;

function safeDataObject(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length) return null;
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

function safeIssues(value: unknown, keys: readonly string[]): Array<Record<string, unknown>> | null {
  if (!Array.isArray(value)) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !("value" in lengthDescriptor) || typeof lengthDescriptor.value !== "number"
    || lengthDescriptor.value > 16 || Object.getOwnPropertySymbols(value).length
    || Object.keys(Object.getOwnPropertyDescriptors(value)).length !== lengthDescriptor.value + 1) return null;
  const result: Array<Record<string, unknown>> = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) return null;
    const item = safeDataObject(descriptor.value, keys);
    if (!item) return null;
    result.push(item);
  }
  return result;
}

function safeAnnotationInput(value: unknown): Record<string, unknown> | null {
  const input = safeDataObject(value, ANNOTATION_KEYS);
  if (!input) return null;
  const issues = safeIssues(input.issues, ANNOTATION_ISSUE_KEYS);
  return issues ? { ...input, issues } : null;
}

function safeCandidateInput(value: unknown): Record<string, unknown> | null {
  const input = safeDataObject(value, CANDIDATE_KEYS);
  if (!input) return null;
  const issues = safeIssues(input.issues, CANDIDATE_ISSUE_KEYS);
  return issues ? { ...input, issues } : null;
}

function withinSerializedLimit(value: ResearchResponsePreflightDiagnostic): boolean {
  const serialized = JSON.stringify(value);
  return serialized.length <= 8_192 && new TextEncoder().encode(serialized).byteLength <= 8_192;
}

export function projectResponsePreflightDiagnostic(input: unknown): ResearchResponsePreflightDiagnostic | null {
  try {
    const value = safeDataObject(input, RESPONSE_KEYS);
    if (!value || (value.version !== "response-preflight-v1" && value.version !== "response-preflight-v2")
      || value.stage !== "complete-content-preflight") return null;
    let annotations: AnnotationDiagnostic | null = null;
    if (value.annotations !== null) {
      const safe = safeAnnotationInput(value.annotations);
      if (!safe) return null;
      annotations = projectAnnotationDiagnostic(safe);
      if (!annotations) return null;
    }
    let candidateSchema: ResearchCandidateDiagnostic | null = null;
    if (value.candidateSchema !== null) {
      const safe = safeCandidateInput(value.candidateSchema);
      if (!safe) return null;
      candidateSchema = projectValidationCandidateDiagnostic(safe);
      if (!candidateSchema) return null;
    }
    const projected: ResearchResponsePreflightDiagnostic = { version: value.version,
      stage: "complete-content-preflight", annotations, candidateSchema };
    return withinSerializedLimit(projected) ? projected : null;
  } catch { return null; }
}

export function buildResponsePreflightDiagnostic(content: string, annotations: unknown): ResearchResponsePreflightDiagnostic | null {
  let annotationDiagnostic: AnnotationDiagnostic | null = null;
  try { annotationDiagnostic = buildAnnotationDiagnostic(annotations); }
  catch { annotationDiagnostic = null; }
  let candidateDiagnostic: ResearchCandidateDiagnostic | null = null;
  try {
    let observed: unknown;
    // Keep the original byte limit even when removing a complete outer code fence.
    const candidateContent = fitsUtf8(content, RESEARCH_PROVIDER_LIMITS.contentBytes)
      ? extractResearchJson(content) : content;
    candidateFromContent(candidateContent, (diagnostic) => { observed = diagnostic; });
    if (observed !== undefined) candidateDiagnostic = projectValidationCandidateDiagnostic(observed);
  } catch { candidateDiagnostic = null; }
  try {
    return projectResponsePreflightDiagnostic({ version: "response-preflight-v2", stage: "complete-content-preflight",
      annotations: annotationDiagnostic, candidateSchema: candidateDiagnostic });
  } catch { return null; }
}
