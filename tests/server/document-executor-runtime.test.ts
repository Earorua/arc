// @vitest-environment node
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {createDocumentExecutorFixture,type DocumentExecutorFixture} from "../helpers/document-executor-fixture";
describe("production document executor in persistent Miniflare",()=>{
 let fixture:DocumentExecutorFixture;beforeAll(async()=>{fixture=await createDocumentExecutorFixture();},30000);afterAll(async()=>{await fixture?.dispose();},30000);
 it("uses private entrypoints and persists actual provider result before delivery",async()=>{expect(await fixture.publicBridgeStatus()).toBe(404);const result=await fixture.enqueue("success","owner-success");await fixture.waitFor(result.jobId,row=>row.state==="succeeded");expect(await fixture.sends("success")).toBe(1);expect(await fixture.executorRow(result.jobId)).toMatchObject({result_ready:1,writer_terminated:1});},30000);
 it("advances one owner's queued JD and resume after browser departure",async()=>{const a=await fixture.enqueue("serial-first","owner-serial","delayed");await fixture.waitForSend("serial-first");const b=await fixture.enqueue("serial-second","owner-serial");expect(await fixture.sends("serial-second")).toBe(0);await fixture.release("serial-first");await fixture.waitFor(b.jobId,row=>row.state==="succeeded");expect(await fixture.sends("serial-first")).toBe(1);expect(await fixture.sends("serial-second")).toBe(1);expect(await fixture.row(a.jobId)).toMatchObject({state:"succeeded"});},30000);
 it("restores durable result delivery after a process restart without resending",async()=>{const result=await fixture.enqueue("delivery","owner-delivery","delivery-failure");await fixture.waitForExecutor(result.jobId,row=>row.result_ready===1);await fixture.restart();await fixture.release("delivery");await fixture.maintain();await fixture.waitFor(result.jobId,row=>row.state==="succeeded");expect(await fixture.sends("delivery")).toBe(1);},40000);
 it("holds unknown cost through maintenance without another send",async()=>{const result=await fixture.enqueue("unknown","owner-unknown","unknown");await fixture.waitFor(result.jobId,row=>row.state==="cost-unknown");await fixture.maintain();expect(await fixture.sends("unknown")).toBe(1);expect(await fixture.row(result.jobId)).toMatchObject({execution_slot:1});},30000);
 it.each(["cancel","revoke"] as const)("stops the production HTTP transport when %s wins after input release",async(action)=>{const id=`before-send-${action}`,result=await fixture.enqueue(id,`owner-${id}`,"input-gated");await fixture.waitForInput(id);await fixture.invalidate(result.jobId,action);expect(await fixture.executorRow(result.jobId)).toMatchObject({cleanup_requested:1});await fixture.release(id);await fixture.waitFor(result.jobId,row=>row.state==="cancelled"&&row.dispatch_state==="not-sent");await fixture.waitForExecutor(result.jobId,row=>row.result_key===null&&row.writer_terminated===1);expect(await fixture.sends(id)).toBe(0);},30000);
 it("restarts inside the paid request without replaying it",async()=>{const result=await fixture.enqueue("crash","owner-crash","delayed");await fixture.waitForSend("crash");await fixture.restart();await fixture.recoverLost(result.jobId);expect(await fixture.sends("crash")).toBe(1);expect(await fixture.row(result.jobId)).toMatchObject({state:"cost-unknown",execution_slot:1});},40000);
 it.each(["cancel","revoke","delete","revision"] as const)("rejects a late candidate after %s and still settles its receipt",async(action)=>{const id=`late-${action}`,result=await fixture.enqueue(id,`owner-${id}`,"delayed");await fixture.waitForSend(id);await fixture.invalidate(result.jobId,action);await fixture.release(id);await fixture.waitFor(result.jobId,row=>row.dispatch_state==="settled");expect((await fixture.row(result.jobId)).extraction_id).toBeNull();expect(await fixture.sends(id)).toBe(1);if(action==="cancel"||action==="revoke")await fixture.waitForExecutor(result.jobId,row=>row.result_key===null&&row.writer_terminated===1);if(action==="delete"){await fixture.maintain();expect(await fixture.cleanup(result.jobId)).toEqual({writersTerminated:true,resultsAbsent:true});}},30000);
 it("keeps real Workflow persisted arguments and outputs free of private document data",async()=>{const evidence=await fixture.evidence();expect(evidence.persistedCells).toBeGreaterThan(0);expect(evidence.privateMatches).toBe(0);expect(evidence.outboundCalls).toBe(0);},30000);
});

it("persists UI case admission across a real Worker restart and rejects a second job for the registered version", async()=>{
 const f=await createDocumentExecutorFixture("live-stub");
 try{
   const owner="Owner_1",cases=await f.registerRun(owner);
   const first=await f.enqueueCase(owner,cases[0]!,"first-case");
   await f.waitFor(first.jobId,row=>row.state==="succeeded");
   expect(await f.sends(cases[0]!.caseId)).toBe(1);
   await f.restart();
   const duplicate=await f.enqueueCase(owner,cases[0]!,"new-job-same-case");
   await f.waitFor(duplicate.jobId,row=>row.state==="failed"&&row.dispatch_state==="not-sent");
   const next=await f.enqueueCase(owner,cases[1]!,"next-case");
   await f.waitFor(next.jobId,row=>row.state==="succeeded");
   expect(await f.sends(cases[0]!.caseId)).toBe(1);
   expect(await f.sends(cases[1]!.caseId)).toBe(1);
   await f.holdCase(cases[2]!.caseId);
   const interrupted=await f.enqueueCase(owner,cases[2]!,"interrupted-case");
   await f.waitForSend(cases[2]!.caseId);
   await f.restart();
   await f.recoverLost(interrupted.jobId);
   expect(await f.caseDispatch(cases[2]!.caseId)).toMatchObject({state:"pending",receipt_id:null});
   await f.enqueueCase(owner,cases[3]!,"after-interruption");
   await f.maintain();
   expect(await f.sends(cases[2]!.caseId)).toBe(1);
   expect(await f.sends(cases[3]!.caseId)).toBe(0);
 }finally{await f.dispose();}
},90000);
