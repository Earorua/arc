"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { navigateEvidence, useEvidenceQuery } from "../../lib/evidence-navigation";
import { safeContextReturnTo } from "../../lib/navigation-context";
import "./proof-refinement.css";
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
import { ProofContextReturn } from "./proof-context-return";

type Props = {
  ownerKey?: string;
  profile?: ReactNode;
  canUpload: boolean;
  createProof: (input: ProofEditorInput) => Promise<boolean>;
  dailyUnits: readonly DailyUnit[];
  projections: readonly SkillEvidenceProjection[];
  recovery: ProofRecoveryState;
  retry: () => Promise<void>;
  reviseProof: (proofId: string, input: ProofEditorInput) => Promise<boolean>;
  setVisibility: (proofId: string, visibility: ProofVisibility) => Promise<boolean>;
  skills: readonly Pick<SkillNode, "id" | "name">[];
  source: ProofStateSource;
  uploadAsset?: (proofId: string, file: File) => Promise<string | null>;
  withdrawProof: (proofId: string) => Promise<boolean>;
  workspace: ProofLedgerWorkspace | null;
};

const stateLabels: Record<ProofReviewState, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  demonstrated: "Demonstrated",
  verified: "Verified",
  rejected: "Needs revision",
  withdrawn: "Withdrawn",
  superseded: "Superseded",
};

export function ProofWorkspace(props: Props) {
  return <ProofWorkspaceContent key={props.ownerKey ?? "unscoped"} {...props} />;
}

