"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SetupFlow, type SetupSource } from "../components/setup/setup-flow";
import { RoleResearchPanel } from "../components/setup/role-research-panel";
import { TimeEditFlow } from "../components/setup/time-edit-flow";
import { firstCreationAttemptSchema, readPendingCreation, activationAttemptSchema, goalAttemptSchema, readSetupDraft, writeSetupDraft, clearSetupDrafts } from "../components/setup/setup-draft";
import { AdaptiveSetupFlow } from "../components/setup/adaptive-setup-flow";
import { CloudStatus } from "../components/sync/cloud-status";
import { flagshipBlueprint } from "../data/flagship-blueprint";
import { flagshipUnitRegistry } from "../data/flagship-unit-registry";
import { hasMeaningfulDemoState, type SetupAnswers } from "../lib/demo-store";
import type { GeneratePlanningRequest } from "../contracts/planning-api";
import { useArcState, type ArcStateController } from "../lib/use-arc-state";
import { usePlanningWorkspace } from "../lib/use-planning-workspace";
import { arcCloudClient } from "../lib/cloud-client";
import { authClient } from "../lib/auth-client";
import { useHydrated } from "../lib/use-hydrated";
import { useResearchEligibility } from "../lib/use-research-eligibility";
import { useRoleResearch, type RoleResearchController } from "../lib/use-role-research";
import type { ResearchPlanningData } from "../contracts/research";
import { safeReturnTo } from "../lib/navigation-context";
import { usePageQuery } from "../lib/use-page-query";

function AdaptiveSetupConnector({ navigate, onBackToRole, active, signedIn, saveCommonRole, source, planningData, draftOwner, creationMode = false }: { draftOwner?: string; creationMode?: boolean; navigate: (path: string) => void; onBackToRole: () => void; active: boolean; signedIn: boolean; saveCommonRole: (request: GeneratePlanningRequest, roleId: string, signal: AbortSignal) => Promise<boolean>; source: SetupSource; planningData: ResearchPlanningData | null }) {
  const planning = usePlanningWorkspace({ cloudOnly: signedIn });
  const [sourceChanged, setSourceChanged] = useState(false);
  const connected = useRef(false);
  const epoch = useRef(0);
  const saveCancellation = useRef<AbortController | null>(null);
  const newGoalAttempt = useRef<{ mutationId: string; previousGoalId: string } | null>(null);
  const sourceKey = source.source === "research" ? source.researchRunId : source.roleId;
  useLayoutEffect(() => {
    const cancellation = new AbortController();
    saveCancellation.current = cancellation;
    connected.current = active; epoch.current += 1;
    return () => { cancellation.abort(); connected.current = false; epoch.current += 1; };
  }, [active, sourceKey]);
  const blueprint = source.source === "research" ? planningData?.blueprint : flagshipBlueprint;
  const registry = source.source === "research" ? planningData?.registry : flagshipUnitRegistry;
  const firstCreation = creationMode ? readPendingCreation(draftOwner) : null;
  const pendingFirstSource = firstCreation && JSON.stringify(firstCreation.source) === JSON.stringify(source);
  const createsNewGoal = !pendingFirstSource && signedIn && source.source === "research" && planning.workspace !== null;
  if (sourceChanged) return <section className="setup-flow"><h1>当前目标已变化</h1><p>这份未完成的创建草稿属于另一个目标。请返回当前路线，原草稿不会应用到当前目标。</p><Link className="text-action" href="/path">查看当前路线</Link></section>;
  if (creationMode && !pendingFirstSource && planning.workspace && (source.source !== "research" || !signedIn)) return <section className="setup-flow"><h1>创建新的学习目标</h1><p>当前已有学习计划。现阶段只有登录后的岗位研究支持创建新目标并将当前计划保留在历史记录中。</p><p>精选路径和基础路径暂不支持在已有计划上创建新目标。</p><button className="text-action" type="button" onClick={onBackToRole}>返回，研究新目标</button><Link className="text-action" href="/path">查看当前路线</Link></section>;
  if (!blueprint || !registry) return <section className="setup-flow"><h1>暂时无法恢复岗位研究</h1><p role="alert">请返回目标步骤，重新查询研究状态后继续。你的当前路线会保留。</p><button className="text-action" type="button" onClick={onBackToRole}>返回目标步骤</button><Link className="text-action" href="/path">查看当前路线</Link></section>;
  const generate = async (request: GeneratePlanningRequest) => {
    if (!connected.current) return false;
    const started = epoch.current;
    const signal = saveCancellation.current?.signal;
    if (!signal || signal.aborted) return false;
    const pendingFirst = creationMode ? readPendingCreation(draftOwner) : null;
    if (pendingFirst?.phase === "generate" && pendingFirst.mutationId === request.mutationId
      && JSON.stringify(pendingFirst.source) === JSON.stringify(source)) {
      const currentGoal = await arcCloudClient.loadWorkspace(signal);
      if (signal.aborted || !connected.current || started !== epoch.current) return false;
      if (!pendingFirst.goalId || currentGoal?.activeGoalId !== pendingFirst.goalId) { setSourceChanged(true); return false; }
      if (planning.source !== "cloud") await planning.retry(signal);
      if (signal.aborted || !connected.current || started !== epoch.current) return false;
      return planning.generate(request);
    }
    if (!newGoalAttempt.current) newGoalAttempt.current = readSetupDraft(draftOwner, `goal-attempt:${sourceKey}`, goalAttemptSchema);
    if (createsNewGoal || (newGoalAttempt.current !== null && newGoalAttempt.current.mutationId === request.mutationId)) {
      if (newGoalAttempt.current?.mutationId !== request.mutationId) {
        if (!planning.workspace) return false;
        newGoalAttempt.current = { mutationId: request.mutationId, previousGoalId: planning.workspace.goalId };
        writeSetupDraft(draftOwner, `goal-attempt:${sourceKey}`, goalAttemptSchema, newGoalAttempt.current);
      }
      // Restore connectivity after an ambiguous response, retaining the original
      // mutation and previous goal so a retry can only replay that same save.
      if (planning.source !== "cloud") await planning.retry(signal);
      if (signal.aborted || !connected.current || started !== epoch.current) return false;
      return planning.generate({ ...request, newGoal: { previousGoalId: newGoalAttempt.current.previousGoalId } });
    }
    if (signedIn && !await planning.preflightCurrentSetup(signal)) return false;
    if (signal.aborted || !connected.current || started !== epoch.current) return false;
    if (!await saveCommonRole(request, source.source === "research" ? blueprint.name : blueprint.id, signal)) return false;
    if (!connected.current || started !== epoch.current) return false;
    if (signedIn) await planning.retry(signal);
    if (signal.aborted || !connected.current || started !== epoch.current) return false;
    return planning.generate(request);
  };
  return <AdaptiveSetupFlow
    syncUrl
    blueprint={blueprint}
    source={source}
    draftOwner={draftOwner}
    lockedGeneration={Boolean(pendingFirstSource)}
    createMutationId={() => `mutation-setup-${Date.now().toString(36)}-${crypto.randomUUID()}`}
    generate={generate}
    navigate={navigate}
    now={() => new Date()}
    onBackToRole={onBackToRole}
    active={active}
    savesToAccount={signedIn}
    createsNewGoal={createsNewGoal}
    registry={registry}
    timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"}
  />;
}

