import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoleResearchPanel } from "../../app/components/setup/role-research-panel";
import type { RoleResearchController } from "../../app/lib/use-role-research";
import { createResearchClient, ResearchClientError } from "../../app/lib/research-client";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";

afterEach(cleanup);
const base: RoleResearchController = { state: { kind: "idle" }, run: null, planningData: null, error: null, requestId: null, busy: false, restoring: false, recoveryUncertain: false, replacementPending: false, start: vi.fn(), retry: vi.fn(), refresh: vi.fn(), confirmReplacement: vi.fn(), cancelReplacement: vi.fn(), reset: vi.fn() };
const identity = { id: "research-run-1", role: "Data Product Manager", locale: "en-US" as const, backgroundAccepted: false };
const backgroundGuidance = "研究已在后台运行。你可以离开此页面，稍后回来查看进度。";
const ready = { ...identity, state: "ready" as const, retryable: false as const, packageId: "package-one", summary: "Research grounded in observable product decisions.", skillCount: 3, sourceCount: 6, observedAt: "2026-09-05", quality: { passed: true as const, issueCodes: [] }, planningData: { id: "package-one", blueprint: flagshipBlueprint, registry: flagshipUnitRegistry } };
function props(controller = base) { return { controller, role: identity.role, eligible: true, onStart: vi.fn(), onUse: vi.fn(), onFlagship: vi.fn() }; }

