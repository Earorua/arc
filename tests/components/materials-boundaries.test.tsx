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
  render(<SlotHarness client={client} />); await screen.findByLabelText("Resume text");
  fireEvent.click(screen.getByText("Select A")); await screen.findByDisplayValue("PRIVATE-BODY-a");
  if (operation === "save") { fireEvent.change(screen.getByLabelText("Resume text"), { target: { value: "PRIVATE-EDIT-a" } }); fireEvent.click(screen.getByText("Save and organize manually")); }
  else fireEvent.click(screen.getByText("Confirm these facts"));
  await waitFor(() => expect(signal).toBeDefined());
  fireEvent.click(screen.getByText("Select B")); await screen.findByDisplayValue("PRIVATE-BODY-b");
  expect(signal?.aborted).toBe(true);
  fireEvent.click(screen.getByText("Select A")); await screen.findByDisplayValue("PRIVATE-BODY-a");
  await act(async () => { pending.resolve(operation === "save" ? { ...reference("a"), documentVersionId: "late-version", textVersionId: "late-text", revision: 1 } : { confirmationId: "late-confirmation", revision: 1 }); await pending.promise; });
  expect(screen.getByLabelText("Current reference")).not.toHaveTextContent(/late-/);
  expect(screen.getByLabelText("Resume text")).toHaveValue("PRIVATE-BODY-a");
  fireEvent.click(screen.getByText("Do not use this resume"));
  expect(screen.getByLabelText("Resume text")).toHaveValue("");
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
  fireEvent.click(screen.getByText("Add Resume"));
  const textarea = screen.getByLabelText("Resume text");
  fireEvent.change(textarea, { target: { value: "PRIVATE-LIBRARY-BODY" } }); fireEvent.click(screen.getByLabelText(/Allow the processors above/)); fireEvent.click(screen.getByText("Save and analyze with AI"));
  await waitFor(() => expect(consentSignal).toBeDefined());
  expect(consentSignal?.aborted).toBe(false); expect(screen.getByLabelText("Resume text")).toBe(textarea);
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
  await screen.findByLabelText("Resume text"); fireEvent.click(screen.getByText("Select A")); await screen.findByDisplayValue("PRIVATE-REMOVED-BODY");
  fireEvent.change(screen.getByLabelText("Resume text"), { target: { value: "PRIVATE-NEW-REMOVED-BODY" } }); fireEvent.click(screen.getByText("Save and organize manually"));
  await waitFor(() => expect(request.mock.calls.some(([endpoint]) => endpoint === "createDocumentVersion")).toBe(true));
  await act(async () => { fireEvent.click(screen.getByText("Do not use this resume")); });
  expect(screen.getByLabelText("Current reference")).toHaveTextContent("null");
  expect(screen.getByLabelText("Resume text")).toHaveValue("");
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
  fireEvent.click(await screen.findByText("Delete PRIVATE-DELETE-NAME")); fireEvent.click(screen.getByText("Confirm material deletion"));
  await screen.findByText("Check deletion cleanup status"); first.unmount();
  expect(JSON.stringify(localStorage)).toContain("deletion-a"); expect(JSON.stringify(localStorage)).not.toContain("PRIVATE-DELETE-NAME");
  render(<MaterialLibrary ownerId="owner-a" capabilities={caps} client={client} />);
  fireEvent.click(await screen.findByText("Check deletion cleanup status")); await screen.findByText("Cleanup is not finished. The background process will retry; the material can no longer be referenced.");
  expect(screen.getByText("Check deletion cleanup status")).toBeInTheDocument(); completed = true;
  fireEvent.click(screen.getByText("Check deletion cleanup status")); await screen.findByText("The material and its registered derived copies have been cleaned up.");
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
  render(<Harness />); fireEvent.change(screen.getByLabelText("Job description text"), { target: { value: "SQL required but optional" } }); fireEvent.click(screen.getByText("Save and organize manually"));
  fireEvent.click(await screen.findByText("Add fact"));
  expect(screen.getByLabelText("Fact 1 information type")).toHaveValue("requirement"); expect(screen.getByLabelText("Fact 1 requirement type")).toHaveValue("unspecified");
  expect(screen.getByText("Confirm these facts")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Fact 1"), { target: { value: "SQL" } });
  fireEvent.change(screen.getByLabelText("Fact 1 requirement type"), { target: { value: "must" } });
  await waitFor(() => expect(draft.items[0]?.requirementLevel).toBe("must")); expect(screen.getByText("Confirm these facts")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Job requirement classifications conflict"), { target: { value: "confirmed" } });
  await waitFor(() => expect(screen.getByText("Confirm these facts")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Fact 1 requirement type"), { target: { value: "unspecified" } }); expect(screen.getByText("Confirm these facts")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Fact 1 requirement type"), { target: { value: "preferred" } });
  await waitFor(() => expect(screen.getByText("Confirm these facts")).toBeEnabled()); fireEvent.click(screen.getByText("Confirm these facts"));
  await screen.findByText("Confirmed and available for this plan.");
  expect(request.mock.calls.find(([endpoint]) => endpoint === "createDocumentConfirmation")?.[1]).toMatchObject({ items: [{ kind: "requirement", requirementLevel: "preferred", origin: "user" }] });
  expect(request.mock.calls.some(([endpoint]) => endpoint === "createDocumentConsent" || endpoint === "createDocumentJob")).toBe(false);
});
it("keeps the confirmed material selection locked while generation recovery is locked", async () => {
  const request = vi.fn(async (endpoint: string) => { if (endpoint === "readDocument") return { text: "Body", document: {} }; if (endpoint === "readDocumentReviewDraft") return { draft: review("a") }; throw Error(endpoint); });
  render(<SlotHarness locked client={{ request, capabilities: async () => caps } as unknown as DocumentsClient} />);
  await screen.findByLabelText("Resume text"); fireEvent.click(screen.getByText("Select A"));
  expect(await screen.findByText("Remove resume selection")).toBeDisabled();
  fireEvent.click(screen.getByText("Remove resume selection")); expect(screen.getByLabelText("Current reference")).toHaveTextContent("confirmed-a");
});
