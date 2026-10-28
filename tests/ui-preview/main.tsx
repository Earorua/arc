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
import "../../app/experience-theme.css";
import Home from "../../app/page";
import { LearningAgentsProvider, AgentPageFrame } from "../../app/components/agents/agent-context";
import { AgentCompanion } from "../../app/components/agents/agent-companion";
import { LearningCoach } from "../../app/components/agents/learning-coach";
import Today from "../../app/today/page";
import Path from "../../app/path/page";
import Stack from "../../app/stack/page";
import Proof from "../../app/proof/page";
import Setup from "../../app/setup/page";
import SignIn from "../../app/sign-in/page";
import History from "../../app/history/page";
import Method from "../../app/method/page";
import Showcase from "../../app/showcase/page";
import Admin from "../../app/admin/page";
import NotFound from "../../app/not-found";
import { setOfflineOwner, usePathname } from "../offline-uat/browser-runtime";
import { fixture } from "./data";
import { getPathProgress } from "../../app/lib/planning/path-progress";

// The actual page components run against synthetic controllers. No external requests.
window.fetch = async (input) => {
  const url = new URL(String(input), window.location.origin);
  const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  if (url.pathname === "/api/auth/providers") return response({ providers: ["google", "github"] });
  if (url.pathname === "/api/admin/health") return response({}, 403);
  if (url.pathname === "/api/planning/history") {
    const { completedUnits, totalUnits } = getPathProgress(fixture.workspace);
    return response(url.searchParams.has("goal") ? { workspace: fixture.workspace, sourceContext: fixture.sourceContext } : { goals: [{ id: "history-preview", roleId: fixture.sourceContext.blueprint.name, targetWeeks: 18, weeklyMinutes: 420, createdAt: Date.parse("2026-10-01"), hasWorkspace: true, progress: { completedUnits, totalUnits } }], nextOffset: null });
  }
  return response({ error: "Local visual preview only" }, 404);
};
const publicPages = ["/", "/sign-in", "/method", "/showcase", "/not-found"];
setOfflineOwner(publicPages.includes(window.location.pathname) || new URLSearchParams(window.location.search).get("guest") === "1" ? null : "owner-a");
const pages: Record<string, () => React.ReactNode> = { "/": Home, "/today": Today, "/path": Path, "/stack": Stack, "/proof": Proof, "/coach": LearningCoach, "/setup": Setup, "/sign-in": SignIn, "/history": History, "/method": Method, "/showcase": Showcase, "/admin": Admin, "/not-found": NotFound };
function App() {
  const pathname = usePathname();
  const Page = pages[pathname] ?? NotFound;
  return <LearningAgentsProvider><a className="skip-link" href="#main-content">跳到主要内容</a><AgentPageFrame>
    <Page />
    <p style={{ margin: "0 24px 100px", fontSize: 12, color: "#696359" }}>本地验收 · 合成数据 · 不保存业务数据或调用模型</p>
  </AgentPageFrame><AgentCompanion /></LearningAgentsProvider>;
}
createRoot(document.getElementById("root")!).render(<App />);
