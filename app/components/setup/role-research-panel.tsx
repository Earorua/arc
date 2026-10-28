"use client";

import Link from "next/link";
import { signInHref } from "../../lib/navigation-context";
import { useAccountLocation } from "../account/use-account-location";
import { useEffect, useRef } from "react";
import type { ResearchIssueCode, ResearchPublicFailureCategory } from "../../contracts/research";
import type { RoleResearchController } from "../../lib/use-role-research";
import { isFlagshipRoleInput } from "./setup-flow";

const issueCopy: Record<ResearchIssueCode, string> = {
  "invalid-schema": "研究结果的结构需要补充并保持一致。",
  "invalid-graph": "技能先修关系需要复核。",
  "invalid-registry": "学习单元需要复核。",
  "missing-skill-source": "部分技能缺少支持来源。",
  "missing-core-authority": "核心技能需要更可靠的支持来源。",
  "unsafe-url": "部分来源链接无法安全使用。",
  "unreferenced-url": "部分学习资源缺少引用来源。",
  "missing-free-alternative": "部分资源需要免费替代项。",
  "unverified-free-access": "部分学习材料的免费访问条件尚待确认。",
  "unverified-source-authority": "部分学习材料需要经核验的大学或官方发布方来源。",
  "missing-unit": "部分技能缺少可执行的学习单元。",
  "minute-mismatch": "部分学习步骤的时间估算需要核对。",
  "unsafe-content": "部分研究内容无法安全使用。",
};
const failureCopy: Record<ResearchPublicFailureCategory, string> = {
  timeout: "研究耗时超出预期。",
  "rate-limited": "研究服务繁忙，请稍后重试。",
  "allowance-reached": "本期研究额度已用完。",
  "service-unavailable": "研究服务暂时不可用。",
  "content-rejected": "本次研究结果无法安全使用。",
  "invalid-result": "本次研究未生成可用结果。",
  internal: "Arc 未能完成本次研究。",
};
const researchStages = [
  ["submitting", "提交研究"], ["queued", "等待处理"], ["researching", "研究技能与来源"],
  ["validating", "核验学习内容"], ["ready", "结果就绪"],
] as const;
const localizedErrors: Record<string, string> = {
  "Sign in to use Arc research.": "请登录后使用岗位研究。",
  "Research input is invalid.": "研究输入有误，请检查岗位名称。",
  "Research run was not found.": "未找到这次研究。",
  "Research state changed. Refresh and try again.": "研究状态已更新，请刷新后重试。",
  "Too many research requests. Try again shortly.": "研究请求过于频繁，请稍后重试。",
  "The current Research allowance has been reached.": "本期研究额度已用完。",
  "Research needs review before it can be used.": "研究结果需要复核后才能使用。",
  "Research is temporarily unavailable.": "研究服务暂时不可用。",
  "Arc could not complete this research request.": "Arc 未能完成本次研究请求。",
  "Arc returned an invalid research response.": "研究响应格式有误，请稍后查询状态。",
};
const labels = { idle: "岗位研究 · Beta", submitting: "正在提交研究", queued: "研究已排队", researching: "正在研究技能与来源", validating: "正在核验来源与学习单元", ready: "研究结果已就绪", "needs-review": "研究结果需要复核", failed: "研究暂不可用" };

