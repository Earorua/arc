import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { SetupFlow } from "../../app/components/setup/setup-flow";
import { AdaptiveSetupFlow } from "../../app/components/setup/adaptive-setup-flow";
import { AdaptivePath } from "../../app/components/workspace/adaptive-path";
import { MaterialLibrary } from "../../app/components/materials/material-library";
import { MaterialHistory } from "../../app/components/materials/material-history";
import { documentsClient } from "../../app/lib/documents-client";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import type { PlanningWorkspace } from "../../app/contracts/planning";
import type { DocumentCapabilities } from "../../app/contracts/document-capabilities";
import { setOfflineOwner } from "../offline-uat/browser-runtime";
import "../../app/globals.css";
import "../../app/components/setup/setup-refinement.css";
import "../../app/components/materials/materials.css";

function App() {
  const [owner, setOwner] = useState(() => sessionStorage.getItem("materials-uat-owner") === "owner-b" ? "owner-b" : "owner-a"); const [epoch, setEpoch] = useState(0);
  const [workspace, setWorkspace] = useState<PlanningWorkspace | null>(null); const [library, setLibrary] = useState(false);
  const [caps, setCaps] = useState<DocumentCapabilities | null>(null);
  useEffect(() => { setOfflineOwner(owner); void documentsClient.capabilities().then(setCaps); }, [owner, epoch]);
  async function control(body: unknown) {
    await fetch("/__materials/control", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }
  return <main className="setup-page" id="main-content"><aside style={{ padding: "1rem", border: "2px solid #8f7e64" }}>
    <strong>阶段 1 离线验收 · 固定模拟候选，真实模型调用为零</strong>
    <label>测试账户<select value={owner} onChange={async event => { const next = event.target.value; await control({ owner: next }); sessionStorage.setItem("materials-uat-owner", next); setOwner(next); setWorkspace(null); setEpoch(value => value + 1); }}><option>owner-a</option><option>owner-b</option></select></label>
    <label>分析场景<select defaultValue="success" onChange={async event => { await control({ mode: event.target.value }); setEpoch(value => value + 1); }}><option value="success">成功预填</option><option value="failure">候选无效</option><option value="unknown">费用未知</option><option value="disabled">分析关闭</option></select></label>
    <button type="button" onClick={() => setLibrary(value => !value)}>{library ? "返回设置" : "打开私人资料库"}</button>
    <button type="button" onClick={() => void control({ maintain: true })}>执行本地清理</button>
  </aside>
  {library && caps ? <MaterialLibrary key={owner} ownerId={owner} capabilities={caps} /> : workspace ? <>
    <h1>资料辅助路线已保存</h1><AdaptivePath workspace={workspace} blueprint={flagshipBlueprint} registry={flagshipUnitRegistry} />
    <MaterialHistory ownerId={owner} goalId={workspace.goalId} />
  </> : <SetupFlow key={`${owner}:${epoch}`} draftOwner={`user:${owner}`} signedIn onComplete={() => undefined} renderAdaptive={({ active, onBackToRole, source }) =>
    <AdaptiveSetupFlow active={active} source={source} draftOwner={`user:${owner}`} savesToAccount blueprint={flagshipBlueprint} registry={flagshipUnitRegistry}
      now={() => new Date()} timeZone="Asia/Shanghai" createMutationId={() => `generate-${crypto.randomUUID()}`} onBackToRole={onBackToRole}
      navigate={() => undefined} generate={async input => { try { const result = await documentsClient.request("generatePlanning", input); setWorkspace(result.result.workspace); return true; } catch { return false; } }} />
  } />}
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
