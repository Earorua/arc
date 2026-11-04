import { createHash } from "node:crypto";
import { readChatReceipt } from "../../../worker/document-executor/generation-receipt.ts";

function invalid() {
  throw new Error("Invalid probe metadata");
}

function record(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  return value;
}

function checkSuccess(value) {
  record(value);
  if (value.error != null || value.finish_reason === "error" || value.native_finish_reason === "error") invalid();
}

const sha256 = value => createHash("sha256").update(value).digest("hex");

function successData(kind, raw) {
  checkSuccess(raw);
  if (kind === "chat") {
    if (raw.choices != null) {
      if (!Array.isArray(raw.choices)) invalid();
      raw.choices.forEach(checkSuccess);
    }
    return raw;
  }
  if (kind !== "generation") invalid();
  const data = record(raw.data);
  checkSuccess(data);
  if (Array.isArray(data.provider_responses)) {
    const successful = data.provider_responses.filter(attempt => attempt?.status === 200);
    if (data.provider_responses.length && data.provider_responses.every(attempt => attempt?.status >= 400)) invalid();
    for (const attempt of successful.length ? successful : data.provider_responses) checkSuccess(attempt);
  }
  return data;
}

function receiptHash(data, { privateText, apiKey }) {
  const { receiptId } = readChatReceipt({ id: data.id }, privateText, apiKey);
  if (receiptId === null) return null;
  for (let i = 0; i + 8 <= receiptId.length; i++) {
    if (apiKey.includes(receiptId.slice(i, i + 8))) return null;
  }
  return sha256(receiptId);
}

/** Optional route or token fields can fail comparison while an ID and its charge remain attributable. */
export function observeProbeCharge(kind, raw, options) {
  const data = successData(kind, raw);
  const idSha256 = receiptHash(data, options);
  if (!idSha256) return null;
  const reported = kind === "chat" ? data.usage?.cost : data.total_cost;
  return { idSha256, reportedUsd: typeof reported === "number" && Number.isFinite(reported) && reported >= 0 ? reported : null };
}

function decimalKey(source) {
  if (typeof source !== "string" || source.length > 128) invalid();
  const [coefficient, exponent = "0"] = source.toLowerCase().split("e");
  const [integer, fraction = ""] = coefficient.split(".");
  const digits = (integer + fraction).replace(/^0+/u, "");
  if (!digits) return "0";
  const significant = digits.replace(/0+$/u, "");
  return significant + "e" + (BigInt(exponent) + BigInt(digits.length - significant.length - fraction.length));
}

/** The frozen replay consumes JS numbers. Only submit a quote to it if conversion preserves its wire decimal. */
export function canReplayWirePrice(kind, text) {
  const field = kind === "chat" ? "cost" : "total_cost";
  const wire = Symbol();
  const raw = JSON.parse(text, function (key, value, context) {
    if (key === field && typeof value === "number") this[wire] = context?.source;
    return value;
  });
  const holder = kind === "chat" ? raw?.usage : raw?.data;
  if (typeof holder?.[field] !== "number") return true;
  if (!Number.isFinite(holder[field]) || holder[field] < 0) return false;
  try { return decimalKey(holder[wire]) === decimalKey(String(holder[field])); }
  catch { return false; }
}

function label(approved) {
  return value => {
    if (typeof value !== "string" || value.length > 256) invalid();
    if (value === approved || value === "") return value;
    return "sha256:" + sha256(value);
  };
}

function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}

function cost(value) {
  if (!Number.isFinite(value) || value < 0) invalid();
  return value;
}

// A present null and a missing optional route label have different production audit outcomes.
function fields(source, transforms) {
  record(source);
  const result = {};
  for (const [key, transform] of Object.entries(transforms)) {
    if (Object.hasOwn(source, key)) result[key] = source[key] === null ? null : transform(source[key]);
  }
  return result;
}

/** Project one already byte-bounded JSON response in memory. The returned half can be passed directly to the local replay. */
export function projectProbeMetadata(kind, raw, options) {
  if (kind !== "chat" && kind !== "generation") invalid();
  const { model, providerName, endpointId, privateText, apiKey } = record(options);
  if (typeof privateText !== "string" || typeof apiKey !== "string" || !apiKey
    || [model, providerName, endpointId].some(value => typeof value !== "string" || !value || value.length > 256
      || value.includes(apiKey) || (privateText && value.includes(privateText)) || value.startsWith("sha256:"))) invalid();
  const data = successData(kind, raw);
  const id = receiptHash(data, { privateText, apiKey });
  if (kind === "chat") {
    return { id, ...fields(raw, { model: label(model), provider: label(providerName) }),
      usage: fields(raw.usage, {
        prompt_tokens: count, completion_tokens: count, cost,
        prompt_tokens_details: details => fields(details, { cached_tokens: count }),
        completion_tokens_details: details => fields(details, { reasoning_tokens: count }),
      }) };
  }
  return { data: { id, ...fields(data, {
    model: label(model), provider_name: label(providerName),
    provider_responses: attempts => {
      if (!Array.isArray(attempts) || attempts.length > 100) invalid();
      return attempts.map(attempt => {
        record(attempt);
        return fields(attempt, { status: count, endpoint_id: label(endpointId), provider_name: label(providerName) });
      });
    },
    native_tokens_prompt: count, native_tokens_completion: count, native_tokens_reasoning: count,
    total_cost: cost, latency: count, generation_time: count,
  }) } };
}
