import {z} from "zod";
import {materialIdSchema} from "../../app/contracts/documents";
import {verifyDocumentBridgeRequest} from "../../app/server/documents/executor-bridge";
import {parseDocumentWorkflowArgs} from "./workflow-policy";
import type {DocumentExecutorRuntime} from "./runtime";
export async function startDocumentWorkflow(runtime:DocumentExecutorRuntime,jobId:string):Promise<void>{
 const row=await runtime.jobs.get(jobId);if(!row||row.cleanup_requested||row.dispatch_state!=="not-sent")return;
 try{await runtime.workflow.create({id:jobId,params:{jobId,contractVersion:"2026.11.1"}});}catch{await runtime.workflow.get(jobId);}
}
export function createDocumentExecutorHandler(runtime:DocumentExecutorRuntime){return async(request:Request):Promise<Response>=>{try{
 const verified=await verifyDocumentBridgeRequest(request,{secret:runtime.secret,direction:"site-to-executor",nonces:runtime.nonces});
 if(verified.operation==="claim"){const args=parseDocumentWorkflowArgs(verified.body);await runtime.jobs.admit(args.jobId);await startDocumentWorkflow(runtime,args.jobId);return Response.json({jobId:args.jobId,accepted:true},{headers:{"cache-control":"no-store"}});}
 const {jobId}=z.object({jobId:materialIdSchema}).strict().parse(verified.body);
 if(verified.operation==="cancel"){await runtime.jobs.requestCleanup(jobId);return Response.json(await runtime.results.cleanup(jobId),{headers:{"cache-control":"no-store"}});}
 if(verified.operation==="status"){const row=await runtime.jobs.get(jobId);return Response.json({jobId,state:row?.state??"closed"},{headers:{"cache-control":"no-store"}});}
 return new Response(null,{status:404});
 }catch{return Response.json({error:"unavailable"},{status:503,headers:{"cache-control":"no-store"}});}};}
