import { roleBlueprintSchema, type RoleBlueprint } from "../../contracts/intelligence";
import {
  planningGenerateSourceSchema,
  planningSourceContextSchema,
  planningSourceReferenceSchema,
  unitRegistrySchema,
  type PlanningGenerateSource,
  type PlanningSourceContext,
  type PlanningSourceReference,
  type UnitRegistry,
} from "../../contracts/planning";
import type { ResearchPackage } from "../../contracts/research";
import { validateRoleBlueprint } from "../../lib/intelligence-validation";
import { canonicalJson, fingerprint } from "../../lib/planning/fingerprint";
import { validateUnitRegistry } from "../../lib/planning/registry-validation";
import type { IntelligenceService } from "../intelligence/service";
import type { ResearchRepository } from "../research/repository";

const FLAGSHIP_ROLE_ID = "ai-native-full-stack-engineer" as const;

type ResearchPlanningRun = Pick<NonNullable<Awaited<ReturnType<ResearchRepository["getRun"]>>>,
  "id" | "ownerId" | "state" | "packageId" | "configFingerprint">;
type ResearchPlanningRepository = {
  getRun(ownerId: string, runId: string): Promise<ResearchPlanningRun | null>;
  resolveReadyPackage(ownerId: string, runId: string): Promise<ResearchPackage>;
};

export type ResearchPlanningSourceReference = Readonly<
  Extract<PlanningSourceReference, { source: "research" }>
>;

export interface PlanningReplayPackageReader {
  resolveLockedPackage(ownerId: string, reference: ResearchPlanningSourceReference): Promise<ResearchPackage>;
}

export type PlanningSourceResolverDependencies = {
  intelligence: Pick<IntelligenceService, "getPublished">;
  flagshipRegistry: unknown;
  researchRepository?: ResearchPlanningRepository;
  replayPackageReader?: PlanningReplayPackageReader;
};

export class PlanningSourceUnavailableError extends Error {
  constructor() {
    super("Planning source is unavailable");
    this.name = "PlanningSourceUnavailableError";
  }
}

export class PlanningSourceContractError extends Error {
  constructor() {
    super("Planning source contract is invalid");
    this.name = "PlanningSourceContractError";
  }
}

export class PlanningSourceResolver {
  constructor(private readonly dependencies: PlanningSourceResolverDependencies) {}

  async resolveForGenerate(ownerId: string, input: unknown): Promise<PlanningSourceContext> {
    const source = parseGenerateSource(input);
    if (source.source === "flagship") return this.resolveFlagship(source);
    const repository = this.dependencies.researchRepository;
    if (!repository) throw new PlanningSourceUnavailableError();
    try {
      const run = await repository.getRun(ownerId, source.researchRunId);
      if (!run || run.ownerId !== ownerId || run.state !== "ready" || !run.packageId) {
        throw new PlanningSourceUnavailableError();
      }
      const packageValue = await repository.resolveReadyPackage(ownerId, source.researchRunId);
      const reference = researchReference(source.researchRunId, run.configFingerprint, packageValue);
      if (run.packageId !== reference.packageId) throw new PlanningSourceUnavailableError();
      return validateContext({ reference, blueprint: packageValue.blueprint, registry: packageValue.registry });
    } catch {
      throw new PlanningSourceUnavailableError();
    }
  }

  async resolveForReplay(ownerId: string, input: unknown): Promise<PlanningSourceContext> {
    const reference = parseReference(input);
    if (reference.source === "flagship") return this.resolveFlagship(reference);
    const reader = this.dependencies.replayPackageReader;
    if (!reader) throw new PlanningSourceUnavailableError();
    try {
      const packageValue = await reader.resolveLockedPackage(ownerId, reference);
      const canonicalReference = researchReference(reference.researchRunId, reference.configFingerprint, packageValue);
      if (canonicalJson(canonicalReference) !== canonicalJson(reference)) throw new PlanningSourceUnavailableError();
      return validateContext({ reference, blueprint: packageValue.blueprint, registry: packageValue.registry });
    } catch {
      throw new PlanningSourceUnavailableError();
    }
  }

