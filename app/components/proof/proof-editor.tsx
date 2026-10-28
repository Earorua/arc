"use client";

import { useEffect, useRef, useState } from "react";
import type { DailyUnit } from "../../contracts/planning";
import type {
  CreateProofRequest,
  ProofArtifactKind,
  ProofMutationIntent,
  ProofVersion,
  ProofVisibility,
} from "../../contracts/proof-ledger";
import type { SkillNode } from "../../domain/learning";
import { clearEditorDraft, readEditorDraft, saveEditorDraft } from "./editor-draft";

export type ProofEditorInput = Omit<CreateProofRequest, "mutationId" | "baseRevision">;

type Props = {
  canUpload: boolean;
  dailyUnits: readonly DailyUnit[];
  disabled: boolean;
  draftKey?: string;
  contextualUnit?: DailyUnit;
  initial?: ProofVersion | null;
  onCancel?: () => void;
  onSave: (input: ProofEditorInput) => Promise<boolean>;
  onUpload: (file: File) => Promise<string | null>;
  skills: readonly Pick<SkillNode, "id" | "name">[];
};

const artifactKinds: readonly { value: ProofArtifactKind; label: string }[] = [
  { value: "repository", label: "代码仓库" },
  { value: "commit", label: "提交记录" },
  { value: "pull_request", label: "合并请求" },
  { value: "deployment", label: "部署" },
  { value: "api", label: "API" },
  { value: "document", label: "文档" },
  { value: "screenshot", label: "截图" },
  { value: "test_report", label: "测试报告" },
  { value: "code", label: "代码" },
  { value: "upload", label: "上传文件" },
  { value: "reflection", label: "学习反思" },
];

