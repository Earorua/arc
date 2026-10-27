"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { flagshipRole } from "../../data/flagship-role";

const views = [
  { id: "path", label: "学习路径", english: "Path" },
  { id: "today", label: "每日任务", english: "Today" },
  { id: "proof", label: "作品证据", english: "Proof" },
] as const;

const phaseOutcomes: Record<string, { title: string; outcome: string }> = {
  foundations: { title: "打好产品基础", outcome: "做出可访问的 React 产品界面，让交互与类型契约一起成形。" },
  systems: { title: "接通完整系统", outcome: "把界面接到有类型校验的 API，用关系型数据保存真实业务。" },
  intelligence: { title: "加入有依据的 AI", outcome: "让模型输出符合结构约束，每个重要结论都能回到来源。" },
  production: { title: "交付可验证的作品", outcome: "部署、观察、完善产品，再用作品讲清自己的能力。" },
};

export function CaseShowcase() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const totalWeeks = flagshipRole.phases.reduce((sum, phase) => sum + phase.weeks, 0);

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % views.length;
    else if (event.key === "ArrowLeft") next = (index + views.length - 1) % views.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = views.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <main id="main-content" className="showcase-page">
      <section className="showcase-intro" aria-labelledby="showcase-title">
        <div>
          <p className="eyebrow">案例展示 <span lang="en">· Product in action</span></p>
          <h1 id="showcase-title" lang="en">See the path.<br />See the <em>proof.</em></h1>
        </div>
        <p className="showcase-lede">从一个岗位目标，到每天知道该做什么，再到留下可展示的作品。先看看，这条路会是什么样。</p>
      </section>

      <section className="showcase-case" aria-labelledby="showcase-role">
        <aside className="showcase-context">
          <p className="section-index" lang="en">01 / Flagship example</p>
          <h2 id="showcase-role">{flagshipRole.name}</h2>
          <p>用一条完整示例，串起从产品界面到 AI 应用交付的学习过程。</p>
          <dl className="showcase-facts">
            <div><dt>路径跨度</dt><dd>{totalWeeks}<span> 周</span></dd></div>
            <div><dt>示例任务</dt><dd>{flagshipRole.today.minutes}<span> 分钟</span></dd></div>
            <div><dt>技能地图</dt><dd>{flagshipRole.skills.length}<span> 项技能</span></dd></div>
          </dl>
          <p className="showcase-sample-note">公开示例 · 可直接浏览<br />你的路径会从自己的目标与时间安排开始。</p>
        </aside>

        <div className="showcase-preview">
          <div className="showcase-tabs" role="tablist" aria-label="案例效果展示">
            {views.map((view, index) => (
              <button
                aria-controls={`showcase-panel-${view.id}`}
                aria-selected={active === index}
                id={`showcase-tab-${view.id}`}
                key={view.id}
                onClick={() => setActive(index)}
                onKeyDown={event => navigateTabs(event, index)}
                ref={element => { tabRefs.current[index] = element; }}
                role="tab"
                tabIndex={active === index ? 0 : -1}
                type="button"
              >
                <span lang="en">{view.english}</span>{view.label}
              </button>
            ))}
          </div>

          <div aria-labelledby="showcase-tab-path" className="showcase-panel" hidden={active !== 0} id="showcase-panel-path" role="tabpanel" tabIndex={0}>
            <div className="showcase-panel-heading">
              <p className="section-index" lang="en">A direction, made concrete</p>
              <h3>每一阶段，都有一个落点。</h3>
              <p>先掌握依赖，再完成作品。知道为什么学，也知道学完能做什么。</p>
            </div>
            <ol className="showcase-roadmap">
              {flagshipRole.phases.map((phase, index) => {
                const firstWeek = 1 + flagshipRole.phases.slice(0, index).reduce((sum, previous) => sum + previous.weeks, 0);
                return <li key={phase.id}>
                  <span className="showcase-phase-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="showcase-week">第 {firstWeek}–{firstWeek + phase.weeks - 1} 周 <span lang="en">/ {phase.name}</span></p>
                    <h4>{phaseOutcomes[phase.id].title}</h4>
                    <p>{phaseOutcomes[phase.id].outcome}</p>
                  </div>
                </li>;
              })}
            </ol>
          </div>

          <div aria-labelledby="showcase-tab-today" className="showcase-panel" hidden={active !== 1} id="showcase-panel-today" role="tabpanel" tabIndex={0}>
            <div className="showcase-panel-heading">
              <p className="section-index" lang="en">One focused session</p>
              <h3>今天，只推进这一步。</h3>
              <p>把大目标缩小成一次能完成、能回看的练习。</p>
            </div>
            <div className="showcase-task">
              <span className="showcase-duration"><strong>{flagshipRole.today.minutes}</strong><span lang="en">MIN</span></span>
              <div><p className="section-index" lang="en">Today&apos;s example</p><h4>{flagshipRole.today.title}</h4></div>
            </div>
            <ol className="showcase-steps">
              {flagshipRole.today.steps.map((step, index) => <li key={step.id}><span aria-hidden="true">0{index + 1}</span>{step.label}</li>)}
            </ol>
            <div className="showcase-deliverable"><span>完成后留下</span><strong>一次 Git 提交，或一份实现说明</strong></div>
            <p className="showcase-skills">练习涉及：{flagshipRole.today.skillIds.map(id => flagshipRole.skills.find(skill => skill.id === id)?.name).join(" · ")}</p>
          </div>

          <div aria-labelledby="showcase-tab-proof" className="showcase-panel" hidden={active !== 2} id="showcase-panel-proof" role="tabpanel" tabIndex={0}>
            <div className="showcase-panel-heading">
              <p className="section-index" lang="en">Make the work inspectable</p>
              <h3>学过什么，让作品来说明。</h3>
              <p>把练习的结果、过程和能力关联放在一起，方便自己回顾，也方便他人理解。</p>
            </div>
            <article className="showcase-proof" aria-label="作品证据示例">
              <div className="showcase-proof-label"><span lang="en">PROOF / 001</span><span>示例 · 未验证</span></div>
              <h4>带类型校验的表单提交</h4>
              <p>从输入校验、服务端处理到结果反馈，完成一条可检查的提交路径。</p>
              <dl>
                <div><dt>代码变更</dt><dd><code>feat: validate form submissions</code></dd></div>
                <div><dt>实现说明</dt><dd>说明客户端与服务端边界，以及校验失败时的处理方式。</dd></div>
                <div><dt>复现步骤</dt><dd>分别提交有效输入与空值，记录成功结果和错误反馈。</dd></div>
                <div><dt>关联能力</dt><dd>React · TypeScript · HTTP & API Design</dd></div>
              </dl>
            </article>
            <p className="showcase-proof-note">此处展示作品记录的形式，不代表真实用户成果或已通过能力认证。</p>
          </div>
          <div className="showcase-preview-footer"><span className="wordmark" lang="en">Arc.</span><span>从方向，到行动，到证据。</span></div>
        </div>
      </section>

      <section className="showcase-next" aria-labelledby="showcase-next-title">
        <div><p className="section-index" lang="en">Now, make it yours</p><h2 id="showcase-next-title">下一条路径，从你的目标开始。</h2></div>
        <Link className="primary-action" href="/setup">创建我的学习路径 <span aria-hidden="true">→</span></Link>
      </section>
    </main>
  );
}
