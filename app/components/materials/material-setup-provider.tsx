"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { DocumentCapabilities } from "../../contracts/document-capabilities";
import type { SkillSelfLevel } from "../../contracts/planning";
import { documentsClient, type DocumentsClient } from "../../lib/documents-client";
import { useMaterialSelection } from "../../lib/use-material-selection";
import type { AdoptedMaterialScope } from "../../lib/material-workspace-draft";
import { MaterialTextPanel } from "./material-text-panel";
import { MaterialLibrary } from "./material-library";
import { removeSetupDraft } from "../setup/setup-draft";

type MaterialSetupState = ReturnType<typeof useMaterialSelection> & {
  capabilities: DocumentCapabilities | null; client: DocumentsClient; ownerId: string | null; scopeKey: string;
  editorEpochs: { resume: number; jd: number };
  replaceSlot: ReturnType<typeof useMaterialSelection>["setSlot"];
};
const MaterialSetupContext = createContext<MaterialSetupState | null>(null);
export const useMaterialSetup = () => useContext(MaterialSetupContext);
type MaterialSetupProps = { ownerId: string | null; scopeKey: string; workspace?: AdoptedMaterialScope; workspaceRevision?: number; children: ReactNode; client?: DocumentsClient };
export function MaterialSetupProvider(props: MaterialSetupProps) {
  const { ownerId, scopeKey, workspace } = props;
  return <OwnedMaterialSetupProvider key={JSON.stringify([ownerId, scopeKey, workspace?.workspaceId, workspace?.baseVersionId])} {...props} />;
}
function OwnedMaterialSetupProvider({ ownerId, scopeKey, workspace, workspaceRevision, children, client = documentsClient }: MaterialSetupProps) {
  const [capabilities, setCapabilities] = useState<DocumentCapabilities | null>(null);
  const state = useMaterialSelection({ ownerId: ownerId ? `user:${ownerId}` : null, scopeKey, workspace, workspaceRevision, client,
    enabled: !workspace || Boolean(capabilities?.hasDocuments || (capabilities?.documentsEnabled && capabilities.planningEnabled)) });
  const [editorEpochs, setEditorEpochs] = useState({ resume: 0, jd: 0 });
  const replaceSlot: MaterialSetupState["replaceSlot"] = (slot, ref) => {
    removeSetupDraft(ownerId ? `user:${ownerId}` : undefined, `material-save:${scopeKey}:${slot}:${slot}`);
    state.setSlot(slot, ref); setEditorEpochs(current => ({ ...current, [slot]: current[slot] + 1 }));
  };
  useEffect(() => {
    if (!ownerId) return;
    const controller = new AbortController();
    void client.capabilities(controller.signal).then(value => { if (!controller.signal.aborted) setCapabilities(value); }).catch(() => undefined);
    return () => controller.abort();
  }, [client, ownerId]);
  return <MaterialSetupContext.Provider value={{ ...state, capabilities, client, ownerId, scopeKey, editorEpochs, replaceSlot }}>{children}</MaterialSetupContext.Provider>;
}
export function MaterialSetupSlot({ kind, skills, onAdoptLevels, disabled }: {
  kind: "resume" | "jd"; skills?: readonly { id: string; name: string }[];
  onAdoptLevels?: (levels: Record<string, SkillSelfLevel>) => void; disabled?: boolean;
}) {
  const state = useMaterialSetup();
  if (!state?.ready || !state.capabilities?.documentsEnabled) return null;
  return <div className="material-setup-slot"><MaterialTextPanel key={`${kind}:${state.editorEpochs[kind]}`} kind={kind} capabilities={state.capabilities} client={state.client}
    value={state.refs.slots[kind] ?? null} onChange={ref => state.setSlot(kind, ref)} skills={skills} onAdoptLevels={onAdoptLevels} disabled={disabled}
    recoveryScope={state.ownerId ? { ownerId: `user:${state.ownerId}`, scopeKey: `${state.scopeKey}:${kind}` } : undefined} />
    {state.refs.slots[kind] && <button className="text-action" type="button" disabled={disabled} onClick={() => state.replaceSlot(kind, null)}>本次不使用这份{kind === "resume" ? "简历" : "JD"}</button>}</div>;
}
export function MaterialSelectionSummary({ disabled = false }: { disabled?: boolean }) {
  const state = useMaterialSetup();
  const entries = state ? Object.entries(state.refs.slots) : [];
  if (!state?.capabilities?.documentsEnabled || (!entries.length && !state.refs.supplements.length)) return null;
  return <section className="material-selection-summary" aria-label="本次资料选择"><h2>本次采用的资料</h2><ul>{entries.map(([kind, ref]) => <li key={kind}>{kind === "resume" ? "简历" : "岗位 JD"} · {ref.confirmationId ? "事实已确认" : "待核对确认"}<button className="text-action" type="button" disabled={disabled} onClick={() => state.replaceSlot(kind as "resume" | "jd", null)}>移除{kind === "resume" ? "简历" : "JD"}选择</button></li>)}</ul><p>采用指定版本；之后修改原资料不会自动替换这次选择。</p></section>;
}

export function MaterialSetupLibrary() {
  const state = useMaterialSetup(); const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!state?.ownerId || !state.capabilities?.documentsEnabled) return null;
  return <div className="material-setup-library"><button className="text-action" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>从私人资料库选择</button>
    {open && <MaterialLibrary ownerId={state.ownerId} capabilities={state.capabilities} client={state.client} onSelect={(kind, ref) => {
      if (kind === "supplement") {
        const others = state.refs.supplements.filter(item => item.documentId !== ref.documentId);
        if (others.length >= 3) { setMessage("最多采用三份补充资料，请先移除一份。"); return; }
        state.setSupplements([...others, ref]);
      } else state.replaceSlot(kind, ref);
      setMessage("已采用确认版本。"); setOpen(false);
    }} />}
    {state.refs.supplements.map(ref => <p key={ref.documentId}>已采用补充资料<button type="button" className="text-action" onClick={() => state.setSupplements(state.refs.supplements.filter(item => item.documentId !== ref.documentId))}>移除这份补充资料</button></p>)}
    {message && <p role="status">{message}</p>}</div>;
}
