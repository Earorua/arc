// @vitest-environment node
import {afterEach,describe,expect,it,vi} from "vitest";
import {SqliteD1} from "../helpers/sqlite-d1";
import {applyDocumentExecutorMigrations} from "../helpers/materials-d1";
import {memoryBucket} from "../helpers/document-bucket";
import {readFileSync} from "node:fs";
import {D1DocumentJobStore} from "../../worker/document-executor/d1-job-store";
import {DocumentResultStore} from "../../worker/document-executor/result-store";
import {executeDocumentJob,deliverDocumentResult,type DocumentExecutorSiteClient} from "../../worker/document-executor/execute-job";
import {maintainDocumentExecutor} from "../../worker/document-executor/maintenance";
const databases:SqliteD1[]=[];afterEach(()=>databases.splice(0).forEach(db=>db.close()));
function setup(){
 const db=new SqliteD1();databases.push(db);applyDocumentExecutorMigrations(db);
 const bucket=memoryBucket(),objects=bucket.objects;
 const jobs=new D1DocumentJobStore(db as unknown as D1Database);
 const results=new DocumentResultStore(jobs,bucket as unknown as R2Bucket);
 const provider={analyze:vi.fn(async()=>({kind:"received" as const,candidate:{schemaVersion:"2026.11.1",items:[]},inputTokens:1,outputTokens:1,actualMicroUsd:7,receiptId:"receipt"}))};const site={permit:vi.fn(async()=>true),claim:vi.fn(async()=>({claimed:true})),input:vi.fn(async()=>({textVersionId:"text",text:"PRIVATE-MATERIAL-SENTINEL-7f91",segments:[{id:"segment",start:0,end:31}],kind:"resume" as const,providerPolicyId:"policy",outputSchemaVersion:"2026.11.1" as const})),result:vi.fn<DocumentExecutorSiteClient["result"]>(async()=>({jobId:"job",state:"succeeded",resultRef:"extraction"}))};return {db,bucket,objects,jobs,results,provider,site};
}
describe("production durable document runner",()=>{
 it("a manually set termination flag cannot release an unfenced executor completion", async () => {
   const f=setup(), entered=Promise.withResolvers<void>(), release=Promise.withResolvers<void>();
   const results=new DocumentResultStore(f.jobs,{...f.bucket,async createMultipartUpload(key) {
     const upload=await f.bucket.createMultipartUpload(key);
     return {...upload,async complete(parts){entered.resolve();await release.promise;return upload.complete(parts);}};
   }});
   await f.jobs.admit("job");await f.jobs.claim("job");
   const saving=results.save("job",{kind:"unknown",code:"connection-lost"}).then(()=>"accepted",()=>"rejected");
   await entered.promise;await f.jobs.requestCleanup("job");
   f.db.database.exec("UPDATE document_executor_jobs SET writer_terminated=1 WHERE job_id='job'");
   expect(await results.cleanup("job")).toEqual({writersTerminated:true,resultsAbsent:true});
   release.resolve();
   expect(await saving).toBe("rejected");
   expect(f.objects.size).toBe(0);
   for (const value of ["NULL","'replacement'","''"])
     expect(()=>f.db.database.exec("UPDATE document_executor_jobs SET result_upload_id="+value+" WHERE job_id='job'")).toThrow(/closed/u);
 });
 it("seals an enrolled result handle while its original completion is in flight", async () => {
   const f=setup(), entered=Promise.withResolvers<void>(), release=Promise.withResolvers<void>();
   const results=new DocumentResultStore(f.jobs,{...f.bucket,async createMultipartUpload(key) {
     const native=await f.bucket.createMultipartUpload(key);
     return {...native,async complete(parts){entered.resolve();await release.promise;return native.complete(parts);}};
   }});
   await f.jobs.admit("job");await f.jobs.claim("job");
   const saving=results.save("job",{kind:"received",candidate:{schemaVersion:"2026.11.1",items:[]},inputTokens:1,outputTokens:1,actualMicroUsd:7,receiptId:"receipt"});
   await entered.promise;
   await f.jobs.requestCleanup("job");
   let status="running";
   const runtime={...f,results,workflow:{get:async()=>({status:async()=>({status})})}} as unknown as Parameters<typeof maintainDocumentExecutor>[0];
   await maintainDocumentExecutor(runtime);
   expect(await results.cleanup("job")).toEqual({writersTerminated:false,resultsAbsent:false});
   status="terminated";
   await Promise.all([maintainDocumentExecutor(runtime),maintainDocumentExecutor(runtime)]);
   expect(await results.cleanup("job")).toEqual({writersTerminated:true,resultsAbsent:true});
   release.resolve();
   await expect(saving).rejects.toThrow();
   expect(f.objects.size).toBe(0);
   expect(f.site.result.mock.calls[0]?.[2]).toMatchObject({kind:"received",actualMicroUsd:7,candidate:null});
   expect(f.provider.analyze).not.toHaveBeenCalled();
 });
 it("preserves a pre-upgrade ambiguous recovery writer as a hold even when its key was cleared", async () => {
   const db=new SqliteD1();databases.push(db);
   const migration=(name:string)=>db.database.exec(readFileSync("worker/document-executor/migrations/"+name,"utf8"));
   migration("0000_document_executor.sql");
   db.database.exec(`INSERT INTO document_executor_jobs(job_id,state,dispatch_state,result_ref,result_ready,writer_terminated,cleanup_requested,created_at,updated_at)
     VALUES('old-job','running','may-have-sent','old-ref',0,1,1,1,1)`);
   migration("0001_document_acceptance.sql");migration("0002_document_result_uploads.sql");
   const jobs=new D1DocumentJobStore(db as unknown as D1Database),bucket=memoryBucket(),results=new DocumentResultStore(jobs,bucket);
   const key="document-results/old-job/old-ref";
   expect(await jobs.get("old-job")).toMatchObject({result_key:key,legacy_recovery_hold:1,writer_terminated:0});
   await bucket.put(key,JSON.stringify({kind:"unknown",code:"connection-lost"}));
   await results.recoverAfterWorkflowTerminal("old-job");
   expect(await results.cleanup("old-job")).toEqual({writersTerminated:false,resultsAbsent:false});
   expect(await bucket.get(key)).not.toBeNull();
 });
 it("never opens a recovery writer after terminal evidence and concurrent cleanup", async () => {
   const f=setup();
   await f.jobs.admit("job"); await f.jobs.claim("job");
   await f.jobs.beginResult("job",{kind:"received",candidate:null,inputTokens:1,outputTokens:1,actualMicroUsd:7,receiptId:"receipt"});
   await f.jobs.requestCleanup("job");
   const publications: string[]=[];
   const bucket={
     ...f.bucket,
     async put(key:string,body:string) {
       publications.push(key);
       expect(await results.cleanup("job")).toEqual({writersTerminated:true,resultsAbsent:true});
       f.objects.set(key,body);
     },
     async get(key:string){return f.objects.has(key)?{text:async()=>f.objects.get(key)!}:null;},
     async delete(key:string){f.objects.delete(key);}
   };
   const results=new DocumentResultStore(f.jobs,bucket as unknown as R2Bucket);
   const runtime={...f,results,workflow:{get:async()=>({status:async()=>({status:"errored"})})}} as unknown as Parameters<typeof maintainDocumentExecutor>[0];
   await maintainDocumentExecutor(runtime);
   expect(publications).toEqual([]);
   expect(f.objects.size).toBe(0);
   expect(await f.jobs.get("job")).toMatchObject({result_key:null,accounting_only:1});
   expect(f.site.result.mock.calls[0]?.[2]).toMatchObject({kind:"received",actualMicroUsd:7,candidate:null});
 });
 it("does not claim absence for an old raw result PUT that has not committed when its Workflow becomes terminal", async () => {
   const f=setup();
   await f.jobs.admit("job"); await f.jobs.claim("job");
   const ref="legacy-ref", key="document-results/job/"+ref;
   f.db.database.prepare("UPDATE document_executor_jobs SET result_ref=?,result_key=?,accounting_json=? WHERE job_id='job'")
     .run(ref,key,JSON.stringify({kind:"unknown",code:"connection-lost"}));
   await f.jobs.requestCleanup("job");
   const runtime={...f,workflow:{get:async()=>({status:async()=>({status:"terminated"})})}} as unknown as Parameters<typeof maintainDocumentExecutor>[0];
   await maintainDocumentExecutor(runtime);
   expect(await f.results.cleanup("job")).toEqual({writersTerminated:false,resultsAbsent:false});
   expect(await f.jobs.get("job")).toMatchObject({result_key:key,writer_terminated:0});
   expect(f.site.result.mock.calls[0]?.[2]).toMatchObject({kind:"unknown"});
   // The provider can still commit the issued legacy PUT. Positive readback now supplements terminal status.
   f.objects.set(key,JSON.stringify({kind:"unknown",code:"connection-lost"}));
   await maintainDocumentExecutor(runtime);
   expect(await f.results.cleanup("job")).toEqual({writersTerminated:true,resultsAbsent:true});
   expect(f.objects.size).toBe(0);
 });
 it("recovers authoritative accounting when the process lost a result-object write",async()=>{const f=setup();await f.jobs.admit("job");await f.jobs.claim("job");await f.jobs.beginResult("job",{kind:"received",candidate:{schemaVersion:"2026.11.1",items:[]},inputTokens:1,outputTokens:1,actualMicroUsd:7,receiptId:"receipt"});const runtime={...f,workflow:{get:async()=>({status:async()=>({status:"errored"})})}} as unknown as Parameters<typeof maintainDocumentExecutor>[0];await maintainDocumentExecutor(runtime);expect(f.site.result.mock.calls[0]?.[2]).toMatchObject({kind:"received",actualMicroUsd:7,receiptId:"receipt"});expect(f.provider.analyze).not.toHaveBeenCalled();});
 it("deduplicates dispatch and recovers stored delivery without another provider call",async()=>{const f=setup();await f.jobs.admit("job");await Promise.all([executeDocumentJob("job",f),executeDocumentJob("job",f)]);expect(f.provider.analyze).toHaveBeenCalledTimes(1);f.site.result.mockRejectedValueOnce(new Error("offline"));expect(await deliverDocumentResult("job",f)).toMatchObject({state:"delivery-pending"});expect(await deliverDocumentResult("job",f)).toMatchObject({state:"succeeded"});expect(f.provider.analyze).toHaveBeenCalledTimes(1);expect(JSON.stringify(await f.jobs.get("job"))).not.toContain("PRIVATE-MATERIAL");});
 it("keeps a durable may-have-sent fence without running provider again after a lost process",async()=>{const f=setup();await f.jobs.admit("job");expect(await f.jobs.claim("job")).toBe(true);expect(await executeDocumentJob("job",f)).toMatchObject({state:"already-claimed"});expect(f.provider.analyze).not.toHaveBeenCalled();});
 it("marks cancellation before put and removes late result objects only when writer terminates",async()=>{const f=setup();await f.jobs.admit("job");f.provider.analyze.mockImplementationOnce(async()=>{await f.jobs.requestCleanup("job");return{kind:"received",candidate:{schemaVersion:"2026.11.1",items:[]},inputTokens:1,outputTokens:1,actualMicroUsd:7,receiptId:"receipt"};});await executeDocumentJob("job",f);await f.results.cleanup("job");expect(f.objects.size).toBe(0);expect(await f.jobs.get("job")).toMatchObject({writer_terminated:1,cleanup_requested:1});});
});

