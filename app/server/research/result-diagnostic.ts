import { z } from "zod";
import {
  providerUsageSchema,
  researchCandidateSchema,
  researchIssueCodeSchema,
  researchQualityReportSchema,
  type ResearchIssueCode,
} from "../../contracts/research";

export type ResearchCandidateDiagnosticReason = "content-limit" | "json-syntax" | "node-limit" | "depth-limit"
  | "string-limit" | "array-limit" | "object-limit" | "schema-rejected";
export type ResearchCandidateDiagnosticIssueCode = "invalid-type" | "invalid-value" | "invalid-format"
  | "too-small" | "too-big" | "unrecognized-keys" | "other";
export type ResearchCandidateDiagnostic = {
  outcome: "accepted" | "rejected";
  reason: ResearchCandidateDiagnosticReason | null;
  issues: Array<{ path: string; code: ResearchCandidateDiagnosticIssueCode }>;
  truncated: boolean;
};
export type ResearchCandidateDiagnosticObserver = (diagnostic: ResearchCandidateDiagnostic) => unknown;

export type ProviderResultDiagnosticReason = "choices-invalid" | "finish-not-stop" | "content-invalid"
  | "annotations-invalid" | "upstream-error" | "provider-error" | "filtered";
export type ProviderFinishReason = "stop" | "length" | "tool_calls" | "content_filter" | "error";
export type ProviderWebSearchUsageDiagnostic = {
  container: "unavailable" | "missing" | "null" | "object" | "invalid";
  requests: "unavailable" | "missing" | "null" | "non-number" | "non-finite" | "non-integer"
    | "out-of-range" | "valid";
};
export type ProviderWebSearchUsageSource = "legacy" | "details" | "both" | "missing" | "invalid" | "conflict";
export type ProviderResultDiagnostic = {
  outcome: "accepted" | "rejected";
  reason: ProviderResultDiagnosticReason | null;
  finishReasonState: "recognized" | "missing" | "invalid" | "unrecognized" | "unavailable";
  finishReason: ProviderFinishReason | null;
  usageIssueCodes: ProviderUsageIssueCode[];
  webSearchUsage: ProviderWebSearchUsageDiagnostic;
  webSearchUsageDetails: ProviderWebSearchUsageDiagnostic;
  webSearchUsageSource: ProviderWebSearchUsageSource;
};
export type ProviderUsageIssueCode = "usage-shape" | "prompt-tokens" | "completion-tokens" | "total-tokens"
  | "token-total-mismatch" | "cost" | "web-search-requests";
export type ResearchAttemptDiagnostic = {
  status: "accepted" | "rejected" | "failed";
  errorCode: "repair-required" | "invalid-result" | "missing-key" | "timeout" | "rate" | "balance"
    | "unavailable" | "filtered" | "invalid-transport" | null;
  charged: boolean | "unknown";
};
export type ResearchRunDiagnostic = {
  errorCode: "missing-key" | "timeout" | "rate" | "balance" | "unavailable" | "filtered"
    | "invalid-transport" | "invalid-result" | "result-too-large" | "unrecognized" | null;
  quality: {
    passed: boolean;
    issueCodes: ResearchIssueCode[];
    skillCount: number;
    sourceCount: number;
    unitCount: number;
  } | null;
};

const finishReasons = new Set<ProviderFinishReason>(["stop", "length", "tool_calls", "content_filter", "error"]);
const providerDiagnosticReasons = ["choices-invalid", "finish-not-stop", "content-invalid", "annotations-invalid",
  "upstream-error", "provider-error", "filtered"] as const;
const providerUsageIssueCodes = ["usage-shape", "prompt-tokens", "completion-tokens", "total-tokens",
  "token-total-mismatch", "cost", "web-search-requests"] as const;
const providerWebSearchContainerStates = ["unavailable", "missing", "null", "object", "invalid"] as const;
const providerWebSearchRequestStates = ["unavailable", "missing", "null", "non-number", "non-finite", "non-integer",
  "out-of-range", "valid"] as const;
const providerWebSearchUsageSources = ["legacy", "details", "both", "missing", "invalid", "conflict"] as const;
const researchAttemptErrorCodes = ["repair-required", "invalid-result", "missing-key", "timeout", "rate", "balance",
  "unavailable", "filtered", "invalid-transport"] as const;
