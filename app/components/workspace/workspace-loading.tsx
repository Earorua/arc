"use client";

import { useEffect, useState } from "react";

export function WorkspaceLoading() {
  const [announce, setAnnounce] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setAnnounce(true), 300);
    return () => window.clearTimeout(timer);
  }, []);

  return <div className="workspace-loading">
    <p role="status" aria-atomic="true">{announce ? "Loading your learning content…" : null}</p>
  </div>;
}
