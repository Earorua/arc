import {mkdtemp,readFile,readdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,sep} from "node:path";
import {documentAcceptanceCorpusSha256,utf8Sha256} from "../../worker/document-executor/acceptance-policy";
import {renderDocumentAcceptanceEnrollment} from "../../scripts/materials-ui-acceptance-enroll";
import {readDocumentSitePolicy} from "../../app/server/documents/policy";
import corpus from "../fixtures/documents/quality-corpus.json";
import {DatabaseSync} from "node:sqlite";
import {productionFixtureSettings} from "./document-production";
import {build} from "esbuild";
import {Miniflare} from "miniflare";
type Row=Record<string,string|number|null>;
export async function createDocumentExecutorFixture(mode:"ordinary"|"live-stub"|"production-stub"="ordinary"){
 const parent=resolve(tmpdir()),directory=await mkdtemp(join(parent,"arc-document-runtime-")),siteBundle=join(directory,"site.mjs"),executorBundle=join(directory,"executor.mjs");let runtime:Miniflare|undefined;let outboundCalls=0;
 const routingPolicy={policyVersion:"2026.11.1",providerOrder:["fixture-route"],allowFallback:false,dataPolicy:"zdr-only"};
 let live=mode==="live-stub";
 const runId="miniflare-ui-round";
 const acceptanceBindings={...(live?{ARC_ENVIRONMENT:"production",ARC_DOCUMENT_ACCEPTANCE_MODE:"live",ARC_DOCUMENT_ACCEPTANCE_RUN_ID:runId}:{}),ARC_DOCUMENTS_ENABLED:"true",ARC_DOCUMENT_ANALYSIS_ENABLED:"true",ARC_DOCUMENT_PROVIDER:"openrouter",ARC_DOCUMENT_MODEL:"fixture-model",ARC_DOCUMENT_PROVIDER_API_KEY:"fixture-only",ARC_DOCUMENT_PROVIDER_ENDPOINT:"https://no-network.invalid/chat/completions",ARC_DOCUMENT_PROVIDER_POLICY_ID:"fixture-policy",ARC_DOCUMENT_ROUTING_POLICY:JSON.stringify(routingPolicy),ARC_DOCUMENT_PRICE_VERSION:"2026.11.1",ARC_DOCUMENT_USER_DAILY_MICRO_USD:"100000",ARC_DOCUMENT_GLOBAL_DAILY_MICRO_USD:"1000000",ARC_DOCUMENT_MAX_JOB_MICRO_USD:"10000",ARC_DOCUMENT_MAX_INPUT_TOKENS:"16000",ARC_DOCUMENT_MAX_OUTPUT_TOKENS:"4096",ARC_DOCUMENT_HTTP_TIMEOUT_MS:"10000",ARC_DOCUMENT_BRIDGE_SECRET:"offline-document-bridge-key-at-least-32-characters",ARC_DOCUMENT_MAINTENANCE_ENABLED:"true",ARC_DOCUMENT_PROVIDER_QUALIFICATION:JSON.stringify({qualified:true,endpoint:"https://no-network.invalid/chat/completions",model:"fixture-model",providerPolicyId:"fixture-policy",priceVersion:"2026.11.1",routingPolicy,receiptRoute:{providerName:"Fixture Provider",endpointId:"fixture-endpoint"},inputMicroUsdPerMillionTokens:100000,outputMicroUsdPerMillionTokens:200000,inputTokenBound:"utf8-bytes-plus-4096"})};
 const production = mode==="production-stub" ? await productionFixtureSettings() : null;
 let bindings: Record<string,string> = {...acceptanceBindings,...production?.environment};
 if(production)bindings.ARC_DOCUMENT_PRODUCTION_AUTHORIZATION=JSON.stringify({...production.authorization,totalBudgetMicroUsd:280000});
 let siteBindings: Record<string,string> = {...bindings};delete siteBindings.ARC_DOCUMENT_PROVIDER_API_KEY;
 const publicTransport = () => live || mode==="production-stub";
 async function open(){runtime=new Miniflare({cf:false,d1Persist:join(directory,"d1"),r2Persist:join(directory,"r2"),workflowsPersist:join(directory,"workflows"),workers:[{name:"site",modules:true,modulesRoot:directory,scriptPath:siteBundle,compatibilityDate:"2026-05-15",bindings:siteBindings,d1Databases:{SITE_DB:"document-site"},r2Buckets:{DOCUMENT_ASSETS:"document-assets"},serviceBindings:{DOCUMENT_EXECUTOR:{name:"executor",entrypoint:"DocumentExecutorEntrypoint"}},outboundService:async()=>{outboundCalls++;throw new Error("No outbound requests");}},{name:"executor",modules:true,modulesRoot:directory,scriptPath:executorBundle,compatibilityDate:"2026-05-15",bindings,d1Databases:{DOCUMENT_EXECUTOR_DB:"document-executor"},r2Buckets:{DOCUMENT_JOB_ASSETS:"document-results"},workflows:{DOCUMENT_WORKFLOW:{name:"document-workflow",className:"DocumentWorkflow"}},serviceBindings:{DOCUMENT_SITE:{name:"site",entrypoint:"DocumentTestSite"},...(publicTransport()?{}:{DOCUMENT_PROVIDER_TRANSPORT:{name:"site",entrypoint:"DocumentFakeTransport"}})},outboundService:publicTransport()?{name:"site",entrypoint:"DocumentFakeTransport"}:async()=>{outboundCalls++;throw new Error("No outbound requests");}}]});await runtime.ready;}
 async function close(){await runtime?.dispose();runtime=undefined;}
 async function cleanup(){const target=resolve(directory);if(!target.startsWith(parent+sep)||!target.slice(parent.length+1).startsWith("arc-document-runtime-"))throw new Error("Unsafe cleanup");await rm(target,{recursive:true,force:true});}
 async function siteDb(){return runtime!.getD1Database("SITE_DB","site");}async function executorDb(){return runtime!.getD1Database("DOCUMENT_EXECUTOR_DB","executor");}
 async function row(jobId:string){return (await(await siteDb()).prepare("SELECT * FROM document_jobs WHERE id=?").bind(jobId).first<Row>())!;}
 async function executorRow(jobId:string){return (await(await executorDb()).prepare("SELECT * FROM document_executor_jobs WHERE job_id=?").bind(jobId).first<Row>())!;}
 async function waitFor(jobId:string,predicate:(row:Row)=>boolean,executor=false){const until=Date.now()+18000;while(Date.now()<until){const value=await(executor?executorRow(jobId):row(jobId));if(value&&predicate(value))return value;await new Promise(resolveWait=>setTimeout(resolveWait,40));}throw new Error(`Condition timed out for ${jobId}: ${JSON.stringify(await(executor?executorRow(jobId):row(jobId)))}`);}
 async function sends(id:string){return (await(await siteDb()).prepare("SELECT sends FROM fixture_controls WHERE id=?").bind(id).first<{sends:number}>())?.sends??0;}
 async function fixturePost(path:string,body:unknown){
   const response=await runtime!.dispatchFetch("http://localhost/"+path,{method:"POST",body:JSON.stringify(body)});
   if(!response.ok)throw new Error("Fixture failed: "+path);
   return response;
 }
 async function registerRun(owner:string){
   if(!live)throw new Error("Synthetic admission fixture required");
   const cases=[];
   for(const doc of corpus.documents){
     const response=await fixturePost("prepare-case",{owner,caseId:doc.id,kind:doc.kind,text:doc.text});
     const {documentId,documentVersionId,textVersionId}=await response.json() as {documentId:string;documentVersionId:string;textVersionId:string};
     cases.push({caseId:doc.id,documentId,documentVersionId,textVersionId,generation:0,textSha256:await utf8Sha256(doc.text)});
   }
   const sql=await renderDocumentAcceptanceEnrollment({runId,ownerId:owner,corpusSha256:documentAcceptanceCorpusSha256,
     maxRequests:24,totalBudgetMicroUsd:500000,approvedAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),
     config:readDocumentSitePolicy(bindings).analysis,qualification:JSON.parse(bindings.ARC_DOCUMENT_PROVIDER_QUALIFICATION),cases});
   await (await executorDb()).prepare(sql).run();
   return cases;
 }
 async function enqueueCase(owner:string,row:{caseId:string;textVersionId:string},mutationId:string){
   return (await fixturePost("case-job",{owner,caseId:row.caseId,textVersionId:row.textVersionId,mutationId})).json() as Promise<{jobId:string}>;
 }
 try{
  await Promise.all([build({entryPoints:[resolve("tests/fixtures/documents/executor-runtime-site.ts")],outfile:siteBundle,bundle:true,platform:"neutral",format:"esm",target:"es2022",external:["cloudflare:*"],logLevel:"silent"}),build({entryPoints:[resolve("tests/fixtures/documents/executor-runtime-entry.ts")],outfile:executorBundle,bundle:true,platform:"neutral",format:"esm",target:"es2022",external:["cloudflare:*"],logLevel:"silent"})]);await open();
  for(const name of (await readdir(resolve("drizzle"))).filter(name=>/^\d{4}_.+\.sql$/u.test(name)&&Number(name.slice(0,4))<=15).sort()){const sql=await readFile(resolve("drizzle",name),"utf8");for(const statement of sql.split("--> statement-breakpoint").map(value=>value.trim()).filter(Boolean))await(await siteDb()).prepare(statement).run();}
  await(await siteDb()).prepare("CREATE TABLE fixture_controls(id TEXT PRIMARY KEY,document_id TEXT,mode TEXT,sends INTEGER,released INTEGER,input_released INTEGER NOT NULL DEFAULT 0)").run();
  const migrations=resolve("worker/document-executor/migrations");for(const file of (await readdir(migrations)).filter(name=>name.endsWith(".sql")).sort()){const sql=await readFile(join(migrations,file),"utf8");for(const statement of sql.split(sql.includes("--> statement-breakpoint")?"--> statement-breakpoint":";").map(value=>value.trim()).filter(Boolean))await(await executorDb()).prepare(statement).run();}
 }catch(error){await close();await cleanup();throw error;}
 async function holdCase(caseId:string){await (await siteDb()).prepare("UPDATE fixture_controls SET mode='delayed' WHERE id=?").bind(caseId).run();}
 async function caseDispatch(caseId:string){return (await executorDb()).prepare("SELECT state,receipt_id FROM document_acceptance_dispatches WHERE run_id=? AND case_id=?").bind(runId,caseId).first<Row>();}
 return{registerRun,enqueueCase,holdCase,caseDispatch,
 async productionDispatch(id:string){return (await executorDb()).prepare("SELECT state,receipt_id,actual_micro_usd FROM document_production_dispatches WHERE job_id=?").bind(id).first<Row>();},
 async rotateProductionGrant(){if(!production)throw new Error("production stub required");await close();bindings.ARC_DOCUMENT_PRODUCTION_AUTHORIZATION=JSON.stringify({...production.authorization,id:"rotated-fixture-grant"});siteBindings.ARC_DOCUMENT_PRODUCTION_AUTHORIZATION=bindings.ARC_DOCUMENT_PRODUCTION_AUTHORIZATION;await open();},
 async switchToB4(){if(!production)throw new Error("production stub required");await close();live=true;bindings={...acceptanceBindings,ARC_ENVIRONMENT:"production",ARC_DOCUMENT_ACCEPTANCE_MODE:"live",ARC_DOCUMENT_ACCEPTANCE_RUN_ID:runId};siteBindings={...bindings};delete siteBindings.ARC_DOCUMENT_PROVIDER_API_KEY;await open();},async invalidate(jobId:string,action:string){const response=await runtime!.dispatchFetch("http://localhost/invalidate",{method:"POST",body:JSON.stringify({jobId,action})});if(!response.ok)throw new Error(await response.text());},async cleanup(jobId:string){const response=await runtime!.dispatchFetch("http://localhost/cleanup",{method:"POST",body:JSON.stringify({jobId})});return response.json();},async recoverLost(jobId:string){await(await executorDb()).prepare("UPDATE document_executor_jobs SET updated_at=? WHERE job_id=?").bind(Date.now()-300000,jobId).run();const until=Date.now()+18000;while(Date.now()<until){await(await runtime!.getWorker("executor")).fetch("http://localhost/test-maintain");if((await row(jobId))?.state==="cost-unknown")return;await new Promise(resolveWait=>setTimeout(resolveWait,100));}throw new Error("Lost process was not reconciled");},row,executorRow,sends,waitFor,async waitForInput(id:string){const until=Date.now()+18000;while(Date.now()<until){if((await(await siteDb()).prepare("SELECT input_released FROM fixture_controls WHERE id=?").bind(id).first<{input_released:number}>())?.input_released)return;await new Promise(resolveWait=>setTimeout(resolveWait,30));}throw new Error("Website did not release input");},waitForExecutor:(jobId:string,predicate:(row:Row)=>boolean)=>waitFor(jobId,predicate,true),async waitForSend(id:string){const until=Date.now()+18000;while(Date.now()<until){if(await sends(id))return;await new Promise(resolveWait=>setTimeout(resolveWait,30));}throw new Error("Provider did not start");},async enqueue(id:string,owner:string,mode="success",kind:"resume"|"jd"|"supplement"="resume"){const response=await runtime!.dispatchFetch("http://localhost/enqueue",{method:"POST",body:JSON.stringify({id,owner,mode,kind})});if(!response.ok)throw new Error(await response.text());return response.json() as Promise<{jobId:string}>;},async release(id:string){await(await siteDb()).prepare("UPDATE fixture_controls SET released=1 WHERE id=?").bind(id).run();},async publicBridgeStatus(){return(await(await runtime!.getWorker("executor")).fetch("http://localhost/internal/documents/claim",{method:"POST"})).status;},async maintain(){await(await runtime!.getWorker("executor")).fetch("http://localhost/test-maintain");},async restart(){await close();await open();},async evidence(){await close();let persistedCells=0,privateMatches=0;async function inspect(path:string){for(const entry of await readdir(path,{withFileTypes:true})){const file=join(path,entry.name);if(entry.isDirectory())await inspect(file);else if(entry.name.endsWith(".sqlite")){const db=new DatabaseSync(file,{readOnly:true});try{const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[];for(const {name} of tables){for(const record of db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()){for(const cell of Object.values(record)){persistedCells++;const value=cell instanceof Uint8Array?Buffer.from(cell).toString("utf8"):String(cell);if(value.includes("PRIVATE-MATERIAL-SENTINEL-7f91"))privateMatches++;}}}}finally{db.close();}}}}await inspect(join(directory,"workflows"));await open();return{persistedCells,privateMatches,outboundCalls};},async dispose(){await close();await cleanup();}};
}
export type DocumentExecutorFixture=Awaited<ReturnType<typeof createDocumentExecutorFixture>>;



