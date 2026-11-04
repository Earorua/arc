import {z} from "zod";
import {documentTextSchema,materialIdSchema,materialOwnerIdSchema} from "../../app/contracts/documents";
import {signDocumentBridgeRequest,readDocumentBridgeBody,type DocumentBridgeOperation,type DocumentServiceBinding,type DocumentSendPermit} from "../../app/server/documents/executor-bridge";
import type {DocumentProviderOutcome} from "../../app/server/documents/provider";
import {parseDocumentWorkflowOutput} from "./workflow-policy";
import type {DocumentExecutorSiteClient} from "./execute-job";
const inputSchema=z.object({textVersionId:materialIdSchema,text:documentTextSchema,segments:z.array(z.object({id:materialIdSchema,start:z.number().int().nonnegative(),end:z.number().int().positive()}).strict()).min(1).max(100),kind:z.enum(["resume","jd","supplement"]),providerPolicyId:materialIdSchema,outputSchemaVersion:z.literal("2026.11.1"),execution:z.object({sendScope:z.object({consentId:materialIdSchema,generation:z.number().int().nonnegative()}).strict(),modelVersion:z.string().min(1).max(200),priceVersion:z.string().max(32),configurationDigest:z.string().regex(/^[0-9a-f]{64}$/u),acceptance:z.object({runId:materialIdSchema,configurationSha256:z.string().regex(/^[0-9a-f]{64}$/u),ownerId:materialOwnerIdSchema,documentId:materialIdSchema,documentVersionId:materialIdSchema,generation:z.number().int().nonnegative()}).strict().optional()}).strict()}).strict();
export class DocumentSiteClient implements DocumentExecutorSiteClient{
 constructor(private readonly options:{binding:DocumentServiceBinding;secret:string;now?:()=>number;timeoutMs?:number}){}
 private async call(operation:DocumentBridgeOperation,body:unknown){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.options.timeoutMs??8000);try{const signed=await signDocumentBridgeRequest({secret:this.options.secret,direction:"executor-to-site",operation,body,now:this.options.now?.()});const response=await this.options.binding.fetch(new Request(signed,{signal:controller.signal}));if(!response.ok)throw new Error();const payload=JSON.parse(new TextDecoder().decode(await readDocumentBridgeBody(response as unknown as Request)));if(controller.signal.aborted)throw new Error();return payload;}catch{throw new Error("Document bridge unavailable");}finally{clearTimeout(timer);}}
 async claim(jobId:string){return z.object({jobId:materialIdSchema,claimed:z.boolean()}).strict().parse(await this.call("claim",{jobId}));}
 async input(jobId:string){return inputSchema.parse(await this.call("input",{jobId}));}
 async permit(request:DocumentSendPermit){const response=z.object({jobId:materialIdSchema,permitted:z.boolean()}).strict().parse(await this.call("permit",request));return response.jobId===request.jobId&&response.permitted;}
 async result(jobId:string,resultRef:string,outcome:DocumentProviderOutcome){return parseDocumentWorkflowOutput(await this.call("result",{jobId,resultRef,outcome}));}
}

