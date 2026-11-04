import { DOCUMENT_SCHEMA_VERSION, materialSelectionSchema, type MaterialScope, type MaterialSelection, type MaterialSelectionEntry } from "../../contracts/documents";
import { documentEndpointContracts, type DocumentEndpointRequest as Request, type DocumentEndpointResponse as Response } from "../../contracts/documents-api";
import { D1DocumentRepository, DocumentServiceError, type MaterialRow } from "./d1-repository";
import type { DocumentOwner } from "./repository";
export class SelectionService {
    constructor(readonly repo: D1DocumentRepository) { }
    async read(ownerId: string, selectionId: string): Promise<MaterialSelection> {
        const row = await this.repo.one("SELECT * FROM material_selections WHERE owner_id=? AND id=?", ownerId, selectionId);
        if (!row)
            throw new DocumentServiceError("not-found");
        const entries = await this.repo.all("SELECT * FROM material_selection_entries WHERE owner_id=? AND selection_id=? ORDER BY slot,document_id", ownerId, selectionId);
        return materialSelectionSchema.parse({
            selectionId: row.id,
            schemaVersion: DOCUMENT_SCHEMA_VERSION,
            selectionRevision: row.revision,
            scope: JSON.parse(String(row.scope_json)),
            entries: entries.map(entry => ({
                slot: entry.slot,
                documentId: entry.document_id,
                documentVersionId: entry.document_version_id,
                confirmationId: entry.confirmation_id
            })),
            state: row.state,
            boundGoalId: row.bound_goal_id
        });
    }
    scopeGuard(ownerId: string, scope: MaterialScope): D1PreparedStatement[] {
        if (scope.kind === "draft")
            return scope.previousGoalId === null ? [] : [
                this.repo.guard("EXISTS(SELECT 1 FROM career_goals WHERE user_id=? AND id=? AND status='active' AND active_slot=1)", ownerId, scope.previousGoalId)
            ];
        return [
            this.repo.guard("EXISTS(SELECT 1 FROM planning_workspaces w JOIN career_goals g ON g.user_id=w.user_id AND g.id=w.goal_id WHERE w.user_id=? AND w.goal_id=? AND w.id=? AND w.revision=? AND w.active_plan_version_id=? AND g.status='active' AND g.active_slot=1)", ownerId, scope.goalId, scope.workspaceId, scope.revision, scope.baseVersionId)
        ];
    }
    async validateEntries(ownerId: string, entries: MaterialSelectionEntry[]): Promise<D1PreparedStatement[]> {
        const guards: D1PreparedStatement[] = [];
        for (const entry of entries) {
            const stored = await this.repo.version(ownerId, entry.documentId, entry.documentVersionId);
            if (stored.document.kind !== entry.slot)
                throw new DocumentServiceError("invalid-content");
            const row = await this.repo.one("SELECT * FROM document_confirmations WHERE owner_id=? AND document_id=? AND document_version_id=? AND id=?", ownerId, entry.documentId, entry.documentVersionId, entry.confirmationId);
            if (!row)
                throw new DocumentServiceError("not-found");
            if (row.state !== "active" || row.text_version_id !== stored.version.textVersionId)
                throw new DocumentServiceError("gone");
            guards.push(this.repo.activeVersionGuard(ownerId, entry.documentId, entry.documentVersionId, stored.document.generation), this.repo.guard("EXISTS(SELECT 1 FROM document_confirmations WHERE owner_id=? AND document_id=? AND document_version_id=? AND id=? AND state='active' AND text_version_id=?)", ownerId, entry.documentId, entry.documentVersionId, entry.confirmationId, stored.version.textVersionId));
        }
        return guards;
    }
    insertEntry(ownerId: string, selectionId: string, entry: MaterialSelectionEntry) { return this.repo.statement("INSERT INTO material_selection_entries(owner_id,selection_id,slot,document_id,document_version_id,confirmation_id) VALUES(?,?,?,?,?,?)", ownerId, selectionId, entry.slot, entry.documentId, entry.documentVersionId, entry.confirmationId); }
    private replaceCurrentScope(ownerId: string, scope: MaterialScope): D1PreparedStatement[] {
        const identity = scope.kind === "draft" ? "json_extract(scope_json,'$.kind')='draft' AND json_extract(scope_json,'$.draftId')=?" : "json_extract(scope_json,'$.kind')='goal' AND json_extract(scope_json,'$.goalId')=?";
        const scopeId = scope.kind === "draft" ? scope.draftId : scope.goalId;
        return [
            this.repo.statement(`UPDATE material_context_versions SET state='revoked' WHERE owner_id=? AND selection_id IN (SELECT id FROM material_selections WHERE owner_id=? AND state='active' AND ${identity}) AND NOT EXISTS (SELECT 1 FROM document_usage_links u WHERE u.owner_id=material_context_versions.owner_id AND u.context_version_id=material_context_versions.id AND u.kind IN ('generation','accepted'))`, ownerId, ownerId, scopeId),
            this.repo.statement("UPDATE material_plan_proposals SET state='revoked' WHERE owner_id=? AND state='pending' AND context_version_id IN (SELECT id FROM material_context_versions WHERE owner_id=? AND state='revoked')", ownerId, ownerId),
            this.repo.statement(`UPDATE material_selections SET state='revoked',updated_at=? WHERE owner_id=? AND state='active' AND ${identity}`, this.repo.now(), ownerId, scopeId),
        ];
    }
    async createMaterialSelection(owner: DocumentOwner, input: Request<"createMaterialSelection">): Promise<Response<"createMaterialSelection">> {
        const request = documentEndpointContracts.createMaterialSelection.request.parse(input), identity = await this.repo.identity(owner.ownerId, "createMaterialSelection", request), guards = await this.validateEntries(owner.ownerId, request.entries), replay = await this.repo.receipt<Response<"createMaterialSelection">>(identity);
        if (replay) {
            if ((await this.read(owner.ownerId, replay.selectionId)).state === "revoked")
                throw new DocumentServiceError("gone");
            return replay;
        }
        const result = { selectionId: this.repo.id(), selectionRevision: 0 };
        return this.repo.commit(identity, result, [
            ...this.scopeGuard(owner.ownerId, request.scope),
            ...guards,
            ...this.replaceCurrentScope(owner.ownerId, request.scope),
            this.repo.statement("INSERT INTO material_selections(owner_id,id,scope_json,revision,state,created_at,updated_at) VALUES(?,?,?,0,'active',?,?)", owner.ownerId, result.selectionId, JSON.stringify(request.scope), this.repo.now(), this.repo.now()),
            ...request.entries.map(entry => this.insertEntry(owner.ownerId, result.selectionId, entry))
        ]);
    }
    async updateMaterialSelection(owner: DocumentOwner, input: Request<"updateMaterialSelection">): Promise<Response<"updateMaterialSelection">> {
        const request = documentEndpointContracts.updateMaterialSelection.request.parse(input), identity = await this.repo.identity(owner.ownerId, "updateMaterialSelection", request), selection = await this.read(owner.ownerId, request.selectionId), guards = await this.validateEntries(owner.ownerId, request.entries), replay = await this.repo.receipt<Response<"updateMaterialSelection">>(identity);
        if (selection.state === "revoked")
            throw new DocumentServiceError("gone");
        if (replay)
            return replay;
        if (selection.state !== "active" || selection.selectionRevision !== request.expectedRevision)
            throw new DocumentServiceError("conflict");
        const result = { selectionId: request.selectionId, selectionRevision: request.expectedRevision + 1 };
        return this.repo.commit(identity, result, [
            ...this.scopeGuard(owner.ownerId, selection.scope),
            ...guards,
            this.repo.statement("UPDATE material_selections SET revision=revision+1,updated_at=? WHERE owner_id=? AND id=? AND revision=? AND state='active'", this.repo.now(), owner.ownerId, request.selectionId, request.expectedRevision),
            this.repo.changed(),
            this.repo.statement("DELETE FROM material_selection_entries WHERE owner_id=? AND selection_id=?", owner.ownerId, request.selectionId),
            ...request.entries.map(entry => this.insertEntry(owner.ownerId, request.selectionId, entry)),
            this.repo.statement("UPDATE material_context_versions SET state='revoked' WHERE owner_id=? AND selection_id=? AND NOT EXISTS(SELECT 1 FROM document_usage_links u WHERE u.owner_id=material_context_versions.owner_id AND u.context_version_id=material_context_versions.id AND u.kind IN ('generation','accepted'))", owner.ownerId, request.selectionId),
            this.repo.statement("UPDATE material_plan_proposals SET state='revoked' WHERE owner_id=? AND state='pending' AND context_version_id IN (SELECT id FROM material_context_versions WHERE owner_id=? AND selection_id=? AND state='revoked')", owner.ownerId, owner.ownerId, request.selectionId)
        ]);
    }
    async readMaterialSelection(owner: DocumentOwner, input: Request<"readMaterialSelection">): Promise<Response<"readMaterialSelection">> {
        const request = documentEndpointContracts.readMaterialSelection.request.parse(input), selection = await this.read(owner.ownerId, request.selectionId);
        const versions: Response<"readMaterialSelection">["versions"] = [];
        for (const entry of selection.entries) {
            const row: MaterialRow | null = await this.repo.one("SELECT d.lifecycle,d.current_document_version_id,v.state FROM documents d JOIN document_versions v ON v.owner_id=d.owner_id AND v.document_id=d.id WHERE d.owner_id=? AND d.id=? AND v.id=?", owner.ownerId, entry.documentId, entry.documentVersionId);
            versions.push({
                documentId: entry.documentId,
                documentVersionId: entry.documentVersionId,
                state: !row ? "unavailable" : row.lifecycle !== "active" || row.state !== "ready" ? "revoked" : row.current_document_version_id !== entry.documentVersionId ? "superseded" : "active"
            });
        }
        return { selection, versions };
    }
}
