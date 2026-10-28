import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PlanHistory, SavedPlan } from '../../app/components/workspace/plan-history';
import { PlanningService } from '../../app/server/planning/service';
import { flagshipBlueprint } from '../../app/data/flagship-blueprint';
import { flagshipUnitRegistry } from '../../app/data/flagship-unit-registry';
import { offlinePlanningRequest } from '../offline-uat/planning-fixture';

afterEach(cleanup);
const goals={goals:[{id:'old',roleId:'Historical role',targetWeeks:18,weeklyMinutes:420,createdAt:100,hasWorkspace:true},{id:'empty',roleId:'Empty goal',targetWeeks:12,weeklyMinutes:240,createdAt:90,hasWorkspace:false}],nextOffset:null};
it('offers read-only history with an honest no-plan state and no mutation controls',async()=>{
 const client={list:vi.fn().mockResolvedValue(goals),load:vi.fn().mockResolvedValue({workspace:null,sourceContext:null})};
 render(<PlanHistory ownerId="owner" client={client}/>);
 await screen.findByRole('button',{name:/Historical role/});
 expect(screen.getByText('未生成学习计划')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:/Historical role/}));
 await screen.findByText('这个目标没有已保存的学习计划。');
 expect(client.load).toHaveBeenCalledWith('old',expect.any(AbortSignal));
 expect(screen.queryByRole('button',{name:/Generate|Accept|Complete|激活|重新生成/})).not.toBeInTheDocument();
});
it('clears the prior account immediately and ignores a late response after switching accounts',async()=>{
 let resolveOld!:(value:typeof goals)=>void;
 const client={list:vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValue({goals:[],nextOffset:null}),load:vi.fn()};
 const {rerender}=render(<PlanHistory ownerId="old-owner" client={client}/>);
 rerender(<PlanHistory ownerId="new-owner" client={client}/>);
 await screen.findByText('还没有历史学习计划。');
 await act(async()=>{resolveOld(goals);});
 await waitFor(()=>expect(screen.queryByText('Historical role')).not.toBeInTheDocument());
});
it('renders actual saved route, daily units and resource links without learning actions',async()=>{
 const service=new PlanningService({repository:{findActiveGoal:async()=>({ownerId:'owner',goalId:'old'}),load:async()=>null,findMutation:async()=>null,saveGeneration:async c=>({...c,payload:c.result}),saveEvent:async c=>({...c,payload:c.result})},intelligence:{getPublished:async()=>flagshipBlueprint},registry:flagshipUnitRegistry});
 const result=await service.generateResponse('owner',offlinePlanningRequest(flagshipBlueprint,undefined,'history-ui-fixture'));
 render(<SavedPlan value={{workspace:result.result.workspace,sourceContext:result.sourceContext}}/>);
 expect(screen.getByRole('heading',{name:'已保存的学习路线'})).toHaveProperty('tagName','H2');
 expect(screen.getByRole('list',{name:'学习阶段'})).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'保存的每日安排'})).toBeInTheDocument();
 const versions = screen.getByText(/安排版本 1/).closest('details')!;
 expect(versions.open).toBe(false);
 fireEvent.click(screen.getByText(/安排版本 1/));
 expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:/接受|完成|激活|重新生成/})).not.toBeInTheDocument();
});

it('keeps the history page position when returning from a saved plan',async()=>{
 const client={list:vi.fn().mockResolvedValueOnce({...goals,nextOffset:20}).mockResolvedValue(goals),load:vi.fn().mockResolvedValue({workspace:null,sourceContext:null})};
 render(<PlanHistory ownerId="owner" client={client}/>);
 fireEvent.click(await screen.findByRole('button',{name:'下一页'}));
 await waitFor(()=>expect(client.list).toHaveBeenLastCalledWith(20,expect.any(AbortSignal)));
 fireEvent.click(await screen.findByRole('button',{name:/Historical role/}));
 await screen.findByText('这个目标没有已保存的学习计划。');
 fireEvent.click(screen.getByRole('button',{name:'返回历史列表'}));
 await waitFor(()=>expect(client.list).toHaveBeenLastCalledWith(20,expect.any(AbortSignal)));
 expect(await screen.findByRole('button',{name:'上一页'})).toBeInTheDocument();
});
