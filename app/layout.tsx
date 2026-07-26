import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource-variable/newsreader";
import "./globals.css";

const title = "Arc. — Learn only what moves you forward";
const description = "Turn any role into an attributable technology map, a precise daily path, and proof of capability.";

export const metadata: Metadata = {
  title: { default: title, template: "%s · Arc." },
  description,
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

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
