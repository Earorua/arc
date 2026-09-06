const KEY_URL = "https://openrouter.ai/api/v1/key";
const CATALOG_URL = "https://openrouter.ai/api/v1/models/user";
const REQUESTED_MODEL = "openai/gpt-5.6-sol";
const DEADLINE_MS = 30_000;

type Diagnostic = {
  phase: "not-started" | "request" | "response" | "body" | "policy" | "complete";
  failure: "request-timeout" | "body-timeout" | "network-error" | "http-error" | "invalid-response" | "policy-denied" | null;
  elapsedMs: number;
};
type KeyObservation = { limitUsd: number | null; remainingUsd: number | null; usageUsd: number | null; byokUsageUsd: number | null };
type AccountReport = {
  mode: "account-check-only";
  outcome: "completed" | "incomplete";
  reason: "key-invalid" | "key-check-failed" | "key-policy-denied" | "catalog-check-failed" | null;
  timestamp: string;
  requestedModel: typeof REQUESTED_MODEL;
  modelListed: boolean | null;
  keyObservation: KeyObservation;
  keyHttpStatus: number | null;
  catalogHttpStatus: number | null;
  keyDiagnostics: Diagnostic;
  catalogDiagnostics: Diagnostic;
  realRequestCount: number;
  keyRequestCount: number;
  catalogRequestCount: number;
  researchRequestCount: 0;
  repairRequestCount: 0;
};

const diagnostic = (): Diagnostic => ({ phase: "not-started", failure: null, elapsedMs: 0 });
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const amount = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const cancelBody = (response: Response | undefined) => {
  try { void response?.body?.cancel().catch(() => undefined); } catch { /* Cancellation must not expose response details. */ }
};

