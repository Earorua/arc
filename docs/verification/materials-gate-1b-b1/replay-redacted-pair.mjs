import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { auditDocumentGeneration, readChatReceipt } from "../../../worker/document-executor/generation-receipt.ts";

const expectedDraftHash = "d65903a51fd52ce85bb4e54bc769d324343a3f908c2c38699373f02297aa1834";
const expectedAuditorHash = "d0cd6b0d527c8f449738a7bb492354869bb53fce12800ef84426401b8066af18";
const reviewUrl = new URL("./b2-settings.review.json", import.meta.url);
const auditorUrl = new URL("../../../worker/document-executor/generation-receipt.ts", import.meta.url);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const number = z.number().nonnegative().nullish();
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullish();
const label = z.string().max(256).nullish();
const providerAttempt = z.strictObject({ status: count, endpoint_id: label, provider_name: label });
const receiptPair = z.strictObject({
  chat: z.strictObject({
    id: label, model: label, provider: label,
    usage: z.strictObject({
      prompt_tokens: count, completion_tokens: count, cost: number,
      completion_tokens_details: z.strictObject({ reasoning_tokens: count }).nullish(),
      prompt_tokens_details: z.strictObject({ cached_tokens: count }).nullish(),
    }),
  }),
  generation: z.strictObject({
    data: z.strictObject({
      id: label, model: label, provider_name: label, provider_responses: z.array(providerAttempt).max(100).nullish(),
      native_tokens_prompt: count, native_tokens_completion: count, native_tokens_reasoning: count,
      total_cost: number, latency: count, generation_time: count,
    }),
  }),
});

function compareReportedReasoning(usage, data) {
  const chat = usage.completion_tokens_details?.reasoning_tokens;
  const generation = data.native_tokens_reasoning;
  if ((chat != null && (usage.completion_tokens == null || chat > usage.completion_tokens))
    || (generation != null && (data.native_tokens_completion == null || generation > data.native_tokens_completion))) return "inconsistent";
  if (chat == null && generation == null) return "not-reported";
  if (chat == null || generation == null) return "one-record";
  return chat === generation ? "matched" : "inconsistent";
}

/** The injected GET returns only the given JSON. No live provider or key is constructed. */
export async function replayRedactedPair(input) {
  const parsed = receiptPair.safeParse(input);
  if (!parsed.success) throw new Error("Invalid redacted receipt pair");
  const bytes = readFileSync(reviewUrl);
  if (sha256(bytes) !== expectedDraftHash || sha256(readFileSync(auditorUrl)) !== expectedAuditorHash) {
    throw new Error("Unexpected B1 settings or auditor");
  }
  const review = JSON.parse(bytes.toString("utf8"));
  const { chat, generation } = parsed.data;
  const config = {
    ...review.config, endpoint: "https://receipt-replay.invalid/api/v1/chat/completions", apiKey: "offline-replay-placeholder",
  };
  const replayedAt = new Date();
  const audit = await auditDocumentGeneration({
    config, qualification: review.qualification, chat: readChatReceipt(chat, "", config.apiKey),
    signal: new AbortController().signal, now: () => replayedAt,
    sentAt: replayedAt.toISOString(), returnedAt: replayedAt.toISOString(),
    fetch: async (url, init) => {
      if (init?.method !== "GET" || new URL(url).origin !== "https://receipt-replay.invalid") throw new Error("Invalid replay lookup");
      return Response.json(generation);
    },
  });
  const exactCostAgreement = chat.usage.cost != null && chat.usage.cost === generation.data.total_cost;
  const reportedReasoning = compareReportedReasoning(chat.usage, generation.data);
  const compatible = audit.status === "verified" && exactCostAgreement && reportedReasoning !== "inconsistent";
  return {
    comparison: compatible ? "compatible" : "incompatible",
    reviewedSettingsSha256: expectedDraftHash,
    productionAuditorSha256: expectedAuditorHash,
    productionAudit: audit.status,
    exactCostAgreement,
    reportedReasoning,
    inputTokens: audit.metadataInputTokens,
    completionTokens: audit.metadataOutputTokens,
    metadataMicroUsd: audit.metadataMicroUsd,
    latencyMs: audit.providerLatencyMs ?? null,
    generationMs: audit.providerGenerationMs ?? null,
    sourceAuthenticated: false,
    inferenceAuthorized: false,
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const path = process.argv[2];
    if (process.argv.length !== 3 || !path) throw new Error();
    const file = statSync(path);
    const maxBytes = 256 * 1024;
    if (!file.isFile() || file.size > maxBytes) throw new Error();
    const bytes = readFileSync(path);
    if (bytes.length > maxBytes) throw new Error();
    const result = await replayRedactedPair(JSON.parse(bytes.toString("utf8")));
    process.stdout.write(JSON.stringify({ pairFileSha256: sha256(bytes), ...result }, null, 2) + "\n");
    process.exitCode = result.comparison === "compatible" ? 0 : 1;
  } catch {
    process.stderr.write("Receipt replay rejected. Check the frozen draft and supply one local, redacted JSON pair.\n");
    process.exitCode = 2;
  }
}
