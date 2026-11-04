import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MaterialSetupProvider, MaterialSetupSlot, useMaterialSetup } from "../../app/components/materials/material-setup-provider";
import { MaterialLibrary } from "../../app/components/materials/material-library";
import { MaterialTextPanel } from "../../app/components/materials/material-text-panel";
import { MaterialContextReview } from "../../app/components/materials/material-context-review";
import type { DocumentsClient } from "../../app/lib/documents-client";
import type { MaterialDocumentDraftRef } from "../../app/lib/use-material-selection";
import type { DocumentReviewDraft } from "../../app/contracts/documents";
import { materialContextRequest } from "../helpers/material-planning";
const caps = { documentsEnabled: true, analysisEnabled: true, planningEnabled: true, hasDocuments: true, providerLabel: "离线测试", providerPolicyId: "policy-a", policyVersion: "2026.11.1", reason: "ready" } as const;
const reference = (letter: string): MaterialDocumentDraftRef => ({ documentId: `doc-${letter}`, documentVersionId: `version-${letter}`, textVersionId: `text-${letter}`, revision: 0 });
const review = (letter: string): DocumentReviewDraft => ({ ...reference(letter), id: `review-${letter}`, schemaVersion: "2026.11.1", extractionId: null, origin: "manual", revision: 1,
  items: [{ id: `fact-${letter}`, kind: "experience", text: `Fact ${letter}`, origin: "user", sourceRef: null, requirementLevel: null }], selfAssessmentHints: [], updatedAt: "2026-11-04T00:00:00.000Z" });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => localStorage.clear()); afterEach(cleanup);
