import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RootLayout from "../../app/layout";

describe("RootLayout", () => {
  it("renders one English development notice before the page content", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <main id="main-content">Page content</main>
      </RootLayout>,
    );
    const document = new DOMParser().parseFromString(markup, "text/html");
    const notes = document.querySelectorAll("p.development-notice");
    const note = notes[0];
    const main = document.querySelector("main#main-content");
    const skipLink = document.querySelector("a.skip-link");
    if (!note || !main || !skipLink) throw new Error("RootLayout contract elements are missing");

    expect(notes).toHaveLength(1);
    expect(note.textContent).toBe("The website is currently under development.");
    expect(note.getAttribute("role")).toBe("note");
    expect(note.getAttribute("lang")).toBe("en");
    expect(skipLink.getAttribute("href")).toBe("#main-content");
    expect(note.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(skipLink.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
