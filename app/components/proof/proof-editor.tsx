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

export type ProofEditorInput = Omit<CreateProofRequest, "mutationId" | "baseRevision">;

type Props = {
  canUpload: boolean;
  dailyUnits: readonly DailyUnit[];
  disabled: boolean;
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

export function ProofEditor({ canUpload, dailyUnits, disabled, initial, onCancel, onSave, onUpload, skills }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<ProofArtifactKind>(initial?.kind ?? "repository");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [artifactUrl, setArtifactUrl] = useState(initial?.artifactUrl ?? "");
  const [assetId, setAssetId] = useState<string | null>(initial?.assetId ?? null);
  const [skillId, setSkillId] = useState(initial?.skillIds[0] ?? "");
  const [dailyUnitId, setDailyUnitId] = useState(initial?.dailyUnitId ?? "");
  const [visibility, setVisibility] = useState<ProofVisibility>(initial?.visibility ?? "private");
  const [validatorKey, setValidatorKey] = useState(initial?.kind === "test_report" ? "proof.test-report.v1" : "");
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { if (errors.length > 0) errorRef.current?.focus(); }, [errors]);
  useEffect(() => { if (initial) headingRef.current?.focus(); }, [initial]);

  const submit = async (intent: ProofMutationIntent) => {
    const nextErrors: string[] = [];
    if (!title.trim()) nextErrors.push("请填写作品标题。");
    if (!summary.trim()) nextErrors.push("请填写作品说明。");
    if (!skillId) nextErrors.push("请选择关联技能。");
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
  };

  const upload = async () => {
    if (!selectedFile) { setErrors(["请选择要上传的文件。"]); return; }
    setUploading(true);
    setUploadMessage(null);
    try {
      const id = await onUpload(selectedFile);
      if (!id) { setErrors(["文件上传失败，请重试。"]); return; }
      setAssetId(id);
      setArtifactUrl("");
      setErrors([]);
      setUploadMessage(`${selectedFile.name} 已附加到下一个作品版本。`);
    } finally { setUploading(false); }
  };

  return (
    <section className="proof-editor" aria-labelledby="proof-editor-title">
      <div className="proof-section-heading">
        <div>
          <p className="eyebrow">{initial ? `修订版本 ${initial.versionNumber + 1}` : "新增作品"}</p>
          <h2 id="proof-editor-title" ref={headingRef} tabIndex={-1}>{initial ? "添加作品修订" : "提交可查阅的作品"}</h2>
        </div>
        {onCancel && <button className="text-action" disabled={disabled} onClick={onCancel} type="button">取消修订</button>}
      </div>

      {errors.length > 0 && (
        <div className="proof-error-summary" ref={errorRef} role="alert" tabIndex={-1}>
          <strong>请检查作品信息</strong>
          <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
        </div>
      )}

      <div className="proof-form-grid">
        <label>作品标题<input disabled={disabled} maxLength={180} onChange={(event) => setTitle(event.target.value)} value={title} /></label>
        <label>作品类型<select disabled={disabled} onChange={(event) => {
          const next = event.target.value as ProofArtifactKind;
          setKind(next);
          if (next !== "test_report") setValidatorKey("");
        }} value={kind}>{artifactKinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="proof-field-wide">作品说明<textarea disabled={disabled} maxLength={2000} onChange={(event) => setSummary(event.target.value)} rows={4} value={summary} /></label>
        <label className="proof-field-wide">公开 HTTPS 链接<input disabled={disabled || assetId !== null} inputMode="url" onChange={(event) => setArtifactUrl(event.target.value)} placeholder="https://" type="url" value={artifactUrl} /></label>
        <label>关联技能<select disabled={disabled} onChange={(event) => { setSkillId(event.target.value); setDailyUnitId(""); }} value={skillId}><option value="">选择技能</option>{skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
        <label>关联学习单元<select disabled={disabled} onChange={(event) => setDailyUnitId(event.target.value)} value={dailyUnitId}><option value="">不关联学习单元</option>{dailyUnits.filter((unit) => !skillId || unit.skillId === skillId).map((unit) => <option key={unit.id} value={unit.id}>{formatDailyUnitLabel(unit)}</option>)}</select></label>
        <label>可见范围<select disabled={disabled} onChange={(event) => setVisibility(event.target.value as ProofVisibility)} value={visibility}><option value="private">私密</option><option value="public">公开</option></select></label>
        <label>确定性验证器<select disabled={disabled || kind !== "test_report"} onChange={(event) => setValidatorKey(event.target.value)} value={validatorKey}><option value="">不使用验证器</option><option value="proof.test-report.v1">Arc JSON 测试报告</option></select></label>
      </div>

      <div className="proof-upload-zone">
        {canUpload && initial ? <>
          <label>上传作品文件<input aria-label="上传作品文件" disabled={disabled || uploading} onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} type="file" /></label>
          <button className="secondary-action" disabled={disabled || uploading || !selectedFile} onClick={() => void upload()} type="button">{uploading ? "正在上传…" : "上传所选文件"}</button>
          {uploadMessage && <p role="status">{uploadMessage}</p>}
        </> : <p>{canUpload ? "先保存草稿，再添加修订以便上传文件；原草稿会保留。" : "登录并保存草稿后，即可上传作品文件。"}</p>}
      </div>

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
