import {fixtureGenerationResponse} from "./document-generation-response";
import {applyDocumentExecutorMigrations,createMaterialsD1,seedUser} from "./materials-d1";
import {memoryBucket as bucket} from "./document-bucket";
import {SqliteD1} from "./sqlite-d1";
import {materialSourceResolver} from "./material-planning";
import {flagshipBlueprint} from "../../app/data/flagship-blueprint";
import {documentEndpointContracts,type DocumentEndpoint,type DocumentEndpointRequest,type DocumentEndpointResponse} from "../../app/contracts/documents-api";
import {createDocumentRuntime} from "../../app/server/documents/runtime";
import {createDocumentRoute} from "../../app/server/http/document-route-factories";
import {readDocumentPolicy} from "../../app/server/documents/policy";
import {D1DocumentNonceStore} from "../../app/server/documents/executor-bridge";
import {D1DocumentJobStore} from "../../worker/document-executor/d1-job-store";
import {DocumentResultStore} from "../../worker/document-executor/result-store";
import {DocumentSiteClient} from "../../worker/document-executor/site-client";
import {HttpDocumentAnalysisProvider,type DocumentProviderQualification} from "../../worker/document-executor/provider-http";
import {createDocumentExecutorHandler} from "../../worker/document-executor/http-routes";
import {executeDocumentJob,deliverDocumentResult} from "../../worker/document-executor/execute-job";
import type {DocumentExecutorRuntime} from "../../worker/document-executor/runtime";

