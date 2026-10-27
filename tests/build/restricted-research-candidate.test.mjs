import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, readdir, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { build as esbuildFixture, version as fixtureEsbuildVersion } from 'esbuild';
import { createResearchAcceptanceConfigPair } from '../../build/research-acceptance-target.ts';
import { createBuildEnvironment, createCandidateWorkspace, fileRecord, hashRegularFile, writeJsonExclusive, PREVIEW_PROVIDER } from '../../scripts/lib/restricted-candidate-files.mjs';
import * as builder from '../../scripts/build-restricted-research-candidate.mjs';
import * as checker from '../../scripts/check-restricted-research-candidate.mjs';
import * as site from '../../scripts/restricted-site-build-child.mjs';

const codeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const inventory = JSON.parse(await readFile(join(codeRoot, 'tests/fixtures/build/research-acceptance.json'), 'utf8'));
const policy = await readFile(join(codeRoot, 'worker/research-executor/workflow-policy.ts'));
const entry = "import { PAID_STEP_CONFIG } from './workflow-policy'; export class ResearchWorkflow { run() { return PAID_STEP_CONFIG; } } export default { fetch() { return new Response('synthetic'); } };";
const buildFailure = /Restricted candidate build failed/;
const checkFailure = /Restricted candidate check failed/;
const defaults = {
  dev: { ip: '127.0.0.1', local_protocol: 'http', upstream_protocol: 'http', enable_containers: true, generate_types: false },
  durable_objects: { bindings: [] }, kv_namespaces: [], queues: { producers: [], consumers: [] }, vectorize: [],
  ai_search_namespaces: [], ai_search: [], hyperdrive: [], workflows: [], secrets_store_secrets: [], artifacts: [], services: [],
  analytics_engine_datasets: [], unsafe_hello_world: [], flagship: [], ratelimits: [], worker_loaders: [], legacy_env: true,
  jsx_factory: 'React.createElement', jsx_fragment: 'React.Fragment', migrations: [], triggers: {},
  rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }], build: { watch_dir: './src' }, no_bundle: true,
  dispatch_namespaces: [], logfwdr: { bindings: [] }, observability: { enabled: true }, python_modules: { exclude: ['**/*.pyc'] },
  define: {}, cloudchamber: {}, send_email: [], mtls_certificates: [], pipelines: [], vpc_services: [], vpc_networks: [],
};

async function fixture({ state = 'closed', entryText = entry, extraFiles = {} } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'arc-restricted-pair-'));
  const sourceRoot = join(base, 'source');
  for (const dir of ['app', 'db', 'public', 'worker/research-executor', 'build', 'node_modules']) await mkdir(join(sourceRoot, dir), { recursive: true });
  const inputs = { 'app/page.tsx': 'export const page = 1;', 'db/schema.ts': 'export {};', 'public/favicon.svg': '<svg/>',
    'worker/index.ts': 'export {};', 'worker-configuration.d.ts': 'export {};', 'build/cloudflare-target.ts': 'export {};',
    'build/research-acceptance-target.ts': 'export {};', 'package.json': '{}', 'package-lock.json': '{}', 'tsconfig.json': '{}',
    'vite.config.ts': 'export default {};', 'next.config.ts': 'export default {};', 'postcss.config.mjs': 'export default {};',
    'worker/research-executor/index.ts': entryText, 'worker/research-executor/workflow-policy.ts': policy, ...extraFiles };
  for (const [path, content] of Object.entries(inputs)) {
    await mkdir(dirname(join(sourceRoot, path)), { recursive: true });
    await writeFile(join(sourceRoot, path), content);
  }
  const target = { ...structuredClone(inventory), state };
  const paths = await createCandidateWorkspace({ sourceRoot, stagingParent: join(base, 'candidates'), candidateName: 'synthetic', target });
  return { ...paths, target, sourceRoot };
}

async function syntheticPair(options) {
  const { analysis = true, siteOnly = false, ...fixtureOptions } = options ?? {};
  const paths = await fixture(fixtureOptions);
  await writeFile(join(paths.workspaceRoot, 'site-config-entry.mjs'), configEntryFixture(paths), { flag: 'wx' });
  const pair = createResearchAcceptanceConfigPair(paths.target);
  const server = join(paths.snapshotRoot, 'dist/server');
  const client = join(paths.snapshotRoot, 'dist/client');
  await mkdir(join(server, 'ssr'), { recursive: true });
  await mkdir(join(client, 'assets'), { recursive: true });
  await writeFile(join(server, 'index.js'), 'export default {};');
  await writeFile(join(server, 'ssr/index.js'), 'export default {};');
  await writeFile(join(client, 'assets/app.js'), 'export const synthetic = 1;');
  await writeFile(join(client, 'assets/app.css'), 'body{margin:0}');
  await writeJsonExclusive(join(server, 'wrangler.json'), { ...defaults, ...pair.site, topLevelName: pair.site.name,
    main: 'index.js', assets: { binding: 'ASSETS', directory: '../client' } });
  if (!siteOnly) await builder.buildExecutorArtifacts(paths);
  await site.recordSiteGraph({ workspaceRoot: paths.workspaceRoot, graphs: [
    ...(analysis ? [
      { environment: 'rsc', write: false, directory: server, chunks: [{ fileName: 'index.js', modules: [join(paths.snapshotRoot, 'worker/index.ts')] }] },
      { environment: 'ssr', write: false, directory: join(server, 'ssr'), chunks: [{ fileName: 'index.js', modules: [join(paths.snapshotRoot, 'app/page.tsx')] }] },
    ] : []),
    { environment: 'rsc', write: true, directory: server, chunks: [{ fileName: 'index.js', modules: [join(paths.snapshotRoot, 'worker/index.ts')] }] },
    { environment: 'client', write: true, directory: client, chunks: [{ fileName: 'assets/app.js', modules: [join(paths.snapshotRoot, 'app/page.tsx'), '\0arc-client-safe-auth-environment'] }] },
    { environment: 'ssr', write: true, directory: join(server, 'ssr'), chunks: [{ fileName: 'index.js', modules: [join(paths.snapshotRoot, 'app/page.tsx')] }] },
  ] });
  if (siteOnly) return paths;
  await writeFile(join(paths.workspaceRoot, 'site-build.stdout.log'), 'synthetic child boundary\n');
  await writeFile(join(paths.workspaceRoot, 'site-build.stderr.log'), '');
  await writeJsonExclusive(join(paths.workspaceRoot, 'site-exit.json'), { code: 0, signal: null, timedOut: false, truncated: false, spawnError: false, terminationConfirmed: true });
  await builder.writeBuildManifest(paths.workspaceRoot);
  return paths;
}

test('invalid inventory fails before coordinator filesystem or child activity', async () => {
  const base = await mkdtemp(join(tmpdir(), 'arc-invalid-target-'));
  const targetPath = join(base, 'target.json');
  await writeFile(targetPath, '{"secret":"synthetic-private"}');
  await assert.rejects(builder.buildRestrictedResearchCandidate({ targetPath, candidateName: 'invalid-never-created' }), buildFailure);
  assert.deepEqual(await readdir(base), ['target.json']);
});

test('Site options use isolated runner, cache and environment rather than installed CLI', async () => {
  const paths = await fixture({ extraFiles: { 'vite.config.ts': "export default { root: '../unwanted', configFile: 'unwanted.ts', envDir: '../unwanted', cacheDir: '../unwanted' };" } });
  const { result, value } = siteOptionsInChild(paths);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(value.root, paths.snapshotRoot);
  assert.equal(value.configFile, false);
  assert.equal(value.configLoader, 'runner');
  assert.equal(value.envDir, false);
  assert.equal(value.cacheDir, join(paths.workspaceRoot, 'cache/vite'));
  assert.deepEqual(value.graphs[0].chunks, [{ fileName: 'a.js', modules: ['a', 'z'] }]);
  assert.deepEqual(await readdir(join(paths.sourceRoot, 'node_modules')), []);
});

test('actual esbuild uses the fixed entry and emits exact config plus inspectable metafile', async () => {
  const paths = await fixture();
  const result = await builder.buildExecutorArtifacts({ ...paths, entry: 'ignored.ts' });
  assert.equal(result.entry, 'worker/research-executor/index.ts');
  assert.deepEqual(await readdir(paths.executorDirectory), ['index.js', 'wrangler.json']);
  const config = JSON.parse(await readFile(join(paths.executorDirectory, 'wrangler.json'), 'utf8'));
  assert.deepEqual(config, { ...createResearchAcceptanceConfigPair(paths.target).executor, main: 'index.js', no_bundle: true });
  const meta = JSON.parse(await readFile(join(paths.workspaceRoot, 'executor-metafile.json'), 'utf8'));
  assert.ok(meta.inputs['worker/research-executor/index.ts']);
  assert.ok(meta.inputs['worker/research-executor/workflow-policy.ts']);
  assert.deepEqual(Object.values(meta.outputs)[0].exports, ['ResearchWorkflow', 'default']);
  await assert.rejects(builder.buildExecutorArtifacts(paths), buildFailure);
});

