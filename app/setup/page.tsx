"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SetupFlow } from "../components/setup/setup-flow";
import { CloudStatus } from "../components/sync/cloud-status";
import type { SetupAnswers } from "../lib/demo-store";
import { useArcState } from "../lib/use-arc-state";

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
      <SetupFlow onComplete={finish} />
      {arc.recovery === "session-expired" && <CloudStatus kind="session-expired" />}
      {saveError && arc.recovery === "none" && <p className="setup-save-error" role="alert">{saveError}</p>}
    </main>
  );
}
