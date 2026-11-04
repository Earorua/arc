import {createDocumentJobRequestSchema,cancelDocumentJobRequestSchema,createDocumentMutationDigest,documentJobResponseSchema,type DocumentEndpointRequest,type DocumentEndpointResponse} from "../../contracts/documents-api";
import {DOCUMENT_LIMITS,type DocumentPolicy,type DocumentAnalysisMetadata} from "./policy";
import {DocumentBudgetRepository} from "./budget-repository";
import {documentMutationReceipt,documentServiceError} from "./consent-service";
import {documentProviderConfigurationDigest,type DocumentProviderInput,type DocumentProviderOutcome} from "./provider";
import type {DocumentExecutorBridge,DocumentSiteCallbacks,DocumentSendPermit} from "./executor-bridge";
import {materialSha256} from "../../contracts/material-planning";
import {activeProductionIdentity,type DocumentProductionRelease} from "../../../worker/document-executor/production-policy";
export type DocumentJobRecord={owner_id:string;id:string;text_version_id:string;document_id:string;document_version_id:string;consent_id:string;generation:number;document_revision:number;revision:number;state:string;dispatch_state:string;execution_slot:number|null;queued_at:number;queue_expires_at:number;provider_policy_id:string;price_version:string;policy_version:string;reservation_id:string;model_version:string;configuration_digest:string;extraction_id:string|null;error_code:string|null};
export type DocumentExtractionActivation={jobId:string;documentId:string;documentVersionId:string;textVersionId:string;generation:number;documentRevision:number;consentId:string;candidate:unknown;modelVersion?:string;policyVersion?:string};
export type DocumentJobServiceOptions={db:D1Database;policy:DocumentPolicy;acceptanceRunId?:string;acceptanceConfigurationSha256?:Promise<string>;productionRelease?:DocumentProductionRelease|null;analysisAvailable?:()=>Promise<boolean>;now?:()=>number;bridge?:Pick<DocumentExecutorBridge,"start"|"cancel">;reservationMicroUsd:number|null;loadInput:(job:DocumentJobRecord)=>Promise<DocumentProviderInput>;activateResult:(ownerId:string,input:DocumentExtractionActivation)=>Promise<{extractionId:string|null}>};
const validJob=`EXISTS(SELECT 1 FROM documents d JOIN document_versions v ON v.owner_id=d.owner_id AND v.document_id=d.id AND v.id=j.document_version_id JOIN document_processing_consents c ON c.owner_id=j.owner_id AND c.id=j.consent_id WHERE d.owner_id=j.owner_id AND d.id=j.document_id AND d.lifecycle='active' AND d.generation=j.generation AND d.revision=j.document_revision AND d.current_document_version_id=j.document_version_id AND v.state='ready' AND v.generation=j.generation AND v.text_version_id=j.text_version_id AND c.document_id=j.document_id AND c.document_version_id=j.document_version_id AND c.text_version_id=j.text_version_id AND c.generation=j.generation AND c.revoked_at IS NULL AND c.purpose='analysis' AND c.provider_policy_id=j.provider_policy_id AND c.policy_version=j.policy_version)`;
export class DocumentJobService implements DocumentSiteCallbacks{
 private readonly now:()=>number;private readonly budget:DocumentBudgetRepository;
 constructor(private readonly options:DocumentJobServiceOptions){this.now=options.now??Date.now;this.budget=new DocumentBudgetRepository(options.db,this.now);}
 async productionIdentity(digest:string){const release=this.options.productionRelease;return !!release && this.options.policy.analysisEnabled && await activeProductionIdentity(release,this.now)===digest;}
 private configuration(){const {policy,reservationMicroUsd}=this.options;if(!policy.analysisEnabled||!policy.analysis||reservationMicroUsd===null||!Number.isSafeInteger(reservationMicroUsd)||reservationMicroUsd<0||reservationMicroUsd>policy.analysis.maxJobMicroUsd)return documentServiceError("unavailable");return policy.analysis;}
 private async jobConfigurationDigest(config:DocumentAnalysisMetadata){
  const runId=this.options.acceptanceRunId,sha=await this.options.acceptanceConfigurationSha256;
  if(runId && (!sha || !/^[0-9a-f]{64}$/u.test(sha)))return documentServiceError("unavailable");
  const release=this.options.productionRelease,production=release ? await activeProductionIdentity(release,this.now) : null;
  if(release && (!production || runId)) return documentServiceError("unavailable");
  return documentProviderConfigurationDigest(config,this.options.reservationMicroUsd!,runId,sha,production??undefined);
 }
 private async row(jobId:string,ownerId?:string){const row=await this.options.db.prepare(`SELECT * FROM document_jobs WHERE id=?${ownerId?" AND owner_id=?":""}`).bind(...(ownerId?[jobId,ownerId]:[jobId])).first<DocumentJobRecord>();if(!row)return documentServiceError("not-found");return row;}
 async create(ownerId:string,raw:DocumentEndpointRequest<"createDocumentJob">):Promise<DocumentEndpointResponse<"createDocumentJob">>{
  const request=createDocumentJobRequestSchema.parse(raw),{db}=this.options,now=this.now();
  const digest=await createDocumentMutationDigest(ownerId,"createDocumentJob",request),replay=await documentMutationReceipt<DocumentEndpointResponse<"createDocumentJob">>(db,ownerId,"createDocumentJob",request.mutationId,digest);
  if(replay){
   const current=await db.prepare(`SELECT 1 FROM document_jobs j WHERE j.owner_id=? AND j.id=? AND j.consent_id=? AND j.text_version_id=? AND ${validJob}`)
     .bind(ownerId,replay.jobId,request.consentId,request.textVersionId).first();
   if(!current)return documentServiceError("not-found");
   await this.advance(ownerId);return replay;
  }
  const config=this.configuration();if(this.options.analysisAvailable && !await this.options.analysisAvailable())return documentServiceError("unavailable");
  const consent=await db.prepare("SELECT c.*,d.revision AS document_revision FROM document_processing_consents c JOIN documents d ON d.owner_id=c.owner_id AND d.id=c.document_id JOIN document_versions v ON v.owner_id=c.owner_id AND v.document_id=c.document_id AND v.id=c.document_version_id WHERE c.owner_id=? AND c.id=? AND c.text_version_id=? AND c.revoked_at IS NULL AND d.lifecycle='active' AND d.generation=c.generation AND d.current_document_version_id=c.document_version_id AND v.state='ready' AND c.provider_policy_id=? AND c.policy_version=?").bind(ownerId,request.consentId,request.textVersionId,config.providerPolicyId,config.routingPolicy.policyVersion).first<{document_id:string;document_version_id:string;generation:number;document_revision:number}>();if(!consent)return documentServiceError("not-found");
  const configDigest=await this.jobConfigurationDigest(config);
  if(request.previousJobId)await this.row(request.previousJobId,ownerId);
  const id=crypto.randomUUID(),reservationId=crypto.randomUUID(),result={jobId:id,state:"queued" as const};
  const guard=`NOT EXISTS(SELECT 1 FROM document_mutations WHERE owner_id=? AND endpoint='createDocumentJob' AND mutation_id=?) AND (SELECT COUNT(*) FROM document_jobs WHERE owner_id=? AND state='queued' AND execution_slot IS NULL)<5 AND EXISTS(SELECT 1 FROM documents d JOIN document_versions v ON v.owner_id=d.owner_id AND v.document_id=d.id AND v.id=d.current_document_version_id JOIN document_processing_consents c ON c.owner_id=d.owner_id AND c.id=? WHERE d.owner_id=? AND d.id=? AND d.lifecycle='active' AND d.generation=? AND d.revision=? AND v.text_version_id=? AND v.state='ready' AND c.revoked_at IS NULL AND c.text_version_id=v.text_version_id AND c.generation=d.generation AND c.provider_policy_id=? AND c.policy_version=?)`;
  await db.batch([
   this.budget.reserveStatement({id:reservationId,jobId:id,ownerId,amount:this.options.reservationMicroUsd!,userLimit:config.userDailyMicroUsd,globalLimit:config.globalDailyMicroUsd,priceVersion:config.priceVersion},guard,[ownerId,request.mutationId,ownerId,request.consentId,ownerId,consent.document_id,consent.generation,consent.document_revision,request.textVersionId,config.providerPolicyId,config.routingPolicy.policyVersion]),
   db.prepare("INSERT INTO document_jobs(owner_id,id,text_version_id,document_id,document_version_id,consent_id,generation,document_revision,revision,state,dispatch_state,queued_at,queue_expires_at,provider_policy_id,price_version,policy_version,reservation_id,updated_at,model_version,configuration_digest) SELECT ?,?,?,?,?,?,?,?,0,'queued','not-sent',?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM document_budget_reservations WHERE id=?)").bind(ownerId,id,request.textVersionId,consent.document_id,consent.document_version_id,request.consentId,consent.generation,consent.document_revision,now,now+DOCUMENT_LIMITS.queueWaitMs,config.providerPolicyId,config.priceVersion,config.routingPolicy.policyVersion,reservationId,now,config.model,configDigest,reservationId),
   db.prepare("INSERT INTO document_mutations(owner_id,endpoint,mutation_id,body_digest,result_json,created_at) SELECT ?,'createDocumentJob',?,?,?,? WHERE EXISTS(SELECT 1 FROM document_jobs WHERE owner_id=? AND id=?)").bind(ownerId,request.mutationId,digest,JSON.stringify(result),now,ownerId,id),
  ]);
  const receipt=await documentMutationReceipt<DocumentEndpointResponse<"createDocumentJob">>(db,ownerId,"createDocumentJob",request.mutationId,digest);if(!receipt)return documentServiceError("quota-exceeded");await this.advance(ownerId);return receipt;
 }
 async read(ownerId:string,request:DocumentEndpointRequest<"readDocumentJob">):Promise<DocumentEndpointResponse<"readDocumentJob">>{const row=await this.row(request.jobId,ownerId),budget=await this.budget.get(row.id);if(!budget)return documentServiceError("unavailable");return documentJobResponseSchema.parse({jobId:row.id,revision:row.revision,state:row.state,costState:budget.state,extractionId:row.state==="succeeded"?row.extraction_id:null,errorCode:row.error_code});}
 async advance(ownerId:string):Promise<void>{
  let config,digest;try{config=this.configuration();digest=await this.jobConfigurationDigest(config);}catch{return;}const {db}=this.options,now=this.now();
  await db.prepare(`UPDATE document_jobs AS j SET execution_slot=1,updated_at=? WHERE j.id=(SELECT candidate.id FROM document_jobs candidate WHERE candidate.owner_id=? AND candidate.state='queued' AND candidate.dispatch_state='not-sent' AND candidate.execution_slot IS NULL ORDER BY candidate.queued_at,candidate.id LIMIT 1) AND NOT EXISTS(SELECT 1 FROM document_jobs active WHERE active.owner_id=j.owner_id AND active.execution_slot=1) AND j.queue_expires_at>? AND j.provider_policy_id=? AND j.price_version=? AND j.policy_version=? AND j.configuration_digest=? AND ${validJob} AND EXISTS(SELECT 1 FROM document_budget_reservations b WHERE b.id=j.reservation_id AND b.state='reserved')`).bind(now,ownerId,now,config.providerPolicyId,config.priceVersion,config.routingPolicy.policyVersion,digest).run();
  const selected=await db.prepare("SELECT id FROM document_jobs WHERE owner_id=? AND execution_slot=1 AND state='queued' AND dispatch_state='not-sent'").bind(ownerId).first<{id:string}>();if(selected&&this.options.bridge){try{await this.options.bridge.start({jobId:selected.id,contractVersion:"2026.11.1"});}catch{/* The durable slot remains available to bounded maintenance recovery. */}}
 }
 async claim(jobId:string){const config=this.configuration(),now=this.now();const result=await this.options.db.prepare(`UPDATE document_jobs AS j SET state='running',revision=revision+1,updated_at=? WHERE j.id=? AND j.state='queued' AND j.dispatch_state='not-sent' AND j.execution_slot=1 AND j.queue_expires_at>? AND j.provider_policy_id=? AND j.price_version=? AND j.policy_version=? AND j.configuration_digest=? AND ${validJob} AND EXISTS(SELECT 1 FROM document_budget_reservations b WHERE b.id=j.reservation_id AND b.state='reserved') RETURNING id`).bind(now,jobId,now,config.providerPolicyId,config.priceVersion,config.routingPolicy.policyVersion,await this.jobConfigurationDigest(config)).first();return {jobId,claimed:!!result};}
 async input(jobId:string):Promise<DocumentProviderInput>{
  const config=this.configuration(),row=await this.row(jobId);if(row.state!=="running"||row.dispatch_state!=="not-sent"||row.execution_slot!==1)return documentServiceError("conflict");
  const input=await this.options.loadInput(row);if(input.textVersionId!==row.text_version_id||input.providerPolicyId!==row.provider_policy_id)return documentServiceError("conflict");
  const dispatchedAt=this.now(),results=await this.options.db.batch([
   this.options.db.prepare(`UPDATE document_jobs AS j SET dispatch_state='may-have-sent',updated_at=? WHERE j.id=? AND j.state='running' AND j.dispatch_state='not-sent' AND j.execution_slot=1 AND j.provider_policy_id=? AND j.price_version=? AND j.policy_version=? AND j.configuration_digest=? AND ${validJob} AND EXISTS(SELECT 1 FROM document_budget_reservations b WHERE b.id=j.reservation_id AND b.state='reserved') RETURNING id`).bind(dispatchedAt,jobId,config.providerPolicyId,config.priceVersion,config.routingPolicy.policyVersion,await this.jobConfigurationDigest(config)),
   this.options.db.prepare("UPDATE document_budget_reservations SET day=?,updated_at=? WHERE job_id=? AND state='reserved' AND changes()=1").bind(new Date(dispatchedAt).toISOString().slice(0,10),dispatchedAt,jobId),
  ]);if(results[0]?.meta.changes!==1)return documentServiceError("conflict");return {...input,execution:{modelVersion:row.model_version,priceVersion:row.price_version,configurationDigest:row.configuration_digest,sendScope:{consentId:row.consent_id,generation:row.generation},
    ...(this.options.productionRelease ? {production:{jobId,authorizationSha256:(await this.options.productionRelease.identity)!}} : {}),...(this.options.acceptanceRunId ? {acceptance:{runId:this.options.acceptanceRunId,configurationSha256:(await this.options.acceptanceConfigurationSha256)!,ownerId:row.owner_id,documentId:row.document_id,documentVersionId:row.document_version_id,generation:row.generation}} : {})}};
 }
 async permit(input: DocumentSendPermit): Promise<{jobId:string;permitted:boolean}> {
   const config=this.configuration(), digest=await this.jobConfigurationDigest(config);
   if (!this.options.policy.documentsEnabled || input.configurationDigest!==digest) return {jobId:input.jobId,permitted:false};
   // This single-use receipt and consent revocation serialize on the authoritative site database.
   const result=await this.options.db.prepare(`INSERT INTO document_mutations(owner_id,endpoint,mutation_id,body_digest,result_json,created_at)
     SELECT j.owner_id,'executor-send-permit',j.id,?,'{"permitted":true}',? FROM document_jobs j
     WHERE j.id=? AND j.consent_id=? AND j.text_version_id=? AND j.generation=? AND j.configuration_digest=?
     AND j.state='running' AND j.dispatch_state='may-have-sent' AND j.execution_slot=1 AND j.executor_cancel_state='none'
     AND j.provider_policy_id=? AND j.price_version=? AND j.policy_version=? AND ${validJob}
     AND EXISTS(SELECT 1 FROM document_budget_reservations b WHERE b.id=j.reservation_id AND b.job_id=j.id AND b.owner_id=j.owner_id AND b.state='reserved' AND b.reserved_micro_usd=?)
     ON CONFLICT(owner_id,endpoint,mutation_id) DO NOTHING`)
     .bind(await materialSha256(input),this.now(),input.jobId,input.consentId,input.textVersionId,input.generation,digest,
       config.providerPolicyId,config.priceVersion,config.routingPolicy.policyVersion,this.options.reservationMicroUsd).run();
   return {jobId:input.jobId,permitted:result.meta.changes===1};
 }
 async result(jobId:string,_resultRef:string,outcome:DocumentProviderOutcome):Promise<{jobId:string;state:string;resultRef:string|null}>{
  let row=await this.row(jobId);const reservation=await this.budget.settle(jobId,outcome);let extractionId=row.extraction_id;
  if(outcome.kind==="received" && reservation.state==="held-unknown")outcome={kind:"unknown",code:"invalid-receipt"};
  if(outcome.kind==="received"&&row.state==="cost-unknown"){
   await this.options.db.prepare(`UPDATE document_jobs AS j SET state='running',error_code=NULL,revision=revision+1 WHERE j.id=? AND j.state='cost-unknown' AND ${validJob}`).bind(jobId).run();
   row=await this.row(jobId);
  }
  if(outcome.kind==="received"&&!extractionId&&row.state==="running"){
   try{const activated=await this.options.activateResult(row.owner_id,{jobId:row.id,documentId:row.document_id,documentVersionId:row.document_version_id,textVersionId:row.text_version_id,generation:row.generation,documentRevision:row.document_revision,consentId:row.consent_id,candidate:outcome.candidate,modelVersion:row.model_version,policyVersion:row.policy_version});extractionId=activated.extractionId;}catch(error){const code=error&&typeof error==="object"&&"code" in error?String(error.code):"unavailable";if(!["invalid-content","conflict","gone","not-found"].includes(code))return documentServiceError("unavailable");}
   if(!extractionId)await this.options.db.prepare("UPDATE document_jobs SET state='failed',error_code='invalid-candidate',revision=revision+1,updated_at=? WHERE id=? AND state='running'").bind(this.now(),jobId).run();
  }else if(outcome.kind!=="received")await this.options.db.prepare("UPDATE document_jobs SET state=?,error_code=?,revision=revision+1,updated_at=? WHERE id=? AND state IN ('queued','running')").bind(outcome.kind==="unknown"?"cost-unknown":"failed",outcome.kind==="unknown"?"outcome-unknown":outcome.code,this.now(),jobId).run();
  if(reservation.state==="settled"||reservation.state==="released"){
   await this.options.db.prepare("UPDATE document_jobs SET state='cancelled',revision=revision+1 WHERE id=? AND state='cancel-requested'").bind(jobId).run();await this.advance(row.owner_id);
  }
  const current=await this.row(jobId);return {jobId,state:current.state,resultRef:current.state==="succeeded"?current.extraction_id:null};
 }
 async status(jobId:string){const row=await this.row(jobId);return this.read(row.owner_id,{jobId});}
 async cancel(ownerId:string,raw:DocumentEndpointRequest<"cancelDocumentJob">):Promise<DocumentEndpointResponse<"cancelDocumentJob">>{
  const request=cancelDocumentJobRequestSchema.parse(raw),row=await this.row(request.jobId,ownerId),{db}=this.options,digest=await createDocumentMutationDigest(ownerId,"cancelDocumentJob",request);
  const replay=await documentMutationReceipt<DocumentEndpointResponse<"cancelDocumentJob">>(db,ownerId,"cancelDocumentJob",request.mutationId,digest);if(replay){await this.notifyCancellation(ownerId,row.id);return replay;}
  if(row.revision!==request.expectedRevision)return documentServiceError("conflict");const state=row.state==="revoked"?"revoked":row.dispatch_state==="may-have-sent"?"cancel-requested":"cancelled";const result={jobId:row.id,revision:row.revision+1,state} as DocumentEndpointResponse<"cancelDocumentJob">;
  try{await db.batch([
   db.prepare("UPDATE document_jobs SET state=?,extraction_id=NULL,execution_slot=CASE WHEN dispatch_state='may-have-sent' THEN execution_slot ELSE NULL END,executor_cancel_state='pending',executor_cancel_attempt_at=0,revision=revision+1,updated_at=? WHERE owner_id=? AND id=? AND revision=?").bind(state,this.now(),ownerId,row.id,row.revision),
   db.prepare("SELECT json(CASE WHEN changes()=1 THEN '{}' ELSE '' END) AS cancellation_guard"),
   db.prepare("UPDATE document_budget_reservations SET state=CASE WHEN (SELECT dispatch_state FROM document_jobs WHERE id=?)='not-sent' THEN 'released' ELSE 'held-unknown' END,updated_at=? WHERE job_id=? AND state IN ('reserved','held-unknown') AND EXISTS(SELECT 1 FROM document_jobs WHERE id=? AND revision=? AND state=?)").bind(row.id,this.now(),row.id,row.id,result.revision,state),
   db.prepare("INSERT INTO document_mutations(owner_id,endpoint,mutation_id,body_digest,result_json,created_at) SELECT ?,'cancelDocumentJob',?,?,?,? WHERE EXISTS(SELECT 1 FROM document_jobs WHERE owner_id=? AND id=? AND revision=? AND state=?)").bind(ownerId,request.mutationId,digest,JSON.stringify(result),this.now(),ownerId,row.id,result.revision,state),
  ]);}catch{const same=await documentMutationReceipt<DocumentEndpointResponse<"cancelDocumentJob">>(db,ownerId,"cancelDocumentJob",request.mutationId,digest);if(same){await this.notifyCancellation(ownerId,row.id);return same;}return documentServiceError("conflict");}const receipt=await documentMutationReceipt<DocumentEndpointResponse<"cancelDocumentJob">>(db,ownerId,"cancelDocumentJob",request.mutationId,digest);if(!receipt)return documentServiceError("conflict");await this.notifyCancellation(ownerId,row.id);await this.advance(ownerId);return receipt;
 }
 private async notifyCancellation(ownerId:string,jobId:string,force=false):Promise<{writersTerminated:boolean;resultsAbsent:boolean}|null>{
  const row=await this.options.db.prepare("SELECT executor_cancel_state FROM document_jobs WHERE owner_id=? AND id=?").bind(ownerId,jobId).first<{executor_cancel_state:string}>();
  if(!row||(!force&&row.executor_cancel_state!=="pending")||!this.options.bridge)return null;
  await this.options.db.prepare("UPDATE document_jobs SET executor_cancel_attempt_at=? WHERE owner_id=? AND id=?").bind(this.now(),ownerId,jobId).run();
  try{const proof=await this.options.bridge.cancel(jobId);await this.options.db.prepare("UPDATE document_jobs SET executor_cancel_state='acknowledged' WHERE owner_id=? AND id=? AND executor_cancel_state='pending'").bind(ownerId,jobId).run();return proof;}
  catch{return null;}
 }
 async notifyConsentCancellation(ownerId:string,consentId:string):Promise<void>{
  const rows=await this.options.db.prepare("SELECT id FROM document_jobs WHERE owner_id=? AND consent_id=? AND executor_cancel_state='pending' ORDER BY executor_cancel_attempt_at,id LIMIT 10").bind(ownerId,consentId).all<{id:string}>();
  for(const row of rows.results)await this.notifyCancellation(ownerId,row.id);
  await this.advance(ownerId);
 }
 async cancelInternal(jobId:string){const row=await this.row(jobId);return this.cancel(row.owner_id,{jobId,expectedRevision:row.revision,mutationId:`executor-${jobId}-${row.revision}`});}
 async cancelForDocument(ownerId:string,documentId:string):Promise<{writersTerminated:boolean;resultsAbsent:boolean}>{
  const {db}=this.options;await db.batch([
   db.prepare("UPDATE document_jobs SET executor_cancel_state='pending',executor_cancel_attempt_at=0 WHERE owner_id=? AND document_id=? AND executor_cancel_state='none'").bind(ownerId,documentId),
   db.prepare("UPDATE document_jobs SET state='revoked',extraction_id=NULL,execution_slot=CASE WHEN dispatch_state='not-sent' THEN NULL ELSE execution_slot END,revision=revision+1 WHERE owner_id=? AND document_id=? AND state!='revoked'").bind(ownerId,documentId),
   db.prepare("UPDATE document_budget_reservations SET state=CASE WHEN job_id IN(SELECT id FROM document_jobs WHERE owner_id=? AND document_id=? AND dispatch_state='not-sent') THEN 'released' ELSE 'held-unknown' END WHERE state IN ('reserved','held-unknown') AND job_id IN(SELECT id FROM document_jobs WHERE owner_id=? AND document_id=?)").bind(ownerId,documentId,ownerId,documentId),
  ]);const jobs=await db.prepare("SELECT id,dispatch_state FROM document_jobs WHERE owner_id=? AND document_id=?").bind(ownerId,documentId).all<{id:string;dispatch_state:string}>();let writersTerminated=true,resultsAbsent=true;
  for(const job of jobs.results){if(!this.options.bridge){if(job.dispatch_state!=="not-sent"){writersTerminated=false;resultsAbsent=false;}continue;}const proof=await this.notifyCancellation(ownerId,job.id,true);if(proof){writersTerminated&&=proof.writersTerminated;resultsAbsent&&=proof.resultsAbsent;}else{writersTerminated=false;resultsAbsent=false;}}
  await this.advance(ownerId);return {writersTerminated,resultsAbsent};
 }
 async maintenance(limit=10):Promise<{processed:number}>{
  const {db}=this.options,now=this.now(),bounded=Math.min(10,Math.max(1,Math.floor(limit))),deadline=Date.now()+5000;
  const rows=await db.prepare("SELECT id,owner_id,queue_expires_at,executor_cancel_state FROM document_jobs WHERE executor_cancel_state='pending' OR (state='queued' AND dispatch_state='not-sent') ORDER BY CASE WHEN executor_cancel_state='pending' THEN executor_cancel_attempt_at ELSE updated_at END,id LIMIT ?").bind(bounded).all<{id:string;owner_id:string;queue_expires_at:number;executor_cancel_state:string}>();let processed=0;
  for(const row of rows.results){if(Date.now()>=deadline)break;if(row.executor_cancel_state==="pending"){await this.notifyCancellation(row.owner_id,row.id);processed++;continue;}await db.prepare("UPDATE document_jobs SET updated_at=? WHERE id=? AND state='queued'").bind(now,row.id).run();const valid=await db.prepare(`SELECT id FROM document_jobs j WHERE j.id=? AND ${validJob}`).bind(row.id).first();
   if(row.queue_expires_at<=now||!valid){await db.batch([db.prepare("UPDATE document_jobs SET state='cancelled',execution_slot=NULL,revision=revision+1,error_code=?,updated_at=? WHERE id=? AND state='queued' AND dispatch_state='not-sent'").bind(row.queue_expires_at<=now?"queue-expired":"document-revoked",now,row.id),db.prepare("UPDATE document_budget_reservations SET state='released',updated_at=? WHERE job_id=? AND state='reserved' AND EXISTS(SELECT 1 FROM document_jobs WHERE id=? AND state='cancelled' AND dispatch_state='not-sent')").bind(now,row.id,row.id)]);}else await this.advance(row.owner_id);processed++;
  }return{processed};
 }
}

