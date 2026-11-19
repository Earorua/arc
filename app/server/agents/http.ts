import { z } from "zod";
import { AgentServiceError } from "./context";
import type { LearningAgentService } from "./service";
import { agentRequestSchema, type AgentStreamEvent, type PublicAgentRun } from "../../contracts/agents";

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
  if (error instanceof z.ZodError) return json({ error: "The request is incomplete or too long. Check it and try again." }, 400);
  if ((error as { code?: string })?.code === "CONFLICT") return json({ error: "Your progress has changed. Refresh and try again." }, 409);
  if ((error as { code?: string })?.code === "AUTH_UNAVAILABLE") return json({ error: "Sign-in is not configured. The learning assistant is unavailable." }, 503);
  return json({ error: "The learning assistant is temporarily unavailable. Try again later." }, 503);
};
export function createAgentHandlers(deps: Dependencies) {
  async function guarded(request: Request, action: (service: LearningAgentService, owner: string) => Promise<Response>) {
    try {
      if (request.method !== "GET") {
        const origin = request.headers.get("origin");
        if (!deps.origin || origin !== deps.origin) throw new AgentServiceError(403, "Send this request from Arc.");
      }
      const user = await deps.getUser(request.headers);
      if (!user) throw new AgentServiceError(401, "Sign in to Arc first.");
      if (!await deps.rateLimit(user.id)) throw new AgentServiceError(429, "Too many requests. Try again later.");
      return await action(deps.createService(), user.id);
    } catch (error) { return errorResult(error); }
  }
  return {
    workspace: (request: Request) => guarded(request, async (service, owner) => json(await service.workspace(owner))),
    planner: (request: Request) => guarded(request, async (service, owner) => {
      const input = agentRequestSchema.parse(await body(request));
      return streamResponse(request, (send, signal) =>
        service.startPlanner(owner, input, signal, run => send({ type: "started", run })));
    }),
    poll: (request: Request, id: string) => guarded(request, async (service, owner) => json(await service.poll(owner, id))),
    apply: (request: Request, id: string) => guarded(request, async (service, owner) => json(await service.apply(owner, id))),
    tutor: (request: Request) => guarded(request, async (service, owner) => {
      const input = agentRequestSchema.parse(await body(request));
      return streamResponse(request, (send, signal) => service.tutor(owner, input, text => send({ type: "delta", text }), signal));
    }),
  };
}
function streamResponse(request: Request,
  task: (send: (event: AgentStreamEvent) => void, signal: AbortSignal) => Promise<PublicAgentRun>) {
  const abort = new AbortController(), encoder = new TextEncoder();
  const signal = AbortSignal.any([abort.signal, request.signal]);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: AgentStreamEvent) => {
        if (!closed && !signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      // Reasoning can be silent for minutes; keep the browser connection active without exposing it.
      const timer = setInterval(() => send({ type: "heartbeat" }), 15000);
      const close = () => {
        clearInterval(timer); signal.removeEventListener("abort", close);
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* Reader may have cancelled already. */ }
      };
      signal.addEventListener("abort", close, { once: true });
      if (signal.aborted) { close(); return; }
      send({ type: "heartbeat" });
      void task(send, signal).then(run => send({ type: "done", run }))
        .catch(error => send({ type: "error", message: error instanceof AgentServiceError ? error.message : "Generation did not finish. Try again." }))
        .finally(close);
    },
    cancel() { abort.abort(); },
  });
  return new Response(stream, { headers: { ...headers, "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
async function body(request: Request): Promise<unknown> {
  if (!request.body) throw new AgentServiceError(400, "Enter a message.");
  const reader = request.body.getReader(); let size = 0, text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 32768) throw new AgentServiceError(413, "This message is too long. Try asking one part at a time.");
      text += decoder.decode(chunk.value, { stream: true });
    }
    try { return JSON.parse(text + decoder.decode()); }
    catch { throw new AgentServiceError(400, "The request format is invalid."); }
  } finally { await reader.cancel().catch(() => undefined); }
}
