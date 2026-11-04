import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { writeSetupDraft, materialSetupDraftSchema } from "../../app/components/setup/setup-draft";
import { DocumentClientError, documentsClient } from "../../app/lib/documents-client";
import type { DocumentEndpointResponse } from "../../app/contracts/documents-api";
import { useMaterialSelection } from "../../app/lib/use-material-selection";

const scope = { goalId: "goal-a", workspaceId: "workspace-a", baseVersionId: "plan-a" };
const options = (workspace = scope) => ({ ownerId: "user:a", scopeKey: `workspace:${workspace.goalId}`, workspace });
const ref = (id: string) => ({ documentId: `doc-${id}`, documentVersionId: `version-${id}`,
  confirmationId: `confirmation-${id}`, textVersionId: `text-${id}`, revision: 1 });
const jd = ref("company-a"), resume = ref("resume"), supplement = ref("supplement"), replacement = ref("company-b");
const adopted = { entries: [{ slot: "jd" as const, ...jd }, { slot: "resume" as const, ...resume }, { slot: "supplement" as const, ...supplement }] };
const legacySelection = { selectionId: "selection-a", selectionRevision: 1 };
const legacyReceipt = (base = scope): DocumentEndpointResponse<"readMaterialSelection"> => ({
  selection: { schemaVersion: "2026.11.1", ...legacySelection, scope: { kind: "goal", ...base, revision: 0 }, entries: [], state: "active", boundGoalId: null }, versions: [],
});
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each(["fresh", "legacy-empty", "legacy-edited"])("rehydrates the active plan for a %s session, replacing only the selected JD and preserving explicit removals", async mode => {
  if (mode !== "fresh") writeSetupDraft("user:a", "materials:workspace:goal-a", materialSetupDraftSchema, {
    draftId: "legacy-draft", slots: mode === "legacy-edited" ? { jd: replacement } : {}, supplements: [], selection: null, preview: null,
  });
  const read = vi.spyOn(documentsClient, "request").mockResolvedValue(adopted);
  const hook = renderHook(() => useMaterialSelection(options()));
  if (mode === "legacy-edited") {
    await waitFor(() => expect(hook.result.current.restoreConflict).toBe("version"));
    expect(hook.result.current.ready).toBe(false);
    act(() => hook.result.current.retryRestore("draft"));
  }
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(read).toHaveBeenCalledWith("readAdoptedMaterials", { ...scope, ...(mode === "legacy-edited" ? { checkDocumentIds: [replacement.documentId] } : {}) }, expect.any(AbortSignal));
  expect(hook.result.current.refs.slots).toEqual({ resume, jd: mode === "legacy-edited" ? replacement : jd });
  expect(hook.result.current.refs.supplements).toEqual([supplement]);
  act(() => hook.result.current.setSlot("jd", replacement));
  expect(hook.result.current.refs.slots).toEqual({ resume, jd: replacement });
  expect(hook.result.current.refs.supplements).toEqual([supplement]);
  act(() => { hook.result.current.setSlot("resume", null); hook.result.current.setSupplements([]); });
  hook.unmount();
  const again = renderHook(() => useMaterialSelection(options()));
  await waitFor(() => expect(again.result.current.ready).toBe(true));
  expect(again.result.current.refs.slots).toEqual({ jd: replacement });
  expect(again.result.current.refs.supplements).toEqual([]);
});
it("blocks edits after a failed read without overwriting the draft, then restores on retry", async () => {
  writeSetupDraft("user:a", "materials:workspace:goal-a", materialSetupDraftSchema, {
    draftId: "user-draft", slots: { jd }, supplements: [], selection: null, preview: null,
  });
  const before = JSON.stringify(localStorage);
  vi.spyOn(documentsClient, "request").mockRejectedValueOnce(new Error("offline")).mockResolvedValue(adopted);
  const hook = renderHook(() => useMaterialSelection(options()));
  await waitFor(() => expect(hook.result.current.restoreFailed).toBe(true));
  expect(hook.result.current.ready).toBe(false);
  act(() => hook.result.current.setSlot("jd", null));
  expect(JSON.stringify(localStorage)).toBe(before);
  act(() => hook.result.current.retryRestore());
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(hook.result.current.refs.slots).toEqual({ resume, jd });
});
it("never carries choices from an older active plan or a delayed read across goal changes", async () => {
  let release!: (value: typeof adopted) => void;
  const delayed = new Promise<typeof adopted>(resolve => { release = resolve; });
  const read = vi.spyOn(documentsClient, "request").mockResolvedValueOnce(adopted).mockImplementationOnce(() => delayed)
    .mockResolvedValue({ entries: [] });
  const hook = renderHook(({ workspace }) => useMaterialSelection(options(workspace)), { initialProps: { workspace: scope } });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.setSlot("jd", replacement));
  hook.rerender({ workspace: { ...scope, goalId: "goal-b", workspaceId: "workspace-b" } });
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  expect(hook.result.current.ready).toBe(false);
  hook.rerender({ workspace: { ...scope, baseVersionId: "plan-new" } });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  await act(async () => { release(adopted); await delayed; });
  expect(read.mock.calls[1]![2]!.aborted).toBe(true);
  expect(hook.result.current.refs.slots).toEqual({});
  expect(hook.result.current.refs.supplements).toEqual([]);
});
it("rechecks inherited confirmations on every mount, retaining only surviving adopted versions and local changes", async () => {
  vi.spyOn(documentsClient, "request").mockResolvedValueOnce(adopted)
    .mockResolvedValue({ entries: adopted.entries.filter(entry => entry.slot !== "resume") });
  const hook = renderHook(() => useMaterialSelection(options()));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  act(() => hook.result.current.setSlot("jd", replacement));
  hook.unmount();
  const again = renderHook(() => useMaterialSelection(options()));
  await waitFor(() => expect(again.result.current.ready).toBe(true));
  expect(again.result.current.refs.slots).toEqual({ jd: replacement });
  expect(again.result.current.refs.supplements).toEqual([supplement]);
});
it("leaves an oversized legacy merge untouched until the user explicitly restores the current route's selections", async () => {
  writeSetupDraft("user:a", "materials:workspace:goal-a", materialSetupDraftSchema, {
    draftId: "legacy-draft", slots: { jd }, supplements: [ref("s1"), ref("s2"), ref("s3")], selection: null, preview: null,
  });
  const before = JSON.stringify(localStorage);
  vi.spyOn(documentsClient, "request").mockResolvedValue(adopted);
  const hook = renderHook(() => useMaterialSelection(options()));
  await waitFor(() => expect(hook.result.current.restoreConflict).toBe("capacity"));
  expect(hook.result.current.ready).toBe(false);
  expect(JSON.stringify(localStorage)).toBe(before);
  act(() => hook.result.current.retryRestore("reset"));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(hook.result.current.refs.supplements).toEqual([supplement]);
  expect(hook.result.current.refs.slots).toEqual({ jd, resume });
});
it.each(["baseVersionId", "goalId", "workspaceId"] as const)("realigns a legacy draft whose private selection has an obsolete %s before adding a supplement", async field => {
  writeSetupDraft("user:a", "materials:workspace:goal-a", materialSetupDraftSchema, {
    draftId: "legacy-with-selection", slots: { jd }, supplements: [supplement], selection: legacySelection, preview: null,
  });
  const switched = { entries: adopted.entries.map(entry => entry.slot === "jd" ? { slot: entry.slot, ...replacement } : entry) };
  const read = vi.spyOn(documentsClient, "request").mockImplementation(async endpoint => endpoint === "readMaterialSelection" ? legacyReceipt({ ...scope, [field]: "old-value" }) : switched);
  const hook = renderHook(() => useMaterialSelection(options()));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(read).toHaveBeenCalledWith("readMaterialSelection", { selectionId: legacySelection.selectionId }, expect.any(AbortSignal));
  act(() => hook.result.current.setSupplements([...hook.result.current.refs.supplements, ref("new-note")]));
  expect(hook.result.current.refs.slots).toEqual({ jd: replacement, resume });
  expect(hook.result.current.refs.supplements).toEqual([supplement, ref("new-note")]);
  expect(hook.result.current.refs.selection).toBeNull();
});
it("preserves a legacy user's different confirmed JD when its private selection was based on the current plan", async () => {
  writeSetupDraft("user:a", "materials:workspace:goal-a", materialSetupDraftSchema, {
    draftId: "legacy-with-selection", slots: { jd: replacement }, supplements: [], selection: legacySelection, preview: null,
  });
  vi.spyOn(documentsClient, "request").mockImplementation(async endpoint => endpoint === "readMaterialSelection" ? legacyReceipt() : adopted);
  const hook = renderHook(() => useMaterialSelection(options()));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(hook.result.current.refs.slots).toEqual({ jd: replacement, resume });
  expect(hook.result.current.refs.supplements).toEqual([supplement]);
});
it("requires an explicit conflict choice for an untraceable legacy selection and keeps unrelated draft additions", async () => {
  const extra = ref("unrelated");
  writeSetupDraft("user:a", "materials:workspace:goal-a", materialSetupDraftSchema, {
    draftId: "legacy-with-selection", slots: { jd: replacement }, supplements: [extra], selection: legacySelection, preview: null,
  });
  const before = JSON.stringify(localStorage);
  vi.spyOn(documentsClient, "request").mockImplementation(async endpoint => {
    if (endpoint === "readMaterialSelection") throw new DocumentClientError("not-found", 404);
    return adopted;
  });
  const hook = renderHook(() => useMaterialSelection(options()));
  await waitFor(() => expect(hook.result.current.restoreConflict).toBe("version"));
  expect(hook.result.current.ready).toBe(false);
  expect(JSON.stringify(localStorage)).toBe(before);
  act(() => hook.result.current.retryRestore("current"));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(hook.result.current.refs.slots).toEqual({ jd, resume });
  expect(hook.result.current.refs.supplements).toEqual([supplement, extra]);
  expect(hook.result.current.refs.selection).toBeNull();
});
it("does not reinstate a legacy JD if the current plan has no adopted JD and the original base is unknown", async () => {
  writeSetupDraft("user:a", "materials:workspace:goal-a", materialSetupDraftSchema, {
    draftId: "legacy-jd", slots: { jd }, supplements: [], selection: null, preview: null,
  });
  vi.spyOn(documentsClient, "request").mockResolvedValue({ entries: adopted.entries.filter(entry => entry.slot !== "jd") });
  const hook = renderHook(() => useMaterialSelection(options()));
  await waitFor(() => expect(hook.result.current.restoreConflict).toBe("version"));
  act(() => hook.result.current.retryRestore("current"));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(hook.result.current.refs.slots).toEqual({ resume });
  expect(hook.result.current.refs.supplements).toEqual([supplement]);
});
it("drops a locally edited version of a detached document and keeps independently added draft documents", async () => {
  const extra = ref("unrelated");
  const modified = { ...jd, documentVersionId: "other-jd-version", confirmationId: "other-jd-confirmation" };
  const noteEdit = { ...supplement, documentVersionId: "other-note-version" };
  writeSetupDraft("user:a", "materials:workspace:goal-a", materialSetupDraftSchema, {
    draftId: "trusted", slots: { jd: modified, resume }, supplements: [noteEdit, extra], selection: legacySelection, preview: null,
    adopted: { scope, entries: adopted.entries },
  });
  vi.spyOn(documentsClient, "request").mockResolvedValue({ entries: adopted.entries.filter(entry => entry.slot === "resume") });
  const hook = renderHook(() => useMaterialSelection(options()));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(hook.result.current.refs.slots).toEqual({ resume });
  expect(hook.result.current.refs.supplements).toEqual([extra]);
  expect(hook.result.current.refs.selection).toBeNull();
});
it.each(["revoked", "missing"] as const)("checks owner-scoped detachment of old supplemental versions for a %s legacy selection, retaining only the unrelated new note", async mode => {
  const newer = { ...supplement, documentVersionId: "new-note-version", confirmationId: "new-note-confirmation" }, extra = ref("new-unadopted-note");
  writeSetupDraft("user:a", "materials:workspace:goal-a", materialSetupDraftSchema, {
    draftId: "pre-hydration", slots: {}, supplements: [newer, extra], selection: mode === "revoked" ? legacySelection : null, preview: null,
  });
  const previous = legacyReceipt();
  const read = vi.spyOn(documentsClient, "request").mockImplementation(async (name, raw) => {
    if (name === "readMaterialSelection") return { ...previous, selection: { ...previous.selection, state: "revoked", entries: [{ slot: "supplement", documentId: supplement.documentId, documentVersionId: supplement.documentVersionId, confirmationId: supplement.confirmationId }] } };
    const checked = "checkDocumentIds" in raw && Array.isArray(raw.checkDocumentIds) ? raw.checkDocumentIds : [];
    return { entries: adopted.entries.filter(item => item.slot !== "supplement"), ...(checked.includes(supplement.documentId) ? { detachedDocumentIds: [supplement.documentId] } : {}) };
  });
  const hook = renderHook(() => useMaterialSelection(options()));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  expect(hook.result.current.refs.supplements).toEqual([extra]);
  expect(hook.result.current.refs.selection).toBeNull();
  expect(read).toHaveBeenCalledWith("readAdoptedMaterials", { ...scope, checkDocumentIds: [supplement.documentId, extra.documentId] }, expect.any(AbortSignal));
  // The owner can explicitly choose X again after seeing the current adopted set.
  act(() => hook.result.current.setSupplements([extra, newer]));
  hook.unmount();
  const fresh = renderHook(() => useMaterialSelection(options()));
  await waitFor(() => expect(fresh.result.current.ready).toBe(true));
  expect(fresh.result.current.refs.supplements).toEqual([extra, newer]);
  expect(read).toHaveBeenLastCalledWith("readAdoptedMaterials", scope, expect.any(AbortSignal));
});
