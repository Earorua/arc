import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

export const PRIVATE_SENTINEL = "SYNTHETIC_PRIVATE_DOCUMENT_SENTINEL_DO_NOT_SERIALIZE";
export type ProbeRow = Record<string, string | number | null> & { job_id: string; state: string; sends: number };
type ProbeStatus = { status: string; output?: Record<string, unknown>; error?: unknown };
const schema = [
  `CREATE TABLE probe_jobs(
    job_id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,mode TEXT NOT NULL,text TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'queued',dispatch TEXT NOT NULL DEFAULT 'not-sent',accounting TEXT NOT NULL DEFAULT 'reserved',
    reserved_micro_usd INTEGER NOT NULL DEFAULT 100,actual_micro_usd INTEGER,
    revision INTEGER NOT NULL DEFAULT 0,dispatch_revision INTEGER,generation INTEGER NOT NULL DEFAULT 1,
    document_generation INTEGER NOT NULL DEFAULT 1,consent_valid INTEGER NOT NULL DEFAULT 1,
    slot_owned INTEGER NOT NULL DEFAULT 0,sends INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 0,
    cleanup INTEGER NOT NULL DEFAULT 0,gate_open INTEGER NOT NULL DEFAULT 0,activation_read INTEGER NOT NULL DEFAULT 0,
    delivery_attempts INTEGER NOT NULL DEFAULT 0,
    preflight_failures INTEGER NOT NULL DEFAULT 0,execution_epoch TEXT,created_at INTEGER NOT NULL,queue_expires_at INTEGER NOT NULL)`,
  "CREATE UNIQUE INDEX probe_one_execution_slot ON probe_jobs(owner_id) WHERE slot_owned=1",
  "CREATE TABLE probe_receipts(job_id TEXT PRIMARY KEY,receipt_id TEXT NOT NULL UNIQUE,body TEXT NOT NULL)",
  "CREATE TABLE probe_history(id INTEGER PRIMARY KEY,kind TEXT NOT NULL,job_id TEXT NOT NULL,value TEXT NOT NULL)",
];

