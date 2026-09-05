import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoleResearchPanel } from "../../app/components/setup/role-research-panel";
import type { RoleResearchController } from "../../app/lib/use-role-research";
import { ResearchClientError } from "../../app/lib/research-client";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";

afterEach(cleanup);
const base: RoleResearchController = { state: { kind: "idle" }, run: null, planningData: null, error: null, requestId: null, busy: false, restoring: false, start: vi.fn(), retry: vi.fn(), refresh: vi.fn(), reset: vi.fn() };
const identity = { id: "research-run-1", role: "Data Product Manager", locale: "en-US" as const };
const ready = { ...identity, state: "ready" as const, retryable: false as const, packageId: "package-one", summary: "Research grounded in observable product decisions.", skillCount: 3, sourceCount: 6, observedAt: "2026-09-05", quality: { passed: true as const, issueCodes: [] }, planningData: { id: "package-one", blueprint: flagshipBlueprint, registry: flagshipUnitRegistry } };
function props(controller = base) { return { controller, role: identity.role, eligible: true, onStart: vi.fn(), onUse: vi.fn(), onFlagship: vi.fn() }; }

describe("RoleResearchPanel", () => {
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
});
