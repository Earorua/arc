import { z } from "zod";
import { calendarDateSchema, roleBlueprintSchema, type RoleBlueprint } from "../../contracts/intelligence";
import { unitRegistrySchema, type UnitRegistry } from "../../contracts/planning";
import { researchCandidateSchema, researchPackageSchema, type AuditedSource, type ResearchCandidate, type ResearchIssueCode, type ResearchPackage, type ResearchQualityReport } from "../../contracts/research";
import { validateRoleBlueprint } from "../../lib/intelligence-validation";
import { canonicalJson, deterministicId, fingerprint } from "../../lib/planning/fingerprint";
import { validateUnitRegistry } from "../../lib/planning/registry-validation";
import { auditResearchSources, canonicalizePublicCitationUrl, readBoundedResearchJson, SourcePolicyError } from "./source-audit";

const versionSchema = z.string().max(32).regex(/^\d{4}\.\d{2}\.\d+$/u);
const configVersionSchema = z.string().trim().min(1).max(64).regex(/^[^\u0000-\u001f\u007f]+$/u);
const contextSchema = z.object({
  packageId: researchPackageSchema.shape.id,
  blueprintVersion: versionSchema,
  registryVersion: versionSchema,
  templateVersion: versionSchema,
  promptVersion: configVersionSchema,
  inputSchemaVersion: configVersionSchema,
  outputSchemaVersion: configVersionSchema,
  qualityVersion: configVersionSchema,
  modelConfigVersion: configVersionSchema,
  observedAt: calendarDateSchema,
  expiresAt: calendarDateSchema,
}).strict().refine((context) => context.expiresAt > context.observedAt);

export interface ResearchValidationContext {
  packageId: string;
  blueprintVersion: string;
  registryVersion: string;
  templateVersion: string;
  promptVersion: string;
  inputSchemaVersion: string;
  outputSchemaVersion: string;
  qualityVersion: string;
  modelConfigVersion: string;
  observedAt: string;
  expiresAt: string;
}

export class ResearchValidationContextError extends Error {
  constructor() {
    super("Invalid research validation context");
    this.name = "ResearchValidationContextError";
  }
}

export type ResearchValidationResult =
  | { ready: true; package: ResearchPackage; quality: ResearchQualityReport }
  | { ready: false; quality: ResearchQualityReport; sanitizedCandidate: ResearchCandidate | null };