const researchRunErrorCodes = new Set<string>(["missing-key", "timeout", "rate", "balance", "unavailable", "filtered",
  "invalid-transport", "invalid-result", "result-too-large"]);
const researchCandidateDiagnosticReasons = ["content-limit", "json-syntax", "node-limit", "depth-limit", "string-limit",
  "array-limit", "object-limit", "schema-rejected"] as const;
const researchCandidateIssueCodes = ["invalid-type", "invalid-value", "invalid-format", "too-small", "too-big",
  "unrecognized-keys", "other"] as const;
const researchCandidateIssueCodeMap = new Map<string, ResearchCandidateDiagnosticIssueCode>([
  ["invalid_type", "invalid-type"],
  ["invalid_value", "invalid-value"],
  ["invalid_format", "invalid-format"],
  ["too_small", "too-small"],
  ["too_big", "too-big"],
  ["unrecognized_keys", "unrecognized-keys"],
]);
const sortedCandidateIssuesSchema = z.array(z.object({
  path: z.string(),
  code: z.enum(researchCandidateIssueCodes),
}).strict()).max(16).superRefine((issues, context) => {
  const sortedUnique = [...new Map(issues.map((issue) => [`${issue.path}\u0000${issue.code}`, issue])).values()]
    .sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code));
  if (issues.some((issue, index) => issue.path !== sortedUnique[index]?.path || issue.code !== sortedUnique[index]?.code)) {
    context.addIssue({ code: "custom", message: "Candidate issues must be sorted and unique" });
  }
});
const researchCandidateDiagnosticSchema = z.object({
  outcome: z.enum(["accepted", "rejected"]),
  reason: z.enum(researchCandidateDiagnosticReasons).nullable(),
  issues: sortedCandidateIssuesSchema,
  truncated: z.boolean(),
}).strict().superRefine((diagnostic, context) => {
  if ((diagnostic.reason === null) !== (diagnostic.outcome === "accepted")) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Outcome and reason must agree" });
  }
  if (diagnostic.reason !== "schema-rejected" && (diagnostic.issues.length !== 0 || diagnostic.truncated)) {
    context.addIssue({ code: "custom", path: ["issues"], message: "Only schema rejection may include issues" });
  }
  if (diagnostic.truncated && diagnostic.issues.length !== 16) {
    context.addIssue({ code: "custom", path: ["truncated"], message: "A truncated diagnostic must retain the issue cap" });
  }
});
let researchCandidatePaths: ReadonlySet<string> | undefined;
let researchCandidatePathEdges: ReadonlySet<string> | undefined;

function trustedResearchCandidatePaths(): ReadonlySet<string> {
  if (researchCandidatePaths) return researchCandidatePaths;
  const paths = new Set<string>(["$"]);
  const edges = new Set<string>();
  const schema = z.toJSONSchema(researchCandidateSchema, { target: "draft-7" }) as Record<string, unknown>;
  const visit = (node: unknown, path: string) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const record = node as Record<string, unknown>;
    if (record.properties && typeof record.properties === "object" && !Array.isArray(record.properties)) {
      for (const [key, child] of Object.entries(record.properties)) {
        const childPath = path === "$" ? key : `${path}.${key}`;
        edges.add(`${path}\u0000property\u0000${key}`);
        paths.add(childPath);
        visit(child, childPath);
      }
    }
    if (record.items) {
      const itemPath = path === "$" ? "$[]" : `${path}[]`;
      edges.add(`${path}\u0000item`);
      paths.add(itemPath);
      visit(record.items, itemPath);
    }
  };
  visit(schema, "$");
  researchCandidatePaths = paths;
  researchCandidatePathEdges = edges;
  return paths;
}

function trustedCandidateIssuePath(path: PropertyKey[]): string {
  trustedResearchCandidatePaths();
  const edges = researchCandidatePathEdges!;
  let result = "$";
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Number.isSafeInteger(segment) || segment < 0) break;
      if (!edges.has(`${result}\u0000item`)) break;
      result = result === "$" ? "$[]" : `${result}[]`;
    } else if (typeof segment === "string") {
      if (!edges.has(`${result}\u0000property\u0000${segment}`)) break;
      result = result === "$" ? segment : `${result}.${segment}`;
    } else break;
  }
  return result;
}

