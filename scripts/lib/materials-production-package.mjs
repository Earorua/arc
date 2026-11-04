import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { isDedicatedMaterialsDatabaseId } from "../../build/cloudflare-target.ts";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const workerName = z.string().max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const productionName = workerName.refine(name => name.startsWith("arc-materials-prod-"));
const expectedBaseline = z.strictObject({
  accountId: z.string().regex(/^[a-f0-9]{32}$/u), workerName, versionId: z.uuid(), deploymentId: z.uuid(), configSha256: digest,
});
const resourceInventory = z.strictObject({
  documentsBucket: productionName, executorName: productionName,
  executorDatabase: z.strictObject({ name: productionName, id: z.uuid() }),
  resultsBucket: productionName, workflow: productionName,
});
const publicAnalysisFields = {
  provider: "ARC_DOCUMENT_PROVIDER", model: "ARC_DOCUMENT_MODEL", endpoint: "ARC_DOCUMENT_PROVIDER_ENDPOINT",
  providerPolicyId: "ARC_DOCUMENT_PROVIDER_POLICY_ID", priceVersion: "ARC_DOCUMENT_PRICE_VERSION",
  userDailyMicroUsd: "ARC_DOCUMENT_USER_DAILY_MICRO_USD", globalDailyMicroUsd: "ARC_DOCUMENT_GLOBAL_DAILY_MICRO_USD",
  maxJobMicroUsd: "ARC_DOCUMENT_MAX_JOB_MICRO_USD", maxInputTokens: "ARC_DOCUMENT_MAX_INPUT_TOKENS",
  maxOutputTokens: "ARC_DOCUMENT_MAX_OUTPUT_TOKENS", httpTimeoutMs: "ARC_DOCUMENT_HTTP_TIMEOUT_MS",
};
const ownedVars = new Set([...Object.values(publicAnalysisFields), "ARC_DOCUMENTS_ENABLED", "ARC_DOCUMENT_ANALYSIS_ENABLED",
  "ARC_DOCUMENT_PLANNING_ENABLED", "ARC_DOCUMENT_ROUTING_POLICY", "ARC_DOCUMENT_PROVIDER_QUALIFICATION",
  "ARC_DOCUMENT_PRODUCTION_ENABLED", "ARC_DOCUMENT_PRODUCTION_AUTHORIZATION"]);
const emptyCollections = ["kv_namespaces","vectorize","ai_search_namespaces","ai_search","hyperdrive","secrets_store_secrets",
  "artifacts","analytics_engine_datasets","unsafe_hello_world","flagship","ratelimits","worker_loaders","dispatch_namespaces",
  "send_email","mtls_certificates","pipelines","vpc_services","vpc_networks","migrations"];
