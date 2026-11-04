import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { describeSingleProbe, rehearseSingleProbe } from "./single-receipt-probe.mjs";

const start = Date.parse("2026-11-04T10:00:00.000Z");
const iso = value => new Date(value).toISOString();
const hash = value => createHash("sha256").update(value).digest("hex");
const tempRoot = realpathSync(tmpdir());
const folders = [];
function folder() {
  const directory = mkdtempSync(join(tempRoot, "arc-b1-probe-test-"));
  folders.push(directory);
  return directory;
}
function isolateProfile(directory, script = "") {
  const hook = join(directory, "isolated-os-profile.cjs");
  writeFileSync(hook, `
    const os = require("node:os"), profile = os.userInfo();
    os.userInfo = () => ({ ...profile, homedir: ${JSON.stringify(directory)} });
    require("node:module").syncBuiltinESMExports();
    ${script}
  `, "utf8");
  return hook;
}
after(() => {
  for (const directory of folders) {
    const path = realpathSync(directory);
    assert.equal(dirname(path), tempRoot);
    assert.ok(basename(path).startsWith("arc-b1-probe-test-"));
    rmSync(path, { recursive: true });
  }
});
function grant() {
  return {
    ...describeSingleProbe(), ownerApprovalRef: "offline-test-owner-decision", syntheticCacheAccepted: true,
    workspaceKeyBindingSha256: hash("materials-b2\0" + hash("offline-probe-fixture")),
    approvedAt: iso(start - 1_000), expiresAt: iso(start + 3_600_000),
  };
}

const expectedModel = "moonshotai/kimi-k3.1-pro";
const expectedEndpointId = "a3fafaac-f097-4ef1-86b3-842854dad5c6";
const generationId = "gen-controlled-receipt-pair";
const syntheticUsage = { prompt_tokens: 100, completion_tokens: 20, cost: 0.0004, completion_tokens_details: { reasoning_tokens: 5 } };
function fixtureTransport(post, get) {
  const calls = [];
  async function fetch(url, init) {
    calls.push([url, init]);
    if (init.method === "POST") {
      if (post) return post(url, init);
      return Response.json({ id: generationId, model: expectedModel, provider: "Moonshot AI", usage: syntheticUsage,
        choices: [{ message: { content: "private-output-sentinel", reasoning: "private-reasoning-sentinel" } }] });
    }
    if (get) return get(url, init);
    return Response.json({ data: {
      id: generationId, model: expectedModel, provider_name: "Moonshot AI", provider_responses: [{ status: 200, endpoint_id: expectedEndpointId }],
      native_tokens_prompt: 100, native_tokens_completion: 20, native_tokens_reasoning: 5, total_cost: 0.0004, latency: 22, generation_time: 44,
    } });
  }
  return { fetch, calls };
}

function run(raw, dir, transport, options = {}) {
  return rehearseSingleProbe(raw, { directory: dir, fetch: transport.fetch, now: () => start, ...options });
}

test("refuses an unsigned template, wider scope, stale grant, future approval or a different executable before claiming a directory", async () => {
  const dir = folder(), transport = fixtureTransport();
  const unsigned = describeSingleProbe(), valid = grant();
  for (const invalid of [
    unsigned, { ...valid, syntheticCacheAccepted: false }, { ...valid, maxRequests: 2 },
    { ...valid, totalBudgetMicroUsd: 75001 }, { ...valid, runId: "another-run" }, { ...valid, programSha256: "0".repeat(64) },
    { ...valid, requestSha256: "0".repeat(64) }, { ...valid, text: "unapproved input" },
    { ...valid, workspaceKeyBindingSha256: "0".repeat(64) }, { ...valid, ledgerBindingSha256: "0".repeat(64) },
    { ...valid, expiresAt: iso(start) }, { ...valid, approvedAt: iso(start+1) },
    { ...valid, expiresAt: iso(start+7_200_000) },
  ]) {
    await assert.rejects(run(invalid, dir, transport));
  }
  assert.equal(transport.calls.length, 0);
  assert.deepEqual(readdirSync(dir), []);
});