function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return{promise,resolve};}
/** Actual HTTP route/service/DB/R2 protocols, with only network and Workflow scheduling replaced. */
export async function createMaterialAnalysisFixture(options:{pauseInput?:boolean;pauseProvider?:boolean;cancelUnavailable?:boolean;permitUnavailable?:boolean}={}){
 const inputEntered=deferred(),inputContinue=deferred(),providerEntered=deferred(),providerContinue=deferred();const executions:Promise<void>[]=[];let cancelUnavailable=options.cancelUnavailable??false;
 if(!options.pauseInput)inputContinue.resolve();if(!options.pauseProvider)providerContinue.resolve();
 const db=createMaterialsD1(),executorDb=new SqliteD1();applyDocumentExecutorMigrations(executorDb);seedUser(db,"owner-a");seedUser(db,"owner-b");
 db.database.prepare("INSERT INTO career_goals(id,user_id,role_id,level,weekly_minutes,target_weeks,status,active_slot,created_at,updated_at) VALUES ('goal-a','owner-a','ai-native-full-stack-engineer','beginner',420,52,'active',1,0,0)").run();
 const assets=bucket(),resultsBucket=bucket(),routingPolicy={policyVersion:"2026.11.1",providerOrder:["qualified-route"],allowFallback:false as const,dataPolicy:"zdr-only" as const},secret="offline-only-material-key-with-at-least-32-characters";
 const qualification:DocumentProviderQualification={qualified:true,endpoint:"https://no-network.invalid/chat/completions",model:"qualified-model",providerPolicyId:"qualified-policy",priceVersion:"2026.11.1",routingPolicy,receiptRoute:{providerName:"Fixture Provider",endpointId:"fixture-endpoint"},inputMicroUsdPerMillionTokens:100000,outputMicroUsdPerMillionTokens:200000,inputTokenBound:"utf8-bytes-plus-4096"};
 const environment={DB:db as unknown as D1Database,DOCUMENT_ASSETS:assets,ARC_DOCUMENTS_ENABLED:"true",ARC_DOCUMENT_ANALYSIS_ENABLED:"true",ARC_DOCUMENT_PLANNING_ENABLED:"true",ARC_DOCUMENT_PROVIDER:"openrouter",ARC_DOCUMENT_MODEL:qualification.model,ARC_DOCUMENT_PROVIDER_ENDPOINT:qualification.endpoint,ARC_DOCUMENT_PROVIDER_POLICY_ID:qualification.providerPolicyId,ARC_DOCUMENT_ROUTING_POLICY:JSON.stringify(routingPolicy),ARC_DOCUMENT_PRICE_VERSION:qualification.priceVersion,ARC_DOCUMENT_USER_DAILY_MICRO_USD:"100000",ARC_DOCUMENT_GLOBAL_DAILY_MICRO_USD:"1000000",ARC_DOCUMENT_MAX_JOB_MICRO_USD:"10000",ARC_DOCUMENT_MAX_INPUT_TOKENS:"16000",ARC_DOCUMENT_MAX_OUTPUT_TOKENS:"4096",ARC_DOCUMENT_HTTP_TIMEOUT_MS:"1000",ARC_DOCUMENT_BRIDGE_SECRET:secret,ARC_DOCUMENT_PROVIDER_QUALIFICATION:JSON.stringify(qualification)};
 const binding={fetch:(request:Request)=>cancelUnavailable&&new URL(request.url).pathname.endsWith("/cancel")?Promise.resolve(new Response(null,{status:503})):createDocumentExecutorHandler(executor)(request)};
 const freshRuntime=()=>createDocumentRuntime({...environment,DOCUMENT_EXECUTOR:binding},{sourceResolver:materialSourceResolver()}),runtime=freshRuntime();
 const jobs=new D1DocumentJobStore(executorDb as unknown as D1Database),results=new DocumentResultStore(jobs,resultsBucket as unknown as R2Bucket),skillId=flagshipBlueprint.skills.at(-1)!.id,text=`PRIVATE-MATERIAL-SENTINEL-7f91\nMust have ${skillId}.`;let calls=0;
 const provider=new HttpDocumentAnalysisProvider(readDocumentPolicy({...environment,ARC_DOCUMENT_PROVIDER_API_KEY:"synthetic-key"}).analysis!,{qualification,fetch:async(url,init)=>{if(init?.method==="GET")return fixtureGenerationResponse(new URL(String(url)).searchParams.get("id")!,qualification.model);calls++;providerEntered.resolve();await providerContinue.promise;return Response.json({id:"synthetic-receipt",model:qualification.model,choices:[{message:{content:JSON.stringify({schemaVersion:"2026.11.1",items:[{id:"requirement",kind:"requirement",text:skillId,skillLabels:[skillId],requirementLevel:"must",selfLevelHint:null,source:{segmentId:"segment-1",quote:`Must have ${skillId}.`}}],reviewPoints:[]})}}],usage:{prompt_tokens:100,completion_tokens:20,cost:0.000007}});}});
 const executor:DocumentExecutorRuntime={jobs,results,provider,secret,nonces:new D1DocumentNonceStore(executorDb as unknown as D1Database),site:new DocumentSiteClient({binding:{fetch:async request=>{if(options.permitUnavailable && new URL(request.url).pathname.endsWith("/permit"))return new Response(null,{status:503});const response=await runtime.privateHandler(request);if(response.ok&&new URL(request.url).pathname.endsWith("/input")){inputEntered.resolve();await inputContinue.promise;}return response;}},secret}),workflow:{create:async({id}:{id:string})=>({id}),get:async(id:string)=>({id,status:async()=>({status:"complete"})})} as unknown as DocumentExecutorRuntime["workflow"]};
 async function http<K extends DocumentEndpoint>(endpoint:K,input:DocumentEndpointRequest<K>,ownerId="owner-a"):Promise<DocumentEndpointResponse<K>>{
  const contract=documentEndpointContracts[endpoint],body={...input} as Record<string,unknown>,params:Record<string,string>={};const path=contract.path.replace(/\[([A-Za-z]+)\]/gu,(_match,key:string)=>{const value=String(body[key]);params[key]=value;delete body[key];return encodeURIComponent(value);});
  const url=new URL(path,"https://arc.test");if(contract.method==="GET")for(const [key,value]of Object.entries(body))if(value!==undefined)url.searchParams.set(key,String(value));
  const response=await createDocumentRoute(endpoint,{requireUser:async()=>({id:ownerId}),configuredOrigin:()=>"https://arc.test",createService:()=>runtime,rateLimiter:{reserve:async()=>({allowed:true})}})(new Request(url,{method:contract.method,headers:contract.method==="GET"?{}:{origin:"https://arc.test","content-type":"application/json"},...(contract.method==="GET"?{}:{body:JSON.stringify(body)})}),{params});
  const payload=await response.json();if(!response.ok)throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);return payload as DocumentEndpointResponse<K>;
 }
 return{db,executorDb,runtime,freshRuntime,http,text,providerCalls:()=>calls,privateObjectCount:()=>assets.objects.size+resultsBucket.objects.size,resultObjectCount:()=>resultsBucket.objects.size,executorRow:(jobId:string)=>jobs.get(jobId),whenInputReleased:()=>inputEntered.promise,releaseInput:inputContinue.resolve,whenProviderStarted:()=>providerEntered.promise,releaseProvider:providerContinue.resolve,setCancellationAvailable:()=>{cancelUnavailable=false;},execute(jobId:string){const execution=(async()=>{await executeDocumentJob(jobId,executor);await deliverDocumentResult(jobId,executor);})();executions.push(execution);return execution;},async dispose(){inputContinue.resolve();providerContinue.resolve();await Promise.allSettled(executions);db.close();executorDb.close();}};
}

