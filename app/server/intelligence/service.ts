import { roleBlueprintSchema, type RoleBlueprint } from "../../contracts/intelligence";
import {
  validateRoleBlueprint,
  type IntelligenceIssue,
  type IntelligenceIssueCode,
} from "../../lib/intelligence-validation";
import type { IntelligenceRepository } from "./repository";

type SchemaIssue = {
  code: "invalid-schema";
  path: string;
  message: string;
};

type PublicationIssue = {
  code: "not-published" | "slug-mismatch";
  path: string;
  message: string;
};

export type IntelligenceIntegrityIssue =
  | IntelligenceIssue
  | SchemaIssue
  | PublicationIssue;
type IntelligenceIntegrityIssueCode =
  | IntelligenceIssueCode
  | SchemaIssue["code"]
  | PublicationIssue["code"];

export class IntelligenceIntegrityError extends Error {
  override readonly name = "IntelligenceIntegrityError";

  constructor(readonly issues: readonly IntelligenceIntegrityIssue[]) {
    const codes = [
      ...new Set<IntelligenceIntegrityIssueCode>(issues.map((issue) => issue.code)),
    ].sort();
    super(`Intelligence integrity failed: ${codes.join(", ")}.`);
  }
}

export class IntelligenceService {
  constructor(private readonly repository: IntelligenceRepository) {}

  async getPublished(slug: string): Promise<RoleBlueprint | null> {
    const candidate = await this.repository.getPublishedBySlug(slug);
    if (candidate === null) return null;

    const parsed = roleBlueprintSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new IntelligenceIntegrityError(
        parsed.error.issues.map((issue) => ({
          code: "invalid-schema",
          path: issue.path.map(String).join("."),
          message: issue.message,
        })),
      );
    }

    if (parsed.data.status !== "ready") {
      throw new IntelligenceIntegrityError([
        {
          code: "not-published",
          path: "status",
          message: "Blueprint is not published.",
        },
      ]);
    }

    if (parsed.data.id !== slug) {
      throw new IntelligenceIntegrityError([
        {
          code: "slug-mismatch",
          path: "id",
          message: "Blueprint identity does not match the requested slug.",
        },
      ]);
    }

    const validation = validateRoleBlueprint(parsed.data);
    if (!validation.valid) {
      throw new IntelligenceIntegrityError(validation.issues);
    }

    return parsed.data;
  }
}
