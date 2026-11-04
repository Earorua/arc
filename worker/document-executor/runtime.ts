import {readDocumentPolicy} from "../../app/server/documents/policy";
import {materialIdSchema} from "../../app/contracts/documents";
import {D1DocumentNonceStore} from "../../app/server/documents/executor-bridge";
import type {DocumentAnalysisProvider} from "../../app/server/documents/provider";
import {D1DocumentJobStore} from "./d1-job-store";
import {DocumentResultStore} from "./result-store";
import {DocumentSiteClient} from "./site-client";
import {HttpDocumentAnalysisProvider,calculateDocumentReservation,isDocumentProviderQualified,type DocumentProviderQualification} from "./provider-http";
import type {DocumentExecutorEnvironment} from "./environment";
import {analyzeAcceptedDocumentJob,requestDocumentSendPermit,type DocumentExecutionRuntime} from "./execute-job";
import {documentAcceptanceConfigurationDigest} from "./acceptance-policy";
export type DocumentExecutorRuntime=DocumentExecutionRuntime&{workflow:Workflow<{jobId:string;contractVersion:"2026.11.1"}>;nonces:D1DocumentNonceStore;secret:string};
export function createDocumentExecutionRuntime(env:DocumentExecutorEnvironment):DocumentExecutorRuntime{
 const jobs = new D1DocumentJobStore(env.DOCUMENT_EXECUTOR_DB), results = new DocumentResultStore(jobs, env.DOCUMENT_JOB_ASSETS);
 const mode = env.ARC_DOCUMENT_ACCEPTANCE_MODE, binding = env.DOCUMENT_PROVIDER_TRANSPORT;
 const synthetic = !!binding && (mode === "synthetic" || (mode === undefined && env.ARC_ENVIRONMENT !== "production"));
 const policy = readDocumentPolicy(synthetic ? {...env, ARC_DOCUMENT_PROVIDER_API_KEY:"synthetic-transport-only"} : env);
 let qualification: DocumentProviderQualification | null = null;
 try {
   if (typeof env.ARC_DOCUMENT_PROVIDER_QUALIFICATION === "string" && env.ARC_DOCUMENT_PROVIDER_QUALIFICATION.length <= 8192)
     qualification = JSON.parse(env.ARC_DOCUMENT_PROVIDER_QUALIFICATION);
 } catch { /* Incomplete qualification is closed. */ }
 const provider: DocumentAnalysisProvider = { async analyze(){ return {kind:"not-sent",code:"configuration"}; } };
 const runtime:DocumentExecutorRuntime={jobs,results,provider,site:new DocumentSiteClient({binding:env.DOCUMENT_SITE,secret:env.ARC_DOCUMENT_BRIDGE_SECRET,timeoutMs:4000}),
   workflow:env.DOCUMENT_WORKFLOW,nonces:new D1DocumentNonceStore(env.DOCUMENT_EXECUTOR_DB),secret:env.ARC_DOCUMENT_BRIDGE_SECRET};
 const config = policy.analysis, runId = env.ARC_DOCUMENT_ACCEPTANCE_RUN_ID;
 if (policy.documentsEnabled && config && isDocumentProviderQualified(config, qualification)) {
   if (synthetic) {
     const http = new HttpDocumentAnalysisProvider(config, {qualification, fetch:(request,init) => binding.fetch(request,init)});
     runtime.analyzeJob = (jobId,input,signal) => http.analyze(input,signal,()=>requestDocumentSendPermit(runtime.site,jobId,input));
   } else if (mode === "live" && env.ARC_ENVIRONMENT === "production" && !binding && typeof runId === "string" && materialIdSchema.safeParse(runId).success) {
     const gate = {runId, configurationSha256:documentAcceptanceConfigurationDigest(config,qualification),
       reservationMicroUsd:calculateDocumentReservation(config,qualification)};
     // Only this job-scoped path can reach the external transport. The generic provider stays closed.
     const http = new HttpDocumentAnalysisProvider(config, {qualification, fetch:(request,init) => fetch(request,init)});
     runtime.analyzeJob = (jobId,input,signal) => analyzeAcceptedDocumentJob(jobId,input,signal,jobs,http,gate,()=>requestDocumentSendPermit(runtime.site,jobId,input));
   }
 }
 return runtime;
}
