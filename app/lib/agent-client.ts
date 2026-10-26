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
  start: (input: AgentRequest, signal?: AbortSignal, onStarted?: (run: PublicAgentRun) => void) =>
    readAgentStream("/api/agents/planner", input, event => {
      if (event.type === "started") onStarted?.(event.run);
    }, signal),
  poll: (id: string, signal?: AbortSignal) => agentJson<PublicAgentRun>(`/api/agents/planner/${encodeURIComponent(id)}`, undefined, signal),
  apply: (id: string) => agentJson<PlanningMutationResponse>(`/api/agents/planner/${encodeURIComponent(id)}/apply`, {}),
  tutor: (input: AgentRequest, onEvent: (event: AgentStreamEvent) => void, signal: AbortSignal) =>
    readAgentStream("/api/agents/tutor", input, onEvent, signal),
};

async function readAgentStream(url: string, input: AgentRequest, onEvent: (event: AgentStreamEvent) => void, signal?: AbortSignal) {
  const response = await fetch(url, { method: "POST", credentials: "same-origin", cache: "no-store", signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => null) as { error?: unknown } | null;
    throw new Error(typeof error?.error === "string" ? error.error : "学习助手暂时无法连接。");
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", bytes = 0, result: PublicAgentRun | null = null;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as AgentStreamEvent;
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "done") result = event.run;
    onEvent(event);
  };
  try {
    signal?.throwIfAborted();
    while (!result) {
      const chunk = await reader.read();
      signal?.throwIfAborted();
      if (chunk.done) {
        buffer += decoder.decode();
        if (buffer.trim()) consume(buffer);
        break;
      }
      bytes += chunk.value.byteLength;
      if (bytes > 512000) throw new Error("回复过长，请分段提问。");
      buffer += decoder.decode(chunk.value, { stream: true });
      let end: number;
      while (!result && (end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        consume(line);
      }
    }
    if (!result) throw new Error("连接中断，本次生成尚未完成。");
    return result as PublicAgentRun;
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
  }
}
