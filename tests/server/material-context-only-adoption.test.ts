// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import type { ConfirmedMaterialItem, MaterialSelectionEntry } from "../../app/contracts/documents";
import { createMaterialContextFingerprint, type ContextInputSnapshot } from "../../app/contracts/material-planning";
import type { PlanningWorkspace } from "../../app/contracts/planning";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { canonicalJson } from "../../app/lib/planning/fingerprint";
import { MaterialContextService } from "../../app/server/documents/context-builder";
import { D1DocumentRepository } from "../../app/server/documents/d1-repository";
import { detachAdoptedMaterial } from "../../app/server/documents/detach-adopted-material";
import { DeletionService } from "../../app/server/documents/deletion-service";
import { SelectionService } from "../../app/server/documents/selection-service";
import { DocumentStorage } from "../../app/server/documents/storage";
import { D1PlanningRepository } from "../../app/server/planning/d1-planning-repository";
import { PlanningService } from "../../app/server/planning/service";
import { PlanningSourceResolver } from "../../app/server/planning/source-resolver";
import { D1ProofRepository } from "../../app/server/proof/d1-proof-repository";
import { ProofService } from "../../app/server/proof/service";
import { createMaterialsD1 } from "../helpers/materials-d1";
import { memoryBucket } from "../helpers/document-bucket";
import { materialContextRequest, materialNow, materialSourceResolver, seedMaterialSelection } from "../helpers/material-planning";

const databases: ReturnType<typeof createMaterialsD1>[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));
type Choices = Pick<ContextInputSnapshot, "skillMappings" | "termMappings" | "learningIntents">;
const primary: MaterialSelectionEntry = { slot: "jd", documentId: "doc-a", documentVersionId: "version-a", confirmationId: "confirmation-a" };
const activePath = (workspace: PlanningWorkspace) => workspace.pathVersions.find(path => path.id === workspace.activePathVersionId)!;
const activePlan = (workspace: PlanningWorkspace) => workspace.planVersions.find(plan => plan.id === workspace.activePlanVersionId)!;
const scopeFor = (workspace: PlanningWorkspace) => ({ kind: "goal" as const, goalId: workspace.goalId, workspaceId: workspace.id,
  baseVersionId: workspace.activePlanVersionId, revision: workspace.revision });

