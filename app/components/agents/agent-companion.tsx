"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentLearningContext, AgentWorkspace, PublicAgentRun } from "../../contracts/agents";
import { completedTutorHistory, useLearningAgents, type CompanionView } from "./agent-context";

export function CompanionAvatar({ thinking = false }: { thinking?: boolean }) {
  return <svg viewBox="0 0 88 94" fill="none" aria-hidden="true" className={thinking ? "companion-avatar is-thinking" : "companion-avatar"}>
    <ellipse cx="44" cy="86" rx="25" ry="4" fill="#171715" opacity=".1" />
    <g className="companion-body">
      <path d="M25 22C25 12 34 7 44 7C54 7 63 12 63 22V30C75 37 78 50 74 65C71 77 61 81 44 81C27 81 17 77 14 65C10 50 13 37 25 30V22Z" fill="#F5EEE0" stroke="#292822" strokeWidth="2.5" />
      <path d="M30 19C36 13 51 13 57 19" stroke="#F0643E" strokeWidth="6" strokeLinecap="round" />
      <path d="M15 51L8 56M73 51L80 56" stroke="#292822" strokeWidth="3" strokeLinecap="round" />
      <g className="companion-eyes"><ellipse cx="33" cy="46" rx="3" ry="5" fill="#292822" /><ellipse cx="55" cy="46" rx="3" ry="5" fill="#292822" /></g>
      <path d="M39 58Q44 63 49 58" stroke="#292822" strokeWidth="2" strokeLinecap="round" />
      <circle cx="25" cy="55" r="4" fill="#F0643E" opacity=".35" /><circle cx="63" cy="55" r="4" fill="#F0643E" opacity=".35" />
    </g>
  </svg>;
}
export function AnswerText({ text }: { text: string }) {
  return <div className="agent-answer">{text.split(/(```[\s\S]*?```)/g).map((part, index) =>
    part.startsWith("```") ? <pre key={index}><code>{part.replace(/^```[^\n]*\n?/, "").replace(/```$/, "")}</code></pre>
      : <p key={index}>{part.split(/(\*\*[^*]+\*\*)/g).map((token, i) => token.startsWith("**")
        ? <strong key={i}>{token.slice(2, -2)}</strong> : token)}</p>)}</div>;
}
type CompanionProps = {
  view: CompanionView; onView(view: CompanionView): void; messages: PublicAgentRun[];
  draft: string; onDraft(value: string): void; onSend(): void; onStop(): void;
  onHandoff(value: string): void; busy: boolean; partial: string; error: string | null;
  pendingQuestion?: string | null; task: string | null; enabled: boolean; reason: string | null;
  learningContext?: AgentLearningContext; roleName?: string; availability?: AgentWorkspace["availability"];
  loading?: boolean; onRefresh?(): void;
  deep: boolean; onDeep(value: boolean): void; reducedMotion: boolean; onReducedMotion(value: boolean): void;
};
function safeResourceUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function CompanionLearningContext({ context, roleName }: { context: AgentLearningContext; roleName?: string }) {
  const resources = context.task ? context.resources.flatMap(resource => {
    const href = safeResourceUrl(resource.url);
    return href ? [{ ...resource, href }] : [];
  }) : [];
  const noTask = context.totalUnits > 0 && context.completedUnits >= context.totalUnits
    ? "这条路线的任务已完成" : "今日暂无待学任务";
  return <details className="companion-context">
    <summary>
      <span className="companion-context-heading"><strong>{roleName || "当前学习路线"}</strong><span>路线与资料</span></span>
      <span className="companion-current-task">{context.task ? <><span>当前任务</span><strong>{context.task.title}</strong></> : <strong>{noTask}</strong>}</span>
    </summary>
    <div className="companion-context-details">
      <p className="companion-context-meta"><span>{context.source === "research" ? "Research 路线" : "内置路线"}</span><span>已完成 {context.completedUnits} / {context.totalUnits} 项</span></p>
      {context.task ? <p className="companion-context-date">任务计划日期：<time dateTime={context.task.scheduledDate}>{context.task.scheduledDate}</time></p>
        : <p className="companion-context-date">仍可围绕现有路线和已学内容提问。</p>}
      {resources.length > 0 && <ul className="companion-resources" aria-label="当前任务资料">{resources.map(resource =>
        <li key={resource.id}><a href={resource.href} target="_blank" rel="noopener noreferrer">
          <span>{resource.title} ↗</span><small>{resource.provider}</small>
        </a></li>)}</ul>}
    </div>
  </details>;
}
export function CompanionPanel(props: CompanionProps) {
  const input = useRef<HTMLTextAreaElement>(null), end = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const [wide, setWide] = useState(false);
  const availability = props.availability ?? (props.enabled ? "ready" : "disabled");
  const canReply = props.enabled && availability === "ready" && !props.loading;
  const readError = Boolean(props.error && !props.enabled && !props.learningContext);
  const status = props.loading ? "loading" : props.error ? "error" : props.busy ? "replying" : availability;
  const statusText = props.loading ? "正在读取学习进度…" : props.error ? (readError ? "暂时无法读取进度" : "回复未完成，可重试")
    : props.busy ? "正在回复…" : availability === "needs_setup" ? "尚未建立学习路线"
      : availability === "disabled" ? "AI 答疑未启用" : "一起弄懂每一步";
  const showContext = !props.loading && !readError && availability !== "needs_setup";
  const task = showContext ? (props.learningContext ? props.learningContext.task?.title : props.task) : null;
  const suggestions = task ? ["解释当前任务", "给我一个例子", "帮我拆解任务"] : ["帮我梳理学习思路", "给我一个例子", "帮我复习已学内容"];
  const submit = () => { if (canReply && !props.busy && props.draft.trim()) props.onSend(); };
  useEffect(() => { if (props.view === "chat") input.current?.focus(); }, [props.view]);
  useEffect(() => { if (props.view === "chat") end.current?.scrollIntoView?.({ block: "nearest" }); }, [props.messages, props.partial, props.view]);
  const minimize = () => { props.onView("pet"); requestAnimationFrame(() => launcher.current?.focus()); };
  if (props.view === "hidden") return <button className="companion-restore" onClick={() => props.onView("pet")} aria-label="重新显示学习伙伴">学习伙伴 ↗</button>;
  return <aside className={`companion-root ${props.reducedMotion ? "without-motion" : ""}`} aria-label="学习伙伴">
    {props.view === "chat" && <section className={`companion-panel ${wide ? "is-wide" : ""}`} role="dialog" aria-modal="false" aria-labelledby="companion-title"
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); minimize(); } }}>
      <header className="companion-heading">
        <div><span className={`companion-status-dot is-${status}`} aria-hidden="true" /><strong id="companion-title">学习伙伴</strong><small>{statusText}</small></div>
        <div className="companion-window-actions">
          <button type="button" onClick={() => setWide(!wide)} aria-label={wide ? "缩小聊天框" : "扩大聊天框"}>{wide ? "↙" : "↗"}</button>
          <button type="button" onClick={minimize} aria-label="最小化学习伙伴">−</button>
        </div>
      </header>
      <div className="companion-content">
      {showContext && (props.learningContext ? <CompanionLearningContext context={props.learningContext} roleName={props.roleName} />
        : props.task && <div className="companion-task"><span>正在参考</span><strong>{props.task}</strong></div>)}
      <div className="companion-messages" role="log" aria-label="答疑记录" aria-live="polite" aria-relevant="additions">
        {props.messages.length === 0 && !props.pendingQuestion && <div className="companion-empty">
          <CompanionAvatar /><h2>卡住的地方，<br />我们一起拆开看。</h2><p>概念、练习，或学习的下一步。<br />随时把问题交给我。</p>
        </div>}
        {props.messages.map(message => <div className="companion-turn" key={message.id}>
          <p className="companion-question">{message.message}</p>
          {message.answer ? <AnswerText text={message.answer} /> : <p className="companion-message-state">{message.error ?? "这条消息正在处理…"}</p>}
          {message.status === "complete" && <button className="companion-handoff" type="button"
            onClick={() => props.onHandoff(`学习中遇到的问题：${message.message}\n答疑摘要：${message.answer.slice(0, 1200)}\n请据此检查并优化我的学习路线。`)}>交给规划师 ↗</button>}
        </div>)}
        {props.pendingQuestion && <div className="companion-turn"><p className="companion-question">{props.pendingQuestion}</p>
          {props.partial ? <AnswerText text={props.partial} /> : props.busy && <p className="companion-thinking">正在整理思路<span>…</span></p>}</div>}
        <div ref={end} />
      </div>
      </div>
      {!props.loading && !props.error && availability === "needs_setup" && <p className="companion-notice">先建立学习路线，伙伴就能结合你的任务答疑。 <Link href="/setup">学习设置 ↗</Link></p>}
      {!props.loading && !props.error && availability === "disabled" && <p className="companion-notice">AI 答疑尚未启用，学习路线和资料仍可查看</p>}
      {!props.loading && props.error && <p className="companion-error" role="alert">{props.error}
        {readError && props.onRefresh && <button type="button" onClick={props.onRefresh}>重新读取</button>}</p>}
      <div className="companion-suggestions">{suggestions.map(text =>
        <button key={text} type="button" disabled={props.busy} onClick={() => { props.onDraft(text); input.current?.focus(); }}>{text}</button>)}</div>
      <form className="companion-composer" onSubmit={event => { event.preventDefault(); submit(); }}>
        <textarea ref={input} aria-label="向学习伙伴提问" placeholder="从哪里开始不太明白？" rows={2} maxLength={6000}
          value={props.draft} onChange={event => props.onDraft(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
        <div className="companion-compose-actions"><label><input type="checkbox" checked={props.deep} onChange={event => props.onDeep(event.target.checked)} />深入讲解</label>
          {props.busy ? <button type="button" className="companion-send" onClick={props.onStop}>停止回复</button>
            : <button type="submit" className="companion-send" aria-label="发送消息" disabled={!canReply || !props.draft.trim()}>发送 ↑</button>}</div>
      </form>
      <footer className="companion-footer">
        <label><input type="checkbox" checked={props.reducedMotion} onChange={event => props.onReducedMotion(event.target.checked)} />减少动效</label>
        <button type="button" onClick={() => props.onView("hidden")}>隐藏伙伴</button><Link href="/coach">学习规划师 ↗</Link>
      </footer>
    </section>}
    <button ref={launcher} type="button" className="companion-launcher" onClick={() => props.onView(props.view === "chat" ? "pet" : "chat")}
      aria-label={props.view === "chat" ? "收起学习伙伴" : "打开学习伙伴"} aria-expanded={props.view === "chat"}>
      <CompanionAvatar thinking={props.busy} />
      {props.view === "pet" && <span>{props.busy ? "正在回复…" : "有问题，随时找我"}</span>}
    </button>
  </aside>;
}
export function AgentCompanion() {
  const state = useLearningAgents(); const router = useRouter();
  if (!state.authenticated || state.authPending) return null;
  return <CompanionPanel view={state.view} onView={state.setView} messages={completedTutorHistory(state.workspace)}
    draft={state.draft} onDraft={state.setDraft} onSend={() => void state.send()} onStop={state.stop}
    busy={state.busy} partial={state.partial} pendingQuestion={state.pendingQuestion}
    error={state.error} task={state.workspace?.currentTask ?? null}
    enabled={Boolean(state.workspace?.enabled && state.workspace.authenticated && state.workspace.goalId)}
    reason={state.workspace?.reason ?? null} loading={state.loading} onRefresh={() => void state.refresh()}
    learningContext={state.workspace?.learningContext} roleName={state.workspace?.roleName}
    availability={state.workspace?.availability ?? (state.workspace && !state.workspace.goalId ? "needs_setup" : undefined)}
    deep={state.deep} onDeep={state.setDeep} reducedMotion={state.reducedMotion} onReducedMotion={state.setReducedMotion}
    onHandoff={value => { state.setHandoff(value); state.setView("pet"); router.push("/coach"); }} />;
}
