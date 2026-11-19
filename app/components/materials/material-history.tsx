"use client";
import { useEffect, useState } from "react";
import type { MaterialHistoryResponse } from "../../contracts/material-planning";
import { DocumentClientError, documentsClient, type DocumentsClient } from "../../lib/documents-client";

type HistoryPlan = MaterialHistoryResponse["plans"][number];
const proposalLabels = { pending: "Changes awaiting confirmation", discarded: "Discarded changes", revoked: "Invalidated proposal", unknown: "Historical proposal (outcome not recorded)" };
const pairKey = (plan: HistoryPlan) => `${plan.planVersionId}:${plan.contextVersionId}`;
async function loadHistory(client: DocumentsClient, goalId: string, signal: AbortSignal) {
  try { return await client.request("readMaterialHistory", { goalId, includeProposalState: "current" }, signal); }
  catch (error) {
    if (signal.aborted || !(error instanceof DocumentClientError) || error.code !== "invalid-request" || error.status !== 400) throw error;
    return client.request("readMaterialHistory", { goalId }, signal);
  }
}

export function MaterialHistory(props: { ownerId: string; goalId: string; planVersionId?: string; client?: DocumentsClient }) {
  return <OwnedMaterialHistory key={`${props.ownerId}:${props.goalId}:${props.planVersionId ?? "all"}`} {...props} />;
}
function OwnedMaterialHistory({ goalId, planVersionId, client = documentsClient }: { goalId: string; planVersionId?: string; client?: DocumentsClient }) {
  const [history, setHistory] = useState<MaterialHistoryResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void loadHistory(client, goalId, controller.signal).then(value => { if (!controller.signal.aborted) setHistory(value); }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [client, goalId]);
  if (failed) return <p>Private material evidence is temporarily unavailable. Your saved path remains accessible.</p>;
  const plans = new Map<string, HistoryPlan>();
  for (const plan of history?.plans ?? []) {
    if (planVersionId && plan.planVersionId !== planVersionId) continue;
    const key = pairKey(plan);
    // Older servers may return both the initial proposal and its accepted usage.
    if (!plans.has(key) || plan.kind === "accepted") plans.set(key, plan);
  }
  if (!plans.size) return null;
  return <section className="material-history"><h3>Material planning evidence</h3>{[...plans].map(([key, plan]) => <details key={key}>
    <summary>{plan.kind === "accepted" ? "Accepted changes" : plan.kind === "generation" ? "Evidence when saved" : proposalLabels[plan.proposalState ?? "unknown"]}{plan.sourceAvailability === "unavailable" ? " · Source no longer available" : ""}</summary>
    <ul>{plan.explanations.map((item, index) => <li key={`${item.ruleId}:${index}`}>{item.message}</li>)}</ul>
  </details>)}<p>Evidence is read-only. Viewing it does not reactivate revoked materials or change your current plan.</p></section>;
}
