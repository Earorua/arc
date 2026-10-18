import { z } from "zod";
import { providerCitationAnnotationSchema, providerUsageSchema, researchCandidateSchema, type ProviderCitationAnnotation, type ProviderUsage, type ResearchCandidate } from "../../contracts/research";

export const RESEARCH_PROVIDER_VERSIONS = Object.freeze({
  promptVersion: "research-prompt-v1", inputSchemaVersion: "research-input-v1", outputSchemaVersion: "research-output-v1",
  qualityVersion: "research-quality-v1", modelConfigVersion: "research-model-config-v1",
});
export const RESEARCH_PROVIDER_LIMITS = Object.freeze({ requestBytes: 262_144, responseBytes: 524_288, contentBytes: 196_608 });

export interface ProviderResearchRequest { role: string; locale: "en-US" | "zh-CN" }
export interface ProviderRepairRequest extends ProviderResearchRequest {
  originalContent: string;
  annotations: ProviderCitationAnnotation[];
}
export interface ProviderAuditMetadata { actualModel: string | null; usage: ProviderUsage | null }
export interface ProviderResearchResult extends ProviderAuditMetadata {
  /** Server-only, bounded original content. Never render or persist as a public result. */
  content: string;
  /** Shape-valid only: the package validator remains the source/quality authority. */
  candidate: ResearchCandidate | null;
  annotations: ProviderCitationAnnotation[];
}
export interface ResearchProvider {
  research(request: ProviderResearchRequest): Promise<ProviderResearchResult>;
  repair(request: ProviderRepairRequest): Promise<ProviderResearchResult>;
}
export type ResearchProviderErrorCode = "missing-key" | "timeout" | "rate" | "balance" | "unavailable" | "filtered" | "invalid-transport";
export class ResearchProviderError extends Error {
  readonly actualModel: string | null;
  readonly usage: ProviderUsage | null;
  constructor(readonly code: ResearchProviderErrorCode, readonly retryable: boolean, readonly charged: boolean | "unknown", audit: ProviderAuditMetadata = { actualModel: null, usage: null }) {
    super(`Research provider failure: ${code}`);
    this.name = "ResearchProviderError";
    this.actualModel = typeof audit.actualModel === "string" && audit.actualModel.length <= 128
      && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/u.test(audit.actualModel) ? audit.actualModel : null;
    const parsed = providerUsageSchema.safeParse(audit.usage);
    this.usage = parsed.success ? parsed.data : null;
  }
}

const roleSchema = z.string().min(2).max(640).regex(/^[^\u0000-\u001f\u007f-\u009f]+$/u)
  .transform((value) => value.normalize("NFKC").trim().replace(/\s+/gu, " "))
  .pipe(z.string().min(2).max(160));
const requestSchema = z.object({ role: roleSchema, locale: z.enum(["en-US", "zh-CN"]) }).strict();

/** Fail closed before any provider execution; never copy caller metadata or invoke accessors. */
export function parseProviderRequest(input: ProviderResearchRequest): ProviderResearchRequest {
  try { return requestSchema.parse(plainFields(input, ["role", "locale"])); }
  catch { throw new ResearchProviderError("invalid-transport", false, false); }
}

export function parseProviderRepairRequest(input: ProviderRepairRequest): ProviderRepairRequest {
  try {
    const fields = plainFields(input, ["role", "locale", "originalContent", "annotations"]);
    const request = parseProviderRequest({ role: fields.role as string, locale: fields.locale as ProviderResearchRequest["locale"] });
    if (typeof fields.originalContent !== "string" || !fields.originalContent.trim()
      || !fitsUtf8(fields.originalContent, RESEARCH_PROVIDER_LIMITS.contentBytes)
      || !Array.isArray(fields.annotations) || fields.annotations.length > 256) throw new Error();
    const annotations = fields.annotations.map((annotation) => providerCitationAnnotationSchema.parse(plainFields(annotation, ["type", "url", "title"])));
    return { ...request, originalContent: fields.originalContent, annotations };
  } catch { throw new ResearchProviderError("invalid-transport", false, false); }
}

function plainFields(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Object.getPrototypeOf(input) !== Object.prototype || Object.getOwnPropertySymbols(input).length) throw new Error();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Object.keys(descriptors).length !== keys.length) throw new Error();
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error();
    result[key] = descriptor.value;
  }
  return result;
}

export function fitsUtf8(value: string, maximum: number): boolean {
  return value.length <= maximum && new TextEncoder().encode(value).byteLength <= maximum;
}

/** Shape only; preserve original content separately so mechanical repair stays explicit. */
export function candidateFromContent(content: string): ResearchCandidate | null {
  if (!fitsUtf8(content, RESEARCH_PROVIDER_LIMITS.contentBytes)) return null;
  try {
    const input: unknown = JSON.parse(content);
    const pending = [{ value: input, depth: 0 }];
    let nodes = 0;
    while (pending.length) {
      const { value, depth } = pending.pop()!;
      if (++nodes > 25_000 || depth > 12) return null;
      if (typeof value === "string" && value.length > 8_192) return null;
      if (value && typeof value === "object") {
        const values = Object.values(value);
        if (values.length > (Array.isArray(value) ? 4_096 : 64)) return null;
        for (const child of values) pending.push({ value: child, depth: depth + 1 });
      }
    }
    const parsed = researchCandidateSchema.safeParse(input);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
