// Run from this checkout. All service execution is isolated local Miniflare D1/R2.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, version as esbuildVersion } from "esbuild";
import { Miniflare, Log, LogLevel } from "miniflare";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "../../..");
const inputPath = resolve(directory, "planning-inputs.json");
const inputs = JSON.parse(readFileSync(inputPath, "utf8"));
const sha256 = value => createHash("sha256").update(value).digest("hex");
const relativePath = value => relative(root, value).replaceAll("\\", "/");
const fileBinding = value => ({ path: relativePath(value), sha256: sha256(readFileSync(value)), bytes: readFileSync(value).length });
const json = value => JSON.stringify(value, null, 2) + "\n";
function writeNew(path, value) { writeFileSync(path, typeof value === "string" ? value : json(value), { flag: "wx" }); }
function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(resolve(path, entry.name)) : [resolve(path, entry.name)]).sort();
}
function options(argv) {
  const parsed = { cases: inputs.cases.map(item => item.id), compileOnly: false,
    output: `native-planning-20261119-${new Date().toISOString().replaceAll(/[^0-9]/g, "")}-${randomUUID().slice(0, 8)}` };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === "--compile-only") parsed.compileOnly = true;
    else if (value === "--output-name") parsed.output = argv[++i];
    else if (value === "--cases") parsed.cases = argv[++i].split(",");
    else throw new Error(`Unknown collector argument: ${value}`);
  }
  assert.match(parsed.output, /^native-planning-20261119-[a-z0-9-]+$/);
  assert.ok(parsed.cases.length && new Set(parsed.cases).size === parsed.cases.length, "Cases must be nonempty and unique");
  for (const id of parsed.cases) assert.ok(inputs.cases.some(item => item.id === id), `Unknown fixed case: ${id}`);
  return parsed;
}
const cli = options(process.argv.slice(2));
const outputRoot = resolve(root, "work/grounded-verification");
const output = resolve(outputRoot, cli.output);
assert.equal(dirname(output), outputRoot);
assert.ok(!existsSync(output), "Evidence output already exists; choose a unique name. Never overwrite failures.");
mkdirSync(output, { recursive: false });

const compilation = await build({ absWorkingDir: root, entryPoints: [resolve(directory, "planning-worker.ts")],
  bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", metafile: true, logLevel: "silent" });
const worker = compilation.outputFiles[0].text;
const closure = Object.keys(compilation.metafile.inputs).sort().map(path => {
  const absolute = isAbsolute(path) ? path : resolve(root, path);
  return fileBinding(absolute);
});
const migrations = readdirSync(resolve(root, "drizzle")).filter(name => /^\d{4}_.+\.sql$/.test(name) && Number(name.slice(0, 4)) <= 15).sort().map(name => fileBinding(resolve(root, "drizzle", name)));
const runtimePaths = ["node_modules/miniflare/package.json", "node_modules/workerd/package.json", "node_modules/@cloudflare/workerd-windows-64/bin/workerd.exe"];
const runtime = { nodeVersion: process.version, nodeExecutable: { sha256: sha256(readFileSync(process.execPath)), bytes: readFileSync(process.execPath).length },
  esbuildVersion, compatibilityDate: "2026-05-15", packages: runtimePaths.map(path => fileBinding(resolve(root, path))),
  d1: "fresh Miniflare local database per case", r2: "fresh Miniflare local bucket per case", outboundPolicy: "reject every request" };
const historical = walk(resolve(root, "docs/verification/materials-quality-v2")).map(fileBinding);
assert.equal(historical.find(file => file.path.endsWith("/planning-reference-cases.json"))?.sha256,
  "b4980e489b40857514e85afb1fafad15efa8a8976bfd388d0af378430e9a2c51", "Frozen reference cases changed");
const infrastructure = ["collect-planning.mjs", "planning-worker.ts", "planning-inputs.json", "check-planning.mjs", "planning-protocol.md", "planning-protocol-review.md"].map(name => fileBinding(resolve(directory, name)));
const uiAcceptedBytes = execFileSync("git", ["show", `${inputs.reuse.acceptedSource}:${inputs.reuse.uiTestPath}`], { cwd: root });
const evidenceReuse = { ...inputs.reuse, acceptedFileSha256: sha256(uiAcceptedBytes), currentFile: fileBinding(resolve(root, inputs.reuse.uiTestPath)) };
assert.equal(evidenceReuse.currentFile.sha256, evidenceReuse.acceptedFileSha256, "Reused UI evidence source changed since its accepted baseline");
const manifest = { schemaVersion: "materials-native-planning-collection-v1", bindingId: inputs.bindingId,
  startedAt: new Date().toISOString(), output: relativePath(output), requestedCases: cli.cases,
  collectionKind: cli.cases.length === inputs.cases.length ? "fixed-native-14" : "affected-case-rerun", compileOnly: cli.compileOnly,
  head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  branch: execFileSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" }).trim(),
  workingTree: execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }),
  input: fileBinding(inputPath), inputDocument: inputs, infrastructure, sourceClosure: closure, sourceClosureDigest: sha256(json(closure)),
  workerBundle: { sha256: sha256(worker), bytes: Buffer.byteLength(worker), path: "worker.mjs" },
  runtime, runtimeDigest: sha256(json(runtime)), migrations, frozenHistorical: historical, evidenceReuse, limits: inputs.limits };
