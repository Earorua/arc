// @vitest-environment node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { build } from "esbuild";
import { verifyProductionBaseline, composeProductionConfigs } from "../../scripts/lib/materials-production-package.mjs";
import { prepareMaterialsProductionPackage } from "../../scripts/prepare-materials-production-package.mjs";
import { documentAcceptanceConfigurationDigest } from "../../worker/document-executor/acceptance-policy";

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const account = "a".repeat(32);
const versionId = "e52b9dcb-9daa-40a6-8b88-b35f342455e6";
const deploymentId = "add1a7a2-986b-43c9-908c-cf790386f506";
const siteId = "aaaad322-0c6b-4a65-8485-afa55721ca12";
const resources = {
  documentsBucket: "arc-materials-prod-site-documents",
  executorName: "arc-materials-prod-executor",
  executorDatabase: { name: "arc-materials-prod-executor-db", id: "bbba9c2e-6c66-4024-8835-ab0d281f0b37" },
  resultsBucket: "arc-materials-prod-results", workflow: "arc-materials-prod-workflow",
};
function historical() {
  const config = {
    account_id: account, name: "arc-public-site", main: "C:/released/site/index.js", assets: { binding: "ASSETS", directory: "C:/released/client" },
    compatibility_date: "2026-05-15", compatibility_flags: ["nodejs_compat"], workers_dev: false, preview_urls: false, keep_vars: true,
    routes: [{ pattern: "arcmaps.net", zone_id: "b".repeat(32), custom_domain: true }],
    vars: { BETTER_AUTH_URL: "https://arcmaps.net", ARC_ENVIRONMENT: "production", ARC_AI_RESEARCH_ENABLED: "true", ARC_LEARNING_AGENTS_ENABLED: "true" },
    d1_databases: [{ binding: "DB", database_name: "site-db", database_id: siteId }],
    r2_buckets: [{ binding: "PROOF_ASSETS", bucket_name: "site-proofs" }],
    services: [{ binding: "ARC_RESEARCH_EXECUTOR", service: "research-executor" }],
    secrets: { required: ["BETTER_AUTH_SECRET", "OPENROUTER_API_KEY"] },
    triggers: { crons: ["0 4 * * *"] }, placement: {region:"aws:eu-west-2"},
  };
  const bindings = [
    {name:"ASSETS",type:"assets"}, {name:"DB",type:"d1",id:siteId,database_id:siteId},
    {name:"PROOF_ASSETS",type:"r2_bucket",bucket_name:"site-proofs"},
    {name:"ARC_RESEARCH_EXECUTOR",type:"service",service:"research-executor",environment:"production"},
    ...Object.entries(config.vars).map(([name,text])=>({name,type:"plain_text",text})),
    ...config.secrets.required.map(name=>({name,type:"secret_text"})),
  ];
  const configBytes = Buffer.from(JSON.stringify(config));
  return { config, configBytes, version: {id:versionId,resources:{bindings,script:{placement_mode:"targeted",placement:{mode:"targeted",target:[{type:"region",region:config.placement.region}]}},
    script_runtime:{compatibility_date:config.compatibility_date,compatibility_flags:config.compatibility_flags,usage_model:"standard",assets:{raw_run_worker_first:false}}}},
    deployments:[{id:deploymentId,created_on:"2026-11-04T00:00:00Z",versions:[{version_id:versionId,percentage:100}]}],
    expected: {accountId:account,workerName:config.name,versionId,deploymentId,configSha256:sha(configBytes.toString())} };
}
async function expiredActivation() {
  const config={provider:"OpenRouter / Moonshot AI", model:"moonshotai/kimi-k3.1-pro", endpoint:"https://openrouter.ai/api/v1/chat/completions",
    providerPolicyId:"test-production-policy",routingPolicy:{policyVersion:"2026.11.3",providerOrder:["moonshotai/mxfp4"],allowFallback:false as const,dataPolicy:"zdr-only" as const},
    priceVersion:"2026.11.3",userDailyMicroUsd:85000,globalDailyMicroUsd:195000,maxJobMicroUsd:75000,maxInputTokens:16000,maxOutputTokens:4096,httpTimeoutMs:180000};
  const qualification={qualified:true as const,model:config.model,endpoint:config.endpoint,providerPolicyId:config.providerPolicyId,priceVersion:config.priceVersion,
    routingPolicy:config.routingPolicy,receiptRoute:{providerName:"Moonshot AI",endpointId:"a3fafaac-f097-4ef1-86b3-842854dad5c6",generationModel:"moonshotai/kimi-k3.1-pro-20261023"},
    inputMicroUsdPerMillionTokens:2000000,outputMicroUsdPerMillionTokens:10000000,inputTokenBound:"utf8-bytes-plus-4096" as const};
  const authorization={purpose:"production-private-material-analysis",id:"expired-test-issuance",approvedAt:"2020-03-01T00:00:00Z",expiresAt:"2020-03-01T00:15:00Z",
    totalBudgetMicroUsd:160000,configurationSha256:await documentAcceptanceConfigurationDigest(config,qualification)};
  return {mode:"production" as const,config,qualification,authorization};
}

