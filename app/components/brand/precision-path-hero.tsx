import Link from "next/link";
import { HomeLearningAction } from "./home-learning-action";

/** Original Arc mark: three open paths, converging toward one direction. */
function ArcMark() {
  return (
    <svg className="discovery-arc" viewBox="0 0 160 140" fill="none" aria-hidden="true" focusable="false">
      <path d="M132 106C113 139 57 137 29 106C0 74 20 24 62 13C101 3 142 26 145 63" stroke="currentColor" strokeWidth="13" strokeLinecap="round" />
      <path d="M132 106C112 126 72 126 49 103C25 80 38 43 68 31C98 19 126 36 130 62" stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity=".65" />
      <path d="M132 106C116 114 90 111 75 95C61 79 64 60 80 51C96 42 113 49 117 62" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".4" />
    </svg>
  );
}

export function PrecisionPathHero() {
  return (
    <section className="discovery-hero" lang="en" aria-labelledby="arc-hero-title">
      <div className="discovery-hero-center">
        <h1 id="arc-hero-title" className="discovery-hero-title">
          <span className="discovery-brand">Arc<span className="discovery-brand-dot">.</span><ArcMark /></span>
          <span className="discovery-promise">Learn only what moves you forward.</span>
        </h1>
        <p className="discovery-tagline">A continuous learning journey</p>
        <p className="discovery-hero-description" lang="zh-CN">从岗位目标出发，找到值得学的技能、做得完的任务，以及能展示的成果。</p>
        <div className="discovery-hero-actions" lang="zh-CN">
          <HomeLearningAction />
          <Link className="hero-secondary" href="/showcase">先看完整样例 ↗</Link>
        </div>
      </div>
      <a className="discovery-scroll" href="#learning-method" lang="zh-CN"><span>探索学习方法</span><i aria-hidden="true" /></a>
    </section>
  );
}
