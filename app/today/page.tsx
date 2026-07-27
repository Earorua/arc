"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TodaySession } from "../components/today/today-session";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipRole } from "../data/flagship-role";
import { completeDemoUnit, loadDemoState, saveDemoState } from "../lib/demo-store";
import { assessTodayBudget } from "../lib/personalized-plan";
import { useDemoState } from "../lib/use-demo-state";

export default function TodayPage() {
  const router = useRouter();
  const state = useDemoState();
  const [completionError, setCompletionError] = useState<string | null>(null);

  if (state === null) return <WorkspaceShell current="Today" state={null} />;

  const budget = assessTodayBudget(flagshipRole.today, state.setup.weeklyMinutes);

  const complete = (unit: typeof flagshipRole.today) => {
    const saved = saveDemoState(completeDemoUnit(loadDemoState(), unit));

    if (!saved) {
      setCompletionError("完成记录未能保存，请检查浏览器存储设置后重试。");
      return false;
    }

    setCompletionError(null);
    router.push("/proof");
    return true;
  };

  return (
    <WorkspaceShell current="Today" state={state}>
      {!budget.fits && (
        <p className="workspace-notice" role="status">
          本单元预计{budget.estimatedMinutes}分钟，超出当前每周{budget.weeklyMinutes}分钟预算{budget.shortfallMinutes}分钟；
          <Link href="/setup">返回 Setup 调整预算</Link>。
        </p>
      )}
      {completionError && (
        <p className="workspace-notice" role="alert">
          {completionError}
        </p>
      )}
      <TodaySession onComplete={complete} unit={flagshipRole.today} />
    </WorkspaceShell>
  );
}
