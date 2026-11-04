// @vitest-environment node
import {afterEach,describe,expect,it} from "vitest";
import {createMaterialAnalysisFixture} from "../helpers/material-analysis-e2e";
const fixtures:Awaited<ReturnType<typeof createMaterialAnalysisFixture>>[]=[];
afterEach(async()=>{await Promise.all(fixtures.splice(0).map(f=>f.dispose()));});
async function setup(options:{pauseInput?:boolean;pauseProvider?:boolean;cancelUnavailable?:boolean;permitUnavailable?:boolean}={}){const f=await createMaterialAnalysisFixture(options);fixtures.push(f);const saved=await f.http("createDocument",{kind:"jd",displayName:"Synthetic JD",text:f.text,mutationId:"save"});const consent=await f.http("createDocumentConsent",{textVersionId:saved.textVersionId,purpose:"analysis",providerPolicyId:"qualified-policy",policyVersion:"2026.11.1",mutationId:"consent"});const job=await f.http("createDocumentJob",{textVersionId:saved.textVersionId,consentId:consent.consentId,mutationId:"job"});return{f,saved,consent,job};}
async function stop(value:Awaited<ReturnType<typeof setup>>,action:"cancel"|"revoke"){const {f,job,consent}=value;if(action==="cancel"){const status=await f.http("readDocumentJob",{jobId:job.jobId});return f.http("cancelDocumentJob",{jobId:job.jobId,expectedRevision:status.revision,mutationId:"cancel"});}return f.http("revokeDocumentConsent",{consentId:consent.consentId,mutationId:"revoke"});}
describe("durable scoped executor cancellation notifications",()=>{
 it("releases a definitely unsent reservation when the final signed site operation is unavailable",async()=>{
   const {f,job}=await setup({permitUnavailable:true});await f.execute(job.jobId);
   expect(f.providerCalls()).toBe(0);
   expect(await f.http("readDocumentJob",{jobId:job.jobId})).toMatchObject({state:"failed",costState:"released"});
 });
 it.each(["cancel","revoke"] as const)("refuses the final send when %s committed but its notification still cannot reach the executor",async(action)=>{
   const value=await setup({pauseInput:true,cancelUnavailable:true}),{f,job}=value;
   const execution=f.execute(job.jobId);await f.whenInputReleased();
   await stop(value,action);
   expect(f.db.database.prepare("SELECT executor_cancel_state FROM document_jobs WHERE id=?").get(job.jobId)).toEqual({executor_cancel_state:"pending"});
   expect(await f.executorRow(job.jobId)).toMatchObject({cleanup_requested:0});
   f.releaseInput();await execution;
   expect(f.providerCalls()).toBe(0);
   expect(await f.http("readDocumentJob",{jobId:job.jobId})).toMatchObject({state:"cancelled",costState:"released"});
 });
 it.each(["cancel","revoke"] as const)("stops transport when public %s wins after private input release",async(action)=>{const value=await setup({pauseInput:true}),{f,job}=value;const execution=f.execute(job.jobId);await f.whenInputReleased();await stop(value,action);expect(await f.executorRow(job.jobId)).toMatchObject({cleanup_requested:1,writer_terminated:0});f.releaseInput();await execution;expect(f.providerCalls()).toBe(0);expect(await f.http("readDocumentJob",{jobId:job.jobId})).toMatchObject({state:"cancelled",costState:"released"});expect(f.resultObjectCount()).toBe(0);});
 it.each(["cancel","revoke"] as const)("holds cost during active transport and cleans the late result after public %s",async(action)=>{const value=await setup({pauseProvider:true}),{f,job}=value;const execution=f.execute(job.jobId);await f.whenProviderStarted();await stop(value,action);expect(await f.http("readDocumentJob",{jobId:job.jobId})).toMatchObject({state:"cancel-requested",costState:"held-unknown"});expect(await f.executorRow(job.jobId)).toMatchObject({cleanup_requested:1,writer_terminated:0});f.releaseProvider();await execution;expect(f.providerCalls()).toBe(1);expect(await f.http("readDocumentJob",{jobId:job.jobId})).toMatchObject({state:"cancelled",costState:"settled",extractionId:null});expect(f.resultObjectCount()).toBe(0);});
 it.each(["cancel","revoke"] as const)("retries a failed %s notification without touching another job or consent",async(action)=>{const value=await setup({pauseInput:true,cancelUnavailable:true}),{f,job,saved}=value;const otherConsent=action==="cancel"?value.consent:await f.http("createDocumentConsent",{textVersionId:saved.textVersionId,purpose:"analysis",providerPolicyId:"qualified-policy",policyVersion:"2026.11.1",mutationId:"other-consent"});const otherJob=await f.http("createDocumentJob",{textVersionId:saved.textVersionId,consentId:otherConsent.consentId,mutationId:"other-job"});const execution=f.execute(job.jobId);await f.whenInputReleased();await stop(value,action);expect(f.db.database.prepare("SELECT executor_cancel_state FROM document_jobs WHERE id=?").get(job.jobId)).toMatchObject({executor_cancel_state:"pending"});expect(await f.executorRow(job.jobId)).toMatchObject({cleanup_requested:0});f.setCancellationAvailable();await f.freshRuntime().jobs.maintenance(10);expect(f.db.database.prepare("SELECT executor_cancel_state FROM document_jobs WHERE id=?").get(job.jobId)).toMatchObject({executor_cancel_state:"acknowledged"});expect(f.db.database.prepare("SELECT executor_cancel_state,state FROM document_jobs WHERE id=?").get(otherJob.jobId)).toMatchObject({executor_cancel_state:"none",state:"queued"});expect(f.db.database.prepare("SELECT revoked_at FROM document_processing_consents WHERE id=?").get(otherConsent.consentId)).toMatchObject({revoked_at:null});f.releaseInput();await execution;expect(f.providerCalls()).toBe(0);expect(f.resultObjectCount()).toBe(0);});
});

