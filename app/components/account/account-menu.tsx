"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authClient } from "../../lib/auth-client";
import { authProviderSchema, type AuthProvider } from "../../server/auth/policy";

type AccountNotice = {
  kind: "status" | "alert";
  message: string;
};

type ConnectionState = {
  userId: string;
  providers: AuthProvider[];
  connectedProviders: AuthProvider[];
};

function providerLabel(provider: AuthProvider) {
  return provider === "google" ? "Google" : "GitHub";
}

function readAccountNotice(): AccountNotice | null {
  if (typeof window === "undefined") return null;
  const search = new URLSearchParams(window.location.search);
  if (search.get("link") === "complete") {
    return { kind: "status", message: "Sign-in connection updated." };
  }
  if (search.get("link") !== "error") return null;
  return {
    kind: "alert",
    message: search.get("error") === "account_already_linked_to_different_user"
      ? "That sign-in is already connected to another Arc. account. Nothing was changed."
      : "Connection was not completed. Nothing was changed. Try again.",
  };
}

export function AccountMenu() {
  const { data, isPending } = authClient.useSession();
  const userId = data?.user?.id;
  const [connectionState, setConnectionState] = useState<ConnectionState | null>(null);
  const [activeProvider, setActiveProvider] = useState<AuthProvider | null>(null);
  const [notice, setNotice] = useState<AccountNotice | null>(readAccountNotice);
  const currentConnections = connectionState?.userId === userId ? connectionState : null;
  const providers = currentConnections?.providers ?? [];
  const connectedProviders = currentConnections?.connectedProviders ?? [];
  const connectionsPending = Boolean(data?.user && !currentConnections);

  useEffect(() => {
    if (isPending || !userId || typeof window === "undefined") return;

    const search = new URLSearchParams(window.location.search);
    const linkResult = search.get("link");
    if (linkResult !== "complete" && linkResult !== "error") return;

    search.delete("link");
    search.delete("error");
    search.delete("error_description");
    const cleanUrl = `${window.location.pathname}${search.size > 0 ? `?${search}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", cleanUrl);
  }, [userId, isPending]);

  useEffect(() => {
    if (!userId) return;

    const controller = new AbortController();
    let cancelled = false;

    void Promise.all([
      fetch("/api/auth/providers", {
        credentials: "same-origin",
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error("provider availability failed");
        const payload: unknown = await response.json();
        const parsed = authProviderSchema.array().safeParse(
          typeof payload === "object" && payload !== null && "providers" in payload
            ? payload.providers
            : [],
        );
        if (!parsed.success) throw new Error("invalid provider availability");
        return parsed.data;
      }),
      authClient.listAccounts(),
    ])
      .then(([configured, accountsResult]) => {
        if (cancelled) return;
        if (accountsResult.error) throw new Error("linked accounts unavailable");
        const connected = (accountsResult.data ?? []).flatMap((account) => {
          const parsed = authProviderSchema.safeParse(account.providerId);
          return parsed.success ? [parsed.data] : [];
        });
        setConnectionState({
          userId,
          providers: Array.from(new Set([...configured, ...connected])),
          connectedProviders: Array.from(new Set(connected)),
        });
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) {
          setConnectionState({ userId, providers: [], connectedProviders: [] });
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [userId]);

  async function linkProvider(provider: AuthProvider) {
    setActiveProvider(provider);
    setNotice(null);
    try {
      const result = await authClient.linkSocial({
        provider,
        callbackURL: "/today?link=complete",
        errorCallbackURL: "/today?link=error",
      });
      if (result.error) throw new Error("link failed");
    } catch {
      setNotice({ kind: "alert", message: "Connection could not start. Try again." });
    } finally {
      setActiveProvider(null);
    }
  }

  if (isPending) {
    return <span className="account-pending" aria-label="Checking account">•••</span>;
  }

  if (!data?.user) {
    return <Link className="account-link" href="/sign-in">Sign in</Link>;
  }

  return (
    <div className="account-control">
      <details className="account-menu">
        <summary>{data.user.name}</summary>
        <div className="account-popover">
          <strong>Signed in as {data.user.name}</strong>
          <span>{data.user.email}</span>
          <div className="account-connections" aria-label="Sign-in connections">
            <p>Sign-in connections</p>
            {connectionsPending && <span>Checking connections…</span>}
            {!connectionsPending && providers.length === 0 && (
              <span>Connections are temporarily unavailable.</span>
            )}
            {!connectionsPending && providers.map((provider) => {
              const label = providerLabel(provider);
              const connected = connectedProviders.includes(provider);
              return (
                <div className="account-connection" key={provider}>
                  {connected ? (
                    <span>{label} connected</span>
                  ) : (
                    <button
                      disabled={activeProvider !== null}
                      onClick={() => void linkProvider(provider)}
                      type="button"
                    >
                      {activeProvider === provider ? `Opening ${label}…` : `Link ${label}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button className="account-sign-out" onClick={() => void authClient.signOut()} type="button">
            Sign out
          </button>
        </div>
      </details>
      {notice && (
        <div className={`account-link-notice account-link-notice-${notice.kind}`}>
          <p role={notice.kind}>{notice.message}</p>
          <button aria-label="Dismiss account message" onClick={() => setNotice(null)} type="button">×</button>
        </div>
      )}
    </div>
  );
}
