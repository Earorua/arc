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
    return <p className="account-availability" role="status">Checking sign-in methods…</p>;
  }

  if (providers.length === 0) {
    return (
      <div className="account-unavailable">
        <p className="account-availability" role="status">Account sign-in is not available yet.</p>
        <p>Explore the public example to see a learning path and the work it produces.</p>
        <Link href="/showcase">Explore the showcase</Link>
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
          aria-label={`Continue with ${provider === "google" ? "Google" : "GitHub"}`}
          className="provider-action"
          disabled={activeProvider !== null}
          key={provider}
          onClick={() => void begin(provider)}
          type="button"
        >
          <span aria-hidden="true">{provider === "google" ? "G" : "GH"}</span>
          <strong>Continue with {provider === "google" ? "Google" : "GitHub"}</strong>
          <small>{activeProvider === provider ? "Opening…" : "→"}</small>
        </button>
      ))}
      {failed && (
        <p className="account-error" role="alert">
          We couldn&apos;t start sign-in. Check your connection and try again.
        </p>
      )}
      <p className="account-assurance">
        No new password needed. Google or GitHub verifies your identity; Arc. saves your account and learning progress.
      </p>
    </div>
  );
}
