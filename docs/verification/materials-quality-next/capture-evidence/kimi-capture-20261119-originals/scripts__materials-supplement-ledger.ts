import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { DocumentReceiptClaim } from "../app/server/documents/provider";
import type { DocumentReceiptAudit } from "../app/server/documents/provider-receipt";
import { sourceSpanPolicy } from "../worker/document-executor/source-span-extraction";

import { z } from "zod";
import { DOCUMENT_SCHEMA_VERSION, materialDigestSchema, materialIdSchema, materialTimestampSchema } from "../app/contracts/documents";
import { documentAnalysisMetadataSchema } from "../app/server/documents/policy";
import { documentProviderQualificationSchema } from "../worker/document-executor/provider-http";
import { supplementCorpusSha256 } from "./score-materials-supplements";

export const supplementPurpose = "collect-six-synthetic-supplements";
export const supplementLimits = { maxRequests: 6, perRequestMicroUsd: 75_000, totalBudgetMicroUsd: 450_000, maxWindowMs: 2 * 60 * 60 * 1000 } as const;
export const supplementSettingsSchema = z.strictObject({ config: documentAnalysisMetadataSchema, qualification: documentProviderQualificationSchema });
const authorizationSchema = z.strictObject({
  purpose: z.literal(supplementPurpose), id: materialIdSchema, issuedBy: materialIdSchema, runId: materialIdSchema,
  candidateCommit: z.string().regex(/^[a-f0-9]{40}$/u), configurationSha256: materialDigestSchema,
  credentialSha256: materialDigestSchema, ledgerSha256: materialDigestSchema, corpusSha256: z.literal(supplementCorpusSha256), outputSchemaVersion: z.literal(DOCUMENT_SCHEMA_VERSION),
  documents: z.array(z.strictObject({ documentId: materialIdSchema, documentVersionId: materialIdSchema, textVersionId: materialIdSchema })).length(supplementLimits.maxRequests),
  approvedAt: materialTimestampSchema, expiresAt: materialTimestampSchema, maxRequests: z.literal(supplementLimits.maxRequests),
  perRequestMicroUsd: z.number().int().positive().max(supplementLimits.perRequestMicroUsd),
  totalBudgetMicroUsd: z.number().int().positive().max(supplementLimits.totalBudgetMicroUsd),
});
const issuanceSchema = supplementSettingsSchema.extend({ authorization: authorizationSchema });

export const supplementFixtureToken = "synthetic-supplement-credential";
const checkedBindings = new WeakSet<SupplementIssuanceBinding>();
/** The original out-of-band SHA-256 authenticates the input bytes. Only normalized public fields go to SQLite. */
export function readPinnedSupplementIssuance(raw: string, digest: string | undefined, mode: SupplementIssuanceBinding["mode"]) {
  if (!digest || Buffer.byteLength(raw) > 32_768 || captureDigest(raw) !== digest) throw new Error("supplement-authorization-invalid");
  const issued = issuanceSchema.parse(JSON.parse(raw));
  if ((mode !== "offline-test" && mode !== "authorized-live") || (mode === "offline-test") !== (issued.authorization.credentialSha256 === captureDigest(supplementFixtureToken)))
    throw new Error("supplement-authorization-invalid");
  const binding = Object.freeze({ runId: issued.authorization.runId, authorizationId: issued.authorization.id,
    issuanceSha256: digest, publicIssuance: JSON.stringify(issued), mode });
  checkedBindings.add(binding);
  return { issued, binding };
}

type Identity = { documentId: string; documentVersionId: string; textVersionId: string };
type Totals = { requestsSent: number; settledMicroUsd: number; heldMicroUsd: number };
export type SupplementIssuanceBinding = Readonly<{
  runId: string; authorizationId: string; issuanceSha256: string; publicIssuance: string; mode: "offline-test" | "authorized-live";
}>;
function mustWrite(changes: number | bigint) {
  if (changes !== 1) throw new Error("supplement-ledger-write-failed");
}
const captureDigest = (encodedContent: string) => createHash("sha256").update(encodedContent, "utf8").digest("hex");
const evidenceDigest = (runId: string, document: Identity, receipt: string, rawDigest: string, extractionJson: string) =>
  captureDigest(JSON.stringify([runId, document.documentId, document.documentVersionId, document.textVersionId, receipt, rawDigest, extractionJson]));

