"use client";

import { useState, type ReactNode } from "react";

export function SetupDisclosure({ title, children, className, defaultOpen = false }: { title: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return <details className={className} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{title}</summary><div hidden={!open}>{children}</div>
  </details>;
}
