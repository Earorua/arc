import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { DocumentReceiptClaim } from "../app/server/documents/provider";
import type { DocumentReceiptAudit } from "../app/server/documents/provider-receipt";

type Identity = { documentId: string; documentVersionId: string; textVersionId: string };
type Totals = { requestsSent: number; settledMicroUsd: number; heldMicroUsd: number };
function mustWrite(changes: number | bigint) {
  if (changes !== 1) throw new Error("supplement-ledger-write-failed");
}

function ledgerIdentity(db: DatabaseSync, path: string) {
  const row = db.prepare("SELECT id FROM ledger_identity WHERE singleton=1").get();
  if (typeof row?.id !== "string") throw new Error("supplement-ledger-unregistered");
  return createHash("sha256").update(JSON.stringify([realpathSync.native(path), row.id])).digest("hex");
}

/** Register once, before issuance. A new or relocated DB requires a new ledger pin. */
export function registerSupplementLedger(directory: string) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "ledger.sqlite");
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
  if (!existsSync(path)) throw new Error("supplement-ledger-unregistered");
  const db = new DatabaseSync(path);
  try {
    if (ledgerIdentity(db, path) !== expectedIdentity) throw new Error("supplement-ledger-mismatch");
    db.exec("PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON");
  } catch (error) { db.close(); throw error; }
  return {
    close: () => db.close(),
    start(id: string, digest: string, issued: string, mode: string, at: string) {
      const written = db.prepare(`INSERT INTO collection_runs(run_id,authorization_id,issuance_sha256,issuance_json,mode,started_at,status)
        VALUES(?,?,?,?,?,?,'collecting') ON CONFLICT DO NOTHING`).run(runId, id, digest, issued, mode, at);
      if (written.changes !== 1) throw new Error("supplement-run-unavailable");
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
      mustWrite(db.prepare("UPDATE attempts SET raw_content_json=? WHERE run_id=? AND document_id=? AND raw_content_json IS NULL AND state='reserved'")
        .run(JSON.stringify(content), runId, id).changes);
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
    finishAttempt(id: string, state: "released" | "held" | "settled", actual: number | null, audit: DocumentReceiptAudit | null, reason: string | null) {
      // Commit the final observation separately. A failed transition leaves the reservation and its evidence recoverable together.
      mustWrite(db.prepare("UPDATE attempts SET actual_micro_usd=?,audit_json=?,reason=? WHERE run_id=? AND document_id=? AND state='reserved'")
        .run(actual, audit ? JSON.stringify(audit) : null, reason, runId, id).changes);
      mustWrite(db.prepare(`UPDATE attempts SET state=?,sent_at=CASE WHEN ?='released' THEN NULL ELSE sent_at END
        WHERE run_id=? AND document_id=? AND state='reserved'`).run(state, state, runId, id).changes);
    },
    captures() {
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
    finish(result: { status: string }) {
      mustWrite(db.prepare("UPDATE collection_runs SET status=?,result_json=? WHERE run_id=? AND status='collecting'")
        .run(result.status, JSON.stringify(result), runId).changes);
    },
  };
}
