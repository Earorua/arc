import { z } from "zod";
import {
  accountLinkPhaseSchema,
  accountLinkProviderSchema,
  INTERNAL_PROOF_TTL_MS,
  type AccountLinkPhase,
  type AccountLinkProvider,
} from "./contracts";

export type SignedLinkContext = {
  kind: "internal" | "oauth";
  intentId: string;
  userId: string;
  provider: AccountLinkProvider;
  phase: AccountLinkPhase;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

const signedLinkContextSchema = z
  .object({
    kind: z.enum(["internal", "oauth"]),
    intentId: z.string().trim().min(1).max(256),
    userId: z.string().trim().min(1).max(256),
    provider: accountLinkProviderSchema,
    phase: accountLinkPhaseSchema,
    issuedAt: z.number().finite().int(),
    expiresAt: z.number().finite().int(),
    nonce: z.string().trim().min(1).max(256),
  })
  .strict();

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const hkdfSalt = encoder.encode("Arc. account link v1");
const hkdfInfo = encoder.encode("arc-account-link-internal-proof-v1");

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) {
    throw new Error("Invalid signed link context");
  }

  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("Invalid signed link context");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveSigningKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: hkdfSalt,
      info: hkdfInfo,
    },
    keyMaterial,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign", "verify"],
  );
}

export function createAccountLinkCredential(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashAccountLinkCredential(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSignedLinkContext(
  secret: string,
  context: SignedLinkContext,
): Promise<string> {
  const payload = encoder.encode(
    JSON.stringify(signedLinkContextSchema.parse(context)),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", await deriveSigningKey(secret), payload),
  );
  return `${encodeBase64Url(payload)}.${encodeBase64Url(signature)}`;
}

export async function verifySignedLinkContext(
  secret: string,
  token: string,
  expectedKind: SignedLinkContext["kind"],
  now: number,
): Promise<SignedLinkContext> {
  const segments = token.split(".");
  if (segments.length !== 2 || segments.some((segment) => segment.length === 0)) {
    throw new Error("Invalid signed link context");
  }

  const payload = decodeBase64Url(segments[0]);
  const signature = decodeBase64Url(segments[1]);
  const validSignature = await crypto.subtle.verify(
    "HMAC",
    await deriveSigningKey(secret),
    signature,
    payload,
  );
  if (!validSignature) throw new Error("Invalid signed link context");

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(payload));
  } catch {
    throw new Error("Invalid signed link context");
  }
  const context = signedLinkContextSchema.parse(parsed);

  if (
    !Number.isFinite(now) ||
    context.kind !== expectedKind ||
    context.expiresAt < context.issuedAt ||
    context.issuedAt > now ||
    context.expiresAt < now ||
    (context.kind === "internal" &&
      context.expiresAt - context.issuedAt > INTERNAL_PROOF_TTL_MS)
  ) {
    throw new Error("Invalid signed link context");
  }

  return context;
}
