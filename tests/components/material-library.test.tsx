import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialLibrary } from "../../app/components/materials/material-library";
import type { DocumentsClient } from "../../app/lib/documents-client";
const capabilities = { documentsEnabled: true, analysisEnabled: false, planningEnabled: true, hasDocuments: true, providerLabel: null, providerPolicyId: null, policyVersion: null, reason: "disabled" } as const;
describe("private material library", () => {
  afterEach(cleanup);
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
