"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { PublicAgentRun } from "../../contracts/agents";
import { completedTutorHistory, useCompanionOverlay, useLearningAgents, type CompanionView } from "./agent-context";
import { learnerAvailability } from "./agent-availability";

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
  contextLabel?: string;
  deep: boolean; onDeep(value: boolean): void; reducedMotion: boolean; onReducedMotion(value: boolean): void;
};
export function CompanionPanel(props: CompanionProps) {
  const input = useRef<HTMLTextAreaElement>(null), end = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const restore = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const overlay = useCompanionOverlay();
  useEffect(() => { if (props.view === "chat") (props.enabled ? input.current : close.current)?.focus(); }, [props.view, props.enabled, overlay]);
  useEffect(() => {
    if (props.view !== "chat" || !overlay) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [props.view, overlay]);
  useEffect(() => { if (props.view === "chat") end.current?.scrollIntoView?.({ block: "nearest" }); }, [props.messages, props.partial, props.view]);
  const minimize = () => { props.onView("pet"); requestAnimationFrame(() => launcher.current?.focus()); };
  const hide = () => { props.onView("hidden"); requestAnimationFrame(() => restore.current?.focus()); };
  if (props.view === "hidden") return <button ref={restore} className="companion-restore" onClick={() => { props.onView("pet"); requestAnimationFrame(() => launcher.current?.focus()); }} aria-label="重新显示学习伙伴">学习伙伴 ↗</button>;
  return <aside className={`companion-root ${props.reducedMotion ? "without-motion" : ""}`} aria-label="学习伙伴">
    {props.view === "chat" && <section ref={panel} className="companion-panel" role="dialog" aria-modal={overlay} aria-labelledby="companion-title"
      onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); minimize(); }
        if (event.key === "Tab" && overlay) {
          const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>("*") ?? [])
            .filter(element => element.matches('a[href], button:not(:disabled), textarea:not(:disabled), input:not(:disabled)'));
          const first = controls[0], last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <header className="companion-heading">
        <div><span className="companion-status-dot" /><strong id="companion-title">学习伙伴</strong><small>一起弄懂每一步</small></div>
        <div className="companion-window-actions">
          <button ref={close} type="button" onClick={minimize} aria-label="最小化学习伙伴">×</button>
        </div>
      </header>
      <div className="companion-task"><span>{props.contextLabel ?? "当前计划"}</span><strong>{props.task ?? "学习目标与当前进度"}</strong></div>
      <div className="companion-messages" role="log" aria-label="答疑记录" aria-live="polite" aria-relevant="additions">
        {props.enabled && props.messages.length === 0 && !props.pendingQuestion && <div className="companion-empty">
          <CompanionAvatar /><h2>卡住的地方，<br />我们一起拆开看。</h2><p>概念、代码，或今天的第一步。<br />随时把问题交给我。</p>
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
      {!props.enabled && !props.error && <div className="companion-notice" role="status"><strong>{learnerAvailability(props.reason)}</strong><p>今日任务、学习资料和已有记录仍可继续使用。</p><Link href="/today" onClick={minimize}>回到今日学习 ↗</Link></div>}
      {props.error && <p className="companion-error" role="alert">{props.error}</p>}
      {props.enabled && <div className="companion-suggestions">{["解释当前任务", "给我一个例子", "帮我看报错"].map(text =>
        <button key={text} type="button" disabled={props.busy} onClick={() => { props.onDraft(text); input.current?.focus(); }}>{text}</button>)}</div>}
      <form className="companion-composer" onSubmit={event => { event.preventDefault(); props.onSend(); }}>
        <textarea ref={input} disabled={!props.enabled} aria-label="向学习伙伴提问" placeholder={props.enabled ? "从哪里开始不太明白？" : "服务开放后可在这里提问"} rows={2} maxLength={6000}
          value={props.draft} onChange={event => props.onDraft(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (props.enabled && !props.busy) props.onSend(); } }} />
        <div className="companion-compose-actions"><label><input type="checkbox" disabled={!props.enabled} checked={props.deep} onChange={event => props.onDeep(event.target.checked)} />深入讲解</label>
          {props.busy ? <button type="button" className="companion-send" onClick={props.onStop}>停止回复</button>
            : <button type="submit" className="companion-send" aria-label="发送消息" disabled={!props.enabled || !props.draft.trim()}>发送 ↑</button>}</div>
      </form>
      <footer className="companion-footer">
        <label><input type="checkbox" checked={props.reducedMotion} onChange={event => props.onReducedMotion(event.target.checked)} />减少动效</label>
        <button type="button" onClick={hide}>隐藏伙伴</button><Link href="/coach" onClick={minimize}>学习规划师 ↗</Link>
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
  const state = useLearningAgents(); const router = useRouter(); const path = usePathname();
  if (!state.authenticated || state.authPending) return null;
  return <CompanionPanel view={state.view} onView={state.setView} messages={completedTutorHistory(state.workspace)}
    draft={state.draft} onDraft={state.setDraft} onSend={() => void state.send()} onStop={state.stop}
    busy={state.busy} partial={state.partial} pendingQuestion={state.pendingQuestion}
    error={state.error} task={state.workspace?.currentTask ?? null}
    contextLabel={path === "/history" ? "当前计划 · 非历史记录" : "当前计划"}
    enabled={Boolean(state.workspace?.enabled && state.workspace.authenticated && state.workspace.goalId)}
    reason={state.loading ? "正在读取学习进度…" : state.workspace?.reason ?? null}
    deep={state.deep} onDeep={state.setDeep} reducedMotion={state.reducedMotion} onReducedMotion={state.setReducedMotion}
    onHandoff={value => { state.setHandoff(value); state.setView("pet"); router.push("/coach"); }} />;
}
