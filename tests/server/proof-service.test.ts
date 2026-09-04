import { describe, expect, it, vi } from "vitest";
import type { CreateProofRequest } from "../../app/contracts/proof-ledger";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import { flagshipUnitRegistry } from "../../app/data/flagship-unit-registry";
import {
  ProofService,
  ProofServiceError,
} from "../../app/server/proof/service";
import {
  ProofRepositoryConflictError,
  type ActiveProofShare,
  type ActiveProofGoal,
  type OwnedProof,
  type OwnedProofSnapshot,
  type ProofAssetMetadata,
  type ProofMutationLookup,
  type ProofRepository,
  type SaveProofMutationCommand,
} from "../../app/server/proof/repository";
import type { ProofLedgerMutationResult, ProofLedgerWorkspace } from "../../app/contracts/proof-ledger";
import type { DailyUnit } from "../../app/contracts/planning";
import { validateResearchCandidate } from "../../app/server/research/package-validator";
import { validAnnotations, validResearchCandidate } from "../fixtures/research/valid-candidate";

class MemoryProofRepository implements ProofRepository {
  scope: ActiveProofGoal | null = {
    ownerId: "user-1", goalId: "goal-1", roleId: "ai-native-full-stack-engineer",
  };
  workspace: ProofLedgerWorkspace | null = null;
  asset: ProofAssetMetadata | null = null;
  dailyUnit: DailyUnit | null = null;
  failSave = false;
  saves: SaveProofMutationCommand[] = [];
  private readonly replays = new Map<string, ProofLedgerMutationResult>();

  async findActiveGoal() { return this.scope; }
  async load() { return clone(this.workspace); }
  async findMutation(input: ProofMutationLookup) { return clone(this.replays.get(input.mutationId) ?? null); }
  async saveMutation(command: SaveProofMutationCommand) {
    if (this.failSave) throw new Error("database secret should not escape");
    if ((this.workspace?.revision ?? 0) !== command.baseRevision) throw new ProofRepositoryConflictError();
    this.saves.push(clone(command));
    this.workspace = clone(command.result.workspace);
    this.replays.set(command.mutationId, clone(command.result));
    return clone(command.result);
  }
  async getOwnedProof(): Promise<OwnedProof | null> { return null; }
  async getOwnedProofSnapshot(): Promise<OwnedProofSnapshot | null> { return null; }
  async getOwnedDailyUnit() { return this.dailyUnit; }
  async createAssetMetadata(): Promise<void> { return; }
  async getOwnedAsset() { return this.asset; }
  async upsertShare(): Promise<void> { return; }
  async revokeShare(): Promise<boolean> { return false; }
  async getActiveShareByTokenHash(): Promise<ActiveProofShare | null> { return null; }
}

function clone<T>(value: T): T {
  return value === null ? value : structuredClone(value);
}

function createRequest(overrides: Partial<CreateProofRequest> = {}): CreateProofRequest {
  return {
    mutationId: "mutation-create",
    baseRevision: 0,
    intent: "submit",
    validatorKey: null,
    dailyUnitId: null,
    title: "Architecture map",
    kind: "document",
    summary: "Trace the request boundary end to end.",
    artifactUrl: "https://example.com/proof",
    assetId: null,
    skillIds: ["testing"],
    completionCriteria: ["Trace is complete"],
    visibility: "private",
    ...overrides,
  };
}

function harness(repo = new MemoryProofRepository()) {
  let id = 0;
  const readJsonAsset = vi.fn().mockResolvedValue({
    schemaVersion: "arc.test-report.v1", command: "npm test", exitCode: 0, passed: 12, failed: 0,
  });
  const service = new ProofService({
    repository: repo,
    blueprint: flagshipBlueprint,
    registry: flagshipUnitRegistry,
    createId: () => `generated-${++id}`,
    now: () => new Date("2026-08-17T00:00:00.000Z"),
    readJsonAsset,
  });
  return { repo, service, readJsonAsset };
}

