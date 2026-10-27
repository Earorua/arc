// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ensureWorkflow } from "../../worker/research-executor/bootstrap";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const PRIVATE = "PRIVATE_ROLE_OR_PROVIDER_ERROR_MUST_NOT_BE_LOGGED";

function fixture() {
  let now = 0;
  const job = { jobId: JOB_ID, role: PRIVATE };
  const stored = { job, requestHash: "a".repeat(64), workflowAcceptedAt: null };
  const jobs = { accept: vi.fn(async () => { now += 50; return stored; }),
    recordWorkflowAccepted: vi.fn(async () => { now += 10; return { ...stored, workflowAcceptedAt: 1234 }; }) };
  const workflow = { create: vi.fn(async () => { now += 80; return { id: JOB_ID }; }),
    get: vi.fn(async () => ({ id: JOB_ID, status: async () => ({ status: "running" }) })) };
  const site = { accepted: vi.fn(async () => { now += 20; }) };
  const records: Record<string, unknown>[] = [];
  const controller = new AbortController();
  const deps = { jobs, workflow, site, wallNow: () => 1234, monoNow: () => now,
    signal: controller.signal, onDiagnostic: (record: Record<string, unknown>) => { records.push(record); } };
  const run = () => ensureWorkflow(job as never, deps as never);
  return { jobs, workflow, site, records, controller, deps, run, tick: (ms: number) => { now += ms; } };
}

describe("bounded Workflow bootstrap diagnostics", () => {
  it("identifies the await that outlives the deadline without starting later side effects", async () => {
    const f = fixture();
    f.jobs.accept.mockImplementationOnce(async () => {
      f.tick(5001);
      f.controller.abort();
      return { job: { jobId: JOB_ID, role: PRIVATE }, requestHash: "a".repeat(64), workflowAcceptedAt: null };
    });
    Object.assign(f.deps, { guard: () => { if (f.controller.signal.aborted) throw new Error(PRIVATE); } });
    await expect(f.run()).rejects.toThrow(PRIVATE);
    expect(f.workflow.create).not.toHaveBeenCalled();
    expect(f.site.accepted).not.toHaveBeenCalled();
    expect(f.records).toEqual([
      { event: "arc.research.workflow-start", phase: "job-accept", state: "started", elapsedMs: 0, aborted: false },
      { event: "arc.research.workflow-start", phase: "job-accept", state: "failed", elapsedMs: 5001, aborted: true },
    ]);
  });

  it("separates create failure from successful same-instance recovery without recording payloads or errors", async () => {
    const f = fixture();
    f.workflow.create.mockRejectedValueOnce(new Error(PRIVATE));
    await expect(f.run()).resolves.toMatchObject({ jobId: JOB_ID, workflowAcceptedAt: 1234 });
    expect(f.workflow.get).toHaveBeenCalledExactlyOnceWith(JOB_ID);
    expect(f.records.map(({ phase, state }) => `${phase}:${state}`)).toEqual([
      "job-accept:started", "job-accept:succeeded", "workflow-create:started", "workflow-create:failed",
      "workflow-get:started", "workflow-get:succeeded", "workflow-status:started", "workflow-status:succeeded",
      "record-accepted:started", "record-accepted:succeeded", "site-accepted:started", "site-accepted:succeeded",
    ]);
    for (const record of f.records) expect(Object.keys(record).sort()).toEqual(["aborted", "elapsedMs", "event", "phase", "state"]);
    expect(JSON.stringify(f.records)).not.toContain(PRIVATE);
    expect(JSON.stringify(f.records)).not.toContain(JOB_ID);
  });

  it("distinguishes Site acknowledgement failure and keeps exactly one Workflow create", async () => {
    const f = fixture();
    f.site.accepted.mockRejectedValueOnce(new Error(PRIVATE));
    await expect(f.run()).rejects.toThrow(PRIVATE);
    expect(f.workflow.create).toHaveBeenCalledOnce();
    expect(f.workflow.get).not.toHaveBeenCalled();
    expect(f.records.at(-1)).toMatchObject({ phase: "site-accepted", state: "failed", aborted: false });
  });

  it("does not change acceptance when the diagnostic sink throws", async () => {
    const f = fixture();
    f.deps.onDiagnostic = () => { throw new Error("log sink unavailable"); };
    await expect(f.run()).resolves.toMatchObject({ jobId: JOB_ID, workflowAcceptedAt: 1234 });
    expect(f.workflow.create).toHaveBeenCalledOnce();
    expect(f.site.accepted).toHaveBeenCalledOnce();
  });
});
