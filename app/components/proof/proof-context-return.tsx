"use client";

import Link from "next/link";
import { useEvidenceQuery } from "../../lib/evidence-navigation";
import { safeContextReturnTo } from "../../lib/navigation-context";

export function ProofContextReturn() {
  const query = useEvidenceQuery();
  const destination = safeContextReturnTo(query.get("returnTo"), "/proof");
  if (destination === "/proof") return null;
  const url = new URL(destination, "https://arc.invalid");
  const label = url.pathname === "/stack" ? url.searchParams.has("skill") ? "返回原技能" : "返回技能与资料"
    : url.pathname === "/today" ? "返回今日学习"
    : url.pathname === "/path" ? "返回学习路线"
    : url.pathname === "/history" ? "返回学习历史" : "返回来源页面";
  return <Link className="text-action proof-context-return" href={destination} scroll={false}>{label}</Link>;
}