export async function createDocumentWorkflowFixture() {
  const tempParent = resolve(tmpdir());
  const directory = await mkdtemp(join(tempParent, "arc-document-workflow-"));
  const bundle = join(directory, "probe.mjs");
  let runtime: Miniflare | undefined;
  let unexpectedNetworkRequests = 0;
  let runtimeRestarts = 0;
  const seenStatuses: ProbeStatus[] = [];
  async function open() {
    runtime = new Miniflare({
      modules: true, modulesRoot: directory, scriptPath: bundle, compatibilityDate: "2026-05-15", cf: false,
      d1Databases: { PROBE_DB: "arc-document-probe" }, d1Persist: join(directory, "d1"),
      workflows: { DOCUMENT_WORKFLOW: { name: "arc-document-probe", className: "DocumentProbeWorkflow" } },
      workflowsPersist: join(directory, "workflows"), bindings: { RUNTIME_EPOCH: randomUUID() },
      outboundService: async () => { unexpectedNetworkRequests++; throw new Error("External network disabled"); },
    });
    await runtime.ready;
  }
  async function db() {
    if (!runtime) throw new Error("Runtime is closed");
    return runtime.getD1Database("PROBE_DB");
  }
  async function dispatch(path: string, body: unknown) {
    if (!runtime) throw new Error("Runtime is closed");
    const response = await runtime.dispatchFetch(`http://localhost${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(String(payload.error ?? "Probe request failed"));
    return payload;
  }
  async function row(id: string) {
    const result = await (await db()).prepare("SELECT * FROM probe_jobs WHERE job_id=?").bind(id).first<ProbeRow>();
    if (!result) throw new Error("Missing probe job");
    return result;
  }
  async function status(id: string) {
    const value = await dispatch("/status", { jobId: id, id }) as ProbeStatus;
    seenStatuses.push(value);
    return value;
  }
  async function terminal(id: string): Promise<ProbeStatus> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const value = await status(id);
      if (value.status === "complete" || value.status === "errored") return value;
      await new Promise(resolveWait => setTimeout(resolveWait, 40));
    }
    throw new Error(`Workflow did not finish: ${id}`);
  }
  async function waitFor(id: string, predicate: (value: ProbeRow) => boolean) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const value = await row(id);
      if (predicate(value)) return value;
      await new Promise(resolveWait => setTimeout(resolveWait, 30));
    }
    throw new Error(`Job condition timed out: ${id}`);
  }
  async function close() {
    if (runtime) await runtime.dispose();
    runtime = undefined;
  }
  async function removeDirectory() {
    const target = resolve(directory);
    if (!target.startsWith(`${tempParent}${sep}`) || !target.slice(tempParent.length + 1).startsWith("arc-document-workflow-"))
      throw new Error("Unsafe probe cleanup path");
    await rm(target, { recursive: true, force: true });
  }
  try {
    await build({ entryPoints: [resolve(process.cwd(), "tests/fixtures/documents/workflow-probe.ts")],
      outfile: bundle, bundle: true, platform: "neutral", format: "esm", target: "es2022",
      external: ["cloudflare:*"], logLevel: "silent" });
    await open();
    for (const sql of schema) await (await db()).prepare(sql).run();
  } catch (error) {
    await close();
    await removeDirectory();
    throw error;
  }
  return {
    row, status, terminal, waitFor,
    async enqueue(id: string, owner: string, mode = "success") {
      return dispatch("/enqueue", { id, owner, mode, text: PRIVATE_SENTINEL });
    },
    async start(jobId: string, id = jobId) { return dispatch("/create", { jobId, id }); },
    async release(id: string) { await (await db()).prepare("UPDATE probe_jobs SET gate_open=1 WHERE job_id=?").bind(id).run(); },
    async invalidate(id: string, action: "cancel" | "delete" | "revoke" | "revision") { return dispatch("/invalidate", { id, action }); },
    async sweep(now: number) { return dispatch("/sweep", { now }); },
    async countJobs(id: string) { return (await db()).prepare("SELECT count(*) FROM probe_jobs WHERE job_id=?").bind(id).first<number>("count(*)"); },
    async receiptCount(id: string) { return (await db()).prepare("SELECT count(*) FROM probe_receipts WHERE job_id=?").bind(id).first<number>("count(*)"); },
    async restart() { await close(); await open(); runtimeRestarts++; },
    async workflowEvidence() {
      const entries = (await (await db()).prepare("SELECT kind,value FROM probe_history").all<{ kind: string; value: string }>()).results;
      const refs = entries.filter(entry => entry.kind !== "error");
      let privateMatches = entries.filter(entry => entry.value.includes(PRIVATE_SENTINEL)).length;
      privateMatches += seenStatuses.filter(value => JSON.stringify(value).includes(PRIVATE_SENTINEL)).length;
      // Read the actual persisted Workflow SQLite cells after shutdown, not only our audit mirror.
      await close();
      let persistedCells = 0;
      let persistedArguments = 0;
      let persistedStepOutputs = 0;
      async function inspect(path: string) {
        for (const entry of await readdir(path, { withFileTypes: true })) {
          const file = join(path, entry.name);
          if (entry.isDirectory()) await inspect(file);
          else if (entry.name.endsWith(".sqlite")) {
            const sqlite = new DatabaseSync(file, { readOnly: true });
            try {
              const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
              for (const { name } of tables) {
                const quotedName = `"${name.replaceAll('"', '""')}"`;
                for (const record of sqlite.prepare(`SELECT * FROM ${quotedName}`).all()) {
                  for (const cell of Object.values(record)) {
                    persistedCells++;
                    const text = cell instanceof Uint8Array ? Buffer.from(cell).toString("utf8") : String(cell);
                    if (text.includes(PRIVATE_SENTINEL)) privateMatches++;
                    if (text.includes('"jobId"') && text.includes('"contractVersion"')) persistedArguments++;
                    if (text.includes('"jobId"') && text.includes('"resultRef"')) persistedStepOutputs++;
                  }
                }
              }
            } finally { sqlite.close(); }
          }
        }
      }
      await inspect(join(directory, "workflows"));
      await open();
      if (persistedCells === 0) throw new Error("No actual persisted Workflow cells inspected");
      return { argumentCount: entries.filter(e => e.kind === "args").length,
        stepOutputCount: entries.filter(e => e.kind === "step-output").length,
        maxReferenceBytes: Math.max(...refs.map(entry => Buffer.byteLength(entry.value))),
        privateMatches, unexpectedNetworkRequests, persistedCells, persistedArguments, persistedStepOutputs, runtimeRestarts };
    },
    async dispose() { await close(); await removeDirectory(); },
  };
}
export type DocumentWorkflowFixture = Awaited<ReturnType<typeof createDocumentWorkflowFixture>>;
