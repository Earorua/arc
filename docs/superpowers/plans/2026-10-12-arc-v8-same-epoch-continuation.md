# Arc v8 Same-Epoch Continuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one append-only continuation of epoch `20261012-ack` from its actual closed executor revision, after the original closure plus successful trigger resynchronization have a fresh, complete two-observation drain proof.

**Architecture:** Preserve and import the original immutable guards, inventory, configs, build and native read plan. Derive only the continuation outcome/request/gate wiring, operation runner and attended LONG start material, with a small local entry/budget validator; all new attempts, results and observations live in a new directory. Actual result hashes connect activation, active readback, secure start, closure and subsequent drain; no future evidence is created during preparation.

**Tech Stack:** Node.js ESM, `node:test`, PowerShell parser and existing masked launcher, installed hash-pinned Wrangler 4.92.0, existing read-only native collector/evaluator.

---

## Execution boundary and known evidence

This is a written implementation plan, not an execution record. No source/helper implementation or helper execution was performed to write it. The user already authorizes local implementation and deployment; do not ask again. Root coordinates actual native observations, credentials and attended starts. Do not commit or push. The current worktree is already isolated; do not create another worktree. Preserve all earlier preparation, failed reads and consumed operation journals.

**Current disposition: BLOCKED — do not implement or execute this plan.** The actual `post-resync-drain-first-r1` failed `leaseExpired` after the additional resync horizon: native SHA `00648b114992000b7f57d6e4491be045d134ecf8a94b0610f390e8451d34ba53`, gate SHA `4d621316cbe862101c12675bd129dee21b7bf1839cb8e733146c2965a51ecdda`. It observed 160 Cron rows, generation 80, active lease and only 96 remaining rows. Scheduling has not observably stopped, and **96 < 116** independently prevents the full sequence. No second drain, passing supplement, activation or start follows. Root continues read-only source/management verification; this plan provides no second resync or replacement-resource action. The steps below are preserved preparation instructions for a separately reconciled state, not a directive to bypass these blockers.

Run commands from:

```powershell
Set-Location 'C:/Users/XF/Documents/Codex/2026-07-26/sites-plugin-sites-openai-bundled-2/.worktrees/v8-openrouter-research-beta'
$ops = 'outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261012-ack'
$continuation = Join-Path $ops 'continuation-preparation-r1'
$binding = '6063e22f6cac8062b58dea174b74d3de66170c5e5dcfb6562ac46c30a9f1b57a'
```

The continuation identity is exactly `20261012-ack-continuation-r1`. In JavaScript recipes below, `O` is the absolute resolution of `$ops`, `C=resolve(O,'continuation-preparation-r1')`, and `A=resolve(O,'activation-preparation-r1')`. These are local naming abbreviations, not selectable destinations.

| Bound item | Actual value |
| --- | --- |
| Immutable inventory SHA | `5734426c1d0d0d1f1b06fc7ce35c40822f627bb2e8e98d2fe3f5522f5c9f85e9` |
| Original no-start executor in inventory | `618da547-760f-46cb-8bfa-610ab5c48d7c`; never edit it |
| Required current Site / executor | `26dff9ec-1d62-4146-afa8-71b0f7acc310` / `9c4d5699-8083-4c45-a9aa-8d70c3f7fa19` |
| Original closure result | `O/closure-preparation-r1/closure-deploy-result.json`; SHA `f34fddea21a5dd2a77f75f035806ca1ea9d99ecd98daaab70ab989a9c4454e24` |
| Actual trigger-resync result | `outputs/local-durable-executor-20261012/trigger-resync-r2/deploy-result.json`; SHA `3381b0eccb17973fada67488e6bfbff4d10895d0dd2ec3afc3f0bf198753ad20` |
| Resync actual end / new first-drain horizon | `2026-10-12T08:32:17.141Z` / `2026-10-12T08:47:48.141Z` |
| Post-resync complete closed gate | `O/activation-preparation-r1/observations/post-resync-closed-r1/gate-evaluation.json`; SHA `744e2c80bfba6e42c4a924e33e1f52faae9be2d748d3125c0af7a4f20e99806a` |
| Its native evidence / capacity | SHA `b2cace4394ee7de462288a7be0ae33b50bef9aa448560fd6375d8a61bacf3753`; 130 rows remaining at that historical read |
| Root-owned supplemental drain output | `outputs/local-durable-executor-20261012/resync-drain-supplement-r1.json`; schema `arc-trigger-resync-drain-supplement-v1`; no passing output exists merely because this plan names it |

Root owns the supplemental evaluator and its tests. Its contract is: `originalClosure`, `resyncResult`, `postResyncClosedGate`, `firstGate`, `secondGate` are exact `{path,sha256}` references; `expectedVersions`, `earliestNativeStartedAt`, `endedAt`, `minimumFirstNativeStart`, `allChecksPassed`, `checks` and `evaluator` are mandatory. Consumers independently check its linked native evidence and both time horizons. The first new native drain starts after the later of original closure and resync end plus 931000 ms; the second starts at least 60000 ms after the first full native end. Neither earlier failed drain nor an exported empty Cron array substitutes for this pair.

That supplemental pair becomes historical provenance after it passes. Do not force implementation/reviews into its 15-minute window or renew its timestamps. After all local materials, dry-runs and reviews are ready, root collects a separate fresh original-closure pair using the two fixed tags `continuation-entry-drain-first-r1` and `continuation-entry-drain-second-r1`. The entry references both pairs, verifies unchanged supported state between them and derives dispatch freshness only from the earliest start of the new pair. The fixed fresh pair is collected once when dispatch is imminent; a failed or expired attempt remains preserved and requires a separately reviewed observation revision, not a generic path override.

## File map: only this new directory is implemented

All following paths are under `outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261012-ack/continuation-preparation-r1/`:

| New file | Responsibility |
| --- | --- |
| `derive-materials.mjs` | Hash-pinned exact derivations, exclusive writes and inversion checks |
| `continuation-policy.mjs` | Pure finite timing, emptiness, capacity and readiness checks |
| `continuation-entry.mjs` | Local verification of supplemental drain references; builds/revalidates distinct entry record |
| `prepare-entry-r1.mjs` | Exclusive entry writer from real supplemental and budget references |
| `guards.mjs` | Import immutable old guards; derive only outcome/request/gate functions with new fixed journal root |
| `execute-operation.mjs`, `activate-once-r1.mjs`, `close-once-r1.mjs` | Narrow operation derivative and two fixed entry points |
| `prepare-gate-r1.mjs`, `collect-gate-r1.mjs`, `evaluate-gate-r1.mjs` | Continuation request/result provenance; unchanged native queries and projections |
| `validate-start-ready.mjs` | Local transitive link and actual readiness/capacity validator |
| `long-readiness-gate.ps1`, `run-long-start-masked-once-r1.ps1`, `long-start-command-r1.ps1` | New fixed start-ready path and pinned narrow secure-launcher derivatives |
| `continuation.test.mjs`, `launcher-static.test.mjs` | Meaningful refusal cases and unchanged secure-body verification |
| `derivation-manifest.json`, `capacity-budget-r1.json`, `launch-materials-r1.json`, `OPERATIONS.md` | Reviewed local materials and concrete finite run budget |

