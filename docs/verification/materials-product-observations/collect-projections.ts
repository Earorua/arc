import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { documentExtractionSchema, documentTextSchema, materialIdSchema, materialOwnerIdSchema } from "../../../app/contracts/documents";
import { flagshipBlueprint } from "../../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../../app/data/flagship-unit-registry";
import { mapMaterialItems, mapMaterialItemTerms, MATERIAL_MAPPING_VERSION } from "../../../app/lib/materials/skill-mapper";
import { DocumentServiceError } from "../../../app/server/documents/d1-repository";
import { validateDocumentExtraction } from "../../../app/server/documents/extraction-validator";
import { KIMI_GROUNDED_TERMS_POLICY_ID } from "../../../app/server/documents/policy";

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const checkout = fileURLToPath(new URL("../../../", import.meta.url));
const declaredCodeFiles = [
  "app/contracts/documents.ts",
  "app/contracts/documents-api.ts",
  "app/contracts/intelligence.ts",
  "app/contracts/planning.ts",
  "app/data/flagship-role.ts",
  "app/data/flagship-blueprint.ts",
  "app/data/flagship-unit-registry.ts",
  "app/lib/materials/grounded-skill-terms.ts",
  "app/lib/materials/skill-labels.ts",
  "app/lib/materials/contextual-skill-mapping.ts",
  "app/lib/materials/skill-mapper.ts",
  "app/lib/planning/registry-validation.ts",
  "app/lib/planning/fingerprint.ts",
  "app/server/documents/d1-repository.ts",
  "app/server/documents/policy.ts",
  "app/server/documents/review-points.ts",
  "app/server/documents/extraction-validator.ts",
  "docs/verification/materials-product-observations/collect-projections.ts",
] as const;

type InputErrorCode = "invalid-input" | "invalid-json" | "input-too-large" | "usage" | "unreadable-input" | "invalid-utf8";
class CollectionInputError extends Error {
  constructor(readonly code: InputErrorCode) {
    super(code);
    this.name = "CollectionInputError";
  }
}

function validBoundary(text: string, offset: number) {
  return offset >= 0 && offset <= text.length
    && !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/u.test(text[offset - 1]!) && /[\uDC00-\uDFFF]/u.test(text[offset]!));
}

const segmentSchema = z.object({
  id: materialIdSchema, start: z.number().int().min(0).max(100_000), end: z.number().int().min(1).max(100_000),
}).strict();
const referenceSchema = z.object({
  ownerId: materialOwnerIdSchema,
  documentId: materialIdSchema, documentVersionId: materialIdSchema, textVersionId: materialIdSchema,
  lifecycle: z.enum(["active", "revoked"]), text: documentTextSchema,
  segments: z.array(segmentSchema).max(1000),
}).strict().superRefine((reference, context) => {
  if (new Set(reference.segments.map(segment => segment.id)).size !== reference.segments.length) {
    context.addIssue({ code: "custom", message: "Duplicate segment IDs" });
  }
  if (reference.segments.some(segment => segment.end <= segment.start
    || !validBoundary(reference.text, segment.start) || !validBoundary(reference.text, segment.end))) {
    context.addIssue({ code: "custom", message: "Invalid segment boundary" });
  }
});

function submittedCandidateIds(extraction: unknown): Set<unknown> {
  if (extraction === null || typeof extraction !== "object" || !("items" in extraction) || !Array.isArray(extraction.items)) return new Set();
  return new Set(extraction.items.flatMap(item => item !== null && typeof item === "object" && "id" in item ? [item.id] : []));
}

