import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StackBrowser } from "../../app/components/stack/stack-browser";
import { ProofWorkspace } from "../../app/components/proof/proof-workspace";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { proofResultFixture } from "../fixtures/proof-ledger";
import type { DailyUnit } from "../../app/contracts/planning";
import { useState } from "react";
import type { ProofLedgerWorkspace } from "../../app/contracts/proof-ledger";
import type { ProofEditorInput } from "../../app/components/proof/proof-editor";

beforeEach(() => { window.history.replaceState(null, "", "/"); sessionStorage.clear(); });
afterEach(cleanup);
const evidence = { evidence: [], projections: [] };
const unit = { id: "owned-unit", skillId: "testing", scheduledDate: "2026-10-28", slot: "primary", objective: "Test the boundary" } as DailyUnit;
function props() {
  return {
    ownerKey: "user:alice", canUpload: false, createProof: vi.fn(async () => true), dailyUnits: [unit],
    projections: [], recovery: "none" as const, retry: vi.fn(async () => undefined),
    reviseProof: vi.fn(async () => true), setVisibility: vi.fn(async () => true),
    skills: [{ id: "testing", name: "Testing" }], source: "cloud" as const,
    withdrawProof: vi.fn(async () => true), workspace: proofResultFixture().workspace,
  };
}
function go(url: string) {
  act(() => { window.history.pushState(null, "", url); window.dispatchEvent(new PopStateEvent("popstate")); });
}

