export const BRIDGE_BODY_LIMITS = Object.freeze({
  request: 4_096,
  status: 4_096,
  outbox: 16_384,
  result: 1_048_576,
});

export type BridgeBodyErrorCode =
  | "invalid-limit"
  | "timeout"
  | "aborted"
  | "body-limit"
  | "body-read"
  | "invalid-json";

export class BridgeBodyError extends Error {
  constructor(readonly code: BridgeBodyErrorCode) {
    super(`Research bridge body failure: ${code}`);
    this.name = "BridgeBodyError";
  }
}

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object | null;
const typedArrayByteLengthGetter = typedArrayPrototype
  ? Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")?.get
  : undefined;

export function bridgeByteLength(value: Uint8Array): number {
  try {
    if (!(value instanceof Uint8Array) || typeof typedArrayByteLengthGetter !== "function") {
      throw new BridgeBodyError("body-read");
    }
    return Reflect.apply(typedArrayByteLengthGetter, value, []) as number;
  } catch {
    throw new BridgeBodyError("body-read");
  }
}

export interface BridgeReadOptions {
  maxBytes: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export async function readBridgeBody(
  message: Pick<Request, "body">,
  options: BridgeReadOptions,
): Promise<Uint8Array> {
  const { maxBytes, timeoutMs, signal } = options;
  if (
    !Number.isSafeInteger(maxBytes)
    || maxBytes < 1
    || maxBytes > BRIDGE_BODY_LIMITS.result
    || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1
    || timeoutMs > 30_000
  ) {
    throw new BridgeBodyError("invalid-limit");
  }

  if (signal?.aborted) {
    void message.body?.cancel().catch(() => undefined);
    throw new BridgeBodyError("aborted");
  }

  if (!message.body) return new Uint8Array();

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = message.body.getReader();
  } catch {
    throw new BridgeBodyError("body-read");
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const deadline = performance.now() + timeoutMs;
  const interruption = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new BridgeBodyError("timeout")), timeoutMs);
    if (signal) {
      abortListener = () => reject(new BridgeBodyError("aborted"));
      signal.addEventListener("abort", abortListener, { once: true });
      if (signal.aborted) abortListener();
    }
  });

  const body = new Uint8Array(maxBytes);
  let totalBytes = 0;
  const drain = async () => {
    while (true) {
      if (performance.now() >= deadline) throw new BridgeBodyError("timeout");
      const chunk = await reader.read();
      if (performance.now() >= deadline) throw new BridgeBodyError("timeout");
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) throw new BridgeBodyError("body-read");

      const actualChunkBytes = bridgeByteLength(chunk.value);
      const nextTotalBytes = totalBytes + actualChunkBytes;
      if (nextTotalBytes > maxBytes) throw new BridgeBodyError("body-limit");
      if (actualChunkBytes > 0) body.set(chunk.value, totalBytes);
      totalBytes = nextTotalBytes;
    }
    return body.slice(0, totalBytes);
  };

  try {
    return await Promise.race([drain(), interruption]);
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (error instanceof BridgeBodyError) throw error;
    throw new BridgeBodyError("body-read");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (signal && abortListener) signal.removeEventListener("abort", abortListener);
    reader.releaseLock();
  }
}

export function decodeBridgeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new BridgeBodyError("invalid-json");
  }
}
