import { open } from "node:fs/promises";
import { TextDecoder } from "node:util";
import { evaluateCandidateBatch, loadReviewedReferences, errorReport } from "./candidate-evaluator.mjs";
import { MAX_BATCH_BYTES } from "./candidate-input.mjs";

/** Read at most limit+1 bytes even if a file grows after stat; no unbounded readFile. */
async function readBoundedJson(file) {
  const handle = await open(file, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BATCH_BYTES) throw new Error("input-file-size");
    const bytes = Buffer.alloc(MAX_BATCH_BYTES + 1); let count = 0;
    while (count < bytes.length) {
      const chunk = await handle.read(bytes, count, bytes.length - count, null);
      if (!chunk.bytesRead) break; count += chunk.bytesRead;
    }
    if (count > MAX_BATCH_BYTES) throw new Error("input-file-size");
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, count)); }
    catch { throw new Error("input-encoding"); }
    try { return JSON.parse(text); } catch { throw new Error("input-json"); }
  } finally { await handle.close(); }
}

try {
  if (process.argv.length !== 3) throw new Error("cli-usage");
  const input = await readBoundedJson(process.argv[2]);
  const references = await loadReviewedReferences();
  const report = evaluateCandidateBatch(input, references);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "error" ? 2 : report.passed ? 0 : 1;
} catch (error) {
  const code = ["input-file-size", "input-json", "input-encoding", "cli-usage"].includes(error.message) ? error.message
    : error.message?.startsWith("reference-integrity:") ? "reference-integrity" : "input-file-unavailable";
  console.log(JSON.stringify(errorReport(code), null, 2)); process.exitCode = 2;
}
