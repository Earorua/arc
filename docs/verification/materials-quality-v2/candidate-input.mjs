import { errorCollector } from "./candidate-common.mjs";
import { types } from "node:util";

export const MAX_BATCH_BYTES = 8 * 1024 * 1024;
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const reviewCodes = ["confirm-self-assessment", "conflicting-self-assessment", "team-attribution", "conflicting-requirement", "prompt-injection", "untrusted-resource-url", "missing-information", "uncovered-skill"];
const inputErrorCodes = new WeakMap();
function invalidJson(code) {
  const error = new Error(code); inputErrorCodes.set(error, code); throw error;
}

/** No coercion, getters, toJSON, exotic prototypes, holes, symbols or cycles. */
function inspectJson(value) {
  const active = new Set(); let nodes = 0;
  function visit(item, depth) {
    if (++nodes > 200000 || depth > 32) invalidJson("input-complexity");
    if (item === null || typeof item === "boolean" || typeof item === "string") return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    // Native proxy detection does not invoke traps, even for revoked proxies.
    if (typeof item !== "object" || types.isProxy(item) || active.has(item)) invalidJson("input-non-json");
    const array = Array.isArray(item); const proto = Object.getPrototypeOf(item);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) invalidJson("input-non-json");
    active.add(item);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalidJson("input-non-json");
    if (array && (item.length > 24000 || Object.keys(descriptors).length !== item.length + 1)) invalidJson("input-non-json");
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === "length") continue;
      if (!("value" in descriptor) || !descriptor.enumerable || (array && !/^(0|[1-9]\d*)$/u.test(key))) invalidJson("input-non-json");
      visit(descriptor.value, depth + 1);
    }
    active.delete(item);
  }
  visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_BATCH_BYTES) invalidJson("input-batch-size");
}

