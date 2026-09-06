const KEY_URL = "https://openrouter.ai/api/v1/key";
const RESEARCH_URL = "https://openrouter.ai/api/v1/chat/completions";
const KEY_MAX_BYTES = 32_768;
const KEY_TIMEOUT_MS = 10_000;

export type SafeFailureCode = "key-invalid" | "key-policy-denied" | "key-check-failed" | "transport-denied" | "validation-incomplete";
export class SafeValidationError extends Error {
  constructor(readonly code: SafeFailureCode) { super(code); this.name = "SafeValidationError"; }
}
export function validateKey(key: unknown): asserts key is string {
  if (typeof key !== "string" || !/^[A-Za-z0-9._-]{1,512}$/u.test(key)) throw new SafeValidationError("key-invalid");
}

/** Inspect only documented safety fields. Labels and other opaque metadata are ignored. */
export function verifyKeyPolicy(payload: unknown) {
  const data = payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload ? payload.data : null;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new SafeValidationError("key-policy-denied");
  const value = data as Record<string, unknown>;
  if (typeof value.limit !== "number" || !Number.isFinite(value.limit) || value.limit <= 0 || value.limit > 5
    || value.limit_remaining !== value.limit || value.limit_reset !== null || value.usage !== 0
    || value.is_management_key !== false || (value.is_provisioning_key !== undefined && value.is_provisioning_key !== false)
    || value.byok_usage !== 0) throw new SafeValidationError("key-policy-denied");
  if (value.expires_at !== undefined && value.expires_at !== null
    && (typeof value.expires_at !== "string" || !Number.isFinite(Date.parse(value.expires_at)) || Date.parse(value.expires_at) <= Date.now())) {
    throw new SafeValidationError("key-policy-denied");
  }
}

export function createGuardedTransport(key: string, fetch: typeof globalThis.fetch) {
  validateKey(key);
  let checked = false;
  let getCount = 0;
  let postCount = 0;
  let keyHttpStatus: number | null = null;
  let researchHttpStatus: number | null = null;
  const cancel = (response: Response) => { void response.body?.cancel().catch(() => undefined); };
  const guardedFetch: typeof globalThis.fetch = async (url, init) => {
    const method = init?.method;
    if (typeof url !== "string" || init?.redirect !== "error"
      || new Headers(init.headers).get("authorization") !== `Bearer ${key}`
      || (url !== KEY_URL && url !== RESEARCH_URL)
      || (url === KEY_URL && (method !== "GET" || getCount !== 0 || init.body != null))
      || (url === RESEARCH_URL && (method !== "POST" || !checked || postCount !== 0 || typeof init.body !== "string"))) {
      throw new SafeValidationError("transport-denied");
    }
    if (url === KEY_URL) getCount++; else postCount++;
    let response: Response;
    try { response = await fetch(url, init); } catch { throw new SafeValidationError(url === KEY_URL ? "key-check-failed" : "transport-denied"); }
    if (url === KEY_URL) keyHttpStatus = response.status; else researchHttpStatus = response.status;
    if (response.redirected || response.status >= 300 && response.status < 400) { cancel(response); throw new SafeValidationError("transport-denied"); }
    return response;
  };
  async function inspectKey() {
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let complete = false;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new SafeValidationError("key-check-failed")); }, KEY_TIMEOUT_MS);
    });
    try {
      const response = await Promise.race([guardedFetch(KEY_URL, { method: "GET", redirect: "error", headers: { Authorization: `Bearer ${key}` }, signal: controller.signal })
        .then((response) => { if (controller.signal.aborted) { cancel(response); throw new SafeValidationError("key-check-failed"); } return response; }), deadline]);
      const claimed = response.headers.get("content-length");
      if (response.status !== 200 || !response.body || claimed !== null && (!/^\d+$/u.test(claimed) || Number(claimed) > KEY_MAX_BYTES)) {
        cancel(response); throw new SafeValidationError("key-check-failed");
      }
      reader = response.body.getReader();
      const bodyReader = reader;
      const read = async () => {
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let bytes = 0;
        let body = "";
        while (true) {
          const chunk = await bodyReader.read();
          if (chunk.done) { complete = true; break; }
          bytes += chunk.value.byteLength;
          if (bytes > KEY_MAX_BYTES) throw new SafeValidationError("key-check-failed");
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
        verifyKeyPolicy(JSON.parse(body));
        checked = true;
      };
      await Promise.race([read(), deadline]);
    } catch (error) { throw error instanceof SafeValidationError ? error : new SafeValidationError("key-check-failed"); }
    finally {
      clearTimeout(timer!);
      if (!complete) { controller.abort(); void reader?.cancel().catch(() => undefined); }
      try { reader?.releaseLock(); } catch { /* Pending cancelled reads cannot retain a credential. */ }
    }
  }
  return { fetch: guardedFetch, inspectKey,
    counts: () => ({ getCount, postCount, keyHttpStatus, researchHttpStatus }),
    clear: () => { key = ""; checked = false; },
  };
}
