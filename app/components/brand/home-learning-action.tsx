"use client";

import Link from "next/link";
import { useLearningEntry } from "../account/learning-entry";
import { signInHref } from "../../lib/navigation-context";

export function HomeLearningAction() {
  const { state, retry } = useLearningEntry();
  const className = "primary-action";
  if (state === "loading") return <button className={className} type="button" disabled lang="zh-CN">正在读取学习状态…</button>;
  if (state === "error") return <button className={className} type="button" onClick={retry} lang="zh-CN">重新读取学习状态</button>;
  const label = { create: "创建学习路线", resume: "继续设置", "resume-creation": "继续设置", continue: "继续学习", "sign-in": "重新登录" }[state];
  const href = state === "continue" ? "/today" : state === "sign-in" ? signInHref("/today", true) : state === "resume-creation" ? "/setup?mode=create" : "/setup";
  return <Link className={className} href={href} lang="zh-CN">
    {label} <span aria-hidden="true">↗</span>
  </Link>;
}
