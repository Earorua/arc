import { env } from "cloudflare:workers";

export function requireD1(binding: D1Database | undefined): D1Database {
  if (!binding) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  return binding;
}

export function getD1(): D1Database {
  return requireD1(env.DB);
}
