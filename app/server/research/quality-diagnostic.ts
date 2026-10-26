import type { z } from "zod";
import type { IntelligenceIssueCode } from "../../lib/intelligence-validation";
import type { RegistryIssueCode } from "../../lib/planning/registry-validation";

const BLUEPRINT_CODES = ["duplicate-skill", "duplicate-resource", "duplicate-phase", "duplicate-reference", "missing-prerequisite", "missing-resource", "resource-backlink-mismatch", "missing-resource-skill", "resource-forward-link-mismatch", "missing-phase-skill", "unplanned-skill", "prerequisite-cycle", "free-alternative-required"] as const satisfies readonly IntelligenceIssueCode[];
const REGISTRY_CODES = ["duplicate-track", "duplicate-template", "duplicate-step", "duplicate-checkpoint", "missing-skill", "missing-resource", "missing-kind", "minute-mismatch", "invalid-checkpoint", "registry-version-mismatch"] as const satisfies readonly RegistryIssueCode[];
const EVIDENCE_CODES = ["duplicate-resource-url", "duplicate-stage-skill", "duplicate-evidence-id", "duplicate-evidence-pair", "missing-edge-endpoint", "invalid-evidence-link", "missing-skill-evidence", "missing-core-authority", "missing-free-alternative", "unverified-free-access", "unverified-source-authority"] as const;
const BLUEPRINT_SCOPES = ["root", "skill", "resource", "stage", "unknown"] as const;
const REGISTRY_SCOPES = ["root", "track", "template", "alternative-resource-ids", "step", "checkpoint", "checkpoint-step-ids", "completion-criteria", "rubric", "unknown"] as const;
const SCHEMA_CODES = ["invalid-type", "invalid-value", "invalid-format", "too-small", "too-big", "unrecognized-keys", "other"] as const;
export type EvidenceQualityIssueCode = typeof EVIDENCE_CODES[number];
type Scope = typeof BLUEPRINT_SCOPES[number] | typeof REGISTRY_SCOPES[number];
type SchemaCode = typeof SCHEMA_CODES[number];
type SchemaDiagnostic<S extends Scope> = { outcome: "accepted" | "rejected"; issues: { scope: S; code: SchemaCode }[]; truncated: boolean };
type SchemaObservation = Readonly<{ success: boolean; issues: readonly z.core.$ZodIssue[] }>;
export type ResearchQualityDiagnosticInput = Readonly<{
  blueprintSchema: SchemaObservation;
  registrySchema: SchemaObservation;
  blueprintIssueCodes: readonly IntelligenceIssueCode[];
  registryIssueCodes: readonly RegistryIssueCode[];
  evidenceIssueCodes: readonly EvidenceQualityIssueCode[];
}>;
export type ResearchQualityDiagnostic = {
  version: "quality-diagnostic-v1";
  stage: "semantic-validation";
  blueprintSchema: SchemaDiagnostic<typeof BLUEPRINT_SCOPES[number]>;
  registrySchema: SchemaDiagnostic<typeof REGISTRY_SCOPES[number]>;
  blueprintIssueCodes: IntelligenceIssueCode[];
  registryIssueCodes: RegistryIssueCode[];
  evidenceIssueCodes: EvidenceQualityIssueCode[];
};
export type ResearchQualityDiagnosticObserver = (diagnostic: Readonly<ResearchQualityDiagnostic>) => unknown;

