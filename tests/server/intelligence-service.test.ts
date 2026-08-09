import { describe, expect, it } from "vitest";
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

  it.each(["draft", "needs-review"] as const)(
    "rejects a %s blueprint because it is not published",
    async (status) => {
      const unpublished = structuredClone(flagshipBlueprint);
      unpublished.status = status;
      const service = new IntelligenceService({
        getPublishedBySlug: async () => unpublished,
      });

      const result = service.getPublished(unpublished.id);
      await expect(result).rejects.toMatchObject({
        message: "Intelligence integrity failed: not-published.",
        issues: [
          {
            code: "not-published",
            path: "status",
            message: "Blueprint is not published.",
          },
        ],
      });
      await expect(result).rejects.not.toThrow(status);
    },
  );

  it("rejects a valid ready blueprint whose identity does not match the requested slug", async () => {
    const differentBlueprint = structuredClone(flagshipBlueprint);
    differentBlueprint.id = "different-ready-role";
    const service = new IntelligenceService({
      getPublishedBySlug: async () => differentBlueprint,
    });

    const result = service.getPublished(flagshipBlueprint.id);
    await expect(result).rejects.toMatchObject({
      message: "Intelligence integrity failed: slug-mismatch.",
      issues: [
        {
          code: "slug-mismatch",
          path: "id",
          message: "Blueprint identity does not match the requested slug.",
        },
      ],
    });
    await expect(result).rejects.not.toThrow(differentBlueprint.id);
  });

  it("rejects repository data that fails cross-entity validation", async () => {
    const broken = structuredClone(flagshipBlueprint);
    const originalResourceId = broken.skills[0]!.resourceIds[0]!;
    broken.skills[0]!.resourceIds = ["missing-source-record"];
    broken.resources = broken.resources.filter(
      (resource) => resource.id !== originalResourceId,
    );
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

  it("rejects shape-valid repository data with duplicate graph references", async () => {
    const broken = structuredClone(flagshipBlueprint);
    broken.phases[0]!.skillIds.push(broken.phases[0]!.skillIds[0]!);
    const service = new IntelligenceService({
      getPublishedBySlug: async () => broken,
    });

    const result = service.getPublished(broken.id);
    await expect(result).rejects.toMatchObject({
      message: "Intelligence integrity failed: duplicate-reference.",
      issues: [
        expect.objectContaining({
          code: "duplicate-reference",
          path: `phases.${broken.phases[0]!.id}.skillIds`,
        }),
      ],
    });
    await expect(result).rejects.toBeInstanceOf(IntelligenceIntegrityError);
  });

  it("rejects repository data that fails strict schema parsing", async () => {
    const malformed = {
      ...structuredClone(flagshipBlueprint),
      privateRepositoryField: "must not be served",
    };
    const service = new IntelligenceService({
      getPublishedBySlug: async () => malformed,
    });

    const result = service.getPublished(malformed.id);
    await expect(result).rejects.toMatchObject({
      message: "Intelligence integrity failed: invalid-schema.",
      issues: [expect.objectContaining({ code: "invalid-schema" })],
    });
    await expect(result).rejects.toBeInstanceOf(IntelligenceIntegrityError);
    await expect(result).rejects.not.toThrow("privateRepositoryField");
  });

  it("rejects a non-public resource URL without leaking its location", async () => {
    const malformed = structuredClone(flagshipBlueprint);
    const privateUrl = "https://169.254.169.254/latest/meta-data";
    malformed.resources[0]!.url = privateUrl;
    const service = new IntelligenceService({
      getPublishedBySlug: async () => malformed,
    });

    const result = service.getPublished(malformed.id);
    await expect(result).rejects.toMatchObject({
      message: "Intelligence integrity failed: invalid-schema.",
      issues: [expect.objectContaining({ code: "invalid-schema" })],
    });
    await expect(result).rejects.toBeInstanceOf(IntelligenceIntegrityError);
    await expect(result).rejects.not.toThrow(privateUrl);
  });

  it("publishes only sorted unique issue codes in the error message", () => {
    const error = new IntelligenceIntegrityError([
      {
        code: "slug-mismatch",
        path: "id",
        message: "private role identity",
      },
      {
        code: "not-published",
        path: "status",
        message: "private publication status",
      },
      {
        code: "slug-mismatch",
        path: "id",
        message: "another private identity detail",
      },
    ]);

    expect(error.message).toBe(
      "Intelligence integrity failed: not-published, slug-mismatch.",
    );
    expect(error.message).not.toMatch(/private|identity|status/u);
    expect(error.issues).toHaveLength(3);
  });

  it("returns null for an unknown role", async () => {
    const service = new IntelligenceService({
      getPublishedBySlug: async () => null,
    });

    await expect(service.getPublished("unknown-role")).resolves.toBeNull();
  });
});
