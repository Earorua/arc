// @vitest-environment node
import { describe, expect, it } from "vitest";
import inventory from "../fixtures/build/materials-acceptance.json";
import { createCloudflareConfig, createMaterialsAcceptanceConfigPair, loadCloudflareTarget, parseMaterialsAcceptanceTarget } from "../../build/cloudflare-target";
import { readDocumentPolicy, readDocumentSitePolicy } from "../../app/server/documents/policy";
import { calculateDocumentReservation, isDocumentProviderQualified } from "../../worker/document-executor/provider-http";
import { documentProviderConfigurationDigest } from "../../app/server/documents/provider";
import { documentAcceptanceConfigurationDigest } from "../../worker/document-executor/acceptance-policy";

const target = () => structuredClone(inventory);
describe("dedicated private materials acceptance target", () => {
  it("loads only explicitly and generates both named service entrypoints and isolated resources", async () => {
    const value = await loadCloudflareTarget({ targetPath: "tests/fixtures/build/materials-acceptance.json" });
    const { site, executor } = createMaterialsAcceptanceConfigPair(value);
    expect(createCloudflareConfig(value)).toEqual(site);
    expect(site.services).toEqual([{ binding: "DOCUMENT_EXECUTOR", service: inventory.executor.workerName, entrypoint: "DocumentExecutorEntrypoint" }]);
    expect(executor.services).toEqual([{ binding: "DOCUMENT_SITE", service: inventory.site.workerName, entrypoint: "DocumentSite" }]);
    expect(executor.workers_dev).toBe(false);
    expect(site.secrets?.required).toContain("GITHUB_CLIENT_SECRET");
    expect(site.secrets?.required).not.toContain("GOOGLE_CLIENT_SECRET");
    expect(site.r2_buckets?.map(b => b.binding)).toEqual(["PROOF_ASSETS", "DOCUMENT_ASSETS"]);
    expect(executor.workflows?.[0]?.class_name).toBe("DocumentWorkflow");
    expect(site.vars?.ARC_DOCUMENT_ANALYSIS_ENABLED).toBe("false");
    for (const config of [site, executor]) {
      expect(config.triggers?.crons).toContain("*/5 * * * *");
      expect(config.secrets?.required).not.toContain("ARC_DOCUMENT_PROVIDER_API_KEY");
    }
  });
  it.each(["fe4952d0-da78-4c85-b1fa-8a5706d42fa3", "00000000-0000-4000-8000-000000000000", "eda666b8-6d49-4c3b-aa45-59eb9ff2bf74", "83a47917-a4f4-4121-baad-1032677f18a8", "12345678-1234-4123-8123-123456789abc"])("rejects a renamed protected database %s", id => {
    const x = target(); x.site.d1.id = id; expect(() => parseMaterialsAcceptanceTarget(x)).toThrow();
  });
  it("binds the same public policy and reservation on both sides, with a billing secret required only on the live executor", async () => {
    const analysis = { provider: "fixture", model: "fixture-model", endpoint: "https://openrouter.ai/api/v1/chat/completions",
      providerPolicyId: "fixture-policy", policyVersion: "2026.11.1", priceVersion: "2026.11.1", upstream: "fixture",
      receiptRoute: { providerName: "Fixture Provider", endpointId: "fixture-endpoint" }, inputMicroUsdPerMillionTokens: 400000,
      outputMicroUsdPerMillionTokens: 1600000, maxJobMicroUsd: 13000, userDailyMicroUsd: 320000, globalDailyMicroUsd: 400000 };
    const { site, executor } = createMaterialsAcceptanceConfigPair({ ...inventory, mode: "live", runId: "fixture-run", analysis });
    expect(executor.secrets?.required).toContain("ARC_DOCUMENT_PROVIDER_API_KEY");
    expect(site.secrets?.required).not.toContain("ARC_DOCUMENT_PROVIDER_API_KEY");
    expect(executor.services).toHaveLength(1);
    expect(readDocumentPolicy(executor.vars!).analysisEnabled).toBe(false);
    const publicConfig = readDocumentSitePolicy(site.vars!).analysis!, executable = readDocumentPolicy({ ...executor.vars, ARC_DOCUMENT_PROVIDER_API_KEY: "fixture-only" }).analysis!;
    const q = JSON.parse(String(site.vars!.ARC_DOCUMENT_PROVIDER_QUALIFICATION));
    expect(executor.vars!.ARC_DOCUMENT_PROVIDER_QUALIFICATION).toBe(site.vars!.ARC_DOCUMENT_PROVIDER_QUALIFICATION);
    expect(isDocumentProviderQualified(publicConfig, q)).toBe(true);
    const reserve = calculateDocumentReservation(publicConfig, q);
    expect(reserve).toBe(12954);
    expect(await documentProviderConfigurationDigest(publicConfig, reserve)).toBe(await documentProviderConfigurationDigest(executable, reserve));
    expect(await documentAcceptanceConfigurationDigest(publicConfig, q)).toBe(await documentAcceptanceConfigurationDigest(executable, q));
    expect(await documentAcceptanceConfigurationDigest(publicConfig, q)).not.toBe(await documentAcceptanceConfigurationDigest(executable,
      { ...q, receiptRoute: { ...q.receiptRoute, endpointId: "another-fixture-endpoint" } }));
    const fake = createMaterialsAcceptanceConfigPair({ ...inventory, mode: "synthetic", analysis: { ...analysis, endpoint: "https://fixture.invalid/chat/completions" }, fakeTransport: "arc-materials-g1b-fixture-transport" });
    expect(fake.executor.services).toContainEqual({ binding: "DOCUMENT_PROVIDER_TRANSPORT", service: "arc-materials-g1b-fixture-transport", entrypoint: "DocumentFakeTransport" });
    expect(fake.executor.secrets?.required).not.toContain("ARC_DOCUMENT_PROVIDER_API_KEY");
    for (const change of [{ endpoint: "https://fixture.invalid/wrong" }, { maxJobMicroUsd: 1 },
      { receiptRoute: { ...analysis.receiptRoute, endpointId: "ambiguous endpoint" } }]) {
      expect(() => createMaterialsAcceptanceConfigPair({ ...inventory, mode: "synthetic", fakeTransport: "arc-materials-g1b-fixture-transport",
        analysis: { ...analysis, endpoint: "https://fixture.invalid/chat/completions", ...change } })).toThrow("Invalid materials acceptance target");
    }
  });
  it.each([
    (x: ReturnType<typeof target>) => { x.executor.d1.id = x.site.d1.id; },
    (x: ReturnType<typeof target>) => { x.site.documents.name = x.executor.results.name; },
    (x: ReturnType<typeof target>) => { x.executor.siteEntrypoint = ""; },
    (x: ReturnType<typeof target>) => { x.site.documents.public = true; },
    (x: ReturnType<typeof target>) => { x.executor.results.name = "arc-v8-migration-research-private"; },
    (x: ReturnType<typeof target>) => { x.site.origin = "https://untrusted.invalid"; },
    (x: ReturnType<typeof target>) => { x.site.authProviders = []; },
    (x: ReturnType<typeof target>) => Object.assign(x.site, { ARC_DOCUMENT_PROVIDER_API_KEY: "forbidden" }),
    (x: ReturnType<typeof target>) => Object.defineProperty(x.executor, "__proto__", { value: {}, enumerable: true }),
    (x: ReturnType<typeof target>) => { x.mode = "live"; },
  ])("rejects an unsafe or incomplete inventory", mutate => {
    const x = target(); mutate(x); expect(() => createMaterialsAcceptanceConfigPair(x)).toThrow("Invalid materials acceptance target");
  });
});
