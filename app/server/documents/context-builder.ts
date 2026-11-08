import { explainMaterialPreview, MATERIAL_EXPLANATION_VERSION } from "../../lib/materials/explanations";
import { materialHistoryResponseSchema, type MaterialHistoryResponse } from "../../contracts/material-planning";
import { z } from "zod";
import { DOCUMENT_SCHEMA_VERSION, confirmedMaterialItemsSchema, materialIdSchema, type ConfirmedMaterialItem } from "../../contracts/documents";
import { contextInputSnapshotSchema, createMaterialContextFingerprint, createMaterialContextRequestSchema, createMaterialContextResponseSchema, materialContextPreviewSchema, materialReplanRequestSchema, materialSha256, readMaterialContextResponseSchema, type ContextInputSnapshot, type MaterialPlanningReference } from "../../contracts/material-planning";
import type { GeneratePlanningRequest } from "../../contracts/planning-api";
import { planningWorkspaceSchema, type PlanningSourceContext } from "../../contracts/planning";
import { canonicalJson, deterministicId } from "../../lib/planning/fingerprint";
import { buildLearningPaths } from "../../lib/planning/path-builder";
import { createMaterialOverlay, MATERIAL_PLANNING_POLICY_VERSION } from "../../lib/materials/planning-priority";
import { mapMaterialItems, mapMaterialItemTerms, MATERIAL_MAPPING_VERSION, type MappingOptions } from "../../lib/materials/skill-mapper";
import { validateUnitRegistry } from "../../lib/planning/registry-validation";
import { PlanningConflictError, PlanningInvalidInputError, PlanningNotFoundError } from "../planning/service";
import type { PlanningSourceResolver } from "../planning/source-resolver";
import type { PlanningRepository } from "../planning/repository";
import { materialGuardStatement, type MaterialPlanCommit } from "../planning/material-commit";
import { materialGenerationReceiptRequestSchema, materialGenerationReceiptResponseSchema } from "../../contracts/material-recovery";
import { adoptedContextGuardStatement, compareAdoptedContext, type AdoptedContextMatch } from "./adopted-context";

export const MATERIAL_PREVIEW_TTL_MS = 30 * 60_000;
export type MaterialPreview = z.infer<typeof materialContextPreviewSchema>;
type ContextRow = { id: string; snapshot_json: string; preview_json: string; fingerprint: string; preview_token: string; state: string; expires_at: number };
type SelectedRow = { slot: "resume" | "jd" | "supplement"; document_id: string; document_version_id: string; confirmation_id: string; text_version_id: string; generation: number; items_json: string; lifecycle: string; version_state: string; confirmation_state: string };
export type MaterialContextServiceOptions = {
  db: D1Database; sourceResolver: Pick<PlanningSourceResolver, "resolveForGenerate" | "resolveForGenerationCommit" | "resolveForReplay">;
  planningRepository?: PlanningRepository; now?: () => Date; createId?: () => string;
};