for (const [name, source, extras] of [
  ['missing Workflow export', "export default {};", {}],
  ['missing default export', "export class ResearchWorkflow {}", {}],
  ['policy eliminated', "export class ResearchWorkflow {} export default {};", {}],
  ['Site HTTP import', entry + "import { forbidden } from '../../app/server/http/unsafe'; console.log(forbidden);", { 'app/server/http/unsafe.ts': 'export const forbidden = 1;' }],
  ['publication import', entry + "import { forbidden } from '../../app/server/research/d1-publication'; console.log(forbidden);", { 'app/server/research/d1-publication.ts': 'export const forbidden = 1;' }],
  ['outside source import', entry + "import x from '../../../outside.ts'; console.log(x);", {}],
  ['unapproved Node builtin', entry + "import { readFile } from 'node:fs'; console.log(readFile);", {}],
]) {
  test(`Executor rejects ${name}`, async () => {
    const paths = await fixture({ entryText: source, extraFiles: extras });
    await assert.rejects(builder.buildExecutorArtifacts(paths), buildFailure);
  });
}

test('Executor rejects altered paid-step source even if required tokens remain', async () => {
  const paths = await fixture();
  await writeFile(join(paths.snapshotRoot, 'worker/research-executor/workflow-policy.ts'), `${policy.toString()}\n// changed`);
  await assert.rejects(builder.buildExecutorArtifacts(paths), buildFailure);
});

test('Executor rejects preexisting linked output and preserves its target', async () => {
  const paths = await fixture();
  await symlink(join(paths.sourceRoot, 'public'), paths.executorDirectory, 'junction');
  await assert.rejects(builder.buildExecutorArtifacts(paths), buildFailure);
  assert.deepEqual(await readdir(join(paths.sourceRoot, 'public')), ['favicon.svg']);
});

for (const state of ['closed', 'active', 'draining']) {
  test(`seals and independently reads the exact ${state} pair without writes`, async () => {
    const paths = await syntheticPair({ state });
    await checker.sealRestrictedResearchCandidate(paths);
    const before = await readFile(join(paths.workspaceRoot, 'artifact-manifest.json'));
    const result = await checker.checkRestrictedResearchCandidate(paths);
    assert.equal(result.state, state);
    assert.ok(result.artifactCount >= 6);
    assert.deepEqual(await readFile(join(paths.workspaceRoot, 'artifact-manifest.json')), before);
  });
  for (const area of ['site', 'executor']) {
    test(`rejects a complete-config mismatch for ${state} ${area}`, async () => {
      const paths = await syntheticPair({ state });
      const path = area === 'site' ? join(paths.snapshotRoot, 'dist/server/wrangler.json') : join(paths.executorDirectory, 'wrangler.json');
      const config = JSON.parse(await readFile(path, 'utf8'));
      config.secrets.required.push('UNDECLARED_SECRET');
      await writeFile(path, JSON.stringify(config));
      await assert.rejects(checker.sealRestrictedResearchCandidate(paths), checkFailure);
    });
  }
}

for (const kind of ['missing', 'extra', 'tampered', 'linked', 'manifest-escape', 'provenance']) {
  test(`sealed pair rejects ${kind} artifact or provenance`, async () => {
    const paths = await syntheticPair();
    await checker.sealRestrictedResearchCandidate(paths);
    const artifact = join(paths.snapshotRoot, 'dist/client/assets/app.js');
    if (kind === 'missing') await unlink(artifact);
    if (kind === 'extra') await writeFile(join(paths.executorDirectory, 'extra.js'), 'export {};');
    if (kind === 'tampered') await writeFile(artifact, 'changed');
    if (kind === 'linked') await symlink(paths.sourceRoot, join(paths.executorDirectory, 'link'), 'junction');
    if (kind === 'provenance') await writeFile(join(paths.workspaceRoot, 'site-build.stdout.log'), 'changed');
    if (kind === 'manifest-escape') {
      const path = join(paths.workspaceRoot, 'artifact-manifest.json');
      const manifest = JSON.parse(await readFile(path, 'utf8'));
      manifest.artifacts[0].path = '../escape';
      await writeFile(path, JSON.stringify(manifest));
    }
    await assert.rejects(checker.checkRestrictedResearchCandidate(paths), checkFailure);
  });
}

for (const identifier of ['OPENROUTER_API_KEY', 'BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_SECRET', 'GITHUB_CLIENT_SECRET', 'ARC_AI_RESEARCH_SITE_TO_EXECUTOR_SECRET_HEX', 'ARC_AI_RESEARCH_EXECUTOR_TO_SITE_SECRET_HEX', 'readRuntimeEnvironment', 'readResearchBridgeConnection', 'readAuthPolicy']) {
  test(`rejects client credential implementation ${identifier}`, async () => {
    const paths = await syntheticPair();
    await writeFile(join(paths.snapshotRoot, 'dist/client/assets/app.js'), `console.log(env.${identifier});`);
    await assert.rejects(checker.sealRestrictedResearchCandidate(paths), checkFailure);
  });
}

for (const moduleId of ['C:/outside/input.ts', '\0virtual:unsafe?path=C%3A%2Foutside%2Finput.ts', 'unknown-relative.ts', '\0virtual:tests/fixture.ts', '\0virtual:/outside/input.ts', '\0virtual:@source/scripts/arbitrary.ts', '\0virtual:@source/app/server/research/fake-provider.ts', '\0virtual:app/server/research/fake-provider.ts']) {
  test(`rejects unbounded or forbidden Site graph input ${JSON.stringify(moduleId)}`, async () => {
    const paths = await fixture();
    await assert.rejects(site.describeModule(moduleId, { ...paths, dependencyRoot: join(paths.sourceRoot, 'node_modules'), environment: 'client' }));
  });
}

test('strict CLIs reject missing/extra arguments without input echo or import writes', async () => {
  const base = await mkdtemp(join(tmpdir(), 'arc-restricted-cli-'));
  for (const name of ['build-restricted-research-candidate.mjs', 'check-restricted-research-candidate.mjs']) {
    const path = join(codeRoot, 'scripts', name);
    for (const args of [[], ['synthetic-private', 'extra', 'extra']]) {
      const result = spawnSync(process.execPath, ['--experimental-strip-types', path, ...args], { cwd: base, encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.ok(result.stderr.length < 512);
      assert.ok(!result.stderr.includes('synthetic-private'));
    }
  }
  assert.deepEqual(await readdir(base), []);
});

// Hooks exist only in this subprocess fixture. Neither real CLI module is rewritten.
async function cliOrchestrationFixture({ invalidClient = false } = {}) {
  const paths = await syntheticPair({ siteOnly: true });
  if (invalidClient) await writeFile(join(paths.snapshotRoot, 'dist/client/assets/app.js'), 'export function readAuthPolicy() {}');
  const hookRoot = join(dirname(paths.sourceRoot), 'cli-hooks');
  await mkdir(hookRoot);
  const builderPath = join(codeRoot, 'scripts/build-restricted-research-candidate.mjs');
  const builderUrl = pathToFileURL(builderPath).href;
  const libraryUrl = pathToFileURL(join(codeRoot, 'scripts/lib/restricted-candidate-files.mjs')).href;
  const workspaceAdapter = join(hookRoot, 'workspace-adapter.mjs');
  await writeFile(workspaceAdapter, `
    import assert from 'node:assert/strict';
    import { verifySourceManifest } from ${JSON.stringify(libraryUrl)};
    export * from ${JSON.stringify(libraryUrl)};
    export async function createCandidateWorkspace(options) {
      assert.equal(options.sourceRoot, ${JSON.stringify(codeRoot)});
      assert.equal(options.stagingParent, ${JSON.stringify(join(dirname(codeRoot), 'restricted-research-candidates'))});
      assert.equal(options.candidateName, 'cli-synthetic');
      assert.deepEqual(options.target, ${JSON.stringify(paths.target)});
      const paths = ${JSON.stringify(paths)};
      await verifySourceManifest(paths.workspaceRoot);
      return paths;
    }
  `, { flag: 'wx' });
  const spawnAdapter = join(hookRoot, 'spawn-adapter.mjs');
  await writeFile(spawnAdapter, `
    import assert from 'node:assert/strict';
    import { EventEmitter } from 'node:events';
    export function spawn(command, args, options) {
      assert.equal(command, process.execPath);
      assert.deepEqual(args, ['--experimental-strip-types', ${JSON.stringify(join(codeRoot, 'scripts/restricted-site-build-child.mjs'))}]);
      assert.equal(options.cwd, ${JSON.stringify(paths.snapshotRoot)});
      assert.equal(options.env.ARC_CLOUDFLARE_TARGET, ${JSON.stringify(paths.targetPath)});
      assert.equal(options.shell, false);
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      process.nextTick(() => {
        child.stdout.emit('data', Buffer.from('synthetic CLI Site boundary\\n'));
        child.emit('close', 0, null);
      });
      return child;
    }
  `, { flag: 'wx' });
  const hook = join(hookRoot, 'register.mjs');
  await writeFile(hook, `
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, nextResolve) {
      if (context.parentURL === ${JSON.stringify(builderUrl)}) {
        if (specifier === './lib/restricted-candidate-files.mjs') return nextResolve(${JSON.stringify(pathToFileURL(workspaceAdapter).href)}, context);
        if (specifier === 'node:child_process') return nextResolve(${JSON.stringify(pathToFileURL(spawnAdapter).href)}, context);
      }
      return nextResolve(specifier, context);
    } });
  `, { flag: 'wx' });
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--import', pathToFileURL(hook).href,
    builderPath, paths.targetPath, 'cli-synthetic'], {
    cwd: hookRoot, encoding: 'utf8', shell: false, windowsHide: true, timeout: 30000, maxBuffer: 256 * 1024,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  // These prove the real coordinator completed compilation and evidence before final checking.
  assert.deepEqual(await readdir(paths.executorDirectory), ['index.js', 'wrangler.json']);
  await builder.validateExecutorEvidence(paths.workspaceRoot);
  assert.deepEqual(JSON.parse(await readFile(join(paths.workspaceRoot, 'build-manifest.json'), 'utf8')), await builder.expectedBuildManifest());
  assert.equal(await readFile(join(paths.workspaceRoot, 'site-build.stdout.log'), 'utf8'), 'synthetic CLI Site boundary\n');
  return { paths, result };
}

test('CLI orchestration completes the real builder/checker cycle and a hook-free independent check', async () => {
  const { paths, result } = await cliOrchestrationFixture();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'Restricted Research candidate built and checked locally. No deployment performed.\n');
  const seal = await readFile(join(paths.workspaceRoot, 'artifact-manifest.json'));
  const independent = spawnSync(process.execPath, ['--experimental-strip-types', join(codeRoot, 'scripts/check-restricted-research-candidate.mjs'), paths.workspaceRoot], {
    cwd: paths.workspaceRoot, encoding: 'utf8', shell: false, windowsHide: true, timeout: 30000, maxBuffer: 256 * 1024,
  });
  assert.equal(independent.error, undefined);
  assert.equal(independent.signal, null);
  assert.equal(independent.status, 0, independent.stderr);
  assert.equal(independent.stderr, '');
  assert.equal(independent.stdout, 'Restricted Research candidate check passed locally. No deployment performed.\n');
  assert.deepEqual(await readFile(join(paths.workspaceRoot, 'artifact-manifest.json')), seal);
  assert.equal((await checker.checkRestrictedResearchCandidate(paths)).status, 'checked-local-only');
});

test('CLI orchestration final validation refuses forbidden client bytes without a seal or success output', async () => {
  const { paths, result } = await cliOrchestrationFixture({ invalidClient: true });
  assert.equal(result.stdout, '');
  await assert.rejects(readFile(join(paths.workspaceRoot, 'artifact-manifest.json')), { code: 'ENOENT' });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stderr, 'Restricted candidate build failed. Supply a valid target inventory and a new candidate name.\n');
  await assert.rejects(checker.checkRestrictedResearchCandidate(paths), checkFailure);
});

