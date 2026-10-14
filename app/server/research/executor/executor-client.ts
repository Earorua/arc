import { canonicalJson } from "../../../lib/planning/fingerprint";
import { parseBridgeBeginGrant, type BridgeBeginGrant } from "./begin";
import { BRIDGE_BODY_LIMITS, decodeBridgeJson } from "./body";
import {
  encodeBridgeDto,
  matchAcceptedProof,
  matchExecutorStatus,
  matchReceiptNotice,
  matchResultReceipt,
  matchUnsentProof,
  parseReceiptNotice,
  type AcceptedProof,
  type ExecutorStatus,
  type ReceiptNotice,
  type UnsentProof,
} from "./bridge-contract";
import { encodeBridgeJob, hashBridgeJob, parseBridgeJob, type BridgeJob } from "./job";
import { decodeBridgeProviderReceipt, type BridgeProviderReceipt } from "./receipt";
import { BridgeTransport } from "./http-transport";

export type BridgeClientOptions = Readonly<{ signal?: AbortSignal }>;

function exact(left: unknown, right: unknown): boolean { return canonicalJson(left) === canonicalJson(right); }

export class ExecutorBridgeClient {
  constructor(private readonly transport: BridgeTransport) {}

  submit(jobInput: BridgeJob, options: BridgeClientOptions = {}): Promise<AcceptedProof> {
    const job = parseBridgeJob(jobInput);
    const signal = options.signal;
    return this.transport.request({
      target: "executor",
      operation: "submit",
      signal,
      prepare: () => ({ jobId: job.jobId, body: encodeBridgeJob(job) }),
      decode: (bytes) => matchAcceptedProof(decodeBridgeJson(bytes), job),
    });
  }

  status(jobInput: BridgeJob, options: BridgeClientOptions = {}): Promise<ExecutorStatus> {
    const job = parseBridgeJob(jobInput);
    const signal = options.signal;
    return this.transport.request({
      target: "executor", operation: "status", signal,
      prepare: async () => ({ jobId: job.jobId, body: encodeBridgeDto({ jobId: job.jobId, requestHash: await hashBridgeJob(job) }, BRIDGE_BODY_LIMITS.request) }),
      decode: (bytes) => matchExecutorStatus(decodeBridgeJson(bytes), job),
    });
  }

  close(jobInput: BridgeJob, options: BridgeClientOptions = {}): Promise<UnsentProof> {
    const job = parseBridgeJob(jobInput);
    const signal = options.signal;
    return this.transport.request({
      target: "executor", operation: "close", signal,
      prepare: async () => ({ jobId: job.jobId, body: encodeBridgeDto({ jobId: job.jobId, requestHash: await hashBridgeJob(job) }, BRIDGE_BODY_LIMITS.request) }),
      decode: (bytes) => matchUnsentProof(decodeBridgeJson(bytes), job),
    });
  }

  result(jobInput: BridgeJob, noticeInput: ReceiptNotice, grantInput: BridgeBeginGrant, options: BridgeClientOptions = {}): Promise<BridgeProviderReceipt> {
    const job = parseBridgeJob(jobInput);
    const notice = parseReceiptNotice(noticeInput);
    const grant = parseBridgeBeginGrant(grantInput);
    const signal = options.signal;
    return this.transport.request({
      target: "executor", operation: "result", signal,
      prepare: async () => ({ jobId: job.jobId, body: encodeBridgeDto(await matchReceiptNotice(notice, job), BRIDGE_BODY_LIMITS.request) }),
      decode: (bytes) => matchResultReceipt(decodeBridgeProviderReceipt(bytes), job, notice, grant),
    });
  }

  acknowledge(jobInput: BridgeJob, noticeInput: ReceiptNotice, options: BridgeClientOptions = {}): Promise<ReceiptNotice> {
    const job = parseBridgeJob(jobInput);
    const notice = parseReceiptNotice(noticeInput);
    const signal = options.signal;
    return this.transport.request({
      target: "executor", operation: "acknowledge", signal,
      prepare: async () => ({ jobId: job.jobId, body: encodeBridgeDto(await matchReceiptNotice(notice, job), BRIDGE_BODY_LIMITS.request) }),
      decode: async (bytes) => {
        const value = await matchReceiptNotice(decodeBridgeJson(bytes), job);
        if (!exact(value, notice)) throw new Error("bridge acknowledgement mismatch");
        return value;
      },
    });
  }
}
