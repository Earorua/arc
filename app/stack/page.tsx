"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SiteHeader } from "../components/brand/site-header";
import { StackBrowser } from "../components/stack/stack-browser";
import { WorkspaceShell } from "../components/workspace/workspace-shell";
import { flagshipBlueprint } from "../data/flagship-blueprint";
import { useArcState } from "../lib/use-arc-state";
import { usePlanningWorkspace } from "../lib/use-planning-workspace";
import { useProofLedger } from "../lib/use-proof-ledger";
import { resolveWorkspacePresentation } from "../lib/workspace-presentation";
import { PlanningLoadBoundary, PlanningVersionBoundary } from "../components/workspace/planning-version-boundary";
import { authClient } from "../lib/auth-client";
import { useHydrated } from "../lib/use-hydrated";

export default function StackPage() {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const pending = !hydrated || session.isPending;
  if (pending || !session.data?.user) return <StackSignInBoundary pending={pending} />;
  return <SessionStackPage key={session.data.user.id} />;
}

function StackSignInBoundary({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => { if (!pending) router.replace("/sign-in"); }, [pending, router]);
  return <>
    <SiteHeader />
    <main id="main-content" className="reading-page">
      <p className="lede" role="status">{pending ? "正在确认账户…" : "登录后查看你的岗位技能与来源。"}</p>
      {!pending && <Link className="primary-action" href="/sign-in">登录 →</Link>}
    </main>
  </>;
}

function EmptyAccountStack() {
  return <>
    <SiteHeader />
    <main id="main-content" className="reading-page">
      <p className="eyebrow">你的账户 · 技能与来源</p>
      <h1>技能与来源</h1>
      <p className="lede">创建学习路线后，即可查看保存到当前账户的技能和来源。</p>
      <Link className="primary-action" href="/setup">创建学习路线 →</Link>
    </main>
  </>;
}

function SessionStackPage() {
  const arc = useArcState();
  const planning = usePlanningWorkspace({ cloudOnly: true });
  const { state } = arc;
  const resolved = resolveWorkspacePresentation(planning);
  const workspace = resolved.kind === "adaptive" ? resolved.workspace : null;
  const blueprint = resolved.kind === "adaptive" ? resolved.blueprint : flagshipBlueprint;
  const proof = useProofLedger({ planningWorkspace: workspace, legacyProofs: resolved.kind === "legacy" ? state?.proofs ?? [] : [], skillIds: blueprint.skills.map(({ id }) => id) });
  const evidence = proof.workspace?.versions.map((version) => ({
    proofId: version.proofId,
    versionId: version.id,
    title: version.title,
  })) ?? [];

  if ([arc.recovery, planning.recovery, proof.recovery].includes("session-expired")) return <StackSignInBoundary pending={false} />;
  // This account surface never substitutes device history or a public sample for a saved plan.
  if (planning.cloudGoalMissing || resolved.kind === "legacy") return <EmptyAccountStack />;
  if (state === null) return <WorkspaceShell current="Stack" recovery={arc.recovery} source={arc.source} state={null} />;
  if (resolved.kind !== "adaptive") return <WorkspaceShell current="Stack" sourceUnresolved recovery={arc.recovery} source={arc.source} state={state}>
    {resolved.kind === "unavailable" ? <PlanningVersionBoundary /> : <PlanningLoadBoundary loading={resolved.kind === "loading"} onRetry={planning.retry} />}
  </WorkspaceShell>;

  return (
    <WorkspaceShell
      current="Stack"
      roleName={blueprint.name}
      migration={arc.migration}
      migrationState={arc.localMigrationState}
      onDismissMigration={arc.dismissMigration}
      onImport={arc.importLocal}
      onRetry={arc.retry}
      recovery={arc.recovery}
      source={arc.source}
      state={state}
      planningMigration={planning.migration}
      planningMigrationState={planning.source === "local" ? planning.workspace : null}
      onDismissPlanningMigration={planning.dismissMigration}
      onImportPlanning={planning.importLocal}
      planningRecovery={planning.recovery}
      planningState={workspace}
    >
      <section className="workspace-intro">
        <p className="eyebrow">岗位资料 · {blueprint.version}</p>
        <h1>技能与来源</h1>
        <p>选择技能，查看掌握标准、前置要求和资料来源。学习状态依据你的作品与练习记录。</p>
      </section>
      {(proof.source === "offline-cloud" || proof.recovery === "unavailable") && (
        <p className="workspace-notice" role="status">云端作品状态暂不可用；这里只展示能够安全读取的技能证据。</p>
      )}
      {proof.recovery === "conflict" && (
        <p className="workspace-notice" role="status">作品证据已在另一处发生变化，请前往作品证据重新加载后再修改。</p>
      )}
      <StackBrowser blueprint={blueprint} evidence={evidence} projections={proof.projections} />
    </WorkspaceShell>
  );
}
