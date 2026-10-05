import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter, getEventListeners } from "node:events";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { collectAuthTail } from "../../scripts/cloudflare-migration/auth-tail.mjs";
import { createAuthTailFramer, projectAuthTailEvent } from "../../scripts/cloudflare-migration/auth-tail-format.mjs";

const LIMIT = 256 * 1024;
const SENTINEL = "SYNTHETIC_PRIVATE_SENTINEL";
const timestamp = 1791158400123;
const marker = "[Arc Auth] ERROR upstream_error=invalid_client http_status=401";
const event = (changes = {}) => ({
  eventTimestamp: timestamp,
  outcome: "ok",
  logs: [{ message: [marker] }],
  ...changes,
});
const expected = (changes = {}) => ({
  timestamp: new Date(timestamp).toISOString(), outcome: "ok", messages: [marker], ...changes,
});

function fixedFailure(action, code) {
  assert.throws(action, (error) => error.message === code && error.code === code);
}

test("framer emits only complete pretty JSON objects at every string chunk boundary", () => {
  const values = [event({ text: 'Unicode 中😀 / escaped \\" } ] { [', nested: [{ value: "}" }] }), event({ outcome: "exception" })];
  const input = ` \r\n${JSON.stringify(values[0], null, 2)}\n\t${JSON.stringify(values[1], null, 2)}\r\n`;
  for (let index = 0; index <= input.length; index++) {
    const received = [];
    const framer = createAuthTailFramer((value) => received.push(value));
    framer.push(input.slice(0, index));
    framer.push(input.slice(index));
    framer.end();
    assert.deepEqual(received, values, `boundary ${index}`);
  }
});

test("framer does not parse partial frames and closes permanently on end", () => {
  const received = [];
  const framer = createAuthTailFramer((value) => received.push(value));
  framer.push('{"a":');
  assert.deepEqual(received, []);
  framer.push('1}');
  framer.end();
  framer.end();
  framer.push('{"mustNotResume":true}');
  assert.deepEqual(received, [{ a: 1 }]);
});

for (const [name, input, code, complete] of [
  ["prefix", `${SENTINEL}{}`, "invalid-framing", true],
  ["top-level array", "[]", "invalid-framing", true],
  ["top-level string", '"value"', "invalid-framing", true],
  ["top-level primitive", "null", "invalid-framing", true],
  ["non-JSON whitespace", "\u00a0{}", "invalid-framing", true],
  ["trailing text", `{} ${SENTINEL}`, "invalid-framing", true],
  ["mismatched bracket", '{"a":[}', "invalid-framing", true],
  ["unmatched close", "{]", "invalid-framing", true],
  ["invalid JSON", `{"${SENTINEL}":undefined}`, "invalid-json", true],
  ["invalid escape", '{"a":"\\q"}', "invalid-json", true],
  ["trailing comma", '{"a":1,}', "invalid-json", true],
  ["incomplete frame", '{"a":1', "invalid-framing", false],
  ["mid string", `{"a":"${SENTINEL}`, "invalid-framing", false],
  ["mid escape", '{"a":"\\', "invalid-framing", false],
]) {
  test(`framer rejects ${name} with a fixed code and cannot resume`, () => {
    const received = [];
    const framer = createAuthTailFramer((value) => received.push(value));
    fixedFailure(() => {
      framer.push(input);
      if (!complete) framer.end();
    }, code);
    const before = received.length;
    framer.push('{"mustNotResume":true}');
    framer.end();
    assert.equal(received.length, before);
    assert.equal(JSON.stringify(received).includes(SENTINEL), false);
  });
}

test("framer enforces the exact UTF-8 frame byte limit across split surrogates", () => {
  const exact = `{"a":"${"a".repeat(LIMIT - 12)}😀"}`;
  assert.equal(Buffer.byteLength(exact), LIMIT);
  for (const split of [exact.length - 4, exact.length - 3, exact.length - 2]) {
    const received = [];
    const framer = createAuthTailFramer((value) => received.push(value));
    framer.push(exact.slice(0, split));
    framer.push(exact.slice(split));
    framer.end();
    assert.equal(received.length, 1);
  }
  const received = [];
  const framer = createAuthTailFramer((value) => received.push(value));
  fixedFailure(() => framer.push(`{"a":"${"中".repeat(Math.ceil(LIMIT / 3))}"}`), "frame-too-large");
  framer.push("{}");
  assert.deepEqual(received, []);
});

