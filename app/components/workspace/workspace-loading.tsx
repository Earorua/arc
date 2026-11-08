"use client";

import { useEffect, useState } from "react";

export function WorkspaceLoading() {
  const [announce, setAnnounce] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setAnnounce(true), 300);
    return () => window.clearTimeout(timer);
  }, []);

  return <div className="workspace-loading">
    <p role="status" aria-atomic="true">{announce ? "正在加载学习内容…" : null}</p>
  </div>;
}
