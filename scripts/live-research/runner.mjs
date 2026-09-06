import { mkdir, writeFile, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

// This isolated process has one explicitly injected outbound transport. All
// application global fetch calls and incidental logging fail closed.
const outboundFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async () => { throw new Error("OUTBOUND_DENIED"); };
for (const name of ["log", "info", "warn", "error", "debug", "trace"]) console[name] = () => undefined;
process.emitWarning = () => undefined;
const stop = () => { process.stderr.write("Live validation stopped (validation-incomplete).\n"); process.exit(1); };
process.on("uncaughtException", stop);
process.on("unhandledRejection", stop);

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let vite;
let key;
let exitCode = 1;

async function readKey() {
  if (process.stdin.isTTY) throw new Error("MASKED_LAUNCHER_REQUIRED");
  let value = "";
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 512) { chunk.fill(0); throw new Error("KEY_INVALID"); }
    value += chunk.toString("utf8");
    chunk.fill(0);
  }
  if (!/^[A-Za-z0-9._-]{1,512}$/u.test(value)) throw new Error("KEY_INVALID");
  return value;
}

try {
  const args = process.argv.slice(2);
  const executeOne = args.length === 1 && args[0] === "--execute-one";
  if (args.length && !executeOne) throw new Error("ARGUMENTS_INVALID");
  process.chdir(workspace);
  if (executeOne) key = await readKey();
  const { createOfflineVite } = await import("../../tests/offline-uat/server.mjs");
  vite = await createOfflineVite({ logLevel: "silent", optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, hmr: false, ws: false, cors: false } });
  const { runValidation } = await vite.ssrLoadModule("/scripts/live-research/validation.ts");
  const summary = await runValidation(executeOne ? { executeOne: true, key, fetch: outboundFetch } : {});
  key = undefined;
  const outputDirectory = resolve(workspace, "outputs/live-research");
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = resolve(outputDirectory, `summary-${summary.timestamp.replaceAll(/[:.]/gu, "-")}.json`);
  const serialized = JSON.stringify(summary, null, 2);
  // Exclusive creation preserves every earlier run's evidence.
  await writeFile(outputPath, `${serialized}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${serialized}\nSummary: ${outputPath}\n`);
  exitCode = summary.outcome === "passed" ? 0 : 1;
} catch {
  process.stderr.write("Live validation stopped (validation-incomplete).\n");
} finally {
  key = undefined;
  try {
    const cache = vite?.config.cacheDir;
    await vite?.close();
    if (cache && dirname(resolve(cache)) === resolve(tmpdir()) && basename(cache).startsWith("arc-v8-offline-vite-")) {
      await rm(resolve(cache), { recursive: true, force: true });
    }
  } catch { exitCode = 1; process.stderr.write("Live validation stopped (cleanup-incomplete).\n"); }
}
process.exit(exitCode);
