import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { allowedSource, fileRecord, forbiddenPath, inside, portable, PREVIEW_PROVIDER, readJson, readRegularFile,
  safeRelative, verifyDependencyLink, verifySourceManifest, writeJsonExclusive } from './lib/restricted-candidate-files.mjs';

const codeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failure = () => new Error('Restricted Site graph validation failed.');
const graphForbidden = /(?:^|[\/.:_?=&-])(?:tests?|fixtures?|mocks?|smoke|live-research|fake-provider)(?:$|[\/.:_?=&-])/iu;
const siteEnvironments = ['client', 'rsc', 'ssr'];
const optionalPeer = '__vite-optional-peer-dep:@emotion/is-prop-valid:framer-motion';
const motionPredicate = { path: 'motion-dom/dist/es/value/types/test.mjs', sha256: '5fa9bbd10708872e5fe5e45f9fdb8d0e942d4328ea51e63d2d2400d30c315676' };
const clientSchemas = new Map([
  ['app/server/account-link/contracts.ts', '11b1858faf10b583f30181f20fc7e27cab184285dbba72c14839f4b98bae15f4'],
  ['app/server/auth/policy.ts', '0ebe1415acedf0bb625ccf47bc70922d8cb0c4446bc65090321789f0f0f45cca'],
]);

export async function siteToolVersions() {
  const versions = {};
  for (const name of ['vite', 'vinext', '@cloudflare/vite-plugin']) {
    versions[name] = (await readJson(join(codeRoot, 'node_modules', name, 'package.json'))).version;
  }
  return versions;
}

function siteConfigEntrySource(workspaceRoot) {
  return `import configuration from ${JSON.stringify(pathToFileURL(join(workspaceRoot, 'snapshot/vite.config.ts')).href)};\n`
    + 'export default await (typeof configuration === "function" ? configuration({ command: "build", mode: "production" }) : configuration);\n';
}

export async function validateSiteConfigEntry(workspaceRoot) {
  workspaceRoot = resolve(workspaceRoot);
  const path = join(workspaceRoot, 'site-config-entry.mjs');
  if ((await readRegularFile(path)).toString('utf8') !== siteConfigEntrySource(workspaceRoot)) throw failure();
  return await fileRecord(workspaceRoot, 'site-config-entry.mjs');
}

export async function createSiteBuildOptions({ snapshotRoot, workspaceRoot, graphs }) {
  try {
    snapshotRoot = resolve(snapshotRoot);
    workspaceRoot = resolve(workspaceRoot);
    if (snapshotRoot !== join(workspaceRoot, 'snapshot') || resolve(process.cwd()) !== snapshotRoot) throw failure();
    await verifySourceManifest(workspaceRoot);
    const entry = join(workspaceRoot, 'site-config-entry.mjs');
    await writeFile(entry, siteConfigEntrySource(workspaceRoot), { flag: 'wx' });
    const { runnerImport, mergeConfig } = await import('vite');
    // Await the async factory inside the runner lifetime, before runnerImport closes it.
    const { module } = await runnerImport(entry, { root: snapshotRoot, envDir: false });
    const configuration = module.default;
    if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) throw failure();
    await validateSiteConfigEntry(workspaceRoot);
    await verifySourceManifest(workspaceRoot);
    return mergeConfig(configuration, {
      root: snapshotRoot, configFile: false, configLoader: 'runner', envDir: false, mode: 'production',
      cacheDir: join(workspaceRoot, 'cache/vite'),
      plugins: [{
        name: 'arc-restricted-build-input-graph',
        generateBundle(options, bundle) {
          graphs.push({ environment: this.environment.name, write: this.environment.config.build.write,
            directory: resolve(options.dir ?? dirname(options.file)),
            chunks: Object.values(bundle).filter(item => item.type === 'chunk').map(item => ({
              fileName: item.fileName, modules: Object.keys(item.modules).sort(),
            })).sort((a, b) => a.fileName.localeCompare(b.fileName)) });
        },
      }],
    });
  } catch { throw new Error('Restricted Site configuration failed.'); }
}

