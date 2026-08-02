import { describe, expect, it, vi } from "vitest";
import type { OfflineMutation } from "../../app/lib/offline-queue";
import {
  MAX_OFFLINE_BYTES,
  MAX_OFFLINE_MUTATIONS,
  enqueueOfflineMutation,
  readOfflineQueue,
  removeOfflineMutation,
  replayOfflineQueue,
} from "../../app/lib/offline-queue";

class MemoryStorage {
  readonly values = new Map<string, string>();
  writes = 0;

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.writes += 1;
    this.values.set(key, value);
  }
}

function completion(id: string, skillIds = ["react"]): OfflineMutation {
  return {
    id,
    kind: "complete-unit",
    createdAt: "2026-07-28T00:00:00.000Z",
    payload: {
      mutationId: id,
      unitId: `unit-${id}`,
      title: `Unit ${id}`,
      deliverable: `Deliverable ${id}`,
      skillIds,
    },
  };
}

describe("offline mutation queue", () => {
  it("parses valid entries, discards malformed entries, and deduplicates IDs", () => {
    const storage = new MemoryStorage();
    storage.setItem("arc-offline-queue-v1", JSON.stringify([
      completion("mutation-001"),
      { id: "bad", kind: "unknown" },
    ]));

    expect(readOfflineQueue(storage)).toEqual([completion("mutation-001")]);
    const first = enqueueOfflineMutation(completion("mutation-002"), storage);
    const duplicate = enqueueOfflineMutation(completion("mutation-002"), storage);

    expect(first.accepted).toBe(true);
    expect(duplicate.accepted).toBe(true);
    expect(duplicate.queue.map((item) => item.id)).toEqual(["mutation-001", "mutation-002"]);
  });

  it("replays FIFO with original mutation IDs and removes only accepted items", async () => {
    const storage = new MemoryStorage();
    for (const id of ["mutation-001", "mutation-002", "mutation-003"]) {
      enqueueOfflineMutation(completion(id), storage);
    }
    const send = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("offline"));

    const result = await replayOfflineQueue(send, storage);

    expect(send.mock.calls.map(([item]) => item.id)).toEqual(["mutation-001", "mutation-002"]);
    expect(result.map((item) => item.id)).toEqual(["mutation-002", "mutation-003"]);
    expect(readOfflineQueue(storage)).toEqual(result);
    expect(removeOfflineMutation("mutation-002", storage).map((item) => item.id)).toEqual(["mutation-003"]);
  });

  it("rejects the newest mutation at the count cap without evicting older work", () => {
    const storage = new MemoryStorage();
    for (let index = 0; index < MAX_OFFLINE_MUTATIONS; index += 1) {
      const result = enqueueOfflineMutation(completion(`mutation-${String(index).padStart(3, "0")}`), storage);
      expect(result.accepted).toBe(true);
    }
    const before = readOfflineQueue(storage);
    const writesBefore = storage.writes;

    const rejected = enqueueOfflineMutation(completion("mutation-newest"), storage);

    expect(rejected).toEqual({ accepted: false, reason: "queue-full", queue: before });
    expect(storage.writes).toBe(writesBefore);
    expect(readOfflineQueue(storage)).toEqual(before);
  });

  it("enforces the UTF-8 byte cap below the count cap and stays read-only", () => {
    const storage = new MemoryStorage();
    const wideSkill = "界".repeat(120);
    const skillIds = Array.from({ length: 32 }, () => wideSkill);
    let rejected: ReturnType<typeof enqueueOfflineMutation> | null = null;

    for (let index = 0; index < MAX_OFFLINE_MUTATIONS; index += 1) {
      const before = storage.writes;
      const result = enqueueOfflineMutation(
        completion(`wide-mutation-${String(index).padStart(3, "0")}`, skillIds),
        storage,
      );
      if (!result.accepted) {
        rejected = result;
        expect(storage.writes).toBe(before);
        break;
      }
    }

    expect(rejected).toMatchObject({ accepted: false, reason: "queue-full" });
    expect(rejected?.queue.length).toBeLessThan(MAX_OFFLINE_MUTATIONS);
    expect(new TextEncoder().encode(JSON.stringify(rejected?.queue)).byteLength).toBeLessThanOrEqual(MAX_OFFLINE_BYTES);
  });
});
