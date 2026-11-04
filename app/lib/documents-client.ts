import { z } from "zod";
import { documentApiErrorSchema, documentEndpointContracts, MAX_DOCUMENT_API_RESPONSE_BYTES, type DocumentEndpoint, type DocumentEndpointRequest, type DocumentEndpointResponse } from "../contracts/documents-api";
import { documentCapabilitiesSchema, type DocumentCapabilities } from "../contracts/document-capabilities";
import { MAX_PLANNING_RESPONSE_BYTES } from "../contracts/planning-api";

type ClientFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type ErrorCode = z.infer<typeof documentApiErrorSchema>["code"];
const messages: Record<ErrorCode, string> = {
  "invalid-request": "资料请求无效，请检查填写内容。", unauthenticated: "请登录后管理私人资料。",
  forbidden: "无法执行此资料操作。", "not-found": "资料不存在或已不可访问。", conflict: "资料版本已变化，请重新读取并核对。",
  gone: "资料依据已失效，请重新预览。", "payload-too-large": "资料超过大小上限。", "invalid-content": "部分来源或内容需要重新核对。",
  "quota-exceeded": "资料额度或等待队列已满，可稍后重试或手动整理。", unavailable: "分析或资料服务暂不可用，可保留已保存内容并手动整理。",
};
export class DocumentClientError extends Error {
  constructor(readonly code: ErrorCode, readonly status: number) { super(messages[code]); }
}
export interface DocumentsClient {
  request<K extends DocumentEndpoint>(endpoint: K, input: DocumentEndpointRequest<K>, signal?: AbortSignal): Promise<DocumentEndpointResponse<K>>;
  capabilities(signal?: AbortSignal): Promise<DocumentCapabilities>;
}
function invalidResponse(): Error { return new Error("资料服务返回了无效响应。"); }
async function readResponse(response: Response, maximum: number, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted();
  if (!response.body) throw invalidResponse();
  const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read(); signal?.throwIfAborted(); if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel().catch(() => undefined); throw invalidResponse(); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch { signal?.throwIfAborted(); throw invalidResponse(); }
  finally { signal?.removeEventListener("abort", abort); reader.releaseLock(); }
}
export function createDocumentsClient(options: { fetch?: ClientFetch } = {}): DocumentsClient {
  const fetcher = options.fetch ?? ((input, init) => fetch(input, init));
  async function call<T>(path: string, init: RequestInit, schema: z.ZodType<T>, maximum = MAX_DOCUMENT_API_RESPONSE_BYTES): Promise<T> {
    init.signal?.throwIfAborted();
    const response = await fetcher(path, { ...init, cache: "no-store", credentials: "include", headers: init.body ? { "content-type": "application/json" } : undefined });
    if (init.signal?.aborted) { await response.body?.cancel().catch(() => undefined); init.signal.throwIfAborted(); }
    const body = await readResponse(response, maximum, init.signal ?? undefined);
    if (!response.ok) {
      const error = z.object({ error: documentApiErrorSchema }).strict().safeParse(body);
      if (!error.success || error.data.error.status !== response.status) throw invalidResponse();
      throw new DocumentClientError(error.data.error.code, response.status);
    }
    const parsed = schema.safeParse(body); if (!parsed.success) throw invalidResponse(); return parsed.data;
  }
  return {
    async request<K extends DocumentEndpoint>(endpoint: K, input: DocumentEndpointRequest<K>, signal?: AbortSignal): Promise<DocumentEndpointResponse<K>> {
      const contract = documentEndpointContracts[endpoint];
      const parsed = contract.request.parse(input);
      const remaining = { ...parsed } as Record<string, unknown>;
      const path = contract.path.replace(/\[([a-zA-Z]+)\]/gu, (_, key: string) => {
        const value = remaining[key]; if (typeof value !== "string") throw new Error("资料请求缺少必要引用。");
        delete remaining[key]; return encodeURIComponent(value);
      });
      const query = new URLSearchParams();
      if (contract.method === "GET") for (const [key, value] of Object.entries(remaining)) if (value !== undefined) query.set(key, String(value));
      const maximum = endpoint === "generatePlanning" || endpoint === "materialReplan" ? MAX_PLANNING_RESPONSE_BYTES : MAX_DOCUMENT_API_RESPONSE_BYTES;
      return call(path + (query.size ? `?${query.toString()}` : ""), { method: contract.method, signal,
        ...(contract.method === "GET" ? {} : { body: JSON.stringify(remaining) }) }, contract.response as unknown as z.ZodType<DocumentEndpointResponse<K>>, maximum);
    },
    capabilities: (signal) => call("/api/documents/capabilities", { method: "GET", signal }, documentCapabilitiesSchema),
  };
}
export const documentsClient = createDocumentsClient();
