"use client";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { materialIdSchema } from "../../contracts/documents";
import { readSetupDraft, writeSetupDraft, removeSetupDraft } from "../setup/setup-draft";
import type { ConfirmedMaterialItem, DocumentReviewDraft } from "../../contracts/documents";
import { documentVersionReceiptSchema, type DocumentEndpointResponse } from "../../contracts/documents-api";
import type { DocumentCapabilities } from "../../contracts/document-capabilities";
import type { SkillSelfLevel } from "../../contracts/planning";
import { DocumentClientError, documentsClient, type DocumentsClient } from "../../lib/documents-client";
import type { MaterialDocumentDraftRef } from "../../lib/use-material-selection";
import { MaterialConfirmation } from "./material-confirmation";
import { retainedMaterialSelfAssessmentHints } from "../../lib/materials/skill-labels";
import { MaterialJobStatus } from "./material-job-status";
type Props = {
    kind: "resume" | "jd" | "supplement";
    capabilities: DocumentCapabilities;
    client?: DocumentsClient;
    value: MaterialDocumentDraftRef | null;
    onChange(value: MaterialDocumentDraftRef): void;
    onUseConfirmedVersion?: (ref: MaterialDocumentDraftRef) => void;
    reuseScopeKey?: string;
    skills?: readonly {
        id: string;
        name: string;
    }[];
    onAdoptLevels?: (levels: Record<string, SkillSelfLevel>) => void;
    pollIntervalMs?: number;
    disabled?: boolean;
    recoveryScope?: {
        ownerId: string;
        scopeKey: string;
    };
};
const saveRecoverySchema = z.object({
    endpoint: z.enum(["createDocument", "createDocumentVersion"]),
    save: materialIdSchema,
    consent: materialIdSchema,
    job: materialIdSchema,
    phase: z.enum(["save", "analysis"]).optional(),
    receipt: documentVersionReceiptSchema.optional()
}).strict();
type SaveRecovery = z.infer<typeof saveRecoverySchema>;
async function readEditorReview(client: DocumentsClient, ref: MaterialDocumentDraftRef, checkConfirmation: boolean, signal: AbortSignal) {
    const query = { documentId: ref.documentId, textVersionId: ref.textVersionId };
    if (checkConfirmation) {
        try {
            return await client.request("readDocumentReviewDraft", { ...query, includeConfirmation: "current" }, signal);
        } catch (error) {
            if (signal.aborted || !(error instanceof DocumentClientError) || error.code !== "invalid-request" || error.status !== 400) throw error;
        }
    }
    const { draft } = await client.request("readDocumentReviewDraft", query, signal);
    return { draft, confirmation: undefined };
}
export function MaterialTextPanel({ kind, capabilities, client = documentsClient, value, onChange, onUseConfirmedVersion, reuseScopeKey, skills, onAdoptLevels, pollIntervalMs = 1500, disabled = false, recoveryScope }: Props) {
    const label = kind === "resume" ? "简历" : kind === "jd" ? "岗位 JD" : "补充资料";
    const [text, setText] = useState("");
    const [name, setName] = useState(label);
    const [savedBody, setSavedBody] = useState("");
    const consentDescriptionId = useId();
    const consentScope = JSON.stringify([capabilities.analysisEnabled, capabilities.providerPolicyId, capabilities.policyVersion, capabilities.providerLabel, capabilities.privacyNotice]);
    const [consentedScope, setConsentedScope] = useState<string | null>(null);
    const allowed = consentedScope === consentScope;
    if (consentedScope !== null && !allowed) setConsentedScope(null);
    const [busy, setBusy] = useState(false);
    const [draft, setDraft] = useState<DocumentReviewDraft | null>(null);
    const [job, setJob] = useState<DocumentEndpointResponse<"readDocumentJob"> | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [lateExtractionId, setLateExtractionId] = useState<string | null>(null);
    const [comparison, setComparison] = useState<DocumentEndpointResponse<"readDocumentExtraction"> | null>(null);
    const [pendingAnalysis, setPendingAnalysis] = useState(false);
    const version = useRef<string | null>(null);
    const savedText = useRef("");
    const serverDraft = useRef<DocumentReviewDraft | null>(null);
    const valueRef = useRef(value);
    const changeRef = useRef(onChange);
    const adoptionCallback = useRef(onUseConfirmedVersion);
    useLayoutEffect(() => { valueRef.current = value; }, [value]);
    useLayoutEffect(() => { changeRef.current = onChange; adoptionCallback.current = onUseConfirmedVersion; }, [onChange, onUseConfirmedVersion]);
    const lifecycle = useRef(0);
    const edits = useRef(0);
    const inLibrary = reuseScopeKey !== undefined || Boolean(onUseConfirmedVersion);
    const canAdopt = Boolean(onUseConfirmedVersion) && !disabled;
    const confirming = useRef(false);
    const adoptionRequest = useRef<AbortController | null>(null);
    const cancellation = useRef(new AbortController());
    const saveQueue = useRef<Promise<void>>(Promise.resolve());
    const attempt = useRef<(SaveRecovery & {
        text: string;
    }) | null>(null);
    const recovery = useRef<SaveRecovery | null>(null);
    const recoveryOwner = recoveryScope?.ownerId;
    const recoveryKey = `material-save:${recoveryScope?.scopeKey ?? "ephemeral"}:${kind}`;
    const scope = JSON.stringify([recoveryOwner, recoveryKey, reuseScopeKey, value?.documentId, value?.documentVersionId, value?.textVersionId]);
    // A lock followed by an unlock is a new authorization, even for the same document.
    const access = useMemo(() => ({ scope, canAdopt, disabled }), [scope, canAdopt, disabled]);
    const activeAccess = useRef<typeof access | null>(access);
    const checkedAccess = useRef<typeof access | null>(null);
    const [verifiedAccess, setVerifiedAccess] = useState<typeof access | null>(null);
    useLayoutEffect(() => {
        activeAccess.current = access;
        const requests = adoptionRequest;
        return () => { activeAccess.current = null; requests.current?.abort(); };
    }, [access]);
    const textChanged = text !== savedBody;
    const analysisBlocked = Boolean(value?.jobId && (!job || ["queued", "running", "cancel-requested", "cost-unknown"].includes(job.state) || job.costState === "held-unknown"));
    const canReanalyze = Boolean(value?.jobId && job && !analysisBlocked && !textChanged);
    useEffect(() => {
        const fence = lifecycle;
        fence.current++;
        cancellation.current = new AbortController();
        const current = cancellation.current;
        return () => { fence.current++; current.abort(); };
    }, [recoveryOwner, recoveryKey]);
    const publish = (ref: MaterialDocumentDraftRef) => { valueRef.current = ref; changeRef.current(ref); };
    const clearConfirmation = () => { edits.current++; const ref = valueRef.current; if (ref?.confirmationId)
        publish({ ...ref, confirmationId: undefined }); };
    const keepDraft = (next: DocumentReviewDraft) => { serverDraft.current = next; setDraft(next); };
    const blankDraft = (ref: MaterialDocumentDraftRef): DocumentReviewDraft => ({
        id: "review-pending",
        schemaVersion: "2026.11.1",
        documentId: ref.documentId,
        documentVersionId: ref.documentVersionId,
        textVersionId: ref.textVersionId,
        extractionId: null,
        origin: "manual",
        items: [],
        selfAssessmentHints: [],
        revision: 0,
        updatedAt: new Date().toISOString()
    });
    useEffect(() => {
        const pending = readSetupDraft(recoveryOwner, recoveryKey, saveRecoverySchema);
        recovery.current = pending;
        if (!pending)
            return;
        const controller = new AbortController();
        const epoch = lifecycle.current;
        void (async () => {
            try {
                const result = pending.receipt ? { receipt: pending.receipt } : await client.request("readDocumentMutation", { endpoint: pending.endpoint, mutationId: pending.save }, controller.signal);
                if (controller.signal.aborted || epoch !== lifecycle.current)
                    return;
                if (!result.receipt) {
                    setMessage("上次保存尚未确认。请重新粘贴文本后明确保存，或从私人资料库恢复。");
                    return;
                }
                const current = valueRef.current;
                if (current && current.documentId !== result.receipt.documentId)
                    return;
                const next = current?.textVersionId === result.receipt.textVersionId ? { ...current, ...result.receipt } : result.receipt;
                valueRef.current = next;
                changeRef.current(next);
                setPendingAnalysis(pending.phase === "analysis");
                setMessage("已恢复上次保存的资料；如需分析，请再次确认允许范围。");
            }
            catch (error) {
                if (!controller.signal.aborted && epoch === lifecycle.current)
                    setMessage(error instanceof Error ? error.message : "暂时无法恢复保存回执。");
            }
        })();
        return () => controller.abort();
    }, [client, recoveryOwner, recoveryKey]);
    useEffect(() => {
        if (!value || saving || textChanged) return;
        const restored = version.current === value.textVersionId;
        if (restored && (!access.canAdopt || checkedAccess.current === access)) return;
        const controller = new AbortController();
        const epoch = lifecycle.current;
        const beforeRead = edits.current;
        void (async () => {
            try {
                const record = restored ? null : await client.request("readDocument", { documentId: value.documentId, versionId: value.documentVersionId }, controller.signal);
                const review = await readEditorReview(client, value, access.canAdopt, controller.signal);
                if (controller.signal.aborted || epoch !== lifecycle.current || beforeRead !== edits.current || activeAccess.current !== access)
                    return;
                if (record) {
                    version.current = value.textVersionId;
                    savedText.current = record.text;
                    setSavedBody(record.text);
                    setText(record.text);
                    if (recovery.current) attempt.current = { ...recovery.current, text: record.text };
                    setName(record.document.displayName ?? label);
                    keepDraft(review.draft ?? blankDraft(value));
                }
                if (inLibrary) {
                    checkedAccess.current = access;
                    const displayed = serverDraft.current;
                    const sameDraft = displayed && review.draft?.revision === displayed.revision && review.draft.textVersionId === displayed.textVersionId;
                    const confirmation = sameDraft && (!record || record.document.currentDocumentVersionId === value.documentVersionId) ? review.confirmation : undefined;
                    setVerifiedAccess(confirmation ? access : null);
                    const revision = confirmation?.revision ?? record?.document.revision ?? value.revision;
                    if (value.confirmationId !== confirmation?.confirmationId || value.revision !== revision) {
                        const restored = { ...value, confirmationId: confirmation?.confirmationId, revision };
                        valueRef.current = restored;
                        changeRef.current(restored);
                    }
                }
            }
            catch (error) {
                if (!controller.signal.aborted && epoch === lifecycle.current)
                    setMessage(error instanceof Error ? error.message : "暂时无法读取已保存资料。");
            }
        })();
        return () => controller.abort();
    }, [access, client, label, inLibrary, saving, textChanged, value]);
    useEffect(() => {
        if (!value?.jobId)
            return;
        const controller = new AbortController();
        const epoch = lifecycle.current;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const refresh = async () => {
            try {
                const next = await client.request("readDocumentJob", { jobId: value.jobId! }, controller.signal);
                if (controller.signal.aborted || epoch !== lifecycle.current)
                    return;
                setJob(next);
                if (["queued", "running", "cancel-requested"].includes(next.state))
                    timer = setTimeout(() => void refresh(), pollIntervalMs);
                else if (next.state === "succeeded") {
                    await saveQueue.current;
                    const review = await client.request("readDocumentReviewDraft", { documentId: value.documentId, textVersionId: value.textVersionId }, controller.signal);
                    if (controller.signal.aborted || epoch !== lifecycle.current)
                        return;
                    if (review.draft)
                        keepDraft(review.draft);
                    if (review.draft && review.draft.extractionId !== next.extractionId) {
                        setLateExtractionId(next.extractionId);
                        setMessage("新 AI 候选已到达，你的核对修改保持不变。请比较后明确采用。");
                    }
                }
            }
            catch (error) {
                if (!controller.signal.aborted && epoch === lifecycle.current)
                    setMessage(error instanceof Error ? error.message : "暂时无法读取分析状态。");
            }
        };
        void refresh();
        return () => { controller.abort(); if (timer)
            clearTimeout(timer); };
    }, [client, value?.jobId, value?.documentId, value?.textVersionId, pollIntervalMs]);
    useEffect(() => {
        if (text === savedText.current)
            return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [text]);
    async function save(analyze: boolean, reanalyze = false) {
        if (busy || disabled || !text.trim() || (analyze && (!allowed || !capabilities.analysisEnabled || analysisBlocked)))
            return;
        const epoch = lifecycle.current;
        const signal = cancellation.current.signal;
        setBusy(true);
        setMessage(null);
        if ((reanalyze && !pendingAnalysis) || !attempt.current || attempt.current.text !== text)
            attempt.current = {
                endpoint: valueRef.current ? "createDocumentVersion" : "createDocument",
                text,
                save: `save-${crypto.randomUUID()}`,
                consent: `consent-${crypto.randomUUID()}`,
                job: `job-${crypto.randomUUID()}`
            };
        const pending: SaveRecovery = {
            endpoint: attempt.current.endpoint,
            save: attempt.current.save,
            consent: attempt.current.consent,
            job: attempt.current.job,
            phase: "save"
        };
        recovery.current = pending;
        writeSetupDraft(recoveryOwner, recoveryKey, saveRecoverySchema, pending);
        try {
            await saveQueue.current.catch(() => undefined);
            let ref = valueRef.current;
            if (!ref || savedText.current !== text) {
                const receipt = ref
                    ? await client.request("createDocumentVersion", {
                        documentId: ref.documentId,
                        text,
                        expectedRevision: ref.revision,
                        mutationId: attempt.current.save
                    }, signal)
                    : await client.request("createDocument", { kind, displayName: name || label, text, mutationId: attempt.current.save }, signal);
                if (epoch !== lifecycle.current)
                    return;
                ref = receipt;
                valueRef.current = ref;
                version.current = ref.textVersionId;
                savedText.current = text;
                setSavedBody(text);
                changeRef.current(ref);
                setConsentedScope(null);
                setJob(null);
                setDraft(null);
                serverDraft.current = null;
                setComparison(null);
                setLateExtractionId(null);
            }
            if (!analyze) {
                const review = await client.request("readDocumentReviewDraft", { documentId: ref.documentId, textVersionId: ref.textVersionId }, signal);
                if (epoch === lifecycle.current) {
                    keepDraft(review.draft ?? blankDraft(ref));
                    removeSetupDraft(recoveryOwner, recoveryKey);
                    recovery.current = null;
                    setPendingAnalysis(false);
                }
                return;
            }
            if (!capabilities.providerPolicyId || !capabilities.policyVersion)
                throw new Error("AI 分析暂不可用，请手动整理。");
            const analysisRecovery: SaveRecovery = {
                ...pending,
                phase: "analysis",
                receipt: {
                    documentId: ref.documentId,
                    documentVersionId: ref.documentVersionId,
                    textVersionId: ref.textVersionId,
                    revision: ref.revision
                }
            };
            recovery.current = analysisRecovery;
            writeSetupDraft(recoveryOwner, recoveryKey, saveRecoverySchema, analysisRecovery);
            setPendingAnalysis(true);
            const consent = ref.consentId && !reanalyze ? { consentId: ref.consentId } : await client.request("createDocumentConsent", {
                textVersionId: ref.textVersionId,
                purpose: "analysis",
                policyVersion: capabilities.policyVersion,
                providerPolicyId: capabilities.providerPolicyId,
                mutationId: attempt.current.consent
            }, signal);
            if (epoch !== lifecycle.current)
                return;
            ref = { ...ref, consentId: consent.consentId };
            valueRef.current = ref;
            changeRef.current(ref);
            const result = await client.request("createDocumentJob", {
                textVersionId: ref.textVersionId,
                consentId: consent.consentId,
                mutationId: attempt.current.job,
                ...(ref.jobId ? { previousJobId: ref.jobId } : {})
            }, signal);
            if (epoch !== lifecycle.current)
                return;
            ref = { ...ref, jobId: result.jobId };
            valueRef.current = ref;
            changeRef.current(ref);
            setConsentedScope(null);
            setJob(null);
            removeSetupDraft(recoveryOwner, recoveryKey);
            recovery.current = null;
            setPendingAnalysis(false);
        }
        catch (error) {
            if (epoch === lifecycle.current)
                setMessage(error instanceof Error ? error.message : "未能完成操作，可保留资料并手动整理。");
        }
        finally {
            if (epoch === lifecycle.current)
                setBusy(false);
        }
    }
    function saveItems(items: ConfirmedMaterialItem[]) {
        saveReview(items, draft?.reviewPoints);
    }
    function saveReview(items: ConfirmedMaterialItem[], reviewPoints: DocumentReviewDraft["reviewPoints"]) {
        if (!draft || !valueRef.current)
            return;
        edits.current++;
        const selfAssessmentHints = retainedMaterialSelfAssessmentHints(items, draft.selfAssessmentHints);
        const edited = { ...draft, items, selfAssessmentHints, ...(reviewPoints ? { reviewPoints } : {}) };
        setDraft(edited);
        setSaving(true);
        setMessage(null);
        const epoch = lifecycle.current;
        const ref = valueRef.current;
        publish({ ...ref, confirmationId: undefined });
        saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
            if (epoch !== lifecycle.current)
                return;
            const base = serverDraft.current ?? edited;
            const result = await client.request("saveDocumentReviewDraft", {
                documentId: ref.documentId,
                textVersionId: ref.textVersionId,
                extractionId: base.extractionId,
                items,
                selfAssessmentHints,
                ...(reviewPoints ? { reviewPoints } : {}),
                expectedRevision: base.revision,
                mutationId: `review-${crypto.randomUUID()}`
            }, cancellation.current.signal);
            if (epoch === lifecycle.current) {
                serverDraft.current = result.draft;
                setDraft(current => current ? { ...current, revision: result.draft.revision, origin: result.draft.origin } : result.draft);
            }
        });
        const queued = saveQueue.current;
        void queued.catch(error => { if (epoch === lifecycle.current)
            setMessage(error instanceof Error ? error.message : "修改尚未保存，请重试。"); }).finally(() => { if (epoch === lifecycle.current && saveQueue.current === queued)
            setSaving(false); });
    }
    async function confirm() {
        if (textChanged || busy || saving || disabled || confirming.current || adoptionRequest.current)
            return;
        const epoch = lifecycle.current, beforePost = edits.current;
        confirming.current = true;
        setBusy(true);
        setMessage(null);
        try {
            await saveQueue.current;
            const current = serverDraft.current;
            const ref = valueRef.current;
            if (!current || !ref || epoch !== lifecycle.current || beforePost !== edits.current || activeAccess.current !== access)
                return;
            const response = await client.request("createDocumentConfirmation", {
                documentId: ref.documentId,
                documentVersionId: ref.documentVersionId,
                textVersionId: ref.textVersionId,
                reviewRevision: current.revision,
                items: current.items,
                expectedRevision: ref.revision,
                mutationId: `confirmation-${crypto.randomUUID()}`
            }, cancellation.current.signal);
            const latest = valueRef.current;
            if (epoch !== lifecycle.current || activeAccess.current?.scope !== access.scope || !latest || latest.documentId !== ref.documentId ||
                latest.documentVersionId !== ref.documentVersionId || latest.textVersionId !== ref.textVersionId || latest.revision > response.revision) return;
            const unchanged = edits.current === beforePost && serverDraft.current?.revision === current.revision && activeAccess.current === access;
            // The server may have committed the old facts while the reader was editing.
            // Its revision is needed for the next confirmation, but only the untouched draft gets its ID.
            if (inLibrary) setVerifiedAccess(unchanged ? access : null);
            publish({ ...latest, confirmationId: unchanged ? response.confirmationId : undefined, revision: response.revision });
        }
        catch (error) {
            if (epoch === lifecycle.current)
                setMessage(error instanceof Error ? error.message : "确认失败，请重新核对。");
        }
        finally {
            confirming.current = false;
            if (epoch === lifecycle.current)
                setBusy(false);
        }
    }
    async function adoptConfirmedVersion() {
        const ref = valueRef.current, displayed = serverDraft.current;
        if (!access.canAdopt || verifiedAccess !== access || !ref?.confirmationId || !displayed || busy || saving || textChanged || confirming.current || adoptionRequest.current) return;
        const epoch = lifecycle.current, beforeRead = edits.current;
        const controller = new AbortController();
        adoptionRequest.current = controller;
        setBusy(true);
        setMessage(null);
        try {
            const latest = await readEditorReview(client, ref, true, controller.signal);
            if (controller.signal.aborted || activeAccess.current !== access || epoch !== lifecycle.current || beforeRead !== edits.current || valueRef.current !== ref) return;
            if (latest.confirmation?.confirmationId !== ref.confirmationId || latest.draft?.revision !== displayed.revision) {
                clearConfirmation();
                setMessage("已保存的资料或核对内容已变化，请重新打开当前版本。");
                return;
            }
            adoptionCallback.current?.({ ...ref, revision: latest.confirmation.revision });
        } catch {
            if (!controller.signal.aborted && activeAccess.current === access && epoch === lifecycle.current && beforeRead === edits.current) {
                clearConfirmation();
                setMessage("未能核实当前确认版本，请重新打开资料后再采用。");
            }
        } finally {
            adoptionRequest.current = null;
            if (epoch === lifecycle.current) setBusy(false);
        }
    }
    async function cancel() {
        if (!job)
            return;
        const epoch = lifecycle.current;
        try {
            const result = await client.request("cancelDocumentJob", { jobId: job.jobId, expectedRevision: job.revision, mutationId: `cancel-${crypto.randomUUID()}` }, cancellation.current.signal);
            if (epoch === lifecycle.current) {
                setJob({ ...job, revision: result.revision, state: result.state });
                setConsentedScope(null);
            }
        }
        catch (error) {
            if (epoch === lifecycle.current)
                setMessage(error instanceof Error ? error.message : "取消状态尚未确认。");
        }
    }
    async function compareCandidates() {
        const ref = valueRef.current;
        if (!ref || !lateExtractionId || busy)
            return;
        const epoch = lifecycle.current;
        setBusy(true);
        setMessage(null);
        try {
            await saveQueue.current;
            const result = await client.request("readDocumentExtraction", { documentId: ref.documentId, extractionId: lateExtractionId }, cancellation.current.signal);
            if (epoch === lifecycle.current)
                setComparison(result);
        }
        catch (error) {
            if (epoch === lifecycle.current)
                setMessage(error instanceof Error ? error.message : "暂时无法读取新候选。");
        }
        finally {
            if (epoch === lifecycle.current)
                setBusy(false);
        }
    }
    async function adoptCandidates() {
        const ref = valueRef.current;
        if (!ref || !comparison?.draft.extractionId || busy || textChanged)
            return;
        const epoch = lifecycle.current;
        setBusy(true);
        setMessage(null);
        try {
            await saveQueue.current;
            const result = await client.request("adoptDocumentExtraction", {
                documentId: ref.documentId,
                textVersionId: ref.textVersionId,
                extractionId: comparison.draft.extractionId,
                expectedRevision: comparison.expectedRevision,
                mutationId: `adopt-${crypto.randomUUID()}`
            }, cancellation.current.signal);
            if (epoch === lifecycle.current) {
                keepDraft(result.draft);
                clearConfirmation();
                setComparison(null);
                setLateExtractionId(null);
            }
        }
        catch (error) {
            if (epoch === lifecycle.current)
                setMessage(error instanceof Error ? error.message : "草稿已变化，请重新比较后采用。");
        }
        finally {
            if (epoch === lifecycle.current)
                setBusy(false);
        }
    }
    return <section className="material-text-panel" aria-label={`${label}资料`}>
    <h2>{label}辅助规划</h2><p>粘贴资料后由 AI 整理，你核对事实与能力建议；也可以跳过。</p>
    <fieldset disabled={disabled || busy}><legend className="sr-only">{label}文本导入</legend>
      <label>资料名称<input value={name} onChange={event => setName(event.target.value)} maxLength={200}/></label>
      <label>{label}正文<textarea aria-label={`${label}正文`} value={text} maxLength={100000} onChange={event => { setText(event.target.value); setConsentedScope(null); clearConfirmation(); }} placeholder="粘贴文本。文件和链接导入将在后续提供。"/></label>
      {capabilities.analysisEnabled ? <>
        <div id={consentDescriptionId}>
          <p>处理方：{capabilities.providerLabel}。用途：提取本份资料供你核对。实际发送内容就是上方当前文本；不会自动打开其中的链接。</p>
          {capabilities.privacyNotice === "kimi-k31-pro-zdr" && <>
            <p>本次通过 OpenRouter 全球入口向 Moonshot AI 的 Kimi K3.1 Pro 发送文本，请求使用零数据保留（ZDR）路由。上游可能临时缓存输入。OpenRouter 可能抽取少量输入，交给采用 ZDR 的模型分类。按其公布的安全筛查计划，疑似儿童性虐待材料可能被保留以供复核，并依法报告或保存。</p>
            <p><a href="https://openrouter.ai/docs/guides/features/zdr" target="_blank" rel="noreferrer">OpenRouter 零数据保留说明</a>{" · "}
              <a href="https://openrouter.ai/docs/guides/privacy/data-collection" target="_blank" rel="noreferrer">OpenRouter 数据收集说明</a>{" · "}
              <a href="https://platform.kimi.ai/docs/agreement/userprivacy" target="_blank" rel="noreferrer">Kimi 开放平台隐私政策</a></p>
          </>}
        </div>
        <label className="material-consent"><input type="checkbox" aria-describedby={consentDescriptionId} checked={allowed} onChange={event => setConsentedScope(event.target.checked ? consentScope : null)}/>允许将当前文本交给上述处理方进行本次分析</label>
      </> : <p role="status">AI 分析暂不可用。你可以保存资料并手动整理，已保存内容不会丢失。</p>}
      <div className="material-actions">{capabilities.analysisEnabled && <button type="button" disabled={!allowed || !text.trim() || analysisBlocked} onClick={() => void save(true, canReanalyze)}>{pendingAnalysis && !textChanged ? "继续上次分析请求" : canReanalyze ? "重新 AI 分析" : "保存并 AI 分析"}</button>}<button type="button" className="text-action" disabled={!text.trim()} onClick={() => void save(false)}>保存并手动整理</button></div>
    </fieldset>
    {job && <MaterialJobStatus job={job} onCancel={() => void cancel()}/>}
    {message && <p role="alert">{message}</p>}
    {lateExtractionId && !textChanged && <button type="button" className="text-action" disabled={busy || saving} onClick={() => void compareCandidates()}>比较新 AI 候选</button>}
    {comparison && !textChanged && <section aria-label="新 AI 候选比较"><h3>新 AI 候选</h3><p>下方候选尚未采用。替换后仍需核对并确认事实，能力建议仍需单独采用。</p><ul>{comparison.draft.items.map(item => <li key={item.id}>{item.text}</li>)}</ul><button type="button" disabled={busy || saving} onClick={() => void adoptCandidates()}>采用这些新候选替换核对草稿</button><button type="button" className="text-action" onClick={() => setComparison(null)}>保留当前核对草稿</button></section>}
    {draft && !textChanged && <MaterialConfirmation documentKind={kind} draft={draft} text={savedBody} saving={saving || busy} confirmed={Boolean(value?.confirmationId) && !saving && (!inLibrary || (access.canAdopt && verifiedAccess === access))} onItemsChange={saveItems} onReviewPointsChange={points => saveReview(draft.items, points)} onConfirm={() => void confirm()} skills={skills} onAdoptLevels={onAdoptLevels}/>}
    {access.canAdopt && verifiedAccess === access && draft && !textChanged && draft.textVersionId === value?.textVersionId && value.confirmationId && <button type="button" disabled={busy || saving} onClick={() => void adoptConfirmedVersion()}>采用这个已确认版本</button>}
    {draft && textChanged && <p role="status">正文已修改，请先保存新版本后再核对。原确认不会用于新正文。</p>}
  </section>;
}
