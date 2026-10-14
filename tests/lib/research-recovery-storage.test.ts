import { describe, expect, it, vi } from "vitest";
import {
  LEGACY_RESEARCH_RECOVERY_STORAGE_KEY,
  RESEARCH_RECOVERY_STORAGE_KEY,
  clearResearchRecovery,
  createKnownResearchRecovery,
  createPendingResearchRecovery,
  readLegacyResearchRecovery,
  readResearchRecovery,
  saveResearchRecovery,
} from "../../app/lib/research-recovery-storage";

const owner = "owner-a";
const input = { role: "Data Product Manager", locale: "en-US" as const };

describe("Research recovery storage", () => {
  const ownedStart = createPendingResearchRecovery(owner, { kind: "start", mutationId: "mutation-owned", ...input });
  const ownedKnown = createKnownResearchRecovery(owner, { runId: "research-run-1", ...input });

  it("round-trips strict pending start and retry identities without storing the account identifier", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    };
    const start = createPendingResearchRecovery(owner, { kind: "start", mutationId: "mutation-start", ...input });
    expect(saveResearchRecovery(adapter, start)).toBe(true);
    expect(storage.get(RESEARCH_RECOVERY_STORAGE_KEY)).not.toContain(owner);
    expect(readResearchRecovery(adapter, owner)).toEqual({ status: "found", record: start });

    const retry = createPendingResearchRecovery(owner, { kind: "retry", mutationId: "mutation-retry", sourceRunId: "research-run-1", ...input });
    expect(saveResearchRecovery(adapter, retry)).toBe(true);
    expect(readResearchRecovery(adapter, owner)).toEqual({ status: "found", record: retry });
  });

  it("round-trips a known run without requiring a mutation identity", () => {
    const storage = localStorage;
    storage.clear();
    const known = createKnownResearchRecovery(owner, { runId: "research-run-1", ...input });
    expect(saveResearchRecovery(storage, known)).toBe(true);
    expect(readResearchRecovery(storage, owner)).toEqual({ status: "found", record: known });
    storage.clear();
  });

  it.each([
    "not-json",
    JSON.stringify({ ...ownedStart, secret: "no" }),
    JSON.stringify({ ...ownedStart, recovery: { kind: "retry", mutationId: "mutation-a", ...input } }),
    JSON.stringify({ ...ownedKnown, runId: "../foreign" }),
    JSON.stringify({ ...ownedKnown, mutationId: "mutation-not-allowed" }),
  ])("clears invalid, unknown-key, or invalid-combination v2 data without returning it %#", (raw) => {
    const storage = { getItem: vi.fn(() => raw), setItem: vi.fn(), removeItem: vi.fn() };
    expect(readResearchRecovery(storage, owner)).toEqual({ status: "absent" });
    expect(storage.removeItem).toHaveBeenCalledWith(RESEARCH_RECOVERY_STORAGE_KEY);
  });

  it("clears a valid record for another owner without returning it", () => {
    const foreign = createPendingResearchRecovery("owner-b", { kind: "start", mutationId: "mutation-start", ...input });
    const storage = { getItem: vi.fn(() => JSON.stringify(foreign)), setItem: vi.fn(), removeItem: vi.fn() };
    expect(readResearchRecovery(storage, owner)).toEqual({ status: "absent" });
    expect(storage.removeItem).toHaveBeenCalledWith(RESEARCH_RECOVERY_STORAGE_KEY);
  });

  it("distinguishes an unavailable read from an absent slot", () => {
    const unavailable = { getItem: vi.fn(() => { throw new Error("private"); }), setItem: vi.fn(), removeItem: vi.fn() };
    expect(readResearchRecovery(unavailable, owner)).toEqual({ status: "unavailable" });
    expect(unavailable.removeItem).not.toHaveBeenCalled();
  });

  it("reports failed or oversized writes and never replaces the slot", () => {
    const pending = createPendingResearchRecovery(owner, { kind: "start", mutationId: "mutation-start", ...input });
    const storage = { getItem: vi.fn(), setItem: vi.fn(() => { throw new Error("quota"); }), removeItem: vi.fn() };
    expect(saveResearchRecovery(storage, pending)).toBe(false);
    expect(storage.removeItem).not.toHaveBeenCalled();
    const oversized = { ...pending, recovery: { ...pending.recovery, role: "界".repeat(1_000) } };
    const untouched = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    expect(saveResearchRecovery(untouched, oversized as typeof pending)).toBe(false);
    expect(untouched.setItem).not.toHaveBeenCalled();
  });

  it("enforces the cap in UTF-8 bytes rather than JavaScript characters", () => {
    const valid = createPendingResearchRecovery(owner, {
      kind: "start", mutationId: "mutation-start", role: "界".repeat(160), locale: "en-US",
    });
    const raw = JSON.stringify(valid) + " ".repeat(1_550);
    expect(raw.length).toBeLessThanOrEqual(2_048);
    expect(new TextEncoder().encode(raw).byteLength).toBeGreaterThan(2_048);
    const storage = { getItem: vi.fn(() => raw), setItem: vi.fn(), removeItem: vi.fn() };
    expect(readResearchRecovery(storage, owner)).toEqual({ status: "absent" });
    expect(storage.removeItem).toHaveBeenCalledWith(RESEARCH_RECOVERY_STORAGE_KEY);
  });

  it("reads only a strict bounded legacy v1 locator", () => {
    const legacy = { runId: "research-run-1", ...input };
    const storage = { getItem: vi.fn(() => JSON.stringify(legacy)), setItem: vi.fn(), removeItem: vi.fn() };
    expect(readLegacyResearchRecovery(storage)).toEqual({ status: "found", record: legacy });
    expect(storage.getItem).toHaveBeenCalledWith(LEGACY_RESEARCH_RECOVERY_STORAGE_KEY);
  });

  it("clears malformed legacy data", () => {
    const storage = { getItem: vi.fn(() => JSON.stringify({ runId: "research-run-1", ...input, content: "forged" })), setItem: vi.fn(), removeItem: vi.fn() };
    expect(readLegacyResearchRecovery(storage)).toEqual({ status: "absent" });
    expect(storage.removeItem).toHaveBeenCalledWith(LEGACY_RESEARCH_RECOVERY_STORAGE_KEY);
  });

  it("attempts to clear both current and legacy slots even when one removal throws", () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn((key: string) => {
      if (key === RESEARCH_RECOVERY_STORAGE_KEY) throw new Error("blocked");
    }) };
    clearResearchRecovery(storage);
    expect(storage.removeItem).toHaveBeenCalledWith(RESEARCH_RECOVERY_STORAGE_KEY);
    expect(storage.removeItem).toHaveBeenCalledWith(LEGACY_RESEARCH_RECOVERY_STORAGE_KEY);
  });
});
