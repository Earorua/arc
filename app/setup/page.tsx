"use client";

import { useRouter } from "next/navigation";
import { SetupFlow } from "../components/setup/setup-flow";
import { createDemoState, mergeSetup, saveDemoState, type SetupAnswers } from "../lib/demo-store";

export default function SetupPage() {
  const router = useRouter();

  const finish = (answers: SetupAnswers) => {
    saveDemoState(mergeSetup(createDemoState(), answers));
    router.push("/path");
  };

  return (
    <main className="setup-page" id="main-content">
      <a className="wordmark setup-wordmark" href="/" lang="en">Arc.</a>
      <SetupFlow onComplete={finish} />
    </main>
  );
}
