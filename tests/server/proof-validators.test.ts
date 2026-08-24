import { describe, expect, it, vi } from "vitest";
import type { ProofVersion } from "../../app/contracts/proof-ledger";
import {
  deterministicValidators,
  runDeterministicValidator,
} from "../../app/server/proof/validators";

const version: ProofVersion = {
  id: "version-1", proofId: "proof-1", versionNumber: 1, schemaVersion: "2026.08.1",
  dailyUnitId: null, title: "Test report", kind: "test_report", summary: "Fresh test run",
  artifactUrl: null, assetId: "asset-1", skillIds: ["testing"], completionCriteria: [],
  visibility: "private", createdAt: "2026-08-17T00:00:00.000Z", supersedesVersionId: null,
};
const asset = {
  id: "asset-1", userId: "user-1", proofId: "proof-1", objectKey: "proof/report",
  filename: "report.json", contentType: "application/json", sizeBytes: 128,
};

describe("deterministic proof validators", () => {
  it("keeps a closed registry with only the approved test report validator", () => {
    expect(Object.keys(deterministicValidators)).toEqual(["proof.test-report.v1"]);
  });

  it("passes only a successful, non-empty arc.test-report.v1 result", async () => {
    const readJsonAsset = vi.fn().mockResolvedValue({
      schemaVersion: "arc.test-report.v1", command: "npm test", exitCode: 0, passed: 12, failed: 0,
    });
    await expect(runDeterministicValidator("proof.test-report.v1", {
      version, asset, readJsonAsset,
    })).resolves.toEqual({ outcome: "passed", reasonCodes: [] });
    expect(readJsonAsset).toHaveBeenCalledWith("proof/report");
  });

  it.each([
    [{ schemaVersion: "arc.test-report.v1", command: "", exitCode: 0, passed: 1, failed: 0 }, "test-report-invalid"],
    [{ schemaVersion: "arc.test-report.v1", command: "npm test", exitCode: 1, passed: 1, failed: 1 }, "test-report-failed"],
  ])("rejects invalid or failing reports", async (report, reason) => {
    await expect(runDeterministicValidator("proof.test-report.v1", {
      version, asset, readJsonAsset: async () => report,
    })).resolves.toEqual({ outcome: "failed", reasonCodes: [reason] });
  });

  it("returns unavailable for unknown and AI-like validator keys without reading assets", async () => {
    const readJsonAsset = vi.fn();
    await expect(runDeterministicValidator("proof.ai-review.v1", { version, asset, readJsonAsset }))
      .resolves.toEqual({ outcome: "unavailable", reasonCodes: ["validator-unavailable"] });
    expect(readJsonAsset).not.toHaveBeenCalled();
  });

  it("requires a JSON test-report asset", async () => {
    await expect(runDeterministicValidator("proof.test-report.v1", {
      version: { ...version, kind: "document" }, asset, readJsonAsset: async () => ({}),
    })).resolves.toEqual({ outcome: "failed", reasonCodes: ["test-report-json-required"] });
  });
});