async function setup(adoptInitially = false, initialFocus?: boolean, constrainedJD = false) {
  const db = createMaterialsD1(); databases.push(db); seedMaterialSelection(db);
  // Two company JDs may have identical confirmed requirements and still be distinct adopted sources.
  db.database.prepare("UPDATE document_confirmations SET items_json=?").run(JSON.stringify([
    { id: "confirmed-a", kind: "requirement", text: "SQL", origin: "user", sourceRef: null, requirementLevel: constrainedJD ? "must" : "unspecified" },
  ]));
  let counter = 0;
  let clock = materialNow().getTime();
  const now = () => new Date(clock);
  const id = () => `context-only-${++counter}`;
  // This legal native source declares a prerequisite chain. SQL precedes React regardless
  // of which company JD gives its skill the highest priority; no expected task order is patched in.
  const chain = ["web-platform", "typescript", "sql", "react", ...flagshipBlueprint.skills.map(skill => skill.id).filter(skill => !["web-platform", "typescript", "sql", "react"].includes(skill))];
  const blueprint = constrainedJD ? { ...flagshipBlueprint,
    skills: chain.map((skillId, index) => ({ ...flagshipBlueprint.skills.find(skill => skill.id === skillId)!, prerequisiteIds: index ? [chain[index - 1]!] : [] })),
    phases: [{ id: "prerequisite-chain", name: "Prerequisite-constrained product work", weeks: 52, outcome: "Complete every declared prerequisite before its dependent skill.", skillIds: chain }],
  } : flagshipBlueprint;
  const sourceResolver = constrainedJD ? new PlanningSourceResolver({ intelligence: { getPublished: async () => blueprint }, flagshipRegistry: flagshipUnitRegistry }) : materialSourceResolver();
  const repository = new D1PlanningRepository(db as unknown as D1Database, { sourceResolver, now, createId: id });
  const materials = new MaterialContextService({ db: db as unknown as D1Database, sourceResolver, planningRepository: repository, now, createId: id });
  const planning = new PlanningService({ repository, materials, sourceResolver, now, createId: id });
  const documents = new D1DocumentRepository(db as unknown as D1Database, now, id);
  const selections = new SelectionService(documents);
  const request = materialContextRequest();
  const { scope: draftScope, selectionRef: originalSelection, ...generation } = request;
  let selectionRef = originalSelection;
  const coach = initialFocus === undefined ? undefined : document("coach", "supplement", [{ id: "focus", kind: "constraint",
    text: "Focus on the browser platform", skillLabels: ["web-platform"], origin: "user", sourceRef: null, requirementLevel: null }]);
  const focusChoices: Choices = coach ? { learningIntents: [{ confirmationId: coach.confirmationId, itemId: "focus" }],
    termMappings: [{ confirmationId: coach.confirmationId, itemId: "focus", skillLabel: "web-platform", skillIds: ["web-platform"] }] } : {};
  if (coach) selectionRef = await selections.createMaterialSelection({ ownerId: "owner-a" }, { scope: draftScope, entries: [primary, coach], mutationId: id() });
  let initialContext: Awaited<ReturnType<typeof materials.create>> | undefined;
  if (adoptInitially) initialContext = await materials.create("owner-a", { ...request, scope: draftScope, selectionRef, ...(initialFocus ? focusChoices : {}) });
  const initial = await planning.generate("owner-a", { ...generation, ...(initialContext ? { materials: { selectionRef,
    contextVersionId: initialContext.contextVersionId, previewToken: initialContext.previewToken } } : {}) });
  const completed = initial.workspace.dailyUnits[0]!;
  const { workspace: before } = await planning.appendEvent("owner-a", { mutationId: id(), baseVersionId: initial.workspace.activePlanVersionId,
    event: { kind: "completed", unitId: completed.id, actualMinutes: completed.estimatedMinutes, planningDate: request.planningDate } });
  const proof = new ProofService({ repository: new D1ProofRepository(db as unknown as D1Database), blueprint,
    registry: flagshipUnitRegistry, now, createId: id });
  const submitted = await proof.create("owner-a", { mutationId: id(), baseRevision: 0, intent: "submit", validatorKey: null,
    dailyUnitId: completed.id, title: "Completed task evidence", kind: "document", summary: "Existing evidence before material replacement.",
    artifactUrl: "https://example.com/completed-task", assetId: null, skillIds: [completed.skillId],
    completionCriteria: completed.completionCriteria, visibility: "private" });
  expect(submitted.outcome).toBe("demonstrated");
  const proofRows = () => Object.fromEntries(["proof_items", "proof_versions", "proof_review_events", "user_skill_projections"].map(table =>
    [table, db.database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  const proofBefore = await proof.getWorkspace("owner-a");
  const proofStorageBefore = proofRows();
  for (const rows of Object.values(proofStorageBefore)) expect(rows.length).toBeGreaterThan(0);
  const links = () => db.database.prepare("SELECT * FROM goal_document_links WHERE owner_id='owner-a' AND goal_id='goal-a' AND purpose='planning' AND enabled=1 ORDER BY slot,document_id").all();
  async function preview(entries: MaterialSelectionEntry[], choices: Choices = {}, overrides: Partial<Pick<ContextInputSnapshot, "audit" | "availability" | "target" | "planningDate" | "selectedScope">> = {}) {
    const workspace = (await planning.getWorkspace("owner-a"))!;
    const scope = scopeFor(workspace);
    const selected = await selections.createMaterialSelection({ ownerId: "owner-a" }, { scope, entries, mutationId: id() });
    const context = await materials.create("owner-a", { ...generation, ...overrides, ...choices, scope, selectionRef: selected, mutationId: id() });
    return { context, input: { scope, selectionRef: selected, contextVersionId: context.contextVersionId, previewToken: context.previewToken, mutationId: id() } };
  }
  function document(name: string, slot: MaterialSelectionEntry["slot"], items: ConfirmedMaterialItem[]): MaterialSelectionEntry {
    const documentId = `doc-${name}`, documentVersionId = `version-${name}`, textVersionId = `text-${name}`, confirmationId = `confirmation-${name}`;
    db.database.prepare("INSERT INTO documents(owner_id,id,kind,display_name,current_document_version_id,created_at,updated_at) VALUES ('owner-a',?,?,?,?,0,0)").run(documentId, slot, name, documentVersionId);
    db.database.prepare("INSERT INTO document_versions(owner_id,document_id,id,text_version_id,state,generation,revision,text_digest,object_key,utf8_bytes,code_points,segments_json,parser_version,created_at) VALUES ('owner-a',?,?,?,'ready',0,0,?,?,3,3,'[]','2026.11.1',0)").run(documentId, documentVersionId, textVersionId, "b".repeat(64), `object-${name}`);
    db.database.prepare("INSERT INTO document_text_versions(owner_id,document_id,document_version_id,id,parser_version,text_hash,object_key,created_at) VALUES ('owner-a',?,?,?,'2026.11.1',?,?,0)").run(documentId, documentVersionId, textVersionId, "b".repeat(64), `object-${name}`);
    db.database.prepare("INSERT INTO document_confirmations(owner_id,document_id,document_version_id,id,text_version_id,review_revision,revision,origin,state,items_json,created_at) VALUES ('owner-a',?,?,?,?,0,0,'manual','active',?,0)").run(documentId, documentVersionId, confirmationId, textVersionId, JSON.stringify(items));
    return { slot, documentId, documentVersionId, confirmationId };
  }
  async function preserved(workspace: PlanningWorkspace, pathId = workspace.activePathVersionId) {
    const candidate = workspace.pathVersions.find(path => path.id === pathId)!;
    expect(candidate.units).toEqual(activePath(before).units); // Full tasks, dependency edges and duration, in exactly the same order.
    expect(workspace.events.filter(event => event.kind === "completed")).toEqual(before.events.filter(event => event.kind === "completed"));
    expect(workspace.dailyUnits).toEqual(expect.arrayContaining(before.dailyUnits));
    expect(workspace.audit).toEqual(before.audit);
    expect(workspace.target).toEqual(before.target);
    expect(workspace.availability).toEqual(before.availability);
    expect(workspace.availabilityVersions).toEqual(before.availabilityVersions);
    expect(activePlan(workspace).days.map(day => [day.date, day.budgetMinutes])).toEqual(activePlan(before).days.map(day => [day.date, day.budgetMinutes]));
    expect(await proof.getWorkspace("owner-a")).toEqual(proofBefore);
    expect(proofRows()).toEqual(proofStorageBefore);
  }
  async function decide(staged: PlanningWorkspace, decision: "accept" | "discard") {
    const input = { baseVersionId: staged.activePlanVersionId, candidatePlanVersionId: staged.pendingPlanVersionId!, mutationId: id() };
    return decision === "accept" ? planning.acceptReplan("owner-a", input) : planning.discardReplan("owner-a", input);
  }
  return { db, materials, planning, documents, selections, request, before, initialContext, coach, focusChoices, links, preview, document, preserved, decide, proofRows, proofStorageBefore,
    advance: (milliseconds: number) => { clock += milliseconds; } };
}

describe("context-only material adoption", () => {
  it.each(["accept", "discard"] as const)("stages first material adoption without task changes and preserves completed Proof on %s", async decision => {
    const f = await setup();
    const oldLinks = f.links();
    const { input } = await f.preview([primary]);
    expect(f.links()).toEqual(oldLinks);
    const proposal = await f.planning.proposeMaterialReplanResponse("owner-a", input);
    expect(proposal.outcome).toBe("proposed");
    if (proposal.outcome !== "proposed") throw new Error("First adoption needs explicit acceptance even when every task is unchanged");
    const staged = proposal.planning.result.workspace;
    expect(proposal.planning.result.diff!.items.every(item => item.change === "unchanged")).toBe(true);
    expect(proposal.planning.result.diff!.nextEstimatedCompletionDate).toBe(proposal.planning.result.diff!.previousEstimatedCompletionDate);
    expect(staged.activePlanVersionId).toBe(f.before.activePlanVersionId);
    expect(f.links()).toEqual(oldLinks);
    await f.preserved(staged, staged.planVersions.find(plan => plan.id === staged.pendingPlanVersionId)!.pathVersionId);
    const { workspace: after } = await f.decide(staged, decision);
    expect(after.pendingPlanVersionId).toBeNull();
    expect(after.activePlanVersionId).toBe(decision === "accept" ? staged.pendingPlanVersionId : f.before.activePlanVersionId);
    expect(f.links()).toEqual(decision === "accept" ? [expect.objectContaining({ document_id: primary.documentId, context_version_id: input.contextVersionId })] : oldLinks);
    await f.preserved(after);
  });

  it.each(["accept", "discard"] as const)("replaces a company JD with identical confirmed text only on %s", async decision => {
    const f = await setup(true);
    const original = f.db.database.prepare("SELECT items_json FROM document_confirmations WHERE id='confirmation-a'").get() as { items_json: string };
    const replacement = f.document("company-b", "jd", JSON.parse(original.items_json));
    const oldLinks = f.links();
    const { input } = await f.preview([replacement]);
    expect(f.links()).toEqual(oldLinks);
    const proposal = await f.planning.proposeMaterialReplanResponse("owner-a", input);
    expect(proposal.outcome).toBe("proposed");
    if (proposal.outcome !== "proposed") throw new Error("Replacing the primary JD must be reviewable");
    const staged = proposal.planning.result.workspace;
    expect(proposal.planning.result.diff!.items.every(item => item.change === "unchanged")).toBe(true);
    expect(proposal.planning.result.diff!.nextEstimatedCompletionDate).toBe(proposal.planning.result.diff!.previousEstimatedCompletionDate);
    expect(f.links()).toEqual(oldLinks);
    await f.preserved(staged, staged.planVersions.find(plan => plan.id === staged.pendingPlanVersionId)!.pathVersionId);
    const { workspace: after } = await f.decide(staged, decision);
    expect(f.links()).toEqual(decision === "accept" ? [expect.objectContaining({ document_id: replacement.documentId, context_version_id: input.contextVersionId })] : oldLinks);
    await f.preserved(after);
  });

  it("adopts a SQL-to-React company JD replacement despite a prerequisite-constrained unchanged schedule", async () => {
    const f = await setup(true, undefined, true);
    const react = f.document("react-company", "jd", [{ id: "react-must", kind: "requirement", text: "React", requirementLevel: "must", origin: "user", sourceRef: null }]);
    expect(f.initialContext!.preview.overlay!.mandatorySkillIds).toEqual(["sql"]);
    const original = activePath(f.before);
    const sqlIds = new Set(original.units.filter(unit => unit.skillId === "sql").map(unit => unit.id));
    expect(original.units.find(unit => unit.skillId === "react")!.prerequisiteUnitIds.some(id => sqlIds.has(id))).toBe(true);
    const links = f.links();
    const { context, input } = await f.preview([react]);
    expect(context.preview.overlay!.mandatorySkillIds).toEqual(["react"]);
    expect(f.links()).toEqual(links);
    const proposal = await f.planning.proposeMaterialReplanResponse("owner-a", input);
    expect(proposal.outcome).toBe("proposed");
    if (proposal.outcome !== "proposed") throw new Error("The new JD requires explicit adoption despite prerequisite constraints");
    expect(proposal.planning.result.diff!.items.every(item => item.change === "unchanged")).toBe(true);
    expect(proposal.planning.result.diff!.nextEstimatedCompletionDate).toBe(proposal.planning.result.diff!.previousEstimatedCompletionDate);
    const staged = proposal.planning.result.workspace;
    await f.preserved(staged, staged.planVersions.find(plan => plan.id === staged.pendingPlanVersionId)!.pathVersionId);
    expect(f.links()).toEqual(links);
    const { workspace } = await f.decide(staged, "accept");
    expect(f.links()).toEqual([expect.objectContaining({ document_id: react.documentId, context_version_id: input.contextVersionId })]);
    await f.preserved(workspace);
  });

  it.each([false, true])("requires acceptance to change initially adopted focus=%s without task movement", async initialFocus => {
    const f = await setup(true, initialFocus);
    const adoption = !initialFocus;
    for (const decision of ["discard", "accept"] as const) {
      const oldLinks = f.links();
      const { input } = await f.preview([primary, f.coach!], adoption ? f.focusChoices : {});
      expect(f.links()).toEqual(oldLinks);
      const proposal = await f.planning.proposeMaterialReplanResponse("owner-a", input);
      expect(proposal.outcome).toBe("proposed");
      if (proposal.outcome !== "proposed") throw new Error("Source and learning-intent adoption are reviewable independently of task movement");
      expect(proposal.planning.result.diff!.items.every(item => item.change === "unchanged")).toBe(true);
      expect(proposal.planning.result.diff!.nextEstimatedCompletionDate).toBe(proposal.planning.result.diff!.previousEstimatedCompletionDate);
      expect(f.links()).toEqual(oldLinks);
      const staged = proposal.planning.result.workspace;
      await f.preserved(staged, staged.planVersions.find(plan => plan.id === staged.pendingPlanVersionId)!.pathVersionId);
      const { workspace } = await f.decide(staged, decision);
      expect(f.links()).toHaveLength(2);
      expect(f.links()).toEqual(decision === "accept" ? expect.arrayContaining([expect.objectContaining({ context_version_id: input.contextVersionId })]) : oldLinks);
      const currentContext = decision === "accept" ? input.contextVersionId : f.initialContext!.contextVersionId;
      const saved = f.db.database.prepare("SELECT snapshot_json FROM material_context_versions WHERE id=?").get(currentContext) as { snapshot_json: string };
      expect(JSON.parse(saved.snapshot_json).learningIntents ?? []).toEqual((decision === "accept" ? adoption : initialFocus) ? f.focusChoices.learningIntents : []);
      await f.preserved(workspace);
    }
  });

  it("returns genuine no-change for fresh selections with the same adoption, retaining its receipt and unapplied assessment", async () => {
    const f = await setup(true);
    const oldLinks = f.links();
    const nextAudit = { ...f.before.audit, id: "other-audit", answers: f.before.audit.answers.map(answer => ({ ...answer, level: "uncertain" as const })) };
    const { input } = await f.preview([primary], { skillMappings: [], termMappings: [], learningIntents: [] }, { audit: nextAudit });
    const noChange = await f.planning.proposeMaterialReplanResponse("owner-a", input);
    expect(noChange).toMatchObject({ outcome: "no-change", unappliedChanges: [expect.any(String)] });
    expect(await f.planning.proposeMaterialReplanResponse("owner-a", input)).toEqual(noChange);
    expect(f.links()).toEqual(oldLinks);
    expect(await f.planning.getWorkspace("owner-a")).toEqual(f.before);
    const other = await f.materials.create("owner-a", { ...f.request, scope: input.scope, selectionRef: input.selectionRef, mutationId: "other-preview" });
    await expect(f.planning.proposeMaterialReplanResponse("owner-a", { ...input, contextVersionId: other.contextVersionId, previewToken: other.previewToken })).rejects.toMatchObject({ code: "CONFLICT" });
    await f.preserved(f.before);
  });

  it.each(["audit", "target"] as const)("retains unapplied %s warnings when replaying a context-only proposal and accepting it", async change => {
    const f = await setup(true);
    const replacement = f.document("unapplied-company", "jd", [{ id: "same-requirement", kind: "requirement", text: "SQL",
      requirementLevel: "unspecified", origin: "user", sourceRef: null }]);
    const overrides = change === "audit"
      ? { audit: { ...f.before.audit, id: "unapplied-audit", answers: f.before.audit.answers.map(answer => ({ ...answer, level: "uncertain" as const })) } }
      : { target: { ...f.before.target, id: "unapplied-target", targetWeeks: 26, inputFingerprint: "unapplied-target-fingerprint" } };
    const { input } = await f.preview([replacement], {}, overrides);
    const proposal = await f.planning.proposeMaterialReplanResponse("owner-a", input);
    expect(proposal.outcome).toBe("proposed");
    if (proposal.outcome !== "proposed") throw new Error("Changed material adoption requires a proposal");
    expect(proposal.unappliedChanges).toEqual([expect.any(String)]);
    expect(proposal.planning.result.diff!.items.every(item => item.change === "unchanged")).toBe(true);
    expect(proposal.planning.result.diff!.nextEstimatedCompletionDate).toBe(proposal.planning.result.diff!.previousEstimatedCompletionDate);
    expect(await f.planning.proposeMaterialReplanResponse("owner-a", input)).toEqual(proposal);
    const staged = proposal.planning.result.workspace;
    await f.preserved(staged, staged.planVersions.find(plan => plan.id === staged.pendingPlanVersionId)!.pathVersionId);
    const { workspace } = await f.decide(staged, "accept");
    await f.preserved(workspace); // Acceptance retains the actual audit, target, completed tasks and all Proof ledger rows.
    expect(await f.planning.proposeMaterialReplanResponse("owner-a", input)).toEqual(proposal);
  });

  it("compares only still-enabled dependencies and choices after an explicit detach", async () => {
    const f = await setup(true, true);
    await detachAdoptedMaterial(f.documents, f.planning, "owner-a", { scope: scopeFor(f.before), entry: f.coach!, mutationId: "detach-coach" });
    const detached = (await f.planning.getWorkspace("owner-a"))!;
    const oldLinks = f.links();
    const { input } = await f.preview([primary]);
    expect(await f.planning.proposeMaterialReplanResponse("owner-a", input)).toMatchObject({ outcome: "no-change" });
    expect(f.links()).toEqual(oldLinks);
    expect(await f.planning.getWorkspace("owner-a")).toEqual(detached);
    await f.preserved(detached);
  });

  it("treats no adopted sources and no candidate sources as genuine no-change", async () => {
    const f = await setup();
    const { input } = await f.preview([]);
    expect(await f.planning.proposeMaterialReplanResponse("owner-a", input)).toMatchObject({ outcome: "no-change" });
    expect(await f.planning.getWorkspace("owner-a")).toEqual(f.before);
    expect(f.links()).toEqual([]);
  });

  it.each(["confirmation", "document-version"] as const)("requires adoption of a new %s even when its confirmed text is identical", async replacement => {
    const f = await setup(true);
    let documentVersionId = primary.documentVersionId, textVersionId = "text-a";
    if (replacement === "document-version") {
      documentVersionId = "version-next"; textVersionId = "text-next";
      f.db.database.exec(`INSERT INTO document_versions(owner_id,document_id,id,text_version_id,state,generation,revision,text_digest,object_key,utf8_bytes,code_points,segments_json,parser_version,created_at)
        SELECT owner_id,document_id,'version-next','text-next',state,generation,revision+1,text_digest,'object-next',utf8_bytes,code_points,segments_json,parser_version,created_at FROM document_versions WHERE id='version-a';
        INSERT INTO document_text_versions(owner_id,document_id,document_version_id,id,parser_version,text_hash,object_key,created_at)
        SELECT owner_id,document_id,'version-next','text-next',parser_version,text_hash,'object-next',created_at FROM document_text_versions WHERE id='text-a';
        UPDATE documents SET current_document_version_id='version-next',revision=revision+1 WHERE id='doc-a'`);
    }
    f.db.database.prepare(`INSERT INTO document_confirmations(owner_id,document_id,document_version_id,id,text_version_id,review_revision,revision,origin,state,items_json,created_at)
      SELECT owner_id,document_id,?,'confirmation-next',?,review_revision+1,revision+1,origin,state,items_json,created_at FROM document_confirmations WHERE id='confirmation-a'`).run(documentVersionId, textVersionId);
    const oldLinks = f.links();
    const { input } = await f.preview([{ ...primary, documentVersionId, confirmationId: "confirmation-next" }]);
    const proposal = await f.planning.proposeMaterialReplanResponse("owner-a", input);
    expect(proposal.outcome).toBe("proposed");
    if (proposal.outcome !== "proposed") throw new Error("Exact confirmation and text dependencies must be adopted");
    expect(proposal.planning.result.diff!.items.every(item => item.change === "unchanged")).toBe(true);
    expect(proposal.planning.result.diff!.nextEstimatedCompletionDate).toBe(proposal.planning.result.diff!.previousEstimatedCompletionDate);
    expect(f.links()).toEqual(oldLinks);
    const { workspace } = await f.decide(proposal.planning.result.workspace, "accept");
    expect(f.links()).toEqual([expect.objectContaining({ document_version_id: documentVersionId, confirmation_id: "confirmation-next" })]);
    await f.preserved(workspace);
  });

  it("normalizes dependency, skill mapping, term skill, and intent order across fresh previews", async () => {
    const f = await setup(true);
    const terms = f.document("terms", "supplement", [{ id: "terms", kind: "constraint", text: "Practice foundational skills",
      skillLabels: ["Web Platform", "TypeScript"], origin: "user", sourceRef: null, requirementLevel: null }]);
    const legacy = f.document("legacy", "supplement", [{ id: "legacy", kind: "constraint", text: "Practice the same foundations",
      origin: "user", sourceRef: null, requirementLevel: null }]);
    const choices: Choices = {
      learningIntents: [{ confirmationId: terms.confirmationId, itemId: "terms" }, { confirmationId: legacy.confirmationId, itemId: "legacy" }],
      termMappings: ["Web Platform", "TypeScript"].map(skillLabel => ({ confirmationId: terms.confirmationId, itemId: "terms", skillLabel, skillIds: ["web-platform", "typescript"] })),
      skillMappings: ["web-platform", "typescript"].map(skillId => ({ confirmationId: legacy.confirmationId, itemId: "legacy", skillId })),
    };
    const baseline = await f.preview([primary, terms, legacy], choices);
    const proposal = await f.planning.proposeMaterialReplanResponse("owner-a", baseline.input);
    if (proposal.outcome !== "proposed") throw new Error("Expected initial source adoption");
    const { workspace } = await f.decide(proposal.planning.result.workspace, "accept");
    const links = f.links();
    const reordered = await f.preview([legacy, terms, primary], {
      learningIntents: choices.learningIntents!.toReversed(), skillMappings: choices.skillMappings!.toReversed(),
      termMappings: choices.termMappings!.toReversed().map(item => ({ ...item, skillIds: item.skillIds.toReversed() })),
    });
    expect(await f.planning.proposeMaterialReplanResponse("owner-a", reordered.input)).toMatchObject({ outcome: "no-change" });
    expect(await f.planning.getWorkspace("owner-a")).toEqual(workspace);
    expect(f.links()).toEqual(links);
  });

  it.each(["missing-usage", "proposal-only", "revoked", "malformed", "different-source-version", "different-policy", "missing-source-versions"] as const)("does not trust an unprovable current adoption: %s", async invalidation => {
    const f = await setup(true);
    const { input } = await f.preview([primary]);
    if (invalidation === "missing-usage") f.db.database.exec("DELETE FROM document_usage_links");
    else if (invalidation === "proposal-only") f.db.database.exec("UPDATE document_usage_links SET kind='proposal'");
    else if (invalidation === "revoked") f.db.database.prepare("UPDATE material_context_versions SET state='revoked',snapshot_json='{}' WHERE id=?").run(f.initialContext!.contextVersionId);
    else if (invalidation === "malformed") f.db.database.prepare("UPDATE material_context_versions SET snapshot_json='{}' WHERE id=?").run(f.initialContext!.contextVersionId);
    else {
      const row = f.db.database.prepare("SELECT snapshot_json FROM material_context_versions WHERE id=?").get(f.initialContext!.contextVersionId) as { snapshot_json: string };
      const snapshot: ContextInputSnapshot = JSON.parse(row.snapshot_json);
      if (invalidation === "different-policy") snapshot.policyVersion = "2026.10.1";
      else if (invalidation === "missing-source-versions") delete snapshot.sourceVersions;
      else snapshot.sourceVersions!.registryVersion = "2026.10.1";
      // This remains an internally valid historical snapshot; it differs semantically,
      // not merely through a stale fingerprint caused by the test setup.
      f.db.database.prepare("UPDATE material_context_versions SET snapshot_json=?,fingerprint=? WHERE id=?")
        .run(canonicalJson(snapshot), await createMaterialContextFingerprint(snapshot), f.initialContext!.contextVersionId);
    }
    const beforeLinks = f.links();
    expect(await f.planning.proposeMaterialReplanResponse("owner-a", input)).toMatchObject({ outcome: "proposed" });
    expect(f.links()).toEqual(beforeLinks);
  });

  it("rechecks the enabled link set in the final no-change transaction", async () => {
    const f = await setup(true);
    const { input } = await f.preview([primary]);
    const batch = f.db.batch.bind(f.db);
    f.db.batch = async statements => {
      // Simulates a link update after the semantic read without relying on workspace revision changes.
      f.db.database.exec("UPDATE goal_document_links SET enabled=0");
      return batch(statements);
    };
    await expect(f.planning.proposeMaterialReplanResponse("owner-a", input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.db.database.prepare("SELECT count(*) AS n FROM document_mutations WHERE endpoint='POST /api/planning/material-replans'").get()).toEqual({ n: 0 });
    expect(await f.planning.getWorkspace("owner-a")).toEqual(f.before);
  });

  it.each(["completion", "detach", "delete"] as const)("retains the final no-change fences during concurrent %s", async race => {
    const f = await setup(true);
    const { input } = await f.preview([primary]);
    const batch = f.db.batch.bind(f.db);
    let concurrent: PlanningWorkspace | null = null;
    f.db.batch = async statements => {
      f.db.batch = batch;
      if (race === "completion") {
        const completed = new Set(f.before.events.flatMap(event => event.kind === "completed" ? [event.unitId] : []));
        const next = f.before.dailyUnits.find(unit => !completed.has(unit.id))!;
        await f.planning.appendEvent("owner-a", { mutationId: "concurrent-completion", baseVersionId: f.before.activePlanVersionId,
          event: { kind: "completed", unitId: next.id, actualMinutes: next.estimatedMinutes, planningDate: f.request.planningDate } });
      } else if (race === "detach") {
        await detachAdoptedMaterial(f.documents, f.planning, "owner-a", { scope: scopeFor(f.before), entry: primary, mutationId: "concurrent-detach" });
      } else {
        const deletion = new DeletionService(f.documents, new DocumentStorage(memoryBucket()));
        await deletion.deleteDocument({ ownerId: "owner-a" }, { documentId: primary.documentId, expectedRevision: 0, mutationId: "concurrent-delete" });
      }
      concurrent = await f.planning.getWorkspace("owner-a");
      return batch(statements);
    };
    await expect(f.planning.proposeMaterialReplanResponse("owner-a", input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await f.planning.getWorkspace("owner-a")).toEqual(concurrent);
    expect(f.db.database.prepare("SELECT count(*) AS n FROM document_mutations WHERE endpoint='POST /api/planning/material-replans'").get()).toEqual({ n: 0 });
    expect(f.proofRows()).toEqual(f.proofStorageBefore);
  });
});