export default function SetupPage() {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const pending = !hydrated || session.isPending;
  const userId = pending ? null : session.data?.user.id ?? null;
  const [researchActive, setResearchActive] = useState(true);
  // A fresh fetch function retriggers the existing owner-bound, abortable check.
  const [eligibilityFetch, setEligibilityFetch] = useState(() => (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const eligibility = useResearchEligibility({ userId, fetch: eligibilityFetch });
  // Keep owner-bound controllers connected across account changes so their
  // reviewed cleanup clears recovery identity; remount only editable page state.
  const research = useRoleResearch({ userId, eligible: eligibility.eligible, active: researchActive });
  if (pending) return <main className="setup-page" id="main-content" tabIndex={-1}><p role="status">正在确认账户…</p></main>;
  return <SessionSetupPage key={session.isPending ? "pending" : userId ?? "guest"} userId={userId}
    research={research} eligible={eligibility.eligible} researchChecking={userId !== null && eligibility.resolved === false}
    onRetryResearchAvailability={() => setEligibilityFetch(() => (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))}
    onResearchActiveChange={setResearchActive} />;
}

function SessionSetupPage({ userId, research, eligible, researchChecking, onRetryResearchAvailability, onResearchActiveChange }: {
  userId: string | null; research: RoleResearchController; eligible: boolean; researchChecking: boolean; onRetryResearchAvailability: () => void; onResearchActiveChange: (active: boolean) => void;
}) {
  const router = useRouter();
  const query = usePageQuery();
  const requestedReturn = query.get("returnTo");
  const returnTo = requestedReturn && safeReturnTo(requestedReturn) === requestedReturn ? requestedReturn : null;
  const completionHref = `/path?created=1${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  const [mode, setMode] = useState<"setup" | "create" | "time" | null>(null);
  useEffect(() => {
    const update = () => { const query = new URLSearchParams(window.location.search); setMode(query.get("mode") === "edit" && query.get("section") === "time" ? "time" : query.get("mode") === "create" ? "create" : "setup"); };
    update(); window.addEventListener("popstate", update); return () => window.removeEventListener("popstate", update);
  }, []);
  const draftOwner = userId ? `user:${userId}` : "guest";
  const arc = useArcState();
  const [creationStartedHere, setCreationStartedHere] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const setupActivation = useRef<{ key: string; id: string } | null>(null);
  const pageCancellation = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    const cancellation = new AbortController(); pageCancellation.current = cancellation;
    return () => cancellation.abort();
  }, []);

  const finish = async (answers: SetupAnswers) => {
    const signal = pageCancellation.current?.signal;
    if (!signal || signal.aborted) return;
    setSaveError(null);
    const saved = await arc.saveSetup(answers, signal);
    if (signal.aborted) return;
    if (!saved) {
      setSaveError("无法保存到此设备，请检查浏览器存储设置后重试。");
      return;
    }
    clearSetupDrafts(draftOwner);
    router.push(completionHref);
  };

  const saveCommonRole = async (request: GeneratePlanningRequest, roleId: string, signal: AbortSignal) => {
    if (signal.aborted) return false;
    setSaveError(null);
    const setup = {
      roleId,
      level: arc.state?.setup.level ?? "beginner",
      weeklyMinutes: request.availability.weeklyMinutes,
      targetWeeks: request.target.targetWeeks,
    };
    if (userId !== null) {
      const key = JSON.stringify({ owner: userId, source: "source" in request ? request.source : { source: "flagship", roleId }, setup });
      if (!setupActivation.current) setupActivation.current = readSetupDraft(draftOwner, "activation", activationAttemptSchema);
      if (setupActivation.current?.key !== key) setupActivation.current = { key, id: `current-setup-${crypto.randomUUID()}` };
      writeSetupDraft(draftOwner, "activation", activationAttemptSchema, setupActivation.current);
    }
    if (mode === "create" && userId !== null) {
      setCreationStartedHere(true);
      const source: SetupSource = "source" in request ? request.source : { source: "flagship", roleId: "ai-native-full-stack-engineer" };
      const attempt = { mutationId: request.mutationId, activationId: setupActivation.current!.id, source, setup, phase: "activation" as const };
      writeSetupDraft(draftOwner, "first-creation", firstCreationAttemptSchema, attempt);
      try {
        // Always replay the create-only import receipt. The ordinary setup update
        // path can edit an existing legacy goal, so it cannot authorize this retry.
        const result = await arcCloudClient.importLocal({ setup, completedUnitIds: [], proofs: [] }, "reject", attempt.activationId, signal, "research-setup");
        if (signal.aborted || result.migrationId !== attempt.activationId || !["imported", "already-imported"].includes(result.status)
          || !result.activeGoalId || result.importedCompletionCount !== 0 || result.importedProofCount !== 0 || result.availableResolutions.length !== 0) return false;
        const snapshot = await arcCloudClient.loadWorkspace(signal);
        if (signal.aborted || !snapshot || snapshot.activeGoalId !== result.activeGoalId
          || JSON.stringify(snapshot.state.setup) !== JSON.stringify(setup)
          || snapshot.state.completedUnitIds.length !== 0 || snapshot.state.proofs.length !== 0) return false;
        writeSetupDraft(draftOwner, "first-creation", firstCreationAttemptSchema, { ...attempt, goalId: result.activeGoalId, phase: "generate" });
        return true;
      } catch { return false; }
    }
    const saved = await arc.saveSetup(setup, signal, userId !== null ? { currentSetupActivationId: setupActivation.current!.id } : undefined);
    if (signal.aborted) return false;
    if (!saved) setSaveError(userId !== null ? "Arc could not save this setup to your account. Try again." : "无法保存到此设备，请检查浏览器存储设置后重试。");
    return saved;
  };

  return (
    <main className="setup-page" id="main-content" tabIndex={-1}>
      <header className="setup-page-header">
        <Link className="wordmark setup-wordmark" href="/" lang="en" aria-label="Arc. 首页">Arc.</Link>
        <Link className="setup-route-back" href="/path"><span aria-hidden="true">←</span> 返回学习路线</Link>
      </header>
      {mode === null ? <p role="status">正在准备设置…</p> : mode === "time" ? <TimeEditFlow arc={arc} draftOwner={draftOwner} signedIn={userId !== null} onResearchActiveChange={onResearchActiveChange} /> : <CreationGuard enabled={mode === "create"} signedIn={userId !== null} arc={arc} draftOwner={draftOwner} creationStartedHere={creationStartedHere} render={(allowBasic) => <SetupFlow syncUrl researchChecking={researchChecking} onRetryResearchAvailability={onRetryResearchAvailability} basicCreationAllowed={allowBasic} onComplete={allowBasic ? finish : async () => { setSaveError("当前已有学习计划。请通过岗位研究创建新目标，或返回当前路线调整时间。"); }} draftOwner={draftOwner} creationMode={mode === "create"}
        recoveredResearch={research.run && research.planningData ? { runId: research.run.id, planningData: research.planningData } : null} signedIn={userId !== null} researchEligible={eligible}
        researchRecoveryAvailable={research.restoring || research.run !== null || research.error !== null || research.recoveryUncertain || research.replacementPending}
        onResearchActiveChange={onResearchActiveChange} onRoleChange={research.reset}
        renderResearch={({ role, onUseResearch, onFlagship }) => <RoleResearchPanel controller={research} role={role} eligible={eligible}
          onStart={() => void research.start({ role, locale: /[\u3400-\u9fff]/u.test(role) ? "zh-CN" : "en-US" })}
          onUse={(runId) => { if (research.planningData) onUseResearch(runId, research.planningData); }} onFlagship={allowBasic ? onFlagship : undefined} />}
        renderAdaptive={({ active, onBackToRole, source, planningData }) => <AdaptiveSetupConnector draftOwner={draftOwner} creationMode={mode === "create"} active={active} signedIn={userId !== null} navigate={(path) => router.push(path === "/path?created=1" ? completionHref : path)} onBackToRole={onBackToRole} saveCommonRole={saveCommonRole} source={source} planningData={planningData} />} />} />}
      {arc.recovery === "session-expired" && <CloudStatus kind="session-expired" />}
      {saveError && arc.recovery === "none" && <p className="setup-save-error" role="alert">{saveError}</p>}
    </main>
  );
}

function CreationGuard({ enabled, signedIn, arc, draftOwner, creationStartedHere, render }: { enabled: boolean; signedIn: boolean; arc: ArcStateController; draftOwner: string; creationStartedHere: boolean; render: (allowBasic: boolean) => React.ReactNode }) {
  if (!enabled) return render(true);
  return <CurrentGoalCreationGuard signedIn={signedIn} arc={arc} draftOwner={draftOwner} creationStartedHere={creationStartedHere} render={render} />;
}
function CurrentGoalCreationGuard({ signedIn, arc, draftOwner, creationStartedHere, render }: { signedIn: boolean; arc: ArcStateController; draftOwner: string; creationStartedHere: boolean; render: (allowBasic: boolean) => React.ReactNode }) {
  const planning = usePlanningWorkspace({ cloudOnly: signedIn });
  if (planning.source === "restoring" || arc.source === "restoring") return <p role="status">正在读取当前计划…</p>;
  const pendingCreation = readPendingCreation(draftOwner);
  const canRecoverCreation = creationStartedHere || pendingCreation !== null;
  const confirmedMissing = planning.cloudGoalMissing && !planning.workspace && !planning.sourceContext;
  if (!canRecoverCreation && (arc.source === "offline-cloud" || (!confirmedMissing && (planning.source === "offline-cloud" || (planning.recovery && planning.recovery !== "none"))))) return <section className="setup-flow"><h1>创建新的学习目标</h1><p role="alert">暂时无法确认当前计划，请先重新读取。</p><button type="button" onClick={() => void planning.retry()}>重新读取计划</button><Link href="/path">查看当前路线</Link></section>;
  const legacyGoal = !planning.workspace && (signedIn ? arc.source === "cloud" : arc.state !== null && hasMeaningfulDemoState(arc.state));
  if (legacyGoal && !canRecoverCreation) return <section className="setup-flow"><h1>先继续当前路线</h1><p>你已有一个基础学习目标，暂不支持将它归档后另存新路线。当前目标和学习记录会继续保留。</p><Link className="text-action" href="/path">查看当前路线</Link><Link className="text-action" href="/today">开始今日任务</Link></section>;
  return <>{planning.workspace && !pendingCreation && <aside className="setup-create-notice"><h2>创建新的学习目标</h2><p>{signedIn ? "通过岗位研究创建新目标后，当前计划会归档，已完成的记录仍可在历史中查看。精选路径与基础路径暂不支持创建新目标。" : "此设备已有学习计划，暂不支持将本地计划归档后创建新目标。你可以继续当前路线。"}</p></aside>}{render(Boolean(pendingCreation) || !planning.workspace)}</>;
}
