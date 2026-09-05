"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SetupFlow, type SetupSource } from "../components/setup/setup-flow";
import { RoleResearchPanel } from "../components/setup/role-research-panel";
import { AdaptiveSetupFlow } from "../components/setup/adaptive-setup-flow";
import { CloudStatus } from "../components/sync/cloud-status";
import { flagshipBlueprint } from "../data/flagship-blueprint";
import { flagshipUnitRegistry } from "../data/flagship-unit-registry";
import type { SetupAnswers } from "../lib/demo-store";
import type { GeneratePlanningRequest } from "../contracts/planning-api";
import { useArcState } from "../lib/use-arc-state";
import { usePlanningWorkspace } from "../lib/use-planning-workspace";
import { authClient } from "../lib/auth-client";
import { useResearchEligibility } from "../lib/use-research-eligibility";
import { useRoleResearch, type RoleResearchController } from "../lib/use-role-research";
import type { ResearchPlanningData } from "../contracts/research";

function AdaptiveSetupConnector({ navigate, onBackToRole, active, saveCommonRole, source, planningData }: { navigate: (path: string) => void; onBackToRole: () => void; active: boolean; saveCommonRole: (request: GeneratePlanningRequest, roleId: string, signal: AbortSignal) => Promise<boolean>; source: SetupSource; planningData: ResearchPlanningData | null }) {
  const planning = usePlanningWorkspace({ cloudOnly: source.source === "research" });
  const connected = useRef(false);
  const epoch = useRef(0);
  const saveCancellation = useRef<AbortController | null>(null);
  const sourceKey = source.source === "research" ? source.researchRunId : source.roleId;
  useLayoutEffect(() => {
    const cancellation = new AbortController();
    saveCancellation.current = cancellation;
    connected.current = active; epoch.current += 1;
    return () => { cancellation.abort(); connected.current = false; epoch.current += 1; };
  }, [active, sourceKey]);
  const blueprint = source.source === "research" ? planningData?.blueprint : flagshipBlueprint;
  const registry = source.source === "research" ? planningData?.registry : flagshipUnitRegistry;
  if (!blueprint || !registry) return <p role="alert">Research is unavailable. Return to Role and restore the research.</p>;
  const generate = async (request: GeneratePlanningRequest) => {
    if (!connected.current) return false;
    const started = epoch.current;
    const signal = saveCancellation.current?.signal;
    if (!signal || signal.aborted) return false;
    if (source.source === "research" && !await planning.preflightResearchSetup(signal)) return false;
    if (signal.aborted || !connected.current || started !== epoch.current) return false;
    if (!await saveCommonRole(request, source.source === "research" ? blueprint.name : blueprint.id, signal)) return false;
    if (!connected.current || started !== epoch.current) return false;
    if (source.source === "research") await planning.retry(signal);
    if (signal.aborted || !connected.current || started !== epoch.current) return false;
    return planning.generate(request);
  };
  return <AdaptiveSetupFlow
    blueprint={blueprint}
    source={source}
    createMutationId={() => `mutation-setup-${Date.now().toString(36)}-${crypto.randomUUID()}`}
    generate={generate}
    navigate={navigate}
    now={() => new Date()}
    onBackToRole={onBackToRole}
    active={active}
    registry={registry}
    timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"}
  />;
}

export default function SetupPage() {
  const session = authClient.useSession();
  const userId = session.isPending ? null : session.data?.user.id ?? null;
  const [researchActive, setResearchActive] = useState(true);
  const eligibility = useResearchEligibility({ userId });
  // Keep owner-bound controllers connected across account changes so their
  // reviewed cleanup clears recovery identity; remount only editable page state.
  const research = useRoleResearch({ userId, eligible: eligibility.eligible, active: researchActive });
  return <SessionSetupPage key={session.isPending ? "pending" : userId ?? "guest"} userId={userId}
    research={research} eligible={eligibility.eligible} onResearchActiveChange={setResearchActive} />;
}

function SessionSetupPage({ userId, research, eligible, onResearchActiveChange }: {
  userId: string | null; research: RoleResearchController; eligible: boolean; onResearchActiveChange: (active: boolean) => void;
}) {
  const router = useRouter();
  const arc = useArcState();
  const [saveError, setSaveError] = useState<string | null>(null);
  const researchActivation = useRef<{ key: string; id: string } | null>(null);
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
    router.push("/path");
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
    const isResearch = "source" in request && request.source.source === "research";
    if (isResearch) {
      const key = JSON.stringify({ source: request.source, setup });
      if (researchActivation.current?.key !== key) researchActivation.current = { key, id: `research-setup-${crypto.randomUUID()}` };
    }
    const saved = await arc.saveSetup(setup, signal, isResearch ? { researchActivationId: researchActivation.current!.id } : undefined);
    if (signal.aborted) return false;
    if (!saved) setSaveError(isResearch ? "Arc could not save this research setup to your account. Try again." : "无法保存到此设备，请检查浏览器存储设置后重试。");
    return saved;
  };

  return (
    <main className="setup-page" id="main-content">
      <Link className="wordmark setup-wordmark" href="/" lang="en">Arc.</Link>
      <SetupFlow onComplete={finish} signedIn={userId !== null} researchEligible={eligible}
        researchRecoveryAvailable={research.restoring || research.run !== null || research.error !== null}
        onResearchActiveChange={onResearchActiveChange} onRoleChange={research.reset}
        renderResearch={({ role, onUseResearch, onFlagship }) => <RoleResearchPanel controller={research} role={role} eligible={eligible}
          onStart={() => void research.start({ role, locale: /[\u3400-\u9fff]/u.test(role) ? "zh-CN" : "en-US" })}
          onUse={(runId) => { if (research.planningData) onUseResearch(runId, research.planningData); }} onFlagship={onFlagship} />}
        renderAdaptive={({ active, onBackToRole, source, planningData }) => <AdaptiveSetupConnector active={active} navigate={router.push} onBackToRole={onBackToRole} saveCommonRole={saveCommonRole} source={source} planningData={planningData} />} />
      {arc.recovery === "session-expired" && <CloudStatus kind="session-expired" />}
      {saveError && arc.recovery === "none" && <p className="setup-save-error" role="alert">{saveError}</p>}
    </main>
  );
}