export function buildResearchCandidateDiagnostic(
  reason: ResearchCandidateDiagnosticReason | null,
  zodIssues: readonly z.core.$ZodIssue[] = [],
): ResearchCandidateDiagnostic {
  const unique = new Map<string, ResearchCandidateDiagnostic["issues"][number]>();
  if (reason === "schema-rejected") {
    for (const issue of zodIssues) {
      const projected = {
        path: trustedCandidateIssuePath(issue.path),
        code: researchCandidateIssueCodeMap.get(issue.code) ?? "other",
      };
      unique.set(`${projected.path}\u0000${projected.code}`, projected);
    }
  }
  const all = [...unique.values()].sort((left, right) =>
    left.path.localeCompare(right.path) || left.code.localeCompare(right.code));
  return {
    outcome: reason === null ? "accepted" : "rejected",
    reason,
    issues: all.slice(0, 16),
    truncated: reason === "schema-rejected" && all.length > 16,
  };
}

export function projectValidationCandidateDiagnostic(value: unknown): ResearchCandidateDiagnostic | null {
  try {
    if (!ordinaryRecord(value)) return null;
    const issues = value.issues;
    if (!Array.isArray(issues) || issues.length > 16) return null;
    const projectedIssues = issues.map((issue) => {
      if (!ordinaryRecord(issue)) throw new Error();
      return { path: issue.path, code: issue.code };
    });
    if (projectedIssues.some((issue) => typeof issue.path !== "string"
      || !trustedResearchCandidatePaths().has(issue.path))) return null;
    const parsed = researchCandidateDiagnosticSchema.safeParse({
      outcome: value.outcome,
      reason: value.reason,
      issues: projectedIssues,
      truncated: value.truncated,
    });
    return parsed.success ? {
      outcome: parsed.data.outcome,
      reason: parsed.data.reason,
      issues: parsed.data.issues.map((issue) => ({ ...issue })),
      truncated: parsed.data.truncated,
    } : null;
  } catch { return null; }
}
const sortedUsageIssueCodesSchema = z.array(z.enum(providerUsageIssueCodes)).max(7).superRefine((codes, context) => {
  const sortedUnique = [...new Set(codes)].sort();
  if (codes.some((code, index) => code !== sortedUnique[index])) {
    context.addIssue({ code: "custom", message: "Usage issue codes must be sorted and unique" });
  }
});
const providerWebSearchUsageDiagnosticSchema = z.object({
  container: z.enum(providerWebSearchContainerStates),
  requests: z.enum(providerWebSearchRequestStates),
}).strict().superRefine((diagnostic, context) => {
  if ((diagnostic.container === "object" && diagnostic.requests === "unavailable")
    || (diagnostic.container !== "object" && diagnostic.requests !== "unavailable")) {
    context.addIssue({ code: "custom", message: "Search container and request states must agree" });
  }
});
const providerResultDiagnosticSchema = z.object({
  outcome: z.enum(["accepted", "rejected"]),
  reason: z.enum(providerDiagnosticReasons).nullable(),
  finishReasonState: z.enum(["recognized", "missing", "invalid", "unrecognized", "unavailable"]),
  finishReason: z.enum(["stop", "length", "tool_calls", "content_filter", "error"]).nullable(),
  usageIssueCodes: sortedUsageIssueCodesSchema,
  webSearchUsage: providerWebSearchUsageDiagnosticSchema,
  webSearchUsageDetails: providerWebSearchUsageDiagnosticSchema,
  webSearchUsageSource: z.enum(providerWebSearchUsageSources),
}).strict().superRefine((diagnostic, context) => {
  if ((diagnostic.reason === null) !== (diagnostic.outcome === "accepted")) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Outcome and reason must agree" });
  }
  if ((diagnostic.finishReason !== null) !== (diagnostic.finishReasonState === "recognized")) {
    context.addIssue({ code: "custom", path: ["finishReason"], message: "Finish reason and state must agree" });
  }
  const legacyState = diagnostic.webSearchUsage.container === "unavailable" ? "unavailable"
    : diagnostic.webSearchUsage.container === "missing" ? "missing"
      : diagnostic.webSearchUsage.requests === "valid" ? "valid" : "invalid";
  const detailsState = diagnostic.webSearchUsageDetails.container === "unavailable" ? "unavailable"
    : diagnostic.webSearchUsageDetails.container === "missing" ? "missing"
      : diagnostic.webSearchUsageDetails.requests === "valid" ? "valid" : "invalid";
  const sourceValid = legacyState === "unavailable" || detailsState === "unavailable"
    ? legacyState === "unavailable" && detailsState === "unavailable" && diagnostic.webSearchUsageSource === "invalid"
    : legacyState === "invalid" || detailsState === "invalid"
      ? diagnostic.webSearchUsageSource === "invalid"
      : legacyState === "missing" && detailsState === "missing"
        ? diagnostic.webSearchUsageSource === "missing"
        : legacyState === "valid" && detailsState === "missing"
          ? diagnostic.webSearchUsageSource === "legacy"
          : legacyState === "missing" && detailsState === "valid"
            ? diagnostic.webSearchUsageSource === "details"
            : diagnostic.webSearchUsageSource === "both" || diagnostic.webSearchUsageSource === "conflict";
  if (!sourceValid) {
    context.addIssue({ code: "custom", path: ["webSearchUsageSource"],
      message: "Search usage shapes and source must agree" });
  }
});
const researchAttemptDiagnosticSchema = z.object({
  status: z.enum(["accepted", "rejected", "failed"]),
  errorCode: z.enum(researchAttemptErrorCodes).nullable(),
  charged: z.union([z.boolean(), z.literal("unknown")]),
}).strict().superRefine((diagnostic, context) => {
  if ((diagnostic.status === "accepted" && diagnostic.errorCode !== null)
    || (diagnostic.status !== "accepted" && diagnostic.errorCode === null)
    || (diagnostic.status !== "failed" && diagnostic.charged === false)
    || (diagnostic.status === "rejected" && diagnostic.errorCode !== "invalid-result" && diagnostic.errorCode !== "repair-required")
    || (diagnostic.status === "failed" && (diagnostic.errorCode === "invalid-result" || diagnostic.errorCode === "repair-required"))) {
    context.addIssue({ code: "custom", message: "Inconsistent Research attempt diagnostic" });
  }
});
const researchRunDiagnosticSchema = z.object({
  errorCode: z.enum(["missing-key", "timeout", "rate", "balance", "unavailable", "filtered", "invalid-transport",
    "invalid-result", "result-too-large", "unrecognized"]).nullable(),
  quality: z.object({
    passed: z.boolean(), issueCodes: z.array(researchIssueCodeSchema).max(64), skillCount: z.number().int().min(0).max(64),
    sourceCount: z.number().int().min(0).max(256), unitCount: z.number().int().min(0).max(512),
  }).strict().nullable(),
}).strict();
const recordValue = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function ordinaryRecord(value: unknown): value is Record<string, unknown> {
  if (!recordValue(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value) as unknown;
    return prototype === Object.prototype || prototype === null;
  } catch { return false; }
}

