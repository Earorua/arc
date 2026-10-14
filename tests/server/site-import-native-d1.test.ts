// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createNativeResearchCloudSmokeFixture } from "../helpers/research-cloud-smoke-fixture";

describe("Site import on native D1", () => {
  it("publishes and settles an authentic ready receipt within the native SQL depth limit", async () => {
    const buildPath = "../../scripts/build-research-executor-smoke.mjs";
    const { buildSmoke } = await import(buildPath);
    const build = await buildSmoke({ profile: "local", reportName: `t15p4-root-native-sql-${Date.now()}` });
    const harness = await createNativeResearchCloudSmokeFixture({ executor: build.executor.output, site: build.site.output });
    try {
      expect(await harness.start("long")).toMatchObject({ status: 200, body: { backgroundAccepted: true } });
      expect(await harness.waitForWorkflowTerminal("long")).toMatchObject({ status: "complete", output: { state: "recorded" } });
      await harness.invokeScheduled();
      expect(await harness.snapshot("long")).toMatchObject({
        importPhase: 5, runState: "ready", receiptHashMatched: true,
        providerCalls: 1, repairCalls: 0, outboundAttempts: 0,
        accounting: { quotaReserved: 1, quotaAccepted: 1, budgetReservations: 1,
          budgetSettled: 1, settledMicros: 1, packages: 1, audits: 1 },
      });
    } finally { await harness.dispose(); }
  }, 60_000);
});
