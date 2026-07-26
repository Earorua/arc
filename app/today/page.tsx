"use client";

import { useRouter } from "next/navigation";
import { TodaySession } from "../components/today/today-session";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipRole } from "../data/flagship-role";
import { completeDemoUnit, loadDemoState, saveDemoState } from "../lib/demo-store";

export default function TodayPage() {
  const router = useRouter();

  const complete = (unit: typeof flagshipRole.today) => {
    saveDemoState(completeDemoUnit(loadDemoState(), unit));
    router.push("/proof");
  };

  return (
    <WorkspaceShell current="Today">
      <TodaySession onComplete={complete} unit={flagshipRole.today} />
    </WorkspaceShell>
  );
}
