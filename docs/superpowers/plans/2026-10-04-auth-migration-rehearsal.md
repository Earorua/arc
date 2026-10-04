# Offline Auth Migration Rehearsal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehearse destination-only authentication invalidation with synthetic in-memory data while proving exact preservation of users, provider mappings, business data and ownership.

**Architecture:** A non-CLI module accepts only an already-open native in-memory SQLite database, validates it against the trusted repository migrations 0000–0006, and performs an atomic allowlisted transformation. A separate test layer invokes the installed public Better Auth OAuth helper and actual Drizzle/D1 adapter; no identity lookup is reimplemented. This rehearsal is preparatory evidence, not a real-data migration tool or cutover approval.

**Tech Stack:** Existing Node `node:sqlite`, Vitest, Drizzle 0.45.2, better-auth 1.6.24, @better-auth/drizzle-adapter 1.6.24, @better-auth/core 1.6.25. No dependency changes.

---

## Scope and evidence

Current scoped design: `docs/superpowers/specs/2026-10-04-auth-migration-rehearsal-design.md`; parent design: `docs/superpowers/specs/2026-09-22-arc-cloudflare-migration-design.md`; auth evidence: `docs/operations/auth-migration-readiness.md`. Inspected HEAD: `18883b9c1a037a3433746edcee454e6e50955a23`. No tests were executed while authoring this plan.

The full goal remains full source D1/schema/ledger and R2 export, consistent restore, original-user/data verification, cloud OAuth login, controlled cutover, and only then separately authorized Research activation. This rehearsal neither exports nor imports real rows. Five destination auth Secrets remain a separate cloud setup requirement. Research stays closed; preserve its data and flags in this harness.

Do not add CLI arguments, file database input, arbitrary SQL parameters, cloud clients, Workers bindings, real credentials, export endpoints or an operational apply command to the rehearsal module. Do not use migrations 0007 onward. No commits during this bounded task. Existing user authorization already covers local subagent/TDD/SPEC→QUALITY workflow; root reviews this plan before implementation.

Evidence anchors:

- `db/schema.ts:10–64,260–284`: auth columns, nullable token metadata, millisecond timestamps and intent statuses.
- `app/server/auth/runtime.ts:87–115`: database state, encrypted tokens, hashed identifiers, social-only authentication, disabled implicit linking.
- `app/server/account-link/d1-repository.ts:62–97,133–139,319–331`: active intents block fresh linking; expiry and ordinary `fail()` cannot implement all required resets.
- `app/server/account-link/contracts.ts:52–60`: all four active statuses can transition to failed; completed/failed/expired are terminal.
- `node_modules/better-auth/dist/oauth2/link-account.mjs:52–64`: omitted fresh refresh token leaves existing value unchanged; ordinary callback does not decrypt previous tokens.
- `node_modules/better-auth/dist/db/internal-adapter.mjs:429–459`: provider/subject lookup precedes joined owner; missing joined owner falls back to email and must not be accepted as preservation evidence.
- `node_modules/@better-auth/core/dist/db/adapter/factory.mjs:191–210,284–316,340–367`: configured non-experimental join reads user by account.userId.
- `node_modules/better-auth/dist/context/create-context.mjs:69–76`: explicit fixture `secrets` prevents ambient BETTER_AUTH_SECRETS selection.
- `node_modules/drizzle-orm/d1/session.js:197–204`: real Drizzle requires D1 `raw()`; current test adapter lacks it.

## File responsibilities

- Create `scripts/cloudflare-migration/rehearse-auth-cleanup.mjs`: only fixed baseline construction, native-memory/schema/data guards, allowlisted transaction, exact postcondition comparison, bounded aggregate report.
- Create `tests/server/auth-migration-cleanup.test.ts`: C1 fixtures, exact preservation, rejection, rollback and idempotence tests.
- Modify `tests/helpers/sqlite-d1.ts`: C2-only raw-array result support required by installed Drizzle; preserve existing behavior.
- Create `tests/server/auth-migration-runtime.test.ts`: public OAuth-helper characterization and real adapter/handler assertions using only fixture secrets and no network.
- Modify `docs/operations/auth-migration-readiness.md` only after evidence exists: identify synthetic tests and their limits; never claim real provider continuity or migration completion.

## C1: Atomic memory-only cleanup with exact invariants

- [x] **C1.1 Write the first RED test.** Create `tests/server/auth-migration-cleanup.test.ts` with Node environment and the following starting test. This imports a missing module intentionally. All literals are synthetic.

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createResearchD1 } from "../helpers/sqlite-d1";
import { rehearseAuthCleanup } from "../../scripts/cloudflare-migration/rehearse-auth-cleanup.mjs";