describe("ProofService", () => {
  it("retains Flagship Proof behavior when a legacy goal has no planning workspace", async () => {
    const repo = new MemoryProofRepository();
    const service = new ProofService({
      repository: repo, blueprint: flagshipBlueprint, registry: flagshipUnitRegistry,
      planningSource: {
        repository: { load: vi.fn(async () => null) },
        resolver: { resolveForReplay: vi.fn(async () => { throw new Error("must not resolve absent legacy state"); }) },
      },
      createId: (() => { let id = 0; return () => `legacy-proof-${++id}`; })(),
      now: () => new Date("2026-08-17T00:00:00.000Z"),
    });
    await expect(service.create("user-1", createRequest())).resolves.toMatchObject({ outcome: "demonstrated" });
  });

  it("refuses Flagship fallback when the active goal is not provably Flagship", async () => {
    const repo = new MemoryProofRepository();
    repo.scope = { ownerId: "user-1", goalId: "goal-1", roleId: "data-product-manager" };
    const service = new ProofService({
      repository: repo, blueprint: flagshipBlueprint, registry: flagshipUnitRegistry,
      planningSource: {
        repository: { load: vi.fn(async () => null) },
        resolver: { resolveForReplay: vi.fn(async () => { throw new Error("must not resolve absent state"); }) },
      },
    });
    await expect(service.create("user-1", createRequest())).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(repo.saves).toHaveLength(0);
  });

  it("refuses implicit Flagship authority for a non-Flagship goal when no planning adapter is configured", async () => {
    const repo = new MemoryProofRepository();
    repo.scope = { ownerId: "user-1", goalId: "goal-1", roleId: "data-product-manager" };
    const service = new ProofService({
      repository: repo, blueprint: flagshipBlueprint, registry: flagshipUnitRegistry,
    });
    await expect(service.create("user-1", createRequest())).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(repo.saves).toHaveLength(0);
  });

  it("refuses Flagship fallback when the active goal role authority is missing", async () => {
    const repo = new MemoryProofRepository();
    repo.scope = { ownerId: "user-1", goalId: "goal-1" } as unknown as ActiveProofGoal;
    const service = new ProofService({
      repository: repo, blueprint: flagshipBlueprint, registry: flagshipUnitRegistry,
      planningSource: {
        repository: { load: vi.fn(async () => null) },
        resolver: { resolveForReplay: vi.fn(async () => { throw new Error("must not resolve absent state"); }) },
      },
    });
    await expect(service.getWorkspace("user-1")).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("never falls back to Flagship for a stored Research workspace missing its source reference", async () => {
    const repo = new MemoryProofRepository();
    const service = new ProofService({
      repository: repo, blueprint: flagshipBlueprint, registry: flagshipUnitRegistry,
      planningSource: {
        repository: { load: vi.fn(async () => ({ ownerId: "user-1", goalId: "goal-1", payload: {
          audit: { blueprintId: "data-product-manager" },
        } })) },
        resolver: { resolveForReplay: vi.fn(async () => { throw new Error("must not receive missing reference"); }) },
      },
    });
    await expect(service.create("user-1", createRequest())).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(repo.saves).toHaveLength(0);
  });

  it("uses the authenticated goal's persisted Research source as skill authority", async () => {
    const validated = validateResearchCandidate(validResearchCandidate, validAnnotations, {
      packageId: "research-package-proof", blueprintVersion: "2026.08.1", registryVersion: "2026.08.2",
      templateVersion: "2026.08.3", promptVersion: "prompt-v1", inputSchemaVersion: "input-v1",
      outputSchemaVersion: "output-v1", qualityVersion: "quality-v1", modelConfigVersion: "model-v1",
      observedAt: "2026-08-30", expiresAt: "2026-09-30",
    });
    if (!validated.ready) throw new Error("Expected Ready research fixture");
    const sourceReference = {
      source: "research" as const, researchRunId: "research-run-proof", packageId: validated.package.id,
      blueprintId: validated.package.blueprint.id, blueprintVersion: validated.package.blueprint.version,
      registryId: validated.package.registry.id, registryVersion: validated.package.registry.version,
      configFingerprint: "config-fingerprint-proof", contentFingerprint: validated.package.contentFingerprint,
    };
    const repo = new MemoryProofRepository();
    const resolveForReplay = vi.fn(async () => ({
      reference: sourceReference, blueprint: validated.package.blueprint, registry: validated.package.registry,
    }));
    const service = new ProofService({
      repository: repo,
      blueprint: flagshipBlueprint,
      registry: flagshipUnitRegistry,
      planningSource: {
        repository: { load: vi.fn(async () => ({ ownerId: "user-1", goalId: "goal-1", payload: {}, sourceReference })) },
        resolver: { resolveForReplay },
      },
      createId: (() => { let id = 0; return () => `research-proof-${++id}`; })(),
      now: () => new Date("2026-10-15T00:00:00.000Z"),
    });
    const researchSkillId = validated.package.blueprint.skills[0]!.id;
    const created = await service.create("user-1", createRequest({ skillIds: [researchSkillId] }));
    expect(created.outcome).toBe("demonstrated");
    expect(created.workspace.projections.find(({ skillId }) => skillId === researchSkillId)?.status).toBe("demonstrated");
    expect(resolveForReplay).toHaveBeenCalledWith("user-1", sourceReference);

    await expect(service.create("user-1", createRequest({
      mutationId: "mutation-foreign", baseRevision: 1, skillIds: ["testing"],
    }))).rejects.toMatchObject({ code: "INVALID_INPUT", issues: ["skill"] });
    const withdrawn = await service.withdraw("user-1", created.workspace.versions[0]!.proofId, {
      mutationId: "mutation-withdraw-research", baseRevision: 1,
    });
    expect(withdrawn.workspace.projections.find(({ skillId }) => skillId === researchSkillId)?.status).toBe("exploring");
  });

  it("returns NOT_FOUND for an unaffiliated owner", async () => {
    const { repo, service } = harness();
    repo.scope = null;
    await expect(service.getWorkspace("user-1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects malformed and owner-injecting input before persistence", async () => {
    const { repo, service } = harness();
    await expect(service.create("user-1", { ...createRequest(), userId: "user-2" }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(repo.saves).toEqual([]);
  });

  it("creates submitted link evidence as demonstrated and recomputes both audiences", async () => {
    const { repo, service } = harness();
    const result = await service.create("user-1", createRequest());
    expect(result.outcome).toBe("demonstrated");
    expect(result.workspace.revision).toBe(1);
    expect(result.workspace.reviews.map(({ kind }) => kind)).toEqual(["submitted", "structural_passed"]);
    expect(result.workspace.projections.find(({ skillId, audience }) =>
      skillId === "testing" && audience === "internal")?.status).toBe("demonstrated");
    expect(repo.saves).toHaveLength(1);
  });

  it("accepts only an owner-scoped Daily Unit whose skill is linked to the proof", async () => {
    const { repo, service } = harness();
    const template = flagshipUnitRegistry.tracks.find(({ skillId }) => skillId === "testing")!.templates[0]!;
    repo.dailyUnit = {
      ...template,
      id: "daily-1",
      planVersionId: "plan-1",
      templateId: template.id,
      templateVersion: template.version,
      checkpointId: null,
      scheduledDate: "2026-08-17",
      slot: "primary",
      required: true,
    };
    await expect(service.create("user-1", createRequest({ dailyUnitId: "daily-1" })))
      .resolves.toMatchObject({ outcome: "demonstrated" });

    const second = harness();
    second.repo.dailyUnit = repo.dailyUnit;
    await expect(second.service.create("user-1", createRequest({
      dailyUnitId: "daily-1", skillIds: ["react"],
    }))).rejects.toMatchObject({ code: "INVALID_INPUT", issues: ["daily-unit"] });
  });

  it("replays an identical mutation without a second save", async () => {
    const { repo, service } = harness();
    const first = await service.create("user-1", createRequest());
    const replay = await service.create("user-1", createRequest());
    expect(replay).toEqual(first);
    expect(repo.saves).toHaveLength(1);
  });

  it("rejects stale revisions and preserves the previous workspace", async () => {
    const { repo, service } = harness();
    const first = await service.create("user-1", createRequest());
    await expect(service.setVisibility("user-1", first.workspace.versions[0]!.proofId, {
      mutationId: "mutation-private", baseRevision: 0, visibility: "public",
    })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(repo.workspace).toEqual(first.workspace);
  });

  it("revises immutably, withdraws, and changes public visibility without changing internal evidence", async () => {
    const { service } = harness();
    const created = await service.create("user-1", createRequest());
    const proofId = created.workspace.versions[0]!.proofId;
    const revised = await service.revise("user-1", proofId, createRequest({
      mutationId: "mutation-revise", baseRevision: 1, title: "Architecture map v2",
    }));
    expect(revised.workspace.versions).toHaveLength(2);
    expect(revised.workspace.versions[1]?.supersedesVersionId).toBe(revised.workspace.versions[0]?.id);
    const madePublic = await service.setVisibility("user-1", proofId, {
      mutationId: "mutation-public", baseRevision: 2, visibility: "public",
    });
    const internal = madePublic.workspace.projections.find(({ skillId, audience }) =>
      skillId === "testing" && audience === "internal");
    const publicProjection = madePublic.workspace.projections.find(({ skillId, audience }) =>
      skillId === "testing" && audience === "public");
    expect(internal?.status).toBe("demonstrated");
    expect(publicProjection?.status).toBe("demonstrated");
    const withdrawn = await service.withdraw("user-1", proofId, {
      mutationId: "mutation-withdraw", baseRevision: 3,
    });
    expect(withdrawn.outcome).toBe("withdrawn");
    expect(withdrawn.workspace.projections.find(({ skillId, audience }) =>
      skillId === "testing" && audience === "internal")?.status).toBe("exploring");
  });

  it("treats unknown AI validators as unavailable and never verifies", async () => {
    const { service } = harness();
    const result = await service.create("user-1", createRequest({ validatorKey: "proof.ai-review.v1" }));
    expect(result.outcome).toBe("demonstrated");
    expect(result.workspace.reviews.at(-1)?.kind).toBe("validator_unavailable");
    expect(result.workspace.projections.some(({ status }) => status === "verified")).toBe(false);
  });

  it("verifies only a named deterministic asset and downgrades a rejected revision to remaining evidence", async () => {
    const { repo, service, readJsonAsset } = harness();
    await service.create("user-1", createRequest());
    const draft = await service.create("user-1", createRequest({
      mutationId: "mutation-draft-report", baseRevision: 1, intent: "save_draft",
      kind: "test_report", artifactUrl: null, assetId: null,
    }));
    const proofId = draft.workspace.versions.at(-1)!.proofId;
    repo.asset = {
      id: "asset-1", userId: "user-1", proofId, objectKey: "proof/report",
      filename: "report.json", contentType: "application/json", sizeBytes: 128,
    };
    const verified = await service.revise("user-1", proofId, createRequest({
      mutationId: "mutation-verify", baseRevision: 2, kind: "test_report",
      artifactUrl: null, assetId: "asset-1", validatorKey: "proof.test-report.v1",
    }));
    expect(verified.outcome).toBe("verified");
    expect(verified.workspace.projections.find(({ skillId, audience }) =>
      skillId === "testing" && audience === "internal")?.status).toBe("verified");

    readJsonAsset.mockResolvedValue({
      schemaVersion: "arc.test-report.v1", command: "npm test", exitCode: 1, passed: 11, failed: 1,
    });
    const rejected = await service.revise("user-1", proofId, createRequest({
      mutationId: "mutation-reject", baseRevision: 3, kind: "test_report",
      artifactUrl: null, assetId: "asset-1", validatorKey: "proof.test-report.v1",
    }));
    expect(rejected.outcome).toBe("rejected");
    expect(rejected.workspace.projections.find(({ skillId, audience }) =>
      skillId === "testing" && audience === "internal")?.status).toBe("demonstrated");
  });

  it("does not allow a completion compatibility kind to invoke a validator", async () => {
    const { service } = harness();
    await expect(service.create("user-1", { ...createRequest(), kind: "completion" }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("normalizes repository failures and leaves the last valid state unchanged", async () => {
    const { repo, service } = harness();
    const first = await service.create("user-1", createRequest());
    repo.failSave = true;
    const previous = clone(repo.workspace);
    await expect(service.setVisibility("user-1", first.workspace.versions[0]!.proofId, {
      mutationId: "mutation-fail", baseRevision: 1, visibility: "public",
    })).rejects.toSatisfy((error: unknown) =>
      error instanceof ProofServiceError && error.code === "UNAVAILABLE"
      && !error.message.includes("database secret"));
    expect(repo.workspace).toEqual(previous);
  });
});
