"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SignInPanel } from "../components/account/sign-in-panel";
import { authClient } from "../lib/auth-client";
import { isArcApiError } from "../lib/cloud-client";
import { safeReturnTo } from "../lib/navigation-context";
import { planningClient } from "../lib/planning-client";
import { useHydrated } from "../lib/use-hydrated";
import { authProviderSchema, type AuthProvider } from "../server/auth/policy";

export default function SignInPage() {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const search = useSearchParams();
  const { replace } = useRouter();
  const requestedNext = search.get("next");
  const destination = requestedNext && safeReturnTo(requestedNext) === requestedNext ? requestedNext : null;
  const destinationPath = destination?.split(/[?#]/u, 1)[0];
  const destinationHint = destinationPath === "/setup" ? "登录后继续设置你的学习路线。"
    : destinationPath === "/stack" ? "登录后继续查看技能与资料。"
    : destinationPath === "/proof" ? "登录后继续整理你的作品证据。"
    : destinationPath === "/coach" ? "登录后继续调整你的学习计划。"
    : "保存学习路线、每日进度与作品证据。";
  const oauthFailed = search.has("error");
  const reauthenticate = search.get("reauth") === "1";
  const userId = hydrated && !session.isPending ? session.data?.user.id : undefined;
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const [pending, setPending] = useState(true);
  const [resolutionFailure, setResolutionFailure] = useState<{ userId: string; attempt: number; expired: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const failed = resolutionFailure?.userId === userId && resolutionFailure?.attempt === attempt;
  const expired = reauthenticate || Boolean(failed && resolutionFailure?.expired);

  useEffect(() => {
    if (!userId || oauthFailed || reauthenticate) return;
    const controller = new AbortController();
    if (destination) {
      replace(destination);
      return () => controller.abort();
    }
    void planningClient.loadWorkspace(controller.signal)
      .then(() => {
        // A successful lookup can be an existing basic goal without an adaptive workspace.
        // Only the explicit missing-goal response below means setup is required.
        if (!controller.signal.aborted) replace("/today");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isArcApiError(error) && error.status === 404 && error.code === "NOT_FOUND" && error.action === undefined) {
          replace("/setup");
          return;
        }
        setResolutionFailure({ userId, attempt, expired: isArcApiError(error) && error.status === 401 });
      });
    return () => controller.abort();
  }, [attempt, destination, oauthFailed, reauthenticate, replace, userId]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/providers", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("provider availability failed");
        const payload: unknown = await response.json();
        const parsed = authProviderSchema.array().safeParse(
          typeof payload === "object" && payload !== null && "providers" in payload
            ? payload.providers
            : [],
        );
        if (!controller.signal.aborted) setProviders(parsed.success ? parsed.data : []);
      })
      .catch(() => { if (!controller.signal.aborted) setProviders([]); })
      .finally(() => { if (!controller.signal.aborted) setPending(false); });

    return () => controller.abort();
  }, []);

  return (
    <main className="sign-in-page sign-in-paper" id="main-content" tabIndex={-1} lang="zh-CN">
      <header className="sign-in-header">
        <Link className="wordmark" href="/" aria-label="Arc. 首页" lang="en">Arc.</Link>
        <Link className="sign-in-return" href={destination ?? "/"}>{destination ? "返回来源页面" : "返回首页"}</Link>
      </header>
      <section className="sign-in-composition">
        <div className="sign-in-intro">
          <p className="eyebrow">你的 Arc. 账号</p>
          <h1>登录，继续你的学习</h1>
          <p>{destinationHint}</p>
        </div>
        <div className="sign-in-actions paper-surface" aria-label="登录方式">
          <p className="section-index">选择登录方式</p>
          {oauthFailed && <p className="account-error" role="alert">登录未完成，请重试。你要返回的页面已保留。</p>}
          {expired && <p className="account-error" role="alert">登录已过期，请重新验证身份后继续。</p>}
          {userId && !oauthFailed && !expired ? failed ? <div className="sign-in-recovery">
            <p className="account-error" role="alert">已登录，暂时无法读取你的学习路线。请重试。</p>
            <button className="primary-action" onClick={() => setAttempt((value) => value + 1)} type="button">重试</button>
          </div> : <p className="account-availability" role="status">正在打开你的学习工作区…</p> : <SignInPanel
            destination={destination}
            pending={!hydrated || session.isPending || pending}
            providers={providers}
            signIn={(request) => authClient.signIn.social(request)}
          />}
          <p className="account-device-note">本设备已有的学习记录会保留。登录后如有可迁移记录，你可以选择是否导入账号。</p>
        </div>
      </section>
      <footer className="sign-in-footer">
        <Link href="/showcase">先看公开样例</Link>
        <span>作品默认私密，由你决定是否公开。</span>
      </footer>
    </main>
  );
}
