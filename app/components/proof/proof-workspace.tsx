"use client";

import { useMemo, useState } from "react";
import type { DailyUnit } from "../../contracts/planning";
import type {
  ProofLedgerWorkspace,
  ProofReviewEvent,
  ProofReviewState,
  ProofVersion,
  ProofVisibility,
  SkillEvidenceProjection,
} from "../../contracts/proof-ledger";
import type { SkillNode } from "../../domain/learning";
import type { ProofRecoveryState, ProofStateSource } from "../../lib/use-proof-ledger";
import { ProofEditor, type ProofEditorInput } from "./proof-editor";

type Props = {
  canUpload: boolean;
  createProof: (input: ProofEditorInput) => Promise<boolean>;
  dailyUnits: readonly DailyUnit[];
  projections: readonly SkillEvidenceProjection[];
  recovery: ProofRecoveryState;
  retry: () => Promise<void>;
  reviseProof: (proofId: string, input: ProofEditorInput) => Promise<boolean>;
  setVisibility: (proofId: string, visibility: ProofVisibility) => Promise<boolean>;
  skills: readonly SkillNode[];
  source: ProofStateSource;
  uploadAsset?: (proofId: string, file: File) => Promise<string | null>;
  withdrawProof: (proofId: string) => Promise<boolean>;
  workspace: ProofLedgerWorkspace | null;
};

const stateLabels: Record<ProofReviewState, string> = {
  draft: "Draft",
  pending_review: "Under review",
  demonstrated: "Demonstrated",
  verified: "Verified",
  rejected: "Needs revision",
  withdrawn: "Withdrawn",
  superseded: "Superseded",
};

