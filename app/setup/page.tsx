"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SetupFlow } from "../components/setup/setup-flow";
import { AdaptiveSetupFlow } from "../components/setup/adaptive-setup-flow";
import { CloudStatus } from "../components/sync/cloud-status";
import { flagshipBlueprint } from "../data/flagship-blueprint";
import { flagshipUnitRegistry } from "../data/flagship-unit-registry";
import type { SetupAnswers } from "../lib/demo-store";
import { useArcState } from "../lib/use-arc-state";
import { usePlanningWorkspace } from "../lib/use-planning-workspace";

function AdaptiveSetupConnector({ navigate, onBackToRole, active }: { navigate: (path: string) => void; onBackToRole: () => void; active: boolean }) {
  const planning = usePlanningWorkspace();
  return <AdaptiveSetupFlow
    blueprint={flagshipBlueprint}
    createMutationId={() => `mutation-setup-${Date.now().toString(36)}-${crypto.randomUUID()}`}
    generate={planning.generate}
    navigate={navigate}
    now={() => new Date()}
    onBackToRole={onBackToRole}
    active={active}
    registry={flagshipUnitRegistry}
    timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"}
  />;
}

export default function SetupPage() {
  const router = useRouter();
  const arc = useArcState();
  const [saveError, setSaveError] = useState<string | null>(null);

  const finish = async (answers: SetupAnswers) => {
    setSaveError(null);
    const saved = await arc.saveSetup(answers);
    if (!saved) {
      setSaveError("无法保存到此设备，请检查浏览器存储设置后重试。");
      return;
    }
    router.push("/path");
  };

  return (
    <main className="setup-page" id="main-content">
      <Link className="wordmark setup-wordmark" href="/" lang="en">Arc.</Link>
      <SetupFlow onComplete={finish} renderAdaptive={({ active, onBackToRole }) => <AdaptiveSetupConnector active={active} navigate={router.push} onBackToRole={onBackToRole} />} />
      {arc.recovery === "session-expired" && <CloudStatus kind="session-expired" />}
      {saveError && arc.recovery === "none" && <p className="setup-save-error" role="alert">{saveError}</p>}
    </main>
  );
}
