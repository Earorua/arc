"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { StoryRail } from "./story-rail";

export function PrecisionPathHero() {
  const reduceMotion = useReducedMotion();
  const enter = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 } };

  return (
    <section className="hero-poster" lang="en">
      <div className="hero-copy">
        <motion.p
          {...enter}
          transition={{ duration: 0.55 }}
          className="eyebrow"
        >
          Career intelligence · 2026 edition
        </motion.p>
        <motion.h1 {...enter} transition={{ duration: 0.7, delay: 0.06 }}>
          Learn only what moves you forward.
        </motion.h1>
        <motion.p
          {...enter}
          transition={{ duration: 0.65, delay: 0.13 }}
          className="hero-support"
          lang="zh-CN"
        >
          把任意岗位拆成清晰、可信、每天都能完成的成长路径。
        </motion.p>
        <motion.div {...enter} transition={{ duration: 0.55, delay: 0.2 }}>
          <Link className="primary-action" href="/setup">
            Build my precise path →
          </Link>
        </motion.div>
      </div>
      <StoryRail />
      <div className="signal-rule" aria-hidden="true" />
    </section>
  );
}
