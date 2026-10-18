import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build, transform, version as esbuildVersion } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidence = resolve(root, "outputs/local-durable-executor-20260914/task15-smoke/build");
const productionRuntime = "worker/research-executor/runtime.ts";
const smokeRuntime = "worker/research-executor-smoke/runtime.ts";
const cloudTiming = "worker/research-executor-smoke/timing.ts";
const localTiming = "tests/fixtures/research/cloud-smoke-local-timing.ts";
const importers = ["worker/research-executor/index.ts", "worker/research-executor/workflow.ts"];
const reviewed = {
  [importers[0]]: "5ec33df00e69d96e18333916b72545659b4583747624f0b524bfec15442141ae",
  [importers[1]]: "308ece929d8fd05a97386694a222ec6ae5b809e34b868fff75b2d52e2fc3821d",
  [productionRuntime]: "09ce4fa40c31d222b6de5805ac6e4fcd3aab653b01b377f38a7fddd1997c1ed9",
  "worker/research-executor/workflow-policy.ts": "81464e2661d154a18108df30c20d036356a94c4eb0d6c135e424e9289de8b0e1",
  "app/server/research/openrouter-provider.ts": "385be775c3653ca732cc982e26347c2645e19d62f21f6fdff658b1143406467b",
  [cloudTiming]: "7ed8d3e62efe459ac1121b9e14777093f1ab42e77071cc06e524a229adec9610",
};
const portable = path => relative(root, resolve(root, path)).split(sep).join("/");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const hashes = async paths => Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async path =>
  [path, digest(await readFile(resolve(root, path)))])));
const serialize = value => `${JSON.stringify(value, null, 2)}\n`;
const isLocalOnly = path => path.startsWith("tests/") && path !== "tests/fixtures/research/valid-candidate.ts"
  || path.startsWith("scripts/") || path.includes("node:sqlite") || path.includes("miniflare");

function assertExports(graph, required) {
  const actual = Object.values(graph.metafile.outputs).find(output => output.entryPoint)?.exports ?? [];
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...required].sort())) throw Error("Required Worker exports absent or unexpected");
  return [...actual].sort();
}

function assertRuntimeCycle(graph) {
  const visited = new Set();
  const reachesWrapper = path => {
    if (path === smokeRuntime) return true;
    if (visited.has(path)) return false;
    visited.add(path);
    return (graph.metafile.inputs[path]?.imports ?? []).some(edge => !edge.external && reachesWrapper(edge.path));
  };
  if (reachesWrapper(productionRuntime)) throw Error("Runtime alias cycle rejected");
}

function aliasPlugin(profile, edges) {
  return { name: "sealed-smoke-runtime", setup(api) {
    api.onResolve({ filter: /.*/ }, async args => {
      if (args.pluginData?.smokeResolving || !args.importer || args.path.startsWith("cloudflare:")) return;
      const resolution = await api.resolve(args.path, { importer: args.importer, resolveDir: args.resolveDir,
        namespace: args.namespace, kind: args.kind, pluginData: { smokeResolving: true } });
      if (resolution.errors.length) return { errors: resolution.errors };
      if (resolution.external || !resolution.path) return;
      const target = portable(await realpath(resolution.path));
      if (target !== productionRuntime && target !== cloudTiming) return;
      const importer = portable(await realpath(args.importer));
      if (target === productionRuntime) {
        if (importers.includes(importer)) {
          edges.push({ kind: "runtime-rewrite", importer, specifier: args.path, original: target, resolved: smokeRuntime });
          return { path: resolve(root, smokeRuntime) };
        }
        if (importer === smokeRuntime && args.path === "../research-executor/runtime") {
          edges.push({ kind: "runtime-bypass", importer, specifier: args.path, original: target, resolved: target });
          return { path: resolution.path };
        }
        throw Error(`Unexpected runtime importer: ${importer}`);
      }
      if (profile === "local") {
        if (importer !== smokeRuntime || args.path !== "./timing") throw Error("Unexpected local timing importer");
        edges.push({ kind: "timing-rewrite", importer, specifier: args.path, original: target, resolved: localTiming });
        return { path: resolve(root, localTiming) };
      }
    });
  } };
}

