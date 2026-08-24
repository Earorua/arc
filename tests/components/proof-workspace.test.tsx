import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProofWorkspace } from "../../app/components/proof/proof-workspace";
import { flagshipRole } from "../../app/data/flagship-role";
import { PROOF_LEDGER_SCHEMA_VERSION, type ProofLedgerWorkspace, type ProofReviewEvent, type ProofVersion } from "../../app/contracts/proof-ledger";

afterEach(cleanup);

const version = (overrides: Partial<ProofVersion> = {}): ProofVersion => ({
  id: "version-1", proofId: "proof-1", versionNumber: 1, schemaVersion: PROOF_LEDGER_SCHEMA_VERSION,
  dailyUnitId: null, title: "Accessible request trace", kind: "repository",
  summary: "A labelled form and its browser request trace.", artifactUrl: "https://example.com/proof",
  assetId: null, skillIds: ["react"], completionCriteria: ["The trace is inspectable."],
  visibility: "private", createdAt: "2026-08-24T10:00:00.000Z", supersedesVersionId: null,
  ...overrides,
});

const review = (overrides: Partial<ProofReviewEvent> = {}): ProofReviewEvent => ({
  id: "review-1", proofId: "proof-1", versionId: "version-1", sequence: 1,
  mutationId: "mutation-1", kind: "structural_passed", stateAfter: "demonstrated",
  visibilityAfter: "private", validatorKey: null, outcome: "passed", reasonCodes: [],
  occurredAt: "2026-08-24T10:00:00.000Z", ...overrides,
});

const workspace = (versions: ProofVersion[] = [version()], reviews: ProofReviewEvent[] = [review()]): ProofLedgerWorkspace => ({
  id: "workspace-1", goalId: "goal-1", schemaVersion: PROOF_LEDGER_SCHEMA_VERSION,
  revision: 1, versions, reviews, projections: [],
});

const callbacks = () => ({
  createProof: vi.fn(async () => true), reviseProof: vi.fn(async () => true),
  withdrawProof: vi.fn(async () => true), setVisibility: vi.fn(async () => true),
  retry: vi.fn(async () => undefined), uploadAsset: vi.fn(async () => "asset-1"),
});

function renderWorkspace(options: Partial<React.ComponentProps<typeof ProofWorkspace>> = {}) {
  const actions = callbacks();
  render(<ProofWorkspace
    canUpload={false}
    dailyUnits={[]}
    projections={[]}
    recovery="none"
    skills={flagshipRole.skills}
    source="local"
    workspace={null}
    {...actions}
    {...options}
  />);
  return actions;
}

describe("ProofWorkspace", () => {
  it("renders an honest empty state and an inaccessible signed-out upload", () => {
    renderWorkspace();
    expect(screen.getByText(/No submitted proof yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Sign in and save a draft before uploading/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Upload proof file/i)).not.toBeInTheDocument();
  });

  it("focuses a validation summary and does not submit invalid evidence", async () => {
    const actions = renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveFocus();
    expect(alert).toHaveTextContent(/title/i);
    expect(actions.createProof).not.toHaveBeenCalled();
  });

  it("submits a public HTTPS artifact for structural review", async () => {
    const actions = renderWorkspace();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Typed API" } });
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "An inspectable request contract." } });
    fireEvent.change(screen.getByLabelText("Public HTTPS URL"), { target: { value: "https://example.com/api" } });
    fireEvent.change(screen.getByLabelText("Linked skill"), { target: { value: "http-apis" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(actions.createProof).toHaveBeenCalledWith(expect.objectContaining({
      intent: "submit", title: "Typed API", artifactUrl: "https://example.com/api",
      skillIds: ["http-apis"], visibility: "private",
    })));
  });

  it("shows demonstrated and verified outcomes with a plain-language validation explanation", () => {
    const verifiedVersion = version({ id: "version-2", versionNumber: 2, supersedesVersionId: "version-1" });
    const reviews = [
      review({ stateAfter: "superseded", kind: "superseded", outcome: null }),
      review({ id: "review-2", versionId: "version-2", sequence: 2, kind: "validator_passed", stateAfter: "verified", validatorKey: "proof.test-report.v1" }),
    ];
    renderWorkspace({ workspace: workspace([version(), verifiedVersion], reviews) });
    expect(screen.getAllByText("Verified")).toHaveLength(2);
    expect(screen.getByText("Superseded")).toBeInTheDocument();
    expect(screen.getByText(/passed deterministic validation/i)).toBeInTheDocument();
    expect(screen.queryByText("validatorKey")).not.toBeInTheDocument();
  });

  it("creates immutable revisions rather than editing an earlier version", async () => {
    const actions = renderWorkspace({ workspace: workspace() });
    fireEvent.click(screen.getByRole("button", { name: "Add revision" }));
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "A stronger trace with failure handling." } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(actions.reviseProof).toHaveBeenCalledWith("proof-1", expect.objectContaining({
      intent: "save_draft", summary: "A stronger trace with failure handling.",
    })));
  });

  it("withdraws evidence and toggles current visibility", async () => {
    const actions = renderWorkspace({ workspace: workspace() });
    const item = screen.getByRole("article", { name: "Accessible request trace" });
    fireEvent.click(within(item).getByRole("button", { name: "Make public" }));
    await waitFor(() => expect(actions.setVisibility).toHaveBeenCalledWith("proof-1", "public"));
    fireEvent.click(within(item).getByRole("button", { name: "Withdraw proof" }));
    await waitFor(() => expect(actions.withdrawProof).toHaveBeenCalledWith("proof-1"));
  });

  it("disables competing actions while a mutation is pending", async () => {
    let release!: (value: boolean) => void;
    const pending = new Promise<boolean>((resolve) => { release = resolve; });
    renderWorkspace({ workspace: workspace(), withdrawProof: vi.fn(() => pending) });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw proof" }));
    expect(screen.getByRole("button", { name: "Withdrawing…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add revision" })).toBeDisabled();
    release(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Withdraw proof" })).toBeEnabled());
  });

  it("offers conflict recovery and prevents stale mutations", () => {
    const actions = renderWorkspace({ canUpload: true, recovery: "conflict", source: "cloud", workspace: workspace() });
    expect(screen.getByRole("alert")).toHaveTextContent(/changed in another session/i);
    fireEvent.click(screen.getByRole("button", { name: "Reload proof workspace" }));
    expect(actions.retry).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add revision" })).toBeDisabled();
  });

  it("allows a signed-in cloud workspace to upload only after a proof root exists", async () => {
    const actions = renderWorkspace({ canUpload: true, source: "cloud", workspace: workspace() });
    fireEvent.click(screen.getByRole("button", { name: "Add revision" }));
    const upload = screen.getByLabelText("Upload proof file");
    const file = new File(["evidence"], "proof.txt", { type: "text/plain" });
    fireEvent.change(upload, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload selected file" }));
    await waitFor(() => expect(actions.uploadAsset).toHaveBeenCalledWith("proof-1", file));
  });
});