`closure/` contains the new closure attempt/results; the directory root contains new activation attempt/results. `observations/<unique-tag>/` contains all continuation observations. Preserve the unused original LONG report names, status launcher and native scenario materials; do not copy their stacks. No fixture may be placed in an operation/evidence directory.

### Task 1: Freeze inputs and establish exact derivation utilities

**Files:** Create `continuation-preparation-r1/derive-materials.mjs`; read the original five operation helpers and secure launcher files; modify none of them.

- [ ] Record the exact source pins below and reject any mismatch before writing a derivative. Include any new policy/entry/start validator in the final manifest by its actual generated hash, not a guessed value.

```javascript
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const O=resolve('outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261012-ack');
const A=resolve(O,'activation-preparation-r1');
const C=resolve(O,'continuation-preparation-r1');
const sha=x=>createHash('sha256').update(x).digest('hex');
const must=(v,m)=>{if(!v)throw Error(m);};
const sources={
 'guards.mjs':'aa726d4c45065717d4dde41754c84916b21ed44147cf641d05f9fa34fcdce853',
 'execute-operation.mjs':'2a24d66125d66eb1fde326b76c4b2c44a4f2f1dba248e0fe964a8d78667cb3b0',
 'prepare-gate-r1.mjs':'c08916fc6885b30ec8721f10807af784d225b26fc6cb7b9a675a5bf2ffc472fb',
 'collect-gate-r1.mjs':'e676de46b806799276e19d8daddbda48670d4ebf08d5a1b0582f66b06daa7dc3',
 'evaluate-gate-r1.mjs':'9bd5fc32f86b1fd638c4e36e66b4cbed04b559b1575d4f0c09f5d928166cf19f'
};
const load=name=>{const b=readFileSync(resolve(A,name));must(sha(b)===sources[name],name+' changed');return b.toString('utf8');};
function replaceOnce(s,before,after){must(s.split(before).length===2,'Nonunique derivation anchor');return s.replace(before,after);}
function derive(s,edits){
 const original=s;
 for(const [before,after] of edits)s=replaceOnce(s,before,after);
 let inverse=s;
 for(const [before,after] of [...edits].reverse())inverse=replaceOnce(inverse,after,before);
 must(inverse===original,'Derivative changed outside approved edits');
 return s;
}
function save(name,text){const p=resolve(C,name);must(!existsSync(p),'Material already exists');writeFileSync(p,text,{flag:'wx'});return {path:p,sha256:sha(readFileSync(p))};}
mkdirSync(resolve(C,'closure'),{recursive:true});
```

- [ ] Check that no planned new output already exists; if one does, inspect it and continue the same reviewed preparation without overwriting. A changed prepared file requires a separately named preparation revision and new review, especially after any journal consumes its hash.
- [ ] Keep a list of every exact `[before,after]` edit and source/output references in `derivation-manifest.json`. Freeze the runtime-module manifest after Node materials exist and before generating the PowerShell gate; its `runtimeFiles` array pins the new policy/entry/guard/validator and imported original guard. The later launch-materials record pins that manifest and the generated gate/launcher/wrapper, avoiding a circular gate-to-own-hash dependency. This is a derivative proof, not native evidence.

### Task 2: Implement local policy and a real-evidence entry adapter

**Files:** Create `continuation-policy.mjs`, `continuation-entry.mjs`, `prepare-entry-r1.mjs`, `continuation.test.mjs`.

- [ ] Write failing tests for the pure policy functions in the code below before implementing them. Use in-memory authored objects only; no fabricated native gate or deploy result is written to disk.

```javascript
// continuation-policy.mjs
import assert from 'node:assert/strict';
export const stages=['activationStart','longQuiet','longNativeStatusR2','afterR2','afterD1','sixReplays','closure','closurePropagation','finalDrain'];
export function instant(s,now){assert.equal(typeof s,'string');const t=Date.parse(s);assert(Number.isFinite(t)&&t<=now);return t;}
export function timing({closureEnd,resyncEnd,firstStart,firstEnd,secondStart,secondEnd},now){
 const [c,r,a,b,d,e]=[closureEnd,resyncEnd,firstStart,firstEnd,secondStart,secondEnd].map(x=>instant(x,now));
 assert(a>=Math.max(c,r)+931000);assert(b>=a);assert(d>=b+60000);assert(e>=d);
 assert(now-a<900000);return {startedAt:firstStart,endedAt:secondEnd};
}
export function empty(executor,site,jobs,instances){
 assert(Object.keys(executor).length>0&&Object.keys(site).length>0);
 assert(Object.values(executor).every(v=>v===0));assert(Object.values(site).every(v=>v===0));
 assert(Array.isArray(jobs)&&jobs.length===0);assert(Array.isArray(instances)&&instances.length===0);
}
export function requiredRows(budget,stage='activationStart'){
 assert.equal(budget.schemaVersion,'arc-continuation-capacity-budget-v1');assert.equal(budget.rootReviewed,true);
 assert.deepEqual(Object.keys(budget.stageMs),stages);assert(stages.includes(stage));
 for(const v of Object.values(budget.stageMs))assert(Number.isSafeInteger(v)&&v>0);
 assert(budget.stageMs.longQuiet>=1170000&&budget.stageMs.closurePropagation>=931000);
 assert(Number.isSafeInteger(budget.marginRows)&&budget.marginRows>=12);
 const ms=stages.slice(stages.indexOf(stage)).reduce((sum,k)=>sum+budget.stageMs[k],0);
 assert(Number.isSafeInteger(ms));return Math.max(32,2*Math.ceil(ms/60000)+budget.marginRows);
}
export function capacity(remaining,budget,stage){assert(Number.isSafeInteger(remaining)&&remaining>0&&remaining<=256);assert(remaining>=requiredRows(budget,stage));}
export function readiness({userReadyAt,verifiedAt,nativeStartedAt,nativeEndedAt,freshnessExpiresAt},now){
 const u=instant(userReadyAt,now),v=instant(verifiedAt,now),a=instant(nativeStartedAt,now),b=instant(nativeEndedAt,now);
 const x=Date.parse(freshnessExpiresAt);assert(Number.isFinite(x)&&x>now);
 assert(a<=b&&b<=v&&u<=v&&now-u<900000&&now-a<900000);assert(x<=Math.min(u,a)+900000);
}
export function budgetClock(budget,activationStartedAt,stageStartedAt,stage,now){
 requiredRows(budget,stage);const a=instant(activationStartedAt,now),s=instant(stageStartedAt,now);assert(s>=a);
 const cumulative=stages.slice(0,stages.indexOf(stage)+1).reduce((sum,k)=>sum+budget.stageMs[k],0);
 assert(now<s+budget.stageMs[stage]&&now<a+cumulative);
}
```

