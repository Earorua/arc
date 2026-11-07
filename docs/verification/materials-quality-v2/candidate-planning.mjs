import { canonicalJson, equal, errorCollector, sameSet, sha256 } from "./candidate-common.mjs";

const keyCodes = { selfAssessments: "self-assessments", completedRecords: "completed-records", selectedMaterials: "selected-materials", mainJdRequirements: "authority", deletedMaterialIds: "deleted-materials", excludedTerms: "excluded-terms" };

/** Validate concrete preservation/safety invariants; never generate a plan. */
function checkPlanState(state, references, issue) {
  const tasks = new Map(state.tasks.map((task) => [task.id, task]));
  if (tasks.size !== state.tasks.length) issue("planning-task-set");
  const pending = state.tasks.filter((task) => task.status === "pending").map((task) => task.id);
  if (!sameSet(state.order, pending)) issue("planning-uncompleted-set");
  const positions = new Map(state.order.map((taskId, index) => [taskId, index]));
  const skills = new Map(references.snapshot.objects.blueprint.value.skills.map((skill) => [skill.id, skill]));
  const units = new Map(references.snapshot.objects.registry.value.tracks.flatMap((track) => track.templates.map((unit) => [unit.id, unit])));
  const collectAncestors = (task, visited = new Set()) => {
    if (visited.has(task.id)) return new Set(); visited.add(task.id);
    const ancestors = new Set();
    for (const dependency of task.dependencies) {
      const parent = tasks.get(dependency); if (!parent) continue;
      ancestors.add(parent.skillId); for (const skill of collectAncestors(parent, visited)) ancestors.add(skill);
    }
    return ancestors;
  };
  for (const task of state.tasks) {
    const unit = units.get(task.unitId);
    if (!unit || unit.skillId !== task.skillId || unit.version !== task.unitVersion) issue("illegal-plan-unit", { taskId: task.id });
    if (unit && unit.estimatedMinutes !== task.estimatedMinutes) issue("planning-unit-minutes", { taskId: task.id });
    const ancestors = collectAncestors(task);
    if (!skills.has(task.skillId) || skills.get(task.skillId).prerequisiteIds.some((skillId) => !ancestors.has(skillId))) issue("planning-course-prerequisite", { taskId: task.id });
    for (const dependency of task.dependencies) {
      const parent = tasks.get(dependency);
      if (!parent || dependency === task.id || (parent.status !== "completed" && (task.status === "completed" || !positions.has(dependency) || positions.get(dependency) >= positions.get(task.id)))) issue("planning-topology", { taskId: task.id });
    }
  }
  const scheduled = state.schedule.flatMap((week) => week.taskIds);
  if (!equal(scheduled, state.order) || !sameSet(scheduled, pending) || new Set(state.schedule.map((week) => week.week)).size !== state.schedule.length) issue("planning-schedule");
  let lastWeek = 0;
  for (const week of state.schedule) {
    if (week.week <= lastWeek || week.week > state.budget.weeks || week.taskIds.some((taskId) => !tasks.has(taskId))
      || week.taskIds.reduce((minutes, taskId) => minutes + (tasks.get(taskId)?.estimatedMinutes ?? 0), 0) > state.budget.minutesPerWeek) issue("planning-budget");
    lastWeek = week.week;
  }
  const completed = state.tasks.filter((task) => task.status === "completed").map((task) => task.id);
  if (!sameSet(state.completedRecords.map((record) => record.taskId), completed)) issue("planning-completed-records");
  for (const proof of state.proofs) if (!completed.includes(proof.taskId) || tasks.get(proof.taskId)?.skillId !== proof.skillId) issue("planning-proofs");
  const records = [...state.selfAssessments, ...state.proofs, ...state.mainJdRequirements, ...state.conflicts, ...state.focus.flatMap((focus) => focus.skillIds.map((skillId) => ({ skillId })))];
  if (records.some((record) => !skills.has(record.skillId))) issue("illegal-plan-skill");
  if (new Set(state.selfAssessments.map((entry) => entry.skillId)).size !== state.selfAssessments.length) issue("planning-self-assessments");
  const primary = state.selectedMaterials.filter((material) => material.role === "primary-jd");
  if (primary.length !== 1 || state.selectedMaterials.some((material) => material.jobId !== state.jobId)
    || state.mainJdRequirements.some((requirement) => requirement.documentId !== primary[0]?.documentId)) issue("planning-authority");
  for (const focus of state.focus) {
    if (!state.selectedMaterials.some((material) => material.documentId === focus.documentId) || state.deletedMaterialIds.includes(focus.documentId)
      || state.excludedTerms.some((excluded) => excluded.documentId === focus.documentId && excluded.literal === focus.literal)) issue("planning-focus");
  }
  if (sha256(canonicalJson(state.preview.proposedContext)) !== state.preview.materialContextSha256) issue("planning-preview-context");
}

