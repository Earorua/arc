import {z} from "zod";
import {parseDocumentWorkflowArgs, type DocumentWorkflowArgs} from "../../../worker/document-executor/workflow-policy";
import {materialDigestSchema,materialIdSchema,materialRevisionSchema} from "../../contracts/documents";
import type {DocumentProviderOutcome} from "./provider";
import { documentReceiptAuditSchema } from "./provider-receipt";

export const DOCUMENT_BRIDGE_PREFIX="/internal/documents/";
const DOMAIN="arc-document-bridge-v1", WINDOW_MS=60000, MAX_BYTES=512*1024;
const operations=["claim","input","permit","result","status","cancel","readiness"] as const;
export type DocumentBridgeOperation=typeof operations[number];
export type DocumentBridgeDirection="site-to-executor"|"executor-to-site";
export interface DocumentNonceStore{claim(nonce:string,expiresAt:number,now:number):Promise<boolean>}
export class D1DocumentNonceStore implements DocumentNonceStore{
 constructor(private readonly db:D1Database){}
 async claim(nonce:string,expiresAt:number,now:number){const result=await this.db.batch([this.db.prepare("DELETE FROM document_bridge_nonces WHERE nonce IN (SELECT nonce FROM document_bridge_nonces WHERE expires_at < ? LIMIT 100)").bind(now),this.db.prepare("INSERT OR IGNORE INTO document_bridge_nonces(nonce,expires_at) VALUES (?,?)").bind(nonce,expiresAt)]);return result[1]?.meta.changes===1;}
}
function unavailable():never{throw new Error("Document bridge unavailable");}
async function key(secret:string){if(typeof secret!=="string"||secret.length<32||secret.length>8192)return unavailable();return crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);}
function hex(bytes:ArrayBuffer){return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,"0")).join("");}
async function digest(bytes:Uint8Array){return hex(await crypto.subtle.digest("SHA-256",bytes as BufferSource));}
async function signingBytes(direction:DocumentBridgeDirection,path:string,timestamp:string,nonce:string,body:Uint8Array){return new TextEncoder().encode([DOMAIN,direction,"POST",path,timestamp,nonce,await digest(body)].join("\n"));}
export async function readDocumentBridgeBody(request:Request,maximum=MAX_BYTES,signal?:AbortSignal):Promise<Uint8Array>{
 if(signal?.aborted)return unavailable();
 if(!request.body)return new Uint8Array();const reader=request.body.getReader();
 const cancel=()=>{void reader.cancel().catch(()=>{});};signal?.addEventListener("abort",cancel,{once:true});const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>maximum)unavailable();chunks.push(part.value);}const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;}catch{await reader.cancel().catch(()=>undefined);return unavailable();}finally{signal?.removeEventListener("abort",cancel);reader.releaseLock();}
}
export async function signDocumentBridgeRequest(input:{secret:string;direction:DocumentBridgeDirection;operation:DocumentBridgeOperation;body:unknown;now?:number}):Promise<Request>{
 if(!operations.includes(input.operation))return unavailable();const body=new TextEncoder().encode(JSON.stringify(input.body));if(body.byteLength>MAX_BYTES)return unavailable();
 const timestamp=String(input.now??Date.now()),nonce=crypto.randomUUID(),path=DOCUMENT_BRIDGE_PREFIX+input.operation;
 const signature=hex(await crypto.subtle.sign("HMAC",await key(input.secret),await signingBytes(input.direction,path,timestamp,nonce,body)));
 return new Request("https://document.internal"+path,{method:"POST",headers:{"content-type":"application/json","x-arc-document-time":timestamp,"x-arc-document-nonce":nonce,"x-arc-document-signature":signature},body:body as BodyInit});
}
export async function verifyDocumentBridgeRequest(request:Request,input:{secret:string;direction:DocumentBridgeDirection;nonces:DocumentNonceStore;now?:number}):Promise<{operation:DocumentBridgeOperation;body:unknown}>{
 try{
 const url=new URL(request.url),operation=url.pathname.slice(DOCUMENT_BRIDGE_PREFIX.length) as DocumentBridgeOperation;
 if(request.method!=="POST"||!url.pathname.startsWith(DOCUMENT_BRIDGE_PREFIX)||!operations.includes(operation)||url.search||url.hash)unavailable();
 const timestamp=request.headers.get("x-arc-document-time")??"",nonce=request.headers.get("x-arc-document-nonce")??"",signature=request.headers.get("x-arc-document-signature")??"",now=input.now??Date.now();
 if(!/^\d{1,16}$/u.test(timestamp)||!Number.isSafeInteger(Number(timestamp))||Math.abs(now-Number(timestamp))>WINDOW_MS||!/^[0-9a-f-]{36}$/u.test(nonce)||!/^[0-9a-f]{64}$/u.test(signature))unavailable();
 const bytes=await readDocumentBridgeBody(request);const signatureBytes=Uint8Array.from(signature.match(/../gu)!,value=>parseInt(value,16));
 if(!await crypto.subtle.verify("HMAC",await key(input.secret),signatureBytes,await signingBytes(input.direction,url.pathname,timestamp,nonce,bytes)))unavailable();
 if(!await input.nonces.claim(nonce,now+WINDOW_MS*2,now))unavailable();
 return {operation,body:JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))};
 }catch{return unavailable();}
}
export type DocumentServiceBinding={fetch(request:Request):Promise<Response>};
export const documentReadinessProbeSchema=z.object({authorizationSha256:materialDigestSchema,challenge:z.string().uuid()}).strict();
type ReadinessProbe=z.infer<typeof documentReadinessProbeSchema>;
const readinessReply=documentReadinessProbeSchema.extend({ready:z.boolean(),signature:materialDigestSchema}).strict();
function readinessProofBytes(probe:ReadinessProbe,ready:boolean,responder:"site"|"executor") {
 return new TextEncoder().encode([DOMAIN,responder+"-readiness-reply",probe.challenge,probe.authorizationSha256,String(ready)].join("\n"));
}
export async function signDocumentReadinessReply(secret:string,probe:ReadinessProbe,ready:boolean,responder:"executor"|"site"="executor") {
 const signature=hex(await crypto.subtle.sign("HMAC",await key(secret),readinessProofBytes(probe,ready,responder)));
 return {...probe,ready,signature};
}
export async function probeDocumentReadiness(secret:string,authorizationSha256:string,responder:"site"|"executor",call:(probe:ReadinessProbe)=>Promise<unknown>):Promise<boolean>{
 try{
  const probe=documentReadinessProbeSchema.parse({authorizationSha256,challenge:crypto.randomUUID()});
  const reply=readinessReply.parse(await call(probe));
  if(!reply.ready||reply.challenge!==probe.challenge||reply.authorizationSha256!==probe.authorizationSha256)return false;
  const signature=Uint8Array.from(reply.signature.match(/../gu)!,pair=>parseInt(pair,16));
  return await crypto.subtle.verify("HMAC",await key(secret),signature,readinessProofBytes(probe,true,responder));
 }catch{return false;}
}
export type DocumentBridgeOptions={binding:DocumentServiceBinding;secret:string;now?:()=>number;timeoutMs?:number};
export async function callDocumentBridge(options:DocumentBridgeOptions,direction:DocumentBridgeDirection,operation:DocumentBridgeOperation,body:unknown){
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("Document bridge unavailable"));},options.timeoutMs??(direction==="site-to-executor"?4000:8000));});
  const exchange=async()=>{
   const signed=await signDocumentBridgeRequest({secret:options.secret,direction,operation,body,now:options.now?.()});
   if(controller.signal.aborted)return unavailable();
   const response=await options.binding.fetch(new Request(signed,{signal:controller.signal}));
   if(!response.ok)return unavailable();
   return JSON.parse(new TextDecoder().decode(await readDocumentBridgeBody(response as unknown as Request,operation==="readiness"?1024:MAX_BYTES,controller.signal)));
  };
  try{return await Promise.race([exchange(),deadline]);}catch{return unavailable();}finally{clearTimeout(timer);}
}
export class DocumentExecutorBridge{
 constructor(private readonly options:DocumentBridgeOptions){}
 call(operation:DocumentBridgeOperation,body:unknown){return callDocumentBridge(this.options,"site-to-executor",operation,body);}
 async productionReady(authorizationSha256:string):Promise<boolean>{
  return probeDocumentReadiness(this.options.secret,authorizationSha256,"executor",probe=>this.call("readiness",probe));
 }
 async start(args:DocumentWorkflowArgs):Promise<void>{await this.call("claim",parseDocumentWorkflowArgs(args));}
 async cancel(jobId:string):Promise<{writersTerminated:boolean;resultsAbsent:boolean}>{return z.object({writersTerminated:z.boolean(),resultsAbsent:z.boolean()}).strict().parse(await this.call("cancel",{jobId:materialIdSchema.parse(jobId)}));}
}
const jobReference=z.object({jobId:materialIdSchema}).strict();
export const documentSendPermitSchema=jobReference.extend({consentId:materialIdSchema,textVersionId:materialIdSchema,
 generation:materialRevisionSchema,configurationDigest:materialDigestSchema}).strict();
