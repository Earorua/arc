import { expect, it, vi } from 'vitest';
import { createPlanningHistoryHandler } from '../../app/server/http/planning-history-route';
import { UnauthenticatedError } from '../../app/server/auth/session';
import { PlanningNotFoundError } from '../../app/server/planning/service';

function setup(){
 const service={list:vi.fn().mockResolvedValue({goals:[],nextOffset:null}),load:vi.fn().mockResolvedValue({workspace:null,sourceContext:null})};
 const deps={requireUser:vi.fn().mockResolvedValue({id:'owner',name:'Owner',email:'synthetic@example.test'}),createService:()=>service,rateLimiter:{reserve:vi.fn().mockResolvedValue({allowed:true,retryAfterSeconds:0})},recordEvent:vi.fn(),createRequestId:()=> 'history-test-id'};
 return {deps,service,handler:createPlanningHistoryHandler(deps)};
}
it('requires authentication before history access and does not cache private responses',async()=>{
 const {deps,service,handler}=setup();deps.requireUser.mockRejectedValue(new UnauthenticatedError());
 const response=await handler(new Request('https://arc.example/api/planning/history'));
 expect(response.status).toBe(401);expect(response.headers.get('cache-control')).toBe('no-store');
 expect(service.list).not.toHaveBeenCalled();expect(service.load).not.toHaveBeenCalled();
});
it('uses the authenticated owner, validates queries, and masks absent/foreign goals consistently',async()=>{
 const {service,handler}=setup();
 expect((await handler(new Request('https://arc.example/api/planning/history?offset=20'))).status).toBe(200);
 expect(service.list).toHaveBeenCalledExactlyOnceWith('owner',20);
 for(const suffix of ['?ownerId=other','?goal=one&goal=two','?goal=one&offset=0','?offset=-1','?offset=NaN']){
  expect((await handler(new Request('https://arc.example/api/planning/history'+suffix))).status).toBe(400);
 }
 service.load.mockRejectedValue(new PlanningNotFoundError());
 const missing=await handler(new Request('https://arc.example/api/planning/history?goal=other'));
 expect(missing.status).toBe(404);expect(service.load).toHaveBeenCalledExactlyOnceWith('owner','other');
 expect(JSON.stringify(await missing.json())).not.toContain('other');
});