test('ordinary imports of both real CLI modules produce no output or workspace writes', async () => {
  const base = await mkdtemp(join(tmpdir(), 'arc-restricted-import-'));
  for (const name of ['build-restricted-research-candidate.mjs', 'check-restricted-research-candidate.mjs']) {
    const source = `await import(${JSON.stringify(pathToFileURL(join(codeRoot, 'scripts', name)).href)});`;
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source], {
      cwd: base, encoding: 'utf8', shell: false, windowsHide: true, timeout: 30000, maxBuffer: 256 * 1024,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  }
  assert.deepEqual(await readdir(base), []);
});

test('exact preview provider is server-only and never an Executor input', async () => {
  const preview = await readFile(join(codeRoot, PREVIEW_PROVIDER.path));
  const paths = await fixture({ extraFiles: { [PREVIEW_PROVIDER.path]: preview } });
  const id = join(paths.snapshotRoot, PREVIEW_PROVIDER.path);
  const context = { ...paths, dependencyRoot: join(paths.sourceRoot, 'node_modules') };
  assert.equal((await site.describeModule(id, { ...context, environment: 'rsc' })).sha256, PREVIEW_PROVIDER.sha256);
  assert.equal((await site.describeModule(id, { ...context, environment: 'ssr' })).sha256, PREVIEW_PROVIDER.sha256);
  await assert.rejects(site.describeModule(id, { ...context, environment: 'client' }));
  await assert.rejects(site.describeModule(id, { ...context, environment: 'executor', executor: true }));
  const other = await fixture({ extraFiles: { [PREVIEW_PROVIDER.path]: preview },
    entryText: entry + "import { MockAiProvider } from '../../app/server/ai/mock-provider'; console.log(MockAiProvider);" });
  await assert.rejects(builder.buildExecutorArtifacts(other), buildFailure);
});

test('disk server implementation is refused in the client while bounded action-reference virtual IDs stay virtual', async () => {
  const paths = await fixture({ extraFiles: { 'app/server/auth/runtime.ts': 'export const serverImplementation = true;' } });
  const context = { ...paths, dependencyRoot: join(paths.sourceRoot, 'node_modules'), environment: 'client' };
  await assert.rejects(site.describeModule(join(paths.snapshotRoot, 'app/server/auth/runtime.ts'), context));
  const record = await site.describeModule('\0virtual:vite-rsc/server-references', context);
  assert.deepEqual(record, { kind: 'virtual', id: '\0virtual:vite-rsc/server-references' });
});

test('verified dependency inputs are hashed but a dependency file link is refused', async () => {
  const paths = await fixture();
  const dependencyRoot = join(paths.sourceRoot, 'node_modules');
  await writeFile(join(dependencyRoot, 'safe.js'), 'export const safe = 1;');
  const record = await site.describeModule(join(paths.snapshotRoot, 'node_modules/safe.js'), { ...paths, dependencyRoot, environment: 'client' });
  assert.equal(record.kind, 'dependency');
  assert.equal(record.sha256, await hashRegularFile(join(dependencyRoot, 'safe.js')));
  await symlink(join(paths.sourceRoot, 'app'), join(dependencyRoot, 'linked'), 'junction');
  await assert.rejects(site.describeModule(join(dependencyRoot, 'linked/page.tsx'), { ...paths, dependencyRoot, environment: 'client' }));
});

test('module query paths are bounded and canonicalized along with their file path', async () => {
  const paths = await fixture();
  const context = { ...paths, dependencyRoot: join(paths.sourceRoot, 'node_modules'), environment: 'client' };
  const filename = join(paths.snapshotRoot, 'app/page.tsx');
  await assert.rejects(site.describeModule(filename + '?id=C%3A%2Foutside%2Fsecret.ts', context));
  await assert.rejects(site.describeModule(filename + '?id=C%3A%5Coutside%5Csecret.ts', context));
  const allowed = await site.describeModule(filename + '?id=' + encodeURIComponent(filename), context);
  assert.equal(allowed.suffix, '?id=@source/app/page.tsx');
});

test('virtual path canonicalization cannot mistake a same-prefix sibling for an approved root', async () => {
  const paths = await fixture();
  const context = { ...paths, dependencyRoot: join(paths.sourceRoot, 'node_modules'), environment: 'client' };
  for (const root of [paths.snapshotRoot, context.dependencyRoot]) {
    await assert.rejects(site.describeModule('\0virtual:reference?id=' + encodeURIComponent(root + '-escape/secret.ts'), context));
  }
});

test('only known framework metadata may be hidden deployment inputs', async () => {
  const paths = await syntheticPair();
  for (const area of ['server', 'client']) {
    await mkdir(join(paths.snapshotRoot, `dist/${area}/.vite`));
    await writeFile(join(paths.snapshotRoot, `dist/${area}/.vite/manifest.json`), '{}');
  }
  await writeFile(join(paths.snapshotRoot, 'dist/client/.assetsignore'), '');
  await checker.sealRestrictedResearchCandidate(paths);
  await writeFile(join(paths.snapshotRoot, 'dist/client/.env.local'), 'SYNTHETIC=private');
  await assert.rejects(checker.checkRestrictedResearchCandidate(paths), checkFailure);
});

test('logs, locks, inventories and provenance records cannot become deployment files', async () => {
  const paths = await syntheticPair();
  for (const name of ['source-manifest.json', 'site-graph.json', 'executor-metafile.json', 'workspace.json',
    'artifact-manifest.json', 'research-acceptance.json', 'site-config-entry.mjs', 'trace.log', 'yarn.lock', 'pnpm-lock.yaml']) {
    const filename = join(paths.snapshotRoot, 'dist/client', name);
    await writeFile(filename, '{}');
    await assert.rejects(checker.sealRestrictedResearchCandidate(paths), checkFailure);
    await unlink(filename);
  }
  await checker.sealRestrictedResearchCandidate(paths);
});

function configEntryFixture({ snapshotRoot }) {
  return `import configuration from ${JSON.stringify(pathToFileURL(join(snapshotRoot, 'vite.config.ts')).href)};\n`
    + 'export default await (typeof configuration === "function" ? configuration({ command: "build", mode: "production" }) : configuration);\n';
}

