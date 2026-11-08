import type { Metadata } from "next";
import "@fontsource-variable/jost";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource-variable/newsreader";
import "@fontsource-variable/newsreader/wght-italic.css";
import "./globals.css";
import "./components/agents/agents.css";
import "./components/today/today-refinement.css";
import "./components/setup/setup-refinement.css";
import "./components/workspace/workspace-refinement.css";
import "./ui-refinement.css";
import "./discovery-theme.css";
import "./experience-theme.css";
import { AgentPageFrame, LearningAgentsProvider } from "./components/agents/agent-context";
import { AgentCompanion } from "./components/agents/agent-companion";

const title = "Arc. — Learn only what moves you forward";
const description = "Turn any role into an attributable technology map, a precise daily path, and proof of capability.";
const siteUrl = new URL("https://arcmaps.net");
const socialImageAlt = "Arc. — Learn only what moves you forward";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: title, template: "%s · Arc." },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Arc.",
    url: "/",
    title,
    description,
    images: [{
      url: "/og.png",
      width: 1672,
      height: 941,
      alt: socialImageAlt,
    }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [{ url: "/og.png", alt: socialImageAlt }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg" />
      </head>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <LearningAgentsProvider>
          <AgentPageFrame>{children}</AgentPageFrame>
          <AgentCompanion />
        </LearningAgentsProvider>
      </body>
    </html>
  );
}
