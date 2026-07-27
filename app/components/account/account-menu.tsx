"use client";

import Link from "next/link";
import { authClient } from "../../lib/auth-client";

export function AccountMenu() {
  const { data, isPending } = authClient.useSession();

  if (isPending) {
    return <span className="account-pending" aria-label="Checking account">•••</span>;
  }

  if (!data?.user) {
    return <Link className="account-link" href="/sign-in">Sign in</Link>;
  }

  return (
    <details className="account-menu">
      <summary>{data.user.name}</summary>
      <div className="account-popover">
        <strong>Signed in as {data.user.name}</strong>
        <span>{data.user.email}</span>
        <button onClick={() => void authClient.signOut()} type="button">Sign out</button>
      </div>
    </details>
  );
}