const scenarioSchema = z.object({
  id: materialIdSchema, ownerId: materialOwnerIdSchema, reference: referenceSchema,
  extraction: z.unknown(),
  learningIntentItemIds: z.array(materialIdSchema).max(100),
}).strict().superRefine((scenario, context) => {
  if (!Object.hasOwn(scenario, "extraction")) context.addIssue({ code: "custom", message: "Extraction is required" });
  const intentIds = scenario.learningIntentItemIds;
  if (new Set(intentIds).size !== intentIds.length) context.addIssue({ code: "custom", message: "Duplicate intent IDs" });
  const candidateIds = submittedCandidateIds(scenario.extraction);
  if (intentIds.some(id => !candidateIds.has(id))) context.addIssue({ code: "custom", message: "Intent ID was not submitted" });
});
const collectionSchema = z.object({
  schemaVersion: z.literal("materials-product-projection-input-1"),
  provenance: z.object({
    kind: z.literal("constructed-control"),
    description: z.string().min(1).max(2000).refine(value => value.trim().length > 0),
  }).strict(),
  scenarios: z.array(scenarioSchema).min(1).max(512),
}).strict().refine(input => new Set(input.scenarios.map(scenario => scenario.id)).size === input.scenarios.length, "Duplicate scenario IDs");

function parseInput(inputJson: string) {
  if (typeof inputJson !== "string") throw new CollectionInputError("invalid-input");
  if (Buffer.byteLength(inputJson, "utf8") > MAX_INPUT_BYTES) throw new CollectionInputError("input-too-large");
  let raw: unknown;
  try { raw = JSON.parse(inputJson); } catch { throw new CollectionInputError("invalid-json"); }
  // JSON.parse accepts overflowing numeric literals as Infinity, which would be lost on output.
  const pending: unknown[] = [raw];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === "number" && !Number.isFinite(value)) throw new CollectionInputError("invalid-json");
    if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) pending.push(child);
    }
  }
  const parsed = collectionSchema.safeParse(raw);
  if (!parsed.success) throw new CollectionInputError("invalid-input");
  return parsed.data;
}