- [ ] Build `continuation-entry.mjs` against the existing old guard module. It exports `buildEntry(supplementReference,budgetReference,firstGateReference,secondGateReference)` and `entry(entryReference)`. Each reference is read with imported `jsonRef`/`verify`, never unbound JSON. `entry()` reconstructs the same predicate and compares persisted semantic fields, excluding only original `evaluatedAt`. The local `historicalGate()` below retains hash/provenance validation without applying present-time freshness to the already-completed historical drain.

```javascript
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {assert,equal,jsonRef,verify,request as oldRequest,gate as oldGate,outcome as oldOutcome,time} from '../activation-preparation-r1/guards.mjs';
import {timing,empty,capacity,requiredRows} from './continuation-policy.mjs';
export const continuationId='20261012-ack-continuation-r1';
export const inventorySha256='5734426c1d0d0d1f1b06fc7ce35c40822f627bb2e8e98d2fe3f5522f5c9f85e9';
const versions={site:'26dff9ec-1d62-4146-afa8-71b0f7acc310',executor:'9c4d5699-8083-4c45-a9aa-8d70c3f7fa19'};
const originalSha='f34fddea21a5dd2a77f75f035806ca1ea9d99ecd98daaab70ab989a9c4454e24';
const resyncSha='3381b0eccb17973fada67488e6bfbff4d10895d0dd2ec3afc3f0bf198753ad20';
const scalar=(n,id)=>{const o=n.observations.find(x=>x.id===id&&x.ok);assert(o&&o.rows.length===1,'Exact scalar');return o.rows[0];};
function historicalGate(reference,phase){
 const g=jsonRef(reference),n=jsonRef(g.nativeEvidence),q=oldRequest(g.requestReference.path,g.requestReference.sha256).q;
 assert(g.schemaVersion==='arc-successor-operation-gate-v1'&&g.phase===phase&&g.inventorySha256===inventorySha256&&g.allChecksPassed===true&&Object.keys(g.checks).length>=40&&Object.values(g.checks).every(v=>v===true),'Historical passed gate');
 assert(equal(g.request,q)&&g.requestReference.sha256===n.request.sha256&&equal(g.expectedVersions,q.expectedVersions)&&g.startedAt===n.startedAt&&g.endedAt===n.endedAt,'Historical native provenance');
 verify(g.evaluator);verify(n.helper);assert(time(g.endedAt)>=time(g.startedAt),'Historical times');return g;
}
function stableState(n){const lease=scalar(n,'executor-maintenance-lease'),rows=id=>[...n.observations.find(x=>x.id===id&&x.ok).rows].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return {lease:{generation:lease.generation,lease_until:lease.lease_until,next_category:lease.next_category},executor:rows('executor-maintenance-cursors'),site:rows('site-maintenance-cursors'),observer:scalar(n,'cron-capacity-and-unmatched')};}
export function buildEntry(supplementReference,budgetReference,firstGateReference,secondGateReference){
 const s=jsonRef(supplementReference),budget=jsonRef(budgetReference),now=Date.now();
 assert(resolve(supplementReference.path)===resolve('outputs/local-durable-executor-20261012/resync-drain-supplement-r1.json'),'Fixed supplement');
 assert(s.schemaVersion==='arc-trigger-resync-drain-supplement-v1'&&s.allChecksPassed===true&&Object.keys(s.checks).length>0&&Object.values(s.checks).every(v=>v===true),'Passing supplement');verify(s.evaluator);
 const closure=oldOutcome('closure','deploy',originalSha);assert(equal(s.originalClosure,closure.reference),'Original closure link');
 assert(s.resyncResult.sha256===resyncSha&&resolve(s.resyncResult.path)===resolve('outputs/local-durable-executor-20261012/trigger-resync-r2/deploy-result.json'),'Exact actual resync');
 const resync=jsonRef(s.resyncResult);jsonRef(resync.attempt);assert(resync.commandSucceeded===true&&resync.exitCode===0&&resync.mutationAttempted===true,'Successful actual resync');
 const post=jsonRef(s.postResyncClosedGate),postNative=jsonRef(post.nativeEvidence);
 assert(s.postResyncClosedGate.sha256==='744e2c80bfba6e42c4a924e33e1f52faae9be2d748d3125c0af7a4f20e99806a'&&post.allChecksPassed===true&&post.phase==='closed'&&equal(post.expectedVersions,versions),'Exact post-resync closed mapping');
 verify(post.requestReference);verify(post.evaluator);verify(postNative.helper);assert(time(postNative.startedAt)>=time(resync.endedAt),'Post-resync chronology');
 const priorFirst=historicalGate(s.firstGate,'drain-first'),priorSecond=historicalGate(s.secondGate,'drain-second');
 const horizon=Math.max(time(closure.result.endedAt),time(resync.endedAt))+931000;
 assert(time(priorFirst.startedAt)>=horizon&&time(priorSecond.startedAt)>=time(priorFirst.endedAt)+60000&&equal(priorSecond.request.firstGate,s.firstGate),'Historical resync horizons');
 assert(s.earliestNativeStartedAt===priorFirst.startedAt&&s.endedAt===priorSecond.endedAt&&s.minimumFirstNativeStart===new Date(horizon).toISOString(),'Historical supplement timestamps');
 const base=resolve('outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261012-ack/activation-preparation-r1/observations');
 assert(resolve(firstGateReference.path)===resolve(base,'continuation-entry-drain-first-r1/gate-evaluation.json')&&resolve(secondGateReference.path)===resolve(base,'continuation-entry-drain-second-r1/gate-evaluation.json'),'Fixed fresh entry pair');
 assert(!equal(firstGateReference,s.firstGate)&&!equal(secondGateReference,s.secondGate),'Historical pair cannot supply dispatch freshness');
 const first=oldGate(firstGateReference,'drain-first',inventorySha256),second=oldGate(secondGateReference,'drain-second',inventorySha256);
 assert(time(first.startedAt)>=time(priorSecond.endedAt),'Fresh pair follows historical proof');
 for(const g of [priorFirst,priorSecond,first,second])assert(equal(g.expectedVersions,versions)&&equal(g.request.revisionSource,closure.reference),'Same exact original closure and versions');
 assert(equal(s.expectedVersions,versions)&&equal(second.request.firstGate,firstGateReference),'Fresh pair link');
 const periods=timing({closureEnd:closure.result.endedAt,resyncEnd:resync.endedAt,firstStart:first.startedAt,firstEnd:first.endedAt,secondStart:second.startedAt,secondEnd:second.endedAt},now);
 const baseline=stableState(jsonRef(priorSecond.nativeEvidence));
 for(const g of [first,second])assert(equal(stableState(jsonRef(g.nativeEvidence)),baseline),'Stable supported state since historical resync drain');
 for(const g of [first,second]){
  const n=jsonRef(g.nativeEvidence),jobs=n.observations.find(x=>x.id==='executor-job-roster'&&x.ok),wf=n.observations.find(x=>x.id==='arc-v8-smoke-workflow-20261012-ack-instances'&&x.ok);
  assert(jobs&&wf,'Complete new-epoch rosters');empty(scalar(n,'executor-global-lifecycle'),scalar(n,'site-global-lifecycle'),jobs.rows,wf.rows);
  const observer=scalar(n,'cron-capacity-and-unmatched');assert(observer.remaining_rows===g.remainingObserverRows&&observer.unmatched_start_rows===0,'Observer linkage');capacity(observer.remaining_rows,budget,'activationStart');
 }
 const smoke=resolve('outputs/local-durable-executor-20260914/task15-smoke');
 assert(!existsSync(resolve(smoke,'cloud-ack-long-start-20261012-r1')),'Prior LONG attempt/report blocks continuation start');
 return {schemaVersion:'arc-successor-continuation-entry-v1',continuationId,inventorySha256,supplement:supplementReference,firstGate:firstGateReference,secondGate:secondGateReference,capacityBudget:budgetReference,expectedVersions:versions,...periods,remainingObserverRows:second.remainingObserverRows,requiredObserverRows:requiredRows(budget),allChecksPassed:true};
}
export function entry(reference){const e=jsonRef(reference),actual=buildEntry(e.supplement,e.capacityBudget,e.firstGate,e.secondGate);const {evaluatedAt,...stored}=e;time(evaluatedAt);assert(equal(stored,actual),'Entry changed or unsupported');return e;}
```