test("framer bounds incomplete frames as well as complete frames", () => {
  const framer = createAuthTailFramer(() => assert.fail("incomplete input emitted"));
  fixedFailure(() => framer.push(`{"a":"${"x".repeat(LIMIT)}`), "frame-too-large");
});

test("projection outputs only the safe fields from a synthetic sensitive event", () => {
  const input = event({
    event: { request: { url: `https://example.test/callback?code=${SENTINEL}&state=${SENTINEL}`, headers: { cookie: SENTINEL } } },
    exceptions: [{ message: SENTINEL, stack: SENTINEL }],
    account: { email: SENTINEL },
    logs: [{ message: [marker, SENTINEL, { token: SENTINEL }] }],
  });
  assert.deepEqual(projectAuthTailEvent(input), expected());
  assert.equal(JSON.stringify(projectAuthTailEvent(input)).includes(SENTINEL), false);
});

test("projection accepts exactly the native event outcomes, including empty log evidence", () => {
  for (const outcome of ["ok", "exception", "exceededCpu", "exceededMemory", "canceled", "unknown"]) {
    assert.deepEqual(projectAuthTailEvent(event({ outcome, logs: [] })), expected({ outcome, messages: [] }));
  }
  for (const outcome of ["success", "exceededCPU", "unknown-input", "OK", "", null, undefined, {}, 0]) {
    assert.equal(projectAuthTailEvent(event({ outcome })), null);
  }
});

test("projection accepts only date-range-valid safe integer millisecond event timestamps", () => {
  for (const value of [0, -1, timestamp, 8640000000000000, -8640000000000000]) {
    assert.deepEqual(projectAuthTailEvent(event({ eventTimestamp: value })), expected({ timestamp: new Date(value).toISOString() }));
  }
  for (const value of [null, undefined, "2026-10-05T00:00:00.000Z", String(timestamp), NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER, 8640000000000001, {}, []]) {
    assert.equal(projectAuthTailEvent(event({ eventTimestamp: value })), null);
  }
});

test("projection recognizes all approved names and status values in fixed order", () => {
  const messages = ["[Arc Auth] ERROR"];
  for (const code of ["invalid_client", "invalid_grant", "invalid_request", "unauthorized_client", "unsupported_grant_type", "redirect_uri_mismatch", "access_denied", "temporarily_unavailable", "server_error"]) {
    messages.push(`[Arc Auth] ERROR upstream_error=${code}`);
    messages.push(`[Arc Auth] ERROR upstream_error=${code} http_status=400`);
  }
  for (let status = 400; status <= 599; status++) messages.push(`[Arc Auth] ERROR http_status=${status}`);
  assert.deepEqual(projectAuthTailEvent(event({ logs: [{ message: messages }] })), expected({ messages }));
});

test("projection rejects marker substrings, alternate severity, ordering and malformed status", () => {
  const messages = [
    `prefix ${marker}`, `${marker} suffix`, `${marker}\n`, `${marker}\r\n`, `${marker}\u2028`,
    "[Arc Auth] WARN", "[Arc Auth] error", "[Arc Auth] ERROR ",
    "[Arc Auth] ERROR http_status=401 upstream_error=invalid_client",
    "[Arc Auth] ERROR upstream_error=INVALID_CLIENT", `[Arc Auth] ERROR upstream_error=${SENTINEL}`,
    ...["399", "600", "0401", "401.0", "4e2", "-400", "401 "].map((status) => `[Arc Auth] ERROR http_status=${status}`),
    { message: marker }, [marker], null, 123,
  ];
  assert.deepEqual(projectAuthTailEvent(event({ logs: [{ message: messages }, { message: marker }, marker, null] })), expected({ messages: [] }));
  for (const logs of [null, undefined, {}, marker]) {
    assert.deepEqual(projectAuthTailEvent(event({ logs })), expected({ messages: [] }));
  }
  for (const input of [null, undefined, [], marker, 123]) assert.equal(projectAuthTailEvent(input), null);
});

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.kills = [];
    this.closed = false;
  }
  kill(signal) {
    this.kills.push(signal);
    queueMicrotask(() => this.close(null, signal));
    return true;
  }
  close(code = 0, signal = null) {
    if (this.closed) return;
    this.closed = true;
    this.stdout.destroy();
    this.stderr.destroy();
    this.emit("close", code, signal);
  }
}

