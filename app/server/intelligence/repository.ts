export interface IntelligenceRepository {
  getPublishedBySlug(slug: string): Promise<unknown | null>;
}
