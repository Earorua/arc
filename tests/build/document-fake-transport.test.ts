// @vitest-environment node
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMaterialsAcceptanceConfigPair } from "../../build/cloudflare-target";
import { readDocumentPolicy } from "../../app/server/documents/policy";
import { prepareDocumentText, segmentDocumentText } from "../../app/server/documents/text";
import { documentCandidateSchema } from "../../app/contracts/documents";
import { HttpDocumentAnalysisProvider } from "../../worker/document-executor/provider-http";
import { packageMaterialsWorkers } from "../../scripts/lib/package-materials-workers.mjs";
import inventory from "../fixtures/build/materials-acceptance.json";
import corpus from "../fixtures/documents/quality-corpus.json";

const endpoint = "https://synthetic.invalid/api/v1/chat/completions";
const analysis = {
  provider: "fixture", model: "moonshotai/kimi-k3.1-pro", endpoint, providerPolicyId: "fixture-policy",
  policyVersion: "2026.11.1", priceVersion: "2026.11.1", upstream: "moonshotai/mxfp4",
  receiptRoute: { providerName: "Synthetic Provider", endpointId: "synthetic-endpoint", generationModel: "moonshotai/kimi-k3.1-pro-20261023" },
  inputMicroUsdPerMillionTokens: 400000, outputMicroUsdPerMillionTokens: 1600000,
  maxJobMicroUsd: 13000, userDailyMicroUsd: 320000, globalDailyMicroUsd: 400000,
};
const pair = createMaterialsAcceptanceConfigPair({ ...inventory, mode: "synthetic", analysis, fakeTransport: "arc-materials-g1b-fixture-transport" });
const transport = pair.fakeTransport!;
const headers = { authorization: "Bearer synthetic-transport-only", "content-type": "application/json" };
let directory: string, runtime: Miniflare, outboundCalls = 0;
const receiptUrl = (id: string) => endpoint.replace("/chat/completions", "/generation?id=") + id;
const allModes = [
  ["closed", createMaterialsAcceptanceConfigPair(inventory)],
  ["live", createMaterialsAcceptanceConfigPair({ ...inventory, mode: "live", runId: "fixture-run",
    analysis: { ...analysis, endpoint: "https://openrouter.ai/api/v1/chat/completions" } })],
] as const;

async function openTransport(bindings: Record<string, string> = {}) {
  const folder = join(directory, "synthetic", "synthetic-transport");
  const manifest = JSON.parse(await readFile(join(folder, "wrangler.json"), "utf8"));
  const binding = manifest.durable_objects.bindings[0];
  const noNetwork = async () => { outboundCalls++; throw new Error("Unexpected outbound request"); };
  runtime = new Miniflare({ cf: false, durableObjectsPersist: join(directory, "storage"), workers: [
    { name: "caller", modules: true, script: "export default { fetch(request, env) { return env.TRANSPORT.fetch(request); } };",
      serviceBindings: { TRANSPORT: { name: manifest.name, entrypoint: "DocumentFakeTransport" } }, outboundService: noNetwork },
    { name: manifest.name, modules: true, modulesRoot: folder, scriptPath: join(folder, manifest.main),
      compatibilityDate: manifest.compatibility_date, bindings: { ...manifest.vars, ...bindings },
      durableObjects: { [binding.name]: { className: binding.class_name, useSQLite: true } }, outboundService: noNetwork },
  ] });
  await runtime.ready;
}

async function analyze(document: typeof corpus.documents[number], configPair = pair) {
  let chatBody = "";
  const config = readDocumentPolicy({ ...configPair.executor.vars, ARC_DOCUMENT_PROVIDER_API_KEY: "synthetic-transport-only" }).analysis!;
  const provider = new HttpDocumentAnalysisProvider(config, { qualification: JSON.parse(String(configPair.executor.vars!.ARC_DOCUMENT_PROVIDER_QUALIFICATION)),
    fetch: async (url, init) => {
      if (init?.method === "POST") chatBody = String(init.body);
      const response = await runtime.dispatchFetch(String(url), {
        method: init?.method, body: init?.method === "POST" ? chatBody : undefined,
        headers: Object.fromEntries(new Headers(init?.headers)),
      });
      return new Response(await response.arrayBuffer(), { status: response.status });
    },
  });
  const text = prepareDocumentText(document.text);
  const result = await provider.analyze({ kind: document.kind as "resume" | "jd", textVersionId: document.textVersionId, text,
    segments: segmentDocumentText(text), providerPolicyId: config.providerPolicyId, outputSchemaVersion: "2026.11.1" },
  new AbortController().signal);
  return { result, chatBody };
}

