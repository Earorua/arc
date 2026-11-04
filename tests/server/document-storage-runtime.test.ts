// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

const tempRoot = resolve(tmpdir());
let directory: string;
let runtime: Miniflare;
let outbound = 0;
async function open() {
    runtime = new Miniflare({
        cf: false, modules: true, modulesRoot: directory, scriptPath: join(directory, "worker.mjs"), compatibilityDate: "2026-05-15",
        d1Databases: { DB: "storage-test" }, d1Persist: join(directory, "d1"),
        r2Buckets: { ASSETS: "storage-test" }, r2Persist: join(directory, "r2"),
        outboundService: () => { outbound++; throw new Error("Offline test"); }
    });
    await runtime.ready;
}
async function call(path: string) {
    const response = await runtime.dispatchFetch("http://storage.test/" + path);
    expect(response.status).toBe(200);
    return response.json();
}
async function waitFor(mode: string, column: "phase" | "outcome", value: string) {
    const db = await runtime.getD1Database("DB");
    await expect.poll(async () => (await db.prepare("SELECT phase,outcome FROM fixture_writer WHERE mode=?").bind(mode).first())?.[column],
        { timeout: 9000, interval: 30 }).toBe(value);
}
beforeAll(async () => {
    directory = await mkdtemp(join(tempRoot, "arc-storage-recovery-"));
    await build({ entryPoints: [resolve("tests/fixtures/documents/storage-crash-worker.ts")], outfile: join(directory, "worker.mjs"),
        bundle: true, platform: "neutral", format: "esm", target: "es2022", logLevel: "silent" });
    await open();
    const db = await runtime.getD1Database("DB");
    for (const name of (await readdir("drizzle")).filter(name => /^\d{4}_.+\.sql$/u.test(name)).sort()) {
        const statements = (await readFile(join("drizzle", name), "utf8")).split("--> statement-breakpoint").map(sql => sql.trim()).filter(Boolean);
        await db.batch(statements.map(sql => db.prepare(sql)));
    }
    await db.prepare("INSERT INTO users(id,name,email,email_verified,created_at,updated_at) VALUES('owner-a','Synthetic','owner-a@invalid.test',1,0,0)").run();
    await db.prepare("CREATE TABLE fixture_writer(mode TEXT PRIMARY KEY,phase TEXT,outcome TEXT,released INTEGER,part_etag TEXT)").run();
    await db.prepare("INSERT INTO fixture_writer(mode) VALUES('crash'),('stream')").run();
}, 30000);
afterAll(async () => {
    await runtime?.dispose();
    if (directory && resolve(directory).startsWith(tempRoot + sep + "arc-storage-recovery-"))
        await rm(directory, { recursive: true, force: true });
});
it("recovers persisted R2 bytes after terminating workerd before the D1 commit and rejects exact-handle replay", async () => {
    expect((await runtime.dispatchFetch("http://storage.test/start/crash")).status).toBe(202);
    await waitFor("crash", "phase", "stored");
    const db = await runtime.getD1Database("DB");
    const op = await db.prepare("SELECT object_key,writer_terminated,state FROM document_storage_operations WHERE mutation_id='crash'").first();
    expect(op).toMatchObject({ writer_terminated: 0, state: "writing" });
    const key = String(op!.object_key);
    expect(await (await (await runtime.getR2Bucket("ASSETS")).get(key))?.text()).toBe("offline native storage fault");
    await runtime.dispose();
    await open();
    expect(await (await runtime.getD1Database("DB")).prepare("SELECT outcome FROM fixture_writer WHERE mode='crash'").first()).toEqual({ outcome: null });
    expect(await call("recover/crash")).toEqual({ sameJob: true, state: "completed" });
    expect(await call("replay/crash")).toEqual({ part: "rejected", complete: "rejected", absent: true });
    expect(await (await runtime.getR2Bucket("ASSETS")).get(key)).toBeNull();
    expect(outbound).toBe(0);
}, 30000);
it("aborts while native R2 is receiving a part and finishes deleting before the sender releases its remaining bytes", async () => {
    expect((await runtime.dispatchFetch("http://storage.test/start/stream")).status).toBe(202);
    await waitFor("stream", "phase", "part-in-flight");
    expect(await call("recover/stream")).toEqual({ sameJob: true, state: "completed" });
    const db = await runtime.getD1Database("DB");
    expect(await db.prepare("SELECT outcome FROM fixture_writer WHERE mode='stream'").first()).toEqual({ outcome: null });
    await db.prepare("UPDATE fixture_writer SET released=1 WHERE mode='stream'").run();
    await waitFor("stream", "outcome", "rejected");
    expect(await call("replay/stream")).toEqual({ part: "rejected", complete: null, absent: true });
    expect((await (await runtime.getR2Bucket("ASSETS")).list()).objects).toHaveLength(0);
    expect(outbound).toBe(0);
}, 30000);
