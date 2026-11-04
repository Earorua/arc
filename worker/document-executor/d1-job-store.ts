import {materialIdSchema, normalizeDocumentText} from "../../app/contracts/documents";
import type {DocumentProviderInput, DocumentProviderOutcome, DocumentReceiptClaim} from "../../app/server/documents/provider";
import { documentAcceptanceCases, documentAcceptanceCorpusSha256, utf8Sha256, type DocumentAcceptanceGate } from "./acceptance-policy";
const frozenCaseHashes = JSON.stringify(documentAcceptanceCases);
const databaseClock = "CAST(unixepoch('subsec')*1000 AS INTEGER)";
export type ExecutorDocumentJob={job_id:string;state:"queued"|"running"|"delivery-pending"|"delivered"|"cost-unknown"|"closed";dispatch_state:"not-sent"|"may-have-sent"|"settled";result_ref:string|null;result_key:string|null;result_ready:number;result_upload_id:string|null;accounting_only:number;legacy_recovery_hold:number;accounting_json:string|null;cleanup_requested:number;writer_terminated:number;delivery_attempts:number;created_at:number;updated_at:number;last_attempt_at:number};
export class D1DocumentJobStore{
 constructor(readonly db:D1Database,private readonly now:()=>number=Date.now){}
 async admit(jobId:string){materialIdSchema.parse(jobId);const now=this.now();await this.db.prepare("INSERT OR IGNORE INTO document_executor_jobs(job_id,state,dispatch_state,created_at,updated_at) VALUES(?,'queued','not-sent',?,?)").bind(jobId,now,now).run();return this.get(jobId);}
 async get(jobId:string){return this.db.prepare("SELECT * FROM document_executor_jobs WHERE job_id=?").bind(jobId).first<ExecutorDocumentJob>();}
 async claim(jobId:string){return (await this.db.prepare("UPDATE document_executor_jobs SET state='running',dispatch_state='may-have-sent',updated_at=? WHERE job_id=? AND state='queued' AND dispatch_state='not-sent' AND cleanup_requested=0").bind(this.now(),jobId).run()).meta.changes===1;}
 async reserveAcceptance(jobId: string, input: DocumentProviderInput, gate: DocumentAcceptanceGate): Promise<boolean> {
   const identity = input.execution?.acceptance;
   if (!identity || identity.runId !== gate.runId || input.text !== normalizeDocumentText(input.text)) return false;
   const textSha256 = await utf8Sha256(input.text);
   const caseId = Object.keys(documentAcceptanceCases).find(id => documentAcceptanceCases[id] === textSha256);
   if (!caseId || !caseId.startsWith(input.kind + "-")) return false;
   const configSha = await gate.configurationSha256;
   if (identity.configurationSha256 !== configSha) return false;
   const now = this.now();
   const checks = await this.db.batch<{expires_at: number}>([
     this.db.prepare(`UPDATE document_acceptance_runs SET
       stopped_at=CASE WHEN ? >= expires_at OR ${databaseClock} >= expires_at OR ? < last_checked_at THEN COALESCE(stopped_at,?) ELSE stopped_at END,
       last_checked_at=MAX(last_checked_at,?) WHERE run_id=?`).bind(now, now, now, now, gate.runId),
     this.db.prepare(`INSERT INTO document_acceptance_dispatches(run_id,case_id,job_id,reserved_micro_usd,claimed_at)
       SELECT r.run_id,c.case_id,?,?,? FROM document_acceptance_runs r JOIN document_acceptance_cases c ON c.run_id=r.run_id
       WHERE r.run_id=? AND r.owner_id=? AND r.corpus_sha256=? AND r.configuration_sha256=?
       AND r.stopped_at IS NULL AND r.approved_at<=? AND r.expires_at>? AND r.approved_at<=${databaseClock} AND r.expires_at>${databaseClock}
       AND (SELECT COUNT(DISTINCT e.case_id)=r.max_requests AND COUNT(DISTINCT e.text_version_id)=r.max_requests
         AND COUNT(DISTINCT e.document_id)=r.max_requests AND COUNT(DISTINCT e.document_version_id)=r.max_requests
         FROM document_acceptance_cases e JOIN json_each(?) f ON e.case_id=f.key AND e.text_sha256=f.value WHERE e.run_id=r.run_id)
       AND c.case_id=? AND c.text_sha256=? AND c.text_version_id=? AND c.document_id=? AND c.document_version_id=? AND c.generation=?
       AND EXISTS(SELECT 1 FROM document_executor_jobs WHERE job_id=? AND state='running' AND dispatch_state='may-have-sent' AND cleanup_requested=0)
       AND NOT EXISTS(SELECT 1 FROM document_acceptance_dispatches WHERE run_id=r.run_id AND state!='verified')
       AND (SELECT COUNT(*) FROM document_acceptance_dispatches WHERE run_id=r.run_id)<r.max_requests
       AND (SELECT COALESCE(SUM(actual_micro_usd),0) FROM document_acceptance_dispatches WHERE run_id=r.run_id)+?<=r.total_budget_micro_usd
       ON CONFLICT DO NOTHING RETURNING (SELECT expires_at FROM document_acceptance_runs WHERE run_id=?) AS expires_at`)
       .bind(jobId, gate.reservationMicroUsd, now, gate.runId, identity.ownerId, documentAcceptanceCorpusSha256, configSha,
         now, now, frozenCaseHashes, caseId, textSha256, input.textVersionId, identity.documentId, identity.documentVersionId, identity.generation,
         jobId, gate.reservationMicroUsd, gate.runId),
   ]);
   // If the acknowledgement itself arrived after expiry, leave the durable reservation occupied.
   const acknowledgedAt = this.now(), expiry = checks[1]?.results[0]?.expires_at;
   return checks[1]?.meta.changes === 1 && typeof expiry === "number" && acknowledgedAt >= now && acknowledgedAt < expiry;
 }
 async stopAcceptance(runId: string) {
   await this.db.prepare("UPDATE document_acceptance_runs SET stopped_at=COALESCE(stopped_at,?) WHERE run_id=?")
     .bind(this.now(), runId).run();
 }
 async claimAcceptanceReceipt(runId: string, jobId: string, receiptId: string, observed: Parameters<DocumentReceiptClaim>[1]): Promise<boolean> {
   const {actualMicroUsd,inputTokens,outputTokens}=observed;
   const accounting: DocumentProviderOutcome = {kind:"received",candidate:null,receiptId,actualMicroUsd,inputTokens,outputTokens};
   const result = await this.db.batch([this.db.prepare(`UPDATE document_acceptance_dispatches SET receipt_id=?,actual_micro_usd=?,input_tokens=?,output_tokens=?,
     sent_at=?,returned_at=?
     WHERE run_id=? AND job_id=? AND state='pending' AND receipt_id IS NULL
     AND NOT EXISTS(SELECT 1 FROM document_acceptance_dispatches WHERE receipt_id=?)`).bind(receiptId, actualMicroUsd,
       inputTokens, outputTokens, observed.sentAt, observed.returnedAt, runId, jobId, receiptId),
     // A terminal Workflow can settle this receipt even if it died during the metadata read, before writing a result.
     this.db.prepare("UPDATE document_executor_jobs SET accounting_json=? WHERE job_id=? AND result_ref IS NULL AND changes()=1")
       .bind(JSON.stringify(accounting), jobId),
   ]);
   return result[0]?.meta.changes === 1;
 }
 async finishAcceptance(runId: string, jobId: string, outcome: DocumentProviderOutcome): Promise<boolean> {
   const receipt = outcome.kind === "received" ? outcome : null;
   const verified = receipt?.audit?.status === "verified" && receipt.actualMicroUsd !== null && receipt.receiptId !== null;
   const row = await this.db.prepare(`UPDATE document_acceptance_dispatches SET
     state=CASE WHEN ?=1 AND receipt_id=? AND ?<=reserved_micro_usd THEN 'verified' ELSE 'stopped' END,
     actual_micro_usd=?,input_tokens=?,output_tokens=?,audit_json=?,checked_at=?
     WHERE run_id=? AND job_id=? AND state='pending' RETURNING state`)
     .bind(verified ? 1 : 0, receipt?.receiptId ?? null, receipt?.actualMicroUsd ?? null, receipt?.actualMicroUsd ?? null,
       receipt?.inputTokens ?? null, receipt?.outputTokens ?? null, receipt?.audit ? JSON.stringify(receipt.audit) : null,
       this.now(), runId, jobId).first<{state: string}>();
   return row?.state === "verified";
 }
 async beginResult(jobId:string,outcome:DocumentProviderOutcome) {
   const ref=crypto.randomUUID(), key=`document-results-multipart/v1/${jobId}/${ref}`;
   const accounting=outcome.kind==="received"?{...outcome,candidate:null}:outcome;
   await this.db.prepare(`UPDATE document_executor_jobs SET result_ref=?,result_key=CASE WHEN cleanup_requested=0 THEN ? END,
     accounting_json=?,result_ready=cleanup_requested,writer_terminated=cleanup_requested,accounting_only=cleanup_requested,
     state=CASE WHEN cleanup_requested=1 THEN 'delivery-pending' ELSE state END,updated_at=?
     WHERE job_id=? AND result_ref IS NULL AND dispatch_state='may-have-sent' AND writer_terminated=0`)
     .bind(ref,key,JSON.stringify(accounting),this.now(),jobId).run();
   return this.get(jobId);
 }
 async enrollResultUpload(jobId:string,key:string,id:string) {
   const enrolled=await this.db.prepare(`UPDATE document_executor_jobs SET result_upload_id=?
     WHERE job_id=? AND result_key=? AND result_upload_id IS NULL AND writer_terminated=0 AND result_ready=0 AND cleanup_requested=0`)
     .bind(id,jobId,key).run();
   if(enrolled.meta.changes!==1) throw new Error("Result upload admission closed");
 }
 async closeResultEnrollment(jobId:string,key:string) {
   // The empty sentinel permanently wins the same CAS as enrollment when no private part was admitted.
   await this.db.prepare(`UPDATE document_executor_jobs SET result_upload_id='' WHERE job_id=? AND result_key=? AND result_upload_id IS NULL`)
     .bind(jobId,key).run();
   return this.get(jobId);
 }
 async queueTerminalAccounting(jobId:string,expectedRef:string|null) {
   // A CAS on a missing ref seals beginResult before any R2 writer exists. A legacy ref keeps its independent fence state.
   await this.db.prepare(`UPDATE document_executor_jobs SET writer_terminated=CASE WHEN result_ref IS NULL THEN 1 ELSE writer_terminated END,
     result_ref=COALESCE(result_ref,?),accounting_json=COALESCE(accounting_json,?),accounting_only=1,
     result_ready=1,state='delivery-pending',updated_at=? WHERE job_id=? AND result_ref IS ? AND result_ready=0`)
     .bind(crypto.randomUUID(),JSON.stringify({kind:"unknown",code:"connection-lost"}),this.now(),jobId,expectedRef).run();
 }
 async completeResult(jobId:string){await this.db.prepare("UPDATE document_executor_jobs SET result_ready=1,writer_terminated=1,state='delivery-pending',updated_at=? WHERE job_id=? AND result_ref IS NOT NULL AND result_ready=0").bind(this.now(),jobId).run();}
 async markDelivered(jobId:string,settled:boolean){await this.db.prepare("UPDATE document_executor_jobs SET state=?,dispatch_state=?,delivery_attempts=delivery_attempts+1,last_attempt_at=?,updated_at=? WHERE job_id=?").bind(settled?"delivered":"cost-unknown",settled?"settled":"may-have-sent",this.now(),this.now(),jobId).run();}
 async deliveryFailed(jobId:string){await this.db.prepare("UPDATE document_executor_jobs SET delivery_attempts=delivery_attempts+1,last_attempt_at=? WHERE job_id=?").bind(this.now(),jobId).run();}
 async requestCleanup(jobId:string){await this.admit(jobId);await this.db.prepare("UPDATE document_executor_jobs SET cleanup_requested=1,writer_terminated=CASE WHEN dispatch_state='not-sent' THEN 1 ELSE writer_terminated END,state=CASE WHEN dispatch_state='not-sent' THEN 'closed' ELSE state END,updated_at=? WHERE job_id=?").bind(this.now(),jobId).run();return this.get(jobId);}
 async proveWriterTerminated(jobId:string,key:string){await this.db.prepare("UPDATE document_executor_jobs SET writer_terminated=1,updated_at=? WHERE job_id=? AND result_key=? AND legacy_recovery_hold=0").bind(this.now(),jobId,key).run();}
 async clearResult(jobId:string){await this.db.prepare("UPDATE document_executor_jobs SET result_key=NULL,updated_at=? WHERE job_id=? AND writer_terminated=1").bind(this.now(),jobId).run();}
 async touch(jobId:string){await this.db.prepare("UPDATE document_executor_jobs SET last_attempt_at=? WHERE job_id=?").bind(this.now(),jobId).run();}
 async scan(limit=10){return (await this.db.prepare("SELECT * FROM document_executor_jobs WHERE state IN ('queued','running','delivery-pending') OR (cleanup_requested=1 AND result_key IS NOT NULL) ORDER BY last_attempt_at,job_id LIMIT ?").bind(Math.min(10,Math.max(1,Math.floor(limit)))).all<ExecutorDocumentJob>()).results;}
}
