"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PlanningWorkspace, UnitRegistry } from "../../contracts/planning";
import { setupAnswersSchema } from "../../contracts/cloud-state";
import { hasMeaningfulDemoState, type SetupAnswers } from "../../lib/demo-store";
import type { ArcStateController } from "../../lib/use-arc-state";
import { usePlanningWorkspace, type PlanningWorkspaceController } from "../../lib/use-planning-workspace";
import { resolveWorkspacePresentation } from "../../lib/workspace-presentation";
import { planningDateForInstant } from "../../lib/planning/calendar";
import { PlanDiffReview } from "../workspace/plan-diff-review";
import { AvailabilityStep, isAvailabilityDraftValid, type AvailabilityDraft } from "./availability-step";
import { readSetupDraft, removeSetupDraft, timeEditDraftSchema, writeSetupDraft } from "./setup-draft";
import { toAvailability } from "./adaptive-setup-flow";

type TimeDecision = { text: string; kind: "accept" | "discard" };

export function TimeEditFlow({ arc, signedIn, draftOwner, onResearchActiveChange }: { arc: ArcStateController; signedIn: boolean; draftOwner: string; onResearchActiveChange: (active: boolean) => void }) {
  const planning = usePlanningWorkspace({ cloudOnly: signedIn });
  useEffect(() => { onResearchActiveChange(false); }, [onResearchActiveChange]);
  const resolved = planning.cloudGoalMissing && !planning.workspace && !planning.sourceContext ? { kind: "legacy" as const } : resolveWorkspacePresentation(planning);
  if (resolved.kind === "loading") return <section className="setup-flow"><h1>Adjust weekly time</h1><p role="status">Loading your current plan…</p></section>;
  if (resolved.kind === "legacy" && arc.source === "restoring") return <section className="setup-flow"><h1>Adjust weekly time</h1><p role="status">Loading your current plan…</p></section>;
  if (resolved.kind === "legacy" && (arc.recovery === "session-expired" || arc.source === "offline-cloud" || (signedIn && arc.source === "local" && !planning.cloudGoalMissing))) return <section className="setup-flow">
    <h1>Adjust weekly time</h1><p role="alert">{arc.recovery === "session-expired" ? "Your session has expired. Sign in again to adjust your plan." : "Your current plan could not be loaded. Your goal and learning records are unchanged."}</p>
    {arc.recovery === "session-expired"
      ? <Link className="text-action" href="/sign-in?reauth=1&next=%2Fsetup%3Fmode%3Dedit%26section%3Dtime">Sign in again</Link>
      : <button className="setup-next" type="button" onClick={() => void Promise.allSettled([arc.retry(), planning.retry()])}>Reload plan</button>}
    <Link className="text-action" href="/path">Back to current path</Link>
  </section>;
  const basicReady = arc.state && arc.recovery === "none" && (signedIn
    ? arc.source === "cloud" && planning.source === "cloud" && !planning.cloudGoalMissing
    : arc.source === "local" && hasMeaningfulDemoState(arc.state));
  if (resolved.kind === "legacy" && basicReady && arc.state) return <BasicTimeEditor
    key={JSON.stringify([draftOwner, arc.state.setup.roleId, arc.state.setup.level, arc.state.setup.targetWeeks])}
    arc={arc} setup={arc.state.setup} />;
  if (resolved.kind !== "adaptive") return <section className="setup-flow"><h1>Adjust weekly time</h1>
    <p role="alert">{resolved.kind === "legacy" ? "There is no adaptive plan to adjust yet. Create a goal to set your weekly time." : "Your current plan could not be loaded. Try again before adjusting your time."}</p>
    {resolved.kind !== "legacy" && <button type="button" className="setup-next" onClick={() => void planning.retry()}>Reload plan</button>}
    <Link className="text-action" href="/path">Back to current path</Link>
    {resolved.kind === "legacy" && <Link className="text-action" href="/setup?mode=create">Create a learning goal</Link>}
  </section>;
  return <AdaptiveTimeEditFlow key={JSON.stringify([draftOwner, resolved.workspace.goalId])} draftOwner={draftOwner} planning={planning} workspace={resolved.workspace} registry={resolved.registry} roleName={resolved.blueprint.name} />;
}

