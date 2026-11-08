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
  { value: "repository", label: "Repository" },
  { value: "commit", label: "Commit" },
  { value: "pull_request", label: "Pull request" },
  { value: "deployment", label: "Deployment" },
  { value: "api", label: "API" },
  { value: "document", label: "Document" },
  { value: "screenshot", label: "Screenshot" },
  { value: "test_report", label: "Test report" },
  { value: "code", label: "Code" },
  { value: "upload", label: "Uploaded file" },
  { value: "reflection", label: "Learning reflection" },
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
    if (!title.trim()) nextErrors.push("Enter a title for your work.");
    if (!summary.trim()) nextErrors.push("Add a description of your work.");
    if (!skillId || !skills.some(({ id }) => id === skillId)) nextErrors.push("Choose a related skill from your current path.");
    if (dailyUnitId && !dailyUnits.some((unit) => unit.id === dailyUnitId && unit.skillId === skillId)) nextErrors.push("Choose a learning unit associated with this skill.");
    const url = artifactUrl.trim();
    if (url && !isPublicHttpsUrl(url)) nextErrors.push("Use a public HTTPS link.");
    if (kind === "reflection" && (url || assetId)) nextErrors.push("Learning reflections cannot include a work link or an uploaded file.");
    if (intent === "submit" && kind !== "reflection" && !url && !assetId) {
      nextErrors.push("Add a public HTTPS link or upload a file before submitting for review.");
    }
    if (validatorKey && kind !== "test_report") nextErrors.push("Automated verification is available only for JSON test reports.");
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
    if (!saved) setErrors(["This version could not be saved. Check the recovery message and try again."]);
    else { clearEditorDraft(draftKey); setDirty(false); }
  };

  const upload = async () => {
    if (!selectedFile) { setErrors(["Choose a file to upload."]); return; }
    setUploading(true);
    setUploadMessage(null);
    try {
      const id = await onUpload(selectedFile);
      if (!id) { setErrors(["The file could not be uploaded. Please try again."]); return; }
      setAssetId(id);
      setDirty(true);
      setArtifactUrl("");
      setErrors([]);
      setUploadMessage(`${selectedFile.name} is attached to the next version of your work.`);
    } finally { setUploading(false); }
  };

  return (
    <section className="proof-editor" aria-labelledby="proof-editor-title" onChange={() => { if (!disabled) setDirty(true); }}>
      <div className="proof-section-heading">
        <div>
          <p className="eyebrow">{initial ? `Revision ${initial.versionNumber + 1}` : "New proof"}</p>
          <h2 id="proof-editor-title" ref={headingRef} tabIndex={-1}>{initial ? "Add a proof revision" : "Add proof"}</h2>
        </div>
        {onCancel && <button className="text-action" disabled={disabled} onClick={onCancel} type="button">Cancel revision</button>}
      </div>
      <p className="proof-editor-intro">{initial ? "Saving creates a new version. Previous work and review history are preserved." : "Add a link to your work or a learning reflection to record what you can do. New proof is private by default."}</p>
      {restored && <p className="proof-draft-notice">Your unsaved edits have been restored.</p>}

      {errors.length > 0 && (
        <div className="proof-error-summary" ref={errorRef} role="alert" tabIndex={-1}>
          <strong>Check your proof details</strong>
          <ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul>
        </div>
      )}

      <div className="proof-form-grid">
        <label className="proof-field-wide">Proof title<input disabled={disabled} maxLength={180} onChange={(event) => setTitle(event.target.value)} value={title} /></label>
        <label className="proof-field-wide">Description<textarea disabled={disabled} maxLength={2000} onChange={(event) => setSummary(event.target.value)} rows={4} value={summary} /></label>
        <label>Proof type<select disabled={disabled} onChange={(event) => {
          const next = event.target.value as ProofArtifactKind;
          setKind(next);
          if (next !== "test_report") setValidatorKey("");
          if (next === "reflection") { setArtifactUrl(""); setAssetId(null); setSelectedFile(null); }
        }} value={kind}>{artifactKinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        {kind !== "reflection" && <label>Public HTTPS link<input disabled={disabled || assetId !== null} inputMode="url" maxLength={2048} onChange={(event) => setArtifactUrl(event.target.value)} placeholder="https://" type="url" value={artifactUrl} /></label>}
        <label>Related skill<select disabled={disabled} onChange={(event) => { setSkillId(event.target.value); setDailyUnitId(""); }} value={skillId}><option value="">Choose a skill</option>{skills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
        <label>Related learning unit<select disabled={disabled} onChange={(event) => setDailyUnitId(event.target.value)} value={dailyUnitId}><option value="">No linked learning unit</option>{dailyUnits.filter((unit) => !skillId || unit.skillId === skillId).map((unit) => <option key={unit.id} value={unit.id}>{formatDailyUnitLabel(unit)}</option>)}</select></label>
        <label>Visibility<select disabled={disabled} onChange={(event) => setVisibility(event.target.value as ProofVisibility)} value={visibility}><option value="private">Private</option><option value="public">Public</option></select></label>
        {kind === "test_report" && <label>Automatic check<select disabled={disabled} onChange={(event) => setValidatorKey(event.target.value === "proof.test-report.v1" ? "proof.test-report.v1" : "")} value={validatorKey}><option value="">Skip automatic checks for now</option><option value="proof.test-report.v1">Arc JSON test report</option></select></label>}
      </div>
      <p className="proof-visibility-note">{visibility === "private" ? "Private proof is visible only to you. You can change this after saving." : "This work will be public and can support your public skill evidence."}</p>

      {kind !== "reflection" && <div className="proof-upload-zone">
        {canUpload && initial ? <>
          <label>Upload a proof file<input aria-label="Upload a proof file" disabled={disabled || uploading} onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} type="file" /></label>
          <button className="secondary-action" disabled={disabled || uploading || !selectedFile} onClick={() => void upload()} type="button">{uploading ? "Uploading…" : "Upload selected file"}</button>
          {uploadMessage && <p role="status">{uploadMessage}</p>}
        </> : <p>{canUpload ? "To upload a file, save a draft first. You can then attach a file and submit it; the original draft is preserved." : "Sign in and save a draft to upload a proof file."}</p>}
        {assetId && <p>Proof file attached. <button className="text-action" disabled={disabled} onClick={() => { setAssetId(null); setDirty(true); }} type="button">Remove attachment</button></p>}
      </div>}

      <div className="proof-editor-actions">
        <button className="secondary-action" disabled={disabled} onClick={() => void submit("save_draft")} type="button">Save draft</button>
        <button className="primary-action" disabled={disabled} onClick={() => void submit("submit")} type="button">Submit for review</button>
      </div>
    </section>
  );
}

function formatDailyUnitLabel(unit: DailyUnit): string {
  return `${unit.scheduledDate} · ${unit.slot === "primary" ? "Main task" : "Stretch task"} · ${unit.objective}`;
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.hostname !== "localhost";
  } catch { return false; }
}