/** Decimal arithmetic avoids floating-point rounding below an integer micro boundary. */
export function creditsToMicros(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const [coefficient, exponentText] = String(value).toLowerCase().split("e");
  const [whole, fraction = ""] = coefficient!.split(".");
  const digits = BigInt(whole! + fraction);
  const exponent = Number(exponentText ?? 0) - fraction.length + 6;
  const divisor = exponent < 0 ? BigInt(10) ** BigInt(-exponent) : BigInt(1);
  const micros = exponent < 0 ? (digits + divisor - BigInt(1)) / divisor : digits * BigInt(10) ** BigInt(exponent);
  return micros <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(micros) : null;
}

type WebSearchUsageSelection = {
  legacy: ProviderWebSearchUsageDiagnostic;
  details: ProviderWebSearchUsageDiagnostic;
  source: ProviderWebSearchUsageSource;
  count: number | undefined;
};

function classifyWebSearchContainer(container: unknown): {
  diagnostic: ProviderWebSearchUsageDiagnostic;
  state: "missing" | "valid" | "invalid";
  count: number | undefined;
} {
  if (container === undefined) {
    return { diagnostic: { container: "missing", requests: "unavailable" }, state: "missing", count: undefined };
  }
  if (container === null) {
    return { diagnostic: { container: "null", requests: "unavailable" }, state: "invalid", count: undefined };
  }
  if (!recordValue(container)) {
    return { diagnostic: { container: "invalid", requests: "unavailable" }, state: "invalid", count: undefined };
  }
  const requests = container.web_search_requests;
  if (requests === undefined) {
    return { diagnostic: { container: "object", requests: "missing" }, state: "invalid", count: undefined };
  }
  if (requests === null) {
    return { diagnostic: { container: "object", requests: "null" }, state: "invalid", count: undefined };
  }
  if (typeof requests !== "number") {
    return { diagnostic: { container: "object", requests: "non-number" }, state: "invalid", count: undefined };
  }
  if (!Number.isFinite(requests)) {
    return { diagnostic: { container: "object", requests: "non-finite" }, state: "invalid", count: undefined };
  }
  if (!Number.isInteger(requests)) {
    return { diagnostic: { container: "object", requests: "non-integer" }, state: "invalid", count: undefined };
  }
  if (!providerUsageSchema.shape.webSearchRequests.safeParse(requests).success) {
    return { diagnostic: { container: "object", requests: "out-of-range" }, state: "invalid", count: undefined };
  }
  return { diagnostic: { container: "object", requests: "valid" }, state: "valid", count: requests };
}