function siteOptionsInChild(paths) {
  const source = `
    import { resolveConfig } from ${JSON.stringify(pathToFileURL(join(codeRoot, 'node_modules/vite/dist/node/index.js')).href)};
    import { createSiteBuildOptions } from ${JSON.stringify(pathToFileURL(join(codeRoot, 'scripts/restricted-site-build-child.mjs')).href)};
    const paths = ${JSON.stringify({ snapshotRoot: paths.snapshotRoot, workspaceRoot: paths.workspaceRoot })};
    const graphs = [];
    try {
      const options = await createSiteBuildOptions({ ...paths, graphs });
      const resolved = await resolveConfig(options, 'build', 'production');
      const graph = resolved.plugins.find(plugin => plugin.name === 'arc-restricted-build-input-graph');
      graph.generateBundle.call({ environment: { name: 'client', config: { build: { write: true } } } }, { dir: paths.snapshotRoot + '/dist/client' }, {
        'a.js': { type: 'chunk', fileName: 'a.js', modules: { z: {}, a: {} } }, 'a.css': { type: 'asset' },
      });
      const control = resolved.plugins.find(plugin => plugin.name === 'arc-loader-config-control');
      console.log(JSON.stringify({ root: options.root, configFile: options.configFile, configLoader: options.configLoader,
        envDir: options.envDir, cacheDir: options.cacheDir, graphs, control: control?.resolveId('loader-control'),
        configCalls: globalThis.__arcConfigCalls, mode: resolved.mode, define: resolved.define }));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  `;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source], {
    cwd: paths.snapshotRoot, env: createBuildEnvironment(process.env, paths), shell: false, windowsHide: true,
    encoding: 'utf8', timeout: 30000, maxBuffer: 256 * 1024,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  return { result, value: result.status === 0 ? JSON.parse(result.stdout.trim()) : null };
}

test('Site config loader preserves a normal object config and its plugin functions', async () => {
  const paths = await fixture({ extraFiles: { 'vite.config.ts': "export default { plugins: [{ name: 'arc-loader-config-control', resolveId(id) { return id === 'loader-control' ? 'normal-control' : null; } }] };" } });
  const { result, value } = siteOptionsInChild(paths);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(value.control, 'normal-control');
});

test('Site config loader awaits deferred dynamic import before closing the actual Vite runner', async () => {
  const config = `export default async ({ command, mode }) => {
    globalThis.__arcConfigCalls = (globalThis.__arcConfigCalls ?? 0) + 1;
    await new Promise(resolve => setTimeout(resolve, 5));
    const { plugin } = await import('./app/loader-plugin');
    return { plugins: [plugin], define: { __LOADER_MODE__: JSON.stringify(command + '/' + mode) } };
  };`;
  const paths = await fixture({ extraFiles: { 'vite.config.ts': config,
    'app/loader-plugin.ts': "export const plugin = { name: 'arc-loader-config-control', resolveId(id) { return id === 'loader-control' ? 'deferred-control' : null; } };" } });
  const original = await hashRegularFile(join(paths.sourceRoot, 'vite.config.ts'));
  const { result, value } = siteOptionsInChild(paths);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(value.control, 'deferred-control');
  assert.equal(value.configCalls, 1);
  assert.equal(value.define.__LOADER_MODE__, '"build/production"');
  assert.equal(await hashRegularFile(join(paths.sourceRoot, 'vite.config.ts')), original);
  assert.equal(await hashRegularFile(join(paths.snapshotRoot, 'vite.config.ts')), original);
  assert.equal(await readFile(join(paths.workspaceRoot, 'site-config-entry.mjs'), 'utf8'), configEntryFixture(paths));
  assert.deepEqual(await readdir(join(paths.sourceRoot, 'node_modules')), []);
  await assert.rejects(readFile(join(paths.snapshotRoot, 'dist/server/index.js')), { code: 'ENOENT' });
});

test('Site config wrapper refuses an existing entry and preserves its bytes', async () => {
  const paths = await fixture();
  const wrapper = join(paths.workspaceRoot, 'site-config-entry.mjs');
  await writeFile(wrapper, 'preexisting sentinel', { flag: 'wx' });
  const { result } = siteOptionsInChild(paths);
  assert.equal(result.status, 1);
  assert.equal(await readFile(wrapper, 'utf8'), 'preexisting sentinel');
});

test('Site config wrapper belongs to sealed provenance outside deployment inputs', async () => {
  const paths = await syntheticPair();
  await checker.sealRestrictedResearchCandidate(paths);
  const manifest = JSON.parse(await readFile(join(paths.workspaceRoot, 'artifact-manifest.json'), 'utf8'));
  assert.ok(manifest.provenance.some(record => record.path === 'site-config-entry.mjs'));
  assert.equal(manifest.artifacts.some(record => record.path.includes('site-config-entry.mjs')), false);
});

for (const stage of ['seal', 'independent check']) {
  test(`Site config wrapper exact bytes reject tampering during ${stage}`, async () => {
    const paths = await syntheticPair();
    if (stage === 'independent check') await checker.sealRestrictedResearchCandidate(paths);
    await writeFile(join(paths.workspaceRoot, 'site-config-entry.mjs'), 'export default { plugins: [] };');
    if (stage === 'independent check') {
      const manifestPath = join(paths.workspaceRoot, 'artifact-manifest.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      const record = manifest.provenance.find(item => item.path === 'site-config-entry.mjs');
      assert.ok(record);
      Object.assign(record, await fileRecord(paths.workspaceRoot, 'site-config-entry.mjs'));
      await writeFile(manifestPath, JSON.stringify(manifest));
    }
    const check = stage === 'seal' ? checker.sealRestrictedResearchCandidate : checker.checkRestrictedResearchCandidate;
    await assert.rejects(check(paths), checkFailure);
  });
}

for (const mutation of ['path', 'hash', 'missing-environment', 'virtual-escape', 'metafile-external', 'metafile-exports', 'failed-child']) {
  test(`refuses forged ${mutation} provenance before sealing`, async () => {
    const paths = await syntheticPair();
    const graphPath = join(paths.workspaceRoot, 'site-graph.json');
    const graph = JSON.parse(await readFile(graphPath, 'utf8'));
    if (mutation === 'path') graph.graphs[0].chunks[0].modules.find(record => record.kind === 'source').path = '../outside';
    if (mutation === 'hash') graph.graphs[0].chunks[0].modules.find(record => record.kind === 'source').sha256 = '0'.repeat(64);
    if (mutation === 'missing-environment') graph.graphs.pop();
    if (mutation === 'virtual-escape') graph.graphs[0].chunks[0].modules.push({ kind: 'virtual', id: '\0virtual:/outside/code.js' });
    if (mutation.startsWith('metafile-')) {
      const path = join(paths.workspaceRoot, 'executor-metafile.json');
      const meta = JSON.parse(await readFile(path, 'utf8'));
      const output = Object.values(meta.outputs)[0];
      if (mutation === 'metafile-exports') output.exports = ['default'];
      else output.imports.push({ external: true, path: 'node:fs', kind: 'import-statement' });
      await writeFile(path, JSON.stringify(meta));
    }
    if (mutation === 'failed-child') {
      const path = join(paths.workspaceRoot, 'site-exit.json');
      const status = JSON.parse(await readFile(path, 'utf8'));
      status.timedOut = true;
      await writeFile(path, JSON.stringify(status));
    }
    await writeFile(graphPath, JSON.stringify(graph));
    await assert.rejects(checker.sealRestrictedResearchCandidate(paths), checkFailure);
  });
}

for (const outcome of ['success', 'failure', 'signal', 'truncated', 'spawn-error']) {
  test(`Site child boundary records bounded ${outcome} status using fixed command and scrubbed environment`, async () => {
    const paths = await fixture();
    let observed;
    const launch = (command, args, options) => {
      observed = { command, args, options };
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => true;
      setImmediate(() => {
        child.stdout.emit('data', outcome === 'truncated' ? Buffer.alloc(1024 * 1024 + 1) : Buffer.from('bounded'));
        if (outcome === 'spawn-error') child.emit('error', new Error('synthetic-private'));
        child.emit('close', outcome === 'failure' ? 1 : outcome === 'signal' ? null : 0, outcome === 'signal' ? 'SIGTERM' : null);
      });
      return child;
    };
    if (outcome === 'success') await builder.runSiteBuildChild(paths, launch);
    else await assert.rejects(builder.runSiteBuildChild(paths, launch), buildFailure);
    assert.equal(observed.command, process.execPath);
    assert.deepEqual(observed.args, ['--experimental-strip-types', join(codeRoot, 'scripts/restricted-site-build-child.mjs')]);
    assert.equal(observed.options.cwd, paths.snapshotRoot);
    assert.equal(observed.options.shell, false);
    assert.equal(observed.options.env.NODE_OPTIONS, undefined);
    assert.equal(observed.options.env.ARC_CLOUDFLARE_TARGET, paths.targetPath);
    assert.ok((await readFile(join(paths.workspaceRoot, 'site-build.stdout.log'))).length <= 1024 * 1024);
    const status = JSON.parse(await readFile(join(paths.workspaceRoot, 'site-exit.json'), 'utf8'));
    assert.equal(status.terminationConfirmed, true);
    assert.equal(status.truncated, outcome === 'truncated');
  });
}

for (const confirmed of [true, false]) {
  test(`ten-minute child timeout refuses acceptance with termination ${confirmed ? 'confirmed' : 'uncertain'}`, async t => {
    const paths = await fixture();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let ready, killed = false;
    const launched = new Promise(resolve => { ready = resolve; });
    const launch = () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.kill = () => { killed = true; if (confirmed) child.emit('close', null, 'SIGKILL'); return true; };
      ready();
      return child;
    };
    const result = builder.runSiteBuildChild(paths, launch);
    const rejected = assert.rejects(result, buildFailure);
    await launched;
    t.mock.timers.tick(10 * 60 * 1000 - 1);
    assert.equal(killed, false);
    t.mock.timers.tick(1);
    assert.equal(killed, true);
    t.mock.timers.tick(5000);
    await rejected;
    t.mock.timers.reset();
    const status = JSON.parse(await readFile(join(paths.workspaceRoot, 'site-exit.json'), 'utf8'));
    assert.equal(status.timedOut, true);
    assert.equal(status.terminationConfirmed, confirmed);
  });
}