test("binds the exact synthetic body to one POST, verifies the metadata and preserves only the allowed receipt", async () => {
  const dir = folder(), transport = fixtureTransport(), approved = grant();
  const result = await run(approved, dir, transport);
  assert.deepEqual(transport.calls.map(([url, init]) => [String(url), init.method]), [
    ["https://single-probe.invalid/api/v1/chat/completions", "POST"],
    ["https://single-probe.invalid/api/v1/generation?id="+generationId, "GET"],
  ]);
  const body = transport.calls[0][1].body, request = JSON.parse(body);
  assert.equal(createHash("sha256").update(body).digest("hex"), approved.requestSha256);
  assert.deepEqual(JSON.parse(request.messages[1].content), {
    kind: "supplement", segments: [{ segmentId: "segment-1", text: "SYNTHETIC: I practiced SQL joins using a toy database." }],
  });
  assert.equal(request.model, expectedModel);
  assert.deepEqual(request.provider.only, ["moonshotai/mxfp4"]);
  assert.equal(request.provider.zdr, true);
  assert.equal(result.mode, "offline-test");
  assert.equal(result.postCount, 1);
  assert.equal(result.metadataGetCount, 1);
  assert.equal(result.actualMicroUsd, 400);
  assert.equal(result.heldMicroUsd, 0);
  assert.equal(result.comparison, "compatible");
  const local = join(dir, approved.runId);
  const ledger = readFileSync(join(local,"ledger.jsonl"),"utf8").trim().split("\n").map(row=>JSON.parse(row));
  assert.deepEqual(ledger.map(row=>row.type), ["run-start","reservation","chat-observed","receipt","generation-observed","settlement"]);
  assert.equal(ledger[1].reservedMicroUsd, 72960);
  assert.equal(ledger[2].reportedMicroUsd, 400);
  assert.equal(ledger[3].actualMicroUsd, 400);
  assert.equal(ledger[4].reportedMicroUsd, 400);
  const stored = readFileSync(join(local, "result.json"),"utf8");
  assert.equal(JSON.parse(stored).pair.chat.id, createHash("sha256").update(generationId).digest("hex"));
  assert.doesNotMatch(stored, /private-output-sentinel|private-reasoning-sentinel|offline-probe-fixture/);
});

test("only one concurrent holder can send, and a restart or a renamed grant reference cannot acquire another slot", async () => {
  const dir = folder(), transport = fixtureTransport(), approved = grant();
  const attempts = await Promise.allSettled([run(approved,dir,transport), run(approved,dir,transport)]);
  assert.equal(attempts.filter(value=>value.status==="fulfilled").length, 1);
  await assert.rejects(run({ ...approved, ownerApprovalRef: "another-owner-reference" },dir,transport));
  assert.equal(transport.calls.filter(([, init])=>init.method==="POST").length, 1);
});

test("holds the full reservation for an uncertain transport outcome and never retries the POST", async () => {
  const dir=folder(), approved=grant(), transport=fixtureTransport(async()=>{throw new Error("untrusted-private-error");});
  const result=await run(approved,dir,transport);
  assert.equal(result.postCount, 1);
  assert.equal(result.actualMicroUsd,null);
  assert.equal(result.heldMicroUsd,72960);
  assert.equal(result.comparison,"unverified");
  await assert.rejects(run(approved,dir,transport));
  assert.equal(transport.calls.length,1);
  assert.doesNotMatch(readFileSync(join(dir,approved.runId,"result.json"),"utf8"),/untrusted-private-error/);
});

test("only an unredirected HTTP 200 POST response can supply a receipt or charge", async () => {
  for (const [status, redirected] of [[202, false], [201, false], [200, true], [503, false]]) {
    const dir = folder(), approved = grant();
    const transport = fixtureTransport(async () => {
      const response = Response.json({ id: generationId, model: expectedModel, usage: { ...syntheticUsage, cost: 0 } }, { status });
      if (redirected) Object.defineProperty(response, "redirected", { value: true });
      return response;
    }, async () => new Response(null, { status: 403 }));
    const result = await run(approved, dir, transport);
    assert.deepEqual([result.postCount, result.metadataGetCount, result.accounting, result.actualMicroUsd, result.heldMicroUsd],
      [1, 0, "held-unknown", null, 72960]);
    assert.deepEqual(transport.calls.map(([, init]) => init.method), ["POST"]);
    assert.deepEqual(result.observedCostsUsd, { chat: null, generation: null });
    assert.deepEqual(result.pair, {});
    const ledger = readFileSync(join(dir, approved.runId, "ledger.jsonl"), "utf8").trim().split("\n").map(row => JSON.parse(row));
    assert.deepEqual(ledger.map(row => row.type), ["run-start", "reservation", "settlement"]);
  }
});

