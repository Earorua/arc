"use client";

import Link from "next/link";
import { safeReturnTo } from "../../lib/navigation-context";
import { usePageQuery } from "../../lib/use-page-query";

export function SetupCompletionNotice() {
  const query = usePageQuery();
  if (query.get("created") !== "1") return null;
  const requestedReturn = query.get("returnTo");
  const returnTo = requestedReturn && safeReturnTo(requestedReturn) === requestedReturn ? requestedReturn : null;
  const pathname = returnTo?.split(/[?#]/u, 1)[0];
  const label = pathname === "/stack" ? "Continue to skills and resources" : pathname === "/proof" ? "Continue to your proof" : pathname === "/coach" ? "Continue planning" : "Back to previous page";

  return <p className="workspace-notice" role="status">Your path is ready. Open Today to begin your first task.{returnTo && <> <Link href={returnTo}>{label}</Link></>}</p>;
}