const now = 1_800_000_000_000;
function seed(db: ReturnType<typeof createResearchD1>) {
  db.database.exec(`
    INSERT INTO users(id,name,email,email_verified) VALUES
      ('owner-a','A','a@example.test',1),('owner-b','B','b@example.test',1);
    INSERT INTO accounts(id,account_id,provider_id,user_id,access_token,
      refresh_token,id_token,access_token_expires_at,refresh_token_expires_at,
      scope,password,created_at,updated_at) VALUES
      ('google-a','subject-ga','google','owner-a','old-a','old-r','old-i',1,2,'scope',NULL,100,200),
      ('github-a','subject-ha','github','owner-a','old-a','old-r','old-i',1,2,'scope',NULL,100,200),
      ('unknown-b','subject-u','future-provider','owner-b','keep-a','keep-r','keep-i',1,2,'keep',NULL,100,200),
      ('password-b','owner-b','credential','owner-b',NULL,NULL,NULL,NULL,NULL,NULL,'keep-password',100,200),
      ('odd-b','subject-odd','google','owner-b','keep-a','keep-r','keep-i',1,2,'keep','keep-password',100,200);
    INSERT INTO sessions(id,expires_at,token,user_id) VALUES ('old-session',1900000000000,'fixture-session','owner-a');
    INSERT INTO verifications(id,identifier,value,expires_at) VALUES ('old-state','fixture-hash','fixture-state',1900000000000);
    INSERT INTO learner_profiles(id,user_id) VALUES ('profile-a','owner-a'),('profile-b','owner-b');
    INSERT INTO career_goals(id,user_id,role_id,level,weekly_minutes,target_weeks,status)
      VALUES ('goal-a','owner-a','role','beginner',60,10,'active');
    INSERT INTO proof_items(id,user_id,goal_id,title,kind)
      VALUES ('proof-a','owner-a','goal-a','Fixture proof','note');
    INSERT INTO proof_assets(id,user_id,proof_id,object_key,filename,content_type,size_bytes)
      VALUES ('asset-a','owner-a','proof-a','fixture/object','fixture.txt','text/plain',3);
    INSERT INTO feature_flags(key,enabled) VALUES ('research-fixture',0);
  `);
  for (const table of ['users','sessions','verifications','learner_profiles','career_goals','proof_items','feature_flags']) {
    db.database.exec(`UPDATE "${table}" SET updated_at=200`);
  }
  for (const table of ['users','sessions','verifications','learner_profiles','career_goals','proof_items','proof_assets']) {
    db.database.exec(`UPDATE "${table}" SET created_at=100`);
  }
  for (const status of ['pending_reauth','verified','consumed','completing','completed','failed','expired']) {
    db.database.prepare(`INSERT INTO account_link_intents
      (id,token_hash,user_id,source_provider,target_provider,status,expires_at,
       verified_at,consumed_at,completed_at,failure_code,created_at,updated_at)
      VALUES (?,?, 'owner-a','google','github',?,1,2,3,?, ?,100,200)`)
      .run(`intent-${status}`,`hash-${status}`,status,
        status === 'completed' ? 4 : null,status === 'failed' ? 'OLD_FAILURE' : null);
  }
}
function rows(db: ReturnType<typeof createResearchD1>, table: string) {
  return db.database.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all();
}

describe('offline auth cleanup', () => {
  it('clears only disposable auth state and preserves durable identity', () => {
    const db = createResearchD1();
    try {
      seed(db);
      const users = rows(db,'users');
      const assets = rows(db,'proof_assets');
      const report = rehearseAuthCleanup(db.database, now);
      expect(report).toMatchObject({ kind:'synthetic-only', sessionsRemoved:1,
        verificationsRemoved:1, socialAccountsCleared:2, intentsFailed:4,
        unknownProviderAccounts:2, passwordBearingAccounts:2 });
      expect(rows(db,'users')).toEqual(users);
      expect(rows(db,'proof_assets')).toEqual(assets);
      expect(rows(db,'sessions')).toEqual([]);
      expect(rows(db,'verifications')).toEqual([]);
      expect(db.database.prepare('SELECT refresh_token FROM accounts WHERE id=?').get('google-a'))
        .toMatchObject({refresh_token:null});
    } finally { db.close(); }
  });
});
```

Run: `npm run test:unit -- tests/server/auth-migration-cleanup.test.ts`

Expected RED: module `scripts/cloudflare-migration/rehearse-auth-cleanup.mjs` does not exist. A runner/runtime error before test discovery is not accepted as the intended RED.

- [x] **C1.2 Add the memory-only implementation.** Create `scripts/cloudflare-migration/rehearse-auth-cleanup.mjs` with the complete bounded core below. This reads only the fixed trusted repository schema files, never a database file or caller-supplied SQL. All returned errors are fixed categories without causes.

```js
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const migrations = [
  '0000_beta_foundation.sql','0001_secure_account_linking.sql',
  '0002_product_intelligence.sql','0003_adaptive_planning.sql',
  '0004_proof_backed_stack.sql','0005_openrouter_research_beta.sql',
  '0006_research_health_indexes.sql',
];
const tokenFields = ['access_token','refresh_token','id_token',
  'access_token_expires_at','refresh_token_expires_at','scope'];
const active = new Set(['pending_reauth','verified','consumed','completing']);
const statuses = new Set([...active,'completed','failed','expired']);
const social = row => (row.provider_id === 'google' || row.provider_id === 'github');
const eligible = row => social(row) && row.password === null;
const encode = value => JSON.stringify(value, (_, item) =>
  typeof item === 'bigint' ? {integer:item.toString()} :
  item instanceof Uint8Array ? {bytes:Array.from(item)} : item);
