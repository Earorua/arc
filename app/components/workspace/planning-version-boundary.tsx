"use client";

import { useState } from "react";

export function PlanningVersionBoundary() {
  return (
    <section className="planning-version-recovery" role="alert">
      <p className="section-index">暂时无法读取这个计划</p>
      <h2>计划使用的内容版本暂不可用</h2>
      <p>原有计划与学习记录已保留，没有发生更改。</p>
      <p>当前暂不支持自动转换这个版本，请稍后再试。</p>
    </section>
  );
}

export function PlanningLoadBoundary({ loading, onRetry }: { loading: boolean; onRetry: () => Promise<void> }) {
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try { await onRetry(); }
    catch { /* The controller owns the private-safe recovery state. */ }
    finally { setRetrying(false); }
  };

  return (
    <section className="planning-version-recovery" role={loading ? "status" : "alert"}>
      <p className="section-index">{loading ? "正在读取学习计划" : "学习计划暂不可用"}</p>
      <h2>{loading ? "正在确认你上次的学习进度" : "暂时无法确认已保存的学习计划"}</h2>
      <p>确认计划后即可继续学习，原有记录会保留。</p>
      {!loading && <button disabled={retrying} onClick={() => void retry()} type="button">{retrying ? "正在重试…" : "重新读取计划"}</button>}
    </section>
  );
}
