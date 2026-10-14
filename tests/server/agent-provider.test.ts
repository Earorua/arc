import { describe, expect, it, vi } from "vitest";
import { OpenRouterAgentProvider } from "../../app/server/agents/openrouter-provider";

const config = { apiKey: "test-key", plannerModel: "openai/gpt-6-astra", tutorModel: "openai/gpt-6-astra",
  inputMicrosPerToken: 13, outputMicrosPerToken: 50 };
const signal = () => new AbortController().signal;
const advice = { summary: "学习路线", rationale: "先基础后应用", milestones: [
  { title: "基础", unitIds: ["unit-1"], successCriteria: "完成练习" }], unitOrder: ["unit-1"] };
const completed = (text: string) => ({ type: "response.completed", response: { id: "gen-123-abc", status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text }] }], usage: { input_tokens: 2, output_tokens: 3 } } });
const stream = (events: unknown[]) => events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("");

describe("OpenRouter learning agents", () => {
  it("uses a stateless max-reasoning planner with strict output and capped routing prices", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(stream([completed(JSON.stringify(advice))])));
    const provider = new OpenRouterAgentProvider(config, fetcher);
    expect(await provider.startPlanner("context", signal())).toEqual({ id: "gen-123-abc", status: "completed", advice,
      usage: { inputTokens: 2, outputTokens: 3 } });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/responses");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "openai/gpt-6-astra", service_tier: "default", stream: true, store: false,
      reasoning: { effort: "max" }, text: { format: { type: "json_schema", strict: true } },
      provider: { require_parameters: true, allow_fallbacks: false, max_price: { prompt: 13, completion: 50, request: 0 } } });
    expect(body).not.toHaveProperty("background");
    expect(body).not.toHaveProperty("previous_response_id");
    expect(body).not.toHaveProperty("temperature");
  });
  it("treats refusals and invalid structured output as terminal failures", async () => {
    const provider = new OpenRouterAgentProvider(config, async () => new Response(stream([completed("no answer")])));
    expect(await provider.startPlanner("context", signal())).toMatchObject({ status: "failed" });
  });
  it("completes fragmented UTF-8 streams and records usage without revealing reasoning", async () => {
    const bytes = new TextEncoder().encode(stream([
      { type: "response.reasoning_summary_text.delta", delta: "private reasoning" },
      { type: "response.output_text.delta", delta: "你好" }, completed("你好"),
    ]));
    const provider = new OpenRouterAgentProvider(config, async () => new Response(new ReadableStream({ start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close();
    } })));
    const chunks: string[] = [];
    expect(await provider.tutor("context", [], true, text => chunks.push(text), signal()))
      .toEqual({ text: "你好", usage: { inputTokens: 2, outputTokens: 3 } });
    expect(chunks).toEqual(["你好"]);
  });
  it.each(["response.incomplete", "response.failed", "error", "disconnect"])("rejects %s without treating partial text as success", async type => {
    const provider = new OpenRouterAgentProvider(config, async () => new Response(stream([
      { type: "response.output_text.delta", delta: "Hello" }, ...(type === "disconnect" ? [] : [{ type }]),
    ])));
    await expect(provider.tutor("context", [], false, vi.fn(), signal())).rejects.toThrow();
  });
  it("cancels a stalled stream when the browser disconnects", async () => {
    const cancel = vi.fn(); const abort = new AbortController();
    const provider = new OpenRouterAgentProvider(config, async () => new Response(new ReadableStream({ cancel })));
    const result = provider.startPlanner("context", abort.signal);
    await Promise.resolve(); abort.abort();
    await expect(result).rejects.toThrow();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("does not expose upstream errors or retry paid requests", async () => {
    const fetcher = vi.fn(async () => new Response("private upstream detail", { status: 429 }));
    const provider = new OpenRouterAgentProvider(config, fetcher);
    await expect(provider.startPlanner("context", signal())).rejects.toThrow("模型请求暂时未完成");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
