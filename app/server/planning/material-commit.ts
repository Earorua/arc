import { contextInputSnapshotSchema, createMaterialContextFingerprint, materialSha256, type ContextInputSnapshot } from "../../contracts/material-planning";
import { canonicalJson } from "../../lib/planning/fingerprint";

export type MaterialPlanCommit = Readonly<{
  contextVersionId: string; fingerprint: string; previewToken: string; requestDigest: string;
  snapshot: ContextInputSnapshot; checkedAt: number;
  confirmations: readonly { documentId: string; itemsJson: string }[];
  kind: "generation" | "proposal" | "accepted";
}>;

/** The same guard is used in preview persistence and the final planning batch. */
export function materialGuardStatement(db: D1Database, ownerId: string, commit: MaterialPlanCommit, options: { requireContext?: boolean; ignoreExpiry?: boolean; ignoreSelection?: boolean } = {}): D1PreparedStatement {
  const snapshot = commit.snapshot;
  const predicates: string[] = [];
  const values: unknown[] = [];
  const bind = (value: unknown) => { values.push(value); return `?${values.length}`; };
  const owner = bind(ownerId), selection = bind(snapshot.selectionRef.selectionId), revision = bind(snapshot.selectionRef.selectionRevision);
  if (snapshot.ownerId !== ownerId) throw new Error("MATERIAL_OWNER_MISMATCH");
  if (!options.ignoreSelection) predicates.push(`EXISTS (SELECT 1 FROM material_selections s WHERE s.owner_id=${owner} AND s.id=${selection} AND s.revision=${revision} AND s.state IN ('active','bound') AND json(s.scope_json)=json(${bind(JSON.stringify(snapshot.scope))}))`);
  if (options.requireContext !== false) {
    predicates.push(`EXISTS (SELECT 1 FROM material_context_versions c WHERE c.owner_id=${owner} AND c.id=${bind(commit.contextVersionId)} AND c.state='active' AND c.fingerprint=${bind(commit.fingerprint)} AND c.preview_token=${bind(commit.previewToken)} AND c.selection_id=${selection} AND c.selection_revision=${revision} AND c.snapshot_json=${bind(canonicalJson(snapshot))}${options.ignoreExpiry ? "" : ` AND c.expires_at>${bind(commit.checkedAt)}`})`);
    predicates.push(`(SELECT count(*) FROM material_context_dependencies WHERE owner_id=${owner} AND context_version_id=${bind(commit.contextVersionId)})=${bind(snapshot.dependencies.length)}`);
  }
  if (!options.ignoreSelection) predicates.push(`(SELECT count(*) FROM material_selection_entries WHERE owner_id=${owner} AND selection_id=${selection})=${bind(snapshot.dependencies.length)}`);
  for (const dependency of snapshot.dependencies) {
    const document = bind(dependency.documentId), version = bind(dependency.documentVersionId), confirmation = bind(dependency.confirmationId), text = bind(dependency.textVersionId), generation = bind(dependency.generation), slot = bind(dependency.slot);
    const frozen = commit.confirmations.find(item => item.documentId === dependency.documentId);
    if (!frozen) throw new Error("MATERIAL_CONFIRMATION_MISSING");
    predicates.push(`EXISTS (SELECT 1 FROM documents d JOIN document_versions v ON v.owner_id=d.owner_id AND v.document_id=d.id JOIN document_confirmations f ON f.owner_id=v.owner_id AND f.document_id=v.document_id AND f.document_version_id=v.id WHERE d.owner_id=${owner} AND d.id=${document} AND d.lifecycle='active' AND d.generation=${generation} AND v.id=${version} AND v.state='ready' AND v.text_version_id=${text} AND f.id=${confirmation} AND f.text_version_id=${text} AND f.state='active' AND json(f.items_json)=json(${bind(frozen.itemsJson)}))`);
    if (!options.ignoreSelection) predicates.push(`EXISTS (SELECT 1 FROM material_selection_entries e WHERE e.owner_id=${owner} AND e.selection_id=${selection} AND e.document_id=${document} AND e.document_version_id=${version} AND e.confirmation_id=${confirmation} AND e.slot=${slot})`);
    if (options.requireContext !== false) predicates.push(`EXISTS (SELECT 1 FROM material_context_dependencies x WHERE x.owner_id=${owner} AND x.context_version_id=${bind(commit.contextVersionId)} AND x.document_id=${document} AND x.document_version_id=${version} AND x.text_version_id=${text} AND x.confirmation_id=${confirmation} AND x.generation=${generation} AND x.slot=${slot} AND x.confirmation_digest=${bind(dependency.confirmationDigest)})`);
  }
  if (snapshot.sourceReference.source === "research" && !options.ignoreExpiry) {
    const source = snapshot.sourceReference;
    predicates.push(`EXISTS (SELECT 1 FROM research_runs r JOIN research_packages p ON p.id=r.package_id WHERE r.user_id=${owner} AND r.id=${bind(source.researchRunId)} AND r.state='ready' AND r.package_id=${bind(source.packageId)} AND r.config_fingerprint=${bind(source.configFingerprint)} AND p.config_fingerprint=r.config_fingerprint AND p.content_fingerprint=${bind(source.contentFingerprint)} AND p.blueprint_id=${bind(source.blueprintId)} AND p.blueprint_version=${bind(source.blueprintVersion)} AND p.registry_id=${bind(source.registryId)} AND p.registry_version=${bind(source.registryVersion)} AND p.expires_at>${bind(commit.checkedAt)})`);
  }
  // JSON malformed input aborts a D1 transaction, including all earlier writes.
  return db.prepare(`SELECT json(CASE WHEN ${predicates.join(" AND ")} THEN '{}' ELSE '' END) AS material_guard`).bind(...values);
}