function SlotControls({ locked }: { locked: boolean }) {
    const state = useMaterialSetup()!;
    const { selectionRef: _selection, scope: _scope, mutationId: _mutation, ...input } = materialContextRequest(); void _selection; void _scope; void _mutation;
    return <><button onClick={() => state.replaceSlot("resume", { ...reference("a"), confirmationId: locked ? "confirmed-a" : undefined })}>Select A</button>
      <button onClick={() => state.replaceSlot("resume", reference("b"))}>Select B</button>
      <output aria-label="Current reference">{JSON.stringify(state.refs.slots.resume ?? null)}</output>
      <MaterialSetupSlot kind="resume" />{locked && <MaterialContextReview input={input} disabled onPreview={() => undefined} />}</>;
}
function SlotHarness({ client, locked = false }: { client: DocumentsClient; locked?: boolean }) {
  return <MaterialSetupProvider ownerId="owner-a" scopeKey="boundary" client={client}><SlotControls locked={locked} /></MaterialSetupProvider>;
}
it.each(["save", "confirm"])("fences a delayed %s across same-owner A→B→A and clears removed text", async operation => {
  const pending = deferred<unknown>(); let signal: AbortSignal | undefined;
  const request = vi.fn(async (endpoint: string, input: Record<string, unknown>, candidate?: AbortSignal) => {
    const letter = input.documentId === "doc-b" ? "b" : "a";
    if (endpoint === "readDocument") return { text: `PRIVATE-BODY-${letter}`, document: { displayName: `Private name ${letter}` } };
    if (endpoint === "readDocumentReviewDraft") return { draft: review(letter) };
    if (endpoint === "readDocumentMutation") return { receipt: null };
    if (endpoint === (operation === "save" ? "createDocumentVersion" : "createDocumentConfirmation")) { signal = candidate; return pending.promise; }
    throw Error(endpoint);
  });
  const client = { request, capabilities: async () => caps } as unknown as DocumentsClient;
  render(<SlotHarness client={client} />); await screen.findByLabelText("简历正文");
  fireEvent.click(screen.getByText("Select A")); await screen.findByDisplayValue("PRIVATE-BODY-a");
  if (operation === "save") { fireEvent.change(screen.getByLabelText("简历正文"), { target: { value: "PRIVATE-EDIT-a" } }); fireEvent.click(screen.getByText("保存并手动整理")); }
  else fireEvent.click(screen.getByText("确认这些事实"));
  await waitFor(() => expect(signal).toBeDefined());
  fireEvent.click(screen.getByText("Select B")); await screen.findByDisplayValue("PRIVATE-BODY-b");
  expect(signal?.aborted).toBe(true);
  fireEvent.click(screen.getByText("Select A")); await screen.findByDisplayValue("PRIVATE-BODY-a");
  await act(async () => { pending.resolve(operation === "save" ? { ...reference("a"), documentVersionId: "late-version", textVersionId: "late-text", revision: 1 } : { confirmationId: "late-confirmation", revision: 1 }); await pending.promise; });
  expect(screen.getByLabelText("Current reference")).not.toHaveTextContent(/late-/);
  expect(screen.getByLabelText("简历正文")).toHaveValue("PRIVATE-BODY-a");
  fireEvent.click(screen.getByText("本次不使用这份简历"));
  expect(screen.getByLabelText("简历正文")).toHaveValue("");
  expect(screen.getByLabelText("Current reference")).toHaveTextContent("null");
  expect(JSON.stringify(localStorage)).not.toMatch(/PRIVATE-|Private name|Fact a/);
});
it("continues a new library document's consent/job chain after its save receipt without remounting the editor", async () => {
  const consent = deferred<{ consentId: string }>(); let consentSignal: AbortSignal | undefined;
  const request = vi.fn(async (endpoint: string, _input: unknown, signal?: AbortSignal) => {
    if (endpoint === "listDocuments") return { documents: [], nextCursor: null };
    if (endpoint === "createDocument") return reference("a");
    if (endpoint === "createDocumentConsent") { consentSignal = signal; return consent.promise; }
    if (endpoint === "createDocumentJob") return { jobId: "job-a", state: "queued" };
    if (endpoint === "readDocumentJob") return { jobId: "job-a", revision: 1, state: "succeeded", costState: "settled", extractionId: "extract-a", errorCode: null };
    if (endpoint === "readDocumentReviewDraft") return { draft: { ...review("a"), extractionId: "extract-a" } };
    throw Error(endpoint);
  });
  render(<MaterialLibrary ownerId="owner-a" capabilities={caps} client={{ request } as unknown as DocumentsClient} />);
  fireEvent.click(screen.getByText("新增简历"));
  const textarea = screen.getByLabelText("简历正文");
  fireEvent.change(textarea, { target: { value: "PRIVATE-LIBRARY-BODY" } }); fireEvent.click(screen.getByLabelText(/允许将当前文本/)); fireEvent.click(screen.getByText("保存并 AI 分析"));
  await waitFor(() => expect(consentSignal).toBeDefined());
  expect(consentSignal?.aborted).toBe(false); expect(screen.getByLabelText("简历正文")).toBe(textarea);
  await act(async () => { consent.resolve({ consentId: "consent-a" }); await consent.promise; });
  await screen.findByDisplayValue("Fact a");
  expect(request.mock.calls.filter(([endpoint]) => endpoint === "createDocument")).toHaveLength(1);
  expect(request.mock.calls.filter(([endpoint]) => endpoint === "createDocumentJob")).toHaveLength(1);
  expect(JSON.stringify(localStorage)).not.toContain("PRIVATE-LIBRARY-BODY");
});
it("does not revive a deliberately removed slot from an outstanding save receipt", async () => {
  const pending = deferred<unknown>();
  const request = vi.fn(async (endpoint: string) => {
    if (endpoint === "readDocument") return { text: "PRIVATE-REMOVED-BODY", document: {} };
    if (endpoint === "readDocumentReviewDraft") return { draft: review("a") };
    if (endpoint === "createDocumentVersion") return pending.promise;
    if (endpoint === "readDocumentMutation") return { receipt: { ...reference("a"), documentVersionId: "version-committed", textVersionId: "text-committed", revision: 1 } };
    throw Error(endpoint);
  });
  render(<SlotHarness client={{ request, capabilities: async () => caps } as unknown as DocumentsClient} />);
  await screen.findByLabelText("简历正文"); fireEvent.click(screen.getByText("Select A")); await screen.findByDisplayValue("PRIVATE-REMOVED-BODY");
  fireEvent.change(screen.getByLabelText("简历正文"), { target: { value: "PRIVATE-NEW-REMOVED-BODY" } }); fireEvent.click(screen.getByText("保存并手动整理"));
  await waitFor(() => expect(request.mock.calls.some(([endpoint]) => endpoint === "createDocumentVersion")).toBe(true));
  await act(async () => { fireEvent.click(screen.getByText("本次不使用这份简历")); });
  expect(screen.getByLabelText("Current reference")).toHaveTextContent("null");
  expect(screen.getByLabelText("简历正文")).toHaveValue("");
  expect(request.mock.calls.some(([endpoint]) => endpoint === "readDocumentMutation")).toBe(false);
});
it("restores only the deletion receipt after refresh and keeps checking until cleanup really completes", async () => {
  let deleted = false; let completed = false;
  const request = vi.fn(async (endpoint: string) => {
    if (endpoint === "listDocuments") return { documents: deleted ? [] : [{ id: "doc-a", displayName: "PRIVATE-DELETE-NAME", kind: "jd", lifecycle: "active", revision: 0 }], nextCursor: null };
    if (endpoint === "deleteDocument") { deleted = true; return { deletionJobId: "deletion-a", state: "cleanup-pending" }; }
    if (endpoint === "readDocumentDeletion") return { deletionJobId: "deletion-a", state: completed ? "completed" : "failed", errorCode: completed ? null : "cleanup-failed" };
    throw Error(endpoint);
  });
  const client = { request } as unknown as DocumentsClient;
  const first = render(<MaterialLibrary ownerId="owner-a" capabilities={caps} client={client} />);
  fireEvent.click(await screen.findByText("删除 PRIVATE-DELETE-NAME")); fireEvent.click(screen.getByText("确认删除这份资料"));
  await screen.findByText("查询删除清理状态"); first.unmount();
  expect(JSON.stringify(localStorage)).toContain("deletion-a"); expect(JSON.stringify(localStorage)).not.toContain("PRIVATE-DELETE-NAME");
  render(<MaterialLibrary ownerId="owner-a" capabilities={caps} client={client} />);
  fireEvent.click(await screen.findByText("查询删除清理状态")); await screen.findByText("清理暂未完成，后台会继续尝试。资料已不可引用。");
  expect(screen.getByText("查询删除清理状态")).toBeInTheDocument(); completed = true;
  fireEvent.click(screen.getByText("查询删除清理状态")); await screen.findByText("资料及已登记的派生副本已清理完成。");
  expect(JSON.stringify(localStorage)).not.toContain("deletion-a");
  expect(request.mock.calls.filter(([endpoint]) => endpoint === "deleteDocument")).toHaveLength(1);
});
it("manual JD fallback requires requirement classification and resolution of its high-impact source reminder", async () => {
  let draft: DocumentReviewDraft = { ...review("a"), items: [], reviewPoints: [{ id: "point-a", code: "conflicting-requirement", resolution: "unresolved", sourceRef: { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", start: 0, end: 3 } }] };
  const request = vi.fn(async (endpoint: string, input: Record<string, unknown>) => {
    if (endpoint === "createDocument") return reference("a");
    if (endpoint === "readDocumentReviewDraft") return { draft };
    if (endpoint === "saveDocumentReviewDraft") { draft = { ...draft, items: input.items as DocumentReviewDraft["items"], reviewPoints: input.reviewPoints as DocumentReviewDraft["reviewPoints"], revision: draft.revision + 1 }; return { draft }; }
    if (endpoint === "createDocumentConfirmation") return { confirmationId: "confirmation-a", revision: 1 };
    throw Error(endpoint);
  });
  function Harness() { const [value, setValue] = useState<MaterialDocumentDraftRef | null>(null); return <MaterialTextPanel kind="jd" capabilities={{ ...caps, analysisEnabled: false }} client={{ request } as unknown as DocumentsClient} value={value} onChange={setValue} />; }
  render(<Harness />); fireEvent.change(screen.getByLabelText("岗位 JD正文"), { target: { value: "SQL required but optional" } }); fireEvent.click(screen.getByText("保存并手动整理"));
  fireEvent.click(await screen.findByText("添加事实"));
  expect(screen.getByLabelText("事实 1 信息类型")).toHaveValue("requirement"); expect(screen.getByLabelText("事实 1 要求类型")).toHaveValue("unspecified");
  expect(screen.getByText("确认这些事实")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("事实 1"), { target: { value: "SQL" } });
  fireEvent.change(screen.getByLabelText("事实 1 要求类型"), { target: { value: "must" } });
  await waitFor(() => expect(draft.items[0]?.requirementLevel).toBe("must")); expect(screen.getByText("确认这些事实")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("岗位要求分类存在冲突"), { target: { value: "confirmed" } });
  await waitFor(() => expect(screen.getByText("确认这些事实")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("事实 1 要求类型"), { target: { value: "unspecified" } }); expect(screen.getByText("确认这些事实")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("事实 1 要求类型"), { target: { value: "preferred" } });
  await waitFor(() => expect(screen.getByText("确认这些事实")).toBeEnabled()); fireEvent.click(screen.getByText("确认这些事实"));
  await screen.findByText("已确认，可用于本次规划。");
  expect(request.mock.calls.find(([endpoint]) => endpoint === "createDocumentConfirmation")?.[1]).toMatchObject({ items: [{ kind: "requirement", requirementLevel: "preferred", origin: "user" }] });
  expect(request.mock.calls.some(([endpoint]) => endpoint === "createDocumentConsent" || endpoint === "createDocumentJob")).toBe(false);
});
it("keeps the confirmed material selection locked while generation recovery is locked", async () => {
  const request = vi.fn(async (endpoint: string) => { if (endpoint === "readDocument") return { text: "Body", document: {} }; if (endpoint === "readDocumentReviewDraft") return { draft: review("a") }; throw Error(endpoint); });
  render(<SlotHarness locked client={{ request, capabilities: async () => caps } as unknown as DocumentsClient} />);
  await screen.findByLabelText("简历正文"); fireEvent.click(screen.getByText("Select A"));
  expect(await screen.findByText("移除简历选择")).toBeDisabled();
  fireEvent.click(screen.getByText("移除简历选择")); expect(screen.getByLabelText("Current reference")).toHaveTextContent("confirmed-a");
});
