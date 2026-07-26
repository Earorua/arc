import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/manrope";
import "@fontsource-variable/newsreader";
import "./globals.css";

const title = "Arc. — Learn only what moves you forward";
const description = "Turn any role into an attributable technology map, a precise daily path, and proof of capability.";

function safeOrigin(forwardedHost: string | null, host: string | null, forwardedProtocol: string | null) {
  const candidate = (forwardedHost ?? host ?? "localhost:3000").split(",")[0].trim();
  const safeHost = /^[a-z0-9.-]+(?::\d+)?$/i.test(candidate) ? candidate : "localhost:3000";
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : safeHost.startsWith("localhost") ? "http" : "https";

  return new URL(`${protocol}://${safeHost}`);
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const metadataBase = safeOrigin(
    requestHeaders.get("x-forwarded-host"),
    requestHeaders.get("host"),
    requestHeaders.get("x-forwarded-proto"),
  );

  return {
    metadataBase,
    title: { default: title, template: "%s · Arc." },
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: "Arc.",
      title,
      description,
      images: [{
        url: "/og.png",
        width: 1672,
        height: 941,
        alt: "Arc. — Learn only what moves you forward",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <a className="skip-link" href="#main-content">跳到主要内容</a>
        {children}
      </body>
    </html>
  );
}
