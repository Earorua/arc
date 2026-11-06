"use client";
import { useEffect, useState } from "react";
import type { MaterialHistoryResponse } from "../../contracts/material-planning";
import { DocumentClientError, documentsClient, type DocumentsClient } from "../../lib/documents-client";

type HistoryPlan = MaterialHistoryResponse["plans"][number];
const proposalLabels = { pending: "待确认调整", discarded: "已放弃调整", revoked: "已失效提议", unknown: "历史提议（结果未记录）" };
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
  if (failed) return <p>私人资料依据暂不可读，已保存的路线仍可查看。</p>;
  const plans = new Map<string, HistoryPlan>();
  for (const plan of history?.plans ?? []) {
    if (planVersionId && plan.planVersionId !== planVersionId) continue;
    const key = pairKey(plan);
    // Older servers may return both the initial proposal and its accepted usage.
    if (!plans.has(key) || plan.kind === "accepted") plans.set(key, plan);
  }
  if (!plans.size) return null;
  return <section className="material-history"><h3>资料辅助规划依据</h3>{[...plans].map(([key, plan]) => <details key={key}>
    <summary>{plan.kind === "accepted" ? "已接受调整" : plan.kind === "generation" ? "保存时的依据" : proposalLabels[plan.proposalState ?? "unknown"]}{plan.sourceAvailability === "unavailable" ? " · 来源已不可用" : ""}</summary>
    <ul>{plan.explanations.map((item, index) => <li key={`${item.ruleId}:${index}`}>{item.message}</li>)}</ul>
  </details>)}<p>依据只供查阅；不会重新启用已撤销的资料或改变当前计划。</p></section>;
}