const emptyStructures = { durable_objects:{bindings:[]}, queues:{producers:[],consumers:[]}, logfwdr:{bindings:[]}, define:{}, cloudchamber:{} };
const siteSettings = new Set(["account_id","name","topLevelName","main","assets","vars","secrets","d1_databases","r2_buckets","services","workflows",
  "compatibility_date","compatibility_flags","routes","triggers","workers_dev","preview_urls","keep_vars","placement","usage_model",
  "dev","legacy_env","jsx_factory","jsx_fragment","rules","build","no_bundle","observability","python_modules",
  ...emptyCollections,...Object.keys(emptyStructures)]);

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export function readPacketJson(bytes) {
  return JSON.parse(bytes.toString(), (key, value) => {
    if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("Invalid materials package data");
    return value;
  });
}
function check(value) {
  if (!value) throw new Error("Public materials baseline mismatch");
}
function checkPublicSite(config) {
  check(Object.keys(config).every(key=>siteSettings.has(key)));
  for(const key of emptyCollections) if(key in config) check(isDeepStrictEqual(config[key],[]));
  for(const [key, shape] of Object.entries(emptyStructures)) if(key in config) check(isDeepStrictEqual(config[key],shape));
  check(Object.keys(config.secrets ?? {}).every(key=>key==="required"));
  check(Object.keys(config.build ?? {}).every(key=>key==="watch_dir"));
  check(Object.keys(config.triggers ?? {}).every(key=>key==="crons"));
  check(config.vars?.BETTER_AUTH_URL === "https://arcmaps.net" && config.vars?.ARC_ENVIRONMENT === "production");
  check(config.workers_dev === false && config.preview_urls === false && config.keep_vars === true);
  check(config.routes?.some(route => route.custom_domain === true && route.pattern === "arcmaps.net"));
  check(config.assets?.binding === "ASSETS" && config.d1_databases?.some(db => db.binding === "DB"));
  check(config.r2_buckets?.some(bucket => bucket.binding === "PROOF_ASSETS"));
  check(config.services?.some(service => service.binding === "ARC_RESEARCH_EXECUTOR"));
  check(config.secrets?.required?.includes("BETTER_AUTH_SECRET"));
}
function bindingInventory(config) {
  function only(value, keys) { check(Object.keys(value).every(key=>keys.includes(key))); }
  const expected = new Map();
  function add(name, meaning) {
    check(typeof name === "string" && !expected.has(name));
    if (name.startsWith("ARC_DOCUMENT") || name.startsWith("DOCUMENT_")) {
      check((meaning.type === "plain_text" && ownedVars.has(name))
        || (meaning.type === "secret_text" && name === "ARC_DOCUMENT_BRIDGE_SECRET")
        || (meaning.type === "r2_bucket" && name === "DOCUMENT_ASSETS") || (meaning.type === "service" && name === "DOCUMENT_EXECUTOR"));
    }
    expected.set(name, meaning);
  }
  for (const [name, text] of Object.entries(config.vars)) {
    check(typeof text === "string" && !/(?:_API_KEY|_SECRET(?:_HEX)?|_ACCESS_TOKEN|_PASSWORD)$/u.test(name));
    add(name, {type:"plain_text", text});
  }
  for (const name of config.secrets.required) add(name, {type:"secret_text"});
  for (const db of config.d1_databases) {
    only(db,["binding","database_id","database_name","migrations_dir","migrations_table"]); add(db.binding,{type:"d1",id:db.database_id});
  }
  for (const bucket of config.r2_buckets) {
    only(bucket,["binding","bucket_name","jurisdiction"]);
    add(bucket.binding,{type:"r2_bucket",bucket_name:bucket.bucket_name,jurisdiction:bucket.jurisdiction ?? "default"});
  }
  for (const service of config.services) {
    only(service,["binding","service","entrypoint","environment"]);
    add(service.binding,{type:"service",service:service.service,entrypoint:service.entrypoint ?? null,environment:service.environment ?? "production"});
  }
  for (const flow of config.workflows ?? []) {
    only(flow,["binding","name","class_name","script_name"]);
    add(flow.binding,{type:"workflow",workflow_name:flow.name,class_name:flow.class_name,script_name:flow.script_name ?? config.name});
  }
  add(config.assets.binding, {type:"assets"});
  return expected;
}

/** Checks saved version/deployment readbacks. Results contain counts and digests only. */
export function verifyProductionBaseline({configBytes, version, deployments, expected}) {
  try {
    const identity = expectedBaseline.parse(expected);
    check(sha256(configBytes) === identity.configSha256);
    const config = readPacketJson(configBytes);
    checkPublicSite(config);
    check(config.account_id === identity.accountId && config.name === identity.workerName && version.id === identity.versionId);
    const sorted = [...deployments].sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on));
    check(sorted.every(row => Number.isFinite(Date.parse(row.created_on))) && sorted[0]?.id === identity.deploymentId);
    check(!sorted[1] || Date.parse(sorted[0].created_on) > Date.parse(sorted[1].created_on));
    check(isDeepStrictEqual(sorted[0].versions, [{version_id:identity.versionId,percentage:100}]));
    const runtime = version.resources.script_runtime;
    check(runtime.compatibility_date === config.compatibility_date && isDeepStrictEqual(runtime.compatibility_flags, config.compatibility_flags));
    check(runtime.usage_model === (config.usage_model ?? "standard"));
    check(isDeepStrictEqual(runtime.assets?.raw_run_worker_first,config.assets.run_worker_first ?? false));
    const script=version.resources.script;
    if(config.placement?.region) {
      check(Object.keys(config.placement).length === 1 && script?.placement_mode === "targeted" && script.placement?.mode === "targeted");
      const targets=script.placement.target;
      check(targets?.length===1 && targets[0].type==="region" && targets[0].region===config.placement.region);
    } else {
      const mode=config.placement?.mode ?? "off";
      check((mode==="off" || mode==="smart") && Object.keys(config.placement ?? {}).every(key=>key==="mode"));
      check((script?.placement_mode ?? "off") === mode && (script?.placement?.mode ?? "off") === mode);
    }
    const entries = bindingInventory(config);
    const seen = new Set();
    for (const item of version.resources.bindings) {
      const wanted = entries.get(item.name);
      check(wanted && !seen.has(item.name));
      seen.add(item.name);
      check(Object.keys(item).every(key=>key==="name" || Object.hasOwn(wanted,key) || (key==="database_id" && item.type==="d1")));
      for (const [key, value] of Object.entries(wanted)) {
        const defaults = {entrypoint:null,environment:"production",jurisdiction:"default",script_name:config.name};
        const observed = item[key] ?? defaults[key];
        check(observed === value);
      }
      if (item.type === "d1" && "database_id" in item) check(item.database_id === wanted.id);
      if (item.type === "secret_text") check(Object.keys(item).every(key => key === "name" || key === "type"));
    }
    check(seen.size === entries.size);
    return { config, bindingCount:entries.size, versionId:identity.versionId, deploymentId:identity.deploymentId, configSha256:identity.configSha256 };
  } catch { throw new Error("Public materials baseline mismatch"); }
}

