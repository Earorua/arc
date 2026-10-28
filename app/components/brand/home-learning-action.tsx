"use client";

import Link from "next/link";
import { authClient } from "../../lib/auth-client";
import { useHydrated } from "../../lib/use-hydrated";

export function HomeLearningAction() {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const signedIn = hydrated && !session.isPending && !session.error && Boolean(session.data?.user);
  return <Link className="primary-action" href={signedIn ? "/today" : "/setup"} lang="zh-CN">
    {signedIn ? "继续学习" : "建立我的学习路线"} <span aria-hidden="true">↗</span>
  </Link>;
}
