import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MaterialWorkspaceEntry } from "../../app/components/materials/material-workspace-panel";
import type { MaterialLibrary } from "../../app/components/materials/material-library";
import { documentsClient } from "../../app/lib/documents-client";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { materialContextRequest } from "../helpers/material-planning";
import { materialSetupDraftSchema, writeSetupDraft } from "../../app/components/setup/setup-draft";

vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: () => ({ data: { user: { id: "owner-a" } }, isPending: false }) } }));
vi.mock("../../app/components/materials/material-library", () => ({
  MaterialLibrary: ({ onSelect }: ComponentProps<typeof MaterialLibrary>) => <button disabled={!onSelect} onClick={() => onSelect?.("jd", ref("company-b"))}>采用公司 B 的 JD</button>,
}));
const ref = (id: string) => ({ documentId: `doc-${id}`, documentVersionId: `version-${id}`, textVersionId: `text-${id}`, confirmationId: `confirmation-${id}`, revision: 1 });
function planning(pending: string | null = null) {
  const input = materialContextRequest();
  return { source: "cloud", sourceContext: { reference: input.source, blueprint: flagshipBlueprint }, retry: vi.fn(),
    workspace: { id: "workspace-a", goalId: "goal-a", activePlanVersionId: "plan-a", pendingPlanVersionId: pending, revision: 3,
      pathVersions: [], audit: input.audit, availability: input.availability, target: input.target } } as unknown as ComponentProps<typeof MaterialWorkspaceEntry>["planning"];
}
const entries = [{ slot: "jd" as const, ...ref("company-a") }, { slot: "resume" as const, ...ref("resume") }, { slot: "supplement" as const, ...ref("notes") }];
const asEntry = ({ documentId, documentVersionId, confirmationId, slot }: typeof entries[number]) => ({ documentId, documentVersionId, confirmationId, slot });
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(documentsClient, "capabilities").mockResolvedValue({ documentsEnabled: true, analysisEnabled: false, planningEnabled: true, hasDocuments: true, providerLabel: null, providerPolicyId: null, policyVersion: null, reason: "ready" });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("submits company B with the already-adopted resume and supplement from the normal workspace in a fresh session", async () => {
  const request = vi.spyOn(documentsClient, "request").mockImplementation(async endpoint => {
    if (endpoint === "readAdoptedMaterials") return { entries };
    if (endpoint === "readMaterialHistory") return { plans: [] };
    if (endpoint === "createMaterialSelection") return { selectionId: "selection-b", selectionRevision: 0 };
    throw new Error("Stop at preview");
  });
  render(<MaterialWorkspaceEntry planning={planning()} />);
  fireEvent.click(await screen.findByRole("button", { name: "私人资料与规划依据" }));
  await screen.findByRole("button", { name: "移除简历选择" });
  expect(screen.getByRole("button", { name: "从本次调整草稿移除这份补充资料" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "采用公司 B 的 JD" }));
  fireEvent.click(screen.getByRole("button", { name: "核对资料对路线的影响" }));
  const expected = [asEntry({ slot: "jd", ...ref("company-b") }), ...entries.slice(1).map(asEntry)];
  await waitFor(() => expect(request).toHaveBeenCalledWith("createMaterialSelection", expect.objectContaining({ entries: expect.arrayContaining(expected) }), expect.any(AbortSignal)));
  const body = request.mock.calls.find(([endpoint]) => endpoint === "createMaterialSelection")![1];
  expect(body).toHaveProperty("entries.length", 3);
  expect(JSON.stringify(body)).not.toContain("company-a");
});
it("preserves private library access during failed hydration, allows a retry and blocks a second pending proposal", async () => {
  let failed = true;
  vi.spyOn(documentsClient, "request").mockImplementation(async endpoint => {
    if (endpoint === "readMaterialHistory") return { plans: [] };
    if (failed) throw new Error("unavailable");
    return { entries };
  });
  render(<MaterialWorkspaceEntry planning={planning("pending-plan")} />);
  fireEvent.click(await screen.findByRole("button", { name: "私人资料与规划依据" }));
  const retry = await screen.findByRole("button", { name: "重试读取已采用资料" });
  expect(screen.getByRole("button", { name: "采用公司 B 的 JD" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "核对资料对路线的影响" })).not.toBeInTheDocument();
  failed = false;
  fireEvent.click(retry);
  expect(await screen.findByRole("button", { name: "核对资料对路线的影响" })).toBeDisabled();
});
it("asks the user before overriding an untraceable old JD and keeps the draft's independent new supplement", async () => {
  writeSetupDraft("user:owner-a", "materials:workspace:goal-a", materialSetupDraftSchema,
    { draftId: "legacy", slots: { jd: ref("old-company") }, supplements: [ref("new-note")], selection: null, preview: null });
  const request = vi.spyOn(documentsClient, "request").mockImplementation(async endpoint => {
    if (endpoint === "readAdoptedMaterials") return { entries };
    if (endpoint === "readMaterialHistory") return { plans: [] };
    if (endpoint === "createMaterialSelection") return { selectionId: "selection-new", selectionRevision: 0 };
    throw new Error("Stop at preview");
  });
  render(<MaterialWorkspaceEntry planning={planning()} />);
  fireEvent.click(await screen.findByRole("button", { name: "私人资料与规划依据" }));
  expect(await screen.findByRole("button", { name: "采用旧草稿中的冲突版本" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "核对资料对路线的影响" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "采用当前路线中的冲突版本" }));
  fireEvent.click(await screen.findByRole("button", { name: "核对资料对路线的影响" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith("createMaterialSelection", expect.objectContaining({
    entries: expect.arrayContaining([...entries.map(asEntry), asEntry({ slot: "supplement", ...ref("new-note") })]),
  }), expect.any(AbortSignal)));
});
