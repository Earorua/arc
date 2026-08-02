"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authClient } from "../../lib/auth-client";
import {
  safeAccountLinkStatusSchema,
  type AccountLinkStatus,
} from "../../server/account-link/contracts";
import { authProviderSchema, type AuthProvider } from "../../server/auth/policy";
import { AccountLinkPanel } from "./account-link-panel";

type AccountNotice = {
  kind: "status" | "alert";
  message: string;
};

type ConnectionState = {
  userId: string;
  providers: AuthProvider[];
  connectedProviders: AuthProvider[];
};

type LinkStatusState = {
  userId: string;
  stage: AccountLinkStatus | null;
  targetProvider: AuthProvider | null;
  expiresAt: string | null;
};

type AccountLinkResult = "complete" | "verified" | "expired" | "cancelled" | "conflict" | "error";

function providerLabel(provider: AuthProvider) {
  return provider === "google" ? "Google" : "GitHub";
}

function readAccountLinkResult(): AccountLinkResult | null {
  if (typeof window === "undefined") return null;
  const result = new URLSearchParams(window.location.search).get("link");
  switch (result) {
    case "complete":
    case "verified":
    case "expired":
    case "cancelled":
    case "conflict":
    case "error":
      return result;
    default:
      return null;
  }
}

function accountLinkNotice(result: AccountLinkResult, target: AuthProvider | null): AccountNotice {
  if (result === "complete" && target) {
    return {
      kind: "status",
      message: `${providerLabel(target)} connected. You can now sign in with either provider.`,
    };
  }
  if (result === "verified") {
    return { kind: "status", message: "Identity verified. Continue within five minutes." };
  }
  if (result === "expired") {
    return { kind: "alert", message: "Verification expired. Start again." };
  }
  if (result === "cancelled") {
    return { kind: "alert", message: "Connection cancelled. Nothing changed." };
  }
  if (result === "conflict") {
    return {
      kind: "alert",
      message: "This sign-in method can't be connected to this account.",
    };
  }
  return {
    kind: "alert",
    message: "We couldn't connect this sign-in method. Nothing changed.",
  };
}

async function readConfiguredProviders(signal: AbortSignal) {
  const response = await fetch("/api/auth/providers", {
    credentials: "same-origin",
    method: "GET",
    signal,
  });
  if (!response.ok) throw new Error("provider availability failed");
  const payload: unknown = await response.json();
  const parsed = authProviderSchema.array().safeParse(
    typeof payload === "object" && payload !== null && "providers" in payload
      ? payload.providers
      : [],
  );
  if (!parsed.success) throw new Error("invalid provider availability");
  return parsed.data;
}

async function readAccountLinkStatus(signal: AbortSignal) {
  const response = await fetch("/api/account-link/status", {
    credentials: "same-origin",
    method: "GET",
    signal,
  });
  if (!response.ok) throw new Error("account link status failed");
  const parsed = safeAccountLinkStatusSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("invalid account link status");
  return parsed.data;
}

function connectedProviders(accountsResult: unknown): AuthProvider[] {
  if (!accountsResult || typeof accountsResult !== "object") {
    throw new Error("linked accounts unavailable");
  }
  const result = accountsResult as { data?: unknown; error?: unknown };
  if (result.error || !Array.isArray(result.data)) {
    throw new Error("linked accounts unavailable");
  }
  return Array.from(new Set(result.data.flatMap((account: unknown) => {
    const providerId = account && typeof account === "object" && "providerId" in account
      ? account.providerId
      : null;
    const parsed = authProviderSchema.safeParse(providerId);
    return parsed.success ? [parsed.data] : [];
  })));
}

export function AccountMenu() {
  const { data, isPending } = authClient.useSession();
  const userId = data?.user?.id;
  const [connectionState, setConnectionState] = useState<ConnectionState | null>(null);
  const [linkStatusState, setLinkStatusState] = useState<LinkStatusState | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<AuthProvider | null>(null);
  const [notice, setNotice] = useState<AccountNotice | null>(null);
  const currentConnections = connectionState?.userId === userId ? connectionState : null;
  const currentLinkStatus = linkStatusState?.userId === userId ? linkStatusState : null;
  const providers = currentConnections?.providers ?? [];
  const connected = currentConnections?.connectedProviders ?? [];
  const connectionsPending = Boolean(data?.user && !currentConnections);
  const sourceProvider = selectedTarget
    ? connected.find((provider) => provider !== selectedTarget) ?? null
    : null;

  useEffect(() => {
    if (isPending || !userId || typeof window === "undefined") return;

    const callbackResult = readAccountLinkResult();
    if (callbackResult) {
      const search = new URLSearchParams(window.location.search);
      search.delete("link");
      search.delete("error");
      search.delete("error_description");
      const query = search.toString();
      const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", cleanUrl);
    }

    const controller = new AbortController();
    let cancelled = false;

    void Promise.all([
      readConfiguredProviders(controller.signal),
      authClient.listAccounts(),
      readAccountLinkStatus(controller.signal),
    ])
      .then(async ([configured, accountsResult, linkStatus]) => {
        if (cancelled) return;
        const initialConnected = connectedProviders(accountsResult);
        setConnectionState({
          userId,
          providers: Array.from(new Set([...configured, ...initialConnected])),
          connectedProviders: initialConnected,
        });
        setLinkStatusState({ userId, ...linkStatus });

        if (linkStatus.stage === "verified" && linkStatus.targetProvider) {
          setSelectedTarget(linkStatus.targetProvider);
        }

        const outcome = callbackResult === "error" && linkStatus.stage === "expired"
          ? "expired"
          : callbackResult;
        if (outcome) {
          setNotice(accountLinkNotice(outcome, linkStatus.targetProvider));
        }

        if (
          outcome === "complete"
          && linkStatus.stage === "completed"
          && linkStatus.targetProvider
        ) {
          const refreshedConnected = connectedProviders(await authClient.listAccounts());
          if (cancelled) return;
          setConnectionState({
            userId,
            providers: Array.from(new Set([...configured, ...refreshedConnected])),
            connectedProviders: refreshedConnected,
          });
        }
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) {
          setConnectionState({ userId, providers: [], connectedProviders: [] });
          setLinkStatusState({
            userId,
            stage: null,
            targetProvider: null,
            expiresAt: null,
          });
          if (callbackResult) {
            setNotice(accountLinkNotice(callbackResult, null));
          }
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isPending, userId]);

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
              const isConnected = connected.includes(provider);
              return (
                <div className="account-connection" key={provider}>
                  {isConnected ? (
                    <span>{label} connected</span>
                  ) : (
                    <button
                      onClick={() => {
                        setNotice(null);
                        setSelectedTarget(provider);
                      }}
                      type="button"
                    >
                      Link {label}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {selectedTarget && sourceProvider && (
            <AccountLinkPanel
              expiresAt={currentLinkStatus?.expiresAt ?? null}
              onCancel={() => setSelectedTarget(null)}
              onSubmit={() => setNotice(null)}
              sourceProvider={sourceProvider}
              stage={currentLinkStatus?.targetProvider === selectedTarget
                ? currentLinkStatus.stage
                : null}
              targetProvider={selectedTarget}
            />
          )}
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
