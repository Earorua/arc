import { afterEach, describe, expect, it, vi } from "vitest";
import { agentClient } from "../../app/lib/agent-client";
import type { AgentRequest, PublicAgentRun } from "../../app/contracts/agents";

const input: AgentRequest = { requestId: "00000000-0000-4000-8000-000000000001", goalId: "goal", baseVersionId: "plan",
  revision: 0, message: "规划", page: "coach", deep: true };
const run: PublicAgentRun = { id: input.requestId, kind: "planner", status: "complete", message: "规划", answer: "先学基础",
  advice: null, createdAt: 1, baseVersionId: "plan", revision: 0, model: "openai/gpt-6-astra", effort: "max", error: null };
afterEach(() => vi.unstubAllGlobals());
describe("learning agent client", () => {
  it("shows a started record and waits through heartbeats for the saved result", async () => {
    const events = [{ type: "started", run: { ...run, status: "running" } }, { type: "heartbeat" }, { type: "done", run }];
    const bytes = new TextEncoder().encode(events.map(event => JSON.stringify(event) + "\n").join(""));
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close();
    } })));
    vi.stubGlobal("fetch", fetcher); const started = vi.fn();
    expect(await agentClient.start(input, new AbortController().signal, started)).toEqual(run);
    expect(started).toHaveBeenCalledWith(expect.objectContaining({ status: "running" }));
    expect(fetcher).toHaveBeenCalledWith("/api/agents/planner", expect.objectContaining({ method: "POST", credentials: "same-origin" }));
  });
  it("does not retry a disconnected planning stream", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ type: "started", run }) + "\n"));
    vi.stubGlobal("fetch", fetcher);
    await expect(agentClient.start(input)).rejects.toThrow("连接中断");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("surfaces safe server errors and cancels a stalled stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"type":"error","message":"额度已用完"}\n')));
    await expect(agentClient.start(input)).rejects.toThrow("额度已用完");
    const cancel = vi.fn(), abort = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ cancel }))));
    const pending = agentClient.start(input, abort.signal); await Promise.resolve(); abort.abort();
    await expect(pending).rejects.toThrow(); expect(cancel).toHaveBeenCalledOnce();
  });
});