async function productionVars(activation, now) {
  if (activation.mode === "closed") {
    z.strictObject({mode:z.literal("closed")}).parse(activation);
    // keep_vars is enabled on the public site. Explicitly invalidate a previously deployed grant.
    return {vars:{ ARC_DOCUMENTS_ENABLED:"false", ARC_DOCUMENT_ANALYSIS_ENABLED:"false", ARC_DOCUMENT_PLANNING_ENABLED:"false",
      ARC_DOCUMENT_PRODUCTION_ENABLED:"false", ARC_DOCUMENT_PRODUCTION_AUTHORIZATION:"" }, checkGrant:null};
  }
  // The CLI runs with the project's locked TS loader. Use the same policy code that handles real jobs.
  const {documentAnalysisMetadataSchema, readDocumentSitePolicy} = await import("../../app/server/documents/policy.ts");
  const {documentProviderQualificationSchema, isDocumentProviderQualified, calculateDocumentReservation} = await import("../../worker/document-executor/provider-http.ts");
  const {documentProductionAuthorizationSchema, readDocumentProductionRelease, activeProductionIdentity, documentTransportMode} =
    await import("../../worker/document-executor/production-policy.ts");
  const {config, qualification, authorization} = z.strictObject({mode:z.literal("production"), config:documentAnalysisMetadataSchema,
    qualification:documentProviderQualificationSchema, authorization:documentProductionAuthorizationSchema}).parse(activation);
  check(isDocumentProviderQualified(config, qualification));
  const vars = { ARC_DOCUMENTS_ENABLED:"true", ARC_DOCUMENT_ANALYSIS_ENABLED:"true", ARC_DOCUMENT_PLANNING_ENABLED:"true",
    ARC_DOCUMENT_PRODUCTION_ENABLED:"true", ARC_DOCUMENT_PRODUCTION_AUTHORIZATION:JSON.stringify(authorization),
    ARC_DOCUMENT_PROVIDER_QUALIFICATION:JSON.stringify(qualification), ARC_DOCUMENT_ROUTING_POLICY:JSON.stringify(config.routingPolicy) };
  for (const [key, name] of Object.entries(publicAnalysisFields)) vars[name] = String(config[key]);
  const environment = {...vars, ARC_ENVIRONMENT:"production"};
  check(documentTransportMode(environment, "site") === "production" && documentTransportMode(environment, "executor") === "production");
  const roundTrip = readDocumentSitePolicy(environment);
  check(roundTrip.analysisEnabled && isDeepStrictEqual(roundTrip.analysis, config));
  const release = readDocumentProductionRelease(environment, config, qualification, calculateDocumentReservation(config, qualification));
  check(release);
  async function checkGrant() {
    const checkedAt = now();
    check(await activeProductionIdentity(release, () => checkedAt));
    return {grantCheckedAt:new Date(checkedAt).toISOString(), grantExpiresAt:release.authorization.expiresAt};
  }
  await checkGrant();
  return {vars, checkGrant};
}
function appendBinding(rows, added) {
  const existing = rows.filter(row => row.binding === added.binding);
  if (existing.length) {
    check(existing.length === 1 && isDeepStrictEqual(existing[0], added));
    return rows;
  }
  return [...rows, added];
}
export async function composeProductionConfigs(baseline, rawInventory, activation, now = Date.now) {
  try {
    checkPublicSite(baseline);
    bindingInventory(baseline);
    const r = resourceInventory.parse(rawInventory);
    const allNames = [r.documentsBucket, r.executorName, r.executorDatabase.name, r.resultsBucket, r.workflow];
    check(new Set(allNames).size === allNames.length && !allNames.includes(baseline.name));
    check(isDedicatedMaterialsDatabaseId(r.executorDatabase.id));
    check(!baseline.d1_databases.some(db => db.database_id.toLowerCase() === r.executorDatabase.id.toLowerCase() || allNames.includes(db.database_name)));
    check(!baseline.r2_buckets.some(bucket => bucket.binding !== "DOCUMENT_ASSETS" && allNames.includes(bucket.bucket_name)));
    check(!baseline.services.some(service => service.binding !== "DOCUMENT_EXECUTOR" && allNames.includes(service.service)));
    check(!(baseline.workflows ?? []).some(flow => allNames.includes(flow.name) || allNames.includes(flow.script_name)));
    const site = structuredClone(baseline);
    for (const name of Object.keys(site.vars)) {
      if (!name.startsWith("ARC_DOCUMENT")) continue;
      check(ownedVars.has(name)); delete site.vars[name];
    }
    const {vars, checkGrant} = await productionVars(activation, now);
    if (activation.mode === "closed") {
      for(const name of Object.keys(baseline.vars)) if(ownedVars.has(name) && !Object.hasOwn(vars,name)) vars[name]="";
    }
    Object.assign(site.vars, vars);
    site.main = "./index.js";
    site.assets.directory = "../client";
    site.d1_databases = site.d1_databases.map(db => db.binding === "DB" ? {...db, migrations_dir:"drizzle"} : db);
    site.r2_buckets = appendBinding(site.r2_buckets, {binding:"DOCUMENT_ASSETS",bucket_name:r.documentsBucket});
    site.services = appendBinding(site.services, {binding:"DOCUMENT_EXECUTOR",service:r.executorName,entrypoint:"DocumentExecutorEntrypoint"});
    check(!site.secrets.required.includes("ARC_DOCUMENT_PROVIDER_API_KEY"));
    site.secrets.required = [...new Set([...site.secrets.required, "ARC_DOCUMENT_BRIDGE_SECRET"])];
    site.triggers = {...site.triggers, crons:[...new Set([...(site.triggers?.crons ?? []), "*/5 * * * *"])]};
    bindingInventory(site);
    const executor = {
      name:r.executorName, account_id:site.account_id, main:"./index.mjs", compatibility_date:site.compatibility_date,
      compatibility_flags:[...site.compatibility_flags], workers_dev:false, preview_urls:false, routes:[],
      d1_databases:[{binding:"DOCUMENT_EXECUTOR_DB",database_name:r.executorDatabase.name,database_id:r.executorDatabase.id,migrations_dir:"migrations"}],
      r2_buckets:[{binding:"DOCUMENT_JOB_ASSETS",bucket_name:r.resultsBucket}],
      workflows:[{binding:"DOCUMENT_WORKFLOW",name:r.workflow,class_name:"DocumentWorkflow"}],
      services:[{binding:"DOCUMENT_SITE",service:site.name,entrypoint:"DocumentSite"}],
      secrets:{required:["ARC_DOCUMENT_BRIDGE_SECRET", ...(activation.mode === "production" ? ["ARC_DOCUMENT_PROVIDER_API_KEY"] : [])]},
      vars:{...vars, ARC_ENVIRONMENT:"production", ARC_DOCUMENT_MAINTENANCE_ENABLED:"true"}, triggers:{crons:["*/5 * * * *"]},
    };
    return {site, executor, ...(checkGrant && {checkGrant})};
  } catch { throw new Error("Public materials configuration rejected"); }
}
