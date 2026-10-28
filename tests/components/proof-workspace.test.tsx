import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProofWorkspace } from "../../app/components/proof/proof-workspace";
import { flagshipRole } from "../../app/data/flagship-role";
import { PROOF_LEDGER_SCHEMA_VERSION, type ProofLedgerWorkspace, type ProofReviewEvent, type ProofVersion } from "../../app/contracts/proof-ledger";

beforeEach(() => { window.history.replaceState(null, "", "/proof"); sessionStorage.clear(); });
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
  window.history.replaceState(null, "", options.workspace ? "/proof?proof=proof-1" : "/proof?compose=1");
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
  it("leads with inspectable work and folds the immutable version history", () => {
    renderWorkspace({ workspace: workspace() });
    const proof = screen.getByRole("article", { name: "Accessible request trace" });
    expect(within(proof).getByRole("link", { name: "查看作品 ↗" })).toHaveAttribute("href", "https://example.com/proof");
    const history = within(proof).getByText("版本记录 · 1").closest("details")!;
    expect(history.open).toBe(false);
    fireEvent.click(within(proof).getByText("版本记录 · 1"));
    expect(history.open).toBe(true);
    expect(screen.queryByLabelText("作品标题")).not.toBeInTheDocument();
  });
  it("renders an honest empty state and an inaccessible signed-out upload", () => {
    renderWorkspace();
    expect(screen.getByRole("heading", { name: "添加作品" })).toBeInTheDocument();
    expect(screen.getByText(/登录并保存草稿后/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/上传作品文件/i)).not.toBeInTheDocument();
  });

  it("focuses a validation summary and does not submit invalid evidence", async () => {
    const actions = renderWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "提交审核" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveFocus();
    expect(alert).toHaveTextContent(/作品标题/i);
    expect(actions.createProof).not.toHaveBeenCalled();
  });

  it("submits a public HTTPS artifact for structural review", async () => {
    const actions = renderWorkspace();
    fireEvent.change(screen.getByLabelText("作品标题"), { target: { value: "Typed API" } });
    fireEvent.change(screen.getByLabelText("作品说明"), { target: { value: "An inspectable request contract." } });
    fireEvent.change(screen.getByLabelText("公开 HTTPS 链接"), { target: { value: "https://example.com/api" } });
    fireEvent.change(screen.getByLabelText("关联技能"), { target: { value: "http-apis" } });
    fireEvent.click(screen.getByRole("button", { name: "提交审核" }));
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
    expect(screen.getAllByText("已通过验证")).toHaveLength(2);
    expect(screen.getByText("已被新版本替代")).toBeInTheDocument();
    expect(screen.getAllByText(/已通过自动检查/i)).toHaveLength(2);
    expect(screen.queryByText("validatorKey")).not.toBeInTheDocument();
  });

  it("creates immutable revisions rather than editing an earlier version", async () => {
    const actions = renderWorkspace({ workspace: workspace() });
    fireEvent.click(screen.getByRole("button", { name: "添加修订" }));
    expect(screen.getByRole("heading", { name: "添加作品修订" })).toHaveFocus();
    fireEvent.change(screen.getByLabelText("作品说明"), { target: { value: "A stronger trace with failure handling." } });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(actions.reviseProof).toHaveBeenCalledWith("proof-1", expect.objectContaining({
      intent: "save_draft", summary: "A stronger trace with failure handling.",
    })));
  });

  it("returns focus to the selected work when cancelling a revision", () => {
    renderWorkspace({ workspace: workspace() });
    const revise = screen.getByRole("button", { name: "添加修订" });
    fireEvent.click(revise);
    fireEvent.click(screen.getByRole("button", { name: "取消修订" }));
    expect(screen.getByRole("button", { name: "添加修订" })).toHaveFocus();
  });

  it("withdraws evidence and toggles current visibility", async () => {
    const actions = renderWorkspace({ workspace: workspace() });
    const item = screen.getByRole("article", { name: "Accessible request trace" });
    fireEvent.click(within(item).getByRole("button", { name: "设为公开" }));
    await waitFor(() => expect(actions.setVisibility).toHaveBeenCalledWith("proof-1", "public"));
    fireEvent.click(within(item).getByText("更多操作"));
    fireEvent.click(within(item).getByRole("button", { name: "撤回作品" }));
    fireEvent.click(within(item).getByRole("button", { name: "确认撤回" }));
    await waitFor(() => expect(actions.withdrawProof).toHaveBeenCalledWith("proof-1"));
  });

  it("disables competing actions while a mutation is pending", async () => {
    let release!: (value: boolean) => void;
    const pending = new Promise<boolean>((resolve) => { release = resolve; });
    renderWorkspace({ workspace: workspace(), withdrawProof: vi.fn(() => pending) });
    fireEvent.click(screen.getByText("更多操作"));
    fireEvent.click(screen.getByRole("button", { name: "撤回作品" }));
    fireEvent.click(screen.getByRole("button", { name: "确认撤回" }));
    expect(screen.getByRole("button", { name: "正在撤回…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "添加修订" })).toBeDisabled();
    release(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "撤回作品" })).toBeEnabled());
  });

  it("offers conflict recovery and prevents stale mutations", () => {
    const actions = renderWorkspace({ canUpload: true, recovery: "conflict", source: "cloud", workspace: workspace() });
    expect(screen.getByRole("alert")).toHaveTextContent(/已在另一处发生变化/i);
    fireEvent.click(screen.getByRole("button", { name: "重新加载作品记录" }));
    expect(actions.retry).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "添加修订" })).toBeDisabled();
  });

  it("allows a signed-in cloud workspace to upload only after a proof root exists", async () => {
    const actions = renderWorkspace({ canUpload: true, source: "cloud", workspace: workspace() });
    fireEvent.click(screen.getByRole("button", { name: "添加修订" }));
    const upload = screen.getByLabelText("上传作品文件");
    const file = new File(["evidence"], "proof.txt", { type: "text/plain" });
    fireEvent.change(upload, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "上传所选文件" }));
    await waitFor(() => expect(actions.uploadAsset).toHaveBeenCalledWith("proof-1", file));
  });
});
