import { z } from "zod";
import {
  completionMutationSchema,
  workspaceMutationSchema,
  type CompletionMutation,
  type WorkspaceMutation,
} from "../contracts/cloud-state";

export const MAX_OFFLINE_MUTATIONS = 100;
export const MAX_OFFLINE_BYTES = 1024 * 1024;

const offlineQueueKey = "arc-offline-queue-v1";

export type OfflineMutation =
  | { id: string; kind: "save-setup"; payload: WorkspaceMutation; createdAt: string }
  | { id: string; kind: "complete-unit"; payload: CompletionMutation; createdAt: string };

export type EnqueueResult =
  | { accepted: true; queue: OfflineMutation[] }
  | { accepted: false; reason: "queue-full"; queue: OfflineMutation[] };

const baseMutationFields = {
  id: z.string().trim().min(8).max(128),
  createdAt: z.string().datetime(),
};

const offlineMutationSchema = z.discriminatedUnion("kind", [
  z.object({
    ...baseMutationFields,
    kind: z.literal("save-setup"),
    payload: workspaceMutationSchema,
  }).strict(),
  z.object({
    ...baseMutationFields,
    kind: z.literal("complete-unit"),
    payload: completionMutationSchema,
  }).strict(),
]).refine((mutation) => mutation.id === mutation.payload.mutationId, {
  message: "Offline mutation IDs must match their payload mutation IDs.",
});

function readStorage(storage?: Pick<Storage, "getItem">) {
  return storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
}

function writeStorage(storage?: Pick<Storage, "getItem" | "setItem">) {
  return storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
}

export function readOfflineQueue(storage?: Pick<Storage, "getItem">): OfflineMutation[] {
  try {
    const target = readStorage(storage);
    const raw = target?.getItem(offlineQueueKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const result = offlineMutationSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

export function enqueueOfflineMutation(
  input: OfflineMutation,
  storage?: Pick<Storage, "getItem" | "setItem">,
): EnqueueResult {
  const queue = readOfflineQueue(storage);
  const parsed = offlineMutationSchema.safeParse(input);
  if (!parsed.success) return { accepted: false, reason: "queue-full", queue };
  if (queue.some((mutation) => mutation.id === parsed.data.id)) {
    return { accepted: true, queue };
  }

  const next = [...queue, parsed.data];
  const serialized = JSON.stringify(next);
  if (next.length > MAX_OFFLINE_MUTATIONS
    || new TextEncoder().encode(serialized).byteLength > MAX_OFFLINE_BYTES) {
    return { accepted: false, reason: "queue-full", queue };
  }

  try {
    const target = writeStorage(storage);
    if (!target) return { accepted: false, reason: "queue-full", queue };
    target.setItem(offlineQueueKey, serialized);
    return { accepted: true, queue: next };
  } catch {
    return { accepted: false, reason: "queue-full", queue };
  }
}

export function removeOfflineMutation(
  id: string,
  storage?: Pick<Storage, "getItem" | "setItem">,
): OfflineMutation[] {
  const queue = readOfflineQueue(storage);
  const next = queue.filter((mutation) => mutation.id !== id);
  try {
    const target = writeStorage(storage);
    if (!target) return queue;
    target.setItem(offlineQueueKey, JSON.stringify(next));
    return next;
  } catch {
    return queue;
  }
}

export async function replayOfflineQueue(
  send: (mutation: OfflineMutation) => Promise<unknown>,
  storage?: Pick<Storage, "getItem" | "setItem">,
): Promise<OfflineMutation[]> {
  let remaining = readOfflineQueue(storage);
  for (const mutation of [...remaining]) {
    try {
      await send(mutation);
      remaining = removeOfflineMutation(mutation.id, storage);
    } catch {
      break;
    }
  }
  return remaining;
}
