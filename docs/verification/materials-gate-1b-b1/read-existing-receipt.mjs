import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const scope = 'docs/verification/materials-gate-1b-b1';
const runtime = join(root, 'work/kimi-b1-147bfe15');
const sha = value => createHash('sha256').update(value).digest('hex');
const requestModel = 'moonshotai/kimi-k3.1-pro';
const canonicalModel = 'moonshotai/kimi-k3.1-pro-20261023';

async function frozenHelpers() {
  const manifest = JSON.parse(readFileSync(join(root, scope, 'single-receipt-entry-verification.json')));
  for (const [path,digest] of Object.entries(manifest.frozenProductionSourceSha256)) {
    assert.equal(sha(readFileSync(join(runtime,path))),digest);
  }
  for (const [name,digest] of Object.entries(manifest.testedFilesSha256)) {
    assert.equal(sha(readFileSync(join(runtime,scope,name))),digest);
  }
  return {
    ...await import(pathToFileURL(join(runtime,scope,'capture-probe-metadata.mjs')).href),
    ...await import(pathToFileURL(join(runtime,'worker/document-executor/generation-receipt.ts')).href),
  };
}

/** A separate, owner-invoked read. It cannot send a prompt or resume the consumed inference run. */
export async function readExistingReceipt({key,binding,locator,sourceResult,directory,fetch=globalThis.fetch}) {
  assert(typeof key==='string' && key.length>=12 && key.length<=8192 && !/\s/u.test(key));
  assert.equal(sha('materials-b2\0'+sha(key)),binding);
  assert.equal(sourceResult.mode,'authorized-single-receipt');
  assert.equal(sourceResult.postCount,1);
  assert(/^gen-[a-zA-Z0-9_-]{1,240}$/u.test(locator.generationId));
  assert.equal(sha(locator.generationId),locator.receiptIdSha256);
  assert.equal(locator.receiptIdSha256,sourceResult.pair.chat.id);
  const helpers=await frozenHelpers();
  mkdirSync(directory); // Existing attempt is never removed, resumed, or retried.
  const startedAt=new Date().toISOString();
  const summary={operation:'read-existing-generation',startedAt,receiptIdSha256:locator.receiptIdSha256,
    inferenceRequests:0,metadataGetCount:1,httpStatus:null,status:'request-failed'};
  writeFileSync(join(directory,'request.json'),JSON.stringify({method:'GET',path:'/api/v1/generation',
    startedAt,receiptIdSha256:locator.receiptIdSha256,maxReads:1,inferenceRequests:0})+'\n',{flag:'wx',mode:0o600});
  try {
    await helpers.withDocumentDeadline(new AbortController().signal,30_000,async (signal,checkTime)=>{
      const url=new URL('https://openrouter.ai/api/v1/generation');
      url.searchParams.set('id',locator.generationId);
      const response=await fetch(url.href,{method:'GET',redirect:'manual',cache:'no-store',signal,
        headers:{authorization:'Bearer '+key}});
      summary.httpStatus=response.status;
      if(response.redirected || response.status!==200){
        void response.body?.cancel().catch(()=>{});
        summary.status='http-unavailable'; return;
      }
      summary.status='invalid-metadata';
      const copy=response.clone();
      let raw,text;
      try {
        raw=await helpers.readDocumentHttpJson(response,signal,checkTime);
        text=await copy.text(); checkTime();
      } finally { if(!copy.bodyUsed) void copy.body?.cancel().catch(()=>{}); }
      assert.equal(raw?.data?.id,locator.generationId);
      if(!helpers.canReplayWirePrice('generation',text)){summary.status='unverifiable-price';return;}
      const generation=helpers.projectProbeMetadata('generation',raw,{
        // Preserve the observed immutable ID for diagnosis; do not equate it with the request alias.
        model:raw.data.model===canonicalModel?canonicalModel:requestModel,
        providerName:'Moonshot AI',endpointId:'a3fafaac-f097-4ef1-86b3-842854dad5c6',
        privateText:'SYNTHETIC: I practiced SQL joins using a toy database.',apiKey:key,
      });
      assert.equal(generation.data.id,locator.receiptIdSha256);
      summary.status='captured';summary.wirePriceReproducible=true;
      summary.responseSha256=sha(text);summary.generation=generation;
    });
  } catch { /* Persist only whitelisted status and metadata, never exception text or raw bodies. */ }
  summary.finishedAt=new Date().toISOString();
  writeFileSync(join(directory,'result.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx',mode:0o600});
  return summary;
}

if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url){
  try {
    assert.equal(process.argv.length,3);assert.equal(process.argv[2],'--read-only');
    assert.equal(process.env.ARC_B1_EXISTING_RECEIPT_ENABLED,'owner-invoked');
    const privateRoot=join(userInfo().homedir,'.arc-materials/gate-1b/materials-b2/receipt-probe');
    const readOnlyRoot=join(privateRoot,'metadata-readonly');
    const result=await readExistingReceipt({
      key:process.env.ARC_B1_EXISTING_RECEIPT_KEY,
      binding:readFileSync(join(privateRoot,'workspace-key-binding.txt'),'utf8'),
      locator:JSON.parse(readFileSync(join(readOnlyRoot,'generation-locator.json'))),
      sourceResult:JSON.parse(readFileSync(join(privateRoot,'kimi-standard-receipt-v1/result.json'))),
      directory:join(readOnlyRoot,'api-read-v1'),
    });
    delete process.env.ARC_B1_EXISTING_RECEIPT_KEY;
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    process.exitCode=result.status==='captured'?0:1;
  } catch {
    delete process.env.ARC_B1_EXISTING_RECEIPT_KEY;
    process.stderr.write('Read-only receipt lookup declined. No inference was started. Inspect the existing attempt before proceeding.\n');
    process.exitCode=2;
  }
}
