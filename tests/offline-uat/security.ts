export function allowsHarnessRequest(request: Request, origin: string, nonce: string): boolean {
  try {
    const expected = new URL(origin);
    if (expected.hostname !== "127.0.0.1" || expected.protocol !== "http:"
      || new URL(request.url).origin !== expected.origin || request.headers.get("host") !== expected.host) return false;
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") return false;
    const suppliedOrigin = request.headers.get("origin");
    if (suppliedOrigin && suppliedOrigin !== expected.origin) return false;
    if (request.method === "GET" || request.method === "HEAD") return true;
    return suppliedOrigin === expected.origin && site === "same-origin"
      && nonce.length >= 16 && request.headers.get("x-arc-uat-control") === nonce
      && /^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get("content-type") ?? "");
  } catch { return false; }
}

export function allowsApplicationFetch(input: string | URL | Request, origin: string): boolean {
  try {
    const value = input instanceof Request ? input.url : String(input);
    const url = new URL(value, origin);
    return new URL(origin).hostname === "127.0.0.1" && url.origin === origin && !url.username && !url.password;
  } catch { return false; }
}