export class MaterialContextService {
  private readonly now: () => Date;
  private readonly createId: () => string;
  constructor(private readonly options: MaterialContextServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => `material-context-${crypto.randomUUID()}`);
  }

  async create(ownerId: string, input: unknown): Promise<z.infer<typeof createMaterialContextResponseSchema>> {
    const request = parse(createMaterialContextRequestSchema, input);
    const digest = await materialSha256(request);
    const prior = await this.receipt(ownerId, "POST /api/planning/material-contexts", request.mutationId);
    if (prior) {
      if (prior.body_digest !== digest) throw new PlanningConflictError();
      const id = JSON.parse(prior.result_json).contextVersionId as string;
      const loaded = await this.loadValid(ownerId, id);
      return createMaterialContextResponseSchema.parse({ contextVersionId: id, previewToken: loaded.commit.previewToken, preview: loaded.preview });
    }
    const selection = await this.options.db.prepare("SELECT scope_json,revision,state FROM material_selections WHERE owner_id=?1 AND id=?2").bind(ownerId, request.selectionRef.selectionId).first<{ scope_json: string; revision: number; state: string }>();
    if (!selection) throw new PlanningNotFoundError();
    if (selection.state !== "active" || selection.revision !== request.selectionRef.selectionRevision || canonicalJson(JSON.parse(selection.scope_json)) !== canonicalJson(request.scope)) throw new PlanningConflictError();
    await this.assertScope(ownerId, request.scope);
    const source = await this.options.sourceResolver.resolveForGenerate(ownerId, request.source);
    const selected = await this.selected(ownerId, request.selectionRef.selectionId);
    if (selected.some(row => row.lifecycle !== "active" || row.version_state !== "ready" || row.confirmation_state !== "active")) throw new PlanningConflictError();
    const choices = this.validateChoices(request, selected, source);
    const dependencies = await Promise.all(selected.map(async row => ({ slot: row.slot, documentId: row.document_id, documentVersionId: row.document_version_id, textVersionId: row.text_version_id, confirmationId: row.confirmation_id, generation: row.generation, confirmationDigest: await materialSha256(JSON.parse(row.items_json)) })));
    const snapshot = contextInputSnapshotSchema.parse({ schemaVersion: DOCUMENT_SCHEMA_VERSION, ownerId, selectionRef: request.selectionRef, scope: request.scope, sourceReference: source.reference, sourceVersions: await sourceVersions(source), dependencies, ...choices, audit: request.audit, availability: request.availability, target: request.target, planningDate: request.planningDate, selectedScope: request.selectedScope, policyVersion: MATERIAL_PLANNING_POLICY_VERSION, mappingVersion: MATERIAL_MAPPING_VERSION, explanationVersion: MATERIAL_EXPLANATION_VERSION });
    const fingerprint = await createMaterialContextFingerprint(snapshot);
    const preview = this.project(snapshot, selected, source, fingerprint);
    const contextVersionId = this.createId();
    const expiresAt = this.now().getTime() + MATERIAL_PREVIEW_TTL_MS;
    const previewToken = await materialSha256({ ownerId, contextVersionId, fingerprint, expiresAt, nonce: crypto.randomUUID() });
    const response = createMaterialContextResponseSchema.parse({ contextVersionId, previewToken, preview });
    const commit: MaterialPlanCommit = { contextVersionId, fingerprint, previewToken, requestDigest: digest, snapshot, checkedAt: this.now().getTime(), confirmations: selected.map(row => ({ documentId: row.document_id, itemsJson: row.items_json })), kind: request.scope.kind === "draft" ? "generation" : "proposal" };
    const statements = [materialGuardStatement(this.options.db, ownerId, commit, { requireContext: false }), this.options.db.prepare(`INSERT INTO material_context_versions(owner_id,id,snapshot_json,preview_json,fingerprint,preview_token,expires_at,state,selection_id,selection_revision,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'active',?8,?9,?10)`).bind(ownerId, contextVersionId, canonicalJson(snapshot), JSON.stringify(preview), fingerprint, previewToken, expiresAt, request.selectionRef.selectionId, request.selectionRef.selectionRevision, commit.checkedAt)];
    for (const dependency of dependencies) statements.push(this.options.db.prepare(`INSERT INTO material_context_dependencies(owner_id,context_version_id,document_id,document_version_id,text_version_id,confirmation_id,generation,confirmation_digest,slot) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`).bind(ownerId, contextVersionId, dependency.documentId, dependency.documentVersionId, dependency.textVersionId, dependency.confirmationId, dependency.generation, dependency.confirmationDigest, dependency.slot));
    statements.push(this.options.db.prepare("INSERT INTO document_mutations(owner_id,endpoint,mutation_id,body_digest,result_json,created_at) VALUES (?1,'POST /api/planning/material-contexts',?2,?3,?4,?5)").bind(ownerId, request.mutationId, digest, JSON.stringify({ contextVersionId }), commit.checkedAt));
    try { await this.options.db.batch(statements); }
    catch {
      const winner = await this.receipt(ownerId, "POST /api/planning/material-contexts", request.mutationId);
      if (winner && winner.body_digest === digest) return this.create(ownerId, request);
      throw new PlanningConflictError();
    }
    return response;
  }

  async read(ownerId: string, contextVersionId: string) {
    const loaded = await this.loadValid(ownerId, parse(materialIdSchema, contextVersionId));
    return readMaterialContextResponseSchema.parse({ contextVersionId, state: "active", expiresAt: new Date(loaded.row.expires_at).toISOString(), preview: loaded.preview });
  }

  async generationReceipt(ownerId: string, input: unknown) {
    const request = parse(materialGenerationReceiptRequestSchema, input);
    const row = await this.options.db.prepare("SELECT c.state,c.expires_at,c.snapshot_json,g.active_slot,EXISTS(SELECT 1 FROM planning_workspaces w WHERE w.user_id=g.user_id AND w.goal_id=g.id) AS has_workspace FROM material_context_versions c JOIN career_goals g ON g.user_id=c.owner_id AND g.id=?3 WHERE c.owner_id=?1 AND c.id=?2").bind(ownerId, request.contextVersionId, request.goalId).first<{ state: string; expires_at: number; snapshot_json: string; active_slot: number | null; has_workspace: number }>();
    if (!row) throw new PlanningNotFoundError();
    const prior = await this.receipt(ownerId, "POST /api/planning/generate", request.mutationId);
    const previewExpired = row.expires_at <= this.now().getTime();
    if (prior) {
      const result = JSON.parse(prior.result_json) as { contextVersionId?: string; goalId?: string };
      if (result.contextVersionId !== request.contextVersionId || result.goalId !== request.goalId) throw new PlanningConflictError();
      return materialGenerationReceiptResponseSchema.parse({ state: "committed", previewExpired });
    }
    if (row.active_slot !== 1 || row.has_workspace || row.state !== "active") throw new PlanningConflictError();
    const snapshot = contextInputSnapshotSchema.parse(JSON.parse(row.snapshot_json));
    if (snapshot.scope.kind !== "draft" || snapshot.scope.previousGoalId !== null) throw new PlanningConflictError();
    // This is a first-creation recovery observation, never an authorization to
    // skip the new context/generation transaction's own lifecycle and goal guards.
    await this.loadValid(ownerId, request.contextVersionId, { ignoreExpiry: true });
    return materialGenerationReceiptResponseSchema.parse({ state: "uncommitted", previewExpired });
  }

  async history(ownerId: string, goalId: string, includeProposalState?: "current"): Promise<MaterialHistoryResponse> {
    const owned = await this.options.db.prepare("SELECT id FROM career_goals WHERE user_id=?1 AND id=?2").bind(ownerId, parse(materialIdSchema, goalId)).first();
    if (!owned) throw new PlanningNotFoundError();
    // Acceptance appends a usage link for the same immutable pair. Resolve its state before filtering or limiting the history.
    const rows = await this.options.db.prepare(`
      WITH used AS (
        SELECT workspace_id, context_version_id, plan_version_id, MAX(created_at) AS last_used,
          CASE WHEN MAX(kind='accepted') THEN 'accepted' WHEN MAX(kind='generation') THEN 'generation' ELSE 'proposal' END AS kind
        FROM document_usage_links WHERE owner_id=?1 AND goal_id=?2 GROUP BY workspace_id, context_version_id, plan_version_id
      ), history AS (
        SELECT u.*, CASE WHEN p.state IN ('revoked','discarded') THEN p.state
          WHEN p.state='pending' AND w.pending_plan_version_id=u.plan_version_id AND w.active_plan_version_id=p.active_base_plan_id
               AND w.revision=p.proposal_revision THEN 'pending' ELSE 'unknown' END AS proposal_state
        FROM used u LEFT JOIN material_plan_proposals p ON p.owner_id=?1 AND p.goal_id=?2 AND p.workspace_id=u.workspace_id
          AND p.candidate_plan_version_id=u.plan_version_id AND p.context_version_id=u.context_version_id
        LEFT JOIN planning_workspaces w ON w.user_id=?1 AND w.goal_id=?2 AND w.id=u.workspace_id
      )
      SELECT context_version_id,plan_version_id,kind,proposal_state FROM history
      WHERE ?3=1 OR kind!='proposal' OR proposal_state='pending'
      ORDER BY last_used DESC,plan_version_id,context_version_id LIMIT 200
    `).bind(ownerId, goalId, includeProposalState === "current" ? 1 : 0).all<{ context_version_id: string; plan_version_id: string;
      kind: "generation" | "proposal" | "accepted"; proposal_state: NonNullable<MaterialHistoryResponse["plans"][number]["proposalState"]> }>();
    const plans: MaterialHistoryResponse["plans"] = [];
    for (const row of rows.results) {
      let preview: MaterialPreview | null = null;
      if (row.proposal_state !== "revoked") {
        try { preview = (await this.loadValid(ownerId, row.context_version_id, { ignoreExpiry: true, ignoreSelection: true })).preview; } catch { /* Redact revoked or missing private evidence without changing history. */ }
      }
      plans.push({ planVersionId: row.plan_version_id, contextVersionId: row.context_version_id, kind: row.kind,
        ...(includeProposalState && row.kind === "proposal" ? { proposalState: row.proposal_state } : {}),
        sourceAvailability: preview ? "available" : "unavailable", explanations: explainMaterialPreview(preview, Boolean(preview)) });
    }
    return materialHistoryResponseSchema.parse({ plans });
  }

  async verifyGeneration(ownerId: string, request: GeneratePlanningRequest) {
    if (!request.materials) throw new PlanningInvalidInputError();
    const requestDigest = await materialSha256(request);
    const prior = await this.receipt(ownerId, "POST /api/planning/generate", request.mutationId);
    if (prior && prior.body_digest !== requestDigest) throw new PlanningConflictError();
    const loaded = await this.verifyReference(ownerId, request.materials, Boolean(prior));
    const snapshot = loaded.commit.snapshot;
    const requestedSource = "source" in request ? request.source : { source: "flagship" as const, roleId: request.roleId };
    const source = prior ? loaded.source : await this.options.sourceResolver.resolveForGenerate(ownerId, requestedSource);
    if (requestedSource.source !== snapshot.sourceReference.source || (requestedSource.source === "research" && snapshot.sourceReference.source === "research" && requestedSource.researchRunId !== snapshot.sourceReference.researchRunId)) throw new PlanningConflictError();
    if (snapshot.scope.kind !== "draft") throw new PlanningConflictError();
    const previousGoalId = "newGoal" in request ? request.newGoal?.previousGoalId ?? null : null;
    if (snapshot.scope.previousGoalId !== previousGoalId) throw new PlanningConflictError();
    const compared = { ...snapshot, audit: request.audit, availability: request.availability, target: request.target, planningDate: request.planningDate, selectedScope: request.selectedScope, sourceReference: source.reference, sourceVersions: await sourceVersions(source) };
    if (await createMaterialContextFingerprint(compared) !== loaded.commit.fingerprint) throw new PlanningConflictError();
    return { sourceContext: source, overlay: loaded.preview.overlay!, commit: { ...loaded.commit, requestDigest, kind: "generation" as const } };
  }

  async verifyProposalRequest(ownerId: string, input: z.infer<typeof materialReplanRequestSchema>) {
    const digest = await materialSha256(input);
    const prior = await this.receipt(ownerId, "POST /api/planning/material-replans", input.mutationId);
    if (prior && prior.body_digest !== digest) throw new PlanningConflictError();
    const verified = await this.verifyReference(ownerId, input, Boolean(prior));
    const result = prior ? JSON.parse(prior.result_json) as { outcome?: string; unapplied?: boolean } : null;
    return { ...verified, noChange: result?.outcome === "no-change", unapplied: result?.unapplied === true };
  }

  compareAdoptedContext(ownerId: string, commit: MaterialPlanCommit) {
    return compareAdoptedContext(this.options.db, ownerId, commit);
  }

  async recordNoChange(ownerId: string, request: z.infer<typeof materialReplanRequestSchema>, commit: MaterialPlanCommit, unapplied: boolean, adopted: AdoptedContextMatch): Promise<void> {
    const digest = await materialSha256(request);
    const { scope } = request;
    try {
      await this.options.db.batch([
        materialGuardStatement(this.options.db, ownerId, { ...commit, checkedAt: this.now().getTime() }),
        adoptedContextGuardStatement(this.options.db, ownerId, commit, adopted),
        this.options.db.prepare("SELECT json(CASE WHEN EXISTS(SELECT 1 FROM planning_workspaces w JOIN career_goals g ON g.id=w.goal_id AND g.user_id=w.user_id WHERE w.user_id=?1 AND w.goal_id=?2 AND w.id=?3 AND w.revision=?4 AND w.active_plan_version_id=?5 AND w.pending_plan_version_id IS NULL AND g.active_slot=1) THEN '{}' ELSE '' END)").bind(ownerId, scope.goalId, scope.workspaceId, scope.revision, scope.baseVersionId),
        this.options.db.prepare("INSERT INTO document_mutations(owner_id,endpoint,mutation_id,body_digest,result_json,created_at) VALUES (?1,'POST /api/planning/material-replans',?2,?3,?4,?5)").bind(ownerId, request.mutationId, digest, JSON.stringify({ outcome: "no-change", contextVersionId: commit.contextVersionId, goalId: scope.goalId, workspaceId: scope.workspaceId, unapplied }), this.now().getTime()),
      ]);
    } catch {
      const winner = await this.receipt(ownerId, "POST /api/planning/material-replans", request.mutationId);
      if (!winner || winner.body_digest !== digest || JSON.parse(winner.result_json).outcome !== "no-change") throw new PlanningConflictError();
    }
  }

  async verifyReference(ownerId: string, reference: MaterialPlanningReference, ignoreExpiry = false) {
    const loaded = await this.loadValid(ownerId, reference.contextVersionId, { ignoreExpiry });
    if (reference.previewToken !== loaded.commit.previewToken || canonicalJson(reference.selectionRef) !== canonicalJson(loaded.commit.snapshot.selectionRef)) throw new PlanningConflictError();
    const source = ignoreExpiry ? await this.options.sourceResolver.resolveForReplay(ownerId, loaded.commit.snapshot.sourceReference) : await this.options.sourceResolver.resolveForGenerationCommit(ownerId, loaded.commit.snapshot.sourceReference);
    if (canonicalJson(await sourceVersions(source)) !== canonicalJson(loaded.commit.snapshot.sourceVersions)) throw new PlanningConflictError();
    return { ...loaded, source };
  }

  private async loadValid(ownerId: string, id: string, options: { ignoreExpiry?: boolean; ignoreSelection?: boolean } = {}) {
    const row = await this.options.db.prepare("SELECT * FROM material_context_versions WHERE owner_id=?1 AND id=?2").bind(ownerId, id).first<ContextRow>();
    if (!row) throw new PlanningNotFoundError();
    if (row.state !== "active" || (!options.ignoreExpiry && row.expires_at <= this.now().getTime())) throw new PlanningConflictError();
    const snapshot = contextInputSnapshotSchema.parse(JSON.parse(row.snapshot_json));
    if (snapshot.ownerId !== ownerId || await createMaterialContextFingerprint(snapshot) !== row.fingerprint) throw new PlanningConflictError();
    const confirmations: MaterialPlanCommit["confirmations"][number][] = [];
    for (const dependency of snapshot.dependencies) {
      const confirmation = await this.options.db.prepare("SELECT items_json FROM document_confirmations WHERE owner_id=?1 AND document_id=?2 AND document_version_id=?3 AND id=?4 AND state='active'").bind(ownerId, dependency.documentId, dependency.documentVersionId, dependency.confirmationId).first<{ items_json: string }>();
      if (!confirmation || await materialSha256(JSON.parse(confirmation.items_json)) !== dependency.confirmationDigest) throw new PlanningConflictError();
      confirmations.push({ documentId: dependency.documentId, itemsJson: confirmation.items_json });
    }
    const commit: MaterialPlanCommit = { contextVersionId: id, fingerprint: row.fingerprint, previewToken: row.preview_token, requestDigest: "", snapshot, checkedAt: this.now().getTime(), confirmations, kind: snapshot.scope.kind === "draft" ? "generation" : "proposal" };
    try { await materialGuardStatement(this.options.db, ownerId, commit, options).first(); } catch { throw new PlanningConflictError(); }
    return { row, commit, preview: materialContextPreviewSchema.parse(JSON.parse(row.preview_json)) };
  }

  private validateChoices(choices: Pick<ContextInputSnapshot, "skillMappings" | "termMappings" | "learningIntents">, selected: SelectedRow[], source: PlanningSourceContext) {
    const { skillMappings = [], termMappings = [], learningIntents = [] } = choices;
    if (!skillMappings.length && !termMappings.length && !learningIntents.length) return {};
    if (source.blueprint.status !== "ready" || !validateUnitRegistry(source.registry, source.blueprint).valid) throw new PlanningInvalidInputError(["material-mapping-source"]);
    const items = new Map<string, { row: SelectedRow; item: ConfirmedMaterialItem }>(selected.flatMap(row => confirmedMaterialItemsSchema.parse(JSON.parse(row.items_json))
      .map(item => [`${row.confirmation_id}:${item.id}`, { row, item }] as const)));
    const key = (choice: { confirmationId: string; itemId: string }) => `${choice.confirmationId}:${choice.itemId}`;
    const adopted = new Set(learningIntents.map(key));
    for (const choice of learningIntents) {
      const selectedItem = items.get(key(choice));
      if (!selectedItem || !learningIntentEligible(selectedItem.row, selectedItem.item)) throw new PlanningInvalidInputError(["material-intent-reference"]);
    }
    const known = new Set(source.blueprint.skills.map(skill => skill.id));
    for (const mapping of [...skillMappings, ...termMappings]) {
      const selectedItem = items.get(key(mapping));
      const skillIds = "skillId" in mapping ? [mapping.skillId] : mapping.skillIds;
      if (!selectedItem || (selectedItem.item.kind === "constraint" && !adopted.has(key(mapping))) || skillIds.some(skillId => !known.has(skillId))
        || ("skillId" in mapping && selectedItem.item.skillLabels !== undefined)
        || ("skillLabel" in mapping && !selectedItem.item.skillLabels?.includes(mapping.skillLabel))) throw new PlanningInvalidInputError(["material-mapping-reference"]);
    }
    return { ...(skillMappings.length ? { skillMappings } : {}), ...(termMappings.length ? { termMappings } : {}), ...(learningIntents.length ? { learningIntents } : {}) };
  }

  private project(snapshot: ContextInputSnapshot, selected: SelectedRow[], source: PlanningSourceContext, fingerprint: string): MaterialPreview {
    const confirmedItems: ConfirmedMaterialItem[] = [];
    const itemReferences: NonNullable<MaterialPreview["itemReferences"]> = [];
    const requirements: { skillId: string; level: "must" | "preferred" | "unspecified"; itemId: string }[] = [];
    const practices: { skillId: string; itemId: string }[] = [];
    const intents: { skillId: string; itemId: string }[] = [];
    const mappingDetails: NonNullable<MaterialPreview["mappingDetails"]> = [];
    const uncoveredLabels: string[] = [];
    const issues: MaterialPreview["issues"] = [];
    const uncoveredFactIds: string[] = [];
    const unadoptedFactIds: string[] = [], omittedFactIds: string[] = [];
    for (const row of selected) {
      const userMappings: Record<string, string[]> = {};
      const termMappings: NonNullable<MappingOptions["termMappings"]> = {};
      const learningIntentItemIds: string[] = [];
      const unadopted = new Set<string>();
      const items = confirmedMaterialItemsSchema.parse(JSON.parse(row.items_json)).map(item => {
        const id = deterministicId("material-item", { confirmationId: row.confirmation_id, itemId: item.id });
        const eligible = learningIntentEligible(row, item);
        itemReferences.push({ id, confirmationId: row.confirmation_id, itemId: item.id, ...(eligible ? { learningIntentEligible: true } : {}) });
        if (snapshot.learningIntents?.some(choice => choice.confirmationId === row.confirmation_id && choice.itemId === item.id)) learningIntentItemIds.push(id);
        else if (eligible) {
          unadopted.add(id);
          if (item.kind === "requirement" || item.skillLabels?.length) unadoptedFactIds.push(id);
        }
        const explicit = snapshot.skillMappings?.filter(mapping => mapping.confirmationId === row.confirmation_id && mapping.itemId === item.id).map(mapping => mapping.skillId);
        if (explicit?.length) userMappings[id] = explicit;
        const terms = snapshot.termMappings?.filter(mapping => mapping.confirmationId === row.confirmation_id && mapping.itemId === item.id);
        if (terms?.length) termMappings[id] = terms;
        return { ...item, id };
      });
      confirmedItems.push(...items);
      const options = { userMappings, termMappings, learningIntentItemIds };
      const details = mapMaterialItemTerms(items, source.blueprint, source.registry, options);
      const groups = new Map<string, NonNullable<MaterialPreview["mappingDetails"]>[number]>();
      for (const detail of details) {
        const item = items.find(item => item.id === detail.itemId)!;
        const termIndex = item.skillLabels?.indexOf(detail.term) ?? -1;
        const groupKey = canonicalJson({ itemId: item.id, status: detail.status, skillIds: detail.skillIds, basis: detail.basis });
        const group = groups.get(groupKey) ?? { itemId: item.id, termIndexes: [], status: detail.status, skillIds: detail.skillIds, basis: detail.basis };
        if (!group.termIndexes.includes(termIndex)) group.termIndexes.push(termIndex);
        groups.set(groupKey, group);
        if (detail.status === "omitted") omittedFactIds.push(item.id);
      }
      mappingDetails.push(...groups.values());
      for (const id of learningIntentItemIds) if (!details.some(detail => detail.itemId === id)) uncoveredFactIds.push(id);
      for (const mapping of mapMaterialItems(items, source.blueprint, source.registry, options)) {
        const item = items.find(value => value.id === mapping.itemId)!;
        if (unadopted.has(item.id)) continue;
        if (mapping.status === "non-learning") continue;
        if (mapping.status !== "mapped") {
          if (mapping.status === "uncovered" || item.skillLabels === undefined) uncoveredLabels.push(...mapping.labels);
          if (mapping.status === "uncovered" && item.skillLabels !== undefined) uncoveredFactIds.push(item.id);
          else issues.push({ code: mapping.status === "ambiguous" ? "ambiguous-mapping" : "uncovered", itemIds: [item.id], skillIds: mapping.skillIds });
          continue;
        }
        for (const skillId of mapping.skillIds) {
          if (row.slot === "jd" && item.kind === "requirement") requirements.push({ skillId, level: item.requirementLevel ?? "unspecified", itemId: item.id });
          if (row.slot !== "jd" && ["experience", "skill-claim"].includes(item.kind)) practices.push({ skillId, itemId: item.id });
          if (learningIntentItemIds.includes(item.id)) intents.push({ skillId, itemId: item.id });
        }
      }
    }
    if (uncoveredFactIds.length) issues.push({ code: "uncovered", itemIds: [...new Set(uncoveredFactIds)], skillIds: [] });
    if (unadoptedFactIds.length) issues.push({ code: "learning-intent-not-adopted", itemIds: unadoptedFactIds, skillIds: [] });
    if (omittedFactIds.length) issues.push({ code: "mapping-omitted", itemIds: [...new Set(omittedFactIds)], skillIds: [] });
    const overlay = createMaterialOverlay({ audit: snapshot.audit, knownSkillIds: source.blueprint.skills.map(skill => skill.id), semanticFingerprint: fingerprint, requirements, practiceSkillIds: practices.map(item => item.skillId), learningIntentSkillIds: intents.map(item => item.skillId) });
    const priorities = Object.entries(overlay.skillRanks).filter(([, tier]) => tier < 5).map(([skillId, tier]) => {
      const sources = tier === 3 ? practices : requirements.filter(item => item.level === (tier === 4 ? "preferred" : "must"));
      const practiceItemIds = [...new Set(practices.filter(item => item.skillId === skillId).map(item => item.itemId))];
      const learningIntentItemIds = tier === 3 && !requirements.some(item => item.skillId === skillId && item.level !== "unspecified")
        ? [...new Set(intents.filter(item => item.skillId === skillId).map(item => item.itemId))] : [];
      return { skillId, tier, itemIds: [...new Set([...sources.filter(item => item.skillId === skillId).map(item => item.itemId), ...learningIntentItemIds])],
        ...(learningIntentItemIds.length ? { practiceItemIds, learningIntentItemIds } : {}) };
    });
    const paths = buildLearningPaths({ blueprint: source.blueprint, registry: source.registry, audit: snapshot.audit, availability: snapshot.availability, target: snapshot.target, planningDate: snapshot.planningDate, materialOverlay: overlay });
    if (paths.infeasibleReason) issues.push({ code: "target-infeasible", itemIds: [], skillIds: overlay.mandatorySkillIds.slice() });
    const summary = (path: typeof paths.fullScope) => ({ estimatedCompletionDate: path.estimatedCompletionDate, totalMinutes: path.units.reduce((sum, unit) => sum + unit.estimatedMinutes, 0) });
    return materialContextPreviewSchema.parse({ confirmedItems, itemReferences, mappingDetails, ...(snapshot.skillMappings?.length ? { skillMappings: snapshot.skillMappings } : {}),
      ...(snapshot.termMappings?.length ? { termMappings: snapshot.termMappings } : {}), ...(snapshot.learningIntents?.length ? { learningIntents: snapshot.learningIntents } : {}),
      priorities, issues, uncoveredLabels: [...new Set(uncoveredLabels)], overlay, planning: { fullScope: summary(paths.fullScope), targetDate: paths.targetDate ? summary(paths.targetDate) : null, infeasibleReason: paths.infeasibleReason } });
  }

  private async selected(ownerId: string, selectionId: string): Promise<SelectedRow[]> {
    const rows = await this.options.db.prepare(`SELECT e.slot,e.document_id,e.document_version_id,e.confirmation_id,v.text_version_id,d.generation,f.items_json,d.lifecycle,v.state AS version_state,f.state AS confirmation_state FROM material_selection_entries e JOIN documents d ON d.owner_id=e.owner_id AND d.id=e.document_id JOIN document_versions v ON v.owner_id=e.owner_id AND v.document_id=e.document_id AND v.id=e.document_version_id JOIN document_confirmations f ON f.owner_id=e.owner_id AND f.document_id=e.document_id AND f.document_version_id=e.document_version_id AND f.id=e.confirmation_id WHERE e.owner_id=?1 AND e.selection_id=?2 ORDER BY e.slot,e.document_id`).bind(ownerId, selectionId).all<SelectedRow>();
    return rows.results;
  }
  private async assertScope(ownerId: string, scope: ContextInputSnapshot["scope"]) {
    if (scope.kind !== "goal") return;
    const repository = this.options.planningRepository;
    if (!repository) throw new PlanningConflictError();
    const active = await repository.findActiveGoal(ownerId);
    if (!active || active.goalId !== scope.goalId) throw new PlanningConflictError();
    const stored = await repository.load(active);
    if (!stored || stored.ownerId !== ownerId) throw new PlanningNotFoundError();
    const workspace = planningWorkspaceSchema.parse(stored.payload);
    if (workspace.id !== scope.workspaceId || workspace.activePlanVersionId !== scope.baseVersionId || workspace.revision !== scope.revision || workspace.pendingPlanVersionId) throw new PlanningConflictError();
  }
  private receipt(ownerId: string, endpoint: string, mutationId: string) {
    return this.options.db.prepare("SELECT body_digest,result_json FROM document_mutations WHERE owner_id=?1 AND endpoint=?2 AND mutation_id=?3").bind(ownerId, endpoint, mutationId).first<{ body_digest: string; result_json: string }>();
  }
}

function learningIntentEligible(row: SelectedRow, item: ConfirmedMaterialItem): boolean {
  return row.slot !== "jd" && (item.kind === "constraint" || item.kind === "requirement");
}

async function sourceVersions(source: PlanningSourceContext) {
  return { blueprintId: source.blueprint.id, blueprintVersion: source.blueprint.version, registryId: source.registry.id, registryVersion: source.registry.version, contentDigest: await materialSha256({ blueprint: source.blueprint, registry: source.registry }) };
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new PlanningInvalidInputError();
  return result.data;
}