export function ProofWorkspace(props: Props) {
  const [editing, setEditing] = useState<ProofVersion | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const roots = useMemo(() => groupVersions(props.workspace), [props.workspace]);
  const disabled = activeAction !== null || props.source === "restoring" || props.source === "offline-cloud"
    || props.recovery !== "none";

  const run = async (name: string, action: () => Promise<boolean>) => {
    if (disabled) return false;
    setActiveAction(name);
    setNotice(null);
    try {
      const saved = await action();
      if (saved) setNotice("Proof workspace updated.");
      return saved;
    } finally { setActiveAction(null); }
  };

  const upload = async (proofId: string, file: File) => {
    if (!props.canUpload || disabled) return null;
    setActiveAction("upload");
    try {
      return await (props.uploadAsset ?? uploadProofAsset)(proofId, file);
    } catch {
      return null;
    } finally { setActiveAction(null); }
  };

  return (
    <div className="proof-workspace">
      {props.recovery === "conflict" && (
        <div className="proof-recovery" role="alert">
          <p>This proof workspace changed in another session. Reload before making another change.</p>
          <button className="text-action" onClick={() => void props.retry()} type="button">Reload proof workspace</button>
        </div>
      )}
      {props.recovery === "session-expired" && <p className="proof-recovery" role="alert">Your session expired. Sign in again before changing cloud evidence.</p>}
      {(props.recovery === "unavailable" || props.source === "offline-cloud") && <p className="proof-recovery" role="alert">Cloud evidence is temporarily read-only. Your visible versions have not been changed.</p>}
      {notice && <p className="proof-save-notice" role="status">{notice}</p>}

      <ProofEditor
        canUpload={props.canUpload}
        dailyUnits={props.dailyUnits}
        disabled={disabled}
        initial={editing}
        key={editing?.id ?? "new-proof"}
        onCancel={editing ? () => setEditing(null) : undefined}
        onSave={(input) => run(editing ? "revise" : "create", () => editing
          ? props.reviseProof(editing.proofId, input)
          : props.createProof(input))}
        onUpload={(file) => editing ? upload(editing.proofId, file) : Promise.resolve(null)}
        skills={props.skills}
      />

      <section className="proof-ledger" aria-labelledby="proof-ledger-title">
        <div className="proof-section-heading">
          <div>
            <p className="eyebrow">Version ledger</p>
            <h2 id="proof-ledger-title">Evidence history.</h2>
          </div>
          <span>{roots.length} {roots.length === 1 ? "proof" : "proofs"}</span>
        </div>
        {roots.length === 0 ? (
          <p className="empty-proof"><strong>No submitted proof yet.</strong> Save a draft or submit a public URL to begin an immutable history.</p>
        ) : (
          <div className="proof-root-list">
            {roots.map(({ proofId, versions }) => {
              const latest = versions[0];
              const currentReview = terminalReview(props.workspace?.reviews ?? [], latest.id);
              const visibility = currentReview?.visibilityAfter ?? latest.visibility;
              return (
                <article aria-label={latest.title} className="proof-root" key={proofId}>
                  <header>
                    <div>
                      <p className="eyebrow">{artifactLabel(latest.kind)} · {visibility}</p>
                      <h3>{latest.title}</h3>
                    </div>
                    <strong className={`proof-state proof-state-${currentReview?.stateAfter ?? "draft"}`}>
                      {stateLabels[currentReview?.stateAfter ?? "draft"]}
                    </strong>
                  </header>
                  <p>{latest.summary}</p>
                  <div className="proof-root-actions">
                    <button className="text-action" disabled={disabled} onClick={() => setEditing(latest)} type="button">Add revision</button>
                    <button className="text-action" disabled={disabled} onClick={() => void run("visibility", () => props.setVisibility(proofId, visibility === "public" ? "private" : "public"))} type="button">{visibility === "public" ? "Make private" : "Make public"}</button>
                    <button className="text-action" disabled={disabled} onClick={() => void run("withdraw", () => props.withdrawProof(proofId))} type="button">{activeAction === "withdraw" ? "Withdrawing…" : "Withdraw proof"}</button>
                  </div>
                  <ol aria-label={`${latest.title} version history`} className="proof-version-list">
                    {versions.map((item) => {
                      const review = terminalReview(props.workspace?.reviews ?? [], item.id);
                      const state = review?.stateAfter ?? "draft";
                      return (
                        <li key={item.id}>
                          <div>
                            <strong>Version {item.versionNumber}</strong>
                            <time dateTime={item.createdAt}>{formatTimestamp(item.createdAt)}</time>
                          </div>
                          <div>
                            <b>{stateLabels[state]}</b>
                            <span>{reviewExplanation(review)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function groupVersions(workspace: ProofLedgerWorkspace | null) {
  const grouped = new Map<string, ProofVersion[]>();
  for (const version of workspace?.versions ?? []) {
    const versions = grouped.get(version.proofId) ?? [];
    versions.push(version);
    grouped.set(version.proofId, versions);
  }
  return [...grouped].map(([proofId, versions]) => ({
    proofId,
    versions: versions.sort((left, right) => right.versionNumber - left.versionNumber),
  })).sort((left, right) => Date.parse(right.versions[0].createdAt) - Date.parse(left.versions[0].createdAt));
}

function terminalReview(reviews: readonly ProofReviewEvent[], versionId: string): ProofReviewEvent | null {
  return reviews.filter((review) => review.versionId === versionId)
    .sort((left, right) => right.sequence - left.sequence || Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0] ?? null;
}

function reviewExplanation(review: ProofReviewEvent | null): string {
  if (!review) return "Saved as an immutable draft.";
  if (review.stateAfter === "verified") return "Passed deterministic validation.";
  if (review.stateAfter === "demonstrated") {
    return review.outcome === "unavailable"
      ? "The deterministic validator was unavailable; structural review still demonstrated the skill."
      : "Passed structural review; no deterministic validator confirmed it.";
  }
  if (review.stateAfter === "superseded") return "Superseded by a later immutable version.";
  if (review.stateAfter === "rejected") return rejectedExplanation(review.reasonCodes);
  if (review.stateAfter === "withdrawn") return "Withdrawn from active evidence.";
  if (review.stateAfter === "pending_review") return "Submitted and awaiting review.";
  return "Saved as an immutable draft.";
}

function rejectedExplanation(reasonCodes: readonly string[]): string {
  if (reasonCodes.includes("test-report-json-required")) return "Validation requires an uploaded JSON test report.";
  if (reasonCodes.includes("test-report-invalid")) return "The uploaded test report did not match Arc’s supported format.";
  if (reasonCodes.includes("test-report-failed")) return "The deterministic test report contains a failed test or unsuccessful command.";
  return "Validation did not pass. Add a corrected revision.";
}

function artifactLabel(kind: ProofVersion["kind"]): string {
  return kind.replaceAll("_", " ").replace(/^./u, (first) => first.toUpperCase());
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}

async function uploadProofAsset(proofId: string, file: File): Promise<string | null> {
  const form = new FormData();
  form.set("proofId", proofId);
  form.set("file", file);
  const response = await fetch("/api/proofs/upload", { method: "POST", credentials: "include", body: form });
  if (!response.ok) return null;
  const value = await readBoundedUploadResponse(response);
  if (!value || typeof value !== "object" || !("asset" in value)) return null;
  const asset = (value as { asset?: unknown }).asset;
  if (!asset || typeof asset !== "object" || !("id" in asset)) return null;
  const id = (asset as { id?: unknown }).id;
  return typeof id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) ? id : null;
}

async function readBoundedUploadResponse(response: Response): Promise<unknown> {
  const maximumBytes = 32 * 1024;
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) { await reader.cancel().catch(() => undefined); return null; }
    chunks.push(value);
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined)) as unknown; }
  catch { return null; }
}
