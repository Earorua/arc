import { MAX_RESEARCH_PACKAGE_JSON_BYTES, researchCandidateSchema, researchPackageSchema, researchQualityReportSchema, type ResearchPackage } from "../../contracts/research";
import { z } from "zod";
import { canonicalJson, fingerprint } from "../../lib/planning/fingerprint";
import { validateRoleBlueprint } from "../../lib/intelligence-validation";
import { validateUnitRegistry } from "../../lib/planning/registry-validation";
import { canonicalizePublicCitationUrl, readBoundedResearchJson } from "./source-audit";
import { ResearchRepositoryError } from "./repository";

export function expiryMs(date: string) { const value = Date.parse(`${date}T00:00:00.000Z`); if (!Number.isSafeInteger(value)) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); return value; }
export function bytes(value: string) { return new TextEncoder().encode(value).byteLength; }
export function serialize(value: unknown, limit: number) { try { const bounded = readBoundedResearchJson(value); const result = JSON.stringify(bounded); if (typeof result !== "string" || bytes(result) > limit) throw new Error(); return result; } catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); } }
export function parseJson(value: string, limit: number) { if (bytes(value) > limit) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); try { return readBoundedResearchJson(JSON.parse(value) as unknown); } catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); } }
export function validateQuality(value: unknown) { try { return researchQualityReportSchema.parse(readBoundedResearchJson(value)); } catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); } }
export type ExpirationPolicy = { kind: "require-fresh"; now: number } | { kind: "ignore-for-audit" };
export function validatePackage(value: unknown, expiration: ExpirationPolicy) {
  try {
    const snapshot = readBoundedResearchJson(value);
    const packageValue = researchPackageSchema.parse(snapshot);
    if (canonicalJson(snapshot) !== canonicalJson(packageValue)
      || !packageValue.qualityReport.passed
      || expiration.kind === "require-fresh" && expiryMs(packageValue.expiresAt) <= expiration.now) {
      throw new Error();
    }
    const { contentFingerprint, ...rest } = packageValue;
    if (fingerprint(canonicalJson(rest)) !== contentFingerprint) throw new Error();
    assertPackageIntegrity(packageValue);
    return packageValue;
  } catch {
    throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
  }
}
export function validateCandidate(value: unknown) {
  try {
    const candidate = researchCandidateSchema.parse(readBoundedResearchJson(value));
    for (const resource of candidate.resources) if (canonicalizePublicCitationUrl(resource.url) !== resource.url) throw new Error();
    return candidate;
  } catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
}

const boundedText = z.string().min(1).max(256).refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value));
const cacheIdentity = z.object({ normalizedRoleKey: boundedText, locale: z.enum(["zh-CN", "en-US"]), configFingerprint: boundedText }).strict();
export type PublicationCacheIdentity = z.infer<typeof cacheIdentity>;
export type PublicationGate = (sql: string, values: unknown[]) => D1PreparedStatement;
export function normalizedIds(packageId: string) { return { roleId: `research-role-${packageId}`, roleSlug: `research-${packageId}`, versionId: `research-role-version-${packageId}` }; }

