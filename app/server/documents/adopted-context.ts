import { materialSelectionEntriesSchema } from "../../contracts/documents";
import { contextInputSnapshotSchema, createMaterialContextFingerprint, type ContextInputSnapshot } from "../../contracts/material-planning";
import { canonicalJson } from "../../lib/planning/fingerprint";
import type { MaterialPlanCommit } from "../planning/material-commit";

type Dependency = ContextInputSnapshot["dependencies"][number];
type AdoptedLink = Readonly<Dependency & { contextVersionId: string }>;
type BaselineContext = Readonly<{ id: string; snapshotJson: string; fingerprint: string }>;
export type AdoptedContextMatch = Readonly<{
  matches: true;
  baselineLinks: readonly AdoptedLink[];
  baselineContext: BaselineContext | null;
}>;
export type AdoptedContextComparison = AdoptedContextMatch | Readonly<{ matches: false }>;
type LinkRow = {
  context_version_id: string; slot: Dependency["slot"]; document_id: string; document_version_id: string; confirmation_id: string;
  text_version_id: string | null; generation: number | null; confirmation_digest: string | null; committed: number;
};

/** Compare adoption, not preview identity, scheduling inputs, or a coincidentally equal priority overlay. */
export async function compareAdoptedContext(db: D1Database, ownerId: string, candidate: MaterialPlanCommit): Promise<AdoptedContextComparison> {
  const { snapshot } = candidate;
  if (snapshot.ownerId !== ownerId || snapshot.scope.kind !== "goal") return { matches: false };
  const { goalId, workspaceId } = snapshot.scope;
  // Keep broken enabled links in the result. Dropping them in an inner join would mistake an
  // unprovable current adoption for an empty one. A proposal/history link alone is never proof.
  const { results: rows } = await db.prepare(`
    SELECT l.context_version_id,l.slot,l.document_id,l.document_version_id,l.confirmation_id,
      x.text_version_id,x.generation,x.confirmation_digest,
      EXISTS(SELECT 1 FROM document_usage_links u WHERE u.owner_id=l.owner_id AND u.goal_id=l.goal_id
        AND u.workspace_id=?3 AND u.context_version_id=l.context_version_id AND u.kind IN ('generation','accepted')) AS committed
    FROM goal_document_links l LEFT JOIN material_context_dependencies x ON x.owner_id=l.owner_id
      AND x.context_version_id=l.context_version_id AND x.document_id=l.document_id
      AND x.document_version_id=l.document_version_id AND x.confirmation_id=l.confirmation_id AND x.slot=l.slot
    WHERE l.owner_id=?1 AND l.goal_id=?2 AND l.purpose='planning' AND l.enabled=1
    ORDER BY l.slot,l.document_id LIMIT 6
  `).bind(ownerId, goalId, workspaceId).all<LinkRow>();
  if (!rows.length) return snapshot.dependencies.length ? { matches: false } : { matches: true, baselineLinks: [], baselineContext: null };
  if (rows.length !== snapshot.dependencies.length || rows.some(row => !row.committed)) return { matches: false };
  const entries = rows.map(row => ({ slot: row.slot, documentId: row.document_id, documentVersionId: row.document_version_id, confirmationId: row.confirmation_id }));
  if (!materialSelectionEntriesSchema.safeParse(entries).success || new Set(rows.map(row => row.context_version_id)).size !== 1) return { matches: false };
  const contextId = rows[0]!.context_version_id;
  const context = await db.prepare("SELECT id,snapshot_json,fingerprint,state FROM material_context_versions WHERE owner_id=?1 AND id=?2")
    .bind(ownerId, contextId).first<{ id: string; snapshot_json: string; fingerprint: string; state: string }>();
  if (!context || context.state !== "active") return { matches: false };
  let stored: unknown;
  try { stored = JSON.parse(context.snapshot_json); } catch { return { matches: false }; }
  const parsed = contextInputSnapshotSchema.safeParse(stored);
  if (!parsed.success || parsed.data.ownerId !== ownerId || await createMaterialContextFingerprint(parsed.data) !== context.fingerprint) return { matches: false };
  const baseline = parsed.data;
  if (baseline.scope.kind === "goal" && (baseline.scope.goalId !== goalId || baseline.scope.workspaceId !== workspaceId)) return { matches: false };
  const links: AdoptedLink[] = [];
  for (const row of rows) {
    const dependency = baseline.dependencies.find(item => item.documentId === row.document_id);
    if (!dependency || canonicalJson(dependency) !== canonicalJson({ slot: row.slot, documentId: row.document_id,
      documentVersionId: row.document_version_id, confirmationId: row.confirmation_id, textVersionId: row.text_version_id,
      generation: row.generation, confirmationDigest: row.confirmation_digest })) return { matches: false };
    links.push({ ...dependency, contextVersionId: contextId });
  }
  // Explicit detach leaves the immutable history snapshot intact. Only its still-enabled
  // sources and choices describe current adoption; redacted snapshots cannot supply choices.
  const enabled = new Set(links.map(link => link.documentId));
  if (canonicalJson(adoptionSemantics(snapshot)) !== canonicalJson(adoptionSemantics(baseline, enabled))) return { matches: false };
  return { matches: true, baselineLinks: links, baselineContext: { id: context.id, snapshotJson: context.snapshot_json, fingerprint: context.fingerprint } };
}

