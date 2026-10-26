import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { build, version as esbuildVersion } from 'esbuild';
import { createResearchAcceptanceConfigPair, parseResearchAcceptanceTarget } from '../build/research-acceptance-target.ts';
import { assertNoLinks, createBuildEnvironment, createCandidateWorkspace, fileRecord, hashRegularFile,
  listRegularFiles, readJson, readRegularFile, verifySourceManifest, writeJsonExclusive } from './lib/restricted-candidate-files.mjs';
import { describeModule, siteToolVersions } from './restricted-site-build-child.mjs';
import { sealRestrictedResearchCandidate, checkRestrictedResearchCandidate } from './check-restricted-research-candidate.mjs';

const codeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stagingParent = join(dirname(codeRoot), 'restricted-research-candidates');
const entry = 'worker/research-executor/index.ts';
const policyPath = 'worker/research-executor/workflow-policy.ts';
const policySha256 = '81464e2661d154a18108df30c20d036356a94c4eb0d6c135e424e9289de8b0e1';
const failure = () => new Error('Restricted candidate build failed.');
const forbiddenExecutor = [
  /(^|\/)app\/server\/http\//u,
  /(^|\/)app\/server\/(?:auth|session|oauth)(?:\/|\.|-)/iu,
  /(^|\/)app\/server\/(?:cloud|proof|planning)(?:\/|\.|-)/u,
  /(?:^|\/)(?:d1-publication|d1-site-import-publication|publication)(?:\.|\/)/u,
  /(^|\/)scripts\/live-research\//u,
];
const elidedTypeReferences = [
  { importer: 'worker/research-executor/receipt-store.ts', importerSha256: '7f17eed75c9d96822c85bac727d08b60f4c6acc7e371b56e66139d44f4a0f824',
    specifier: '../../app/server/research/executor/begin', target: 'app/server/research/executor/begin.ts', targetSha256: '5175ac9f63076b1763e51564798f9721584d4cc4168acdcf1c5152fe793c9db4' },
  { importer: 'worker/research-executor/site-client.ts', importerSha256: 'ef1286423fe539498e50b84e3175db46e0351285e5493c22bbb19b244569ca63',
    specifier: '../../app/server/research/executor/http-transport', target: 'app/server/research/executor/http-transport.ts', targetSha256: '6f88088be37988890b166ffa2826a46615ca6f40c97722f6b2251fbe6a8591cc' },
];

function inspectedElidedTypeReference(record, imported, sourceFiles, inputs) {
  if (record.kind !== 'source' || record.suffix !== '' || imported.external !== true || imported.kind !== 'import-statement') return false;
  const reference = elidedTypeReferences.find(item => item.importer === record.path
    && item.importerSha256 === record.sha256 && item.specifier === imported.path);
  return Boolean(reference
    && sourceFiles.some(file => file.path === reference.target && file.sha256 === reference.targetSha256)
    && inputs.some(input => input.kind === 'source' && input.path === reference.target
      && input.suffix === '' && input.sha256 === reference.targetSha256));
}

function executorPaths(snapshotRoot, executorDirectory) {
  snapshotRoot = resolve(snapshotRoot);
  executorDirectory = resolve(executorDirectory);
  const workspaceRoot = dirname(snapshotRoot);
  if (snapshotRoot !== join(workspaceRoot, 'snapshot') || executorDirectory !== join(workspaceRoot, 'executor')) throw failure();
  return { snapshotRoot, executorDirectory, workspaceRoot };
}
async function executorInput(path, snapshotRoot, dependencyRoot) {
  let absolute = path; // Preserve raw absolute identities for describeModule's dependency guard.
  if (!isAbsolute(path)) {
    const parts = path.split(/[\\/]/u);
    let leadingParents = 0;
    while (parts[leadingParents] === '..') leadingParents++;
    // esbuild needs leading parents to reach installed dependencies, but no embedded dot aliases.
    if (parts.slice(leadingParents).some(part => part === '.' || part === '..')) throw failure();
    absolute = resolve(snapshotRoot, path);
  }
  const record = await describeModule(absolute, { snapshotRoot, dependencyRoot, environment: 'executor', executor: true });
  if (forbiddenExecutor.some(pattern => pattern.test(record.path))) throw failure();
  return record;
}

