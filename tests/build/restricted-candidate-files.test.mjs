import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, readdir, realpath, lstat, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import * as files from '../../scripts/lib/restricted-candidate-files.mjs';

const inventory = JSON.parse(await readFile(new URL('../fixtures/build/research-acceptance.json', import.meta.url), 'utf8'));
const failure = /Restricted candidate preparation failed/;
const explicit = ['worker/index.ts', 'worker-configuration.d.ts', 'build/cloudflare-target.ts',
  'build/research-acceptance-target.ts', 'package.json', 'package-lock.json', 'tsconfig.json',
  'vite.config.ts', 'next.config.ts', 'postcss.config.mjs'];

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'arc-restricted-files-'));
  const sourceRoot = join(base, 'source');
  const stagingParent = join(base, 'candidates');
  for (const dir of ['app', 'db', 'public', 'worker/research-executor', 'node_modules', 'build']) {
    await mkdir(join(sourceRoot, dir), { recursive: true });
  }
  await mkdir(stagingParent);
  for (const path of [...explicit, 'app/page.tsx', 'db/schema.ts', 'public/favicon.svg',
    'worker/research-executor/index.ts', 'worker/research-executor/workflow-policy.ts']) {
    await writeFile(join(sourceRoot, path), path.endsWith('.json') ? '{}' : 'export {};\n');
  }
  return { sourceRoot, stagingParent, candidateName: 'candidate-a', target: structuredClone(inventory) };
}

test('refuses an existing candidate without changing its sentinel', async () => {
  const options = await fixture();
  const directory = join(options.stagingParent, options.candidateName);
  await mkdir(directory);
  await writeFile(join(directory, 'sentinel'), 'preserve');
  await assert.rejects(files.createCandidateWorkspace(options), failure);
  assert.equal(await readFile(join(directory, 'sentinel'), 'utf8'), 'preserve');
});

for (const candidateName of ['../escape', 'a/b', 'a\\b', '.', 'UPPER', ' trailing', 'a'.repeat(64), resolve('absolute')]) {
  test(`refuses invalid candidate name ${JSON.stringify(candidateName)}`, async () => {
    const options = await fixture();
    await assert.rejects(files.createCandidateWorkspace({ ...options, candidateName }), failure);
    assert.deepEqual(await readdir(options.stagingParent), []);
  });
}

test('validates inventory before creating a candidate or copying source', async () => {
  const options = await fixture();
  await assert.rejects(files.createCandidateWorkspace({ ...options, target: { secret: 'synthetic-private' } }), failure);
  assert.deepEqual(await readdir(options.stagingParent), []);
});

test('refuses a linked staging ancestor', async () => {
  const options = await fixture();
  const link = join(options.stagingParent, 'linked');
  await symlink(options.sourceRoot, link, 'junction');
  await assert.rejects(files.createCandidateWorkspace({ ...options, stagingParent: join(link, 'nested') }), failure);
});

test('copies only selected files with stable hashes and exactly one verified dependency link', async () => {
  const options = await fixture();
  await mkdir(join(options.sourceRoot, 'worker/research-executor/migrations'));
  await writeFile(join(options.sourceRoot, 'worker/research-executor/migrations/0000.sql'), 'not a compilation input');
  await writeFile(join(options.sourceRoot, 'worker/research-executor/wrangler.local.jsonc'), '{}');
  await writeFile(join(options.sourceRoot, '.env.local'), 'SYNTHETIC=never-copy');
  await mkdir(join(options.sourceRoot, 'scripts'));
  await writeFile(join(options.sourceRoot, 'scripts/unsafe.mjs'), 'never-copy');
  const paths = await files.createCandidateWorkspace(options);
  assert.equal(await realpath(join(paths.snapshotRoot, 'node_modules')), await realpath(join(options.sourceRoot, 'node_modules')));
  assert.equal((await lstat(join(paths.snapshotRoot, 'node_modules'))).isSymbolicLink(), true);
  const manifest = JSON.parse(await readFile(paths.sourceManifestPath, 'utf8'));
  assert.equal(manifest.files.length, explicit.length + 5);
  assert.deepEqual(manifest.files.map(x => x.path), [...manifest.files.map(x => x.path)].sort());
  for (const row of manifest.files) {
    assert.equal(row.sha256, await files.hashRegularFile(join(paths.snapshotRoot, row.path)));
  }
  assert.equal(manifest.files.some(row => /wrangler|migrations|env|scripts/.test(row.path)), false);
  await files.verifySourceManifest(paths.workspaceRoot);
  await assert.rejects(files.listRegularFiles(paths.snapshotRoot), failure);
});

