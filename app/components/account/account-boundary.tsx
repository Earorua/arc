"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { authClient } from "../../lib/auth-client";
import { safeReturnTo, signInHref } from "../../lib/navigation-context";
import { useHydrated } from "../../lib/use-hydrated";
import { useAccountLocation } from "./use-account-location";

export function AccountBoundary({
  destination,
  title = "Sign in to continue learning",
  description = "Save your path, progress, and work in your account.",
  children,
}: {
  destination: string;
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const location = useAccountLocation();
  if (!hydrated || session.isPending) {
    return <section className="account-boundary account-boundary-pending" aria-label="Account status"><p role="status">Checking your account…</p></section>;
  }
  if (session.data?.user) return <div key={session.data.user.id} className="account-boundary-content">{children}</div>;

  const next = destination === location.split(/[?#]/u, 1)[0]
    ? safeReturnTo(location, destination)
    : safeReturnTo(destination);

  return <section className="account-boundary paper-surface" aria-label="Sign in to continue">
    <p className="section-index">Your learning workspace</p>
    <h1>{title}</h1>
    <p className="account-boundary-description">{description}</p>
    <div className="account-boundary-actions">
      <Link className="primary-action" href={signInHref(next)}>Sign in and continue</Link>
      <Link className="text-action" href="/showcase">Explore the showcase</Link>
    </div>
    <p className="account-device-note">Your learning records stay on this device. After signing in, you can choose whether to import eligible records into your account.</p>
  </section>;
}
