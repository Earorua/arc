// Consumes a locally built site. No Wrangler command, remote binding or account API is used.
import { build } from "esbuild";
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createMaterialsAcceptanceConfigPair, loadCloudflareTarget } from "../build/cloudflare-target.ts";
import { checkCloudflareBuild } from "./check-cloudflare-build.mjs";

const targetPath = process.argv[2];
const target = await loadCloudflareTarget({ targetPath });
if (target.stage !== "materials-acceptance" || process.argv.length !== 3) throw new Error("Expected a dedicated materials target");
const pair = createMaterialsAcceptanceConfigPair(target);
await checkCloudflareBuild({ targetPath });
const root = process.cwd(), evidence = resolve("work/gate1b-b0");
await mkdir(evidence, { recursive: true });
const artifactRoot = resolve("outputs/materials-gate-1b-b0");
await mkdir(artifactRoot, { recursive: true });
const bundle = await mkdtemp(join(artifactRoot, "pair-"));
const site = join(bundle, "site"), executor = join(bundle, "executor");
await mkdir(site);
await cp(resolve("dist/server"), join(site, "server"), { recursive: true });
await cp(resolve("dist/client"), join(site, "client"), { recursive: true });
await mkdir(executor);
const built = await build({ entryPoints: [pair.executor.main], outfile: join(executor, "index.mjs"), bundle: true, format: "esm",
  platform: "neutral", target: "es2022", conditions: ["workerd", "worker"], external: ["cloudflare:*", "node:*"], metafile: true, write: true });
const entry = Object.values(built.metafile.outputs).find(output => output.entryPoint);
if (!["DocumentExecutorEntrypoint", "DocumentWorkflow", "default"].every(name => entry?.exports.includes(name))) throw new Error("Missing executor entrypoint");
async function copyMigrations(source, dir) {
  await mkdir(dir, { recursive: true });
  for (const name of (await readdir(source)).filter(n => /^\d+_.+\.sql$/u.test(n)).sort()) await cp(join(source, name), join(dir, name));
}
await copyMigrations("drizzle", join(site, "server/drizzle"));
await copyMigrations("worker/document-executor/migrations", join(executor, "migrations"));
await writeFile(join(executor, "wrangler.json"), JSON.stringify({ ...pair.executor, main: "./index.mjs",
  d1_databases: pair.executor.d1_databases.map(db => ({ ...db, migrations_dir: "migrations" })) }, null, 2));
const sha = data => createHash("sha256").update(data).digest("hex");
async function files(dir) {
  const rows = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) rows.push(...await files(file));
    else if (entry.isFile()) rows.push({ path: relative(bundle, file).replaceAll("\\", "/"), sha256: sha(await readFile(file)) });
    else throw new Error("Unexpected build artifact");
  }
  return rows.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
const artifacts = await files(bundle);
const record = { mode: target.mode, relativeDirectory: relative(root, bundle).replaceAll("\\", "/"), artifacts,
  treeSha256: sha(JSON.stringify(artifacts)), entrypoints: entry.exports.sort() };
await writeFile(join(evidence, "artifact-index.json"), JSON.stringify(record, null, 2));
console.log(`Verified local ${target.stage} ${target.mode} pair with ${artifacts.length} files. Artifact index: work/gate1b-b0/artifact-index.json`);
