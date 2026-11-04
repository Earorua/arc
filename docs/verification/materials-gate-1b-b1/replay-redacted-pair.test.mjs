import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { replayRedactedPair } from "./replay-redacted-pair.mjs";

const review = JSON.parse(readFileSync(new URL("./b2-settings.review.json", import.meta.url), "utf8"));
const { model } = review.config;
const { providerName, endpointId } = review.qualification.receiptRoute;
const id = "gen-redacted-example";

function pair() {
  return {
    chat: {
      id, model, provider: providerName,
      usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0004, completion_tokens_details: { reasoning_tokens: 5 } },
    },
    generation: {
      data: {
        id, model, provider_name: providerName, provider_responses: [{ status: 200, endpoint_id: endpointId }],
        native_tokens_prompt: 100, native_tokens_completion: 20, native_tokens_reasoning: 5, total_cost: 0.0004,
        latency: 20, generation_time: 40,
      },
    },
  };
}

test("replays matching metadata with the production auditor using only the supplied local responses", async () => {
  assert.equal(review.qualification.qualified, false);
  const result = await replayRedactedPair(pair());
  assert.equal(result.comparison, "compatible");
  assert.equal(result.productionAudit, "verified");
  assert.equal(result.exactCostAgreement, true);
  assert.equal(result.reportedReasoning, "matched");
  assert.equal(result.latencyMs, 20);
  assert.equal(result.generationMs, 40);
  assert.equal(result.sourceAuthenticated, false);
  assert.equal(result.inferenceAuthorized, false);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(id));
});

test("requires both models, exactly one successful standard endpoint and the same generation identity", async () => {
  const variations = [
    [p => { p.chat.model += "-20261023"; }, "model-mismatch"],
    [p => { p.generation.data.model += "-20261023"; }, "model-mismatch"],
    [p => { p.generation.data.id = "gen-other"; }, "id-mismatch"],
    [p => { delete p.generation.data.provider_responses[0].endpoint_id; }, "route-unverified"],
    [p => { p.generation.data.provider_responses[0].endpoint_id = "private-foreign-label"; }, "route-mismatch"],
    [p => { p.generation.data.provider_responses.unshift({ status: 503 }); }, "route-unverified"],
    [p => { p.generation.data.provider_name = "private-foreign-label"; }, "route-mismatch"],
  ];
  for (const [mutate, expected] of variations) {
    const raw = pair();
    mutate(raw);
    const result = await replayRedactedPair(raw);
    assert.equal(result.productionAudit, expected);
    assert.equal(result.comparison, "incompatible");
    assert.doesNotMatch(JSON.stringify(result), /private-foreign-label/);
  }
});

test("requires matching token counts and raw costs even when micro-USD rounding hides a difference", async () => {
  const raw = pair();
  raw.generation.data.native_tokens_completion++;
  assert.equal((await replayRedactedPair(raw)).productionAudit, "usage-mismatch");
  raw.generation.data.native_tokens_completion--;
  raw.generation.data.total_cost = 0.0003999;
  const result = await replayRedactedPair(raw);
  assert.equal(result.productionAudit, "verified");
  assert.equal(result.exactCostAgreement, false);
  assert.equal(result.comparison, "incompatible");
  raw.chat.usage.cost = raw.generation.data.total_cost = 0.002;
  assert.equal((await replayRedactedPair(raw)).productionAudit, "price-bound-exceeded");
});

test("flags inconsistent reported reasoning and records the absence of optional evidence", async () => {
  const raw = pair();
  raw.generation.data.native_tokens_reasoning = 8;
  assert.equal((await replayRedactedPair(raw)).comparison, "incompatible");
  raw.chat.usage.completion_tokens_details.reasoning_tokens = raw.generation.data.native_tokens_reasoning = 21;
  assert.equal((await replayRedactedPair(raw)).reportedReasoning, "inconsistent");
  delete raw.chat.usage.completion_tokens_details;
  delete raw.generation.data.native_tokens_reasoning;
  delete raw.generation.data.latency;
  delete raw.generation.data.generation_time;
  const result = await replayRedactedPair(raw);
  assert.equal(result.reportedReasoning, "not-reported");
  assert.equal(result.latencyMs, null);
  assert.equal(result.generationMs, null);
  raw.generation.data.native_tokens_reasoning = 3;
  assert.equal((await replayRedactedPair(raw)).reportedReasoning, "one-record");
});

test("rejects nested response content or credential fields and never echoes them", async () => {
  for (const mutate of [
    p => { p.chat.choices = [{ message: { content: "private-sentinel" } }]; },
    p => { p.chat.usage.completion_tokens_details.reasoning = "private-sentinel"; },
    p => { p.generation.data.provider_responses[0].authorization = "private-sentinel"; },
  ]) {
    const raw = pair();
    mutate(raw);
    await assert.rejects(replayRedactedPair(raw), error => error.message === "Invalid redacted receipt pair");
  }
});
