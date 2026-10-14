import { describe, expect, it, vi } from "vitest";
import { OpenAIAgentProvider } from "../../app/server/agents/openai-provider";

describe("OpenAI learning agents", () => {
  it("treats completed refusals as terminal failures", async () => {
    const provider = new OpenAIAgentProvider({ apiKey: "test", plannerModel: "gpt-6-astra", tutorModel: "gpt-6-astra" },
      async () => Response.json({ id: "resp_refusal", status: "completed", output: [
        { type: "message", content: [{ type: "refusal", refusal: "no answer" }] },
      ], usage: { input_tokens: 1, output_tokens: 1 } }));
    expect(await provider.getPlanner("resp_refusal")).toMatchObject({ status: "failed" });
  });
  it("completes fragmented UTF-8 answer streams and records usage", async () => {
    const bytes = new TextEncoder().encode([
      { type: "response.output_text.delta", delta: "你好" },
      { type: "response.completed", response: { status: "completed", usage: { input_tokens: 2, output_tokens: 3 } } },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(""));
    const provider = new OpenAIAgentProvider({ apiKey: "test", plannerModel: "gpt-6-astra", tutorModel: "gpt-6-astra" },
      async () => new Response(new ReadableStream({ start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close();
      } })));
    const chunks: string[] = [];
    expect(await provider.tutor("context", [], true, text => chunks.push(text), new AbortController().signal))
      .toEqual({ text: "你好", usage: { inputTokens: 2, outputTokens: 3 } });
    expect(chunks.join("")).toBe("你好");
  });
  it("starts a persistent max-reasoning planner with a strict schema", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ id: "resp_plan", status: "queued" }));
    const provider = new OpenAIAgentProvider({ apiKey: "test-key", plannerModel: "gpt-6-astra", tutorModel: "gpt-6-astra" }, fetcher);
    expect(await provider.startPlanner("context")).toEqual({ id: "resp_plan", status: "queued" });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ model: "gpt-6-astra", service_tier: "default", background: true, store: true, reasoning: { effort: "max" },
      text: { format: { type: "json_schema", strict: true } } });
    expect(body).not.toHaveProperty("temperature");
  });
  it("streams answer text only, and rejects an incomplete response", async () => {
    const stream = [
      { type: "response.reasoning_summary_text.delta", delta: "private reasoning" },
      { type: "response.output_text.delta", delta: "Hello" },
      { type: "response.incomplete", response: { status: "incomplete" } },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join("");
    const provider = new OpenAIAgentProvider({ apiKey: "test-key", plannerModel: "gpt-6-astra", tutorModel: "gpt-6-astra" },
      async () => new Response(stream));
    const deltas: string[] = [];
    await expect(provider.tutor("context", [], false, text => deltas.push(text), new AbortController().signal)).rejects.toThrow();
    expect(deltas).toEqual(["Hello"]);
  });
  it("does not expose upstream errors or retry paid requests", async () => {
    const fetcher = vi.fn(async () => new Response("private upstream detail", { status: 429 }));
    const provider = new OpenAIAgentProvider({ apiKey: "test-key", plannerModel: "gpt-6-astra", tutorModel: "gpt-6-astra" }, fetcher);
    await expect(provider.startPlanner("context")).rejects.toThrow("模型请求暂时未完成");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
