import type { DocumentEndpointResponse } from "../../contracts/documents-api";
const labels = { queued: "已授权，等待后台串行分析。", running: "正在分析，关闭页面后仍会继续。", succeeded: "AI 已完成，请核对预填结果。", failed: "分析未完成，已保存资料仍可手动整理。", "cancel-requested": "已请求取消，已发送的处理可能仍会返回。", cancelled: "已取消，可手动继续。", revoked: "分析授权已撤销。", "cost-unknown": "费用结果尚未确认，不会自动重新发送；可手动继续。" };
export function MaterialJobStatus({ job, onCancel }: { job: DocumentEndpointResponse<"readDocumentJob">; onCancel?: () => void }) {
  return <div className="material-job" role="status"><p>{labels[job.state]}</p>{job.costState === "held-unknown" && job.state !== "cost-unknown" && <p>本次费用尚未确认，后续分析暂缓。</p>}{onCancel && ["queued", "running"].includes(job.state) && <button type="button" className="text-action" onClick={onCancel}>取消分析</button>}</div>;
}
