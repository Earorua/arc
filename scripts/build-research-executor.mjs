import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build, version as esbuildVersion } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = resolve(root, "outputs/local-durable-executor-20260914");
const outputFile = resolve(evidenceRoot, "task13-build/executor/index.js");
const argumentsList = process.argv.slice(2);

function option(name, fallback) {
  const index = argumentsList.indexOf(name);
  if (index < 0) return fallback;
  const value = argumentsList[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function safeReportName(value) {
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(value)) throw new Error("invalid report name");
  return value;
}

function portable(value) {
  return relative(root, resolve(value)).split(sep).join("/");
}

function assertInside(parent, child) {
  const prefix = `${resolve(parent)}${sep}`;
  if (!resolve(child).startsWith(prefix)) throw new Error("build output escaped evidence directory");
}

const entry = resolve(root, option("--entry", "worker/research-executor/index.ts"));
const reportName = safeReportName(option("--report-name", `task13-build-${Date.now()}`));
const reportFile = resolve(evidenceRoot, `${reportName}.json`);
assertInside(evidenceRoot, outputFile);
assertInside(evidenceRoot, reportFile);

const forbidden = [
  ["site HTTP", /(^|\/)app\/server\/http\//u],
  ["site session or OAuth", /(^|\/)app\/server\/(?:auth|session|oauth)(?:\/|\.|-)/iu],
  ["cloud", /(^|\/)app\/server\/cloud(?:\/|\.|-)/u],
  ["proof", /(^|\/)app\/server\/proof(?:\/|\.|-)/u],
  ["planning service", /(^|\/)app\/server\/planning(?:\/|\.|-)/u],
  ["publication", /(?:^|\/)(?:d1-publication|d1-site-import-publication|publication)(?:\.|\/)/u],
  ["local launcher", /(^|\/)scripts\/live-research\//u],
];

let report;
let failed = false;
try {
  await mkdir(dirname(outputFile), { recursive: true });
  const result = await build({
    entryPoints: [entry],
    outfile: outputFile,
    bundle: true,
    platform: "neutral",
    format: "esm",
    target: "es2022",
    external: ["cloudflare:*"],
    metafile: true,
    sourcemap: false,
    write: true,
    logLevel: "silent",
  });
  const inputs = Object.keys(result.metafile.inputs).map((value) => portable(resolve(root, value))).sort();
  const output = Object.values(result.metafile.outputs).find((value) => value.entryPoint !== undefined);
  const exports = output?.exports ?? [];
  if (!exports.includes("ResearchWorkflow")) throw new Error("required Workflow export ResearchWorkflow is absent");
  if (!exports.includes("default")) throw new Error("required default Worker export is absent");
  const violations = inputs.flatMap((input) => forbidden
    .filter(([, pattern]) => pattern.test(input))
    .map(([category]) => `${category}:${input}`));
  if (violations.length > 0) throw new Error(`forbidden bundle input: ${violations.join(",")}`);
  const policyInput = inputs.find((value) => value === "worker/research-executor/workflow-policy.ts");
  if (!policyInput) throw new Error("required production paid-step policy input is absent");
  const bundleText = await import("node:fs/promises").then(({ readFile }) => readFile(outputFile, "utf8"));
  if (!bundleText.includes('timeout: "21 minutes"') || !bundleText.includes("limit: 0")) {
    throw new Error("required paid-step policy 21 minutes/retry limit 0 is absent");
  }
  const metafilePath = resolve(evidenceRoot, "task13-build/metafile.json");
  const inputListPath = resolve(evidenceRoot, "task13-build/inputs.json");
  await writeFile(metafilePath, `${JSON.stringify(result.metafile, null, 2)}\n`);
  await writeFile(inputListPath, `${JSON.stringify(inputs, null, 2)}\n`);
  report = { status: "passed", entry: portable(entry), output: portable(outputFile), metafile: portable(metafilePath),
    inputList: portable(inputListPath), inputCount: inputs.length, exports, esbuildVersion };
} catch (error) {
  failed = true;
  report = { status: "failed", entry: portable(entry), reason: error instanceof Error ? error.message : String(error),
    esbuildVersion };
}

await mkdir(dirname(reportFile), { recursive: true });
await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ ...report, report: portable(reportFile) }));
if (failed) process.exitCode = 1;
