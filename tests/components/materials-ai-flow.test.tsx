import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialTextPanel } from "../../app/components/materials/material-text-panel";
import { MaterialConfirmation } from "../../app/components/materials/material-confirmation";
import { validateDocumentExtraction } from "../../app/server/documents/extraction-validator";
import { KIMI_GROUNDED_TERMS_POLICY_ID } from "../../app/server/documents/policy";
import { mapMaterialItems } from "../../app/lib/materials/skill-mapper";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import type { DocumentReviewDraft } from "../../app/contracts/documents";
import type { DocumentsClient } from "../../app/lib/documents-client";
import type { MaterialDocumentDraftRef } from "../../app/lib/use-material-selection";

const caps = { documentsEnabled: true, analysisEnabled: true, planningEnabled: true, hasDocuments: false, providerLabel: "离线测试处理方", providerPolicyId: "policy-a", policyVersion: "2026.11.1", reason: "ready" } as const;
const receipt = { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", revision: 0 };
const draft = { id: "review-a", schemaVersion: "2026.11.1", ...receipt, extractionId: "extract-a", origin: "ai", items: [{ id: "item-a", kind: "experience", text: "参与 SQL 查询练习", origin: "extracted", requirementLevel: null, sourceRef: { ...receipt, start: 0, end: 3 } }], selfAssessmentHints: [{ id: "hint-a", candidateId: "item-a", skillLabel: "SQL", level: "guided" }], updatedAt: "2026-11-04T08:00:00.000Z" };
function fixture() {
  let saved = structuredClone(draft);
  const invoke = vi.fn(async (endpoint: string, input: Record<string, unknown>) => {
    if (endpoint === "createDocument") return receipt;
    if (endpoint === "createDocumentConsent") return { consentId: "consent-a" };
    if (endpoint === "createDocumentJob") return { jobId: "job-a", state: "queued" };
    if (endpoint === "readDocumentJob") return { jobId: "job-a", revision: 1, state: "succeeded", costState: "settled", extractionId: "extract-a", errorCode: null };
    if (endpoint === "readDocumentReviewDraft") return { draft: saved };
    if (endpoint === "saveDocumentReviewDraft") { saved = { ...saved, items: input.items as typeof saved.items, revision: saved.revision + 1 }; return { draft: saved }; }
    if (endpoint === "createDocumentConfirmation") return { confirmationId: "confirm-a", revision: 1 };
    if (endpoint === "readDocument") return { text: "SQL 原文", document: { revision: 0 } };
    throw new Error("Unexpected endpoint");
  });
  const client = { request: invoke, capabilities: async () => caps } as unknown as DocumentsClient;
  const adopted = vi.fn();
  function Harness() {
    const [value, setValue] = useState<MaterialDocumentDraftRef | null>(null);
    return <MaterialTextPanel kind="resume" capabilities={caps} client={client} value={value} onChange={setValue} onAdoptLevels={adopted} skills={[{ id: "sql", name: "SQL" }]} pollIntervalMs={5} />;
  }
  return { invoke, adopted, Harness };
}
describe("AI-first material review", () => {
  afterEach(cleanup);
  it("keeps edits made during confirmation unconfirmed and uses the committed document revision on the next click", async () => {
    const { Harness, invoke } = fixture(), read = invoke.getMockImplementation()!;
    let confirmations = 0;
    const gate = Promise.withResolvers<void>();
    invoke.mockImplementation(async (method, input) => {
      if (method !== "createDocumentConfirmation") return read(method, input);
      confirmations++;
      if (confirmations === 1) { await gate.promise; return { confirmationId: "old-sql", revision: 1 }; }
      return { confirmationId: "new-python", revision: 2 };
    });
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("简历正文"), { target: { value: "SQL 原文" } });
    fireEvent.click(screen.getByLabelText(/允许将当前文本/)); fireEvent.click(screen.getByRole("button", { name: "保存并 AI 分析" }));
    await screen.findByDisplayValue("参与 SQL 查询练习");
    const confirm = screen.getByRole("button", { name: "确认这些事实" });
    act(() => { confirm.click(); confirm.click(); });
    await waitFor(() => expect(confirmations).toBe(1));
    fireEvent.change(screen.getByLabelText("事实 1"), { target: { value: "Reviewed a Python report" } });
    await waitFor(() => expect(invoke.mock.calls.some(([name]) => name === "saveDocumentReviewDraft")).toBe(true));
    await act(async () => { gate.resolve(); await gate.promise; });
    expect(screen.queryByText("已确认，可用于本次规划。")).not.toBeInTheDocument();
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await screen.findByText("已确认，可用于本次规划。");
    const requests = invoke.mock.calls.filter(([name]) => name === "createDocumentConfirmation");
    expect(requests).toHaveLength(2);
    expect(requests[1]![1]).toMatchObject({ expectedRevision: 1, reviewRevision: 1, items: [expect.objectContaining({ text: "Reviewed a Python report" })] });
  });
  it("can confirm a source-span fact with no skill proposal without selecting a skill hidden in its text", () => {
    const text = "PostgreSQL is used by partners.";
    const reference = { ...receipt, ownerId: "owner", lifecycle: "active", text, segments: [{ id: "segment-1", start: 0, end: text.length }] };
    const projection = validateDocumentExtraction({ schemaVersion: "2026.11.1", items: [{ id: "fact", kind: "requirement", text, requirementLevel: "must", skillLabels: [], selfLevelHint: null, source: { segmentId: "segment-1", quote: text } }] }, "owner", reference);
    const review: DocumentReviewDraft = { id: "review", schemaVersion: "2026.11.1", ...receipt, origin: "ai", extractionId: "extraction", ...projection, updatedAt: draft.updatedAt };
    const confirmed = vi.fn();
    render(<MaterialConfirmation draft={review} text={text} saving={false} confirmed={false} onItemsChange={() => undefined}
      onConfirm={() => confirmed(mapMaterialItems(review.items, flagshipBlueprint, flagshipUnitRegistry).flatMap(mapping => mapping.skillIds))} />);
    expect(screen.queryByRole("button", { name: /移除技能词/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认这些事实" }));
    expect(confirmed).toHaveBeenCalledWith([]);
  });
  it("shows the proposed skill words beside their fact and submits only the terms the user kept", () => {
    const sourceRef = { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", start: 0, end: 20 };
    const initial: DocumentReviewDraft = { id: "review-a", schemaVersion: "2026.11.1", ...receipt, extractionId: "extract-a", origin: "ai", updatedAt: draft.updatedAt,
      items: [{ id: "query", kind: "requirement", text: "Improve slow queries", origin: "extracted", requirementLevel: "unspecified", sourceRef, skillLabels: ["PostgreSQL", "Jest"] }], selfAssessmentHints: [] };
    const confirmed = vi.fn();
    function Harness() {
      const [value, setValue] = useState(initial);
      return <MaterialConfirmation draft={value} text="PostgreSQL with Jest" saving={false} confirmed={false} documentKind="jd"
        onItemsChange={items => setValue({ ...value, items })} onConfirm={() => confirmed(value.items)} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "移除技能词 Jest" }));
    fireEvent.change(screen.getByLabelText("事实 1 要求类型"), { target: { value: "must" } });
    expect(screen.getByRole("button", { name: "移除技能词 PostgreSQL" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认这些事实" }));
    expect(confirmed).toHaveBeenLastCalledWith([expect.objectContaining({ skillLabels: ["PostgreSQL"], requirementLevel: "must" })]);
    fireEvent.change(screen.getByLabelText("事实 1"), { target: { value: "Coordinate the Jest training calendar" } });
    expect(screen.queryByRole("button", { name: "移除技能词 PostgreSQL" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认这些事实" }));
    expect(confirmed.mock.lastCall?.[0][0].skillLabels).toEqual([]);
  });
  it("shows the exact source term before its normalized name and keeps only words supported by the edited fact", () => {
    const practice = "我在指导下清洗数据。", limit = "每周学习 TypeScript 两小时。";
    const text = practice + limit;
    const reference = { ...receipt, ownerId: "owner", lifecycle: "active", text, segments: [{ id: "segment-1", start: 0, end: text.length }] };
    const projection = validateDocumentExtraction({ schemaVersion: "2026.11.1", items: [
      { id: "practice", kind: "experience", text: practice, requirementLevel: null, skillLabels: ["data cleaning"], selfLevelHint: "guided", source: { segmentId: "segment-1", quote: practice } },
      { id: "limit", kind: "constraint", text: limit, requirementLevel: null, skillLabels: ["TypeScript"], selfLevelHint: null, source: { segmentId: "segment-1", quote: limit } },
    ] }, "owner", reference, KIMI_GROUNDED_TERMS_POLICY_ID);
    const confirmed = vi.fn();
    function Harness() {
      const [review, setReview] = useState<DocumentReviewDraft>({ id: "review", schemaVersion: "2026.11.1", ...receipt, origin: "ai", extractionId: "extraction", ...projection, updatedAt: draft.updatedAt });
      return <MaterialConfirmation draft={review} text={text} saving={false} confirmed={false} onAdoptLevels={vi.fn()}
        onItemsChange={items => setReview({ ...review, items })} onConfirm={() => confirmed(review.items)} />;
    }
    render(<Harness />);
    const word = within(screen.getByRole("group", { name: "事实 1" })).getByRole("listitem");
    expect(word).toHaveTextContent(/^清洗数据.*规范名称 data cleaning/u);
    expect(within(word).getByRole("button", { name: "移除技能词 清洗数据" })).toBeInTheDocument();
    expect(screen.getByText("约束中提到的主题")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移除约束主题 TypeScript" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("事实 1"), { target: { value: "We cleaned data together." } });
    fireEvent.click(screen.getByRole("button", { name: "确认这些事实" }));
    expect(confirmed.mock.lastCall?.[0][0].skillLabels).toEqual(["data cleaning"]);
    fireEvent.change(screen.getByLabelText("事实 1"), { target: { value: "We organized the calendar." } });
    expect(screen.queryByRole("button", { name: "移除技能词 清洗数据" })).not.toBeInTheDocument();
    expect(screen.queryByText("单独核对能力建议")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("事实 1"), { target: { value: practice } });
    fireEvent.change(screen.getByLabelText("事实 2 信息类型"), { target: { value: "skill-claim" } });
    fireEvent.click(screen.getByRole("button", { name: "确认这些事实" }));
    expect(confirmed.mock.lastCall?.[0].map((item: { skillLabels: string[] }) => item.skillLabels)).toEqual([[], []]);
  });
  it.each([
    ["grounded-skill-labels-v2", ["data cleaning"]], [undefined, []],
  ] as const)("applies the saved draft's edit rule to a literal term rewritten using an equivalent phrase", (reviewProjection, expected) => {
    const text = "Practiced data cleaning.";
    const sourceRef = { documentId: receipt.documentId, documentVersionId: receipt.documentVersionId, textVersionId: receipt.textVersionId, start: 0, end: text.length };
    const review: DocumentReviewDraft = { id: "review", schemaVersion: "2026.11.1", ...receipt, origin: "ai", extractionId: "extraction", reviewProjection,
      items: [{ id: "practice", kind: "experience", text, origin: "extracted", sourceRef, requirementLevel: null, skillLabels: ["data cleaning"] }], selfAssessmentHints: [], updatedAt: draft.updatedAt };
    const save = vi.fn();
    render(<MaterialConfirmation draft={review} text={text} saving={false} confirmed={false} onItemsChange={save} onConfirm={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("事实 1"), { target: { value: "I cleaned data during the workshop." } });
    expect(save.mock.lastCall?.[0][0].skillLabels).toEqual(expected);
  });
  it.each([
    ["grounded-skill-labels-v2", "原文提到课程覆盖缺口，请核对"],
    [undefined, "可能超出当前技能蓝图"],
  ] as const)("names a coverage reminder according to the review's evidence and version", (reviewProjection, label) => {
    const text = "现有课程尚未涵盖键盘导航。";
    const sourceRef = { documentId: receipt.documentId, documentVersionId: receipt.documentVersionId, textVersionId: receipt.textVersionId, start: 0, end: text.length };
    const review: DocumentReviewDraft = { id: "review", schemaVersion: "2026.11.1", ...receipt, origin: "ai", extractionId: "extraction",
      reviewProjection, items: [], selfAssessmentHints: [], reviewPoints: [{ id: "coverage", code: "uncovered-skill", sourceRef, resolution: "unresolved" }], updatedAt: draft.updatedAt };
    render(<MaterialConfirmation draft={review} text={text} saving={false} confirmed={false} onItemsChange={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("group", { name: label })).toHaveTextContent(text);
    expect(screen.getByRole("combobox", { name: label })).toBeInTheDocument();
  });
  it("requires explicit permission, then pre-fills review without granting self levels", async () => {
    const { Harness, invoke, adopted } = fixture(); render(<Harness />);
    fireEvent.change(screen.getByLabelText("简历正文"), { target: { value: "SQL 原文" } });
    expect(screen.getByRole("button", { name: "保存并 AI 分析" })).toBeDisabled(); expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/允许将当前文本/));
    fireEvent.click(screen.getByRole("button", { name: "保存并 AI 分析" }));
    await screen.findByDisplayValue("参与 SQL 查询练习");
    fireEvent.change(screen.getByLabelText("事实 1"), { target: { value: "按指导完成 SQL 查询练习" } });
    await waitFor(() => expect(invoke.mock.calls.some(([method]) => method === "saveDocumentReviewDraft")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "确认这些事实" }));
    await screen.findByText("已确认，可用于本次规划。"); expect(adopted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "采用 SQL 的需指导完成建议" }));
    expect(adopted).toHaveBeenCalledWith({ sql: "guided" });
  });
  it("removes the associated self-assessment suggestion when the user drops its fact", async () => {
    const { Harness, invoke, adopted } = fixture(); render(<Harness />);
    fireEvent.change(screen.getByLabelText("简历正文"), { target: { value: "SQL 原文" } });
    fireEvent.click(screen.getByLabelText(/允许将当前文本/));
    fireEvent.click(screen.getByRole("button", { name: "保存并 AI 分析" }));
    await screen.findByRole("button", { name: "采用 SQL 的需指导完成建议" });
    fireEvent.click(screen.getByRole("button", { name: "移除事实 1" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("saveDocumentReviewDraft", expect.objectContaining({ items: [], selfAssessmentHints: [] }), expect.anything()));
    expect(screen.queryByRole("button", { name: "采用 SQL 的需指导完成建议" })).not.toBeInTheDocument();
    expect(adopted).not.toHaveBeenCalled();
  });
  it("shows the applicable Kimi privacy terms before agreeing and requires fresh consent when the policy changes", () => {
    const { invoke } = fixture();
    const props = { kind: "jd", value: null, onChange: vi.fn(), client: { request: invoke } as unknown as DocumentsClient } as const;
    const kimi = { ...caps, providerLabel: "OpenRouter / Moonshot AI", privacyNotice: "kimi-k31-pro-zdr" } as const;
    const view = render(<MaterialTextPanel {...props} capabilities={kimi} />);
    fireEvent.change(screen.getByLabelText("岗位 JD正文"), { target: { value: "合成岗位资料" } });
    const consent = screen.getByRole("checkbox", { name: /允许将当前文本/ });
    expect(consent).toHaveAccessibleDescription(/Kimi K3\.1 Pro/);
    expect(consent).toHaveAccessibleDescription(/缓存/);
    expect(consent).toHaveAccessibleDescription(/分类/);
    expect(consent).toHaveAccessibleDescription(/依法/);
    expect(screen.getByRole("link", { name: "OpenRouter 零数据保留说明" })).toHaveAttribute("href", "https://openrouter.ai/docs/guides/features/zdr");
    const terms = screen.getByRole("link", { name: "Kimi 开放平台隐私政策" });
    expect(terms).toHaveAttribute("href", "https://platform.kimi.ai/docs/agreement/userprivacy");
    expect(terms).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    fireEvent.click(consent);
    expect(screen.getByRole("button", { name: "保存并 AI 分析" })).toBeEnabled();

    view.rerender(<MaterialTextPanel {...props} capabilities={{ ...kimi, policyVersion: "2026.12.1" }} />);
    expect(screen.getByRole("button", { name: "保存并 AI 分析" })).toBeDisabled();
    view.rerender(<MaterialTextPanel {...props} capabilities={kimi} />);
    expect(consent).not.toBeChecked();
    view.rerender(<MaterialTextPanel {...props} capabilities={{ ...caps, providerLabel: kimi.providerLabel }} />);
    expect(screen.queryByRole("link", { name: "Kimi 开放平台隐私政策" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存并手动整理" })).toBeEnabled();
    expect(invoke).not.toHaveBeenCalled();
  });
  it("manual fallback never creates a consent or analysis job", async () => {
    const { Harness, invoke } = fixture(); render(<Harness />);
    fireEvent.change(screen.getByLabelText("简历正文"), { target: { value: "SQL 原文" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并手动整理" }));
    await screen.findByRole("button", { name: "添加事实" });
    expect(invoke.mock.calls.some(([method]) => method === "createDocumentConsent" || method === "createDocumentJob")).toBe(false);
  });
  it("displays provider unavailability honestly and leaves manual editing available", () => {
    const { invoke } = fixture();
    render(<MaterialTextPanel kind="jd" capabilities={{ ...caps, analysisEnabled: false, reason: "qualification-required" }} client={{ request: invoke } as unknown as DocumentsClient} value={null} onChange={() => undefined} />);
    expect(screen.getByText(/AI 分析暂不可用/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存并手动整理" })).toBeInTheDocument();
  });
});
