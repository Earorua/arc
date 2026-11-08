"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AgentLearningContext, AgentWorkspace, PublicAgentRun } from "../../contracts/agents";
import { completedTutorHistory, isLearningCompanionRoute, useCompanionOverlay, useLearningAgents, type CompanionView } from "./agent-context";
import { safeReturnTo } from "../../lib/navigation-context";

export function CompanionAvatar({ thinking = false }: { thinking?: boolean }) {
  return <svg viewBox="0 0 88 94" fill="none" aria-hidden="true" className={thinking ? "companion-avatar is-thinking" : "companion-avatar"}>
    <ellipse cx="44" cy="86" rx="25" ry="4" fill="#182b30" opacity=".1" />
    <g className="companion-body">
      <path d="M25 22C25 12 34 7 44 7C54 7 63 12 63 22V30C75 37 78 50 74 65C71 77 61 81 44 81C27 81 17 77 14 65C10 50 13 37 25 30V22Z" fill="#e5eeec" stroke="#24383d" strokeWidth="2.5" />
      <path d="M30 19C36 13 51 13 57 19" stroke="var(--signal)" strokeWidth="6" strokeLinecap="round" />
      <path d="M15 51L8 56M73 51L80 56" stroke="#24383d" strokeWidth="3" strokeLinecap="round" />
      <g className="companion-eyes"><ellipse cx="33" cy="46" rx="3" ry="5" fill="#24383d" /><ellipse cx="55" cy="46" rx="3" ry="5" fill="#24383d" /></g>
      <path d="M39 58Q44 63 49 58" stroke="#24383d" strokeWidth="2" strokeLinecap="round" />
      <circle cx="25" cy="55" r="4" fill="var(--signal)" opacity=".35" /><circle cx="63" cy="55" r="4" fill="var(--signal)" opacity=".35" />
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
function CompanionLearningContext({ context, roleName, contextLabel }: { context: AgentLearningContext; roleName?: string; contextLabel?: string }) {
  const resources = context.task ? context.resources.flatMap(resource => {
    const href = safeResourceUrl(resource.url);
    return href ? [{ ...resource, href }] : [];
  }) : [];
  const noTask = context.totalUnits > 0 && context.completedUnits >= context.totalUnits
    ? "All tasks in this path are complete" : "No tasks scheduled for today";
  return <details className="companion-context">
    <summary>
      {contextLabel && contextLabel !== "Current plan" && <span className="companion-context-note">{contextLabel}</span>}
      <span className="companion-context-heading"><strong>{roleName || "Current learning path"}</strong><span>Path and resources</span></span>
      <span className="companion-current-task">{context.task ? <><span>Helping with: </span><strong>{context.task.title}</strong></> : <strong>{noTask}</strong>}</span>
    </summary>
    <div className="companion-context-details">
      <p className="companion-context-meta"><span>{context.source === "research" ? "Researched path" : "Built-in path"}</span><span>{context.completedUnits} of {context.totalUnits} tasks complete</span></p>
      {context.task ? <p className="companion-context-date">Scheduled for: <time dateTime={context.task.scheduledDate}>{context.task.scheduledDate}</time></p>
        : <p className="companion-context-date">You can still ask about your path and what you have learned.</p>}
      {resources.length > 0 && <ul className="companion-resources" aria-label="Current task resources">{resources.map(resource =>
        <li key={resource.id}><a href={resource.href} target="_blank" rel="noopener noreferrer">
          <span>{resource.title} ↗</span><small>{resource.provider}</small>
        </a></li>)}</ul>}
    </div>
  </details>;
}
export function CompanionPanel(props: CompanionProps) {
  const input = useRef<HTMLTextAreaElement>(null), content = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const availability = props.availability ?? (props.enabled ? "ready" : "disabled");
  const canReply = props.enabled && availability === "ready" && !props.loading;
  const readError = Boolean(props.error && !props.enabled && !props.learningContext);
  const status = props.loading ? "loading" : props.error ? "error" : props.busy ? "replying" : availability;
  const statusText = props.loading ? "Loading your progress…" : props.error ? (readError ? "Progress is temporarily unavailable" : "Response interrupted. Try again.")
    : props.busy ? "Replying…" : availability === "needs_setup" ? "Set up a learning path to begin"
      : availability === "disabled" ? "AI tutoring is not enabled" : "Make sense of each step";
  const showContext = !props.loading && !readError && availability !== "needs_setup";
  const task = showContext ? (props.learningContext ? props.learningContext.task?.title : props.task) : null;
  const suggestions = task ? ["Explain this task", "Break this task down"] : ["Help me plan my approach", "Review what I have learned"];
  const submit = () => { if (canReply && !props.busy && props.draft.trim()) props.onSend(); };
  const restore = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const openedFrom = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const overlay = useCompanionOverlay();
  useEffect(() => {
    if (props.view === "chat") {
      if (!wasOpen.current && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) openedFrom.current = document.activeElement;
      (canReply ? input.current : close.current)?.focus({ preventScroll: true });
    }
    wasOpen.current = props.view === "chat";
  }, [props.view, canReply, overlay]);
  useEffect(() => {
    if (props.view !== "chat" || !overlay) return;
    const previous = document.body.style.overflow;
    const position = { left: window.scrollX, top: window.scrollY };
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; window.scrollTo({ ...position, behavior: "instant" }); };
  }, [props.view, overlay]);
  useEffect(() => { if (props.view === "chat" && content.current) content.current.scrollTop = content.current.scrollHeight; }, [props.messages, props.partial, props.view]);
  const minimize = () => { props.onView("pet"); requestAnimationFrame(() => {
    const origin = openedFrom.current;
    const target = origin?.isConnected && !panel.current?.contains(origin) ? origin : document.querySelector<HTMLElement>("[data-companion-trigger]") ?? launcher.current;
    target?.focus({ preventScroll: true });
  }); };
  if (props.view === "hidden") return <button ref={restore} className="companion-restore" onClick={() => { props.onView("pet"); requestAnimationFrame(() => launcher.current?.focus()); }} aria-label="Show learning companion">Learning companion ↗</button>;
  return <aside className={`companion-root ${props.reducedMotion ? "without-motion" : ""}`} aria-label="Learning companion">
    {props.view === "chat" && <section ref={panel} className="companion-panel" role="dialog" aria-modal={overlay} aria-labelledby="companion-title"
      onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); minimize(); }
        if (event.key === "Tab" && overlay) {
          const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>("*") ?? [])
            .filter(element => element.matches('a[href], button:not(:disabled), textarea:not(:disabled), input:not(:disabled), summary'))
            .filter(element => { const closed = element.closest("details:not([open])"); return !closed || closed.querySelector("summary")?.contains(element); });
          const first = controls[0], last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <header className="companion-heading">
        <div><span className={`companion-status-dot is-${status}`} aria-hidden="true" /><strong id="companion-title">Learning companion</strong><small>{statusText}</small></div>
        <div className="companion-window-actions">
          <button ref={close} type="button" onClick={minimize} aria-label="Minimize learning companion">×</button>
        </div>
      </header>
      <div ref={content} className="companion-content">
      {showContext && (props.learningContext ? <CompanionLearningContext context={props.learningContext} roleName={props.roleName} contextLabel={props.contextLabel} />
        : props.task && <div className="companion-task"><span>Helping with: </span><strong>{props.task}</strong></div>)}
      <div className="companion-messages" role="log" aria-label="Conversation history" aria-live="polite" aria-relevant="additions">
        {canReply && props.messages.length === 0 && !props.pendingQuestion && <div className="companion-empty">
          <p>{task ? "Tell me where you are stuck." : "Ask a question or review what you have learned."}</p>
        </div>}
        {props.messages.map(message => <div className="companion-turn" key={message.id}>
          <p className="companion-question">{message.message}</p>
          {message.answer ? <AnswerText text={message.answer} /> : <p className="companion-message-state">{message.error ?? "Your message is being processed…"}</p>}
          {message.status === "complete" && <button className="companion-handoff" type="button"
            onClick={() => props.onHandoff(`Learning question: ${message.message}\nDiscussion summary: ${message.answer.slice(0, 1200)}\nUse this discussion to review and improve my learning path.`)}>Take to learning coach ↗</button>}
        </div>)}
        {props.pendingQuestion && <div className="companion-turn"><p className="companion-question">{props.pendingQuestion}</p>
          {props.partial ? <AnswerText text={props.partial} /> : props.busy && <p className="companion-thinking">Thinking it through<span>…</span></p>}</div>}
      </div>
      </div>
      {!props.loading && !props.error && availability === "needs_setup" && <p className="companion-notice">Set up a learning path so your companion can help with your tasks. <Link href="/setup" onClick={minimize}>Learning setup ↗</Link></p>}
      {!props.loading && !props.error && availability === "disabled" && <p className="companion-notice">AI tutoring is not enabled yet. Your path and resources are still available.</p>}
      {!props.loading && props.error && <p className="companion-error" role="alert">{props.error}
        {readError && props.onRefresh && <button type="button" onClick={props.onRefresh}>Reload</button>}</p>}
      {canReply && <div className="companion-suggestions">{suggestions.map(text =>
        <button key={text} type="button" disabled={props.busy} onClick={() => { props.onDraft(text); input.current?.focus(); }}>{text}</button>)}</div>}
      <form className="companion-composer" onSubmit={event => { event.preventDefault(); submit(); }}>
        <textarea ref={input} disabled={!canReply} aria-label="Ask your learning companion" placeholder={canReply ? "What would you like to understand?" : "Ask a question here when the service is available"} rows={2} maxLength={6000}
          value={props.draft} onChange={event => props.onDraft(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
        <div className="companion-compose-actions"><label><input type="checkbox" disabled={!canReply} checked={props.deep} onChange={event => props.onDeep(event.target.checked)} />Explain in depth</label>
          {props.busy ? <button type="button" className="companion-send" onClick={props.onStop}>Stop response</button>
            : <button type="submit" className="companion-send" aria-label="Send message" disabled={!canReply || !props.draft.trim()}>Send ↑</button>}</div>
      </form>
      <footer className="companion-footer">
        <button type="button" onClick={() => props.onHandoff(props.draft.trim() || (task ? `I would like to adjust my schedule for “${task}”.` : "I would like to adjust my learning plan."))}>Adjust learning plan</button>
      </footer>
    </section>}
    <button ref={launcher} type="button" className="companion-launcher" onClick={() => props.onView(props.view === "chat" ? "pet" : "chat")}
      aria-label={props.view === "chat" ? "Collapse learning companion" : "Open learning companion"} aria-expanded={props.view === "chat"}>
      <CompanionAvatar thinking={props.busy} />
      {props.view === "pet" && <span>{props.busy ? "Replying…" : "Here when you need a hand"}</span>}
    </button>
  </aside>;
}
export function AgentCompanion() {
  const state = useLearningAgents(); const router = useRouter(); const path = usePathname();
  if (!isLearningCompanionRoute(path) || !state.authenticated || state.authPending) return null;
  return <CompanionPanel view={state.view} onView={state.setView} messages={completedTutorHistory(state.workspace)}
    draft={state.draft} onDraft={state.setDraft} onSend={() => void state.send()} onStop={state.stop}
    busy={state.busy} partial={state.partial} pendingQuestion={state.pendingQuestion}
    error={state.error} task={state.workspace?.currentTask ?? null}
    contextLabel={path === "/history" ? "Current plan · not a historical record" : "Current plan"}
    enabled={Boolean(state.workspace?.enabled && state.workspace.authenticated && state.workspace.goalId)}
    reason={state.workspace?.reason ?? null} loading={state.loading} onRefresh={() => void state.refresh()}
    learningContext={state.workspace?.learningContext} roleName={state.workspace?.roleName}
    availability={state.workspace?.availability ?? (state.workspace && !state.workspace.goalId ? "needs_setup" : undefined)}
    deep={state.deep} onDeep={state.setDeep} reducedMotion={state.reducedMotion} onReducedMotion={state.setReducedMotion}
    onHandoff={value => { state.setHandoff(value); state.setView("pet"); const returnTo = safeReturnTo(typeof window === "undefined" ? path : `${path}${window.location.search}`, "/today"); router.push(`/coach?returnTo=${encodeURIComponent(returnTo)}`); }} />;
}
