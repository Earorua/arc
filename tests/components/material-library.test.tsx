import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialLibrary } from "../../app/components/materials/material-library";
import type { DocumentsClient } from "../../app/lib/documents-client";
import { DocumentClientError } from "../../app/lib/documents-client";
const capabilities = { documentsEnabled: true, analysisEnabled: false, planningEnabled: true, hasDocuments: true, providerLabel: null, providerPolicyId: null, policyVersion: null, reason: "disabled" } as const;
function libraryWithConfirmedJd() {
  const ref = { documentId: "doc-b", documentVersionId: "version-b", textVersionId: "text-b", revision: 1 };
  const row = { id: ref.documentId, displayName: "合成公司 B", kind: "jd", lifecycle: "active", revision: 1, currentDocumentVersionId: ref.documentVersionId };
  const version = { id: ref.documentVersionId, textVersionId: ref.textVersionId, documentId: ref.documentId };
  const draft = { ...ref, id: "review-b", schemaVersion: "2026.11.1", origin: "manual", extractionId: null,
    items: [{ id: "fact-b", kind: "requirement", text: "Prepare SQL reports", origin: "user", sourceRef: null, requirementLevel: "must" }],
    reviewPoints: [], selfAssessmentHints: [], updatedAt: "2026-11-06T08:00:00.000Z" };
  const confirmation = { confirmationId: "confirmed-b", revision: 1 };
  let active = true;
  const request = vi.fn(async (endpoint: string, input: { includeConfirmation?: string }) => {
    if (endpoint === "listDocuments") return { documents: [row], nextCursor: null };
    if (endpoint === "readDocument") return { document: row, version, text: "SQL reports are required" };
    if (endpoint === "readDocumentReviewDraft") return { draft, ...(active && input.includeConfirmation === "current" ? { confirmation } : {}) };
    if (endpoint === "saveDocumentReviewDraft") return { draft: { ...draft, revision: draft.revision + 1 } };
    throw Error(`Unexpected ${endpoint}`);
  });
  const onSelect = vi.fn();
  const client = { request } as unknown as DocumentsClient;
  const mount = () => render(<MaterialLibrary ownerId="owner-b" capabilities={capabilities} client={client} onSelect={onSelect} />);
  const open = async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "查看并核对 合成公司 B" }));
    await screen.findByDisplayValue("Prepare SQL reports");
  };
  return { ref, request, onSelect, client, mount, open, revoke: () => { active = false; }, advanceDocumentRevision: () => { confirmation.revision++; } };
}
describe("private material library", () => {
  afterEach(() => { cleanup(); localStorage.clear(); });
  it.each(["lock", "lock-unlock", "unrelated", "scope"] as const)("uses only a still-authorized adoption after a parent %s transition", async transition => {
    const { client, request } = libraryWithConfirmedJd();
    const initial = vi.fn(), current = vi.fn();
    const page = (onSelect: typeof initial | undefined, key = "goal") => <MaterialLibrary ownerId="owner-b" capabilities={capabilities}
      client={client} currentUse={{ key, entries: [], disabled: !onSelect, detach: async () => {} }} onSelect={onSelect && ((kind, ref) => onSelect(kind, ref))} />;
    const view = render(page(initial));
    fireEvent.click(await screen.findByRole("button", { name: "查看并核对 合成公司 B" }));
    const use = await screen.findByRole("button", { name: "采用这个已确认版本" });
    const gate = Promise.withResolvers<void>(), read = request.getMockImplementation()!;
    request.mockImplementationOnce(async (method, input) => { const result = await read(method, input); await gate.promise; return result; });
    fireEvent.click(use);
    if (transition.startsWith("lock")) {
      view.rerender(page(undefined));
      expect(screen.queryByRole("button", { name: "采用这个已确认版本" })).not.toBeInTheDocument();
    }
    if (transition !== "lock") view.rerender(page(current, transition === "scope" ? "another-goal" : "goal"));
    await act(async () => { gate.resolve(); await gate.promise; });
    expect(initial).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledTimes(transition === "unrelated" ? 1 : 0);
  });
  it("recovers an unchanged confirmation on unlock without replacing edits or using an unchecked cache", async () => {
    const { client, onSelect, request } = libraryWithConfirmedJd();
    const page = (locked: boolean) => <MaterialLibrary ownerId="owner-b" capabilities={capabilities} client={client} onSelect={locked ? undefined : onSelect} />;
    const view = render(page(true));
    fireEvent.click(await screen.findByRole("button", { name: "查看并核对 合成公司 B" }));
    await screen.findByDisplayValue("Prepare SQL reports");
    expect(screen.queryByText("已确认，可用于本次规划。")).not.toBeInTheDocument();
    view.rerender(page(false));
    await screen.findByRole("button", { name: "采用这个已确认版本" });
    view.rerender(page(true));
    expect(screen.queryByText("已确认，可用于本次规划。")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("岗位 JD正文"), { target: { value: "Unsaved changes" } });
    view.rerender(page(false));
    expect(screen.getByLabelText("岗位 JD正文")).toHaveValue("Unsaved changes");
    expect(screen.queryByRole("button", { name: "采用这个已确认版本" })).not.toBeInTheDocument();
    expect(request.mock.calls.some(([method]) => method === "createDocumentConfirmation")).toBe(false);
  });
  it.each(["invalid-request", "forbidden", "gone"] as const)("falls back to the legacy draft only on incompatible read requests: %s", async code => {
    const { client, onSelect, request } = libraryWithConfirmedJd(), read = request.getMockImplementation()!;
    request.mockImplementation(async (method, input) => {
      if (method === "readDocumentReviewDraft" && input.includeConfirmation) throw new DocumentClientError(code, code === "invalid-request" ? 400 : 403);
      return read(method, input);
    });
    render(<MaterialLibrary ownerId="owner-b" capabilities={capabilities} client={client} onSelect={onSelect} />);
    fireEvent.click(await screen.findByRole("button", { name: "查看并核对 合成公司 B" }));
    if (code === "invalid-request") await screen.findByDisplayValue("Prepare SQL reports");
    else await screen.findByRole("alert");
    expect(request.mock.calls.some(([name, input]) => name === "readDocumentReviewDraft" && !input.includeConfirmation)).toBe(code === "invalid-request");
    expect(screen.queryByRole("button", { name: "采用这个已确认版本" })).not.toBeInTheDocument();
  });
  it("offers the saved confirmation in a fresh session and reuses it only on explicit adoption", async () => {
    const { ref, request, onSelect, open } = libraryWithConfirmedJd(); await open();
    const use = await screen.findByRole("button", { name: "采用这个已确认版本" });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(use);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("jd", { ...ref, confirmationId: "confirmed-b" }));
    expect(request.mock.calls.some(([method]) => method === "createDocumentConfirmation")).toBe(false);
  });
  it("invalidates a recovered confirmation as soon as an editable fact changes", async () => {
    const { open, onSelect } = libraryWithConfirmedJd(); await open();
    await screen.findByRole("button", { name: "采用这个已确认版本" });
    fireEvent.change(screen.getByLabelText("事实 1"), { target: { value: "Prepare reports for a different team" } });
    expect(screen.queryByRole("button", { name: "采用这个已确认版本" })).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("declines to adopt a version whose confirmation became stale while its editor was open", async () => {
    const { open, revoke, onSelect } = libraryWithConfirmedJd(); await open();
    const use = await screen.findByRole("button", { name: "采用这个已确认版本" });
    revoke(); fireEvent.click(use);
    await waitFor(() => expect(screen.queryByRole("button", { name: "采用这个已确认版本" })).not.toBeInTheDocument());
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("passes the newest document revision when rechecking the same immutable confirmation", async () => {
    const { open, advanceDocumentRevision, ref, onSelect } = libraryWithConfirmedJd(); await open();
    const use = await screen.findByRole("button", { name: "采用这个已确认版本" });
    advanceDocumentRevision(); fireEvent.click(use);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("jd", { ...ref, confirmationId: "confirmed-b", revision: 2 }));
  });
  it("does not trust the last session's cached confirmation ID when restoring the editor", async () => {
    const { open, mount, revoke, onSelect } = libraryWithConfirmedJd(); await open();
    await screen.findByRole("button", { name: "采用这个已确认版本" });
    expect(JSON.stringify(localStorage)).toContain("confirmed-b");
    cleanup(); revoke(); mount();
    expect(screen.queryByRole("button", { name: "采用这个已确认版本" })).not.toBeInTheDocument();
    await screen.findByDisplayValue("Prepare SQL reports");
    expect(screen.queryByRole("button", { name: "采用这个已确认版本" })).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("ignores a late reuse check if the reader edits the displayed fact in the meantime", async () => {
    const { open, request, onSelect } = libraryWithConfirmedJd(); await open();
    let release!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; });
    const read = request.getMockImplementation()!;
    request.mockImplementationOnce(async (method, input) => { const result = await read(method, input); await paused; return result; });
    fireEvent.click(await screen.findByRole("button", { name: "采用这个已确认版本" }));
    fireEvent.change(screen.getByLabelText("事实 1"), { target: { value: "Changed during validation" } });
    await act(async () => { release(); await paused; });
    expect(screen.queryByRole("button", { name: "采用这个已确认版本" })).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("renders private names as text, has no upload, and distinguishes revocation from completed cleanup", async () => {
    let removed = false;
    const request = vi.fn(async (endpoint: string) => {
      if (endpoint === "listDocuments") return { documents: removed ? [] : [{ id: "doc-a", displayName: "<img src=x onerror=alert(1)>", kind: "jd", lifecycle: "active", revision: 1 }], nextCursor: null };
      if (endpoint === "deleteDocument") { removed = true; return { deletionJobId: "deletion-a", state: "cleanup-pending" }; }
      if (endpoint === "readDocumentDeletion") return { deletionJobId: "deletion-a", state: "completed", errorCode: null };
      throw new Error("unexpected");
    });
    const { container } = render(<MaterialLibrary ownerId="owner-a" capabilities={capabilities} client={{ request } as unknown as DocumentsClient} />);
    await screen.findByText("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img")).toBeNull(); expect(container.querySelector('input[type="file"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "删除 <img src=x onerror=alert(1)>" }));
    expect(request.mock.calls.filter(([name]) => name === "deleteDocument")).toHaveLength(0);
    fireEvent.click(screen.getByText("确认删除这份资料")); await screen.findByText("资料已撤销引用，正在清理保留的副本。");
    fireEvent.click(screen.getByText("查询删除清理状态")); await screen.findByText("资料及已登记的派生副本已清理完成。");
    await waitFor(() => expect(screen.queryByText("<img src=x onerror=alert(1)>")).not.toBeInTheDocument());
  });
});
