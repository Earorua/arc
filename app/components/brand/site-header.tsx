"use client";

import Link from "next/link";
import { useState } from "react";
import { AccountMenu } from "../account/account-menu";
import { authClient } from "../../lib/auth-client";
import { useHydrated } from "../../lib/use-hydrated";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { data, isPending } = authClient.useSession();
  const hydrated = useHydrated();
  const signedIn = hydrated && !isPending && Boolean(data?.user);

  return (
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label="Arc. home">Arc.</Link>
      <div className="public-actions">
        <button
          aria-controls="public-navigation"
          aria-expanded={menuOpen}
          className="public-menu"
          onClick={() => setMenuOpen((current) => !current)}
          type="button"
        >
          浏览
        </button>
        <nav className="public-nav" id="public-navigation" aria-label="网站导航">
          <Link href="/method">学习方法</Link>
          <Link href="/coach">学习规划师</Link>
          <Link href="/showcase">产品样例</Link>
        </nav>
        <div className="header-end">
          {signedIn && <Link className="header-cta" href="/today">继续学习</Link>}
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
