import { z } from "zod";
import { BRIDGE_BODY_LIMITS, bridgeByteLength } from "./body";

export const BRIDGE_AUTH_PROTOCOL = "arc-research-bridge-v1";

const WINDOW_MS = 120_000;
const FUTURE_SKEW_MS = 30_000;
const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/u;
const HEX_NONCE = /^[0-9a-f]{32}$/u;
const HEX_SIGNATURE = /^[0-9a-f]{64}$/u;

const contextSchema = z.object({
  direction: z.enum(["site-to-executor", "executor-to-site"]),
  kind: z.enum(["request", "response"]),
  method: z.enum(["GET", "POST"]),
  path: z.string().min(1).max(256).regex(/^\/[A-Za-z0-9/_-]*$/u),
  audience: z.string().max(256).refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:"
        && url.origin === value
        && !url.username
        && !url.password;
    } catch {
      return false;
    }
  }),
  jobId: z.union([z.uuid(), z.literal("collection")]),
  status: z.number().int().min(200).max(599).nullable(),
}).strict().refine((value) => (
  value.kind === "request" ? value.status === null : value.status !== null
));

export type BridgeMessageContext = z.infer<typeof contextSchema>;

export type BridgeAuthErrorCode =
  | "invalid-config"
  | "invalid-message"
  | "expired"
  | "unauthorized"
  | "replay"
  | "unavailable";

export class BridgeAuthError extends Error {
  constructor(readonly code: BridgeAuthErrorCode) {
    super(`Research bridge authentication failure: ${code}`);
    this.name = "BridgeAuthError";
  }
}

export interface BridgeNonceStore {
  claim(input: {
    scope: string;
    nonce: string;
    expiresAt: number;
    now: number;
  }): Promise<boolean>;
}

interface MessageInput {
  context: BridgeMessageContext;
  body: Uint8Array;
  keyId: string;
  keyBytes: Uint8Array;
  now: () => number;
}

export type BridgeSignInput = MessageInput;

export interface BridgeVerifyInput extends MessageInput {
  headers: Headers;
  nonces: BridgeNonceStore;
}

interface MessageSnapshot {
  context: BridgeMessageContext;
  body: Uint8Array<ArrayBuffer>;
  key: Uint8Array<ArrayBuffer>;
  keyId: string;
  now: () => number;
}

function copyBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(value);
}

function toHex(value: ArrayBuffer | Uint8Array<ArrayBufferLike>): string {
  const data = value instanceof Uint8Array ? value : new Uint8Array(value);
  return Array.from(
    data,
    (item) => item.toString(16).padStart(2, "0"),
  ).join("");
}

function fromHex(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function readClock(now: () => number): number {
  const value = now();
  if (
    !Number.isSafeInteger(value)
    || value < 0
    || value > Number.MAX_SAFE_INTEGER - 180_000
  ) {
    throw new BridgeAuthError("invalid-config");
  }
  return value;
}

function snapshotMessage(input: MessageInput): MessageSnapshot {
  if (
    typeof input.keyId !== "string"
    || !KEY_ID.test(input.keyId)
    || !(input.keyBytes instanceof Uint8Array)
    || typeof input.now !== "function"
  ) {
    throw new BridgeAuthError("invalid-config");
  }
  if (bridgeByteLength(input.keyBytes) !== 32) {
    throw new BridgeAuthError("invalid-config");
  }

  const context = contextSchema.safeParse(input.context);
  if (
    !context.success
    || !(input.body instanceof Uint8Array)
  ) {
    throw new BridgeAuthError("invalid-message");
  }
  if (bridgeByteLength(input.body) > BRIDGE_BODY_LIMITS.result) {
    throw new BridgeAuthError("invalid-message");
  }

  return {
    context: context.data,
    body: copyBytes(input.body),
    key: copyBytes(input.keyBytes),
    keyId: input.keyId,
    now: input.now,
  };
}

async function canonicalMessage(
  context: BridgeMessageContext,
  body: Uint8Array,
  keyId: string,
  timestamp: number,
  nonce: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const digest = toHex(await crypto.subtle.digest("SHA-256", copyBytes(body)));
  return new TextEncoder().encode(JSON.stringify([
    BRIDGE_AUTH_PROTOCOL,
    context.direction,
    context.kind,
    context.method,
    context.path,
    context.audience,
    context.jobId,
    context.status,
    keyId,
    timestamp,
    nonce,
    digest,
  ]));
}

function assertWithinWindow(timestamp: number, now: number): void {
  if (timestamp > now + FUTURE_SKEW_MS || now - timestamp > WINDOW_MS) {
    throw new BridgeAuthError("expired");
  }
}

export async function signBridgeMessage(input: BridgeSignInput): Promise<Headers> {
  try {
    const message = snapshotMessage(input);
    const timestamp = readClock(message.now);
    const nonce = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const encoded = await canonicalMessage(
      message.context,
      message.body,
      message.keyId,
      timestamp,
      nonce,
    );
    const key = await crypto.subtle.importKey(
      "raw",
      message.key,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = toHex(await crypto.subtle.sign("HMAC", key, encoded));

    return new Headers({
      "x-arc-bridge-key-id": message.keyId,
      "x-arc-bridge-time": String(timestamp),
      "x-arc-bridge-nonce": nonce,
      "x-arc-bridge-signature": signature,
    });
  } catch (error) {
    throw error instanceof BridgeAuthError
      ? error
      : new BridgeAuthError("unavailable");
  }
}

export async function verifyBridgeMessage(input: BridgeVerifyInput): Promise<void> {
  try {
    const message = snapshotMessage(input);
    const headers = new Headers(input.headers);
    const nonces = input.nonces;
    if (!nonces || typeof nonces.claim !== "function") {
      throw new BridgeAuthError("invalid-config");
    }

    const keyId = headers.get("x-arc-bridge-key-id");
    const time = headers.get("x-arc-bridge-time");
    const nonce = headers.get("x-arc-bridge-nonce");
    const signature = headers.get("x-arc-bridge-signature");

    if (
      keyId !== message.keyId
      || !time
      || !/^(0|[1-9][0-9]{0,15})$/u.test(time)
      || !nonce
      || !HEX_NONCE.test(nonce)
      || !signature
      || !HEX_SIGNATURE.test(signature)
    ) {
      throw new BridgeAuthError("unauthorized");
    }

    const timestamp = Number(time);
    if (!Number.isSafeInteger(timestamp)) {
      throw new BridgeAuthError("unauthorized");
    }
    assertWithinWindow(timestamp, readClock(message.now));

    const encoded = await canonicalMessage(
      message.context,
      message.body,
      keyId,
      timestamp,
      nonce,
    );
    const key = await crypto.subtle.importKey(
      "raw",
      message.key,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const verified = await crypto.subtle.verify(
      "HMAC",
      key,
      fromHex(signature),
      encoded,
    );
    if (!verified) throw new BridgeAuthError("unauthorized");

    const now = readClock(message.now);
    assertWithinWindow(timestamp, now);
    const accepted = await nonces.claim({
      scope: `${message.context.direction}:${keyId}`,
      nonce,
      expiresAt: timestamp + WINDOW_MS + 1,
      now,
    });
    if (accepted !== true) throw new BridgeAuthError("replay");

    assertWithinWindow(timestamp, readClock(message.now));
  } catch (error) {
    throw error instanceof BridgeAuthError
      ? error
      : new BridgeAuthError("unavailable");
  }
}
