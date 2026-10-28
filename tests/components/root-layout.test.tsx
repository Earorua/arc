import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

import RootLayout from "../../app/layout";

describe("RootLayout", () => {
  it("keeps the skip link before content without the obsolete development banner", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <main id="main-content">Page content</main>
      </RootLayout>,
    );
    const document = new DOMParser().parseFromString(markup, "text/html");
    const notes = document.querySelectorAll("p.development-notice");
    const main = document.querySelector("main#main-content");
    const skipLink = document.querySelector("a.skip-link");
    if (!main || !skipLink) throw new Error("RootLayout contract elements are missing");

    expect(notes).toHaveLength(0);
    expect(skipLink.getAttribute("href")).toBe("#main-content");
    expect(skipLink.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
