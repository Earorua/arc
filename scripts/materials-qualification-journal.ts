import { closeSync, fsyncSync, mkdirSync, openSync, writeFileSync, writeSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { materialIdSchema } from "../app/contracts/documents";
import type { QualificationCheckpoint, QualificationResult } from "./materials-qualification-runner";

function writeFullyAndSync(descriptor: number, line: string) {
  const written = writeSync(descriptor, line, undefined, "utf8");
  if (written !== Buffer.byteLength(line, "utf8")) throw new Error("qualification-short-write");
  fsyncSync(descriptor);
}

/** Append-only local evidence. An existing run is never resumed or silently overwritten. */
export function createQualificationJournal(baseDirectory: string, runId: string) {
  if (!materialIdSchema.safeParse(runId).success) throw new Error("qualification-run-id-invalid");
  const base = resolve(baseDirectory), directory = resolve(base, runId);
  if (!directory.startsWith(base + sep)) throw new Error("qualification-directory-invalid");
  mkdirSync(base, { recursive: true });
  try { mkdirSync(directory); }
  catch { throw new Error("qualification-run-already-exists"); }
  const ledger = join(directory, "ledger.jsonl");
  writeFileSync(ledger, "", { flag: "wx", mode: 0o600 });
  return {
    directory,
    async checkpoint(value: QualificationCheckpoint) {
      if (value.runId !== runId) throw new Error("qualification-run-mismatch");
      const descriptor = openSync(ledger, "a");
      try { writeFullyAndSync(descriptor, JSON.stringify(value) + "\n"); }
      finally { closeSync(descriptor); }
    },
    finish(result: QualificationResult) {
      if (result.runId !== runId) throw new Error("qualification-run-mismatch");
      const descriptor = openSync(join(directory, "result.json"), "wx", 0o600);
      try { writeFullyAndSync(descriptor, JSON.stringify(result, null, 2) + "\n"); }
      finally { closeSync(descriptor); }
    },
  };
}
