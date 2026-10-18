import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { lstatSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseResearchAcceptanceTarget } from '../../build/research-acceptance-target.ts';

const failure = () => new Error('Restricted candidate preparation failed.');
export const PREVIEW_PROVIDER = Object.freeze({
  path: 'app/server/ai/mock-provider.ts',
  sha256: '611e454df7744ca6885474d8ff2ca57b3cf33d020719c99f4840c6fb6ee24f6e',
});
const trees = ['app', 'db', 'public', 'worker/research-executor'];
const singles = ['worker/index.ts', 'worker-configuration.d.ts', 'build/cloudflare-target.ts',
  'build/research-acceptance-target.ts', 'package.json', 'package-lock.json', 'tsconfig.json',
  'vite.config.ts', 'next.config.ts', 'postcss.config.mjs'];
const omitted = new Set(['worker/research-executor/wrangler.local.jsonc', 'app/server/research/fake-provider.ts']);

export function portable(path) { return path.split(sep).join('/'); }
export function inside(parent, child, allowEqual = false) {
  const rel = relative(resolve(parent), resolve(child));
  return (allowEqual || rel !== '') && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
}
export function safeRelative(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || /[\u0000-\u001f:]/u.test(path)
    || isAbsolute(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw failure();
  return path;
}
export function forbiddenPath(path, { dependency = false } = {}) {
  return path.split('/').some(part => part.startsWith('.') || /(?:^|[._-])(?:tests?|fixtures?|mocks?|smoke|live-research|fake-provider)(?:$|[._-])/iu.test(part)
    || /^(?:outputs?|cloud-state|cloudstate)$/iu.test(part)
    || (/^node_modules$/iu.test(part) && !(dependency && part === 'node_modules'))) || /\.map$/iu.test(path);
}
export function allowedSource(path) {
  safeRelative(path);
  if (omitted.has(path) || path === 'worker/research-executor/migrations' || path.startsWith('worker/research-executor/migrations/')) return false;
  if (path !== PREVIEW_PROVIDER.path && forbiddenPath(path)) throw failure();
  return singles.includes(path) || trees.some(tree => path.startsWith(`${tree}/`));
}

// Inspect every existing ancestor; lexical containment alone does not stop junctions.
export async function assertNoLinks(path, allowMissing = false) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  const parts = relative(root, absolute).split(sep).filter(Boolean);
  for (let i = 0; i <= parts.length; i++) {
    if (i) current = join(current, parts[i - 1]);
    let info;
    try { info = await lstat(current); } catch (error) {
      if (allowMissing && error.code === 'ENOENT') return;
      throw failure();
    }
    if (info.isSymbolicLink() || (!info.isDirectory() && (i !== parts.length || !info.isFile()))) throw failure();
  }
}

export async function readRegularFile(path) {
  try {
    await assertNoLinks(path);
    const before = await lstat(path);
    if (!before.isFile()) throw failure();
    const handle = await open(path, 'r');
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.ino !== before.ino || opened.size !== before.size) throw failure();
      const bytes = await handle.readFile();
      const after = await handle.stat();
      await assertNoLinks(path);
      const final = await lstat(path);
      if (after.ino !== final.ino || before.ino !== after.ino || before.size !== after.size
        || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.length !== before.size) throw failure();
      return bytes;
    } finally { await handle.close(); }
  } catch { throw failure(); }
}
export async function hashRegularFile(path) {
  return createHash('sha256').update(await readRegularFile(path)).digest('hex');
}
export async function fileRecord(root, path) {
  safeRelative(path);
  const bytes = await readRegularFile(join(root, path));
  return { path, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
export async function listRegularFiles(directory) {
  try {
    await assertNoLinks(directory);
    if (!(await lstat(directory)).isDirectory()) throw failure();
    const files = [];
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name);
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw failure();
      if (info.isDirectory()) files.push(...await listRegularFiles(path));
      else if (info.isFile()) files.push(path);
      else throw failure();
    }
    return files.sort();
  } catch { throw failure(); }
}
export async function readJson(path) { return JSON.parse((await readRegularFile(path)).toString('utf8')); }
export async function writeJsonExclusive(path, value) {
  await assertNoLinks(path, true);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

export async function collectSourceFiles(root) {
  const selected = [...singles];
  async function visit(directory, prefix) {
    await assertNoLinks(directory);
    if (!(await lstat(directory)).isDirectory()) throw failure();
    for (const name of (await readdir(directory)).sort()) {
      const path = `${prefix}/${name}`;
      const absolute = join(root, path);
      const info = await lstat(absolute);
      if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) throw failure();
      if (!allowedSource(path)) continue;
      if (info.isDirectory()) await visit(absolute, path);
      else selected.push(path);
    }
  }
  for (const tree of trees) await visit(join(root, tree), tree);
  const records = [];
  for (const path of selected.sort()) {
    const record = await fileRecord(root, path);
    if (path === PREVIEW_PROVIDER.path && record.sha256 !== PREVIEW_PROVIDER.sha256) throw failure();
    records.push(record);
  }
  return records;
}

