export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const ALLOWED_PROOF_TYPES = new Set([
  "text/plain",
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

export class ProofUploadValidationError extends Error {
  constructor() {
    super("Proof assets must be a supported non-empty file no larger than five MiB.");
    this.name = "ProofUploadValidationError";
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
