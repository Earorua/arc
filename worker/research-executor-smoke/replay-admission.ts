import { z } from "zod";
import { canonicalJson, fingerprint } from "../../app/lib/planning/fingerprint";
import { D1ResearchRepository } from "../../app/server/research/d1-repository";
import { D1SiteExecutionRepository } from "../../app/server/research/d1-site-execution-repository";
import { D1SiteBridgeRepository } from "../../app/server/research/d1-site-bridge-repository";
import { BRIDGE_AUTH_PROTOCOL } from "../../app/server/research/executor/auth";
import { parseBridgeBeginGrant } from "../../app/server/research/executor/begin";
import { matchAcceptedProof, matchBridgeMetadata, type AcceptedProof } from "../../app/server/research/executor/bridge-contract";
import { hashBridgeJob } from "../../app/server/research/executor/job";
import { parseBridgeReceiptMetadata, type BridgeReceiptMetadata } from "../../app/server/research/executor/receipt";
import type { PublicOperationScope } from "../../app/server/research/public-operation-scope";
import type { ResearchRunRecord } from "../../app/server/research/repository";
import { createGuardedD1 } from "../../app/server/research/site-bridge-factory";
import type { SiteExecutionRecord } from "../../app/server/research/site-execution-repository";
import { siteSqlNow } from "../../app/server/research/site-execution-sql";
import type { SmokeSiteEnvironment } from "./environment";
import { parseSmokeReplayRoster, smokeReplayHash, type SmokeReplayApproval } from "./replay-contract";
import { SCENARIOS, type SmokeScenario, type SmokeScenarioId } from "./scenarios";

export type SmokeReplayAdmission = Readonly<{ scenario: SmokeScenario; approval: SmokeReplayApproval;
  run: ResearchRunRecord; execution: SiteExecutionRecord; accepted: AcceptedProof; metadata: BridgeReceiptMetadata }>;
const time = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const proofSchema = z.object({
  receiptHash: z.string().regex(/^[0-9a-f]{64}$/u),
  metadataJson: z.string().refine(value => new TextEncoder().encode(value).byteLength <= 4096),
  packageExpiresAt: time, acceptedAt: time, beganAt: time, executionExpiresAt: time,
  scenarios: z.literal(1), runs: z.literal(1), executions: z.literal(1), imports: z.literal(1),
  packages: z.literal(1), acceptances: z.literal(1), quotaRows: z.literal(2),
  quotaReserved: z.literal(1), quotaAccepted: z.literal(1), budgets: z.literal(1), audits: z.literal(1),
}).strict();