export function RoleResearchPanel({ controller, role, eligible, onStart, onUse, onFlagship }: {
  controller: RoleResearchController; role: string; eligible: boolean;
  onStart(): void; onUse(runId: string): void; onFlagship(): void;
}) {
  const location = useAccountLocation();
  const { state, run, busy, error, requestId, restoring, recoveryUncertain, replacementPending } = controller;
  const heading = useRef<HTMLHeadingElement>(null);
  const announcementKey = `${state.kind}:${restoring}:${recoveryUncertain}:${replacementPending}`;
  const previous = useRef(announcementKey);
  useEffect(() => {
    if (previous.current !== announcementKey) heading.current?.focus();
    previous.current = announcementKey;
  }, [announcementKey]);
  const active = restoring || busy || ["submitting", "queued", "researching", "validating"].includes(state.kind);
  const backgroundAccepted = run?.backgroundAccepted === true
    && (run.state === "queued" || run.state === "researching" || run.state === "validating");
  const canStart = eligible && !run && !active && !replacementPending && role.trim().length >= 2 && role.trim().length <= 160
    && !isFlagshipRoleInput(role)
    && (!error || error.recovery === "retry" || error.recovery === "retry-or-flagship" || error.code === "INVALID_INPUT" || error.code === "NOT_FOUND");
  const headingText = replacementPending ? "确认发起新的研究？"
    : state.kind === "submitting" ? labels.submitting
      : recoveryUncertain && restoring ? "正在查询上一次研究…"
      : recoveryUncertain ? "上一次研究的状态尚未确认。"
        : restoring ? "正在恢复研究状态" : labels[state.kind];
  const terminal = run?.state === "needs-review" || run?.state === "failed";
  const showError = error && (error.name === "LocalResearchStorageError" || !recoveryUncertain && !terminal);
  return <section className="role-research-panel" aria-label="岗位研究">
    <div role="status" aria-live="polite" aria-busy={active}>
      <h2 ref={heading} tabIndex={-1}>{headingText}</h2>
      {!restoring && !recoveryUncertain && !replacementPending && researchStages.some(([kind]) => kind === state.kind) && <ol className="research-stages" aria-label="研究阶段">{researchStages.map(([kind, label]) => <li key={kind} aria-current={state.kind === kind ? "step" : undefined}><span>{label}</span></li>)}</ol>}
      {backgroundAccepted && <p>研究已在后台运行。你可以离开此页面，稍后回来查看进度。</p>}
      {state.kind === "idle" && !restoring && <p>岗位研究将根据可查阅的来源，为你整理技能清单与学习路径。</p>}
      {recoveryUncertain && <p>上一次研究可能仍在运行并产生费用。重新发起研究可能再次产生费用。</p>}
      {run?.state === "ready" && <div className="research-ready">
        <p>{run.role}</p><p>{run.summary}</p>
        <dl className="research-facts"><div><dt>技能</dt><dd>{run.skillCount} 项技能</dd></div><div><dt>来源</dt><dd>{run.sourceCount} 个来源</dd></div><div><dt>资料观察日期</dt><dd><time dateTime={run.observedAt}>{run.observedAt}</time></dd></div></dl>
        <p>质量检查已通过</p>
      </div>}
    </div>
    {run?.state === "needs-review" && <div role="alert"><ul>{run.quality.issueCodes.map((issue) => <li key={issue}>{issueCopy[issue]}</li>)}</ul></div>}
    {run?.state === "failed" && <p role="alert">{failureCopy[run.failureCategory]}</p>}
    {showError && <p role="alert">{error.name === "LocalResearchStorageError" ? "Arc 未能将恢复信息保存在此设备上。请允许设备存储后重试。" : localizedErrors[error.message] ?? error.message}</p>}
    {requestId && showError && <p className="research-request-id">请求编号： {requestId}</p>}
    <div className="setup-actions research-actions">
      {canStart && <button className="setup-next research-action" onClick={onStart} type="button">研究这个岗位</button>}
      {run?.state === "ready" && <button className="setup-next research-action" disabled={busy} onClick={() => onUse(run.id)} type="button">使用研究结果</button>}
      {run && !recoveryUncertain && !replacementPending && (run.state === "needs-review" || run.state === "failed") && run.retryable && eligible && <button className="setup-next research-action" disabled={busy} onClick={() => void controller.retry()} type="button">重试研究</button>}
      {replacementPending && <button className="setup-next research-action" disabled={busy} onClick={() => void controller.confirmReplacement()} type="button">发起新的研究</button>}
      {replacementPending && <button className="text-action research-action" disabled={busy} onClick={controller.cancelReplacement} type="button">继续查询上一次研究</button>}
      {recoveryUncertain && !replacementPending && <button className="text-action research-action" disabled={busy} onClick={() => void controller.refresh()} type="button">查询研究状态</button>}
      {!recoveryUncertain && error?.recovery === "refresh" && <button className="text-action research-action" disabled={busy} onClick={() => void controller.refresh()} type="button">刷新研究状态</button>}
      {error?.recovery === "sign-in" && <Link className="text-action research-action" href={signInHref(location, true)}>登录</Link>}
      <button className="text-action research-action" onClick={onFlagship} type="button">使用精选路径</button>
    </div>
  </section>;
}
