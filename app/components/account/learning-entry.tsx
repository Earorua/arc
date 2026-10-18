"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { authClient } from "../../lib/auth-client";

export function LearningEntry({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const router = useRouter();
  const signedIn = !isPending && Boolean(data?.user);

  useEffect(() => {
    if (signedIn) router.replace("/today");
  }, [router, signedIn]);

  if (signedIn) {
    return (
      <main id="main-content" className="sign-in-page" lang="en">
        <p role="status">Opening your learning workspace…</p>
        <Link className="primary-action" href="/today">Continue learning →</Link>
      </main>
    );
  }
  return children;
}
