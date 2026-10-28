"use client";

import Link from "next/link";
import { useState } from "react";
import type { AuthProvider } from "../../server/auth/policy";
import { safeReturnTo, signInHref } from "../../lib/navigation-context";

type SignInRequest = {
  provider: AuthProvider;
  callbackURL: string;
  errorCallbackURL: string;
};

export function SignInPanel({
  providers,
  pending,
  signIn,
  destination,
}: {
  providers: AuthProvider[];
  pending: boolean;
  signIn: (request: SignInRequest) => Promise<unknown>;
  destination?: string | null;
}) {
  const [activeProvider, setActiveProvider] = useState<AuthProvider | null>(null);
  const [failed, setFailed] = useState(false);

  if (pending) {
    return <p className="account-availability" role="status">正在确认登录方式…</p>;
  }

  if (providers.length === 0) {
    return (
      <div className="account-unavailable">
        <p className="account-availability" role="status">账号登录暂未开放。</p>
        <p>你仍可以查看公开样例，了解学习路线与作品记录。</p>
        <Link href="/showcase">先看公开样例</Link>
      </div>
    );
  }

  async function begin(provider: AuthProvider) {
    setActiveProvider(provider);
    setFailed(false);
    try {
      const result = await signIn({
        provider,
        callbackURL: destination ? safeReturnTo(destination) : "/sign-in?complete=1",
        errorCallbackURL: destination ? `${signInHref(destination)}&error=oauth` : "/sign-in?error=oauth",
      });
      if (result && typeof result === "object" && "error" in result && result.error) {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setActiveProvider(null);
    }
  }

  return (
    <div className="provider-list">
      {providers.map((provider) => (
        <button
          aria-label={`使用 ${provider === "google" ? "Google" : "GitHub"} 继续`}
          className="provider-action"
          disabled={activeProvider !== null}
          key={provider}
          onClick={() => void begin(provider)}
          type="button"
        >
          <span aria-hidden="true">{provider === "google" ? "G" : "GH"}</span>
          <strong>使用 {provider === "google" ? "Google" : "GitHub"} 继续</strong>
          <small>{activeProvider === provider ? "正在打开…" : "→"}</small>
        </button>
      ))}
      {failed && (
        <p className="account-error" role="alert">
          暂时无法开始登录，请检查网络后重试。
        </p>
      )}
      <p className="account-assurance">
        无需另设密码。由 Google 或 GitHub 验证身份，Arc. 保存账号与学习进度。
      </p>
    </div>
  );
}