export async function inspectExecutorMetafile({ workspaceRoot, metafile }) {
  const snapshotRoot = join(workspaceRoot, 'snapshot');
  const executorDirectory = join(workspaceRoot, 'executor');
  const { metadata, files } = await verifySourceManifest(workspaceRoot);
  const sourcePaths = new Set(files.map(record => record.path));
  if (!metafile || !metafile.inputs || !metafile.outputs || Object.keys(metafile.inputs).length > 10000) throw failure();
  const outputs = Object.entries(metafile.outputs);
  if (outputs.length !== 1) throw failure();
  const [name, output] = outputs[0];
  if (resolve(snapshotRoot, name) !== join(executorDirectory, 'index.js') || output.entryPoint !== entry
    || !isDeepStrictEqual(output.exports, ['ResearchWorkflow', 'default'])) throw failure();
  const inputs = [];
  const inputImports = [];
  for (const [path, info] of Object.entries(metafile.inputs).sort(([a], [b]) => a.localeCompare(b))) {
    const record = await executorInput(path, snapshotRoot, metadata.dependencyRoot);
    if (record.kind === 'source' && !sourcePaths.has(record.path)) throw failure();
    if (info.bytes !== record.size || !Array.isArray(info.imports)) throw failure();
    inputs.push(record);
    inputImports.push({ record, imports: info.imports });
  }
  // Validate all actual input identities before recognizing either pinned, elided type reference.
  for (const { record, imports } of inputImports) {
    for (const imported of imports) {
      if (imported.external && !/^cloudflare:[a-z0-9_-]+$/u.test(imported.path)
        && !inspectedElidedTypeReference(record, imported, files, inputs)) throw failure();
      if (!imported.external && !Object.hasOwn(metafile.inputs, imported.path)) throw failure();
    }
  }
  if (!inputs.some(record => record.kind === 'source' && record.path === policyPath && record.sha256 === policySha256)) throw failure();
  if (!Array.isArray(output.imports) || output.imports.some(imported => !imported.external || !/^cloudflare:[a-z0-9_-]+$/u.test(imported.path))) throw failure();
  if (!output.inputs || Object.keys(output.inputs).some(path => !Object.hasOwn(metafile.inputs, path))) throw failure();
  const bundle = await readRegularFile(join(executorDirectory, 'index.js'));
  if (output.bytes !== bundle.length || !bundle.toString().includes('timeout: "21 minutes"') || !bundle.toString().includes('limit: 0')) throw failure();
  return { schemaVersion: 1, entry, esbuildVersion, inputs: inputs.sort((a, b) => `${a.kind}/${a.path}`.localeCompare(`${b.kind}/${b.path}`)),
    output: await fileRecord(workspaceRoot, 'executor/index.js'), exports: output.exports };
}

export async function buildExecutorArtifacts({ snapshotRoot, executorDirectory, target }) {
  try {
    const inventory = parseResearchAcceptanceTarget(target);
    const paths = executorPaths(snapshotRoot, executorDirectory);
    ({ snapshotRoot, executorDirectory } = paths);
    const { metadata } = await verifySourceManifest(paths.workspaceRoot);
    if (!isDeepStrictEqual(inventory, await readJson(join(paths.workspaceRoot, 'target.json')))) throw failure();
    if (await hashRegularFile(join(snapshotRoot, policyPath)) !== policySha256) throw failure();
    await assertNoLinks(executorDirectory, true);
    await mkdir(executorDirectory);
    const result = await build({
      absWorkingDir: snapshotRoot, entryPoints: [entry], outfile: join(executorDirectory, 'index.js'),
      bundle: true, platform: 'neutral', format: 'esm', target: 'es2022', external: ['cloudflare:*'],
      metafile: true, sourcemap: false, write: true, logLevel: 'silent',
      plugins: [{ name: 'arc-restricted-executor-input-boundary', setup(context) {
        context.onLoad({ filter: /.*/ }, async ({ path }) => {
          await executorInput(path, snapshotRoot, metadata.dependencyRoot);
          return undefined;
        });
      } }],
    });
    const evidence = await inspectExecutorMetafile({ workspaceRoot: paths.workspaceRoot, metafile: result.metafile });
    if (!isDeepStrictEqual(await listRegularFiles(executorDirectory), [join(executorDirectory, 'index.js')])) throw failure();
    await writeJsonExclusive(join(executorDirectory, 'wrangler.json'), {
      ...createResearchAcceptanceConfigPair(inventory).executor, main: 'index.js', no_bundle: true,
    });
    await writeJsonExclusive(join(paths.workspaceRoot, 'executor-metafile.json'), result.metafile);
    await writeJsonExclusive(join(paths.workspaceRoot, 'executor-evidence.json'), evidence);
    await verifySourceManifest(paths.workspaceRoot);
    return evidence;
  } catch { throw failure(); }
}