describe("public materials release package", () => {
  it("adds private document resources to the reviewed public worker while retaining routes, Research, learning, auth and cron", async () => {
    const baseline=historical();
    const verified=verifyProductionBaseline(baseline);
    expect(verified.bindingCount).toBe(10);
    const before=structuredClone(baseline.config);
    const pair=await composeProductionConfigs(verified.config,resources,{mode:"closed"});
    expect(pair.site).toMatchObject({name:before.name,placement:before.placement,routes:before.routes,compatibility_flags:before.compatibility_flags,
      vars:{...before.vars,ARC_DOCUMENTS_ENABLED:"false",ARC_DOCUMENT_ANALYSIS_ENABLED:"false",ARC_DOCUMENT_PLANNING_ENABLED:"false"}});
    expect(pair.site.d1_databases).toEqual(before.d1_databases.map(db=>({...db,migrations_dir:"drizzle"})));
    expect(pair.site.services).toContainEqual(before.services[0]);
    expect(pair.site.services).toContainEqual({binding:"DOCUMENT_EXECUTOR",service:resources.executorName,entrypoint:"DocumentExecutorEntrypoint"});
    expect(pair.site.secrets.required).toEqual([...before.secrets.required,"ARC_DOCUMENT_BRIDGE_SECRET"]);
    expect(pair.site.secrets.required).not.toContain("ARC_DOCUMENT_PROVIDER_API_KEY");
    expect(pair.site.triggers.crons).toEqual(["0 4 * * *","*/5 * * * *"]);
    expect(pair.executor).toMatchObject({workers_dev:false,preview_urls:false,routes:[],main:"./index.mjs",
      services:[{binding:"DOCUMENT_SITE",service:before.name,entrypoint:"DocumentSite"}],
      secrets:{required:["ARC_DOCUMENT_BRIDGE_SECRET"]}});
    expect(pair.executor.vars.ARC_DOCUMENT_MAINTENANCE_ENABLED).toBe("true");
    expect(JSON.stringify(pair)).not.toContain("DOCUMENT_PROVIDER_TRANSPORT");
    expect(baseline.config).toEqual(before);
    const repeated=await composeProductionConfigs(pair.site,resources,{mode:"closed"});
    expect(repeated).toEqual(pair);
  });

  it("rejects a baseline with drift, split traffic, a duplicate binding or secret-valued metadata", () => {
    const cases=[
      (v:ReturnType<typeof historical>)=>{v.version.resources.bindings.pop();},
      (v:ReturnType<typeof historical>)=>{v.version.resources.bindings[1]=v.version.resources.bindings[0];},
      (v:ReturnType<typeof historical>)=>{v.deployments[0].versions[0].percentage=50;},
      (v:ReturnType<typeof historical>)=>{v.version.resources.script_runtime.compatibility_flags=[];},
      (v:ReturnType<typeof historical>)=>{v.version.resources.script.placement.target[0].region="unreviewed-region";},
      (v:ReturnType<typeof historical>)=>{v.version.resources.script_runtime.usage_model="unreviewed";},
      (v:ReturnType<typeof historical>)=>{v.version.resources.script_runtime.assets.raw_run_worker_first=true;},
      (v:ReturnType<typeof historical>)=>{Object.assign(v.version.resources.bindings[3],{props:{redirect:"unreviewed"}});},
      (v:ReturnType<typeof historical>)=>{Object.assign(v.version.resources.bindings[1],{database_internal_env:"unreviewed"});},
      (v:ReturnType<typeof historical>)=>{v.expected.configSha256="0".repeat(64);},
      (v:ReturnType<typeof historical>)=>{Object.assign(v.version.resources.bindings.at(-1)!,{text:"redaction-sentinel"});},
    ];
    for(const mutate of cases){
      const value=historical(); mutate(value);
      expect(()=>verifyProductionBaseline(value)).toThrow("Public materials baseline mismatch");
    }
  });
  it("refuses unsupported provider bindings and mismatched R2 jurisdictions even in a hash-matched baseline", () => {
    for (const added of [{secrets_store_secrets:[{binding:"ARC_DOCUMENT_PROVIDER_API_KEY",store_id:"test",secret_name:"test"}]},
      {kv_namespaces:[{binding:"HIDDEN_STORE",id:"a".repeat(32)}]}, {ai:{binding:"DOCUMENT_PROVIDER_TRANSPORT"}}]) {
      const v=historical();
      v.configBytes=Buffer.from(JSON.stringify({...v.config,...added})); v.expected.configSha256=sha(v.configBytes.toString());
      expect(()=>verifyProductionBaseline(v)).toThrow("Public materials baseline mismatch");
    }
    const r2=historical();
    Object.assign(r2.version.resources.bindings.find(b=>b.name==="PROOF_ASSETS")!,{jurisdiction:"eu"});
    expect(()=>verifyProductionBaseline(r2)).toThrow("Public materials baseline mismatch");
  });
  it("refuses conflicting resource names, a reused database, an acceptance marker, or an undeclared setting", async () => {
    const config=historical().config;
    for(const change of [
      {...resources,executorDatabase:{...resources.executorDatabase,id:siteId}},
      {...resources,executorDatabase:{...resources.executorDatabase,id:"fe4952d0-da78-4c85-b1fa-8a5706d42fa3"}},
      {...resources,executorDatabase:{...resources.executorDatabase,id:"83a47917-a4f4-4121-baad-1032677f18a8"}},
      {...resources,documentsBucket:"site-proofs"},
      {...resources,workflow:resources.resultsBucket},
      {...resources,executorName:"arc-materials-g1b-fixture-executor"},
    ]) await expect(composeProductionConfigs(config,change,{mode:"closed"})).rejects.toThrow();
    await expect(composeProductionConfigs({...config,vars:{...config.vars,ARC_DOCUMENT_ACCEPTANCE_MODE:"live"}},resources,{mode:"closed"})).rejects.toThrow();
    await expect(composeProductionConfigs(config,resources,{mode:"closed",ARC_DOCUMENT_PROVIDER_API_KEY:"redaction-sentinel"})).rejects.toThrow();
    await expect(composeProductionConfigs({...config,services:[...config.services,{binding:"DOCUMENT_EXECUTOR",service:"unrelated"}]},resources,{mode:"closed"})).rejects.toThrow();
    await expect(composeProductionConfigs({...config,workflows:[{binding:"EXISTING_FLOW",name:resources.workflow,class_name:"ExistingWorkflow"}]},resources,{mode:"closed"})).rejects.toThrow();
    await expect(composeProductionConfigs({...config,services:[...config.services,{binding:"DOCUMENT_PROVIDER_TRANSPORT",service:"fake"}]},resources,{mode:"closed"})).rejects.toThrow();
  });
  it("requires the same independent and currently valid authorization the executor checks to package an active rollout", async () => {
    const active=await expiredActivation();
    const {config, qualification, authorization}=active;
    const now=()=>Date.parse("2020-03-01T00:05:00Z");
    const baseline=historical().config;
    const pair=await composeProductionConfigs(baseline,resources,active,now);
    expect(pair.executor.secrets.required).toEqual(["ARC_DOCUMENT_BRIDGE_SECRET","ARC_DOCUMENT_PROVIDER_API_KEY"]);
    expect(pair.executor.vars).toHaveProperty("ARC_DOCUMENT_PRODUCTION_AUTHORIZATION",pair.site.vars.ARC_DOCUMENT_PRODUCTION_AUTHORIZATION);
    expect(pair.site.vars).not.toHaveProperty("ARC_DOCUMENT_ACCEPTANCE_MODE");
    for(const change of [{...active,authorization:{...authorization,purpose:"b4"}},{...active,config:{...config,userDailyMicroUsd:84999}},
      {...active,qualification:{...qualification,outputMicroUsdPerMillionTokens:10000001}},{...active,authorization:{...authorization,totalBudgetMicroUsd:1}}]){
      await expect(composeProductionConfigs(baseline,resources,change,now)).rejects.toThrow();
    }
    await expect(composeProductionConfigs(baseline,resources,active,()=>Date.parse(authorization.expiresAt))).rejects.toThrow();
    const rolledBack=await composeProductionConfigs(pair.site,resources,{mode:"closed"});
    expect(rolledBack.site.vars.ARC_DOCUMENT_PRODUCTION_AUTHORIZATION).toBe("");
    expect(rolledBack.site.vars.ARC_DOCUMENT_PRODUCTION_ENABLED).toBe("false");
    expect(rolledBack.site.services).toEqual(pair.site.services);
    expect({...pair.site.vars,...rolledBack.site.vars}).toEqual(rolledBack.site.vars);
  });

  it("packages a verified closed pair, preserves source bytes and refuses output reuse or later drift", async () => {
    await withPackageFixture(false, async fixture => {
      const {root, data, run, outputNames, source} = fixture;
      const result = await run("closed-test");
      expect(result).toMatchObject({mode:"closed", baselineBindings:10, deployments:0, remoteMigrations:0});
      const site = JSON.parse(await readFile(join(root,"outputs/materials-production/closed-test/site/server/wrangler.json"),"utf8"));
      expect(site).toMatchObject({no_bundle:true,rules:[{type:"ESModule",globs:["**/*.js","**/*.mjs"]}]});
      expect(site.d1_databases[0]).toMatchObject({database_id:siteId,migrations_dir:"drizzle"});
      expect(await readFile(join(root,source,"site/server/wrangler.json"),"utf8")).toBe(data["site/server/wrangler.json"]);
      expect(await readFile(join(root,"outputs/materials-production/closed-test/site/server/index.js"),"utf8")).toBe(data["site/server/index.js"]);
      await expect(run("closed-test")).rejects.toThrow();
      await writeFile(join(root,source,"site/client/a.js"),"drift");
      await expect(run("bad-test")).rejects.toThrow();
      expect(await outputNames()).toEqual(["closed-test"]);
    });
  });

  it.each(["corrupt bundle", "empty Git pack", "empty incremental pack", "wrong incremental base", "self prerequisite", "unrelated prerequisite",
    "tree masquerading as commit", "false tree", "grafted migration", "grafted executor"])(
    "rejects a repinned %s and leaves the healthy package intact", async attack => {
      await withPackageFixture(false, async f => {
        const incremental = attack === "empty incremental pack" || attack === "wrong incremental base";
        if (incremental) { f.makeIncremental(); await f.pin({base:f.base}); }
        await f.run("healthy");
        if (attack === "corrupt bundle") {
          const corrupted = Buffer.from(await readFile(f.bundlePath));
          corrupted[corrupted.length - 1] ^= 1;
          await writeFile(f.bundlePath, corrupted);
        }
        if (attack === "empty Git pack" || attack === "empty incremental pack") {
          const original = await readFile(f.bundlePath);
          const headerEnd = original.indexOf("\n\n") + 2;
          expect(original.subarray(headerEnd,headerEnd + 4).toString()).toBe("PACK");
          const empty = Buffer.from("5041434b0000000200000000","hex");
          await writeFile(f.bundlePath,Buffer.concat([original.subarray(0,headerEnd),empty,createHash("sha1").update(empty).digest()]));
        }
        if (attack === "self prerequisite" || attack === "unrelated prerequisite") {
          const original = await readFile(f.bundlePath);
          const firstLine = original.indexOf("\n") + 1;
          const injected = attack === "self prerequisite" ? f.commit : f.unrelated;
          await writeFile(f.bundlePath,Buffer.concat([original.subarray(0,firstLine),
            Buffer.from("-"+injected+" simulated prerequisite\n"),original.subarray(firstLine)]));
        }
        if (attack === "tree masquerading as commit") {
          const original = await readFile(f.bundlePath), end = original.indexOf("\n\n") + 2;
          await writeFile(f.bundlePath,Buffer.concat([Buffer.from(original.subarray(0,end).toString().replace(f.commit,f.tree)),original.subarray(end)]));
        }
        if (attack === "grafted migration") f.data["executor/migrations/0004_injected.sql"] = "SELECT 4;";
        if (attack === "grafted executor") f.data["executor/index.mjs"] += "\nexport const unreviewed = true;\n";
        let declaredBase = incremental ? f.base : undefined;
        if (attack === "wrong incremental base" || attack === "self prerequisite") declaredBase = f.commit;
        if (attack === "unrelated prerequisite") declaredBase = f.unrelated;
        await f.pin({tree:attack === "false tree" ? "9".repeat(40) : f.tree, base:declaredBase,
          candidate:attack === "tree masquerading as commit" ? f.tree : f.commit});
        await expect(f.run("forged")).rejects.toThrow();
        expect(await f.outputNames()).toEqual(["healthy"]);
      });
    });

  it("records the final grant check and expiry, and rejects expiry while writing staged evidence", async () => {
    await withPackageFixture(true, async f => {
      const grant = await expiredActivation();
      await f.pin({activation:grant});
      const start = Date.parse(grant.authorization.approvedAt) + 60_000, finish = start + 10_000;
      let checks = 0;
      const result = await f.run("valid-at-publish", () => checks++ === 0 ? start : finish);
      const expected = {grantCheckedAt:new Date(finish).toISOString(),grantExpiresAt:grant.authorization.expiresAt};
      const expiry = Date.parse(grant.authorization.expiresAt);
      for (const [name, expiredAfter] of [["expired-during-copy", 1], ["expired-during-record", 2]] as const) {
        let reads = 0;
        await expect(f.run(name, () => reads++ < expiredAfter ? start : expiry)).rejects.toThrow();
      }
      expect(result).toMatchObject(expected);
      expect(JSON.parse(await readFile(join(f.root,"outputs/materials-production/valid-at-publish/verification.json"),"utf8"))).toMatchObject(expected);
      expect(await f.outputNames()).toEqual(["valid-at-publish"]);
    });
  }, 30000);

  it.each(["app/server/documents/policy.ts","scripts/prepare-materials-production-package.mjs"])(
    "rejects an active freeze with a different executing input %s", async path => {
      await withPackageFixture(true, async f => {
        await f.run("healthy-closed");
        await f.pin({activation:await expiredActivation()});
        await expect(f.run("mismatched-active", () => Date.parse("2020-03-01T00:05:00Z"))).rejects.toThrow();
        expect(await f.outputNames()).toEqual(["healthy-closed"]);
      },path);
    }, 30000);
});

