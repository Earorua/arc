# Arc v8 restricted Research candidate builds implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this cohesive build-tool component, with SPEC then QUALITY review. Steps use checkbox syntax for tracking.

**Goal:** Produce and validate an isolated local Site/Executor artifact pair from one validated Research inventory, without overwriting accepted builds or loading operational credentials.

**Architecture:** Snapshot an allowlisted set of source files into an exclusively created sibling workspace, reuse the already installed dependencies, and run the Site build in a sanitized child process. Build the exact production Executor entry into a separate artifact directory, retain its input graph, and compare both artifact configurations to the same strict inventory. Keep provenance outside deployed inputs.

**Tech Stack:** Node24, installed Vite8.1.5/Vinext0.0.50/Cloudflare plugin1.37.1, installed esbuild, native Node test runner and existing Vitest/TypeScript checks.

## Scope and prerequisites

This implements the remaining local build requirements of `docs/superpowers/specs/2026-10-15-arc-v8-restricted-research-target-design.md`: Executor artifact validation, output isolation, actual paired builds and input inspection. The configuration component must first have SPEC, QUALITY and Root acceptance. Keep its seven pins and the prior nine private-bridge pins unchanged.

Code root C: `C:/Users/XF/.codex/worktrees/arc-v8-release-integration/v8-openrouter-research-beta`.
Evidence E: `C/outputs/restricted-research-builds-20261015`.
New build parent: `C:/Users/XF/.codex/worktrees/arc-v8-release-integration/restricted-research-candidates` (outside C, so its copied TypeScript cannot enter C's broad typecheck).

User authorization covers this local work. No dependency install, CLI auto-upgrade, secret read, deployment, cloud/Provider request, cohort mutation, paid call, r6 operation or DNS change belongs here. Do not commit/reset or delete old outputs. A synthetic local artifact pair is not an operational target or evidence that cloud resources exist.

Installed Vinext writes `<root>/dist/server/BUILD_ID` independently of outDir. Its CLI loads dotenv and may upgrade React. Therefore run `vite.createBuilder` programmatically in the copied source root; do not run the existing CLI or merely change outDir in C. Preserve the old `scripts/build-research-executor.mjs` and its fixed task13 outputs.

## File map and public interfaces

Create only these focused implementation files and corresponding native tests:

- `scripts/lib/restricted-candidate-files.mjs`: exclusive workspace creation, bounded source selection/copying, SHA256 records, no-link containment checks and sanitized child environment.
- `scripts/restricted-site-build-child.mjs`: fixed programmatic Vite build and per-environment emitted-module graph capture.
- `scripts/build-restricted-research-candidate.mjs`: coordinate snapshot, child build, production Executor esbuild and final validation; strict two-positional-argument CLI.
- `scripts/check-restricted-research-candidate.mjs`: read-only exact pair/artifact/provenance validator; strict one-positional-argument CLI.
- `tests/build/restricted-candidate-files.test.mjs` and `tests/build/restricted-research-candidate.test.mjs`: native Node tests, synthetic fixtures created only in OS temp directories.

Use these exports (additional private helpers are fine):

```js
// files module
export async function createCandidateWorkspace({ sourceRoot, stagingParent, candidateName, target });
export function createBuildEnvironment(parentEnvironment, { workspaceRoot, targetPath });
export async function hashRegularFile(path);
export async function listRegularFiles(directory);
// builder module: no side effect on import
export async function buildExecutorArtifacts({ snapshotRoot, executorDirectory, target });
export async function buildRestrictedResearchCandidate({ targetPath, candidateName });
// validator: no side effect on import
export async function checkRestrictedResearchCandidate({ workspaceRoot });
```

`createCandidateWorkspace` returns `{workspaceRoot,snapshotRoot,targetPath,executorDirectory,sourceManifestPath}`. The public CLI derives sourceRoot from its own script and uses only the fixed sibling build parent; it does not accept an arbitrary source root, entry point, output path, command or environment override. Unit-level sourceRoot/stagingParent parameters exist to test filesystem behavior using synthetic local trees.

## Task 1: isolated builder and exact pair preflight

- [ ] **1. Snapshot the accepted baseline and establish filesystem RED.**

Root records all current nonignored source hashes and `.source` copies of any file needing modification. Prefer no existing-source changes. Never put `.ts` snapshots under C/outputs. Create tests before implementation, with a minimal exported function stub if necessary to make RED behavioral rather than an import failure:

```js
it('refuses an existing candidate without changing its sentinel', async () => {
  const options = await fixture();
  await mkdir(join(options.stagingParent, options.candidateName));
  await writeFile(join(options.stagingParent, options.candidateName, 'sentinel'), 'preserve');
  await assert.rejects(createCandidateWorkspace(options), /Restricted candidate preparation failed/);
  assert.equal(await readFile(join(options.stagingParent, options.candidateName, 'sentinel'), 'utf8'), 'preserve');
});
```

Run `node --test tests/build/restricted-candidate-files.test.mjs`; retain its actual failing exit and log. Add traversal, absolute candidate name, invalid target and linked-ancestor refusal before implementing guards.

- [ ] **2. Implement bounded snapshot creation and credential-free child environment.**

Candidate names use `/^[a-z0-9][a-z0-9-]{0,62}$/` with exact trim and no `.` or separators. Resolve and check containment using `relative`, not a raw string prefix. Validate target through `parseResearchAcceptanceTarget` before copying any source. Reject a staging parent inside sourceRoot or sourceRoot inside stagingParent. Check existing ancestors and every source/output entry with lstat; reject symlinks/junctions and nonregular files. Create the final candidate directory exclusively (`mkdir` without recursive after validating/creating only its fixed parent). Existing or failed candidates are never reused or removed automatically.

Copy only regular files from `app/`, `db/`, `public/`, `worker/research-executor/`, plus `worker/index.ts`, `worker-configuration.d.ts`, `build/cloudflare-target.ts`, `build/research-acceptance-target.ts`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `next.config.ts`, `postcss.config.mjs`. Skip Executor `wrangler.local.jsonc` and migrations: they are not compilation inputs. Source selection must reject hidden files, `.env*`, `.dev.vars*`, source maps and any tests/fixtures/mock/smoke/outputs/cloud-state path. Do not copy `.openai`, `.git`, scripts, examples, other build plugins, operational inventories or arbitrary root files. Record sorted relative paths and SHA256 before copying, compare each copied byte hash, and recheck original hashes after snapshot creation.

Create only one controlled dependency link at `snapshot/node_modules` to the exact existing sourceRoot/node_modules directory, and verify realpath equality. This explicit exception is outside deploy inputs and never traversed by artifact packaging. No other link is accepted. Read only installed package version metadata; do not enumerate credentials or install dependencies. Write `target.json` (validated inventory), `source-manifest.json` and build metadata outside snapshot/dist and executor artifacts, using `flag:'wx'`.

The child environment is a new object, not `{...process.env}`. Pass a small case-insensitive Windows/system allowlist (SystemRoot, WINDIR, ComSpec, PATH, PATHEXT, processor/system executable settings as actually needed); set task-local TEMP/TMP, HOME/USERPROFILE/APPDATA/LOCALAPPDATA/XDG_CONFIG_HOME to empty directories under workspaceRoot. This affects only the child, never the user's system settings. Set NODE_ENV=production, ARC_CLOUDFLARE_TARGET=validated target path, WRANGLER_SEND_METRICS=false, CLOUDFLARE_SEND_METRICS=false, WRANGLER_WRITE_LOGS=false, WRANGLER_LOG_PATH and MINIFLARE_REGISTRY_PATH under workspaceRoot. No inherited NODE_OPTIONS, proxy, token/key, VITE_, OAuth or application vars. Do not inspect their values.

```js
const environment = createBuildEnvironment({ SystemRoot: 'C:/Windows', OPENROUTER_API_KEY: 'SYNTHETIC',
  NODE_OPTIONS: '--require unsafe', VITE_SECRET: 'SYNTHETIC' }, paths);
assert.equal(environment.OPENROUTER_API_KEY, undefined);
assert.equal(environment.NODE_OPTIONS, undefined);
assert.equal(environment.VITE_SECRET, undefined);
assert.equal(environment.ARC_CLOUDFLARE_TARGET, paths.targetPath);
```

Use a bounded generic preparation error at public API/CLI boundaries, with no unknown path, target value or environment value echo. Preserve partial files on failure for local investigation.

- [ ] **3. Implement the fixed Site child and retain a real emitted-module graph.**

The coordinator invokes the current absolute Node executable with this fixed child script, cwd=snapshotRoot, sanitized env, no shell, and a finite10-minute timeout. Store stdout/stderr and exit metadata outside deployed files. On nonzero exit, timeout or uncertain child termination, fail and do not accept/retry that candidate. Do not log environment contents. The child performs:

```js
const graphs = [];
const graphPlugin = {
  name: 'arc-restricted-build-input-graph',
  generateBundle(_options, bundle) {
    graphs.push({ environment: this.environment.name,
      chunks: Object.values(bundle).filter(item => item.type === 'chunk').map(item => ({
        fileName: item.fileName, modules: Object.keys(item.modules).sort(),
      })).sort((a,b) => a.fileName.localeCompare(b.fileName)) });
  },
};
await (await createBuilder({ root: snapshotRoot, configFile: join(snapshotRoot, 'vite.config.ts'),
  envDir: false, plugins: [graphPlugin] })).buildApp();
```

Verify current Vite's hook metadata in the installed source/types, and retain the actual per-environment graph (at least client/rsc/ssr). Resolve disk module paths only within snapshotRoot or the verified dependency root; retain bounded virtual IDs separately. Never silently drop unknown external paths. The graph is evidence, not an emitted client asset. Read graph/source records after the child exits; verify no source or retained C artifact changed. No Vinext CLI invocation, prerender helper or extra server start.

- [ ] **4. Implement exact production Executor output and evidence.**

Use a freshly created executorDirectory under workspaceRoot; refuse preexistence and links. Entry is always `snapshotRoot/worker/research-executor/index.ts`; no caller entry option. Installed esbuild configuration:

```js
const result = await build({ absWorkingDir: snapshotRoot,
  entryPoints: ['worker/research-executor/index.ts'], outfile: join(executorDirectory, 'index.js'),
  bundle: true, platform: 'neutral', format: 'esm', target: 'es2022',
  external: ['cloudflare:*'], metafile: true, sourcemap: false, write: true, logLevel: 'silent' });
const config = { ...createResearchAcceptanceConfigPair(target).executor, main: 'index.js', no_bundle: true };
await writeFile(join(executorDirectory, 'wrangler.json'), JSON.stringify(config,null,2)+'\n', {flag:'wx'});
```

Exactly one JS output, required default/ResearchWorkflow exports, production workflow-policy.ts input, 21-minute/zero-retry paid-step policy in unchanged source and bundle. Reject tests/fixtures/mock/smoke/local launcher or Site HTTP/auth/session/OAuth/cloud/proof/planning/publication inputs, applying the existing Executor build's forbidden patterns plus mock/fixture/source-boundary checks. Reject non-cloudflare external imports unless an actually necessary locked Node builtin is inspected and explicitly documented. Retain metafile, sorted input paths and input-byte hashes, esbuild version and output SHA256 outside executorDirectory. Do not change the old build script.

- [ ] **5. Validate the pair independently and seal artifact hashes.**

`checkRestrictedResearchCandidate` reads the validated inventory, workspace/source/build manifests, Site graph and Executor evidence. It calls the accepted `checkCloudflareBuild({rootDirectory:snapshotRoot,targetPath})` to retain complete normalized Site-config comparison. Compare Executor JSON with full `isDeepStrictEqual` against the generator plus exactly `{main:'index.js',no_bundle:true}`. Recheck state, private service bindings, resource separation and exact required secret names through these complete comparisons; do not compare a selected subset.

Enumerate SSR/client and Executor artifact trees with no links, no empty required outputs or `.openai`/dotenv/source map/test/fixture/smoke files. Executor artifact set is exactly index.js and wrangler.json. Every Site/Executor deployment input gets relative name, size and SHA256 in a sealed local manifest outside those trees. Re-read that manifest and bytes before reporting success. Reject a missing/extra/changed artifact. Inventory/source graph/metafile/locks/logs/node_modules are never deploy inputs.

For all emitted Site environments, reject source inputs from tests/fixtures/mock/smoke/local launcher or outside the snapshot and approved dependencies. Preserve virtual IDs as virtual evidence rather than pretending they are regular files. For client emitted chunks, reject actual server credential identifiers (`OPENROUTER_API_KEY`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_SECRET`, directional `SECRET_HEX`) and server-only credential/config implementations. Do not label known framework action-reference virtual stubs as full server implementations solely from their virtual name; inspect their emitted bytes if a legitimate framework alias needs an exact exception. No arbitrary new exception or secret masking to make the check pass. The existing client-safe auth shim must remain in effect.

CLI builder syntax: `node --experimental-strip-types scripts/build-restricted-research-candidate.mjs <target.json> <candidate-name>`.
CLI checker syntax: `node --experimental-strip-types scripts/check-restricted-research-candidate.mjs <workspace-directory>`.
Both reject missing/extra arguments, output one bounded status, generic failure under512 characters, no raw input. Importing either module must not build, write or exit.

- [ ] **6. Complete focused tests and freeze for SPEC then QUALITY.**

Tests cover exclusive creation/preservation, traversal/absolute names, linked parent/source/output, forbidden source omission/refusal, stable copy hashes and source mutation, the single verified dependency-link exception, sanitized environment, invalid inventory before build, fixed entrypoint, malicious Executor inputs/exports/policy, complete config mismatches in all states, missing/extra/tampered artifacts, source-graph path escape and forbidden client code. Use synthetic local fixtures; mock only the expensive child-launch boundary where needed. At least one fixture invokes actual esbuild with the fixed relative entry and checks its real metafile. Do not run a full actual product build before independent review.

Run and retain exits/logs:

```text
node --test tests/build/restricted-candidate-files.test.mjs tests/build/restricted-research-candidate.test.mjs
node node_modules/vitest/vitest.mjs run tests/build/cloudflare-target.test.ts tests/build/cloudflare-build.test.ts tests/build/research-acceptance-target.test.ts tests/build/research-acceptance-build.test.ts --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/typescript/bin/tsc --noEmit -p worker/research-executor/tsconfig.json
git -c core.safecrlf=false diff --check
```

Self-review, retain RED and GREEN, verify all untouched baseline hashes, freeze exact changed sources and report limitations. Independent SPEC then QUALITY inspect the actual code/diffs/evidence; fix concrete findings with regression tests and re-review. This is local-tool readiness, not cloud readiness.

- [ ] **7. Root runs one actual closed synthetic pair build and accepts bounded evidence.**

After both reviews pass, Root chooses a previously nonexistent `research-local-closed-20261015-r1` candidate (or a new revision if already consumed), uses the existing synthetic closed fixture, and runs the new builder once. All source/staging checks and output isolation apply. Capture actual return code/logs, verify both exact configs and input graphs, record bundle/artifact SHA256, check historical C/dist and task13 outputs unchanged, and run the read-only pair checker. Investigate a failure locally; never relabel it as success or retry by overwriting the same candidate.

Record a local acceptance and recovery checkpoint with remaining operational gates: Task15 attended cloud simulation/closure, actual restricted resources/credentials/cohort, exact native closed deployment readback, fresh capped paid permission/one real acceptance, migration/public cutover and Task17 post-release checks. No request for user secrets or attendance is necessary to finish these local steps.

## Plan self-review

This follows the saved target design without broadening its application policy. The copied-root solution addresses the installed Vinext root-relative write; the programmatic child avoids its dotenv/auto-install CLI. New sibling outputs avoid global TypeScript inclusion and preserve accepted paths. Full pair checks, graph checks, actual build evidence and independent review cover design items2–5; operational gates remain explicitly separate. All interfaces above are defined and no unspecified cloud operation is delegated. Existing-source changes require a concrete build/test failure and a documented minimal extension of scope, not a general refactor.

Additional installed-code checks: Vinext's `config` hook still calls Vite `loadEnv`, but Vite8.1.5 `getEnvFilesForMode` explicitly returns an empty list for `envDir:false`, so the option covers that hook too. Vite's plugin context includes `environment`, and Rolldown's `RenderedChunk.modules` is a map keyed by included module ID; the graph hook above uses these installed interfaces. C/node_modules and C/dist were observed as ordinary directories, without links. The retained client JS contained none of the five credential identifier families checked above; this is historical baseline inspection, not a substitute for scanning the new actual build.
