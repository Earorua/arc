// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { KIMI_RESEARCH_EXECUTION_POLICY } from "../../app/server/research/execution-policy";
import { BRIDGE_AUTH_PROTOCOL } from "../../app/server/research/executor/auth";
import { parseBridgeBeginGrant } from "../../app/server/research/executor/begin";
import {
  BridgeContractError,
  encodeBridgeDto,
  matchAcceptedProof,
  matchBridgeMetadata,
  matchExecutorStatus,
  matchImportAcknowledgement,
  matchReceiptNotice,
  matchResultReceipt,
  matchUnsentProof,
  parseAcceptedProof,
  parseBridgeErrorBody,
  parseExecutorStatus,
  parseImportAcknowledgement,
  parseJobPage,
  parseMaintenanceReply,
  parseReceiptNotice,
  parseUnsentProof,
} from "../../app/server/research/executor/bridge-contract";
import { hashBridgeJob, parseBridgeJob, type BridgeJob } from "../../app/server/research/executor/job";
import {
  hashBridgeProviderReceipt,
  parseBridgeProviderReceipt,
  summarizeBridgeProviderReceipt,
} from "../../app/server/research/executor/receipt";
import { createSiteAdmissionFixture } from "../helpers/site-admission-fixture";

async function genuineJob(): Promise<BridgeJob> {
  const fixture = createSiteAdmissionFixture();
  try {
    return parseBridgeJob((await fixture.createRemote()).execution.job);
  } finally {
    fixture.db.close();
  }
}

async function grantFor(job: BridgeJob) {
  const beganAt = job.createdAt + 1_000;
  return parseBridgeBeginGrant({
    protocol: BRIDGE_AUTH_PROTOCOL,
    jobId: job.jobId,
    requestHash: await hashBridgeJob(job),
    beganAt,
    executionExpiresAt: beganAt + KIMI_RESEARCH_EXECUTION_POLICY.activeTtlMs,
  });
}

async function receiptFor(job: BridgeJob) {
  const grant = await grantFor(job);
  return parseBridgeProviderReceipt({
    grant,
    producedAt: grant.beganAt + 50,
    latencyMs: 50,
    outcome: {
      kind: "error",
      code: "timeout",
      retryable: true,
      charged: "unknown",
      actualModel: null,
      usage: null,
    },
  });
}

function expectContractError(work: () => unknown, code: string) {
  let error: unknown;
  try { work(); } catch (value) { error = value; }
  expect(error).toBeInstanceOf(BridgeContractError);
  expect(error).toMatchObject({ code, name: "BridgeContractError" });
}

afterEach(() => vi.restoreAllMocks());