function assertEdges(edges, profile) {
  const expected = [
    ...importers.map(importer => ({ kind: "runtime-rewrite", importer, specifier: "./runtime", original: productionRuntime, resolved: smokeRuntime })),
    { kind: "runtime-bypass", importer: smokeRuntime, specifier: "../research-executor/runtime", original: productionRuntime, resolved: productionRuntime },
    ...(profile === "local" ? [{ kind: "timing-rewrite", importer: smokeRuntime, specifier: "./timing", original: cloudTiming, resolved: localTiming }] : []),
  ];
  const normalize = values => values.map(value => JSON.stringify(value)).sort();
  if (JSON.stringify(normalize(edges)) !== JSON.stringify(normalize(expected))) throw Error("Missing or extra runtime alias edges");
}

async function literalExport(path, name) {
  const source = await readFile(resolve(root, path), "utf8");
  const { code } = await transform(source, { loader: "ts", format: "esm", target: "es2022" });
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`))[name];
}

/** Build only the reviewed cloud or fixed short local composition; no resource/configuration inputs. */
export async function buildSmoke(options) {
  if (!options || typeof options !== "object" || Object.keys(options).some(key => !["profile", "reportName"].includes(key))) throw Error("Unsupported build option");
  const { profile, reportName } = options;
  if (profile !== "cloud" && profile !== "local") throw Error("Unsupported smoke profile");
  if (typeof reportName !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(reportName)) throw Error("Invalid report name");
  const directory = resolve(evidence, profile, reportName);
  if (!directory.startsWith(`${evidence}${sep}`)) throw Error("Build escaped evidence directory");
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory); // A report and its artifacts are immutable; a reused name refuses.
  const reportPath = resolve(directory, "report.json");
  const aliasEdges = [];
  let protectedPaths = [];
  let protectedBefore;
  let protectedAfter;
  try {
    const snapshot = JSON.parse(await readFile(resolve(root, "outputs/local-durable-executor-20260914/task15-subtask3-before.json"), "utf8"));
    protectedPaths = snapshot.protectedFiles.map(item => item.file);
    if (protectedPaths.some(path => portable(path) !== path || path.startsWith("../"))) throw Error("Invalid protected input inventory");
    protectedBefore = await hashes(protectedPaths);
    for (const [path, hash] of Object.entries(reviewed)) {
      if (protectedBefore[path] !== hash) throw Error(`Reviewed input hash changed: ${path}`);
    }
    const sourceBefore = await hashes(snapshot.allowedFiles);
    const executorEntry = profile === "cloud" ? "worker/research-executor-smoke/executor-entry.ts"
      : "tests/fixtures/research/cloud-smoke-local-executor-entry.ts";
    const settings = { absWorkingDir: root, bundle: true, platform: "neutral", format: "esm", target: "es2022",
      external: ["cloudflare:*"], metafile: true, sourcemap: false, write: false, logLevel: "silent" };
    const plugin = aliasPlugin(profile, aliasEdges);
    const executor = await build({ ...settings, entryPoints: [resolve(root, executorEntry)],
      outfile: resolve(directory, "executor.js"), plugins: [plugin] });
    const site = await build({ ...settings, entryPoints: [resolve(root, "worker/research-executor-smoke/site-entry.ts")],
      outfile: resolve(directory, "site.js"), plugins: [plugin] });
    assertEdges(aliasEdges, profile);
    assertRuntimeCycle(executor); assertRuntimeCycle(site);
    const executorExports = assertExports(executor, ["ResearchWorkflow", "default"]);
    const siteExports = assertExports(site, ["default"]);
    const executorInputs = Object.keys(executor.metafile.inputs).sort();
    const siteInputs = Object.keys(site.metafile.inputs).sort();
    if (!["worker/research-executor-smoke/replay.ts", "app/server/research/remote-public-reader.ts"].every(path => siteInputs.includes(path))) {
      throw Error("Site replay composition missing required input");
    }
    const allowedLocal = [localTiming, "tests/fixtures/research/cloud-smoke-local-executor-entry.ts"];
    for (const input of [...executorInputs, ...siteInputs]) {
      if (isLocalOnly(input) && !(profile === "local" && allowedLocal.includes(input))) throw Error(`Forbidden local input in smoke graph: ${input}`);
    }
    const timingPath = profile === "cloud" ? cloudTiming : localTiming;
    if (!executorInputs.includes(timingPath) || executorInputs.includes(profile === "cloud" ? localTiming : cloudTiming)) throw Error("Invalid timing graph");
    const timing = await literalExport(timingPath, "SMOKE_TIMING");
    const expectedTiming = profile === "cloud" ? { long: { headersMs: 1_140_000, bodyMs: 30_000 },
      "after-r2": { headersMs: 10, bodyMs: 10 }, "after-d1": { headersMs: 10, bodyMs: 10 } }
      : { long: { headersMs: 50, bodyMs: 25 }, "after-r2": { headersMs: 0, bodyMs: 0 }, "after-d1": { headersMs: 0, bodyMs: 0 } };
    if (JSON.stringify(timing) !== JSON.stringify(expectedTiming)) throw Error("Invalid fixed timing policy");
    const paidStep = await literalExport("worker/research-executor/workflow-policy.ts", "PAID_STEP_CONFIG");
    const executorText = executor.outputFiles[0].text;
    if (!executorInputs.includes("worker/research-executor/workflow-policy.ts") || paidStep.timeout !== "21 minutes" || paidStep.retries.limit !== 0
      || !executorText.includes('timeout: "21 minutes"') || !executorText.includes("limit: 0")) throw Error("Invalid production paid-step policy");
    if (profile === "cloud" && /__local\/|cloud-smoke-local/u.test(executorText + site.outputFiles[0].text)) throw Error("Forbidden local path in cloud artifact");
    // Build the unchanged production graph directly; never invoke its fixed-output build script.
    const production = await build({ ...settings, entryPoints: [resolve(root, importers[0])],
      outfile: resolve(directory, "production-control", "executor.js") });
    const productionExports = assertExports(production, ["ResearchWorkflow", "default"]);
    const productionInputs = Object.keys(production.metafile.inputs).sort();
    if (productionInputs.some(path => path.includes("research-executor-smoke") || path.startsWith("tests/") || path.startsWith("scripts/"))
      || /__local\/|\/_smoke\/|synthetic-task15|SMOKE_REPLAY_APPROVAL_JSON|SMOKE_REPLAY_INVENTORY_SHA256|arc-smoke-replay-v1/u.test(production.outputFiles[0].text)) throw Error("Smoke input leaked into production graph");
    const inputHashes = await hashes([...executorInputs, ...siteInputs, ...productionInputs]);
    protectedAfter = await hashes(protectedPaths);
    if (JSON.stringify(protectedBefore) !== JSON.stringify(protectedAfter)
      || JSON.stringify(sourceBefore) !== JSON.stringify(await hashes(snapshot.allowedFiles))) throw Error("Build changed protected/source inputs");
    const writeGraph = async (name, result, inputs, exports) => {
      const output = result.outputFiles[0];
      await mkdir(dirname(output.path), { recursive: true });
      await writeFile(output.path, output.contents, { flag: "wx" });
      const metafile = resolve(dirname(output.path), `${name}.metafile.json`);
      const metadata = serialize(result.metafile);
      await writeFile(metafile, metadata, { flag: "wx" });
      return { output: portable(output.path), sha256: digest(output.contents), bytes: output.contents.byteLength,
        metafile: portable(metafile), metafileSha256: digest(metadata), inputs, exports };
    };
    const report = { status: "passed", profile, deployable: profile === "cloud", report: portable(reportPath), esbuildVersion,
      aliasEdges: aliasEdges.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      inputHashes, sourceHashes: sourceBefore, reviewed, protectedBefore, protectedAfter, timing,
      policy: { timeout: paidStep.timeout, retries: paidStep.retries.limit, providerDeadlineMs: 1_200_000, executionLeaseMs: 1_260_000 },
      executor: await writeGraph("executor", executor, executorInputs, executorExports),
      site: await writeGraph("site", site, siteInputs, siteExports),
      production: await writeGraph("production", production, productionInputs, productionExports),
      capabilities: { provider: "local synthetic adapter transport", bridge: ["SMOKE_SITE", "SMOKE_EXECUTOR"],
        globalFetchFallback: false, realProviderKeyRead: false },
      cloudElapsedProved: false };
    await writeFile(reportPath, serialize(report), { flag: "wx" });
    return report;
  } catch (error) {
    if (protectedBefore) protectedAfter = await hashes(protectedPaths);
    await writeFile(reportPath, serialize({ status: "failed", profile, deployable: false, aliasEdges, protectedBefore, protectedAfter,
      reason: error instanceof Error ? error.message : String(error), esbuildVersion }), { flag: "wx" });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== "--profile" || args[2] !== "--report-name") throw Error("Usage: --profile cloud|local --report-name SAFE_NAME");
    const report = await buildSmoke({ profile: args[1], reportName: args[3] });
    console.log(JSON.stringify({ status: report.status, profile: report.profile, deployable: report.deployable, report: report.report,
      executor: report.executor.output, site: report.site.output }));
  } catch (error) { console.error(error instanceof Error ? error.message : "Smoke build failed"); process.exitCode = 1; }
}
