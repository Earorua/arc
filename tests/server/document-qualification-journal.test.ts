// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQualificationJournal } from "../../scripts/materials-qualification-journal";
const fault = vi.hoisted(() => ({ shortWrite: false }));
vi.mock("node:fs", async load => {
  const fs = await load<typeof import("node:fs")>();
  return { ...fs, writeSync: (fd: number, content: string, position: number | undefined, encoding: BufferEncoding) =>
    fs.writeSync(fd, fault.shortWrite ? content.slice(0, 1) : content, position, encoding) };
});
const temporary: string[] = [];
afterEach(() => {
  fault.shortWrite = false;
  for (const directory of temporary.splice(0)) {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + "\\") && !resolve(directory).startsWith(resolve(tmpdir()) + "/")) throw new Error("unexpected temporary directory");
    rmSync(directory, { recursive: true, force: true });
  }
});
describe("qualification durable journal", () => {
  it("reserves a unique run directory and retains an unresolved reservation across interruption", async () => {
    const base = mkdtempSync(join(tmpdir(), "arc-qualification-test-")); temporary.push(base);
    const journal = createQualificationJournal(base, "run-a");
    await journal.checkpoint({ type: "reservation", runId: "run-a", documentId: "resume-01", textVersionId: "text-resume-01", state: "reserved", reservedMicroUsd: 123, timestamp: "2026-11-04T08:00:00.000Z" });
    expect(JSON.parse(readFileSync(join(journal.directory, "ledger.jsonl"), "utf8").trim())).toMatchObject({ state: "reserved", reservedMicroUsd: 123 });
    expect(() => createQualificationJournal(base, "run-a")).toThrow("qualification-run-already-exists");
  });
  it("rejects path traversal and a checkpoint for a different run", async () => {
    const base = mkdtempSync(join(tmpdir(), "arc-qualification-test-")); temporary.push(base);
    expect(() => createQualificationJournal(base, "../escape")).toThrow();
    const journal = createQualificationJournal(base, "run-a");
    await expect(journal.checkpoint({ type: "run-start", runId: "other", timestamp: "2026-11-04T08:00:00.000Z" })).rejects.toThrow();
  });
  it("rejects a short disk write before the runner can advance to another inference", async () => {
    const base = mkdtempSync(join(tmpdir(), "arc-qualification-test-")); temporary.push(base);
    const journal = createQualificationJournal(base, "run-a");
    fault.shortWrite = true;
    await expect(journal.checkpoint({ type: "settlement", runId: "run-a", documentId: "resume-01",
      state: "settled", actualMicroUsd: 1, timestamp: "2026-11-04T08:00:00.000Z" })).rejects.toThrow("qualification-short-write");
    expect(() => createQualificationJournal(base, "run-a")).toThrow("qualification-run-already-exists");
  });
});