for (const path of ['app/.env.local', 'app/a.js.map', 'app/.hidden', 'app/outputs/record.json', 'app/tests/a.ts', 'app/a.fixture.ts', 'app/mock.ts', 'app/smoke-entry.ts', 'app/node_modules/package/index.js']) {
  test(`rejects forbidden selected source ${path}`, async () => {
    const options = await fixture();
    await mkdir(join(options.sourceRoot, path, '..'), { recursive: true });
    await writeFile(join(options.sourceRoot, path), 'never copy');
    await assert.rejects(files.createCandidateWorkspace(options), failure);
  });
}

test('graph compatibility allows literal node_modules only for classified dependency paths', () => {
  const path = 'better-auth/node_modules/@better-auth/core/dist/index.mjs';
  assert.equal(files.forbiddenPath(path), true);
  assert.equal(files.forbiddenPath(path, { dependency: true }), false);
  for (const segment of ['Node_Modules', 'tests', 'smoke', 'fake-provider', 'live-research', '.hidden', 'output']) {
    assert.equal(files.forbiddenPath(`package/node_modules/${segment}/index.js`, { dependency: true }), true);
  }
  assert.throws(() => files.allowedSource(`app/${path}`), failure);
});

test('rejects linked source and dependency roots', async () => {
  const options = await fixture();
  await symlink(join(options.sourceRoot, 'db'), join(options.sourceRoot, 'app/linked'), 'junction');
  await assert.rejects(files.createCandidateWorkspace(options), failure);
  const second = await fixture();
  const link = join(second.stagingParent, 'linked-source');
  await symlink(second.sourceRoot, link, 'junction');
  await assert.rejects(files.createCandidateWorkspace({ ...second, sourceRoot: link }), failure);
});

test('rejects source/staging overlap in either direction', async () => {
  const options = await fixture();
  await assert.rejects(files.createCandidateWorkspace({ ...options, stagingParent: join(options.sourceRoot, 'nested') }), failure);
  await assert.rejects(files.createCandidateWorkspace({ ...options, stagingParent: join(options.sourceRoot, '..') }), failure);
});

test('detects both copied and original source changes after snapshot', async () => {
  const options = await fixture();
  const paths = await files.createCandidateWorkspace(options);
  await writeFile(join(paths.snapshotRoot, 'app/page.tsx'), 'changed');
  await assert.rejects(files.verifySourceManifest(paths.workspaceRoot), failure);
  const second = await fixture();
  const other = await files.createCandidateWorkspace(second);
  await writeFile(join(second.sourceRoot, 'app/page.tsx'), 'changed');
  await assert.rejects(files.verifySourceManifest(other.workspaceRoot), failure);
});

test('rejects linked output directories and does not traverse their contents', async () => {
  const options = await fixture();
  const link = join(options.stagingParent, 'linked-output');
  await symlink(options.sourceRoot, link, 'junction');
  await assert.rejects(files.listRegularFiles(link), failure);
  await assert.rejects(files.hashRegularFile(join(link, 'app/page.tsx')), failure);
});

