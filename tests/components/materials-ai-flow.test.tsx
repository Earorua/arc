import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialTextPanel } from "../../app/components/materials/material-text-panel";
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