/** Canonical JSON: sorted object keys, original array order, no metadata-key exclusions. */
function canonicalJson(value: unknown): string {
  // Iteration preserves malformed, deeply nested extraction JSON without recursive serialization.
  const pending: ({ value: unknown } | { literal: string })[] = [{ value }];
  const chunks: string[] = [];
  while (pending.length) {
    const part = pending.pop()!;
    if ("literal" in part) { chunks.push(part.literal); continue; }
    const current = part.value;
    if (current !== null && typeof current === "object") {
      if (Array.isArray(current)) {
        chunks.push("[");
        pending.push({ literal: "]" });
        for (let index = current.length - 1; index >= 0; index--) {
          pending.push({ value: current[index] });
          if (index > 0) pending.push({ literal: "," });
        }
      } else {
        const record = current as Record<string, unknown>, keys = Object.keys(record).sort();
        chunks.push("{");
        pending.push({ literal: "}" });
        for (let index = keys.length - 1; index >= 0; index--) {
          const key = keys[index]!;
          pending.push({ value: record[key] }, { literal: ":" }, { literal: JSON.stringify(key) });
          if (index > 0) pending.push({ literal: "," });
        }
      }
    } else {
      if (current !== null && !["boolean", "string", "number"].includes(typeof current)
        || typeof current === "number" && !Number.isFinite(current)) throw new TypeError("Non-JSON value");
      chunks.push(JSON.stringify(current));
    }
  }
  return chunks.join("");
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function observeScenario(scenario: z.infer<typeof scenarioSchema>) {
  const common = {
    id: scenario.id, ownerId: scenario.ownerId, inputSha256: sha256(canonicalJson(scenario)),
    rawExtraction: scenario.extraction,
    sourceFixture: { kind: "constructed-control" as const, authenticatedRepositoryRecord: false as const, reference: scenario.reference },
    learningIntentItemIds: scenario.learningIntentItemIds,
  };
  let projection: ReturnType<typeof validateDocumentExtraction>;
  try {
    projection = validateDocumentExtraction(scenario.extraction, scenario.ownerId, scenario.reference, KIMI_GROUNDED_TERMS_POLICY_ID);
  } catch (error) {
    // Only this native rejection is an observation. Schema/implementation exceptions must escape.
    if (!(error instanceof DocumentServiceError) || error.code !== "invalid-content") throw error;
    return { ...common, outcome: "rejected" as const, rejection: { code: error.code },
      gaps: [{ code: "native-task-coverage-absent" as const }] };
  }
  const options = { learningIntentItemIds: scenario.learningIntentItemIds };
  const termMappings = mapMaterialItemTerms(projection.items, flagshipBlueprint, flagshipUnitRegistry, options);
  const itemMappings = mapMaterialItems(projection.items, flagshipBlueprint, flagshipUnitRegistry, options);
  // This is the same canonical contract already accepted by production; it exposes trimming distinctly
  // from label removal while the raw extraction and native projection remain unchanged.
  const validated = documentExtractionSchema.parse(scenario.extraction);
  const submitted = scenario.extraction as { items: { id: string; skillLabels: string[] }[] };
  const labelRemovals = validated.items.map((item, index) => {
    const projectedLabels = projection.items[index]!.skillLabels!;
    return { candidateId: item.id, submittedLabels: submitted.items[index]!.skillLabels,
      validatedLabels: item.skillLabels, projectedLabels,
      removedLabels: item.skillLabels.filter(label => !projectedLabels.includes(label)) };
  });
  return { ...common, outcome: "projected" as const, projection, termMappings, itemMappings, labelRemovals,
    gaps: [{ code: "native-task-coverage-absent" as const },
      ...projection.items.filter(item => item.skillLabels?.length === 0).map(item => ({ code: "empty-term-list" as const, itemId: item.id }))] };
}

/** Observe authored JSON through product components; no confirmation, adoption, or quality verdict. */
export function collectProjectionObservations(inputJson: string) {
  const input = parseInput(inputJson);
  const scenarios = input.scenarios.map(observeScenario);
  return {
    schemaVersion: "materials-product-projection-observations-1" as const,
    provenance: input.provenance, inputSha256: sha256(inputJson),
    scope: { sourceTrust: "authored-fixture-not-authenticated-record" as const,
      learningIntent: "component-stimulus-only" as const, userConfirmation: "not-performed" as const },
    actualModelQualityEvaluated: false as const, actualProductIntegrationVerified: false as const,
    qualificationApproved: false as const, realModelCalls: 0 as const,
    candidateEvaluation: { status: "incomplete" as const,
      missingEvidence: ["native-task-coverage", "native-plan-observations", "actual-model-output", "user-facing-product-integration"] },
    product: {
      providerPolicyId: KIMI_GROUNDED_TERMS_POLICY_ID, mappingVersion: MATERIAL_MAPPING_VERSION,
      blueprint: { id: flagshipBlueprint.id, version: flagshipBlueprint.version, canonicalSha256: sha256(canonicalJson(flagshipBlueprint)) },
      registry: { id: flagshipUnitRegistry.id, version: flagshipUnitRegistry.version, canonicalSha256: sha256(canonicalJson(flagshipUnitRegistry)) },
      codeProvenance: { scope: "declared-relevant-files-only" as const, completeRuntimeAttestation: false as const,
        files: declaredCodeFiles.map(path => ({ path, sha256: sha256(readFileSync(resolve(checkout, path))) })) },
    },
    scenarios,
  };
}

function localInputPath(args: string[]) {
  const path = args[0];
  if (args.length !== 1 || !path || path.startsWith("-") || /^[\\/]{2}/u.test(path)
    || /^[a-z][a-z\d+.-]*:/iu.test(path) && !/^[a-z]:[\\/]/iu.test(path)) throw new CollectionInputError("usage");
  return path;
}

function readInputFile(path: string) {
  let descriptor: number | undefined;
  let bytes: Buffer;
  try {
    descriptor = openSync(path, "r");
    if (!fstatSync(descriptor).isFile()) throw new CollectionInputError("unreadable-input");
    const buffer = Buffer.alloc(MAX_INPUT_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(descriptor, buffer, length, buffer.length - length, null);
      if (read === 0) break;
      length += read;
    }
    if (length > MAX_INPUT_BYTES) throw new CollectionInputError("input-too-large");
    bytes = buffer.subarray(0, length);
  } catch (error) {
    if (error instanceof CollectionInputError) throw error;
    throw new CollectionInputError("unreadable-input");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new CollectionInputError("invalid-utf8"); }
}

function runCli(args: string[]) {
  try {
    const report = collectProjectionObservations(readInputFile(localInputPath(args)));
    process.stdout.write(`${canonicalJson(report)}\n`);
    process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`projection-collector: ${error instanceof CollectionInputError ? error.code : "implementation-error"}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runCli(process.argv.slice(2));