test("keeps an attributable chat cost on a missing generation and flags a raw fee mismatch that rounds to the same micro-USD", async () => {
  const missing=fixtureTransport(undefined,async()=>new Response(null,{status:403}));
  const first=await run(grant(),folder(),missing);
  assert.equal(first.postCount,1);
  assert.equal(first.actualMicroUsd,400);
  assert.equal(first.heldMicroUsd,0);
  assert.equal(first.comparison,"unverified");
  const wrong=fixtureTransport(undefined,async()=>Response.json({data:{id:generationId,model:expectedModel,provider_name:"Moonshot AI",
    provider_responses:[{status:200,endpoint_id:expectedEndpointId}],native_tokens_prompt:100,native_tokens_completion:20,
    native_tokens_reasoning:5,total_cost:0.0003999}}));
  const second=await run(grant(),folder(),wrong);
  assert.equal(second.actualMicroUsd,null);
  assert.equal(second.heldMicroUsd,72960);
  assert.equal(second.costConflict,true);
  assert.equal(second.productionAudit,"verified");
  assert.equal(second.comparison,"incompatible");
});

test("conflicting attributable fees preserve both numbers and flag the larger charge even when chat claims zero", async () => {
  const transport = fixtureTransport(
    async () => Response.json({ id: generationId, model: expectedModel, usage: { ...syntheticUsage, cost: 0 } }),
    async () => Response.json({ data: {
      id: generationId, model: expectedModel, provider_name: "Moonshot AI",
      provider_responses: [{ status: 200, endpoint_id: expectedEndpointId }],
      native_tokens_prompt: 100, native_tokens_completion: 20, total_cost: 0.50,
    } }),
  );
  const result = await run(grant(), folder(), transport);
  assert.equal(result.actualMicroUsd, null);
  assert.equal(result.heldMicroUsd, 72960);
  assert.equal(result.budgetExceeded, true);
  assert.deepEqual(result.observedCostsUsd, { chat: 0, generation: 0.50 });
});

test("an error envelope masquerading as successful metadata cannot release an unknown charge", async () => {
  const transport = fixtureTransport(
    async () => Response.json({ id: generationId, model: expectedModel, usage: { prompt_tokens: 100, completion_tokens: 20 } }),
    async () => Response.json({ error: { code: 503 }, data: { id: generationId, model: expectedModel, total_cost: 0 } }),
  );
  const result = await run(grant(), folder(), transport);
  assert.equal(result.actualMicroUsd, null);
  assert.equal(result.heldMicroUsd, 72960);
  assert.equal(result.projectionFailed, true);
  assert.equal(result.comparison, "unverified");
});

test("holds the B1 probe if JSON number conversion would hide a fee discrepancy", async () => {
  const reply = amount => new Response('{"data":{"id":'+JSON.stringify(generationId)+',"model":'+JSON.stringify(expectedModel)+
    ',"provider_name":"Moonshot AI","provider_responses":[{"status":200,"endpoint_id":'+JSON.stringify(expectedEndpointId)+
    '}],"native_tokens_prompt":100,"native_tokens_completion":20,"native_tokens_reasoning":5,"total_cost":'+amount+'}}');
  for (const [amount, compatible] of [["4.00000e-4", true], ["0.0004000000000000000000001", false]]) {
    const transport = fixtureTransport(undefined, async () => reply(amount));
    const result = await run(grant(), folder(), transport);
    assert.equal(result.postCount, 1);
    assert.equal(result.comparison, compatible ? "compatible" : "unverified");
    assert.equal(result.actualMicroUsd, compatible ? 400 : null);
    assert.equal(result.heldMicroUsd, compatible ? 0 : 72960);
  }
});

