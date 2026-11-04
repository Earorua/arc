// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDocumentWorkflowFixture, PRIVATE_SENTINEL, type DocumentWorkflowFixture } from "../helpers/document-workflow-fixture";

describe("document fake-provider persistent Miniflare Workflows probe", () => {
  let f: DocumentWorkflowFixture;
  beforeAll(async () => { f = await createDocumentWorkflowFixture(); }, 30_000);
  afterAll(async () => { await f?.dispose(); }, 30_000);

  it("deduplicates job admission, same Workflow and competing execution IDs with one durable send", async () => {
    await Promise.all(Array.from({ length: 8 }, () => f.enqueue("duplicate", "owner-duplicate")));
    await Promise.all([f.start("duplicate"), f.start("duplicate", "duplicate-racer")]);
    await f.terminal("duplicate");
    await f.terminal("duplicate-racer");
    await f.start("duplicate");
    expect(await f.row("duplicate")).toMatchObject({ sends: 1, active: 1, accounting: "settled", state: "succeeded" });
    expect(await f.countJobs("duplicate")).toBe(1);
    expect(await f.receiptCount("duplicate")).toBe(1);
  }, 30_000);

  it("runs one owner serially and advances JD to resume without a browser", async () => {
    await f.enqueue("serial-jd", "owner-serial", "delayed");
    await f.enqueue("serial-resume", "owner-serial");
    await f.start("serial-jd");
    await f.waitFor("serial-jd", row => row.sends === 1);
    expect(await f.row("serial-resume")).toMatchObject({ sends: 0, state: "queued", slot_owned: 0 });
    await f.release("serial-jd");
    await f.waitFor("serial-resume", row => row.state === "succeeded");
    expect(await f.row("serial-jd")).toMatchObject({ sends: 1, state: "succeeded", slot_owned: 0 });
    expect(await f.row("serial-resume")).toMatchObject({ sends: 1, active: 1 });
  }, 30_000);

  it("retains an unknown-cost slot, admits only five waiting jobs and expires only unsent reservations", async () => {
    await f.enqueue("unknown", "owner-unknown", "unknown");
    await f.start("unknown");
    await f.terminal("unknown");
    for (let i = 0; i < 5; i++) await f.enqueue(`waiting-${i}`, "owner-unknown");
    await expect(f.enqueue("waiting-overflow", "owner-unknown")).rejects.toThrow("queue-full");
    await f.sweep(Date.now() + 86_400_000);
    expect(await f.row("unknown")).toMatchObject({ sends: 1, state: "cost-unknown", accounting: "held-unknown", slot_owned: 1, reserved_micro_usd: 100 });
    for (let i = 0; i < 5; i++) expect(await f.row(`waiting-${i}`)).toMatchObject({ sends: 0, accounting: "released", state: "cancelled", reserved_micro_usd: 0 });
  }, 30_000);

  it("records a zero-retry paid-step failure and never exposes private errors in status", async () => {
    await f.enqueue("paid-failure", "owner-failure", "throw-after-send");
    await f.start("paid-failure");
    const status = await f.terminal("paid-failure");
    expect(status.status).toBe("errored");
    await new Promise(resolve => setTimeout(resolve, 1_250));
    expect(await f.row("paid-failure")).toMatchObject({ sends: 1, state: "cost-unknown", accounting: "held-unknown" });
    expect(JSON.stringify(await f.status("paid-failure"))).not.toContain(PRIVATE_SENTINEL);
    expect(JSON.stringify(status.error)).toContain("Document workflow unavailable");
  }, 30_000);

  it("recovers a durable receipt after delivery failure without resending", async () => {
    await f.enqueue("delivery", "owner-delivery", "delivery-failure");
    await f.start("delivery");
    expect((await f.terminal("delivery")).output).toMatchObject({ state: "delivery-pending" });
    expect(await f.row("delivery")).toMatchObject({ sends: 1, active: 0, delivery_attempts: 1 });
    await f.restart();
    await f.start("delivery", "delivery-recovery");
    expect((await f.terminal("delivery-recovery")).output).toMatchObject({ state: "succeeded", resultRef: "receipt-delivery" });
    expect(await f.row("delivery")).toMatchObject({ sends: 1, active: 1, delivery_attempts: 2 });
    expect(await f.receiptCount("delivery")).toBe(1);
  }, 40_000);

  it.each(["cancel", "delete", "revoke", "revision"] as const)("rejects late result activation after %s", async action => {
    const id = `late-${action}`;
    await f.enqueue(id, `owner-${id}`, "delayed");
    await f.start(id);
    await f.waitFor(id, row => row.sends === 1);
    await f.invalidate(id, action);
    await f.release(id);
    await f.terminal(id);
    expect(await f.row(id)).toMatchObject({ sends: 1, active: 0, cleanup: 1, accounting: "settled", slot_owned: 0 });
  }, 30_000);

  it.each(["cancel", "delete", "revoke", "revision"] as const)("queues cleanup when %s wins after the activation eligibility read", async action => {
    const id = `activation-race-${action}`;
    await f.enqueue(id, `owner-${id}`, "activation-race");
    await f.start(id);
    await f.waitFor(id, row => row.activation_read === 1);
    expect(await f.row(id)).toMatchObject({ state: "running", active: 0, cleanup: 0, sends: 1 });
    await f.invalidate(id, action);
    await f.release(id);
    expect((await f.terminal(id)).status).toBe("complete");
    expect(await f.row(id)).toMatchObject({ sends: 1, active: 0, cleanup: 1,
      accounting: "settled", actual_micro_usd: 7, reserved_micro_usd: 0, slot_owned: 0 });
    expect(await f.receiptCount(id)).toBe(1);
  }, 30_000);

  it("restarts after the durable send effect and conservatively reconciles without resending", async () => {
    await f.enqueue("restart-persisted", "owner-persisted");
    await f.start("restart-persisted");
    await f.terminal("restart-persisted");
    await f.enqueue("crash-window", "owner-crash", "crash-window");
    await f.start("crash-window");
    await f.waitFor("crash-window", row => row.sends === 1);
    await f.restart();
    await f.start("crash-window", "crash-recovery");
    await f.terminal("crash-recovery");
    expect(await f.row("crash-window")).toMatchObject({ sends: 1, state: "cost-unknown", accounting: "held-unknown", slot_owned: 1, active: 0 });
    expect(await f.receiptCount("crash-window")).toBe(0);
    expect(await f.row("restart-persisted")).toMatchObject({ sends: 1, active: 1 });
  }, 40_000);

  it("keeps successful candidates with missing cost held, rejects malformed candidates, and releases definitely unsent failures", async () => {
    for (const mode of ["missing-cost", "malformed", "not-sent"] as const) {
      await f.enqueue(mode, `owner-${mode}`, mode);
      await f.start(mode);
      await f.terminal(mode);
    }
    expect(await f.row("missing-cost")).toMatchObject({ active: 1, accounting: "held-unknown", slot_owned: 1, reserved_micro_usd: 100, actual_micro_usd: null });
    expect(await f.row("malformed")).toMatchObject({ active: 0, state: "failed", accounting: "settled", reserved_micro_usd: 0, actual_micro_usd: 7 });
    expect(await f.row("not-sent")).toMatchObject({ sends: 0, dispatch: "not-sent", accounting: "released", slot_owned: 0, reserved_micro_usd: 0 });
  }, 30_000);

  it("retries a pre-send infrastructure failure only with renewed eligibility checks", async () => {
    await f.enqueue("preflight", "owner-preflight", "preflight-failure");
    await f.start("preflight");
    expect((await f.terminal("preflight")).status).toBe("errored");
    expect(await f.row("preflight")).toMatchObject({ sends: 0, dispatch: "not-sent", accounting: "reserved" });
    await f.invalidate("preflight", "revoke");
    await f.start("preflight", "preflight-retry");
    await f.terminal("preflight-retry");
    expect(await f.row("preflight")).toMatchObject({ sends: 0, active: 0, accounting: "released" });
  }, 30_000);

  it("permits an eligible pre-send retry while a cancelled waiting task releases its reservation", async () => {
    await f.enqueue("preflight-valid", "owner-preflight-valid", "preflight-failure");
    await f.enqueue("cancel-waiting", "owner-preflight-valid");
    await f.invalidate("cancel-waiting", "cancel");
    expect(await f.row("cancel-waiting")).toMatchObject({ sends: 0, accounting: "released", reserved_micro_usd: 0 });
    await f.start("preflight-valid");
    expect((await f.terminal("preflight-valid")).status).toBe("errored");
    await f.start("preflight-valid", "preflight-valid-retry");
    expect((await f.terminal("preflight-valid-retry")).status).toBe("complete");
    expect(await f.row("preflight-valid")).toMatchObject({ sends: 1, active: 1, accounting: "settled" });
  }, 30_000);

  it("persists only bounded reference arguments/step outputs and sanitized errors in workflow history", async () => {
    const evidence = await f.workflowEvidence();
    expect(evidence.argumentCount).toBeGreaterThan(0);
    expect(evidence.stepOutputCount).toBeGreaterThan(0);
    expect(evidence.persistedArguments).toBeGreaterThan(0);
    expect(evidence.persistedStepOutputs).toBeGreaterThan(0);
    expect(evidence.runtimeRestarts).toBe(2);
    expect(evidence.maxReferenceBytes).toBeLessThanOrEqual(4096);
    expect(evidence.privateMatches).toBe(0);
    expect(evidence.unexpectedNetworkRequests).toBe(0);
    process.stdout.write(`DOCUMENT_WORKFLOW_PROBE_EVIDENCE ${JSON.stringify(evidence)}\n`);
  }, 30_000);
});
