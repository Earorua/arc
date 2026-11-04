/** Cloudflare Worker entry point for the Arc. Vinext application. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { WorkerEntrypoint } from "cloudflare:workers";
import { createDocumentRuntime, type DocumentEnvironment } from "../app/server/documents/runtime";
import { applyResponseSafety, resolveRequestId } from "../app/server/http/api-response";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  PROOF_ASSETS: R2Bucket;
  DOCUMENT_ASSETS?: R2Bucket;
  DOCUMENT_EXECUTOR?: Fetcher;
  ARC_DOCUMENT_BRIDGE_SECRET?: string;
  ARC_ENVIRONMENT?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  ARC_ADMIN_EMAILS?: string;
  ARC_AI_ENABLED?: string;
  ARC_AI_USER_DAILY_QUOTA?: string;
  ARC_AI_GLOBAL_DAILY_BUDGET_UNITS?: string;
  ARC_AI_RATE_LIMIT_PER_MINUTE?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const requestId = resolveRequestId(request.headers.get("X-Request-Id"));
    if (url.pathname.startsWith("/internal/documents/")) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return applyResponseSafety(response, requestId);
    }

    return applyResponseSafety(await handler.fetch(request, env, ctx), requestId);
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    if (!env.DOCUMENT_ASSETS) return;
    await createDocumentRuntime(env as unknown as DocumentEnvironment).maintenance();
  },
};

/** Only the named service binding can enter the signed document callback surface. */
export class DocumentSite extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    try { return await createDocumentRuntime(this.env as unknown as DocumentEnvironment).privateHandler(request); }
    catch { return new Response(null, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
  }
}
export default worker;
