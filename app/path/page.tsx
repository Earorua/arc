import { flagshipRole } from "../data/flagship-role";
import { PhaseRail } from "../components/workspace/phase-rail";
import { WorkspaceShell } from "../components/workspace/workspace-shell";

export default function PathPage() {
  return (
    <WorkspaceShell current="Path">
      <section className="workspace-intro">
        <p className="eyebrow" lang="en">18 weeks · 7 hours / week</p>
        <h1 lang="en">Your precise path.</h1>
        <p>每个阶段只承担一个明确结果；时间变化时，后续路线重新分配但历史保持不变。</p>
      </section>
      <PhaseRail phases={flagshipRole.phases} />
    </WorkspaceShell>
  );
}