function AdaptiveTimeEditFlow(props: { draftOwner: string; planning: PlanningWorkspaceController; workspace: PlanningWorkspace; registry: UnitRegistry; roleName: string }) {
  // Keep decisions above the availability-keyed editor, but isolate each owner and goal.
  const [decision, setDecision] = useState<{ revision: number; result: TimeDecision | null }>({ revision: 0, result: null });
  const revision = useRef(0);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  return <CurrentTimeEditor key={props.workspace.availability.id} {...props} decision={decision.result} onDecision={(result) => {
    if (!active.current || result !== null && revision.current !== decision.revision) return false;
    if (result === null) revision.current += 1;
    setDecision({ revision: revision.current, result });
    return true;
  }} />;
}

function BasicTimeEditor({ arc, setup }: { arc: ArcStateController; setup: SetupAnswers }) {
  const [minutes, setMinutes] = useState(String(setup.weeklyMinutes));
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [message, setMessage] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  const saving = useRef<AbortController | null>(null);
  useEffect(() => () => saving.current?.abort(), []);
  const weeklyMinutes = Number(minutes);
  const valid = setupAnswersSchema.safeParse({ ...setup, weeklyMinutes }).success;
  const save = async () => {
    if (saving.current || !valid || weeklyMinutes === setup.weeklyMinutes) return;
    const controller = new AbortController(); saving.current = controller;
    setPending(true); setMessage(null); setCompleted(false);
    try {
      const saved = await arc.saveSetup({ ...setup, weeklyMinutes }, controller.signal);
      if (!controller.signal.aborted) setCompleted(saved);
      if (!controller.signal.aborted) setMessage(saved
        ? { kind: "status", text: "Your time is saved. Your current goal and completed work are unchanged." }
        : { kind: "alert", text: "Could not save your time. Your current plan is unchanged. Try again." });
    } catch {
      if (!controller.signal.aborted) setMessage({ kind: "alert", text: "Could not save your time. Your current plan is unchanged. Try again." });
    } finally {
      if (!controller.signal.aborted) { saving.current = null; setPending(false); }
    }
  };
  return <section className="setup-flow time-edit-flow">
    <p className="setup-progress">Adjust your basic plan · Schedule</p>
    <h1>Adjust weekly time</h1>
    <p>Update your weekly study time while keeping your goal, assessment, and completed work.</p>
    <label htmlFor="basic-weekly-minutes">Available minutes per week</label>
    <input id="basic-weekly-minutes" type="number" min={30} max={2400} step={1} value={minutes} disabled={pending} onChange={(event) => { setMinutes(event.target.value); setCompleted(false); setMessage(null); }} />
    <div className="setup-actions setup-primary-actions">
      <button className="setup-next" type="button" disabled={pending || !valid || weeklyMinutes === setup.weeklyMinutes} onClick={() => void save()}>{pending ? "Saving…" : "Save time"}</button>
      <Link className="text-action" href="/path" onClick={() => { saving.current?.abort(); setCompleted(false); }}>Cancel changes</Link>
    </div>
    {message && <p role={message.kind}>{message.text}</p>}
    {completed && <div className="setup-completion-links"><Link className="text-action" href="/today">Continue today&apos;s learning</Link></div>}
  </section>;
}

