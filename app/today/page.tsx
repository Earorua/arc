"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TodaySession } from "../components/today/today-session";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipRole } from "../data/flagship-role";
import { completeDemoUnit, createDemoState, loadDemoState, saveDemoState, type DemoState } from "../lib/demo-store";
import { constrainTodayUnit, getRoleDisplayName } from "../lib/personalized-plan";

export default function TodayPage() {
  const router = useRouter();
  const [state, setState] = useState<DemoState>(createDemoState());

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => setState(loadDemoState()), 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  const unit = constrainTodayUnit(flagshipRole.today, state.setup.weeklyMinutes);
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
      <TodaySession onComplete={complete} unit={unit} />
    </WorkspaceShell>
  );
}