for (const state of ['closed', 'active', 'draining']) {
  test(`complete Executor comparison rejects each operational dimension in ${state}`, async () => {
    const paths = await syntheticPair({ state });
    const path = join(paths.executorDirectory, 'wrangler.json');
    const original = JSON.parse(await readFile(path, 'utf8'));
    const mutations = [
      config => { config.workers_dev = true; },
      config => { config.routes = ['example.com/*']; },
      config => { config.services[0].service = inventory.executor.workerName; },
      config => { config.d1_databases[0].database_id = inventory.site.d1.databaseId; },
      config => { config.r2_buckets[0].bucket_name = inventory.site.r2.bucketName; },
      config => { config.workflows[0].class_name = 'WrongWorkflow'; },
      config => { config.vars.ARC_RESEARCH_EXECUTOR_ACCEPT_NEW = String(state !== 'active'); },
      config => { config.vars.ARC_RESEARCH_EXECUTOR_MAINTENANCE_ENABLED = String(state === 'closed'); },
      config => { config.triggers.crons = state === 'closed' ? ['* * * * *'] : []; },
      config => { config.secrets.required.reverse(); },
      config => { config.secrets.OPENROUTER_API_KEY = 'synthetic-private'; },
      config => { config.unexpected = {}; },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(original);
      mutate(changed);
      await writeFile(path, JSON.stringify(changed));
      await assert.rejects(checker.sealRestrictedResearchCandidate(paths), checkFailure);
    }
    await writeFile(path, JSON.stringify(original));
    await checker.sealRestrictedResearchCandidate(paths);
  });
}

async function launcherGraphFixture(alias, launcherPath = 'probe-package/scripts/live-research/launcher.js', options) {
  const paths = await fixture(options);
  const dependencyRoot = join(paths.sourceRoot, 'node_modules');
  const safePath = 'probe-package/index.js';
  for (const path of [safePath, launcherPath]) {
    await mkdir(dirname(join(dependencyRoot, path)), { recursive: true });
    await writeFile(join(dependencyRoot, path), 'export const synthetic = true;');
  }
  const visibleRoot = alias ? join(paths.snapshotRoot, 'node_modules') : dependencyRoot;
  const safeId = join(visibleRoot, safePath);
  const launcherId = join(visibleRoot, launcherPath);
  const graphs = [];
  for (const [environment, directory] of [['client', 'dist/client'], ['rsc', 'dist/server'], ['ssr', 'dist/server/ssr']]) {
    const output = join(paths.snapshotRoot, directory);
    await mkdir(output, { recursive: true });
    await writeFile(join(output, 'index.js'), 'export const synthetic = true;');
    graphs.push({ environment, write: true, directory: output, chunks: [{ fileName: 'index.js', modules: [safeId, join(paths.snapshotRoot, 'app/page.tsx')] }] });
  }
  return { ...paths, dependencyRoot, safeId, launcherId, launcherPath, graphs };
}

for (const [category, dependencyPath] of [
  ['local-launcher', 'probe-package/scripts/live-research/launcher.js'],
  ['fake-provider', 'probe-package/app/server/research/fake-provider.ts'],
]) {
  for (const environment of ['client', 'rsc', 'ssr']) {
    for (const alias of [false, true]) {
      const label = `${environment} ${alias ? 'snapshot junction alias' : 'ordinary dependency path'}`;
      test(`${category} disk exclusion applies during direct classification: ${label}`, async () => {
        const paths = await launcherGraphFixture(alias, dependencyPath);
        const context = { ...paths, environment };
        assert.equal((await site.describeModule(paths.safeId, context)).kind, 'dependency');
        assert.equal((await site.describeModule(join(paths.snapshotRoot, 'app/page.tsx'), context)).kind, 'source');
        await assert.rejects(site.describeModule(paths.launcherId, context), /Restricted Site graph validation failed/);
      });

      test(`${category} disk exclusion prevents graph recording: ${label}`, async () => {
        const paths = await launcherGraphFixture(alias, dependencyPath);
        paths.graphs.find(graph => graph.environment === environment).chunks[0].modules.push(paths.launcherId);
        await assert.rejects(site.recordSiteGraph(paths), /Restricted Site graph validation failed/);
        await assert.rejects(readFile(join(paths.workspaceRoot, 'site-graph.json')), { code: 'ENOENT' });
      });

      test(`${category} disk exclusion independently rejects forged graph readback: ${label}`, async () => {
        const paths = await launcherGraphFixture(alias, dependencyPath);
        await site.recordSiteGraph(paths);
        await site.validateSiteGraph(paths.workspaceRoot);
        const graphPath = join(paths.workspaceRoot, 'site-graph.json');
        const evidence = JSON.parse(await readFile(graphPath, 'utf8'));
        // Correct bytes and hash isolate policy enforcement from malformed-record rejection.
        evidence.graphs.find(graph => graph.environment === environment).chunks[0].modules.push({
          kind: 'dependency', ...await fileRecord(paths.dependencyRoot, paths.launcherPath), suffix: '',
        });
        await writeFile(graphPath, JSON.stringify(evidence));
        await assert.rejects(site.validateSiteGraph(paths.workspaceRoot), /Restricted Site graph validation failed/);
      });
    }
  }
}

async function executorDependencyFixture(name) {
  const dependencyPath = `probe-package/app/server/research/${name}.ts`;
  const paths = await fixture({ entryText: entry + `import { sentinel } from '../../node_modules/${dependencyPath}'; console.log(sentinel);` });
  const dependencyRoot = join(paths.sourceRoot, 'node_modules');
  await mkdir(dirname(join(dependencyRoot, dependencyPath)), { recursive: true });
  await writeFile(join(dependencyRoot, dependencyPath), "export const sentinel = 'synthetic-dependency-input';");
  return { ...paths, dependencyRoot, dependencyPath };
}

test('actual esbuild keeps a normal dependency accepted beside fake-provider exclusion', async () => {
  const paths = await executorDependencyFixture('provider');
  const evidence = await builder.buildExecutorArtifacts(paths);
  assert.ok(evidence.inputs.some(record => record.kind === 'dependency' && record.path === paths.dependencyPath));
  assert.match(await readFile(join(paths.executorDirectory, 'index.js'), 'utf8'), /synthetic-dependency-input/);
  assert.deepEqual(await builder.validateExecutorEvidence(paths.workspaceRoot), evidence);
});

test('actual esbuild rejects the fake-provider dependency through the fixed Executor entry', async () => {
  const paths = await executorDependencyFixture('fake-provider');
  await assert.rejects(builder.buildExecutorArtifacts(paths), buildFailure);
  await assert.rejects(readFile(join(paths.workspaceRoot, 'executor-evidence.json')), { code: 'ENOENT' });
});

test('actual esbuild evidence independently rejects a forged fake-provider dependency', async () => {
  const paths = await executorDependencyFixture('provider');
  const evidence = await builder.buildExecutorArtifacts(paths);
  await builder.validateExecutorEvidence(paths.workspaceRoot);
  const fakePath = 'probe-package/app/server/research/fake-provider.ts';
  await writeFile(join(paths.dependencyRoot, fakePath), await readFile(join(paths.dependencyRoot, paths.dependencyPath)));
  const metafilePath = join(paths.workspaceRoot, 'executor-metafile.json');
  const metafile = JSON.parse(await readFile(metafilePath, 'utf8'));
  const originalInput = Object.keys(metafile.inputs).find(path => path.replaceAll('\\', '/').endsWith(paths.dependencyPath));
  assert.ok(originalInput);
  const changedInput = originalInput.replace(/provider\.ts$/u, 'fake-provider.ts');
  metafile.inputs[changedInput] = metafile.inputs[originalInput];
  delete metafile.inputs[originalInput];
  for (const input of Object.values(metafile.inputs)) {
    for (const imported of input.imports) if (imported.path === originalInput) imported.path = changedInput;
  }
  for (const output of Object.values(metafile.outputs)) {
    if (Object.hasOwn(output.inputs, originalInput)) {
      output.inputs[changedInput] = output.inputs[originalInput];
      delete output.inputs[originalInput];
    }
  }
  // Preserve real bytes, sizes and hashes so readback must enforce the path boundary itself.
  evidence.inputs.find(record => record.kind === 'dependency' && record.path === paths.dependencyPath).path = fakePath;
  evidence.inputs.sort((a, b) => `${a.kind}/${a.path}`.localeCompare(`${b.kind}/${b.path}`));
  await writeFile(metafilePath, JSON.stringify(metafile));
  await writeFile(join(paths.workspaceRoot, 'executor-evidence.json'), JSON.stringify(evidence));
  await assert.rejects(builder.validateExecutorEvidence(paths.workspaceRoot), /Restricted Site graph validation failed/);
});