Root's supplemental validator supplies the historical stable-generation/cursor/Cron proof. The new fixed pair must pass the old full drain predicates, remain within 15 minutes and preserve supported state since that historical proof. The supplement and post-resync mapping are historical hash anchors; never require their timestamps to become fresh again.

- [ ] Create the exclusive entry writer exactly as follows. It cannot produce a passing entry before real passing drain evidence and a reviewed budget exist.

```javascript
import {writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildEntry} from './continuation-entry.mjs';
import {assert,ref} from '../activation-preparation-r1/guards.mjs';
const [sp,ss,bp,bs,fp,fs,ep,es]=process.argv.slice(2);assert(process.argv.length===10,'Supplement, budget, fixed first gate and fixed second gate path/SHA pairs required');
const value=buildEntry({path:resolve(sp),sha256:ss},{path:resolve(bp),sha256:bs},{path:resolve(fp),sha256:fs},{path:resolve(ep),sha256:es});
const path=resolve('outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261012-ack/continuation-preparation-r1/entry-r1.json');
assert(!existsSync(path),'Entry already exists');writeFileSync(path,JSON.stringify({...value,evaluatedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({entry:ref(path),cloudCalls:0}));
```

### Task 3: Derive only the stateful guard and observation wiring

**Files:** Create `guards.mjs`, `prepare-gate-r1.mjs`, `collect-gate-r1.mjs`, `evaluate-gate-r1.mjs` using `derive-materials.mjs`.

- [ ] Extract only the old source region from `export function outcome(` through immediately before `export function neutral(`. Do not copy `frozen()` or `binding()`; import them from the unchanged original module. Export `ad=C`, `cd=resolve(C,'closure')`, `originalClosedVersion='9c4d5699-8083-4c45-a9aa-8d70c3f7fa19'` and re-export the original immutable utility functions. Import/re-export `entry` and `continuationId` from the new entry module.

```javascript
const old=load('guards.mjs');
let stateful=old.slice(old.indexOf('export function outcome('),old.indexOf('export function neutral('));
stateful=derive(stateful,[
 ["['preactivation','active','preclosure','closed','drain-first','drain-second']","['active','preclosure','closed','drain-first','drain-second']"],
 ["q.schemaVersion==='arc-successor-native-gate-request-v1'","q.schemaVersion==='arc-successor-continuation-native-gate-request-v1'&&q.continuationId===continuationId"],
 ["time(result.endedAt);return {reference:r,attempt:attemptRef,result};","assert(result.continuationId===continuationId&&attempt.continuationId===continuationId,'Continuation result identity');assert(local(attempt.operationModule.path)===resolve(ad,'execute-operation.mjs')&&local(attempt.guard.path)===resolve(ad,'guards.mjs'),'Fixed continuation implementation');if(mode==='deploy')verify(attempt.decision);time(result.endedAt);return {reference:r,attempt:attemptRef,result};"],
 ["const first=jsonRef(q.firstGate);","const first=gate(q.firstGate,'drain-first',b.inventory.sha256);assert(equal(first.request.revisionSource,q.revisionSource)&&equal(first.expectedVersions,q.expectedVersions),'Same actual closure source');"]
]);
const imports=`import {readFileSync} from 'node:fs';\nimport {resolve} from 'node:path';\nimport {root,op,assert,hash,ref,verify,jsonRef,equal,local,binding,frozen,neutral,time,fresh} from '../activation-preparation-r1/guards.mjs';\nimport {entry,continuationId} from './continuation-entry.mjs';\nexport {root,op,assert,hash,ref,verify,jsonRef,equal,local,binding,frozen,neutral,time,fresh,entry,continuationId};\nexport const ad=resolve(op,'continuation-preparation-r1'),cd=resolve(ad,'closure'),originalClosedVersion='9c4d5699-8083-4c45-a9aa-8d70c3f7fa19';\n`;
save('guards.mjs',imports+stateful);
save('collect-gate-r1.mjs',load('collect-gate-r1.mjs'));
save('evaluate-gate-r1.mjs',load('evaluate-gate-r1.mjs'));
```

The collector and evaluator already import `./guards.mjs`; unchanged bytes now resolve the new adapter in their own directory. Their native projections, 22 required observations, query metadata, exact read plan, private mapping checks and drain checks remain byte-identical. Their original `preactivation` branch is unreachable because the new request validator rejects that phase. Keep active evaluation schema `arc-successor-operation-gate-v1` for the secure launch contract; its full request embeds the continuation identity and actual new revision source.

