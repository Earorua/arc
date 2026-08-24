import type { ProofItem } from "../../domain/learning";
import type {
  ProofLedgerMutationResult,
  ProofLedgerWorkspace,
  ProofVersion,
} from "../../contracts/proof-ledger";
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

export type ProofOwnerGoal = Readonly<{ ownerId: string; goalId: string }>;
export type ProofMutationLookup = ProofOwnerGoal & Readonly<{ mutationId: string }>;
export type SaveProofMutationCommand = ProofMutationLookup & Readonly<{
  baseRevision: number;
  result: ProofLedgerMutationResult;
}>;

export type OwnedProofSnapshot =
  | Readonly<{ source: "ledger"; userId: string; goalId: string; version: ProofVersion }>
  | Readonly<{ source: "legacy"; proof: OwnedProof }>;

export class ProofRepositoryConflictError extends Error {
  constructor() { super("Proof repository revision conflict."); this.name = "ProofRepositoryConflictError"; }
}

export class ProofRepositoryUnavailableError extends Error {
  constructor() { super("Proof repository is unavailable."); this.name = "ProofRepositoryUnavailableError"; }
}

export interface ProofRepository {
  findActiveGoal(ownerId: string): Promise<ProofOwnerGoal | null>;
  load(scope: ProofOwnerGoal): Promise<ProofLedgerWorkspace | null>;
  findMutation(input: ProofMutationLookup): Promise<ProofLedgerMutationResult | null>;
  saveMutation(command: SaveProofMutationCommand): Promise<ProofLedgerMutationResult>;
  getOwnedProof(userId: string, proofId: string): Promise<OwnedProof | null>;
  getOwnedProofSnapshot(userId: string, proofId: string): Promise<OwnedProofSnapshot | null>;
  createAssetMetadata(metadata: ProofAssetMetadata): Promise<void>;
  getOwnedAsset(userId: string, proofId: string): Promise<ProofAssetMetadata | null>;
  upsertShare(input: ProofShareInput): Promise<void>;
  revokeShare(userId: string, proofId: string): Promise<boolean>;
  getActiveShareByTokenHash(tokenHash: string): Promise<ActiveProofShare | null>;
}