function adoptionSemantics(snapshot: ContextInputSnapshot, enabled?: ReadonlySet<string>) {
  const dependencies = snapshot.dependencies.filter(item => !enabled || enabled.has(item.documentId));
  const confirmations = new Set(dependencies.map(item => item.confirmationId));
  const retained = <T extends { confirmationId: string }>(items: readonly T[] | undefined) => (items ?? []).filter(item => confirmations.has(item.confirmationId));
  const sorted = <T>(items: readonly T[]) => [...items].sort((left, right) => {
    const a = canonicalJson(left), b = canonicalJson(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return {
    dependencies: sorted(dependencies),
    skillMappings: sorted(retained(snapshot.skillMappings)),
    termMappings: sorted(retained(snapshot.termMappings).map(item => ({ ...item, skillIds: [...item.skillIds].sort() }))),
    learningIntents: sorted(retained(snapshot.learningIntents)),
    sourceReference: snapshot.sourceReference, sourceVersions: snapshot.sourceVersions ?? null,
    policyVersion: snapshot.policyVersion, mappingVersion: snapshot.mappingVersion, explanationVersion: snapshot.explanationVersion,
  };
}

/** Fence the exact evidence read above in the same transaction as the no-change receipt. */
export function adoptedContextGuardStatement(db: D1Database, ownerId: string, commit: MaterialPlanCommit, match: AdoptedContextMatch): D1PreparedStatement {
  if (commit.snapshot.ownerId !== ownerId || commit.snapshot.scope.kind !== "goal") throw new Error("MATERIAL_ADOPTION_SCOPE_MISMATCH");
  const { goalId, workspaceId } = commit.snapshot.scope;
  return db.prepare(`SELECT json(CASE WHEN
    (SELECT count(*) FROM goal_document_links WHERE owner_id=?1 AND goal_id=?2 AND purpose='planning' AND enabled=1)=json_array_length(?4)
    AND NOT EXISTS(SELECT 1 FROM json_each(?4) expected WHERE NOT EXISTS(
      SELECT 1 FROM goal_document_links l JOIN material_context_dependencies x ON x.owner_id=l.owner_id
        AND x.context_version_id=l.context_version_id AND x.document_id=l.document_id
        AND x.document_version_id=l.document_version_id AND x.confirmation_id=l.confirmation_id AND x.slot=l.slot
      WHERE l.owner_id=?1 AND l.goal_id=?2 AND l.purpose='planning' AND l.enabled=1
        AND l.context_version_id=json_extract(expected.value,'$.contextVersionId') AND l.slot=json_extract(expected.value,'$.slot')
        AND l.document_id=json_extract(expected.value,'$.documentId') AND l.document_version_id=json_extract(expected.value,'$.documentVersionId')
        AND l.confirmation_id=json_extract(expected.value,'$.confirmationId') AND x.text_version_id=json_extract(expected.value,'$.textVersionId')
        AND x.generation=json_extract(expected.value,'$.generation') AND x.confirmation_digest=json_extract(expected.value,'$.confirmationDigest')
        AND EXISTS(SELECT 1 FROM document_usage_links u WHERE u.owner_id=l.owner_id AND u.goal_id=l.goal_id AND u.workspace_id=?3
          AND u.context_version_id=l.context_version_id AND u.kind IN ('generation','accepted'))
    )) AND (?5 IS NULL OR EXISTS(SELECT 1 FROM material_context_versions c WHERE c.owner_id=?1 AND c.id=?5
      AND c.state='active' AND c.snapshot_json=?6 AND c.fingerprint=?7))
    THEN '{}' ELSE '' END) AS adopted_context_guard`).bind(ownerId, goalId, workspaceId, JSON.stringify(match.baselineLinks),
    match.baselineContext?.id ?? null, match.baselineContext?.snapshotJson ?? null, match.baselineContext?.fingerprint ?? null);
}