function harness(options = {}) {
  const child = new FakeChild();
  const emitted = [];
  const calls = [];
  const controller = new AbortController();
  const promise = collectAuthTail({
    spawnChild: (...args) => { calls.push(args); return child; },
    emit: (record) => emitted.push(record),
    signal: controller.signal,
    timeoutMs: 1000,
    ...options,
  });
  return { child, emitted, calls, controller, promise };
}

function assertClean(h) {
  assert.equal(getEventListeners(h.controller.signal, "abort").length, 0);
  for (const eventName of ["spawn", "close", "error"]) assert.equal(h.child.listenerCount(eventName), 0, eventName);
  for (const stream of [h.child.stdout, h.child.stderr]) {
    for (const eventName of ["data", "end", "error"]) assert.equal(stream.listenerCount(eventName), 0, eventName);
    assert.equal(stream.destroyed, true);
  }
  assert.equal(JSON.stringify(h.emitted).includes(SENTINEL), false);
}

test("collector launches exactly the locked shadow tail with private stdio and child-only privacy settings", async () => {
  const before = Object.fromEntries(["WRANGLER_LOG", "WRANGLER_WRITE_LOGS", "WRANGLER_SEND_METRICS", "WRANGLER_SEND_ERROR_REPORTS", "CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV"].map((key) => [key, process.env[key]]));
  const h = harness();
  assert.equal(h.calls.length, 1);
  const [command, args, options] = h.calls[0];
  assert.equal(command, process.execPath);
  assert.deepEqual(args, [
    fileURLToPath(new URL("../../node_modules/wrangler/wrangler-dist/cli.js", import.meta.url)),
    "tail", "arc-v8-migration-shadow-20260922", "--format", "json", "--config",
    fileURLToPath(new URL("../../dist/server/wrangler.json", import.meta.url)),
  ]);
  assert.equal(options.cwd, fileURLToPath(new URL("../../", import.meta.url)));
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
  assert.notEqual(options.env, process.env);
  for (const [key, original] of Object.entries(before)) {
    assert.equal(options.env[key], key === "WRANGLER_LOG" ? "error" : "false");
    assert.equal(process.env[key], original);
  }
  assert.deepEqual(Object.keys(options.env).sort(), [...new Set([...Object.keys(process.env), ...Object.keys(before)])].sort());
  assert.deepEqual(h.emitted, []);
  h.child.emit("spawn");
  assert.deepEqual(h.emitted, [{ code: "collector-started" }]);
  h.controller.abort();
  assert.equal(await h.promise, "collector-stopped");
  assert.deepEqual(h.emitted, [{ code: "collector-started" }, { code: "collector-stopped" }]);
  assert.deepEqual(h.child.kills, ["SIGKILL"]);
  assertClean(h);
});

