import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { readExistingReceipt } from './read-existing-receipt.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const key = 'offline-only-receipt-key';
const id = 'gen-fixture-abc12345';
const base = resolve('work/receipt-accounting');
function input(t) {
  const dir = mkdtempSync(join(base, 'readonly-test-'));
  t.after(() => { assert(dir.startsWith(base + sep)); rmSync(dir, {recursive:true}); });
  return {key, directory:join(dir,'attempt'), binding:sha('materials-b2\0'+sha(key)),
    locator:{generationId:id,receiptIdSha256:sha(id)},
    sourceResult:{mode:'authorized-single-receipt',postCount:1,pair:{chat:{id:sha(id)}}}};
}
const metadata = () => ({data:{id,model:'moonshotai/kimi-k3.1-pro-20261023',provider_name:'Moonshot AI',
  native_tokens_prompt:553,native_tokens_completion:1840,native_tokens_reasoning:1745,total_cost:0.019506,
  provider_responses:[{status:200,endpoint_id:'a3fafaac-f097-4ef1-86b3-842854dad5c6',provider_name:'Moonshot AI'}],
  latency:2379,generation_time:62886,private_unneeded_field:key}});

test('reads only the bound existing generation once and keeps canonical model unchanged', async t => {
  const args=input(t); let calls=0;
  const fetch=async (url,init) => {calls++; assert.equal(url,'https://openrouter.ai/api/v1/generation?id='+id);
    assert.equal(init.method,'GET'); assert.equal(init.redirect,'manual'); assert.equal(init.body,undefined);
    assert.equal(init.headers.authorization,'Bearer '+key); return Response.json(metadata());};
  const result=await readExistingReceipt({...args,fetch});
  assert.equal(result.status,'captured'); assert.equal(result.httpStatus,200); assert.equal(result.inferenceRequests,0);
  assert.equal(result.generation.data.model,'moonshotai/kimi-k3.1-pro-20261023');
  assert.equal(result.generation.data.id,sha(id)); assert.equal(result.generation.data.total_cost,0.019506);
  assert(!readFileSync(join(args.directory,'result.json'),'utf8').includes(key));
  await assert.rejects(readExistingReceipt({...args,fetch})); assert.equal(calls,1);
});

test('wrong key or receipt identity prevents reservation and network access', async t => {
  const args=input(t); let calls=0; const fetch=async()=>{calls++;throw Error('must not call');};
  await assert.rejects(readExistingReceipt({...args,key:'different-offline-key',fetch}));
  await assert.rejects(readExistingReceipt({...args,locator:{...args.locator,generationId:'gen-wrong'},fetch}));
  assert.equal(calls,0); assert.equal(existsSync(args.directory),false);
});

test('HTTP failure is recorded without retrying or retaining its body', async t => {
  const args=input(t); let calls=0;
  const result=await readExistingReceipt({...args,fetch:async()=>{calls++;return new Response(key,{status:404});}});
  assert.equal(result.status,'http-unavailable'); assert.equal(result.httpStatus,404); assert.equal(calls,1);
  assert(!readFileSync(join(args.directory,'result.json'),'utf8').includes(key));
});

test('a different generation cannot be accepted', async t => {
  const args=input(t); const raw=metadata();raw.data.id='gen-different';
  const result=await readExistingReceipt({...args,fetch:async()=>Response.json(raw)});
  assert.equal(result.status,'invalid-metadata'); assert.equal(result.generation,undefined);
});

test('oversized metadata is rejected before it is saved', async t => {
  const args=input(t);
  const result=await readExistingReceipt({...args,fetch:async()=>new Response(' '.repeat(128*1024+1),{status:200})});
  assert.equal(result.status,'invalid-metadata'); assert.equal(result.generation,undefined);
});
