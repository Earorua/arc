import {WorkerEntrypoint} from "cloudflare:workers";
import type {DocumentExecutorEnvironment} from "./environment";
import {createDocumentExecutorHandler} from "./http-routes";
import {createDocumentExecutionRuntime} from "./runtime";
import {maintainDocumentExecutor} from "./maintenance";
export {DocumentWorkflow} from "./workflow";
/** Only named service bindings can reach the private document protocol. */
export class DocumentExecutorEntrypoint extends WorkerEntrypoint<DocumentExecutorEnvironment>{async fetch(request:Request){return createDocumentExecutorHandler(createDocumentExecutionRuntime(this.env))(request);}}
const documentExecutorWorker={
 async fetch(){return new Response(null,{status:404,headers:{"cache-control":"no-store"}});},
 scheduled(_event:ScheduledController,env:DocumentExecutorEnvironment,context:ExecutionContext){if(env.ARC_DOCUMENT_MAINTENANCE_ENABLED==="true")context.waitUntil(maintainDocumentExecutor(createDocumentExecutionRuntime(env)));},
};

export default documentExecutorWorker;