- [ ] Derive the new request writer with these exact edits. It still accepts only actual result SHA arguments; no arbitrary version or result-root option is introduced.

```javascript
save('prepare-gate-r1.mjs',derive(load('prepare-gate-r1.mjs'),[
 ["ref,request,jsonRef}","ref,request,jsonRef,continuationId}"],
 ["['preactivation','active','preclosure','closed','drain-first','drain-second']","['active','preclosure','closed','drain-first','drain-second']"],
 ["phase==='preactivation'?5:phase==='drain-second'?8:6","phase==='drain-second'?8:6"],
 ["changed=phase!=='preactivation',source=changed?outcome(active?'activation':'closure','deploy',sourceSha):null","source=outcome(active?'activation':'closure','deploy',sourceSha)"],
 ["schemaVersion:'arc-successor-native-gate-request-v1',phase","schemaVersion:'arc-successor-continuation-native-gate-request-v1',continuationId,phase"]
]));
```

### Task 4: Derive the operation runner and its exclusive chain

**Files:** Create `execute-operation.mjs`, `activate-once-r1.mjs`, `close-once-r1.mjs`.

- [ ] Apply only the following substitutions to the original runner. Preserve its strict command vector, bounded hidden child process, exact current Site/executor deployment reads, short config copy, config/artifact rehash immediately before dispatch, no retry and actual version parsing.

```javascript
save('execute-operation.mjs',derive(load('execute-operation.mjs'),[
 ["gate,neutral,time}","gate,neutral,time,entry,continuationId,originalClosedVersion}"],
 ["binding(bindingSha);frozen();","binding(bindingSha);frozen();verify({path:resolve(root,'node_modules/wrangler/wrangler-dist/cli.js'),sha256:'fc1aa72afc91906759a3555e76e6dae1b13504f71dec6d3bbfa0fe24c351ebd7'});verify({path:resolve(root,'node_modules/wrangler/bin/wrangler.js'),sha256:'72d02815cbffc9ad14e1667188296e7126e13f0d90bfbb6046db8e6c4b6ff39a'});"],
 [" if(mode==='deploy'){\n  dry=outcome(kind,'dry-run');"," if(mode==='dry-run')verifyDecision();\n if(mode==='deploy'){\n  dry=outcome(kind,'dry-run');"],
 ["resolve(cd,'preparation.json')","resolve(op,'closure-preparation-r1/preparation.json')"],
 ["d.schemaVersion==='arc-successor-operation-decision-v1'","d.schemaVersion==='arc-successor-operation-decision-v1'&&d.continuationId===continuationId"],
 ["'ACTIVATE_EXACT_FRESH_EPOCH_ONCE'","'CONTINUE_EXACT_CLOSED_EPOCH_ONCE'"],
 ["g=gate(d.gate,kind==='activation'?'preactivation':'preclosure',b.inventory.sha256);","g=kind==='activation'?entry(d.entry):gate(d.gate,'preclosure',b.inventory.sha256);"],
 ["kind==='activation'?p.noStartVersions.executor:activeOutcome.result.versionId","kind==='activation'?originalClosedVersion:activeOutcome.result.versionId"],
 ["attemptId:`20261012-ack-${kind}-${mode}-r1`","continuationId,attemptId:`${continuationId}-${kind}-${mode}`"],
 ["schemaVersion:'arc-successor-executor-operation-result-v1',kind","schemaVersion:'arc-successor-executor-operation-result-v1',continuationId,kind"],
 ["localGateFailure:!stdout&&!stderr?String(error.message):null","localGateFailure:!stdout&&!stderr"]
]));
save('activate-once-r1.mjs',"import {runOperation} from './execute-operation.mjs';\nawait runOperation('activation');\n");
save('close-once-r1.mjs',"import {runOperation} from './execute-operation.mjs';\nawait runOperation('closure');\n");
```

- [ ] Verify the two CLI pin statements above execute in dry-run mode before its journal and again immediately before real dispatch. Do not run any operation while constructing these derivatives.

- [ ] Require new activation and closure strict dry-runs before activation. Never reuse the old consumed dry-run or deploy paths. Actual activation decisions must include the distinct `entry` reference, actual readiness time, finite native-bound expiry and exact new launch materials. Closure decisions keep `gate` and `activationResult`, now both from the continuation path. In both cases include `continuationId`.

### Task 5: Adapt only the secure LONG start chain

**Files:** Create `validate-start-ready.mjs`, `long-readiness-gate.ps1`, `run-long-start-masked-once-r1.ps1`, `long-start-command-r1.ps1`; reuse original status and scenario materials unchanged.

- [ ] Implement this local validator. It verifies the **active** gate's real freshness, new successful activation outcome, decision-to-entry-to-budget provenance and actual user readiness. The old drain entry remains a historical dependency after activation; do not demand that its original drain timestamps become fresh again at start.

```javascript
import {resolve} from 'node:path';
import {jsonRef,verify,assert,equal,gate,outcome,continuationId} from './guards.mjs';
import {readiness,capacity,budgetClock} from './continuation-policy.mjs';
const [path,sha256]=process.argv.slice(2);assert(process.argv.length===4,'Ready path/SHA required');
const expected=resolve('outputs/local-durable-executor-20260914/task15-smoke/cloud-ops-20261012-ack/continuation-preparation-r1/root-activation-ready-r1.json');
assert(resolve(path)===expected,'Fixed continuation ready path');
const ready=jsonRef({path:expected,sha256});assert(ready.continuationId===continuationId&&ready.userReadyConfirmed===true,'Actual reviewed continuation readiness');
const activation=outcome('activation','deploy',ready.activationResult.sha256);assert(equal(ready.activationResult,activation.reference),'Actual activation result');
const attempt=jsonRef(activation.attempt),decision=jsonRef(attempt.decision);assert(equal(ready.continuationEntry,decision.entry),'Same reviewed entry');
const e=jsonRef(ready.continuationEntry),budget=jsonRef(e.capacityBudget);verify(e.supplement);
const active=gate({path:ready.evaluationPath,sha256:ready.evaluationSha256},'active',ready.inventorySha256);
assert(equal(active.request.revisionSource,activation.reference)&&active.request.continuationId===continuationId,'Active result provenance');
assert(active.expectedVersions.executor===activation.result.versionId&&active.expectedVersions.executor===ready.executorRevision,'Actual active version');
readiness({userReadyAt:ready.userReadyAt,verifiedAt:ready.verifiedAt,nativeStartedAt:active.startedAt,nativeEndedAt:active.endedAt,freshnessExpiresAt:ready.freshnessExpiresAt},Date.now());
capacity(active.remainingObserverRows,budget,'longQuiet');
budgetClock(budget,activation.result.startedAt,activation.result.startedAt,'activationStart',Date.now());
console.log(JSON.stringify({ready:true,readinessSha256:sha256,cloudCalls:0}));
```

