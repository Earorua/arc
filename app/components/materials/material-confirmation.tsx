import { useState } from "react";
import { MATERIAL_HIGH_IMPACT_REVIEW_CODES, MAX_MATERIAL_SKILL_LABELS_PER_ITEM, isSourceLinkedMaterialReviewProjection, type ConfirmedMaterialItem, type DocumentReviewDraft, type MaterialReviewPoint } from "../../contracts/documents";
import type { DocumentEndpointRequest } from "../../contracts/documents-api";
import type { SkillSelfLevel } from "../../contracts/planning";
import { findReviewedSourceTerm, labelForAddedSourceTerm, supportsReviewedSkillLabel, retainedMaterialSelfAssessmentHints } from "../../lib/materials/skill-labels";
const hintLabels = { conceptual: "了解概念", guided: "需指导完成", uncertain: "不确定" };
const reviewLabels: Record<string, string> = { "confirm-self-assessment": "请单独确认能力自评", "prompt-injection": "原文包含指令，请核对并忽略其操作要求", "team-attribution": "团队成果不直接等于个人独立能力", "conflicting-self-assessment": "能力表述存在冲突", "conflicting-requirement": "岗位要求分类存在冲突", "missing-information": "信息缺失或待确认", "uncovered-skill": "可能超出当前技能蓝图", "untrusted-resource-url": "原文链接不会作为受信课程采用" };

function AddSourceTerm({ item, index, quote, projection, saving, onAdd }: { item: ConfirmedMaterialItem; index: number; quote: string;
  projection: DocumentReviewDraft["reviewProjection"]; saving: boolean;
  onAdd(sourceTerm: string, label: string): void }) {
  const [term, setTerm] = useState("");
  const words = item.skillLabels ?? [];
  const label = term.trim() ? labelForAddedSourceTerm(quote, item.text, term, projection) : null;
  const ready = label !== null && !words.includes(label) && words.length < MAX_MATERIAL_SKILL_LABELS_PER_ITEM;
  const noun = item.kind === "constraint" ? "约束主题" : "技能词";
  return <details><summary>从原文补充{noun}</summary><blockquote>{quote}</blockquote>
    <label>填写原文中的词<input aria-label={`事实 ${index + 1} 原文词`} maxLength={100} value={term}
      onChange={event => setTerm(event.target.value)} /></label>
    {term.trim() && !label && <p>请填写这段原文中的一个词，并保留它在当前事实中的含义。</p>}
    {label && label !== term.trim() && <p>规范名称 {label}</p>}
    {label && words.includes(label) && <p>此词已在列表中。</p>}
    {words.length >= MAX_MATERIAL_SKILL_LABELS_PER_ITEM && <p>每项事实至多保留八个词，可以先移除一个。</p>}
    <button type="button" className="text-action" disabled={saving || !ready} onClick={() => {
      if (label && ready && !saving) { onAdd(term.trim(), label); setTerm(""); }
    }}>补充{noun}</button>
  </details>;
}