for (const stage of ['inspection', 'independent validation']) {
  for (const identityKind of ['canonical-absolute', 'legitimate-relative', 'absolute-tests-parent', 'absolute-dot', 'relative-tests-parent', 'relative-dot']) {
    test(`Executor identity boundary ${stage}: ${identityKind}`, async () => {
      const dependencyPath = 'probe-package/node_modules/nested/index.js';
      const paths = await fixture({ entryText: entry + `import { sentinel } from '../../node_modules/${dependencyPath}'; console.log(sentinel);` });
      const dependencyRoot = join(paths.sourceRoot, 'node_modules');
      const absolute = join(dependencyRoot, dependencyPath);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, "export const sentinel = 'nested-identity-control';");
      const expected = await builder.buildExecutorArtifacts(paths);
      const relativeId = relative(paths.snapshotRoot, absolute).replaceAll('\\', '/');
      assert.match(relativeId, /^(?:\.\.\/)+source\/node_modules\//u);
      const identities = {
        'canonical-absolute': absolute,
        'legitimate-relative': relativeId,
        'absolute-tests-parent': dirname(absolute) + '/tests/../index.js',
        'absolute-dot': dirname(absolute) + '/./index.js',
        'relative-tests-parent': relativeId.replace(/index\.js$/u, 'tests/../index.js'),
        'relative-dot': relativeId.replace(/index\.js$/u, './index.js'),
      };
      const identity = identities[identityKind];
      const metafilePath = join(paths.workspaceRoot, 'executor-metafile.json');
      const metafile = JSON.parse(await readFile(metafilePath, 'utf8'));
      const original = Object.keys(metafile.inputs).find(path => path.replaceAll('\\', '/').endsWith(dependencyPath));
      assert.ok(original);
      const info = metafile.inputs[original];
      delete metafile.inputs[original];
      metafile.inputs[identity] = info;
      for (const input of Object.values(metafile.inputs)) {
        for (const imported of input.imports) if (imported.path === original) imported.path = identity;
      }
      for (const output of Object.values(metafile.outputs)) {
        if (!Object.hasOwn(output.inputs, original)) continue;
        const contribution = output.inputs[original];
        delete output.inputs[original];
        output.inputs[identity] = contribution;
      }
      // Correct canonical evidence and bytes isolate raw-identity enforcement from stale hashes.
      await writeFile(metafilePath, JSON.stringify(metafile));
      const inspect = () => stage === 'inspection'
        ? builder.inspectExecutorMetafile({ workspaceRoot: paths.workspaceRoot, metafile })
        : builder.validateExecutorEvidence(paths.workspaceRoot);
      if (identityKind === 'canonical-absolute' || identityKind === 'legitimate-relative') assert.deepEqual(await inspect(), expected);
      else await assert.rejects(inspect(), /Restricted (?:Site graph validation|candidate build) failed/);
    });
  }
}

const elidedTypeReferences = [
  { importer: 'worker/research-executor/receipt-store.ts', importerSha256: '7f17eed75c9d96822c85bac727d08b60f4c6acc7e371b56e66139d44f4a0f824',
    specifier: '../../app/server/research/executor/begin', target: 'app/server/research/executor/begin.ts', targetSha256: '5175ac9f63076b1763e51564798f9721584d4cc4168acdcf1c5152fe793c9db4' },
  { importer: 'worker/research-executor/site-client.ts', importerSha256: 'ef1286423fe539498e50b84e3175db46e0351285e5493c22bbb19b244569ca63',
    specifier: '../../app/server/research/executor/http-transport', target: 'app/server/research/executor/http-transport.ts', targetSha256: '6f88088be37988890b166ffa2826a46615ca6f40c97722f6b2251fbe6a8591cc' },
];

async function elidedTypeFixture({ changedPath, renamedImporter, runtimeExternal } = {}) {
  const extraFiles = {};
  const stubExports = new Set();
  for (const reference of elidedTypeReferences) {
    for (const path of [reference.importer, reference.target]) {
      const bytes = await readFile(join(codeRoot, path));
      extraFiles[path] = changedPath === path ? Buffer.concat([bytes, Buffer.from('\n// changed identity')]) : bytes;
      // Use exact inspected files; unrelated runtime dependencies resolve to this local fixture module.
      for (const match of bytes.toString().matchAll(/import\s*\{([^}]+)\}\s*from\s*["'][^"']+["']/gu)) {
        for (const imported of match[1].split(',').map(value => value.trim()).filter(Boolean)) {
          if (!imported.startsWith('type ')) stubExports.add(imported.split(/\s+as\s+/u)[0]);
        }
      }
    }
  }
  if (renamedImporter) extraFiles[renamedImporter.replace(/\.ts$/u, '-copy.ts')] = extraFiles[renamedImporter];
  const knownPaths = [...Object.keys(extraFiles), 'worker/research-executor/workflow-policy.ts'];
  extraFiles['app/bridge-support.ts'] = [...stubExports].sort().map(name => `export const ${name} = {};`).join('\n');
  const imports = elidedTypeReferences.flatMap(reference => [reference.importer === renamedImporter
    ? reference.importer.replace(/\.ts$/u, '-copy.ts') : reference.importer, reference.target]);
  const entryText = imports.map(path => `import ${JSON.stringify(path.startsWith('worker/') ? './' + path.slice('worker/research-executor/'.length) : '../../' + path)};`).join('\n')
    + (runtimeExternal ? `\nimport ${JSON.stringify(runtimeExternal)};` : '') + '\n' + entry;
  const paths = await fixture({ entryText, extraFiles });
  await mkdir(paths.executorDirectory);
  const allowed = new Set(knownPaths.map(path => join(paths.snapshotRoot, path)));
  const result = await esbuildFixture({ absWorkingDir: paths.snapshotRoot, entryPoints: ['worker/research-executor/index.ts'],
    outfile: join(paths.executorDirectory, 'index.js'), bundle: true, platform: 'neutral', format: 'esm', target: 'es2022',
    metafile: true, sourcemap: false, write: true, logLevel: 'silent', plugins: [{ name: 'isolated-type-reference-support', setup(context) {
      context.onResolve({ filter: /.*/ }, args => {
        if (args.kind === 'entry-point') return;
        if (args.path === runtimeExternal) return { path: args.path, external: true };
        const absolute = resolve(args.resolveDir, args.path);
        if (allowed.has(absolute)) return { path: absolute };
        if (allowed.has(absolute + '.ts')) return { path: absolute + '.ts' };
        return { path: join(paths.snapshotRoot, 'app/bridge-support.ts') };
      });
    } }] });
  const dependencyRoot = join(paths.sourceRoot, 'node_modules');
  const inputs = [];
  for (const path of Object.keys(result.metafile.inputs)) inputs.push(await site.describeModule(resolve(paths.snapshotRoot, path), {
    ...paths, dependencyRoot, environment: 'executor', executor: true,
  }));
  const evidence = { schemaVersion: 1, entry: 'worker/research-executor/index.ts', esbuildVersion: fixtureEsbuildVersion,
    inputs: inputs.sort((a, b) => `${a.kind}/${a.path}`.localeCompare(`${b.kind}/${b.path}`)),
    output: await fileRecord(paths.workspaceRoot, 'executor/index.js'), exports: ['ResearchWorkflow', 'default'] };
  await writeJsonExclusive(join(paths.executorDirectory, 'wrangler.json'), { ...createResearchAcceptanceConfigPair(paths.target).executor, main: 'index.js', no_bundle: true });
  await writeJsonExclusive(join(paths.workspaceRoot, 'executor-metafile.json'), result.metafile);
  await writeJsonExclusive(join(paths.workspaceRoot, 'executor-evidence.json'), evidence);
  return { ...paths, metafile: result.metafile, evidence };
}

for (const stage of ['inspection', 'independent validation']) {
  test(`Executor elided type references retain exact actual esbuild metadata during ${stage}`, async () => {
    const paths = await elidedTypeFixture();
    for (const reference of elidedTypeReferences) {
      assert.deepEqual(paths.metafile.inputs[reference.importer].imports.filter(imported => imported.external), [
        { path: reference.specifier, kind: 'import-statement', external: true },
      ]);
      assert.equal(paths.evidence.inputs.find(input => input.path === reference.importer).sha256, reference.importerSha256);
      assert.equal(paths.evidence.inputs.find(input => input.path === reference.target).sha256, reference.targetSha256);
    }
    assert.deepEqual(Object.values(paths.metafile.outputs)[0].imports, []);
    const before = await readFile(join(paths.workspaceRoot, 'executor-metafile.json'));
    const result = stage === 'inspection' ? await builder.inspectExecutorMetafile(paths) : await builder.validateExecutorEvidence(paths.workspaceRoot);
    assert.deepEqual(result, paths.evidence);
    assert.deepEqual(await readFile(join(paths.workspaceRoot, 'executor-metafile.json')), before);
  });
}

test('Executor elided type references reject an actual unreviewed runtime external emitted by esbuild', async () => {
  const runtimeExternal = 'unreviewed:bridge-runtime';
  const paths = await elidedTypeFixture({ runtimeExternal });
  const imported = { path: runtimeExternal, kind: 'import-statement', external: true };
  assert.deepEqual(paths.metafile.inputs['worker/research-executor/index.ts'].imports.filter(item => item.external), [imported]);
  assert.deepEqual(Object.values(paths.metafile.outputs)[0].imports, [imported]);
  for (const reference of elidedTypeReferences) {
    assert.equal(paths.evidence.inputs.find(input => input.path === reference.importer).sha256, reference.importerSha256);
    assert.equal(paths.evidence.inputs.find(input => input.path === reference.target).sha256, reference.targetSha256);
  }
  await assert.rejects(builder.inspectExecutorMetafile(paths), buildFailure);
  await assert.rejects(builder.validateExecutorEvidence(paths.workspaceRoot), buildFailure);
});