test('creates a new allowlisted environment without reading excluded values', async () => {
  const options = await fixture();
  const paths = await files.createCandidateWorkspace(options);
  const inherited = { Path: 'system-path', SystemRoot: 'system-root', WINDIR: 'windows', NODE_OPTIONS: 'unsafe',
    OPENROUTER_API_KEY: 'synthetic', VITE_SECRET: 'synthetic', HTTPS_PROXY: 'synthetic', GOOGLE_CLIENT_SECRET: 'synthetic' };
  Object.defineProperty(inherited, 'SECRET_GETTER', { enumerable: true, get() { throw new Error('must not read'); } });
  const environment = files.createBuildEnvironment(inherited, paths);
  assert.equal(environment.PATH, 'system-path');
  assert.equal(environment.SystemRoot, 'system-root');
  for (const name of ['NODE_OPTIONS', 'OPENROUTER_API_KEY', 'VITE_SECRET', 'HTTPS_PROXY', 'GOOGLE_CLIENT_SECRET', 'SECRET_GETTER']) {
    assert.equal(environment[name], undefined);
  }
  for (const name of ['TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME']) {
    assert.equal((await lstat(environment[name])).isDirectory(), true);
    assert.deepEqual(await readdir(environment[name]), []);
  }
  assert.equal(environment.ARC_CLOUDFLARE_TARGET, paths.targetPath);
  assert.equal(environment.NODE_ENV, 'production');
  assert.equal(environment.WRANGLER_SEND_METRICS, 'false');
  assert.equal(environment.CLOUDFLARE_SEND_METRICS, 'false');
  assert.equal(environment.WRANGLER_WRITE_LOGS, 'false');
  assert.equal(inherited.NODE_OPTIONS, 'unsafe');
});

test('refuses a linked dependency root before creating the candidate', async () => {
  const options = await fixture();
  await rmdir(join(options.sourceRoot, 'node_modules'));
  await symlink(join(options.sourceRoot, 'public'), join(options.sourceRoot, 'node_modules'), 'junction');
  await assert.rejects(files.createCandidateWorkspace(options), failure);
  assert.deepEqual(await readdir(options.stagingParent), []);
});

test('the verified dependency junction is the only permitted link anywhere in a workspace', async () => {
  const options = await fixture();
  const paths = await files.createCandidateWorkspace(options);
  await files.verifySourceManifest(paths.workspaceRoot);
  await symlink(join(options.sourceRoot, 'public'), join(paths.workspaceRoot, 'unexpected-link'), 'junction');
  await assert.rejects(files.verifySourceManifest(paths.workspaceRoot), failure);
});

test('copies only the exact approved preview provider and excludes unused fake provider', async () => {
  const options = await fixture();
  const preview = await readFile(new URL('../../app/server/ai/mock-provider.ts', import.meta.url));
  await mkdir(join(options.sourceRoot, 'app/server/ai'), { recursive: true });
  await mkdir(join(options.sourceRoot, 'app/server/research'), { recursive: true });
  await writeFile(join(options.sourceRoot, files.PREVIEW_PROVIDER.path), preview);
  await writeFile(join(options.sourceRoot, 'app/server/research/fake-provider.ts'), 'never copy');
  const paths = await files.createCandidateWorkspace(options);
  assert.equal(await files.hashRegularFile(join(paths.snapshotRoot, files.PREVIEW_PROVIDER.path)), files.PREVIEW_PROVIDER.sha256);
  const manifest = JSON.parse(await readFile(paths.sourceManifestPath, 'utf8'));
  assert.equal(manifest.files.some(row => row.path.endsWith('fake-provider.ts')), false);
  await writeFile(join(options.sourceRoot, files.PREVIEW_PROVIDER.path), Buffer.concat([preview, Buffer.from('// changed')]));
  await assert.rejects(files.createCandidateWorkspace({ ...options, candidateName: 'changed-preview' }), failure);
});

test('a source changed while later files are copying cannot produce a successful snapshot', async () => {
  const options = await fixture();
  // Keep copying busy after app/page.tsx has been copied, without replacing any real source.
  for (let i = 0; i < 60; i++) await writeFile(join(options.sourceRoot, 'public', `asset-${i}.txt`), 'x'.repeat(32768));
  const snapshot = join(options.stagingParent, options.candidateName, 'snapshot');
  const mutation = (async () => {
    const deadline = Date.now() + 10000;
    while (true) {
      if (Date.now() > deadline) throw new Error('Synthetic snapshot did not reach the copy boundary.');
      try { await lstat(join(snapshot, 'public/asset-0.txt')); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    await writeFile(join(options.sourceRoot, 'app/page.tsx'), 'changed during copy');
  })();
  await assert.rejects(files.createCandidateWorkspace(options), failure);
  await mutation;
  assert.ok((await readdir(snapshot)).includes('app'));
});
