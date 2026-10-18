import { z } from "zod";
import type { RecoveryIdentity } from "./service";

const identifier = z.string().min(1).max(160);
const configurationSchema = z.object({
  operationId: identifier, sourceUserId: identifier, targetUserId: identifier,
  sourceAccountId: identifier, targetAccountId: identifier, primaryPathId: identifier,
  sourceProvider: z.enum(["github", "google"]), targetProvider: z.enum(["github", "google"]),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: z.number().int().positive(), expiresAt: z.number().int().positive(),
}).strict().refine((value) => value.sourceUserId !== value.targetUserId
  && value.sourceAccountId !== value.targetAccountId && value.sourceProvider !== value.targetProvider
  && value.expiresAt > value.issuedAt && value.expiresAt - value.issuedAt <= 3_600_000);
const commandSchema = z.object({ operationId: identifier, action: z.enum(["inspect", "apply"]) }).strict();
type Dependencies = {
  configuration?: string;
  now?: () => number;
  inspect: (input: RecoveryIdentity) => Promise<unknown>;
  apply: (input: RecoveryIdentity, now: number) => Promise<unknown>;
};
const reply = (body: unknown, status: number) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
});

async function authorized(request: Request, expectedHash: string) {
  const token = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  let difference = 0;
  for (let index = 0; index < 64; index++) difference |= actual.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  return difference === 0;
}

async function readBoundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing body");
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); throw new Error("oversized body"); }
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally { reader.releaseLock(); }
}

export function createAccountRecoveryHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const now = (dependencies.now ?? Date.now)();
    let configuration: z.infer<typeof configurationSchema>;
    try {
      configuration = configurationSchema.parse(JSON.parse(dependencies.configuration ?? "null"));
      if (configuration.issuedAt > now || configuration.expiresAt <= now || !await authorized(request, configuration.tokenHash)) {
        return reply({ error: "Not found" }, 404);
      }
    } catch { return reply({ error: "Not found" }, 404); }
    let command: z.infer<typeof commandSchema>;
    try {
      if (request.method !== "POST" || request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new Error("invalid content type");
      command = commandSchema.parse(await readBoundedBody(request));
      if (command.operationId !== configuration.operationId) throw new Error("wrong operation");
    } catch { return reply({ error: "Invalid recovery command" }, 400); }
    // Strip operator secrets before passing the bounded identity into the service.
    const { tokenHash: _tokenHash, issuedAt: _issuedAt, expiresAt: _expiresAt, ...identity } = configuration;
    void _tokenHash; void _issuedAt; void _expiresAt;
    try {
      return reply(command.action === "inspect"
        ? await dependencies.inspect(identity)
        : await dependencies.apply(identity, now), 200);
    } catch { return reply({ error: "Recovery preconditions failed; inspect before retrying" }, 409); }
  };
}
