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
    message: "登录已过期，这次更改尚未保存到账号。",
    action: "重新登录",
  },
  "import-failed": {
    message: "本设备的记录尚未导入，原有记录已保留。",
    action: "重试导入",
  },
  offline: {
    message: "暂时无法同步。已接收的更改保留在本设备，连接恢复后可以重试。",
    action: "重新同步",
  },
  quota: {
    message: "本期智能服务额度已用完。你可以先查看公开样例。",
    action: "查看公开样例",
  },
  "ai-disabled": {
    message: "智能服务暂未开放，你仍可查看公开样例。",
    action: "查看公开样例",
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
          {pending ? "正在重试…" : details.action}
        </button>
      )}
    </div>
  );
}
