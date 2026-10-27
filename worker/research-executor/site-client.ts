import { canonicalJson } from "../../app/lib/planning/fingerprint";
import { decodeBridgeBeginReply, matchBridgeBeginReply, type BridgeBeginReply } from "../../app/server/research/executor/begin";
import { BRIDGE_BODY_LIMITS, decodeBridgeJson } from "../../app/server/research/executor/body";
import {
  encodeBridgeDto,
  matchAcceptedProof,
  matchBridgeMetadata,
  matchImportAcknowledgement,
  matchReceiptNotice,
  parseAcceptedProof,
  parseJobPage,
  parseMaintenanceReply,
  parseReceiptNotice,
  type AcceptedProof,
  type ImportAcknowledgement,
  type JobPage,
  type MaintenanceReply,
  type ReceiptNotice,
} from "../../app/server/research/executor/bridge-contract";
import type { BridgeClientOptions } from "../../app/server/research/executor/executor-client";
import { BridgeTransport } from "../../app/server/research/executor/http-transport";
import { hashBridgeJob, parseBridgeJob, type BridgeJob } from "../../app/server/research/executor/job";
import { parseBridgeReceiptMetadata, type BridgeReceiptMetadata } from "../../app/server/research/executor/receipt";

function exact(left: unknown, right: unknown): boolean { return canonicalJson(left) === canonicalJson(right); }

export class SiteBridgeClient {
  constructor(private readonly transport: BridgeTransport) {}

  begin(jobInput: BridgeJob, options: BridgeClientOptions = {}): Promise<BridgeBeginReply> {
    const job = parseBridgeJob(jobInput);
    const signal = options.signal;
    return this.transport.request({
      target: "site", operation: "begin", signal,
      prepare: async () => ({ jobId: job.jobId, body: encodeBridgeDto({ jobId: job.jobId, requestHash: await hashBridgeJob(job) }, BRIDGE_BODY_LIMITS.request) }),
      decode: (bytes) => matchBridgeBeginReply(decodeBridgeBeginReply(bytes), job),
    });
  }

  accepted(jobInput: BridgeJob, proofInput: AcceptedProof, options: BridgeClientOptions = {}): Promise<AcceptedProof> {
    const job = parseBridgeJob(jobInput);
    const proof = parseAcceptedProof(proofInput);
    const signal = options.signal;
    return this.transport.request({
      target: "site", operation: "accepted", signal,
      prepare: async () => ({ jobId: job.jobId, body: encodeBridgeDto(await matchAcceptedProof(proof, job), BRIDGE_BODY_LIMITS.request) }),
      decode: async (bytes) => {
        const value = await matchAcceptedProof(decodeBridgeJson(bytes), job);
        if (!exact(value, proof)) throw new Error("bridge accepted proof mismatch");
        return value;
      },
    });
  }

  complete(jobInput: BridgeJob, noticeInput: ReceiptNotice, options: BridgeClientOptions = {}): Promise<ImportAcknowledgement> {
    const job = parseBridgeJob(jobInput);
    const notice = parseReceiptNotice(noticeInput);
    const signal = options.signal;
    return this.transport.request({
      target: "site", operation: "complete", signal,
      prepare: async () => ({ jobId: job.jobId, body: encodeBridgeDto(await matchReceiptNotice(notice, job), BRIDGE_BODY_LIMITS.request) }),
      decode: (bytes) => matchImportAcknowledgement(decodeBridgeJson(bytes), job, notice),
    });
  }

  metadata(jobInput: BridgeJob, metadataInput: BridgeReceiptMetadata, options: BridgeClientOptions = {}): Promise<ImportAcknowledgement> {
    const job = parseBridgeJob(jobInput);
    const metadata = parseBridgeReceiptMetadata(metadataInput);
    const expectedNotice = parseReceiptNotice({ jobId: metadata.grant.jobId, requestHash: metadata.grant.requestHash, receiptHash: metadata.receiptHash });
    const signal = options.signal;
    return this.transport.request({
      target: "site", operation: "metadata", signal,
      prepare: async () => ({ jobId: job.jobId, body: encodeBridgeDto(await matchBridgeMetadata(metadata, job), BRIDGE_BODY_LIMITS.request) }),
      decode: (bytes) => matchImportAcknowledgement(decodeBridgeJson(bytes), job, expectedNotice),
    });
  }

  maintenance(options: BridgeClientOptions = {}): Promise<MaintenanceReply> {
    const signal = options.signal;
    return this.transport.request({
      target: "site", operation: "maintenance", signal,
      prepare: () => ({ jobId: "collection", body: encodeBridgeDto({}, BRIDGE_BODY_LIMITS.request) }),
      decode: (bytes) => parseMaintenanceReply(decodeBridgeJson(bytes)),
    });
  }

  outbox(options: BridgeClientOptions = {}): Promise<JobPage> {
    const signal = options.signal;
    return this.transport.request({
      target: "site", operation: "outbox", signal,
      prepare: () => ({ jobId: "collection", body: encodeBridgeDto({}, BRIDGE_BODY_LIMITS.request) }),
      decode: (bytes) => parseJobPage(decodeBridgeJson(bytes)),
    });
  }
}
