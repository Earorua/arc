import { fixture, proof, unavailableAgents } from "./data";
import { createDemoState } from "../../app/lib/demo-store";
import type { AgentRequest, PublicAgentRun } from "../../app/contracts/agents";
export const agentClient = {
  workspace: async () => ({ ...unavailableAgents, enabled: new URLSearchParams(window.location.search).get("assistant") !== "disabled" }),
  tutor: async () => { throw new Error("本地预览不会发送模型请求"); },
  start: async (input: AgentRequest, signal?: AbortSignal, started?: (run: PublicAgentRun) => void) => {
    if (new URLSearchParams(window.location.search).get("simulate") !== "running") throw new Error("本地预览不会发送模型请求");
    started?.({ id: "preview-running", kind: "planner", status: "running", createdAt: Date.now(), baseVersionId: input.baseVersionId, revision: input.revision, model: "local-preview", effort: "max", message: input.message, answer: "", advice: null, error: null } as PublicAgentRun);
    return new Promise<never>((_resolve, reject) => { signal?.addEventListener("abort", () => reject(new DOMException("Local preview ended", "AbortError")), { once: true }); });
  },
  poll: async () => { throw new Error("本地预览没有生成任务"); },
  apply: async () => { throw new Error("本地预览不保存计划"); },
};
export const usePlanningWorkspace = () => ({
  workspace: fixture.workspace, sourceContext: fixture.sourceContext, source: "cloud",
  recovery: "none", accept: async () => false, discard: async () => false, retry: async () => undefined,
  record: async () => true, generate: async () => false, migration: "none", cloudGoalMissing: false,
  importLocal: async () => false, dismissMigration: () => undefined,
  preflightCurrentSetup: async () => true,
});
const state = createDemoState();
export const useArcState = () => ({ state, source: "cloud", recovery: "none", migration: "none", localMigrationState: null,
  retry: async () => undefined, importLocal: async () => undefined, dismissMigration: () => undefined,
  saveSetup: async () => false, completeUnit: async () => false,
});
export const useProofLedger = () => ({ workspace: proof, projections: proof.projections, source: "local", recovery: "none",
  createProof: async () => false, reviseProof: async () => false, setVisibility: async () => false, withdrawProof: async () => false, retry: async () => undefined,
});
