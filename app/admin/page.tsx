"use client";

import Link from "next/link";
import { ArcHomeLink } from "../components/brand/arc-home-link";
import { useEffect, useState } from "react";
import type { AdminHealthSnapshot } from "../server/admin/repository";
import { signInHref } from "../lib/navigation-context";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; snapshot: AdminHealthSnapshot }
  | { status: "failed"; signIn: boolean; forbidden: boolean };

export function AdminHealthView({ snapshot }: { snapshot: AdminHealthSnapshot }) {
  return (
    <section className="admin-grid" aria-label="Arc operational health">
      <article className="admin-card admin-service">
        <p className="section-index">01 / System</p>
        <h2>Service</h2>
        <strong>{snapshot.service === "ok" ? "Operating normally" : "Needs attention"}</strong>
      </article>
      <article className="admin-card">
        <p className="section-index">02 / Control</p>
        <h2>AI switch</h2>
        <strong>{snapshot.ai.enabled ? "Enabled" : "Disabled"}</strong>
      </article>
      <article className="admin-card">
        <p className="section-index">03 / Today</p>
        <h2>Usage</h2>
        <strong>{snapshot.ai.callsToday} calls / {snapshot.ai.acceptedToday} accepted</strong>
        <span>{snapshot.ai.budgetUnitsToday} budget units</span>
      </article>
      <article className="admin-card">
        <p className="section-index">04 / Transfer</p>
        <h2>Migrations</h2>
        <strong>{snapshot.migrations.pending} pending / {snapshot.migrations.failed24h} failed / {snapshot.migrations.completed24h} completed</strong>
        <span>Last 24 hours</span>
      </article>
      <article className="admin-card admin-failures">
        <p className="section-index">05 / Diagnostics</p>
        <h2>Recent failures</h2>
        {snapshot.failures.length === 0 ? (
          <p>No sanitized failures in the last 24 hours.</p>
        ) : (
          <ol>
            {snapshot.failures.map((failure) => (
              <li key={`${failure.requestId}:${failure.occurredAt}`}>
                <div><strong>{failure.code}</strong><span>{failure.route}</span></div>
                <small>{failure.requestId} · {failure.occurredAt}</small>
              </li>
            ))}
          </ol>
        )}
      </article>
    </section>
  );
}

export default function AdminPage() {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/health", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw Object.assign(new Error("Admin health unavailable."), { status: response.status });
        return response.json() as Promise<{ health: AdminHealthSnapshot }>;
      })
      .then(({ health }) => {
        if (active) setLoad({ status: "ready", snapshot: health });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const status = typeof error === "object" && error !== null && "status" in error
          ? Number((error as { status: unknown }).status)
          : 0;
        setLoad({ status: "failed", signIn: status === 401, forbidden: status === 403 });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main id="main-content" tabIndex={-1} className="admin-page">
      <header className="admin-header">
        <ArcHomeLink />
        <span>Site administration · Read only</span>
      </header>
      <div className="admin-intro">
        <p className="eyebrow">Operational health</p>
        <h1>Site health at a glance</h1>
        <p>Review service status, usage, migrations, and recent failures.</p>
      </div>
      {load.status === "loading" && <p className="admin-loading" role="status">Loading site health…</p>}
      {load.status === "failed" && (
        <div className="cloud-status" role="alert">
          <p>{load.signIn ? "Sign in to view site administration." : load.forbidden ? "This account does not have administrator access." : "Site health is temporarily unavailable."}</p>
          <Link href={load.signIn ? signInHref("/admin", true) : "/"}>{load.signIn ? "Sign in and return" : "Back to home"}</Link>
        </div>
      )}
      {load.status === "ready" && <AdminHealthView snapshot={load.snapshot} />}
    </main>
  );
}
