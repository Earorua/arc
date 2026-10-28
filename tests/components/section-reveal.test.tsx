import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SectionReveal } from "../../app/components/brand/section-reveal";

let reveal: IntersectionObserverCallback;
const disconnect = vi.fn();
const observe = vi.fn();
beforeEach(() => {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 2000 } as DOMRect);
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { reveal = callback; }
    observe = observe;
    disconnect = disconnect;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("keeps content in the document and reveals it once when it enters the viewport", () => {
  render(<SectionReveal><a href="/setup">创建路线</a></SectionReveal>);
  const section = screen.getByRole("link").parentElement!;
  expect(section).toHaveAttribute("data-reveal", "pending");
  act(() => reveal([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver));
  expect(section).not.toHaveAttribute("data-reveal");
  expect(disconnect).toHaveBeenCalled();
});

it("shows content immediately when reduced motion is requested", () => {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  render(<SectionReveal><p>学习内容</p></SectionReveal>);
  expect(screen.getByText("学习内容").parentElement).not.toHaveAttribute("data-reveal");
  expect(observe).not.toHaveBeenCalled();
});

it("disconnects the observer on unmount", () => {
  const view = render(<SectionReveal>学习内容</SectionReveal>);
  view.unmount();
  expect(disconnect).toHaveBeenCalled();
});
