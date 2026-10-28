import { agentRequestSchema, type AgentWorkspace, type PublicAgentRun } from "../../contracts/agents";
import { fingerprint } from "../../lib/planning/fingerprint";
import type { PlanningService } from "../planning/service";
import { AgentServiceError, AgentSetupRequiredError, assertCurrent, learningContext, promptContext, proposalEvent, type LearningContext } from "./context";
import { publicRun, type AgentRepository, type AgentBudgetLimits, type StoredAgentRun } from "./repository";
import { PLANNER_OUTPUT_TOKENS, TUTOR_OUTPUT_TOKENS, PLANNER_TIMEOUT_MS, TUTOR_TIMEOUT_MS, type AgentProvider, type ProviderResponse } from "./openrouter-provider";

export type AgentConfiguration = AgentBudgetLimits & {
  enabled: boolean; plannerModel: string; tutorModel: string;
  plannerReserveMicros: number; tutorReserveMicros: number;
  inputMicrosPerToken: number; outputMicrosPerToken: number;
};
export type AgentServiceDependencies = {
  repository: AgentRepository; provider: AgentProvider; config: AgentConfiguration;
  planning: Pick<PlanningService, "getWorkspaceResponse" | "appendAgentEventResponse">;
};
export class LearningAgentService {
  constructor(private deps: AgentServiceDependencies) {}
  async workspace(owner: string | null): Promise<AgentWorkspace> {
    const config = this.deps.config;
    const result: AgentWorkspace = { enabled: config.enabled, authenticated: Boolean(owner),
      availability: config.enabled ? "ready" : "disabled",
      reason: config.enabled ? null : "学习助手尚未启用，配置模型服务后即可使用。",
      goalId: null, baseVersionId: null, revision: null, roleName: "你的学习旅程", currentTask: null,
      history: [], plannerModel: config.plannerModel, tutorModel: config.tutorModel };
    if (!owner) return { ...result, reason: "登录 Arc 后，学习伙伴会读取你的任务并保存对话。" };
    let context: LearningContext;
    try { context = await this.context(owner); }
    catch (error) {
      if (error instanceof AgentSetupRequiredError || (error as { code?: string })?.code === "NOT_FOUND")
        return { ...result, availability: "needs_setup", reason: "请先完成学习设置，再开始规划或答疑。" };
      throw error;
    }
    let history: StoredAgentRun[] = [];
    if (config.enabled) {
      history = await this.recoverHistory(owner, context.workspace.goalId);
    }
    return { ...result, goalId: context.workspace.goalId, baseVersionId: context.workspace.activePlanVersionId,
      revision: context.workspace.revision, roleName: context.roleName, currentTask: context.currentTask,
      learningContext: context.learningContext, history: history.map(publicRun) };
  }
  async startPlanner(owner: string, input: unknown, signal: AbortSignal = new AbortController().signal,
    onStarted?: (run: PublicAgentRun) => void): Promise<PublicAgentRun> {
    const prepared = await this.prepare(owner, input, "planner");
    if (!prepared.fresh) return publicRun(prepared.run);
    try {
      signal.throwIfAborted();
      await this.deps.repository.update(prepared.run, { status: "running" });
      const run = { ...prepared.run, status: "running" as const };
      onStarted?.(publicRun(run));
      signal.throwIfAborted();
      const response = await this.deps.provider.startPlanner(run.context, signal);
      signal.throwIfAborted();
      // Generation may take minutes. Validate against the latest canonical progress, not the initial snapshot.
      const context = await this.context(owner);
      signal.throwIfAborted();
      await this.deps.repository.update(run, { status: "running", providerId: response.id });
      return await this.finalizePlanner(run, response, context);
    } catch {
      const error = signal.aborted ? "已停止规划，请保持页面打开后重新生成。" : "规划未完成，原有计划保持可用。请稍后重试。";
      await this.deps.repository.update(prepared.run, { status: signal.aborted ? "cancelled" : "failed", error });
      throw new AgentServiceError(502, error);
    }
  }
  async poll(owner: string, id: string): Promise<PublicAgentRun> {
    this.assertEnabled();
    const context = await this.context(owner);
    await this.recoverHistory(owner, context.workspace.goalId);
    const run = await this.deps.repository.find(owner, context.workspace.goalId, id);
    if (!run || run.kind !== "planner") throw new AgentServiceError(404, "找不到这次规划。");
    // OpenRouter Responses is stateless. Poll only our saved result; never resend or fetch an upstream job.
    return publicRun(run);
  }
  async apply(owner: string, id: string) {
    const context = await this.context(owner);
    const run = await this.deps.repository.find(owner, context.workspace.goalId, id);
    if (!run || run.kind !== "planner" || run.status !== "complete" || !run.advice)
      throw new AgentServiceError(404, "找不到可使用的规划方案。");
    const mutationId = `agent-proposal-${run.id}`;
    // Replay of an already staged proposal must return the original mutation result.
    const applied = context.workspace.events.some(event => event.mutationId === mutationId);
    if (!applied) assertCurrent(context, { goalId: run.goalId, baseVersionId: run.baseVersionId, revision: run.revision });
    if (run.workspaceId !== context.workspace.id) throw new AgentServiceError(409, "学习目标已变化，请重新规划。");
    return this.deps.planning.appendAgentEventResponse(owner, {
      mutationId, baseVersionId: run.baseVersionId,
      event: { kind: "agent_replanned", baseRevision: run.revision, unitOrder: run.advice.unitOrder,
        planningDate: JSON.parse(run.context).planningDate ?? context.planningDate },
    }, { goalId: run.goalId, workspaceId: run.workspaceId, revision: run.revision });
  }
  async tutor(owner: string, input: unknown, onDelta: (text: string) => void, signal: AbortSignal): Promise<PublicAgentRun> {
    const prepared = await this.prepare(owner, input, "tutor");
    const run = prepared.run;
    if (!prepared.fresh) {
      if (run.status === "complete") { onDelta(run.answer); return publicRun(run); }
      throw new AgentServiceError(409, "这条消息已提交。请等待回复或发送一条新消息。");
    }
    await this.deps.repository.update(run, { status: "running" });
    try {
      signal.throwIfAborted();
      const result = await this.deps.provider.tutor(run.context, [], prepared.request.deep, onDelta, signal);
      if (signal.aborted) throw new Error("cancelled");
      await this.deps.repository.update(run, { status: "complete", answer: result.text, usage: result.usage });
      return publicRun({ ...run, status: "complete", answer: result.text });
    } catch {
      await this.deps.repository.update(run, { status: signal.aborted ? "cancelled" : "failed",
        error: signal.aborted ? "已停止回复。" : "本次回复未完成，请稍后重试。" });
      throw new AgentServiceError(502, "本次回复未完成，请稍后重试。");
    }
  }
  private async prepare(owner: string, input: unknown, kind: "planner" | "tutor") {
    this.assertEnabled();
    const request = agentRequestSchema.parse(input);
    const context = await this.context(owner);
    const history = await this.recoverHistory(owner, context.workspace.goalId);
    const previous = await this.deps.repository.find(owner, request.goalId, request.requestId);
    const requestFingerprint = fingerprint({ request, kind });
    if (previous) {
      if (previous.fingerprint !== requestFingerprint || previous.goalId !== context.workspace.goalId)
        throw new AgentServiceError(409, "该请求已用于另一条消息。");
      return { fresh: false, run: previous, context, request };
    }
    assertCurrent(context, request);
    if (kind === "planner" && (context.workspace.pendingPlanVersionId || !context.units.length))
      throw new AgentServiceError(409, context.units.length ? "请先处理待确认的计划调整。" : "当前路线已完成，请设置新的学习目标。");
    const config = this.deps.config;
    const reservedMicros = kind === "planner" ? config.plannerReserveMicros : config.tutorReserveMicros;
    const recent = history.filter(item => item.kind === "tutor" && item.status === "complete").slice(-5)
      .map(item => ({ question: item.message.slice(0, 1000), answer: item.answer.slice(0, 2000) }));
    const base = { ...JSON.parse(promptContext(context, request, kind === "planner")), planningDate: context.planningDate };
    let serialized = JSON.stringify({ ...base, recentConversation: recent });
    // UTF-8 bytes conservatively bound token count; include prompt/schema overhead and bounded history.
    const upperCost = () => (new TextEncoder().encode(serialized).byteLength + 6000) * config.inputMicrosPerToken
      + (kind === "planner" ? PLANNER_OUTPUT_TOKENS : TUTOR_OUTPUT_TOKENS) * config.outputMicrosPerToken;
    while (recent.length && upperCost() > reservedMicros) {
      recent.shift(); serialized = JSON.stringify({ ...base, recentConversation: recent });
    }
    const maximum = upperCost();
    if (maximum > reservedMicros) throw new AgentServiceError(413, "本次内容超过单次预算，请缩短问题或调整助手预算。");
    const reservation = { id: request.requestId, ownerId: owner, goalId: request.goalId, kind,
      message: request.message, context: serialized, workspaceId: context.workspace.id,
      baseVersionId: request.baseVersionId, revision: request.revision, fingerprint: requestFingerprint,
      model: kind === "planner" ? config.plannerModel : config.tutorModel,
      effort: kind === "planner" ? "max" : request.deep ? "high" : "low", reservedMicros, createdAt: Date.now() };
    if (!await this.deps.repository.reserve(reservation, config)) {
      const duplicate = await this.deps.repository.find(owner, request.goalId, request.requestId);
      if (duplicate?.fingerprint === requestFingerprint) return { fresh: false, run: duplicate, context, request };
      throw new AgentServiceError(429, "已有请求正在进行，或今日助手额度已用完。");
    }
    const run = await this.deps.repository.find(owner, request.goalId, request.requestId);
    if (!run) throw new AgentServiceError(503, "无法保存这次请求，请稍后重试。");
    return { fresh: true, run, context, request };
  }
  private async finalizePlanner(run: StoredAgentRun, response: ProviderResponse, context: LearningContext) {
    if (response.status === "completed" && response.advice) {
      try {
        assertCurrent(context, { goalId: run.goalId, baseVersionId: run.baseVersionId, revision: run.revision });
        proposalEvent(context, response.advice, `agent-validation-${run.id}`);
      } catch {
        await this.deps.repository.update(run, { status: "failed", error: "方案未通过校验，或学习进度已变化。请重新规划。" });
        return publicRun({ ...run, status: "failed", error: "方案未通过校验，或学习进度已变化。请重新规划。" });
      }
      await this.deps.repository.update(run, { status: "complete", advice: response.advice,
        answer: response.advice.summary, usage: response.usage });
      const saved = await this.deps.repository.find(run.ownerId, run.goalId, run.id);
      if (!saved) throw new AgentServiceError(503, "无法读取已保存的规划。");
      return publicRun(saved);
    }
    await this.deps.repository.update(run, { status: "failed", error: "模型没有生成完整方案，请重试。" });
    return publicRun({ ...run, status: "failed", error: "模型没有生成完整方案，请重试。" });
  }
  private assertEnabled() {
    if (!this.deps.config.enabled) throw new AgentServiceError(503, "学习助手尚未启用，配置模型服务后即可使用。");
  }
  private async recoverHistory(owner: string, goalId: string) {
    const history = await this.deps.repository.history(owner, goalId);
    for (const run of history) {
      const age = Date.now() - run.createdAt;
      const expired = run.status === "starting" && age > 120000
        || run.status === "running" && age > (run.kind === "planner" ? PLANNER_TIMEOUT_MS : TUTOR_TIMEOUT_MS) + 30000;
      if (expired) {
        const error = "连接中断或任务超时，本次请求没有完整结果。";
        await this.deps.repository.update(run, { status: "failed", error });
        run.status = "failed"; run.error = error;
      }
    }
    return history;
  }
  private async context(owner: string) { return learningContext(await this.deps.planning.getWorkspaceResponse(owner)); }
}