type PinOptions = {tree?:string; base?:string; candidate?:string; activation?:{mode:"closed"} | Awaited<ReturnType<typeof expiredActivation>>};
type PackageFixture = {
  root:string; source:string; tree:string; base:string; commit:string; unrelated:string; bundlePath:string; data:Record<string,string>;
  makeIncremental:()=>void;
  pin:(options?:PinOptions)=>Promise<void>;
  run:(name:string,now?:()=>number)=>ReturnType<typeof prepareMaterialsProductionPackage>;
  outputNames:()=>Promise<string[]>;
};

async function withPackageFixture(activeSources:boolean, test:(fixture:PackageFixture)=>Promise<void>, mismatchedFile?:string) {
  const root = await mkdtemp(join(tmpdir(),"arc-public-materials-package-"));
  if (activeSources) {
    vi.useFakeTimers({toFake:["Date"]});
    vi.setSystemTime(new Date("2020-03-01T00:05:00Z"));
  }
  async function put(path:string, bytes:string | Buffer) {
    const file = join(root,path);
    await mkdir(dirname(file),{recursive:true}); await writeFile(file,bytes);
  }
  try {
    const baseline = historical();
    const folder = "docs/verification/materials-test-candidate", source = "outputs/materials-gate-1b-b0/pair-fixture";
    const bundlePath = join(root,folder,"source.bundle"), packetPath = join(root,"packet.json");
    await mkdir(join(root,folder),{recursive:true});
    await put("baseline.json",baseline.configBytes);
    await put("version.json",JSON.stringify(baseline.version)); await put("deployments.json",JSON.stringify(baseline.deployments));
    const closedVars = {ARC_DOCUMENT_ACCEPTANCE_MODE:"closed",ARC_DOCUMENTS_ENABLED:"false"};
    const data:Record<string,string> = {
      "site/server/index.js":"export default {}; export class DocumentSite {}", "site/client/a.js":"void 0",
      "site/server/wrangler.json":JSON.stringify({main:"index.js",assets:{binding:"ASSETS",directory:"../client"},
        rules:[{type:"ESModule",globs:["**/*.js","**/*.mjs"]}],no_bundle:true,vars:closedVars,
        compatibility_date:baseline.config.compatibility_date,compatibility_flags:baseline.config.compatibility_flags,
        d1_databases:[{database_id:"122a83fd-5df9-4763-85ba-f1c728a1e02e"}]}),
      "executor/wrangler.json":JSON.stringify({main:"./index.mjs",workers_dev:false,preview_urls:false,routes:[],vars:closedVars,
        d1_databases:[{database_id:"774ed301-6b21-4795-afa2-10cdbec32625"}]}),
      "site/server/drizzle/0000_site.sql":"SELECT 1;", "executor/migrations/0003_document_production.sql":"SELECT 2;",
    };
    await put("worker/document-executor/index.ts","export default {}; export class DocumentWorkflow {}; export class DocumentExecutorEntrypoint {}");
    if (activeSources) {
      // Include the real admission and packaging sources in the fixture commit. Its grant expired in 2020.
      const graph = await build({entryPoints:["scripts/prepare-materials-production-package.mjs","worker/document-executor/index.ts"],
        outdir:"unused",bundle:true,platform:"node",format:"esm",packages:"external",external:["cloudflare:*"],metafile:true,write:false,logLevel:"silent"});
      for (const path of [...Object.keys(graph.metafile.inputs),"package.json","package-lock.json","tsconfig.json"]) {
        const bytes = await readFile(path);
        await put(path,path === mismatchedFile ? Buffer.concat([bytes,Buffer.from("\n// divergent candidate source\n")]) : bytes);
      }
      await cp("node_modules/zod",join(root,"node_modules/zod"),{recursive:true});
    }
    await put("worker/document-executor/migrations/0003_document_production.sql",data["executor/migrations/0003_document_production.sql"]);
    await put("drizzle/0000_site.sql",data["site/server/drizzle/0000_site.sql"]);
    const git = (...args:string[]) => execFileSync("git",["-c","core.autocrlf=false","-c","commit.gpgSign=false",
      "-c","user.name=Packaging fixture","-c","user.email=fixture@localhost",...args],{cwd:root,encoding:"utf8",windowsHide:true}).trim();
    git("init","--quiet");
    const emptyTree = git("write-tree"), base = git("commit-tree",emptyTree,"-m","fixture base");
    const unrelated = git("commit-tree",emptyTree,"-m","independent fixture lineage");
    git("add","--","drizzle","worker",...(activeSources ? ["app","build","scripts","package.json","package-lock.json","tsconfig.json"] : []));
    const tree = git("write-tree"), commit = git("commit-tree",tree,"-p",base,"-m","local fixture");
    git("update-ref","refs/heads/fixture",commit); git("bundle","create",bundlePath,"refs/heads/fixture");
    const built = await build({absWorkingDir:root,entryPoints:["worker/document-executor/index.ts"],outfile:"executor/index.mjs",bundle:true,
      format:"esm",platform:"neutral",target:"es2022",conditions:["workerd","worker"],external:["cloudflare:*","node:*"],write:false});
    data["executor/index.mjs"] = built.outputFiles[0].text;
    async function pin(options:PinOptions = {}) {
      const sourceTree = options.tree ?? tree, candidate = options.candidate ?? commit, bundleSha256 = sha(await readFile(bundlePath));
      const artifacts = Object.keys(data).sort().map(path=>({path,sha256:sha(data[path])}));
      for (const file of artifacts) await put(source+"/"+file.path,data[file.path]);
      const treeSha256 = sha(JSON.stringify(artifacts));
      await put(folder+"/candidate.json",JSON.stringify({candidate,tree:sourceTree,base:options.base,bundleSha256}));
      await put(folder+"/artifact-index.json",JSON.stringify({mode:"closed",relativeDirectory:source,artifacts,treeSha256}));
      const verification = JSON.stringify({candidate,tree:sourceTree,bundleSha256,artifacts:{mode:"closed",files:artifacts.length,treeSha256,verifiedAgainstDisk:true}});
      await put(folder+"/verification.json",verification);
      await put("packet.json",JSON.stringify({schemaVersion:1,baseline:{...baseline.expected,configFile:"baseline.json",versionFile:"version.json",deploymentsFile:"deployments.json"},
        source:{candidateDirectory:folder,candidate,tree:sourceTree,bundleSha256,verificationSha256:sha(verification),artifactTreeSha256:treeSha256},
        resources,activation:options.activation ?? {mode:"closed"}}));
    }
    await pin();
    await test({root,source,tree,base,commit,unrelated,bundlePath,data,pin,
      makeIncremental:()=>{git("bundle","create",bundlePath,"refs/heads/fixture","^"+base);},
      run:(name,now)=>prepareMaterialsProductionPackage(root,packetPath,name,now),
      outputNames:()=>readdir(join(root,"outputs/materials-production"))});
  } finally {
    if (activeSources) vi.useRealTimers();
    expect(resolve(root).startsWith(resolve(tmpdir())+sep+"arc-public-materials-package-")).toBe(true);
    await rm(root,{recursive:true,force:true});
  }
}