export function validateResearchCandidate(candidate: unknown, annotations: unknown, context: ResearchValidationContext): ResearchValidationResult {
  let trusted: ResearchValidationContext;
  try { trusted = contextSchema.parse(readBoundedResearchJson(context)); }
  catch { throw new ResearchValidationContextError(); }

  const codes = new Set<ResearchIssueCode>();
  let bounded: ResearchCandidate | null = null;
  let sources: AuditedSource[] = [];
  const quality = (): ResearchQualityReport => ({
    passed: codes.size === 0, issueCodes: [...codes].sort(),
    skillCount: bounded?.skills.length ?? 0, sourceCount: sources.length,
    unitCount: bounded?.unitTemplates.length ?? 0, observedAt: trusted.observedAt,
  });
  const failure = (retain: boolean): ResearchValidationResult => ({
    ready: false, quality: quality(), sanitizedCandidate: retain ? bounded : null,
  });

  try {
    const parsed = researchCandidateSchema.safeParse(readBoundedResearchJson(candidate));
    if (!parsed.success) {
      codes.add("invalid-schema");
      return failure(false);
    }
    bounded = parsed.data;
    // Canonicalize every resource before audit, so a missing citation cannot mask an unsafe URL.
    bounded.resources = bounded.resources.map((resource) => ({ ...resource, url: canonicalizePublicCitationUrl(resource.url) }));
    sources = auditResearchSources(bounded, annotations, trusted.observedAt).sources;
  } catch (error) {
    const code = error instanceof SourcePolicyError ? error.code : "invalid-schema";
    codes.add(code);
    return failure(code === "unreferenced-url");
  }

  const blueprint: RoleBlueprint = {
    ...bounded.role, version: trusted.blueprintVersion, status: "ready", updatedAt: trusted.observedAt, languagePolicy: "english-first",
    skills: bounded.skills.map((skill) => ({ ...skill, confidence: 0.75,
      prerequisiteIds: bounded.prerequisiteEdges.filter((edge) => edge.skillId === skill.id).map((edge) => edge.prerequisiteSkillId),
    })),
    resources: bounded.resources.map((resource) => ({ ...resource, lastVerifiedAt: trusted.observedAt })),
    phases: bounded.stages,
  };
  const tracks = new Map<string, UnitRegistry["tracks"][number]>();
  for (const template of bounded.unitTemplates) {
    const track = tracks.get(template.skillId) ?? { skillId: template.skillId, templates: [] };
    track.templates.push({ ...template, version: trusted.templateVersion });
    tracks.set(template.skillId, track);
  }
  const registry: UnitRegistry = {
    id: deterministicId("research-units", { packageId: trusted.packageId, roleId: bounded.role.id }),
    version: trusted.registryVersion, blueprintId: blueprint.id, blueprintVersion: blueprint.version, tracks: [...tracks.values()],
  };

  if (!roleBlueprintSchema.safeParse(blueprint).success) codes.add("invalid-schema");
  if (!unitRegistrySchema.safeParse(registry).success) codes.add("invalid-registry");
  for (const issue of validateRoleBlueprint(blueprint).issues) {
    codes.add(issue.code === "free-alternative-required" ? "missing-free-alternative" : "invalid-graph");
  }
  for (const issue of validateUnitRegistry(registry, blueprint).issues) {
    codes.add("invalid-registry");
    if (issue.code === "minute-mismatch") codes.add("minute-mismatch");
    if (issue.code === "missing-kind" || issue.code === "missing-skill") codes.add("missing-unit");
  }
  validateEvidenceAndReferences(bounded, codes);
  if (codes.size) return failure(true);

  const report = quality();
  const packageContent = {
    id: trusted.packageId, blueprint, registry, sourceEvidence: sources, qualityReport: report,
    promptVersion: trusted.promptVersion, inputSchemaVersion: trusted.inputSchemaVersion,
    outputSchemaVersion: trusted.outputSchemaVersion, qualityVersion: trusted.qualityVersion,
    modelConfigVersion: trusted.modelConfigVersion, observedAt: trusted.observedAt, expiresAt: trusted.expiresAt,
  };
  const parsedPackage = researchPackageSchema.safeParse({
    ...packageContent, contentFingerprint: fingerprint(canonicalJson(packageContent)),
  });
  if (!parsedPackage.success) { codes.add("invalid-schema"); return failure(false); }
  return { ready: true, package: parsedPackage.data, quality: report };
}

function validateEvidenceAndReferences(candidate: ResearchCandidate, codes: Set<ResearchIssueCode>): void {
  const skills = new Map(candidate.skills.map((skill) => [skill.id, skill]));
  const resources = new Map(candidate.resources.map((resource) => [resource.id, resource]));
  const duplicated = (values: string[]) => new Set(values).size !== values.length;
  if (duplicated(candidate.resources.map((resource) => resource.url))
    || duplicated(candidate.stages.flatMap((stage) => stage.skillIds))
    || duplicated(candidate.evidence.map((evidence) => evidence.id))
    || duplicated(candidate.evidence.map((evidence) => `${evidence.skillId}/${evidence.resourceId}`))) codes.add("invalid-graph");
  for (const edge of candidate.prerequisiteEdges) {
    if (!skills.has(edge.skillId) || !skills.has(edge.prerequisiteSkillId)) codes.add("invalid-graph");
  }

  const evidenceBySkill = new Map<string, Set<string>>();
  for (const evidence of candidate.evidence) {
    const skill = skills.get(evidence.skillId);
    const resource = resources.get(evidence.resourceId);
    if (!skill || !resource || !skill.resourceIds.includes(resource.id) || !resource.skillIds.includes(skill.id)) {
      codes.add("invalid-graph");
      continue;
    }
    const linked = evidenceBySkill.get(skill.id) ?? new Set<string>();
    linked.add(resource.id);
    evidenceBySkill.set(skill.id, linked);
  }
  for (const skill of candidate.skills) {
    const resourceIds = evidenceBySkill.get(skill.id) ?? new Set<string>();
    if (resourceIds.size === 0) codes.add("missing-skill-source");
    if (skill.importance === "core" && ![...resourceIds].some((id) => {
      const tier = resources.get(id)?.sourceTier;
      return tier === "primary" || tier === "institutional";
    })) codes.add("missing-core-authority");
  }
  for (const template of candidate.unitTemplates) {
    const primary = resources.get(template.primaryResourceId);
    if (primary && primary.cost !== "free" && !template.alternativeResourceIds.some((id) => {
      const alternative = resources.get(id);
      return alternative?.cost === "free" && alternative.skillIds.includes(template.skillId);
    })) codes.add("missing-free-alternative");
  }
}
