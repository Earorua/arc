export {DocumentWorkflow,DocumentExecutorEntrypoint} from "../../../worker/document-executor/index";
import worker from "../../../worker/document-executor/index";
import type {DocumentExecutorEnvironment} from "../../../worker/document-executor/environment";
const fixtureWorker={async fetch(request:Request,env:DocumentExecutorEnvironment){if(new URL(request.url).pathname==="/test-maintain"){const pending:Promise<unknown>[]=[];worker.scheduled({} as ScheduledController,env,{waitUntil(promise:Promise<unknown>){pending.push(promise);}} as ExecutionContext);await Promise.all(pending);return Response.json({ok:true});}return worker.fetch();}};

export default fixtureWorker;