export async function validateExecutorEvidence(workspaceRoot) {
  const target = parseResearchAcceptanceTarget(await readJson(join(workspaceRoot, 'target.json')));
  const expected = { ...createResearchAcceptanceConfigPair(target).executor, main: 'index.js', no_bundle: true };
  if (!isDeepStrictEqual(await readJson(join(workspaceRoot, 'executor/wrangler.json')), expected)) throw failure();
  const actual = await inspectExecutorMetafile({ workspaceRoot, metafile: await readJson(join(workspaceRoot, 'executor-metafile.json')) });
  if (!isDeepStrictEqual(actual, await readJson(join(workspaceRoot, 'executor-evidence.json')))) throw failure();
  return actual;
}

export async function expectedBuildManifest() {
  return { schemaVersion: 1, complete: true, nodeVersion: process.versions.node, esbuildVersion, siteVersions: await siteToolVersions() };
}
export async function writeBuildManifest(workspaceRoot) {
  await writeJsonExclusive(join(workspaceRoot, 'build-manifest.json'), await expectedBuildManifest());
}

// Only this expensive boundary is injectable by native tests; the public builder exposes no overrides.
export async function runSiteBuildChild(paths, launch = spawn) {
  const environment = createBuildEnvironment(process.env, paths);
  const limit = 1024 * 1024;
  const stdout = [], stderr = [];
  let stdoutSize = 0, stderrSize = 0;
  const status = { code: null, signal: null, timedOut: false, truncated: false, spawnError: false, terminationConfirmed: false };
  await new Promise(resolveDone => {
    let child, timer, terminationTimer, finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); clearTimeout(terminationTimer); resolveDone();
    };
    try {
      child = launch(process.execPath, ['--experimental-strip-types', join(codeRoot, 'scripts/restricted-site-build-child.mjs')], {
        cwd: paths.snapshotRoot, env: environment, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      const capture = (parts, current, chunk) => {
        const bytes = Buffer.from(chunk);
        if (current + bytes.length > limit) status.truncated = true;
        if (current < limit) parts.push(bytes.subarray(0, limit - current));
        return current + bytes.length;
      };
      child.stdout.on('data', chunk => { stdoutSize = capture(stdout, stdoutSize, chunk); });
      child.stderr.on('data', chunk => { stderrSize = capture(stderr, stderrSize, chunk); });
      child.on('error', () => { status.spawnError = true; });
      child.on('close', (code, signal) => {
        status.code = code; status.signal = signal; status.terminationConfirmed = true; finish();
      });
      timer = setTimeout(() => {
        status.timedOut = true;
        terminationTimer = setTimeout(finish, 5000);
        try { child.kill('SIGKILL'); } catch { /* Acceptance still fails. */ }
      }, 10 * 60 * 1000);
    } catch { status.spawnError = true; finish(); }
  });
  await writeFile(join(paths.workspaceRoot, 'site-build.stdout.log'), Buffer.concat(stdout), { flag: 'wx' });
  await writeFile(join(paths.workspaceRoot, 'site-build.stderr.log'), Buffer.concat(stderr), { flag: 'wx' });
  await writeJsonExclusive(join(paths.workspaceRoot, 'site-exit.json'), status);
  if (!isDeepStrictEqual(status, { code: 0, signal: null, timedOut: false, truncated: false, spawnError: false, terminationConfirmed: true })) throw failure();
  return status;
}

export async function buildRestrictedResearchCandidate({ targetPath, candidateName }) {
  try {
    const target = parseResearchAcceptanceTarget(await readJson(resolve(targetPath)));
    const paths = await createCandidateWorkspace({ sourceRoot: codeRoot, stagingParent, candidateName, target });
    await runSiteBuildChild(paths);
    await verifySourceManifest(paths.workspaceRoot);
    await buildExecutorArtifacts({ ...paths, target });
    await writeBuildManifest(paths.workspaceRoot);
    await sealRestrictedResearchCandidate(paths);
    return await checkRestrictedResearchCandidate(paths);
  } catch { throw failure(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw failure();
    await buildRestrictedResearchCandidate({ targetPath: process.argv[2], candidateName: process.argv[3] });
    console.log('Restricted Research candidate built and checked locally. No deployment performed.');
  } catch {
    console.error('Restricted candidate build failed. Supply a valid target inventory and a new candidate name.');
    process.exitCode = 1;
  }
}
