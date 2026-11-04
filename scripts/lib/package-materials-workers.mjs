import { build } from "esbuild";
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function copyMaterialsMigrations(source, dir) {
  await mkdir(dir, { recursive: true });
  for (const name of (await readdir(source)).filter(name => /^\d+_.+\.sql$/u.test(name)).sort()) {
    await cp(join(source, name), join(dir, name));
  }
}

async function packageWorker(config, folder, requiredExports) {
  await mkdir(folder, { recursive: true });
  const built = await build({ entryPoints: [config.main], outfile: join(folder, "index.mjs"), bundle: true,
    format: "esm", platform: "neutral", target: "es2022", conditions: ["workerd", "worker"],
    external: ["cloudflare:*", "node:*"], metafile: true });
  const entry = Object.values(built.metafile.outputs).find(output => output.entryPoint);
  if (!requiredExports.every(name => entry?.exports.includes(name))) throw new Error("Missing private Worker entrypoint");
  await writeFile(join(folder, "wrangler.json"), JSON.stringify({ ...config, main: "./index.mjs" }, null, 2));
  return entry.exports.sort();
}

export async function packageMaterialsWorkers(pair, bundle) {
  const executor = join(bundle, "executor");
  const entrypoints = await packageWorker({ ...pair.executor,
    d1_databases: pair.executor.d1_databases.map(db => ({ ...db, migrations_dir: "migrations" })),
  }, executor, ["DocumentExecutorEntrypoint", "DocumentWorkflow", "default"]);
  await copyMaterialsMigrations("worker/document-executor/migrations", join(executor, "migrations"));
  if (!pair.fakeTransport) return { entrypoints };
  const syntheticTransportEntrypoints = await packageWorker(pair.fakeTransport, join(bundle, "synthetic-transport"),
    ["DocumentFakeTransport", "DocumentSyntheticReceipts", "default"]);
  if (syntheticTransportEntrypoints.length !== 3) throw new Error("Unexpected synthetic Worker entrypoint");
  return { entrypoints, syntheticTransportEntrypoints };
}