function selectWebSearchUsage(value: unknown, repair: boolean): WebSearchUsageSelection {
  const wire = recordValue(value) ? value : null;
  if (!wire) {
    const unavailable = { container: "unavailable", requests: "unavailable" } as const;
    return { legacy: { ...unavailable }, details: { ...unavailable }, source: "invalid", count: undefined };
  }
  const legacy = classifyWebSearchContainer(wire.server_tool_use);
  const details = classifyWebSearchContainer(wire.server_tool_use_details);
  if (legacy.state === "invalid" || details.state === "invalid") {
    return { legacy: legacy.diagnostic, details: details.diagnostic, source: "invalid", count: undefined };
  }
  if (legacy.state === "missing" && details.state === "missing") {
    return { legacy: legacy.diagnostic, details: details.diagnostic, source: "missing", count: repair ? 0 : undefined };
  }
  if (legacy.state === "valid" && details.state === "missing") {
    return { legacy: legacy.diagnostic, details: details.diagnostic, source: "legacy", count: legacy.count };
  }
  if (legacy.state === "missing" && details.state === "valid") {
    return { legacy: legacy.diagnostic, details: details.diagnostic, source: "details", count: details.count };
  }
  const same = legacy.count === details.count;
  return { legacy: legacy.diagnostic, details: details.diagnostic, source: same ? "both" : "conflict",
    count: same ? legacy.count : undefined };
}

function projectUsage(value: unknown, selection: WebSearchUsageSelection) {
  const wire = recordValue(value) ? value : null;
  return {
    promptTokens: wire?.prompt_tokens,
    completionTokens: wire?.completion_tokens,
    totalTokens: wire?.total_tokens,
    costMicros: creditsToMicros(wire?.cost),
    webSearchRequests: selection.count,
  };
}

export function parseOpenRouterUsage(value: unknown, repair: boolean) {
  const selection = selectWebSearchUsage(value, repair);
  return providerUsageSchema.safeParse(projectUsage(value, selection));
}

function projectFinishReason(outer: Record<string, unknown>): Pick<ProviderResultDiagnostic, "finishReasonState" | "finishReason"> {
  const choices = outer.choices;
  if (!Array.isArray(choices) || choices.length !== 1 || !ordinaryRecord(choices[0])) {
    return { finishReasonState: "unavailable", finishReason: null };
  }
  const value = choices[0].finish_reason;
  if (value === undefined || value === null) return { finishReasonState: "missing", finishReason: null };
  if (typeof value !== "string") return { finishReasonState: "invalid", finishReason: null };
  if (!finishReasons.has(value as ProviderFinishReason)) return { finishReasonState: "unrecognized", finishReason: null };
  return { finishReasonState: "recognized", finishReason: value as ProviderFinishReason };
}

function projectUsageIssues(value: unknown, projected: ReturnType<typeof projectUsage>,
  parsedUsage: ReturnType<typeof parseOpenRouterUsage>): ProviderUsageIssueCode[] {
  if (!recordValue(value)) return ["usage-shape"];
  if (parsedUsage.success) return [];
  const issues = new Set<ProviderUsageIssueCode>();
  const pathCodes: Record<string, ProviderUsageIssueCode> = {
    promptTokens: "prompt-tokens",
    completionTokens: "completion-tokens",
    totalTokens: "total-tokens",
    costMicros: "cost",
    webSearchRequests: "web-search-requests",
  };
  for (const issue of parsedUsage.error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string") continue;
    if (field === "totalTokens" && issue.code === "custom") continue;
    const code = pathCodes[field];
    if (code) issues.add(code);
  }
  if (!issues.has("prompt-tokens") && !issues.has("completion-tokens") && !issues.has("total-tokens")
    && typeof projected.promptTokens === "number" && typeof projected.completionTokens === "number"
    && typeof projected.totalTokens === "number"
    && projected.totalTokens !== projected.promptTokens + projected.completionTokens) {
    issues.add("token-total-mismatch");
  }
  return [...issues].sort();
}

