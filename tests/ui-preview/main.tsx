import { createRoot } from "react-dom/client";
import "@fontsource-variable/jost";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource-variable/noto-serif-sc";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/newsreader/wght-italic.css";
import "../../app/globals.css";
import "../../app/components/agents/agents.css";
import "../../app/components/today/today-refinement.css";
import "../../app/components/setup/setup-refinement.css";
import "../../app/components/workspace/workspace-refinement.css";
import "../../app/ui-refinement.css";
import "../../app/discovery-theme.css";
import Home from "../../app/page";
import { LearningAgentsProvider, AgentPageFrame } from "../../app/components/agents/agent-context";
import { AgentCompanion } from "../../app/components/agents/agent-companion";
import { LearningCoach } from "../../app/components/agents/learning-coach";
import { WorkspaceShell } from "../../app/components/workspace/workspace-shell";
import { AdaptiveTodaySession } from "../../app/components/today/adaptive-today-session";
import { AdaptivePath } from "../../app/components/workspace/adaptive-path";
import { StackBrowser } from "../../app/components/stack/stack-browser";
import { ProofWorkspace } from "../../app/components/proof/proof-workspace";
import { ProofProfile } from "../../app/components/proof/proof-profile";
import { createDemoState } from "../../app/lib/demo-store";
import { setOfflineOwner, usePathname } from "../offline-uat/browser-runtime";
import { fixture, proof } from "./data";

window.fetch = async () => new Response(JSON.stringify({ error: "Local visual preview only" }), { status: 404, headers: { "content-type": "application/json" } });
setOfflineOwner(window.location.pathname === "/" ? null : "owner-a");
const noSave = async () => false;
function App() {
  const path = usePathname();
  const current = path === "/path" ? "Path" : path === "/stack" ? "Stack" : path === "/proof" ? "Proof" : "Today";
  const { blueprint, registry } = fixture.sourceContext;
  return <LearningAgentsProvider><a className="skip-link" href="#main-content">跳到主要内容</a><AgentPageFrame>
    {path === "/" ? <Home /> : path === "/coach" ? <LearningCoach /> : <WorkspaceShell current={current} state={createDemoState()} planningState={fixture.workspace} roleName={blueprint.name}>
      {current === "Today" ? <AdaptiveTodaySession workspace={fixture.workspace} blueprint={blueprint} registry={registry} now={() => new Date("2026-10-28T10:00:00Z")} record={noSave} accept={noSave} discard={noSave} />
        : current === "Path" ? <AdaptivePath workspace={fixture.workspace} blueprint={blueprint} registry={registry} />
        : current === "Stack" ? <><section className="workspace-intro"><p className="eyebrow">SKILLS & SOURCES</p><h1>知道为什么学，也知道学到哪里。</h1></section><StackBrowser blueprint={blueprint} projections={proof.projections} evidence={[]} /></>
        : <><section className="workspace-intro"><p className="eyebrow">PROOF OF WORK</p><h1>作品证据</h1><p>让作品说明你会做什么。</p></section><ProofWorkspace workspace={proof} projections={proof.projections} skills={blueprint.skills} dailyUnits={fixture.workspace.dailyUnits} source="local" recovery="none" canUpload={false} createProof={noSave} reviseProof={noSave} setVisibility={noSave} withdrawProof={noSave} retry={async () => undefined} /><ProofProfile projections={proof.projections} skills={blueprint.skills} /></>}
    </WorkspaceShell>}
    <p style={{ margin: "0 24px 16px", fontSize: 12, color: "#696359" }}>本地视觉预览 · 合成样例数据 · 操作不会保存或调用模型</p>
  </AgentPageFrame><AgentCompanion /></LearningAgentsProvider>;
}
createRoot(document.getElementById("root")!).render(<App />);
