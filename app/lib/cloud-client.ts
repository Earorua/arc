import { z } from "zod";
import {
  cloudSnapshotSchema,
  cloudWorkspaceResponseSchema,
  completionMutationSchema,
  migrationRequestSchema,
  migrationResultSchema,
  workspaceMutationSchema,
  type CloudSnapshot,
  type MigrationResult,
  type SetupAnswersInput,
} from "../contracts/cloud-state";
import type { LearningUnit } from "../domain/learning";
import type { DemoState } from "./demo-store";
import type { OfflineMutation } from "./offline-queue";

const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1).max(64),
    message: z.string().min(1).max(240),
    requestId: z.string().min(1).max(128),
    action: z.enum(["refresh", "retry", "sign-in", "rebuild"]).optional(),
  }).strict(),
}).strict();

const snapshotResponseSchema = z.object({ snapshot: cloudSnapshotSchema }).strict();
const migrationResponseSchema = z.object({ result: migrationResultSchema }).strict();

export class ArcApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string,
    readonly action?: "refresh" | "retry" | "sign-in" | "rebuild",
  ) {
    super(message);
    this.name = "ArcApiError";
  }
}

export function isArcApiError(error: unknown): error is ArcApiError {
  return error instanceof ArcApiError;
}

type ArcFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type CloudClientOptions = {
  fetch: ArcFetch;
  createMutationId: () => string;
};

export interface ArcCloudClient {
  loadWorkspace(): Promise<CloudSnapshot | null>;
  importLocal(
    state: DemoState,
    resolution?: "reject" | "archive-import" | "activate-import",
    migrationId?: string,
  ): Promise<MigrationResult>;
  saveSetup(setup: SetupAnswersInput, mutationId?: string, signal?: AbortSignal): Promise<CloudSnapshot>;
  completeUnit(unit: LearningUnit, mutationId?: string): Promise<CloudSnapshot>;
  replay(mutation: OfflineMutation): Promise<CloudSnapshot>;
}

export function createArcCloudClient(options: Partial<CloudClientOptions> = {}): ArcCloudClient {
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));
  const createMutationId = options.createMutationId ?? (() => crypto.randomUUID());

  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit,
  ): Promise<T> {
    init.signal?.throwIfAborted();
    const response = await fetcher(path, {
      ...init,
      cache: "no-store",
      credentials: "include",
      headers: init.body
        ? { "content-type": "application/json", ...init.headers }
        : init.headers,
    });
    init.signal?.throwIfAborted();
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      init.signal?.throwIfAborted();
      throw new Error("Arc returned an invalid response.");
    }
    init.signal?.throwIfAborted();

    if (!response.ok) {
      const parsedError = apiErrorSchema.safeParse(payload);
      if (!parsedError.success) throw new Error("Arc returned an invalid response.");
      throw new ArcApiError(
        response.status,
        parsedError.data.error.code,
        parsedError.data.error.message,
        parsedError.data.error.requestId,
        parsedError.data.error.action,
      );
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new Error("Arc returned an invalid response.");
    return parsed.data;
  }

  async function sendSetup(setup: SetupAnswersInput, mutationId: string, signal?: AbortSignal) {
    const mutation = workspaceMutationSchema.parse({ mutationId, setup });
    const response = await request("/api/workspace", snapshotResponseSchema, {
      method: "PUT",
      body: JSON.stringify(mutation),
      signal,
    });
    return response.snapshot;
  }

  async function sendCompletion(unit: LearningUnit, mutationId: string) {
    const mutation = completionMutationSchema.parse({
      mutationId,
      unitId: unit.id,
      title: unit.title,
      deliverable: unit.deliverable,
      skillIds: unit.skillIds,
    });
    const response = await request("/api/learning/events", snapshotResponseSchema, {
      method: "POST",
      body: JSON.stringify(mutation),
    });
    return response.snapshot;
  }

  return {
    async loadWorkspace() {
      const response = await request("/api/workspace", cloudWorkspaceResponseSchema, { method: "GET" });
      return response.snapshot;
    },
    async importLocal(state, resolution = "reject", migrationId = createMutationId()) {
      const mutation = migrationRequestSchema.parse({
        migrationId,
        consent: true,
        state,
        conflictResolution: resolution,
      });
      const response = await request("/api/migrations/local-state", migrationResponseSchema, {
        method: "POST",
        body: JSON.stringify(mutation),
      });
      return response.result;
    },
    saveSetup(setup, mutationId = createMutationId(), signal) {
      return sendSetup(setup, mutationId, signal);
    },
    completeUnit(unit, mutationId = createMutationId()) {
      return sendCompletion(unit, mutationId);
    },
    async replay(mutation) {
      if (mutation.kind === "save-setup") {
        return sendSetup(mutation.payload.setup, mutation.payload.mutationId);
      }
      const response = await request("/api/learning/events", snapshotResponseSchema, {
        method: "POST",
        body: JSON.stringify(mutation.payload),
      });
      return response.snapshot;
    },
  };
}

export const arcCloudClient = createArcCloudClient();
