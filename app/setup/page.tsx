"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SetupFlow } from "../components/setup/setup-flow";
import { loadDemoState, mergeSetup, saveDemoState, type SetupAnswers } from "../lib/demo-store";

export default function SetupPage() {
  const router = useRouter();
  const [saveError, setSaveError] = useState<string | null>(null);

  const finish = (answers: SetupAnswers) => {
    setSaveError(null);
    const saved = saveDemoState(mergeSetup(loadDemoState(), answers));
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
      {saveError && <p className="setup-save-error" role="alert">{saveError}</p>}
    </main>
  );
}
