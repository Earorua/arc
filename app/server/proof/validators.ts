import { z } from "zod";
import type { ProofVersion } from "../../contracts/proof-ledger";
import type { ProofAssetMetadata } from "./repository";

const testReportSchema = z.object({
  schemaVersion: z.literal("arc.test-report.v1"),
  command: z.string().trim().min(1).max(500),
  exitCode: z.number().int(),
  passed: z.number().int().min(0),
  failed: z.number().int().min(0),
}).strict();

export type DeterministicValidatorResult = Readonly<{
  outcome: "passed" | "failed" | "unavailable";
  reasonCodes: string[];
}>;

export type DeterministicValidatorContext = Readonly<{
  version: ProofVersion;
  asset: ProofAssetMetadata | null;
  readJsonAsset: (objectKey: string) => Promise<unknown>;
}>;

export type DeterministicValidator = (
  context: DeterministicValidatorContext,
) => Promise<DeterministicValidatorResult>;

export const deterministicValidators: Readonly<Record<string, DeterministicValidator>> = Object.freeze({
  "proof.test-report.v1": async ({ version, asset, readJsonAsset }) => {
    if (version.kind !== "test_report" || !asset || asset.contentType !== "application/json") {
      return { outcome: "failed", reasonCodes: ["test-report-json-required"] };
    }
    let raw: unknown;
    try { raw = await readJsonAsset(asset.objectKey); }
    catch { return { outcome: "unavailable", reasonCodes: ["asset-unavailable"] }; }
    const report = testReportSchema.safeParse(raw);
    if (!report.success) return { outcome: "failed", reasonCodes: ["test-report-invalid"] };
    return report.data.exitCode === 0 && report.data.passed > 0 && report.data.failed === 0
      ? { outcome: "passed", reasonCodes: [] }
      : { outcome: "failed", reasonCodes: ["test-report-failed"] };
  },
});

export async function runDeterministicValidator(
  key: string,
  context: DeterministicValidatorContext,
): Promise<DeterministicValidatorResult> {
  const validator = deterministicValidators[key];
  return validator
    ? validator(context)
    : { outcome: "unavailable", reasonCodes: ["validator-unavailable"] };
}