export function MaterialConfirmation({ draft, text, saving, confirmed, onItemsChange, onReviewPointsChange, onConfirm, skills = [], onAdoptLevels, documentKind = "resume" }: {
  draft: DocumentReviewDraft; text: string; saving: boolean; confirmed: boolean;
  onItemsChange(items: ConfirmedMaterialItem[], addition?: DocumentEndpointRequest<"saveDocumentReviewDraft">["skillTermAddition"]): void; onConfirm(): void;
  onReviewPointsChange?: (points: MaterialReviewPoint[]) => void;
  documentKind?: "resume" | "jd" | "supplement";
  skills?: readonly { id: string; name: string }[]; onAdoptLevels?: (levels: Record<string, SkillSelfLevel>) => void;
}) {
  const isMainJd = documentKind === "jd";
  const conflicts = isMainJd ? draft.items.filter(item => item.kind === "requirement" && item.requirementLevel === "unspecified") : [];
  const hints = retainedMaterialSelfAssessmentHints(draft.items, draft.selfAssessmentHints, draft.reviewProjection);
  const unresolved = (draft.reviewPoints ?? []).filter(point => point.resolution === "unresolved" && (MATERIAL_HIGH_IMPACT_REVIEW_CODES as readonly string[]).includes(point.code));
  return <div className="material-review">
    <h3>核对资料事实</h3><p>修改或移除不准确的内容。确认事实不会自动修改能力自评。</p>
    {(draft.reviewPoints?.length ?? 0) > 0 && <section className="material-review-points"><h4>重点核对</h4>
      {unresolved.length > 0 && <p role="alert">还有 {unresolved.length} 项重点提醒需要处理。</p>}
      {draft.reviewPoints!.map(point => {
        const label = isSourceLinkedMaterialReviewProjection(draft.reviewProjection) && point.code === "uncovered-skill" ? "原文提到课程覆盖缺口，请核对"
          : !isMainJd && point.code === "conflicting-requirement" ? "建议或学习要求分类存在冲突" : reviewLabels[point.code];
        return <fieldset key={point.id}><legend>{label ?? "请核对原文"}</legend>
        <blockquote>{text.slice(point.sourceRef.start, point.sourceRef.end)}</blockquote>
        <label>处理结果<select aria-label={label ?? point.code} disabled={saving || !onReviewPointsChange} value={point.resolution}
          onChange={event => onReviewPointsChange?.(draft.reviewPoints!.map(item => item.id === point.id ? { ...item, resolution: event.target.value as MaterialReviewPoint["resolution"] } : item))}>
          <option value="unresolved">待核对</option><option value="confirmed">已核对，保留相关事实</option><option value="ignored">已核对，忽略这项提醒</option>
        </select></label>
        </fieldset>;
      })}</section>}
    {conflicts.length > 0 && <p role="alert">有 {conflicts.length} 项岗位要求尚未区分必备或加分，请明确分类，或移除后再确认。</p>}
    {draft.items.map((item, index) => {
      const quote = item.sourceRef ? text.slice(item.sourceRef.start, item.sourceRef.end) : null;
      return <fieldset key={item.id} className="material-fact"><legend>事实 {index + 1}</legend>
      <label>信息类型<select aria-label={`事实 ${index + 1} 信息类型`} value={item.kind} onChange={event => onItemsChange(draft.items.map(row => row.id === item.id ? {
        ...row, kind: event.target.value as ConfirmedMaterialItem["kind"], origin: "user", skillLabels: row.skillLabels ? [] : undefined,
        requirementLevel: event.target.value === "requirement" ? row.requirementLevel ?? "unspecified" : null,
      } : row))}><option value="experience">经历</option><option value="skill-claim">技能描述</option><option value="requirement">{isMainJd ? "岗位要求" : "建议或学习要求"}</option><option value="constraint">其他约束</option></select></label>
      <label>内容<textarea aria-label={`事实 ${index + 1}`} value={item.text} maxLength={1000} onChange={event => onItemsChange(draft.items.map(row => row.id === item.id ? {
        ...row, text: event.target.value, origin: "user", skillLabels: row.skillLabels?.filter(label => supportsReviewedSkillLabel(event.target.value, label, draft.reviewProjection))
      } : row))} /></label>
      {quote !== null && <details><summary>查看原文依据</summary><blockquote>{quote}</blockquote></details>}
      {Boolean(item.skillLabels?.length) && <div><p>{item.kind === "constraint" ? "约束中提到的主题" : "随事实确认的技能词"}</p><ul>{item.skillLabels!.map(label => {
        const evidence = isSourceLinkedMaterialReviewProjection(draft.reviewProjection) && quote ? findReviewedSourceTerm(quote, label, draft.reviewProjection) : null;
        const sourceTerm = evidence ?? label;
        return <li key={label}>{sourceTerm} {sourceTerm !== label && <small>（规范名称 {label}） </small>}
          <button type="button" className="text-action" aria-label={`移除${item.kind === "constraint" ? "约束主题" : "技能词"} ${sourceTerm}`} onClick={() => onItemsChange(draft.items.map(row =>
            row.id === item.id ? { ...row, skillLabels: row.skillLabels!.filter(word => word !== label) } : row))}>移除</button>
        </li>;
      })}</ul></div>}
      {isSourceLinkedMaterialReviewProjection(draft.reviewProjection) && quote && !draft.reclassifiedItemIds?.includes(item.id) && <AddSourceTerm item={item} index={index} quote={quote} projection={draft.reviewProjection} saving={saving}
        onAdd={(sourceTerm, label) => onItemsChange(draft.items.map(row => row.id === item.id
          ? { ...row, origin: "user", skillLabels: [...row.skillLabels ?? [], label] } : row), { itemId: item.id, sourceTerm })} />}
      {item.kind === "requirement" && (isMainJd
        ? <label>要求类型<select aria-label={`事实 ${index + 1} 要求类型`} value={item.requirementLevel ?? "unspecified"} onChange={event => onItemsChange(draft.items.map(row => row.id === item.id ? { ...row, origin: "user", requirementLevel: event.target.value as "must" | "preferred" | "unspecified" } : row))}><option value="unspecified">需要核对</option><option value="must">必备</option><option value="preferred">加分</option></select></label>
        : <p>这条建议或学习要求可在路线预览中单独采用为本轮学习重点。</p>)}
      <button type="button" className="text-action" onClick={() => onItemsChange(draft.items.filter(row => row.id !== item.id))}>移除事实 {index + 1}</button>
      </fieldset>;
    })}
    <button type="button" className="text-action" disabled={draft.items.length >= 100} onClick={() => onItemsChange([...draft.items, { id: `item-${crypto.randomUUID()}`, kind: documentKind === "jd" ? "requirement" : "skill-claim", text: "请填写需要确认的事实", origin: "user", sourceRef: null, requirementLevel: documentKind === "jd" ? "unspecified" : null }])}>添加事实</button>
    <div className="material-actions"><button type="button" disabled={saving || !draft.items.length || draft.items.some(item => !item.text.trim()) || conflicts.length > 0 || unresolved.length > 0} onClick={onConfirm}>确认这些事实</button><span role="status">{saving ? "正在保存核对修改…" : confirmed ? "已确认，可用于本次规划。" : "修改保存在你的私人核对草稿中。"}</span></div>
    {onAdoptLevels && hints.length > 0 && <section className="material-self-assessment"><h3>单独核对能力建议</h3><p>已有自评保持不变，只有你点击采用才更新。没有提及的技能不自动改变。</p>{hints.map(hint => {
      const candidates = skills.filter(skill => [skill.id, skill.name].some(name => name.toLocaleLowerCase() === hint.skillLabel.toLocaleLowerCase()));
      return <div key={hint.id}><span>{hint.skillLabel} · {hintLabels[hint.level]}</span>{candidates.length === 1 ? <button type="button" className="text-action" onClick={() => onAdoptLevels({ [candidates[0]!.id]: hint.level })}>采用 {hint.skillLabel} 的{hintLabels[hint.level]}建议</button> : <p>请在下方已有技能中逐项核对这一建议。</p>}</div>;
    })}</section>}
  </div>;
}
