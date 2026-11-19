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
      reason: config.enabled ? null : "The learning assistant is not yet enabled. Configure the model service to use it.",
      goalId: null, baseVersionId: null, revision: null, roleName: "Your learning journey", currentTask: null,
      history: [], plannerModel: config.plannerModel, tutorModel: config.tutorModel };
    if (!owner) return { ...result, reason: "Sign in to Arc so your companion can read your tasks and save your conversations." };
    let context: LearningContext;
    try { context = await this.context(owner); }
    catch (error) {
      if (error instanceof AgentSetupRequiredError || (error as { code?: string })?.code === "NOT_FOUND")
        return { ...result, availability: "needs_setup", reason: "Complete your learning setup before planning or asking questions." };
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
      const error = signal.aborted ? "Planning stopped. Keep this page open and try again." : "Planning did not finish. Your current plan is still available. Try again later.";
      await this.deps.repository.update(prepared.run, { status: signal.aborted ? "cancelled" : "failed", error });
      throw new AgentServiceError(502, error);
    }
  }
  async poll(owner: string, id: string): Promise<PublicAgentRun> {
    this.assertEnabled();
    const context = await this.context(owner);
    await this.recoverHistory(owner, context.workspace.goalId);
    const run = await this.deps.repository.find(owner, context.workspace.goalId, id);
    if (!run || run.kind !== "planner") throw new AgentServiceError(404, "This planning request could not be found.");
    // OpenRouter Responses is stateless. Poll only our saved result; never resend or fetch an upstream job.
    return publicRun(run);
  }
  async apply(owner: string, id: string) {
    const context = await this.context(owner);
    const run = await this.deps.repository.find(owner, context.workspace.goalId, id);
    if (!run || run.kind !== "planner" || run.status !== "complete" || !run.advice)
      throw new AgentServiceError(404, "No usable proposal was found.");
    const mutationId = `agent-proposal-${run.id}`;
    // Replay of an already staged proposal must return the original mutation result.
    const applied = context.workspace.events.some(event => event.mutationId === mutationId);
    if (!applied) assertCurrent(context, { goalId: run.goalId, baseVersionId: run.baseVersionId, revision: run.revision });
    if (run.workspaceId !== context.workspace.id) throw new AgentServiceError(409, "Your learning goal has changed. Create a new proposal.");
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
      throw new AgentServiceError(409, "This message was already submitted. Wait for the reply or send a new message.");
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
        error: signal.aborted ? "Response stopped." : "The response did not finish. Try again later." });
      throw new AgentServiceError(502, "The response did not finish. Try again later.");
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
        throw new AgentServiceError(409, "This request was already used for another message.");
      return { fresh: false, run: previous, context, request };
    }
    assertCurrent(context, request);
    if (kind === "planner" && (context.workspace.pendingPlanVersionId || !context.units.length))
      throw new AgentServiceError(409, context.units.length ? "Review your pending plan changes first." : "This path is complete. Set a new learning goal.");
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
    if (maximum > reservedMicros) throw new AgentServiceError(413, "This request exceeds the per-request budget. Shorten your question or adjust the assistant budget.");
    const reservation = { id: request.requestId, ownerId: owner, goalId: request.goalId, kind,
      message: request.message, context: serialized, workspaceId: context.workspace.id,
      baseVersionId: request.baseVersionId, revision: request.revision, fingerprint: requestFingerprint,
      model: kind === "planner" ? config.plannerModel : config.tutorModel,
      effort: kind === "planner" ? "max" : request.deep ? "high" : "low", reservedMicros, createdAt: Date.now() };
    if (!await this.deps.repository.reserve(reservation, config)) {
      const duplicate = await this.deps.repository.find(owner, request.goalId, request.requestId);
      if (duplicate?.fingerprint === requestFingerprint) return { fresh: false, run: duplicate, context, request };
      throw new AgentServiceError(429, "A request is already running, or your daily assistant allowance has been used.");
    }
    const run = await this.deps.repository.find(owner, request.goalId, request.requestId);
    if (!run) throw new AgentServiceError(503, "Could not save this request. Try again later.");
    return { fresh: true, run, context, request };
  }
  private async finalizePlanner(run: StoredAgentRun, response: ProviderResponse, context: LearningContext) {
    if (response.status === "completed" && response.advice) {
      try {
        assertCurrent(context, { goalId: run.goalId, baseVersionId: run.baseVersionId, revision: run.revision });
        proposalEvent(context, response.advice, `agent-validation-${run.id}`);
      } catch {
        await this.deps.repository.update(run, { status: "failed", error: "The proposal did not pass validation, or your progress has changed. Create a new proposal." });
        return publicRun({ ...run, status: "failed", error: "The proposal did not pass validation, or your progress has changed. Create a new proposal." });
      }
      await this.deps.repository.update(run, { status: "complete", advice: response.advice,
        answer: response.advice.summary, usage: response.usage });
      const saved = await this.deps.repository.find(run.ownerId, run.goalId, run.id);
      if (!saved) throw new AgentServiceError(503, "Could not load the saved proposal.");
      return publicRun(saved);
    }
    await this.deps.repository.update(run, { status: "failed", error: "The model did not produce a complete proposal. Try again." });
    return publicRun({ ...run, status: "failed", error: "The model did not produce a complete proposal. Try again." });
  }
  private assertEnabled() {
    if (!this.deps.config.enabled) throw new AgentServiceError(503, "The learning assistant is not yet enabled. Configure the model service to use it.");
  }
  private async recoverHistory(owner: string, goalId: string) {
    const history = await this.deps.repository.history(owner, goalId);
    for (const run of history) {
      const age = Date.now() - run.createdAt;
      const expired = run.status === "starting" && age > 120000
        || run.status === "running" && age > (run.kind === "planner" ? PLANNER_TIMEOUT_MS : TUTOR_TIMEOUT_MS) + 30000;
      if (expired) {
        const error = "The connection was interrupted or the request timed out before a complete result was received.";
        await this.deps.repository.update(run, { status: "failed", error });
        run.status = "failed"; run.error = error;
      }
    }
    return history;
  }
  private async context(owner: string) { return learningContext(await this.deps.planning.getWorkspaceResponse(owner)); }
}
