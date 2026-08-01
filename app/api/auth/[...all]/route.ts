import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "../../../server/auth/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export function isDirectAccountLinkRequest(request: Request) {
  return new URL(request.url).pathname === "/api/auth/link-social";
}

export async function POST(request: Request) {
  if (isDirectAccountLinkRequest(request)) {
    return new Response("Forbidden", {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
  return toNextJsHandler(getAuth()).POST(request);
}
