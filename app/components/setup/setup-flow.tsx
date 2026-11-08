"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { LearnerLevel, SetupAnswers } from "../../lib/demo-store";
import type { ResearchPlanningData } from "../../contracts/research";
import { flagshipRole } from "../../data/flagship-role";
import { claimGuestSetupDraft, clearSetupDrafts, legacyDraftSchema, readSetupDraft, writeSetupDraft, type LegacySetupDraft } from "./setup-draft";
import { getRoleDisplayName } from "../../lib/personalized-plan";
import { setupStepNames, useSetupNavigation } from "./setup-navigation";
import { updatePageQuery } from "../../lib/use-page-query";

export type SetupSource = { source: "flagship"; roleId: "ai-native-full-stack-engineer" } | { source: "research"; researchRunId: string };
type AdaptiveControls = { active: boolean; onBackToRole: () => void; source: SetupSource; planningData: ResearchPlanningData | null };
type ResearchControls = { role: string; onUseResearch: (runId: string, data: ResearchPlanningData) => void; onFlagship: () => void };

const flagshipRoleId = "ai-native-full-stack-engineer";

export function isFlagshipRoleInput(role: string): boolean {
  // Match only known aliases using the same normalization as research input.
  const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
  return [flagshipRoleId, flagshipRole.name, getRoleDisplayName(flagshipRoleId), "AI \u539f\u751f\u5168\u6808\u5de5\u7a0b\u5e08"]
    .some((alias) => normalize(alias) === normalize(role));
}

function isFiniteIntegerInRange(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) && Number.isInteger(value) && value >= minimum && value <= maximum;
}

