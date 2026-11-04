// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createDocumentExecutionRuntime } from "../../worker/document-executor/runtime";
import type { DocumentExecutorEnvironment } from "../../worker/document-executor/environment";
import { executeDocumentJob } from "../../worker/document-executor/execute-job";
import { SqliteD1 } from "../helpers/sqlite-d1";
import { memoryBucket } from "../helpers/document-bucket";
import { documentProviderConfigurationDigest, type DocumentProviderInput } from "../../app/server/documents/provider";
import { readDocumentPolicy, readDocumentSitePolicy } from "../../app/server/documents/policy";
import { normalizeDocumentText } from "../../app/contracts/documents";
import { documentAcceptanceCases, documentAcceptanceConfigurationDigest, documentAcceptanceCorpusSha256 } from "../../worker/document-executor/acceptance-policy";
import type { DocumentProviderQualification } from "../../worker/document-executor/provider-http";
import { renderDocumentAcceptanceEnrollment } from "../../scripts/materials-ui-acceptance-enroll";
import { fixtureGenerationResponse } from "../helpers/document-generation-response";
import corpus from "../fixtures/documents/quality-corpus.json";

const endpoint = "https://no-network.invalid/api/v1/chat/completions";
const routingPolicy = { policyVersion: "2026.11.1", providerOrder: ["fixture-route"], allowFallback: false, dataPolicy: "zdr-only" };
const qualification = {
  qualified: true, endpoint, model: "fixture-model", providerPolicyId: "fixture-policy", priceVersion: "2026.11.1", routingPolicy,
  inputMicroUsdPerMillionTokens: 100000, outputMicroUsdPerMillionTokens: 200000, inputTokenBound: "utf8-bytes-plus-4096",
  receiptRoute: { providerName: "Fixture Provider", endpointId: "fixture-endpoint" },
};
const env = {
  ARC_ENVIRONMENT: "production", ARC_DOCUMENTS_ENABLED: "true", ARC_DOCUMENT_ANALYSIS_ENABLED: "true",
  ARC_DOCUMENT_PROVIDER: "fixture-provider", ARC_DOCUMENT_MODEL: "fixture-model", ARC_DOCUMENT_PROVIDER_API_KEY: "fixture-only",
  ARC_DOCUMENT_PROVIDER_ENDPOINT: endpoint, ARC_DOCUMENT_PROVIDER_POLICY_ID: "fixture-policy", ARC_DOCUMENT_PRICE_VERSION: "2026.11.1",
  ARC_DOCUMENT_ROUTING_POLICY: JSON.stringify(routingPolicy), ARC_DOCUMENT_PROVIDER_QUALIFICATION: JSON.stringify(qualification),
  ARC_DOCUMENT_USER_DAILY_MICRO_USD: "100000", ARC_DOCUMENT_GLOBAL_DAILY_MICRO_USD: "500000", ARC_DOCUMENT_MAX_JOB_MICRO_USD: "5000",
  ARC_DOCUMENT_MAX_INPUT_TOKENS: "16000", ARC_DOCUMENT_MAX_OUTPUT_TOKENS: "4096", ARC_DOCUMENT_HTTP_TIMEOUT_MS: "1000",
};
const sample = {
  textVersionId: "text-one", text: "synthetic only", kind: "resume" as const, providerPolicyId: "fixture-policy",
  outputSchemaVersion: "2026.11.1" as const, segments: [{ id: "segment-1", start: 0, end: 14 }],
};
const databases: SqliteD1[] = [];
function database(filename?: string) {
  const db = new SqliteD1(filename);
  // Keep the independently-read database clock controllable across authorization windows.
  db.database.function("unixepoch", {varargs:true}, () => Date.now()/1000);
  databases.push(db);
  const dir = "worker/document-executor/migrations";
  for (const file of readdirSync(dir).filter(name => name.endsWith(".sql")).sort()) db.database.exec(readFileSync(join(dir, file), "utf8"));
  return db;
}
const directories: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals(); vi.useRealTimers();
  for (const db of databases.splice(0)) db.close();
  for (const path of directories.splice(0)) {
    const target=resolve(path);
    if (!target.startsWith(resolve(tmpdir())+sep+"document-acceptance-")) throw new Error("Unexpected temporary directory");
    rmSync(target,{recursive:true,force:true});
  }
});
describe("document acceptance transport isolation", () => {
  it.each(["synthetic", "closed", "typo", undefined])("never falls back to public transport when mode is %s", async mode => {
    const external = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", external);
    const runtime = createDocumentExecutionRuntime({ ...env, ARC_DOCUMENT_ACCEPTANCE_MODE: mode } as unknown as DocumentExecutorEnvironment);
    expect(await runtime.provider.analyze(sample, new AbortController().signal)).toMatchObject({ kind: "not-sent" });
    expect(external).not.toHaveBeenCalled();
  });
  it("performs synthetic inference and receipt reads only through the private binding without a real key",async()=>{
    const external=vi.fn(async()=>{throw new Error("External request");});vi.stubGlobal("fetch",external);
    const privateTransport=vi.fn(async(_url:string,init:RequestInit)=>{
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer synthetic-transport-only");
      if(init.method==="GET")return fixtureGenerationResponse("receipt-local","fixture-model");
      return Response.json({id:"receipt-local",model:"fixture-model",usage:{prompt_tokens:100,completion_tokens:20,cost:0.000007},choices:[]});
    });
    const runtime=createDocumentExecutionRuntime({...env,ARC_DOCUMENT_ACCEPTANCE_MODE:"synthetic",ARC_DOCUMENT_PROVIDER_API_KEY:undefined,
      DOCUMENT_EXECUTOR_DB:database(),DOCUMENT_JOB_ASSETS:memoryBucket(),DOCUMENT_PROVIDER_TRANSPORT:{fetch:privateTransport}} as unknown as DocumentExecutorEnvironment);
    const permit=vi.fn(async()=>true);
    runtime.site={claim:async()=>({claimed:true}),permit,input:async()=>({...sample,execution:{modelVersion:"fixture-model",priceVersion:"2026.11.1",
      configurationDigest:await documentProviderConfigurationDigest(readDocumentSitePolicy(env).analysis!,2420),sendScope:{consentId:"consent-a",generation:0}}}),
      result:async jobId=>({jobId,state:"succeeded",resultRef:null})};
    await runtime.jobs.admit("job-a");await executeDocumentJob("job-a",runtime);
    expect(permit).toHaveBeenCalledOnce();
    expect(privateTransport.mock.calls.map(([,init])=>init.method)).toEqual(["POST","GET"]);
    expect(external).not.toHaveBeenCalled();
  });
  it("rejects a fully qualified job with no approved UI run before issuing a POST", async () => {
    const db = database(), runId = "ui-round";
    const external = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", external);
    const runtime = createDocumentExecutionRuntime({
      ...env, ARC_DOCUMENT_ACCEPTANCE_MODE: "live", ARC_DOCUMENT_ACCEPTANCE_RUN_ID: runId,
      DOCUMENT_EXECUTOR_DB: db, DOCUMENT_JOB_ASSETS: memoryBucket(),
    } as unknown as DocumentExecutorEnvironment);
    const config = readDocumentPolicy(env).analysis!;
    runtime.site = {
      claim: async () => ({ claimed: true }), permit:async()=>true,
      input: async () => ({ ...sample, execution: {
        modelVersion: config.model, priceVersion: config.priceVersion,
        configurationDigest: await documentProviderConfigurationDigest(config, 2420, runId, "0".repeat(64)),
        acceptance: { runId, configurationSha256:"0".repeat(64), ownerId: "test-owner", documentId: "doc", documentVersionId: "version", generation: 0 },
      } }),
      result: async jobId => ({ jobId, state: "failed", resultRef: null }),
    };
    await runtime.jobs.admit("job");
    await executeDocumentJob("job", runtime);
    expect(external).not.toHaveBeenCalled();
    expect(JSON.parse((await runtime.jobs.get("job"))!.accounting_json!)).toMatchObject({ kind: "not-sent" });
  });
});