/** Strict wire schema, intentionally independent of production contracts. */
export function validateCandidateInput(input) {
  const issues = errorCollector();
  // Only private validation errors carry specific codes. No property access,
  // coercion or reflection is performed on an arbitrary caught value.
  try { inspectJson(input); } catch (error) { issues.add(inputErrorCodes.get(error) ?? "input-non-json", { path: "/" }); return issues.errors; }
  const issue = (path, code = "input-shape") => issues.add(code, { path });
  const object = (value, required, optional, at) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) { issue(at); return false; }
    for (const key of required) if (!Object.hasOwn(value, key)) issue(`${at}/${key}`, "input-required");
    for (const key of Object.keys(value)) if (![...required, ...optional].includes(key)) issue(`${at}/${key}`, "input-unknown-key");
    return true;
  };
  const string = (value, at, max = 1000) => { if (typeof value !== "string" || value.length < 1 || value.length > max || !value.trim()) issue(at); };
  const id = (value, at) => { string(value, at, 256); if (typeof value === "string" && !idPattern.test(value)) issue(at, "input-id"); };
  const enumeration = (value, choices, at) => { if (!choices.includes(value)) issue(at, "input-enum"); };
  const number = (value, at, min = 0, max = Number.MAX_SAFE_INTEGER - 1) => { if (!Number.isSafeInteger(value) || value < min || value > max) issue(at); };
  const list = (value, at, max, check, uniqueKey) => {
    if (!Array.isArray(value) || value.length > max) { issue(at, "input-array-bound"); return; }
    const seen = new Set();
    value.forEach((entry, index) => {
      check(entry, `${at}/${index}`);
      if (uniqueKey) { const key = uniqueKey(entry); if (seen.has(key)) issue(`${at}/${index}`, "input-duplicate-id"); seen.add(key); }
    });
  };
  const ids = (value, at, max = 100) => list(value, at, max, id, (entry) => entry);
  const source = (value, at) => { if (object(value, ["segmentId", "quote"], [], at)) { id(value.segmentId, `${at}/segmentId`); string(value.quote, `${at}/quote`); } };
  const candidate = (value, at) => {
    if (!object(value, ["id", "kind", "text", "source", "skillLabels", "selfLevelHint", "requirementLevel"], [], at)) return;
    id(value.id, `${at}/id`); enumeration(value.kind, ["experience", "skill-claim", "requirement", "constraint"], `${at}/kind`);
    string(value.text, `${at}/text`); source(value.source, `${at}/source`);
    list(value.skillLabels, `${at}/skillLabels`, 8, (term, termPath) => string(term, termPath, 100), (term) => term);
    enumeration(value.selfLevelHint, [null, "guided", "conceptual", "uncertain"], `${at}/selfLevelHint`);
    enumeration(value.requirementLevel, [null, "must", "preferred", "unspecified"], `${at}/requirementLevel`);
    if (value.kind !== "requirement" && value.requirementLevel !== null) issue(`${at}/requirementLevel`);
    if (!["experience", "skill-claim"].includes(value.kind) && value.selfLevelHint !== null) issue(`${at}/selfLevelHint`);
  };
  const document = (value, at) => {
    if (!object(value, ["documentId", "documentVersionId", "textVersionId", "candidates", "reviewPoints"], [], at)) return;
    for (const key of ["documentId", "documentVersionId", "textVersionId"]) id(value[key], `${at}/${key}`);
    list(value.candidates, `${at}/candidates`, 100, candidate, (entry) => entry?.id);
    list(value.reviewPoints, `${at}/reviewPoints`, 100, (review, reviewPath) => {
      if (object(review, ["code", "source"], [], reviewPath)) { enumeration(review.code, reviewCodes, `${reviewPath}/code`); source(review.source, `${reviewPath}/source`); }
    });
    if (Buffer.byteLength(JSON.stringify({ candidates: value.candidates, reviewPoints: value.reviewPoints })) > 128 * 1024) issue(at, "input-document-size");
  };
  const course = (value, at) => {
    if (!object(value, ["documentId", "candidateId", "literal", "topic", "taskCoverage"], [], at)) return;
    id(value.documentId, `${at}/documentId`); id(value.candidateId, `${at}/candidateId`); if (value.literal !== null) string(value.literal, `${at}/literal`, 100);
    if (object(value.topic, ["status", "skillIds", "basis"], [], `${at}/topic`)) {
      enumeration(value.topic.status, ["mapped", "ambiguous", "uncovered", "non-learning"], `${at}/topic/status`);
      ids(value.topic.skillIds, `${at}/topic/skillIds`, 16);
      enumeration(value.topic.basis, ["literal", "contextual", "none", "not-applicable"], `${at}/topic/basis`);
    }
    if (object(value.taskCoverage, ["status"], [], `${at}/taskCoverage`)) enumeration(value.taskCoverage.status, ["full", "partial", "none", "not-applicable"], `${at}/taskCoverage/status`);
  };
  const recordList = (value, at, keys, check, max = 100) => list(value, at, max, (entry, entryPath) => { if (object(entry, keys, [], entryPath)) check(entry, entryPath); });
  const contextKeys = ["selectedMaterials", "focus", "excludedTerms", "deletedMaterialIds", "mainJdRequirements", "conflicts"];
  const context = (value, at, standalone = false) => {
    if (standalone && !object(value, contextKeys, [], at)) return;
    recordList(value.selectedMaterials, `${at}/selectedMaterials`, ["documentId", "versionId", "role", "jobId"], (v, p) => { for (const k of ["documentId", "versionId", "jobId"]) id(v[k], `${p}/${k}`); enumeration(v.role, ["primary-jd", "secondary-jd", "resume", "supplement"], `${p}/role`); }, 10);
    recordList(value.focus, `${at}/focus`, ["documentId", "literal", "skillIds"], (v, p) => { id(v.documentId, `${p}/documentId`); string(v.literal, `${p}/literal`, 100); ids(v.skillIds, `${p}/skillIds`, 16); });
    recordList(value.excludedTerms, `${at}/excludedTerms`, ["documentId", "literal"], (v, p) => { id(v.documentId, `${p}/documentId`); string(v.literal, `${p}/literal`, 100); });
    ids(value.deletedMaterialIds, `${at}/deletedMaterialIds`);
    recordList(value.mainJdRequirements, `${at}/mainJdRequirements`, ["documentId", "skillId", "level"], (v, p) => { id(v.documentId, `${p}/documentId`); id(v.skillId, `${p}/skillId`); enumeration(v.level, ["must", "preferred", "unspecified"], `${p}/level`); });
    recordList(value.conflicts, `${at}/conflicts`, ["id", "documentId", "skillId", "status", "alternatives"], (v, p) => { for (const k of ["id", "documentId", "skillId"]) id(v[k], `${p}/${k}`); enumeration(v.status, ["unresolved", "resolved"], `${p}/status`); list(v.alternatives, `${p}/alternatives`, 3, (a, q) => enumeration(a, ["must", "preferred", "unspecified"], q)); });
  };
  const state = (value, at) => {
    if (!object(value, ["revision", "jobId", "selfAssessments", "proofs", "tasks", "completedRecords", "order", "budget", "schedule", "selectedMaterials", "focus", "excludedTerms", "deletedMaterialIds", "mainJdRequirements", "conflicts", "audit", "preview"], [], at)) return;
    number(value.revision, `${at}/revision`); id(value.jobId, `${at}/jobId`);
    recordList(value.selfAssessments, `${at}/selfAssessments`, ["skillId", "level"], (v, p) => { id(v.skillId, `${p}/skillId`); enumeration(v.level, ["unseen", "conceptual", "guided", "independent", "uncertain"], `${p}/level`); }, 16);
    recordList(value.proofs, `${at}/proofs`, ["id", "taskId", "skillId", "artifact", "digest", "verifiedAt"], (v, p) => {
      for (const k of ["id", "taskId", "skillId"]) id(v[k], `${p}/${k}`);
      string(v.artifact, `${p}/artifact`); string(v.verifiedAt, `${p}/verifiedAt`, 64); if (typeof v.digest !== "string" || !digestPattern.test(v.digest)) issue(`${p}/digest`);
    });
    recordList(value.tasks, `${at}/tasks`, ["id", "skillId", "unitId", "unitVersion", "content", "dependencies", "estimatedMinutes", "status"], (v, p) => {
      for (const k of ["id", "skillId", "unitId"]) id(v[k], `${p}/${k}`);
      string(v.unitVersion, `${p}/unitVersion`, 32); string(v.content, `${p}/content`, 4000); ids(v.dependencies, `${p}/dependencies`);
      number(v.estimatedMinutes, `${p}/estimatedMinutes`, 0, 10000); enumeration(v.status, ["pending", "completed"], `${p}/status`);
    });
    recordList(value.completedRecords, `${at}/completedRecords`, ["taskId", "completedAt", "spentMinutes", "proofIds"], (v, p) => { id(v.taskId, `${p}/taskId`); string(v.completedAt, `${p}/completedAt`, 64); number(v.spentMinutes, `${p}/spentMinutes`, 0, 100000); ids(v.proofIds, `${p}/proofIds`); });
    ids(value.order, `${at}/order`);
    if (object(value.budget, ["minutesPerWeek", "weeks"], [], `${at}/budget`)) { number(value.budget.minutesPerWeek, `${at}/budget/minutesPerWeek`, 1, 10080); number(value.budget.weeks, `${at}/budget/weeks`, 1, 52); }
    recordList(value.schedule, `${at}/schedule`, ["week", "taskIds"], (v, p) => { number(v.week, `${p}/week`, 1, 52); ids(v.taskIds, `${p}/taskIds`); }, 52);
    context(value, at);
    recordList(value.audit, `${at}/audit`, ["id", "action", "targetId"], (v, p) => { for (const k of ["id", "action", "targetId"]) id(v[k], `${p}/${k}`); });
    if (object(value.preview, ["id", "baseRevision", "applied", "rejectionCode", "materialContextSha256", "proposedContext", "proposedOrder", "proposedSchedule"], [], `${at}/preview`)) {
      id(value.preview.id, `${at}/preview/id`); number(value.preview.baseRevision, `${at}/preview/baseRevision`);
      enumeration(value.preview.applied, [true, false], `${at}/preview/applied`); if (value.preview.rejectionCode !== null) id(value.preview.rejectionCode, `${at}/preview/rejectionCode`);
      if (typeof value.preview.materialContextSha256 !== "string" || !digestPattern.test(value.preview.materialContextSha256)) issue(`${at}/preview/materialContextSha256`);
      context(value.preview.proposedContext, `${at}/preview/proposedContext`, true);
      ids(value.preview.proposedOrder, `${at}/preview/proposedOrder`);
      recordList(value.preview.proposedSchedule, `${at}/preview/proposedSchedule`, ["week", "taskIds"], (v, p) => { number(v.week, `${p}/week`, 1, 52); ids(v.taskIds, `${p}/taskIds`); }, 52);
    }
  };
  const planning = (value, at) => {
    if (!object(value, ["caseId", "inputSha256", "result"], [], at)) return;
    id(value.caseId, `${at}/caseId`); if (typeof value.inputSha256 !== "string" || !digestPattern.test(value.inputSha256)) issue(`${at}/inputSha256`);
    if (object(value.result, ["applyState", "rejectionCode", "state"], [], `${at}/result`)) {
      enumeration(value.result.applyState, ["accepted", "rejected"], `${at}/result/applyState`);
      if (value.result.rejectionCode !== null) id(value.result.rejectionCode, `${at}/result/rejectionCode`);
      state(value.result.state, `${at}/result/state`);
    }
  };
  if (object(input, ["schemaVersion", "provenance", "documents"], ["courseObservations", "planObservations"], "")) {
    enumeration(input.schemaVersion, ["materials-quality-candidate-v2.1"], "/schemaVersion");
    if (object(input.provenance, ["kind", "description"], [], "/provenance")) {
      enumeration(input.provenance.kind, ["constructed-control", "model-extraction", "product-observation"], "/provenance/kind"); string(input.provenance.description, "/provenance/description");
    }
    list(input.documents, "/documents", 100, document, (entry) => entry?.documentId);
    if (Object.hasOwn(input, "courseObservations")) list(input.courseObservations, "/courseObservations", 24000, course);
    if (Object.hasOwn(input, "planObservations")) list(input.planObservations, "/planObservations", 100, planning);
  }
  return issues.errors;
}
