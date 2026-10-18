// @vitest-environment node
// Offline sensitivity experiment, not a claim that each cloud D1 call takes 150 ms.
import { describe, expect, it, vi } from 'vitest';
import { createResearchBridgeFixture } from '../helpers/research-bridge-fixture';

describe('completed receipt acknowledgement excludes the nested result roundtrip', () => {
  it.each([
    { perSiteD1Ms: 150, nestedResultMs: 0 },
    { perSiteD1Ms: 125, nestedResultMs: 1009 },
    { perSiteD1Ms: 150, nestedResultMs: 1009 },
    { perSiteD1Ms: 150, nestedResultMs: 1151 },
  ])('measures $perSiteD1Ms ms D1 with an unused $nestedResultMs ms result hook', async ({ perSiteD1Ms, nestedResultMs }) => {
    const f = await createResearchBridgeFixture();
    try {
      const notice = await f.notice();
      await f.siteClient.complete(f.execution.job, notice);
      const before = f.businessSnapshot(), start = f.monoNow();
      const execute = f.db.execute.bind(f.db);
      let d1Calls = 0, nestedCalls = 0;
      f.setExecutorEntry(request => {
        if (new URL(request.url).pathname.endsWith('/result')) {
          nestedCalls++;
          f.advanceMono(nestedResultMs);
        }
      });
      const spy = vi.spyOn(f.db, 'execute').mockImplementation((...args) => {
        d1Calls++;
        f.advanceMono(perSiteD1Ms);
        return execute(...args);
      });
      let result: unknown, failure: unknown;
      try { result = await f.siteClient.complete(f.execution.job, notice); }
      catch (error) { failure = error; }
      finally { spy.mockRestore(); }
      const failureKind = (failure as { kind?: string } | undefined)?.kind ?? null;
      console.log(JSON.stringify({ diagnostic: 'completed-roundtrip-sensitivity', synthetic: true,
        perSiteD1Ms, nestedResultMs, d1Calls, nestedCalls, elapsedLogicalMs: f.monoNow() - start, failureKind }));
      expect(f.businessSnapshot()).toEqual(before);
      expect(f.syntheticProviderCalls()).toBe(0);
      expect(nestedCalls).toBe(0);
      expect(failureKind).toBeNull();
      expect(f.monoNow() - start).toBeLessThan(5000);
      expect(result).toMatchObject({ accounting: 'settled' });
    } finally { f.db.close(); f.clientDb.close(); }
  });
});