for (const reference of elidedTypeReferences) {
  for (const mutation of ['unknown-importer', 'changed-importer', 'changed-target', 'unknown-specifier', 'suffix', 'dynamic-import', 'require-call', 'missing-target', 'runtime-output']) {
    test(`Executor elided type references reject ${mutation} for ${reference.importer} at inspection and readback`, async () => {
      const changedPath = mutation === 'changed-importer' ? reference.importer : mutation === 'changed-target' ? reference.target : undefined;
      const paths = await elidedTypeFixture({ changedPath, renamedImporter: mutation === 'unknown-importer' ? reference.importer : undefined });
      const importerPath = mutation === 'unknown-importer' ? reference.importer.replace(/\.ts$/u, '-copy.ts') : reference.importer;
      const imported = paths.metafile.inputs[importerPath].imports.find(item => item.external && item.path === reference.specifier);
      assert.ok(imported);
      if (changedPath) {
        // The actual rebuild and newly generated source manifest/evidence carry the changed bytes honestly.
        const manifest = JSON.parse(await readFile(paths.sourceManifestPath, 'utf8'));
        const current = await fileRecord(paths.snapshotRoot, changedPath);
        assert.deepEqual(manifest.files.find(file => file.path === changedPath), current);
        assert.equal(paths.metafile.inputs[changedPath].bytes, current.size);
        assert.equal(paths.evidence.inputs.find(file => file.path === changedPath).sha256, current.sha256);
      }
      if (mutation === 'unknown-specifier') imported.path = '../../app/server/research/executor/unrelated';
      if (mutation === 'suffix') imported.path += '?type';
      if (mutation === 'dynamic-import' || mutation === 'require-call') imported.kind = mutation;
      if (mutation === 'missing-target') {
        delete paths.metafile.inputs[reference.target];
        for (const input of Object.values(paths.metafile.inputs)) input.imports = input.imports.filter(item => item.external || item.path !== reference.target);
        for (const output of Object.values(paths.metafile.outputs)) delete output.inputs[reference.target];
        paths.evidence.inputs = paths.evidence.inputs.filter(input => input.path !== reference.target);
      }
      if (mutation === 'runtime-output') Object.values(paths.metafile.outputs)[0].imports.push({ path: reference.specifier, external: true, kind: 'import-statement' });
      await writeFile(join(paths.workspaceRoot, 'executor-metafile.json'), JSON.stringify(paths.metafile));
      await writeFile(join(paths.workspaceRoot, 'executor-evidence.json'), JSON.stringify(paths.evidence));
      await assert.rejects(builder.inspectExecutorMetafile(paths), buildFailure);
      await assert.rejects(builder.validateExecutorEvidence(paths.workspaceRoot), buildFailure);
    });
  }
}

const graphFailure = /Restricted Site graph validation failed/;
const motionPredicate = { path: 'motion-dom/dist/es/value/types/test.mjs', sha256: '5fa9bbd10708872e5fe5e45f9fdb8d0e942d4328ea51e63d2d2400d30c315676' };
const publicSchemas = [
  { path: 'app/server/account-link/contracts.ts', sha256: '11b1858faf10b583f30181f20fc7e27cab184285dbba72c14839f4b98bae15f4' },
  { path: 'app/server/auth/policy.ts', sha256: '0ebe1415acedf0bb625ccf47bc70922d8cb0c4446bc65090321789f0f0f45cca' },
];
const optionalPeer = '__vite-optional-peer-dep:@emotion/is-prop-valid:framer-motion';

async function dependencyFile(paths, path, bytes = 'export const safe = 1;') {
  const filename = join(paths.dependencyRoot, path);
  await mkdir(dirname(filename), { recursive: true });
  await writeFile(filename, bytes);
  return filename;
}

function withAnalysisGraphs(paths) {
  const scans = ['rsc', 'ssr'].map(environment => ({ ...structuredClone(paths.graphs.find(graph => graph.environment === environment)), write: false }));
  paths.graphs = [...scans, ...paths.graphs];
  return paths;
}

test('graph compatibility records and reads nested installed dependency inputs through both roots', async () => {
  const paths = await launcherGraphFixture(false);
  const dependencyPath = 'better-auth/node_modules/@better-auth/core/dist/index.mjs';
  const filename = await dependencyFile(paths, dependencyPath);
  for (const environment of ['client', 'rsc', 'ssr', 'executor']) {
    for (const root of [paths.dependencyRoot, join(paths.snapshotRoot, 'node_modules')]) {
      const record = await site.describeModule(join(root, dependencyPath), { ...paths, environment, executor: environment === 'executor' });
      assert.equal(record.path, dependencyPath);
      assert.equal(record.sha256, await hashRegularFile(filename));
    }
  }
  for (const graph of paths.graphs) graph.chunks[0].modules.push(filename);
  const recorded = await site.recordSiteGraph(paths);
  assert.deepEqual(await site.validateSiteGraph(paths.workspaceRoot), recorded);
});

test('graph compatibility keeps nested forbidden segments, traversal and links refused', async () => {
  const paths = await launcherGraphFixture(false);
  const context = { ...paths, environment: 'client' };
  for (const segment of ['tests', 'smoke', 'fake-provider', 'live-research', 'fixtures', '.hidden', 'output', 'Node_Modules']) {
    const filename = await dependencyFile(paths, `package/node_modules/${segment}/index.js`);
    await assert.rejects(site.describeModule(filename, context));
    await assert.rejects(site.describeModule(filename, { ...context, environment: 'executor', executor: true }));
  }
  const safe = await dependencyFile(paths, 'package/node_modules/nested/index.js');
  const traversed = dirname(safe) + '/unused/../index.js';
  await assert.rejects(site.describeModule(traversed, context));
  await symlink(dirname(safe), join(paths.dependencyRoot, 'package/node_modules/linked'), 'junction');
  await assert.rejects(site.describeModule(join(paths.dependencyRoot, 'package/node_modules/linked/index.js'), context));
});

for (const forbidden of ['tests', 'smoke', 'fake-provider', 'live-research']) {
  test(`graph compatibility independently refuses nested ${forbidden} during recording and readback`, async () => {
    const paths = await launcherGraphFixture(false);
    const path = `package/node_modules/nested/${forbidden}/index.js`;
    const filename = await dependencyFile(paths, path);
    paths.graphs[0].chunks[0].modules.push(filename);
    await assert.rejects(site.recordSiteGraph(paths), graphFailure);
    paths.graphs[0].chunks[0].modules.pop();
    const evidence = await site.recordSiteGraph(paths);
    evidence.graphs[0].chunks[0].modules.push({ kind: 'dependency', ...await fileRecord(paths.dependencyRoot, path), suffix: '' });
    await writeFile(join(paths.workspaceRoot, 'site-graph.json'), JSON.stringify(evidence));
    await assert.rejects(site.validateSiteGraph(paths.workspaceRoot), graphFailure);
  });
}

test('graph compatibility admits only the exact Site motion runtime predicate bytes and identity', async () => {
  const bytes = await readFile(join(codeRoot, 'node_modules', motionPredicate.path));
  const paths = await launcherGraphFixture(false);
  const filename = await dependencyFile(paths, motionPredicate.path, bytes);
  for (const graph of paths.graphs) {
    assert.equal((await site.describeModule(filename, { ...paths, environment: graph.environment })).sha256, motionPredicate.sha256);
    graph.chunks[0].modules.push(filename);
  }
  const evidence = await site.recordSiteGraph(paths);
  assert.deepEqual(await site.validateSiteGraph(paths.workspaceRoot), evidence);
  await assert.rejects(site.describeModule(filename, { ...paths, environment: 'executor', executor: true }), graphFailure);
  for (const path of ['motion-dom/dist/es/value/types/test-copy.mjs', 'other/dist/es/value/types/test.mjs', 'motion-dom/node_modules/nested/test.mjs']) {
    await assert.rejects(site.describeModule(await dependencyFile(paths, path, bytes), { ...paths, environment: 'client' }), graphFailure);
  }
  await assert.rejects(site.describeModule(filename + '?changed', { ...paths, environment: 'client' }), graphFailure);
  await writeFile(filename, Buffer.concat([bytes, Buffer.from('\n// altered')]));
  await assert.rejects(site.describeModule(filename, { ...paths, environment: 'client' }), graphFailure);
  const record = evidence.graphs[0].chunks[0].modules.find(item => item.path === motionPredicate.path);
  Object.assign(record, await fileRecord(paths.dependencyRoot, motionPredicate.path));
  await writeFile(join(paths.workspaceRoot, 'site-graph.json'), JSON.stringify(evidence));
  await assert.rejects(site.validateSiteGraph(paths.workspaceRoot), graphFailure);
});

