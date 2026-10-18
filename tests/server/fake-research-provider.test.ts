// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { FakeResearchProvider } from "../../app/server/research/fake-provider";
import { ResearchProviderError } from "../../app/server/research/provider";
import { validateResearchCandidate, type ResearchValidationContext } from "../../app/server/research/package-validator";

const request = { role: "Data Product Manager", locale: "en-US" } as const;
const context: ResearchValidationContext = {
  packageId: "fake-research-package", blueprintVersion: "2026.08.1", registryVersion: "2026.08.1", templateVersion: "2026.08.1",
  promptVersion: "research-prompt-v1", inputSchemaVersion: "research-input-v1", outputSchemaVersion: "research-output-v1",
  qualityVersion: "research-quality-v1", modelConfigVersion: "research-model-config-v1", observedAt: "2026-08-31", expiresAt: "2026-09-14",
};
describe("server-composed deterministic FakeResearchProvider", () => {
  it("produces a complete non-Flagship Ready package with the real validator and no network", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network allowed"));
    try {
      const provider = new FakeResearchProvider();
      const result = await provider.research(request);
      const validation = validateResearchCandidate(result.candidate, result.annotations, context);
      expect(validation.ready).toBe(true);
      expect(validation.quality).toMatchObject({ skillCount: 1, sourceCount: 1, unitCount: 3 });
      if (validation.ready) expect(validation.package.blueprint.id).toBe("data-product-manager");
      expect(result.usage).toBeNull();
      expect(result.actualModel).toBe("fake/research-v1");
      expect(JSON.parse(result.content)).toEqual(result.candidate);
      expect(await provider.research(request)).toEqual(result);
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it("returns isolated clones on each call", async () => {
    const provider = new FakeResearchProvider();
    const first = await provider.research(request);
    const expected = structuredClone(first);
    first.annotations[0]!.title = "Mutated";
    if (first.candidate) first.candidate.role.name = "Mutated";
    expect(await provider.research(request)).toEqual(expected);
  });
  it("uses only server-selected needs-review mode", async () => {
    const provider = new FakeResearchProvider({ mode: "needs-review" });
    const result = await provider.research(request);
    const validation = validateResearchCandidate(result.candidate, result.annotations, context);
    expect(validation.ready).toBe(false);
    expect(validation.quality.issueCodes).toContain("missing-unit");
    expect(await provider.research(request)).toEqual(result);
    await expect(provider.research({ ...request, mode: "ready" } as typeof request)).rejects.toMatchObject({ code: "invalid-transport", charged: false });
  });
  it("uses a stable non-charged failure with no raw error", async () => {
    const provider = new FakeResearchProvider({ mode: "failed" });
    await expect(provider.research(request)).rejects.toBeInstanceOf(ResearchProviderError);
    await expect(provider.research(request)).rejects.toMatchObject({ code: "unavailable", retryable: true, charged: false, usage: null });
  });
  it("provides deterministic malformed syntax followed by an explicit mechanical repair", async () => {
    const provider = new FakeResearchProvider({ mode: "repair" });
    const first = await provider.research(request);
    expect(first.candidate).toBeNull();
    expect(() => JSON.parse(first.content)).toThrow();
    const repairRequest = { ...request, originalContent: first.content, annotations: first.annotations };
    const repaired = await provider.repair(repairRequest);
    expect(repaired.content).toBe(`${first.content}}`);
    expect(repaired.annotations).toEqual(first.annotations);
    expect(validateResearchCandidate(repaired.candidate, repaired.annotations, context).ready).toBe(true);
    expect(await provider.repair(repairRequest)).toEqual(repaired);
  });
  it("does not replace arbitrary repair input with unrelated fake facts", async () => {
    const provider = new FakeResearchProvider();
    await expect(provider.repair({ ...request, originalContent: '{"arbitrary":', annotations: [] })).rejects.toMatchObject({ code: "invalid-transport", charged: false });
  });
});
