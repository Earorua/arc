"use client";

import Link from "next/link";
import { useState } from "react";

export type CloudStatusKind =
  | "session-expired"
  | "import-failed"
  | "offline"
  | "quota"
  | "ai-disabled";

const content: Record<CloudStatusKind, { message: string; action: string }> = {
  "session-expired": {
    message: "Your Arc. session expired before this change could reach cloud state.",
    action: "Sign in again",
  },
  "import-failed": {
    message: "Device work was not imported. Its local copy is still intact.",
    action: "Retry import",
  },
  offline: {
    message: "Cloud sync is paused. Accepted changes stay queued on this device.",
    action: "Retry sync",
  },
  quota: {
    message: "The current intelligence allowance has been reached. No paid call was made.",
    action: "Continue with sample",
  },
  "ai-disabled": {
    message: "Live intelligence is not enabled. The deterministic learning sample remains available.",
    action: "Continue with sample",
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
        <Link href="/sign-in">{details.action}</Link>
      ) : kind === "quota" || kind === "ai-disabled" ? (
        <Link href="/today">{details.action}</Link>
      ) : (
        <button disabled={pending} onClick={() => void act()} type="button">
          {pending ? "Working…" : details.action}
        </button>
      )}
    </div>
  );
}
