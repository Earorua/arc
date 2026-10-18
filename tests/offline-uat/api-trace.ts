type ApiResult = { method: string; pathname: string; status: number | null; failure?: "abort" | "transport" };

export function createOfflineApiTrace() {
  const results: ApiResult[] = [];
  function record(result: ApiResult) {
    results.push(result);
    if (results.length > 20) results.shift();
  }
  return {
    async observe(request: Pick<Request, "method" | "url">, action: () => Promise<Response>): Promise<Response> {
      const pathname = new URL(request.url).pathname;
      if (!pathname.startsWith("/api/")) return action();
      const method = request.method;
      try {
        const response = await action();
        record({ method, pathname, status: response.status });
        return response;
      } catch (error) {
        let failure: "abort" | "transport" = "transport";
        try { if (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError") failure = "abort"; } catch { /* Preserve even unusual thrown objects. */ }
        record({ method, pathname, status: null, failure });
        throw error;
      }
    },
    snapshot: (): ApiResult[] => results.map((result) => ({ ...result })),
  };
}
