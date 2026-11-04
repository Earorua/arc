import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { projectProbeMetadata } from "./capture-probe-metadata.mjs";
import { replayRedactedPair } from "./replay-redacted-pair.mjs";

const review = JSON.parse(readFileSync(new URL("./b2-settings.review.json", import.meta.url), "utf8"));
const options = {
  model: review.config.model, ...review.qualification.receiptRoute,
  privateText: "Synthetic fixture with PRIVATE-DOCUMENT-SENTINEL",
  apiKey: "synthetic-token-519c7b1cf6",
};
const { model, providerName, endpointId } = options;
const id = "gen-07a813e299d";
const secretLabel = "UNTRUSTED-LABEL-SENTINEL";
const reasoningText = "REASONING-BODY-SENTINEL";
const sha256 = value => createHash("sha256").update(value).digest("hex");
const invalid = error => error.message === "Invalid probe metadata";

function rawPair() {
  return {
    chat: {
      id, model, provider: providerName,
      choices: [{ finish_reason: "stop", message: { content: options.privateText, reasoning: reasoningText } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0003217891, total_tokens: 120,
        prompt_tokens_details: { cached_tokens: 8, extra: options.apiKey },
        completion_tokens_details: { reasoning_tokens: 5, extra: reasoningText } },
    },
    generation: { data: {
      id, model, provider_name: providerName, model_permaslug: secretLabel, upstream_id: id,
      provider_responses: [{ status: 200, endpoint_id: endpointId, provider_name: providerName, upstream_id: options.apiKey }],
      native_tokens_prompt: 100, native_tokens_completion: 20, native_tokens_reasoning: 5, tokens_prompt: 99,
      total_cost: 0.0003217891, latency: 17, generation_time: 42, extra: options.privateText,
    } },
  };
}

function project(pair) {
  return { chat: projectProbeMetadata("chat", pair.chat, options),
    generation: projectProbeMetadata("generation", pair.generation, options) };
}

test("projects only contract metadata, exact JSON numbers and common hashed generation identity", async () => {
  const original = rawPair();
  const result = project(original);
  assert.deepEqual(result, {
    chat: { id: sha256(id), model, provider: providerName, usage: { prompt_tokens: 100, completion_tokens: 20,
      cost: 0.0003217891, prompt_tokens_details: { cached_tokens: 8 }, completion_tokens_details: { reasoning_tokens: 5 } } },
    generation: { data: { id: sha256(id), model, provider_name: providerName,
      provider_responses: [{ status: 200, endpoint_id: endpointId, provider_name: providerName }],
      native_tokens_prompt: 100, native_tokens_completion: 20, native_tokens_reasoning: 5,
      total_cost: 0.0003217891, latency: 17, generation_time: 42 } },
  });
  const serialized = JSON.stringify(result);
  for (const sensitive of [id, options.apiKey, options.privateText, secretLabel, reasoningText]) {
    assert.equal(serialized.includes(sensitive), false);
  }
  assert.deepEqual(original, rawPair());
  const replay = await replayRedactedPair(result);
  assert.equal(replay.comparison, "compatible");
  assert.equal(replay.productionAudit, "verified");
  assert.equal(replay.reportedReasoning, "matched");
});

test("distinct and invalid ids cannot become the same valid replay identity", async () => {
  const raw = rawPair();
  raw.generation.data.id = "gen-c99b7be0";
  assert.equal((await replayRedactedPair(project(raw))).productionAudit, "id-mismatch");
  for (const value of [undefined, null, 42, "", "gen-id?leak", "a".repeat(257), "fixture",
    "ref-PRIVATE-DOCUMENT-9", "gen-" + options.apiKey]) {
    for (const kind of ["chat", "generation"]) {
      const row = kind === "chat" ? raw.chat : raw.generation.data;
      if (value === undefined) delete row.id; else row.id = value;
      const result = projectProbeMetadata(kind, raw[kind], options);
      assert.equal((kind === "chat" ? result : result.data).id, null);
    }
    assert.equal((await replayRedactedPair(project(raw))).productionAudit, "receipt-missing");
  }
});

test("unapproved labels are irreversible and route mismatches including explicit optional null survive", async () => {
  const variations = [
    ["chat", raw => raw.chat, "model", "model-mismatch"],
    ["generation", raw => raw.generation.data, "model", "model-mismatch"],
    ["chat", raw => raw.chat, "provider", "route-mismatch"],
    ["generation", raw => raw.generation.data, "provider_name", "route-mismatch"],
    ["generation", raw => raw.generation.data.provider_responses[0], "provider_name", "route-mismatch"],
    ["generation", raw => raw.generation.data.provider_responses[0], "endpoint_id", "route-mismatch"],
  ];
  for (const [, getRow, key, status] of variations) {
    const raw = rawPair();
    getRow(raw)[key] = secretLabel;
    const result = project(raw);
    assert.equal(getRow(result)[key], "sha256:" + sha256(secretLabel));
    assert.equal(JSON.stringify(result).includes(secretLabel), false);
    assert.equal((await replayRedactedPair(result)).productionAudit, status);
  }
  const absent = rawPair();
  delete absent.chat.provider;
  delete absent.generation.data.provider_responses[0].provider_name;
  assert.equal((await replayRedactedPair(project(absent))).comparison, "compatible");
  for (const getRow of [raw => raw.chat, raw => raw.generation.data.provider_responses[0]]) {
    const raw = rawPair();
    const key = getRow(raw) === raw.chat ? "provider" : "provider_name";
    getRow(raw)[key] = null;
    const result = project(raw);
    assert.equal(getRow(result)[key], null);
    assert.equal((await replayRedactedPair(result)).productionAudit, "route-mismatch");
  }
});

test("retains fallback count, ordering, failed status and missing route fields", async () => {
  const raw = rawPair();
  raw.generation.data.provider_responses.unshift({ status: 503, provider_name: secretLabel, error: { message: options.privateText } });
  const result = project(raw);
  assert.deepEqual(result.generation.data.provider_responses[0], { status: 503, provider_name: "sha256:" + sha256(secretLabel) });
  assert.deepEqual(result.generation.data.provider_responses.map(row => row.status), [503, 200]);
  assert.equal((await replayRedactedPair(result)).productionAudit, "route-unverified");
  for (const attempts of [[], [{}], null]) {
    raw.generation.data.provider_responses = attempts;
    const missing = project(raw);
    assert.deepEqual(missing.generation.data.provider_responses, attempts);
    assert.equal((await replayRedactedPair(missing)).productionAudit, "route-unverified");
  }
});

test("preserves sub-micro-dollar cost differences and mismatched native billed tokens", async () => {
  const raw = rawPair();
  raw.generation.data.total_cost += 0.00000001;
  const result = await replayRedactedPair(project(raw));
  assert.equal(result.productionAudit, "verified");
  assert.equal(result.exactCostAgreement, false);
  assert.equal(result.comparison, "incompatible");
  raw.generation.data.native_tokens_completion++;
  assert.equal((await replayRedactedPair(project(raw))).productionAudit, "usage-mismatch");
});

test("retains missing, null, one-sided, mismatched and impossible reasoning evidence", async () => {
  const raw = rawPair();
  raw.generation.data.native_tokens_reasoning = 8;
  assert.equal((await replayRedactedPair(project(raw))).reportedReasoning, "inconsistent");
  raw.chat.usage.completion_tokens_details.reasoning_tokens = raw.generation.data.native_tokens_reasoning = 21;
  assert.equal((await replayRedactedPair(project(raw))).comparison, "incompatible");
  delete raw.chat.usage.completion_tokens_details;
  raw.chat.usage.prompt_tokens_details = null;
  raw.generation.data.native_tokens_reasoning = 0;
  delete raw.generation.data.latency;
  raw.generation.data.generation_time = null;
  const one = project(raw);
  assert.equal(Object.hasOwn(one.chat.usage, "completion_tokens_details"), false);
  assert.equal(one.chat.usage.prompt_tokens_details, null);
  assert.equal(Object.hasOwn(one.generation.data, "latency"), false);
  assert.equal(one.generation.data.generation_time, null);
  assert.equal((await replayRedactedPair(one)).reportedReasoning, "one-record");
  delete raw.generation.data.native_tokens_reasoning;
  assert.equal((await replayRedactedPair(project(raw))).reportedReasoning, "not-reported");
});

test("rejects bad numeric, structure and optional-label types without echoing provider data", () => {
  for (const mutate of [
    p => { p.chat.usage = null; }, p => { p.chat.usage.prompt_tokens = "100"; },
    p => { p.chat.usage.completion_tokens_details = reasoningText; },
    p => { p.chat.usage.prompt_tokens_details.cached_tokens = 1.5; },
    p => { p.chat.usage.completion_tokens_details.reasoning_tokens = -1; },
    p => { p.chat.usage.cost = Infinity; }, p => { p.generation.data.total_cost = -1; },
    p => { p.generation.data.native_tokens_reasoning = "5"; }, p => { p.generation.data.latency = 1.2; },
    p => { p.generation.data.native_tokens_prompt = Number.MAX_SAFE_INTEGER + 1; },
    p => { p.chat.provider = { details: options.apiKey }; },
    p => { p.generation.data.provider_responses[0].provider_name = false; },
    p => { p.generation.data.provider_responses = {}; }, p => { p.generation.data.provider_responses = [null]; },
    p => { p.generation.data.provider_responses = Array(101).fill({}); },
    p => { p.generation.data = []; },
  ]) {
    const raw = rawPair();
    mutate(raw);
    assert.throws(() => project(raw), invalid);
  }
  assert.throws(() => projectProbeMetadata("other", {}, options), invalid);
});

test("rejects explicit upstream errors on otherwise compatible success envelopes without storing their contents", () => {
  for (const mutate of [
    p => { p.chat.error = { message: options.apiKey }; }, p => { p.chat.choices[0].error = { details: options.privateText }; },
    p => { p.chat.choices[0].finish_reason = "error"; },
    p => { p.generation.error = options.privateText; }, p => { p.generation.data.error = options.apiKey; },
    p => { p.generation.data.provider_responses[0].error = { message: reasoningText }; },
  ]) {
    const raw = rawPair();
    mutate(raw);
    assert.throws(() => project(raw), invalid);
  }
});
