import type { AcceptedProof, BridgeIdentity, UnsentProof } from "./executor/bridge-contract";
import type { SiteExecutionIdentity, SiteExecutionRecord } from "./site-execution-repository";

export interface SiteBridgeRepository {
  lookup(identity: BridgeIdentity): Promise<{ identity: SiteExecutionIdentity; execution: SiteExecutionRecord }>;
  recordAcceptance(proof: AcceptedProof): Promise<AcceptedProof>;
  readAcceptance(identity: SiteExecutionIdentity): Promise<AcceptedProof | null>;
  nextScan(name: "maintenance" | "outbox"): Promise<SiteExecutionIdentity | null>;
}

export type SiteRecovery = Readonly<{
  identity: SiteExecutionIdentity;
  executionVersion: number;
  runVersion: number;
  terminalHash: string;
  reason: "expired-unknown" | "executor-unsent";
  unsent: UnsentProof | null;
  terminalAt: number;
  quotaDone: boolean;
  budgetDone: boolean;
  version: number;
}>;

export interface SiteExpiryRepository {
  terminate(identity: SiteExecutionIdentity, proof: UnsentProof | null): Promise<SiteRecovery | null>;
  read(identity: SiteExecutionIdentity): Promise<SiteRecovery | null>;
  mark(identity: SiteExecutionIdentity, stage: "quota" | "budget", expectedVersion: number): Promise<SiteRecovery>;
}
