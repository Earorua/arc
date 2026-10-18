// Read-only: node --experimental-strip-types scripts/check-cloudflare-build.mjs <target.json>
// The explicit flag also supports the project's minimum Node 22.13 runtime.
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { createCloudflareConfig, loadCloudflareTarget } from "../build/cloudflare-target.ts";

// Inspected output of the locked Cloudflare Vite plugin 1.37.1. Empty binding
// collections are normalization defaults, not permission to add live bindings.
const frameworkDefaults = {
  dev: { ip: "127.0.0.1", local_protocol: "http", upstream_protocol: "http", enable_containers: true, generate_types: false },
  durable_objects: { bindings: [] }, kv_namespaces: [], queues: { producers: [], consumers: [] },
  vectorize: [], ai_search_namespaces: [], ai_search: [], hyperdrive: [], workflows: [], secrets_store_secrets: [],
  artifacts: [], services: [], analytics_engine_datasets: [], unsafe_hello_world: [], flagship: [], ratelimits: [], worker_loaders: [],
  legacy_env: true, jsx_factory: "React.createElement", jsx_fragment: "React.Fragment", migrations: [], triggers: {},
  rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }], build: { watch_dir: "./src" }, no_bundle: true,
  dispatch_namespaces: [], logfwdr: { bindings: [] }, observability: { enabled: true },
  python_modules: { exclude: ["**/*.pyc"] }, define: {}, cloudchamber: {},
  send_email: [], mtls_certificates: [], pipelines: [], vpc_services: [], vpc_networks: [],
};

async function requireFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.size === 0) throw new Error("Missing or empty build artifact.");
}

async function inspectFiles(directory) {
  if (!(await lstat(directory)).isDirectory()) throw new Error("Missing build directory.");
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".openai" || entry.isSymbolicLink()) throw new Error("Unexpected packaged metadata or link.");
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await inspectFiles(path));
    else if (entry.isFile()) files.push(path);
    else throw new Error("Unexpected build artifact type.");
  }
  return files;
}

/**
 * Validate only the deployed SSR and client inputs. An old dist/.openai sibling
 * is outside both inputs and is not referenced by this standalone manifest.
 * This checks declared identities; cloud resource existence/privacy is a separate gate.
 * @param {{ targetPath?: string, rootDirectory?: string }} options
 */
export async function checkCloudflareBuild(options = {}) {
  if (!options.targetPath?.trim()) throw new Error("An explicit shadow target inventory is required.");
  const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
  const target = await loadCloudflareTarget({ rootDirectory, targetPath: options.targetPath });
  const serverDirectory = join(rootDirectory, "dist/server");
  const clientDirectory = join(rootDirectory, "dist/client");
  const generated = JSON.parse(await readFile(join(serverDirectory, "wrangler.json"), "utf8"));
  const expected = {
    ...frameworkDefaults,
    ...createCloudflareConfig(target),
    topLevelName: target.workerName,
    main: "index.js",
    assets: { binding: "ASSETS", directory: "../client" },
  };
  // Exact comparison rejects unknown keys, secret values and extra secret names at every depth,
  // extra resource bindings, live origins, and any changed runtime flags.
  if (!isDeepStrictEqual(generated, expected)) throw new Error("Generated Cloudflare config does not match the shadow target.");
  await requireFile(join(serverDirectory, "index.js"));
  await inspectFiles(serverDirectory);
  const clientFiles = await inspectFiles(clientDirectory);
  for (const extension of [".js", ".css"]) {
    const candidates = clientFiles.filter((path) => path.endsWith(extension));
    if (!candidates.length) throw new Error("Missing client JavaScript or CSS assets.");
    await Promise.all(candidates.map(requireFile));
  }
  return { stage: "shadow", workerName: target.workerName };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error("Expected one target path.");
    const result = await checkCloudflareBuild({ targetPath: process.argv[2] });
    console.log(`Shadow build preflight passed: ${result.workerName}. No deployment performed.`);
  } catch {
    // No stack, paths, JSON contents or unknown values can reach terminal output.
    console.error("Cloudflare build preflight failed. Supply one valid shadow target JSON and its matching standalone SSR/client build.");
    process.exitCode = 1;
  }
}
