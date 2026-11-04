// @vitest-environment node
import { expect, it } from "vitest";
import { createDocumentExecutorFixture } from "../helpers/document-executor-fixture";

it("persists ordinary production accounting and closes both paid modes after a native Workflow interruption", async () => {
  const f = await createDocumentExecutorFixture("production-stub");
  try {
    for (const kind of ["resume","jd","supplement"] as const) {
      const id = "normal-" + kind, { jobId } = await f.enqueue(id,"ordinary-owner","success",kind);
      await f.waitFor(jobId, row => row.state === "succeeded");
      expect(await f.productionDispatch(jobId)).toMatchObject({state:"verified",actual_micro_usd:7});
      expect(await f.sends(id)).toBe(1);
    }
    const firstHealthy=await f.enqueue("busy-first","busy-owner-a","delayed");await f.waitForSend("busy-first");
    const secondHealthy=await f.enqueue("busy-second","busy-owner-b");await f.release("busy-first");
    await f.waitFor(firstHealthy.jobId,row=>row.state==="succeeded");
    await f.waitFor(secondHealthy.jobId,row=>row.state==="succeeded");expect(await f.sends("busy-second")).toBe(1);
    const revoked = await f.enqueue("before-revoke","cancel-owner","input-gated");
    await f.waitForInput("before-revoke");await f.invalidate(revoked.jobId,"revoke");await f.release("before-revoke");
    await f.waitFor(revoked.jobId,row=>row.dispatch_state==="not-sent");
    expect(await f.sends("before-revoke")).toBe(0);
    const late = await f.enqueue("after-cancel","late-owner","delayed");
    await f.waitForSend("after-cancel");await f.invalidate(late.jobId,"cancel");await f.release("after-cancel");
    await f.waitFor(late.jobId,row=>row.state==="cancelled" && row.dispatch_state==="settled");
    expect((await f.row(late.jobId)).extraction_id).toBeNull();
    expect(await f.productionDispatch(late.jobId)).toMatchObject({state:"verified",actual_micro_usd:7});
    const crash = await f.enqueue("interrupted","crash-owner","delayed");
    await f.waitForSend("interrupted");await f.restart();await f.recoverLost(crash.jobId);
    expect(await f.productionDispatch(crash.jobId)).toMatchObject({state:"pending",receipt_id:null});
    expect(await f.row(crash.jobId)).toMatchObject({state:"cost-unknown",execution_slot:1});
    await f.rotateProductionGrant();
    await expect(f.enqueue("rotated","fresh-owner")).rejects.toThrow();
    expect(await f.sends("rotated")).toBe(0);expect(await f.sends("interrupted")).toBe(1);
    await f.switchToB4();
    const cases=await f.registerRun("b4-owner"), b4=await f.enqueueCase("b4-owner",cases[0]!,"after-production-hold");
    await f.waitFor(b4.jobId,row=>row.state==="failed" && row.dispatch_state==="not-sent");
    expect(await f.sends(cases[0]!.caseId)).toBe(0);
    const evidence=await f.evidence();
    expect(evidence.persistedCells).toBeGreaterThan(0);expect(evidence.privateMatches).toBe(0);expect(evidence.outboundCalls).toBe(0);
  } finally { await f.dispose(); }
},90000);
