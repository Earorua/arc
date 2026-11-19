"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { DocumentCapabilities } from "../../contracts/document-capabilities";
import type { DocumentEndpointResponse } from "../../contracts/documents-api";
import type { MaterialDocumentDraftRef } from "../../lib/use-material-selection";
import { documentsClient, type DocumentsClient } from "../../lib/documents-client";
import { MaterialTextPanel } from "./material-text-panel";
import { materialDocumentDraftRefSchema, readSetupDraft, writeSetupDraft, removeSetupDraft } from "../setup/setup-draft";
import { materialIdSchema, type MaterialSelectionEntry } from "../../contracts/documents";

type DocumentRow = DocumentEndpointResponse<"listDocuments">["documents"][number];
const libraryEditorSchema = z.object({ kind: z.enum(["resume", "jd", "supplement"]), ref: materialDocumentDraftRefSchema.nullable(), editorKey: materialIdSchema }).strict();
const deletionRecoverySchema = z.object({ deletionJobId: materialIdSchema }).strict();
type LibraryEditor = z.infer<typeof libraryEditorSchema>;
type CurrentUse = { key: string; entries: MaterialSelectionEntry[]; disabled: boolean; detach: (entry: MaterialSelectionEntry) => Promise<void> };
type LibraryProps = {
  ownerId: string; capabilities: DocumentCapabilities; client?: DocumentsClient;
  onSelect?: (kind: DocumentRow["kind"], ref: MaterialDocumentDraftRef) => void;
  currentUse?: CurrentUse;
};
export function MaterialLibrary(props: LibraryProps) { return <OwnedMaterialLibrary key={props.ownerId} {...props} />; }
function CurrentGoalUse({ usage, documents }: { usage: CurrentUse; documents: DocumentRow[] }) {
  const [confirming, setConfirming] = useState<MaterialSelectionEntry | null>(null);
  if (!usage.entries.length) return null;
  return <section aria-label="Materials used by this goal"><h3>Materials used by this goal</h3>{usage.entries.map(entry => {
    const kind = entry.slot === "jd" ? "Primary JD" : entry.slot === "resume" ? "Primary resume" : "Supplementary material";
    const label = documents.find(doc => doc.id === entry.documentId)?.displayName ?? `${kind} (${entry.documentId})`;
    return <div key={entry.documentId}><span>{kind} · {label}</span>{" "}
      <button type="button" className="text-action" disabled={usage.disabled} aria-label={`Stop using for this goal: ${label}`} onClick={() => setConfirming(entry)}>Stop using for this goal</button>
      {confirming?.documentId === entry.documentId && <div><p>After confirmation, future changes to this goal will exclude “{label}”. The material stays in your library. Existing paths, completion records and historical evidence are retained.</p>
        <button type="button" disabled={usage.disabled} onClick={() => { setConfirming(null); void usage.detach(entry); }}>Confirm removal from this goal</button>
        <button type="button" disabled={usage.disabled} onClick={() => setConfirming(null)}>Keep using this material</button></div>}
    </div>;
  })}</section>;
}
function OwnedMaterialLibrary({ ownerId, capabilities, client = documentsClient, onSelect, currentUse }: LibraryProps) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]); const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<LibraryEditor | null>(null);
  const [message, setMessage] = useState<string | null>(null); const [deletion, setDeletion] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const openEpoch = useRef(0);
  useEffect(() => {
    const currentEpoch = openEpoch;
    let active = true;
    queueMicrotask(() => { if (active) {
      setSelected(readSetupDraft(`user:${ownerId}`, "material-library", libraryEditorSchema));
      setDeletion(readSetupDraft(`user:${ownerId}`, "material-library-deletion", deletionRecoverySchema)?.deletionJobId ?? null);
    } });
    return () => { active = false; currentEpoch.current++; };
  }, [ownerId]);
  function selectEditor(value: LibraryEditor | null) {
    if (value) writeSetupDraft(`user:${ownerId}`, "material-library", libraryEditorSchema, value);
    else removeSetupDraft(`user:${ownerId}`, "material-library");
    setSelected(value);
  }
  useEffect(() => {
    const controller = new AbortController();
    void client.request("listDocuments", { limit: 30 }, controller.signal).then(result => { if (!controller.signal.aborted) setDocuments(result.documents); }).catch(() => { if (!controller.signal.aborted) setMessage("The material list is temporarily unavailable. Try again later."); });
    return () => controller.abort();
  }, [client, refresh]);
  async function open(row: DocumentRow) {
    const epoch = ++openEpoch.current; selectEditor(null);
    setMessage(null);
    try {
      const response = await client.request("readDocument", { documentId: row.id });
      if (epoch !== openEpoch.current) return;
      selectEditor({ kind: row.kind, editorKey: `editor-${crypto.randomUUID()}`, ref: { documentId: row.id, documentVersionId: response.version.id, textVersionId: response.version.textVersionId, revision: response.document.revision } });
    } catch { if (epoch === openEpoch.current) setMessage("This material could not be read. It may have been revoked or deleted."); }
  }
  async function remove(row: DocumentRow) {
    setMessage(null);
    try {
      const result = await client.request("deleteDocument", { documentId: row.id, expectedRevision: row.revision, mutationId: `delete-${crypto.randomUUID()}` });
      setDeletion(result.deletionJobId);
      writeSetupDraft(`user:${ownerId}`, "material-library-deletion", deletionRecoverySchema, { deletionJobId: result.deletionJobId });
      setDeleting(null); selectEditor(null); setRefresh(value => value + 1);
      setMessage("Material references were revoked. Retained copies are being cleaned up.");
    } catch { setMessage("Deletion is not yet confirmed. Reload the list and check again."); }
  }
  async function checkDeletion() {
    if (!deletion) return;
    try {
      const result = await client.request("readDocumentDeletion", { deletionJobId: deletion });
      setMessage(result.state === "completed" ? "The material and its registered derived copies have been cleaned up." : result.state === "failed" ? "Cleanup is not finished. The background process will retry; the material can no longer be referenced." : "Material copies are being cleaned up and can no longer be referenced.");
      if (result.state === "completed") { setDeletion(null); removeSetupDraft(`user:${ownerId}`, "material-library-deletion"); }
    } catch { setMessage("Cleanup status is temporarily unavailable."); }
  }
  return <section className="material-library" aria-label="Private material library"><h2>Private material library</h2><p>Only this account can read these materials. Choose a version explicitly; updating a material does not automatically change your plan.</p>
    <button type="button" className="text-action" onClick={() => setRefresh(value => value + 1)}>Refresh material list</button>
    {currentUse && <CurrentGoalUse key={currentUse.key} usage={currentUse} documents={documents} />}
    {capabilities.documentsEnabled && <div className="material-actions">{(["resume", "jd", "supplement"] as const).map(kind => <button key={kind} type="button" onClick={() => { openEpoch.current++; selectEditor({ kind, ref: null, editorKey: `editor-${crypto.randomUUID()}` }); }}>Add {kind === "resume" ? "Resume" : kind === "jd" ? "JD" : "Supplementary material"}</button>)}</div>}
    {!documents.length && <p>No materials saved yet.</p>}
    <ul>{documents.map(row => <li key={row.id}><strong>{row.displayName}</strong><span> · {row.lifecycle === "active" ? "Available" : "Revoked"}</span>
      <button className="text-action" type="button" disabled={row.lifecycle !== "active"} onClick={() => void open(row)}>View and review {row.displayName}</button>
      {row.lifecycle === "active" && <button className="text-action" type="button" onClick={() => setDeleting(row.id)}>Delete {row.displayName}</button>}
      {deleting === row.id && <div><p>Deleting stops use of all versions and their evidence. Generated learning tasks and progress records are retained.</p><button type="button" onClick={() => void remove(row)}>Confirm material deletion</button><button type="button" className="text-action" onClick={() => setDeleting(null)}>Back</button></div>}
    </li>)}</ul>
    {selected && <div><MaterialTextPanel key={selected.editorKey} kind={selected.kind} capabilities={capabilities} client={client}
      value={selected.ref} onChange={ref => { selectEditor({ ...selected, ref }); setRefresh(value => value + 1); }}
      reuseScopeKey={currentUse?.key ?? "library"}
      onUseConfirmedVersion={onSelect && !currentUse?.disabled ? ref => onSelect(selected.kind, ref) : undefined}
      recoveryScope={{ ownerId: `user:${ownerId}`, scopeKey: `library:${selected.editorKey}` }} />
      <button type="button" className="text-action" onClick={() => selectEditor(null)}>Close material</button></div>}
    {deletion && <button type="button" onClick={() => void checkDeletion()}>Check deletion cleanup status</button>}
    {message && <p role="status">{message}</p>}
  </section>;
}
