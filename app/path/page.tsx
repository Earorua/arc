"use client";

import { useEffect, useState } from "react";
import { flagshipRole } from "../data/flagship-role";
import { PhaseRail } from "../components/workspace/phase-rail";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { createDemoState, loadDemoState, type DemoState } from "../lib/demo-store";
import { formatWeeklyBudget, getRoleDisplayName, redistributePhaseWeeks } from "../lib/personalized-plan";

export default function PathPage() {
  const [state, setState] = useState<DemoState>(createDemoState());

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => setState(loadDemoState()), 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  const { roleId, targetWeeks, weeklyMinutes } = state.setup;
  const role = getRoleDisplayName(roleId);
  const budget = formatWeeklyBudget(weeklyMinutes);
  const phases = redistributePhaseWeeks(flagshipRole.phases, targetWeeks);
  const isCustomRole = roleId !== flagshipRole.id;

  return (
    <WorkspaceShell current="Path" context={`${role} · ${targetWeeks} weeks`}>
      <section className="workspace-intro">
        <p className="eyebrow" lang="en">{role} · {targetWeeks} weeks · {budget}</p>
        <h1 lang="en">Your precise path.</h1>
        <p>
          {isCustomRole
            ? "岗位名称与时间约束已保留，但当前技能内容仍使用 AI 原生全栈旗舰样本；Product Intelligence 接入后才会研究并替换技能地图。"
            : "每个阶段只承担一个明确结果；时间变化时，后续路线重新分配但历史保持不变。"}
        </p>
      </section>
      <PhaseRail phases={phases} />
    </WorkspaceShell>
  );
}
