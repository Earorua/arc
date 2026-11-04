import {deliverDocumentResult} from "./execute-job";
import {startDocumentWorkflow} from "./http-routes";
import type {DocumentExecutorRuntime} from "./runtime";
/** Recovery and delivery never dispatch a may-have-sent provider operation. */
export async function maintainDocumentExecutor(runtime:DocumentExecutorRuntime,options:{limit?:number;deadlineMs?:number}={}):Promise<{processed:number}>{
 const deadline=Date.now()+Math.min(5000,options.deadlineMs??5000),rows=await runtime.jobs.scan(options.limit??10);let processed=0;
 for(const row of rows){if(Date.now()>=deadline)break;await runtime.jobs.touch(row.job_id);
  try{
   if(row.dispatch_state==="not-sent"&&!row.cleanup_requested){
    await startDocumentWorkflow(runtime,row.job_id);
    if(row.paid_intent){
     const status=await (await runtime.workflow.get(row.job_id)).status();
     if(["complete","errored","terminated"].includes(status.status))await runtime.jobs.closeTerminalUnsentTurn(row.job_id);
    }
   }
   if((row.dispatch_state==="may-have-sent"&&!row.result_ready)||(row.cleanup_requested&&row.result_key&&!row.writer_terminated)){
    if(!row.result_ready&&Date.now()-row.updated_at>=240000)await runtime.site.result(row.job_id,`unknown-${row.job_id}`,{kind:"unknown",code:"connection-lost"});
    const instance=await runtime.workflow.get(row.job_id),status=await instance.status();
    if(["complete","errored","terminated"].includes(status.status)){
     await runtime.results.recoverAfterWorkflowTerminal(row.job_id);
    }
   }
   const current=await runtime.jobs.get(row.job_id);if(current?.result_ready&&current.state==="delivery-pending")await deliverDocumentResult(row.job_id,runtime);
   if(current?.cleanup_requested)await runtime.results.cleanup(row.job_id);
  }catch{/* Durable rows retain work for the next bounded sweep. No plaintext is logged. */}processed++;
 }return{processed};
}
