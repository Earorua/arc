import { documentProviderOutcomeSchema } from "../../app/server/documents/executor-bridge";
import type { DocumentProviderOutcome } from "../../app/server/documents/provider";
import { DocumentStorage, type DocumentBucket } from "../../app/server/documents/storage";
import { D1DocumentJobStore } from "./d1-job-store";

const maxResultBytes = 136 * 1024;
export class DocumentResultStore {
    private readonly storage: DocumentStorage;
    constructor(private readonly jobs: D1DocumentJobStore, private readonly bucket: DocumentBucket) {
        this.storage = new DocumentStorage(bucket);
    }
    async save(jobId: string, outcome: DocumentProviderOutcome): Promise<string> {
        const parsed = documentProviderOutcomeSchema.parse(outcome), body = JSON.stringify(parsed);
        if (new TextEncoder().encode(body).byteLength > maxResultBytes) throw new Error("Document result unavailable");
        const row = await this.jobs.beginResult(jobId, parsed);
        if (!row?.result_ref) throw new Error("Document result unavailable");
        if (!row.result_ready) {
            const key = row.result_key;
            if (key !== `document-results-multipart/v1/${jobId}/${row.result_ref}`) throw new Error("Result upload unavailable");
            await this.storage.write(key, body, id => this.jobs.enrollResultUpload(jobId, key, id));
            await this.jobs.completeResult(jobId);
        }
        return row.result_ref;
    }
    async read(jobId: string): Promise<{ resultRef: string; outcome: DocumentProviderOutcome } | null> {
        const row = await this.jobs.get(jobId);
        if (!row?.result_ref || !row.result_ready) return null;
        if ((row.cleanup_requested || row.accounting_only) && row.accounting_json)
            return { resultRef: row.result_ref, outcome: documentProviderOutcomeSchema.parse(JSON.parse(row.accounting_json)) };
        if (!row.result_key) return null;
        const object = await this.bucket.get(row.result_key);
        if (!object) return null;
        const body = await object.text();
        if (new TextEncoder().encode(body).byteLength > maxResultBytes) throw new Error("Document result unavailable");
        return { resultRef: row.result_ref, outcome: documentProviderOutcomeSchema.parse(JSON.parse(body)) };
    }
    private async fenceUpload(jobId: string, key: string) {
        const closed = await this.jobs.closeResultEnrollment(jobId, key);
        if (!closed || closed.result_key !== key || closed.result_upload_id === null) return null;
        if (closed.result_upload_id === "") return "never-enrolled";
        await this.storage.abortUpload(key, closed.result_upload_id);
        return "aborted";
    }
    /** Called only after the native Workflow for this job reports a terminal state. Recovery never uploads. */
    async recoverAfterWorkflowTerminal(jobId: string) {
        const row = await this.jobs.get(jobId);
        if (!row || (row.result_ready && row.writer_terminated)) return;
        await this.jobs.recoverPaidReceipt(row);
        if (!row.result_ref || !row.result_key || row.legacy_recovery_hold) {
            await this.jobs.queueTerminalAccounting(jobId, row.result_ref);
            return;
        }
        const key = row.result_key;
        const multipart = key === `document-results-multipart/v1/${jobId}/${row.result_ref}`;
        let neverEnrolled = false;
        if (multipart) {
            const fence = await this.fenceUpload(jobId, key);
            if (!fence) return;
            neverEnrolled = fence === "never-enrolled";
        } else if (key !== `document-results/${jobId}/${row.result_ref}`) {
            return;
        }
        const object = await this.bucket.get(key);
        if (object) {
            if (neverEnrolled) return;
            const body = await object.text();
            if (new TextEncoder().encode(body).byteLength > maxResultBytes) return;
            const stored = documentProviderOutcomeSchema.safeParse(JSON.parse(body));
            if (!stored.success) return;
            const accounting = stored.data.kind === "received" ? { ...stored.data, candidate: null } : stored.data;
            if (!multipart && JSON.stringify(accounting) !== row.accounting_json) return;
            await this.jobs.proveWriterTerminated(jobId, key);
            if (!row.result_ready) await this.jobs.completeResult(jobId);
            return;
        }
        // A legacy raw PUT may still land. Retain its key, even while delivering accounting without its candidate.
        if (multipart) await this.jobs.proveWriterTerminated(jobId, key);
        await this.jobs.queueTerminalAccounting(jobId, row.result_ref);
    }
    async cleanup(jobId: string): Promise<{ writersTerminated: boolean; resultsAbsent: boolean }> {
        const row = await this.jobs.get(jobId);
        if (!row) return { writersTerminated: true, resultsAbsent: true };
        if (row.legacy_recovery_hold || (row.result_key?.startsWith("document-results/") && !row.result_ready))
            return { writersTerminated: false, resultsAbsent: false };
        if (!row.cleanup_requested || !row.writer_terminated)
            return { writersTerminated: row.writer_terminated === 1, resultsAbsent: false };
        if (row.result_key) {
            const key = row.result_key;
            if (key === `document-results-multipart/v1/${jobId}/${row.result_ref}`) {
                // A termination flag is not an R2 fence. Require the exact upload even if a flag was set early.
                if (!row.result_ready || row.accounting_only || !row.result_upload_id) {
                    const fence = await this.fenceUpload(jobId, key);
                    if (!fence || (fence === "never-enrolled" && await this.bucket.head(key) !== null))
                        return { writersTerminated: false, resultsAbsent: false };
                }
            } else if (key !== `document-results/${jobId}/${row.result_ref}`) {
                return { writersTerminated: false, resultsAbsent: false };
            }
            await this.bucket.delete(row.result_key);
            if (await this.bucket.get(row.result_key) !== null) return { writersTerminated: true, resultsAbsent: false };
            await this.jobs.clearResult(jobId);
        }
        return { writersTerminated: true, resultsAbsent: true };
    }
}