- [ ] Derive the PowerShell readiness gate from exact old SHA `1d986af7bef9a8ad2de29144f5f0cdb66e05f3f807890701547e34498e42f224`. Change only the start path from `activation/root-activation-ready-r1.json` to `continuation-preparation-r1/root-activation-ready-r1.json`; before the final return, insert the local validator invocation below. Pin its actual generated hash and the Node executable selected by the same `Get-Command node` mechanism as the original launcher. This code runs inside the start branch only; existing checks still enforce the complete original inventory, source/build, fixed scene/report, active checks and native expiry.

```powershell
    if ($Mode -ceq 'start') {
        $arcManifestPath = Join-Path $arcOps 'continuation-preparation-r1/derivation-manifest.json'
        if ((Get-ArcLongHash $arcManifestPath) -cne $arcManifestExpectedSha256) { throw 'Continuation manifest changed' }
        $arcManifest = Get-ArcLongJson $arcManifestPath
        foreach ($arcDependency in $arcManifest.runtimeFiles) {
            if ((Get-ArcLongHash $arcDependency.path) -cne $arcDependency.sha256) { throw 'Continuation dependency changed' }
        }
        $arcValidator = Join-Path $arcOps 'continuation-preparation-r1/validate-start-ready.mjs'
        if ((Get-ArcLongHash $arcValidator) -cne $arcValidatorExpectedSha256) { throw 'Continuation validator changed' }
        $arcNode = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
        $arcValidation = & $arcNode $arcValidator $arcReadyPath $arcReadyHash 2>$null
        if ($LASTEXITCODE -ne 0) { throw 'Continuation readiness refused' }
        $arcParsed = $arcValidation | ConvertFrom-Json -ErrorAction Stop
        if ($arcParsed.ready -ne $true -or $arcParsed.readinessSha256 -cne $arcReadyHash) { throw 'Continuation readiness linkage' }
    }
```

`$arcValidatorExpectedSha256` and `$arcManifestExpectedSha256` must be emitted as actual SHA-256 string literals by the derivation script, not supplied by environment or user argument. The validator has no child/cloud calls. It is permissible to keep Node error text in memory and discard it; never persist the raw error. Record this approved insertion recipe in the runtime manifest and the actual resulting PowerShell file hash/body-inversion result in the later launch-materials review; do not create a circular manifest hash.

- [ ] Derive the existing secure start launcher and wrapper by fixed replacements of their old gate absolute path/hash with the new gate absolute path/hash; replace only the wrapper's launcher path/hash with the new launcher path/hash. Each old occurrence count must match inspection, each change must invert to original bytes, and source/driver/credential-handling code must compare byte-identical. The launcher invokes the gate before masked input and immediately before child creation; the wrapper also invokes it. Do not execute the wrapper or prompt for C during local verification.
- [ ] Preserve `cloud-ack-long-start-20261012-r1`, scene151 and `cloud-ack-long-status-20261012-r1`. Existing report-directory refusal remains. Keep the exact original 1170000 ms quiet period, no retries, stdin-only secret transport and BSTR cleanup. The original status launcher stays unchanged because it consumes its independent original-scene completion evidence, not the original activation result path.

### Task 6: Budget the whole remaining sequence and run negative tests

**Files:** Create `capacity-budget-r1.json`, `continuation.test.mjs`, `launcher-static.test.mjs`, `launch-materials-r1.json` only after root reviews their concrete content.

- [ ] Root must judge these finite stage budgets before freezing the capacity record. This proposal totals 3061000 ms (51 minutes 1 second): 52 two-row nominal minute ticks plus a 12-row margin = **116 rows**. It includes the whole LONG/fault/replay/closure/drain sequence. These are operational deadlines for starting further work, not guaranteed platform/transport completion times. The 130 rows at the historical post-resync read are not dispatch evidence. If a stage budget is unrealistic, increase it and reject insufficient capacity; never reduce it solely to fit the remaining rows.

```json
{
  "schemaVersion":"arc-continuation-capacity-budget-v1",
  "rootReviewed":true,
  "stageMs":{
    "activationStart":120000,
    "longQuiet":1170000,
    "longNativeStatusR2":180000,
    "afterR2":120000,
    "afterD1":120000,
    "sixReplays":180000,
    "closure":120000,
    "closurePropagation":931000,
    "finalDrain":120000
  },
  "marginRows":12
}
```

Root has accepted this 116-row profile as an operational ceiling, subject to actual capacity and adequate shutdown/read time. Freeze it only with that actual root review recorded. Before activation, both fresh dispatch-pair observations must retain at least 116 rows. The 15-minute readiness ceiling is not permission to idle: the local secure validator also enforces activation result start +120000 ms, including deployment, active readback and masked input. Before LONG start, the fresh active gate must retain the budget beginning at `longQuiet`.

For each later stage, root records one actual stage start time and calls `budgetClock()` against both that stage allowance and the cumulative activation-start deadline; re-review cannot renew either clock. Before faults and replays, also call `capacity()` using the relevant remaining stage and record the native hash, actual remaining rows and cutoff in the scene decision. Exceeding the 2-minute activation/start or 3-minute LONG native/status allowance abandons further advancement and triggers supported closure/reconciliation within the reserved shutdown margin. Do not borrow unbounded time, force closure of unsettled work or reuse a new readiness timestamp to reset a stage.

Timing sources: `scripts/build-research-executor-smoke.mjs` lines 143–144 gives cloud LONG headers 1140000 ms plus body 30000 ms (1170000 ms total) and both fault transports headers/body 10 ms each; those fixture delays do not bound Workflow recovery or native collection. `native-scenario-preparation-r1/collect-fault-native.mjs` executes gap/settlement reads sequentially with a 45000 ms bound per child; its 2-minute proposed stage is therefore an operating cutoff, not the sum of worst-case timeouts. Actual full closed reads took 36.739 seconds before resync and 34.210 seconds after resync; they do not prove LONG/fault/R2 collection duration. Root must preserve adequate closure and readback reserve and stop if actual progress cannot fit it.

- [ ] Add and run these executable boundary tests; authored objects remain in memory. Use fixed `now` and cloned values so each failure identifies one predicate.