export function verifyPlanningReference(planning, references) {
  if (planning.schemaVersion !== "materials-planning-reference-v2.1" || planning.caseCount !== 14 || planning.cases.length !== 14 || new Set(planning.cases.map((entry) => entry.id)).size !== 14) throw new Error("reference-integrity: planning cases");
  for (const testCase of planning.cases) {
    if (sha256(canonicalJson(testCase.input)) !== testCase.inputSha256) throw new Error("reference-integrity: planning digest");
    checkPlanState(testCase.input.before, references, () => { throw new Error("reference-integrity: planning before invariants"); });
    if (planning.protectedStateKeys.some((key) => Object.hasOwn(testCase.constraints.expectedChanges, key))) throw new Error("reference-integrity: protected override");
    const after = { ...testCase.input.before, ...testCase.constraints.expectedChanges };
    checkPlanState(after, references, () => { throw new Error("reference-integrity: planning after invariants"); });
    const action = testCase.input.action;
    if (action.type === "apply-preview" && testCase.constraints.applyState === "accepted") {
      const before = testCase.input.before;
      if (action.previewId !== before.preview.id || action.expectedRevision !== before.revision || before.preview.baseRevision !== before.revision
        || action.materialContextSha256 !== before.preview.materialContextSha256 || !equal(after.order, before.preview.proposedOrder)
        || !equal(after.schedule, before.preview.proposedSchedule) || !after.preview.applied) throw new Error("reference-integrity: preview acceptance");
      for (const [key, value] of Object.entries(before.preview.proposedContext)) if (!equal(after[key], value)) throw new Error("reference-integrity: accepted context");
    } else if (!equal(after.order, testCase.input.before.order) || !equal(after.schedule, testCase.input.before.schedule) || after.preview.applied) throw new Error("reference-integrity: unaccepted plan change");
  }
}

export function evaluatePlanning(observations, references) {
  if (observations === undefined) return { status: "not-evaluated", reason: "plan-observations-absent", cases: [], errors: [] };
  const issues = errorCollector(); const seen = new Set(); const reports = [];
  for (const observation of observations) {
    const errors = []; const location = { caseId: observation.caseId };
    const issue = (code, extra = {}) => { const error = { code, ...location, ...extra }; errors.push(error); issues.add(code, { ...location, ...extra }); };
    const testCase = references.planning.cases.find((entry) => entry.id === observation.caseId);
    if (seen.has(observation.caseId)) issue("duplicate-planning-case"); seen.add(observation.caseId);
    if (!testCase) issue("unknown-planning-case");
    else {
      if (observation.inputSha256 !== testCase.inputSha256) issue("planning-input-digest");
      if (observation.result.applyState !== testCase.constraints.applyState || observation.result.rejectionCode !== testCase.constraints.rejectionCode) issue("planning-apply-state");
      // Declarative key-level comparisons protect complete projections. No ranking,
      // adoption or expected-result generator is run against the candidate.
      for (const [key, beforeValue] of Object.entries(testCase.input.before)) {
        const expected = Object.hasOwn(testCase.constraints.expectedChanges, key) ? testCase.constraints.expectedChanges[key] : beforeValue;
        if (!equal(observation.result.state[key], expected)) issue(`planning-${keyCodes[key] ?? key}`);
      }
      checkPlanState(observation.result.state, references, issue);
    }
    reports.push({ ...location, status: errors.length ? "failed" : "passed", errors });
  }
  for (const testCase of references.planning.cases) if (!seen.has(testCase.id)) {
    issues.add("missing-planning-case", { caseId: testCase.id }); reports.push({ caseId: testCase.id, status: "failed", errors: [{ code: "missing-planning-case", caseId: testCase.id }] });
  }
  return { status: issues.errors.length ? "failed" : "passed", requiredCases: references.planning.caseCount, receivedCases: observations.length,
    evidenceLimit: "Fixed synthetic projection checks; provenance declaration alone does not prove an actual product run.", cases: reports, errors: issues.errors, omittedErrors: issues.omitted };
}
