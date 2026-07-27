"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInPanel } from "../components/account/sign-in-panel";
import { authClient } from "../lib/auth-client";
import { authProviderSchema, type AuthProvider } from "../server/auth/policy";

export default function SignInPage() {
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const [pending, setPending] = useState(true);

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
        setProviders(parsed.success ? parsed.data : []);
      })
      .catch(() => setProviders([]))
      .finally(() => setPending(false));

    return () => controller.abort();
  }, []);

  return (
    <main className="sign-in-page" id="main-content" lang="en">
      <header className="sign-in-header">
        <Link className="wordmark" href="/" aria-label="Arc. home">Arc.</Link>
        <Link href="/today">Explore sample</Link>
      </header>
      <section className="sign-in-composition">
        <div className="sign-in-intro">
          <p className="eyebrow">Independent Arc. account</p>
          <h1>Your path, wherever you pick it up.</h1>
          <p>
            Sign in only when you want Arc. to save progress, synchronize learning, and build a durable capability profile.
          </p>
        </div>
        <div className="sign-in-actions" aria-label="Account providers">
          <p className="section-index">01 / Choose an identity</p>
          <SignInPanel
            pending={pending}
            providers={providers}
            signIn={(request) => authClient.signIn.social(request)}
          />
        </div>
      </section>
      <footer className="sign-in-footer">
        <span>Public value first.</span>
        <span>Private progress by default.</span>
        <span>No password to remember.</span>
      </footer>
    </main>
  );
}