/** Only these two fixed GETs exist here; no application or inference transport is loaded. */
export async function runAccountCheck({ key, fetch }: { key: unknown; fetch: typeof globalThis.fetch }): Promise<AccountReport> {
  const report: AccountReport = {
    mode: "account-check-only", outcome: "incomplete", reason: "key-check-failed", timestamp: new Date().toISOString(),
    requestedModel: REQUESTED_MODEL, modelListed: null,
    keyObservation: { limitUsd: null, remainingUsd: null, usageUsd: null, byokUsageUsd: null },
    keyHttpStatus: null, catalogHttpStatus: null, keyDiagnostics: diagnostic(), catalogDiagnostics: diagnostic(),
    realRequestCount: 0, keyRequestCount: 0, catalogRequestCount: 0, researchRequestCount: 0, repairRequestCount: 0,
  };

  async function readJson(endpoint: "key" | "catalog"): Promise<{ payload: unknown; valid: boolean }> {
    const detail = endpoint === "key" ? report.keyDiagnostics : report.catalogDiagnostics;
    const maxBytes = endpoint === "key" ? 32_768 : 8_388_608;
    const startedAt = Date.now();
    const controller = new AbortController();
    let response: Response | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let complete = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    detail.phase = "request";
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        detail.failure = detail.phase === "request" ? "request-timeout" : "body-timeout";
        controller.abort();
        reject(new Error("account-check-failed"));
      }, DEADLINE_MS);
    });
    try {
      report.realRequestCount++;
      if (endpoint === "key") report.keyRequestCount++; else report.catalogRequestCount++;
      const request = fetch(endpoint === "key" ? KEY_URL : CATALOG_URL, {
        method: "GET", redirect: "error", headers: { Authorization: "Bearer " + key }, signal: controller.signal,
      }).then((value) => {
        // A transport may ignore abort and resolve later; its response must be discarded.
        if (controller.signal.aborted) { cancelBody(value); throw new Error("account-check-failed"); }
        return value;
      }, () => {
        detail.failure ??= "network-error";
        throw new Error("account-check-failed");
      });
      response = await Promise.race([request, deadline]);
      detail.phase = "response";
      const status = response.status;
      if (!Number.isInteger(status) || status < 0 || status > 599) throw new Error("account-check-failed");
      if (endpoint === "key") report.keyHttpStatus = status; else report.catalogHttpStatus = status;
      if (response.redirected || status >= 300 && status < 400) throw new Error("account-check-failed");
      if (status !== 200) { detail.failure = "http-error"; throw new Error("account-check-failed"); }
      const claimed = response.headers.get("content-length");
      if (!response.body || claimed !== null && (!/^\d+$/u.test(claimed) || Number(claimed) > maxBytes)) throw new Error("account-check-failed");
      detail.phase = "body";
      reader = response.body.getReader();
      const bodyReader = reader;
      const read = async () => {
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let bytes = 0;
        let body = "";
        while (true) {
          let chunk: ReadableStreamReadResult<Uint8Array>;
          try { chunk = await bodyReader.read(); } catch {
            detail.failure ??= "network-error";
            throw new Error("account-check-failed");
          }
          if (controller.signal.aborted) throw new Error("account-check-failed");
          if (chunk.done) { complete = true; break; }
          bytes += chunk.value.byteLength;
          if (bytes > maxBytes) throw new Error("account-check-failed");
          body += decoder.decode(chunk.value, { stream: true });
        }
        body += decoder.decode();
        const payload: unknown = JSON.parse(body);
        if (record(payload) && "error" in payload && payload.error !== null) throw new Error("account-check-failed");
        // Also enforce elapsed time if synchronous decoding/parsing delayed the timer.
        if (Date.now() - startedAt >= DEADLINE_MS) {
          detail.failure = "body-timeout";
          throw new Error("account-check-failed");
        }
        return payload;
      };
      return { payload: await Promise.race([read(), deadline]), valid: true };
    } catch {
      detail.failure ??= detail.phase === "request" ? "network-error" : "invalid-response";
      return { payload: null, valid: false };
    } finally {
      clearTimeout(timer);
      detail.elapsedMs = Math.min(DEADLINE_MS, Math.max(0, Date.now() - startedAt));
      if (!complete) {
        controller.abort();
        if (reader) { void reader.cancel().catch(() => undefined); } else cancelBody(response);
      }
      try { reader?.releaseLock(); } catch { /* A pending cancelled read may still hold its lock. */ }
    }
  }

  try {
    if (typeof key !== "string" || !/^[A-Za-z0-9._-]{1,512}$/u.test(key)) {
      report.reason = "key-invalid";
      return report;
    }
    if (typeof fetch !== "function") return report;
    const keyResult = await readJson("key");
    if (!keyResult.valid) return report;
    report.keyDiagnostics.phase = "policy";
    const value = record(keyResult.payload) && record(keyResult.payload.data) ? keyResult.payload.data : {};
    const observation = report.keyObservation = {
      limitUsd: amount(value.limit), remainingUsd: amount(value.limit_remaining),
      usageUsd: amount(value.usage), byokUsageUsd: amount(value.byok_usage),
    };
    // This admission is metadata-only. Existing aggregate usage does not release an inference request.
    if (observation.limitUsd === null || observation.limitUsd <= 0 || observation.limitUsd > 5
      || observation.remainingUsd === null || observation.remainingUsd > observation.limitUsd
      || observation.usageUsd === null || observation.byokUsageUsd === null || value.limit_reset !== null
      || value.is_management_key !== false || (value.is_provisioning_key !== undefined && value.is_provisioning_key !== false)
      || (value.expires_at !== undefined && value.expires_at !== null
        && (typeof value.expires_at !== "string" || !Number.isFinite(Date.parse(value.expires_at)) || Date.parse(value.expires_at) <= Date.now()))) {
      report.keyDiagnostics.failure = "policy-denied";
      report.reason = "key-policy-denied";
      return report;
    }
    report.keyDiagnostics.phase = "complete";
    report.reason = "catalog-check-failed";
    const catalogResult = await readJson("catalog");
    if (!catalogResult.valid) return report;
    const payload = catalogResult.payload;
    if (!record(payload) || !Array.isArray(payload.data) || payload.data.length > 10_000
      || !payload.data.every((entry: unknown) => record(entry) && typeof entry.id === "string" && entry.id.trim().length > 0 && entry.id.length <= 256)
      || (payload.total_count !== undefined && (!Number.isInteger(payload.total_count) || payload.total_count !== payload.data.length))
      || (payload.links !== undefined && (!record(payload.links) || (payload.links.next !== undefined && payload.links.next !== null)))) {
      report.catalogDiagnostics.failure = "invalid-response";
      return report;
    }
    report.modelListed = payload.data.some((entry: { id: string }) => entry.id === REQUESTED_MODEL);
    report.catalogDiagnostics.phase = "complete";
    report.outcome = "completed";
    report.reason = null;
    return report;
  } finally {
    key = undefined;
  }
}
