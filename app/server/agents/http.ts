import { z } from "zod";
import { AgentServiceError } from "./context";
import type { LearningAgentService } from "./service";
import type { AgentStreamEvent } from "../../contracts/agents";

type Dependencies = {
  getUser(headers: Headers): Promise<{ id: string } | null>;
  createService(): LearningAgentService;
  rateLimit(owner: string): Promise<boolean>;
  origin: string | null;
};
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
const errorResult = (error: unknown) => {
  if (error instanceof AgentServiceError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return json({ error: "请求内容不完整或过长，请检查后重试。" }, 400);
  if ((error as { code?: string })?.code === "CONFLICT") return json({ error: "学习进度已变化，请刷新后重试。" }, 409);
  if ((error as { code?: string })?.code === "AUTH_UNAVAILABLE") return json({ error: "登录服务尚未配置，学习助手暂不可用。" }, 503);
  return json({ error: "学习助手暂时无法连接，请稍后重试。" }, 503);
};
export function createAgentHandlers(deps: Dependencies) {
  async function guarded(request: Request, action: (service: LearningAgentService, owner: string | null) => Promise<Response>, publicRead = false) {
    try {
      if (request.method !== "GET") {
        const origin = request.headers.get("origin");
        if (!deps.origin || origin !== deps.origin) throw new AgentServiceError(403, "请从本站发起请求。");
      }
      const user = await deps.getUser(request.headers);
      if (!user && !publicRead) throw new AgentServiceError(401, "请先登录 Arc。");
      if (user && !await deps.rateLimit(user.id)) throw new AgentServiceError(429, "请求过于频繁，请稍后再试。");
      return await action(deps.createService(), user?.id ?? null);
    } catch (error) { return errorResult(error); }
  }
  return {
    workspace: (request: Request) => guarded(request, async (service, owner) => json(await service.workspace(owner)), true),
    planner: (request: Request) => guarded(request, async (service, owner) =>
      json(await service.startPlanner(owner!, await body(request)), 202)),
    poll: (request: Request, id: string) => guarded(request, async (service, owner) => json(await service.poll(owner!, id))),
    apply: (request: Request, id: string) => guarded(request, async (service, owner) => json(await service.apply(owner!, id))),
    tutor: (request: Request) => guarded(request, async (service, owner) => {
      const input = await body(request);
      const abort = new AbortController();
      const signal = AbortSignal.any([abort.signal, request.signal]);
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: AgentStreamEvent) => { if (!signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); };
          void service.tutor(owner!, input, text => send({ type: "delta", text }), signal)
            .then(run => send({ type: "done", run }))
            .catch(error => send({ type: "error", message: error instanceof AgentServiceError ? error.message : "本次回复未完成，请重试。" }))
            .finally(() => { try { controller.close(); } catch { /* The browser may already have cancelled. */ } });
        },
        cancel() { abort.abort(); },
      });
      return new Response(stream, { headers: { ...headers, "Content-Type": "application/x-ndjson; charset=utf-8" } });
    }),
  };
}
async function body(request: Request): Promise<unknown> {
  if (!request.body) throw new AgentServiceError(400, "消息不能为空。");
  const reader = request.body.getReader(); let size = 0, text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 32768) throw new AgentServiceError(413, "消息过长，请分段提问。");
      text += decoder.decode(chunk.value, { stream: true });
    }
    try { return JSON.parse(text + decoder.decode()); }
    catch { throw new AgentServiceError(400, "请求格式无效。"); }
  } finally { await reader.cancel().catch(() => undefined); }
}
