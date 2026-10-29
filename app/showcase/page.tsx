import type { Metadata } from "next";
import { SiteHeader } from "../components/brand/site-header";
import { CaseShowcase } from "../components/showcase/case-showcase";
import { LearningEntry } from "../components/account/learning-entry";
import "../components/showcase/showcase.css";

export const metadata: Metadata = {
  title: "产品样例",
  description: "查看 Arc 如何把 AI 原生全栈工程师的岗位目标，拆成学习路径、每日任务与可展示的作品证据。",
  alternates: { canonical: "/showcase" },
};

export default function ShowcasePage() {
  return <LearningEntry><SiteHeader current="showcase" /><CaseShowcase /></LearningEntry>;
}
