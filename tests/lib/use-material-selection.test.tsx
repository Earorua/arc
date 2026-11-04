import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useMaterialSelection } from "../../app/lib/use-material-selection";

describe("owner and scope bound material references", () => {
  afterEach(cleanup);
  beforeEach(() => localStorage.clear());
  it("stores only strict references and restores them", async () => {
    const first = renderHook(() => useMaterialSelection({ ownerId: "user:a", scopeKey: "flagship" }));
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    act(() => first.result.current.setSlot("jd", { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", revision: 0, confirmationId: "confirmation-a" }));
    const draftId = first.result.current.refs.draftId; first.unmount();
    const next = renderHook(() => useMaterialSelection({ ownerId: "user:a", scopeKey: "flagship" }));
    await waitFor(() => expect(next.result.current.refs.slots.jd?.documentId).toBe("doc-a"));
    expect(next.result.current.refs.draftId).toBe(draftId);
    expect(() => next.result.current.setSlot("jd", { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", revision: 0, text: "PRIVATE-MATERIAL-SENTINEL-7f91" } as never)).toThrow();
    expect(JSON.stringify(localStorage)).not.toContain("PRIVATE-MATERIAL-SENTINEL-7f91");
  });
  it("rejects an A to B to A late response by epoch even when owner matches again", async () => {
    const hook = renderHook(({ owner }) => useMaterialSelection({ ownerId: owner, scopeKey: "flagship" }), { initialProps: { owner: "a" } });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    let complete!: (value: string) => void;
    const pending = hook.result.current.runScoped(() => new Promise<string>(resolve => { complete = resolve; }));
    hook.rerender({ owner: "b" }); await waitFor(() => expect(hook.result.current.ready).toBe(true));
    hook.rerender({ owner: "a" }); await waitFor(() => expect(hook.result.current.ready).toBe(true));
    complete("old-private-value"); await expect(pending).resolves.toBeNull();
  });
  it("invalidates a preview when a selected confirmation changes", async () => {
    const hook = renderHook(() => useMaterialSelection({ ownerId: "a", scopeKey: "flagship" }));
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    act(() => hook.result.current.setPreview({ contextVersionId: "ctx-a", selectionRef: { selectionId: "sel-a", selectionRevision: 1 }, previewToken: "a".repeat(64) }));
    act(() => hook.result.current.setSlot("jd", { documentId: "doc-a", documentVersionId: "version-a", textVersionId: "text-a", revision: 1, confirmationId: "conf-b" }));
    expect(hook.result.current.refs.preview).toBeNull();
  });
});
