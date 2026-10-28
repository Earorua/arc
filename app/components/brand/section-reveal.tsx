"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function SectionReveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      element.getBoundingClientRect().top < window.innerHeight) return;
    // Server content remains visible; only below-fold sections get an entrance.
    element.dataset.reveal = "pending";
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        delete element.dataset.reveal;
        observer.disconnect();
      }
    }, { threshold: 0, rootMargin: "0px 0px -32px 0px" });
    observer.observe(element);
    const showOnFocus = () => { delete element.dataset.reveal; observer.disconnect(); };
    element.addEventListener("focusin", showOnFocus);
    return () => {
      observer.disconnect();
      element.removeEventListener("focusin", showOnFocus);
      delete element.dataset.reveal;
    };
  }, []);
  return <div ref={ref} className={`section-reveal ${className}`}>{children}</div>;
}
