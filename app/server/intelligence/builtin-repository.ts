import { flagshipBlueprint } from "../../data/flagship-blueprint";
import type { IntelligenceRepository } from "./repository";

export class BuiltinIntelligenceRepository implements IntelligenceRepository {
  async getPublishedBySlug(slug: string) {
    return slug === flagshipBlueprint.id ? flagshipBlueprint : null;
  }
}
