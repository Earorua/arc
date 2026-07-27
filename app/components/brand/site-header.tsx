"use client";

import Link from "next/link";
import { useState } from "react";
import { AccountMenu } from "../account/account-menu";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header" lang="en">
      <Link className="wordmark" href="/" aria-label="Arc. home">Arc.</Link>
      <div className="public-actions">
        <button
          aria-controls="public-navigation"
          aria-expanded={menuOpen}
          className="public-menu"
          onClick={() => setMenuOpen((current) => !current)}
          type="button"
        >
          Explore
        </button>
        <nav className="public-nav" id="public-navigation" aria-label="Public navigation">
          <Link href="/method">Method</Link>
          <Link href="/intelligence">Intelligence</Link>
        </nav>
        <div className="header-end">
          <Link className="header-cta" href="/setup">Build my path</Link>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
