"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { authClient } from "../../lib/auth-client";
import { safeReturnTo, signInHref } from "../../lib/navigation-context";
import { useHydrated } from "../../lib/use-hydrated";
import { useAccountLocation } from "./use-account-location";

export function AccountBoundary({
  destination,
  title = "登录后继续你的学习",
  description = "在账号中保存学习路线、进度与作品证据。",
  children,
}: {
  destination: string;
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const location = useAccountLocation();
  if (!hydrated || session.isPending) {
    return <section className="account-boundary account-boundary-pending" aria-label="账号状态"><p role="status">正在确认账号…</p></section>;
  }
  if (session.data?.user) return <div key={session.data.user.id} className="account-boundary-content">{children}</div>;

  const next = destination === location.split(/[?#]/u, 1)[0]
    ? safeReturnTo(location, destination)
    : safeReturnTo(destination);

  return <section className="account-boundary paper-surface" aria-label="登录后继续">
    <p className="section-index">你的学习工作区</p>
    <h1>{title}</h1>
    <p className="account-boundary-description">{description}</p>
    <div className="account-boundary-actions">
      <Link className="primary-action" href={signInHref(next)}>登录并继续</Link>
      <Link className="text-action" href="/showcase">先看公开样例</Link>
    </div>
    <p className="account-device-note">本设备已有的学习记录会保留。登录后如有可迁移记录，你可以选择是否导入账号。</p>
  </section>;
}