test("collector decodes every UTF-8 byte boundary and emits only projections", async () => {
  const raw = Buffer.from(`${JSON.stringify(event({
    event: { request: { url: `https://example.test/?code=${SENTINEL}中😀` } },
    exceptions: [{ message: SENTINEL }],
    logs: [{ message: [SENTINEL, `prefix ${marker}`, `${marker}\n`, marker] }],
  }), null, 2)}\n${JSON.stringify(event({ outcome: "exceededCpu", logs: [] }), null, 2)}\n`);
  for (let split = 0; split <= raw.length; split++) {
    const h = harness();
    h.child.emit("spawn");
    h.child.stderr.write(`stderr ${SENTINEL} ${marker}`);
    h.child.stdout.write(raw.subarray(0, split));
    h.child.stdout.write(raw.subarray(split));
    h.controller.abort();
    assert.equal(await h.promise, "collector-stopped");
    assert.deepEqual(h.emitted, [
      { code: "collector-started" }, expected(), expected({ outcome: "exceededCpu", messages: [] }), { code: "collector-stopped" },
    ], `byte boundary ${split}`);
    assertClean(h);
  }
});

for (const [name, input, code, end] of [
  ["arbitrary stdout", Buffer.from(`private ${SENTINEL}`), "invalid-framing", false],
  ["malformed JSON", Buffer.from(`{"private":"${SENTINEL}",}`), "invalid-json", false],
  ["mismatched framing", Buffer.from('{"a":[}'), "invalid-framing", false],
  ["oversize frame", Buffer.from(`{"a":"${"x".repeat(LIMIT)}`), "frame-too-large", false],
  ["incomplete JSON", Buffer.from('{"a":'), "invalid-framing", true],
  ["invalid UTF-8", Buffer.from([0xff]), "invalid-framing", false],
  ["incomplete UTF-8", Buffer.from([0xe4, 0xb8]), "invalid-framing", true],
  ["byte order mark", Buffer.from("\ufeff{}"), "invalid-framing", false],
]) {
  test(`collector stops safely on ${name} and ignores later events`, async () => {
    const h = harness();
    h.child.emit("spawn");
    h.child.stdout.write(input);
    if (end) h.child.stdout.end();
    assert.equal(await h.promise, code);
    h.child.emit("close", 1);
    h.child.emit("spawn");
    h.controller.abort();
    assert.deepEqual(h.emitted, [{ code: "collector-started" }, { code }]);
    assert.deepEqual(h.child.kills, ["SIGKILL"]);
    assertClean(h);
  });
}

test("collector ignores unknown outcomes and invalid timestamps without coercion", async () => {
  const h = harness();
  h.child.emit("spawn");
  h.child.stdout.write(`${JSON.stringify(event({ outcome: SENTINEL }))}\n${JSON.stringify(event({ eventTimestamp: SENTINEL }))}\n`);
  h.controller.abort();
  assert.equal(await h.promise, "collector-stopped");
  assert.deepEqual(h.emitted, [{ code: "collector-started" }, { code: "collector-stopped" }]);
  assertClean(h);
});

test("collector stops on deadline exactly once and kills the child", async () => {
  const h = harness({ timeoutMs: 5 });
  h.child.emit("spawn");
  assert.equal(await h.promise, "collector-timeout");
  h.controller.abort();
  h.child.emit("close", 1);
  assert.deepEqual(h.emitted, [{ code: "collector-started" }, { code: "collector-timeout" }]);
  assert.deepEqual(h.child.kills, ["SIGKILL"]);
  assertClean(h);
});

test("collector handles a pre-aborted signal without spawning", async () => {
  const controller = new AbortController();
  controller.abort(new Error(SENTINEL));
  const h = harness({ signal: controller.signal });
  assert.equal(await h.promise, "collector-stopped");
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.emitted, [{ code: "collector-stopped" }]);
});

test("collector validates timeout bounds before spawning", async () => {
  for (const timeoutMs of [0, -1, 300001, NaN, Infinity, 1.5, "5", null]) {
    const h = harness({ timeoutMs });
    assert.equal(await h.promise, "child-failure");
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.emitted, [{ code: "child-failure" }]);
  }
  for (const timeoutMs of [1, 300000]) {
    const h = harness({ timeoutMs });
    assert.equal(h.calls.length, 1);
    h.controller.abort();
    assert.equal(await h.promise, "collector-stopped");
    assertClean(h);
  }
});

test("collector sanitizes synchronous spawn failures", async () => {
  const h = harness({ spawnChild: () => { throw new Error(SENTINEL); } });
  assert.equal(await h.promise, "child-failure");
  assert.deepEqual(h.emitted, [{ code: "child-failure" }]);
  assert.equal(getEventListeners(h.controller.signal, "abort").length, 0);
});

test("collector sanitizes child launch errors without claiming it started", async () => {
  const h = harness();
  h.child.emit("error", new Error(SENTINEL));
  assert.equal(await h.promise, "child-failure");
  assert.deepEqual(h.emitted, [{ code: "child-failure" }]);
  assertClean(h);
});

