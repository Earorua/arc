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
  skills: readonly SkillNode[];
};

const artifactKinds: readonly { value: ProofArtifactKind; label: string }[] = [
  { value: "repository", label: "Repository" },
  { value: "commit", label: "Commit" },
  { value: "pull_request", label: "Pull request" },
  { value: "deployment", label: "Deployment" },
  { value: "api", label: "API" },
  { value: "document", label: "Document" },
  { value: "screenshot", label: "Screenshot" },
  { value: "test_report", label: "Test report" },
  { value: "code", label: "Code" },
  { value: "upload", label: "Upload" },
  { value: "reflection", label: "Reflection" },
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

  useEffect(() => { if (errors.length > 0) errorRef.current?.focus(); }, [errors]);

  const submit = async (intent: ProofMutationIntent) => {
    const nextErrors: string[] = [];
    if (!title.trim()) nextErrors.push("Enter a title.");
    if (!summary.trim()) nextErrors.push("Enter a summary.");
    if (!skillId) nextErrors.push("Choose a linked skill.");
    const url = artifactUrl.trim();
    if (url && !isPublicHttpsUrl(url)) nextErrors.push("Use a public HTTPS URL.");
    if (kind === "reflection" && (url || assetId)) nextErrors.push("A reflection cannot include an artifact URL or upload.");
    if (intent === "submit" && kind !== "reflection" && !url && !assetId) {
      nextErrors.push("Add a public HTTPS URL or upload before submitting for review.");
    }
    if (validatorKey && kind !== "test_report") nextErrors.push("Deterministic validation is available only for JSON test reports.");
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
    if (!saved) setErrors(["Arc could not save this version. Review the recovery message and try again."]);
  };

  const upload = async () => {
    if (!selectedFile) { setErrors(["Choose a file to upload."]); return; }
    setUploading(true);
    setUploadMessage(null);
    try {
      const id = await onUpload(selectedFile);
      if (!id) { setErrors(["Arc could not upload this file. Try again."]); return; }
      setAssetId(id);
      setArtifactUrl("");
      setErrors([]);
      setUploadMessage(`${selectedFile.name} is attached to the next immutable version.`);
    } finally { setUploading(false); }
  };

  return (
    <section className="proof-editor" aria-labelledby="proof-editor-title">
      <div className="proof-section-heading">
        <div>
          <p className="eyebrow">{initial ? `Revision ${initial.versionNumber + 1}` : "New evidence"}</p>
          <h2 id="proof-editor-title">{initial ? "Add an immutable revision." : "Make the work inspectable."}</h2>
        </div>
        {onCancel && <button className="text-action" disabled={disabled} onClick={onCancel} type="button">Cancel revision</button>}
      </div>

      {errors.length > 0 && (
        <div className="proof-error-summary" ref={errorRef} role="alert" tabIndex={-1}>
          <strong>Check this evidence</strong>
          <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
        </div>
      )}

      <div className="proof-form-grid">
        <label>Title<input disabled={disabled} maxLength={180} onChange={(event) => setTitle(event.target.value)} value={title} /></label>
        <label>Artifact kind<select disabled={disabled} onChange={(event) => {
          const next = event.target.value as ProofArtifactKind;
          setKind(next);
          if (next !== "test_report") setValidatorKey("");
        }} value={kind}>{artifactKinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="proof-field-wide">Summary<textarea disabled={disabled} maxLength={2000} onChange={(event) => setSummary(event.target.value)} rows={4} value={summary} /></label>
        <label className="proof-field-wide">Public HTTPS URL<input disabled={disabled || assetId !== null} inputMode="url" onChange={(event) => setArtifactUrl(event.target.value)} placeholder="https://" type="url" value={artifactUrl} /></label>
        <label>Linked skill<select disabled={disabled} onChange={(event) => { setSkillId(event.target.value); setDailyUnitId(""); }} value={skillId}><option value="">Choose a skill</option>{skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
        <label>Linked Daily Unit<select disabled={disabled} onChange={(event) => setDailyUnitId(event.target.value)} value={dailyUnitId}><option value="">No linked unit</option>{dailyUnits.filter((unit) => !skillId || unit.skillId === skillId).map((unit) => <option key={unit.id} value={unit.id}>{formatDailyUnitLabel(unit)}</option>)}</select></label>
        <label>Visibility<select disabled={disabled} onChange={(event) => setVisibility(event.target.value as ProofVisibility)} value={visibility}><option value="private">Private</option><option value="public">Public</option></select></label>
        <label>Deterministic validator<select disabled={disabled || kind !== "test_report"} onChange={(event) => setValidatorKey(event.target.value)} value={validatorKey}><option value="">No validator</option><option value="proof.test-report.v1">Arc JSON test report</option></select></label>
      </div>

      <div className="proof-upload-zone">
        {canUpload && initial ? <>
          <label>Upload proof file<input aria-label="Upload proof file" disabled={disabled || uploading} onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} type="file" /></label>
          <button className="secondary-action" disabled={disabled || uploading || !selectedFile} onClick={() => void upload()} type="button">{uploading ? "Uploading…" : "Upload selected file"}</button>
          {uploadMessage && <p role="status">{uploadMessage}</p>}
        </> : <p>{canUpload ? "Save a draft first, then add a revision to upload a file without changing that draft." : "Sign in and save a draft before uploading a proof file."}</p>}
      </div>

      <div className="proof-editor-actions">
        <button className="secondary-action" disabled={disabled} onClick={() => void submit("save_draft")} type="button">Save draft</button>
        <button className="primary-action" disabled={disabled} onClick={() => void submit("submit")} type="button">Submit for review</button>
      </div>
    </section>
  );
}

function formatDailyUnitLabel(unit: DailyUnit): string {
  return `${unit.scheduledDate} · ${unit.slot === "primary" ? "Primary" : "Stretch"} · ${unit.objective}`;
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.hostname !== "localhost";
  } catch { return false; }
}
