import type {DocumentAnalysisProvider,DocumentProviderInput,DocumentProviderOutcome} from "../../app/server/documents/provider";
import {D1DocumentJobStore} from "./d1-job-store";
import {DocumentResultStore} from "./result-store";
import {parseDocumentWorkflowOutput,type DocumentWorkflowOutput} from "./workflow-policy";
import type { DocumentAcceptanceGate } from "./acceptance-policy";
import type { DocumentProductionRelease } from "./production-policy";
import type {DocumentSendPermit} from "../../app/server/documents/executor-bridge";
export interface DocumentExecutorSiteClient{claim(jobId:string):Promise<{claimed:boolean}>;input(jobId:string):Promise<DocumentProviderInput>;
 permit(input:DocumentSendPermit):Promise<boolean>;
 result(jobId:string,resultRef:string,outcome:DocumentProviderOutcome):Promise<{jobId:string;state:string;resultRef:string|null}>;}
export type DocumentExecutionRuntime={jobs:D1DocumentJobStore;results:DocumentResultStore;site:DocumentExecutorSiteClient;provider:DocumentAnalysisProvider;
 paidIntent?:Promise<string|null>; productionTurn?:(jobId:string)=>Promise<boolean>;
 analyzeJob?:(jobId:string,input:DocumentProviderInput,signal:AbortSignal)=>Promise<DocumentProviderOutcome>};

export async function requestDocumentSendPermit(site:DocumentExecutorSiteClient,jobId:string,input:DocumentProviderInput):Promise<boolean>{
 const execution=input.execution;
 if(!execution?.sendScope)return false;
 return site.permit({jobId,textVersionId:input.textVersionId,consentId:execution.sendScope.consentId,
   generation:execution.sendScope.generation,configurationDigest:execution.configurationDigest});
}

/** The HTTP adapter requests a single-use site permit and durable reservation only after validating its payload. */
export async function analyzePaidDocumentJob(jobId: string, input: DocumentProviderInput, signal: AbortSignal,
  jobs: D1DocumentJobStore, provider: DocumentAnalysisProvider, gate: DocumentAcceptanceGate | DocumentProductionRelease,
  permit:()=>Promise<boolean>): Promise<DocumentProviderOutcome> {
  const production = "authorization" in gate;
  const scope = production ? "production" : "acceptance", id = production ? gate.authorization.id : gate.runId;
  const marker = input.execution?.production;
  if (production ? (!marker || marker.jobId !== jobId || marker.authorizationSha256 !== await gate.identity || input.execution?.acceptance)
    : marker) return {kind:"not-sent",code:"configuration"};
  let admitted = false, stopUnconfirmed = false;
  const outcome = await provider.analyze(input, signal, async () => {
    if (!await permit()) return false;
    try { admitted = production ? await jobs.reserveProduction(jobId,gate) : await jobs.reserveAcceptance(jobId,input,gate); }
    catch {
      // A lost reservation acknowledgement cannot open a fresh paid request, even with a different grant.
      try { await jobs.stopPaidTransport(scope,id); } catch { stopUnconfirmed = true; }
    }
    return admitted;
  }, (receipt, observed) => jobs.claimPaidReceipt(scope,id,jobId,receipt,observed));
  if (stopUnconfirmed) return {kind:"unknown",code:"connection-lost"};
  if (!admitted) return {kind:"not-sent",code:"configuration"};
  try { return await jobs.finishPaidDispatch(scope,id,jobId,outcome); }
  catch {
    await jobs.stopPaidTransport(scope,id).catch(() => undefined);
    return outcome.kind === "received" ? {...outcome,candidate:null} : outcome;
  }
}
export async function executeDocumentJob(jobId:string,runtime:DocumentExecutionRuntime):Promise<DocumentWorkflowOutput>{
 const existing=await runtime.jobs.get(jobId);if(existing?.result_ready)return parseDocumentWorkflowOutput({jobId,state:"delivery-pending",resultRef:existing.result_ref});
 if(runtime.productionTurn && !await runtime.productionTurn(jobId))return parseDocumentWorkflowOutput({jobId,state:"queued",resultRef:null});
 if(!await runtime.jobs.claim(jobId,await runtime.paidIntent))return parseDocumentWorkflowOutput({jobId,state:"already-claimed",resultRef:null});
 let outcome:DocumentProviderOutcome;let providerStarted=false;
 try{
  const grant=await runtime.site.claim(jobId);if(!grant.claimed)outcome={kind:"not-sent",code:"aborted-before-send"};
  else{
    const input=await runtime.site.input(jobId),current=await runtime.jobs.get(jobId);
    if(current?.cleanup_requested)outcome={kind:"not-sent",code:"aborted-before-send"};
    else{
      const signal=new AbortController().signal;
      providerStarted=true;
      outcome=runtime.analyzeJob ? await runtime.analyzeJob(jobId,input,signal) :
        await runtime.provider.analyze(input,signal,()=>requestDocumentSendPermit(runtime.site,jobId,input));
    }
  }
 }catch{outcome=providerStarted?{kind:"unknown",code:"connection-lost"}:{kind:"not-sent",code:"aborted-before-send"};}
 try{const resultRef=await runtime.results.save(jobId,outcome);return parseDocumentWorkflowOutput({jobId,state:"delivery-pending",resultRef});}
 catch{throw new Error("Document workflow unavailable");}
}
export async function deliverDocumentResult(jobId:string,runtime:Pick<DocumentExecutionRuntime,"jobs"|"results"|"site">):Promise<DocumentWorkflowOutput>{
 const result=await runtime.results.read(jobId);if(!result)return parseDocumentWorkflowOutput({jobId,state:"cost-unknown",resultRef:null});
 try{const response=await runtime.site.result(jobId,result.resultRef,result.outcome);const settled=result.outcome.kind==="not-sent"||(result.outcome.kind==="received"&&result.outcome.actualMicroUsd!==null&&result.outcome.receiptId!==null);await runtime.jobs.markDelivered(jobId,settled);return parseDocumentWorkflowOutput(response);}
 catch{await runtime.jobs.deliveryFailed(jobId);return parseDocumentWorkflowOutput({jobId,state:"delivery-pending",resultRef:result.resultRef});}
 finally{try{const row=await runtime.jobs.get(jobId);if(row?.cleanup_requested)await runtime.results.cleanup(jobId);}catch{/* A durable cleanup request remains discoverable by executor maintenance. */}}
}