function ledgerIdentity(db: DatabaseSync, path: string) {
  const row = db.prepare("SELECT id FROM ledger_identity WHERE singleton=1").get();
  if (typeof row?.id !== "string") throw new Error("supplement-ledger-unregistered");
  return createHash("sha256").update(JSON.stringify([realpathSync.native(path), row.id])).digest("hex");
}
function checkLedgerPath(path: string) {
  let existing = resolve(path);
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) throw new Error("supplement-ledger-mismatch");
    existing = parent;
  }
  if (relative(existing, realpathSync.native(existing)) !== "" || (existing === resolve(path) && (!lstatSync(existing).isFile() || lstatSync(existing).nlink !== 1)))
    throw new Error("supplement-ledger-mismatch");
}

/** Register once, before issuance. A new or relocated DB requires a new ledger pin. */
export function registerSupplementLedger(directory: string) {
  const path = join(directory, "ledger.sqlite");
  checkLedgerPath(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (existsSync(path)) {
    const db = new DatabaseSync(path, { readOnly: true });
    try { return ledgerIdentity(db, path); } finally { db.close(); }
  }
  closeSync(openSync(path, "wx", 0o600));
  const db = new DatabaseSync(path);
  try {
    db.exec(`PRAGMA synchronous=FULL; BEGIN;
      CREATE TABLE ledger_identity(singleton INTEGER PRIMARY KEY CHECK(singleton=1), id TEXT NOT NULL) STRICT;
      CREATE TABLE collection_runs(
        run_id TEXT PRIMARY KEY, authorization_id TEXT NOT NULL UNIQUE, issuance_sha256 TEXT NOT NULL UNIQUE,
        issuance_json TEXT NOT NULL, mode TEXT NOT NULL, started_at TEXT NOT NULL, status TEXT NOT NULL, result_json TEXT
      ) STRICT;
      CREATE UNIQUE INDEX one_open_supplement_run ON collection_runs((1)) WHERE status IN ('collecting','held');
      CREATE TABLE attempts(
        run_id TEXT NOT NULL REFERENCES collection_runs(run_id), document_id TEXT NOT NULL,
        document_version_id TEXT NOT NULL, text_version_id TEXT NOT NULL, reserved_at TEXT NOT NULL, sent_at TEXT,
        state TEXT NOT NULL, reserved_micro_usd INTEGER NOT NULL, actual_micro_usd INTEGER, receipt_id TEXT UNIQUE,
        raw_content_json TEXT, chat_json TEXT, audit_json TEXT, reason TEXT, PRIMARY KEY(run_id, document_id)
      ) STRICT;`);
    db.prepare("INSERT INTO ledger_identity VALUES(1,?)").run(randomUUID());
    db.exec("COMMIT");
    return ledgerIdentity(db, path);
  } finally { db.close(); }
}

/** Collection opens the same registered DB on every start. No replacement, reset or automatic resume. */
export function openSupplementLedger(directory: string, runId: string, expectedIdentity: string) {
  const path = join(directory, "ledger.sqlite");
  checkLedgerPath(path);
  if (!existsSync(path)) throw new Error("supplement-ledger-unregistered");
  const db = new DatabaseSync(path);
  try {
    if (ledgerIdentity(db, path) !== expectedIdentity) throw new Error("supplement-ledger-mismatch");
    db.exec("PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON");
  } catch (error) { db.close(); throw error; }
  const matchesBinding = (binding: SupplementIssuanceBinding) => Boolean(checkedBindings.has(binding) && binding.runId === runId &&
    db.prepare(`SELECT 1 FROM collection_runs WHERE run_id=? AND authorization_id=? AND issuance_sha256=? AND issuance_json=? AND mode=?`)
      .get(runId, binding.authorizationId, binding.issuanceSha256, binding.publicIssuance, binding.mode));
  const sourceSpanRun = (binding: SupplementIssuanceBinding) => sourceSpanPolicy(JSON.parse(binding.publicIssuance).config.providerPolicyId);
  return {
    close: () => db.close(),
    matchesBinding,
    start(binding: SupplementIssuanceBinding, at: string) {
      if (!checkedBindings.has(binding) || binding.runId !== runId) throw new Error("supplement-run-binding-mismatch");
      const written = db.prepare(`INSERT INTO collection_runs(run_id,authorization_id,issuance_sha256,issuance_json,mode,started_at,status)
        VALUES(?,?,?,?,?,?,'collecting') ON CONFLICT DO NOTHING`).run(runId, binding.authorizationId, binding.issuanceSha256, binding.publicIssuance, binding.mode, at);
      if (written.changes !== 1) throw new Error("supplement-run-unavailable");
      // Add local replay storage only for a newly started source-span run. Existing registrations and raw captures survive.
      if (sourceSpanRun(binding)) db.exec(`CREATE TABLE IF NOT EXISTS source_span_outputs(
        run_id TEXT NOT NULL, document_id TEXT NOT NULL, receipt_id TEXT NOT NULL, evidence_sha256 TEXT NOT NULL,
        extraction_json TEXT NOT NULL CHECK(json_valid(extraction_json)), PRIMARY KEY(run_id,document_id),
        FOREIGN KEY(run_id,document_id) REFERENCES attempts(run_id,document_id), FOREIGN KEY(receipt_id) REFERENCES attempts(receipt_id)
      ) STRICT`);
    },
    totals() {
      return db.prepare(`SELECT COUNT(sent_at) AS requestsSent,
        COALESCE(SUM(CASE WHEN state='settled' THEN actual_micro_usd ELSE 0 END),0) AS settledMicroUsd,
        COALESCE(SUM(CASE WHEN state IN ('reserved','held') THEN reserved_micro_usd ELSE 0 END),0) AS heldMicroUsd
        FROM attempts WHERE run_id=?`).get(runId) as Totals;
    },
    reserve(doc: Identity, amount: number, at: string) {
      db.prepare(`INSERT INTO attempts(run_id,document_id,document_version_id,text_version_id,reserved_at,state,reserved_micro_usd)
        VALUES(?,?,?,?,?,'reserved',?)`).run(runId, doc.documentId, doc.documentVersionId, doc.textVersionId, at, amount);
    },
    markSending(id: string, at: string) {
      mustWrite(db.prepare("UPDATE attempts SET sent_at=? WHERE run_id=? AND document_id=? AND state='reserved' AND sent_at IS NULL").run(at, runId, id).changes);
    },
    capture(id: string, content: string | null) {
      // Encoding the string itself preserves whitespace, embedded NULs, malformed JSON and lone surrogates.
      const encoded = JSON.stringify(content);
      mustWrite(db.prepare("UPDATE attempts SET raw_content_json=? WHERE run_id=? AND document_id=? AND raw_content_json IS NULL AND state='reserved'")
        .run(encoded, runId, id).changes);
      return captureDigest(encoded);
    },
    claim(id: string, receipt: string, observed: Parameters<DocumentReceiptClaim>[1]) {
      const chat = JSON.stringify({ receiptId: receipt, ...observed });
      const written = db.prepare(`UPDATE attempts SET receipt_id=?,chat_json=? WHERE run_id=? AND document_id=?
        AND receipt_id IS NULL AND state='reserved' AND NOT EXISTS(SELECT 1 FROM attempts WHERE receipt_id=?)`).run(receipt, chat, runId, id, receipt);
      if (written.changes === 1) return true;
      if (!db.prepare("SELECT 1 FROM attempts WHERE receipt_id=?").get(receipt)) throw new Error("supplement-ledger-write-failed");
      mustWrite(db.prepare("UPDATE attempts SET chat_json=? WHERE run_id=? AND document_id=? AND chat_json IS NULL").run(chat, runId, id).changes);
      return false;
    },
    finishAttempt(id: string, state: "released" | "held" | "settled", actual: number | null, audit: DocumentReceiptAudit | null, reason: string | null,
      decoded?: { receiptId: string; rawDigest: string; extractionJson: string }) {
      // Commit the final observation separately. A failed transition leaves the reservation and its evidence recoverable together.
      mustWrite(db.prepare("UPDATE attempts SET actual_micro_usd=?,audit_json=?,reason=? WHERE run_id=? AND document_id=? AND state='reserved'")
        .run(actual, audit ? JSON.stringify(audit) : null, reason, runId, id).changes);
      if (decoded) {
        try {
          const row = db.prepare(`SELECT document_id AS documentId,document_version_id AS documentVersionId,text_version_id AS textVersionId,raw_content_json
            FROM attempts WHERE run_id=? AND document_id=? AND receipt_id=? AND state='reserved'`)
            .get(runId, id, decoded.receiptId) as (Identity & { raw_content_json: string | null }) | undefined;
          if (typeof row?.raw_content_json !== "string" || captureDigest(row.raw_content_json) !== decoded.rawDigest) throw new Error("supplement-capture-mismatch");
          const digest = evidenceDigest(runId, row, decoded.receiptId, decoded.rawDigest, decoded.extractionJson);
          mustWrite(db.prepare("INSERT INTO source_span_outputs(run_id,document_id,receipt_id,evidence_sha256,extraction_json) VALUES(?,?,?,?,?)")
            .run(runId, id, decoded.receiptId, digest, decoded.extractionJson).changes);
        } catch {
          // Failure to preserve a projection stops collection, while a verified charge can still settle.
          reason = "capture-failed";
          mustWrite(db.prepare("UPDATE attempts SET reason=? WHERE run_id=? AND document_id=? AND state='reserved'").run(reason, runId, id).changes);
        }
      }
      mustWrite(db.prepare(`UPDATE attempts SET state=?,sent_at=CASE WHEN ?='released' THEN NULL ELSE sent_at END
        WHERE run_id=? AND document_id=? AND state='reserved'`).run(state, state, runId, id).changes);
      return reason;
    },
    captures(binding: SupplementIssuanceBinding) {
      if (!matchesBinding(binding)) throw new Error("supplement-run-binding-mismatch");
      if (sourceSpanRun(binding)) {
        const rows = db.prepare(`SELECT a.document_id AS documentId,a.document_version_id AS documentVersionId,a.text_version_id AS textVersionId,
          a.receipt_id AS receipt,a.raw_content_json AS content,o.evidence_sha256 AS digest,o.extraction_json AS extraction FROM attempts a
          LEFT JOIN source_span_outputs o ON o.run_id=a.run_id AND o.document_id=a.document_id AND o.receipt_id=a.receipt_id
          WHERE a.run_id=? AND a.state='settled' ORDER BY a.rowid`).all(runId) as (Identity & { receipt: string | null; content: string | null; digest: string | null; extraction: string | null })[];
        return rows.map(({ receipt, content, digest, extraction, ...identity }) => {
          if (receipt === null || content === null || extraction === null || evidenceDigest(runId, identity, receipt, captureDigest(content), extraction) !== digest)
            throw new Error("supplement-capture-mismatch");
          return { ...identity, extraction: JSON.parse(extraction) as unknown };
        });
      }
      const rows = db.prepare(`SELECT document_id AS documentId,document_version_id AS documentVersionId,text_version_id AS textVersionId,
        raw_content_json AS content FROM attempts WHERE run_id=? AND state='settled' ORDER BY rowid`).all(runId) as (Identity & { content: string | null })[];
      return rows.map(({ content, ...identity }) => {
        if (content === null) throw new Error("supplement-capture-missing");
        const original = JSON.parse(content);
        let extraction: unknown = null;
        if (typeof original === "string") {
          try { extraction = JSON.parse(original); } catch { /* Keep the invalid original and let the scorer fail it. */ }
        }
        return { ...identity, extraction };
      });
    },
    finish(result: { status: string; mode: string }, binding: SupplementIssuanceBinding) {
      const requireBinding = result.status === "complete" || result.status === "quality-failed";
      if (!checkedBindings.has(binding) || result.mode !== binding.mode || binding.runId !== runId) throw new Error("supplement-run-binding-mismatch");
      mustWrite(db.prepare(`UPDATE collection_runs SET status=?,result_json=? WHERE run_id=? AND status='collecting'
        AND (?=0 OR (authorization_id=? AND issuance_sha256=? AND issuance_json=? AND mode=?))`)
        .run(result.status, JSON.stringify(result), runId, Number(requireBinding), binding.authorizationId, binding.issuanceSha256, binding.publicIssuance, binding.mode).changes);
    },
  };
}
