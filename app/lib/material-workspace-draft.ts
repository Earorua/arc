import type { DocumentEndpointRequest, DocumentEndpointResponse } from "../contracts/documents-api";
import type { MaterialScope } from "../contracts/documents";
import type { MaterialDocumentDraftRef, MaterialSetupRefs } from "./use-material-selection";
import { DocumentClientError, type DocumentsClient } from "./documents-client";

export type AdoptedMaterialScope = Pick<DocumentEndpointRequest<"readAdoptedMaterials">, "goalId" | "workspaceId" | "baseVersionId">;
export type RestoreResolution = "current" | "draft" | "reset";
export type RestoreConflict = "version" | "capacity";
type Entries = DocumentEndpointResponse<"readAdoptedMaterials">["entries"];
function splitEntries(entries: Entries) {
  const slots: MaterialSetupRefs["slots"] = {}, supplements: MaterialDocumentDraftRef[] = [];
  for (const { slot, ...ref } of entries) {
    if (slot === "supplement") supplements.push(ref);
    else slots[slot] = ref;
  }
  return { slots, supplements };
}
function sameVersion(a?: MaterialDocumentDraftRef, b?: MaterialDocumentDraftRef) {
  return a?.documentId === b?.documentId && a?.documentVersionId === b?.documentVersionId
    && a?.confirmationId === b?.confirmationId && a?.textVersionId === b?.textVersionId;
}
function sameScope(a: AdoptedMaterialScope | MaterialScope, b: AdoptedMaterialScope) {
  return "goalId" in a && a.goalId === b.goalId && a.workspaceId === b.workspaceId && a.baseVersionId === b.baseVersionId;
}
async function readLegacySelection(client: DocumentsClient, saved: MaterialSetupRefs, signal: AbortSignal) {
  if (saved.adopted || !saved.selection) return null;
  try {
    const result = await client.request("readMaterialSelection", { selectionId: saved.selection.selectionId }, signal);
    if (result.selection.selectionId !== saved.selection.selectionId) throw new Error("Selection receipt mismatch");
    return result;
  } catch (error) {
    if (error instanceof DocumentClientError && (error.code === "not-found" || error.code === "gone")) return null;
    throw error;
  }
}
export async function restoreWorkspaceDraft(client: DocumentsClient, saved: MaterialSetupRefs, scope: AdoptedMaterialScope,
  signal: AbortSignal, resolution?: RestoreResolution): Promise<MaterialSetupRefs | RestoreConflict> {
  // Older drafts did not record the adopted baseline. Only check their locally selected IDs.
  const legacyIds = saved.adopted ? [] : [...new Set([...Object.values(saved.slots), ...saved.supplements].flatMap(ref => ref ? [ref.documentId] : []))];
  const { entries, detachedDocumentIds } = await client.request("readAdoptedMaterials", { ...scope, ...(legacyIds.length ? { checkDocumentIds: legacyIds } : {}) }, signal);
  signal.throwIfAborted();
  const adopted = { scope, entries }, current = splitEntries(entries), previous = saved.adopted;
  const legacy = resolution === "reset" ? null : await readLegacySelection(client, saved, signal);
  const base = previous?.scope ?? legacy?.selection.scope;
  if (resolution === "reset" || (base && !sameScope(base, scope))) {
    return { draftId: `draft-${crypto.randomUUID()}`, ...current, adopted, selection: null, preview: null };
  }
  const trusted = Boolean(previous || (legacy?.selection.state === "active" && legacy.selection.selectionRevision === saved.selection?.selectionRevision));
  const adoptedIds = new Set(entries.map(entry => entry.documentId));
  const detachedIds = new Set(previous
    ? previous.entries.filter(entry => !adoptedIds.has(entry.documentId)).map(entry => entry.documentId)
    : (detachedDocumentIds ?? []).filter(id => legacyIds.includes(id)));
  const unavailable = (choice: MaterialDocumentDraftRef) => legacy?.versions.some(version => version.documentId === choice.documentId
    && version.documentVersionId === choice.documentVersionId && (version.state === "unavailable" || version.state === "revoked"));
  const conflict = (choice: MaterialDocumentDraftRef, active?: MaterialDocumentDraftRef) => !trusted && !sameVersion(choice, active);
  // Legacy drafts only persisted selected refs. Missing slots did not record a removal.
  // After first hydration we can distinguish a deliberate removal from an unchanged slot.
  const prior = splitEntries(previous?.entries ?? []);
  for (const slot of ["jd", "resume"] as const) {
    const choice = saved.slots[slot];
    if (sameVersion(choice, prior.slots[slot])) continue;
    if (choice && (detachedIds.has(choice.documentId) || unavailable(choice))) continue;
    if (choice && conflict(choice, current.slots[slot])) {
      if (!resolution) return "version";
      if (resolution === "current") continue;
    }
    if (choice) current.slots[slot] = choice;
    else delete current.slots[slot];
  }
  const supplements = new Map(current.supplements.map(ref => [ref.documentId, ref]));
  for (const before of prior.supplements) {
    if (!saved.supplements.some(ref => ref.documentId === before.documentId)) supplements.delete(before.documentId);
  }
  for (const choice of saved.supplements) {
    if (detachedIds.has(choice.documentId) || unavailable(choice)) continue;
    const active = supplements.get(choice.documentId);
    if (active && conflict(choice, active)) {
      if (!resolution) return "version";
      if (resolution === "current") continue;
    }
    if (!sameVersion(choice, prior.supplements.find(ref => ref.documentId === choice.documentId))) supplements.set(choice.documentId, choice);
  }
  if (supplements.size > 3) return "capacity";
  return { ...saved, slots: current.slots, supplements: [...supplements.values()], adopted, selection: trusted && !detachedIds.size ? saved.selection : null, preview: null };
}
