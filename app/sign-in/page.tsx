"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SignInPanel } from "../components/account/sign-in-panel";
import { authClient } from "../lib/auth-client";
import { isArcApiError } from "../lib/cloud-client";
import { safeReturnTo } from "../lib/navigation-context";
import { planningClient } from "../lib/planning-client";
import { useHydrated } from "../lib/use-hydrated";
import { authProviderSchema, type AuthProvider } from "../server/auth/policy";

export default function SignInPage() {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const search = useSearchParams();
  const { replace } = useRouter();
  const requestedNext = search.get("next");
  const destination = requestedNext && safeReturnTo(requestedNext) === requestedNext ? requestedNext : null;
  const destinationPath = destination?.split(/[?#]/u, 1)[0];
  const destinationHint = destinationPath === "/setup" ? "Sign in to continue setting up your learning path."
    : destinationPath === "/stack" ? "Sign in to return to your skills and resources."
    : destinationPath === "/proof" ? "Sign in to continue organizing your work."
    : destinationPath === "/coach" ? "Sign in to continue refining your learning plan."
    : "Save your learning path, daily progress, and evidence of your work.";
  const oauthFailed = search.has("error");
  const reauthenticate = search.get("reauth") === "1";
  const userId = hydrated && !session.isPending ? session.data?.user.id : undefined;
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const [pending, setPending] = useState(true);
  const [resolutionFailure, setResolutionFailure] = useState<{ userId: string; attempt: number; expired: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const failed = resolutionFailure?.userId === userId && resolutionFailure?.attempt === attempt;
  const expired = reauthenticate || Boolean(failed && resolutionFailure?.expired);
  const showSignInPanel = !userId || oauthFailed || expired;
  const panelHasShowcaseExit = showSignInPanel && hydrated && !session.isPending && !pending && providers.length === 0;

  useEffect(() => {
    if (!userId || oauthFailed || reauthenticate) return;
    const controller = new AbortController();
    if (destination) {
      replace(destination);
      return () => controller.abort();
    }
    void planningClient.loadWorkspace(controller.signal)
      .then(() => {
        // A successful lookup can be an existing basic goal without an adaptive workspace.
        // Only the explicit missing-goal response below means setup is required.
        if (!controller.signal.aborted) replace("/today");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isArcApiError(error) && error.status === 404 && error.code === "NOT_FOUND" && error.action === undefined) {
          replace("/setup");
          return;
        }
        setResolutionFailure({ userId, attempt, expired: isArcApiError(error) && error.status === 401 });
      });
    return () => controller.abort();
  }, [attempt, destination, oauthFailed, reauthenticate, replace, userId]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/providers", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("provider availability failed");
        const payload: unknown = await response.json();
        const parsed = authProviderSchema.array().safeParse(
          typeof payload === "object" && payload !== null && "providers" in payload
            ? payload.providers
            : [],
        );
        if (!controller.signal.aborted) setProviders(parsed.success ? parsed.data : []);
      })
      .catch(() => { if (!controller.signal.aborted) setProviders([]); })
      .finally(() => { if (!controller.signal.aborted) setPending(false); });

    return () => controller.abort();
  }, []);

  return (
    <main className="sign-in-page sign-in-paper" id="main-content" tabIndex={-1} lang="en">
      <header className="sign-in-header">
        <Link className="wordmark" href="/" aria-label="Arc. home" lang="en">Arc.</Link>
        <Link className="sign-in-return" href={destination ?? "/"}>{destination ? "Back to previous page" : "Back to home"}</Link>
      </header>
      <section className="sign-in-composition">
        <div className="sign-in-intro">
          <p className="eyebrow">Your Arc. account</p>
          <h1>Sign in. Keep moving.</h1>
          <p>{destinationHint}</p>
        </div>
        <div className="sign-in-actions paper-surface" aria-label="Sign-in methods">
          <p className="section-index">Choose how to sign in</p>
          {oauthFailed && <p className="account-error" role="alert">Sign-in didn&apos;t finish. Try again; we&apos;ve kept your destination.</p>}
          {expired && <p className="account-error" role="alert">Your session has expired. Sign in again to continue.</p>}
          {userId && !oauthFailed && !expired ? failed ? <div className="sign-in-recovery">
            <p className="account-error" role="alert">You&apos;re signed in, but we couldn&apos;t load your learning path. Please try again.</p>
            <button className="primary-action" onClick={() => setAttempt((value) => value + 1)} type="button">Retry</button>
          </div> : <p className="account-availability" role="status">Opening your workspace…</p> : <SignInPanel
            destination={destination}
            pending={!hydrated || session.isPending || pending}
            providers={providers}
            signIn={(request) => authClient.signIn.social(request)}
          />}
          <p className="account-device-note">Your learning records stay on this device. After signing in, you can choose whether to import eligible records into your account.</p>
        </div>
      </section>
      <footer className="sign-in-footer">
        {!panelHasShowcaseExit && <Link href="/showcase">Explore the showcase</Link>}
        <span>Your work is private until you choose to share it.</span>
      </footer>
    </main>
  );
}
