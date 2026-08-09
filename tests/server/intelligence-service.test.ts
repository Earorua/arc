import { describe, expect, it } from "vitest";
import type { RoleBlueprint } from "../../app/contracts/intelligence";
import { flagshipBlueprint } from "../../app/data/flagship-blueprint";
import {
  IntelligenceIntegrityError,
  IntelligenceService,
} from "../../app/server/intelligence/service";

describe("IntelligenceService", () => {
  it("returns a valid published blueprint", async () => {
    const service = new IntelligenceService({
      getPublishedBySlug: async () => flagshipBlueprint,
    });

    await expect(
      service.getPublished("ai-native-full-stack-engineer"),
    ).resolves.toEqual(flagshipBlueprint);
  });

  it("rejects repository data that fails cross-entity validation", async () => {
    const broken = structuredClone(flagshipBlueprint);
    broken.skills[0]!.resourceIds = ["missing-source-record"];
    const service = new IntelligenceService({
      getPublishedBySlug: async () => broken,
    });

    const result = service.getPublished(broken.id);
    await expect(result).rejects.toMatchObject({
      message: "Intelligence integrity failed: missing-resource.",
      issues: [
        expect.objectContaining({
          code: "missing-resource",
          path: `skills.${broken.skills[0]!.id}.resourceIds`,
        }),
      ],
    });
    await expect(result).rejects.toBeInstanceOf(IntelligenceIntegrityError);
    await expect(result).rejects.not.toThrow("missing-source-record");
  });

  it("rejects repository data that fails strict schema parsing", async () => {
    const malformed = {
      ...structuredClone(flagshipBlueprint),
      privateRepositoryField: "must not be served",
    };
    const service = new IntelligenceService({
      getPublishedBySlug: async () => malformed as unknown as RoleBlueprint,
    });

    const result = service.getPublished(malformed.id);
    await expect(result).rejects.toMatchObject({
      message: "Intelligence integrity failed: invalid-schema.",
      issues: [expect.objectContaining({ code: "invalid-schema" })],
    });
    await expect(result).rejects.toBeInstanceOf(IntelligenceIntegrityError);
    await expect(result).rejects.not.toThrow("privateRepositoryField");
  });

  it("returns null for an unknown role", async () => {
    const service = new IntelligenceService({
      getPublishedBySlug: async () => null,
    });

    await expect(service.getPublished("unknown-role")).resolves.toBeNull();
  });
});
