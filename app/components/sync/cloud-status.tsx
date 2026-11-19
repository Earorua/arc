"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccountLocation } from "../account/use-account-location";
import { signInHref } from "../../lib/navigation-context";

export type CloudStatusKind =
  | "session-expired"
  | "import-failed"
  | "offline"
  | "quota"
  | "ai-disabled";

const content: Record<CloudStatusKind, { message: string; action: string }> = {
  "session-expired": {
    message: "Your session has expired. This change has not been saved to your account.",
    action: "Sign in again",
  },
  "import-failed": {
    message: "Your device records have not been imported. The originals are still saved.",
    action: "Retry import",
  },
  offline: {
    message: "Sync is unavailable. Accepted changes stay on this device; retry when your connection returns.",
    action: "Retry sync",
  },
  quota: {
    message: "You have used this period's AI allowance. You can still explore the public example.",
    action: "Explore the showcase",
  },
  "ai-disabled": {
    message: "AI services are not available yet. You can still explore the public example.",
    action: "Explore the showcase",
  },
};

export function CloudStatus({
  kind,
  onAction,
}: {
  kind: CloudStatusKind;
  onAction?: () => Promise<void> | void;
}) {
  const [pending, setPending] = useState(false);
  const location = useAccountLocation();
  const failure = kind === "session-expired" || kind === "import-failed";
  const details = content[kind];

  async function act() {
    if (!onAction || pending) return;
    setPending(true);
    try {
      await onAction();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`cloud-status cloud-status-${kind}`} role={failure ? "alert" : "status"}>
      <p>{details.message}</p>
      {kind === "session-expired" ? (
        <Link href={signInHref(location, true)}>{details.action}</Link>
      ) : kind === "quota" || kind === "ai-disabled" ? (
        <Link href="/showcase">{details.action}</Link>
      ) : (
        <button disabled={pending} onClick={() => void act()} type="button">
          {pending ? "Retrying…" : details.action}
        </button>
      )}
    </div>
  );
}
