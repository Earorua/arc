"use client";

import { useMemo, useRef, useState } from "react";
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
  const [editing, setEditing] = useState<ProofVersion | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const revisionTrigger = useRef<HTMLButtonElement | null>(null);
  const roots = useMemo(() => groupVersions(props.workspace), [props.workspace]);
  const disabled = activeAction !== null || props.source === "restoring" || props.source === "offline-cloud"
    || props.recovery !== "none";

  const run = async (name: string, action: () => Promise<boolean>) => {
    if (disabled) return false;
    setActiveAction(name);
    setNotice(null);
    try {
      const saved = await action();
      if (saved) setNotice("作品记录已更新。");
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
          <p>作品记录已在另一处发生变化，请重新加载后再修改。</p>
          <button className="text-action" onClick={() => void props.retry()} type="button">重新加载作品记录</button>
        </div>
      )}
      {props.recovery === "session-expired" && <p className="proof-recovery" role="alert">登录已过期，请重新登录后再修改云端作品。</p>}
      {(props.recovery === "unavailable" || props.source === "offline-cloud") && <p className="proof-recovery" role="alert">云端作品暂时只读，当前可见的版本未发生变化。</p>}
      {notice && <p className="proof-save-notice" role="status">{notice}</p>}


      <section className="proof-ledger" aria-labelledby="proof-ledger-title">
        <div className="proof-section-heading">
          <div>
            <p className="eyebrow">作品证据</p>
            <h2 id="proof-ledger-title">可查阅的作品</h2>
          </div>
          <span>{roots.length} 项作品</span>
        </div>
        {roots.length === 0 ? (
          <p className="empty-proof"><strong>还没有提交的作品。</strong> 先保存草稿，或提交公开链接，开始记录作品版本。</p>
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
                      <p className="eyebrow">{artifactLabel(latest.kind)} · {visibility === "public" ? "公开" : "私密"}</p>
                      <h3>{latest.title}</h3>
                    </div>
                    <strong className={`proof-state proof-state-${currentReview?.stateAfter ?? "draft"}`}>
                      {stateLabels[currentReview?.stateAfter ?? "draft"]}
                    </strong>
                  </header>
                  <p>{latest.summary}</p>
                  <p className="proof-review-explanation">{reviewExplanation(currentReview)}</p>
                  {latest.artifactUrl && <a className="proof-inspect-link" href={latest.artifactUrl} target="_blank" rel="noreferrer">查看作品 ↗</a>}
                  {latest.assetId && <p className="workspace-notice">已保存上传文件</p>}
                  <div className="proof-root-actions">
                    <button className="text-action" disabled={disabled} onClick={(event) => { revisionTrigger.current = event.currentTarget; setEditing(latest); }} type="button">添加修订</button>
                    <button className="text-action" disabled={disabled} onClick={() => void run("visibility", () => props.setVisibility(proofId, visibility === "public" ? "private" : "public"))} type="button">{visibility === "public" ? "设为私密" : "设为公开"}</button>
                    <button className="text-action" disabled={disabled} onClick={() => void run("withdraw", () => props.withdrawProof(proofId))} type="button">{activeAction === "withdraw" ? "正在撤回…" : "撤回作品"}</button>
                  </div>
                  <details className="proof-version-history"><summary>版本记录 · {versions.length}</summary><ol aria-label={`${latest.title} 版本记录`} className="proof-version-list">
                    {versions.map((item) => {
                      const review = terminalReview(props.workspace?.reviews ?? [], item.id);
                      const state = review?.stateAfter ?? "draft";
                      return (
                        <li key={item.id}>
                          <div>
                            <strong>版本 {item.versionNumber}</strong>
                            <time dateTime={item.createdAt}>{formatTimestamp(item.createdAt)}</time>
                          </div>
                          <div>
                            <b>{stateLabels[state]}</b>
                            <span>{reviewExplanation(review)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ol></details>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <ProofEditor
        canUpload={props.canUpload}
        dailyUnits={props.dailyUnits}
        disabled={disabled}
        initial={editing}
        key={editing?.id ?? "new-proof"}
        onCancel={editing ? () => { setEditing(null); revisionTrigger.current?.focus(); } : undefined}
        onSave={(input) => run(editing ? "revise" : "create", () => editing
          ? props.reviseProof(editing.proofId, input)
          : props.createProof(input))}
        onUpload={(file) => editing ? upload(editing.proofId, file) : Promise.resolve(null)}
        skills={props.skills}
      />

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
  if (!review) return "已保存为不可覆盖的草稿版本。";
  if (review.stateAfter === "verified") return "已通过确定性验证。";
  if (review.stateAfter === "demonstrated") {
    return review.outcome === "unavailable"
      ? "确定性验证器暂不可用；作品通过结构审核，已能证明这项技能。"
      : "已通过结构审核，尚未经确定性验证器确认。";
  }
  if (review.stateAfter === "superseded") return "已由后续版本替代，原记录保留。";
  if (review.stateAfter === "rejected") return rejectedExplanation(review.reasonCodes);
  if (review.stateAfter === "withdrawn") return "已从当前技能证明中撤回。";
  if (review.stateAfter === "pending_review") return "已提交，等待审核。";
  return "已保存为不可覆盖的草稿版本。";
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
