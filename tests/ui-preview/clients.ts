import { fixture, unavailableAgents } from "./data";
export const agentClient = {
  workspace: async () => ({ ...unavailableAgents, enabled: new URLSearchParams(window.location.search).get("assistant") === "enabled" }),
  tutor: async () => { throw new Error("本地预览不会发送模型请求"); },
  start: async () => { throw new Error("本地预览不会发送模型请求"); },
  poll: async () => { throw new Error("本地预览没有生成任务"); },
  apply: async () => { throw new Error("本地预览不保存计划"); },
};
export const usePlanningWorkspace = () => ({
  workspace: fixture.workspace, sourceContext: fixture.sourceContext, source: "cloud",
  recovery: "none", accept: async () => false, discard: async () => false, retry: async () => undefined,
});
