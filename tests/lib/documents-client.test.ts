import { describe, expect, it, vi } from "vitest";
import { createDocumentsClient, DocumentClientError } from "../../app/lib/documents-client";

describe("private materials client", () => {
  it("keeps version content in JSON and IDs in the route, with no-store", async () => {
    const receipt = { documentId: "doc-a", documentVersionId: "version-b", textVersionId: "text-b", revision: 2 };
    const fetcher = vi.fn(async () => Response.json(receipt));
    const client = createDocumentsClient({ fetch: fetcher });
    await expect(client.request("createDocumentVersion", { documentId: "doc-a", text: "PRIVATE-MATERIAL-SENTINEL-7f91", expectedRevision: 1, mutationId: "edit-a" })).resolves.toEqual(receipt);
    const [url, init] = fetcher.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("/api/documents/doc-a/versions");
    expect(init).toMatchObject({ cache: "no-store", credentials: "include", method: "POST" });
    expect(JSON.parse(init.body as string)).not.toHaveProperty("documentId");
  });
  it("validates before sending and rejects malformed or oversized replies", async () => {
    const fetcher = vi.fn(async () => Response.json({ rawText: "PRIVATE-MATERIAL-SENTINEL-7f91" }));
    const client = createDocumentsClient({ fetch: fetcher });
    await expect(client.request("listDocuments", { ownerId: "intruder" } as never)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    await expect(client.request("listDocuments", {})).rejects.toThrow("资料服务返回了无效响应");
    fetcher.mockImplementationOnce(async () => new Response("x".repeat(524_289)));
    await expect(client.request("listDocuments", {})).rejects.toThrow("资料服务返回了无效响应");
  });
  it("maps finite error codes to safe messages, without echoing server content", async () => {
    const client = createDocumentsClient({ fetch: async () => Response.json({ error: { code: "gone", status: 410 } }, { status: 410 }) });
    await expect(client.request("listDocuments", {})).rejects.toBeInstanceOf(DocumentClientError);
    await expect(client.request("listDocuments", {})).rejects.toMatchObject({ code: "gone", status: 410 });
  });
  it("rejects even a late successful response after abort", async () => {
    const abort = new AbortController();
    const client = createDocumentsClient({ fetch: async () => { abort.abort(); return Response.json({ documents: [], nextCursor: null }); } });
    await expect(client.request("listDocuments", {}, abort.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
