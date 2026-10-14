import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentHandlers } from "../../app/server/agents/http";
import type { LearningAgentService } from "../../app/server/agents/service";
import type { PublicAgentRun } from "../../app/contracts/agents";
afterEach(() => vi.useRealTimers());
describe("learning agent HTTP boundary", () => {
  const service = { startPlanner: vi.fn(), workspace: vi.fn() } as unknown as LearningAgentService;
  const dependencies = { getUser: async () => null, createService: () => service,
    rateLimit: async () => true, origin: "https://arc.example" };
  it("rejects unauthenticated writes", async () => {
    const handlers = createAgentHandlers(dependencies);
    const result = await handlers.planner(new Request("https://arc.example/api/agents/planner",
      { method: "POST", headers: { origin: "https://arc.example" }, body: "{}" }));
    expect(result.status).toBe(401);
    expect(service.startPlanner).not.toHaveBeenCalled();
  });
  it("rejects cross-origin writes before parsing or invoking a model", async () => {
    const handlers = createAgentHandlers({ ...dependencies, getUser: async () => ({ id: "alice" }) });
    const result = await handlers.planner(new Request("https://arc.example/api/agents/planner",
      { method: "POST", headers: { origin: "https://other.example" }, body: "{}" }));
    expect(result.status).toBe(403);
  });
  it("streams started, heartbeats and the completed saved plan", async () => {
    vi.useFakeTimers();
    const run = { id: "run-1", status: "complete" } as PublicAgentRun;
    let finish!: (run: PublicAgentRun) => void;
    const pending = new Promise<PublicAgentRun>(resolve => { finish = resolve; });
    const startPlanner = vi.fn<LearningAgentService["startPlanner"]>(async (_owner, _input, _signal, started) => {
      started?.({ ...run, status: "running" }); return pending;
    });
    const handlers = createAgentHandlers({ ...dependencies, getUser: async () => ({ id: "alice" }),
      createService: () => ({ startPlanner }) as unknown as LearningAgentService });
    const result = await handlers.planner(new Request("https://arc.example/api/agents/planner", { method: "POST",
      headers: { origin: "https://arc.example" }, body: JSON.stringify({ requestId: "00000000-0000-4000-8000-000000000001",
        goalId: "goal", baseVersionId: "plan", revision: 0, message: "规划" }) }));
    expect(result.headers.get("content-type")).toContain("application/x-ndjson");
    const text = result.text(); await vi.advanceTimersByTimeAsync(15000); finish(run);
    const events = (await text).trim().split("\n").map(line => JSON.parse(line));
    expect(events).toContainEqual({ type: "started", run: { ...run, status: "running" } });
    expect(events).toContainEqual({ type: "heartbeat" });
    expect(events.at(-1)).toEqual({ type: "done", run });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("propagates browser cancellation and clears the heartbeat", async () => {
    vi.useFakeTimers(); let signal!: AbortSignal;
    const startPlanner = vi.fn<LearningAgentService["startPlanner"]>(async (_owner, _input, current) => {
      signal = current!; return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled"))));
    });
    const handlers = createAgentHandlers({ ...dependencies, getUser: async () => ({ id: "alice" }),
      createService: () => ({ startPlanner }) as unknown as LearningAgentService });
    const result = await handlers.planner(new Request("https://arc.example/api/agents/planner", { method: "POST",
      headers: { origin: "https://arc.example" }, body: JSON.stringify({ requestId: "00000000-0000-4000-8000-000000000001",
        goalId: "goal", baseVersionId: "plan", revision: 0, message: "规划" }) }));
    await result.body!.cancel();
    expect(signal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
});
