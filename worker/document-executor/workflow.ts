import {WorkflowEntrypoint,type WorkflowEvent,type WorkflowStep} from "cloudflare:workers";
import type {DocumentExecutorEnvironment} from "./environment";
import {DOCUMENT_PAID_STEP_CONFIG,parseDocumentWorkflowArgs,parseDocumentWorkflowOutput,type DocumentWorkflowArgs,type DocumentWorkflowOutput} from "./workflow-policy";
import {createDocumentExecutionRuntime} from "./runtime";
import {executeDocumentJob,deliverDocumentResult} from "./execute-job";
export class DocumentWorkflow extends WorkflowEntrypoint<DocumentExecutorEnvironment,DocumentWorkflowArgs>{
 async run(event:Readonly<WorkflowEvent<DocumentWorkflowArgs>>,step:WorkflowStep):Promise<DocumentWorkflowOutput>{
  try{const args=parseDocumentWorkflowArgs(event.payload);if(event.instanceId!==args.jobId)throw new Error();const runtime=createDocumentExecutionRuntime(this.env);
   const reference=parseDocumentWorkflowOutput(await step.do("document-analyze-once",DOCUMENT_PAID_STEP_CONFIG,()=>executeDocumentJob(args.jobId,runtime)));
   if(reference.state!=="delivery-pending")return reference;
   return parseDocumentWorkflowOutput(await step.do("document-deliver-stored-result",{retries:{limit:2,delay:"1 second",backoff:"constant"},timeout:"30 seconds"},()=>deliverDocumentResult(args.jobId,runtime)));
  }catch{throw new Error("Document workflow unavailable");}
 }
}