const ownerId = "TestOwner_1", runId = "ui-round";
const publicConfig = readDocumentSitePolicy(env).analysis!;
function enrollment() {
  return {
    runId, ownerId, corpusSha256: documentAcceptanceCorpusSha256, maxRequests:24, totalBudgetMicroUsd:500000,
    approvedAt:new Date(Date.now()-60000).toISOString(), expiresAt:new Date(Date.now()+3600000).toISOString(),
    config:publicConfig, qualification,
    cases:corpus.documents.map(doc => ({
      caseId:doc.id, documentId:randomUUID(), documentVersionId:randomUUID(), textVersionId:randomUUID(), generation:0,
      textSha256:createHash("sha256").update(normalizeDocumentText(doc.text)).digest("hex"),
    })),
  };
}
type Enrollment = ReturnType<typeof enrollment>;
async function jobInput(registration: Enrollment, index: number): Promise<DocumentProviderInput> {
  const doc = corpus.documents[index]!, row = registration.cases[index]!, text = normalizeDocumentText(doc.text);
  const configurationSha256=await documentAcceptanceConfigurationDigest(registration.config, registration.qualification as DocumentProviderQualification);
  return {
    textVersionId:row.textVersionId,text,kind:doc.kind as "resume"|"jd",
    segments:[{id:"segment-1",start:0,end:text.length}],providerPolicyId:publicConfig.providerPolicyId,outputSchemaVersion:"2026.11.1",
    execution:{modelVersion:publicConfig.model,priceVersion:publicConfig.priceVersion,sendScope:{consentId:"fixture-consent",generation:row.generation},
      configurationDigest:await documentProviderConfigurationDigest(publicConfig,2420,runId,configurationSha256),
      acceptance:{runId,configurationSha256,ownerId,documentId:row.documentId,documentVersionId:row.documentVersionId,generation:row.generation}},
  };
}
function connect(db: SqliteD1, settings:Record<string,unknown> = {}) {
  const inputs = new Map<string,DocumentProviderInput>(), bucket = memoryBucket();
  const runtime = createDocumentExecutionRuntime({...env,ARC_DOCUMENT_ACCEPTANCE_MODE:"live",ARC_DOCUMENT_ACCEPTANCE_RUN_ID:runId,
    DOCUMENT_EXECUTOR_DB:db,DOCUMENT_JOB_ASSETS:bucket,...settings} as unknown as DocumentExecutorEnvironment);
  runtime.site = {
    claim:async()=>({claimed:true}),permit:async()=>true,input:async id=>inputs.get(id)!,result:async jobId=>({jobId,state:"succeeded",resultRef:null}),
  };
  async function send(input:DocumentProviderInput, jobId:string=randomUUID()) {
    inputs.set(jobId,input);
    await runtime.jobs.admit(jobId);
    await executeDocumentJob(jobId,runtime);
    return (await runtime.results.read(jobId))?.outcome ?? null;
  }
  return {send, runtime};
}
function httpFixture(options:{metadata?:(id:string)=>Response|Promise<Response>;receiptId?:string;post?:(id:string)=>Promise<Response>}={}) {
  const posts:string[] = [], gets:string[] = [];
  vi.stubGlobal("fetch",async(url:string,init:RequestInit)=>{
    if(init.method==="GET") {
      const id = new URL(url).searchParams.get("id")!;
      gets.push(id);
      return options.metadata ? options.metadata(id) : fixtureGenerationResponse(id,publicConfig.model);
    }
    expect(init.method).toBe("POST");
    const messages=JSON.parse(String(init.body)).messages as {content:string}[];
    const payload=JSON.parse(messages[1]!.content) as {kind:string;segments:{text:string}[]};
    posts.push(createHash("sha256").update(payload.segments.map(s=>s.text).join("")).digest("hex"));
    const id=options.receiptId ?? "receipt-"+posts.length;
    if(options.post)return options.post(id);
    return Response.json({id,model:publicConfig.model,usage:{prompt_tokens:100,completion_tokens:20,cost:0.000007},
      choices:[{message:{content:JSON.stringify({schemaVersion:"2026.11.1",items:[]})}}]});
  });
  return {posts,gets};
}
async function registered(registration = enrollment(), db = database()) {
  db.database.exec(await renderDocumentAcceptanceEnrollment(registration));
  return {registration,db,...connect(db)};
}
describe("atomic document acceptance admission through the job and HTTP adapter",()=>{
  it("runs the standalone local enrollment CLI, validates the produced SQL and refuses to replace it",()=>{
    const directory=mkdtempSync(join(tmpdir(),"document-acceptance-"));directories.push(directory);
    const input=join(directory,"review.json"),out=join(directory,"run.sql"),script=resolve("scripts/materials-ui-acceptance-enroll.ts");
    writeFileSync(input,JSON.stringify(enrollment()));
    execFileSync(process.execPath,[script,input,out],{stdio:"pipe"});
    const db=database();db.database.exec(readFileSync(out,"utf8"));
    expect(db.database.prepare("SELECT COUNT(*) count FROM document_acceptance_cases").get()).toEqual({count:24});
    expect(spawnSync(process.execPath,[script,input,out]).status).toBe(1);
  });
  it("registers exactly the frozen 24 normalized texts, owner and generated versions in one non-repeatable offline write",async()=>{
    const data=enrollment();
    expect(Object.fromEntries(data.cases.map(c=>[c.caseId,c.textSha256]))).toEqual(documentAcceptanceCases);
    const {db}=await registered(data);
    expect(db.database.prepare("SELECT COUNT(*) n FROM document_acceptance_cases").get()).toMatchObject({n:24});
    const sql=await renderDocumentAcceptanceEnrollment(data);
    expect(sql).not.toContain(corpus.documents[0]!.text);
    expect(sql).not.toContain(env.ARC_DOCUMENT_PROVIDER_API_KEY);
    expect(()=>db.database.exec(sql)).toThrow();
    const duplicate=data.cases.map((row,i)=>i===1?{...row,textVersionId:data.cases[0]!.textVersionId}:row);
    for(const invalid of [{...data,cases:data.cases.slice(1)},{...data,cases:duplicate},{...data,cases:[data.cases[1],...data.cases.slice(1)]},
      {...data,cases:data.cases.map((r,i)=>i? r:{...r,textSha256:"f".repeat(64)})},{...data,maxRequests:25},
      {...data,totalBudgetMicroUsd:500001},{...data,config:{...publicConfig,apiKey:"never-allowed"}},{...data,corpusSha256:"0".repeat(64)}])
      await expect(renderDocumentAcceptanceEnrollment(invalid)).rejects.toThrow();
  });
  it("allows all 24 once, including both sides of midnight, and refuses a 25th new job after reconnect",async()=>{
    vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-11-04T23:59:59Z"));
    const {db,registration,send}=await registered(), network=httpFixture();
    for(let index=0;index<24;index++){
      if(index===12)vi.setSystemTime(new Date("2026-11-05T00:00:01Z"));
      expect(await send(await jobInput(registration,index))).toMatchObject({kind:"received",audit:{status:"verified"}});
    }
    expect(network.posts).toEqual(registration.cases.map(row=>row.textSha256));
    expect(new Set(network.gets).size).toBe(24);
    const reopened=connect(db);
    expect(await reopened.send(await jobInput(registration,0))).toMatchObject({kind:"not-sent"});
    expect(network.posts).toHaveLength(24);
    expect(db.database.prepare("SELECT COUNT(*) n,SUM(actual_micro_usd) spent,COUNT(DISTINCT receipt_id) ids FROM document_acceptance_dispatches WHERE state='verified'").get()).toEqual({n:24,spent:168,ids:24});
  });
  it("compares the authenticated run, owner, version, generation, exact text/kind and full frozen configuration",async()=>{
    const {db,registration,send}=await registered(), network=httpFixture(), input=await jobInput(registration,0);
    const identity=input.execution!.acceptance!;
    for(const change of [{runId:"other-run"},{ownerId:"other-test-owner"},{documentId:randomUUID()},
      {documentVersionId:randomUUID()},{generation:1}])
      expect(await send({...input,execution:{...input.execution!,acceptance:{...identity,...change}}})).toMatchObject({kind:"not-sent"});
    for(const change of [{textVersionId:randomUUID()},{execution:undefined},{kind:"jd" as const},
      {text:input.text.replace("SQL","sql")},{text:input.text.replace(/\n/gu,"\r\n")}])
      expect(await send({...input,...change})).toMatchObject({kind:"not-sent"});
    for(const settings of [{ARC_DOCUMENT_USER_DAILY_MICRO_USD:"100001"},{ARC_DOCUMENT_HTTP_TIMEOUT_MS:"1001"},
      {ARC_DOCUMENT_PROVIDER_QUALIFICATION:JSON.stringify({...qualification,inputMicroUsdPerMillionTokens:100001})},
      {ARC_DOCUMENT_PROVIDER_QUALIFICATION:JSON.stringify({...qualification,receiptRoute:{...qualification.receiptRoute,endpointId:"other"}})},
      {ARC_DOCUMENT_ACCEPTANCE_RUN_ID:"other-run"},{ARC_DOCUMENT_PROVIDER_API_KEY:undefined},{ARC_DOCUMENT_ANALYSIS_ENABLED:"false"},
      {ARC_ENVIRONMENT:"development"},{DOCUMENT_PROVIDER_TRANSPORT:{fetch:()=>{throw new Error("unexpected binding");}}}])
      expect(await connect(db,settings).send(input)).toMatchObject({kind:"not-sent"});
    expect(network.posts).toHaveLength(0);
    expect(await send(input)).toMatchObject({kind:"received"});
  });
  it("rejects a signed site job approved for a different receipt route at the same reservation",async()=>{
    const {registration,send}=await registered(),net=httpFixture();
    const differentSite={...registration,qualification:{...registration.qualification,
      receiptRoute:{...registration.qualification.receiptRoute,endpointId:"different-reviewed-site-endpoint"}}};
    expect(await send(await jobInput(differentSite,0))).toMatchObject({kind:"not-sent"});
    expect(net.posts).toHaveLength(0);
  });
  it("denies a live job before its case is reserved when the final site grant is denied or the bridge fails",async()=>{
    const {registration,db,runtime,send}=await registered(),net=httpFixture();
    runtime.site.permit=async()=>false;
    expect(await send(await jobInput(registration,0))).toMatchObject({kind:"not-sent"});
    runtime.site.permit=async()=>{throw new Error("bridge unavailable");};
    expect(await send(await jobInput(registration,1))).toMatchObject({kind:"not-sent"});
    expect(db.database.prepare("SELECT COUNT(*) n FROM document_acceptance_dispatches").get()).toEqual({n:0});
    expect(net.posts).toHaveLength(0);
  });
  it("serializes concurrent jobs and blocks every case until the unique receipt audit is durable",async()=>{
    const {registration,send,db}=await registered();
    const reading=Promise.withResolvers<void>(),release=Promise.withResolvers<void>();
    const network=httpFixture({metadata:async id=>{reading.resolve();await release.promise;return fixtureGenerationResponse(id,publicConfig.model);}});
    const first=await jobInput(registration,0),second=await jobInput(registration,1);
    const active=send(first,"paused-receipt");await reading.promise;
    expect(db.database.prepare("SELECT state,receipt_id,actual_micro_usd FROM document_acceptance_dispatches").get())
      .toEqual({state:"pending",receipt_id:"receipt-1",actual_micro_usd:7});
    const recovery=db.database.prepare("SELECT accounting_json FROM document_executor_jobs WHERE job_id='paused-receipt'").get();
    expect(JSON.parse(String(recovery?.accounting_json))).toMatchObject({kind:"received",receiptId:"receipt-1",actualMicroUsd:7,candidate:null});
    const blocked=await Promise.all([send(first),connect(db).send(second)]);
    expect(blocked.every(outcome=>outcome?.kind==="not-sent")).toBe(true);
    expect(network.posts).toHaveLength(1);
    release.resolve();await active;
    expect(await send(second)).toMatchObject({kind:"received",audit:{status:"verified"}});
    expect(await send(first)).toMatchObject({kind:"not-sent"});
    expect(network.posts).toHaveLength(2);
  });
  it("retains the case and the whole-round hold across closing and reopening SQLite after a lost process",async()=>{
    const directory=mkdtempSync(join(tmpdir(),"document-acceptance-"));directories.push(directory);
    const path=join(directory,"ledger.sqlite"),{db,registration,send}=await registered(enrollment(),database(path));
    const net=httpFixture({post:async()=>{throw new Error("connection lost");}});
    const original=await jobInput(registration,0);
    expect(await send(original)).toMatchObject({kind:"unknown"});
    db.close();databases.splice(databases.indexOf(db),1);
    const restored=new SqliteD1(path);databases.push(restored);
    expect(await connect(restored).send(original)).toMatchObject({kind:"not-sent"});
    expect(await connect(restored).send(await jobInput(registration,1))).toMatchObject({kind:"not-sent"});
    expect(net.posts).toHaveLength(1);
  });
  it("stops on a duplicate receipt before a second metadata GET, keeps prior charges and denies the next case",async()=>{
    const {registration,send,db}=await registered(),net=httpFixture({receiptId:"same-receipt"});
    await send(await jobInput(registration,0));
    expect(await send(await jobInput(registration,1))).toMatchObject({kind:"received",candidate:null,actualMicroUsd:null,audit:{status:"duplicate-receipt"}});
    expect(await send(await jobInput(registration,2))).toMatchObject({kind:"not-sent"});
    expect(net.posts).toHaveLength(2);expect(net.gets).toEqual(["same-receipt"]);
    expect(db.database.prepare("SELECT SUM(actual_micro_usd) spent FROM document_acceptance_dispatches").get()).toEqual({spent:7});
  });
  it("retains the B4 reservation and both quotes and prevents the next case after conflicting receipt prices",async()=>{
    const {registration,send,db}=await registered();
    const net=httpFixture({metadata:async id=>{
      const body=await fixtureGenerationResponse(id,publicConfig.model).json() as {data:{total_cost:number}};
      body.data.total_cost=0.5;
      return Response.json(body);
    }});
    const result=await send(await jobInput(registration,0));
    expect(result).toMatchObject({kind:"received",candidate:null,actualMicroUsd:null,
      audit:{status:"cost-conflict",conflictingCostsUsd:{chat:"0.000007",generation:"0.5"}}});
    const row=db.database.prepare("SELECT state,actual_micro_usd,reserved_micro_usd,audit_json FROM document_acceptance_dispatches").get();
    expect(row).toMatchObject({state:"stopped",actual_micro_usd:null});
    expect(Number(row?.reserved_micro_usd)).toBeGreaterThan(0);
    expect(JSON.parse(String(row?.audit_json))).toMatchObject({status:"cost-conflict"});
    expect(await send(await jobInput(registration,1))).toMatchObject({kind:"not-sent"});
    expect(net.posts).toHaveLength(1);
  });
  it("keeps a known charge, quarantines its candidate and stops after a wrong upstream",async()=>{
    const {registration,send,db}=await registered(),net=httpFixture({metadata:async id=>{
      const raw=await fixtureGenerationResponse(id,publicConfig.model).json() as {data:{provider_name:string}};
      raw.data.provider_name="Wrong Upstream";return Response.json(raw);
    }});
    expect(await send(await jobInput(registration,0))).toMatchObject({kind:"received",actualMicroUsd:7,candidate:null,audit:{status:"route-mismatch"}});
    expect(await send(await jobInput(registration,1))).toMatchObject({kind:"not-sent"});
    expect(db.database.prepare("SELECT state,actual_micro_usd FROM document_acceptance_dispatches").get()).toEqual({state:"stopped",actual_micro_usd:7});
    expect(net.posts).toHaveLength(1);
  });
  it("holds the aggregate authorization across day changes and latches an expired window on clock rollback",async()=>{
    vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-11-04T23:59:59Z"));
    const data=enrollment();data.totalBudgetMicroUsd=2420;
    const {db,send}=await registered(data),net=httpFixture();
    await send(await jobInput(data,0));
    vi.setSystemTime(new Date("2026-11-05T00:00:02Z"));
    expect(await connect(db).send(await jobInput(data,1))).toMatchObject({kind:"not-sent"});
    vi.setSystemTime(new Date(data.expiresAt));
    await connect(db).send(await jobInput(data,1));
    vi.setSystemTime(new Date("2026-11-05T00:00:01Z"));
    expect(await connect(db).send(await jobInput(data,2))).toMatchObject({kind:"not-sent"});
    expect(db.database.prepare("SELECT stopped_at FROM document_acceptance_runs").get()).toEqual({stopped_at:Date.parse(data.expiresAt)});
    expect(net.posts).toHaveLength(1);
  });
  it("sends zero when the admission transaction fails and blocks the round after a failed final write",async()=>{
    const first=await registered(),net=httpFixture();
    first.db.failAtBatchStatement=1;
    expect(await first.send(await jobInput(first.registration,0))).toMatchObject({kind:"not-sent"});
    first.db.failAtBatchStatement=null;
    expect(await first.send(await jobInput(first.registration,1))).toMatchObject({kind:"not-sent"});
    expect(net.posts).toHaveLength(0);
    const next=await registered();
    next.db.database.exec("CREATE TRIGGER fail_audit BEFORE UPDATE OF state ON document_acceptance_dispatches BEGIN SELECT RAISE(ABORT,'unavailable'); END");
    expect(await next.send(await jobInput(next.registration,0))).toMatchObject({kind:"received",actualMicroUsd:7,candidate:null});
    next.db.database.exec("DROP TRIGGER fail_audit");
    expect(await connect(next.db).send(await jobInput(next.registration,1))).toMatchObject({kind:"not-sent"});
    expect(net.posts).toHaveLength(1);
  });
  it("preserves the independent site execution hold if both the reservation and the durable stop record fail",async()=>{
    const {registration,db,send}=await registered(),net=httpFixture();
    db.failAtBatchStatement=1;
    db.database.exec("CREATE TRIGGER reject_stop BEFORE UPDATE OF stopped_at ON document_acceptance_runs BEGIN SELECT RAISE(ABORT,'unavailable'); END");
    expect(await send(await jobInput(registration,0))).toMatchObject({kind:"unknown"});
    expect(net.posts).toHaveLength(0);
  });
  it("requires the database clock inside the approval window even when the worker clock is stale",async()=>{
    const {registration,send,db}=await registered(),net=httpFixture();
    db.database.function("unixepoch",{varargs:true},()=>Date.parse(registration.expiresAt)/1000);
    expect(await send(await jobInput(registration,0))).toMatchObject({kind:"not-sent"});
    expect(net.posts).toHaveLength(0);
  });
  it("denies every case if a provisioned enrollment contains a duplicate runtime version or a different corpus digest",async()=>{
    const {registration,send,db}=await registered(),net=httpFixture();
    for(const field of ["textVersionId","textSha256"] as const) {
      const broken=registration.cases.map((row,i)=>i===2?{...row,[field]:registration.cases[1]![field]}:row);
      db.database.prepare("UPDATE document_acceptance_runs SET cases_json=?").run(JSON.stringify(broken));
      expect(await send(await jobInput(registration,0))).toMatchObject({kind:"not-sent"});
    }
    expect(net.posts).toHaveLength(0);
  });
});