writeNew(resolve(output, "worker.mjs"), worker);
writeNew(resolve(output, "manifest.json"), manifest);
if (cli.compileOnly) {
  console.log(json({ output: relativePath(output), compileOnly: true, bundleBytes: manifest.workerBundle.bytes, sourceFiles: closure.length, executedCases: 0 }));
} else {
  const results = [];
  for (const caseId of cli.cases) {
    let outboundAttempts = 0;
    const runtimeInstance = new Miniflare({ cf: false, modules: true, script: worker, compatibilityDate: runtime.compatibilityDate,
      d1Databases: { DB: `native-${caseId}` }, r2Buckets: { MATERIALS: `native-${caseId}` }, log: new Log(LogLevel.ERROR),
      outboundService: async () => { outboundAttempts++; throw new Error("Native acceptance forbids every outbound request"); } });
    let result;
    try {
      const db = await runtimeInstance.getD1Database("DB");
      for (const migration of migrations) {
        for (const statement of readFileSync(resolve(root, migration.path), "utf8").split("--> statement-breakpoint").map(value => value.trim()).filter(Boolean)) {
          await db.prepare(statement).run();
        }
      }
      const response = await runtimeInstance.dispatchFetch("http://localhost/native-planning", { method: "POST", body: JSON.stringify({ caseId }) });
      assert.equal(response.status, 200, `Native worker HTTP ${response.status}`);
      result = await response.json();
    } catch (error) {
      result = { schemaVersion: "materials-native-planning-case-result-v1", bindingId: inputs.bindingId, caseId,
        collectionStatus: "failed", failure: { name: error.name, message: error.message, stack: error.stack }, trace: [], snapshots: [] };
    } finally { await runtimeInstance.dispose(); }
    const artifact = { ...result, outboundAttempts, inputDigest: manifest.input.sha256, sourceClosureDigest: manifest.sourceClosureDigest,
      workerBundleDigest: manifest.workerBundle.sha256, runtimeDigest: manifest.runtimeDigest };
    const filename = `${caseId}.json`;
    writeNew(resolve(output, filename), artifact);
    const entry = { caseId, collectionStatus: artifact.collectionStatus, path: filename, sha256: sha256(readFileSync(resolve(output, filename))), outboundAttempts };
    results.push(entry);
    console.log(JSON.stringify({ caseId, collectionStatus: entry.collectionStatus, outboundAttempts, output: `${relativePath(output)}/${filename}` }));
  }
  // Detect even accidental source changes during a long run. Keep the observations either way.
  const drift = [...closure, ...infrastructure, ...migrations, ...historical].filter(file => sha256(readFileSync(resolve(root, file.path))) !== file.sha256).map(file => file.path);
  writeNew(resolve(output, "collection.json"), { schemaVersion: "materials-native-planning-collection-index-v1", bindingId: inputs.bindingId,
    manifestSha256: sha256(readFileSync(resolve(output, "manifest.json"))), completedAt: new Date().toISOString(), results,
    requestedCases: cli.cases, sourceDrift: [...new Set(drift)], outboundAttempts: results.reduce((sum, value) => sum + value.outboundAttempts, 0) });
  console.log(JSON.stringify({ output: relativePath(output), collected: results.filter(result => result.collectionStatus === "collected").length,
    failed: results.filter(result => result.collectionStatus !== "collected").length, sourceDrift: drift.length }));
  if (drift.length || results.some(result => result.collectionStatus !== "collected" || result.outboundAttempts !== 0)) process.exitCode = 1;
}