export type DocumentSendPermit=z.infer<typeof documentSendPermitSchema>;
const nullableMoney=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
export const documentProviderOutcomeSchema=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("received"),candidate:z.unknown(),inputTokens:nullableMoney,outputTokens:nullableMoney,actualMicroUsd:nullableMoney,receiptId:z.string().min(1).max(256).nullable(),audit:documentReceiptAuditSchema.optional()}).strict(),
 z.object({kind:z.literal("not-sent"),code:z.enum(["configuration","aborted-before-send"])}).strict(),
 z.object({kind:z.literal("unknown"),code:z.enum(["timeout","connection-lost","invalid-receipt"])}).strict(),
]);
export const documentResultDeliverySchema=z.object({jobId:materialIdSchema,resultRef:materialIdSchema,outcome:documentProviderOutcomeSchema}).strict();
export interface DocumentSiteCallbacks{
 productionIdentity?:(digest:string)=>Promise<boolean>;
 claim(jobId:string):Promise<unknown>;input(jobId:string):Promise<unknown>;
 permit(request:DocumentSendPermit):Promise<unknown>;
 result(jobId:string,resultRef:string,outcome:DocumentProviderOutcome):Promise<unknown>;
 status(jobId:string):Promise<unknown>;cancelInternal(jobId:string):Promise<unknown>;
}
export function createDocumentSiteHandler(service:DocumentSiteCallbacks,options:{secret:string;nonceStore:DocumentNonceStore;now?:()=>number}){
 return async(request:Request):Promise<Response>=>{try{
 const {operation,body}=await verifyDocumentBridgeRequest(request,{secret:options.secret,direction:"executor-to-site",nonces:options.nonceStore,now:options.now?.()});
 if(operation==="readiness"){
   const probe=documentReadinessProbeSchema.parse(body),ready=await service.productionIdentity?.(probe.authorizationSha256)??false;
   return Response.json(await signDocumentReadinessReply(options.secret,probe,ready,"site"),{headers:{"cache-control":"no-store"}});
 }
 let result:unknown;if(operation==="permit"){result=await service.permit(documentSendPermitSchema.parse(body));}else if(operation==="result"){const args=documentResultDeliverySchema.parse(body);result=await service.result(args.jobId,args.resultRef,args.outcome);}else{const args=jobReference.parse(body);result=operation==="claim"?await service.claim(args.jobId):operation==="input"?await service.input(args.jobId):operation==="status"?await service.status(args.jobId):await service.cancelInternal(args.jobId);}
 return Response.json(result,{headers:{"cache-control":"no-store"}});
 }catch{return Response.json({error:"unavailable"},{status:503,headers:{"cache-control":"no-store"}});}};
}
