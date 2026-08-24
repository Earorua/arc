import { describe, expect, it, vi } from "vitest";
import { ArcApiError } from "../../app/lib/cloud-client";
import { createProofClient } from "../../app/lib/proof-client";
import { proofResultFixture } from "../fixtures/proof-ledger";

const create = {
  mutationId: "mutation-1", baseRevision: 0, intent: "submit" as const, validatorKey: null,
  dailyUnitId: null, title: "Architecture map", kind: "document" as const,
  summary: "Trace the boundary.", artifactUrl: "https://example.com/proof", assetId: null,
  skillIds: ["testing"], completionCriteria: ["Trace is complete"], visibility: "private" as const,
};

describe("ProofClient", () => {
  it("uses credentialed no-store requests and every mutation path", async () => {
    const result = proofResultFixture();
    const fetcher = vi.fn().mockImplementation(async (path: string) => Response.json(
      path.endsWith("workspace") ? { workspace: result.workspace } : { result },
    ));
    const client = createProofClient({ fetch: fetcher });
    await client.loadWorkspace();
    await client.createProof(create);
    await client.reviseProof("proof-1", { ...create, baseRevision: 1 });
    await client.withdrawProof("proof-1", { mutationId: "mutation-withdraw", baseRevision: 1 });
    await client.setVisibility("proof-1", {
      mutationId: "mutation-public", baseRevision: 1, visibility: "public",
    });
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      "/api/proofs/workspace", "/api/proofs", "/api/proofs/proof-1/versions",
      "/api/proofs/proof-1/withdraw", "/api/proofs/proof-1/visibility",
    ]);
    for (const [, init] of fetcher.mock.calls) {
      expect(init).toMatchObject({ credentials: "include", cache: "no-store" });
    }
  });

  it("strictly parses success and standardized Arc API errors", async () => {
    const invalid = createProofClient({ fetch: async () => Response.json({ workspace: null, debug: true }) });
    await expect(invalid.loadWorkspace()).rejects.toBeInstanceOf(ArcApiError);
    const failed = createProofClient({ fetch: async () => Response.json({ error: {
      code: "CONFLICT", message: "Safe conflict", requestId: "request-1", action: "refresh",
    } }, { status: 409 }) });
    await expect(failed.createProof(create)).rejects.toMatchObject({
      status: 409, code: "CONFLICT", action: "refresh", requestId: "request-1",
    });
  });

  it("rejects invalid request bodies before fetch", async () => {
    const fetcher = vi.fn();
    const client = createProofClient({ fetch: fetcher });
    await expect(client.createProof({ ...create, ownerId: "attacker" } as typeof create))
      .rejects.toBeInstanceOf(ArcApiError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("cancels declared and streamed responses above four MiB", async () => {
    const cancel = vi.fn();
    const declared = createProofClient({ fetch: async () => new Response(
      new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 }),
      { headers: { "content-length": String(4 * 1024 * 1024 + 1) } },
    ) });
    await expect(declared.loadWorkspace()).rejects.toBeInstanceOf(ArcApiError);
    expect(cancel).toHaveBeenCalledOnce();

    let pulls = 0;
    const streamedCancel = vi.fn();
    const streamed = createProofClient({ fetch: async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) { pulls += 1; controller.enqueue(new Uint8Array(1024 * 1024)); },
      cancel: streamedCancel,
    }, { highWaterMark: 0 })) });
    await expect(streamed.loadWorkspace()).rejects.toBeInstanceOf(ArcApiError);
    expect(pulls).toBeLessThanOrEqual(5);
    expect(streamedCancel).toHaveBeenCalledOnce();
  });
});
