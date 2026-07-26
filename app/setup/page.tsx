"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SetupFlow } from "../components/setup/setup-flow";
import { loadDemoState, mergeSetup, saveDemoState, type SetupAnswers } from "../lib/demo-store";

export default function SetupPage() {
  const router = useRouter();

  const finish = (answers: SetupAnswers) => {
    saveDemoState(mergeSetup(loadDemoState(), answers));
    router.push("/path");
  };

  return (
    <main className="setup-page" id="main-content">
      <Link className="wordmark setup-wordmark" href="/" lang="en">Arc.</Link>
      <SetupFlow onComplete={finish} />
    </main>
  );
}