function ProofWorkspaceContent(props: Props) {
  const query = useEvidenceQuery();
  const requestedProof = query.get("proof");
  const composing = query.get("compose") === "1";
  const revising = !composing && requestedProof !== null && query.get("revise") === "1";
  const overview = !composing && requestedProof === null && query.get("view") === "skills" && props.profile;
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmWithdrawal, setConfirmWithdrawal] = useState<string | null>(null);
  const pendingMutation = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const pendingCreated = useRef<{ previousIds: Set<string>; input: ProofEditorInput } | null>(null);
  const [createdReady, setCreatedReady] = useState(false);
  const focusTarget = useRef<"heading" | "revision" | "list" | null>(null);
  const lastSelected = useRef<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const roots = useMemo(() => groupVersions(props.workspace), [props.workspace]);
  const selected = roots.find(({ proofId }) => proofId === requestedProof);
  const mode = composing ? "compose" : revising ? "revision" : requestedProof !== null ? "detail" : overview ? "overview" : "list";
  const previousMode = useRef(mode);
  const latest = selected?.versions[0];
  const review = latest ? terminalReview(props.workspace?.reviews ?? [], latest.id) : null;
  const visibility = review?.visibilityAfter ?? latest?.visibility ?? "private";
  const disabled = activeAction !== null || props.source === "restoring" || props.source === "offline-cloud"
    || props.recovery !== "none";
  const allowedUnits = props.dailyUnits.filter((unit) => props.skills.some(({ id }) => id === unit.skillId));
  const unitId = query.get("unit");
  const contextualUnit = composing ? allowedUnits.find(({ id }) => id === unitId) : undefined;
  const returnTo = safeContextReturnTo(query.get("returnTo"), "/proof");
  const draftScope = props.ownerKey ? `${props.ownerKey}:${props.workspace?.goalId ?? "new"}` : undefined;
  const draftKey = draftScope ? `arc:proof-editor:v1:${draftScope}:${revising ? `revision:${latest?.id}` : `compose:${contextualUnit?.id ?? "general"}`}` : undefined;

  function navigate(values: Record<string, string>, focus: typeof focusTarget.current = "heading", replace = false) {
    focusTarget.current = focus;
    const params = new URLSearchParams(values);
    if (returnTo !== "/proof") params.set("returnTo", returnTo);
    navigateEvidence("/proof", params, replace);
    setConfirmWithdrawal(null);
  }

  useLayoutEffect(() => {
    const changed = previousMode.current !== mode;
    const target = focusTarget.current ?? (changed ? mode === "list" ? "list" : previousMode.current === "revision" && mode === "detail" ? "revision" : "heading" : null);
    if (target === "revision") container.current?.querySelector<HTMLButtonElement>('[data-proof-revise]')?.focus();
    else if (target === "list") {
      const buttons = container.current?.querySelectorAll<HTMLButtonElement>('[data-proof-select]');
      const button = [...buttons ?? []].find((item) => item.dataset.proofSelect === lastSelected.current);
      (button ?? container.current?.querySelector<HTMLButtonElement>('[data-proof-add]'))?.focus();
    } else if (target === "heading") container.current?.querySelector<HTMLHeadingElement>('h2[tabindex]')?.focus();
    focusTarget.current = null;
    previousMode.current = mode;
  }, [requestedProof, composing, revising, overview, mode]);

  // A successful draft creation returns its root through the existing ledger controller.
  // Continue to its next immutable version only after that root is readable.
  useEffect(() => {
    const pending = pendingCreated.current;
    if (!createdReady || !pending) return;
    const created = roots.find(({ proofId, versions }) => !pending.previousIds.has(proofId)
      && versions[0].title === pending.input.title && versions[0].summary === pending.input.summary
      && versions[0].skillIds[0] === pending.input.skillIds[0]);
    if (!created) return;
    pendingCreated.current = null;
    focusTarget.current = "heading";
    const params = new URLSearchParams({ proof: created.proofId });
    if (pending.input.intent === "save_draft" && props.canUpload) params.set("revise", "1");
    if (returnTo !== "/proof") params.set("returnTo", returnTo);
    navigateEvidence("/proof", params, true);
  }, [createdReady, roots, props.canUpload, returnTo]);

  const run = async (name: string, action: () => Promise<boolean>) => {
    if (disabled || pendingMutation.current) return false;
    pendingMutation.current = true;
    setActiveAction(name);
    setNotice(null);
    try {
      const saved = await action();
      if (!mounted.current) return false;
      if (saved) setNotice("Proof updated.");
      return saved;
    } catch {
      if (!mounted.current) return false;
      setNotice("Could not save your changes. Please try again later.");
      return false;
    } finally { pendingMutation.current = false; setActiveAction(null); }
  };

  const upload = async (proofId: string, file: File) => {
    if (!props.canUpload || disabled || pendingMutation.current) return null;
    pendingMutation.current = true;
    setActiveAction("upload");
    try { return await (props.uploadAsset ?? uploadProofAsset)(proofId, file); }
    catch { return null; }
    finally { pendingMutation.current = false; setActiveAction(null); }
  };

  const save = async (input: ProofEditorInput) => {
    const startedAt = window.location.search;
    const previousIds = new Set(roots.map(({ proofId }) => proofId));
    const saved = await run(revising ? "revise" : "create", () => revising && latest
      ? props.reviseProof(latest.proofId, input) : props.createProof(input));
    if (window.location.pathname !== "/proof" || window.location.search !== startedAt) return saved;
    if (saved && revising && latest) navigate({ proof: latest.proofId });
    if (saved && !revising) {
      pendingCreated.current = { previousIds, input };
      setCreatedReady(true);
      setNotice(input.intent === "save_draft" && props.canUpload
        ? "Draft saved. Preparing uploads and your next version…" : "Proof saved. Updating your collection…");
    }
    return saved;
  };

  return <div className="proof-workspace" ref={container}>
    {props.recovery === "conflict" && <div className="proof-recovery" role="alert">
      <p>Your proof changed elsewhere. Reload it before making changes.</p>
      <button className="text-action" onClick={() => void props.retry()} type="button">Reload proof</button>
    </div>}
    {props.recovery === "session-expired" && <p className="proof-recovery" role="alert">Your session has expired. Sign in again to edit your cloud proof.</p>}
    {(props.recovery === "unavailable" || props.source === "offline-cloud") && <p className="proof-recovery" role="alert">Cloud proof is temporarily read-only. The visible versions are unchanged.</p>}
    {props.recovery === "version-unavailable" && <p className="proof-recovery" role="alert">This proof version is unavailable. Restore your proof records before making changes.</p>}
    {notice && <p className="proof-save-notice" role="status">{notice}</p>}
    <ProofContextReturn />

    {(composing || requestedProof !== null || overview) && <button className="text-action proof-back" onClick={() => navigate({}, "list")} type="button">Back to proof collection</button>}

    {composing || (revising && latest) ? <>
      {composing && unitId !== null && !contextualUnit && <p className="workspace-notice" role="status">This learning unit cannot be linked right now. Choose a skill and learning unit from your current path.</p>}
      {contextualUnit && <p className="proof-context">From Today · {contextualUnit.objective}</p>}
      <ProofEditor
        canUpload={props.canUpload}
        dailyUnits={allowedUnits}
        disabled={disabled}
        draftKey={draftKey}
        initial={revising && latest ? { ...latest, visibility } : null}
        contextualUnit={contextualUnit}
        key={draftKey ?? `${props.workspace?.goalId ?? "new"}:${revising ? latest?.id : contextualUnit?.id ?? "new"}`}
        onCancel={revising && latest ? () => navigate({ proof: latest.proofId }, "revision") : undefined}
        onSave={save}
        onUpload={(file) => revising && latest ? upload(latest.proofId, file) : Promise.resolve(null)}
        skills={props.skills}
      />
    </> : requestedProof !== null ? latest && selected ? <section className="proof-ledger" aria-labelledby="proof-detail-title">
      <article aria-label={latest.title} className="proof-root">
        <header>
          <div><p className="eyebrow">{artifactLabel(latest.kind)} · {visibility === "public" ? "Public" : "Private"}</p>
            <h2 id="proof-detail-title" tabIndex={-1}>{latest.title}</h2></div>
          <strong className={`proof-state proof-state-${review?.stateAfter ?? "draft"}`}>{stateLabels[review?.stateAfter ?? "draft"]}</strong>
        </header>
        <p>{latest.summary}</p>
        {latest.artifactUrl && <a className="proof-inspect-link" href={latest.artifactUrl} target="_blank" rel="noreferrer">View work ↗</a>}
        {latest.assetId && <p className="workspace-notice">Uploaded file saved</p>}
        <p className="proof-review-explanation">{reviewExplanation(review)}</p>
        <div className="proof-root-actions">
          <button className="primary-action" data-proof-revise disabled={disabled} onClick={() => navigate({ proof: latest.proofId, revise: "1" })} type="button">Add revision</button>
          <button className="text-action" disabled={disabled} onClick={() => void run("visibility", () => props.setVisibility(latest.proofId, visibility === "public" ? "private" : "public"))} type="button">{visibility === "public" ? "Make private" : "Make public"}</button>
        </div>
        <p className="proof-visibility-note">{visibility === "private" ? "Visible only to you. Making this work public allows it to support your public skill evidence." : "This work is public and can support your public skill evidence."}</p>
        <details className="proof-version-history"><summary>Version history · {selected.versions.length}</summary><ol aria-label={`${latest.title} Version history`} className="proof-version-list">
          {selected.versions.map((item) => {
            const itemReview = terminalReview(props.workspace?.reviews ?? [], item.id);
            return <li key={item.id}>
              <div><strong>Version {item.versionNumber}</strong><time dateTime={item.createdAt}>{formatTimestamp(item.createdAt)}</time></div>
              <div><b>{stateLabels[itemReview?.stateAfter ?? "draft"]}</b><span>{reviewExplanation(itemReview)}</span></div>
            </li>;
          })}
        </ol></details>
        <details className="proof-more-actions"><summary>More actions</summary>
          {confirmWithdrawal === latest.proofId ? <div className="proof-withdraw-confirm" role="group" aria-label="Confirm proof withdrawal">
            <p>Withdrawing this work removes it from your current skill evidence. Past versions are preserved.</p>
            <button className="secondary-action" disabled={disabled} onClick={() => setConfirmWithdrawal(null)} type="button">Keep proof</button>
            <button className="text-action" disabled={disabled} onClick={() => void run("withdraw", () => props.withdrawProof(latest.proofId)).then((saved) => { if (saved) setConfirmWithdrawal(null); })} type="button">{activeAction === "withdraw" ? "Withdrawing…" : "Confirm withdrawal"}</button>
          </div> : <button className="text-action" disabled={disabled || review?.stateAfter === "withdrawn"} onClick={() => setConfirmWithdrawal(latest.proofId)} type="button">Withdraw proof</button>}
        </details>
      </article>
    </section> : <section className="proof-unavailable" role="status"><h2 tabIndex={-1}>This proof is unavailable</h2><p>{props.source === "restoring" ? "Restoring your proof records. Please wait." : "This work may belong to another account, or its record may be temporarily unavailable. Return to your collection to view available proof."}</p></section>
    : overview ? <section aria-label="Skill overview"><h2 tabIndex={-1}>Skill overview</h2>{props.profile}</section>
    : <section className="proof-ledger" aria-labelledby="proof-ledger-title">
      <div className="proof-section-heading">
        <div><p className="eyebrow">Proof · {roots.length} {roots.length === 1 ? "item" : "items"}</p><h2 id="proof-ledger-title" tabIndex={-1}>My proof</h2></div>
        <button className="primary-action" data-proof-add disabled={disabled} onClick={() => { pendingCreated.current = null; setCreatedReady(false); navigate({ compose: "1" }); }} type="button">Add proof</button>
      </div>
      {props.profile && <button className="text-action proof-overview-toggle" onClick={() => navigate({ view: "skills" })} type="button">View skill overview</button>}
      {roots.length === 0 ? <p className="empty-proof"><strong>No proof submitted yet.</strong> Add your work to turn practice into skill evidence others can review.</p>
        : <ul className="proof-collection" aria-label="Proof collection">{roots.map(({ proofId, versions }) => {
          const item = versions[0];
          const itemReview = terminalReview(props.workspace?.reviews ?? [], item.id);
          const itemVisibility = itemReview?.visibilityAfter ?? item.visibility;
          return <li key={proofId}><button className="proof-list-item" data-proof-select={proofId} aria-label={`View ${item.title}`} onClick={() => { lastSelected.current = proofId; navigate({ proof: proofId }); }} type="button">
            <span className="proof-list-kind">{artifactLabel(item.kind)} · {itemVisibility === "public" ? "Public" : "Private"}</span>
            <strong>{item.title}</strong><span className="proof-list-summary">{item.summary}</span>
            <span className="proof-list-meta">{stateLabels[itemReview?.stateAfter ?? "draft"]} · Version {item.versionNumber}<span aria-hidden="true">View →</span></span>
          </button></li>;
        })}</ul>}
    </section>}
  </div>;
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
  if (!review) return "Draft saved. Future changes create a new version and preserve the original.";
  if (review.stateAfter === "verified") return "Passed automatic checks.";
  if (review.stateAfter === "demonstrated") {
    return review.outcome === "unavailable"
      ? "Automatic checks are temporarily unavailable. Your work passed the basic review and the skill is marked Demonstrated."
      : "Passed basic review. Automatic checks are not yet complete.";
  }
  if (review.stateAfter === "superseded") return "Replaced by a later version. The original record is preserved.";
  if (review.stateAfter === "rejected") return rejectedExplanation(review.reasonCodes);
  if (review.stateAfter === "withdrawn") return "Withdrawn from your current skill evidence.";
  if (review.stateAfter === "pending_review") return "Submitted and awaiting review.";
  return "Draft saved. Future changes create a new version and preserve the original.";
}

function rejectedExplanation(reasonCodes: readonly string[]): string {
  if (reasonCodes.includes("test-report-json-required")) return "Upload a JSON test report for verification.";
  if (reasonCodes.includes("test-report-invalid")) return "The uploaded test report is not in a format Arc supports.";
  if (reasonCodes.includes("test-report-failed")) return "The test report contains failed tests or unsuccessful commands.";
  return "Verification failed. Add a revised version.";
}

function artifactLabel(kind: ProofVersion["kind"]): string {
  return { repository: "Repository", commit: "Commit", pull_request: "Pull request", deployment: "Deployment", api: "API", document: "Document", screenshot: "Screenshot", test_report: "Test report", code: "Code", upload: "Uploaded file", reflection: "Learning reflection" }[kind];
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
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