describe("research bridge DTO contract", () => {
  it("parses strict bounded DTOs into owned frozen snapshots", async () => {
    const job = await genuineJob();
    const requestHash = await hashBridgeJob(job);
    const grant = await grantFor(job);
    const acceptedInput = {
      jobId: job.jobId,
      requestHash,
      workflowId: job.jobId,
      workflowAcceptedAt: job.createdAt + 10,
    };
    const accepted = parseAcceptedProof(acceptedInput);
    const unsent = parseUnsentProof({
      jobId: job.jobId,
      requestHash,
      state: "closed",
      closedAt: job.createdAt + 20,
      grant,
    });
    const status = parseExecutorStatus({
      jobId: job.jobId,
      requestHash,
      accepted,
      dispatchState: "closed",
      unsent,
      metadata: null,
      bodyState: null,
    });

    acceptedInput.workflowId = "00000000-0000-4000-8000-000000000099";
    expect(accepted.workflowId).toBe(job.jobId);
    expect(Object.isFrozen(accepted)).toBe(true);
    expect(Object.isFrozen(unsent)).toBe(true);
    expect(Object.isFrozen(unsent.grant)).toBe(true);
    expect(Object.isFrozen(status)).toBe(true);
    expect(Object.isFrozen(status.accepted)).toBe(true);
    expect(Object.isFrozen(status.unsent)).toBe(true);
    expect(Object.isFrozen(parseReceiptNotice({ jobId: job.jobId, requestHash, receiptHash: "a".repeat(64) }))).toBe(true);
    expect(parseImportAcknowledgement({
      jobId: job.jobId,
      requestHash,
      receiptHash: "a".repeat(64),
      accounting: "held",
    }).accounting).toBe("held");
    expect(parseMaintenanceReply({ visited: 10, failed: 0 })).toEqual({ visited: 10, failed: 0 });
    expect(parseBridgeErrorBody({ code: "temporary" })).toEqual({ code: "temporary" });
  });

  it("rejects aliases, unknown keys, invalid cross-fields, and oversized canonical JSON", async () => {
    const job = await genuineJob();
    const requestHash = await hashBridgeJob(job);
    expectContractError(() => parseAcceptedProof({
      jobId: job.jobId,
      requestHash,
      workflowId: job.jobId,
      acceptedAt: job.createdAt,
    }), "invalid-message");
    expectContractError(() => parseAcceptedProof({
      jobId: job.jobId,
      requestHash,
      workflowId: job.jobId,
      workflowAcceptedAt: job.createdAt,
      ownerId: "secret-owner",
    }), "invalid-message");
    expectContractError(() => parseExecutorStatus({
      jobId: job.jobId,
      requestHash,
      accepted: null,
      dispatchState: "closed",
      unsent: null,
      metadata: null,
      bodyState: null,
    }), "invalid-message");
    expectContractError(() => parseExecutorStatus({
      jobId: job.jobId,
      requestHash,
      accepted: null,
      dispatchState: "unclaimed",
      unsent: null,
      metadata: null,
      bodyState: "available",
    }), "invalid-message");
    expectContractError(() => parseMaintenanceReply({ visited: 11, failed: 0 }), "invalid-message");
    expectContractError(() => parseBridgeErrorBody({ code: "temporary", rawError: "secret" }), "invalid-message");
    expectContractError(() => encodeBridgeDto({ value: "é".repeat(20) }, 20), "invalid-message");
  });

  it("rejects every internally contradictory status identity synchronously", async () => {
    const job = await genuineJob();
    const requestHash = await hashBridgeJob(job);
    const otherJobId = "00000000-0000-4000-8000-000000000099";
    const otherHash = "f".repeat(64);
    const grant = await grantFor(job);
    const metadata = await summarizeBridgeProviderReceipt(await receiptFor(job));
    const accepted = { jobId: job.jobId, requestHash, workflowId: job.jobId, workflowAcceptedAt: job.createdAt };
    const unsent = { jobId: job.jobId, requestHash, state: "closed", closedAt: job.createdAt + 1, grant: null };
    const base = { jobId: job.jobId, requestHash, accepted: null, dispatchState: "unclaimed", unsent: null, metadata: null, bodyState: null } as const;
    const cases = [
      { ...base, accepted: { ...accepted, jobId: otherJobId, workflowId: otherJobId } },
      { ...base, accepted: { ...accepted, requestHash: otherHash } },
      { ...base, dispatchState: "closed", unsent: { ...unsent, jobId: otherJobId, requestHash: otherHash } },
      { ...base, dispatchState: "closed", unsent: { ...unsent, grant: { ...grant, jobId: otherJobId } } },
      { ...base, dispatchState: "claimed", metadata: { ...metadata, grant: { ...metadata.grant, requestHash: otherHash } }, bodyState: "missing" },
    ];
    for (const value of cases) expectContractError(() => parseExecutorStatus(value), "invalid-message");
  });

  it("bounds job pages by count and encoded UTF-8 bytes without truncation", async () => {
    const job = await genuineJob();
    const page = parseJobPage({ jobs: [job], next: { createdAt: job.createdAt, jobId: job.jobId } });
    expect(Object.isFrozen(page.jobs)).toBe(true);
    expect(page.jobs[0]).toEqual(job);
    expectContractError(() => parseJobPage({ jobs: Array.from({ length: 11 }, () => job), next: null }), "invalid-message");
    const expanded = Array.from({ length: 10 }, (_, index) => ({
      ...job,
      requestId: `request-${index}-${"界".repeat(255)}`,
      role: "界".repeat(200),
    }));
    expectContractError(() => parseJobPage({ jobs: expanded, next: null }), "invalid-message");
  });

  it("matches every semantic DTO against the expected job, notice, grant, and receipt digest", async () => {
    const job = await genuineJob();
    const requestHash = await hashBridgeJob(job);
    const grant = await grantFor(job);
    const receipt = await receiptFor(job);
    const receiptHash = await hashBridgeProviderReceipt(receipt);
    const notice = parseReceiptNotice({ jobId: job.jobId, requestHash, receiptHash });
    const accepted = parseAcceptedProof({
      jobId: job.jobId,
      requestHash,
      workflowId: job.jobId,
      workflowAcceptedAt: job.createdAt + 5,
    });
    const unsent = parseUnsentProof({
      jobId: job.jobId,
      requestHash,
      state: "closed",
      closedAt: job.createdAt + 10,
      grant,
    });
    const metadata = await summarizeBridgeProviderReceipt(receipt);
    const status = parseExecutorStatus({
      jobId: job.jobId,
      requestHash,
      accepted,
      dispatchState: "claimed",
      unsent: null,
      metadata,
      bodyState: "available",
    });
    const acknowledgement = parseImportAcknowledgement({ ...notice, accounting: "settled" });

    await expect(matchAcceptedProof(accepted, job)).resolves.toEqual(accepted);
    await expect(matchUnsentProof(unsent, job)).resolves.toEqual(unsent);
    await expect(matchExecutorStatus(status, job)).resolves.toEqual(status);
    await expect(matchReceiptNotice(notice, job)).resolves.toEqual(notice);
    await expect(matchImportAcknowledgement(acknowledgement, job, notice)).resolves.toEqual(acknowledgement);
    await expect(matchBridgeMetadata(metadata, job)).resolves.toEqual(metadata);
    await expect(matchResultReceipt(receipt, job, notice, grant)).resolves.toEqual(receipt);
  });

  it("rejects job substitution, nested grant mismatch, receipt-hash mismatch, and loose acknowledgement", async () => {
    const job = await genuineJob();
    const other = parseBridgeJob({ ...job, requestId: "different-valid-request" });
    const requestHash = await hashBridgeJob(job);
    const grant = await grantFor(job);
    const receipt = await receiptFor(job);
    const receiptHash = await hashBridgeProviderReceipt(receipt);
    const notice = parseReceiptNotice({ jobId: job.jobId, requestHash, receiptHash });
    const proof = parseAcceptedProof({ jobId: job.jobId, requestHash, workflowId: job.jobId, workflowAcceptedAt: job.createdAt });

    await expect(matchAcceptedProof(proof, other)).rejects.toMatchObject({ code: "conflict" });
    await expect(matchBridgeMetadata({ ...(await summarizeBridgeProviderReceipt(receipt)), grant: await grantFor(other) }, job))
      .rejects.toMatchObject({ code: "conflict" });
    await expect(matchResultReceipt(receipt, job, { ...notice, receiptHash: "f".repeat(64) }, grant))
      .rejects.toMatchObject({ code: "conflict" });
    await expect(matchImportAcknowledgement({ ...notice, receiptHash: "e".repeat(64), accounting: "held" }, job, notice))
      .rejects.toMatchObject({ code: "conflict" });
  });

  it("snapshots all matcher inputs before the first digest await", async () => {
    const mutableJob = structuredClone(await genuineJob()) as unknown as { requestId: string };
    const job = mutableJob as unknown as BridgeJob;
    const mutableGrant = structuredClone(await grantFor(parseBridgeJob(job))) as unknown as { beganAt: number };
    const grant = mutableGrant as unknown as Awaited<ReturnType<typeof grantFor>>;
    const mutableReceipt = structuredClone(await receiptFor(parseBridgeJob(job))) as unknown as { latencyMs: number };
    const receipt = mutableReceipt as unknown as Awaited<ReturnType<typeof receiptFor>>;
    const notice = {
      jobId: job.jobId,
      requestHash: await hashBridgeJob(job),
      receiptHash: await hashBridgeProviderReceipt(receipt),
    };
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => {
      await gate;
      return originalDigest(...args);
    });

    const pending = matchResultReceipt(receipt, job, notice, grant);
    mutableJob.requestId = "mutated";
    notice.receiptHash = "0".repeat(64);
    mutableGrant.beganAt += 1;
    mutableReceipt.latencyMs += 1;
    release();
    await expect(pending).resolves.toMatchObject({ latencyMs: 50 });
  });

  it("snapshots accepted proof and expected job before hashing", async () => {
    const mutableJob = structuredClone(await genuineJob()) as unknown as { requestId: string };
    const job = mutableJob as unknown as BridgeJob;
    const proof = {
      jobId: job.jobId,
      requestHash: await hashBridgeJob(job),
      workflowId: job.jobId,
      workflowAcceptedAt: job.createdAt,
    };
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => { await gate; return originalDigest(...args); });
    const pending = matchAcceptedProof(proof, job);
    mutableJob.requestId = "mutated-after-call";
    proof.requestHash = "0".repeat(64);
    release();
    await expect(pending).resolves.toMatchObject({ workflowId: job.jobId });
  });
});
