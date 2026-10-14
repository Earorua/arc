import type { AgentRequest, AgentStreamEvent, AgentWorkspace, PublicAgentRun } from "../contracts/agents";
import type { PlanningMutationResponse } from "../contracts/planning-api";

export async function agentJson<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    credentials: "same-origin", cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body), signal });
  const value = await response.json() as { error?: unknown };
  if (!response.ok) throw new Error(typeof value?.error === "string" ? value.error : "学习助手暂时无法连接。");
  return value as T;
}
export const agentClient = {
  workspace: (signal?: AbortSignal) => agentJson<AgentWorkspace>("/api/agents/workspace", undefined, signal),
  start: (input: AgentRequest, signal?: AbortSignal) => agentJson<PublicAgentRun>("/api/agents/planner", input, signal),
  poll: (id: string, signal?: AbortSignal) => agentJson<PublicAgentRun>(`/api/agents/planner/${encodeURIComponent(id)}`, undefined, signal),
  apply: (id: string) => agentJson<PlanningMutationResponse>(`/api/agents/planner/${encodeURIComponent(id)}/apply`, {}),
  async tutor(input: AgentRequest, onEvent: (event: AgentStreamEvent) => void, signal: AbortSignal) {
    const response = await fetch("/api/agents/tutor", { method: "POST", credentials: "same-origin", signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    if (!response.ok || !response.body) {
      const error = await response.json().catch(() => null) as { error?: unknown } | null;
      throw new Error(typeof error?.error === "string" ? error.error : "学习伙伴暂时无法回复。");
    }
    const reader = response.body.getReader(); const decoder = new TextDecoder();
    let buffer = "", done = false, bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 512000) throw new Error("回复过长，请分段提问。");
        buffer += decoder.decode(chunk.value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          if (!line.trim()) continue;
          const event = JSON.parse(line) as AgentStreamEvent;
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "done") done = true;
          onEvent(event);
        }
      }
      if (!done) throw new Error("连接中断，回复尚未完成。");
    } finally { await reader.cancel().catch(() => undefined); }
  },
};