function canonicalVirtual(id, snapshotRoot, dependencyRoot) {
  if (id === optionalPeer) return id;
  if (typeof id !== 'string' || id.includes('__vite-optional-peer-dep')) throw failure();
  if (id.length > 8192 || !/^(?:\0|virtual:)/u.test(id)) throw failure();
  let normalized = id.replaceAll('\\', '/');
  for (let i = 0; i < 2; i++) {
    try { normalized = decodeURIComponent(normalized); } catch { throw failure(); }
  }
  normalized = normalized.replaceAll('\\', '/');
  if (normalized.includes('__vite-optional-peer-dep')) throw failure();
  for (const [root, replacement] of [[join(snapshotRoot, 'node_modules'), '@dependency'], [dependencyRoot, '@dependency'], [snapshotRoot, '@source']]) {
    normalized = normalized.split(`${portable(root)}/`).join(`${replacement}/`);
  }
  if (/[A-Za-z]:[\/]|file:\/\/|(?:^|[=?&])\//u.test(normalized) || normalized.startsWith('\0/')
    || normalized.includes('..') || graphForbidden.test(normalized) || /(?:^|[\/])\.env|\.dev\.vars|\.openai/iu.test(normalized)) throw failure();
  for (const match of normalized.matchAll(/@source\/([^?&#,;\s\0]+)/gu)) {
    if (!allowedSource(match[1])) throw failure();
  }
  return normalized;
}

export async function describeModule(id, { snapshotRoot, dependencyRoot, environment, executor = false }) {
  if (typeof id !== 'string' || !id || id.length > 8192) throw failure();
  if (id === optionalPeer || id.startsWith('\0') || id.startsWith('virtual:')) {
    if (executor || !siteEnvironments.includes(environment)) throw failure();
    return { kind: 'virtual', id: canonicalVirtual(id, snapshotRoot, dependencyRoot) };
  }
  const split = id.search(/[?#]/u);
  const filename = split < 0 ? id : id.slice(0, split);
  const rawSuffix = split < 0 ? '' : id.slice(split);
  const suffix = rawSuffix ? canonicalVirtual(`\0virtual:module${rawSuffix}`, snapshotRoot, dependencyRoot).slice('\0virtual:module'.length) : '';
  if (!isAbsolute(filename)) throw failure();
  const absolute = resolve(filename);
  const linkedDependencies = join(snapshotRoot, 'node_modules');
  let root, path, kind;
  if (inside(linkedDependencies, absolute)) {
    root = dependencyRoot; path = portable(relative(linkedDependencies, absolute)); kind = 'dependency';
  } else if (inside(dependencyRoot, absolute)) {
    root = dependencyRoot; path = portable(relative(dependencyRoot, absolute)); kind = 'dependency';
  } else if (inside(snapshotRoot, absolute)) {
    root = snapshotRoot; path = portable(relative(snapshotRoot, absolute)); kind = 'source';
    if (!allowedSource(path)) throw failure();
  } else throw failure();
  // Inspect the original dependency ID so normalization cannot erase traversal or forbidden ancestors.
  if (kind === 'dependency' && filename.split(/[\\/]/u).some(part => part === '.' || part === '..')) throw failure();
  safeRelative(path);
  // These production identities were inspected and pinned; no directory-wide test/server exemption.
  const motionRuntime = kind === 'dependency' && path === motionPredicate.path && !suffix
    && !executor && siteEnvironments.includes(environment);
  if (path !== PREVIEW_PROVIDER.path && !motionRuntime && forbiddenPath(path, { dependency: kind === 'dependency' })) throw failure();
  if (path === PREVIEW_PROVIDER.path && (executor || environment === 'client')) throw failure();
  const record = await fileRecord(root, path);
  if (motionRuntime && record.sha256 !== motionPredicate.sha256) throw failure();
  if (kind === 'source' && environment === 'client' && path.startsWith('app/server/')
    && (executor || suffix || clientSchemas.get(path) !== record.sha256)) throw failure();
  if (path === PREVIEW_PROVIDER.path && record.sha256 !== PREVIEW_PROVIDER.sha256) throw failure();
  if (suffix && (suffix.length > 4096 || /[\u0000-\u001f]/u.test(suffix) || graphForbidden.test(suffix))) throw failure();
  return { kind, ...record, suffix };
}

function graphDirectory(snapshotRoot, environment, directory) {
  const absolute = resolve(directory);
  const required = join(snapshotRoot, environment === 'client' ? 'dist/client' : 'dist/server');
  if (!inside(required, absolute, true)) throw failure();
  return portable(relative(snapshotRoot, absolute));
}

function validateGraphShape(graph) {
  if (!graph || !siteEnvironments.includes(graph.environment) || typeof graph.write !== 'boolean'
    || (!graph.write && graph.environment === 'client') || !Array.isArray(graph.chunks) || !graph.chunks.length) throw failure();
}

export async function recordSiteGraph({ workspaceRoot, graphs }) {
  const { metadata } = await verifySourceManifest(workspaceRoot);
  const snapshotRoot = join(workspaceRoot, 'snapshot');
  const dependencyRoot = await verifyDependencyLink(workspaceRoot, metadata);
  if (!Array.isArray(graphs) || graphs.length < 3 || graphs.length > 20) throw failure();
  const records = [];
  const emitted = new Set();
  for (const graph of graphs) {
    validateGraphShape(graph);
    const directory = graphDirectory(snapshotRoot, graph.environment, graph.directory);
    const chunks = [];
    for (const chunk of graph.chunks) {
      safeRelative(chunk.fileName);
      if (graph.write) {
        const outputPath = `${directory}/${chunk.fileName}`;
        if (emitted.has(outputPath)) throw failure();
        emitted.add(outputPath);
      }
      if (!Array.isArray(chunk.modules) || !chunk.modules.length || chunk.modules.length > 100000) throw failure();
      const modules = [];
      for (const id of [...chunk.modules].sort()) modules.push(await describeModule(id, { snapshotRoot, dependencyRoot, environment: graph.environment }));
      chunks.push({ fileName: chunk.fileName, modules });
    }
    records.push({ environment: graph.environment, write: graph.write, directory,
      chunks: chunks.sort((a, b) => a.fileName.localeCompare(b.fileName)) });
  }
  if (new Set(records.filter(graph => graph.write).map(graph => graph.environment)).size !== 3) throw failure();
  const result = { schemaVersion: 1, versions: await siteToolVersions(), graphs: records };
  await writeJsonExclusive(join(workspaceRoot, 'site-graph.json'), result);
  return result;
}

export async function validateSiteGraph(workspaceRoot) {
  const { metadata, files } = await verifySourceManifest(workspaceRoot);
  const sourcePaths = new Set(files.map(record => record.path));
  const snapshotRoot = join(workspaceRoot, 'snapshot');
  const dependencyRoot = await verifyDependencyLink(workspaceRoot, metadata);
  const evidence = await readJson(join(workspaceRoot, 'site-graph.json'));
  if (evidence.schemaVersion !== 1 || !isDeepStrictEqual(evidence.versions, await siteToolVersions())
    || !Array.isArray(evidence.graphs) || evidence.graphs.length < 3 || evidence.graphs.length > 20) throw failure();
  const environments = new Set();
  const emitted = new Set();
  for (const graph of evidence.graphs) {
    validateGraphShape(graph);
    if (graph.write) environments.add(graph.environment);
    safeRelative(graph.directory);
    if (graphDirectory(snapshotRoot, graph.environment, join(snapshotRoot, graph.directory)) !== graph.directory) throw failure();
    for (const chunk of graph.chunks) {
      safeRelative(chunk.fileName);
      if (graph.write) {
        const outputPath = `${graph.directory}/${chunk.fileName}`;
        if (emitted.has(outputPath)) throw failure();
        emitted.add(outputPath);
        if (!(await fileRecord(snapshotRoot, outputPath)).size) throw failure();
      }
      if (!Array.isArray(chunk.modules) || !chunk.modules.length || chunk.modules.length > 100000) throw failure();
      for (const record of chunk.modules) {
        if (record.kind === 'virtual') {
          if (!isDeepStrictEqual(record, { kind: 'virtual', id: canonicalVirtual(record.id, snapshotRoot, dependencyRoot) })) throw failure();
        } else {
          if (!['source', 'dependency'].includes(record.kind)) throw failure();
          safeRelative(record.path);
          if (record.kind === 'source' && !sourcePaths.has(record.path)) throw failure();
          const root = record.kind === 'source' ? snapshotRoot : dependencyRoot;
          const expected = await describeModule(join(root, record.path) + record.suffix, { snapshotRoot, dependencyRoot, environment: graph.environment });
          if (!isDeepStrictEqual(record, expected)) throw failure();
        }
      }
    }
  }
  if (environments.size !== 3) throw failure();
  return evidence;
}

async function main() {
  try {
    if (process.argv.length !== 2) throw failure();
    const snapshotRoot = resolve(process.cwd());
    const workspaceRoot = dirname(snapshotRoot);
    if (snapshotRoot !== join(workspaceRoot, 'snapshot') || process.env.ARC_CLOUDFLARE_TARGET !== join(workspaceRoot, 'target.json')) throw failure();
    await verifySourceManifest(workspaceRoot);
    const graphs = [];
    const { createBuilder } = await import('vite');
    await (await createBuilder(await createSiteBuildOptions({ snapshotRoot, workspaceRoot, graphs }))).buildApp();
    await recordSiteGraph({ workspaceRoot, graphs });
    await verifySourceManifest(workspaceRoot);
    console.log('Restricted Site build completed locally.');
  } catch {
    console.error('Restricted Site build failed.');
    process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