for (const streamName of ["stdout", "stderr"]) {
  test(`collector sanitizes ${streamName} errors and cleans up`, async () => {
    const h = harness();
    h.child.emit("spawn");
    h.child[streamName].emit("error", new Error(SENTINEL));
    assert.equal(await h.promise, "child-failure");
    assert.deepEqual(h.emitted, [{ code: "collector-started" }, { code: "child-failure" }]);
    assertClean(h);
  });
}

for (const exitCode of [0, 1, null]) {
  test(`collector treats unexpected child close (${exitCode}) as failure`, async () => {
    const h = harness();
    h.child.emit("spawn");
    h.child.close(exitCode);
    assert.equal(await h.promise, "child-failure");
    assert.deepEqual(h.emitted, [{ code: "collector-started" }, { code: "child-failure" }]);
    assert.deepEqual(h.child.kills, []);
    assertClean(h);
  });
}

test("collector treats ended stdout as child failure and validates its final partial frame", async () => {
  const h = harness();
  h.child.emit("spawn");
  h.child.stdout.end(`${JSON.stringify(event())}\n`);
  assert.equal(await h.promise, "child-failure");
  assert.deepEqual(h.emitted, [{ code: "collector-started" }, expected(), { code: "child-failure" }]);
  assertClean(h);
  const incomplete = harness();
  incomplete.child.stdout.write('{"a":');
  incomplete.child.close();
  assert.equal(await incomplete.promise, "invalid-framing");
  assertClean(incomplete);
});

test("collector handles abort/error/close races without duplicate output or settlement", async () => {
  const h = harness();
  h.child.emit("spawn");
  h.controller.abort();
  h.child.emit("error", new Error(SENTINEL));
  h.child.stdout.emit("error", new Error(SENTINEL));
  h.child.stderr.emit("error", new Error(SENTINEL));
  h.child.stdout.emit("data", Buffer.from(JSON.stringify(event())));
  assert.equal(await h.promise, "collector-stopped");
  assert.deepEqual(h.emitted, [{ code: "collector-started" }, { code: "collector-stopped" }]);
  assert.deepEqual(h.child.kills, ["SIGKILL"]);
  assertClean(h);
});

for (const refusal of ["false", "throw"]) {
  test(`collector reports kill ${refusal} as cleanup failure and waits for actual close`, async () => {
    const h = harness();
    h.child.kill = (signal) => {
      h.child.kills.push(signal);
      if (refusal === "throw") throw new Error(SENTINEL);
      return false;
    };
    h.child.emit("spawn");
    let settled = false;
    h.promise.then(() => { settled = true; });
    try {
      h.controller.abort();
      assert.deepEqual(h.emitted, [{ code: "collector-started" }, { code: "child-failure" }]);
      assert.equal(h.child.stdout.destroyed, true);
      assert.equal(h.child.stderr.destroyed, true);
      h.child.stdout.emit("data", Buffer.from(JSON.stringify(event())));
      h.child.stderr.emit("data", Buffer.from(SENTINEL));
      h.child.emit("error", new Error(SENTINEL));
      h.child.stdout.emit("error", new Error(SENTINEL));
      h.child.stderr.emit("error", new Error(SENTINEL));
      await Promise.resolve();
      assert.equal(settled, false, "cleanup must not be claimed before close");
      assert.deepEqual(h.emitted, [{ code: "collector-started" }, { code: "child-failure" }]);
      assert.deepEqual(h.child.kills, ["SIGKILL"]);
    } finally { h.child.close(null); }
    assert.equal(await h.promise, "child-failure");
    assertClean(h);
  });
}