```javascript
import test from 'node:test';import assert from 'node:assert/strict';
import {timing,empty,capacity,requiredRows,readiness,budgetClock} from './continuation-policy.mjs';
const now=Date.parse('2026-10-12T09:00:00.000Z');
const t={closureEnd:'2026-10-12T08:20:00.000Z',resyncEnd:'2026-10-12T08:30:00.000Z',firstStart:'2026-10-12T08:50:00.000Z',firstEnd:'2026-10-12T08:51:00.000Z',secondStart:'2026-10-12T08:52:00.000Z',secondEnd:'2026-10-12T08:53:00.000Z'};
const b={schemaVersion:'arc-continuation-capacity-budget-v1',rootReviewed:true,stageMs:{activationStart:120000,longQuiet:1170000,longNativeStatusR2:180000,afterR2:120000,afterD1:120000,sixReplays:180000,closure:120000,closurePropagation:931000,finalDrain:120000},marginRows:12};
test('actual stable pair and capacity boundaries',()=>{timing(t,now);assert.equal(requiredRows(b),116);capacity(116,b);assert.throws(()=>capacity(115,b));empty({jobs:0},{executions:0},[],[]);});
for(const [name,change] of [
 ['first before later horizon',x=>x.firstStart='2026-10-12T08:45:30.999Z'],
 ['second gap short',x=>x.secondStart='2026-10-12T08:51:59.999Z'],
 ['backwards first',x=>x.firstEnd='2026-10-12T08:49:59.999Z'],
 ['backwards second',x=>x.secondEnd='2026-10-12T08:51:59.999Z'],
 ['future native',x=>x.secondEnd='2026-10-12T09:00:00.001Z'],
 ['stale first',x=>{x.resyncEnd='2026-10-12T08:20:00.000Z';x.firstStart='2026-10-12T08:45:00.000Z';}],
 ['missing resync end',x=>delete x.resyncEnd],
 ['invalid native time',x=>x.firstStart='invalid']
])test(name,()=>{const x=structuredClone(t);change(x);assert.throws(()=>timing(x,now));});
for(const value of [-1,0,115,256.5,257,null,NaN])test('invalid remaining '+value,()=>assert.throws(()=>capacity(value,b)));
for(const [name,change] of [
 ['budget not reviewed',x=>x.rootReviewed=false],['missing fault',x=>delete x.stageMs.afterR2],
 ['short long quiet',x=>x.stageMs.longQuiet=1169999],['short propagation',x=>x.stageMs.closurePropagation=930999],
 ['nonfinite budget',x=>x.stageMs.sixReplays=Infinity],['negative stage',x=>x.stageMs.afterD1=-1],['insufficient margin',x=>x.marginRows=11]
])test(name,()=>{const x=structuredClone(b);change(x);assert.throws(()=>requiredRows(x));});
for(const args of [[{jobs:1},{executions:0},[],[]],[{jobs:0},{executions:1},[],[]],[{jobs:0},{reserved:1},[],[]],[{jobs:0},{executions:0},[{}],[]],[{jobs:0},{executions:0},[],[{}]],[{}, {},[],[]]])test('nonempty lifecycle '+JSON.stringify(args),()=>assert.throws(()=>empty(...args)));
const r={userReadyAt:'2026-10-12T08:55:00.000Z',verifiedAt:'2026-10-12T08:58:00.000Z',nativeStartedAt:'2026-10-12T08:56:00.000Z',nativeEndedAt:'2026-10-12T08:57:00.000Z',freshnessExpiresAt:'2026-10-12T09:10:00.000Z'};
test('actual readiness',()=>readiness(r,now));
for(const [name,change] of [
 ['missing readiness',x=>delete x.userReadyAt],['future readiness',x=>x.userReadyAt='2026-10-12T09:00:00.001Z'],
 ['expired readiness',x=>x.userReadyAt='2026-10-12T08:45:00.000Z'],['expired native',x=>x.nativeStartedAt='2026-10-12T08:45:00.000Z'],
 ['future native',x=>x.nativeStartedAt='2026-10-12T09:00:00.001Z'],['end-based extension',x=>x.freshnessExpiresAt='2026-10-12T09:12:00.000Z'],
 ['expired at dispatch',x=>x.freshnessExpiresAt='2026-10-12T09:00:00.000Z'],['review before native end',x=>x.verifiedAt='2026-10-12T08:56:59.999Z']
])test(name,()=>{const x=structuredClone(r);change(x);assert.throws(()=>readiness(x,now));});
test('activation ceiling cannot borrow native freshness',()=>{
 budgetClock(b,'2026-10-12T08:58:00.001Z','2026-10-12T08:58:00.001Z','activationStart',now);
 assert.throws(()=>budgetClock(b,'2026-10-12T08:58:00.000Z','2026-10-12T08:58:00.000Z','activationStart',now));
});
test('new stage timestamp cannot reset cumulative deadline',()=>assert.throws(()=>budgetClock(b,'2026-10-12T08:20:00.000Z','2026-10-12T08:59:59.000Z','afterR2',now)));
```

- [ ] Add provenance refusal tests around local reference validation using a temporary test-only directory and `verify`/`jsonRef`; test changed SHA, missing path, outside-workspace path, invalid SHA format, and malformed JSON. Never mutate frozen files. For the adapter, assert that the new request whitelist rejects `preactivation`, result path selection stays inside the exact new directory, and a first-drain reference from another closure cannot pass. Also reject using the historical supplemental pair as the fresh dispatch pair, either wrong fixed tag, a fresh pair preceding historical proof, changed generation/lease/category/cursors/observer state since the historical proof, and a fresh pair stale at dispatch. Test real immutable files by wrong expected hashes rather than editing them.
- [ ] Add derivation/static tests that compare the collector/evaluator bytes exactly, invert each prescribed patch, and compare secure credential/driver bodies after reversing only approved path/hash/guard insertions. The PowerShell AST must parse all three new files without executing them. Check that the gate is called before masked input and again before process creation, both calls validate the same ready-file digest, and the new validator contains no network/child-process operation.
- [ ] Review the complete negative matrix before declaring local verification passed: consumed old or new journals; missing actual activation UUID; wrong continuation identity; forged entry-as-preactivation; stale/missing/failed supplemental pair; wrong closure/resync hash; post-resync mapping before resync end; insufficient or saturated capacity; nonempty job/Workflow/Site state; changed predecessor; changed code/config/resource identity; extra admission delta; wrong active/closure source; readiness expiring during masked input; existing LONG report; ambiguous deployment; helper/CLI drift; raw error persistence. The unchanged original validators plus new tests/derivation checks cover these branches; no passing cloud fixture is manufactured to exercise them.

Run:

