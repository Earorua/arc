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
  return <section aria-label="当前目标采用的资料"><h3>当前目标采用的资料</h3>{usage.entries.map(entry => {
    const kind = entry.slot === "jd" ? "主 JD" : entry.slot === "resume" ? "主简历" : "补充资料";
    const label = documents.find(doc => doc.id === entry.documentId)?.displayName ?? `${kind}（${entry.documentId}）`;
    return <div key={entry.documentId}><span>{kind} · {label}</span>{" "}
      <button type="button" className="text-action" disabled={usage.disabled} aria-label={`从当前目标取消使用 ${label}`} onClick={() => setConfirming(entry)}>从当前目标取消使用</button>
      {confirming?.documentId === entry.documentId && <div><p>确认后，今后调整这个目标时会移除《{label}》。资料仍保存在资料库，已有路线、完成记录和历史依据会保留。</p>
        <button type="button" disabled={usage.disabled} onClick={() => { setConfirming(null); void usage.detach(entry); }}>确认从当前目标取消使用</button>
        <button type="button" disabled={usage.disabled} onClick={() => setConfirming(null)}>保留采用</button></div>}
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
    void client.request("listDocuments", { limit: 30 }, controller.signal).then(result => { if (!controller.signal.aborted) setDocuments(result.documents); }).catch(() => { if (!controller.signal.aborted) setMessage("资料列表暂不可用，请稍后重试。"); });
    return () => controller.abort();
  }, [client, refresh]);
  async function open(row: DocumentRow) {
    const epoch = ++openEpoch.current; selectEditor(null);
    setMessage(null);
    try {
      const response = await client.request("readDocument", { documentId: row.id });
      if (epoch !== openEpoch.current) return;
      selectEditor({ kind: row.kind, editorKey: `editor-${crypto.randomUUID()}`, ref: { documentId: row.id, documentVersionId: response.version.id, textVersionId: response.version.textVersionId, revision: response.document.revision } });
    } catch { if (epoch === openEpoch.current) setMessage("无法读取这份资料，可能已撤销或删除。"); }
  }
  async function remove(row: DocumentRow) {
    setMessage(null);
    try {
      const result = await client.request("deleteDocument", { documentId: row.id, expectedRevision: row.revision, mutationId: `delete-${crypto.randomUUID()}` });
      setDeletion(result.deletionJobId);
      writeSetupDraft(`user:${ownerId}`, "material-library-deletion", deletionRecoverySchema, { deletionJobId: result.deletionJobId });
      setDeleting(null); selectEditor(null); setRefresh(value => value + 1);
      setMessage("资料已撤销引用，正在清理保留的副本。");
    } catch { setMessage("删除结果尚未确认，请重新读取列表后查询。"); }
  }
  async function checkDeletion() {
    if (!deletion) return;
    try {
      const result = await client.request("readDocumentDeletion", { deletionJobId: deletion });
      setMessage(result.state === "completed" ? "资料及已登记的派生副本已清理完成。" : result.state === "failed" ? "清理暂未完成，后台会继续尝试。资料已不可引用。" : "正在清理资料副本，资料已不可引用。");
      if (result.state === "completed") { setDeletion(null); removeSetupDraft(`user:${ownerId}`, "material-library-deletion"); }
    } catch { setMessage("暂时无法查询清理状态。"); }
  }
  return <section className="material-library" aria-label="私人资料库"><h2>私人资料库</h2><p>只有当前账户可读取。你可以明确选择某个版本，更新资料不会自动改动计划。</p>
    <button type="button" className="text-action" onClick={() => setRefresh(value => value + 1)}>刷新资料列表</button>
    {currentUse && <CurrentGoalUse key={currentUse.key} usage={currentUse} documents={documents} />}
    {capabilities.documentsEnabled && <div className="material-actions">{(["resume", "jd", "supplement"] as const).map(kind => <button key={kind} type="button" onClick={() => { openEpoch.current++; selectEditor({ kind, ref: null, editorKey: `editor-${crypto.randomUUID()}` }); }}>新增{kind === "resume" ? "简历" : kind === "jd" ? "JD" : "补充资料"}</button>)}</div>}
    {!documents.length && <p>还没有保存的资料。</p>}
    <ul>{documents.map(row => <li key={row.id}><strong>{row.displayName}</strong><span> · {row.lifecycle === "active" ? "可查看" : "已撤销"}</span>
      <button className="text-action" type="button" disabled={row.lifecycle !== "active"} onClick={() => void open(row)}>查看并核对 {row.displayName}</button>
      {row.lifecycle === "active" && <button className="text-action" type="button" onClick={() => setDeleting(row.id)}>删除 {row.displayName}</button>}
      {deleting === row.id && <div><p>删除后，所有版本和资料依据将停止使用；已生成的学习任务及记录保留。</p><button type="button" onClick={() => void remove(row)}>确认删除这份资料</button><button type="button" className="text-action" onClick={() => setDeleting(null)}>返回</button></div>}
    </li>)}</ul>
    {selected && <div><MaterialTextPanel key={selected.editorKey} kind={selected.kind} capabilities={capabilities} client={client}
      value={selected.ref} onChange={ref => { selectEditor({ ...selected, ref }); setRefresh(value => value + 1); }}
      reuseScopeKey={currentUse?.key ?? "library"}
      onUseConfirmedVersion={onSelect && !currentUse?.disabled ? ref => onSelect(selected.kind, ref) : undefined}
      recoveryScope={{ ownerId: `user:${ownerId}`, scopeKey: `library:${selected.editorKey}` }} />
      <button type="button" className="text-action" onClick={() => selectEditor(null)}>关闭资料</button></div>}
    {deletion && <button type="button" onClick={() => void checkDeletion()}>查询删除清理状态</button>}
    {message && <p role="status">{message}</p>}
  </section>;
}
