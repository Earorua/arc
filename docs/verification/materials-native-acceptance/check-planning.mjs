// Independent protocol assertions over captured records. No application imports,
// reference-scorer bypass, production expected-state generator or database writes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const CASE_IDS = ["fact-confirm-only", "explicit-guided-self-adopt", "reject-batch-independent", "explicit-single-independent",
  "unadopted-learning-intent", "explicit-adopt-soft-focus", "withdraw-focus", "delete-material", "exclude-individual-term",
  "replace-primary-jd-same-job", "accept-current-primary-jd-preview", "secondary-jd-cannot-add-must", "unresolved-conflict-not-hard-resolved", "stale-preview-reject"];
const PROOF_TABLES = ["proof_items", "proof_versions", "proof_review_events", "user_skill_projections"];
const ACCEPTED_CASES = new Set(["explicit-adopt-soft-focus", "withdraw-focus", "exclude-individual-term", "accept-current-primary-jd-preview"]);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const json = value => JSON.stringify(value, null, 2) + "\n";
const sorted = values => [...values].sort((a, b) => String(a.id).localeCompare(String(b.id)));
const table = (snapshot, name) => { assert.ok(Array.isArray(snapshot.tables[name]), `Missing raw table ${name}`); return snapshot.tables[name]; };
const snapshot = (result, label) => { const value = result.snapshots.find(item => item.label === label); assert.ok(value, `Missing snapshot ${label}`); return value; };
const activePath = workspace => { const path = workspace.pathVersions.find(value => value.id === workspace.activePathVersionId); assert.ok(path, "Missing active path"); return path; };
const activePlan = workspace => { const plan = workspace.planVersions.find(value => value.id === workspace.activePlanVersionId); assert.ok(plan, "Missing active plan"); return plan; };
const links = value => table(value, "goal_document_links").filter(row => row.enabled === 1);
const contextRow = (value, id) => { const row = table(value, "material_context_versions").find(item => item.id === id); assert.ok(row, `Missing native context ${id}`); return row; };
const contextInput = (value, id) => JSON.parse(contextRow(value, id).snapshot_json);
const call = (result, operation, outcome = "returned", phase = "action") => {
  const found = result.trace.filter(item => item.operation === operation && item.outcome === outcome && item.phase === phase);
  assert.ok(found.length, `Missing ${phase} ${operation} ${outcome}`); return found.at(-1);
};
function retainRows(before, after, name) {
  const rows = new Set(table(after, name).map(row => JSON.stringify(row)));
  for (const row of table(before, name)) assert.ok(rows.has(JSON.stringify(row)), `Historical ${name} row was modified or removed`);
}
function unchanged(before, after) {
  assert.deepEqual(after.workspace, before.workspace, "Full workspace changed");
  assert.deepEqual(after.proofWorkspace, before.proofWorkspace, "Proof workspace changed");
  assert.deepEqual(after.tables, before.tables, "Native records changed");
  assert.deepEqual(after.r2, before.r2, "R2 objects changed");
}
function protectedState(before, after) {
  const b = before.workspace, a = after.workspace;
  assert.ok(b && a, "Existing native workspace required");
  for (const key of ["id", "goalId", "audit", "availability", "availabilityVersions", "target"]) assert.deepEqual(a[key], b[key], `Protected workspace ${key} changed`);
  assert.deepEqual(after.sourceReference, before.sourceReference, "Planning source identity changed");
  assert.deepEqual(sorted(activePath(a).units), sorted(activePath(b).units), "Task set/content/template versions/dependencies/minutes changed");
  const beforeCompleted = b.events.filter(event => event.kind === "completed");
  assert.ok(beforeCompleted.length > 0, "Missing actual completed event before operation");
  assert.deepEqual(a.events.filter(event => event.kind === "completed"), beforeCompleted, "Completion events changed");
  const retainedUnits = new Set(a.dailyUnits.map(unit => JSON.stringify(unit)));
  for (const unit of b.dailyUnits) assert.ok(retainedUnits.has(JSON.stringify(unit)), "Historical DailyUnit changed");
  for (const name of ["career_goals", "skill_audit_versions", "availability_versions", "learning_events", ...PROOF_TABLES]) {
    assert.deepEqual(table(after, name), table(before, name), `Protected native table ${name} changed`);
  }
  for (const name of ["learning_path_versions", "plan_versions", "daily_units"]) retainRows(before, after, name);
  assert.deepEqual(after.proofWorkspace, before.proofWorkspace, "Proof service reload changed");
  for (const name of PROOF_TABLES) assert.ok(table(before, name).length > 0, `Missing pre-existing ${name}`);
  const baselineUnits = sorted(activePath(b).units);
  for (const path of a.pathVersions.filter(path => !b.pathVersions.some(old => old.id === path.id))) {
    assert.deepEqual(sorted(path.units), baselineUnits, "Candidate changed protected task content");
    const seen = new Set(beforeCompleted.map(event => event.unitId));
    for (const unit of path.units) {
      for (const dependency of unit.prerequisiteUnitIds) assert.ok(seen.has(dependency), `Prerequisite ${dependency} occurs after ${unit.id}`);
      seen.add(unit.id);
    }
    for (const event of beforeCompleted) {
      const index = activePath(b).units.findIndex(unit => unit.id === event.unitId);
      assert.ok(index >= 0); assert.deepEqual(path.units[index], activePath(b).units[index], "Completed task position changed");
    }
  }
  for (const plan of a.planVersions.filter(plan => !b.planVersions.some(old => old.id === plan.id))) {
    const availability = a.availabilityVersions.find(value => value.id === a.pathVersions.find(path => path.id === plan.pathVersionId).availabilityVersionId);
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    for (const day of plan.days) {
      const budget = availability.exceptions.find(value => value.date === day.date)?.minutes ?? availability.weekdays[weekdays[new Date(`${day.date}T12:00:00.000Z`).getUTCDay()]];
      assert.equal(day.budgetMinutes, budget, "Native candidate budget differs from availability");
      const scheduled = [day.primaryUnitId, day.stretchUnitId].filter(Boolean).map(id => {
        const unit = a.dailyUnits.find(value => value.id === id && value.planVersionId === plan.id);
        assert.ok(unit, "Scheduled unit missing"); return unit;
      });
      assert.ok(scheduled.reduce((sum, unit) => sum + unit.estimatedMinutes, 0) <= budget, "Scheduled units exceed daily budget");
    }
  }
}
function currentUnchanged(before, after) {
  assert.equal(after.workspace.activePathVersionId, before.workspace.activePathVersionId);
  assert.equal(after.workspace.activePlanVersionId, before.workspace.activePlanVersionId);
  assert.deepEqual(activePath(after.workspace), activePath(before.workspace), "Current path changed before acceptance");
  assert.deepEqual(activePlan(after.workspace), activePlan(before.workspace), "Current plan/order/days changed before acceptance");
}
function proposalRecords(result, before, after) {
  const proposed = snapshot(result, "proposed");
  const response = call(result, "planning.proposeMaterialReplanResponse").response;
  assert.equal(response.outcome, "proposed");
  assert.deepEqual(response.planning.result.workspace, proposed.workspace, "Proposal return differs from reload");
  const row = table(proposed, "material_plan_proposals").find(value => value.candidate_plan_version_id === proposed.workspace.pendingPlanVersionId);
  assert.ok(row); assert.equal(row.state, "pending");
  assert.equal(row.context_version_id, result.refs.proposedContext.contextVersionId);
  assert.equal(row.active_base_plan_id, before.workspace.activePlanVersionId);
  assert.equal(row.input_revision, before.workspace.revision);
  assert.equal(row.proposal_revision, proposed.workspace.revision);
  const current = table(after, "material_plan_proposals").find(value => value.candidate_plan_version_id === row.candidate_plan_version_id);
  assert.ok(current); return { proposed, row, current };
}
function acceptedRecords(result, before, after) {
  const { row, current } = proposalRecords(result, before, after);
  const accepted = call(result, "planning.acceptReplan");
  assert.equal(accepted.input.baseVersionId, row.active_base_plan_id);
  assert.equal(accepted.input.candidatePlanVersionId, row.candidate_plan_version_id);
  assert.equal(accepted.response.outcome, "accepted");
  assert.deepEqual(accepted.response.workspace, after.workspace, "Acceptance return differs from persisted workspace");
  assert.equal(current.state, "accepted");
  assert.equal(after.workspace.activePlanVersionId, row.candidate_plan_version_id);
  assert.equal(after.workspace.activePathVersionId, activePlan(after.workspace).pathVersionId);
  assert.equal(after.workspace.pendingPlanVersionId, null);
  assert.ok(links(after).length > 0);
  assert.ok(links(after).every(link => link.context_version_id === row.context_version_id));
  assert.ok(table(after, "document_usage_links").some(link => link.kind === "accepted" && link.context_version_id === row.context_version_id && link.plan_version_id === row.candidate_plan_version_id));
  const input = contextInput(after, row.context_version_id);
  assert.equal(input.scope.goalId, before.workspace.goalId);
  assert.deepEqual(input.audit, before.workspace.audit);
  assert.deepEqual(links(after).map(link => link.document_id).sort(), input.dependencies.map(dependency => dependency.documentId).sort());
  return input;
}
export function checkCase(result) {
  const checks = [];
  const check = (name, execute) => {
    try { execute(); checks.push({ name, status: "passed" }); }
    catch (error) { checks.push({ name, status: "failed", message: error.message }); }
  };
  check("native collection, binding and offline boundary", () => {
    assert.equal(result.schemaVersion, "materials-native-planning-case-result-v1");
    assert.equal(result.bindingId, "materials-native-planning-20261119-v1");
    assert.equal(result.collectionStatus, "collected", JSON.stringify(result.failure));
    assert.equal(result.failure, null); assert.equal(result.outboundAttempts, 0);
    assert.equal(result.limits.modelQualityApproved, false); assert.equal(result.limits.gateApproved, false); assert.equal(result.limits.publicationApproved, false);
    const imported = call(result, "cloud.importLocalState", "returned", "setup");
    assert.equal(imported.input.consent, true); assert.equal(imported.input.conflictResolution, "reject");
    assert.deepEqual(imported.input.state.completedUnitIds, []); assert.deepEqual(imported.input.state.proofs, []);
    assert.equal(imported.input.state.setup.targetWeeks, 52); assert.equal(imported.input.state.setup.weeklyMinutes, 420);
    assert.equal(imported.response.status, "imported");
    for (const item of result.fixtureImports) {
      assert.ok(item.boundary); assert.ok(!String(item.boundary).includes("after"));
      if (item.candidate) {
        assert.equal(item.evaluatedUpstreamExtraction, false); assert.equal(item.realProviderConstructed, false);
        assert.ok(item.projected.items.every(fact => fact.sourceRef?.documentId === item.document.documentId));
      }
    }
  });
  check("fresh repository reload matches after records", () => unchanged(snapshot(result, "after"), snapshot(result, "reload")));
  const setup = result.caseId === "explicit-guided-self-adopt" || result.caseId === "explicit-single-independent";
  if (setup) {
    check("explicit setup choice precedes actual generation and persists", () => {
      const chosen = result.refs.setupChoice;
      assert.ok(chosen); assert.equal(chosen.nativeBoundary, "initial-generation-input");
      assert.equal(snapshot(result, "before-setup-choice").workspace, null);
      const decision = call(result, "contract.materialSelfAssessmentAdoptionSchema.parse", "returned", "setup");
      const generation = call(result, "planning.generate", "returned", "setup");
      assert.ok(decision.index < generation.index); assert.equal(decision.input.mode, "single");
      assert.equal(decision.input.decisions.length, 1);
      const level = result.caseId === "explicit-guided-self-adopt" ? "guided" : "independent";
      const after = snapshot(result, "after");
      assert.deepEqual(after.workspace.audit, generation.input.audit);
      assert.equal(after.workspace.audit.answers.find(answer => answer.skillId === "typescript").level, level);
      assert.deepEqual(after.workspace.audit.answers.filter(answer => answer.skillId !== "typescript"), chosen.baseAudit.answers.filter(answer => answer.skillId !== "typescript"));
      assert.deepEqual(after.workspace.audit.evidence, chosen.baseAudit.evidence);
      assert.equal(result.evidenceReuse.acceptedDate, "2026-11-09"); assert.equal(result.evidenceReuse.uiCases, 5);
      assert.equal(result.limits.newActivePlanSelfAssessmentEndpoint, false); assert.equal(result.limits.independentIsSelfReport, true);
      if (level === "guided") {
        assert.ok(result.refs.materials.resume.draft.selfAssessmentHints.some(hint => hint.skillLabel === "TypeScript" && hint.level === "guided"));
        assert.ok(result.refs.materials.resume.draft.items.some(item => item.sourceRef && item.skillLabels.includes("TypeScript")));
      } else assert.ok(!result.refs.materials.resume.draft.selfAssessmentHints.some(hint => hint.level === "independent"));
    });
  } else {
    check("complete protected native workspace and Proof", () => {
      const before = snapshot(result, "before"), after = snapshot(result, "after");
      protectedState(before, after);
      call(result, "planning.appendEvent", "returned", "setup"); call(result, "proof.create", "returned", "setup");
      const proof = call(result, "proof.create", "returned", "setup");
      assert.equal(proof.input.artifactUrl, "https://example.com/synthetic-completed-task");
      for (const observation of result.snapshots.filter(item => item.traceLength >= before.traceLength && item.workspace)) protectedState(before, observation);
    });
    check("current plan and context stay active until explicit acceptance", () => {
      const before = snapshot(result, "before");
      const accepted = result.trace.find(item => item.phase === "action" && item.operation === "planning.acceptReplan" && item.outcome === "returned");
      const deletion = result.trace.find(item => item.phase === "action" && item.operation === "documents.deleteDocument" && item.outcome === "returned");
      for (const observation of result.snapshots.filter(item => item.traceLength >= before.traceLength && item.workspace && (!accepted || item.traceLength <= accepted.index))) {
        currentUnchanged(before, observation);
        if (!deletion || observation.traceLength <= deletion.index) assert.deepEqual(links(observation), links(before), "Adopted context links changed before acceptance");
      }
      if (ACCEPTED_CASES.has(result.caseId)) acceptedRecords(result, before, snapshot(result, "after"));
      else assert.ok(!accepted, "Unexpected acceptance in this category");
    });
    check("declared behavior", () => {
      const before = snapshot(result, "before"), after = snapshot(result, "after"), refs = result.refs;
      const supplementId = refs.materials.supplement.documentId;
      const primaryId = refs.materials.primary.documentId;
      const primaryConfirmationId = refs.materials.primary.entry.confirmationId;
      const initialId = refs.initialContext.contextVersionId;
      const preview = refs.proposedContext?.preview;
      switch (result.caseId) {
        case "fact-confirm-only": {
          assert.deepEqual(after.workspace, before.workspace); assert.deepEqual(links(after), links(before));
          const confirmed = call(result, "documents.createDocumentConfirmation");
          assert.equal(confirmed.response.revision, confirmed.input.expectedRevision + 1);
          assert.ok(table(after, "document_confirmations").some(row => row.id === confirmed.response.confirmationId && row.review_revision === confirmed.input.reviewRevision));
          assert.ok(!links(after).some(link => link.document_id === refs.factOnly.documentId)); break;
        }
        case "reject-batch-independent": {
          const rejected = call(result, "contract.materialSelfAssessmentAdoptionSchema.parse", "threw");
          assert.equal(rejected.input.mode, "batch"); assert.equal(rejected.input.decisions[0].level, "independent");
          assert.ok(rejected.error.issues.some(issue => /individual selection/.test(issue.message)));
          assert.equal(result.evidenceReuse.uiCases, 5); unchanged(before, after); break;
        }
        case "unadopted-learning-intent": {
          assert.ok(preview.issues.some(issue => issue.code === "learning-intent-not-adopted"));
          assert.equal(preview.overlay.skillRanks.react, 5); assert.deepEqual(preview.overlay.mandatorySkillIds, ["sql"]);
          assert.deepEqual(after.workspace, before.workspace); assert.deepEqual(links(after), links(before)); break;
        }
        case "explicit-adopt-soft-focus": {
          const accepted = acceptedRecords(result, before, after);
          assert.deepEqual(accepted.learningIntents, [{ confirmationId: refs.materials.supplement.entry.confirmationId, itemId: "focus-react" }]);
          assert.equal(preview.overlay.skillRanks.react, 3); assert.deepEqual(preview.overlay.mandatorySkillIds, ["sql"]);
          assert.equal(accepted.dependencies.find(item => item.slot === "jd").confirmationId, primaryConfirmationId); break;
        }
        case "withdraw-focus": {
          const accepted = acceptedRecords(result, before, after);
          assert.deepEqual(contextInput(before, initialId).learningIntents.map(item => item.itemId).sort(), ["focus-react", "focus-sql"]);
          assert.deepEqual(accepted.learningIntents.map(item => item.itemId), ["focus-react"]);
          assert.ok(accepted.dependencies.some(item => item.documentId === supplementId));
          assert.deepEqual(accepted.dependencies, contextInput(before, initialId).dependencies);
          assert.equal(table(after, "documents").find(doc => doc.id === supplementId).lifecycle, "active"); break;
        }
        case "delete-material": {
          const { current } = proposalRecords(result, before, after);
          assert.equal(current.state, "revoked");
          assert.equal(refs.deletion.state, "cleanup-pending");
          assert.equal(table(after, "documents").find(doc => doc.id === supplementId).lifecycle, "cleanup-pending");
          assert.ok(table(after, "document_storage_operations").filter(row => row.document_id === supplementId).every(row => row.state === "cleanup-pending"));
          assert.equal(contextRow(after, refs.proposedContext.contextVersionId).state, "revoked");
          assert.equal(contextRow(after, initialId).state, "revoked");
          assert.ok(!links(after).some(row => row.document_id === supplementId));
          assert.deepEqual(links(after), links(before).filter(row => row.document_id !== supplementId));
          assert.ok(["CONFLICT", "NOT_FOUND", "GONE"].includes(call(result, "contexts.read", "threw").error.code));
          assert.equal(call(result, "planning.acceptReplan", "threw").error.code, "CONFLICT"); break;
        }
        case "exclude-individual-term": {
          const accepted = acceptedRecords(result, before, after);
          const confirmationId = refs.materials.supplement.entry.confirmationId;
          assert.deepEqual(accepted.termMappings, [{ confirmationId, itemId: "focus-two-terms", skillLabel: "SQL", skillIds: [] }]);
          const fact = refs.materials.supplement.draft.items.find(item => item.id === "focus-two-terms");
          assert.deepEqual(fact.skillLabels, ["SQL", "React"]);
          const item = preview.itemReferences.find(item => item.confirmationId === confirmationId && item.itemId === fact.id);
          const mapped = preview.mappingDetails.filter(detail => detail.itemId === item.id);
          assert.ok(mapped.some(detail => detail.termIndexes.includes(0) && detail.status === "omitted" && detail.skillIds.length === 0));
          assert.ok(mapped.some(detail => detail.termIndexes.includes(1) && detail.status === "mapped" && detail.skillIds.includes("react")));
          assert.equal(preview.overlay.skillRanks.react, 3); assert.ok(links(after).some(link => link.document_id === supplementId));
          assert.deepEqual(table(after, "document_confirmations"), table(before, "document_confirmations")); break;
        }
        case "replace-primary-jd-same-job":
        case "accept-current-primary-jd-preview": {
          const { current } = proposalRecords(result, before, after);
          const input = contextInput(after, refs.proposedContext.contextVersionId);
          assert.equal(input.dependencies.filter(item => item.slot === "jd").length, 1);
          assert.equal(input.dependencies.find(item => item.slot === "jd").documentId, refs.replacement.documentId);
          for (const material of [refs.materials.resume, refs.materials.supplement]) assert.ok(input.dependencies.some(item => item.documentId === material.documentId));
          assert.deepEqual(preview.overlay.mandatorySkillIds, ["react"]);
          if (result.caseId === "replace-primary-jd-same-job") {
            assert.equal(current.state, "pending"); assert.ok(links(after).some(link => link.document_id === primaryId));
            assert.ok(!links(after).some(link => link.document_id === refs.replacement.documentId));
          } else {
            acceptedRecords(result, before, after); assert.ok(!links(after).some(link => link.document_id === primaryId));
            assert.ok(links(after).some(link => link.document_id === refs.replacement.documentId));
          }
          break;
        }
        case "secondary-jd-cannot-add-must": {
          const unadopted = refs.unadoptedContext.preview;
          assert.equal(refs.materials.supplement.entry.slot, "supplement");
          assert.equal(refs.materials.supplement.draft.items[0].requirementLevel, "must");
          assert.deepEqual(unadopted.overlay.mandatorySkillIds, ["sql"]); assert.equal(unadopted.overlay.skillRanks.react, 5);
          assert.deepEqual(preview.overlay.mandatorySkillIds, ["sql"]); assert.equal(preview.overlay.skillRanks.react, 3);
          assert.equal(contextInput(after, refs.proposedContext.contextVersionId).dependencies.find(item => item.slot === "jd").documentId, primaryId);
          assert.deepEqual(after.workspace, before.workspace); break;
        }
        case "unresolved-conflict-not-hard-resolved": {
          const prior = snapshot(result, "before-confirmation-attempt"); unchanged(prior, after);
          assert.equal(call(result, "documents.createDocumentConfirmation", "threw").error.code, "invalid-content");
          assert.equal(table(after, "document_confirmations").filter(row => row.document_id === refs.conflict.documentId).length, 0);
          const points = JSON.parse(table(after, "document_review_drafts").find(row => row.id === refs.conflict.draft.id).review_points_json);
          assert.ok(points.some(point => point.code === "conflicting-requirement" && point.resolution === "unresolved" && point.sourceRef.documentId === refs.conflict.documentId)); break;
        }
        case "stale-preview-reject": {
          const { current } = proposalRecords(result, before, after); assert.equal(current.state, "revoked");
          const invalidation = call(result, "documents.createMaterialSelection");
          assert.equal(invalidation.input.scope.revision, snapshot(result, "proposed").workspace.revision);
          assert.ok(!invalidation.input.entries.some(entry => entry.documentId === supplementId));
          assert.equal(call(result, "planning.acceptReplan", "threw").error.code, "CONFLICT");
          unchanged(snapshot(result, "invalidated-before-acceptance"), after); break;
        }
        default: throw new Error(`No independent behavior assertion for ${result.caseId}`);
      }
    });
  }
  return { caseId: result.caseId, layer: result.layer, status: checks.every(check => check.status === "passed") ? "passed" : "failed", checks };
}