// A finite path grammar: only schema property edges and nonnegative integer
// array positions are traversable. Unknown suffixes invalidate the entire path.
type PathNode = { scope: Scope; properties?: Readonly<Record<string, PathNode>>; item?: PathNode };
const leaf = (scope: Scope): PathNode => ({ scope });
const array = (scope: Scope, item = leaf(scope)): PathNode => ({ scope, item });
function object(scope: Scope, scalars: readonly string[], nested: Record<string, PathNode> = {}): PathNode {
  return { scope, properties: Object.fromEntries([...scalars.map(key => [key, leaf(scope)]), ...Object.entries(nested)]) };
}
const blueprintPaths = object("root", ["id", "name", "summary", "version", "status", "updatedAt", "languagePolicy"], {
  skills: array("skill", object("skill", ["id", "name", "category", "importance", "why", "confidence"], {
    masteryCriteria: array("skill"), prerequisiteIds: array("skill"), resourceIds: array("skill"),
  })),
  resources: array("resource", object("resource", ["id", "title", "url", "provider", "language", "cost", "format", "sourceTier", "purpose", "estimatedMinutes", "lastVerifiedAt"], { skillIds: array("resource") })),
  phases: array("stage", object("stage", ["id", "name", "weeks", "outcome"], { skillIds: array("stage") })),
});
const registryPaths = object("root", ["id", "version", "blueprintId", "blueprintVersion"], {
  tracks: array("track", object("track", ["skillId"], {
    templates: array("template", object("template", ["id", "version", "skillId", "kind", "title", "objective", "whyNow", "primaryResourceId", "buildTask", "proofRequirement", "estimatedMinutes"], {
      alternativeResourceIds: array("alternative-resource-ids"),
      steps: array("step", object("step", ["id", "label", "minutes"])),
      checkpoints: array("checkpoint", object("checkpoint", ["id", "label", "estimatedMinutes"], { stepIds: array("checkpoint-step-ids") })),
      completionCriteria: array("completion-criteria"), rubric: array("rubric"),
    })),
  })),
});

function scopeFor(path: readonly PropertyKey[], root: PathNode): Scope {
  let node = root;
  for (const edge of path) {
    if (node.item && typeof edge === "number" && Number.isSafeInteger(edge) && edge >= 0) node = node.item;
    else if (node.properties && typeof edge === "string" && Object.hasOwn(node.properties, edge)) node = node.properties[edge]!;
    else return "unknown";
  }
  return node.scope;
}
function schemaCode(code: string): SchemaCode {
  switch (code) {
    case "invalid_type": return "invalid-type";
    case "invalid_value": return "invalid-value";
    case "invalid_format": return "invalid-format";
    case "too_small": return "too-small";
    case "too_big": return "too-big";
    case "unrecognized_keys": return "unrecognized-keys";
    default: return "other";
  }
}
function buildSchema(observation: SchemaObservation, root: PathNode): SchemaDiagnostic<Scope> {
  if (observation.success) return { outcome: "accepted", issues: [], truncated: false };
  const pairs = new Map<string, { scope: Scope; code: SchemaCode }>();
  for (const issue of observation.issues) {
    const scope = scopeFor(issue.path, root);
    const code = schemaCode(issue.code);
    pairs.set(`${scope}/${code}`, { scope, code });
  }
  const sorted = [...pairs].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return { outcome: "rejected", issues: sorted.slice(0, 16).map(([, pair]) => pair), truncated: pairs.size > 16 };
}

