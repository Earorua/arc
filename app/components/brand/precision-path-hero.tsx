"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { StoryRail } from "./story-rail";

export function PrecisionPathHero() {
  const reduceMotion = useReducedMotion();
  // Keep server and client styles identical; always reveal the content, even
  // when the client requests reduced motion before hydration.
  const enter = { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 } };

  return (
    <section className="hero-poster" lang="en">
      <div className="hero-copy">
        <motion.p
          {...enter}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.55 }}
          className="eyebrow"
        >
          Career intelligence · 2026 edition
        </motion.p>
        <motion.h1 {...enter} transition={reduceMotion ? { duration: 0 } : { duration: 0.7, delay: 0.06 }}>
          Learn only what moves you forward.
        </motion.h1>
        <motion.p
          {...enter}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.65, delay: 0.13 }}
          className="hero-support"
          lang="zh-CN"
        >
          从岗位目标出发，找到值得学的技能、做得完的任务，以及能展示的成果。
        </motion.p>
        <motion.div {...enter} transition={reduceMotion ? { duration: 0 } : { duration: 0.55, delay: 0.2 }}>
          <Link className="primary-action" href="/setup" lang="zh-CN">
            建立我的学习路线 →
          </Link>
          <Link className="hero-secondary" href="/showcase" lang="zh-CN">先看完整样例 ↗</Link>
        </motion.div>
      </div>
      <StoryRail />
      <div className="signal-rule" aria-hidden="true" />
    </section>
  );
}