export function checkCollection(directory) {
  const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
  const index = JSON.parse(readFileSync(resolve(directory, "collection.json"), "utf8"));
  assert.equal(manifest.bindingId, "materials-native-planning-20261119-v1");
  assert.equal(index.manifestSha256, sha256(readFileSync(resolve(directory, "manifest.json"))));
  assert.deepEqual(index.sourceDrift, []); assert.equal(index.outboundAttempts, 0);
  assert.equal(manifest.sourceClosureDigest, sha256(json(manifest.sourceClosure)));
  assert.equal(manifest.runtimeDigest, sha256(json(manifest.runtime)));
  assert.equal(manifest.evidenceReuse.currentFile.sha256, manifest.evidenceReuse.acceptedFileSha256);
  assert.equal(manifest.workerBundle.sha256, sha256(readFileSync(resolve(directory, "worker.mjs"))));
  assert.equal(new Set(index.results.map(item => item.caseId)).size, index.results.length);
  assert.deepEqual(index.results.map(item => item.caseId), manifest.requestedCases);
  const results = index.results.map(entry => {
    assert.ok(CASE_IDS.includes(entry.caseId)); assert.equal(entry.path, `${entry.caseId}.json`);
    const path = resolve(directory, entry.path); assert.equal(dirname(path), directory);
    assert.equal(entry.sha256, sha256(readFileSync(path)));
    const result = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(result.caseId, entry.caseId); assert.equal(result.inputDigest, manifest.input.sha256);
    assert.equal(result.sourceClosureDigest, manifest.sourceClosureDigest); assert.equal(result.runtimeDigest, manifest.runtimeDigest);
    assert.equal(result.workerBundleDigest, manifest.workerBundle.sha256);
    return { ...checkCase(result), artifactSha256: entry.sha256 };
  });
  const missing = CASE_IDS.filter(id => !results.some(result => result.caseId === id));
  return { schemaVersion: "materials-native-planning-check-v1", bindingId: manifest.bindingId,
    checkedAt: new Date().toISOString(), collectionDirectory: directory, manifestSha256: index.manifestSha256,
    checkerSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    status: results.every(result => result.status === "passed") ? (missing.length ? "partial-pass" : "passed") : "failed",
    counts: { passed: results.filter(result => result.status === "passed").length, failed: results.filter(result => result.status === "failed").length, notCollected: missing.length },
    results, notCollected: missing, limits: manifest.limits };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, "Usage: node check-planning.mjs work/grounded-verification/native-planning-20261119-<unique-run>");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const directory = resolve(root, process.argv[2]);
  const allowed = resolve(root, "work/grounded-verification");
  assert.ok(relative(allowed, directory).startsWith("native-planning-20261119-") && !relative(allowed, directory).includes(sep));
  const output = resolve(directory, "check.json"); assert.ok(!existsSync(output), "Checker output exists; preserve prior evidence");
  const result = checkCollection(directory); writeFileSync(output, json(result), { flag: "wx" });
  console.log(JSON.stringify({ output, status: result.status, counts: result.counts,
    failures: result.results.filter(item => item.status === "failed").map(item => ({ caseId: item.caseId, checks: item.checks.filter(check => check.status === "failed") })) }));
  if (result.status === "failed") process.exitCode = 1;
}
