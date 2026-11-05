// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createDocumentRoute } from "../../app/server/http/document-route-factories";
import { UnauthenticatedError } from "../../app/server/auth/session";
import { documentEndpointContracts,type DocumentEndpointRequest,type DocumentEndpointResponse } from "../../app/contracts/documents-api";
import { DocumentSiteClient } from "../../worker/document-executor/site-client";
import { DocumentExecutorBridge } from "../../app/server/documents/executor-bridge";
import { createDocumentRuntime, type DocumentEnvironment } from "../../app/server/documents/runtime";
import { createDocumentExecutionRuntime } from "../../worker/document-executor/runtime";
import { maintainDocumentExecutor } from "../../worker/document-executor/maintenance";
import { createDocumentExecutorHandler } from "../../worker/document-executor/http-routes";
import { deliverDocumentResult, executeDocumentJob } from "../../worker/document-executor/execute-job";
import type { DocumentExecutorEnvironment } from "../../worker/document-executor/environment";
import { productionFixtureSettings } from "../helpers/document-production";
import { applyDocumentExecutorMigrations, createMaterialsD1, seedUser } from "../helpers/materials-d1";
import { SqliteD1 } from "../helpers/sqlite-d1";
import { memoryBucket } from "../helpers/document-bucket";
import { documentAcceptanceConfigurationDigest } from "../../worker/document-executor/acceptance-policy";
import { readDocumentSitePolicy } from "../../app/server/documents/policy";
import type { DocumentProviderQualification } from "../../worker/document-executor/provider-http";
import type { DocumentProviderInput } from "../../app/server/documents/provider";
import { readDocumentProductionRelease } from "../../worker/document-executor/production-policy";

const databases: SqliteD1[] = [];
afterEach(() => { vi.useRealTimers();vi.unstubAllGlobals(); for (const db of databases.splice(0)) db.close(); });
type Mode = "success" | "lost" | "duplicate" | "metadata-failure" | "over-reservation" | "mismatch" | "metadata-cost-only" | "conflicting-cost";
async function fixture() {
  const { environment, qualification, authorization } = await productionFixtureSettings();
  const siteDb = createMaterialsD1(), ledger = new SqliteD1();
  databases.push(siteDb, ledger); applyDocumentExecutorMigrations(ledger);
  for (const id of ["owner-a", "owner-b"]) seedUser(siteDb, id);
  const siteChanges: Record<string, unknown> = {}, executorChanges: Record<string, unknown> = {};
  const posts: string[] = [], gets: string[] = [];
  let mode: Mode = "success";
  const metadataEntered = Promise.withResolvers<void>(), metadataRelease = Promise.withResolvers<void>();
  let pauseMetadata = false;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const address = new URL(url);
    if (address.origin !== "https://openrouter.ai") throw new Error("unexpected origin");
    if (init.method === "GET") {
      expect(address.pathname).toBe("/api/v1/generation");
      const id = address.searchParams.get("id")!; gets.push(id); metadataEntered.resolve();
      if (pauseMetadata) await metadataRelease.promise;
      if (mode === "metadata-failure") return new Response(null, { status: 403 });
      return Response.json({ data: { id, model: qualification.receiptRoute.generationModel, provider_name: qualification.receiptRoute.providerName,
        provider_responses: [{ status:200, endpoint_id: mode === "mismatch" ? "foreign-endpoint" : qualification.receiptRoute.endpointId }],
        native_tokens_prompt:100, native_tokens_completion:20, total_cost: mode === "conflicting-cost" ? 0.50 : mode === "over-reservation" ? 0.08 : 0.000007 } });
    }
    expect(init.method).toBe("POST"); expect(url).toBe(qualification.endpoint);
    const body = JSON.parse(String(init.body)); posts.push(JSON.parse(body.messages[1].content).kind);
    expect(body.provider).toMatchObject({ only:["moonshotai/mxfp4"], order:["moonshotai/mxfp4"], allow_fallbacks:false, zdr:true, data_collection:"deny" });
    if (mode === "lost") throw new Error("simulated disconnect");
    return Response.json({ id: mode === "duplicate" ? "receipt-1" : "receipt-" + posts.length, model: qualification.model,
      choices:[{message:{content:JSON.stringify({schemaVersion:"2026.11.1",items:[],reviewPoints:[]})}}],
      usage:{prompt_tokens:100,completion_tokens:20,cost: mode === "conflicting-cost" ? 0 : mode === "metadata-cost-only" ? undefined : mode === "over-reservation" ? 0.08 : 0.000007} });
  });
  const objects = memoryBucket(), results = memoryBucket();
  const running = new Set<string>();
  const workflow = { create: async ({ id }: {id: string}) => ({id}), get: async (id: string) => ({id, status: async () => ({status:running.has(id)?"running":"complete"})}) };
  function site() { return createDocumentRuntime({ ...environment, ...siteChanges, DB:siteDb as unknown as D1Database, DOCUMENT_ASSETS:objects,
    DOCUMENT_EXECUTOR:{ fetch: (request: Request): Promise<Response> => createDocumentExecutorHandler(executor())(request) } } as DocumentEnvironment); }
  function executor() { return createDocumentExecutionRuntime({ ...environment, ARC_DOCUMENT_PROVIDER_API_KEY:"offline-provider-credential-only",
    DOCUMENT_EXECUTOR_DB:ledger, DOCUMENT_JOB_ASSETS:results, DOCUMENT_WORKFLOW:workflow,
    DOCUMENT_SITE:{ fetch: (request: Request): Promise<Response> => site().privateHandler(request) }, ...executorChanges } as unknown as DocumentExecutorEnvironment); }
  type Command = "createDocument" | "createDocumentConsent" | "createDocumentJob";
  async function post<K extends Command>(owner:string|null,endpoint:K,input:DocumentEndpointRequest<K>):Promise<DocumentEndpointResponse<K>> {
    const route=createDocumentRoute(endpoint,{requireUser:async()=>{if(!owner)throw new UnauthenticatedError();return {id:owner};},
      configuredOrigin:()=>"https://arc.test",createService:site,rateLimiter:{reserve:async()=>({allowed:true})}});
    const response=await route(new Request("https://arc.test"+documentEndpointContracts[endpoint].path,
      {method:"POST",headers:{origin:"https://arc.test","content-type":"application/json"},body:JSON.stringify(input)}));
    const data=await response.json() as {error?:{code:string}};
    if(!response.ok)throw Object.assign(new Error("Document fixture HTTP error"),{code:data.error?.code,status:response.status});
    return data as DocumentEndpointResponse<K>;
  }
  async function enqueue(kind: DocumentProviderInput["kind"] = "resume", owner = "owner-a") {
    const {textVersionId} = await post(owner,"createDocument",{kind,displayName:kind,text:"PRIVATE-MATERIAL-SENTINEL-7f91 normal "+kind,mutationId:randomUUID()});
    const {consentId} = await post(owner,"createDocumentConsent",{textVersionId,purpose:"analysis",providerPolicyId:qualification.providerPolicyId,
      policyVersion:qualification.routingPolicy.policyVersion,mutationId:randomUUID()});
    const {jobId} = await post(owner,"createDocumentJob",{consentId,textVersionId,mutationId:randomUUID()});
    return jobId;
  }
  async function run(jobId: string) {
    const runtime=executor(); running.add(jobId);try { await executeDocumentJob(jobId,runtime); await deliverDocumentResult(jobId,runtime); }finally{running.delete(jobId);}
    return siteDb.database.prepare("SELECT state,dispatch_state,extraction_id FROM document_jobs WHERE id=?").get(jobId);
  }
  async function caps() { return site().invoke("owner-a","readDocumentCapabilities",{}); }
  const budget = (id: string) => siteDb.database.prepare("SELECT state,actual_micro_usd,reserved_micro_usd FROM document_budget_reservations WHERE job_id=?").get(id);
  function changeGrant(changes: Record<string,unknown>) { const json=JSON.stringify({...authorization,...changes});
    siteChanges.ARC_DOCUMENT_PRODUCTION_AUTHORIZATION=json;executorChanges.ARC_DOCUMENT_PRODUCTION_AUTHORIZATION=json; }
  return {siteDb,ledger,site,executor,post,enqueue,run,caps,budget,posts,gets,environment,qualification,authorization,siteChanges,executorChanges,
    changeGrant,setMode:(value:Mode)=>{mode=value;},pauseMetadata:()=>{pauseMetadata=true;},metadataEntered,metadataRelease};
}