describe("evidence navigation", () => {
  it("restores a Stack deep link and targets that skill's path", () => {
    window.history.replaceState(null, "", "/stack?skill=react&category=frontend");
    render(<StackBrowser blueprint={flagshipBlueprint} {...evidence} />);
    expect(screen.getByRole("heading", { name: "React 19" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Frontend" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "View skill path" })).toHaveAttribute("href", "/path?skill=react");
  });
  it("encodes Stack selection and returns to the same filtered list with focus and scroll", () => {
    window.history.replaceState(null, "", "/stack?category=frontend");
    render(<StackBrowser blueprint={flagshipBlueprint} {...evidence} />);
    const list = screen.getByRole("list", { name: "Skill index" });
    list.scrollTop = 90;
    fireEvent.click(screen.getByRole("button", { name: "View React 19" }));
    expect(new URLSearchParams(window.location.search).get("skill")).toBe("react");
    fireEvent.click(screen.getByRole("button", { name: "Back to skills" }));
    expect(window.location.search).toBe("?category=frontend");
    expect(list.scrollTop).toBe(90);
    expect(screen.getByRole("button", { name: "View React 19" })).toHaveFocus();
    go("/stack?category=ai&skill=llm-contracts");
    expect(screen.getByRole("heading", { name: "Structured LLM Contracts" })).toBeInTheDocument();
    go("/stack?category=frontend");
    expect(screen.getByRole("button", { name: "Frontend" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector(".stack-browser")).not.toHaveClass("is-detail-open");
  });
  it("explains an unavailable skill instead of silently selecting another", () => {
    window.history.replaceState(null, "", "/stack?skill=foreign-skill");
    render(<StackBrowser blueprint={flagshipBlueprint} {...evidence} />);
    expect(screen.getByRole("status")).toHaveTextContent("This skill is not in your current path");
    expect(screen.queryByRole("heading", { name: "Web Platform" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to skills" }));
    expect(screen.getByRole("heading", { name: "Web Platform" })).toBeInTheDocument();
  });
  it("supports native Stack Back and Forward while restoring the filtered list and focus", async () => {
    window.history.replaceState(null, "", "/stack?category=frontend");
    render(<StackBrowser blueprint={flagshipBlueprint} {...evidence} />);
    fireEvent.click(screen.getByRole("button", { name: "View React 19" }));
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole("button", { name: "View React 19" })).toHaveFocus());
    expect(screen.getByRole("button", { name: "Frontend" })).toHaveAttribute("aria-pressed", "true");
    act(() => window.history.forward());
    await waitFor(() => expect(screen.getByRole("heading", { name: "React 19" })).toHaveFocus());
  });
  it("opens Proof as a list and makes adding and reading distinct views", () => {
    render(<ProofWorkspace {...props()} />);
    expect(screen.queryByLabelText("Proof title")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add proof" }));
    expect(screen.getByRole("heading", { name: "Add proof" })).toHaveFocus();
    expect(screen.getByLabelText("Proof title")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to proof collection" }));
    fireEvent.click(screen.getByRole("button", { name: "View Architecture map" }));
    expect(window.location.search).toBe("?proof=proof-1");
    expect(screen.getByRole("heading", { name: "Architecture map" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Proof title")).not.toBeInTheDocument();
  });
  it("selects only the requested Proof and explicitly handles an unreadable deep link", () => {
    window.history.replaceState(null, "", "/proof?proof=proof-1");
    const p = props();
    render(<ProofWorkspace {...p} />);
    expect(screen.getByRole("heading", { name: "Architecture map" })).toBeInTheDocument();
    go("/proof?proof=foreign-proof");
    expect(screen.getByRole("status")).toHaveTextContent("This proof is unavailable");
    expect(screen.queryByText("Architecture map")).not.toBeInTheDocument();
    expect(p.createProof).not.toHaveBeenCalled();
  });
  it("prefills Today compose only from owned units and retains a safe return", () => {
    window.history.replaceState(null, "", "/proof?compose=1&unit=owned-unit&skill=foreign&returnTo=%2Ftoday");
    render(<ProofWorkspace {...props()} />);
    expect(screen.getByLabelText("Related skill")).toHaveValue("testing");
    expect(screen.getByLabelText("Related learning unit")).toHaveValue("owned-unit");
    expect(screen.getByRole("link", { name: "Back to Today" })).toHaveAttribute("href", "/today");
    expect(screen.getByLabelText("Visibility")).toHaveValue("private");
  });
  it("rejects foreign compose unit context and external returns without writing", () => {
    window.history.replaceState(null, "", "/proof?compose=1&unit=foreign-unit&returnTo=https%3A%2F%2Fevil.example");
    const p = props();
    render(<ProofWorkspace {...p} />);
    expect(screen.getByRole("status")).toHaveTextContent("This learning unit cannot be linked right now");
    expect(screen.getByLabelText("Related skill")).toHaveValue("");
    expect(screen.getByLabelText("Related learning unit")).toHaveValue("");
    expect(screen.queryByRole("link", { name: "Back to Today" })).not.toBeInTheDocument();
    expect(p.createProof).not.toHaveBeenCalled();
  });
  it("keeps unfinished compose input across navigation and never restores it for another owner", () => {
    window.history.replaceState(null, "", "/proof?compose=1");
    const p = props();
    const view = render(<ProofWorkspace {...p} />);
    fireEvent.change(screen.getByLabelText("Proof title"), { target: { value: "Private draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Back to proof collection" }));
    fireEvent.click(screen.getByRole("button", { name: "Add proof" }));
    expect(screen.getByLabelText("Proof title")).toHaveValue("Private draft");
    view.unmount();
    render(<ProofWorkspace {...p} ownerKey="user:bob" />);
    expect(screen.getByLabelText("Proof title")).toHaveValue("");
  });
  it("restores revision input after cancelling without changing the previous version", () => {
    window.history.replaceState(null, "", "/proof?proof=proof-1");
    const p = props();
    render(<ProofWorkspace {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Add revision" }));
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Unfinished revision" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel revision" }));
    expect(screen.getByRole("button", { name: "Add revision" })).toHaveFocus();
    expect(p.reviseProof).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add revision" }));
    expect(screen.getByLabelText("Description")).toHaveValue("Unfinished revision");
  });
  it("requires an explicit confirmation before withdrawing a selected proof", async () => {
    window.history.replaceState(null, "", "/proof?proof=proof-1");
    const p = props();
    render(<ProofWorkspace {...p} />);
    fireEvent.click(screen.getByText("More actions"));
    fireEvent.click(screen.getByRole("button", { name: "Withdraw proof" }));
    expect(p.withdrawProof).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
    await waitFor(() => expect(p.withdrawProof).toHaveBeenCalledWith("proof-1"));
  });
  it("restores list focus with native browser Back and selected detail with Forward", async () => {
    window.history.replaceState(null, "", "/proof");
    render(<ProofWorkspace {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "View Architecture map" }));
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole("button", { name: "View Architecture map" })).toHaveFocus());
    act(() => window.history.forward());
    await waitFor(() => expect(screen.getByRole("heading", { name: "Architecture map" })).toHaveFocus());
  });
  it("allows switching a linked work to a reflection without leaving a hidden invalid link", async () => {
    window.history.replaceState(null, "", "/proof?compose=1&unit=owned-unit");
    const p = props();
    render(<ProofWorkspace {...p} />);
    fireEvent.change(screen.getByLabelText("Proof title"), { target: { value: "Reflection" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "What I learned" } });
    fireEvent.change(screen.getByLabelText("Public HTTPS link"), { target: { value: "https://example.com" } });
    fireEvent.change(screen.getByLabelText("Proof type"), { target: { value: "reflection" } });
    expect(screen.queryByLabelText("Automatic check")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(p.createProof).toHaveBeenCalledWith(expect.objectContaining({ kind: "reflection", artifactUrl: null, assetId: null, validatorKey: null })));
  });
  it("does not navigate into an old owner's completed mutation after an account switch", async () => {
    window.history.replaceState(null, "", "/proof?proof=proof-1&revise=1");
    let finish!: (value: boolean) => void;
    const p = { ...props(), reviseProof: vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; })) };
    const view = render(<ProofWorkspace {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    go("/proof");
    view.rerender(<ProofWorkspace {...p} ownerKey="user:bob" workspace={null} />);
    await act(async () => finish(true));
    expect(window.location.search).toBe("");
    expect(screen.getByRole("heading", { name: "My proof" })).toBeInTheDocument();
  });
  it("does not pull the reader back into a revision they left while it was saving", async () => {
    window.history.replaceState(null, "", "/proof?proof=proof-1&revise=1");
    let finish!: (value: boolean) => void;
    const p = { ...props(), reviseProof: vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; })) };
    render(<ProofWorkspace {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to proof collection" }));
    await act(async () => finish(true));
    expect(screen.getByRole("heading", { name: "My proof" })).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });
  it("retains an explicitly removed attachment when reopening a cancelled revision", () => {
    window.history.replaceState(null, "", "/proof?proof=proof-1&revise=1");
    const p = props();
    p.workspace.versions[0] = { ...p.workspace.versions[0], artifactUrl: null, assetId: "asset-existing" };
    render(<ProofWorkspace {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove attachment" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel revision" }));
    fireEvent.click(screen.getByRole("button", { name: "Add revision" }));
    expect(screen.queryByRole("button", { name: "Remove attachment" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Public HTTPS link")).toBeEnabled();
  });
  it.each(["not JSON", JSON.stringify({ title: "untrusted" }), JSON.stringify({ title: "foreign", summary: "text", kind: "document", artifactUrl: "", assetId: null, skillId: "foreign", dailyUnitId: "foreign-unit", visibility: "private", validatorKey: "" })])("ignores malformed or foreign stored editing state", (raw) => {
    window.history.replaceState(null, "", "/proof?compose=1");
    sessionStorage.setItem("arc:proof-editor:v1:user:alice:goal-1:compose:general", raw);
    render(<ProofWorkspace {...props()} />);
    expect(screen.getByLabelText("Proof title")).toHaveValue("");
    expect(screen.getByLabelText("Related skill")).toHaveValue("");
  });
  it("does not persist draft or ledger mutations merely from reading a compose deep link", () => {
    window.history.replaceState(null, "", "/proof?compose=1&unit=owned-unit");
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const p = props();
    render(<ProofWorkspace {...p} />);
    expect(writes).not.toHaveBeenCalled();
    expect(p.createProof).not.toHaveBeenCalled();
    expect(p.reviseProof).not.toHaveBeenCalled();
    writes.mockRestore();
  });
  it.each(["session-expired", "conflict", "unavailable", "version-unavailable"] as const)("keeps the %s editor read only", (recovery) => {
    window.history.replaceState(null, "", "/proof?compose=1&unit=owned-unit");
    const p = { ...props(), recovery };
    render(<ProofWorkspace {...p} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Proof title")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(p.createProof).not.toHaveBeenCalled();
  });
  it("continues a newly saved draft directly into uploading its next immutable version", async () => {
    window.history.replaceState(null, "", "/proof?compose=1&unit=owned-unit");
    const p = props();
    const uploadAsset = vi.fn(async () => "asset-new");
    function Harness() {
      const [workspace, setWorkspace] = useState<ProofLedgerWorkspace | null>(null);
      return <ProofWorkspace {...p} canUpload workspace={workspace} uploadAsset={uploadAsset} createProof={async (input: ProofEditorInput) => {
        const next = proofResultFixture().workspace;
        next.versions = [{ ...next.versions[0], ...input, id: "created-version", proofId: "created-proof" }];
        next.reviews = [];
        setWorkspace(next);
        return true;
      }} />;
    }
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Proof title"), { target: { value: "Uploaded outcome" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Inspect the result" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByRole("heading", { name: "Add a proof revision" });
    const file = new File(["proof"], "proof.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Upload a proof file"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload selected file" }));
    await waitFor(() => expect(uploadAsset).toHaveBeenCalledWith("created-proof", file));
    await screen.findByText("proof.txt is attached to the next version of your work.");
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(p.reviseProof).toHaveBeenCalledWith("created-proof", expect.objectContaining({ assetId: "asset-new", intent: "submit" })));
  });
});