const canonicalRows = rows => rows.map(encode).sort();
const same = (a,b) => encode(a) === encode(b);
const fail = code => { throw new Error(code); };

function memoryOnly(db) {
  if (!(db instanceof DatabaseSync)) fail('AUTH_REHEARSAL_DATABASE');
  const attached = db.prepare('PRAGMA database_list').all();
  if (attached.length !== 1 || attached[0].name !== 'main' || attached[0].file !== '')
    fail('AUTH_REHEARSAL_MEMORY_ONLY');
}
function schema(db) {
  return db.prepare(`SELECT type,name,tbl_name,sql FROM sqlite_schema
    ORDER BY type,name,tbl_name,sql`).all();
}
function referenceSchema() {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const name of migrations) {
      const sql = readFileSync(new URL(`../../drizzle/${name}`, import.meta.url),'utf8');
      db.exec(sql.replaceAll('--> statement-breakpoint',';'));
    }
    return schema(db);
  } finally { db.close(); }
}
function snapshot(db, expectedSchema) {
  const result = {};
  for (const table of expectedSchema.filter(row => row.type === 'table')) {
    if (!/^[a-z][a-z0-9_]*$/.test(table.name)) fail('AUTH_REHEARSAL_SCHEMA');
    const count = db.prepare(`SELECT count(*) AS n FROM "${table.name}"`).get().n;
    if (!Number.isSafeInteger(count) || count > 1000) fail('AUTH_REHEARSAL_FIXTURE_LIMIT');
    result[table.name] = db.prepare(`SELECT * FROM "${table.name}"`).all();
  }
  return result;
}
function validate(db, expectedSchema) {
  memoryOnly(db);
  if (!same(schema(db),expectedSchema)) fail('AUTH_REHEARSAL_SCHEMA');
  if (db.prepare('PRAGMA foreign_keys').get().foreign_keys !== 1)
    fail('AUTH_REHEARSAL_FOREIGN_KEYS_DISABLED');
  if (db.prepare('PRAGMA foreign_key_check').all().length) fail('AUTH_REHEARSAL_FOREIGN_KEYS');
  const integrity = db.prepare('PRAGMA integrity_check').all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok')
    fail('AUTH_REHEARSAL_INTEGRITY');
}
export function rehearseAuthCleanup(db, nowMs) {
  let inTransaction = false;
  try {
    memoryOnly(db);
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) fail('AUTH_REHEARSAL_TIME');
    const expectedSchema = referenceSchema();
    validate(db,expectedSchema);
    const before = snapshot(db,expectedSchema);
    const identityFields = {
      users:['id','email'], accounts:['id','provider_id','account_id','user_id'],
      sessions:['id','token','user_id'], verifications:['id','identifier'],
      account_link_intents:['id','token_hash','user_id'],
    };
    for (const [table,fields] of Object.entries(identityFields)) for (const row of before[table]) {
      for (const field of fields) if (typeof row[field] !== 'string' || !row[field].trim())
        fail('AUTH_REHEARSAL_IDENTITY');
    }
    for (const [table,fields] of [
      ['users',['id']],['users',['email']],['accounts',['id']],
      ['accounts',['provider_id','account_id']],['sessions',['id']],['sessions',['token']],
      ['verifications',['id']],['account_link_intents',['id']],['account_link_intents',['token_hash']],
    ]) {
      const keys=before[table].map(row=>encode(fields.map(field=>row[field])));
      if(new Set(keys).size!==keys.length) fail('AUTH_REHEARSAL_IDENTITY');
    }
    const authTimes = {
      users:['created_at','updated_at'],
      accounts:['created_at','updated_at','access_token_expires_at','refresh_token_expires_at'],
      sessions:['created_at','updated_at','expires_at'],
      verifications:['created_at','updated_at','expires_at'],
      account_link_intents:['created_at','updated_at','expires_at','verified_at','consumed_at','completed_at'],
    };
    for (const [table,fields] of Object.entries(authTimes)) for (const row of before[table]) {
      for (const field of fields) if (row[field] !== null &&
        (!Number.isSafeInteger(row[field]) || row[field] < 0)) fail('AUTH_REHEARSAL_TIME');
    }
    for (const row of before.account_link_intents) {
      if (!statuses.has(row.status)) fail('AUTH_REHEARSAL_INTENT_STATUS');
      if (!['google','github'].includes(row.source_provider) ||
          !['google','github'].includes(row.target_provider)) fail('AUTH_REHEARSAL_INTENT_PROVIDER');
      for (const field of ['expires_at','created_at','updated_at','verified_at','consumed_at','completed_at']) {
        const value = row[field];
        if (value !== null && (!Number.isSafeInteger(value) || value < 0))
          fail('AUTH_REHEARSAL_TIME');
      }
      if (row.failure_code !== null && !/^[A-Z][A-Z0-9_]{0,63}$/.test(row.failure_code))
        fail('AUTH_REHEARSAL_INTENT_CODE');
      if (active.has(row.status) && row.updated_at > nowMs) fail('AUTH_REHEARSAL_TIME');
    }
    const expected = structuredClone(before);
    expected.sessions = [];
    expected.verifications = [];
    for (const row of expected.accounts) if (eligible(row)) {
      for (const field of tokenFields) row[field] = null;
    }
    for (const row of expected.account_link_intents) if (active.has(row.status)) {
      row.status = 'failed'; row.failure_code = 'AUTH_MIGRATION_RESET'; row.updated_at = nowMs;
    }
    const report = {
      kind:'synthetic-only', sessionsRemoved:before.sessions.length,
      verificationsRemoved:before.verifications.length,
      socialAccountsCleared:before.accounts.filter(row => eligible(row) && tokenFields.some(field => row[field] !== null)).length,
      intentsFailed:before.account_link_intents.filter(row => active.has(row.status)).length,
      unknownProviderAccounts:before.accounts.filter(row => !social(row)).length,
      passwordBearingAccounts:before.accounts.filter(row => row.password !== null).length,
    };
    db.exec('BEGIN IMMEDIATE'); inTransaction = true;
    db.exec('DELETE FROM sessions');
    db.exec('DELETE FROM verifications');
    db.exec(`UPDATE accounts SET access_token=NULL,refresh_token=NULL,id_token=NULL,
      access_token_expires_at=NULL,refresh_token_expires_at=NULL,scope=NULL
      WHERE provider_id IN ('google','github') AND password IS NULL
      AND (access_token IS NOT NULL OR refresh_token IS NOT NULL OR id_token IS NOT NULL
        OR access_token_expires_at IS NOT NULL OR refresh_token_expires_at IS NOT NULL OR scope IS NOT NULL)`);
    db.prepare(`UPDATE account_link_intents SET status='failed',
      failure_code='AUTH_MIGRATION_RESET',updated_at=?
      WHERE status IN ('pending_reauth','verified','consumed','completing')`).run(nowMs);
    validate(db,expectedSchema);
    const after = snapshot(db,expectedSchema);
    for (const table of Object.keys(expected)) {
      if (!same(canonicalRows(after[table]),canonicalRows(expected[table])))
        fail('AUTH_REHEARSAL_INVARIANT');
    }
    db.exec('COMMIT'); inTransaction = false;
    return Object.freeze(report);
  } catch (error) {
    if (inTransaction) { try { db.exec('ROLLBACK'); } catch { fail('AUTH_REHEARSAL_ROLLBACK'); } }
    const code = error instanceof Error && /^AUTH_REHEARSAL_[A-Z_]+$/.test(error.message)
      ? error.message : 'AUTH_REHEARSAL_FAILED';
    throw new Error(code);
  }
}
```

- [x] **C1.3 Add the exact-diff, rollback and rejection tests before claiming C1 complete.** Add these test cases to the same test file. `sqlite_schema` comparison in the module intentionally rejects views, extra columns/indexes/tables and triggers, including any trigger that could redirect cleanup writes. No real file database is created for the file-path guard test.

```ts
function allData(db: ReturnType<typeof createResearchD1>) {
  const names = db.database.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all();
  return Object.fromEntries(names.map(row => [String(row.name),rows(db,String(row.name))]));
}
it('preserves every non-allowlisted value and is idempotent', () => {
  const source = createResearchD1(); const destination = createResearchD1();
  try {
    seed(source); seed(destination);
    const original = allData(source);
    const expected = structuredClone(original);
    expected.sessions=[]; expected.verifications=[];
    for (const row of expected.accounts) if (['google','github'].includes(String(row.provider_id)) && row.password===null) {
      for (const key of ['access_token','refresh_token','id_token','access_token_expires_at','refresh_token_expires_at','scope']) row[key]=null;
    }
    for (const row of expected.account_link_intents) if (['pending_reauth','verified','consumed','completing'].includes(String(row.status))) {
      row.status='failed'; row.failure_code='AUTH_MIGRATION_RESET'; row.updated_at=now;
    }
    const initialSchema=destination.database.prepare('SELECT * FROM sqlite_schema ORDER BY name').all();
    rehearseAuthCleanup(destination.database,now);
    expect(allData(destination)).toEqual(expected);
    expect(allData(source)).toEqual(original);
    expect(destination.database.prepare('SELECT * FROM sqlite_schema ORDER BY name').all()).toEqual(initialSchema);
    expect(rehearseAuthCleanup(destination.database,now+1000)).toMatchObject({sessionsRemoved:0,
      verificationsRemoved:0,socialAccountsCleared:0,intentsFailed:0});
    expect(allData(destination)).toEqual(expected);
  } finally { source.close(); destination.close(); }
});
it.each([
  ["ATTACH DATABASE ':memory:' AS other",'AUTH_REHEARSAL_MEMORY_ONLY'],
  ['CREATE TABLE surprise(id TEXT)','AUTH_REHEARSAL_SCHEMA'],
  ['CREATE TRIGGER surprise AFTER DELETE ON sessions BEGIN DELETE FROM users; END','AUTH_REHEARSAL_SCHEMA'],
  ["UPDATE account_link_intents SET status='future_status' WHERE id='intent-verified'",'AUTH_REHEARSAL_INTENT_STATUS'],
  ["UPDATE accounts SET account_id='' WHERE id='google-a'",'AUTH_REHEARSAL_IDENTITY'],
  ["UPDATE accounts SET id='' WHERE id='google-a'",'AUTH_REHEARSAL_IDENTITY'],
  ["UPDATE users SET email=' ' WHERE id='owner-a'",'AUTH_REHEARSAL_IDENTITY'],
  ["INSERT INTO users(id,name,email) VALUES ('','Empty','empty@example.test')",'AUTH_REHEARSAL_IDENTITY'],
  ["UPDATE users SET created_at=-1 WHERE id='owner-a'",'AUTH_REHEARSAL_TIME'],
  ["UPDATE accounts SET access_token_expires_at=1.5 WHERE id='google-a'",'AUTH_REHEARSAL_TIME'],
  ['PRAGMA foreign_keys=OFF','AUTH_REHEARSAL_FOREIGN_KEYS_DISABLED'],
  ["PRAGMA foreign_keys=OFF; UPDATE accounts SET user_id='missing'; PRAGMA foreign_keys=ON",'AUTH_REHEARSAL_FOREIGN_KEYS'],
])('rejects %s before changing rows',(sql,code) => {
  const db=createResearchD1();
  try { seed(db); db.database.exec(sql); const before=allData(db);
    expect(()=>rehearseAuthCleanup(db.database,now)).toThrow(code);
    expect(allData(db)).toEqual(before);
  } finally { db.close(); }
});
it('rejects file-backed metadata without opening a file database',()=>{
  const db=createResearchD1();
  const prepare=db.database.prepare.bind(db.database);
  const spy=vi.spyOn(db.database,'prepare').mockImplementation((sql)=>
    sql==='PRAGMA database_list' ? {all:()=>[{seq:0,name:'main',file:'synthetic-file-path'}]} as never : prepare(sql));
  try { expect(()=>rehearseAuthCleanup(db.database,now)).toThrow('AUTH_REHEARSAL_MEMORY_ONLY'); }
  finally { spy.mockRestore(); db.close(); }
});
it('rolls back earlier deletes if a later write fails and redacts failure detail',()=>{
  const db=createResearchD1(); seed(db); const before=allData(db);
  const exec=db.database.exec.bind(db.database);
  const spy=vi.spyOn(db.database,'exec').mockImplementation((sql)=>{
    if(sql.startsWith('UPDATE accounts')) throw new Error('fixture-sensitive-token');
    return exec(sql);
  });
  try { expect(()=>rehearseAuthCleanup(db.database,now)).toThrow(/^AUTH_REHEARSAL_FAILED$/);
    expect(allData(db)).toEqual(before);
  } finally { spy.mockRestore(); db.close(); }
});
```

Add these two transaction-ownership/postcondition cases to the same test file:

```ts
it('does not roll back a caller transaction when BEGIN fails',()=>{
  const db=createResearchD1();
  try {
    seed(db); db.database.exec('BEGIN');
    db.database.exec("INSERT INTO feature_flags(key,enabled) VALUES ('caller-owned',0)");
    expect(()=>rehearseAuthCleanup(db.database,now)).toThrow(/^AUTH_REHEARSAL_FAILED$/);
    expect(db.database.prepare("SELECT count(*) AS n FROM feature_flags WHERE key='caller-owned'").get()).toMatchObject({n:1});
    db.database.exec('ROLLBACK');
    expect(db.database.prepare("SELECT count(*) AS n FROM feature_flags WHERE key='caller-owned'").get()).toMatchObject({n:0});
  } finally {db.close();}
});
it('rolls back on a detected non-allowlisted value change',()=>{
  const db=createResearchD1(); seed(db); const before=allData(db);
  const exec=db.database.exec.bind(db.database);
  const spy=vi.spyOn(db.database,'exec').mockImplementation(sql=>{
    const result=exec(sql);
    if(sql.startsWith('UPDATE accounts')) exec("UPDATE users SET name='unexpected-fixture-change' WHERE id='owner-a'");
    return result;
  });
  try {
    expect(()=>rehearseAuthCleanup(db.database,now)).toThrow(/^AUTH_REHEARSAL_INVARIANT$/);
    expect(allData(db)).toEqual(before);
  } finally {spy.mockRestore();db.close();}
});
```

The `allData` helper receives fixed test table names; do not export it as an arbitrary SQL facility. Expand table-boundary tests for an extra account column and an extra index by using the same parameterized rejection test with `ALTER TABLE accounts ADD COLUMN surprise TEXT` and `CREATE INDEX surprise ON users(name)`; expected category remains `AUTH_REHEARSAL_SCHEMA`. Add timestamp boundary cases to that parameterized test using `updated_at=-1` and `updated_at=1900000000000`; expected category `AUTH_REHEARSAL_TIME`.

- [x] **C1.4 Run targeted checks and request SPEC→QUALITY review.**

Run: `npm run test:unit -- tests/server/auth-migration-cleanup.test.ts tests/db/schema.test.ts`

Expected: all targeted cases pass, with no request to a provider or cloud service. Run `npx tsc --noEmit --incremental false` using already installed dependencies; do not invoke `npm test`, which builds. Review exact non-allowlisted data/schema preservation, attached/file rejection, terminal-history retention, idempotence, rollback and report redaction. Fix discovered defects and repeat only affected tests. No commit at this checkpoint.

## C2: Installed Better Auth / Drizzle characterization and invariant tests

C2 is a self-contained installed-library characterization task, not the full runtime acceptance suite. It has a mandatory first-execution compatibility gate. Source inspection established public APIs and the missing `raw()` method, but no helper invocation, async context or handler behavior has yet been executed. Do not replace a failing actual adapter with mocked identity resolution. If the public-helper invocation requires additional endpoint context, stop C2 expansion, report the precise exception as a sanitized category, and inspect the installed public context API before revising this plan. A runtime compatibility failure is not migration evidence.

- [x] **C2.1 Write an actual-adapter RED characterization test.** Create `tests/server/auth-migration-runtime.test.ts` with the following. This rejects network requests, uses explicit fixture secret rotation configuration, and exercises the public installed helper with the actual Arc options.

```ts
// @vitest-environment node
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { betterAuth } from 'better-auth';
import { handleOAuthUserInfo } from 'better-auth/oauth2';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../../db/schema';
import { buildAuthOptions } from '../../app/server/auth/runtime';
import { createResearchD1 } from '../helpers/sqlite-d1';
import { rehearseAuthCleanup } from '../../scripts/cloudflare-migration/rehearse-auth-cleanup.mjs';

