// @vitest-environment node
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { D1PlanningHistoryReader } from "../../app/server/planning/history-reader";
import { PlanningService, PlanningNotFoundError } from "../../app/server/planning/service";
import type { SavePlanningGenerationCommand } from "../../app/server/planning/repository";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import { offlinePlanningRequest } from "../offline-uat/planning-fixture";

function database() {
 const sqlite=new DatabaseSync(":memory:");
 sqlite.exec(`CREATE TABLE career_goals(id TEXT PRIMARY KEY,user_id TEXT,role_id TEXT,target_weeks INTEGER,weekly_minutes INTEGER,created_at INTEGER,status TEXT,active_slot INTEGER);
 CREATE TABLE planning_workspaces(id TEXT,user_id TEXT,goal_id TEXT,active_path_version_id TEXT,next_sequence INTEGER);
 CREATE TABLE learning_path_versions(user_id TEXT,goal_id TEXT,id TEXT,payload_json TEXT);
 CREATE TABLE planning_events(user_id TEXT,goal_id TEXT,workspace_id TEXT,sequence INTEGER,kind TEXT,unit_id TEXT);
 INSERT INTO career_goals VALUES('old','owner','old-role',18,420,100,'archived',NULL),('active','owner','new-role',18,420,200,'active',1),('other','stranger','private-role',18,420,300,'archived',NULL),('empty','owner','empty-role',12,240,90,'archived',NULL);
 INSERT INTO planning_workspaces VALUES('ws-old','owner','old',NULL,100),('ws-active','owner','active',NULL,100),('ws-other','stranger','other',NULL,100);`);
 const queries:string[]=[];
 const db={prepare(sql:string){queries.push(sql);if(!/^\s*SELECT\b/i.test(sql))throw Error('READ_ONLY_TEST');return{bind(...args:SQLInputValue[]){return{async first(){return sqlite.prepare(sql).get(...args)??null;},async all(){return{success:true,results:sqlite.prepare(sql).all(...args)}}}}}}} as unknown as D1Database;
 return {sqlite,db,queries};
}
describe('saved learning history',()=>{
 it('counts only unique completed units in the saved active route and owned workspace',async()=>{
  const {sqlite,db}=database();
  try{
   const service=new PlanningService({repository:{findActiveGoal:async()=>({ownerId:'owner',goalId:'old'}),load:async()=>null,findMutation:async()=>null,saveGeneration:async c=>({...c,payload:c.result}),saveEvent:async c=>({...c,payload:c.result})},intelligence:{getPublished:async()=>flagshipBlueprint},registry:flagshipUnitRegistry});
   const {workspace}=await service.generate('owner',offlinePlanningRequest(flagshipBlueprint,undefined,'history-progress'));
   const path=workspace.pathVersions.find(path=>path.id===workspace.activePathVersionId)!;
   sqlite.prepare('UPDATE planning_workspaces SET active_path_version_id=? WHERE goal_id=?').run(path.id,'old');
   sqlite.prepare('INSERT INTO learning_path_versions VALUES(?,?,?,?)').run('owner','old',path.id,JSON.stringify(path));
   const event=sqlite.prepare('INSERT INTO planning_events VALUES(?,?,?,?,?,?)');
   event.run('owner','old','ws-old',1,'completed',path.units[0].id);
   event.run('owner','old','ws-old',2,'completed',path.units[0].id);
   event.run('owner','old','ws-old',3,'completed',path.units[1].id);
   event.run('owner','old','ws-old',4,'skipped',path.units[2].id);
   event.run('owner','old','ws-old',5,'completed','optional-stretch');
   event.run('stranger','old','ws-old',6,'completed',path.units[2].id);
   event.run('owner','another-goal','ws-old',7,'completed',path.units[2].id);
   event.run('owner','old','wrong-workspace',8,'completed',path.units[2].id);
   event.run('owner','old','ws-old',100,'completed',path.units[2].id);
   const reader=new D1PlanningHistoryReader(db,{getSavedWorkspaceResponse:vi.fn()});
   const result=await reader.list('owner');
   expect(result.goals[0].progress).toEqual({completedUnits:2,totalUnits:path.units.length});
   expect(result.goals[1].progress).toBeNull();
   sqlite.prepare('UPDATE learning_path_versions SET payload_json=?').run('{malformed');
   expect((await reader.list('owner')).goals[0].progress).toBeNull();
  }finally{sqlite.close();}
 });
 it('lists only owned archived goals, including goals with no saved plan, without changing the default',async()=>{
  const {sqlite,db}=database();
  try{
   const loader={getSavedWorkspaceResponse:vi.fn()};
   const reader=new D1PlanningHistoryReader(db,loader);
   const result=await reader.list('owner',0);
   expect(result.goals.map(g=>[g.id,g.hasWorkspace])).toEqual([['old',true],['empty',false]]);
   expect(result.goals.every(goal=>goal.progress===null)).toBe(true);
   expect(result.nextOffset).toBeNull();
   expect(sqlite.prepare("SELECT id FROM career_goals WHERE active_slot=1").get()?.id).toBe('active');
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
  const repository={findActiveGoal:vi.fn(async()=>({ownerId:'owner',goalId:'old'})),load:vi.fn(),findMutation:vi.fn(async()=>null),saveGeneration:vi.fn(async(c:SavePlanningGenerationCommand)=>({...c,payload:c.result})),saveEvent:vi.fn()};
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
