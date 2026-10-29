"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AccountMenu } from "../account/account-menu";
import { authClient } from "../../lib/auth-client";
import { useHydrated } from "../../lib/use-hydrated";

export function SiteHeader({ current }: { current?: "home" | "method" | "showcase" } = {}) {
  const pathname = usePathname();
  const activePath = current ? current === "home" ? "/" : `/${current}` : pathname;
  const [menuOpen, setMenuOpen] = useState(false);
  const { data, isPending } = authClient.useSession();
  const hydrated = useHydrated();
  const signedIn = hydrated && !isPending && Boolean(data?.user);

  return (
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label="Arc. home" aria-current={activePath === "/" ? "page" : undefined}>Arc.</Link>
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
        <nav className="public-nav" id="public-navigation" aria-label="网站导航" data-open={menuOpen}>
          <Link href="/method" aria-current={activePath === "/method" ? "page" : undefined} onClick={() => setMenuOpen(false)}>学习方法</Link>
          <Link href="/showcase" aria-current={activePath === "/showcase" ? "page" : undefined} onClick={() => setMenuOpen(false)}>产品样例</Link>
        </nav>
        <div className="header-end">
          {signedIn && activePath !== "/" && <Link className="header-cta" href="/today">学习工作区</Link>}
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
