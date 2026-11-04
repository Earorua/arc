import type { DocumentEndpointRequest, DocumentEndpointResponse, DocumentMutationIdentity } from "../../contracts/documents-api";
import { deterministicId } from "../../lib/planning/fingerprint";
import type { PlanningService } from "../planning/service";
import { D1DocumentRepository, DocumentServiceError } from "./d1-repository";

type Request = DocumentEndpointRequest<"detachAdoptedMaterial">;
type Receipt = DocumentEndpointResponse<"detachAdoptedMaterial">;
export type MaterialDetachment = { request: Request; identity: DocumentMutationIdentity; receipt: Receipt };

export async function detachAdoptedMaterial(repo: D1DocumentRepository, planning: PlanningService, ownerId: string, request: Request): Promise<Receipt> {
  const identity = await repo.identity(ownerId, "detachAdoptedMaterial", request);
  const previous = await repo.receipt<Receipt>(identity);
  if (previous) return previous;
  const { goalId, workspaceId, baseVersionId, revision } = request.scope;
  const receipt = { goalId, workspaceId, baseVersionId, revision: revision + 1, documentId: request.entry.documentId };
  const planningMutationId = deterministicId("material-usage", { ownerId, mutationId: request.mutationId });
  try {
    await planning.recordMaterialDetachment(ownerId, planningMutationId, { request, identity, receipt });
  } catch (error) {
    const winner = await repo.receipt<Receipt>(identity);
    if (winner) return winner;
    throw error;
  }
  // A planning mutation replay alone cannot acknowledge the private removal.
  const committed = await repo.receipt<Receipt>(identity);
  if (!committed) throw new DocumentServiceError("conflict");
  return committed;
}

export function materialDetachmentStatements(db: D1Database, ownerId: string, change: MaterialDetachment) {
  const repo = new D1DocumentRepository(db);
  const { scope, entry } = change.request;
  return [
    repo.guard(`EXISTS (SELECT 1 FROM planning_workspaces w JOIN career_goals g ON g.user_id=w.user_id AND g.id=w.goal_id
      WHERE w.user_id=? AND w.goal_id=? AND w.id=? AND w.revision=? AND w.active_plan_version_id=?
        AND w.pending_plan_version_id IS NULL AND g.active_slot=1 AND g.status='active')`, ownerId, scope.goalId, scope.workspaceId, scope.revision, scope.baseVersionId),
    repo.statement(`UPDATE goal_document_links SET enabled=0 WHERE owner_id=? AND goal_id=? AND purpose='planning' AND enabled=1
      AND document_id=? AND document_version_id=? AND confirmation_id=? AND slot=?
      AND EXISTS (SELECT 1 FROM document_usage_links u WHERE u.owner_id=goal_document_links.owner_id AND u.goal_id=goal_document_links.goal_id
        AND u.context_version_id=goal_document_links.context_version_id AND u.workspace_id=? AND u.kind IN ('generation','accepted'))`,
    ownerId, scope.goalId, entry.documentId, entry.documentVersionId, entry.confirmationId, entry.slot, scope.workspaceId),
    repo.changed(),
    // Revoke open drafts. History reads the immutable snapshot independently of its selection.
    repo.statement(`UPDATE material_selections SET state='revoked',updated_at=? WHERE owner_id=? AND state='active'
      AND json_extract(scope_json,'$.kind')='goal' AND json_extract(scope_json,'$.goalId')=? AND json_extract(scope_json,'$.workspaceId')=?`,
    repo.now(), ownerId, scope.goalId, scope.workspaceId),
    repo.receiptStatement(change.identity, change.receipt),
  ];
}
