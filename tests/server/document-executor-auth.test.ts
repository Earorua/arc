// @vitest-environment node
import {describe,expect,it} from "vitest";
import {signDocumentBridgeRequest,verifyDocumentBridgeRequest, type DocumentNonceStore} from "../../app/server/documents/executor-bridge";
const secret="document-only-secret-at-least-32-characters";
function nonceStore():DocumentNonceStore{const nonces=new Set<string>();return{async claim(nonce){if(nonces.has(nonce))return false;nonces.add(nonce);return true;}};}
describe("private document signature domain",()=>{
 it("authenticates exact bytes once with direction and time binding",async()=>{const request=await signDocumentBridgeRequest({secret,direction:"site-to-executor",operation:"claim",body:{jobId:"job-one",contractVersion:"2026.11.1"},now:100000});const store=nonceStore();expect(await verifyDocumentBridgeRequest(request.clone() as unknown as Request,{secret,direction:"site-to-executor",nonces:store,now:100000})).toMatchObject({operation:"claim",body:{jobId:"job-one"}});await expect(verifyDocumentBridgeRequest(request,{secret,direction:"site-to-executor",nonces:store,now:100000})).rejects.toThrow("Document bridge unavailable");});
 it("rejects Research credentials, opposite direction, expired requests and tampered data",async()=>{for(const mode of ["secret","direction","expired","tampered"]){let request=await signDocumentBridgeRequest({secret,direction:"site-to-executor",operation:"claim",body:{jobId:"job-one",contractVersion:"2026.11.1"},now:100000});if(mode==="tampered")request=new Request(request.url,{method:"POST",headers:request.headers,body:'{"jobId":"other"}'});await expect(verifyDocumentBridgeRequest(request,{secret:mode==="secret"?"research-key-at-least-thirty-two-characters":secret,direction:mode==="direction"?"executor-to-site":"site-to-executor",nonces:nonceStore(),now:mode==="expired"?200000:100000})).rejects.toThrow("Document bridge unavailable");}});
 it("will not sign arbitrary routes or absent dedicated secrets",async()=>{await expect(signDocumentBridgeRequest({secret:"",direction:"site-to-executor",operation:"claim",body:{},now:1})).rejects.toThrow();});
});

