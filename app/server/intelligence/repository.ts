import type { RoleBlueprint } from "../../contracts/intelligence";

export interface IntelligenceRepository {
  getPublishedBySlug(slug: string): Promise<RoleBlueprint | null>;
}
