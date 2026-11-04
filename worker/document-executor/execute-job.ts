import type {DocumentAnalysisProvider,DocumentProviderInput,DocumentProviderOutcome} from "../../app/server/documents/provider";
import {D1DocumentJobStore} from "./d1-job-store";
import {DocumentResultStore} from "./result-store";
import {parseDocumentWorkflowOutput,type DocumentWorkflowOutput} from "./workflow-policy";
import type { DocumentAcceptanceGate } from "./acceptance-policy";
import type {DocumentSendPermit} from "../../app/server/documents/executor-bridge";
export interface DocumentExecutorSiteClient{claim(jobId:string):Promise<{claimed:boolean}>;input(jobId:string):Promise<DocumentProviderInput>;
 permit(input:DocumentSendPermit):Promise<boolean>;
 result(jobId:string,resultRef:string,outcome:DocumentProviderOutcome):Promise<{jobId:string;state:string;resultRef:string|null}>;}
export type DocumentExecutionRuntime={jobs:D1DocumentJobStore;results:DocumentResultStore;site:DocumentExecutorSiteClient;provider:DocumentAnalysisProvider;
 analyzeJob?:(jobId:string,input:DocumentProviderInput,signal:AbortSignal)=>Promise<DocumentProviderOutcome>};

export async function requestDocumentSendPermit(site:DocumentExecutorSiteClient,jobId:string,input:DocumentProviderInput):Promise<boolean>{
 const execution=input.execution;
 if(!execution?.sendScope)return false;
 return site.permit({jobId,textVersionId:input.textVersionId,consentId:execution.sendScope.consentId,
   generation:execution.sendScope.generation,configurationDigest:execution.configurationDigest});
}

/** The actual HTTP adapter calls the reservation hook after validating and serializing the exact payload. */
export async function analyzeAcceptedDocumentJob(jobId: string, input: DocumentProviderInput, signal: AbortSignal,
  jobs: D1DocumentJobStore, provider: DocumentAnalysisProvider, gate: DocumentAcceptanceGate, permit:()=>Promise<boolean>): Promise<DocumentProviderOutcome> {
  let admitted = false, stopUnconfirmed = false;
  const outcome = await provider.analyze(input, signal, async () => {
    if (!await permit()) return false;
    try { admitted = await jobs.reserveAcceptance(jobId, input, gate); }
    catch {
      // If D1 accepted a write but lost its acknowledgement, its pending row also blocks all subsequent sends.
      try { await jobs.stopAcceptance(gate.runId); } catch { stopUnconfirmed = true; }
    }
    return admitted;
  }, (receipt, observed) => jobs.claimAcceptanceReceipt(gate.runId, jobId, receipt, observed));
  // Without any durable executor acknowledgement, the independent site must retain its only execution slot.
  if (stopUnconfirmed) return {kind:"unknown",code:"connection-lost"};
  if (!admitted) return {kind:"not-sent",code:"configuration"};
  const verified = await jobs.finishAcceptance(gate.runId, jobId, outcome).catch(async () => {
    await jobs.stopAcceptance(gate.runId).catch(() => undefined);
    return false;
  });
  // Keep known provider charges for settlement even if the round stopped or the final ledger write failed.
  return !verified && outcome.kind === "received" ? {...outcome,candidate:null} : outcome;
}
export async function executeDocumentJob(jobId:string,runtime:DocumentExecutionRuntime):Promise<DocumentWorkflowOutput>{
 const existing=await runtime.jobs.get(jobId);if(existing?.result_ready)return parseDocumentWorkflowOutput({jobId,state:"delivery-pending",resultRef:existing.result_ref});
 if(!await runtime.jobs.claim(jobId))return parseDocumentWorkflowOutput({jobId,state:"already-claimed",resultRef:null});
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
