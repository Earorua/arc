import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterResearchProvider } from '../../app/server/research/openrouter-provider';
import { createExecutionRuntime } from '../../worker/research-executor/runtime';
import { validResearchCandidate } from '../fixtures/research/valid-candidate';

const marker = 'PRIVATE_CANARY_DO_NOT_LOG';
const request = {role: marker, locale: 'zh-CN'} as const;
const config = {OPENROUTER_API_KEY: marker, ARC_AI_MODEL_RESEARCH: 'moonshotai/kimi-k3',
  researchProfile: 'kimi-low-output32k-v3', researchTimeoutMs: 1_200_000};
function response(kind: 'annotations' | 'finish' | 'valid' = 'annotations') {
  return Response.json({model:'moonshotai/kimi-k3', private:marker,
    choices:[{finish_reason:kind === 'finish' ? 'length' : 'stop', message:{
      content:JSON.stringify(validResearchCandidate), reasoning:marker,
      annotations:kind === 'annotations' ? [{type:'url_citation',url_citation:{url:'https://example.com/' + marker,title:null}}] : [],
    }}], usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30,cost:0.48,
      server_tool_use_details:{web_search_requests:2}}});
}
function makeProvider(fetch: typeof globalThis.fetch, observer?: (value: unknown) => unknown) {
  return new OpenRouterResearchProvider(config, {fetch, ...{onRejectedResponseDiagnostic:observer}});
}
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});

describe('production rejected-response observations', () => {
  it('reports bounded rejection details while retaining the original failure and charge', async () => {
    const observer=vi.fn();
    const fetch=vi.fn<typeof globalThis.fetch>(async()=>response());
    const error=await makeProvider(fetch,observer).research(request).catch(e=>e);
    expect(error).toMatchObject({code:'invalid-transport',charged:true,usage:{costMicros:480000}});
    expect(observer).toHaveBeenCalledOnce();
    const value=observer.mock.calls[0]![0];
    expect(value).toMatchObject({result:{outcome:'rejected',reason:'annotations-invalid',finishReason:'stop'},
      preflight:{annotations:{state:'incompatible',issues:[{index:0,code:'title-null'}]}}});
    expect(JSON.stringify(value)).not.toContain(marker);
    expect(JSON.stringify(value)).not.toContain('https://');
    expect(Object.keys(value).sort()).toEqual(['preflight','result']);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('keeps preflight observations scoped to each research call', async () => {
    const observer=vi.fn();
    const fetch=vi.fn<typeof globalThis.fetch>().mockImplementationOnce(async()=>response('annotations'))
      .mockImplementationOnce(async()=>response('finish'));
    const provider=makeProvider(fetch,observer);
    await expect(provider.research(request)).rejects.toMatchObject({code:'invalid-transport'});
    await expect(provider.research(request)).rejects.toMatchObject({code:'invalid-transport'});
    expect(observer).toHaveBeenCalledTimes(2);
    expect(observer.mock.calls[0]![0].preflight).not.toBeNull();
    expect(observer.mock.calls[1]![0]).toMatchObject({result:{reason:'finish-not-stop',finishReason:'length'},preflight:null});
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each(['throw','reject'] as const)('does not alter a failure when its observer %ss', async(kind)=>{
    const observer=vi.fn(()=>{if(kind==='throw')throw new Error(marker);return Promise.reject(new Error(marker));});
    const fetch=vi.fn<typeof globalThis.fetch>(async()=>response());
    await expect(makeProvider(fetch,observer).research(request)).rejects.toMatchObject({code:'invalid-transport',charged:true,usage:{costMicros:480000}});
    expect(observer).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledOnce();
  });
  it('keeps accepted responses and the outbound request unchanged', async()=>{
    const observer=vi.fn();
    const baseFetch=vi.fn<typeof globalThis.fetch>(async()=>response('valid'));
    const observedFetch=vi.fn<typeof globalThis.fetch>(async()=>response('valid'));
    const baseline=await makeProvider(baseFetch).research(request);
    const observed=await makeProvider(observedFetch,observer).research(request);
    expect(observed).toEqual(baseline); expect(observer).not.toHaveBeenCalled();
    expect(observedFetch.mock.calls[0]![1]?.body).toBe(baseFetch.mock.calls[0]![1]?.body);
    expect(observedFetch).toHaveBeenCalledOnce();
  });
});

describe('executor production diagnostic wiring',()=>{
  function environment(){return {
    BETTER_AUTH_URL:'https://site.test',ARC_AI_RESEARCH_EXECUTOR_URL:'https://executor.test',
    ARC_AI_RESEARCH_SITE_TO_EXECUTOR_KEY_ID:'site-test',ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX:'11'.repeat(32),
    ARC_AI_RESEARCH_EXECUTOR_TO_SITE_KEY_ID:'executor-test',ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX:'22'.repeat(32),
    OPENROUTER_API_KEY:marker,
    EXECUTOR_DB:{prepare:vi.fn(()=>{throw new Error('Unexpected database access');})},
    EXECUTOR_RECEIPTS:{get:vi.fn(),put:vi.fn(),delete:vi.fn()},
  } as unknown as Parameters<typeof createExecutionRuntime>[0];}
  it('logs only the bounded rejection at the actual runtime entry',async()=>{
    const warn=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
    const fetch=vi.fn<typeof globalThis.fetch>(async()=>response());
    const env=environment();
    const runtime=createExecutionRuntime(env,{providerFetch:fetch,bridgeFetch:async()=>{throw new Error('No bridge call');}});
    await expect(runtime.provider.research(request)).rejects.toMatchObject({code:'invalid-transport',charged:true});
    expect(warn).toHaveBeenCalledOnce();
    const line=warn.mock.calls[0]![0];
    expect(typeof line).toBe('string');
    expect(JSON.parse(line)).toMatchObject({event:'arc.research.provider-response-rejected',
      result:{reason:'annotations-invalid'},preflight:{annotations:{issues:[{code:'title-null',index:0}]}}});
    expect(line).not.toContain(marker); expect(line).not.toContain('https://');
    expect(env.EXECUTOR_DB.prepare).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledOnce();
  });
  it('keeps accepted runtime responses quiet',async()=>{
    const warn=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
    const runtime=createExecutionRuntime(environment(),{providerFetch:async()=>response('valid'),bridgeFetch:async()=>{throw new Error('No bridge call');}});
    expect((await runtime.provider.research(request)).candidate).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
