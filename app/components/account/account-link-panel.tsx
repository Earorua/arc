"use client";

import { useState, type FormEventHandler } from "react";
import type { AuthProvider } from "../../server/auth/policy";
import type { AccountLinkStatus } from "../../server/account-link/contracts";

function providerLabel(provider: AuthProvider) {
  return provider === "google" ? "Google" : "GitHub";
}

export function AccountLinkPanel({
  sourceProvider,
  targetProvider,
  stage,
  onCancel,
  onSubmit,
}: {
  sourceProvider: AuthProvider;
  targetProvider: AuthProvider;
  stage: AccountLinkStatus | null;
  expiresAt: string | null;
  onCancel: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const sourceLabel = providerLabel(sourceProvider);
  const targetLabel = providerLabel(targetProvider);

  const submit: FormEventHandler<HTMLFormElement> = (event) => {
    if (submitting) {
      event.preventDefault();
      return;
    }
    setSubmitting(true);
    onSubmit(event);
  };

  return (
    <div className="account-link-panel">
      {stage === "verified" ? (
        <form action="/api/account-link/continue" method="post" onSubmit={submit}>
          <strong>Identity verified</strong>
          <p>Continue within five minutes to connect {targetLabel}.</p>
          <button disabled={submitting} type="submit">Continue to {targetLabel}</button>
        </form>
      ) : (
        <form action="/api/account-link/start" method="post" onSubmit={submit}>
          <input name="targetProvider" type="hidden" value={targetProvider} />
          <p>You&apos;re signed in with {sourceLabel}. Verify {sourceLabel} before linking {targetLabel}.</p>
          <button disabled={submitting} type="submit">Verify {sourceLabel}</button>
        </form>
      )}
      <button disabled={submitting} onClick={onCancel} type="button">Cancel</button>
    </div>
  );
}
