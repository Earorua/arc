import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAuthTailFramer, projectAuthTailEvent } from "./auth-tail-format.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = fileURLToPath(new URL("../../node_modules/wrangler/wrangler-dist/cli.js", import.meta.url));
const config = fileURLToPath(new URL("../../dist/server/wrangler.json", import.meta.url));
const framingCodes = new Set(["invalid-framing", "frame-too-large", "invalid-json"]);

// spawnChild is the offline test seam. The CLI never accepts a command, worker,
// config, environment override, or other argument from its caller.
// emit is synchronous. Owners of asynchronous sinks must abort the supplied
// signal with reason "child-failure" when their sink reports an async error.
export function collectAuthTail({ spawnChild = spawn, emit, signal, timeoutMs = 300000 }) {
  const send = (record) => {
    try { emit(record); return true; }
    catch { return false; }
  };
  const withoutChild = (code) => {
    send({ code });
    return Promise.resolve(code);
  };
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) return withoutChild("child-failure");
  if (signal?.aborted) return withoutChild(signal.reason === "child-failure" ? "child-failure" : "collector-stopped");

  return new Promise((resolve) => {
    let child;
    let terminal;
    let childClosed = false;
    let settled = false;
    let stopping = false;
    let deadline;
    let inputEnded = false;
    // Preserve a BOM as input so framing rejects it; malformed UTF-8 also fails
    // closed instead of silently substituting replacement characters.
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    const framer = createAuthTailFramer((event) => {
      if (terminal) return;
      const projection = projectAuthTailEvent(event);
      if (projection && !send(projection)) stop("child-failure");
    });

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      signal?.removeEventListener("abort", onAbort);
      child?.removeListener("spawn", onSpawn);
      child?.removeListener("close", onClose);
      child?.removeListener("error", onError);
      child?.stdout.removeListener("error", onError);
      child?.stderr.removeListener("error", onError);
      resolve(terminal);
    }

    function stop(code) {
      if (terminal) return;
      terminal = code;
      clearTimeout(deadline);
      signal?.removeEventListener("abort", onAbort);
      child?.stdout.removeListener("data", onData);
      child?.stdout.removeListener("end", onEnd);
      child?.stderr.removeListener("data", drain);
      child?.stdout.destroy();
      child?.stderr.destroy();
      if (child && !childClosed) {
        // Immediate termination keeps the remote collection bounded. Keep error
        // handlers until close so shutdown races cannot expose an exception.
        // A native OS refusal is a cleanup failure: collection has stopped, but
        // we wait for actual close and never silently detach a surviving child.
        stopping = true;
        try { if (!child.kill("SIGKILL")) terminal = "child-failure"; }
        catch { terminal = "child-failure"; }
        stopping = false;
      }
      send({ code: terminal });
      if (!child || childClosed) finish();
    }

    function accept(text) {
      try { framer.push(text); }
      catch (error) { stop(framingCodes.has(error?.code) ? error.code : "child-failure"); }
    }

    function onData(chunk) {
      if (terminal) return;
      let text;
      try { text = decoder.decode(chunk, { stream: true }); }
      catch { stop("invalid-framing"); return; }
      accept(text);
    }

    function finishInput() {
      if (terminal || inputEnded) return;
      inputEnded = true;
      let text;
      try { text = decoder.decode(); }
      catch { stop("invalid-framing"); return; }
      accept(text);
      if (terminal) return;
      try { framer.end(); }
      catch (error) { stop(framingCodes.has(error?.code) ? error.code : "child-failure"); }
    }

    function onEnd() { finishInput(); stop("child-failure"); }
    function onError() { stop("child-failure"); }
    function onAbort() { stop(signal?.reason === "child-failure" ? "child-failure" : "collector-stopped"); }
    function drain() { /* Never retain or emit stderr. */ }
    function onSpawn() {
      if (!terminal && !send({ code: "collector-started" })) stop("child-failure");
    }
    function onClose() {
      childClosed = true;
      if (terminal) {
        if (!stopping) finish();
        return;
      }
      finishInput();
      stop("child-failure");
      finish();
    }

    try {
      child = spawnChild(process.execPath, [cli, "tail", "arc-v8-migration-shadow-20260922", "--format", "json", "--config", config], {
        cwd: root,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          WRANGLER_LOG: "error",
          WRANGLER_WRITE_LOGS: "false",
          WRANGLER_SEND_METRICS: "false",
          WRANGLER_SEND_ERROR_REPORTS: "false",
          CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
        },
      });
    } catch { stop("child-failure"); return; }
    child.once("spawn", onSpawn);
    child.once("close", onClose);
    child.on("error", onError);
    child.stdout.on("data", onData);
    child.stdout.once("end", onEnd);
    child.stdout.on("error", onError);
    child.stderr.on("data", drain);
    child.stderr.on("error", onError);
    deadline = setTimeout(() => stop("collector-timeout"), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

async function main() {
  const controller = new AbortController();
  let outputFailed = false;
  let pendingWrites = 0;
  let writesFinished;
  let result = "child-failure";
  const outputFailure = () => {
    outputFailed = true;
    process.exitCode = 1;
    controller.abort("child-failure");
  };
  const emit = (record) => {
    if (outputFailed) return;
    pendingWrites++;
    let completed = false;
    const complete = (error) => {
      if (completed) return;
      completed = true;
      pendingWrites--;
      if (error) outputFailure();
      if (pendingWrites === 0) writesFinished?.();
    };
    try { process.stdout.write(`${JSON.stringify(record)}\n`, complete); }
    catch { complete(true); }
  };
  const stop = () => controller.abort();
  // A broken output pipe must stop the private child, never become an uncaught
  // exception or trigger another write to a sink already known to have failed.
  process.stdout.on("error", outputFailure);
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    if (process.argv.length !== 2) emit({ code: "child-failure" });
    else result = await collectAuthTail({ emit, signal: controller.signal, timeoutMs: 300000 });
  } catch {
    emit({ code: "child-failure" });
  } finally {
    // Child closure can precede callbacks for queued writes. Keep the error
    // guard until all callbacks and their queued error events have run.
    if (pendingWrites > 0) await new Promise((resolve) => { writesFinished = resolve; });
    await new Promise((resolve) => setImmediate(resolve));
    process.stdout.removeListener("error", outputFailure);
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    process.exitCode = !outputFailed && result === "collector-stopped" ? 0 : 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
