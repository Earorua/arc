const RESEARCH_URL = "https://openrouter.ai/api/v1/chat/completions";
const RESEARCH_TIMEOUT_MS = 1_200_000;
const DESTROY_TIMEOUT_MS = 5_000;

export async function createNativeResearchTransport(nativeFetch, timeoutMs) {
  if (typeof nativeFetch !== "function" || timeoutMs !== RESEARCH_TIMEOUT_MS) {
    throw new Error("NATIVE_TRANSPORT_INVALID");
  }

  // Initialize Node's native fetch classes before loading the public Undici package.
  // The returned response remains the native fetch response; Undici supplies only
  // the per-request dispatcher.
  void globalThis.Response;
  const { Agent } = await import("undici");
  const dispatcher = new Agent({ headersTimeout: RESEARCH_TIMEOUT_MS, bodyTimeout: RESEARCH_TIMEOUT_MS });
  let destroyed;

  return Object.freeze({
    fetch: (url, init) => nativeFetch(url, url === RESEARCH_URL && init?.method === "POST"
      ? { ...init, dispatcher } : init),
    destroy: async () => {
      if (destroyed) return destroyed;
      const pending = Promise.resolve().then(() => dispatcher.destroy());
      pending.catch(() => undefined);
      destroyed = Promise.race([
        pending,
        new Promise((_, reject) => {
          const timer = setTimeout(() => reject(new Error("NATIVE_TRANSPORT_CLEANUP_TIMEOUT")), DESTROY_TIMEOUT_MS);
          pending.finally(() => clearTimeout(timer)).catch(() => undefined);
        }),
      ]);
      return destroyed;
    },
  });
}
