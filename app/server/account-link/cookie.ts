export const ACCOUNT_LINK_COOKIE = "__Host-arc_link_intent";

export function serializeAccountLinkCookie(
  value: string,
  maxAgeSeconds: number,
): string {
  return `${ACCOUNT_LINK_COOKIE}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

export function clearAccountLinkCookie(): string {
  return `${ACCOUNT_LINK_COOKIE}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

export function readAccountLinkCookie(headers: Headers): string | null {
  const cookies = headers.get("cookie")?.split(";") ?? [];
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.trim().split("=");
    if (name !== ACCOUNT_LINK_COOKIE) continue;

    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return null;
    }
  }
  return null;
}