type SetupFlowProps = {
  onComplete: (answers: SetupAnswers) => void | Promise<void>;
  renderAdaptive?: (controls: AdaptiveControls) => ReactNode;
  signedIn?: boolean; researchEligible?: boolean; researchRecoveryAvailable?: boolean;
  renderResearch?: (controls: ResearchControls) => ReactNode;
  onResearchActiveChange?: (active: boolean) => void;
  onRoleChange?: () => void;
  draftOwner?: string;
  recoveredResearch?: { runId: string; planningData: ResearchPlanningData } | null;
  creationMode?: boolean;
  basicCreationAllowed?: boolean;
  syncUrl?: boolean;
  researchChecking?: boolean;
  onRetryResearchAvailability?: () => void;
};
export function SetupFlow(props: SetupFlowProps) {
  return <OwnedSetupFlow key={props.draftOwner ?? "ephemeral"} {...props} />;
}
function OwnedSetupFlow({ onComplete, renderAdaptive, signedIn = false, researchEligible = false, researchRecoveryAvailable = false, renderResearch, onResearchActiveChange, onRoleChange, draftOwner, recoveredResearch, creationMode = false, basicCreationAllowed = true, syncUrl = false, researchChecking = false, onRetryResearchAvailability }: SetupFlowProps) {
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [adaptiveSelected, setAdaptiveSelected] = useState(false);
  const [adaptiveStarted, setAdaptiveStarted] = useState(false);
  const [selection, setSelection] = useState<{ source: SetupSource; planningData: ResearchPlanningData | null }>({ source: { source: "flagship", roleId: flagshipRoleId }, planningData: null });
  const previousStep = useRef(step);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const [customRole, setCustomRole] = useState("");
  const [answers, setAnswers] = useState<SetupAnswers>({
    roleId: flagshipRoleId,
    level: "beginner",
    weeklyMinutes: 420,
    targetWeeks: 18,
  });

  const [draftReady, setDraftReady] = useState(!draftOwner);
  const [restored, setRestored] = useState(false);
  const [guestAvailable, setGuestAvailable] = useState(false);
  const [restoringSource, setRestoringSource] = useState<SetupSource | null>(null);
  const [draftError, setDraftError] = useState(false);
  const [draftEpoch, setDraftEpoch] = useState(0);
  const restore = (draft: LegacySetupDraft) => {
    setStep(draft.source.source === "research" ? 0 : draft.step); setFurthestStep(draft.furthestStep ?? draft.step); setCustomRole(draft.customRole); setAnswers(draft.answers); setRestored(true);
    if (draft.source.source === "flagship") {
      setSelection({ source: draft.source, planningData: null });
      setAdaptiveStarted(draft.adaptiveStarted); setAdaptiveSelected(draft.adaptiveSelected);
    } else if (draft.adaptiveStarted) setRestoringSource(draft.source);
  };
  useEffect(() => {
    if (!draftOwner) return;
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      const draft = readSetupDraft(draftOwner, "flow", legacyDraftSchema);
      if (draft) restore(draft);
      setGuestAvailable(Boolean(draftOwner !== "guest" && readSetupDraft("guest", "flow", legacyDraftSchema)));
      setDraftReady(true);
    });
    return () => { current = false; };
  }, [draftOwner]);
  useEffect(() => {
    if (restoringSource?.source !== "research" || recoveredResearch?.runId !== restoringSource.researchRunId) return;
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      setSelection({ source: restoringSource, planningData: recoveredResearch.planningData });
      setAdaptiveStarted(true); setAdaptiveSelected(true); setRestoringSource(null);
    });
    return () => { current = false; };
  }, [recoveredResearch, restoringSource]);
  useEffect(() => {
    if (!draftReady || restoringSource) return;
    const saved = writeSetupDraft(draftOwner, "flow", legacyDraftSchema, { step, furthestStep, customRole, answers, source: selection.source, adaptiveSelected, adaptiveStarted });
    let current = true;
    queueMicrotask(() => { if (current) setDraftError(!saved); });
    return () => { current = false; };
  }, [draftReady, draftOwner, step, furthestStep, customRole, answers, selection.source, adaptiveSelected, adaptiveStarted, restoringSource]);
  const resetDraft = () => {
    clearSetupDrafts(draftOwner); navigateStep(0, true); setFurthestStep(0); setCustomRole("");
    setAnswers({ roleId: flagshipRoleId, level: "beginner", weeklyMinutes: 420, targetWeeks: 18 });
    setSelection({ source: { source: "flagship", roleId: flagshipRoleId }, planningData: null });
    setAdaptiveSelected(false); setAdaptiveStarted(false); setRestoringSource(null); setRestored(false);
    setDraftEpoch((value) => value + 1);
  };

  useEffect(() => {
    let current = true;
    queueMicrotask(() => { if (current && !basicCreationAllowed) setStep(0); });
    return () => { current = false; };
  }, [basicCreationAllowed]);
  const advance = () => {
    if (!basicCreationAllowed) return;
    if (step === 0 && !hasCustomRole && renderAdaptive) { setSelection({ source: { source: "flagship", roleId: flagshipRoleId }, planningData: null }); setAdaptiveStarted(true); setAdaptiveSelected(true); if (syncUrl) updatePageQuery({ step: "foundation" }); return; }
    const next = Math.min(step + 1, 3); setFurthestStep((current) => Math.max(current, next)); navigateStep(next);
  };

  const selectFlagshipRole = () => {
    setRestoringSource(null); onRoleChange?.();
    if (selection.source.source === "research") { setAdaptiveStarted(false); setSelection({ source: { source: "flagship", roleId: flagshipRoleId }, planningData: null }); }
    setFurthestStep(0);
    setCustomRole("");
    setAnswers((current) => ({ ...current, roleId: flagshipRoleId }));
  };

  const updateCustomRole = (value: string) => {
    setRestoringSource(null); onRoleChange?.();
    if (selection.source.source === "research") { setAdaptiveStarted(false); setSelection({ source: { source: "flagship", roleId: flagshipRoleId }, planningData: null }); }
    setFurthestStep(0);
    setCustomRole(value);
    setAnswers((current) => ({ ...current, roleId: value.trim() || flagshipRoleId }));
  };

  const hasCustomRole = customRole.trim().length > 0;
  const canResearchRole = hasCustomRole && !isFlagshipRoleInput(customRole);
  const researchActive = step === 0 && !adaptiveSelected;
  useLayoutEffect(() => { onResearchActiveChange?.(researchActive); }, [onResearchActiveChange, researchActive]);
  const useResearch = (researchRunId: string, planningData: ResearchPlanningData) => {
    if (!signedIn || !renderAdaptive) return;
    setSelection({ source: { source: "research", researchRunId }, planningData });
    setAdaptiveStarted(true); setAdaptiveSelected(true); if (syncUrl) updatePageQuery({ step: "foundation" });
  };
  const weeklyMinutesValid = isFiniteIntegerInRange(answers.weeklyMinutes, 30, 2400);
  const targetWeeksValid = isFiniteIntegerInRange(answers.targetWeeks, 4, 52);
  const canResumeAdaptive = adaptiveStarted && Boolean(renderAdaptive) && (selection.source.source === "research" ? Boolean(selection.planningData) : !hasCustomRole);
  const navigateStep = useSetupNavigation({ enabled: syncUrl, ready: draftReady && !restoringSource, active: !adaptiveSelected,
    currentStep: step, maximumStep: canResumeAdaptive ? 3 : !basicCreationAllowed ? 0 : Math.min(furthestStep, weeklyMinutesValid ? 3 : 2),
    onNavigate: (next) => { if (next > 0 && canResumeAdaptive) setAdaptiveSelected(true); else setStep(next); },
  });

  useEffect(() => {
    if (!adaptiveSelected && (previousStep.current !== step || step === 0)) {
      questionRef.current?.focus();
      previousStep.current = step;
    }
  }, [adaptiveSelected, step]);

  return (
    <>
    {!adaptiveSelected && draftOwner && <div className="setup-draft-bar">
      {restored && <p>Your setup draft is restored. Continue where you left off or start again.</p>}
      {guestAvailable && <div><p>This device has a guest draft. You can choose to use it with your account.</p><button className="text-action" type="button" onClick={() => {
        const draft = claimGuestSetupDraft(draftOwner); if (draft) { restore(draft); setGuestAvailable(false); setDraftEpoch((value) => value + 1); }
      }}>Continue guest draft</button></div>}
      <details><summary>Draft options</summary><button className="text-action" type="button" onClick={resetDraft}>Restart setup</button><p>This clears only the setup draft. Saved plans and role research are kept.</p></details>
      {draftError && <p>Your draft could not be saved. Keep this page open until you finish setup.</p>}
    </div>}
    <section className="setup-flow" hidden={adaptiveSelected}>
      <p className="setup-progress">{String(step + 1).padStart(2, "0")} / 04</p>
      <ol className="setup-step-names" aria-label="Setup progress">{setupStepNames.map((name, index) => <li key={name} aria-current={index === step ? "step" : undefined}>{name}</li>)}</ol>
      {!basicCreationAllowed && <p className="setup-intent">Research a new role to create a new goal alongside your existing plan.</p>}
      {creationMode && <p className="setup-intent">Create a new goal · Review before saving, including how your current plan will be archived.</p>}

      {step === 0 && (
        <>
          <h1 ref={questionRef} tabIndex={-1}>What role or field do you want to learn?</h1>
          {basicCreationAllowed && <button
            aria-pressed={!hasCustomRole}
            className={hasCustomRole ? "answer-choice" : "answer-choice is-selected"}
            onClick={selectFlagshipRole}
            type="button"
          >
            AI-Native Full-Stack Engineer
          </button>}
          <label className="answer-field">
            {basicCreationAllowed ? "Or enter a role" : "Enter a new role to research"}
            <input
              aria-label="Custom role"
              onChange={(event) => updateCustomRole(event.target.value)}
              maxLength={basicCreationAllowed ? 200 : 160}
              placeholder="For example: Data Product Manager"
              value={customRole}
            />
          </label>
          {hasCustomRole && basicCreationAllowed && <p className="custom-role-disclosure">{signedIn && renderResearch && canResearchRole && researchEligible
            ? "Research this role for a source-backed skills assessment and adaptive schedule. Continue directly for a basic path allocated by available time."
            : signedIn && renderResearch && canResearchRole && researchRecoveryAvailable && !researchEligible
              ? "New research is temporarily unavailable. Continue for a basic path allocated by available time."
              : <>A full skills assessment and adaptive schedule require a curated role blueprint or available research. This role will use a basic path allocated by available time.</>}</p>}
          {signedIn && renderResearch && (researchRecoveryAvailable || researchEligible && canResearchRole) && renderResearch({ role: customRole.trim(), onUseResearch: useResearch, onFlagship: selectFlagshipRole })}
          {!basicCreationAllowed && <div className="setup-research-availability">
            {!researchEligible && <p role="status">{!signedIn ? "This device already has a learning plan. Archiving a local plan to create a new goal is not available yet. You can continue your current path." : researchChecking ? "Checking role research availability…" : "Role research is temporarily unavailable, so a new path cannot be created yet. Your existing plan and learning records are saved."}</p>}
            {researchEligible && (!canResearchRole || customRole.trim().length < 2) && <p>Enter a new role name with at least 2 characters. Research it to continue.</p>}
            {signedIn && !researchEligible && onRetryResearchAvailability && <div className="setup-actions">
              <button className="text-action" disabled={researchChecking} onClick={onRetryResearchAvailability} type="button">Check research availability again</button>
            </div>}
          </div>}
        </>
      )}

      {step === 1 && (
        <>
          <h1 ref={questionRef} tabIndex={-1}>What is your current experience level?</h1>
          <div className="answer-grid">
            {(["new", "beginner", "intermediate", "advanced"] as LearnerLevel[]).map((level) => (
              <button
                className={answers.level === level ? "answer-choice is-selected" : "answer-choice"}
                key={level}
                aria-pressed={answers.level === level}
                onClick={() => setAnswers((current) => ({ ...current, level }))}
                type="button"
              >
                {{ new: "New to this", beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" }[level]}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1 ref={questionRef} tabIndex={-1}>How much time can you make each week?</h1>
          <label className="answer-field">
            Minutes per week
            <input
              aria-label="Minutes per week"
              aria-describedby={weeklyMinutesValid ? undefined : "weekly-minutes-error"}
              aria-invalid={!weeklyMinutesValid}
              max="2400"
              min="30"
              onChange={(event) => setAnswers((current) => ({ ...current, weeklyMinutes: Number(event.target.value) }))}
              type="number"
              step="1"
              value={answers.weeklyMinutes}
            />
          </label>
          {!weeklyMinutesValid && <p id="weekly-minutes-error" role="alert">Enter a whole number from 30 to 2400.</p>}
        </>
      )}

      {step === 3 && (
        <>
          <h1 ref={questionRef} tabIndex={-1}>Confirm your learning path.</h1>
          <dl className="setup-confirmation"><div><dt>Learning goal</dt><dd>{getRoleDisplayName(answers.roleId)}</dd></div><div><dt>Weekly time</dt><dd>{answers.weeklyMinutes} minutes</dd></div></dl>
          <label className="answer-field">
            Target weeks
            <input
              aria-label="Target weeks"
              aria-describedby={targetWeeksValid ? undefined : "target-weeks-error"}
              aria-invalid={!targetWeeksValid}
              max="52"
              min="4"
              onChange={(event) => setAnswers((current) => ({ ...current, targetWeeks: Number(event.target.value) }))}
              type="number"
              step="1"
              value={answers.targetWeeks}
            />
          </label>
          {!targetWeeksValid && <p id="target-weeks-error" role="alert">Enter a whole number from 4 to 52.</p>}
        </>
      )}
      {basicCreationAllowed && <nav className="setup-actions setup-primary-actions" aria-label="Setup steps">
        {step > 0 && <button className="setup-back text-action" onClick={() => navigateStep(step - 1)} type="button">Back</button>}
        {step < 3 ? <button className="setup-next" disabled={step === 2 && !weeklyMinutesValid} onClick={advance} type="button">Continue</button>
          : <button className="setup-next" disabled={!targetWeeksValid || !weeklyMinutesValid} onClick={() => void onComplete(answers)} type="button">Create path</button>}
      </nav>}
    </section>
    {renderAdaptive && adaptiveStarted && <div key={`${draftEpoch}:${selection.source.source === "research" ? selection.source.researchRunId : "flagship"}`} hidden={!adaptiveSelected}>{renderAdaptive({ ...selection, active: adaptiveSelected, onBackToRole: () => { setAdaptiveSelected(false); navigateStep(0); } })}</div>}
    </>
  );
}
