import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import "@fontsource-variable/newsreader";
import "../../app/globals.css";
import "./controls.css";
import SetupPage from "../../app/setup/page";
import PathPage from "../../app/path/page";
import TodayPage from "../../app/today/page";
import StackPage from "../../app/stack/page";
import ProofPage from "../../app/proof/page";
import { setOfflineOwner, usePathname, navigate } from "./browser-runtime";
import { allowsApplicationFetch } from "./security";
import { createOfflineApiTrace } from "./api-trace";
import { completeDemoUnit, createDemoState, DEMO_STORAGE_KEY, saveDemoState } from "../../app/lib/demo-store";
import { flagshipRole } from "../../app/data/flagship-role";
import { PLANNING_STORAGE_KEY } from "../../app/lib/planning/local-repository";

const recoveryKey = "arc:role-research:v1";
const nativeFetch = window.fetch.bind(window);
const apiTrace = createOfflineApiTrace();
const nonce = document.querySelector<HTMLMetaElement>('meta[name="arc-uat-control"]')!.content;
let outboundDenials = 0;
window.fetch = (input, options) => {
  if (!allowsApplicationFetch(input, location.origin)) { outboundDenials++; return Promise.reject(new Error("Offline UAT blocked outbound application fetch")); }
  const request = new Request(input instanceof Request ? input : new URL(String(input), location.origin), options);
  const headers = new Headers(request.headers);
  if (request.method !== "GET" && request.method !== "HEAD") headers.set("x-arc-uat-control", nonce);
  return apiTrace.observe(request, () => nativeFetch(new Request(request, { headers })));
};
document.addEventListener("click", (event) => {
  const anchor = (event.target as Element | null)?.closest("a");
  if (anchor && new URL(anchor.href, location.origin).origin !== location.origin) {
    event.preventDefault(); event.stopPropagation(); outboundDenials++;
  }
}, true);

