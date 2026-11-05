// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeDocumentText } from "../../app/contracts/documents";
import type { DocumentAnalysisMetadata } from "../../app/server/documents/policy";
import { documentProviderConfigurationDigest, type DocumentProviderInput } from "../../app/server/documents/provider";
import { renderDocumentAcceptanceEnrollment } from "../../scripts/materials-ui-acceptance-enroll";
import {
  documentAcceptanceCases, documentAcceptanceConfigurationDigest, documentAcceptanceCorpusSha256,
} from "../../worker/document-executor/acceptance-policy";
import { D1DocumentJobStore } from "../../worker/document-executor/d1-job-store";
import { calculateDocumentReservation, HttpDocumentAnalysisProvider, type DocumentProviderQualification } from "../../worker/document-executor/provider-http";
import corpus from "../fixtures/documents/quality-corpus.json";
import { SqliteD1 } from "../helpers/sqlite-d1";

// The published 2026.11.3 review settings, with qualification simulated only inside these expired fixtures.
const budgetPlan = "b4-kimi-k31-pro-mxfp4-v1";
const canonicalPlan = "b4-kimi-k31-pro-mxfp4-v2";
const config: DocumentAnalysisMetadata = {
  provider: "OpenRouter / Moonshot AI", model: "moonshotai/kimi-k3.1-pro",
  endpoint: "https://openrouter.ai/api/v1/chat/completions", providerPolicyId: "materials-openrouter-kimi-k31-pro-mxfp4-zdr",
  priceVersion: "2026.11.3",
  routingPolicy: { policyVersion: "2026.11.3", providerOrder: ["moonshotai/mxfp4"], allowFallback: false, dataPolicy: "zdr-only" },
  userDailyMicroUsd: 2_000_000, globalDailyMicroUsd: 2_000_000, maxJobMicroUsd: 75_000,
  maxInputTokens: 16_000, maxOutputTokens: 4_096, httpTimeoutMs: 180_000,
};
const qualification: DocumentProviderQualification = {
  qualified: true, model: config.model, endpoint: config.endpoint, providerPolicyId: config.providerPolicyId,
  priceVersion: config.priceVersion, routingPolicy: config.routingPolicy, inputMicroUsdPerMillionTokens: 2_000_000,
  outputMicroUsdPerMillionTokens: 10_000_000, inputTokenBound: "utf8-bytes-plus-4096",
  receiptRoute: { providerName: "Moonshot AI", endpointId: "a3fafaac-f097-4ef1-86b3-842854dad5c6" },
};
const approvedAt = "2025-01-01T00:00:00.000Z", expiresAt = "2025-01-01T04:00:00.000Z";
const canonicalQualification = { ...qualification,
  receiptRoute: { ...qualification.receiptRoute, generationModel: "moonshotai/kimi-k3.1-pro-20261023" } };
const now = Date.parse(approvedAt) + 60_000;
function enrollment(totalBudgetMicroUsd: number, plan?: string) {
  return {
    runId: "offline-b4-budget", ownerId: "OfflineOwner", corpusSha256: documentAcceptanceCorpusSha256,
    approvedAt, expiresAt, maxRequests: 24, totalBudgetMicroUsd, config,
    qualification: plan === canonicalPlan ? canonicalQualification : qualification,
    ...(plan === undefined ? {} : { budgetPlan: plan }),
    cases: corpus.documents.map(doc => ({
      caseId: doc.id, documentId: randomUUID(), documentVersionId: randomUUID(), textVersionId: randomUUID(),
      generation: 0, textSha256: documentAcceptanceCases[doc.id],
    })),
  };
}
const migrations = "worker/document-executor/migrations";
function migrate(db: SqliteD1, min: number, max = Infinity) {
  db.database.exec("BEGIN");
  try {
    for (const name of readdirSync(migrations).filter(name => /^\d+_.+\.sql$/u.test(name)).sort()) {
      const version = Number(name.split("_")[0]);
      if (version >= min && version <= max) db.database.exec(readFileSync(join(migrations, name), "utf8"));
    }
    db.database.exec("COMMIT");
  } catch (error) {
    db.database.exec("ROLLBACK");
    throw error;
  }
}
const opened: SqliteD1[] = [];
function database(through = Infinity) {
  const db = new SqliteD1();
  opened.push(db);
  db.database.exec("PRAGMA foreign_keys=ON");
  db.database.function("unixepoch", { varargs: true }, () => now / 1000);
  migrate(db, 0, through);
  return db;
}
afterEach(() => { for (const db of opened.splice(0)) db.close(); });