describe("packaged private synthetic transport", () => {
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "arc-materials-fake-"));
    const exports = await packageMaterialsWorkers(pair, join(directory, "synthetic"));
    expect(exports.syntheticTransportEntrypoints).toEqual(["DocumentFakeTransport", "DocumentSyntheticReceipts", "default"]);
    await openTransport();
  });
  afterAll(async () => {
    await runtime?.dispose();
    if (directory && dirname(resolve(directory)) === resolve(tmpdir()) && basename(directory).startsWith("arc-materials-fake-")) {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it.each(allModes)("excludes the synthetic service and its migration from the %s package", async (mode, config) => {
    const folder = join(directory, mode);
    const exports = await packageMaterialsWorkers(config, folder);
    expect(exports).not.toHaveProperty("syntheticTransportEntrypoints");
    expect(await readdir(folder)).toEqual(["executor"]);
    expect(await readFile(join(folder, "executor", "wrangler.json"), "utf8")).not.toMatch(/DocumentFakeTransport|DocumentSyntheticReceipts/);
  });
  it("packages only internal entrypoints, digest commitments and the zero-secret manifest", async () => {
    const folder = join(directory, "synthetic", "synthetic-transport");
    const manifest = JSON.parse(await readFile(join(folder, "wrangler.json"), "utf8"));
    expect(manifest).toEqual({ ...transport, main: "./index.mjs" });
    const code = await readFile(join(folder, manifest.main), "utf8");
    expect(code).not.toMatch(/expectedReviewPoints|DocumentTestSite|\/test\/|虚构人物林遥/);
    const defaultWorker = await runtime.getWorker(transport.name!);
    for (const path of ["/", "/chat/completions", "/test/reset", "/faults"]) {
      expect((await defaultWorker.fetch("https://private.invalid" + path)).status).toBe(404);
    }
    expect((await runtime.dispatchFetch("https://private.invalid/reset", { method: "POST", headers })).status).toBe(404);
  });
  it("uses the real executor adapter to audit both document kinds and still finds each unique receipt after restart", async () => {
    const resume = corpus.documents.find(d => d.kind === "resume")!;
    const jd = corpus.documents.find(d => d.kind === "jd")!;
    const histories = await Promise.all([resume, resume, jd].map(doc => analyze(doc)));
    const ids: string[] = [];
    for (const [index, { result }] of histories.entries()) {
      expect(result).toMatchObject({ kind: "received", actualMicroUsd: 0, audit: {
        status: "verified", actualModel: analysis.receiptRoute.generationModel, actualProvider: analysis.receiptRoute.providerName,
        actualEndpointId: analysis.receiptRoute.endpointId, metadataAttempts: 1,
      } });
      if (result.kind !== "received") throw new Error("Expected a synthetic completion");
      const candidate = (result.candidate as { items: unknown[] }).items[0];
      const fact = documentCandidateSchema.parse(candidate);
      expect((index === 2 ? jd : resume).text).toContain(fact.source.quote);
      ids.push(result.receiptId!);
    }
    expect(new Set(ids).size).toBe(ids.length);
    await runtime.dispose();
    await openTransport();
    for (const id of ids) {
      const response = await runtime.dispatchFetch(receiptUrl(id), { headers });
      expect(await response.json()).toMatchObject({ data: { id, model: analysis.receiptRoute.generationModel, total_cost: 0 } });
    }
    const unknown = [ids[0]!.replace(/-[0-9]+$/u, "-0"), ids[0]!.replace(/-[0-9]+$/u, "-9999999999"), "gen-unknown"];
    for (const id of unknown) expect((await runtime.dispatchFetch(receiptUrl(id), { headers })).status).toBe(404);
    expect(outboundCalls).toBe(0);
  });
  it("accepts each frozen synthetic digest through the application segmenter", async () => {
    for (const document of corpus.documents) {
      const { result } = await analyze(document);
      expect(result, document.id).toMatchObject({ kind: "received", actualMicroUsd: 0, audit: { status: "verified" } });
    }
    expect(outboundCalls).toBe(0);
  });
  it("rejects unapproved texts, relabelling, prompts, routes, endpoints and credentials without echoing input", async () => {
    const { chatBody } = await analyze(corpus.documents[0]!);
    const original = JSON.parse(chatBody);
    const payload = JSON.parse(original.messages[1].content);
    const messages = (body: unknown) => [original.messages[0], { role: "user", content: JSON.stringify(body) }];
    const examples = [
      { messages: messages({ ...payload, segments: [{ segmentId: "segment-1", text: "private-sentinel-example" }] }) },
      { messages: messages({ ...payload, kind: "jd" }) },
      { messages: messages({ ...payload, segments: payload.segments.map((s: object) => ({ ...s, segmentId: "arbitrary" })) }) },
      { messages: [{ role: "system", content: "private-sentinel-example" }, original.messages[1]] },
      { model: "other" }, { provider: { ...original.provider, only: ["other"] } },
      { provider: { ...original.provider, order: ["other"] } },
      { provider: { ...original.provider, allow_fallbacks: true } }, { tools: [] },
    ];
    for (const change of examples) {
      const response = await runtime.dispatchFetch(endpoint, { method: "POST", headers, body: JSON.stringify({ ...original, ...change }) });
      expect(response.status).toBe(400);
      expect(await response.text()).toBe("");
    }
    const large = await runtime.dispatchFetch(endpoint, { method: "POST", headers, body: "x".repeat(33 * 1024) });
    expect(large.status).toBe(400);
    expect(await large.text()).toBe("");
    for (const [url, credential] of [[endpoint, "unapproved"], ["https://not-approved.invalid/api/v1/chat/completions", headers.authorization]]) {
      expect((await runtime.dispatchFetch(url!, { method: "POST", headers: { ...headers, authorization: credential! }, body: chatBody })).status).toBe(404);
    }
    expect(outboundCalls).toBe(0);
  });
  it("rejects any change in an approved per-million token ceiling before issuing a receipt", async () => {
    const { chatBody } = await analyze(corpus.documents[0]!);
    const original = JSON.parse(chatBody);
    expect(original.provider.max_price).toEqual({ prompt: 0.4, completion: 1.6, request: 0 });
    for (const change of [{ prompt: 0.400001 }, { prompt: 0.399999 }, { completion: 1.600001 }, { completion: 1.599999 }]) {
      const body = { ...original, provider: { ...original.provider, max_price: { ...original.provider.max_price, ...change } } };
      const response = await runtime.dispatchFetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
      expect(response.status, JSON.stringify(change)).toBe(400);
      expect(await response.text()).toBe("");
    }
  });
  it.each([
    ["generation model", { receiptRoute: { ...analysis.receiptRoute, generationModel: "moonshotai/kimi-k3.1-pro-20261024" } }],
    ["model and endpoint", { model: "fixture-model", receiptRoute: { ...analysis.receiptRoute, endpointId: "another-fixture" } }],
    ["policy id", { providerPolicyId: "another-policy" }], ["policy version", { policyVersion: "2026.11.2" }],
    ["price version", { priceVersion: "2026.11.2" }], ["input rate", { inputMicroUsdPerMillionTokens: 400001 }],
    ["output rate", { outputMicroUsdPerMillionTokens: 1600001 }],
  ] as const)("isolates issued receipts after changing %s", async (_label, change) => {
    const { result } = await analyze(corpus.documents[0]!);
    if (result.kind !== "received" || !result.receiptId) throw new Error("Expected a synthetic receipt");
    const originalUrl = receiptUrl(result.receiptId);
    const updated = { ...analysis, ...change };
    const other = createMaterialsAcceptanceConfigPair({ ...inventory, mode: "synthetic", fakeTransport: transport.name, analysis: updated });
    await runtime.dispose();
    await openTransport(other.fakeTransport!.vars as Record<string, string>);
    try {
      expect((await runtime.dispatchFetch(originalUrl, { headers })).status).toBe(404);
      const second = await analyze(corpus.documents[0]!, other);
      expect(second.result).toMatchObject({ kind: "received", audit: { status: "verified", actualModel: updated.receiptRoute.generationModel,
        actualEndpointId: updated.receiptRoute.endpointId } });
    } finally {
      await runtime.dispose();
      await openTransport();
    }
    expect((await runtime.dispatchFetch(originalUrl + "&another=param", { headers })).status).toBe(404);
    expect((await runtime.dispatchFetch(originalUrl, { headers })).status).toBe(200);
    expect(outboundCalls).toBe(0);
  });
});