// Replay-specific SELECT: only metadata, identity/time scalars and exact effect counts.
// This proves current Site state; operator evidence independently attributes native Cron/Workflow effects.
const currentProofSql = `SELECT i.receipt_hash AS receiptHash,i.receipt_metadata_json AS metadataJson,
  p.expires_at AS packageExpiresAt,a.workflow_accepted_at AS acceptedAt,
  e.began_at AS beganAt,e.execution_expires_at AS executionExpiresAt,
  (SELECT count(*) FROM smoke_scenarios WHERE scenario_id=?1 OR job_id=?2 OR owner_id=?3
    OR mutation_id=?4 OR request_id=?5) AS scenarios,
  (SELECT count(*) FROM research_runs WHERE id=?6 OR (user_id=?3 AND (mutation_id=?4 OR request_id=?5))) AS runs,
  (SELECT count(*) FROM research_site_executions WHERE job_id=?2 OR run_id=?6
    OR (user_id=?3 AND request_id=?5)) AS executions,
  (SELECT count(*) FROM research_site_imports WHERE job_id=?2 OR run_id=?6
    OR (user_id=?3 AND request_id=?5)) AS imports,
  (SELECT count(*) FROM research_packages WHERE id=?8 OR (normalized_role_key=r.normalized_role_key
    AND locale=r.locale AND config_fingerprint=r.config_fingerprint)) AS packages,
  (SELECT count(*) FROM research_site_acceptances WHERE job_id=?2) AS acceptances,
  (SELECT count(*) FROM quota_ledger WHERE reservation_id=e.quota_reservation_id
    OR (user_id=?3 AND idempotency_key=e.quota_key)) AS quotaRows,
  (SELECT count(*) FROM quota_ledger WHERE reservation_id=e.quota_reservation_id
    AND user_id=?3 AND idempotency_key=e.quota_key AND purpose='role-research'
    AND entry_kind='reserved' AND units=1) AS quotaReserved,
  (SELECT count(*) FROM quota_ledger WHERE reservation_id=e.quota_reservation_id
    AND user_id=?3 AND idempotency_key=e.quota_key AND purpose='role-research'
    AND entry_kind='accepted' AND units=1) AS quotaAccepted,
  (SELECT count(*) FROM ai_budget_reservations WHERE run_id=?6 OR request_id=?5 OR id=e.budget_reservation_id) AS budgets,
  (SELECT count(*) FROM ai_runs WHERE user_id=?3 AND request_id=json_extract(i.audit_json,'$.requestId')) AS audits
  FROM smoke_scenarios s
  JOIN research_site_executions e ON e.job_id=s.job_id AND e.user_id=s.owner_id AND e.request_id=s.request_id
  JOIN research_runs r ON r.id=e.run_id AND r.user_id=e.user_id AND r.request_id=e.request_id AND r.mutation_id=s.mutation_id
  JOIN research_site_imports i ON i.job_id=e.job_id AND i.run_id=r.id AND i.user_id=r.user_id
    AND i.request_id=e.request_id AND i.request_hash=e.request_hash AND i.config_fingerprint=r.config_fingerprint
  JOIN research_packages p ON p.id=r.package_id AND p.normalized_role_key=r.normalized_role_key
    AND p.locale=r.locale AND p.config_fingerprint=r.config_fingerprint
  JOIN research_site_acceptances a ON a.job_id=e.job_id AND a.request_hash=e.request_hash AND a.workflow_id=e.job_id
  JOIN ai_budget_reservations b ON b.id=e.budget_reservation_id AND b.run_id=r.id AND b.request_id=e.request_id
  JOIN ai_runs audit ON audit.user_id=r.user_id AND audit.request_id=json_extract(i.audit_json,'$.requestId')
    AND audit.purpose='role-research' AND audit.status='accepted'
  WHERE s.scenario_id=?1 AND s.job_id=?2 AND s.owner_id=?3 AND s.mutation_id=?4 AND s.request_id=?5
    AND r.id=?6 AND e.request_hash=?7 AND r.package_id=?8 AND e.job_json=?10 AND r.state_version=?11
    AND r.execution_mode='cloudflare-workflow-v1' AND r.remote_quota_key=e.quota_key AND r.retry_of_run_id IS NULL
    AND r.state='ready' AND r.active_slot IS NULL AND r.active_expires_at IS NULL
    AND e.admission_state='admitted' AND e.closed_at IS NULL AND e.close_reason IS NULL
    AND i.phase=5 AND json_extract(i.resolution_json,'$.state')='ready'
    AND json_extract(i.resolution_json,'$.packageId')=p.id
    AND json_extract(i.resolution_json,'$.runVersion')=r.state_version
    AND json_extract(i.resolution_json,'$.quotaStatus')='accepted'
    AND p.expires_at>?9 AND p.expires_at>${siteSqlNow}
    AND b.status='settled' AND b.settled_micros=1`;

function unavailable(): never { throw new Error("Smoke unavailable"); }

