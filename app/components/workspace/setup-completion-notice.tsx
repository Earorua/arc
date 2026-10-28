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
  const label = pathname === "/stack" ? "继续查看技能与资料" : pathname === "/proof" ? "继续整理作品" : pathname === "/coach" ? "继续学习规划" : "返回来源页面";

  return <p className="workspace-notice" role="status">路线已准备好。进入今日学习，从第一项任务开始。{returnTo && <> <Link href={returnTo}>{label}</Link></>}</p>;
}