  async resolveForGenerationCommit(ownerId: string, input: unknown): Promise<PlanningSourceContext> {
    const reference = parseReference(input);
    if (reference.source === "flagship") return this.resolveFlagship(reference);
    const repository = this.dependencies.researchRepository;
    if (!repository) throw new PlanningSourceUnavailableError();
    try {
      const run = await repository.getRun(ownerId, reference.researchRunId);
      if (!run || run.ownerId !== ownerId || run.state !== "ready" || !run.packageId) {
        throw new PlanningSourceUnavailableError();
      }
      const packageValue = await repository.resolveReadyPackage(ownerId, reference.researchRunId);
      const canonicalReference = researchReference(reference.researchRunId, run.configFingerprint, packageValue);
      if (run.packageId !== canonicalReference.packageId
        || canonicalJson(canonicalReference) !== canonicalJson(reference)) {
        throw new PlanningSourceUnavailableError();
      }
      return validateContext({ reference, blueprint: packageValue.blueprint, registry: packageValue.registry });
    } catch {
      throw new PlanningSourceUnavailableError();
    }
  }

  private async resolveFlagship(
    reference: Extract<PlanningGenerateSource | PlanningSourceReference, { source: "flagship" }>,
  ): Promise<PlanningSourceContext> {
    let rawBlueprint: unknown;
    try { rawBlueprint = await this.dependencies.intelligence.getPublished(FLAGSHIP_ROLE_ID); }
    catch { throw new PlanningSourceUnavailableError(); }
    if (!rawBlueprint) throw new PlanningSourceUnavailableError();
    let blueprint: RoleBlueprint;
    let registry: UnitRegistry;
    try {
      blueprint = roleBlueprintSchema.parse(structuredClone(rawBlueprint));
      registry = unitRegistrySchema.parse(structuredClone(this.dependencies.flagshipRegistry));
    } catch { throw new PlanningSourceContractError(); }
    try { return validateContext({ reference, blueprint, registry }); }
    catch { throw new PlanningSourceUnavailableError(); }
  }
}

function parseGenerateSource(input: unknown): PlanningGenerateSource {
  try { return planningGenerateSourceSchema.parse(structuredClone(input)); }
  catch { throw new PlanningSourceUnavailableError(); }
}

function parseReference(input: unknown): PlanningSourceReference {
  try { return planningSourceReferenceSchema.parse(structuredClone(input)); }
  catch { throw new PlanningSourceUnavailableError(); }
}

function researchReference(
  researchRunId: string,
  configFingerprint: string,
  packageValue: ResearchPackage,
): Extract<PlanningSourceReference, { source: "research" }> {
  const { contentFingerprint, ...content } = packageValue;
  if (fingerprint(canonicalJson(content)) !== contentFingerprint) throw new PlanningSourceUnavailableError();
  const reference = planningSourceReferenceSchema.parse({
    source: "research",
    researchRunId,
    packageId: packageValue.id,
    blueprintId: packageValue.blueprint.id,
    blueprintVersion: packageValue.blueprint.version,
    registryId: packageValue.registry.id,
    registryVersion: packageValue.registry.version,
    configFingerprint,
    contentFingerprint,
  });
  if (reference.source !== "research") throw new PlanningSourceUnavailableError();
  return reference;
}

function validateContext(input: {
  reference: PlanningSourceReference;
  blueprint: RoleBlueprint;
  registry: UnitRegistry;
}): PlanningSourceContext {
  const context = planningSourceContextSchema.parse(structuredClone(input));
  const issues = [
    ...validateRoleBlueprint(context.blueprint).issues,
    ...validateUnitRegistry(context.registry, context.blueprint).issues,
  ];
  if (issues.length) throw new PlanningSourceUnavailableError();
  if (context.reference.source === "flagship"
    && (context.blueprint.id !== FLAGSHIP_ROLE_ID
      || context.registry.id !== "ai-native-full-stack-engineer-units")) throw new PlanningSourceUnavailableError();
  return context;
}
