import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseResearchAcceptanceTarget } from '../build/research-acceptance-target.ts';
import { checkCloudflareBuild } from './check-cloudflare-build.mjs';
import { expectedBuildManifest, validateExecutorEvidence } from './build-restricted-research-candidate.mjs';
import { validateSiteConfigEntry, validateSiteGraph } from './restricted-site-build-child.mjs';
import { assertNoLinks, fileRecord, listRegularFiles, portable, readJson, readRegularFile,
  safeRelative, verifySourceManifest, writeJsonExclusive } from './lib/restricted-candidate-files.mjs';

const failure = () => new Error('Restricted candidate check failed.');
const provenanceNames = ['workspace.json', 'source-manifest.json', 'target.json', 'site-graph.json',
  'executor-metafile.json', 'executor-evidence.json', 'site-build.stdout.log', 'site-build.stderr.log',
  'site-exit.json', 'build-manifest.json', 'site-config-entry.mjs'].sort();
const successfulExit = { code: 0, signal: null, timedOut: false, truncated: false, spawnError: false, terminationConfirmed: true };
const clientForbidden = /OPENROUTER_API_KEY|BETTER_AUTH_SECRET|GOOGLE_CLIENT_SECRET|GITHUB_CLIENT_SECRET|(?:SITE_TO_EXECUTOR|EXECUTOR_TO_SITE)_SECRET_HEX|readRuntimeEnvironment|readResearchBridgeConnection|readAuthPolicy/u;
const evidenceFile = /(?:^|\/)(?:workspace|target|source-manifest|site-graph|executor-metafile|executor-evidence|site-exit|build-manifest|artifact-manifest|research-acceptance|cloudflare-target)\.json$|\.(?:log|lock|lockb)$|(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|site-config-entry\.mjs)$/iu;

function allowedArtifact(path, group) {
  safeRelative(path);
  if (evidenceFile.test(path) || /(?:^|[\/._-])(?:tests?|fixtures?|mocks?|smoke)(?:$|[\/._-])/iu.test(path) || /\.map$/iu.test(path)
    || /(?:^|\/)(?:node_modules|outputs?|cloud-state|cloudstate|package-lock\.json|target\.json)(?:\/|$)/iu.test(path)) throw failure();
  for (const part of path.split('/')) {
    if (!part.startsWith('.')) continue;
    if (path === '.vite/manifest.json' && group !== 'executor') continue;
    if (path === '.assetsignore' && group === 'client') continue;
    throw failure();
  }
}

async function inspectCandidate(workspaceRoot) {
  workspaceRoot = resolve(workspaceRoot);
  await assertNoLinks(workspaceRoot);
  await verifySourceManifest(workspaceRoot);
  await validateSiteConfigEntry(workspaceRoot);
  const targetPath = join(workspaceRoot, 'target.json');
  const target = parseResearchAcceptanceTarget(await readJson(targetPath));
  const snapshotRoot = join(workspaceRoot, 'snapshot');
  if (!isDeepStrictEqual(await readJson(join(workspaceRoot, 'site-exit.json')), successfulExit)
    || !isDeepStrictEqual(await readJson(join(workspaceRoot, 'build-manifest.json')), await expectedBuildManifest())) throw failure();
  await checkCloudflareBuild({ rootDirectory: snapshotRoot, targetPath });
  await validateExecutorEvidence(workspaceRoot);
  await validateSiteGraph(workspaceRoot);
  const artifacts = [];
  for (const [group, directory] of [['server', join(snapshotRoot, 'dist/server')], ['client', join(snapshotRoot, 'dist/client')], ['executor', join(workspaceRoot, 'executor')]]) {
    const files = await listRegularFiles(directory);
    if (!files.length) throw failure();
    if (group === 'executor' && !isDeepStrictEqual(files.map(path => portable(relative(directory, path))), ['index.js', 'wrangler.json'])) throw failure();
    for (const filename of files) {
      const path = portable(relative(directory, filename));
      allowedArtifact(path, group);
      const record = await fileRecord(workspaceRoot, portable(relative(workspaceRoot, filename)));
      if ((/\.(?:js|mjs|css)$/u.test(path) || path === 'wrangler.json') && !record.size) throw failure();
      if (group === 'client' && clientForbidden.test((await readRegularFile(filename)).toString('utf8'))) throw failure();
      artifacts.push(record);
    }
  }
  const provenance = [];
  for (const path of provenanceNames) {
    const record = await fileRecord(workspaceRoot, path);
    if (path.endsWith('.log') && record.size > 1024 * 1024) throw failure();
    provenance.push(record);
  }
  return { schemaVersion: 1, state: target.state, artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path)), provenance };
}

/** Writes the seal once, only after complete pair/provenance validation. Never reuses an existing seal. */
export async function sealRestrictedResearchCandidate({ workspaceRoot }) {
  try {
    const manifest = await inspectCandidate(workspaceRoot);
    await writeJsonExclusive(join(workspaceRoot, 'artifact-manifest.json'), manifest);
    return await checkRestrictedResearchCandidate({ workspaceRoot });
  } catch { throw failure(); }
}

/** Read-only. Reconstructs all paths from fixed roots instead of trusting paths from the seal. */
export async function checkRestrictedResearchCandidate({ workspaceRoot }) {
  try {
    const expected = await inspectCandidate(workspaceRoot);
    const manifestPath = join(workspaceRoot, 'artifact-manifest.json');
    const saved = await readJson(manifestPath);
    if (!isDeepStrictEqual(saved, expected)) throw failure();
    // Re-read both metadata and every deployment byte after comparing the complete sets.
    for (const record of [...expected.artifacts, ...expected.provenance]) {
      if (!isDeepStrictEqual(record, await fileRecord(workspaceRoot, record.path))) throw failure();
    }
    if (!isDeepStrictEqual(saved, await readJson(manifestPath))) throw failure();
    return { status: 'checked-local-only', state: expected.state, artifactCount: expected.artifacts.length,
      manifestSha256: (await fileRecord(workspaceRoot, 'artifact-manifest.json')).sha256 };
  } catch { throw failure(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw failure();
    await checkRestrictedResearchCandidate({ workspaceRoot: process.argv[2] });
    console.log('Restricted Research candidate check passed locally. No deployment performed.');
  } catch {
    console.error('Restricted candidate check failed. Supply one complete sealed candidate workspace.');
    process.exitCode = 1;
  }
}
