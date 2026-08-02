"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEventHandler,
  type KeyboardEventHandler,
  type RefObject,
} from "react";
import type { AuthProvider } from "../../server/auth/policy";
import type { AccountLinkStatus } from "../../server/account-link/contracts";

function providerLabel(provider: AuthProvider) {
  return provider === "google" ? "Google" : "GitHub";
}

function formatDeadline(expiresAt: string | null) {
  if (!expiresAt) return null;
  const deadline = new Date(expiresAt);
  if (Number.isNaN(deadline.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(deadline);
}

export function AccountLinkPanel({
  expiresAt,
  sourceProvider,
  targetProvider,
  stage,
  onCancel,
  onSubmit,
  returnFocusRef,
}: {
  sourceProvider: AuthProvider;
  targetProvider: AuthProvider;
  stage: AccountLinkStatus | null;
  expiresAt: string | null;
  onCancel: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sourceLabel = providerLabel(sourceProvider);
  const targetLabel = providerLabel(targetProvider);
  const verified = stage === "verified";
  const deadline = formatDeadline(expiresAt);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const submit: FormEventHandler<HTMLFormElement> = (event) => {
    if (submitting) {
      event.preventDefault();
      return;
    }
    setSubmitting(true);
    onSubmit(event);
  };

  const cancel = () => {
    onCancel();
    returnFocusRef.current?.focus();
  };

  const containFocus: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key !== "Tab") return;

    const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), a[href], input:not([type='hidden']):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
    ) ?? []);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) {
      event.preventDefault();
      headingRef.current?.focus();
      return;
    }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      aria-labelledby={headingId}
      aria-modal="true"
      className="account-link-panel"
      onKeyDown={containFocus}
      ref={panelRef}
      role="dialog"
    >
      <h2 id={headingId} ref={headingRef} tabIndex={-1}>Connect {targetLabel}</h2>
      <form
        action={verified ? "/api/account-link/continue" : "/api/account-link/start"}
        method="post"
        onSubmit={submit}
      >
        {verified ? (
          <>
            <p><strong>Identity verified</strong></p>
            <p>Continue within five minutes to connect {targetLabel}.</p>
            {deadline && expiresAt && (
              <p className="account-link-deadline">
                Verification deadline: <time dateTime={expiresAt}>{deadline}</time>.
              </p>
            )}
          </>
        ) : (
          <>
            <input name="targetProvider" type="hidden" value={targetProvider} />
            <p>
              You&apos;re signed in with {sourceLabel}. Verify {sourceLabel} before linking {targetLabel}.
            </p>
          </>
        )}
        <div className="account-link-actions">
          <button disabled={submitting} type="submit">
            {verified ? `Continue to ${targetLabel}` : `Verify ${sourceLabel}`}
          </button>
          <button disabled={submitting} onClick={cancel} type="button">Cancel</button>
        </div>
      </form>
    </div>
  );
}
