import { z } from "zod";
import type { ProofItem } from "../../domain/learning";

export const publicProofFieldSchema = z.enum(["title", "kind", "skillIds", "verified"]);
export type PublicProofField = z.infer<typeof publicProofFieldSchema>;
export type PublicProofView = Partial<Pick<ProofItem, PublicProofField>>;

export const publicProofFieldsSchema = z.array(publicProofFieldSchema)
  .min(1)
  .max(4)
  .superRefine((fields, context) => {
    if (new Set(fields).size !== fields.length) {
      context.addIssue({ code: "custom", message: "Published proof fields must be distinct." });
    }
  });

const storedPublicViewSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  kind: z.enum(["completion", "commit", "project", "note", "upload"]).optional(),
  skillIds: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
  verified: z.boolean().optional(),
});

export function createPublicProofView(
  proof: ProofItem,
  fields: PublicProofField[],
): PublicProofView {
  const view: PublicProofView = {};
  for (const field of fields) {
    if (field === "title") view.title = proof.title;
    if (field === "kind") view.kind = proof.kind;
    if (field === "skillIds") view.skillIds = [...proof.skillIds];
    if (field === "verified") view.verified = proof.verified;
  }
  return view;
}

export function sanitizeStoredPublicProofView(input: unknown): PublicProofView | null {
  const parsed = storedPublicViewSchema.safeParse(input);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return null;
  return parsed.data;
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
