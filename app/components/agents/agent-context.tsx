"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { authClient } from "../../lib/auth-client";
import { agentClient } from "../../lib/agent-client";
import { useHydrated } from "../../lib/use-hydrated";
import type { AgentRequest, AgentWorkspace, PublicAgentRun } from "../../contracts/agents";

export type CompanionView = "pet" | "chat" | "hidden";
type AgentState = {
  accountId: string | null; authenticated: boolean; authPending: boolean;
  workspace: AgentWorkspace | null; loading: boolean; error: string | null;
  view: CompanionView; setView(view: CompanionView): void; reducedMotion: boolean; setReducedMotion(value: boolean): void;
  draft: string; setDraft(value: string): void; deep: boolean; setDeep(value: boolean): void;
  busy: boolean; partial: string; pendingQuestion: string | null;
  send(): Promise<void>; stop(): void; refresh(): Promise<void>;
  handoff: string; setHandoff(value: string): void;
};
const AgentContext = createContext<AgentState | null>(null);
export function useOptionalLearningAgents() { return useContext(AgentContext); }
export function LearningPreferences() {
  const state = useContext(AgentContext);
  if (!state?.authenticated || state.authPending) return null;
  return <details className="account-learning-preferences">
    <summary>学习偏好</summary>
    <label><input type="checkbox" checked={state.reducedMotion} onChange={event => state.setReducedMotion(event.target.checked)} />减少动效</label>
    <p>默认遵循系统设置；勾选后进一步减少全站动画。</p>
    <label><input type="checkbox" checked={state.view !== "hidden"} onChange={event => state.setView(event.target.checked ? "pet" : "hidden")} />显示学习伙伴</label>
  </details>;
}
export function useLearningAgents() {
  const value = useContext(AgentContext);
  if (!value) throw new Error("Learning agent context is unavailable.");
  return value;
}
const overlayQuery = "(max-width: 1050px)";
function subscribeOverlay(callback: () => void) {
  const media = window.matchMedia(overlayQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
export function useCompanionOverlay() {
  return useSyncExternalStore(subscribeOverlay, () => window.matchMedia(overlayQuery).matches, () => false);
}
const companionRoutes = new Set(["/today", "/path", "/stack", "/proof", "/coach", "/history", "/setup"]);
export function isLearningCompanionRoute(path: string | null | undefined) {
  return path != null && companionRoutes.has(path);
}
export function AgentPageFrame({ children }: { children: ReactNode }) {
  const agents = useLearningAgents();
  const overlay = useCompanionOverlay();
  const path = usePathname();
  const open = isLearningCompanionRoute(path) && agents.authenticated && !agents.authPending && agents.view === "chat";
  return <div className={open ? "arc-page-content has-companion" : "arc-page-content"} inert={open && overlay}>{children}</div>;
}
export function LearningAgentsProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const identity = !hydrated || session.isPending ? "loading" : session.error ? "guest" : session.data?.user?.id ?? "guest";
  return <AgentSession identity={identity}>{children}</AgentSession>;
}
function AgentSession({ children, identity }: { children: ReactNode; identity: string }) {
  const path = usePathname();
  const authenticated = identity !== "loading" && identity !== "guest";
  const [workspace, setWorkspace] = useState<AgentWorkspace | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const [view, updateView] = useState<CompanionView>("pet");
  const [reducedMotion, updateMotion] = useState(false), [draft, updateDraft] = useState("");
  const [deep, setDeep] = useState(false), [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState(""), [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [handoff, setHandoff] = useState("");
  const [previousIdentity, setPreviousIdentity] = useState(identity);
  // Reset private agent state before rendering a different identity, without remounting page forms.
  if (previousIdentity !== identity) {
    setPreviousIdentity(identity);
    setWorkspace(null); setLoading(true); setError(null);
    updateView("pet"); updateMotion(false); updateDraft(""); setDeep(false);
    setBusy(false); setPartial(""); setPendingQuestion(null); setHandoff("");
  }
  const mounted = useRef(true), request = useRef<AbortController | null>(null), read = useRef<AbortController | null>(null);
  const goal = useRef<string | null>(null);
  const draftRef = useRef("");
  const preferencesKey = `arc-companion-v1:${identity}`;
  const draftKey = `arc-companion-draft-v1:${identity}:${workspace?.goalId ?? "none"}`;
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reducedMotion);
    return () => document.documentElement.classList.remove("reduce-motion");
  }, [reducedMotion]);
  useEffect(() => {
    mounted.current = true;
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      try {
        const preferences = JSON.parse(localStorage.getItem(preferencesKey) ?? "{}");
        if (["pet", "chat", "hidden"].includes(preferences.view)) updateView(preferences.view);
        updateMotion(preferences.reducedMotion === true);
      } catch { /* Storage is optional for UI preferences. */ }
    });
    return () => {
      current = false; mounted.current = false;
      request.current?.abort(); read.current?.abort();
      request.current = null; read.current = null; goal.current = null; draftRef.current = "";
    };
  }, [preferencesKey]);
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      try { draftRef.current = sessionStorage.getItem(draftKey)?.slice(0, 6000) ?? ""; }
      catch { draftRef.current = ""; }
      updateDraft(draftRef.current);
    });
    return () => { current = false; };
  }, [draftKey]);
  const setDraft = useCallback((value: string) => {
    draftRef.current = value; updateDraft(value);
    try { sessionStorage.setItem(draftKey, value); } catch { /* In-memory drafting still works. */ }
  }, [draftKey]);
  const savePreference = (nextView: CompanionView, nextMotion: boolean) => {
    try { localStorage.setItem(preferencesKey, JSON.stringify({ view: nextView, reducedMotion: nextMotion })); } catch { /* Optional. */ }
  };
  const setView = (next: CompanionView) => { updateView(next); savePreference(next, reducedMotion); };
  const setReducedMotion = (next: boolean) => { updateMotion(next); savePreference(view, next); };
  const refresh = useCallback(async () => {
    if (identity === "loading") return;
    if (identity === "guest") { setWorkspace(null); setError(null); setLoading(false); return; }
    read.current?.abort(); const controller = new AbortController(); read.current = controller;
    try {
      const value = await agentClient.workspace(controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (goal.current !== value.goalId) {
        request.current?.abort(); setPartial(""); setPendingQuestion(null); setHandoff(""); setBusy(false);
      }
      goal.current = value.goalId; setWorkspace(value); setError(null);
    } catch (e) {
      if (!mounted.current || controller.signal.aborted) return;
      setWorkspace(null); setError(e instanceof Error ? e.message : "无法读取学习进度。");
    } finally { if (mounted.current && !controller.signal.aborted) setLoading(false); }
  }, [identity]);
  useEffect(() => {
    let current = true;
    queueMicrotask(() => { if (current) void refresh(); });
    return () => { current = false; };
  }, [path, refresh]);
  useEffect(() => {
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("arc:learning-changed", onFocus);
    return () => { window.removeEventListener("focus", onFocus); window.removeEventListener("arc:learning-changed", onFocus); };
  }, [refresh]);
  const stop = () => { request.current?.abort(); };
  const send = async () => {
    if (!authenticated || busy || !draft.trim() || !workspace?.enabled || !workspace.authenticated || !workspace.goalId || !workspace.baseVersionId || workspace.revision === null) return;
    const message = draft.trim(), requestGoal = workspace.goalId;
    const controller = new AbortController(); request.current = controller;
    const isCurrent = () => mounted.current && request.current === controller && goal.current === requestGoal;
    setBusy(true); setPartial(""); setPendingQuestion(message); setError(null); setDraft("");
    try {
      const page = path?.split("/")[1];
      const input: AgentRequest = { requestId: crypto.randomUUID(), goalId: requestGoal,
        baseVersionId: workspace.baseVersionId, revision: workspace.revision, message, deep,
        page: ["today", "path", "stack", "proof", "coach"].includes(page ?? "") ? page as AgentRequest["page"] : "site" };
      await agentClient.tutor(input, event => {
        if (!isCurrent() || controller.signal.aborted) return;
        if (event.type === "delta") setPartial(previous => previous + event.text);
        if (event.type === "done") {
          setWorkspace(previous => previous?.goalId === requestGoal ? { ...previous,
            history: [...previous.history.filter(run => run.id !== event.run.id), event.run].slice(-30) } : previous);
          setPartial(""); setPendingQuestion(null);
        }
      }, controller.signal);
    } catch (e) {
      if (!isCurrent()) return;
      setError(controller.signal.aborted ? "已停止回复，问题已保留。" : e instanceof Error ? e.message : "回复失败，请重试。");
      if (!draftRef.current) setDraft(message);
    } finally { if (isCurrent()) setBusy(false); }
  };
  return <AgentContext.Provider value={{ accountId: authenticated ? identity : null, authenticated, authPending: identity === "loading", workspace, loading, error, view, setView, reducedMotion, setReducedMotion,
    draft, setDraft, deep, setDeep, busy, partial, pendingQuestion, send, stop, refresh, handoff, setHandoff }}>
    {children}
  </AgentContext.Provider>;
}
export function completedTutorHistory(workspace: AgentWorkspace | null): PublicAgentRun[] {
  return workspace?.history.filter(run => run.kind === "tutor") ?? [];
}
