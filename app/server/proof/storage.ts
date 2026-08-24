export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const ALLOWED_PROOF_TYPES = new Set([
  "text/plain",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/json",
]);
export const MAX_PROOF_JSON_BYTES = 256 * 1024;

export class ProofUploadValidationError extends Error {
  constructor() {
    super("Proof assets must be a supported non-empty file no larger than five MiB.");
    this.name = "ProofUploadValidationError";
  }
}

export class ProofJsonReadError extends Error {
  constructor() {
    super("Proof JSON is missing, invalid, or larger than 256 KiB.");
    this.name = "ProofJsonReadError";
  }
}

export function validateProofUpload(input: { contentType: string; sizeBytes: number }): void {
  if (!ALLOWED_PROOF_TYPES.has(input.contentType)
    || !Number.isInteger(input.sizeBytes)
    || input.sizeBytes < 1
    || input.sizeBytes > MAX_PROOF_BYTES) {
    throw new ProofUploadValidationError();
  }
}

export function proofObjectKey(userId: string, proofId: string, assetId: string) {
  return `${encodeURIComponent(userId)}/${encodeURIComponent(proofId)}/${encodeURIComponent(assetId)}`;
}

export type ProofAssetUpload = {
  body: Blob | ReadableStream<Uint8Array> | ArrayBuffer;
  contentType: string;
  sizeBytes: number;
};

export type StoredProofObject = {
  body: BodyInit;
};

export interface ProofStorage {
  put(key: string, upload: ProofAssetUpload): Promise<void>;
  get(key: string): Promise<StoredProofObject | null>;
  delete(key: string): Promise<void>;
}

export async function readProofJson(storage: Pick<ProofStorage, "get">, key: string): Promise<unknown> {
  try {
    const object = await storage.get(key);
    if (!object) throw new ProofJsonReadError();
    const stream = new Response(object.body).body;
    if (!stream) throw new ProofJsonReadError();
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PROOF_JSON_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ProofJsonReadError();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof ProofJsonReadError) throw error;
    throw new ProofJsonReadError();
  }
}

export class R2ProofStorage implements ProofStorage {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, upload: ProofAssetUpload): Promise<void> {
    const body = upload.body instanceof Blob ? upload.body.stream() : upload.body;
    await this.bucket.put(key, body, {
      httpMetadata: { contentType: upload.contentType },
      customMetadata: { sizeBytes: String(upload.sizeBytes) },
    });
  }

  async get(key: string): Promise<StoredProofObject | null> {
    const object = await this.bucket.get(key);
    return object ? { body: object.body as BodyInit } : null;
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}