export function projectProviderResultDiagnostic(
  outer: Record<string, unknown>,
  repair: boolean,
  reason: ProviderResultDiagnosticReason | null,
  parsedUsage?: ReturnType<typeof parseOpenRouterUsage>,
): ProviderResultDiagnostic {
  const usage = outer.usage;
  const selection = selectWebSearchUsage(usage, repair);
  const projectedUsage = projectUsage(usage, selection);
  const authoritativeUsage = parsedUsage ?? providerUsageSchema.safeParse(projectedUsage);
  return {
    outcome: reason === null ? "accepted" : "rejected",
    reason,
    ...projectFinishReason(outer),
    usageIssueCodes: projectUsageIssues(usage, projectedUsage, authoritativeUsage),
    webSearchUsage: selection.legacy,
    webSearchUsageDetails: selection.details,
    webSearchUsageSource: selection.source,
  };
}

export function projectValidationProviderResultDiagnostic(value: unknown): ProviderResultDiagnostic | null {
  try {
    if (!ordinaryRecord(value)) return null;
    const usageIssueCodes = value.usageIssueCodes;
    const webSearchUsage = value.webSearchUsage;
    const webSearchUsageDetails = value.webSearchUsageDetails;
    if (!ordinaryRecord(webSearchUsage) || !ordinaryRecord(webSearchUsageDetails)) return null;
    const projected = {
      outcome: value.outcome,
      reason: value.reason,
      finishReasonState: value.finishReasonState,
      finishReason: value.finishReason,
      usageIssueCodes: Array.isArray(usageIssueCodes) ? [...usageIssueCodes] : usageIssueCodes,
      webSearchUsage: { container: webSearchUsage.container, requests: webSearchUsage.requests },
      webSearchUsageDetails: { container: webSearchUsageDetails.container, requests: webSearchUsageDetails.requests },
      webSearchUsageSource: value.webSearchUsageSource,
    };
    const parsed = providerResultDiagnosticSchema.safeParse(projected);
    return parsed.success ? {
      outcome: parsed.data.outcome,
      reason: parsed.data.reason,
      finishReasonState: parsed.data.finishReasonState,
      finishReason: parsed.data.finishReason,
      usageIssueCodes: [...parsed.data.usageIssueCodes],
      webSearchUsage: { ...parsed.data.webSearchUsage },
      webSearchUsageDetails: { ...parsed.data.webSearchUsageDetails },
      webSearchUsageSource: parsed.data.webSearchUsageSource,
    } : null;
  } catch { return null; }
}

export function projectResearchAttemptDiagnostic(value: unknown): ResearchAttemptDiagnostic | null {
  try {
    if (!ordinaryRecord(value)) return null;
    const parsed = researchAttemptDiagnosticSchema.safeParse({
      status: value.status,
      errorCode: value.errorCode,
      charged: value.charged,
    });
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export function projectResearchRunDiagnostic(value: unknown): ResearchRunDiagnostic | null {
  try {
    if (!ordinaryRecord(value)
      || !Object.prototype.hasOwnProperty.call(value, "errorCode")
      || !Object.prototype.hasOwnProperty.call(value, "quality")) return null;
    const rawErrorCode = value.errorCode;
    const rawQuality = value.quality;
    const errorCode = rawErrorCode === null ? null
      : typeof rawErrorCode === "string" && researchRunErrorCodes.has(rawErrorCode) ? rawErrorCode : "unrecognized";
    let quality: ResearchRunDiagnostic["quality"] = null;
    if (rawQuality !== null) {
      const parsedQuality = researchQualityReportSchema.safeParse(rawQuality);
      if (!parsedQuality.success) return null;
      quality = {
        passed: parsedQuality.data.passed,
        issueCodes: [...parsedQuality.data.issueCodes],
        skillCount: parsedQuality.data.skillCount,
        sourceCount: parsedQuality.data.sourceCount,
        unitCount: parsedQuality.data.unitCount,
      };
    }
    const parsed = researchRunDiagnosticSchema.safeParse({ errorCode, quality });
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
