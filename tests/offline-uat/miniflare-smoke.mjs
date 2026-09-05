import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createOfflineVite } from "./server.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const runtime = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('Offline D1 smoke'); } };",
  compatibilityDate: "2026-05-22", d1Databases: ["DB"], d1Persist: false,
  outboundService: () => new Response("Offline worker blocks outbound", { status: 403 }),
});
let vite;
try {
  const db = await runtime.getD1Database("DB");
  for (const file of ["0000_beta_foundation.sql", "0001_secure_account_linking.sql", "0002_product_intelligence.sql", "0003_adaptive_planning.sql", "0004_proof_backed_stack.sql", "0005_openrouter_research_beta.sql", "0006_research_health_indexes.sql"]) {
    const sql = await readFile(resolve(root, "drizzle", file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  vite = await createOfflineVite();
  const { verifyOfflineStorage, verifyAtomicSetupGuards } = await vite.ssrLoadModule("/tests/offline-uat/storage-smoke.ts");
  const flow = await verifyOfflineStorage(db);
  const atomic = await verifyAtomicSetupGuards(db);
  console.log(JSON.stringify({ runtime: "Actual isolated Miniflare/workerd D1", persistent: false, migrations: "0000–0006", flow, atomic, provider: "Fake only; no live evidence" }, null, 2));
} finally { await vite?.close(); await runtime.dispose(); }