test("a generation containing only failed upstream attempts cannot release a reservation using its zero", async () => {
  const transport = fixtureTransport(
    async () => Response.json({id:generationId,model:expectedModel,usage:{prompt_tokens:100,completion_tokens:20}}),
    async () => Response.json({data:{id:generationId,total_cost:0,provider_responses:[{status:503,error:{code:503}}]}}),
  );
  const result = await run(grant(), folder(), transport);
  assert.equal(result.heldMicroUsd, 72960);
  assert.equal(result.actualMicroUsd, null);
});

test("a failed and an unfinished attempt cannot settle the probe with an unearned zero", async () => {
  for (const chatCost of [undefined, syntheticUsage.cost]) {
    const dir = folder(), approved = grant();
    const transport = fixtureTransport(
      async () => Response.json({ id: generationId, model: expectedModel, usage: { ...syntheticUsage, cost: chatCost } }),
      async () => Response.json({ data: { id: generationId, total_cost: 0, provider_responses: [{ status: 503 }, { status: 202 }] } }),
    );
    const result = await run(approved, dir, transport);
    assert.deepEqual([result.accounting, result.actualMicroUsd, result.heldMicroUsd],
      chatCost === undefined ? ["held-unknown", null, 72960] : ["settled", 400, 0]);
    assert.deepEqual(result.observedCostsUsd, { chat: chatCost ?? null, generation: null });
    assert.equal(result.costConflict, false);
    assert.equal(result.comparison, "unverified");
    const ledger = readFileSync(join(dir, approved.runId, "ledger.jsonl"), "utf8").trim().split("\n").map(row => JSON.parse(row));
    assert.equal(ledger.some(row => row.type === "generation-observed"), false);
    assert.equal(ledger.at(-1).state, result.accounting);
  }
});

test("refuses a revoked or expired handoff without sending, including expiry during the 15-minute process lifetime", async () => {
  for (const reason of ["revoked","elapsed","rewound"]) {
    let time=start;
    const transport=fixtureTransport();
    const result=await run(grant(),folder(),transport,{
      now:()=>time,
      stillApproved:()=>{ if(reason==="elapsed")time=start+900_000; if(reason==="rewound")time=start-1; return reason!=="revoked"; },
    });
    assert.equal(result.postCount,0);
    assert.equal(result.heldMicroUsd,0);
    assert.equal(transport.calls.length,0);
  }
});

test("accepts pending generation statuses with empty bodies before the last allowed GET succeeds", async () => {
  let gets = 0;
  const success = fixtureTransport();
  const transport = fixtureTransport(undefined, async (url, init) => {
    gets++;
    if (gets === 1) return new Response(null, { status: 202 });
    if (gets === 2) return new Response(null, { status: 503 });
    return success.fetch(url, init);
  });
  const result = await run(grant(), folder(), transport);
  assert.equal(result.comparison, "compatible");
  assert.equal(result.postCount, 1);
  assert.equal(result.metadataGetCount, 3);
});

test("aborts a pending POST at the earlier grant deadline, retains the reservation and refuses another try", async () => {
  const dir = folder(), approved = { ...grant(), expiresAt: iso(start+100) };
  let interrupted = false;
  const transport = fixtureTransport((_url, init) => new Promise((_resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Abort signal did not fire")), 1500);
    init.signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      interrupted = true;
      reject(new Error("Controlled timeout"));
    }, { once: true });
  }));
  const result = await run(approved, dir, transport);
  assert.equal(interrupted, true);
  assert.equal(result.postCount, 1);
  assert.equal(result.heldMicroUsd, 72960);
  await assert.rejects(run(approved, dir, transport));
});

test("the operator CLI prints an unsigned template and refuses an execution without its dedicated enable flag", () => {
  const path = fileURLToPath(new URL("./single-receipt-probe.mjs", import.meta.url));
  const isolated = isolateProfile(folder());
  const env = { ...process.env };
  delete env.ARC_B1_SINGLE_RECEIPT_ENABLED;
  delete env.ARC_B1_SINGLE_RECEIPT_KEY;
  const invoke = flag => spawnSync(process.execPath, [...process.execArgv, "--require", isolated, path, flag], { encoding: "utf8", env, windowsHide: true });
  const unsigned = invoke("--describe");
  assert.equal(unsigned.status, 0);
  assert.equal(JSON.parse(unsigned.stdout).ownerApprovalRef, null);
  assert.equal(JSON.parse(unsigned.stdout).syntheticCacheAccepted, false);
  const disabled = invoke("--execute");
  assert.equal(disabled.status, 2);
  assert.equal(disabled.stdout, "");
  assert.match(disabled.stderr, /probe declined/);
});

