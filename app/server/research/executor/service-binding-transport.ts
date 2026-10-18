import { BRIDGE_BODY_LIMITS, readBridgeBody } from "./body";
import type { ResearchBridgeConnection, ResearchBridgeEnvironment } from "./connection-config";

export type ResearchBridgeTarget = "site" | "executor";
export type ResearchServiceBinding = { fetch(request: Request): Promise<Response> };

const UNAVAILABLE = "Research bridge transport unavailable";
const ROUTES: Readonly<Record<ResearchBridgeTarget, ReadonlySet<string>>> = {
  executor: new Set(["submit", "status", "close", "result", "acknowledge"]
    .map(operation => `/internal/research-bridge/${operation}`)),
  site: new Set(["begin", "accepted", "complete", "metadata", "maintenance", "outbox"]
    .map(operation => `/api/internal/research-bridge/${operation}`)),
};

function validTarget(value: unknown): value is ResearchBridgeTarget {
  return value === "site" || value === "executor";
}

function validOrigin(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 256) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === "/" && value === url.origin;
  } catch { return false; }
}

function cancelBody(message: Pick<Request, "body">): void {
  void message.body?.cancel().catch(() => undefined);
}

export function createResearchServiceBindingFetch(
  binding: ResearchServiceBinding,
  peerOrigin: string,
  target: ResearchBridgeTarget,
): typeof fetch {
  let bindingFetch: ResearchServiceBinding["fetch"];
  try {
    if (!validTarget(target) || !validOrigin(peerOrigin) || !binding || typeof binding !== "object"
      || typeof binding.fetch !== "function") throw new Error();
    bindingFetch = binding.fetch;
  } catch { throw new Error(UNAVAILABLE); }

  return async (input, init) => {
    try {
      if (!(input instanceof Request) || init !== undefined) throw new Error();
      const url = new URL(input.url);
      if (input.method !== "POST" || input.redirect !== "manual" || url.origin !== peerOrigin
        || url.protocol !== "https:" || url.username || url.password || url.search || url.hash
        || input.headers.has("origin") || !ROUTES[target].has(url.pathname)) throw new Error();
      const body = await readBridgeBody(input, { maxBytes: BRIDGE_BODY_LIMITS.request,
        timeoutMs: 5_000, signal: input.signal });
      if (input.signal.aborted) throw new DOMException(UNAVAILABLE, "AbortError");
      const forwarded = new Request(input.url, { method: "POST", redirect: "manual", headers: input.headers,
        body: new Uint8Array(body), signal: input.signal });
      const response = await bindingFetch.call(binding, forwarded);
      if (!(response instanceof Response)) throw new Error();
      if (input.signal.aborted || response.redirected || (response.status >= 300 && response.status <= 399)) {
        cancelBody(response);
        throw new Error();
      }
      return response;
    } catch (error) {
      if ((input instanceof Request && input.signal.aborted)
        || (error instanceof DOMException && error.name === "AbortError")) {
        throw new DOMException(UNAVAILABLE, "AbortError");
      }
      throw new Error(UNAVAILABLE);
    }
  };
}

export function resolveResearchBridgeFetch(
  environment: ResearchBridgeEnvironment,
  connection: ResearchBridgeConnection,
  target: ResearchBridgeTarget,
  legacyOverride?: typeof fetch,
): typeof fetch | null {
  try {
    if (!validTarget(target)) return null;
    const mode = environment.ARC_AI_RESEARCH_BRIDGE_TRANSPORT;
    if (mode === undefined) {
      const transport = legacyOverride ?? globalThis.fetch;
      return typeof transport === "function" ? transport : null;
    }
    if (mode !== "service-binding-v1") return null;
    const binding = target === "executor" ? environment.ARC_RESEARCH_EXECUTOR : environment.ARC_RESEARCH_SITE;
    if (!binding) return null;
    return createResearchServiceBindingFetch(binding,
      target === "executor" ? connection.executorOrigin : connection.siteOrigin, target);
  } catch { return null; }
}