export async function requireSmokeReplayAdmission({ environment, scenarioId, scope }: {
  environment: SmokeSiteEnvironment; scenarioId: SmokeScenarioId; scope: PublicOperationScope;
}): Promise<SmokeReplayAdmission> {
  try {
    scope.ensure();
    // Parse and select approvals before even obtaining a database or constructing repositories.
    const roster = parseSmokeReplayRoster(environment.SMOKE_REPLAY_APPROVAL_JSON, environment.SMOKE_REPLAY_INVENTORY_SHA256);
    const approval = roster.scenarios.find(value => value.scenarioId === scenarioId);
    const scenario = SCENARIOS.find(value => value.id === scenarioId);
    if (!approval || !scenario) unavailable();
    const db = createGuardedD1(environment.SMOKE_SITE_DB, scope.ensure);
    const research = new D1ResearchRepository(db);
    const executions = new D1SiteExecutionRepository(db, research);
    const bridge = new D1SiteBridgeRepository(db, research, executions);
    const run = await scope.run(() => research.findRecoveryRun({ ownerId: scenario.ownerId, mutationId: scenario.mutationId,
      normalizedRoleKey: scenario.role.toLowerCase(), locale: scenario.locale,
      inputFingerprint: fingerprint([scenario.role.toLowerCase(), scenario.locale]), retryOfRunId: null }));
    if (!run || run.ownerId !== scenario.ownerId || run.mutationId !== scenario.mutationId || run.requestId !== scenario.requestId
      || run.rawRole !== scenario.role || run.retryOfRunId !== null || run.executionMode !== "cloudflare-workflow-v1"
      || run.state !== "ready" || run.activeExpiresAt !== null || !run.packageId) unavailable();
    const execution = await scope.run(() => executions.read(scenario.ownerId, run.id));
    if (!execution || execution.ownerId !== scenario.ownerId || execution.runId !== run.id
      || execution.requestId !== scenario.requestId || execution.jobId !== scenario.jobId
      || execution.requestHash !== approval.requestHash || run.remoteQuotaKey !== execution.quotaKey
      || execution.admissionState !== "admitted" || execution.closedAt !== null || execution.closeReason !== null) unavailable();
    const storedAccepted = await scope.run(() => bridge.readAcceptance(execution));
    if (!storedAccepted) unavailable();
    const accepted = await scope.run(() => matchAcceptedProof(storedAccepted, execution.job));
    const requestHash = await scope.run(() => hashBridgeJob(execution.job));
    const grant = parseBridgeBeginGrant({ protocol: BRIDGE_AUTH_PROTOCOL, jobId: execution.jobId, requestHash,
      beganAt: execution.beganAt, executionExpiresAt: execution.executionExpiresAt });
    if (requestHash !== execution.requestHash || requestHash !== approval.requestHash
      || accepted.workflowAcceptedAt !== approval.acceptedAt || accepted.workflowAcceptedAt < execution.job.createdAt
      || grant.beganAt !== approval.beganAt || grant.executionExpiresAt !== approval.executionExpiresAt) unavailable();
    const proof = proofSchema.parse(await scope.run(() => db.prepare(currentProofSql).bind(scenario.id, scenario.jobId,
      scenario.ownerId, scenario.mutationId, scenario.requestId, run.id, execution.requestHash, run.packageId,
      Date.now(), canonicalJson(execution.job), run.stateVersion).first()));
    const metadata = parseBridgeReceiptMetadata(JSON.parse(proof.metadataJson));
    await scope.run(() => matchBridgeMetadata(metadata, execution.job));
    if (canonicalJson(metadata.grant) !== canonicalJson(grant) || metadata.receiptHash !== proof.receiptHash
      || proof.receiptHash !== approval.receiptHash || proof.acceptedAt !== approval.acceptedAt
      || proof.beganAt !== approval.beganAt || proof.executionExpiresAt !== approval.executionExpiresAt) unavailable();
    const metadataHash = await scope.run(() => smokeReplayHash(canonicalJson(metadata)));
    const runHash = await scope.run(() => smokeReplayHash(run.id));
    const packageHash = await scope.run(() => smokeReplayHash(run.packageId!));
    if (metadataHash !== approval.receiptMetadataSha256 || runHash !== approval.runHash
      || packageHash !== approval.packageHash || proof.packageExpiresAt <= Date.now()) unavailable();
    scope.ensure();
    return Object.freeze({ scenario, approval, run, execution, accepted, metadata });
  } catch { return unavailable(); }
}
