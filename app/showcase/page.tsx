import type { Metadata } from "next";
import { SiteHeader } from "../components/brand/site-header";
import { CaseShowcase } from "../components/showcase/case-showcase";
import { LearningEntry } from "../components/account/learning-entry";
import "../components/showcase/showcase.css";

export const metadata: Metadata = {
  title: "Product in action",
  description: "See how Arc turns an AI-native full-stack engineering goal into a learning path, daily tasks, and work you can show.",
  alternates: { canonical: "/showcase" },
};

export default function ShowcasePage() {
  return <LearningEntry><SiteHeader current="showcase" /><CaseShowcase /></LearningEntry>;
}
