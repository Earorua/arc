import {documentAcceptanceCases,documentAcceptanceConfigurationDigest,utf8Sha256} from "../../../worker/document-executor/acceptance-policy";
import {fixtureGenerationResponse} from "../../helpers/document-generation-response";
import {WorkerEntrypoint} from "cloudflare:workers";
import {DocumentConsentService} from "../../../app/server/documents/consent-service";
import {DocumentJobService} from "../../../app/server/documents/job-service";
import {DocumentExecutorBridge,D1DocumentNonceStore,createDocumentSiteHandler} from "../../../app/server/documents/executor-bridge";
import {D1DocumentRepository} from "../../../app/server/documents/d1-repository";
import {DocumentStorage} from "../../../app/server/documents/storage";
import {DocumentService} from "../../../app/server/documents/service";
import {ReviewService} from "../../../app/server/documents/review-service";
import {DeletionService} from "../../../app/server/documents/deletion-service";
import {readDocumentSitePolicy} from "../../../app/server/documents/policy";
type Env=Record<string,unknown>&{SITE_DB:D1Database;DOCUMENT_ASSETS:R2Bucket;DOCUMENT_EXECUTOR:Fetcher;ARC_DOCUMENT_BRIDGE_SECRET:string};
function services(env:Env){const repo=new D1DocumentRepository(env.SITE_DB),storage=new DocumentStorage(env.DOCUMENT_ASSETS),documents=new DocumentService(repo,storage),review=new ReviewService(repo,storage),policy=readDocumentSitePolicy(env);const jobs=new DocumentJobService({db:env.SITE_DB,policy,acceptanceRunId:typeof env.ARC_DOCUMENT_ACCEPTANCE_RUN_ID==="string"?env.ARC_DOCUMENT_ACCEPTANCE_RUN_ID:undefined,acceptanceConfigurationSha256:env.ARC_DOCUMENT_ACCEPTANCE_MODE==="live" && policy.analysis?documentAcceptanceConfigurationDigest(policy.analysis,JSON.parse(String(env.ARC_DOCUMENT_PROVIDER_QUALIFICATION))):undefined,bridge:new DocumentExecutorBridge({binding:env.DOCUMENT_EXECUTOR,secret:env.ARC_DOCUMENT_BRIDGE_SECRET}),reservationMicroUsd:2420,loadInput:async job=>{const version=await repo.version(job.owner_id,job.document_id,job.document_version_id);return{textVersionId:job.text_version_id,text:await storage.read(version.objectKey),segments:version.segments,kind:version.document.kind,providerPolicyId:job.provider_policy_id,outputSchemaVersion:"2026.11.1"};},activateResult:(owner,input)=>review.acceptAiExtraction(owner,input)});return{repo,documents,jobs,consents:new DocumentConsentService({db:env.SITE_DB,policy,onRevoke:(ownerId,consentId)=>jobs.notifyConsentCancellation(ownerId,consentId)})};}
export class DocumentTestSite extends WorkerEntrypoint<Env>{async fetch(request:Request){const {jobs}=services(this.env);return createDocumentSiteHandler({claim:jobs.claim.bind(jobs),permit:jobs.permit.bind(jobs),input:async jobId=>{const input=await jobs.input(jobId);const control=await this.env.SITE_DB.prepare("SELECT f.id FROM fixture_controls f JOIN document_jobs j ON j.document_id=f.document_id WHERE j.id=? AND f.mode='input-gated'").bind(jobId).first<{id:string}>();if(control){await this.env.SITE_DB.prepare("UPDATE fixture_controls SET input_released=1 WHERE id=?").bind(control.id).run();while(!(await this.env.SITE_DB.prepare("SELECT released FROM fixture_controls WHERE id=?").bind(control.id).first<{released:number}>())?.released)await new Promise(resolve=>setTimeout(resolve,30));}return input;},status:jobs.status.bind(jobs),cancelInternal:jobs.cancelInternal.bind(jobs),result:async(jobId,resultRef,outcome)=>{const control=await this.env.SITE_DB.prepare("SELECT f.mode,f.released FROM fixture_controls f JOIN document_jobs j ON j.document_id=f.document_id WHERE j.id=?").bind(jobId).first<{mode:string;released:number}>();if(control?.mode==="delivery-failure"&&!control.released)throw new Error("offline");return jobs.result(jobId,resultRef,outcome);}},{secret:this.env.ARC_DOCUMENT_BRIDGE_SECRET,nonceStore:new D1DocumentNonceStore(this.env.SITE_DB)})(request);}}
export class DocumentFakeTransport extends WorkerEntrypoint<Env>{async fetch(request:Request){
 if(request.method==="GET"){
  const url=new URL(request.url),id=url.searchParams.get("id");
  if(url.pathname!=="/generation"||!id||!/^receipt-[0-9]+$/u.test(id))return new Response(null,{status:400});
  const sent=await this.env.SITE_DB.prepare("SELECT 1 FROM fixture_controls WHERE rowid=? AND sends=1").bind(id.slice("receipt-".length)).first();
  return sent?fixtureGenerationResponse(id,"fixture-model"):new Response(null,{status:404});
 }
 const body=await request.json() as {messages:{content:string}[]};const data=JSON.parse(body.messages[1]!.content) as {segments:{segmentId:string;text:string}[]};const hash=await utf8Sha256(data.segments.map(s=>s.text).join(""));const id=this.env.ARC_DOCUMENT_ACCEPTANCE_MODE==="live"?Object.keys(documentAcceptanceCases).find(key=>documentAcceptanceCases[key]===hash):/fixture:([a-z-]+)/u.exec(data.segments[0]!.text)?.[1];if(!id)throw new Error("invalid fixture");await this.env.SITE_DB.prepare("UPDATE fixture_controls SET sends=sends+1 WHERE id=?").bind(id).run();let control=await this.env.SITE_DB.prepare("SELECT mode,released FROM fixture_controls WHERE id=?").bind(id).first<{mode:string;released:number}>();if(control?.mode==="unknown")return new Response("receipt unavailable",{status:503});while(control?.mode==="delayed"&&!control.released){await new Promise(resolve=>setTimeout(resolve,30));control=await this.env.SITE_DB.prepare("SELECT mode,released FROM fixture_controls WHERE id=?").bind(id).first<{mode:string;released:number}>();}const slot=await this.env.SITE_DB.prepare("SELECT rowid FROM fixture_controls WHERE id=?").bind(id).first<number>("rowid");return Response.json({id:`receipt-${slot}`,model:"fixture-model",choices:[{message:{content:JSON.stringify({schemaVersion:"2026.11.1",items:[]})}}],usage:{prompt_tokens:100,completion_tokens:20,cost:0.000007}});}}
