import {materialIdSchema, normalizeDocumentText} from "../../app/contracts/documents";
import type {DocumentProviderInput, DocumentProviderOutcome, DocumentReceiptClaim} from "../../app/server/documents/provider";
import { documentAcceptanceCases, documentAcceptanceCorpusSha256, utf8Sha256, type DocumentAcceptanceGate } from "./acceptance-policy";
import { DOCUMENT_LIMITS } from "../../app/server/documents/policy";
import type { DocumentProductionRelease } from "./production-policy";
export type PaidDocumentScope = "acceptance" | "production";
const noPaidHolds = "NOT EXISTS(SELECT 1 FROM document_paid_dispatches WHERE state!='verified') AND NOT EXISTS(SELECT 1 FROM document_paid_transport_hold)";
const frozenCaseHashes = JSON.stringify(documentAcceptanceCases);
const databaseClock = "CAST(unixepoch('subsec')*1000 AS INTEGER)";
export type ExecutorDocumentJob={job_id:string;paid_intent:string|null;state:"queued"|"running"|"delivery-pending"|"delivered"|"cost-unknown"|"closed";dispatch_state:"not-sent"|"may-have-sent"|"settled";result_ref:string|null;result_key:string|null;result_ready:number;result_upload_id:string|null;accounting_only:number;legacy_recovery_hold:number;accounting_json:string|null;cleanup_requested:number;writer_terminated:number;delivery_attempts:number;created_at:number;updated_at:number;last_attempt_at:number};
export class D1DocumentJobStore{
 constructor(readonly db:D1Database,private readonly now:()=>number=Date.now){}
 async admit(jobId:string){materialIdSchema.parse(jobId);const now=this.now();await this.db.prepare("INSERT OR IGNORE INTO document_executor_jobs(job_id,state,dispatch_state,created_at,updated_at) VALUES(?,'queued','not-sent',?,?)").bind(jobId,now,now).run();return this.get(jobId);}
 async get(jobId:string){return this.db.prepare("SELECT * FROM document_executor_jobs WHERE job_id=?").bind(jobId).first<ExecutorDocumentJob>();}
 async claim(jobId:string, paidIntent?:string|null) {
   const intent = paidIntent ? ",paid_intent=CASE WHEN paid_intent=? OR NOT EXISTS(SELECT 1 FROM document_executor_jobs WHERE paid_intent IS NOT NULL) THEN ? ELSE paid_intent END" : "";
   return (await this.db.prepare(`UPDATE document_executor_jobs SET state='running',dispatch_state='may-have-sent',updated_at=?${intent}
     WHERE job_id=? AND state='queued' AND dispatch_state='not-sent' AND cleanup_requested=0`)
     .bind(this.now(),...(paidIntent?[paidIntent,paidIntent]:[]),jobId).run()).meta.changes===1;
 }
 async productionTurn(jobId:string, release:DocumentProductionRelease) {
   const identity=await release.identity, now=this.now();
   if (!identity) return null;
   const tx=await this.db.batch<{job_id:string}>([
     this.observeGrant(release.authorization.id,identity,now),
     this.db.prepare(`UPDATE document_executor_jobs SET paid_intent=?,updated_at=? WHERE job_id=? AND state='queued' AND cleanup_requested=0
       AND dispatch_state='not-sent' AND paid_intent IS NULL AND NOT EXISTS(SELECT 1 FROM document_executor_jobs WHERE paid_intent IS NOT NULL)
       AND ${noPaidHolds}`).bind(identity,now,jobId),
     this.db.prepare(`SELECT job_id FROM document_executor_jobs WHERE job_id<>? AND paid_intent=?
       AND state IN ('queued','running') AND result_ref IS NULL AND updated_at+?>MAX(?,${databaseClock})
       AND EXISTS(SELECT 1 FROM document_executor_jobs WHERE job_id=? AND state='queued' AND cleanup_requested=0
         AND created_at+?>MAX(?,${databaseClock}))`).bind(jobId,identity,DOCUMENT_LIMITS.paidStepTimeoutMs,now,jobId,DOCUMENT_LIMITS.queueWaitMs,now),
   ]);
   return tx[2]?.results[0]?.job_id??null;
 }
 private observeGrant(id:string,identity:string,now:number) {
   return this.db.prepare(`UPDATE document_production_grants SET expired_at=CASE WHEN ?>=expires_at OR ${databaseClock}>=expires_at
     OR ${databaseClock}<last_checked_at THEN COALESCE(expired_at,?) ELSE expired_at END,
     last_checked_at=MAX(last_checked_at,${databaseClock})
     WHERE grant_id=? AND authorization_sha256=?`).bind(now,now,id,identity);
 }
 async productionReadiness(release: DocumentProductionRelease, expected: string) {
   const grant = release.authorization, now=this.now(), approved=Date.parse(grant.approvedAt), expires=Date.parse(grant.expiresAt);
   if (await release.identity!==expected) return null;
   // A probe only latches time for existing grants. A healthy, funded in-flight job may accept more queued work.
   // Once the original workflow has terminated, aged out or delivered an unknown outcome, only reconciliation may clear it.
   const tx=await this.db.batch<{active_job:string|null}>([this.observeGrant(grant.id,expected,now),
     this.db.prepare(`SELECT (SELECT job_id FROM document_executor_jobs WHERE paid_intent IS NOT NULL LIMIT 1) AS active_job
     WHERE ?<=MIN(?,${databaseClock}) AND ?>MAX(?,${databaseClock})
     AND NOT EXISTS(SELECT 1 FROM document_acceptance_runs WHERE run_id=?)
     AND NOT EXISTS(SELECT 1 FROM document_production_grants WHERE grant_id=? AND
       (authorization_sha256<>? OR expired_at IS NOT NULL))
     AND NOT EXISTS(SELECT 1 FROM document_paid_transport_hold)
     AND NOT EXISTS(SELECT 1 FROM document_acceptance_dispatches WHERE state<>'verified')
     AND NOT EXISTS(SELECT 1 FROM document_production_dispatches d WHERE d.state='stopped' OR
       (d.state='pending' AND NOT EXISTS(SELECT 1 FROM document_executor_jobs j WHERE j.job_id=d.job_id AND j.paid_intent=?)))
     AND NOT EXISTS(SELECT 1 FROM document_executor_jobs WHERE paid_intent IS NOT NULL AND (paid_intent<>? OR state NOT IN ('queued','running')
       OR result_ref IS NOT NULL OR cleanup_requested=1 OR updated_at+?<=MAX(?,${databaseClock})))
     AND (SELECT COALESCE(SUM(CASE WHEN state='verified' THEN actual_micro_usd ELSE reserved_micro_usd END),0)
       FROM document_production_dispatches WHERE grant_id=?)<=?-?`)
     .bind(approved,now,expires,now,grant.id,grant.id,expected,expected,expected,DOCUMENT_LIMITS.paidStepTimeoutMs,now,
       grant.id,grant.totalBudgetMicroUsd,release.reservationMicroUsd)]);
   return tx[1]?.results[0]??null;
 }
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
       AND EXISTS(SELECT 1 FROM document_executor_jobs WHERE job_id=? AND state='running' AND dispatch_state='may-have-sent' AND cleanup_requested=0 AND paid_intent='acceptance')
       AND ${noPaidHolds} AND NOT EXISTS(SELECT 1 FROM document_production_grants WHERE grant_id=r.run_id)
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
 async reserveProduction(jobId: string, release: DocumentProductionRelease): Promise<boolean> {
   const grant = release.authorization, identity = await release.identity, now = this.now();
   if (!identity) return false;
   const approved = Date.parse(grant.approvedAt), expires = Date.parse(grant.expiresAt);
   const tx = await this.db.batch<{expires_at:number}>([
     this.db.prepare(`INSERT INTO document_production_grants(grant_id,authorization_sha256,approved_at,expires_at,total_budget_micro_usd)
       SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM document_acceptance_runs WHERE run_id=?) ON CONFLICT DO NOTHING`)
       .bind(grant.id, identity, approved, expires, grant.totalBudgetMicroUsd, grant.id),
     this.observeGrant(grant.id,identity,now),
     this.db.prepare(`INSERT INTO document_production_dispatches(job_id,grant_id,reserved_micro_usd,claimed_at)
       SELECT ?,g.grant_id,?,? FROM document_production_grants g
       WHERE g.grant_id=? AND g.authorization_sha256=? AND g.expired_at IS NULL
       AND g.approved_at<=? AND g.expires_at>? AND g.approved_at<=${databaseClock} AND g.expires_at>${databaseClock}
       AND EXISTS(SELECT 1 FROM document_executor_jobs WHERE job_id=? AND state='running' AND dispatch_state='may-have-sent' AND cleanup_requested=0 AND paid_intent=g.authorization_sha256)
       AND ${noPaidHolds} AND NOT EXISTS(SELECT 1 FROM document_paid_dispatches WHERE job_id=?)
       AND (SELECT COALESCE(SUM(actual_micro_usd),0) FROM document_production_dispatches WHERE grant_id=g.grant_id)<=g.total_budget_micro_usd-?
       ON CONFLICT DO NOTHING RETURNING (SELECT expires_at FROM document_production_grants WHERE grant_id=?) AS expires_at`)
       .bind(jobId, release.reservationMicroUsd, now, grant.id, identity, now, now, jobId, jobId, release.reservationMicroUsd, grant.id),
   ]);
   const expiry = tx[2]?.results[0]?.expires_at, acknowledgedAt = this.now();
   return typeof expiry === "number" && acknowledgedAt >= now && acknowledgedAt < expiry;
 }
 async stopPaidTransport(scope: PaidDocumentScope, id: string) {
   if (scope === "acceptance") await this.db.prepare("UPDATE document_acceptance_runs SET stopped_at=COALESCE(stopped_at,?) WHERE run_id=?")
     .bind(this.now(),id).run();
   await this.db.prepare("INSERT OR IGNORE INTO document_paid_transport_hold VALUES(1,?)").bind(this.now()).run();
 }
 async claimPaidReceipt(scope: PaidDocumentScope, id: string, jobId: string, receiptId: string, observed: Parameters<DocumentReceiptClaim>[1]): Promise<boolean> {
   const {actualMicroUsd,inputTokens,outputTokens}=observed;
   const accounting: DocumentProviderOutcome = {kind:"received",candidate:null,receiptId,actualMicroUsd,inputTokens,outputTokens};
   const table = scope === "production" ? "document_production_dispatches" : "document_acceptance_dispatches";
   const identity = scope === "production" ? "grant_id" : "run_id";
   const result = await this.db.batch([this.db.prepare(`UPDATE ${table} SET receipt_id=?,actual_micro_usd=?,input_tokens=?,output_tokens=?,
     sent_at=?,returned_at=?
     WHERE ${identity}=? AND job_id=? AND state='pending' AND receipt_id IS NULL
     AND NOT EXISTS(SELECT 1 FROM document_paid_dispatches WHERE receipt_id=?)`).bind(receiptId, actualMicroUsd,
       inputTokens, outputTokens, observed.sentAt, observed.returnedAt, id, jobId, receiptId),
     // A terminal Workflow can settle this receipt even if it died during the metadata read, before writing a result.
     this.db.prepare("UPDATE document_executor_jobs SET accounting_json=? WHERE job_id=? AND result_ref IS NULL AND changes()=1")
       .bind(JSON.stringify(accounting), jobId),
   ]);
   return result[0]?.meta.changes === 1;
 }
 async finishPaidDispatch(scope: PaidDocumentScope, id: string, jobId: string, outcome: DocumentProviderOutcome): Promise<DocumentProviderOutcome> {
   const table = scope === "production" ? "document_production_dispatches" : "document_acceptance_dispatches";
   const identity = scope === "production" ? "grant_id" : "run_id";
   const receipt = outcome.kind === "received" ? outcome : null;
   const verified = receipt?.audit?.status === "verified" && receipt.actualMicroUsd !== null && receipt.receiptId !== null;
   type PaidRow={state:string;receipt_id:string|null;actual_micro_usd:number|null;input_tokens:number|null;output_tokens:number|null};
   const tx = await this.db.batch<PaidRow>([this.db.prepare(`UPDATE ${table} SET
     state=CASE WHEN ?=1 AND receipt_id=? AND actual_micro_usd=? AND actual_micro_usd<=reserved_micro_usd THEN 'verified' ELSE 'stopped' END,
     actual_micro_usd=COALESCE(actual_micro_usd,CASE WHEN receipt_id=? THEN ? END),audit_json=?,checked_at=?
     WHERE ${identity}=? AND job_id=? AND state='pending' RETURNING state,receipt_id,actual_micro_usd,input_tokens,output_tokens`)
     .bind(verified ? 1 : 0, receipt?.receiptId ?? null, receipt?.actualMicroUsd ?? null, receipt?.receiptId ?? null,
       receipt?.actualMicroUsd ?? null, receipt?.audit ? JSON.stringify(receipt.audit) : null,
       this.now(), id, jobId),
     // Store the final attributable amount even when it was first learned from metadata, before R2 or Workflow delivery.
     this.db.prepare(`UPDATE document_executor_jobs SET paid_intent=NULL,accounting_json=COALESCE(
       (SELECT json_object('kind','received','candidate',NULL,'receiptId',receipt_id,'actualMicroUsd',actual_micro_usd,
         'inputTokens',input_tokens,'outputTokens',output_tokens) FROM ${table} WHERE job_id=? AND receipt_id IS NOT NULL),
       accounting_json,?) WHERE job_id=? AND result_ref IS NULL AND changes()=1`)
       .bind(jobId,JSON.stringify({kind:"unknown",code:"connection-lost"}),jobId),
   ]);
   const row=tx[0]?.results[0];
   if (!row) throw new Error("Paid reservation unavailable");
   if (row.state === "verified") return outcome;
   // Only this job's exclusive receipt can settle a charge. A receipt claimed before a lost
   // acknowledgement remains attributable even if the adapter could not finish its audit.
   if (receipt || row.receipt_id) return { ...receipt, kind:"received", candidate:null, receiptId:row.receipt_id,
     actualMicroUsd:row.actual_micro_usd, inputTokens:row.input_tokens, outputTokens:row.output_tokens };
   return outcome;
 }
 async beginResult(jobId:string,outcome:DocumentProviderOutcome) {
   const ref=crypto.randomUUID(), key=`document-results-multipart/v1/${jobId}/${ref}`;
   const accounting=outcome.kind==="received"?{...outcome,candidate:null}:outcome;
   const received=outcome.kind==="received"?outcome:null;
   // A committed receipt claim can outlive both its acknowledgement and the final audit write.
   // Compare at the result-ref CAS so a weaker in-memory outcome cannot overwrite or deliver over that charge.
   await this.db.prepare(`WITH prior AS MATERIALIZED (
       SELECT job_id,cleanup_requested,CASE WHEN json_type(accounting_json,'$.receiptId')='text'
         AND json_type(accounting_json,'$.actualMicroUsd')='integer'
         AND (accounting_json->>'$.receiptId' IS NOT ? OR accounting_json->>'$.actualMicroUsd' IS NOT ?)
         THEN 1 ELSE 0 END AS preserve_charge FROM document_executor_jobs WHERE job_id=?
     ), delivery AS (SELECT job_id,preserve_charge,MAX(preserve_charge,cleanup_requested) AS only_accounting FROM prior)
     UPDATE document_executor_jobs AS j SET result_ref=?,result_key=CASE WHEN delivery.only_accounting=0 THEN ? END,
       accounting_json=CASE WHEN delivery.preserve_charge=1 THEN j.accounting_json ELSE ? END,
       paid_intent=CASE WHEN ?=1 AND delivery.preserve_charge=0 THEN NULL ELSE j.paid_intent END,
       result_ready=delivery.only_accounting,writer_terminated=delivery.only_accounting,accounting_only=delivery.only_accounting,
       state=CASE WHEN delivery.only_accounting=1 THEN 'delivery-pending' ELSE j.state END,updated_at=?
     FROM delivery WHERE j.job_id=delivery.job_id AND j.result_ref IS NULL AND j.dispatch_state='may-have-sent' AND j.writer_terminated=0`)
     .bind(received?.receiptId??null,received?.actualMicroUsd??null,jobId,ref,key,JSON.stringify(accounting),
       outcome.kind==="not-sent"?1:0,this.now()).run();
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
 async closeTerminalUnsentTurn(jobId:string) {
   // Terminal Workflow and a not-sent CAS prove that the paid step never entered. No result upload exists.
   await this.db.prepare(`UPDATE document_executor_jobs SET paid_intent=NULL,state='delivery-pending',result_ref=?,result_ready=1,
     accounting_only=1,writer_terminated=1,accounting_json=?,updated_at=? WHERE job_id=? AND paid_intent IS NOT NULL AND
     state='queued' AND dispatch_state='not-sent' AND result_ref IS NULL`)
     .bind(crypto.randomUUID(),JSON.stringify({kind:"not-sent",code:"aborted-before-send"}),this.now(),jobId).run();
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
 async requestCleanup(jobId:string){await this.admit(jobId);await this.db.prepare("UPDATE document_executor_jobs SET cleanup_requested=1,paid_intent=CASE WHEN dispatch_state='not-sent' THEN NULL ELSE paid_intent END,writer_terminated=CASE WHEN dispatch_state='not-sent' THEN 1 ELSE writer_terminated END,state=CASE WHEN dispatch_state='not-sent' THEN 'closed' ELSE state END,updated_at=? WHERE job_id=?").bind(this.now(),jobId).run();return this.get(jobId);}
 async proveWriterTerminated(jobId:string,key:string){await this.db.prepare("UPDATE document_executor_jobs SET writer_terminated=1,updated_at=? WHERE job_id=? AND result_key=? AND legacy_recovery_hold=0").bind(this.now(),jobId,key).run();}
 async clearResult(jobId:string){await this.db.prepare("UPDATE document_executor_jobs SET result_key=NULL,updated_at=? WHERE job_id=? AND writer_terminated=1").bind(this.now(),jobId).run();}
 async touch(jobId:string){await this.db.prepare("UPDATE document_executor_jobs SET last_attempt_at=? WHERE job_id=?").bind(this.now(),jobId).run();}
 async scan(limit=10){return (await this.db.prepare("SELECT * FROM document_executor_jobs WHERE state IN ('queued','running','delivery-pending') OR (cleanup_requested=1 AND result_key IS NOT NULL) ORDER BY last_attempt_at,job_id LIMIT ?").bind(Math.min(10,Math.max(1,Math.floor(limit)))).all<ExecutorDocumentJob>()).results;}
}