// A fresh Node process exercises the CLI guard/signals. Its builtin spawn is
// replaced before import, so this can never launch Wrangler or make a network call.
function runGuardedCli(mode) {
  const moduleUrl = new URL("../../scripts/cloudflare-migration/auth-tail.mjs", import.meta.url);
  const script = `
    import childProcess from "node:child_process";
    import { syncBuiltinESMExports } from "node:module";
    import { EventEmitter } from "node:events";
    import { PassThrough } from "node:stream";
    let calls = 0;
    childProcess.spawn = () => {
      calls++;
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => {
        queueMicrotask(() => child.emit("close", null, "SIGKILL"));
        return true;
      };
      queueMicrotask(() => {
        child.emit("spawn");
        process.emit(${JSON.stringify(mode)});
      });
      return child;
    };
    syncBuiltinESMExports();
    process.argv = [process.execPath, ${JSON.stringify(fileURLToPath(moduleUrl))}];
    if (${JSON.stringify(mode)} === "argument") process.argv.push("--worker=other");
    if (${JSON.stringify(mode)} === "import") process.argv[1] += ".unrelated";
    await import(${JSON.stringify(moduleUrl.href)});
    process.on("beforeExit", () => {
      const expected = ["SIGINT", "SIGTERM"].includes(${JSON.stringify(mode)}) ? 1 : 0;
      if (calls !== expected || process.listenerCount("SIGINT") || process.listenerCount("SIGTERM")) process.exitCode = 9;
    });
  `;
  return spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 2000, windowsHide: true });
}

