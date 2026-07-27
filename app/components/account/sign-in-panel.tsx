"use client";

import Link from "next/link";
import { useState } from "react";
import type { AuthProvider } from "../../server/auth/policy";

type SignInRequest = {
  provider: AuthProvider;
  callbackURL: string;
  errorCallbackURL: string;
};

export function SignInPanel({
  providers,
  pending,
  signIn,
}: {
  providers: AuthProvider[];
  pending: boolean;
  signIn: (request: SignInRequest) => Promise<unknown>;
}) {
  const [activeProvider, setActiveProvider] = useState<AuthProvider | null>(null);
  const [failed, setFailed] = useState(false);

  if (pending) {
    return <p className="account-availability" role="status">Checking account availability…</p>;
  }

  if (providers.length === 0) {
    return (
      <div className="account-unavailable">
        <p className="account-availability" role="status">Account access is being prepared.</p>
        <p>You can still use every part of the complete, device-local sample.</p>
        <Link href="/today">Explore the complete sample</Link>
      </div>
    );
  }

  async function begin(provider: AuthProvider) {
    setActiveProvider(provider);
    setFailed(false);
    try {
      await signIn({
        provider,
        callbackURL: "/today",
        errorCallbackURL: "/sign-in?error=oauth",
      });
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
          Sign-in could not start. Check your connection and try again.
        </p>
      )}
      <p className="account-assurance">
        No Arc. password. Your provider verifies identity; Arc. keeps only the account and learning state needed to synchronize your path.
      </p>
    </div>
  );
}
