const returnPages = new Set([
  "/", "/today", "/path", "/stack", "/proof", "/coach", "/history", "/setup",
  "/method", "/showcase", "/intelligence", "/admin",
]);
const redirectParameters = new Set(["next", "returnto", "redirect", "redirectto", "redirect_uri", "callbackurl"]);

function hasUnsafeCharacters(value: string): boolean {
  return [...value].some((character) => character === "\\" || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function isSafeDestination(value: string | null | undefined, depth = 0): value is string {
  if (!value || value.length > 4096 || depth > 4 || !value.startsWith("/") || value.startsWith("//")) return false;
  const pathname = value.split(/[?#]/u, 1)[0];
  if (!returnPages.has(pathname)) return false;

  // Check successive encodings too: neither a browser nor an OAuth provider
  // should be able to reveal a hidden backslash or control character later.
  let decoded = value;
  for (let pass = 0; pass < 8; pass += 1) {
    if (hasUnsafeCharacters(decoded)) return false;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
      if (pass === 7) return false;
      if (!/%[\da-f]{2}/iu.test(decoded)) {
        if (hasUnsafeCharacters(decoded)) return false;
        break;
      }
    } catch { return false; }
  }

  const url = new URL(value, "https://arc.invalid");
  for (const [key, destination] of url.searchParams) {
    if (redirectParameters.has(key.toLowerCase()) && !isSafeDestination(destination, depth + 1)) return false;
  }
  return true;
}

/** Keep navigation within known application pages, including their safe query/hash state. */
export function safeReturnTo(value: string | null | undefined, fallback = "/today"): string {
  return isSafeDestination(value) ? value : isSafeDestination(fallback) ? fallback : "/today";
}

export function signInHref(destination: string, reauthenticate = false): string {
  return `/sign-in?next=${encodeURIComponent(safeReturnTo(destination))}${reauthenticate ? "&reauth=1" : ""}`;
}

export function setupHref(destination: string): string {
  return `/setup?mode=create&returnTo=${encodeURIComponent(safeReturnTo(destination))}`;
}