for (const schema of publicSchemas) {
  test(`graph compatibility pins the exact client schema ${schema.path} at classification and readback`, async () => {
    const bytes = await readFile(join(codeRoot, schema.path));
    const lookalike = schema.path.replace(/\.ts$/u, '-copy.ts');
    const paths = await launcherGraphFixture(false, undefined, { extraFiles: { [schema.path]: bytes, [lookalike]: bytes } });
    const filename = join(paths.snapshotRoot, schema.path);
    const context = { ...paths, environment: 'client' };
    assert.equal((await site.describeModule(filename, context)).sha256, schema.sha256);
    await assert.rejects(site.describeModule(join(paths.snapshotRoot, lookalike), context), graphFailure);
    await assert.rejects(site.describeModule(filename + '?changed', context), graphFailure);
    paths.graphs[0].chunks[0].modules.push(filename);
    const evidence = await site.recordSiteGraph(paths);
    assert.deepEqual(await site.validateSiteGraph(paths.workspaceRoot), evidence);
    const record = evidence.graphs[0].chunks[0].modules.find(item => item.path === schema.path);
    Object.assign(record, await fileRecord(paths.snapshotRoot, lookalike));
    await writeFile(join(paths.workspaceRoot, 'site-graph.json'), JSON.stringify(evidence));
    await assert.rejects(site.validateSiteGraph(paths.workspaceRoot), graphFailure);
    const changed = await fixture({ extraFiles: { [schema.path]: Buffer.concat([bytes, Buffer.from('\n// altered')]) } });
    await assert.rejects(site.describeModule(join(changed.snapshotRoot, schema.path), {
      ...changed, dependencyRoot: join(changed.sourceRoot, 'node_modules'), environment: 'client',
    }), graphFailure);
    // Repin the mutable source manifest too, so readback must enforce the independent exact-byte exception.
    for (const root of [paths.sourceRoot, paths.snapshotRoot]) await writeFile(join(root, schema.path), Buffer.concat([bytes, Buffer.from('\n// altered')]));
    const source = JSON.parse(await readFile(paths.sourceManifestPath, 'utf8'));
    const updated = await fileRecord(paths.snapshotRoot, schema.path);
    Object.assign(source.files.find(item => item.path === schema.path), updated);
    Object.assign(record, updated);
    await writeFile(paths.sourceManifestPath, JSON.stringify(source));
    await writeFile(join(paths.workspaceRoot, 'site-graph.json'), JSON.stringify(evidence));
    await assert.rejects(site.validateSiteGraph(paths.workspaceRoot), graphFailure);
  });
}

test('graph compatibility rejects readAuthPolicy in emitted client bytes even with approved public schema provenance', async () => {
  const schema = publicSchemas[1];
  const paths = await syntheticPair({ analysis: false, extraFiles: { [schema.path]: await readFile(join(codeRoot, schema.path)) } });
  const path = join(paths.workspaceRoot, 'site-graph.json');
  const evidence = JSON.parse(await readFile(path, 'utf8'));
  evidence.graphs.find(graph => graph.environment === 'client').chunks[0].modules.push({ kind: 'source', ...await fileRecord(paths.snapshotRoot, schema.path), suffix: '' });
  await writeFile(path, JSON.stringify(evidence));
  await writeFile(join(paths.snapshotRoot, 'dist/client/assets/app.js'), 'export function readAuthPolicy(env) { return env; }');
  await assert.rejects(checker.sealRestrictedResearchCandidate(paths), checkFailure);
});

test('graph compatibility stores the one exact optional peer identity as Site virtual evidence', async () => {
  const paths = await launcherGraphFixture(false);
  const context = { ...paths, environment: 'client' };
  assert.deepEqual(await site.describeModule(optionalPeer, context), { kind: 'virtual', id: optionalPeer });
  await assert.rejects(site.describeModule(optionalPeer, { ...context, executor: true }), graphFailure);
  for (const graph of paths.graphs) graph.chunks[0].modules.push(optionalPeer);
  const evidence = await site.recordSiteGraph(paths);
  assert.deepEqual(await site.validateSiteGraph(paths.workspaceRoot), evidence);
  for (const id of [optionalPeer + '?raw', optionalPeer + '#suffix', optionalPeer.replace('framer-motion', 'other'),
    optionalPeer.replace('@emotion/is-prop-valid', 'other'), './' + optionalPeer, 'virtual:' + optionalPeer,
    'virtual:' + optionalPeer.replace('peer-dep', 'peer%2ddep'), '\0' + optionalPeer, 'relative.js']) {
    await assert.rejects(site.describeModule(id, context), graphFailure);
    const forged = structuredClone(evidence);
    forged.graphs[0].chunks[0].modules.push({ kind: 'virtual', id });
    await writeFile(join(paths.workspaceRoot, 'site-graph.json'), JSON.stringify(forged));
    await assert.rejects(site.validateSiteGraph(paths.workspaceRoot), graphFailure);
  }
});

test('graph compatibility retains analysis inputs but only final graphs require emitted files', async () => {
  const paths = withAnalysisGraphs(await launcherGraphFixture(false));
  paths.graphs[0].chunks.push({ fileName: 'analysis-only.js', modules: [join(paths.snapshotRoot, 'app/page.tsx')] });
  const evidence = await site.recordSiteGraph(paths);
  assert.deepEqual(evidence.graphs.map(graph => [graph.environment, graph.write]), [
    ['rsc', false], ['ssr', false], ['client', true], ['rsc', true], ['ssr', true],
  ]);
  assert.deepEqual(await site.validateSiteGraph(paths.workspaceRoot), evidence);
  await assert.rejects(readFile(join(paths.snapshotRoot, 'dist/server/analysis-only.js')), { code: 'ENOENT' });
});

for (const mutation of ['missing-write', 'string-write', 'number-write', 'null-write', 'client-analysis', 'missing-final-rsc', 'missing-final-ssr', 'duplicate-emitted', 'too-many-graphs', 'forbidden-analysis-input']) {
  test(`graph compatibility rejects ${mutation} on both recording and independent readback`, async () => {
    const paths = withAnalysisGraphs(await launcherGraphFixture(false));
    const evidence = await site.recordSiteGraph(paths);
    function mutate(graphs, recorded) {
      if (mutation === 'missing-write') delete graphs[0].write;
      if (mutation === 'string-write') graphs[0].write = 'false';
      if (mutation === 'number-write') graphs[0].write = 0;
      if (mutation === 'null-write') graphs[0].write = null;
      if (mutation === 'client-analysis') graphs.find(graph => graph.environment === 'client').write = false;
      if (mutation.startsWith('missing-final-')) graphs.find(graph => graph.write && graph.environment === mutation.slice('missing-final-'.length)).write = false;
      if (mutation === 'duplicate-emitted') graphs.push(structuredClone(graphs.find(graph => graph.write)));
      if (mutation === 'too-many-graphs') while (graphs.length < 21) graphs.push(structuredClone(graphs[0]));
      if (mutation === 'forbidden-analysis-input') graphs[0].chunks[0].modules.push(recorded
        ? { kind: 'virtual', id: '\0virtual:tests/forbidden.js' } : '\0virtual:tests/forbidden.js');
    }
    mutate(paths.graphs, false);
    await unlink(join(paths.workspaceRoot, 'site-graph.json'));
    await assert.rejects(site.recordSiteGraph(paths), graphFailure);
    mutate(evidence.graphs, true);
    await writeFile(join(paths.workspaceRoot, 'site-graph.json'), JSON.stringify(evidence));
    await assert.rejects(site.validateSiteGraph(paths.workspaceRoot), graphFailure);
  });
}

test('graph compatibility captures actual Vite environment write flags across analysis and final passes', async () => {
  const config = `export default { logLevel: 'silent', build: { minify: false, emptyOutDir: false,
    rollupOptions: { input: 'app/page.tsx', output: { entryFileNames: 'index.js' } } },
    environments: { rsc: { consumer: 'server', build: { ssr: true, outDir: 'dist/server' } },
      ssr: { consumer: 'server', build: { ssr: true, outDir: 'dist/server/ssr' } },
      client: { build: { outDir: 'dist/client' } } } };`;
  const paths = await fixture({ extraFiles: { 'vite.config.ts': config, 'app/page.tsx': 'export const page = 1; console.log(page);' } });
  const source = `
    import { createBuilder } from ${JSON.stringify(pathToFileURL(join(codeRoot, 'node_modules/vite/dist/node/index.js')).href)};
    import { createSiteBuildOptions, recordSiteGraph, validateSiteGraph } from ${JSON.stringify(pathToFileURL(join(codeRoot, 'scripts/restricted-site-build-child.mjs')).href)};
    const paths = ${JSON.stringify({ snapshotRoot: paths.snapshotRoot, workspaceRoot: paths.workspaceRoot })};
    const graphs = [];
    const builder = await createBuilder(await createSiteBuildOptions({ ...paths, graphs }));
    for (const [name, write] of [['rsc', false], ['ssr', false], ['rsc', true], ['client', true], ['ssr', true]]) {
      const environment = builder.environments[name]; environment.config.build.write = write;
      await builder.build(environment);
    }
    await recordSiteGraph({ ...paths, graphs });
    const evidence = await validateSiteGraph(paths.workspaceRoot);
    console.log(JSON.stringify(evidence.graphs.map(graph => [graph.environment, graph.write])));
  `;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source], {
    cwd: paths.snapshotRoot, env: createBuildEnvironment(process.env, paths), shell: false, windowsHide: true,
    encoding: 'utf8', timeout: 30000, maxBuffer: 256 * 1024,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), [['rsc', false], ['ssr', false], ['rsc', true], ['client', true], ['ssr', true]]);
});
