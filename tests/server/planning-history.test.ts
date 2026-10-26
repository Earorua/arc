// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { D1PlanningHistoryReader } from "../../app/server/planning/history-reader";
import { PlanningService, PlanningNotFoundError } from "../../app/server/planning/service";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { offlinePlanningRequest } from "../offline-uat/planning-fixture";

function database() {
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec(`CREATE TABLE career_goals(id TEXT PRIMARY KEY,user_id TEXT,role_id TEXT,target_weeks INTEGER,weekly_minutes INTEGER,created_at INTEGER,status TEXT,active_slot INTEGER);
 CREATE TABLE planning_workspaces(id TEXT,user_id TEXT,goal_id TEXT);
 INSERT INTO career_goals VALUES('old','owner','old-role',18,420,100,'archived',NULL),('active','owner','new-role',18,420,200,'active',1),('other','stranger','private-role',18,420,300,'archived',NULL),('empty','owner','empty-role',12,240,90,'archived',NULL);
 INSERT INTO planning_workspaces VALUES('ws-old','owner','old'),('ws-active','owner','active'),('ws-other','stranger','other');`);
 const queries:string[]=[];
 const db={prepare(sql:string){queries.push(sql);if(!/^\s*SELECT\b/i.test(sql))throw Error('READ_ONLY_TEST');return{bind(...args:unknown[]){return{async first(){return sqlite.prepare(sql).get(...args as any[])??null;},async all(){return{success:true,results:sqlite.prepare(sql).all(...args as any[])}}}}}}} as unknown as D1Database;
 return {sqlite,db,queries};
}
describe('saved learning history',()=>{
 it('lists only owned archived goals, including goals with no saved plan, without changing the default',async()=>{
  const {sqlite,db}=database();
  try{
   const loader={getSavedWorkspaceResponse:vi.fn()};
   const reader=new D1PlanningHistoryReader(db,loader);
   const result=await reader.list('owner',0);
   expect(result.goals.map(g=>[g.id,g.hasWorkspace])).toEqual([['old',true],['empty',false]]);
   expect(result.nextOffset).toBeNull();
   expect((sqlite.prepare("SELECT id FROM career_goals WHERE active_slot=1").get() as any).id).toBe('active');
   expect(loader.getSavedWorkspaceResponse).not.toHaveBeenCalled();
  }finally{sqlite.close();}
 });
 it('checks ownership and archived state before loading a saved workspace',async()=>{
  const {sqlite,db}=database();
  try{
   const loader={getSavedWorkspaceResponse:vi.fn().mockResolvedValue({workspace:null,sourceContext:null})};
   const reader=new D1PlanningHistoryReader(db,loader);
   for(const goal of ['other','active','missing'])await expect(reader.load('owner',goal)).rejects.toBeInstanceOf(PlanningNotFoundError);
   expect(loader.getSavedWorkspaceResponse).not.toHaveBeenCalled();
   await reader.load('owner','old');
   expect(loader.getSavedWorkspaceResponse).toHaveBeenCalledExactlyOnceWith('owner','old');
  }finally{sqlite.close();}
 });
 it('paginates with deterministic ownership scope',async()=>{
  const {sqlite,db}=database();
  try{
   for(let i=0;i<23;i++)sqlite.prepare('INSERT INTO career_goals VALUES(?,?,?,?,?,?,?,?)').run(`g-${i}`,'owner','role',12,240,400+i,'archived',null);
   const reader=new D1PlanningHistoryReader(db,{getSavedWorkspaceResponse:vi.fn()});
   const first=await reader.list('owner',0),second=await reader.list('owner',first.nextOffset!);
   expect(first.goals).toHaveLength(20);expect(second.goals).toHaveLength(5);expect(second.nextOffset).toBeNull();
   expect(new Set([...first.goals,...second.goals].map(g=>g.id)).size).toBe(25);
  }finally{sqlite.close();}
 });
 it('reuses the real workspace parser and source validation, without active-goal reads or mutations',async()=>{
  const repository={findActiveGoal:vi.fn(async()=>({ownerId:'owner',goalId:'old'})),load:vi.fn(),findMutation:vi.fn(async()=>null),saveGeneration:vi.fn(async(c:any)=>({...c,payload:c.result})),saveEvent:vi.fn()};
  const service=new PlanningService({repository,intelligence:{getPublished:async()=>flagshipBlueprint},registry:flagshipUnitRegistry});
  const generated=await service.generate('owner',offlinePlanningRequest(flagshipBlueprint,undefined,'history-fixture'));
  repository.load.mockResolvedValue({ownerId:'owner',goalId:'old',payload:generated.workspace});
  vi.clearAllMocks();
  const result=await service.getSavedWorkspaceResponse('owner','old');
  expect(result.workspace).toEqual(generated.workspace);
  expect(repository.load).toHaveBeenCalledExactlyOnceWith({ownerId:'owner',goalId:'old'});
  expect(repository.findActiveGoal).not.toHaveBeenCalled();expect(repository.saveGeneration).not.toHaveBeenCalled();expect(repository.saveEvent).not.toHaveBeenCalled();
  repository.load.mockResolvedValue({ownerId:'stranger',goalId:'old',payload:generated.workspace});
  await expect(service.getSavedWorkspaceResponse('owner','old')).rejects.toBeInstanceOf(PlanningNotFoundError);
 });
});
