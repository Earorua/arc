/** Local-only Phase 0 harness. No real provider, production routes or deployment configuration. */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { DocumentAnalysisProvider, DocumentProviderInput, DocumentProviderOutcome } from "../../../app/server/documents/provider";
import { mayActivateResult, mayDispatch, settleProviderOutcome, type DocumentJobState, type DispatchState } from "../../../worker/document-executor/job-state";
import { DOCUMENT_PAID_STEP_CONFIG, parseDocumentWorkflowArgs, parseDocumentWorkflowOutput,
  type DocumentWorkflowArgs, type DocumentWorkflowOutput } from "../../../worker/document-executor/workflow-policy";

type Environment = { PROBE_DB: D1Database; DOCUMENT_WORKFLOW: Workflow<DocumentWorkflowArgs>; RUNTIME_EPOCH: string };
type Job = {
  job_id: string; owner_id: string; state: DocumentJobState; dispatch: DispatchState; accounting: string;
  revision: number; dispatch_revision: number | null; generation: number; document_generation: number;
  consent_valid: number; slot_owned: number; mode: string; sends: number; active: number; cleanup: number;
  gate_open: number; delivery_attempts: number; execution_epoch: string | null; text: string;
};

async function job(env: Environment, id: string): Promise<Job> {
  const row = await env.PROBE_DB.prepare("SELECT * FROM probe_jobs WHERE job_id=?").bind(id).first<Job>();
  if (!row) throw new Error("Document workflow unavailable");
  return row;
}
function reference(id: string, state: DocumentWorkflowOutput["state"], resultRef: string | null = null) {
  return parseDocumentWorkflowOutput({ jobId: id, state, resultRef });
}
async function history(env: Environment, kind: string, id: string, value: unknown) {
  await env.PROBE_DB.prepare("INSERT INTO probe_history(kind,job_id,value) VALUES(?,?,?)")
    .bind(kind, id, JSON.stringify(value)).run();
}
async function pump(env: Environment, owner: string) {
  const next = await env.PROBE_DB.prepare(`UPDATE probe_jobs SET slot_owned=1
    WHERE job_id=(SELECT job_id FROM probe_jobs WHERE owner_id=? AND state='queued' AND dispatch='not-sent'
      AND consent_valid=1 AND generation=document_generation AND accounting='reserved' AND slot_owned=0
      AND queue_expires_at>? ORDER BY created_at,job_id LIMIT 1)
    AND NOT EXISTS(SELECT 1 FROM probe_jobs WHERE owner_id=? AND slot_owned=1)
    RETURNING job_id`).bind(owner, Date.now(), owner).first<{ job_id: string }>();
  if (next) await env.DOCUMENT_WORKFLOW.create({ id: next.job_id, params: { jobId: next.job_id, contractVersion: "2026.11.1" } });
}
async function markUnknown(env: Environment, id: string) {
  await env.PROBE_DB.prepare(`UPDATE probe_jobs SET
    state=CASE WHEN state='running' THEN 'cost-unknown' ELSE state END, accounting='held-unknown'
    WHERE job_id=? AND dispatch='may-have-sent' AND NOT EXISTS(SELECT 1 FROM probe_receipts WHERE job_id=?)`)
    .bind(id, id).run();
}

