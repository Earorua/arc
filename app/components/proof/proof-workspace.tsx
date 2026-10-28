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
  draft: "草稿",
  pending_review: "待审核",
  demonstrated: "已有作品证明",
  verified: "已通过验证",
  rejected: "需要修订",
  withdrawn: "已撤回",
  superseded: "已被新版本替代",
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
      if (saved) setNotice("作品记录已更新。");
      return saved;
    } catch {
      if (!mounted.current) return false;
      setNotice("暂时无法保存，请稍后重试。");
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
        ? "草稿已保存。正在准备上传与补充版本…" : "作品已保存，正在更新作品记录…");
    }
    return saved;
  };

  return <div className="proof-workspace" ref={container}>
    {props.recovery === "conflict" && <div className="proof-recovery" role="alert">
      <p>作品记录已在另一处发生变化，请重新加载后再修改。</p>
      <button className="text-action" onClick={() => void props.retry()} type="button">重新加载作品记录</button>
    </div>}
    {props.recovery === "session-expired" && <p className="proof-recovery" role="alert">登录已过期，请重新登录后再修改云端作品。</p>}
    {(props.recovery === "unavailable" || props.source === "offline-cloud") && <p className="proof-recovery" role="alert">云端作品暂时只读，当前可见的版本未发生变化。</p>}
    {props.recovery === "version-unavailable" && <p className="proof-recovery" role="alert">这个作品版本目前无法读取，请恢复作品记录后再修改。</p>}
    {notice && <p className="proof-save-notice" role="status">{notice}</p>}
    <ProofContextReturn />

    {(composing || requestedProof !== null || overview) && <button className="text-action proof-back" onClick={() => navigate({}, "list")} type="button">返回作品列表</button>}

    {composing || (revising && latest) ? <>
      {composing && unitId !== null && !contextualUnit && <p className="workspace-notice" role="status">这个学习单元目前不可关联，请从当前路线选择技能和学习单元。</p>}
      {contextualUnit && <p className="proof-context">来自今日学习 · {contextualUnit.objective}</p>}
      <ProofEditor
        canUpload={props.canUpload}
        dailyUnits={allowedUnits}
        disabled={disabled}
        draftKey={draftKey}
        initial={revising && latest ? { ...latest, visibility } : null}
        contextualUnit={contextualUnit}
        key={`${props.ownerKey ?? "unscoped"}:${revising ? latest?.id : contextualUnit?.id ?? "new"}`}
        onCancel={revising && latest ? () => navigate({ proof: latest.proofId }, "revision") : undefined}
        onSave={save}
        onUpload={(file) => revising && latest ? upload(latest.proofId, file) : Promise.resolve(null)}
        skills={props.skills}
      />
    </> : requestedProof !== null ? latest && selected ? <section className="proof-ledger" aria-labelledby="proof-detail-title">
      <article aria-label={latest.title} className="proof-root">
        <header>
          <div><p className="eyebrow">{artifactLabel(latest.kind)} · {visibility === "public" ? "公开" : "私密"}</p>
            <h2 id="proof-detail-title" tabIndex={-1}>{latest.title}</h2></div>
          <strong className={`proof-state proof-state-${review?.stateAfter ?? "draft"}`}>{stateLabels[review?.stateAfter ?? "draft"]}</strong>
        </header>
        <p>{latest.summary}</p>
        {latest.artifactUrl && <a className="proof-inspect-link" href={latest.artifactUrl} target="_blank" rel="noreferrer">查看作品 ↗</a>}
        {latest.assetId && <p className="workspace-notice">已保存上传文件</p>}
        <p className="proof-review-explanation">{reviewExplanation(review)}</p>
        <div className="proof-root-actions">
          <button className="primary-action" data-proof-revise disabled={disabled} onClick={() => navigate({ proof: latest.proofId, revise: "1" })} type="button">添加修订</button>
          <button className="text-action" disabled={disabled} onClick={() => void run("visibility", () => props.setVisibility(latest.proofId, visibility === "public" ? "private" : "public"))} type="button">{visibility === "public" ? "设为私密" : "设为公开"}</button>
        </div>
        <p className="proof-visibility-note">{visibility === "private" ? "当前仅自己可见。设为公开后，这项作品可用于公开技能证明。" : "当前为公开作品，可用于公开技能证明。"}</p>
        <details className="proof-version-history"><summary>版本记录 · {selected.versions.length}</summary><ol aria-label={`${latest.title} 版本记录`} className="proof-version-list">
          {selected.versions.map((item) => {
            const itemReview = terminalReview(props.workspace?.reviews ?? [], item.id);
            return <li key={item.id}>
              <div><strong>版本 {item.versionNumber}</strong><time dateTime={item.createdAt}>{formatTimestamp(item.createdAt)}</time></div>
              <div><b>{stateLabels[itemReview?.stateAfter ?? "draft"]}</b><span>{reviewExplanation(itemReview)}</span></div>
            </li>;
          })}
        </ol></details>
        <details className="proof-more-actions"><summary>更多操作</summary>
          {confirmWithdrawal === latest.proofId ? <div className="proof-withdraw-confirm" role="group" aria-label="确认撤回作品">
            <p>撤回后，这项作品不再计入当前技能证明。历史版本仍会保留。</p>
            <button className="secondary-action" disabled={disabled} onClick={() => setConfirmWithdrawal(null)} type="button">保留作品</button>
            <button className="text-action" disabled={disabled} onClick={() => void run("withdraw", () => props.withdrawProof(latest.proofId)).then((saved) => { if (saved) setConfirmWithdrawal(null); })} type="button">{activeAction === "withdraw" ? "正在撤回…" : "确认撤回"}</button>
          </div> : <button className="text-action" disabled={disabled || review?.stateAfter === "withdrawn"} onClick={() => setConfirmWithdrawal(latest.proofId)} type="button">撤回作品</button>}
        </details>
      </article>
    </section> : <section className="proof-unavailable" role="status"><h2 tabIndex={-1}>无法读取这项作品</h2><p>{props.source === "restoring" ? "正在恢复作品记录，请稍候。" : "作品可能不属于当前账户，或当前记录暂不可用。返回列表查看可读取的作品。"}</p></section>
    : overview ? <section aria-label="能力概览"><h2 tabIndex={-1}>能力概览</h2>{props.profile}</section>
    : <section className="proof-ledger" aria-labelledby="proof-ledger-title">
      <div className="proof-section-heading">
        <div><p className="eyebrow">作品证据 · {roots.length} 项作品</p><h2 id="proof-ledger-title" tabIndex={-1}>我的作品</h2></div>
        <button className="primary-action" data-proof-add disabled={disabled} onClick={() => { pendingCreated.current = null; setCreatedReady(false); navigate({ compose: "1" }); }} type="button">添加作品</button>
      </div>
      {props.profile && <button className="text-action proof-overview-toggle" onClick={() => navigate({ view: "skills" })} type="button">查看能力概览</button>}
      {roots.length === 0 ? <p className="empty-proof"><strong>还没有提交的作品。</strong> 添加一项作品，把练习变成可查阅的技能证据。</p>
        : <ul className="proof-collection" aria-label="作品列表">{roots.map(({ proofId, versions }) => {
          const item = versions[0];
          const itemReview = terminalReview(props.workspace?.reviews ?? [], item.id);
          const itemVisibility = itemReview?.visibilityAfter ?? item.visibility;
          return <li key={proofId}><button className="proof-list-item" data-proof-select={proofId} aria-label={`查看 ${item.title}`} onClick={() => { lastSelected.current = proofId; navigate({ proof: proofId }); }} type="button">
            <span className="proof-list-kind">{artifactLabel(item.kind)} · {itemVisibility === "public" ? "公开" : "私密"}</span>
            <strong>{item.title}</strong><span className="proof-list-summary">{item.summary}</span>
            <span className="proof-list-meta">{stateLabels[itemReview?.stateAfter ?? "draft"]} · 版本 {item.versionNumber}<span aria-hidden="true">查看 →</span></span>
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
  if (!review) return "草稿已保存；后续修改会新增版本，原记录会保留。";
  if (review.stateAfter === "verified") return "已通过自动检查。";
  if (review.stateAfter === "demonstrated") {
    return review.outcome === "unavailable"
      ? "自动检查暂不可用。作品已通过基础审核，技能状态为「已有作品证明」。"
      : "已通过基础审核，尚未完成自动检查。";
  }
  if (review.stateAfter === "superseded") return "已由后续版本替代，原记录保留。";
  if (review.stateAfter === "rejected") return rejectedExplanation(review.reasonCodes);
  if (review.stateAfter === "withdrawn") return "已从当前技能证明中撤回。";
  if (review.stateAfter === "pending_review") return "已提交，等待审核。";
  return "草稿已保存；后续修改会新增版本，原记录会保留。";
}

function rejectedExplanation(reasonCodes: readonly string[]): string {
  if (reasonCodes.includes("test-report-json-required")) return "验证需要上传 JSON 测试报告。";
  if (reasonCodes.includes("test-report-invalid")) return "上传的测试报告不符合 Arc 支持的格式。";
  if (reasonCodes.includes("test-report-failed")) return "测试报告包含失败的测试或未成功的命令。";
  return "未通过验证，请添加修正版本。";
}

function artifactLabel(kind: ProofVersion["kind"]): string {
  return { repository: "代码仓库", commit: "提交记录", pull_request: "合并请求", deployment: "部署", api: "API", document: "文档", screenshot: "截图", test_report: "测试报告", code: "代码", upload: "上传文件", reflection: "学习反思" }[kind];
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
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