export function parseStoredPackage(row: Record<string, unknown>, expiration: ExpirationPolicy): ResearchPackage {
  if (typeof row.package_json !== "string" || typeof row.quality_json !== "string" || typeof row.content_fingerprint !== "string") throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
  try {
    cacheIdentity.parse(readBoundedResearchJson({ normalizedRoleKey: row.normalized_role_key, locale: row.locale, configFingerprint: row.config_fingerprint }));
    z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(row.created_at);
  } catch { throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE"); }
  const packageValue = validatePackage(parseJson(row.package_json, MAX_RESEARCH_PACKAGE_JSON_BYTES), expiration);
  const quality = validateQuality(parseJson(row.quality_json, 16_384));
  if (row.id !== packageValue.id || !quality.passed || canonicalJson(quality) !== canonicalJson(packageValue.qualityReport)
    || packageValue.contentFingerprint !== row.content_fingerprint || row.blueprint_id !== packageValue.blueprint.id
    || row.blueprint_version !== packageValue.blueprint.version || row.blueprint_version_id !== normalizedIds(packageValue.id).versionId
    || row.registry_id !== packageValue.registry.id || row.registry_version !== packageValue.registry.version
    || row.observed_at !== packageValue.observedAt || row.expires_at !== expiryMs(packageValue.expiresAt)) throw new ResearchRepositoryError("RESEARCH_UNAVAILABLE");
  return packageValue;
}

/** The eight normalized package writes shared by the synchronous and remote paths. */
export function normalizedPackageInserts(packageValue: ResearchPackage, cache: PublicationCacheIdentity,
  now: number, gated: PublicationGate): D1PreparedStatement[] {
  const ids = normalizedIds(packageValue.id);
  const skills = serialize(packageValue.blueprint.skills, MAX_RESEARCH_PACKAGE_JSON_BYTES);
  const resources = serialize(packageValue.blueprint.resources, MAX_RESEARCH_PACKAGE_JSON_BYTES);
  const audits = serialize(packageValue.sourceEvidence, MAX_RESEARCH_PACKAGE_JSON_BYTES);
  return [
    gated("INSERT INTO role_blueprints (id,slug,name,status,current_version,created_at,updated_at) SELECT ?1,?2,?3,'ready',?4,?5,?5", [ids.roleId, ids.roleSlug, packageValue.blueprint.name, packageValue.blueprint.version, now]),
    gated("INSERT INTO role_blueprint_versions (id,role_id,version,status,blueprint_json,source_coverage_json,published_at,created_at) SELECT ?1,?2,?3,'ready',?4,?5,?6,?6", [ids.versionId, ids.roleId, packageValue.blueprint.version, serialize(packageValue.blueprint, MAX_RESEARCH_PACKAGE_JSON_BYTES), "{}", now]),
    gated("INSERT INTO role_skill_definitions (id,blueprint_version_id,skill_key,name,category,importance,payload_json,created_at) SELECT ?4||':'||(value->>'id'),?1,value->>'id',value->>'name',value->>'category',value->>'importance',value,?2 FROM json_each(?3)", [ids.versionId, now, skills, packageValue.id]),
    gated("INSERT INTO role_skill_edges (id,blueprint_version_id,from_skill_key,to_skill_key,relation,created_at) SELECT ?4||':'||edge.value||':'||(skill.value->>'id'),?1,edge.value,skill.value->>'id','prerequisite',?2 FROM json_each(?3) skill JOIN json_each(skill.value->'prerequisiteIds') edge", [ids.versionId, now, skills, packageValue.id]),
    gated("INSERT OR IGNORE INTO learning_resources (id,canonical_url,title,provider,language,cost,format,source_tier,last_verified_at,created_at,updated_at) SELECT ?3||':'||(value->>'id'),value->>'url',value->>'title',value->>'provider',value->>'language',value->>'cost',value->>'format',value->>'sourceTier',value->>'lastVerifiedAt',?1,?1 FROM json_each(?2)", [now, resources, packageValue.id]),
    gated("INSERT INTO resource_skill_links (id,blueprint_version_id,skill_key,resource_id,purpose,created_at) SELECT ?4||':'||(resource.value->>'id')||':'||skill.value||':'||(resource.value->>'purpose'),?1,skill.value,(SELECT lr.id FROM learning_resources lr WHERE lr.canonical_url=resource.value->>'url'),resource.value->>'purpose',?2 FROM json_each(?3) resource JOIN json_each(resource.value->'skillIds') skill", [ids.versionId, now, resources, packageValue.id]),
    gated("INSERT INTO research_packages (id,normalized_role_key,locale,config_fingerprint,content_fingerprint,package_json,quality_json,blueprint_id,blueprint_version,blueprint_version_id,registry_id,registry_version,observed_at,expires_at,created_at) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15", [packageValue.id, cache.normalizedRoleKey, cache.locale, cache.configFingerprint, packageValue.contentFingerprint, serialize(packageValue, MAX_RESEARCH_PACKAGE_JSON_BYTES), serialize(packageValue.qualityReport, 16_384), packageValue.blueprint.id, packageValue.blueprint.version, ids.versionId, packageValue.registry.id, packageValue.registry.version, packageValue.observedAt, expiryMs(packageValue.expiresAt), now]),
    gated("INSERT INTO research_source_audits (id,package_id,canonical_url,title,hostname,source_tier,observed_at,citation_hash) SELECT ?1||':'||(value->>'canonicalUrl'),?1,value->>'canonicalUrl',value->>'title',value->>'hostname',value->>'sourceTier',value->>'observedAt',value->>'citationHash' FROM json_each(?2)", [packageValue.id, audits]),
  ];
}
function assertPackageIntegrity(packageValue: ResearchPackage) {
  const { blueprint, registry, sourceEvidence, qualityReport } = packageValue;
  if (blueprint.status !== "ready" || blueprint.updatedAt !== packageValue.observedAt || packageValue.expiresAt <= packageValue.observedAt || registry.blueprintId !== blueprint.id || registry.blueprintVersion !== blueprint.version || qualityReport.observedAt !== packageValue.observedAt || qualityReport.skillCount !== blueprint.skills.length || qualityReport.sourceCount !== sourceEvidence.length || qualityReport.unitCount !== registry.tracks.reduce((total, track) => total + track.templates.length, 0)) throw new Error();
  if (validateRoleBlueprint(blueprint).issues.length || validateUnitRegistry(registry, blueprint).issues.length) throw new Error();
  const evidence = new Map(sourceEvidence.map((source) => [source.canonicalUrl, source]));
  if (evidence.size !== sourceEvidence.length || evidence.size !== blueprint.resources.length) throw new Error();
  for (const resource of blueprint.resources) {
    const source = evidence.get(resource.url);
    // Citation titles come from annotations and need not equal resource titles.
    if (!source || source.sourceTier !== resource.sourceTier || source.observedAt !== packageValue.observedAt || resource.lastVerifiedAt !== packageValue.observedAt || source.hostname !== new URL(resource.url).hostname || canonicalizePublicCitationUrl(resource.url) !== resource.url || source.citationHash !== fingerprint({ canonicalUrl: resource.url })) throw new Error();
  }
  const phaseSkills = blueprint.phases.flatMap((phase) => phase.skillIds);
  if (new Set(phaseSkills).size !== phaseSkills.length) throw new Error();
  const resources = new Map(blueprint.resources.map((resource) => [resource.id, resource]));
  for (const skill of blueprint.skills) {
    if (!skill.resourceIds.length || (skill.importance === "core" && !skill.resourceIds.some((id) => ["primary", "institutional"].includes(resources.get(id)!.sourceTier)))) throw new Error();
  }
  for (const template of registry.tracks.flatMap((track) => track.templates)) {
    if (resources.get(template.primaryResourceId)!.cost !== "free" && !template.alternativeResourceIds.some((id) => resources.get(id)!.cost === "free")) throw new Error();
  }
}
