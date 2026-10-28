import { z } from "zod";
import { proofArtifactKindSchema, proofVisibilitySchema } from "../../contracts/proof-ledger";
import type { DailyUnit } from "../../contracts/planning";

const draftSchema = z.object({
  title: z.string().max(180), summary: z.string().max(2000), kind: proofArtifactKindSchema,
  artifactUrl: z.string().max(2048), assetId: z.string().max(256).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).nullable(),
  skillId: z.string().max(256), dailyUnitId: z.string().max(256), visibility: proofVisibilitySchema,
  validatorKey: z.enum(["", "proof.test-report.v1"]),
}).strict();
export type EditorDraft = z.infer<typeof draftSchema>;

export function readEditorDraft(key: string | undefined, skillIds: readonly string[], units: readonly DailyUnit[]): EditorDraft | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw || raw.length > 12_000) return null;
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const draft = parsed.data;
    if (draft.skillId && !skillIds.includes(draft.skillId)) return null;
    if (draft.dailyUnitId && !units.some((unit) => unit.id === draft.dailyUnitId && unit.skillId === draft.skillId)) return null;
    if ((draft.validatorKey && draft.kind !== "test_report") || (draft.assetId && draft.artifactUrl)) return null;
    return draft;
  } catch { return null; }
}

export function saveEditorDraft(key: string | undefined, draft: EditorDraft) {
  if (!key) return;
  try { sessionStorage.setItem(key, JSON.stringify(draft)); } catch { /* The current form stays usable when storage is unavailable. */ }
}

export function clearEditorDraft(key: string | undefined) {
  if (!key) return;
  try { sessionStorage.removeItem(key); } catch { /* A saved cloud version does not depend on browser storage. */ }
}
