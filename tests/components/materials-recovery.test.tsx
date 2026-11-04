import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MaterialTextPanel } from "../../app/components/materials/material-text-panel";
import type { DocumentsClient } from "../../app/lib/documents-client";
import type { MaterialDocumentDraftRef } from "../../app/lib/use-material-selection";
import type { DocumentReviewDraft } from "../../app/contracts/documents";
const caps = {
    documentsEnabled: true,
    analysisEnabled: true,
    planningEnabled: true,
    hasDocuments: false,
    providerLabel: "离线测试",
    providerPolicyId: "policy",
    policyVersion: "2026.11.1",
    reason: "ready"
} as const;
const receipt = { documentId: "doc", documentVersionId: "version", textVersionId: "text", revision: 0 };
const manual: DocumentReviewDraft = {
    id: "draft",
    schemaVersion: "2026.11.1",
    ...receipt,
    extractionId: null,
    origin: "manual",
    revision: 1,
    items: [{
            id: "fact",
            kind: "skill-claim",
            text: "我已修改的事实",
            origin: "user",
            sourceRef: null,
            requirementLevel: null
        }],
    selfAssessmentHints: [],
    updatedAt: "2026-11-04T00:00:00.000Z"
};
beforeEach(() => localStorage.clear());
afterEach(cleanup);
function harness(invoke: ReturnType<typeof vi.fn>, initial: MaterialDocumentDraftRef | null = null) {
    const client = { request: invoke } as unknown as DocumentsClient;
    return function Harness() {
        const [value, setValue] = useState(initial);
        return <MaterialTextPanel kind="resume" capabilities={caps} client={client} value={value} onChange={setValue} recoveryScope={{ ownerId: "user:owner", scopeKey: "draft:resume" }} pollIntervalMs={5}/>;
    };
}
it("restores a lost save response by receipt after refresh without persisting private text", async () => {
    const invoke = vi.fn(async (endpoint: string, input: Record<string, unknown>) => {
        void input;
        if (endpoint === "createDocument")
            throw Error("response lost");
        if (endpoint === "readDocumentMutation")
            return { receipt };
        if (endpoint === "readDocument")
            return { text: "PRIVATE-MATERIAL-SENTINEL-7f91", document: { displayName: "R" } };
        if (endpoint === "readDocumentReviewDraft")
            return { draft: null };
        throw Error(endpoint);
    });
    const Harness = harness(invoke);
    const first = render(<Harness />);
    fireEvent.change(screen.getByLabelText("简历正文"), { target: { value: "PRIVATE-MATERIAL-SENTINEL-7f91" } });
    fireEvent.click(screen.getByRole("button", { name: "保存并手动整理" }));
    await screen.findByText("response lost");
    expect(JSON.stringify(localStorage)).not.toContain("PRIVATE-MATERIAL-SENTINEL-7f91");
    first.unmount();
    render(<Harness />);
    await waitFor(() => expect(screen.getByLabelText("简历正文")).toHaveValue("PRIVATE-MATERIAL-SENTINEL-7f91"));
    expect(invoke.mock.calls.filter(([endpoint]) => endpoint === "createDocument")).toHaveLength(1);
    expect(invoke.mock.calls.some(([endpoint]) => endpoint === "createDocumentConsent" || endpoint === "createDocumentJob")).toBe(false);
});
it("keeps edited review until late candidates are compared and explicitly adopted", async () => {
    const candidate = {
        ...manual,
        extractionId: "extract-new",
        origin: "ai",
        items: [{ ...manual.items[0]!, id: "new-fact", text: "新的 AI 候选" }]
    };
    const invoke = vi.fn(async (endpoint: string, input: Record<string, unknown>) => {
        void input;
        if (endpoint === "readDocument")
            return { text: "SQL 原文", document: { displayName: "R" } };
        if (endpoint === "readDocumentReviewDraft")
            return { draft: manual };
        if (endpoint === "readDocumentJob")
            return {
                jobId: "job",
                revision: 1,
                state: "succeeded",
                costState: "settled",
                extractionId: "extract-new",
                errorCode: null
            };
        if (endpoint === "readDocumentExtraction")
            return { draft: candidate, expectedRevision: 1 };
        if (endpoint === "adoptDocumentExtraction")
            return { draft: { ...candidate, revision: 2 } };
        throw Error(endpoint);
    });
    const Harness = harness(invoke, { ...receipt, jobId: "job", confirmationId: "confirmation" });
    render(<Harness />);
    await screen.findByDisplayValue("我已修改的事实");
    fireEvent.click(await screen.findByRole("button", { name: "比较新 AI 候选" }));
    await screen.findByText("新的 AI 候选");
    expect(screen.getByDisplayValue("我已修改的事实")).toBeInTheDocument();
    expect(invoke.mock.calls.some(([endpoint]) => endpoint === "adoptDocumentExtraction")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "采用这些新候选替换核对草稿" }));
    await screen.findByDisplayValue("新的 AI 候选");
    expect(invoke.mock.calls.find(([endpoint]) => endpoint === "adoptDocumentExtraction")?.[1]).toMatchObject({ expectedRevision: 1, extractionId: "extract-new" });
    expect(screen.queryByText("已确认，可用于本次规划。")).not.toBeInTheDocument();
});
it("hides old confirmation while text is unsaved and blocks unknown-cost reanalysis", async () => {
    const invoke = vi.fn(async (endpoint: string, input: Record<string, unknown>) => {
        void input;
        if (endpoint === "readDocument")
            return { text: "SQL 原文", document: { displayName: "R" } };
        if (endpoint === "readDocumentReviewDraft")
            return { draft: manual };
        if (endpoint === "readDocumentJob")
            return {
                jobId: "job",
                revision: 1,
                state: "cost-unknown",
                costState: "held-unknown",
                extractionId: null,
                errorCode: "outcome-unknown"
            };
        throw Error(endpoint);
    });
    const Harness = harness(invoke, { ...receipt, jobId: "job", confirmationId: "confirmation" });
    render(<Harness />);
    await screen.findByText("已确认，可用于本次规划。");
    fireEvent.change(screen.getByLabelText("简历正文"), { target: { value: "changed" } });
    expect(screen.queryByText("已确认，可用于本次规划。")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/允许将当前文本/));
    expect(screen.getByRole("button", { name: "保存并 AI 分析" })).toBeDisabled();
    expect(invoke.mock.calls.some(([endpoint]) => endpoint === "createDocumentJob")).toBe(false);
});
it("retries a lost analysis response using the saved mutation and only starts a new attempt explicitly", async () => {
    let loseResponse = true;
    let number = 0;
    const invoke = vi.fn(async (endpoint: string, input: Record<string, unknown>) => {
        if (endpoint === "readDocument")
            return { text: "SQL 原文", document: { displayName: "R" } };
        if (endpoint === "readDocumentReviewDraft")
            return { draft: manual };
        if (endpoint === "readDocumentJob")
            return {
                jobId: input.jobId,
                revision: 1,
                state: "failed",
                costState: "settled",
                extractionId: null,
                errorCode: "invalid-candidate"
            };
        if (endpoint === "createDocumentConsent")
            return { consentId: "consent" };
        if (endpoint === "createDocumentJob") {
            if (loseResponse)
                throw Error("job response lost");
            return { jobId: `job-new-${++number}`, state: "queued" };
        }
        if (endpoint === "readDocumentMutation")
            return { receipt: null };
        throw Error(endpoint);
    });
    const Harness = harness(invoke, { ...receipt, jobId: "job-old" });
    const first = render(<Harness />);
    await screen.findByRole("button", { name: "重新 AI 分析" });
    expect(invoke.mock.calls.filter(([endpoint]) => endpoint === "createDocumentJob")).toHaveLength(0);
    fireEvent.click(screen.getByLabelText(/允许将当前文本/));
    fireEvent.click(screen.getByRole("button", { name: "重新 AI 分析" }));
    await screen.findByText("job response lost");
    const firstMutation = invoke.mock.calls.find(([endpoint]) => endpoint === "createDocumentJob")?.[1].mutationId;
    first.unmount();
    loseResponse = false;
    render(<Harness />);
    fireEvent.click(await screen.findByLabelText(/允许将当前文本/));
    fireEvent.click(await screen.findByRole("button", { name: "继续上次分析请求" }));
    await waitFor(() => expect(invoke.mock.calls.filter(([endpoint]) => endpoint === "createDocumentJob")).toHaveLength(2));
    expect(invoke.mock.calls.filter(([endpoint]) => endpoint === "createDocumentJob")[1]?.[1].mutationId).toBe(firstMutation);
    await screen.findByRole("button", { name: "重新 AI 分析" });
    fireEvent.click(screen.getByLabelText(/允许将当前文本/));
    fireEvent.click(screen.getByRole("button", { name: "重新 AI 分析" }));
    await waitFor(() => expect(invoke.mock.calls.filter(([endpoint]) => endpoint === "createDocumentJob")).toHaveLength(3));
    expect(invoke.mock.calls.filter(([endpoint]) => endpoint === "createDocumentJob")[2]?.[1].mutationId).not.toBe(firstMutation);
});
it("saves explicit high-impact resolutions with the same draft CAS and clears old confirmation", async () => {
    const review: DocumentReviewDraft = {
        ...manual,
        reviewPoints: [{
                id: "point",
                code: "team-attribution",
                sourceRef: { documentId: "doc", documentVersionId: "version", textVersionId: "text", start: 0, end: 3 },
                resolution: "unresolved"
            }]
    };
    const invoke = vi.fn(async (endpoint: string, input: Record<string, unknown>) => {
        if (endpoint === "readDocument")
            return { text: "SQL 原文", document: { displayName: "R" } };
        if (endpoint === "readDocumentReviewDraft")
            return { draft: review };
        if (endpoint === "saveDocumentReviewDraft")
            return { draft: { ...review, reviewPoints: input.reviewPoints, revision: 2 } };
        throw Error(endpoint);
    });
    const Harness = harness(invoke, { ...receipt, confirmationId: "old-confirmation" });
    render(<Harness />);
    await screen.findByText("还有 1 项重点提醒需要处理。");
    expect(screen.getByRole("button", { name: "确认这些事实" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("团队成果不直接等于个人独立能力"), { target: { value: "confirmed" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "确认这些事实" })).toBeEnabled());
    expect(invoke.mock.calls.find(([endpoint]) => endpoint === "saveDocumentReviewDraft")?.[1]).toMatchObject({ expectedRevision: 1, reviewPoints: [{ id: "point", resolution: "confirmed" }] });
    expect(screen.queryByText("已确认，可用于本次规划。")).not.toBeInTheDocument();
});
