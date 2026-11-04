import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createQualificationJournal } from "../../../scripts/materials-qualification-journal.ts";

// This offline process drill exercises the same exclusive directory and fsynced checkpoints as qualification.
const thisPath = fileURLToPath(import.meta.url);
const work = fileURLToPath(new URL("../../../work/materials-gate-1b/journal-drills/", import.meta.url));
const runId = "synthetic-grant";
const reservation = 72_960;

async function worker(base, boundary) {
  process.send("ready");
  await once(process, "message");
  let journal;
  try {
    journal = createQualificationJournal(base, runId);
  } catch (error) {
    if (error.message !== "qualification-run-already-exists") throw error;
    process.send("already-used");
    process.disconnect();
    return;
  }
  const record = (type, fields) => journal.checkpoint({ type, runId, timestamp: new Date().toISOString(), ...fields });
  await record("reservation", { state: "reserved", reservedMicroUsd: reservation });
  if (boundary !== "before-handoff") {
    // A filesystem witness stands in for the transport. It makes duplicate handoffs independently countable.
    appendFileSync(join(base, "mock-handoffs.jsonl"), JSON.stringify({ runId }) + "\n", { flush: true });
  }
  if (boundary === "after-receipt") {
    await record("receipt", { state: "reserved", receiptId: "gen-local-synthetic", actualMicroUsd: 7 });
  }
  process.send("at-boundary");
  // Keep this child alive until the parent terminates it at the confirmed boundary.
  await once(process, "message");
}

function start(base, boundary, children) {
  const child = fork(thisPath, ["worker", base, boundary], {
    execArgv: process.execArgv.filter(arg => arg !== "--test"),
    stdio: ["ignore", "ignore", "inherit", "ipc"], windowsHide: true,
  });
  children.add(child);
  const exit = once(child, "exit");
  const nextMessage = () => Promise.race([
    once(child, "message").then(([value]) => value),
    exit.then(() => { throw new Error("Child exited before the requested checkpoint"); }),
  ]);
  return { child, exit, ready: nextMessage(), nextMessage };
}

async function runCase(base, boundary) {
  mkdirSync(base);
  const children = new Set();
  const timer = setTimeout(() => { for (const child of children) child.kill("SIGKILL"); }, 20_000);
  try {
    const entrants = [start(base, boundary, children), start(base, boundary, children)];
    assert.deepEqual(await Promise.all(entrants.map(entry => entry.ready)), ["ready", "ready"]);
    const positions = entrants.map(entry => entry.nextMessage());
    for (const { child } of entrants) child.send("enter");
    const phases = await Promise.all(positions);
    assert.deepEqual(phases.toSorted(), ["already-used", "at-boundary"]);
    const winner = entrants[phases.indexOf("at-boundary")];
    assert.equal(winner.child.kill("SIGKILL"), true);
    await Promise.all(entrants.map(entry => entry.exit));
    const restart = start(base, boundary, children);
    assert.equal(await restart.ready, "ready");
    const position = restart.nextMessage();
    restart.child.send("enter");
    assert.equal(await position, "already-used");
    await restart.exit;
    const handoffs = join(base, "mock-handoffs.jsonl");
    const count = existsSync(handoffs) ? readFileSync(handoffs, "utf8").trim().split("\n").length : 0;
    assert.equal(count, boundary === "before-handoff" ? 0 : 1);
    const records = readFileSync(join(base, runId, "ledger.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(records.map(event => event.type), boundary === "after-receipt" ? ["reservation", "receipt"] : ["reservation"]);
    assert.equal(records[0].reservedMicroUsd, reservation);
    const cost = records.find(event => event.type === "receipt")?.actualMicroUsd ?? null;
    assert.equal(cost, boundary === "after-receipt" ? 7 : null);
    return { boundary, contenders: 2, duplicateRejected: true, restartRejected: true,
      mockHandoffs: count, reservedMicroUsd: reservation, recordedMockCostMicroUsd: cost };
  } finally {
    clearTimeout(timer);
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
}

if (process.argv[2] === "worker" && process.send) {
  await worker(process.argv[3], process.argv[4]);
} else if (process.argv.length === 2) {
  mkdirSync(work, { recursive: true });
  const base = mkdtempSync(join(work, "run-"));
  const cases = [];
  for (const boundary of ["before-handoff", "after-handoff", "after-receipt"]) {
    cases.push(await runCase(join(base, boundary), boundary));
  }
  console.log(JSON.stringify({ mode: "offline-journal-drill", realInferenceRequests: 0, cases }, null, 2));
} else {
  process.exitCode = 2;
}