export async function verifyDependencyLink(workspaceRoot, metadata) {
  const sourceRoot = resolve(metadata.sourceRoot);
  const dependencyRoot = join(sourceRoot, 'node_modules');
  if (metadata.dependencyRoot !== dependencyRoot) throw failure();
  await assertNoLinks(dependencyRoot);
  if (!(await lstat(dependencyRoot)).isDirectory()) throw failure();
  const link = join(workspaceRoot, 'snapshot/node_modules');
  await assertNoLinks(dirname(link));
  if (!(await lstat(link)).isSymbolicLink() || await realpath(link) !== await realpath(dependencyRoot)) throw failure();
  return dependencyRoot;
}

async function verifyWorkspaceEntries(workspaceRoot, directory = workspaceRoot) {
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    // verifyDependencyLink separately proves this single junction's exact destination.
    if (path === join(workspaceRoot, 'snapshot/node_modules')) continue;
    const info = await lstat(path);
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw failure();
    if (info.isDirectory()) await verifyWorkspaceEntries(workspaceRoot, path);
  }
}

export async function verifySourceManifest(workspaceRoot) {
  try {
    workspaceRoot = resolve(workspaceRoot);
    const metadata = await readJson(join(workspaceRoot, 'workspace.json'));
    if (metadata.schemaVersion !== 1 || typeof metadata.sourceRoot !== 'string' || !isAbsolute(metadata.sourceRoot)
      || metadata.snapshot !== 'snapshot' || metadata.executor !== 'executor'
      || inside(metadata.sourceRoot, workspaceRoot, true) || inside(workspaceRoot, metadata.sourceRoot, true)) throw failure();
    await verifyDependencyLink(workspaceRoot, metadata);
    await verifyWorkspaceEntries(workspaceRoot);
    const source = await readJson(join(workspaceRoot, 'source-manifest.json'));
    if (source.schemaVersion !== 1 || !Array.isArray(source.files)) throw failure();
    const original = await collectSourceFiles(metadata.sourceRoot);
    const copy = await collectSourceFiles(join(workspaceRoot, 'snapshot'));
    if (!isDeepStrictEqual(source, { schemaVersion: 1, files: original }) || !isDeepStrictEqual(copy, original)) throw failure();
    return { metadata, files: original };
  } catch { throw failure(); }
}

