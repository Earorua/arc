import { z } from "zod";
import { getAuth } from "./runtime";

const sessionPayloadSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email(),
  }),
});

export type ArcUser = z.infer<typeof sessionPayloadSchema>["user"];
export type SessionReader = (headers: Headers) => Promise<unknown>;

export class UnauthenticatedError extends Error {
  readonly code = "UNAUTHENTICATED";

  constructor() {
    super("An Arc account is required for this action.");
    this.name = "UnauthenticatedError";
  }
}

async function readRuntimeSession(headers: Headers): Promise<unknown> {
  return getAuth().api.getSession({ headers });
}

export async function getArcUser(
  headers: Headers,
  readSession: SessionReader = readRuntimeSession,
): Promise<ArcUser | null> {
  const session = await readSession(headers);
  if (!session) return null;
  const parsed = sessionPayloadSchema.parse(session);
  return {
    id: parsed.user.id,
    name: parsed.user.name,
    email: parsed.user.email,
  };
}

export async function requireArcUser(
  headers: Headers,
  readSession: SessionReader = readRuntimeSession,
): Promise<ArcUser> {
  const user = await getArcUser(headers, readSession);
  if (!user) throw new UnauthenticatedError();
  return user;
}