type Diagnostics = { owner: string | null; settings: { mode: string; disabled: boolean; exhausted: boolean }; [key: string]: unknown };
async function readDiagnostics() { const response = await fetch("/__uat/state"); if (!response.ok) throw new Error("Offline controls unavailable"); return response.json() as Promise<Diagnostics>; }
function storageDiagnostics() {
  const recovery = localStorage.getItem(recoveryKey);
  let identity: unknown = null;
  try { identity = recovery ? JSON.parse(recovery) : null; } catch { identity = "invalid JSON"; }
  let localHistory = { completions: 0, proofs: 0 };
  try { const state = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) ?? "null"); localHistory = { completions: state?.completedUnitIds?.length ?? 0, proofs: state?.proofs?.length ?? 0 }; } catch { /* Diagnostic only. */ }
  return { recoveryIdentity: identity, localHistory, localPlanningPresent: localStorage.getItem(PLANNING_STORAGE_KEY) !== null, offlineQueuePresent: localStorage.getItem("arc-offline-queue-v1") !== null, outboundDenials, apiResults: apiTrace.snapshot() };
}
function App() {
  const path = usePathname();
  const [state, setState] = useState<Diagnostics | null>(null);
  const [browser, setBrowser] = useState(storageDiagnostics);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reduced, setReduced] = useState(false);
  async function refresh() { const next = await readDiagnostics(); setState(next); setBrowser(storageDiagnostics()); return next; }
  useEffect(() => { void readDiagnostics().then((next) => { setState(next); setOfflineOwner(next.owner); }).catch(() => setError("Offline controls unavailable")); }, []);
  async function command(value: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/__uat/control", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
      if (!response.ok) { const body = await response.json() as { error?: string }; throw new Error(body.error ?? "Control rejected"); }
      if (value.action === "reset") { localStorage.clear(); sessionStorage.clear(); location.assign("/setup"); return; }
      const next = await refresh();
      if (value.action === "owner") setOfflineOwner(next.owner);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Control unavailable"); }
    finally { setBusy(false); }
  }
  function applyReducedRules() {
    const previous = document.getElementById("uat-reduced-motion");
    if (previous) { previous.remove(); setReduced(false); return; }
    const rules: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) for (const rule of Array.from(sheet.cssRules)) {
      if (rule instanceof CSSMediaRule && rule.conditionText.includes("prefers-reduced-motion: reduce")) rules.push(...Array.from(rule.cssRules, (child) => child.cssText));
    }
    const style = document.createElement("style"); style.id = "uat-reduced-motion"; style.textContent = rules.join("\n"); document.head.appendChild(style); setReduced(true);
  }
  const Page = ({ "/setup": SetupPage, "/path": PathPage, "/today": TodayPage, "/stack": StackPage, "/proof": ProofPage } as Record<string, typeof SetupPage>)[path];
  return <>
    <aside className="uat-controls" aria-label="Offline UAT controls">
      <details><summary>Offline UAT · test controls</summary>
        <p>Actual Arc pages · Fake Provider · disposable SQLite D1 adapter. No OAuth or external requests.</p>
        <div className="uat-actions">
          <label>Test owner<select disabled={busy || !state} value={state?.owner ?? "guest"} onChange={(event) => void command({ action: "owner", owner: event.target.value === "guest" ? null : event.target.value })}><option value="owner-a">Owner A</option><option value="owner-b">Owner B</option><option value="guest">Guest</option></select></label>
          <label>Fake mode<select disabled={busy || !state} value={state?.settings.mode ?? "ready"} onChange={(event) => void command({ action: "configure", mode: event.target.value })}>{["ready", "needs-review", "failed", "repair", "timeout", "filtered"].map((mode) => <option key={mode}>{mode}</option>)}</select></label>
          <label><input type="checkbox" checked={state?.settings.disabled ?? false} disabled={busy} onChange={(event) => void command({ action: "configure", disabled: event.target.checked })} />Research disabled</label>
          <label><input type="checkbox" checked={state?.settings.exhausted ?? false} disabled={busy} onChange={(event) => void command({ action: "configure", exhausted: event.target.checked })} />Local budget exhausted</label>
          <button disabled={busy} onClick={() => void command({ action: "reset" })}>Reset fresh scenario</button>
          <button disabled={busy} onClick={() => void command({ action: "prestart", stage: "researching" })}>Prestart Researching</button>
          <button disabled={busy} onClick={() => void command({ action: "prestart", stage: "validating" })}>Prestart Validating</button>
          <button disabled={busy} onClick={() => void command({ action: "resume" })}>Resume paused run</button>
          <button onClick={() => { localStorage.removeItem(recoveryKey); setBrowser(storageDiagnostics()); }}>Clear Research recovery only</button>
          <button onClick={() => { saveDemoState(completeDemoUnit(createDemoState(), flagshipRole.today)); setBrowser(storageDiagnostics()); }}>Seed unrelated device history</button>
          <button onClick={() => { navigate("/setup"); }}>Open Setup</button>
          <button onClick={() => void refresh().catch(() => setError("Diagnostics unavailable"))}>Refresh diagnostics</button>
          <button aria-pressed={reduced} onClick={applyReducedRules}>Apply authored reduced-motion rules</button>
        </div>
        <p>Prestart pauses a persisted active run. Use ordinary Research, then reload; this does not test an initial POST without a returned ID. Reduced-motion control applies the authored CSS branch, without changing an OS preference.</p>
        {error && <p role="alert">{error}</p>}
        <pre aria-label="Offline UAT diagnostics">{JSON.stringify({ ...state, browser }, null, 2)}</pre>
      </details>
    </aside>
    {Page ? <Page /> : <div className="uat-route-boundary"><h1>Offline route</h1><p>Authentication is synthetic. Use the test owner selector to continue.</p><button onClick={() => navigate("/setup")}>Open Setup</button></div>}
  </>;
}
createRoot(document.getElementById("root")!).render(<App />);
