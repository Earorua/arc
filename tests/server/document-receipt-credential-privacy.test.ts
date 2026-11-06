// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import review from "../../docs/verification/materials-gate-1b-b1/b2-settings.canonical-model.review.json";
import { documentAnalysisConfigurationSchema } from "../../app/server/documents/policy";
import { documentProviderQualificationSchema, HttpDocumentAnalysisProvider, type DocumentFetch } from "../../worker/document-executor/provider-http";
import { KIMI_SOURCE_SPAN_POLICY_ID } from "../../worker/document-executor/source-span-extraction";

const key = "offline-synthetic-key-for-receipt-privacy";
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const bare = sha(key);
const hostBindingInput = "materials-b2\0" + bare;
const hostBinding = sha(hostBindingInput);
const mixedHex = (s: string) => [...s].map((c, i) => i % 2 ? c.toUpperCase() : c).join("");
const config = documentAnalysisConfigurationSchema.parse({ ...review.config, providerPolicyId: KIMI_SOURCE_SPAN_POLICY_ID, apiKey: key });
const qualification = documentProviderQualificationSchema.parse({ ...review.qualification, providerPolicyId: config.providerPolicyId, qualified: true });
const route = qualification.receiptRoute;
const input = { kind: "resume" as const, text: "Review document.", segments: [{ id: "segment", start: 0, end: 16 }],
  textVersionId: "text-one", outputSchemaVersion: "2026.11.1" as const, providerPolicyId: config.providerPolicyId };

async function run(receiptId: string, changes: Record<string, unknown> = {}) {
  const claim = vi.fn(async () => true);
  const http = vi.fn<DocumentFetch>(async (_url, init) => init?.method === "POST"
    ? Response.json({ id: receiptId, model: config.model, usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.000007 },
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ format: "source-spans-v1", items: [], reviewPoints: [] }) } }] })
    : Response.json({ data: { id: receiptId, model: route.generationModel, provider_name: route.providerName,
      provider_responses: [{ status: 200, endpoint_id: route.endpointId }],
      native_tokens_prompt: 100, native_tokens_completion: 20, total_cost: 0.000007, ...changes } }));
  const provider = new HttpDocumentAnalysisProvider(config, { qualification, fetch: http });
  const outcome = await provider.analyze(input, new AbortController().signal, undefined, claim);
  return { outcome, claim, methods: http.mock.calls.map(([, init]) => init?.method) };
}

describe("private receipt identities", () => {
  it.each([
    ["bare credential fingerprint", bare],
    ["embedded mixed-case credential fingerprint", "gen-" + mixedHex(bare) + "-suffix"],
    ["embedded mixed-case host binding", "gen-" + mixedHex(hostBinding) + "-suffix"],
    ["embedded credential", "gen-" + key + "-suffix"],
  ])("withholds a charge whose ID contains the %s before the claim or lookup", async (_case, id) => {
    const { outcome, claim, methods } = await run(id!);
    expect(methods).toEqual(["POST"]);
    expect(claim).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ kind: "received", candidate: null, receiptId: null, actualMicroUsd: null,
      audit: { status: "receipt-missing", metadataAttempts: 0 } });
    expect(JSON.stringify(outcome)).not.toContain(id);
  });

  it.each([
    ["model", { model: key }, "model-mismatch"],
    ["provider", { provider_name: hostBindingInput }, "route-mismatch"],
    ["endpoint", { provider_responses: [{ status: 200, endpoint_id: key }] }, "route-mismatch"],
  ] as const)("keeps the %s mismatch and known charge without disclosing a credential fingerprint", async (_case, changes, status) => {
    const { outcome, claim, methods } = await run("gen-payable-receipt", changes);
    expect(methods).toEqual(["POST", "GET"]);
    expect(claim).toHaveBeenCalledOnce();
    expect(outcome).toMatchObject({ candidate: null, receiptId: "gen-payable-receipt", actualMicroUsd: 7, audit: { status } });
    const recorded = JSON.stringify(outcome).toLowerCase();
    for (const sensitive of [key, bare, hostBinding]) expect(recorded).not.toContain(sensitive);
  });

  it("continues to claim and settle an unrelated opaque 64-hex receipt", async () => {
    const id = sha("unrelated fixture receipt");
    const { outcome, claim, methods } = await run(id);
    expect(methods).toEqual(["POST", "GET"]);
    expect(claim).toHaveBeenCalledWith(id, expect.anything());
    expect(outcome).toMatchObject({ receiptId: id, actualMicroUsd: 7, audit: { status: "verified", extractionRead: "parsed" } });
  });
});
