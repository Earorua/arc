"use client";

import Link from "next/link";
import { useEvidenceQuery } from "../../lib/evidence-navigation";
import { safeContextReturnTo } from "../../lib/navigation-context";

export function ProofContextReturn() {
  const query = useEvidenceQuery();
  const destination = safeContextReturnTo(query.get("returnTo"), "/proof");
  if (destination === "/proof") return null;
  const url = new URL(destination, "https://arc.invalid");
  const label = url.pathname === "/stack" ? url.searchParams.has("skill") ? "Back to skill" : "Back to skills and resources"
    : url.pathname === "/today" ? "Back to Today"
    : url.pathname === "/path" ? "Back to learning path"
    : url.pathname === "/history" ? "Back to learning history" : "Back to previous page";
  return <Link className="text-action proof-context-return" href={destination} scroll={false}>{label}</Link>;
}