describe("RoleResearchPanel", () => {
  it("marks only the reported research stage as current without fabricated progress", () => {
    const page = render(<RoleResearchPanel {...props({ ...base, state: { kind: "researching", runId: identity.id }, run: { ...identity, state: "researching", retryable: false } })} />);
    const stages = screen.getByRole("list", { name: "研究阶段" });
    expect(within(stages).getByText("研究技能与来源").closest("li")).toHaveAttribute("aria-current", "step");
    expect(stages.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(stages).not.toHaveTextContent(/%/);
    page.rerender(<RoleResearchPanel {...props({ ...base, state: { kind: "failed" }, recoveryUncertain: true })} />);
    expect(screen.queryByRole("list", { name: "研究阶段" })).not.toBeInTheDocument();
  });
  it.each(["queued", "researching", "validating"] as const)("announces server-accepted background %s in the existing polite status", (kind) => {
    const p = props();
    const page = render(<RoleResearchPanel {...p} />);
    page.rerender(<RoleResearchPanel {...p} controller={{ ...base, state: { kind, runId: identity.id },
      run: { ...identity, state: kind, retryable: false, backgroundAccepted: true } }} />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(within(status).getByText(backgroundGuidance)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
    expect(status).not.toHaveTextContent(/OpenRouter|provider|model|token|jobId|owner|executor|guaranteed/i);
    expect(screen.getByRole("button", { name: "使用精选路径" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "使用研究结果" })).not.toBeInTheDocument();
  });
  it.each(["queued", "researching", "validating"] as const)("does not infer background acceptance from busy or restoring %s", (kind) => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind, runId: identity.id }, busy: true, restoring: true,
      run: { ...identity, state: kind, retryable: false } })} />);
    expect(screen.queryByText(backgroundGuidance)).not.toBeInTheDocument();
  });
  it("does not claim background acceptance for an omitted legacy wire field", async () => {
    const client = createResearchClient({ fetch: async () => Response.json({ requestId: "request-legacy", run: {
      id: identity.id, role: identity.role, locale: identity.locale, state: "queued", retryable: false,
    } }) });
    const { run } = await client.getResearch(identity.id, new AbortController().signal);
    expect(run.backgroundAccepted).toBe(false);
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "queued", runId: run.id }, run })} />);
    expect(screen.queryByText(backgroundGuidance)).not.toBeInTheDocument();
  });
  it.each([
    { ...ready, backgroundAccepted: true },
    { ...identity, state: "failed" as const, failureCategory: "timeout" as const, retryable: true, backgroundAccepted: true },
    { ...identity, state: "needs-review" as const, retryable: true, backgroundAccepted: true,
      quality: { issueCodes: ["missing-unit" as const], skillCount: 3, sourceCount: 6, unitCount: 2 } },
  ])("uses the run state to hide background guidance for terminal $state even while the controller is busy", (run) => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "researching", runId: run.id },
      busy: true, restoring: true, run })} />);
    expect(screen.queryByText(backgroundGuidance)).not.toBeInTheDocument();
  });
  it.each(["ai-native-full-stack-engineer", " AI-NATIVE-FULL-STACK-ENGINEER ", "AI-Native Full-Stack Engineer", " ai-native   full-stack\tengineer ", "ＡＩ-Native Full-Stack Engineer", flagshipBlueprint.name, " ai　原生全栈工程师 "])("excludes only new starts for Flagship alias %s", async (role) => {
    const p = props(); const page = render(<RoleResearchPanel {...p} role={role} />);
    expect(screen.queryByRole("button", { name: "研究这个岗位" })).not.toBeInTheDocument();
    expect(p.onStart).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "使用精选路径" })).toBeInTheDocument();
    page.rerender(<RoleResearchPanel {...p} role={role} eligible={false} controller={{ ...base, state: { kind: "ready", runId: identity.id }, run: ready }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "使用研究结果" }));
    expect(p.onUse).toHaveBeenCalledWith(identity.id);
    const retry = vi.fn();
    page.rerender(<RoleResearchPanel {...p} role={role} controller={{ ...base, retry, state: { kind: "failed", runId: identity.id }, run: { ...identity, state: "failed", failureCategory: "timeout", retryable: true } }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "重试研究" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it.each(["Senior AI-Native Full-Stack Engineer", "AI 原生全栈工程师导师", "ai-native-full-stack-engineer-educator"])("does not fuzzy-match another role %s", (role) => {
    render(<RoleResearchPanel {...props()} role={role} />);
    expect(screen.getByRole("button", { name: "研究这个岗位" })).toBeInTheDocument();
  });
  it("requires an explicit keyboard action and keeps a Flagship fallback", async () => {
    const p = props(); const user = userEvent.setup(); render(<RoleResearchPanel {...p} />);
    const start = screen.getByRole("button", { name: "研究这个岗位" });
    start.focus(); await user.keyboard("{Enter}"); expect(p.onStart).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "使用精选路径" })).toHaveClass("research-action");
    expect(start).toHaveClass("research-action");
  });
  it.each(["submitting", "queued", "researching", "validating"] as const)("announces %s factually and focuses state changes", (kind) => {
    const p = props(); const { rerender } = render(<RoleResearchPanel {...p} />);
    rerender(<RoleResearchPanel {...p} controller={{ ...base, state: { kind, runId: identity.id }, busy: true }} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
    expect(screen.queryByText(backgroundGuidance)).not.toBeInTheDocument();
    expect(screen.queryByText(/%|confidence|OpenRouter|token|cost|model|provider/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "使用研究结果" })).not.toBeInTheDocument();
  });
  it("renders Ready facts as text and uses the owner run ID even with eligibility revoked", async () => {
    const p = props({ ...base, state: { kind: "ready", runId: identity.id }, run: { ...ready, summary: "<img src=x onerror=alert(1)> Research summary text." }, planningData: ready.planningData });
    const { container } = render(<RoleResearchPanel {...p} eligible={false} />);
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument(); expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("3 项技能")).toBeInTheDocument(); expect(screen.getByText("6 个来源")).toBeInTheDocument();
    expect(screen.getByText(/2026-09-05/)).toBeInTheDocument(); expect(screen.getByText("质量检查已通过")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "使用研究结果" })); expect(p.onUse).toHaveBeenCalledWith(identity.id);
  });
  it("explains conditional free access without offering plan activation", () => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "needs-review", runId: identity.id }, run: { ...identity, state: "needs-review", retryable: false, quality: { issueCodes: ["unverified-free-access"], skillCount: 3, sourceCount: 6, unitCount: 9 } } })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("部分学习材料的免费访问条件尚待确认。");
    expect(screen.queryByRole("button", { name: "使用研究结果" })).not.toBeInTheDocument();
  });
  it("explains unverified publisher authority without offering plan activation", () => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "needs-review", runId: identity.id }, run: { ...identity, state: "needs-review", retryable: false, quality: { issueCodes: ["unverified-source-authority"], skillCount: 3, sourceCount: 6, unitCount: 9 } } })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("部分学习材料需要经核验的大学或官方发布方来源。");
    expect(screen.queryByRole("button", { name: "使用研究结果" })).not.toBeInTheDocument();
  });
  it.each([true, false])("offers Retry for Needs review only when retryable is %s", (retryable) => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "needs-review", runId: identity.id }, run: { ...identity, state: "needs-review", retryable, quality: { issueCodes: ["missing-unit"], skillCount: 3, sourceCount: 6, unitCount: 2 } } })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("部分技能缺少可执行的学习单元。");
    expect(Boolean(screen.queryByRole("button", { name: "重试研究" }))).toBe(retryable);
    expect(screen.queryByRole("button", { name: "使用研究结果" })).not.toBeInTheDocument();
  });
  it.each([true, false])("limits Failed recovery by retryable %s", (retryable) => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "failed", runId: identity.id }, run: { ...identity, state: "failed", failureCategory: "timeout", retryable } })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("研究耗时超出预期。");
    expect(Boolean(screen.queryByRole("button", { name: "重试研究" }))).toBe(retryable);
  });
  it("keeps recovery visible and request diagnostics collapsed until requested", async () => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "failed" }, error: new ResearchClientError("RESEARCH_UNAVAILABLE", "request-safe"), requestId: "request-safe" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("研究服务暂时不可用。");
    expect(screen.getByRole("button", { name: "研究这个岗位" })).toBeInTheDocument();
    const request = screen.getByText(/request-safe/);
    expect(request).not.toBeVisible();
    await userEvent.setup().click(screen.getByText("详细信息", { selector: "summary" }));
    expect(request).toBeVisible();
    expect(screen.getByRole("button", { name: "研究这个岗位" })).toBeVisible();
  });
  it("links session recovery back to the exact setup query", () => {
    window.history.replaceState(null, "", "/setup?mode=create");
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "failed" }, error: new ResearchClientError("UNAUTHENTICATED") })} />);
    expect(screen.getByRole("link", { name: "登录" })).toHaveAttribute("href", "/sign-in?next=%2Fsetup%3Fmode%3Dcreate&reauth=1");
    window.history.replaceState(null, "", "/");
    expect(screen.queryByRole("button", { name: "研究这个岗位" })).not.toBeInTheDocument();
  });
  it("makes an uncertain prior submission queryable without retrying or starting it", async () => {
    const refresh = vi.fn();
    const retry = vi.fn();
    const p = props({ ...base, state: { kind: "failed" }, recoveryUncertain: true,
      error: new ResearchClientError("NOT_FOUND"), refresh, retry });
    render(<RoleResearchPanel {...p} eligible={false} />);

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("上一次研究的状态尚未确认。");
    expect(screen.queryByText(backgroundGuidance)).not.toBeInTheDocument();
    expect(screen.getByText(/上一次研究可能仍在运行并产生费用/)).toBeInTheDocument();
    expect(screen.getByText(/重新发起研究可能再次产生费用/)).toBeInTheDocument();
    const check = screen.getByRole("button", { name: "查询研究状态" });
    expect(check).toBeEnabled();
    await userEvent.setup().click(check);
    expect(refresh).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(p.onStart).not.toHaveBeenCalled();
  });
  it("uses inline replacement confirmation and focuses it even when the server state is unchanged", async () => {
    const confirmReplacement = vi.fn();
    const cancelReplacement = vi.fn();
    const p = props({ ...base, state: { kind: "failed" }, recoveryUncertain: true,
      error: new ResearchClientError("NOT_FOUND") });
    const page = render(<RoleResearchPanel {...p} />);
    page.rerender(<RoleResearchPanel {...p} controller={{ ...p.controller, replacementPending: true,
      confirmReplacement, cancelReplacement }} />);

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("确认发起新的研究？");
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
    await userEvent.setup().click(screen.getByRole("button", { name: "发起新的研究" }));
    expect(confirmReplacement).toHaveBeenCalledOnce();
    await userEvent.setup().click(screen.getByRole("button", { name: "继续查询上一次研究" }));
    expect(cancelReplacement).toHaveBeenCalledOnce();
    expect(p.onStart).not.toHaveBeenCalled();
  });
  it("does not expose the old Retry while a retry successor is uncertain", () => {
    render(<RoleResearchPanel {...props({ ...base, recoveryUncertain: true,
      state: { kind: "failed", runId: identity.id },
      run: { ...identity, state: "failed", failureCategory: "timeout", retryable: true } })} />);
    expect(screen.getByRole("button", { name: "查询研究状态" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重试研究" })).not.toBeInTheDocument();
  });
  it("keeps the starting label while a newly confirmed Start has a durable pending identity", () => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "submitting" }, busy: true,
      recoveryUncertain: true })} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("正在提交研究");
    expect(screen.queryByText("正在查询上一次研究…")).not.toBeInTheDocument();
  });
  it("announces an actual pending recovery query as checking", () => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "failed" }, restoring: true,
      recoveryUncertain: true })} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("正在查询上一次研究…");
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
  it("keeps an actionable device-storage error visible beside its failed Retry source", () => {
    const storageError = Object.assign(new Error("Arc could not save recovery details in device storage. Make storage available, then try again."), {
      name: "LocalResearchStorageError", status: 503, code: "RESEARCH_UNAVAILABLE" as const,
      requestId: null, recovery: "retry-or-flagship" as const,
    }) as unknown as NonNullable<RoleResearchController["error"]>;
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "failed", runId: identity.id },
      run: { ...identity, state: "failed", failureCategory: "timeout", retryable: true }, error: storageError })} />);
    expect(screen.getByText(/未能将恢复信息保存在此设备上/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试研究" })).toBeInTheDocument();
  });
});