export async function createCandidateWorkspace({ sourceRoot, stagingParent, candidateName, target }) {
  try {
    const inventory = parseResearchAcceptanceTarget(target);
    if (typeof candidateName !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/u.test(candidateName)) throw failure();
    sourceRoot = resolve(sourceRoot);
    stagingParent = resolve(stagingParent);
    if (inside(sourceRoot, stagingParent, true) || inside(stagingParent, sourceRoot, true)) throw failure();
    await assertNoLinks(sourceRoot);
    await assertNoLinks(stagingParent, true);
    const dependencyRoot = join(sourceRoot, 'node_modules');
    await assertNoLinks(dependencyRoot);
    if (!(await lstat(dependencyRoot)).isDirectory()) throw failure();
    await mkdir(stagingParent, { recursive: true });
    await assertNoLinks(stagingParent);
    const workspaceRoot = join(stagingParent, candidateName);
    if (!inside(stagingParent, workspaceRoot)) throw failure();
    await mkdir(workspaceRoot); // Deliberately exclusive; failed candidates remain intact.
    const snapshotRoot = join(workspaceRoot, 'snapshot');
    const executorDirectory = join(workspaceRoot, 'executor');
    const targetPath = join(workspaceRoot, 'target.json');
    const sourceManifestPath = join(workspaceRoot, 'source-manifest.json');
    const sourceFiles = await collectSourceFiles(sourceRoot);
    await mkdir(snapshotRoot);
    for (const tree of trees) await mkdir(join(snapshotRoot, tree), { recursive: true });
    for (const record of sourceFiles) {
      const destination = join(snapshotRoot, record.path);
      await assertNoLinks(dirname(destination), true);
      await mkdir(dirname(destination), { recursive: true });
      const bytes = await readRegularFile(join(sourceRoot, record.path));
      if (createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw failure();
      await writeFile(destination, bytes, { flag: 'wx' });
      if (await hashRegularFile(destination) !== record.sha256) throw failure();
    }
    await symlink(dependencyRoot, join(snapshotRoot, 'node_modules'), 'junction');
    await writeJsonExclusive(targetPath, inventory);
    await writeJsonExclusive(sourceManifestPath, { schemaVersion: 1, files: sourceFiles });
    await writeJsonExclusive(join(workspaceRoot, 'workspace.json'), {
      schemaVersion: 1, sourceRoot, dependencyRoot, snapshot: 'snapshot', executor: 'executor',
    });
    await verifySourceManifest(workspaceRoot);
    return { workspaceRoot, snapshotRoot, targetPath, executorDirectory, sourceManifestPath };
  } catch { throw failure(); }
}

export function createBuildEnvironment(parentEnvironment, { workspaceRoot, targetPath }) {
  try {
    workspaceRoot = resolve(workspaceRoot);
    if (resolve(targetPath) !== join(workspaceRoot, 'target.json')) throw failure();
    const root = parse(workspaceRoot).root;
    let path = root;
    for (const part of relative(root, workspaceRoot).split(sep)) {
      path = join(path, part);
      const info = lstatSync(path);
      if (!info.isDirectory() || info.isSymbolicLink()) throw failure();
    }
    const environment = {};
    const allowed = new Map(['SystemRoot', 'WINDIR', 'ComSpec', 'PATH', 'PATHEXT', 'SYSTEMDRIVE',
      'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'PROCESSOR_LEVEL', 'PROCESSOR_REVISION', 'NUMBER_OF_PROCESSORS']
      .map(name => [name.toLowerCase(), name]));
    for (const name of Object.keys(parentEnvironment)) {
      const canonical = allowed.get(name.toLowerCase());
      if (canonical) {
        const value = parentEnvironment[name];
        if (typeof value !== 'string' || Object.hasOwn(environment, canonical)) throw failure();
        environment[canonical] = value;
      }
    }
    const runtime = join(workspaceRoot, 'runtime');
    mkdirSync(runtime);
    for (const name of ['TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME']) {
      environment[name] = join(runtime, name.toLowerCase());
      mkdirSync(environment[name]);
    }
    for (const [name, suffix] of [['WRANGLER_LOG_PATH', 'wrangler-logs'], ['MINIFLARE_REGISTRY_PATH', 'registry']]) {
      environment[name] = join(runtime, suffix);
      mkdirSync(environment[name]);
    }
    Object.assign(environment, { NODE_ENV: 'production', ARC_CLOUDFLARE_TARGET: resolve(targetPath),
      WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' });
    return environment;
  } catch { throw failure(); }
}
