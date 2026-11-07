import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  canonicalJson, captureCourseReference, COURSE_DATA_FILES, COURSE_SCHEMA_FILES, COURSE_TYPE_FILES, sha256,
} from "./capture-course-reference.mjs";

export const SOURCE_ANNOTATION_SHA256 = "e512e3fca67fd9133cae4e9186cb054c3044d79b090d567daaba24cb85bd9ef9";
export const COURSE_REFERENCE_SHA256 = "bf458308b5811f60b61f6e5fa24f6910642a7276615f0b212d930d04868d9676";
const identities = {
  role: { id: "ai-native-full-stack-engineer", version: "2026.07" },
  blueprint: { id: "ai-native-full-stack-engineer", version: "2026.08.1" },
  registry: { id: "ai-native-full-stack-engineer-units", version: "2026.08.1" },
};
const aliasNames = { "local-name-sql": ["SQL", "sql"], "local-name-typescript": ["TypeScript", "typescript"], "local-name-react": ["React", "react"] };
const equal = (left, right) => canonicalJson(left) === canonicalJson(right);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const strings = (value) => Array.isArray(value) && value.every(nonempty);
const unique = (items) => new Set(items).size === items.length;
const sameSet = (left, right) => unique(left) && unique(right) && equal([...left].sort(), [...right].sort());