export function ProofEditor({ canUpload, dailyUnits, disabled, draftKey, contextualUnit, initial, onCancel, onSave, onUpload, skills }: Props) {
  const [restored] = useState(() => readEditorDraft(draftKey, skills.map(({ id }) => id), dailyUnits));
  const [dirty, setDirty] = useState(false);
  const [title, setTitle] = useState(restored?.title ?? initial?.title ?? "");
  const [kind, setKind] = useState<ProofArtifactKind>(restored?.kind ?? initial?.kind ?? "repository");
  const [summary, setSummary] = useState(restored?.summary ?? initial?.summary ?? "");
  const [artifactUrl, setArtifactUrl] = useState(restored?.artifactUrl ?? initial?.artifactUrl ?? "");
  const [assetId, setAssetId] = useState<string | null>(restored ? restored.assetId : initial?.assetId ?? null);
  const [skillId, setSkillId] = useState(restored?.skillId ?? initial?.skillIds[0] ?? contextualUnit?.skillId ?? "");
  const [dailyUnitId, setDailyUnitId] = useState(restored?.dailyUnitId ?? initial?.dailyUnitId ?? contextualUnit?.id ?? "");
  const [visibility, setVisibility] = useState<ProofVisibility>(restored?.visibility ?? initial?.visibility ?? "private");
  const [validatorKey, setValidatorKey] = useState(restored?.validatorKey ?? (initial?.kind === "test_report" ? "proof.test-report.v1" : ""));
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { if (errors.length > 0) errorRef.current?.focus(); }, [errors]);
  useEffect(() => { headingRef.current?.focus(); }, []);
  useEffect(() => {
    if (!dirty || disabled) return;
    saveEditorDraft(draftKey, { title, kind, summary, artifactUrl, assetId, skillId, dailyUnitId, visibility, validatorKey: validatorKey === "proof.test-report.v1" ? validatorKey : "" });
  }, [dirty, disabled, draftKey, title, kind, summary, artifactUrl, assetId, skillId, dailyUnitId, visibility, validatorKey]);

  const submit = async (intent: ProofMutationIntent) => {
    if (disabled || uploading) return;
    const nextErrors: string[] = [];
    if (!title.trim()) nextErrors.push("请填写作品标题。");
    if (!summary.trim()) nextErrors.push("请填写作品说明。");
    if (!skillId || !skills.some(({ id }) => id === skillId)) nextErrors.push("请选择当前路线中的关联技能。");
    if (dailyUnitId && !dailyUnits.some((unit) => unit.id === dailyUnitId && unit.skillId === skillId)) nextErrors.push("请选择当前技能可关联的学习单元。");
    const url = artifactUrl.trim();
    if (url && !isPublicHttpsUrl(url)) nextErrors.push("请使用公开的 HTTPS 链接。");
    if (kind === "reflection" && (url || assetId)) nextErrors.push("学习反思不能包含作品链接或上传文件。");
    if (intent === "submit" && kind !== "reflection" && !url && !assetId) {
      nextErrors.push("提交审核前，请添加公开的 HTTPS 链接或上传文件。");
    }
    if (validatorKey && kind !== "test_report") nextErrors.push("确定性验证仅适用于 JSON 测试报告。");
    if (nextErrors.length > 0) { setErrors(nextErrors); return; }
    setErrors([]);
    const saved = await onSave({
      intent,
      validatorKey: intent === "submit" && validatorKey ? validatorKey : null,
      dailyUnitId: dailyUnitId || null,
      title: title.trim(),
      kind,
      summary: summary.trim(),
      artifactUrl: kind === "reflection" || assetId ? null : url || null,
      assetId: kind === "reflection" || url ? null : assetId,
      skillIds: [skillId],
      completionCriteria: [],
      visibility,
    });
    if (!saved) setErrors(["暂时无法保存这个版本，请查看恢复提示后重试。"]);
    else { clearEditorDraft(draftKey); setDirty(false); }
  };

  const upload = async () => {
    if (!selectedFile) { setErrors(["请选择要上传的文件。"]); return; }
    setUploading(true);
    setUploadMessage(null);
    try {
      const id = await onUpload(selectedFile);
      if (!id) { setErrors(["文件上传失败，请重试。"]); return; }
      setAssetId(id);
      setDirty(true);
      setArtifactUrl("");
      setErrors([]);
      setUploadMessage(`${selectedFile.name} 已附加到下一个作品版本。`);
    } finally { setUploading(false); }
  };

  return (
    <section className="proof-editor" aria-labelledby="proof-editor-title" onChange={() => { if (!disabled) setDirty(true); }}>
      <div className="proof-section-heading">
        <div>
          <p className="eyebrow">{initial ? `修订版本 ${initial.versionNumber + 1}` : "新增作品"}</p>
          <h2 id="proof-editor-title" ref={headingRef} tabIndex={-1}>{initial ? "添加作品修订" : "添加作品"}</h2>
        </div>
        {onCancel && <button className="text-action" disabled={disabled} onClick={onCancel} type="button">取消修订</button>}
      </div>
      <p className="proof-editor-intro">{initial ? "保存后会新增一个版本，之前的作品与审核记录会保留。" : "添加作品链接或学习反思，记录你已经能做什么。新作品默认仅自己可见。"}</p>
      {restored && <p className="proof-draft-notice">已恢复尚未提交的编辑内容。</p>}

      {errors.length > 0 && (
        <div className="proof-error-summary" ref={errorRef} role="alert" tabIndex={-1}>
          <strong>请检查作品信息</strong>
          <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
        </div>
      )}

      <div className="proof-form-grid">
        <label className="proof-field-wide">作品标题<input disabled={disabled} maxLength={180} onChange={(event) => setTitle(event.target.value)} value={title} /></label>
        <label className="proof-field-wide">作品说明<textarea disabled={disabled} maxLength={2000} onChange={(event) => setSummary(event.target.value)} rows={4} value={summary} /></label>
        <label>作品类型<select disabled={disabled} onChange={(event) => {
          const next = event.target.value as ProofArtifactKind;
          setKind(next);
          if (next !== "test_report") setValidatorKey("");
          if (next === "reflection") { setArtifactUrl(""); setAssetId(null); setSelectedFile(null); }
        }} value={kind}>{artifactKinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        {kind !== "reflection" && <label>公开 HTTPS 链接<input disabled={disabled || assetId !== null} inputMode="url" maxLength={2048} onChange={(event) => setArtifactUrl(event.target.value)} placeholder="https://" type="url" value={artifactUrl} /></label>}
        <label>关联技能<select disabled={disabled} onChange={(event) => { setSkillId(event.target.value); setDailyUnitId(""); }} value={skillId}><option value="">选择技能</option>{skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
        <label>关联学习单元<select disabled={disabled} onChange={(event) => setDailyUnitId(event.target.value)} value={dailyUnitId}><option value="">不关联学习单元</option>{dailyUnits.filter((unit) => !skillId || unit.skillId === skillId).map((unit) => <option key={unit.id} value={unit.id}>{formatDailyUnitLabel(unit)}</option>)}</select></label>
        <label>可见范围<select disabled={disabled} onChange={(event) => setVisibility(event.target.value as ProofVisibility)} value={visibility}><option value="private">私密</option><option value="public">公开</option></select></label>
        {kind === "test_report" && <label>自动检查<select disabled={disabled} onChange={(event) => setValidatorKey(event.target.value === "proof.test-report.v1" ? "proof.test-report.v1" : "")} value={validatorKey}><option value="">暂不自动检查</option><option value="proof.test-report.v1">Arc JSON 测试报告</option></select></label>}
      </div>
      <p className="proof-visibility-note">{visibility === "private" ? "私密作品仅自己可见；你可以在保存后更改。" : "这项作品将公开，可用于公开技能证明。"}</p>

      {kind !== "reflection" && <div className="proof-upload-zone">
        {canUpload && initial ? <>
          <label>上传作品文件<input aria-label="上传作品文件" disabled={disabled || uploading} onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} type="file" /></label>
          <button className="secondary-action" disabled={disabled || uploading || !selectedFile} onClick={() => void upload()} type="button">{uploading ? "正在上传…" : "上传所选文件"}</button>
          {uploadMessage && <p role="status">{uploadMessage}</p>}
        </> : <p>{canUpload ? "需要上传文件？先保存草稿，接下来即可附加文件并提交；原草稿会保留。" : "登录并保存草稿后，即可上传作品文件。"}</p>}
        {assetId && <p>已附加作品文件。<button className="text-action" disabled={disabled} onClick={() => { setAssetId(null); setDirty(true); }} type="button">移除附件</button></p>}
      </div>}

      <div className="proof-editor-actions">
        <button className="secondary-action" disabled={disabled} onClick={() => void submit("save_draft")} type="button">保存草稿</button>
        <button className="primary-action" disabled={disabled} onClick={() => void submit("submit")} type="button">提交审核</button>
      </div>
    </section>
  );
}

function formatDailyUnitLabel(unit: DailyUnit): string {
  return `${unit.scheduledDate} · ${unit.slot === "primary" ? "主要任务" : "拓展任务"} · ${unit.objective}`;
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.hostname !== "localhost";
  } catch { return false; }
}
