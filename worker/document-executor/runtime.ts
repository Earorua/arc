import { readDocumentPolicy } from "../../app/server/documents/policy";
import { D1DocumentNonceStore } from "../../app/server/documents/executor-bridge";
import type { DocumentAnalysisProvider } from "../../app/server/documents/provider";
import { D1DocumentJobStore } from "./d1-job-store";
import { DocumentResultStore } from "./result-store";
import { DocumentSiteClient } from "./site-client";
import { HttpDocumentAnalysisProvider,calculateDocumentReservation,isDocumentProviderQualified } from "./provider-http";
import type { DocumentExecutorEnvironment } from "./environment";
import { analyzePaidDocumentJob,requestDocumentSendPermit,type DocumentExecutionRuntime } from "./execute-job";
import { documentAcceptanceConfigurationDigest } from "./acceptance-policy";
import { documentTransportMode,readDocumentJson,readDocumentProductionRelease } from "./production-policy";

export type DocumentExecutorRuntime = DocumentExecutionRuntime & {
  productionReady?:(digest:string)=>Promise<boolean>;
  workflow:Workflow<{jobId:string;contractVersion:"2026.11.1"}>; nonces:D1DocumentNonceStore; secret:string;
};
function hasProductionBindings(env:DocumentExecutorEnvironment):boolean {
  return typeof env.DOCUMENT_SITE?.fetch==="function" && typeof env.DOCUMENT_WORKFLOW?.get==="function"
    && typeof env.DOCUMENT_WORKFLOW?.create==="function" && typeof env.DOCUMENT_JOB_ASSETS?.head==="function"
    && typeof env.DOCUMENT_JOB_ASSETS?.get==="function" && typeof env.DOCUMENT_JOB_ASSETS?.delete==="function"
    && typeof env.DOCUMENT_JOB_ASSETS?.createMultipartUpload==="function" && typeof env.DOCUMENT_JOB_ASSETS?.resumeMultipartUpload==="function";
}
export function createDocumentExecutionRuntime(env:DocumentExecutorEnvironment): DocumentExecutorRuntime {
  const jobs = new D1DocumentJobStore(env.DOCUMENT_EXECUTOR_DB), results = new DocumentResultStore(jobs,env.DOCUMENT_JOB_ASSETS);
  const mode = documentTransportMode(env,"executor"), binding = env.DOCUMENT_PROVIDER_TRANSPORT;
  const policy = readDocumentPolicy(mode === "synthetic" ? {...env,ARC_DOCUMENT_PROVIDER_API_KEY:"synthetic-transport-only"} : env);
  const qualification = readDocumentJson(env.ARC_DOCUMENT_PROVIDER_QUALIFICATION);
  // Public HTTP is available only to a job-scoped paid path. The generic provider stays closed in every mode.
  const provider: DocumentAnalysisProvider = { async analyze(){ return {kind:"not-sent",code:"configuration"}; } };
  const site=new DocumentSiteClient({binding:env.DOCUMENT_SITE,secret:env.ARC_DOCUMENT_BRIDGE_SECRET,timeoutMs:4000});
  const runtime: DocumentExecutorRuntime = { jobs,results,provider,site,
    workflow:env.DOCUMENT_WORKFLOW,nonces:new D1DocumentNonceStore(env.DOCUMENT_EXECUTOR_DB),secret:env.ARC_DOCUMENT_BRIDGE_SECRET };
  const config = policy.analysis;
  if (mode === "closed" || !policy.documentsEnabled || !config || !isDocumentProviderQualified(config,qualification)) return runtime;
  if (mode === "synthetic" && binding) {
    const http = new HttpDocumentAnalysisProvider(config,{qualification,fetch:(request,init)=>binding.fetch(request,init)});
    runtime.analyzeJob = (jobId,input,signal) => input.execution?.production || input.execution?.acceptance
      ? provider.analyze(input,signal) : http.analyze(input,signal,()=>requestDocumentSendPermit(runtime.site,jobId,input));
  } else if (mode === "acceptance" || mode === "production") {
    const reservationMicroUsd = calculateDocumentReservation(config,qualification);
    const gate = mode === "acceptance"
      ? {runId:env.ARC_DOCUMENT_ACCEPTANCE_RUN_ID!,configurationSha256:documentAcceptanceConfigurationDigest(config,qualification),reservationMicroUsd}
      : readDocumentProductionRelease(env,config,qualification,reservationMicroUsd);
    if (gate) {
      if ("authorization" in gate) {
       runtime.productionReady = async digest => {
        const snapshot = await jobs.productionReadiness(gate,digest);
        if (!snapshot || !hasProductionBindings(env)) return false;
        if (snapshot.active_job) {
          const instance=await runtime.workflow.get(snapshot.active_job);
          if ((await instance.status()).status!=="running") return false;
        }
        await env.DOCUMENT_JOB_ASSETS.head("document-readiness/v1");
        return site.productionReady(digest);
       };
       if (!hasProductionBindings(env)) return runtime;
       runtime.productionTurn = async jobId => {
         const holder=await jobs.productionTurn(jobId,gate);
         if (!holder) return true;
         const instance=await runtime.workflow.get(holder);
         return (await instance.status()).status!=="running";
       };
      }
      runtime.paidIntent = "authorization" in gate ? gate.identity : Promise.resolve("acceptance");
      const http = new HttpDocumentAnalysisProvider(config,{qualification,fetch:(request,init)=>fetch(request,init)});
      runtime.analyzeJob = (jobId,input,signal) => analyzePaidDocumentJob(jobId,input,signal,jobs,http,gate,
        ()=>requestDocumentSendPermit(runtime.site,jobId,input));
    }
  }
  return runtime;
}
