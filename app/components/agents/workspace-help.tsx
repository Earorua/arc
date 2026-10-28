"use client";

import { CompanionAvatar } from "./agent-companion";
import { useOptionalLearningAgents } from "./agent-context";

export function WorkspaceHelp() {
  const agents = useOptionalLearningAgents();
  if (!agents?.authenticated || agents.authPending || agents.view === "hidden") return null;
  return <button type="button" className="workspace-help" data-companion-trigger
    aria-label="打开学习伙伴" aria-expanded={agents.view === "chat"}
    onClick={() => agents.setView(agents.view === "chat" ? "pet" : "chat")}>
    <CompanionAvatar thinking={agents.busy} /><span>学习伙伴</span>
  </button>;
}
