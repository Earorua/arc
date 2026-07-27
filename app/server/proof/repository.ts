import type { ProofItem } from "../../domain/learning";
import type { PublicProofField, PublicProofView } from "./public-view";

export type OwnedProof = ProofItem & {
  userId: string;
};

export type ProofAssetMetadata = {
  id: string;
  userId: string;
  proofId: string;
  objectKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

export type ProofShareInput = {
  id: string;
  userId: string;
  proofId: string;
  tokenHash: string;
  publishedFields: PublicProofField[];
  publicView: PublicProofView;
};

export type ActiveProofShare = {
  tokenHash: string;
  publicView: unknown;
};

export interface ProofRepository {
  getOwnedProof(userId: string, proofId: string): Promise<OwnedProof | null>;
  createAssetMetadata(metadata: ProofAssetMetadata): Promise<void>;
  getOwnedAsset(userId: string, proofId: string): Promise<ProofAssetMetadata | null>;
  upsertShare(input: ProofShareInput): Promise<void>;
  revokeShare(userId: string, proofId: string): Promise<boolean>;
  getActiveShareByTokenHash(tokenHash: string): Promise<ActiveProofShare | null>;
}