```powershell
node --test (Join-Path $continuation 'continuation.test.mjs') (Join-Path $continuation 'launcher-static.test.mjs')
Get-ChildItem -LiteralPath $continuation -Filter '*.mjs' | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { throw 'Syntax failed' } }
Get-ChildItem -LiteralPath $continuation -Filter '*.ps1' | ForEach-Object {
    $parseTokens=$null; $parseErrors=$null
    [void][Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$parseTokens,[ref]$parseErrors)
    if ($parseErrors.Count -ne 0) { throw 'PowerShell syntax failed' }
}
```

Expected: all tests and syntax checks pass, zero cloud/control/provider calls, no readiness success file, no new scene report and no operation deploy attempt. Run a deliberately failing policy case first, confirm refusal, then run the passing suite; do not broaden unrelated repository tests.

### Task 7: Strict local dry-runs, two-stage review and material freeze

**Files:** Create only new continuation dry-run attempts/results, manifest and review records. Do not run deploy or a secure launcher in this task.

- [ ] After local policy and derivation checks pass, run the matching strict closure and activation dry-runs in that order. They use the exact frozen original active/closed config bytes and new exclusive journals. Dry-run success proves only local configuration/build handling.

```powershell
node (Join-Path $continuation 'close-once-r1.mjs') dry-run $binding
if ($LASTEXITCODE -ne 0) { throw 'Closure dry-run stopped' }
node (Join-Path $continuation 'activate-once-r1.mjs') dry-run $binding
if ($LASTEXITCODE -ne 0) { throw 'Activation dry-run stopped' }
```

- [ ] Stage 1 review: check this plan's requirements against exact new bytes and artifacts. Confirm original inventory, configs, guard, source and result hashes remain unchanged; inspect entry/supplement source linkage, capacity model, native/user-ready timing, fixed same-epoch predecessor and original report-name refusal. Record concrete findings and exact hashes; fix within unconsumed preparation or prepare a new revision if any journal has consumed changed bytes.
- [ ] Stage 2 review: independently inspect code quality and the command/credential path. Confirm exact strict arguments, CLI pins, no extra native mutations/reads, preserved masked input/stdin/cleanup/proxy semantics, exclusive output creation, error sanitation and ambiguous-outcome stop. Hash-bind the successful dry-run records and complete derivation manifest. Re-run only tests affected by a fix; no blind dry-run rerun into a consumed directory.
- [ ] Create `launch-materials-r1.json` using existing `arc-successor-launch-materials-v1`: exact epoch, inventory/report pins, `rootReviewed:true`, `ready:true`, synthetic-only/providerCallsAllowed false and `secure-masked-tty`; `longStart` points to the new wrapper. `longStatus`, `longNative`, `afterR2Native`, `afterD1Native` point to unchanged reviewed files. Add distinct roles for the new gate, secure launcher, local validator, policy, entry adapter, runtime guards, derivation manifest and both strict dry-run results. Every reference uses actual file bytes.

### Task 8: Write the finite operational handoff without future success

**Files:** Create `continuation-preparation-r1/OPERATIONS.md`; later root records remain absent until their actual prerequisites exist.

- [ ] Document this exact sequence: preserve the genuine historical supplemental pair; finish local preparation, strict dry-runs and both reviews; then root collects the separate full original-closure pair at `activation-preparation-r1/observations/continuation-entry-drain-first-r1` and `continuation-entry-drain-second-r1`. Both use the actual original closure SHA, same fixed version and 60-second gap. Root writes the reviewed capacity record and runs the exclusive entry writer with the actual supplement, budget and two fixed fresh gate references; it records actual user readiness near dispatch. Create the activation decision with `CONTINUE_EXACT_CLOSED_EPOCH_ONCE`, `continuationId`, `entry`, exact active config/inventory/binding/material refs and expiry no later than earliest **fresh dispatch-pair** native start +15 minutes or actual readiness +15 minutes. The helper rereads exact current predecessors and revalidates all decision conditions immediately before strict deployment. Expiry of the historical supplemental pair does not invalidate preparation or require replanning.
- [ ] Following actual successful activation, prepare/collect/evaluate a new `active` request with the **new result's actual SHA**, deriving its actual UUID only from that result. Root's new fixed `root-activation-ready-r1.json` uses the old readiness schema plus `continuationId`, `activationResult`, `continuationEntry`, actual `userReadyAt`, exact active native/evaluation refs and finite expiry. Secure dispatch rechecks those exact bytes before and after masked input. No fabricated UUID, start-ready file, result hash or readiness timestamp is part of preparation.
- [ ] Preserve original LONG acceptance, client-exit and 1170000 ms quiet-window requirements. After independent LONG native/R2 proof and original signed status, each fault and replay retains its existing reviewed prerequisites and original identities; add stage-budget evidence to root's concrete readiness decisions. There is no paid provider call in this continuation.
- [ ] After all permitted scenes settle, use new `preclosure` native evidence, new closure decision and new closure journal bound to the actual continuation activation. Verify the actual resulting closed version and then a fresh full drain pair after its own closure end +931000 ms and second gap +60000 ms. This future closure source cannot be the old closure. If another explicit trigger reconciliation becomes necessary, stop and review that new evidence chain separately; this plan does not pre-authorize repeated resyncs.
- [ ] Keep all `fullPlatformInvocationAbsenceClaimed` claims false. If the first resync drain fails or capacity falls below the reviewed budget, local preparation may finish but no activation/start follows. Never erase Cron rows, raise cap256, reset counters, forge no-start revisions or provision replacement resources to bypass the pause history.

## Plan self-review and root judgment

The exact implementation scope is one new directory plus this plan. There is no generic configuration framework, no rewriting of frozen helpers and no scenario-stack fork. Current deployment authorization persists; runtime gating concerns actual evidence and readiness, not another permission request.

Root must judge whether the proposed 116-row operational budget is realistic for attended LONG proof, two faults, six replays and closure. Installed collector timeout sums can exceed the proposed fast-path stage durations; 116 rows is a reviewed operating budget with explicit stop conditions, not a worst-case invocation guarantee. If credible durations need more rows than the actual fresh pair leaves, refuse the full sequence without changing the observer. Continued events through the resync horizon also independently block continuation even if nominal capacity remains.

This plan's local test fixtures must never become `allChecksPassed` native evidence. The genuine first/second drain hashes, new activation/closure versions, result hashes, final elapsed proof and secure readiness timestamps remain unknown until their actual operations complete.

At plan completion, the actual failed post-resync drain and remaining 96 rows make implementation/execution inappropriate. Preserve this plan and the checkpoint; do not reinterpret its 116-row operational budget as permission to reduce stage allowances, clear rows, raise caps or create new resources. Further scheduling diagnosis is root's separate read-only work.
