// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import review from "../../docs/verification/materials-gate-1b-b1/b2-settings.review.json";
import pair from "../../docs/verification/materials-gate-1b-b1/2026-11-05-receipt-pair.redacted.json";
import { auditDocumentGeneration, readChatReceipt } from "../../worker/document-executor/generation-receipt";
import { documentProviderQualificationSchema, type DocumentFetch, type DocumentProviderQualification } from "../../worker/document-executor/provider-http";
import { documentAnalysisConfigurationSchema } from "../../app/server/documents/policy";
import { documentAcceptanceConfigurationDigest } from "../../worker/document-executor/acceptance-policy";

const config = documentAnalysisConfigurationSchema.parse({ ...review.config, apiKey: "offline-model-identity-fixture" });
const generationModel = "moonshotai/kimi-k3.1-pro-20261023";
const qualification = { ...review.qualification, qualified: true,
  receiptRoute: { ...review.qualification.receiptRoute, generationModel } };
const time = "2026-11-05T12:25:49.762Z";

// This is the real metadata-only pair: IDs are SHA-256, and no prompt, output or credential is present.
async function replay(receipts = pair, route: DocumentProviderQualification["receiptRoute"] = qualification.receiptRoute) {
  const q = documentProviderQualificationSchema.parse({ ...qualification, receiptRoute: route });
  const fetch = vi.fn<DocumentFetch>(async (_url, init) => {
    if (init?.method !== "GET") throw new Error("No inference in receipt replay");
    return Response.json(receipts.generation);
  });
  const audit = await auditDocumentGeneration({ config, qualification: q, fetch,
    chat: readChatReceipt(receipts.chat, "", config.apiKey), signal: new AbortController().signal,
    now: () => new Date(time), sentAt: time, returnedAt: time });
  expect(fetch).toHaveBeenCalledTimes(1);
  return audit;
}

describe("exact request and generation model identities", () => {
  it("verifies the real pair only with the explicitly pinned canonical generation model", async () => {
    expect(await replay()).toMatchObject({ status: "verified", actualModel: generationModel,
      actualProvider: "Moonshot AI", actualEndpointId: qualification.receiptRoute.endpointId,
      metadataInputTokens: 553, metadataOutputTokens: 1840, metadataMicroUsd: 19506,
      providerLatencyMs: 2379, providerGenerationMs: 62886 });
  });
  it("preserves the former model-mismatch when no mapping is configured", async () => {
    const route = { ...qualification.receiptRoute, generationModel: undefined };
    expect(await replay(pair, route)).toMatchObject({ status: "model-mismatch" });
  });
  it.each(["moonshotai/kimi-k3.1-pro-20261024", "moonshotai/kimi-k3.1-pro", "moonshotai/kimi-k3.1-pro-20261023:other"])(
    "rejects an unapproved generation version %s without normalizing its suffix", async model => {
      const changed = { ...pair, generation: { data: { ...pair.generation.data, model } } };
      expect(await replay(changed)).toMatchObject({ status: "model-mismatch", actualModel: expect.stringMatching(/^sha256:/u) });
    });
  it("still requires the chat to identify the exact requested alias", async () => {
    expect(await replay({ ...pair, chat: { ...pair.chat, model: generationModel } }))
      .toMatchObject({ status: "model-mismatch" });
  });
  it("does not admit a different endpoint with the same canonical model", async () => {
    const data = { ...pair.generation.data, provider_responses: [{ ...pair.generation.data.provider_responses[0]!, endpoint_id: "other-endpoint" }] };
    expect(await replay({ ...pair, generation: { data } })).toMatchObject({ status: "route-mismatch" });
  });
  it("binds the exact generation version into the configuration identity", async () => {
    const original = documentProviderQualificationSchema.parse(qualification);
    const changed = documentProviderQualificationSchema.parse({ ...qualification,
      receiptRoute: { ...qualification.receiptRoute, generationModel: "moonshotai/kimi-k3.1-pro-20261024" } });
    expect(await documentAcceptanceConfigurationDigest(config, original))
      .not.toBe(await documentAcceptanceConfigurationDigest(config, changed));
  });
  it.each(["", "wildcard/*", "contains a space", "https://other.invalid/model", "x".repeat(201)])(
    "rejects malformed canonical model configuration %s", generationModel => {
      expect(documentProviderQualificationSchema.safeParse({ ...qualification,
        receiptRoute: { ...qualification.receiptRoute, generationModel } }).success).toBe(false);
    });
});