function atPointer(value, pointer) {
  if (typeof pointer !== "string" || !pointer.startsWith("/")) return undefined;
  for (const encodedKey of pointer.slice(1).split("/")) {
    if (/~[^01]|~$/u.test(encodedKey)) return undefined;
    const key = encodedKey.replace(/~1/gu, "/").replace(/~0/gu, "~");
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}

function finiteTerms(field) {
  const groups = [...field.skillTermGroups, ...field.optionalSkillTermGroups];
  const literals = [...new Set([...groups.flatMap((group) => group.alternatives), ...field.combinedLiteralTerms.map((term) => term.literal)])];
  return new Map((literals.length ? literals : [null]).map((literal) => [literal, [...new Set([
    ...groups.filter((group) => group.alternatives.includes(literal)).map((group) => group.id),
    ...field.combinedLiteralTerms.filter((term) => term.literal === literal).flatMap((term) => term.coversGroupIds),
  ])]]));
}

function totalsFor(annotations) {
  const fields = annotations.documents.flatMap((document) => document.fields);
  const relations = fields.flatMap((field) => field.relations);
  const countBy = (key) => Object.fromEntries([...new Set(relations.map(key))].sort().map((value) => [value, relations.filter((relation) => key(relation) === value).length]));
  return {
    documents: annotations.documents.length,
    legacyFields: fields.filter((field) => field.fieldKind === "legacy").length,
    additionalFields: fields.filter((field) => field.fieldKind === "additional").length,
    relations: relations.length,
    finiteLiteralRelations: relations.filter((relation) => relation.literal !== null).length,
    nullNonLearningAccounts: relations.filter((relation) => relation.literal === null).length,
    topicStatuses: countBy((relation) => relation.topic.status),
    coverageStatuses: countBy((relation) => relation.taskCoverage.status),
    basis: countBy((relation) => relation.topic.basis),
  };
}

/** Hash-only integrity check: the legacy scorer is never imported or executed. */
export async function verifyFrozenInputFiles(source, { root }) {
  const frozenFiles = [...source.inputHashes, ...source.basis];
  const checked = await Promise.all(frozenFiles.map(async (file) => ({
    ...file,
    actual: sha256(await readFile(path.join(root, file.path))),
  })));
  return checked.filter((file) => file.actual !== file.sha256);
}

/**
 * Structural/integrity validation only. currentReference must come from local
 * captureCourseReference(), never from a candidate. The independently pinned
 * snapshot digest also prevents self-consistent caller edits from re-freezing truth.
 */
export function validateCourseAnnotations(annotations, { snapshot, sourceAnnotationText, currentReference } = {}) {
  const errors = [];
  let totals = null;
  const issue = (code, message, location = {}) => errors.push({ code, ...location, message });
  const require = (condition, code, message, location) => { if (!condition) issue(code, message, location); };
  try {
    require(typeof sourceAnnotationText === "string" && sha256(sourceAnnotationText) === SOURCE_ANNOTATION_SHA256, "source-hash", "Source annotation bytes must equal the immutable reviewed input");
    const source = JSON.parse(sourceAnnotationText);
    require(annotations.schemaVersion === "materials-course-annotations-v2-draft.1", "shape", "Unexpected annotation schema version");
    require(snapshot.schemaVersion === "materials-course-reference-v2-draft.1", "shape", "Unexpected snapshot schema version");
    require(annotations.sourceAnnotation.path === "docs/verification/materials-quality-v2/annotations.draft.json" && annotations.sourceAnnotation.sha256 === SOURCE_ANNOTATION_SHA256, "source-hash", "The source annotation reference must be pinned");
    const snapshotHash = sha256(`${JSON.stringify(snapshot, null, 2)}\n`);
    require(snapshotHash === COURSE_REFERENCE_SHA256 && annotations.courseReference.sha256 === COURSE_REFERENCE_SHA256, "snapshot-hash", "Snapshot bytes and annotation reference must match the independently pinned snapshot digest");
    require(annotations.courseReference.path === "docs/verification/materials-quality-v2/course-reference.snapshot.json", "snapshot-hash", "Unexpected snapshot path");
    require(Boolean(currentReference), "current-reference-required", "Independently recaptured complete local exports and dependency digests are required");
    if (currentReference) require(equal(snapshot, currentReference), "current-reference-mismatch", "Frozen source files, dependencies and objects must equal fresh local capture, not caller-supplied self hashes");
    require(sameSet(snapshot.sourceFiles.map((file) => file.path), COURSE_DATA_FILES), "dependency-coverage", "All three complete data source files must be frozen exactly once");
    for (const file of snapshot.sourceFiles) {
      require(nonempty(file.content) && sha256(file.content) === file.sha256 && Buffer.byteLength(file.content) === file.byteLength, "source-file-hash", `Complete source content/hash mismatch: ${file.path}`);
      require(snapshot.dependencies.some((dependency) => dependency.path === file.path && dependency.sha256 === file.sha256 && dependency.byteLength === file.byteLength), "dependency-coverage", `Source file must match its recorded dependency: ${file.path}`);
    }
    const dependencyPaths = snapshot.dependencies.map((file) => file.path);
    require(unique(dependencyPaths) && [...COURSE_DATA_FILES, ...COURSE_SCHEMA_FILES, ...COURSE_TYPE_FILES].every((file) => dependencyPaths.includes(file)), "dependency-coverage", "Data, schema and type-only dependencies must be complete and unique");
    if (currentReference) require(sameSet(dependencyPaths, currentReference.dependencies.map((file) => file.path)), "dependency-coverage", "Dependency closure must equal fresh esbuild capture");
    for (const file of snapshot.dependencies) {
      require([...COURSE_DATA_FILES, ...COURSE_SCHEMA_FILES, ...COURSE_TYPE_FILES].includes(file.path) || file.path.startsWith("node_modules/zod/"), "dependency-coverage", `Non-course dependency is forbidden: ${file.path}`);
      require(/^[a-f0-9]{64}$/u.test(file.sha256) && Number.isSafeInteger(file.byteLength) && file.byteLength > 0, "dependency-coverage", `Dependency metadata is incomplete: ${file.path}`);
    }
    const objectNames = Object.keys(snapshot.objects);
    require(sameSet(objectNames, Object.keys(identities)), "course-identity", "Exactly role, blueprint and registry exports are required");
    for (const [name, expected] of Object.entries(identities)) {
      const object = snapshot.objects[name];
      require(object.value.id === expected.id && object.value.version === expected.version && equal(annotations.courseReference.identity[name], expected), "course-identity", `Frozen ${name} identity/version mismatch`);
      const digest = sha256(canonicalJson(object.value));
      require(digest === object.sha256 && annotations.courseReference.objectHashes[name] === digest, "object-hash", `Complete exported ${name} object hash mismatch`);
    }
    const role = snapshot.objects.role.value;
    const blueprint = snapshot.objects.blueprint.value;
    const registry = snapshot.objects.registry.value;
    const skillIds = blueprint.skills.map((skill) => skill.id);
    require(skillIds.length === 16 && sameSet(skillIds, role.skills.map((skill) => skill.id)), "registry-completeness", "Role and blueprint must contain the same complete 16 skills");
    require(registry.blueprintId === identities.blueprint.id && registry.blueprintVersion === identities.blueprint.version, "course-identity", "Registry must bind the pinned blueprint version");
    require(registry.tracks.length === 16 && sameSet(registry.tracks.map((track) => track.skillId), skillIds), "registry-completeness", "Registry requires exactly one complete track for each blueprint skill");
    const templateIds = [];
    for (const track of registry.tracks) {
      require(track.templates.length === 3 && sameSet(track.templates.map((unit) => unit.kind), ["learn", "calibrate", "reinforce"]), "registry-completeness", `Track must retain learn/calibrate/reinforce templates: ${track.skillId}`);
      for (const unit of track.templates) {
        templateIds.push(unit.id);
        require(unit.skillId === track.skillId && unit.version === identities.registry.version && nonempty(unit.objective) && nonempty(unit.buildTask) && nonempty(unit.proofRequirement) && unit.steps.length > 0 && unit.completionCriteria.length > 0 && unit.rubric.length > 0, "registry-completeness", `Incomplete or mismatched unit: ${unit.id}`);
      }
    }
    require(templateIds.length === 48 && unique(templateIds), "registry-completeness", "All 48 unique unit templates must be retained");
    require(equal(snapshot.inventory, { roleSkillIds: role.skills.map((skill) => skill.id), blueprintSkillIds: skillIds, trackSkillIds: registry.tracks.map((track) => track.skillId), templateIds }), "registry-completeness", "Inventory must exactly reflect the complete frozen exports");

    const citationSkill = (citation) => {
      const index = Number(citation.pointer?.split("/")[2]);
      if (citation.object === "registry" && /^\/tracks\/\d+\//u.test(citation.pointer)) return registry.tracks[index]?.skillId;
      if (["role", "blueprint"].includes(citation.object) && /^\/skills\/\d+\//u.test(citation.pointer)) return snapshot.objects[citation.object].value.skills[index]?.id;
      return undefined;
    };
    const checkCitations = (citations, location) => {
      require(Array.isArray(citations), "citation", "Evidence must be a list of frozen-object citations", location);
      if (!Array.isArray(citations)) return;
      for (const citation of citations) {
        const value = atPointer(snapshot.objects[citation.object]?.value, citation.pointer);
        require(nonempty(citation.quote) && typeof value === "string" && value === citation.quote, "citation", `Citation must quote the exact full string leaf at ${citation.object}:${citation.pointer}`, location);
      }
    };
    const aliases = new Map();
    require(annotations.literalAliases.length === 3, "alias", "Only the three independently reviewed local course names may serve as literal relations");
    for (const alias of annotations.literalAliases) {
      require(!aliases.has(alias.id), "alias", "Duplicate alias ID");
      aliases.set(alias.id, alias);
      const expected = aliasNames[alias.id];
      require(expected && alias.literal === expected[0] && alias.skillId === expected[1] && nonempty(alias.reason), "alias", "Alias must be a narrowly reviewed local course name");
      checkCitations(alias.evidence, { aliasId: alias.id });
      require(alias.evidence.length > 0 && alias.evidence.every((citation) => citation.object === "blueprint" && /^\/skills\/\d+\/name$/u.test(citation.pointer) && citationSkill(citation) === alias.skillId), "alias", "Literal-name evidence must cite its matching local blueprint name");
    }

    require(annotations.documents.length === source.documents.length && sameSet(annotations.documents.map((document) => document.documentId), source.documents.map((document) => document.id)), "document-coverage", "All 30 source documents, including the zero-field document, must be present");
    require(unique(annotations.documents.map((document) => document.documentId)), "duplicate-document", "Document accounts must be unique");
    const allFieldIds = annotations.documents.flatMap((document) => document.fields.map((field) => field.fieldId));
    require(unique(allFieldIds), "duplicate-field", "Field accounts must be unique across all documents");
    for (const document of annotations.documents) {
      const location = { documentId: document.documentId };
      const sourceDocument = source.documents.find((candidate) => candidate.id === document.documentId);
      if (!sourceDocument) { issue("document-coverage", "Unexpected document", location); continue; }
      for (const key of ["sourceTextSha256", "documentVersionId", "textVersionId", "reportingGroup"]) require(document[key] === sourceDocument[key], "source-mismatch", `Document ${key} must remain frozen`, location);
      const sourceFields = [...sourceDocument.fields, ...sourceDocument.additionalFields];
      require(sameSet(document.fields.map((field) => field.fieldId), sourceFields.map((field) => field.legacyId ?? field.id)), "field-coverage", "Every legacy and additional field needs exactly one account", location);
      for (const field of document.fields) {
        const fieldLocation = { ...location, fieldId: field.fieldId };
        const sourceField = sourceFields.find((candidate) => (candidate.legacyId ?? candidate.id) === field.fieldId);
        if (!sourceField) { issue("field-coverage", "Unexpected field", fieldLocation); continue; }
        require(field.fieldKind === (sourceField.legacyId ? "legacy" : "additional") && equal(field.source, sourceField.source) && field.sourceQuote === sourceField.source.quote && field.sourceRole === sourceField.expected.sourceRole && equal(field.sourceSemantics, sourceField.semanticScope), "source-mismatch", "Full source locator, quote, role, actor, polarity and scope must remain unchanged", fieldLocation);
        const expectedTerms = finiteTerms(sourceField);
        require(sameSet(field.relations.map((relation) => relation.literal), [...expectedTerms.keys()]), "literal-coverage", "Exactly one policy is required for each finite required/optional/combined literal, or one null non-learning account", fieldLocation);
        require(unique(field.relations.map((relation) => relation.literal)), "duplicate-literal", "Field/literal policies must be unique", fieldLocation);
        for (const relation of field.relations) {
          const relationLocation = { ...fieldLocation, literal: relation.literal };
          const { topic, taskCoverage: coverage } = relation;
          require(expectedTerms.has(relation.literal) && sameSet(relation.groupIds, expectedTerms.get(relation.literal) ?? []), "group-coverage", "Literal must retain all required, optional and combined group occurrences", relationLocation);
          require(["mapped", "ambiguous", "uncovered", "non-learning"].includes(topic.status) && strings(topic.skillIds) && unique(topic.skillIds) && nonempty(topic.reason), "topic-shape", "Invalid topic status, skill set or rationale", relationLocation);
          for (const skillId of topic.skillIds) require(skillIds.includes(skillId), "illegal-skill", `Skill is absent from the pinned blueprint: ${skillId}`, relationLocation);
          if (topic.status === "mapped") require(topic.skillIds.length >= 1, "topic-shape", "Mapped topics require course IDs", relationLocation);
          if (topic.status === "ambiguous") require(topic.skillIds.length >= 2, "topic-shape", "Ambiguity must retain multiple candidate courses", relationLocation);
          if (["uncovered", "non-learning"].includes(topic.status)) require(topic.skillIds.length === 0, "topic-shape", "Uncovered and non-learning relations must not invent a course assignment", relationLocation);
          if (relation.literal === null) require(topic.status === "non-learning", "topic-shape", "Null literal is exclusively the explicit non-learning account", relationLocation);
          checkCitations(topic.evidence, relationLocation);
          if (["mapped", "ambiguous"].includes(topic.status)) {
            require(["literal", "contextual"].includes(topic.basis) && topic.evidence.length > 0 && topic.skillIds.every((skillId) => topic.evidence.some((citation) => citationSkill(citation) === skillId)), "topic-shape", "Mapped candidates need literal/contextual evidence for every listed skill", relationLocation);
          } else require(topic.basis === (topic.status === "uncovered" ? "none" : "not-applicable"), "topic-shape", "Uncovered/non-learning basis must be explicit", relationLocation);
          if (topic.basis === "literal") {
            const alias = aliases.get(topic.aliasId);
            require(alias && relation.literal === alias.literal && equal(topic.skillIds, [alias.skillId]) && alias.evidence.every((citation) => topic.evidence.some((item) => equal(item, citation))), "alias", "Literal relation must resolve to the exact independent local-name proof", relationLocation);
          } else require(topic.aliasId === null, "alias", "Contextual/uncovered/non-learning relationships must not claim an alias", relationLocation);

          require(["full", "partial", "none", "not-applicable"].includes(coverage.status) && coverage.aggregation === "union-of-cited-content" && Array.isArray(coverage.supportedScope) && strings(coverage.uncoveredScope) && nonempty(coverage.reason), "coverage-shape", "Coverage needs an explicit status, union semantics, scopes and rationale", relationLocation);
          const hasSupport = coverage.supportedScope.length > 0;
          const hasGap = coverage.uncoveredScope.length > 0;
          require((coverage.status === "full" && hasSupport && !hasGap)
            || (coverage.status === "partial" && hasSupport && hasGap)
            || (coverage.status === "none" && !hasSupport && hasGap)
            || (coverage.status === "not-applicable" && !hasSupport && !hasGap), "coverage-shape", "Coverage status must agree with supported and uncovered scope", relationLocation);
          require((topic.status === "non-learning") === (coverage.status === "not-applicable"), "coverage-shape", "Only non-learning relations use not-applicable task coverage", relationLocation);
          if (topic.status === "uncovered") require(coverage.status === "none", "coverage-shape", "Uncovered topics cannot claim task coverage", relationLocation);
          for (const support of coverage.supportedScope) {
            checkCitations(support.evidence, relationLocation);
            const citedSkills = [...new Set(support.evidence.filter((citation) => citation.object === "registry").map(citationSkill).filter(Boolean))];
            require(nonempty(support.scope) && strings(support.skillIds) && support.skillIds.length > 0 && sameSet(support.skillIds, citedSkills) && support.skillIds.every((skillId) => topic.skillIds.includes(skillId)), "task-evidence", "Supported scope must identify the actual cited registry tracks among the mapped candidates", relationLocation);
            require(support.skillIds.every((skillId) => support.evidence.some((citation) => citationSkill(citation) === skillId && citation.object === "registry" && /^\/tracks\/\d+\/templates\/\d+\/(objective|buildTask|proofRequirement|steps\/\d+\/label|completionCriteria\/\d+|rubric\/\d+)$/u.test(citation.pointer))), "task-evidence", "Every attributed support skill needs its own specific unit content; another skill's content cannot make a title-only citation sufficient", relationLocation);
          }
        }
      }
    }
    totals = totalsFor(annotations);
    require(equal(totals, annotations.totals), "totals", "Declared totals must equal the complete ledger");
    require(totals.documents === 30 && totals.legacyFields === 84 && totals.additionalFields === 2 && totals.finiteLiteralRelations === 245 && totals.nullNonLearningAccounts === 11 && totals.relations === 256, "totals", "The fixed document/field/finite-literal denominators must remain unchanged");
  } catch (error) {
    issue("shape", `Malformed reference or annotation structure: ${error.message}`);
  }
  return { valid: errors.length === 0, errors, totals, semanticJudgmentsCertified: false, newGateApproved: false, actualModelOrProductQualityEvaluated: false };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 2) throw new Error("Usage: validate-course-annotations.mjs (uses only adjacent frozen assets and local course files)");
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const [annotationText, snapshotText, sourceAnnotationText, currentReference] = await Promise.all([
      readFile(new URL("./course-annotations.draft.json", import.meta.url), "utf8"),
      readFile(new URL("./course-reference.snapshot.json", import.meta.url), "utf8"),
      readFile(new URL("./annotations.draft.json", import.meta.url), "utf8"),
      captureCourseReference({ root }),
    ]);
    const source = JSON.parse(sourceAnnotationText);
    const changedInputs = await verifyFrozenInputFiles(source, { root });
    const result = validateCourseAnnotations(JSON.parse(annotationText), { snapshot: JSON.parse(snapshotText), sourceAnnotationText, currentReference });
    if (sha256(snapshotText) !== COURSE_REFERENCE_SHA256) result.errors.push({ code: "snapshot-hash", message: "On-disk snapshot bytes differ from the pinned digest" });
    for (const file of changedInputs) result.errors.push({ code: "input-hash", message: `Immutable corpus/scorer/basis input changed: ${file.path}` });
    result.valid = result.errors.length === 0;
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ valid: false, errors: [{ code: "cli", message: error.message }] }));
    process.exitCode = 1;
  }
}