/** Every fake send effect is committed in D1, so runtime restart cannot reset the counter. */
class FakeDocumentProvider implements DocumentAnalysisProvider {
  constructor(private env: Environment, private id: string) {}
  async analyze(input: DocumentProviderInput, signal: AbortSignal): Promise<DocumentProviderOutcome> {
    const row = await job(this.env, this.id);
    if (row.mode === "not-sent" || signal.aborted) return { kind: "not-sent", code: "aborted-before-send" };
    await this.env.PROBE_DB.prepare("UPDATE probe_jobs SET sends=sends+1 WHERE job_id=?").bind(this.id).run();
    if (row.mode === "throw-after-send") throw new Error(input.text);
    if (row.mode === "unknown") return { kind: "unknown", code: "connection-lost" };
    if (row.mode === "delayed" || row.mode === "crash-window") {
      while (!(await job(this.env, this.id)).gate_open) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    return { kind: "received", candidate: row.mode === "malformed" ? { invalid: input.text } : { items: [{ text: input.text }] },
      inputTokens: 12, outputTokens: 8, actualMicroUsd: row.mode === "missing-cost" ? null : 7,
      receiptId: row.mode === "missing-cost" ? null : `provider-${this.id}` };
  }
}

async function execute(env: Environment, id: string): Promise<Readonly<DocumentWorkflowOutput>> {
  let row = await job(env, id);
  const existing = await env.PROBE_DB.prepare("SELECT receipt_id FROM probe_receipts WHERE job_id=?")
    .bind(id).first<{ receipt_id: string }>();
  if (existing) return reference(id, "delivery-pending", existing.receipt_id);
  if (row.dispatch !== "not-sent") {
    if (row.execution_epoch !== env.RUNTIME_EPOCH) await markUnknown(env, id);
    return reference(id, (await job(env, id)).state === "cost-unknown" ? "cost-unknown" : "already-claimed");
  }
  const preflight = await env.PROBE_DB.prepare(`UPDATE probe_jobs SET preflight_failures=preflight_failures+1
    WHERE job_id=? AND mode='preflight-failure' AND preflight_failures=0 RETURNING job_id`).bind(id).first();
  if (preflight) throw new Error("Document workflow unavailable");
  if (!mayDispatch({ state: row.state, dispatch: row.dispatch, consentValid: row.consent_valid === 1,
    generationMatches: row.generation === row.document_generation, budgetReserved: row.accounting === "reserved",
    executionSlotOwned: row.slot_owned === 1 })) return reference(id, row.state);
  // The conditional write is the send fence. No path can change a sent job back to queued.
  const claimed = await env.PROBE_DB.prepare(`UPDATE probe_jobs SET state='running',dispatch='may-have-sent',
    revision=revision+1,dispatch_revision=revision+1,execution_epoch=?
    WHERE job_id=? AND revision=? AND state='queued' AND dispatch='not-sent'
      AND consent_valid=1 AND generation=document_generation AND accounting='reserved' AND slot_owned=1
      AND queue_expires_at>? RETURNING job_id`).bind(env.RUNTIME_EPOCH, id, row.revision, Date.now()).first();
  if (!claimed) return reference(id, "already-claimed");
  row = await job(env, id);
  let outcome: DocumentProviderOutcome;
  try {
    outcome = await new FakeDocumentProvider(env, id).analyze({
      textVersionId: `text-${id}`, text: row.text, segments: [{ id: "segment-1", start: 0, end: row.text.length }],
      kind: id.includes("jd") ? "jd" : "resume", providerPolicyId: "fake-only", outputSchemaVersion: "2026.11.1",
    }, new AbortController().signal);
  } catch {
    await markUnknown(env, id);
    throw new Error("Document workflow unavailable");
  }
  const accounting = settleProviderOutcome(outcome);
  const nextState = outcome.kind === "unknown" ? "cost-unknown" : outcome.kind === "not-sent" ? "failed" : "running";
  const statements: D1PreparedStatement[] = [];
  if (outcome.kind === "received") statements.push(env.PROBE_DB.prepare(
    "INSERT INTO probe_receipts(job_id,receipt_id,body) VALUES(?,?,?)")
    .bind(id, `receipt-${id}`, JSON.stringify(outcome)));
  statements.push(env.PROBE_DB.prepare(`UPDATE probe_jobs SET accounting=?,dispatch=?,slot_owned=?,
    reserved_micro_usd=CASE WHEN ? THEN 0 ELSE reserved_micro_usd END,actual_micro_usd=?,
    state=CASE WHEN state='running' THEN ? ELSE state END WHERE job_id=?`)
    .bind(accounting.accounting, accounting.dispatch, accounting.releaseSlot ? 0 : 1,
      accounting.releaseSlot ? 1 : 0, outcome.kind === "received" ? outcome.actualMicroUsd : null, nextState, id));
  await env.PROBE_DB.batch(statements);
  if (accounting.releaseSlot) await pump(env, row.owner_id);
  return reference(id, nextState, outcome.kind === "received" ? `receipt-${id}` : null);
}

async function deliver(env: Environment, id: string): Promise<Readonly<DocumentWorkflowOutput>> {
  const receipt = await env.PROBE_DB.prepare("SELECT receipt_id,body FROM probe_receipts WHERE job_id=?")
    .bind(id).first<{ receipt_id: string; body: string }>();
  if (!receipt) return reference(id, (await job(env, id)).state);
  const row = await env.PROBE_DB.prepare(`UPDATE probe_jobs SET delivery_attempts=delivery_attempts+1
    WHERE job_id=? RETURNING *`).bind(id).first<Job>();
  if (!row) throw new Error("Document workflow unavailable");
  if (row.mode === "delivery-failure" && row.delivery_attempts === 1) return reference(id, "delivery-pending", receipt.receipt_id);
  const received = JSON.parse(receipt.body) as { candidate?: { items?: unknown } };
  const valid = Array.isArray(received.candidate?.items);
  const eligible = mayActivateResult({ state: row.state, revisionMatches: row.revision === row.dispatch_revision,
    generationMatches: row.generation === row.document_generation, consentValid: row.consent_valid === 1 });
  // Test-only rendezvous: invalidate through a separate request after the eligibility read.
  if (row.mode === "activation-race") {
    await env.PROBE_DB.prepare("UPDATE probe_jobs SET activation_read=1 WHERE job_id=?").bind(id).run();
    while (!(await job(env, id)).gate_open) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  let activated = false;
  if (valid && eligible) {
    // Repeat the eligibility check at the write, closing the read/activation race.
    activated = Boolean(await env.PROBE_DB.prepare(`UPDATE probe_jobs SET active=1,state='succeeded'
      WHERE job_id=? AND revision=? AND revision=dispatch_revision AND generation=document_generation
      AND consent_valid=1 AND state IN ('running','succeeded') RETURNING job_id`).bind(id, row.revision).first());
  }
  if (!activated) {
    await env.PROBE_DB.prepare(`UPDATE probe_jobs SET cleanup=1,
      state=CASE WHEN state='running' THEN 'failed' WHEN state='cancel-requested' THEN 'cancelled' ELSE state END
      WHERE job_id=?`).bind(id).run();
  }
  return reference(id, (await job(env, id)).state, receipt.receipt_id);
}

export class DocumentProbeWorkflow extends WorkflowEntrypoint<Environment, DocumentWorkflowArgs> {
  async run(event: Readonly<WorkflowEvent<DocumentWorkflowArgs>>, step: WorkflowStep) {
    let id: string | undefined;
    try {
      const args = parseDocumentWorkflowArgs(event.payload);
      id = args.jobId;
      await history(this.env, "args", id, args);
      const paid = await step.do("single-provider-attempt", DOCUMENT_PAID_STEP_CONFIG, async () => {
        const result = await execute(this.env, args.jobId);
        await history(this.env, "step-output", args.jobId, result);
        return result;
      });
      // Cloudflare may attach a native RPC disposer; project only the three primitive fields.
      const result = parseDocumentWorkflowOutput({ jobId: paid.jobId, state: paid.state, resultRef: paid.resultRef });
      if (result.resultRef === null) return result;
      return await step.do("receipt-delivery-only", DOCUMENT_PAID_STEP_CONFIG, async () => {
        const output = await deliver(this.env, args.jobId);
        await history(this.env, "step-output", args.jobId, output);
        return output;
      });
    } catch {
      if (id) await history(this.env, "error", id, { code: "Document workflow unavailable" });
      throw new Error("Document workflow unavailable");
    }
  }
}

const documentProbe = {
  async fetch(request: Request, env: Environment): Promise<Response> {
    try {
      const body = await request.json() as Record<string, unknown>;
      const path = new URL(request.url).pathname;
      if (path === "/enqueue") {
        const { jobId } = parseDocumentWorkflowArgs({ jobId: body.id, contractVersion: "2026.11.1" });
        const prior = await env.PROBE_DB.prepare("SELECT job_id FROM probe_jobs WHERE job_id=?").bind(jobId).first();
        if (prior) return Response.json({ jobId });
        const now = Date.now();
        const result = await env.PROBE_DB.prepare(`INSERT INTO probe_jobs(job_id,owner_id,mode,text,created_at,queue_expires_at,slot_owned)
          SELECT ?,?,?,?,?,?,CASE WHEN EXISTS(SELECT 1 FROM probe_jobs WHERE owner_id=? AND slot_owned=1) THEN 0 ELSE 1 END
          WHERE (SELECT count(*) FROM probe_jobs WHERE owner_id=? AND state='queued' AND slot_owned=0)<5
          RETURNING job_id`).bind(jobId, body.owner, body.mode, body.text, now, now + 1_800_000, body.owner, body.owner).first();
        return result ? Response.json({ jobId }) : Response.json({ error: "queue-full" }, { status: 409 });
      }
      if (path === "/create" || path === "/status") {
        const args = parseDocumentWorkflowArgs({ jobId: body.jobId, contractVersion: "2026.11.1" });
        const id = typeof body.id === "string" ? body.id : args.jobId;
        if (path === "/create") {
          try { await env.DOCUMENT_WORKFLOW.create({ id, params: args }); }
          catch { /* A duplicate create is resolved by the existing durable instance below. */ }
        }
        return Response.json(await (await env.DOCUMENT_WORKFLOW.get(id)).status());
      }
      if (path === "/invalidate") {
        const state = body.action === "revoke" ? "revoked" : body.action === "revision" ? "running" : "cancel-requested";
        await env.PROBE_DB.prepare(`UPDATE probe_jobs SET revision=revision+1,state=?,
          document_generation=document_generation+?,consent_valid=CASE WHEN ?='revoke' THEN 0 ELSE consent_valid END,
          accounting=CASE WHEN dispatch='not-sent' THEN 'released' ELSE accounting END,
          reserved_micro_usd=CASE WHEN dispatch='not-sent' THEN 0 ELSE reserved_micro_usd END,
          slot_owned=CASE WHEN dispatch='not-sent' THEN 0 ELSE slot_owned END WHERE job_id=?`)
          .bind(state, body.action === "delete" ? 1 : 0, body.action, body.id).run();
        const row = await job(env, body.id as string);
        await pump(env, row.owner_id);
        return Response.json({ ok: true });
      }
      if (path === "/sweep") {
        await env.PROBE_DB.prepare(`UPDATE probe_jobs SET state='cancelled',accounting='released',slot_owned=0,reserved_micro_usd=0
          WHERE state='queued' AND dispatch='not-sent' AND queue_expires_at<=?`).bind(body.now).run();
        return Response.json({ ok: true });
      }
      return new Response("not found", { status: 404 });
    } catch {
      return Response.json({ error: "Document workflow unavailable" }, { status: 400 });
    }
  },
};
export default documentProbe;