test("uses an attributable ID and price even when optional receipt fields cannot be projected", async () => {
  for (const usage of [undefined, { ...syntheticUsage, completion_tokens_details: { reasoning_tokens: "invalid" } }]) {
    const transport = fixtureTransport(async () => Response.json({ id: generationId, model: expectedModel, usage }));
    const result = await run(grant(), folder(), transport);
    assert.equal(result.metadataGetCount, 1);
    assert.equal(result.actualMicroUsd, 400);
    assert.equal(result.observedCostsUsd.chat, usage ? 0.0004 : null);
    assert.equal(result.comparison, "unverified");
    assert.notEqual(result.productionAudit, "duplicate-receipt");
  }
});

test("ignores another generation's bill and never persists or looks up an ID containing part of the key", async () => {
  const wrong = fixtureTransport(undefined, async () => Response.json({ data: { id: "different-receipt", total_cost: 1 } }));
  const result = await run(grant(), folder(), wrong);
  assert.deepEqual(result.observedCostsUsd, { chat: 0.0004, generation: null });
  assert.equal(result.budgetExceeded, false);
  for (const id of [generationId, "ref-offline-probe-fixtur"]) {
    const dir = folder(), approved = grant();
    const transport = fixtureTransport(async () => Response.json({ id, model: expectedModel, usage: syntheticUsage }));
    const found = await run(approved, dir, transport);
    assert.equal(found.metadataGetCount, id === generationId ? 1 : 0);
    for (const file of ["ledger.jsonl", "result.json"]) {
      assert.equal(readFileSync(join(dir, approved.runId, file), "utf8").includes(id), false);
    }
  }
});

