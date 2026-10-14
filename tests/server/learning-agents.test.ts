import { describe, expect, it, vi } from "vitest";
import { LearningAgentService } from "../../app/server/agents/service";
import type { AgentProvider } from "../../app/server/agents/openrouter-provider";
import type { AgentRepository, StoredAgentRun } from "../../app/server/agents/repository";
import { agentFixture } from "../helpers/agent-fixture";

function fixture() {
  const f = agentFixture(); const rows = new Map<string, StoredAgentRun>();
  const repository: AgentRepository = {
    find: async (owner, goal, id) => { const row = rows.get(id); return row?.ownerId === owner && row.goalId === goal ? row : null; },
    history: async (owner, goal) => [...rows.values()].filter(row => row.ownerId === owner && row.goalId === goal),
    reserve: async run => {
      if (rows.has(run.id)) return false;
      rows.set(run.id, { ...run, status: "starting", providerId: null, answer: "", advice: null, error: null });
      return true;
    },
    update: async (run, fields) => { rows.set(run.id, { ...rows.get(run.id)!, ...fields }); },
  };
  const provider: AgentProvider = {
    startPlanner: vi.fn<AgentProvider["startPlanner"]>(async () => ({ id: "resp_abc", status: "completed", usage: { inputTokens: 2, outputTokens: 3 },
      advice: { summary: "学习路线", rationale: "先基础后应用", milestones: [{ title: "建立基础",
        unitIds: [f.path.units[0].id], successCriteria: "完成练习" }], unitOrder: f.path.units.map(u => u.id) } })),
    tutor: vi.fn(async (_context, _history, _deep, delta) => { delta("你好"); return { text: "你好", usage: { inputTokens: 2, outputTokens: 3 } }; }),
  };
  const planning = { getWorkspaceResponse: vi.fn(async () => ({ workspace: f.workspace, sourceContext: f.sourceContext })),
    appendAgentEventResponse: vi.fn() };
  const config = { enabled: true, plannerModel: "openai/gpt-6-astra", tutorModel: "openai/gpt-6-astra",
    siteDailyMicros: 20000000, siteMonthlyMicros: 200000000, userDailyMicros: 5000000,
    plannerReserveMicros: 2000000, tutorReserveMicros: 500000, inputMicrosPerToken: 13, outputMicrosPerToken: 50 };
  const service = new LearningAgentService({ repository, provider, planning, config });
  const input = { requestId: "00000000-0000-4000-8000-000000000001", goalId: f.workspace.goalId,
    baseVersionId: f.workspace.activePlanVersionId, revision: 0, message: "帮我规划", page: "coach" as const, deep: false };
  return { service, provider, planning, rows, config, f, input };
}
describe("learning agent service", () => {
  it("publishes a running record before waiting and polls only stored state", async () => {
    const f = fixture();
    const original = vi.mocked(f.provider.startPlanner).getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(f.provider.startPlanner).mockImplementation(async (...args) => { await gate; return original(...args); });
    const started = vi.fn();
    const result = f.service.startPlanner("alice", f.input, new AbortController().signal, started);
    await vi.waitFor(() => expect(started).toHaveBeenCalledWith(expect.objectContaining({ status: "running" })));
    expect((await f.service.poll("alice", f.input.requestId)).status).toBe("running");
    expect((await f.service.startPlanner("alice", f.input)).status).toBe("running");
    expect(f.provider.startPlanner).toHaveBeenCalledTimes(1);
    release(); expect((await result).status).toBe("complete");
  });
  it("rejects a result if learning progress changes during generation", async () => {
    const f = fixture();
    const original = vi.mocked(f.provider.startPlanner).getMockImplementation()!;
    vi.mocked(f.provider.startPlanner).mockImplementation(async (...args) => {
      const result = await original(...args);
      f.f.workspace.revision += 1; return result;
    });
    expect((await f.service.startPlanner("alice", f.input)).status).toBe("failed");
    expect(f.planning.appendAgentEventResponse).not.toHaveBeenCalled();
  });
  it("does not start a paid call after cancellation and marks the reservation cancelled", async () => {
    const f = fixture(); const abort = new AbortController(); abort.abort();
    await expect(f.service.startPlanner("alice", f.input, abort.signal)).rejects.toThrow("已停止规划");
    expect(f.provider.startPlanner).not.toHaveBeenCalled();
    expect(f.rows.get(f.input.requestId)?.status).toBe("cancelled");
  });
  it("expires disconnected immediate runs without resubmitting them", async () => {
    const f = fixture(); await f.service.startPlanner("alice", f.input);
    const row = f.rows.get(f.input.requestId)!;
    f.rows.set(row.id, { ...row, status: "running", createdAt: Date.now() - 660000 });
    expect((await f.service.poll("alice", row.id)).status).toBe("failed");
    expect(f.provider.startPlanner).toHaveBeenCalledTimes(1);
  });
  it("deduplicates immediate planning and reads saved results without another paid call", async () => {
    const f = fixture();
    await f.service.startPlanner("alice", f.input);
    await f.service.startPlanner("alice", f.input);
    expect(f.provider.startPlanner).toHaveBeenCalledTimes(1);
    expect((await f.service.poll("alice", f.input.requestId)).status).toBe("complete");
    expect(f.planning.appendAgentEventResponse).not.toHaveBeenCalled();
  });
  it("rejects stale revisions before a paid request", async () => {
    const f = fixture();
    await expect(f.service.startPlanner("alice", { ...f.input, revision: 3 })).rejects.toThrow("学习计划已经变化");
    expect(f.provider.startPlanner).not.toHaveBeenCalled();
  });
  it("does not make requests when disabled", async () => {
    const f = fixture(); f.config.enabled = false;
    await expect(f.service.startPlanner("alice", f.input)).rejects.toThrow("尚未启用");
    expect(f.provider.startPlanner).not.toHaveBeenCalled();
  });
  it("refuses another owner's run", async () => {
    const f = fixture(); await f.service.startPlanner("alice", f.input);
    await expect(f.service.poll("bob", f.input.requestId)).rejects.toThrow("找不到");
  });
  it("recovers orphaned starts on polling and before admitting a new request", async () => {
    const f = fixture(); await f.service.startPlanner("alice", f.input);
    const row = f.rows.get(f.input.requestId)!;
    f.rows.set(row.id, { ...row, status: "starting", providerId: null, createdAt: Date.now() - 180000 });
    expect((await f.service.poll("alice", row.id)).status).toBe("failed");
    expect(f.provider.startPlanner).toHaveBeenCalledTimes(1);
  });
  it("saves tutor replies, replays duplicate messages, and includes recent history", async () => {
    const f = fixture(); const delta = vi.fn();
    const signal = new AbortController().signal;
    await f.service.tutor("alice", f.input, delta, signal);
    await f.service.tutor("alice", f.input, delta, signal);
    expect(f.provider.tutor).toHaveBeenCalledTimes(1);
    expect((await f.service.workspace("alice")).history[0].answer).toBe("你好");
    await f.service.tutor("alice", { ...f.input, requestId: "00000000-0000-4000-8000-000000000002", message: "继续解释" }, delta, signal);
    expect(JSON.parse(vi.mocked(f.provider.tutor).mock.calls[1][0]).recentConversation).toEqual([{ question: "帮我规划", answer: "你好" }]);
  });
  it("keeps completed results when the learner returns the next day", async () => {
    const f = fixture(); await f.service.startPlanner("alice", f.input);
    const row = f.rows.get(f.input.requestId)!;
    f.rows.set(row.id, { ...row, createdAt: Date.now() - 2 * 86400000 });
    expect((await f.service.poll("alice", row.id)).status).toBe("complete");
    expect(f.provider.startPlanner).toHaveBeenCalledTimes(1);
  });
});
