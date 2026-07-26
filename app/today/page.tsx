"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TodaySession } from "../components/today/today-session";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipRole } from "../data/flagship-role";
import { completeDemoUnit, createDemoState, loadDemoState, saveDemoState, type DemoState } from "../lib/demo-store";
import { assessTodayBudget, getRoleDisplayName } from "../lib/personalized-plan";

export default function TodayPage() {
  const router = useRouter();
  const [state, setState] = useState<DemoState>(createDemoState());

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => setState(loadDemoState()), 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  const budget = assessTodayBudget(flagshipRole.today, state.setup.weeklyMinutes);
  const role = getRoleDisplayName(state.setup.roleId);
  const isCustomRole = state.setup.roleId !== flagshipRole.id;

  const complete = (unit: typeof flagshipRole.today) => {
    saveDemoState(completeDemoUnit(loadDemoState(), unit));
    router.push("/proof");
  };

  return (
    <WorkspaceShell current="Today" context={`${role} · ${state.setup.targetWeeks} weeks`}>
      {isCustomRole && (
        <p className="workspace-notice">
          当前学习单元仍使用 AI 原生全栈旗舰样本；Product Intelligence 接入后才会研究并替换该岗位内容。
        </p>
      )}
      {!budget.fits && (
        <p className="workspace-notice" role="status">
          本单元预计{budget.estimatedMinutes}分钟，超出当前每周{budget.weeklyMinutes}分钟预算{budget.shortfallMinutes}分钟；
          <Link href="/setup">返回 Setup 调整预算</Link>。
        </p>
      )}
      <TodaySession onComplete={complete} unit={flagshipRole.today} />
    </WorkspaceShell>
  );
}