function dataObject(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length) return null;
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(descriptors, key)?.value as PropertyDescriptor | undefined;
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    result[key] = descriptor.value;
  }
  return result;
}
function dataArray(value: unknown, cap: number): unknown[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = Object.getOwnPropertyDescriptor(value, "length");
  if (!length || !("value" in length) || typeof length.value !== "number" || !Number.isSafeInteger(length.value) || length.value < 0 || length.value > cap
    || Reflect.ownKeys(descriptors).length !== length.value + 1) return null;
  const result: unknown[] = [];
  for (let i = 0; i < length.value; i += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(descriptors, String(i))?.value as PropertyDescriptor | undefined;
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    result.push(descriptor.value);
  }
  return result;
}
function allowed<T extends string>(value: unknown, list: readonly T[]): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}
function projectCodes<T extends string>(value: unknown, list: readonly T[]): T[] | null {
  const values = dataArray(value, list.length);
  if (!values) return null;
  const result: T[] = [];
  for (const code of values) {
    if (!allowed(code, list) || (result.length > 0 && result[result.length - 1]! >= code)) return null;
    result.push(code);
  }
  return result;
}
function projectSchema<S extends Scope>(value: unknown, scopes: readonly S[]): SchemaDiagnostic<S> | null {
  const data = dataObject(value, ["outcome", "issues", "truncated"]);
  if (!data || (data.outcome !== "accepted" && data.outcome !== "rejected") || typeof data.truncated !== "boolean") return null;
  const items = dataArray(data.issues, 16);
  if (!items || (data.outcome === "accepted" && (items.length !== 0 || data.truncated))
    || (data.outcome === "rejected" && items.length === 0) || (data.truncated && items.length !== 16)) return null;
  const issues: { scope: S; code: SchemaCode }[] = [];
  let previous = "";
  for (const item of items) {
    const pair = dataObject(item, ["scope", "code"]);
    if (!pair || !allowed(pair.scope, scopes) || !allowed(pair.code, SCHEMA_CODES)) return null;
    const key = `${pair.scope}/${pair.code}`;
    if (key <= previous) return null;
    previous = key;
    issues.push({ scope: pair.scope, code: pair.code });
  }
  return { outcome: data.outcome, issues, truncated: data.truncated };
}

export function projectResearchQualityDiagnostic(input: unknown): ResearchQualityDiagnostic | null {
  try {
    const data = dataObject(input, ["version", "stage", "blueprintSchema", "registrySchema", "blueprintIssueCodes", "registryIssueCodes", "evidenceIssueCodes"]);
    if (!data || data.version !== "quality-diagnostic-v1" || data.stage !== "semantic-validation") return null;
    const blueprintSchema = projectSchema(data.blueprintSchema, BLUEPRINT_SCOPES);
    const registrySchema = projectSchema(data.registrySchema, REGISTRY_SCOPES);
    const blueprintIssueCodes = projectCodes(data.blueprintIssueCodes, BLUEPRINT_CODES);
    const registryIssueCodes = projectCodes(data.registryIssueCodes, REGISTRY_CODES);
    const evidenceIssueCodes = projectCodes(data.evidenceIssueCodes, EVIDENCE_CODES);
    if (!blueprintSchema || !registrySchema || !blueprintIssueCodes || !registryIssueCodes || !evidenceIssueCodes) return null;
    const result: ResearchQualityDiagnostic = { version: "quality-diagnostic-v1", stage: "semantic-validation", blueprintSchema, registrySchema, blueprintIssueCodes, registryIssueCodes, evidenceIssueCodes };
    return new TextEncoder().encode(JSON.stringify(result)).byteLength <= 8192 ? result : null;
  } catch { return null; }
}

export function buildResearchQualityDiagnostic(input: ResearchQualityDiagnosticInput): ResearchQualityDiagnostic | null {
  try {
    return projectResearchQualityDiagnostic({ version: "quality-diagnostic-v1", stage: "semantic-validation",
      blueprintSchema: buildSchema(input.blueprintSchema, blueprintPaths), registrySchema: buildSchema(input.registrySchema, registryPaths),
      blueprintIssueCodes: [...new Set(input.blueprintIssueCodes)].sort(), registryIssueCodes: [...new Set(input.registryIssueCodes)].sort(),
      evidenceIssueCodes: [...new Set(input.evidenceIssueCodes)].sort(),
    });
  } catch { return null; }
}

export function observeResearchQualityDiagnostic(input: ResearchQualityDiagnosticInput, observer?: ResearchQualityDiagnosticObserver): void {
  if (!observer) return;
  try {
    const diagnostic = buildResearchQualityDiagnostic(input);
    if (diagnostic) void Promise.resolve(observer(diagnostic)).catch(() => {});
  } catch { /* Observation cannot affect validation or leak rejection text. */ }
}
