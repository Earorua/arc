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
const backgroundGuidance = "Research is running in the background. You can leave this page and return to check its progress.";
const ready = { ...identity, state: "ready" as const, retryable: false as const, packageId: "package-one", summary: "Research grounded in observable product decisions.", skillCount: 3, sourceCount: 6, observedAt: "2026-09-05", quality: { passed: true as const, issueCodes: [] }, planningData: { id: "package-one", blueprint: flagshipBlueprint, registry: flagshipUnitRegistry } };
function props(controller = base) { return { controller, role: identity.role, eligible: true, onStart: vi.fn(), onUse: vi.fn(), onFlagship: vi.fn() }; }

describe("RoleResearchPanel", () => {
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
    expect(screen.getByRole("button", { name: "Use Flagship" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Use this research" })).not.toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: "Research this role" })).not.toBeInTheDocument();
    expect(p.onStart).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Use Flagship" })).toBeInTheDocument();
    page.rerender(<RoleResearchPanel {...p} role={role} eligible={false} controller={{ ...base, state: { kind: "ready", runId: identity.id }, run: ready }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Use this research" }));
    expect(p.onUse).toHaveBeenCalledWith(identity.id);
    const retry = vi.fn();
    page.rerender(<RoleResearchPanel {...p} role={role} controller={{ ...base, retry, state: { kind: "failed", runId: identity.id }, run: { ...identity, state: "failed", failureCategory: "timeout", retryable: true } }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry research" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it.each(["Senior AI-Native Full-Stack Engineer", "AI 原生全栈工程师导师", "ai-native-full-stack-engineer-educator"])("does not fuzzy-match another role %s", (role) => {
    render(<RoleResearchPanel {...props()} role={role} />);
    expect(screen.getByRole("button", { name: "Research this role" })).toBeInTheDocument();
  });
  it("requires an explicit keyboard action and keeps a Flagship fallback", async () => {
    const p = props(); const user = userEvent.setup(); render(<RoleResearchPanel {...p} />);
    const start = screen.getByRole("button", { name: "Research this role" });
    start.focus(); await user.keyboard("{Enter}"); expect(p.onStart).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Use Flagship" })).toHaveClass("research-action");
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
    expect(screen.queryByRole("button", { name: "Use this research" })).not.toBeInTheDocument();
  });
  it("renders Ready facts as text and uses the owner run ID even with eligibility revoked", async () => {
    const p = props({ ...base, state: { kind: "ready", runId: identity.id }, run: { ...ready, summary: "<img src=x onerror=alert(1)> Research summary text." }, planningData: ready.planningData });
    const { container } = render(<RoleResearchPanel {...p} eligible={false} />);
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument(); expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("3 skills")).toBeInTheDocument(); expect(screen.getByText("6 sources")).toBeInTheDocument();
    expect(screen.getByText(/2026-09-05/)).toBeInTheDocument(); expect(screen.getByText("Quality checks passed")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Use this research" })); expect(p.onUse).toHaveBeenCalledWith(identity.id);
  });
  it("explains conditional free access without offering plan activation", () => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "needs-review", runId: identity.id }, run: { ...identity, state: "needs-review", retryable: false, quality: { issueCodes: ["unverified-free-access"], skillCount: 3, sourceCount: 6, unitCount: 9 } } })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Free access to some learning materials needs confirmation.");
    expect(screen.queryByRole("button", { name: "Use this research" })).not.toBeInTheDocument();
  });
  it("explains unverified publisher authority without offering plan activation", () => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "needs-review", runId: identity.id }, run: { ...identity, state: "needs-review", retryable: false, quality: { issueCodes: ["unverified-source-authority"], skillCount: 3, sourceCount: 6, unitCount: 9 } } })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Some learning materials need a verified university or official publisher source.");
    expect(screen.queryByRole("button", { name: "Use this research" })).not.toBeInTheDocument();
  });
  it.each([true, false])("offers Retry for Needs review only when retryable is %s", (retryable) => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "needs-review", runId: identity.id }, run: { ...identity, state: "needs-review", retryable, quality: { issueCodes: ["missing-unit"], skillCount: 3, sourceCount: 6, unitCount: 2 } } })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Some skills need an executable learning unit.");
    expect(Boolean(screen.queryByRole("button", { name: "Retry research" }))).toBe(retryable);
    expect(screen.queryByRole("button", { name: "Use this research" })).not.toBeInTheDocument();
  });
  it.each([true, false])("limits Failed recovery by retryable %s", (retryable) => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "failed", runId: identity.id }, run: { ...identity, state: "failed", failureCategory: "timeout", retryable } })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Research took longer than expected.");
    expect(Boolean(screen.queryByRole("button", { name: "Retry research" }))).toBe(retryable);
  });
  it("keeps no-run errors stable with explicit recovery and Request ID", () => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "failed" }, error: new ResearchClientError("RESEARCH_UNAVAILABLE", "request-safe"), requestId: "request-safe" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Research is temporarily unavailable.");
    expect(screen.getByRole("button", { name: "Research this role" })).toBeInTheDocument();
    expect(screen.getByText(/request-safe/)).toBeInTheDocument();
  });
  it("links session recovery to the existing sign-in route", () => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "failed" }, error: new ResearchClientError("UNAUTHENTICATED") })} />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.queryByRole("button", { name: "Research this role" })).not.toBeInTheDocument();
  });
  it("makes an uncertain prior submission queryable without retrying or starting it", async () => {
    const refresh = vi.fn();
    const retry = vi.fn();
    const p = props({ ...base, state: { kind: "failed" }, recoveryUncertain: true,
      error: new ResearchClientError("NOT_FOUND"), refresh, retry });
    render(<RoleResearchPanel {...p} eligible={false} />);

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("The status of your previous research is not confirmed.");
    expect(screen.queryByText(backgroundGuidance)).not.toBeInTheDocument();
    expect(screen.getByText(/previous research may still be running and may still incur a cost/i)).toBeInTheDocument();
    expect(screen.getByText(/new research may cost again/i)).toBeInTheDocument();
    const check = screen.getByRole("button", { name: "Check research status" });
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

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Start new research?");
    expect(screen.getByRole("heading", { level: 2 })).toHaveFocus();
    await userEvent.setup().click(screen.getByRole("button", { name: "Start new research" }));
    expect(confirmReplacement).toHaveBeenCalledOnce();
    await userEvent.setup().click(screen.getByRole("button", { name: "Keep checking previous research" }));
    expect(cancelReplacement).toHaveBeenCalledOnce();
    expect(p.onStart).not.toHaveBeenCalled();
  });
  it("does not expose the old Retry while a retry successor is uncertain", () => {
    render(<RoleResearchPanel {...props({ ...base, recoveryUncertain: true,
      state: { kind: "failed", runId: identity.id },
      run: { ...identity, state: "failed", failureCategory: "timeout", retryable: true } })} />);
    expect(screen.getByRole("button", { name: "Check research status" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry research" })).not.toBeInTheDocument();
  });
  it("keeps the starting label while a newly confirmed Start has a durable pending identity", () => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "submitting" }, busy: true,
      recoveryUncertain: true })} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Starting role research");
    expect(screen.queryByText("Checking your previous research…")).not.toBeInTheDocument();
  });
  it("announces an actual pending recovery query as checking", () => {
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "failed" }, restoring: true,
      recoveryUncertain: true })} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Checking your previous research…");
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
  it("keeps an actionable device-storage error visible beside its failed Retry source", () => {
    const storageError = Object.assign(new Error("Arc could not save recovery details in device storage. Make storage available, then try again."), {
      name: "LocalResearchStorageError", status: 503, code: "RESEARCH_UNAVAILABLE" as const,
      requestId: null, recovery: "retry-or-flagship" as const,
    }) as unknown as NonNullable<RoleResearchController["error"]>;
    render(<RoleResearchPanel {...props({ ...base, state: { kind: "failed", runId: identity.id },
      run: { ...identity, state: "failed", failureCategory: "timeout", retryable: true }, error: storageError })} />);
    expect(screen.getByText(/could not save recovery details in device storage/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry research" })).toBeInTheDocument();
  });
});