describe("ordinary private-material production admission", () => {
  it("rejects a missing or different generation version even under a matching newly computed grant", async () => {
    const { environment, qualification, authorization } = await productionFixtureSettings();
    const config = readDocumentSitePolicy(environment).analysis!;
    expect(readDocumentProductionRelease(environment, config, qualification, 72960)).not.toBeNull();
    for (const version of [null, "moonshotai/kimi-k3.1-pro-20261024"]) {
      const changed = structuredClone(qualification);
      if (version === null) delete changed.receiptRoute.generationModel;
      else changed.receiptRoute.generationModel = version;
      const approved = { ...environment, ARC_DOCUMENT_PRODUCTION_AUTHORIZATION: JSON.stringify({ ...authorization,
        configurationSha256: await documentAcceptanceConfigurationDigest(config, changed) }) };
      expect(readDocumentProductionRelease(approved, config, changed, 72960)).toBeNull();
    }
  });
  it("analyzes all three ordinary types only after owner consent, unique permit, reservation and verified receipt",async()=>{
    const f=await fixture();
    expect(await f.caps()).toMatchObject({analysisEnabled:true,reason:"ready"});
    for(const kind of ["resume","jd","supplement"] as const) {
      const id=await f.enqueue(kind);
      expect(await f.run(id)).toMatchObject({state:"succeeded",dispatch_state:"settled"});
      expect(f.budget(id)).toMatchObject({actual_micro_usd:7,reserved_micro_usd:72960});
      await f.run(id);
    }
    expect(f.posts).toEqual(["resume","jd","supplement"]);expect(f.gets).toHaveLength(3);
    expect(f.ledger.database.prepare("SELECT COUNT(*) n,COUNT(DISTINCT receipt_id) receipts FROM document_production_dispatches WHERE state='verified'").get()).toEqual({n:3,receipts:3});
  });

  it("requires the authenticated owner of the version and consent through the public command routes",async()=>{
    const f=await fixture();const saved=await f.post("owner-a","createDocument",{kind:"resume",displayName:"Resume",text:"Synthetic SQL",mutationId:"save-auth"});
    const request={purpose:"analysis" as const,textVersionId:saved.textVersionId,providerPolicyId:f.qualification.providerPolicyId,policyVersion:f.qualification.routingPolicy.policyVersion,mutationId:"allow-auth"};
    await expect(f.post(null,"createDocumentConsent",request)).rejects.toMatchObject({status:401});
    await expect(f.post("owner-b","createDocumentConsent",request)).rejects.toMatchObject({status:404});
    const consent=await f.post("owner-a","createDocumentConsent",request);
    await expect(f.post("owner-b","createDocumentJob",{textVersionId:saved.textVersionId,...consent,mutationId:"denied-auth"})).rejects.toMatchObject({status:404});
    expect(f.posts).toHaveLength(0);
  });

  it("keeps public production AI closed for missing, mixed, opaque, B2, B4 and unreviewed configuration",async()=>{
    const f=await fixture();
    const cases: Record<string,unknown>[] = [
      {ARC_DOCUMENT_PRODUCTION_ENABLED:undefined}, {ARC_DOCUMENT_PRODUCTION_AUTHORIZATION:undefined}, {ARC_ENVIRONMENT:"development"},
      ...["synthetic","live","closed","production","typo"].map(mode=>({ARC_DOCUMENT_ACCEPTANCE_MODE:mode})),
      {ARC_DOCUMENT_ACCEPTANCE_RUN_ID:"stray"}, {DOCUMENT_PROVIDER_TRANSPORT:{fetch:()=>null}},
      {ARC_DOCUMENT_QUALIFICATION_ENABLED:"true"}, {ARC_DOCUMENT_PRODUCTION_AUTHORIZATION:"{}"},
      ...[{purpose:"b2"},{purpose:"b4"},{id:"Bad Id"},{totalBudgetMicroUsd:0},{totalBudgetMicroUsd:1},
        {configurationSha256:"0".repeat(64)},{expiresAt:new Date(0).toISOString()},{approvedAt:new Date(Date.now()+3600000).toISOString()},
        {unapproved:true}].map(change=>({ARC_DOCUMENT_PRODUCTION_AUTHORIZATION:JSON.stringify({...f.authorization,...change})})),
      {ARC_DOCUMENT_GLOBAL_DAILY_MICRO_USD:"300001"},{ARC_DOCUMENT_HTTP_TIMEOUT_MS:"9999"},
      {ARC_DOCUMENT_PROVIDER_QUALIFICATION:JSON.stringify({...f.qualification,outputMicroUsdPerMillionTokens:9999999})},
    ];
    for(const change of cases) {Object.assign(f.siteChanges,change);expect(await f.caps(),Object.keys(change).join()).toMatchObject({analysisEnabled:false});for(const key of Object.keys(change))delete f.siteChanges[key];}
    for(const mode of [undefined,"closed","typo","live"]) {
      Object.assign(f.siteChanges,{ARC_DOCUMENT_PRODUCTION_ENABLED:undefined,ARC_DOCUMENT_PRODUCTION_AUTHORIZATION:undefined,ARC_DOCUMENT_ACCEPTANCE_MODE:mode});
      expect(await f.caps(),String(mode)).toMatchObject({analysisEnabled:false});
    }
    expect(f.posts).toEqual([]);
  });

  it("rejects even re-digested wrong provider, model, chat endpoint, upstream or generation receipt identity",async()=>{
    const f=await fixture();
    for(const [key,value] of Object.entries({provider:"other gateway",model:"other-model",endpoint:"https://other.invalid/chat/completions",
      upstream:"moonshotai/highspeed",providerName:"other",endpointId:"wrong-endpoint",generationModel:"moonshotai/kimi-k3.1-pro-20261024"})) {
      const settings={...f.environment},q=structuredClone(f.qualification);
      if(key==="provider")settings.ARC_DOCUMENT_PROVIDER=value;
      if(key==="model"){settings.ARC_DOCUMENT_MODEL=value;q.model=value;}
      if(key==="endpoint"){settings.ARC_DOCUMENT_PROVIDER_ENDPOINT=value;q.endpoint=value;}
      if(key==="upstream"){q.routingPolicy.providerOrder=[value];settings.ARC_DOCUMENT_ROUTING_POLICY=JSON.stringify(q.routingPolicy);}
      if(key==="providerName"||key==="endpointId"||key==="generationModel")q.receiptRoute[key]=value;
      settings.ARC_DOCUMENT_PROVIDER_QUALIFICATION=JSON.stringify(q);
      settings.ARC_DOCUMENT_PRODUCTION_AUTHORIZATION=JSON.stringify({...f.authorization,configurationSha256:await documentAcceptanceConfigurationDigest(readDocumentSitePolicy(settings).analysis!,q as DocumentProviderQualification)});
      Object.assign(f.siteChanges,settings);expect(await f.caps(),key).toMatchObject({analysisEnabled:false});
    }
  });

  it("recovers a terminal Workflow whose paid step never claimed its queue turn",async()=>{
    const f=await fixture(),id=await f.enqueue(),runtime=f.executor();
    expect(await runtime.productionTurn!(id)).toBe(true);
    await maintainDocumentExecutor(runtime);
    expect(await f.site().invoke("owner-a","readDocumentJob",{jobId:id})).toMatchObject({costState:"released"});
    expect(await f.caps()).toMatchObject({analysisEnabled:true});expect(f.posts).toHaveLength(0);
  });

  it("sends nothing if the result binding disappears between job acceptance and execution",async()=>{
    const f=await fixture(),id=await f.enqueue();f.executorChanges.DOCUMENT_JOB_ASSETS=undefined;
    await f.run(id).catch(()=>undefined);expect(f.posts).toHaveLength(0);
  });

  it("releases a cancelled pre-POST queue turn before the native paid step starts",async()=>{
    const f=await fixture(),id=await f.enqueue();
    expect(await f.executor().productionTurn!(id)).toBe(true);
    await f.site().invoke("owner-a","cancelDocumentJob",{jobId:id,expectedRevision:0,mutationId:"cancel-before-paid-step"});
    expect(await f.caps()).toMatchObject({analysisEnabled:true});
    expect(await f.run(await f.enqueue("jd","owner-b"))).toMatchObject({state:"succeeded"});expect(f.posts).toEqual(["jd"]);
  });

  it("refuses a release ID that contains a dedicated credential before grant persistence",async()=>{
    const f=await fixture();f.changeGrant({id:"release-offline-provider-credential-only"});
    expect(await f.caps()).toMatchObject({analysisEnabled:false});await expect(f.enqueue()).rejects.toMatchObject({code:"unavailable"});
    expect(f.ledger.database.prepare("SELECT COUNT(*) n FROM document_production_grants").get()).toEqual({n:0});
  });

  it("keeps a healthy grant available when two in-window readiness samples reach D1 out of order",async()=>{
    const f=await fixture();await f.run(await f.enqueue());
    const entered=Promise.withResolvers<void>(),release=Promise.withResolvers<void>(),batch=f.ledger.batch.bind(f.ledger);
    let first=true;
    vi.spyOn(f.ledger,"batch").mockImplementation(async calls=>{
      const sql=(calls[0] as unknown as {sql:string}).sql;
      if(first && sql.includes("UPDATE document_production_grants SET expired_at")){first=false;entered.resolve();await release.promise;}
      return batch(calls);
    });
    const earlier=f.caps();await entered.promise;
    try{
      await new Promise(resolve=>setTimeout(resolve,30));expect(await f.caps()).toMatchObject({analysisEnabled:true});
    }finally{release.resolve();}
    expect(await earlier).toMatchObject({analysisEnabled:true});expect(await f.caps()).toMatchObject({analysisEnabled:true});
  });

  it("latches expiry when an already queued job reaches the executor before any public readiness read",async()=>{
    vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(Date.now());
    const f=await fixture();f.ledger.database.function("unixepoch",{varargs:true},()=>Date.now()/1000);
    await f.run(await f.enqueue());const queued=await f.enqueue("jd","owner-b"),expires=Date.parse(f.authorization.expiresAt);
    vi.setSystemTime(expires+1000);await f.run(queued);expect(f.posts).toHaveLength(1);
    vi.setSystemTime(expires-5000);expect(await f.caps()).toMatchObject({analysisEnabled:false});
    await expect(f.enqueue()).rejects.toMatchObject({code:"unavailable"});
  });

  it("latches the observed end of an existing grant on a capability read even if both clocks subsequently roll back",async()=>{
    vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(Date.now());
    const f=await fixture();f.ledger.database.function("unixepoch",{varargs:true},()=>Date.now()/1000);
    await f.run(await f.enqueue());const expires=Date.parse(f.authorization.expiresAt);
    vi.setSystemTime(expires+1000);expect(await f.caps()).toMatchObject({analysisEnabled:false});
    vi.setSystemTime(expires-5000);expect(await f.caps()).toMatchObject({analysisEnabled:false});
    await expect(f.enqueue("jd","owner-b")).rejects.toMatchObject({code:"unavailable"});expect(f.posts).toHaveLength(1);
  });

  it("requires the private reverse bridge, result storage and Workflow binding on a fresh grant",async()=>{
    const f=await fixture();
    for(const change of [{DOCUMENT_WORKFLOW:undefined},{DOCUMENT_JOB_ASSETS:undefined},{DOCUMENT_SITE:undefined},
      {DOCUMENT_SITE:{fetch:async()=>Response.json({ready:true})}},{DOCUMENT_SITE:{fetch:async()=>new Response(null,{status:503})}}]){
      Object.assign(f.executorChanges,change);expect(await f.caps(),Object.keys(change).join()).toMatchObject({analysisEnabled:false});
      for(const key of Object.keys(change))delete f.executorChanges[key];
    }
    expect(f.posts).toHaveLength(0);expect(f.ledger.database.prepare("SELECT count(*) n FROM document_production_grants").get()).toEqual({n:0});
  });

  it("starts the active-turn clock when an old queued job acquires it, while preserving its queue deadline",async()=>{
    vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(Date.now());
    const f=await fixture();f.changeGrant({totalBudgetMicroUsd:280000});
    f.ledger.database.function("unixepoch",{varargs:true},()=>Date.now()/1000);
    const first=await f.enqueue(),second=await f.enqueue("jd","owner-b"),queuedAt=Date.now();
    f.executorChanges.DOCUMENT_WORKFLOW={create:async()=>({}),get:async()=>({status:async()=>({status:"running"})})};
    vi.setSystemTime(queuedAt+5*60_000);const acquiredAt=Date.now(),runtime=f.executor();
    expect(await runtime.productionTurn!(first)).toBe(true);
    expect(await runtime.productionTurn!(second)).toBe(false);
    expect(await runtime.jobs.get(first)).toMatchObject({created_at:queuedAt,updated_at:acquiredAt});
    vi.setSystemTime(acquiredAt+30_000);expect(await runtime.productionTurn!(first)).toBe(true);
    expect(await runtime.jobs.get(first)).toMatchObject({created_at:queuedAt,updated_at:acquiredAt});
    expect(await f.run(first)).toMatchObject({state:"succeeded"});expect(await f.run(second)).toMatchObject({state:"succeeded"});
    expect(f.posts).toEqual(["resume","jd"]);
  });

  it("settles an exclusively claimed chat cost when its acknowledgement and final audit write both fail",async()=>{
    const f=await fixture(),id=await f.enqueue(),batch=f.ledger.batch.bind(f.ledger);
    let lostAcknowledgement=false,failedAudit=false;
    vi.spyOn(f.ledger,"batch").mockImplementation(async statements=>{
      const sql=(statements[0] as unknown as {sql:string}).sql;
      if (sql.includes("UPDATE document_production_dispatches SET receipt_id=")) {
        await batch(statements);lostAcknowledgement=true;throw new Error("lost committed receipt acknowledgement");
      }
      if (sql.includes("UPDATE document_production_dispatches SET") && sql.includes("THEN 'verified' ELSE 'stopped'")) {
        failedAudit=true;throw new Error("audit storage unavailable");
      }
      return batch(statements);
    });
    await f.run(id);expect([lostAcknowledgement,failedAudit]).toEqual([true,true]);
    expect(f.ledger.database.prepare("SELECT state,receipt_id,actual_micro_usd FROM document_production_dispatches WHERE job_id=?").get(id))
      .toEqual({state:"pending",receipt_id:"receipt-1",actual_micro_usd:7});
    expect(f.budget(id)).toMatchObject({state:"settled",actual_micro_usd:7});
    const stored=await f.executor().results.read(id);
    expect(stored?.outcome).toMatchObject({kind:"received",candidate:null,receiptId:"receipt-1",actualMicroUsd:7});
    expect(f.siteDb.database.prepare("SELECT extraction_id FROM document_jobs WHERE id=?").get(id)).toEqual({extraction_id:null});
    f.changeGrant({id:"replacement-grant"});expect(await f.caps()).toMatchObject({analysisEnabled:false});
    expect(f.posts).toHaveLength(1);expect(f.gets).toEqual([]);
  });

  it.each(["normal", "lost-result", "failed-final-audit", "failed-checkpoint-and-exit", "failed-job-copy-and-exit"] as const)(
    "keeps both ledgers on hold after a fee conflict across %s and refuses another grant", async boundary => {
      const f = await fixture(), id = await f.enqueue();
      const runtime = f.executor();
      f.setMode("conflicting-cost");
      if (boundary === "failed-final-audit") {
        f.ledger.database.exec("CREATE TRIGGER fail_final BEFORE UPDATE OF state ON document_production_dispatches BEGIN SELECT RAISE(ABORT,'write failed'); END");
      }
      if (boundary === "failed-checkpoint-and-exit") {
        f.ledger.database.exec("CREATE TRIGGER fail_checkpoint BEFORE UPDATE OF audit_json ON document_production_dispatches WHEN NEW.audit_json->>'$.status'='cost-conflict' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
      }
      if (boundary === "failed-job-copy-and-exit") {
        f.ledger.database.exec("CREATE TRIGGER fail_job_copy BEFORE UPDATE OF accounting_json ON document_executor_jobs WHEN NEW.accounting_json->>'$.audit.status'='cost-conflict' BEGIN SELECT RAISE(ABORT,'job copy unavailable'); END");
      }
      if (boundary === "lost-result" || boundary.endsWith("-and-exit")) {
        vi.spyOn(runtime.results, "save").mockRejectedValue(new Error("simulated exit before result write"));
        await expect(executeDocumentJob(id, runtime)).rejects.toThrow();
        if (boundary === "failed-checkpoint-and-exit") f.ledger.database.exec("DROP TRIGGER fail_checkpoint");
        if (boundary === "failed-job-copy-and-exit") f.ledger.database.exec("DROP TRIGGER fail_job_copy");
        const restarted = f.executor();
        await restarted.results.recoverAfterWorkflowTerminal(id);
        await deliverDocumentResult(id, restarted);
      } else {
        await f.run(id);
      }
      const billed = f.ledger.database.prepare("SELECT state,actual_micro_usd,audit_json FROM document_production_dispatches WHERE job_id=?").get(id);
      expect(billed?.state).not.toBe("verified");
      expect(billed?.actual_micro_usd).toBeNull();
      expect(JSON.parse(String(billed?.audit_json))).toMatchObject({ status:"cost-conflict", conflictingCostsUsd:{chat:"0",generation:"0.5"} });
      expect(f.budget(id)).toMatchObject({ state:"held-unknown", actual_micro_usd:null, reserved_micro_usd:72960 });
      expect(await f.site().invoke("owner-a","readDocumentJob",{jobId:id})).toMatchObject({ state:"cost-unknown", costState:"held-unknown" });
      f.changeGrant({ id:"another-grant" });
      await expect(f.enqueue("jd","owner-b")).rejects.toMatchObject({ code:"unavailable" });
      expect(f.posts).toHaveLength(1);
      expect(f.gets).toEqual(["receipt-1"]);
    });
  it("never delivers a provisional chat price when both conflict writes fail and the workflow dies before saving a result", async () => {
    const f = await fixture(), id = await f.enqueue(), runtime = f.executor();
    f.setMode("conflicting-cost");
    f.ledger.database.exec(`CREATE TRIGGER fail_charge_a BEFORE UPDATE OF audit_json ON document_production_dispatches
      WHEN NEW.audit_json->>'$.status'='cost-conflict' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;
      CREATE TRIGGER fail_charge_b BEFORE UPDATE OF accounting_json ON document_executor_jobs
      WHEN NEW.accounting_json->>'$.audit.status'='cost-conflict' BEGIN SELECT RAISE(ABORT,'job unavailable'); END;`);
    vi.spyOn(runtime.results, "save").mockRejectedValue(new Error("interrupted before result"));
    await expect(executeDocumentJob(id, runtime)).rejects.toThrow();
    f.ledger.database.exec("DROP TRIGGER fail_charge_a; DROP TRIGGER fail_charge_b;");
    const restarted = f.executor();
    await restarted.results.recoverAfterWorkflowTerminal(id);
    await deliverDocumentResult(id, restarted);
    expect(f.budget(id)).toMatchObject({state:"held-unknown",actual_micro_usd:null,reserved_micro_usd:72960});
    expect(await f.caps()).toMatchObject({analysisEnabled:false});
    expect(f.posts).toHaveLength(1);
  });
  it("repairs the dispatch ledger on maintenance after a held result has already reached the site", async () => {
    const f = await fixture(), id = await f.enqueue();
    f.setMode("conflicting-cost");
    f.ledger.database.exec(`CREATE TRIGGER reject_conflict BEFORE UPDATE OF audit_json ON document_production_dispatches
      WHEN NEW.audit_json->>'$.status'='cost-conflict' BEGIN SELECT RAISE(ABORT,'unavailable'); END`);
    await f.run(id);
    expect(f.budget(id)).toMatchObject({state:"held-unknown",actual_micro_usd:null});
    f.ledger.database.exec("DROP TRIGGER reject_conflict");
    await maintainDocumentExecutor(f.executor());
    const bill = f.ledger.database.prepare("SELECT state,actual_micro_usd,audit_json FROM document_production_dispatches WHERE job_id=?").get(id);
    expect(bill).toMatchObject({state:"stopped",actual_micro_usd:null});
    expect(JSON.parse(String(bill?.audit_json))).toMatchObject({status:"cost-conflict",conflictingCostsUsd:{chat:"0",generation:"0.5"}});
    expect(await f.executor().jobs.get(id)).toMatchObject({paid_intent:null,state:"cost-unknown"});
    expect(f.posts).toHaveLength(1);
  });
  it.each(["ready", "uploaded", "unconfirmed-lookup", "legacy-audit", "weak-final"] as const)(
    "keeps a stale multipart candidate out of site settlement after a %s write", async boundary => {
      const f = await fixture(), id = await f.enqueue(), runtime = f.executor();
      f.setMode("conflicting-cost");
      f.ledger.database.exec(`CREATE TRIGGER reject_job_copy BEFORE UPDATE OF accounting_json ON document_executor_jobs
        WHEN NEW.accounting_json->>'$.audit.status'='cost-conflict' BEGIN SELECT RAISE(ABORT,'unavailable'); END`);
      const onlyLookup = ["unconfirmed-lookup","legacy-audit","weak-final"].includes(boundary);
      if (onlyLookup) f.ledger.database.exec(`CREATE TRIGGER reject_dispatch_copy BEFORE UPDATE OF audit_json ON document_production_dispatches
        WHEN NEW.audit_json->>'$.status'='cost-conflict' BEGIN SELECT RAISE(ABORT,'unavailable'); END`);
      const save = runtime.results.save.bind(runtime.results);
      vi.spyOn(runtime.results, "save").mockImplementationOnce(async jobId => {
        if (boundary === "weak-final") await runtime.jobs.finishPaidDispatch("production",f.authorization.id,jobId,
          {kind:"unknown",code:"connection-lost"}).catch(() => undefined);
        const at = new Date().toISOString();
        return save(jobId, {kind:"received",receiptId:"receipt-1",inputTokens:100,outputTokens:20,actualMicroUsd:0,
          candidate:{schemaVersion:"2026.11.1",items:[],reviewPoints:[]},
          ...(boundary === "legacy-audit" ? {audit:{status:"usage-mismatch",actualModel:null,actualProvider:null,actualEndpointId:null,
            metadataAttempts:1,metadataInputTokens:100,metadataOutputTokens:20,metadataMicroUsd:500000,sentAt:at,returnedAt:at,checkedAt:at}} : {}),
        });
      });
      if (boundary === "uploaded") {
        vi.spyOn(runtime.jobs, "completeResult").mockRejectedValueOnce(new Error("crash after upload"));
        await expect(executeDocumentJob(id,runtime)).rejects.toThrow();
      } else await executeDocumentJob(id,runtime);
      f.ledger.database.exec("DROP TRIGGER reject_job_copy");
      if (onlyLookup) f.ledger.database.exec("DROP TRIGGER reject_dispatch_copy");
      const recovered = f.executor();
      if (boundary === "uploaded") await recovered.results.recoverAfterWorkflowTerminal(id);
      expect((await recovered.results.read(id))?.outcome).toMatchObject({kind:"received",receiptId:"receipt-1",candidate:null,actualMicroUsd:null});
      await deliverDocumentResult(id,recovered);
      expect(f.budget(id)).toMatchObject({state:"held-unknown",actual_micro_usd:null,reserved_micro_usd:72960});
      expect(f.siteDb.database.prepare("SELECT extraction_id FROM document_jobs WHERE id=?").get(id)).toEqual({extraction_id:null});
      expect(f.posts).toHaveLength(1);
    });
  it("retains the final metadata charge if the dispatch update and the result upload both fail", async () => {
    const f = await fixture(), id = await f.enqueue(), runtime = f.executor();
    f.setMode("metadata-cost-only");
    f.ledger.database.exec("CREATE TRIGGER reject_final BEFORE UPDATE OF state ON document_production_dispatches BEGIN SELECT RAISE(ABORT,'unavailable'); END");
    vi.spyOn(runtime.results, "save").mockImplementationOnce(async (jobId, outcome) => {
      const job = await runtime.jobs.beginResult(jobId,outcome);
      expect(JSON.parse(job!.accounting_json!)).toMatchObject({actualMicroUsd:7,audit:{status:"usage-mismatch"}});
      throw new Error("crash before upload");
    });
    await expect(executeDocumentJob(id,runtime)).rejects.toThrow();
    f.ledger.database.exec("DROP TRIGGER reject_final");
    const recovered = f.executor();
    await recovered.results.recoverAfterWorkflowTerminal(id);
    await deliverDocumentResult(id,recovered);
    expect(f.budget(id)).toMatchObject({state:"settled",actual_micro_usd:7});
    expect(f.ledger.database.prepare("SELECT state,actual_micro_usd FROM document_production_dispatches WHERE job_id=?").get(id))
      .toEqual({state:"stopped",actual_micro_usd:7});
    expect(f.posts).toHaveLength(1);
  });
  it("keeps a durable conflict when a weaker finalization arrives before the next sweep", async () => {
    const f = await fixture(), id = await f.enqueue(), runtime = f.executor();
    f.setMode("conflicting-cost");
    f.ledger.database.exec(`CREATE TRIGGER reject_job_copy BEFORE UPDATE OF accounting_json ON document_executor_jobs
      WHEN NEW.accounting_json->>'$.audit.status'='cost-conflict' BEGIN SELECT RAISE(ABORT,'unavailable'); END`);
    vi.spyOn(runtime.results, "save").mockRejectedValueOnce(new Error("interrupted after dispatch evidence"));
    await expect(executeDocumentJob(id,runtime)).rejects.toThrow();
    f.ledger.database.exec("DROP TRIGGER reject_job_copy");
    await runtime.jobs.finishPaidDispatch("production", f.authorization.id, id, {
      kind:"received",receiptId:"receipt-1",inputTokens:100,outputTokens:20,candidate:null,actualMicroUsd:0,
    }).catch(() => undefined);
    await runtime.results.recoverAfterWorkflowTerminal(id);
    await deliverDocumentResult(id,runtime);
    expect(f.budget(id)).toMatchObject({state:"held-unknown",actual_micro_usd:null});
    expect(f.posts).toHaveLength(1);
  });
  it("recovers a known metadata-only charge if the process dies after audit and before result storage",async()=>{
    const f=await fixture(),id=await f.enqueue();f.setMode("metadata-cost-only");
    const runtime=f.executor();vi.spyOn(runtime.results,"save").mockRejectedValue(new Error("process exited before beginResult"));
    await expect(executeDocumentJob(id,runtime)).rejects.toThrow();
    expect(f.ledger.database.prepare("SELECT state,actual_micro_usd FROM document_production_dispatches WHERE job_id=?").get(id)).toEqual({state:"stopped",actual_micro_usd:7});
    const fresh=f.executor();await fresh.results.recoverAfterWorkflowTerminal(id);await deliverDocumentResult(id,fresh);
    expect(f.budget(id)).toMatchObject({state:"settled",actual_micro_usd:7});
    expect(f.siteDb.database.prepare("SELECT extraction_id FROM document_jobs WHERE id=?").get(id)).toEqual({extraction_id:null});
    expect(f.posts).toHaveLength(1);
  });

  it("keeps a paid intent closed when both admission and the emergency stop fail, even for a new grant",async()=>{
    const f=await fixture(),a=await f.enqueue(),b=await f.enqueue("jd","owner-b");
    f.ledger.database.exec("CREATE TRIGGER fail_reservation BEFORE INSERT ON document_production_grants BEGIN SELECT RAISE(ABORT,'unavailable'); END");
    f.ledger.database.exec("CREATE TRIGGER fail_stop BEFORE INSERT ON document_paid_transport_hold BEGIN SELECT RAISE(ABORT,'unavailable'); END");
    await f.run(a);expect(f.budget(a)).toMatchObject({state:"held-unknown"});
    f.ledger.database.exec("DROP TRIGGER fail_reservation; DROP TRIGGER fail_stop");
    expect(await f.run(b)).toMatchObject({dispatch_state:"not-sent"});expect(f.posts).toHaveLength(0);
    f.changeGrant({id:"fresh-but-held"});expect(await f.caps()).toMatchObject({analysisEnabled:false});
  });

  it("authenticates executor readiness before advertising AI, accepting consent or creating a new job", async()=>{
    const f=await fixture(),site=f.site(),owner="owner-a";
    const {textVersionId}=await site.invoke(owner,"createDocument",{kind:"jd",displayName:"A",text:"Synthetic SQL",mutationId:"saved-for-probe"});
    const allow={textVersionId,purpose:"analysis" as const,providerPolicyId:f.qualification.providerPolicyId,
      policyVersion:f.qualification.routingPolicy.policyVersion,mutationId:"authorized-consent"};
    const consent=await site.invoke(owner,"createDocumentConsent",allow);
    const request={textVersionId,consentId:consent.consentId,mutationId:"existing-job"};
    const created=await site.invoke(owner,"createDocumentJob",request);
    await f.run(created.jobId);
    for(const change of [{ARC_DOCUMENT_PROVIDER_API_KEY:undefined},{ARC_DOCUMENT_BRIDGE_SECRET:"a-different-offline-bridge-secret-with-32-characters"},
      {ARC_DOCUMENT_PRODUCTION_AUTHORIZATION:JSON.stringify({...f.authorization,id:"different-grant"})},{ARC_DOCUMENT_PRODUCTION_ENABLED:undefined}]) {
      Object.assign(f.executorChanges,change);expect(await f.caps(),Object.keys(change).join()).toMatchObject({analysisEnabled:false});
      await expect(f.site().invoke(owner,"createDocumentConsent",{...allow,mutationId:randomUUID()})).rejects.toMatchObject({code:"unavailable"});
      await expect(f.site().invoke(owner,"createDocumentJob",{...request,mutationId:randomUUID()})).rejects.toMatchObject({code:"unavailable"});
      expect(await f.site().invoke(owner,"createDocumentConsent",allow)).toEqual(consent);
      expect(await f.site().invoke(owner,"createDocumentJob",request)).toEqual(created);
      expect(await f.site().invoke(owner,"readDocumentJob",{jobId:created.jobId})).toMatchObject({state:"succeeded"});
      for(const key of Object.keys(change))delete f.executorChanges[key];
    }
    expect(f.posts).toHaveLength(1);
    expect(f.ledger.database.prepare("SELECT COUNT(*) n FROM document_production_dispatches").get()).toEqual({n:1});
  });

  it("rejects a forged, replayed, malformed or stalled readiness response",async()=>{
    const f=await fixture(),calls:string[]=[];
    let reply:string|undefined;
    const binding={fetch:async(r:Request)=>{
      calls.push(r.url);const genuine=await createDocumentExecutorHandler(f.executor())(r);
      if(reply!==undefined)return new Response(reply);reply=await genuine.text();return new Response(reply);
    }};
    const site=()=>createDocumentRuntime({...f.environment,DB:f.siteDb as unknown as D1Database,DOCUMENT_ASSETS:memoryBucket(),DOCUMENT_EXECUTOR:binding});
    const read=()=>site().invoke("owner-a","readDocumentCapabilities",{});
    expect(await read()).toMatchObject({analysisEnabled:true});
    expect(calls).toHaveLength(1);expect(new URL(calls[0]!).pathname).toBe("/internal/documents/readiness");
    expect(await read()).toMatchObject({analysisEnabled:false});
    reply='{"ready":true}';expect(await read()).toMatchObject({analysisEnabled:false});
    reply='private malformed body';expect(await read()).toMatchObject({analysisEnabled:false});
    const probe = new DocumentExecutorBridge({secret:f.environment.ARC_DOCUMENT_BRIDGE_SECRET!,timeoutMs:30,binding:{fetch:()=>new Promise(()=>{})}});
    await expect(probe.productionReady("a".repeat(64))).resolves.toBe(false);
    const reverse=new DocumentSiteClient({secret:f.environment.ARC_DOCUMENT_BRIDGE_SECRET!,timeoutMs:30,binding:{fetch:()=>new Promise(()=>{})}});
    expect(await Promise.race([reverse.productionReady("a".repeat(64)),new Promise(resolve=>setTimeout(()=>resolve("unbounded"),200))])).toBe(false);
    expect(f.posts).toEqual([]);
  });

  it("admits the next consented document to the same owner's queue during a healthy, funded in-flight audit",async()=>{
    const f=await fixture();f.changeGrant({totalBudgetMicroUsd:280000});
    const a=await f.enqueue();f.pauseMetadata();const first=f.run(a);await f.metadataEntered.promise;
    let second:string;
    try {
      expect(await f.caps()).toMatchObject({analysisEnabled:true});second=await f.enqueue("supplement");
      expect(f.siteDb.database.prepare("SELECT state,execution_slot FROM document_jobs WHERE id=?").get(second)).toEqual({state:"queued",execution_slot:null});
    }finally{f.metadataRelease.resolve();await first;}
    expect(await f.run(second!)).toMatchObject({state:"succeeded"});expect(f.posts).toEqual(["resume","supplement"]);
  });

  it("rejects an executor with a different issuance, budget, rates, secret or mixed transport",async()=>{
    const f=await fixture();
    for(const change of [{ARC_DOCUMENT_PROVIDER_API_KEY:undefined},{ARC_DOCUMENT_USER_DAILY_MICRO_USD:"150001"},
      {ARC_DOCUMENT_PRODUCTION_AUTHORIZATION:JSON.stringify({...f.authorization,id:"other"})},
      {ARC_DOCUMENT_PRODUCTION_AUTHORIZATION:JSON.stringify({...f.authorization,totalBudgetMicroUsd:100001})},
      {ARC_DOCUMENT_PROVIDER_QUALIFICATION:JSON.stringify({...f.qualification,inputMicroUsdPerMillionTokens:2000001})},
      {ARC_DOCUMENT_ACCEPTANCE_RUN_ID:"other"},{ARC_DOCUMENT_ACCEPTANCE_MODE:"live"},{DOCUMENT_PROVIDER_TRANSPORT:{fetch:()=>new Response(null,{status:500})}}]){
      const id=await f.enqueue();Object.assign(f.executorChanges,change);
      expect(await f.run(id)).toMatchObject({state:"failed",dispatch_state:"not-sent"});
      for(const key of Object.keys(change))delete f.executorChanges[key];
    }
    expect(f.posts).toEqual([]);
  });

  it("rejects stale or repeated job permits under a different release and after consent revocation",async()=>{
    const f=await fixture(),id=await f.enqueue(),site=f.site();
    expect(await site.jobs.claim(id)).toMatchObject({claimed:true});const input=await site.jobs.input(id);
    const permit={jobId:id,textVersionId:input.textVersionId,...input.execution!.sendScope!,configurationDigest:input.execution!.configurationDigest};
    f.changeGrant({totalBudgetMicroUsd:100001});
    expect(await f.site().jobs.permit(permit)).toMatchObject({permitted:false});
    f.changeGrant({});expect(await f.site().jobs.permit(permit)).toMatchObject({permitted:true});
    expect(await f.site().jobs.permit(permit)).toMatchObject({permitted:false});
    const cancelled=await f.enqueue("jd","owner-b"),other=f.site();await other.jobs.claim(cancelled);const held=await other.jobs.input(cancelled);
    await other.invoke("owner-b","revokeDocumentConsent",{consentId:held.execution!.sendScope!.consentId,mutationId:randomUUID()});
    const runtime=f.executor();await runtime.jobs.claim(cancelled);
    await runtime.analyzeJob!(cancelled,held,new AbortController().signal);
    expect(f.posts).toEqual([]);
  });

  it("atomically reserves across owners, latches the original grant identity, and enforces aggregate cost",async()=>{
    const f=await fixture();f.changeGrant({totalBudgetMicroUsd:72960});
    const a=await f.enqueue(),b=await f.enqueue("jd","owner-b");
    const first=f.run(a);f.pauseMetadata();await f.metadataEntered.promise;
    try{
      const accounting=await f.executor().jobs.get(a);
      expect(JSON.parse(accounting!.accounting_json!)).toMatchObject({actualMicroUsd:7,receiptId:"receipt-1",candidate:null});
      expect(await f.run(b)).toMatchObject({dispatch_state:"not-sent"});
    }finally{f.metadataRelease.resolve();}
    await first;expect(f.posts).toHaveLength(1);
    expect(await f.caps()).toMatchObject({analysisEnabled:false});await expect(f.enqueue()).rejects.toMatchObject({code:"unavailable"});
    f.changeGrant({totalBudgetMicroUsd:180000});
    expect(await f.caps()).toMatchObject({analysisEnabled:false});await expect(f.enqueue()).rejects.toMatchObject({code:"unavailable"});
    expect(f.posts).toHaveLength(1);
  });

  it.each(["lost","duplicate","mismatch","over-reservation","metadata-failure"] as const)("retains %s and blocks other grants without delivering a candidate",async(mode)=>{
    const f=await fixture();
    if(mode==="duplicate")await f.run(await f.enqueue());
    f.setMode(mode);const id=await f.enqueue();await f.run(id);
    const expectedChatCount=mode==="duplicate"?2:1;
    expect(f.posts).toHaveLength(expectedChatCount);
    expect(f.siteDb.database.prepare("SELECT extraction_id FROM document_jobs WHERE id=?").get(id)).toEqual({extraction_id:null});
    expect(f.budget(id)).toMatchObject(mode==="lost"||mode==="duplicate"?{state:"held-unknown",actual_micro_usd:null}:{state:"settled",actual_micro_usd:mode==="over-reservation"?80000:7});
    if(mode==="duplicate"){
      expect(f.gets).toEqual(["receipt-1"]);expect(await f.site().invoke("owner-a","readDocumentJob",{jobId:id})).toMatchObject({state:"cost-unknown",costState:"held-unknown"});
    }
    f.changeGrant({id:"new-offline-test-only"});expect(await f.caps()).toMatchObject({analysisEnabled:false});
    await expect(f.enqueue("jd","owner-b")).rejects.toMatchObject({code:"unavailable"});
    expect(f.posts).toHaveLength(expectedChatCount);
  });
});
