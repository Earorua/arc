import { describe, expect, it, vi } from "vitest";
import { flagshipRole } from "../../app/data/flagship-role";
import { createDemoState } from "../../app/lib/demo-store";
import {
  ArcApiError,
  createArcCloudClient,
} from "../../app/lib/cloud-client";

const snapshot = {
  state: createDemoState(),
  activeGoalId: "goal-1",
  revision: "revision-1",
};

describe("Arc cloud client", () => {
  it.each(["activation", "load"])("cancels the %s transport used by Research setup", async (operation) => {
    const cancellation = new AbortController();
    let resolveResponse!: (response: Response) => void;
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    const client = createArcCloudClient({ fetch: fetcher });
    const pending = operation === "activation" ? client.importLocal(snapshot.state, "reject", "activation-current", cancellation.signal) : client.loadWorkspace(cancellation.signal);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ signal: cancellation.signal });
    cancellation.abort(); resolveResponse(Response.json({ snapshot }));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("cancels setup transport and discards responses from a transport that resolves after abort", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const client = createArcCloudClient({ fetch: fetcher });
    const cancellation = new AbortController();
    const pending = client.saveSetup(snapshot.state.setup, "setup-cancelled", cancellation.signal);
    expect(fetcher).toHaveBeenCalledWith("/api/workspace", expect.objectContaining({ signal: cancellation.signal }));
    cancellation.abort(); resolveFetch(Response.json({ snapshot }));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("rejects already cancelled setup before dispatch and cancellation during body parsing", async () => {
    const cancellation = new AbortController(); cancellation.abort();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ snapshot }));
    const client = createArcCloudClient({ fetch: fetcher });
    await expect(client.saveSetup(snapshot.state.setup, "setup-cancelled", cancellation.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
    const parsing = new AbortController();
    let resolveBody!: (value: unknown) => void;
    fetcher.mockResolvedValue({ ok: true, json: () => new Promise((resolve) => { resolveBody = resolve; }) });
    const pending = client.saveSetup(snapshot.state.setup, "setup-parsing", parsing.signal);
    await Promise.resolve(); parsing.abort(); resolveBody({ snapshot });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("loads a validated workspace with same-origin credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ snapshot }));
    const client = createArcCloudClient({ fetch: fetcher });

    await expect(client.loadWorkspace()).resolves.toEqual(snapshot);
    expect(fetcher).toHaveBeenCalledWith("/api/workspace", expect.objectContaining({
      credentials: "include",
      method: "GET",
    }));
  });

  it("creates mutation IDs and never sends an owner identifier", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ snapshot }));
    const client = createArcCloudClient({
      fetch: fetcher,
      createMutationId: () => "setup-mutation-generated",
    });

    await client.saveSetup(createDemoState().setup);

    const init = fetcher.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      mutationId: "setup-mutation-generated",
      setup: createDemoState().setup,
    });
    expect(JSON.stringify(body)).not.toMatch(/userId|ownerId|email/);
    expect(init.credentials).toBe("include");
  });

  it("imports only with explicit consent and the selected resolution", async () => {
    const result = {
      migrationId: "migration-generated",
      status: "imported",
      activeGoalId: "goal-1",
      importedCompletionCount: 0,
      importedProofCount: 0,
      availableResolutions: [],
    };
    const fetcher = vi.fn().mockResolvedValue(Response.json({ result }));
    const client = createArcCloudClient({ fetch: fetcher });

    await client.importLocal(createDemoState(), "archive-import", "migration-generated");

    const body = JSON.parse(String((fetcher.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({
      migrationId: "migration-generated",
      consent: true,
      conflictResolution: "archive-import",
    });
  });

  it("reuses an explicit completion mutation ID", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ snapshot }));
    const client = createArcCloudClient({ fetch: fetcher });

    await client.completeUnit(flagshipRole.today, "completion-original-id");

    const body = JSON.parse(String((fetcher.mock.calls[0][1] as RequestInit).body));
    expect(body.mutationId).toBe("completion-original-id");
    expect(body).toMatchObject({
      unitId: flagshipRole.today.id,
      title: flagshipRole.today.title,
      deliverable: flagshipRole.today.deliverable,
      skillIds: flagshipRole.today.skillIds,
    });
  });

  it("exposes stable API failures without trusting invalid success bodies", async () => {
    const conflictFetch = vi.fn().mockResolvedValue(Response.json({
      error: {
        code: "CONFLICT",
        message: "An active cloud goal already exists.",
        requestId: "00000000-0000-4000-8000-000000000001",
      },
    }, { status: 409 }));
    const invalidFetch = vi.fn().mockResolvedValue(Response.json({ snapshot: { ownerId: "leak" } }));

    await expect(createArcCloudClient({ fetch: conflictFetch }).importLocal(
      createDemoState(),
      "reject",
      "migration-generated",
    )).rejects.toMatchObject({ code: "CONFLICT", status: 409 } satisfies Partial<ArcApiError>);
    await expect(createArcCloudClient({ fetch: invalidFetch }).loadWorkspace()).rejects.toThrow("invalid response");
  });

  it("retains strict recovery actions without changing existing errors", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      error: {
        code: "CONFLICT",
        message: "Refresh planning.",
        requestId: "00000000-0000-4000-8000-000000000001",
        action: "refresh",
      },
    }, { status: 409 }));

    const error = await createArcCloudClient({ fetch: fetcher }).loadWorkspace()
      .catch((caught) => caught as ArcApiError);
    expect(error).toMatchObject({ code: "CONFLICT", action: "refresh" });
  });
});