const fixtureSite={async fetch(request:Request,env:Env){
 const path=new URL(request.url).pathname;
 if(path==="/invalidate"||path==="/cleanup"){
  const {jobId,action}=await request.json() as {jobId:string;action:string};const {documents,consents,jobs,repo}=services(env);
  const job=await env.SITE_DB.prepare("SELECT * FROM document_jobs WHERE id=?").bind(jobId).first<{owner_id:string;document_id:string;consent_id:string;revision:number}>();if(!job)return new Response(null,{status:404});
  if(path==="/cleanup")return Response.json(await jobs.cancelForDocument(job.owner_id,job.document_id));
  const document=await repo.document(job.owner_id,job.document_id);
  if(action==="cancel")await jobs.cancel(job.owner_id,{jobId,expectedRevision:job.revision,mutationId:`cancel-${jobId}`});
  if(action==="revoke")await consents.revoke(job.owner_id,{consentId:job.consent_id,mutationId:`revoke-${jobId}`});
  if(action==="delete")await new DeletionService(repo,new DocumentStorage(env.DOCUMENT_ASSETS),jobs).deleteDocument({ownerId:job.owner_id},{documentId:job.document_id,expectedRevision:document.revision,mutationId:`delete-${jobId}`});
  if(action==="revision")await documents.createDocumentVersion({ownerId:job.owner_id},{documentId:job.document_id,text:"Changed synthetic text",expectedRevision:document.revision,mutationId:`revision-${jobId}`});
  return Response.json({ok:true});
 }
 if(path==="/prepare-case" || path==="/case-job") {
   const body=await request.json() as {owner:string;caseId:string;text:string;kind:"resume"|"jd";mutationId:string;textVersionId:string};
   const {documents,jobs,consents}=services(env);
   if(path==="/prepare-case"){
     await env.SITE_DB.prepare("INSERT OR IGNORE INTO users(id,name,email,email_verified) VALUES(?,?,?,0)").bind(body.owner,body.owner,body.owner+"@example.test").run();
     const saved=await documents.createDocument({ownerId:body.owner},{kind:body.kind,displayName:body.caseId,text:body.text,mutationId:"save-"+body.caseId});
     await env.SITE_DB.prepare("INSERT INTO fixture_controls(id,document_id,mode,sends,released) VALUES(?,?,'corpus',0,0)").bind(body.caseId,saved.documentId).run();return Response.json(saved);
   }
   const consent=await consents.create(body.owner,{textVersionId:body.textVersionId,purpose:"analysis",policyVersion:"2026.11.1",providerPolicyId:"fixture-policy",mutationId:"consent-"+body.caseId});
   return Response.json(await jobs.create(body.owner,{textVersionId:body.textVersionId,consentId:consent.consentId,mutationId:body.mutationId}));
 }
 if(path!=="/enqueue")return new Response(null,{status:404});
 const {id,owner,mode}=await request.json() as {id:string;owner:string;mode:string};await env.SITE_DB.prepare("INSERT OR IGNORE INTO users(id,name,email,email_verified) VALUES(?,?,?,0)").bind(owner,owner,`${owner}@example.test`).run();
 const {documents,consents,jobs}=services(env);const saved=await documents.createDocument({ownerId:owner},{kind:"resume",displayName:"Synthetic resume",text:`PRIVATE-MATERIAL-SENTINEL-7f91 fixture:${id} SQL`,mutationId:`save-${id}`});
 await env.SITE_DB.prepare("INSERT OR IGNORE INTO fixture_controls(id,document_id,mode,sends,released) VALUES(?,?,?,0,0)").bind(id,saved.documentId,mode).run();
 const consent=await consents.create(owner,{textVersionId:saved.textVersionId,purpose:"analysis",policyVersion:"2026.11.1",providerPolicyId:"fixture-policy",mutationId:`consent-${id}`});return Response.json(await jobs.create(owner,{textVersionId:saved.textVersionId,consentId:consent.consentId,mutationId:`job-${id}`}));
}};



export default fixtureSite;



