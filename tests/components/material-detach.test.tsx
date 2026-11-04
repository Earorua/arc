import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { MaterialWorkspaceEntry } from "../../app/components/materials/material-workspace-panel";
import { documentsClient } from "../../app/lib/documents-client";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { materialContextRequest } from "../helpers/material-planning";

vi.mock("../../app/lib/auth-client", () => ({ authClient: { useSession: () => ({ data: { user: { id: "owner-a" } }, isPending: false }) } }));
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
it("explicitly confirms stopping current goal use, refreshes the adopted list and leaves the named library document available", async () => {
  const entry = { slot: "jd" as const, documentId: "doc-a", documentVersionId: "v1", textVersionId: "t1", confirmationId: "c1", revision: 2 };
  let enabled = true;
  vi.spyOn(documentsClient, "capabilities").mockResolvedValue({ documentsEnabled: true, planningEnabled: true, analysisEnabled: false, hasDocuments: true, providerLabel: null, providerPolicyId: null, policyVersion: null, reason: "ready" });
  const calls = vi.spyOn(documentsClient, "request").mockImplementation(async endpoint => {
    if (endpoint === "readAdoptedMaterials") return { entries: enabled ? [entry] : [] };
    if (endpoint === "listDocuments") return { documents: [{ id: entry.documentId, displayName: "公司 A JD", lifecycle: "active" }], nextCursor: null } as never;
    if (endpoint === "readMaterialHistory") return { plans: [] };
    if (endpoint === "detachAdoptedMaterial") { enabled = false; return { goalId: "goal", workspaceId: "workspace", baseVersionId: "plan", revision: 4, documentId: entry.documentId }; }
    throw new Error("Unexpected request");
  });
  const input = materialContextRequest(), retry = vi.fn();
  const planning = { source: "cloud", sourceContext: { reference: input.source, blueprint: flagshipBlueprint }, retry,
    workspace: { id: "workspace", goalId: "goal", activePlanVersionId: "plan", pendingPlanVersionId: null, revision: 3, pathVersions: [], audit: input.audit, availability: input.availability, target: input.target } } as unknown as ComponentProps<typeof MaterialWorkspaceEntry>["planning"];
  render(<MaterialWorkspaceEntry planning={planning} />);
  fireEvent.click(await screen.findByRole("button", { name: "私人资料与规划依据" }));
  const begin = await screen.findByRole("button", { name: "从当前目标取消使用 公司 A JD" });
  fireEvent.click(begin);
  expect(calls.mock.calls.filter(([key]) => key === "detachAdoptedMaterial")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "保留采用" }));
  fireEvent.click(begin);
  fireEvent.click(screen.getByRole("button", { name: "确认从当前目标取消使用" }));
  await waitFor(() => expect(retry).toHaveBeenCalledOnce());
  expect(calls).toHaveBeenCalledWith("detachAdoptedMaterial", { scope: { kind: "goal", goalId: "goal", workspaceId: "workspace", baseVersionId: "plan", revision: 3 },
    entry: { slot: "jd", documentId: "doc-a", documentVersionId: "v1", confirmationId: "c1" }, mutationId: expect.any(String) }, expect.any(AbortSignal));
  await waitFor(() => expect(screen.queryByRole("button", { name: "从当前目标取消使用 公司 A JD" })).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "查看并核对 公司 A JD" })).toBeEnabled();
});