function CurrentTimeEditor({ planning, workspace, registry, roleName, draftOwner, decision, onDecision }: { decision: TimeDecision | null; onDecision: (result: TimeDecision | null) => boolean; draftOwner: string; planning: PlanningWorkspaceController; workspace: PlanningWorkspace; registry: UnitRegistry; roleName: string }) {
  const [draft, setDraft] = useState<AvailabilityDraft>(() => ({ timeZone: workspace.availability.timeZone, weekdays: { ...workspace.availability.weekdays }, exceptions: [...workspace.availability.exceptions] }));
  const [draftSource] = useState(() => `time:${workspace.goalId}:${workspace.availability.id}`);
  const [draftReady, setDraftReady] = useState(false);
  const [draftFinished, setDraftFinished] = useState(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      const saved = readSetupDraft(draftOwner, draftSource, timeEditDraftSchema);
      if (saved && !workspace.pendingPlanVersionId) { setDraft(saved); setRestored(true); }
      setDraftReady(true);
    });
    return () => { current = false; };
  }, [draftOwner, draftSource, workspace.pendingPlanVersionId]);
  useEffect(() => {
    if (draftReady && !draftFinished && !workspace.pendingPlanVersionId) writeSetupDraft(draftOwner, draftSource, timeEditDraftSchema, draft);
  }, [draft, draftFinished, draftOwner, draftReady, draftSource, workspace.pendingPlanVersionId]);
  const clearDraft = () => { removeSetupDraft(draftOwner, draftSource); setDraftFinished(true); setRestored(false); };
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const lifecycle = useRef(0);
  useEffect(() => { heading.current?.focus(); lifecycle.current += 1; return () => { lifecycle.current += 1; }; }, []);
  let planningDate: string;
  try { planningDate = planningDateForInstant(new Date().toISOString(), draft.timeZone); }
  catch { planningDate = planningDateForInstant(new Date().toISOString(), workspace.availability.timeZone); }
  const changed = JSON.stringify(draft) !== JSON.stringify({ timeZone: workspace.availability.timeZone, weekdays: workspace.availability.weekdays, exceptions: workspace.availability.exceptions });
  const reconnect = async () => {
    if (pending) return;
    const epoch = lifecycle.current; setPending(true);
    try { await planning.retry(); }
    catch { if (epoch === lifecycle.current) setMessage({ kind: "alert", text: "The plan could not be reloaded. Try again shortly." }); }
    finally { if (epoch === lifecycle.current) setPending(false); }
  };
  const preview = async () => {
    if (pending || workspace.pendingPlanVersionId || !isAvailabilityDraftValid(draft, planningDate)) return;
    const epoch = lifecycle.current; setPending(true); setMessage(null); onDecision(null);
    try {
      const saved = await planning.record({ kind: "availability_changed", availability: toAvailability(draft), planningDate });
      if (saved) removeSetupDraft(draftOwner, draftSource);
      if (epoch !== lifecycle.current) return;
      setMessage(saved ? { kind: "status", text: "Your proposed changes are ready. Review them below, then accept or keep your original schedule." } : { kind: "alert", text: "Could not create proposed changes. Your current plan is saved. Try again." });
    } catch { if (epoch === lifecycle.current) setMessage({ kind: "alert", text: "Could not create proposed changes. Your current plan is saved. Try again." }); }
    finally { if (epoch === lifecycle.current) setPending(false); }
  };
  return <section className="setup-flow time-edit-flow">
    <p className="setup-progress">Adjust your plan · Schedule</p>
    <h1 ref={heading} tabIndex={-1}>Adjust weekly time</h1>
    <p className="setup-intent">{roleName} · {workspace.target.targetWeeks}-week goal. Your current goal and completed work are saved.</p>
    <p>Preview changes to task dates before deciding whether to accept them.</p>
    {restored && <p className="setup-draft-notice">Your unsaved time draft for this goal is restored.</p>}
    <fieldset className="time-edit-fields" disabled={pending || Boolean(workspace.pendingPlanVersionId)}>
      <legend className="sr-only">Weekly availability</legend>
      <AvailabilityStep value={draft} onChange={(next) => { onDecision(null); setMessage(null); setDraftFinished(false); setDraft(next); }} planningDate={planningDate} />
    </fieldset>
    {!workspace.pendingPlanVersionId && <><div className="setup-actions setup-primary-actions"><button type="button" className="setup-next" disabled={pending || planning.source === "offline-cloud" || !changed || !isAvailabilityDraftValid(draft, planningDate)} onClick={() => void preview()}>{pending ? "Preparing proposed changes…" : "Preview time changes"}</button><Link className="text-action" href="/path" onClick={() => { clearDraft(); onDecision(null); }} aria-describedby="time-cancel-note">Cancel changes</Link></div><p id="time-cancel-note">The header&apos;s back link keeps your time draft. Cancel changes clears this draft and keeps your saved plan.</p></>}
    {decision && <p role="status">{decision.text}</p>}
    {message && <p role={message.kind}>{message.text}</p>}
    {(planning.source === "offline-cloud" || message?.kind === "alert") && <button className="text-action" type="button" disabled={pending} onClick={() => void reconnect()}>Reload current plan</button>}
    {workspace.pendingPlanVersionId && <PlanDiffReview workspace={workspace} registry={registry} recovery={planning.recovery} acceptLabel="Save changes" onAccept={planning.accept} onDiscard={planning.discard} onSuccess={(text, kind) => { if (onDecision({ text, kind })) { clearDraft(); setMessage(null); } }} />}
    {decision?.kind === "accept" && !workspace.pendingPlanVersionId && <div className="setup-completion-links"><Link className="text-action" href="/today">Continue today&apos;s learning</Link></div>}
  </section>;
}
