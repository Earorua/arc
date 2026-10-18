// @vitest-environment node
// Offline reproduction only. All accounts, credentials, receipts and delays are synthetic.
import {describe,expect,it,vi} from 'vitest';
import {createResearchBridgeFixture} from '../helpers/research-bridge-fixture';

describe('r9 completed receipt acknowledgement latency diagnostic',()=>{
  it('counts real Site D1 operations for an already completed duplicate',async()=>{
    const f=await createResearchBridgeFixture();
    try{
      const notice=await f.notice();await f.siteClient.complete(f.execution.job,notice);
      const before=f.businessSnapshot(),beforeFetches=f.executorFetches();
      const execute=f.db.execute.bind(f.db);let calls=0;
      const spy=vi.spyOn(f.db,'execute').mockImplementation((...args)=>{calls++;return execute(...args);});
      try{
        await expect(f.siteClient.complete(f.execution.job,notice)).resolves.toMatchObject({accounting:'settled'});
      }finally{spy.mockRestore();}
      console.log(JSON.stringify({diagnostic:'duplicate-complete',synthetic:true,siteD1Operations:calls,nestedExecutorFetches:f.executorFetches()-beforeFetches}));
      expect(f.businessSnapshot()).toEqual(before);expect(f.syntheticProviderCalls()).toBe(0);
    }finally{f.db.close();f.clientDb.close();}
  });
  it('can acknowledge an already completed receipt with 150ms per Site D1 operation',async()=>{
    const f=await createResearchBridgeFixture();
    try{
      const notice=await f.notice();await f.siteClient.complete(f.execution.job,notice);
      const before=f.businessSnapshot(),start=f.monoNow();
      const execute=f.db.execute.bind(f.db);let calls=0;
      const spy=vi.spyOn(f.db,'execute').mockImplementation((...args)=>{calls++;f.advanceMono(150);return execute(...args);});
      let reply:unknown,failure:unknown;
      try{reply=await f.siteClient.complete(f.execution.job,notice);}catch(error){failure=error;}finally{spy.mockRestore();}
      console.log(JSON.stringify({diagnostic:'duplicate-complete-latency',synthetic:true,delayPerOperationMs:150,siteD1Operations:calls,elapsedLogicalMs:f.monoNow()-start,failureKind:(failure as {kind?:string})?.kind??null}));
      expect(f.businessSnapshot()).toEqual(before);expect(f.syntheticProviderCalls()).toBe(0);
      expect(failure).toBeUndefined();expect(reply).toMatchObject({accounting:'settled'});
    }finally{f.db.close();f.clientDb.close();}
  });
  it.each([
    ['audit', "UPDATE ai_runs SET latency_ms=latency_ms+1 WHERE purpose='role-research'"],
    ['quota', "UPDATE quota_ledger SET entry_kind='rejected',units=0 WHERE entry_kind='accepted'"],
    ['budget settlement', 'UPDATE ai_budget_reservations SET settled_micros=settled_micros+1'],
    ['original budget', 'UPDATE ai_budget_reservations SET maximum_reserved_micros=maximum_reserved_micros-1'],
    ['terminal version', 'UPDATE research_runs SET state_version=state_version+1'],
  ])('rejects a corrupted completed %s without changing business state',async(_label,sql)=>{
    const f=await createResearchBridgeFixture();
    try{
      const notice=await f.notice();
      await expect(f.siteClient.complete(f.execution.job,notice)).resolves.toMatchObject({accounting:'settled'});
      expect(Number(f.db.database.prepare(sql).run().changes)).toBe(1);
      const before=f.businessSnapshot();
      await expect(f.siteClient.complete(f.execution.job,notice)).rejects.toThrow();
      expect(f.businessSnapshot()).toEqual(before);
      expect(f.syntheticProviderCalls()).toBe(0);
    }finally{f.db.close();f.clientDb.close();}
  });
});
