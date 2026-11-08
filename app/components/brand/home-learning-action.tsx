"use client";

import Link from "next/link";
import { useLearningEntry } from "../account/learning-entry";
import { signInHref } from "../../lib/navigation-context";

export function HomeLearningAction() {
  const { state, retry } = useLearningEntry();
  const className = "primary-action";
  if (state === "loading") return <button className={className} type="button" disabled lang="en">Loading your progress…</button>;
  if (state === "error") return <button className={className} type="button" onClick={retry} lang="en">Retry loading progress</button>;
  const label = { create: "Create your path", resume: "Continue setup", "resume-creation": "Continue setup", continue: "Continue learning", "sign-in": "Sign in again" }[state];
  const href = state === "continue" ? "/today" : state === "sign-in" ? signInHref("/today", true) : state === "resume-creation" ? "/setup?mode=create" : "/setup";
  return <Link className={className} href={href} lang="en">
    {label} <span aria-hidden="true">↗</span>
  </Link>;
}