/** Reconstruct a server fence from persisted state for the legacy accept entrypoint. */
export async function loadMaterialCommit(db: D1Database, ownerId: string, contextVersionId: string, checkedAt: number): Promise<MaterialPlanCommit> {
  const row = await db.prepare("SELECT snapshot_json,fingerprint,preview_token,state FROM material_context_versions WHERE owner_id=?1 AND id=?2").bind(ownerId, contextVersionId).first<{ snapshot_json: string; fingerprint: string; preview_token: string; state: string }>();
  if (!row || row.state !== "active") throw new Error("MATERIAL_REVOKED");
  const snapshot = contextInputSnapshotSchema.parse(JSON.parse(row.snapshot_json));
  if (snapshot.ownerId !== ownerId || await createMaterialContextFingerprint(snapshot) !== row.fingerprint) throw new Error("MATERIAL_CHANGED");
  const confirmations: MaterialPlanCommit["confirmations"][number][] = [];
  for (const dependency of snapshot.dependencies) {
    const confirmation = await db.prepare("SELECT items_json FROM document_confirmations WHERE owner_id=?1 AND document_id=?2 AND document_version_id=?3 AND id=?4 AND state='active'").bind(ownerId, dependency.documentId, dependency.documentVersionId, dependency.confirmationId).first<{ items_json: string }>();
    if (!confirmation || await materialSha256(JSON.parse(confirmation.items_json)) !== dependency.confirmationDigest) throw new Error("MATERIAL_CHANGED");
    confirmations.push({ documentId: dependency.documentId, itemsJson: confirmation.items_json });
  }
  return { contextVersionId, fingerprint: row.fingerprint, previewToken: row.preview_token, snapshot, checkedAt, confirmations, kind: "accepted", requestDigest: "" };
}

export function materialAssociationStatements(db: D1Database, input: { ownerId: string; goalId: string; workspaceId: string; planVersionId: string; mutationId: string; revision: number; baseVersionId?: string; baseRevision?: number; commit: MaterialPlanCommit }): D1PreparedStatement[] {
  const { ownerId, goalId, workspaceId, planVersionId, mutationId, commit } = input;
  const result: D1PreparedStatement[] = [];
  if (commit.kind === "generation") result.push(db.prepare(`UPDATE material_selections SET state='bound',bound_goal_id=?1,generation_mutation_id=?2,updated_at=?3 WHERE owner_id=?4 AND id=?5 AND revision=?6 AND state='active'`).bind(goalId, mutationId, commit.checkedAt, ownerId, commit.snapshot.selectionRef.selectionId, commit.snapshot.selectionRef.selectionRevision));
  if (commit.kind !== "proposal") {
    result.push(db.prepare("UPDATE goal_document_links SET enabled=0 WHERE owner_id=?1 AND goal_id=?2").bind(ownerId, goalId));
    for (const dependency of commit.snapshot.dependencies) result.push(db.prepare(`INSERT INTO goal_document_links(owner_id,goal_id,document_id,document_version_id,confirmation_id,context_version_id,slot,purpose,enabled,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'planning',1,?8) ON CONFLICT(owner_id,goal_id,context_version_id,document_id) DO UPDATE SET enabled=1`).bind(ownerId, goalId, dependency.documentId, dependency.documentVersionId, dependency.confirmationId, commit.contextVersionId, dependency.slot, commit.checkedAt));
  }
  result.push(db.prepare(`INSERT INTO document_usage_links(owner_id,context_version_id,goal_id,workspace_id,plan_version_id,kind,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)`).bind(ownerId, commit.contextVersionId, goalId, workspaceId, planVersionId, commit.kind, commit.checkedAt));
  if (commit.kind === "proposal") result.push(db.prepare(`INSERT INTO material_plan_proposals(owner_id,goal_id,workspace_id,candidate_plan_version_id,active_base_plan_id,input_revision,proposal_revision,context_version_id,context_fingerprint,state,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'pending',?10)`).bind(ownerId, goalId, workspaceId, planVersionId, input.baseVersionId!, input.baseRevision!, input.revision, commit.contextVersionId, commit.fingerprint, commit.checkedAt));
  const endpoint = commit.kind === "generation" ? "POST /api/planning/generate" : commit.kind === "proposal" ? "POST /api/planning/material-replans" : "POST /api/planning/replans/accept";
  result.push(db.prepare(`INSERT INTO document_mutations(owner_id,endpoint,mutation_id,body_digest,result_json,created_at) VALUES (?1,?2,?3,?4,?5,?6)`).bind(ownerId, endpoint, mutationId, commit.requestDigest, JSON.stringify({ contextVersionId: commit.contextVersionId, goalId, workspaceId, planVersionId }), commit.checkedAt));
  return result;
}
