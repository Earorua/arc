"use client";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { materialIdSchema } from "../../contracts/documents";
import { readSetupDraft, writeSetupDraft, removeSetupDraft } from "../setup/setup-draft";
import type { ConfirmedMaterialItem, DocumentReviewDraft } from "../../contracts/documents";
import { documentVersionReceiptSchema, type DocumentEndpointRequest, type DocumentEndpointResponse } from "../../contracts/documents-api";
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
    const label = kind === "resume" ? "Resume" : kind === "jd" ? "Job description" : "Supplementary material";
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
                    setMessage("The previous save is unconfirmed. Paste the text again and explicitly save it, or recover it from your private library.");
                    return;
                }
                const current = valueRef.current;
                if (current && current.documentId !== result.receipt.documentId)
                    return;
                const next = current?.textVersionId === result.receipt.textVersionId ? { ...current, ...result.receipt } : result.receipt;
                valueRef.current = next;
                changeRef.current(next);
                setPendingAnalysis(pending.phase === "analysis");
                setMessage("Your previously saved material is restored. Confirm the processing scope again to analyze it.");
            }
            catch (error) {
                if (!controller.signal.aborted && epoch === lifecycle.current)
                    setMessage(error instanceof Error ? error.message : "The save receipt is temporarily unavailable.");
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
                    setMessage(error instanceof Error ? error.message : "The saved material is temporarily unavailable.");
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
                        setMessage("A new AI candidate is available. Your review edits are unchanged; compare the candidate before choosing to use it.");
                    }
                }
            }
            catch (error) {
                if (!controller.signal.aborted && epoch === lifecycle.current)
                    setMessage(error instanceof Error ? error.message : "Analysis status is temporarily unavailable.");
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
                throw new Error("AI analysis is temporarily unavailable. You can organize the material manually.");
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
                setMessage(error instanceof Error ? error.message : "The operation could not be completed. You can keep the material and organize it manually.");
        }
        finally {
            if (epoch === lifecycle.current)
                setBusy(false);
        }
    }
    function saveItems(items: ConfirmedMaterialItem[], addition?: DocumentEndpointRequest<"saveDocumentReviewDraft">["skillTermAddition"]) {
        saveReview(items, draft?.reviewPoints, addition);
    }
    function saveReview(items: ConfirmedMaterialItem[], reviewPoints: DocumentReviewDraft["reviewPoints"], addition?: DocumentEndpointRequest<"saveDocumentReviewDraft">["skillTermAddition"]) {
        if (!draft || !valueRef.current)
            return;
        const edit = ++edits.current;
        const selfAssessmentHints = retainedMaterialSelfAssessmentHints(items, draft.selfAssessmentHints, draft.reviewProjection);
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
                ...(addition ? { skillTermAddition: addition } : {}),
                expectedRevision: base.revision,
                mutationId: `review-${crypto.randomUUID()}`
            }, cancellation.current.signal);
            if (epoch === lifecycle.current) {
                serverDraft.current = result.draft;
                setDraft(current => edit === edits.current || !current ? result.draft : { ...current, revision: result.draft.revision, origin: result.draft.origin });
            }
        });
        const queued = saveQueue.current;
        void queued.catch(error => { if (epoch === lifecycle.current)
            setMessage(error instanceof Error ? error.message : "Your edits have not been saved. Try again."); }).finally(() => { if (epoch === lifecycle.current && saveQueue.current === queued)
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
                setMessage(error instanceof Error ? error.message : "Confirmation failed. Review the material again.");
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
                setMessage("The saved material or review has changed. Reopen the current version.");
                return;
            }
            adoptionCallback.current?.({ ...ref, revision: latest.confirmation.revision });
        } catch {
            if (!controller.signal.aborted && activeAccess.current === access && epoch === lifecycle.current && beforeRead === edits.current) {
                clearConfirmation();
                setMessage("The current confirmation could not be verified. Reopen the material before using it.");
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
                setMessage(error instanceof Error ? error.message : "Cancellation is not yet confirmed.");
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
                setMessage(error instanceof Error ? error.message : "The new candidate is temporarily unavailable.");
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
                setMessage(error instanceof Error ? error.message : "The draft has changed. Compare it again before using the candidate.");
        }
        finally {
            if (epoch === lifecycle.current)
                setBusy(false);
        }
    }
    return <section className="material-text-panel" aria-label={`${label} material`}>
    <h2>{label}: assisted planning</h2><p>Paste material for AI to organize, then review its facts and ability suggestions. You can also skip this step.</p>
    <fieldset disabled={disabled || busy}><legend className="sr-only">{label}: import text</legend>
      <label>Material name<input value={name} onChange={event => setName(event.target.value)} maxLength={200}/></label>
      <label>{label} text<textarea aria-label={`${label} text`} value={text} maxLength={100000} onChange={event => { setText(event.target.value); setConsentedScope(null); clearConfirmation(); }} placeholder="Paste text. File and link imports will be available later."/></label>
      {capabilities.analysisEnabled ? <>
        <div id={consentDescriptionId}>
          <p>Processor: {capabilities.providerLabel}. Purpose: extract facts from this material for your review. Only the current text above is sent; links in it are not opened automatically.</p>
          {capabilities.privacyNotice === "kimi-k31-pro-zdr" && <>
            <p>This request sends text through OpenRouter&apos;s global endpoint to Moonshot AI&apos;s Kimi K3.1 Pro using a Zero Data Retention (ZDR) route. The upstream provider may temporarily cache inputs. OpenRouter may sample a small amount of input for classification by ZDR models. Under its published safety-screening program, suspected child sexual abuse material may be retained for review and reported or preserved as required by law.</p>
            <p><a href="https://openrouter.ai/docs/guides/features/zdr" target="_blank" rel="noreferrer">OpenRouter Zero Data Retention policy</a>{" · "}
              <a href="https://openrouter.ai/docs/guides/privacy/data-collection" target="_blank" rel="noreferrer">OpenRouter data collection policy</a>{" · "}
              <a href="https://platform.kimi.ai/docs/agreement/userprivacy" target="_blank" rel="noreferrer">Kimi Open Platform privacy policy</a></p>
          </>}
        </div>
        <label className="material-consent"><input type="checkbox" aria-describedby={consentDescriptionId} checked={allowed} onChange={event => setConsentedScope(event.target.checked ? consentScope : null)}/>Allow the processors above to analyze the current text for this request</label>
      </> : <p role="status">AI analysis is temporarily unavailable. You can save the material and organize it manually; saved content is retained.</p>}
      <div className="material-actions">{capabilities.analysisEnabled && <button type="button" disabled={!allowed || !text.trim() || analysisBlocked} onClick={() => void save(true, canReanalyze)}>{pendingAnalysis && !textChanged ? "Continue the previous analysis request" : canReanalyze ? "Run AI analysis again" : "Save and analyze with AI"}</button>}<button type="button" className="text-action" disabled={!text.trim()} onClick={() => void save(false)}>Save and organize manually</button></div>
    </fieldset>
    {job && <MaterialJobStatus job={job} onCancel={() => void cancel()}/>}
    {message && <p role="alert">{message}</p>}
    {lateExtractionId && !textChanged && <button type="button" className="text-action" disabled={busy || saving} onClick={() => void compareCandidates()}>Compare new AI candidate</button>}
    {comparison && !textChanged && <section aria-label="New AI candidate comparison"><h3>New AI candidate</h3><p>The candidate below has not been adopted. Replacing your draft still requires fact review and confirmation; ability suggestions must be adopted separately.</p><ul>{comparison.draft.items.map(item => <li key={item.id}>{item.text}</li>)}</ul><button type="button" disabled={busy || saving} onClick={() => void adoptCandidates()}>Replace review draft with these candidates</button><button type="button" className="text-action" onClick={() => setComparison(null)}>Keep current review draft</button></section>}
    {draft && !textChanged && <MaterialConfirmation documentKind={kind} draft={draft} text={savedBody} saving={saving || busy} confirmed={Boolean(value?.confirmationId) && !saving && (!inLibrary || (access.canAdopt && verifiedAccess === access))} onItemsChange={saveItems} onReviewPointsChange={points => saveReview(draft.items, points)} onConfirm={() => void confirm()} skills={skills} onAdoptLevels={onAdoptLevels}/>}
    {access.canAdopt && verifiedAccess === access && draft && !textChanged && draft.textVersionId === value?.textVersionId && value.confirmationId && <button type="button" disabled={busy || saving} onClick={() => void adoptConfirmedVersion()}>Use this confirmed version</button>}
    {draft && textChanged && <p role="status">The text has changed. Save a new version before reviewing it; the previous confirmation will not apply to new text.</p>}
  </section>;
}