describe("B4 second-round budget", () => {
  it("binds the successor plan to the canonical version in both the registrar and database", async () => {
    const data = enrollment(2_000_000, canonicalPlan), sql = database().database;
    const digest = await documentAcceptanceConfigurationDigest(config, canonicalQualification);
    expect(digest).toBe("ec56126eff54568bbd9960ad050c7311b137cb0ac44c2f42e0ea506c6c81718f");
    const insert = await renderDocumentAcceptanceEnrollment(data);
    const oldDigest = await documentAcceptanceConfigurationDigest(config, qualification);
    expect(() => sql.exec(insert.replace(digest, oldDigest))).toThrow();
    expect(() => sql.exec(insert.replace(canonicalPlan, budgetPlan))).toThrow();
    for (const changed of [qualification, { ...canonicalQualification,
      receiptRoute: { ...canonicalQualification.receiptRoute, generationModel: "moonshotai/kimi-k3.1-pro-20261024" } }]) {
      await expect(renderDocumentAcceptanceEnrollment({ ...data, qualification: changed })).rejects.toThrow();
    }
    sql.exec(insert);
    expect(sql.prepare("SELECT budget_plan,configuration_sha256,total_budget_micro_usd FROM document_acceptance_runs").get())
      .toEqual({ budget_plan: canonicalPlan, configuration_sha256: digest, total_budget_micro_usd: 2_000_000 });
    expect(() => sql.exec(insert.replace("INSERT INTO", "INSERT OR REPLACE INTO"))).toThrow();
    expect(() => sql.exec("UPDATE document_acceptance_runs SET total_budget_micro_usd=1")).toThrow();
  });

  it("preserves an already issued v1 grant when adding the canonical-version budget constraint", async () => {
    const db = database(4), sql = db.database;
    const insert = await renderDocumentAcceptanceEnrollment(enrollment(2_000_000, budgetPlan));
    sql.exec(insert);
    const snapshot = () => sql.prepare("SELECT run_id,budget_plan,configuration_sha256,total_budget_micro_usd,cases_json FROM document_acceptance_runs").all();
    const before = snapshot();
    migrate(db, 5);
    expect(snapshot()).toEqual(before);
    expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(() => sql.exec(insert.replace("INSERT INTO", "INSERT OR REPLACE INTO"))).toThrow();
    expect(() => sql.exec("UPDATE document_acceptance_runs SET expires_at=3")).toThrow();
    sql.exec(await renderDocumentAcceptanceEnrollment({ ...enrollment(2_000_000, canonicalPlan), runId: "new-canonical-run" }));
    expect(sql.prepare("SELECT COUNT(*) n FROM document_acceptance_runs").get()).toEqual({ n: 2 });
  });

  it("admits a separately selected Kimi plan only with the reviewed settings, qualification, window and ceiling", async () => {
    const data = enrollment(2_000_000, budgetPlan);
    const db = database().database;
    db.exec(await renderDocumentAcceptanceEnrollment(data));
    expect(db.prepare("SELECT budget_plan,total_budget_micro_usd FROM document_acceptance_runs").get()).toEqual({
      budget_plan: budgetPlan, total_budget_micro_usd: 2_000_000,
    });
    for (const invalid of [
      enrollment(2_000_000), enrollment(2_000_001, budgetPlan), enrollment(1_751_040.5, budgetPlan),
      enrollment(2_000_000, "b2-kimi"), { ...data, config: { ...config, globalDailyMicroUsd: 2_000_001 } },
      { ...data, config: { ...config, maxJobMicroUsd: 74_999 } }, { ...data, config: { ...config, maxOutputTokens: 4_095 } },
      { ...data, qualification: { ...qualification, inputMicroUsdPerMillionTokens: 1_999_999 } },
      { ...data, qualification: { ...qualification, receiptRoute: { ...qualification.receiptRoute, endpointId: "different" } } },
      { ...data, qualification: { ...qualification, qualified: false } }, { ...data, expiresAt: approvedAt },
      { ...data, maxRequests: 25 }, { ...data, corpusSha256: "0".repeat(64) }, { ...data, runId: null },
    ]) await expect(renderDocumentAcceptanceEnrollment(invalid)).rejects.toThrow();
  });

  it("preserves occupied legacy runs, charges, holds, foreign keys and the old enrollment SQL", async () => {
    const db = database(3), sql = db.database;
    const data = enrollment(500_000);
    const legacy = await renderDocumentAcceptanceEnrollment({ ...data, config: { ...config, provider: "Legacy fixture" } });
    sql.exec(legacy);
    expect(() => sql.prepare("UPDATE document_acceptance_runs SET total_budget_micro_usd=?").run(2_000_000)).toThrow(/CHECK/u);
    sql.exec(`
      UPDATE document_acceptance_runs SET last_checked_at=121,stopped_at=123;
      INSERT INTO document_executor_jobs(job_id,state,dispatch_state,created_at,updated_at)
        VALUES('legacy-job','delivered','settled',100,120),('held-job','cost-unknown','may-have-sent',110,122),
          ('production-job','delivered','settled',105,119);
      INSERT INTO document_acceptance_dispatches(run_id,case_id,job_id,reserved_micro_usd,claimed_at,state,receipt_id,
        sent_at,returned_at,actual_micro_usd,input_tokens,output_tokens,audit_json,checked_at) VALUES
        ('offline-b4-budget','resume-01','legacy-job',72960,100,'verified','legacy-receipt','sent','returned',700,70,5,'{"status":"verified"}',120),
        ('offline-b4-budget','resume-02','held-job',72960,110,'pending',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
      INSERT INTO document_production_grants(grant_id,authorization_sha256,approved_at,expires_at,total_budget_micro_usd,last_checked_at)
        VALUES('issued-production',lower(hex(zeroblob(32))),100,200,600000,119);
      INSERT INTO document_production_dispatches(job_id,grant_id,reserved_micro_usd,claimed_at,state,receipt_id,actual_micro_usd)
        VALUES('production-job','issued-production',72960,105,'verified','production-receipt',100);
      INSERT INTO document_paid_transport_hold VALUES(1,122);
    `);
    const snapshot = () => ({
      runs: sql.prepare("SELECT run_id,owner_id,corpus_sha256,configuration_sha256,approved_at,expires_at,max_requests,total_budget_micro_usd,cases_json,last_checked_at,stopped_at FROM document_acceptance_runs").all(),
      cases: sql.prepare("SELECT * FROM document_acceptance_cases ORDER BY case_id").all(),
      dispatches: sql.prepare("SELECT * FROM document_acceptance_dispatches ORDER BY job_id").all(),
      paid: sql.prepare("SELECT * FROM document_paid_dispatches ORDER BY job_id").all(),
      productionGrants: sql.prepare("SELECT * FROM document_production_grants").all(),
      productionDispatches: sql.prepare("SELECT * FROM document_production_dispatches").all(),
      holds: sql.prepare("SELECT * FROM document_paid_transport_hold").all(),
    });
    const before = snapshot();
    migrate(db, 4);
    expect(snapshot()).toEqual(before);
    expect(sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(sql.prepare("SELECT budget_plan FROM document_acceptance_runs").get()).toEqual({ budget_plan: null });
    expect(() => sql.prepare("UPDATE document_acceptance_runs SET total_budget_micro_usd=2000000,budget_plan=?").run(budgetPlan)).toThrow();
    expect(() => sql.exec(legacy.replace("INSERT INTO", "INSERT OR REPLACE INTO"))).toThrow();
    const reusedProductionId = await renderDocumentAcceptanceEnrollment({ ...enrollment(2_000_000, budgetPlan), runId: "issued-production" });
    expect(() => sql.exec(reusedProductionId)).toThrow();
    expect(snapshot()).toEqual(before);
    sql.exec(legacy.replace("'offline-b4-budget'", "'offline-legacy-new'"));
    expect(sql.prepare("SELECT total_budget_micro_usd,budget_plan FROM document_acceptance_runs WHERE run_id='offline-legacy-new'").get())
      .toEqual({ total_budget_micro_usd: 500_000, budget_plan: null });
    expect(() => sql.exec("DELETE FROM document_acceptance_runs WHERE run_id='offline-b4-budget'")).toThrow(/FOREIGN KEY/u);
  });

  it("enforces the explicit plan, frozen digest, corpus and total in SQLite independently of the registrar", async () => {
    const sql = database().database;
    expect(sql.prepare("SELECT COUNT(*) n FROM document_acceptance_runs").get()).toEqual({ n: 0 });
    const data = enrollment(2_000_000), digest = await documentAcceptanceConfigurationDigest(config, qualification);
    const insert = sql.prepare(`INSERT INTO document_acceptance_runs(run_id,owner_id,corpus_sha256,configuration_sha256,
      approved_at,expires_at,max_requests,total_budget_micro_usd,cases_json,budget_plan) VALUES(?,?,?,?,1,2,24,?,?,?)`);
    const issue = (amount: number | null, plan: string | null, configuration = digest, corpusHash = data.corpusSha256) =>
      insert.run(data.runId, data.ownerId, corpusHash, configuration, amount, JSON.stringify(data.cases), plan);
    expect(() => issue(500_001, null)).toThrow();
    expect(() => issue(2_000_000, "unknown")).toThrow();
    expect(() => issue(2_000_000, budgetPlan, "0".repeat(64))).toThrow();
    expect(() => issue(2_000_000, budgetPlan, digest, "0".repeat(64))).toThrow();
    for (const amount of [null, 0, 1_751_040.5, 2_000_001]) expect(() => issue(amount, budgetPlan)).toThrow();
    issue(1_751_040, budgetPlan);
    expect(() => sql.exec("UPDATE document_acceptance_runs SET total_budget_micro_usd=2000000")).toThrow();
    expect(() => sql.exec("UPDATE document_acceptance_runs SET expires_at=3")).toThrow();
    expect(() => issue(2_000_000, budgetPlan)).toThrow();
  });

  it.each([
    [500_000, undefined, 6], [1_751_039, budgetPlan, 23], [1_751_040, budgetPlan, 24], [2_000_000, budgetPlan, 24],
    [1_751_039, canonicalPlan, 23], [1_751_040, canonicalPlan, 24],
  ] as const)("reserves at most %i microUSD for plan %s (%i full-price frozen cases)", async (cap, plan, count) => {
    const db = database(), data = enrollment(cap, plan);
    const qualification = data.qualification;
    db.database.exec(await renderDocumentAcceptanceEnrollment(data));
    const store = new D1DocumentJobStore(db as unknown as D1Database, () => now);
    const reservation = calculateDocumentReservation(config, qualification);
    expect(reservation).toBe(72_960);
    const gate = { runId: data.runId, configurationSha256: documentAcceptanceConfigurationDigest(config, qualification), reservationMicroUsd: reservation };
    const digest = await gate.configurationSha256;
    const configurationDigest = await documentProviderConfigurationDigest(config, reservation, data.runId, digest);
    for (let index = 0; index <= count; index++) {
      const doc = corpus.documents[index % 24]!, row = data.cases[index % 24]!, jobId = "budget-job-" + index;
      const text = normalizeDocumentText(doc.text);
      const input: DocumentProviderInput = {
        textVersionId: row.textVersionId, text, segments: [{ id: "segment-1", start: 0, end: text.length }],
        kind: doc.kind as "resume" | "jd", providerPolicyId: config.providerPolicyId, outputSchemaVersion: "2026.11.1",
        execution: { modelVersion: config.model, priceVersion: config.priceVersion, configurationDigest,
          acceptance: { runId: data.runId, configurationSha256: digest, ownerId: data.ownerId,
            documentId: row.documentId, documentVersionId: row.documentVersionId, generation: row.generation } },
      };
      await store.admit(jobId);
      expect(await store.claim(jobId, "acceptance")).toBe(true);
      expect(await store.reserveAcceptance(jobId, input, gate)).toBe(index < count);
      if (index === count) break;
      const receiptId = "offline-receipt-" + index;
      const cost = reservation / 1_000_000;
      const provider = new HttpDocumentAnalysisProvider({...config,apiKey:"local-budget-fixture-key"}, {
        qualification, now:() => new Date(now),
        fetch: async (_url,init) => init?.method === "POST"
          ? Response.json({id:receiptId,model:config.model,usage:{prompt_tokens:config.maxInputTokens,completion_tokens:config.maxOutputTokens,cost},
            choices:[{message:{content:JSON.stringify({schemaVersion:"2026.11.1",items:[],reviewPoints:[]})}}]})
          : Response.json({data:{id:receiptId,model:qualification.receiptRoute.generationModel ?? config.model,provider_name:qualification.receiptRoute.providerName,
            provider_responses:[{status:200,endpoint_id:qualification.receiptRoute.endpointId}],native_tokens_prompt:config.maxInputTokens,
            native_tokens_completion:config.maxOutputTokens,total_cost:cost}}),
      });
      const result = await provider.analyze(input,new AbortController().signal,undefined,
        (id,observed) => store.claimPaidReceipt("acceptance",data.runId,jobId,id,observed));
      expect(result).toMatchObject({kind:"received",actualMicroUsd:reservation,audit:{status:"verified"}});
      await store.finishPaidDispatch("acceptance",data.runId,jobId,result);
    }
    expect(db.database.prepare("SELECT COUNT(*) n,SUM(actual_micro_usd) spend FROM document_acceptance_dispatches WHERE state='verified'").get())
      .toEqual({ n: count, spend: count * reservation });
  });
});