const fixtureSecret='synthetic-new-auth-secret-for-offline-tests-only-2026';
const origin='https://arc.example.test';
let network: ReturnType<typeof vi.fn>;
beforeEach(()=>{ network=vi.fn(()=>{throw new Error('OFFLINE_NETWORK_DENIED');}); vi.stubGlobal('fetch',network); });
afterEach(()=>{ expect(network).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

it.each(['google','github'] as const)('preserves %s owner after changed email and absent refresh token',async provider=>{
  const db=createResearchD1();
  try {
    db.database.exec(`INSERT INTO users(id,name,email,email_verified) VALUES
      ('owner-a','A','old@example.test',1),('owner-b','B','changed@example.test',1);
      INSERT INTO learner_profiles(id,user_id) VALUES ('profile-a','owner-a');`);
    db.database.prepare(`INSERT INTO accounts(id,provider_id,account_id,user_id,
      access_token,refresh_token,id_token,access_token_expires_at,refresh_token_expires_at,scope)
      VALUES ('account-a',?,'subject-a','owner-a','old-a','old-r','old-i',1,2,'old-scope')`).run(provider);
    rehearseAuthCleanup(db.database,Date.now());
    const options=buildAuthOptions({ARC_ENVIRONMENT:'production',BETTER_AUTH_URL:origin,
      BETTER_AUTH_SECRET:fixtureSecret,GOOGLE_CLIENT_ID:'fixture-google',GOOGLE_CLIENT_SECRET:'fixture-google-secret',
      GITHUB_CLIENT_ID:'fixture-github',GITHUB_CLIENT_SECRET:'fixture-github-secret'},
      drizzle(db as unknown as D1Database,{schema}));
    const auth=betterAuth({...options,secrets:[{version:1,value:fixtureSecret}],telemetry:{enabled:false}});
    const context=await auth.$context;
    const result=await handleOAuthUserInfo({context,headers:new Headers(),request:new Request(origin)} as never,{
      userInfo:{id:'subject-a',name:'A',email:'changed@example.test',emailVerified:true,image:null},
      account:{providerId:provider,accountId:'subject-a',accessToken:'fixture-fresh-access'},
      callbackURL:origin+'/today',disableSignUp:true,
    });
    expect(result.error).toBeNull();
    expect(result.isRegister).toBe(false);
    expect(result.data?.user.id).toBe('owner-a');
    expect(result.data?.session.userId).toBe('owner-a');
    expect(db.database.prepare('SELECT count(*) AS n FROM users').get()).toMatchObject({n:2});
    expect(db.database.prepare('SELECT refresh_token,refresh_token_expires_at FROM accounts WHERE id=?').get('account-a'))
      .toMatchObject({refresh_token:null,refresh_token_expires_at:null});
    expect(db.database.prepare('SELECT user_id FROM learner_profiles WHERE id=?').get('profile-a')).toMatchObject({user_id:'owner-a'});
  } finally {db.close();}
});
```

Run: `npm run test:unit -- tests/server/auth-migration-runtime.test.ts`

Expected initial RED: installed Drizzle reaches an unsupported `raw()` method. If the first failure is a type/API/context mismatch instead, record and resolve that concrete mismatch before claiming this gate passed. No internal Better Auth deep-import workaround and no dependency update.

- [x] **C2.2 Add raw-array support only to the test SQLite adapter.** In `tests/helpers/sqlite-d1.ts`, add this method to `SqliteStatement`:

```ts
  async raw() {
    return this.database.execute(this.sql,this.bindings,'raw') as unknown[][];
  }
```

Change `SqliteD1.execute`'s `mode` union to `'get' | 'all' | 'run' | 'raw'`. Immediately after its local `statement` is created, add:

```ts
    if (mode === 'raw') {
      if (typeof statement.setReturnArrays !== 'function') throw new Error('SQLITE_RAW_ARRAYS_UNSUPPORTED');
      statement.setReturnArrays(true);
      return statement.all(...values as never[]).map(boundedRow);
    }
```

Add this focused adapter test to `tests/server/auth-migration-runtime.test.ts`:

```ts
it('returns ordered raw arrays without losing duplicate column labels',async()=>{
  const db=createResearchD1();
  try {
    expect(await db.prepare('SELECT 1 AS x, 2 AS x, 3 AS y').raw()).toEqual([[1,2,3]]);
  } finally {db.close();}
});
```

Run the C2 characterization command again. Expected GREEN: each provider resolves `owner-a` even though its changed email belongs to `owner-b`, with no duplicate and no stale refresh token. This is the exact changed-email join proof; matching email is deliberately insufficient.

**Explicit test-only compatibility boundary:** root verified the current host uses Node 24.14.1, and official Node documentation places `StatementSync.setReturnArrays` at Node 22.16.0. The repository still declares >=22.13.0. The guard above must fail with `SQLITE_RAW_ARRAYS_UNSUPPORTED` for older compatible application runtimes; do not change engines or dependencies and do not describe this rehearsal as supporting 22.13–22.15. Test duplicate column labels and SQL projection ordering using `SELECT 1 AS x, 2 AS x, 3 AS y`; expected raw result is `[[1,2,3]]`. Never use naive `Object.values` as the raw adapter. A tested alternative is a separate reviewed change if minimum-version rehearsal support is required.

## Remaining C3 continuation: outside this executable plan

After C2 characterization passes, author and review a separate concrete C3 plan for the remaining runtime acceptance requirements below. This is not a current implementation step. C1 and C2 can complete without claiming the entire rehearsal acceptance suite or migration is complete. The first permitted synthetic execution resolves actual compatibility; do not declare a blocker merely because that execution has not happened.

Required fixtures/assertions for that reviewed continuation:

| Case | Required actual execution and assertion |
|---|---|
| Already linked providers | Two accounts, google and github, point to `owner-a`; both actual public helper calls return that ID; account IDs/mappings and total users stay unchanged. |
| Missing subject, matching email | Public helper with absent subject and `old@example.test` returns `account not linked`; no account or session created, no merge. |
| Missing subject, new email | With `disableSignUp:true`, helper returns `signup disabled`; a separate controlled default-signup fixture may create a synthetic user but must be classified as a failed preservation check, never a pass. |
| Fresh token encryption | Generate fixture old ciphertext with public `better-auth/crypto.symmetricEncrypt`; after cleanup/login new access token decrypts with the new fixture key; missing refresh remains null. |
| Old and fresh sessions | Use public `better-call.serializeSignedCookie` with actual `context.authCookies.sessionToken` and actual `auth.handler` or `auth.api.getSession`; old-key cookie returns no session, fresh-key cookie for actual helper-created session returns `owner-a`. Also sign the deleted old DB token using the new key to prove DB cleanup, independent of signature failure. |
| OAuth state | Seed actual state through public `generateState` and its public endpoint context support, then clear verification rows; public `parseState`/handler cannot resume old state. Never replace real state verification with a boolean mock. |
| All four old intent credentials | Use existing real `D1AccountLinkRepository` + `AccountLinkService` against cleaned fixture DB; `continue()` cannot resume each failed old credential and a missing-target user can start a fresh valid flow; preserved completed rows retain every historical field. |
| Old signed link proof | Existing real `createSignedLinkContext` with old fixture secret and `verifySignedLinkContext` with new fixture secret rejects; new signed proof cannot revive reset intent through actual hook validation. |
| Ownership / bypass | Reuse and run existing account-link hook/service/repository and direct bypass suites; retain source-provider reauthentication and cross-owner denial. Do not turn off Arc hooks to get the test green. |
| Network exclusion | Reject `fetch`, and prevent imports of actual Cloudflare clients/network provider mocks; no code path can call a live provider. Endpoint setup must use a synthetic in-process context, not an HTTP listener. |

These C3 requirements intentionally remain outside the executable C1/C2 scope. Root authors the concrete continuation using the successful characterization evidence and any actual errors discovered. A failed supported-library invocation is a specific issue to resolve; a missing attempted gate is not a blocker. Reports must separate completed characterization from these outstanding acceptance requirements.

## C1/C2 verification checkpoint

- [x] **Verify and document only achieved characterization evidence.** After C1 and C2 pass, run:

`npm run test:unit -- tests/server/auth-migration-cleanup.test.ts tests/server/auth-migration-runtime.test.ts tests/server/auth-runtime.test.ts tests/server/account-link-crypto.test.ts tests/server/account-link-service.test.ts tests/server/account-link-auth-hooks.test.ts tests/server/d1-account-link-repository.test.ts tests/api/auth-link-bypass.test.ts tests/db/schema.test.ts`

`npx tsc --noEmit --incremental false`

Expected: targeted suites pass, no network calls, no build, no cloud writes, no real rows. Record actual commands/results; do not write predicted totals. Perform SPEC review then QUALITY review. Update readiness documentation to name the exact covered synthetic boundaries and explicitly retain real subject continuity/export/restore/login/cutover blockers. No commit within this bounded task.

## Plan self-review

Root execution refinements: seed all cross-database fixture timestamps explicitly so SQLite wall-clock defaults cannot create false preservation differences. Use an explicit fixed error-category allowlist, rather than forwarding an arbitrary error solely because its message matches the category prefix. C1 implementation and review must cover both refinements.

Native C1 execution refinement: SQLite integrity_check can add an empty in-memory temp entry to PRAGMA database_list. The initial length===1 draft rejects its own postcheck and repeated application. The implemented guard may allow only main plus that empty temp metadata, with no file paths and no temp schema objects. Explicitly test rejection of TEMP tables and TEMP triggers on main; all other attachments remain refused. This refines the draft memoryOnly function above, not permission to accept caller temp state or file data.

Independent QUALITY review found that ordinary DatabaseSync('') temporary databases also report file=''. Root reproduced this on the installed Node runtime. Before BEGIN, require read-only PRAGMA main.journal_mode to report memory as well as the existing checks; never change that mode to force acceptance. Add an actual unnamed-temporary baseline/user/session regression and preserve the initial failed quality verdict. The trusted fixture caller remains explicitly responsible for construction with ':memory:'; this internal module is not a provenance guarantee against in-process handle reconfiguration. Actual database-file ingestion stays outside its scope.

- C1 supplies concrete module/tests and exact rollback/preservation boundaries; no SQL supplied by module callers and no real database inputs.
- The baseline is generated from fixed trusted migrations, not a hand-written weak schema. Schema drift, attached databases and triggers fail before mutation.
- All token clearing is limited to google/github password-null rows. Unknown providers and password-bearing rows survive exactly and remain counted as unresolved account coverage.
- Business data, object keys, proof shares, rate-limit tables, completed intents and Research state are outside the mutation allowlist.
- C2 is concrete installed-library characterization. Broader C3 endpoint/state/link acceptance remains a separate plan to author after the gate; no speculative blocker or fabricated passing identity mock is accepted.
- No execution approval question is needed: parent/root already has local authorization and will review this document. Actual source export and destination application require their separate reviewed operational phase.

## C3 read-only API notes for the later plan

Independent installed-code audit on October 4 identified public-handler routes for the later C3 plan; these have not yet been executed. POST `/api/auth/sign-in/social` with provider, callbackURL and disableRedirect generates a local authorization URL, signed state cookie and database verification. Both Google and GitHub authorization URL constructors are local. GET `/api/auth/callback/{provider}` parses state before token exchange; cleaned state should reject without network. A fresh-state callback with `error=access_denied` offers a positive state-validation control that exits before token exchange. Direct handler Responses do not follow the external redirect.

Derive cookie names from auth.$context rather than hardcoding them. Public getSession with disableCookieCache and disableRefresh supports old-key, deleted-token and fresh-session checks. Public listUserAccounts handles null scope using an empty list. Public better-call serializeSignedCookie can sign synthetic session tokens; this does not prove callback cookie issuance.

For Arc flow use createProductionAccountLinkHandlers with the real auth object, real SqliteD1, requireArcUser calling actual getSession, and fixture clock/UUID. Inject only synthetic env.DB for the real buildAuthOptions hooks and restore it afterward. Start uses a form targetProvider plus exact Origin/session cookie and invokes server-side auth.api.linkSocialAccount with X-Arc-Link-Proof; it should create state locally. Test missing-target and already-inserted-target fixtures separately, all four cleaned intent credentials, and new-key proofs naming reset intents. Preserve external link-social bypass denial. Handler requests legitimately write fixture rate-limit/event rows; run C1 exact cleanup snapshot assertions before this traffic.

Evidence: installed sign-in.mjs:197–208, callback.mjs:54–68, state.mjs:61–72/109–113, session.mjs:44–45/180–191, account.mjs:58–67; app/server/account-link/http.ts:359–368/479–505/557 and auth-hooks.ts:334–382; app/server/auth/runtime.ts:68–70. No C3 test, network request, real row access or runtime change was performed for this audit.

## Completed local checkpoint — October 4

C1 final 46 tests and C2 6 tests passed, with types and targeted lint clean. Root ran the nine planned suites together: 226 passed. C1 and C2 each received independent SPEC review followed by distinct QUALITY review; the final integrated C1–C2 review returned READY with no P1/P2 findings. Initial failed runs and the first C1 quality finding remain in local evidence. The no-commit steps above applied to the bounded implementation agents; root performs the reviewed eight-file commit and existing-authorized migration-branch backup separately after this checkpoint. Its exact receipt is in the main recovery record. C3, five Dashboard Secrets, real login, complete export/restore, Paid verification and cutover remain outstanding.