test("bounds backoff and an uncooperative fetch by elapsed time even when the wall clock stands still", async () => {
  let gets = 0;
  const transport = fixtureTransport(undefined, async () => {
    gets++;
    return new Response(null, { status: 202 });
  });
  const result = await run(grant(), folder(), transport, { startedAt: start - 900_000 + 450 });
  assert.equal(gets, 1);
  assert.equal(result.actualMicroUsd, 400);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const dir = folder(), approved = { ...grant(), expiresAt: iso(start + 120) };
  const pending = fixtureTransport(() => gate);
  const timer = setTimeout(() => release(Response.json({ id: generationId })), 1500);
  try {
    const before = performance.now();
    const held = await run(approved, dir, pending);
    assert.ok(performance.now() - before < 1100);
    assert.equal(held.heldMicroUsd, 72960);
    const ledger = join(dir, approved.runId, "ledger.jsonl"), snapshot = readFileSync(ledger, "utf8");
    release(Response.json({ id: generationId, usage: syntheticUsage }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(readFileSync(ledger, "utf8"), snapshot);
  } finally {
    clearTimeout(timer);
  }
});

test("forced process exit after handoff or after the fee checkpoint consumes the same single-probe slot", async () => {
  const moduleUrl = new URL("./single-receipt-probe.mjs", import.meta.url).href;
  const childCode = `
    import { rehearseSingleProbe } from ${JSON.stringify(moduleUrl)};
    const [directory, rawGrant, boundary] = process.argv.slice(1);
    const hold = () => new Promise(() => { process.send("at-boundary"); setInterval(() => {}, 60000); });
    const fetch = async (_url, init) => {
      if (init.method === "GET" || boundary === "handoff") return hold();
      return Response.json({id:"gen-process-test",model:"moonshotai/kimi-k3.1-pro",usage:{prompt_tokens:100,completion_tokens:20,cost:0.0004}});
    };
    await rehearseSingleProbe(JSON.parse(rawGrant), { directory, fetch, now:()=>${start} });
  `;
  for (const boundary of ["handoff", "fee"]) {
    const dir = folder(), approved = grant();
    const child = spawn(process.execPath, [...process.execArgv, "--input-type=module", "-e", childCode, dir, JSON.stringify(approved), boundary], {
      stdio: ["ignore", "ignore", "inherit", "ipc"], windowsHide: true,
    });
    const exited = once(child, "exit");
    try {
      const message = await Promise.race([
        once(child, "message", { signal: AbortSignal.timeout(15_000) }).then(([value]) => value),
        exited.then(() => { throw new Error("Test worker exited before the checkpoint"); }),
      ]);
      assert.equal(message, "at-boundary");
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await exited;
    }
    const transport = fixtureTransport();
    await assert.rejects(run(approved, dir, transport));
    assert.equal(transport.calls.length, 0);
    const rows = readFileSync(join(dir, approved.runId,"ledger.jsonl"),"utf8").trim().split("\n").map(row=>JSON.parse(row));
    assert.deepEqual(rows.map(row=>row.type), boundary==="handoff" ? ["run-start","reservation"] : ["run-start","reservation","chat-observed","receipt"]);
    assert.equal(rows[1].reservedMicroUsd,72960);
    if (boundary==="fee") assert.equal(rows[3].actualMicroUsd,400);
  }
});

test("preserves observed fees across a failed settlement write or a lost acknowledgement after fsync", async () => {
  const moduleUrl = new URL("./single-receipt-probe.mjs", import.meta.url).href;
  const childCode = `
    import fs from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    const [directory, input, boundary] = process.argv.slice(1);
    const write = fs.writeSync, close = fs.closeSync;
    let receiptFd = null;
    fs.writeSync = (fd, text, ...args) => {
      if (typeof text === "string" && text[0] === "{") {
        const row = JSON.parse(text);
        if (row.type === "settlement" && boundary === "settlement") throw new Error("simulated write failure");
        if (row.type === "receipt" && boundary === "receipt") receiptFd = fd;
      }
      return write(fd, text, ...args);
    };
    fs.closeSync = fd => {
      close(fd);
      if (fd === receiptFd) { receiptFd = null; throw new Error("simulated lost acknowledgement"); }
    };
    syncBuiltinESMExports();
    const { rehearseSingleProbe } = await import(${JSON.stringify(moduleUrl)});
    const usage = {prompt_tokens:100, completion_tokens:20};
    if (boundary === "receipt") usage.cost = 0.0004;
    const fetch = async (_url, init) => init.method === "POST" ?
      Response.json({id:"gen-fee-persist", model:"moonshotai/kimi-k3.1-pro", usage}) :
      Response.json({data:{id:"gen-fee-persist", total_cost:0.000007}});
    try {
      const result = await rehearseSingleProbe(JSON.parse(input), {directory, fetch, now:()=>${start}});
      process.stdout.write(JSON.stringify([result.checkpointFailed,result.actualMicroUsd,result.observedCostsUsd.chat]));
    } catch { process.exitCode = 73; }
  `;
  for (const boundary of ["settlement", "receipt"]) {
    const dir = folder(), approved = grant();
    const child = spawnSync(process.execPath,
      [...process.execArgv, "--input-type=module", "-e", childCode, dir, JSON.stringify(approved), boundary],
      { encoding: "utf8", windowsHide: true });
    const rows = readFileSync(join(dir, approved.runId, "ledger.jsonl"), "utf8").trim().split("\n").map(row => JSON.parse(row));
    if (boundary === "settlement") {
      assert.equal(child.status, 73);
      assert.equal(rows.at(-1).type, "generation-observed");
      assert.equal(rows.at(-1).reportedMicroUsd, 7);
    } else {
      assert.equal(child.status, 0);
      assert.deepEqual(JSON.parse(child.stdout), [true, null, 0.0004]);
      assert.equal(rows.at(-1).heldMicroUsd, 72960);
      assert.equal(rows.at(-1).observedCostsUsd.chat, 0.0004);
    }
    const transport = fixtureTransport();
    await assert.rejects(run(approved, dir, transport));
    assert.equal(transport.calls.length, 0);
  }
});

test("two physical checkouts share one operator slot and reject a substituted workspace key", async t => {
  const dir = folder(), repository = fileURLToPath(new URL("../../../", import.meta.url));
  const toolsDir = "docs/verification/materials-gate-1b-b1";
  const privateRoot = join(dir, ".arc-materials", "gate-1b", "materials-b2", "receipt-probe");
  mkdirSync(privateRoot, { recursive: true });
  const aliases = [];
  t.after(() => {
    for (const alias of aliases) {
      assert.equal(dirname(dirname(alias)), dir);
      assert.ok(lstatSync(alias).isSymbolicLink());
      unlinkSync(alias);
    }
  });
  function checkout(name) {
    const root = join(dir, name), path = join(root, toolsDir);
    mkdirSync(path, { recursive: true });
    copyFileSync(join(repository, "package.json"), join(root, "package.json"));
    for (const name of ["app","scripts","worker","node_modules"]) {
      const alias = join(root, name);
      symlinkSync(join(repository, name), alias, process.platform === "win32" ? "junction" : "dir");
      aliases.push(alias);
    }
    for (const file of ["single-receipt-probe.mjs","capture-probe-metadata.mjs","replay-redacted-pair.mjs","b2-settings.review.json","invoke-single-receipt.ps1"]) {
      copyFileSync(join(repository, toolsDir, file), join(path, file));
    }
    return join(path, "single-receipt-probe.mjs");
  }
  const entries = [checkout("first"), checkout("second")];
  const calls = join(dir, "calls.jsonl");
  const hook = isolateProfile(dir, `
    const fs = require("node:fs");
    globalThis.fetch = async (url, init) => {
      fs.appendFileSync(${JSON.stringify(calls)}, init.method+"\\n");
      if (init.method === "POST") return Response.json({id:"gen-physical-copies",model:${JSON.stringify(expectedModel)},
        usage:{prompt_tokens:100,completion_tokens:20,cost:0.0004}});
      return Response.json({data:{id:"gen-physical-copies",model:${JSON.stringify(expectedModel)},provider_name:"Moonshot AI",
        provider_responses:[{status:200,endpoint_id:${JSON.stringify(expectedEndpointId)}}],native_tokens_prompt:100,
        native_tokens_completion:20,total_cost:0.0004}});
    };
  `);
  const fakeKey = "synthetic-checkouts-only-credential";
  const env = { ...process.env, ARC_B1_SINGLE_RECEIPT_ENABLED: "owner-approved" };
  delete env.ARC_B1_SINGLE_RECEIPT_KEY;
  delete env.ARC_B1_SINGLE_RECEIPT_LAUNCHER_MS;
  const args = (program, command) => [...process.execArgv, "--require", hook, program, command];
  const invoke = (program, command, key = fakeKey) => spawnSync(process.execPath, args(program, command),
    { encoding: "utf8", windowsHide: true, env: { ...env, ARC_B1_SINGLE_RECEIPT_KEY: key } });
  const keyBinding = hash("materials-b2\0" + hash(fakeKey));
  writeFileSync(join(privateRoot, "workspace-key-binding.txt"), keyBinding, { flag: "wx" });
  const templates = entries.map(program => {
    const proc = invoke(program, "--describe");
    assert.equal(proc.status, 0, proc.stderr);
    return JSON.parse(proc.stdout);
  });
  assert.deepEqual(templates[0], templates[1]);
  assert.equal(templates[0].workspaceKeyBindingSha256, keyBinding);
  const timestamp = Date.now();
  const approved = { ...templates[0], ownerApprovalRef:"offline-two-checkouts", syntheticCacheAccepted:true,
    approvedAt:iso(timestamp-1000), expiresAt:iso(timestamp+120_000) };
  writeFileSync(join(privateRoot, "authorization.json"), JSON.stringify(approved), { flag: "wx" });
  assert.equal(invoke(entries[0], "--execute", "some-other-workspace-fixture").status, 2);
  assert.equal(existsSync(join(privateRoot, approved.runId)), false);
  assert.equal(existsSync(calls), false);
  const statuses = await Promise.all(entries.map(program => {
    const proc = spawn(process.execPath, args(program, "--execute"), {
      windowsHide: true, stdio: "ignore", env: { ...env, ARC_B1_SINGLE_RECEIPT_KEY: fakeKey } });
    return once(proc, "exit").then(([status]) => status);
  }));
  assert.deepEqual(statuses.sort(), [0, 2]);
  assert.equal(invoke(entries[1], "--preflight").status, 2);
  assert.deepEqual(readFileSync(calls, "utf8").trim().split("\n"), ["POST", "GET"]);
});