test("importing the wrapper has no child launch or signal handlers", () => {
  const result = runGuardedCli("import");
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("CLI rejects all arguments before it can launch a child", () => {
  const result = runGuardedCli("argument");
  assert.equal(result.status, 1);
  assert.equal(result.stdout.trim(), '{"code":"child-failure"}');
  assert.equal(result.stderr, "");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  test(`CLI handles ${signal} and removes both operator signal handlers`, () => {
    const result = runGuardedCli(signal);
    assert.equal(result.status, 0);
    assert.deepEqual(result.stdout.trim().split("\n").map(JSON.parse), [{ code: "collector-started" }, { code: "collector-stopped" }]);
    assert.equal(result.stderr, "");
  });
}

test("collector lets asynchronous sink owners abort with fixed child-failure", async () => {
  const h = harness();
  h.child.emit("spawn");
  h.controller.abort("child-failure");
  assert.equal(await h.promise, "child-failure");
  assert.deepEqual(h.emitted, [{ code: "collector-started" }, { code: "child-failure" }]);
  assertClean(h);

  const controller = new AbortController();
  controller.abort("child-failure");
  const preAborted = harness({ signal: controller.signal });
  assert.equal(await preAborted.promise, "child-failure");
  assert.deepEqual(preAborted.calls, []);
  assert.deepEqual(preAborted.emitted, [{ code: "child-failure" }]);
});

test("collector handles a synchronous throwing emit without exposing details or settling before child close", async () => {
  const attempted = [];
  const h = harness({ emit: (record) => {
    attempted.push(record);
    if (record.code !== "collector-started") throw new Error(SENTINEL);
  } });
  h.child.kill = (signal) => { h.child.kills.push(signal); return true; };
  let settled = false;
  h.promise.then(() => { settled = true; });
  try {
    h.child.emit("spawn");
    assert.doesNotThrow(() => h.child.stdout.write(JSON.stringify(event({
      exceptions: [{ message: SENTINEL }],
      event: { request: { url: `https://example.test/?code=${SENTINEL}` } },
    }))));
    assert.deepEqual(h.child.kills, ["SIGKILL"]);
    assert.equal(h.child.stdout.destroyed, true);
    assert.equal(h.child.stderr.destroyed, true);
    assert.deepEqual(attempted, [{ code: "collector-started" }, expected(), { code: "child-failure" }]);
    assert.equal(JSON.stringify(attempted).includes(SENTINEL), false);
    await Promise.resolve();
    assert.equal(settled, false, "throwing emit must not bypass confirmed child closure");
    h.child.stdout.emit("data", Buffer.from(JSON.stringify(event())));
    h.child.emit("error", new Error(SENTINEL));
    assert.equal(attempted.length, 3);
  } finally { h.child.close(null); }
  assert.equal(await h.promise, "child-failure");
  assertClean(h);
});

function runCliWithFailedOutput(mode) {
  const moduleUrl = new URL("../../scripts/cloudflare-migration/auth-tail.mjs", import.meta.url);
  const script = `
    import childProcess from "node:child_process";
    import { syncBuiltinESMExports } from "node:module";
    import { EventEmitter } from "node:events";
    import { PassThrough } from "node:stream";
    const originalWrite = process.stdout.write.bind(process.stdout);
    const baselineErrors = process.stdout.listenerCount("error");
    const records = [];
    let child, kills = 0, closed = false, uncaught = 0, callbacksCompleted = 0;
    let missingCallbacks = 0, importSettled = false, callbacksAtSettlement = -1;
    let cleanupAtFailure, settledWhileWritesPending;
    const privateError = () => Object.assign(new Error(${JSON.stringify(SENTINEL)}), { code: "EPIPE" });
    process.on("uncaughtException", () => { uncaught++; });
    process.stdout.write = (line, callback) => {
      records.push(JSON.parse(line));
      const index = records.length;
      if (index > 2) {
        queueMicrotask(() => callback?.());
        return false;
      }
      setTimeout(() => {
        if (index === 1 && ${JSON.stringify(mode)} === "event") {
          try { process.stdout.emit("error", privateError()); }
          finally { cleanupAtFailure = { kills, stdout: child.stdout.destroyed, stderr: child.stderr.destroyed }; }
        }
        if (index === 1 && ${JSON.stringify(mode)} === "callback") {
          if (callback) callback(privateError());
          else missingCallbacks++;
          callbacksCompleted++;
          cleanupAtFailure = { kills, stdout: child.stdout.destroyed, stderr: child.stderr.destroyed };
        } else {
          if (callback) callback();
          else missingCallbacks++;
          callbacksCompleted++;
        }
        if (index === 2) queueMicrotask(() => process.stdout.emit("error", privateError()));
      }, index === 1 ? 5 : 20);
      return false;
    };
    childProcess.spawn = () => {
      child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => {
        kills++;
        setTimeout(() => { closed = true; child.emit("close", null, "SIGKILL"); }, 2);
        return true;
      };
      queueMicrotask(() => {
        child.emit("spawn");
        child.stdout.write(${JSON.stringify(JSON.stringify(event()))});
        child.stderr.write(${JSON.stringify(SENTINEL)});
      });
      return child;
    };
    syncBuiltinESMExports();
    process.argv = [process.execPath, ${JSON.stringify(fileURLToPath(moduleUrl))}];
    const checkpoint = setTimeout(() => { settledWhileWritesPending = importSettled; }, 12);
    const fallback = setTimeout(() => { if (!closed) process.emit("SIGTERM"); }, 50);
    await import(${JSON.stringify(moduleUrl.href)}).then(() => {
      importSettled = true;
      callbacksAtSettlement = callbacksCompleted;
    });
    clearTimeout(fallback);
    clearTimeout(checkpoint);
    originalWrite(JSON.stringify({
      records, kills, closed, uncaught, callbacksCompleted, callbacksAtSettlement,
      missingCallbacks, cleanupAtFailure, settledWhileWritesPending,
      remainingErrors: process.stdout.listenerCount("error") - baselineErrors,
      signals: process.listenerCount("SIGINT") + process.listenerCount("SIGTERM"),
    }) + "\\n");
  `;
  return spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 2000, windowsHide: true });
}

for (const mode of ["event", "callback"]) {
  test(`CLI handles asynchronous output ${mode} failure until child close and pending writes settle`, () => {
    const result = runCliWithFailedOutput(mode);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.includes(SENTINEL), false);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.cleanupAtFailure, { kills: 1, stdout: true, stderr: true });
    assert.equal(report.uncaught, 0);
    assert.equal(report.kills, 1);
    assert.equal(report.closed, true);
    assert.equal(report.missingCallbacks, 0);
    assert.equal(report.callbacksCompleted, 2);
    assert.equal(report.callbacksAtSettlement, 2);
    assert.equal(report.settledWhileWritesPending, false);
    assert.equal(report.remainingErrors, 0);
    assert.equal(report.signals, 0);
    assert.deepEqual(report.records, [{ code: "collector-started" }, expected()]);
    assert.equal(result.status, 1);
  });
}
