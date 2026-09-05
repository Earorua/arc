"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { researchEligibilityViewSchema } from "../contracts/research";

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const defaultFetch: Fetch = (input, init) => fetch(input, init);
const maxBytes = 2048;

export async function readResearchEligibility(signal: AbortSignal, fetcher: Fetch = defaultFetch): Promise<boolean> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => { void reader?.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) return false;
    const response = await fetcher("/api/intelligence/research/eligibility", { method: "GET", signal, credentials: "include", cache: "no-store" });
    const declared = response.headers.get("content-length");
    const json = /^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers.get("content-type") ?? "");
    if (!response.ok || !json || signal.aborted || declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maxBytes)) {
      void response.body?.cancel().catch(() => undefined); return false;
    }
    reader = response.body?.getReader();
    if (!reader) return false;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0; let text = "";
    while (!signal.aborted) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) { cancel(); return false; }
      text += decoder.decode(chunk.value, { stream: true });
    }
    if (signal.aborted) return false;
    const parsed = researchEligibilityViewSchema.safeParse(JSON.parse(text + decoder.decode()) as unknown);
    return parsed.success && parsed.data.eligible;
  } catch { cancel(); return false; }
  finally { signal.removeEventListener("abort", cancel); reader?.releaseLock(); }
}

export function useResearchEligibility({ userId, fetch: fetcher = defaultFetch }: { userId: string | null; fetch?: Fetch }) {
  const [snapshot, setSnapshot] = useState<{ owner: string; eligible: boolean; token: AbortController } | null>(null);
  const current = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    const token = new AbortController(); current.current = token;
    if (userId !== null) void readResearchEligibility(token.signal, fetcher).then((eligible) => {
      if (!token.signal.aborted && current.current === token) setSnapshot({ owner: userId, eligible, token });
    });
    return () => { token.abort(); };
  }, [userId, fetcher]);
  const resolved = userId !== null && snapshot?.owner === userId && !snapshot.token.signal.aborted;
  return { eligible: resolved ? snapshot.eligible : false, resolved };
}
