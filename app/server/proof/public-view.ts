import { z } from "zod";
import {
  proofArtifactKindSchema,
  type ProofVersion,
} from "../../contracts/proof-ledger";

export const PUBLIC_PROOF_SCHEMA_VERSION = "2026.08.1" as const;

export const publicProofFieldSchema = z.enum([
  "title",
  "kind",
  "skillNames",
  "status",
  "summary",
  "submittedAt",
  "versionNumber",
]);
export type PublicProofField = z.infer<typeof publicProofFieldSchema>;

export const publicProofFieldsSchema = z.array(publicProofFieldSchema)
  .min(1)
  .max(7)
  .superRefine((fields, context) => {
    if (new Set(fields).size !== fields.length) {
      context.addIssue({ code: "custom", message: "Published proof fields must be distinct." });
    }
  });

export const storedPublicProofViewSchema = z.object({
  schemaVersion: z.literal(PUBLIC_PROOF_SCHEMA_VERSION),
  title: z.string().trim().min(1).max(180).optional(),
  kind: proofArtifactKindSchema.optional(),
  skillNames: z.array(z.string().trim().min(1).max(120)).min(1).max(32).optional(),
  status: z.enum(["demonstrated", "verified"]).optional(),
  summary: z.string().trim().min(1).max(2000).optional(),
  submittedAt: z.string().datetime({ offset: true }).optional(),
  versionNumber: z.number().int().positive().max(10_000).optional(),
}).strict().superRefine((view, context) => {
  if (Object.keys(view).length === 1) {
    context.addIssue({ code: "custom", message: "A public proof snapshot must include a selected field." });
  }
});

export type PublicProofView = z.infer<typeof storedPublicProofViewSchema>;

export function createPublicProofView(input: {
  version: ProofVersion;
  status: "demonstrated" | "verified";
  skillNames: readonly string[];
  fields: PublicProofField[];
}): PublicProofView {
  const view: Record<string, unknown> = { schemaVersion: PUBLIC_PROOF_SCHEMA_VERSION };
  for (const field of input.fields) {
    if (field === "title") view.title = input.version.title;
    if (field === "kind") view.kind = input.version.kind;
    if (field === "skillNames") view.skillNames = [...input.skillNames];
    if (field === "status") view.status = input.status;
    if (field === "summary") view.summary = input.version.summary;
    if (field === "submittedAt") view.submittedAt = input.version.createdAt;
    if (field === "versionNumber") view.versionNumber = input.version.versionNumber;
  }
  return storedPublicProofViewSchema.parse(view);
}

export function sanitizeStoredPublicProofView(input: unknown): PublicProofView | null {
  const parsed = storedPublicProofViewSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export async function hashShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}
