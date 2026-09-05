import { useSyncExternalStore, type AnchorHTMLAttributes } from "react";

let session = { data: null as { user: { id: string; name: string; email: string } } | null, isPending: true };
const subscribers = new Set<() => void>();
const paths = new Set<() => void>();
const subscribe = (listener: () => void) => { subscribers.add(listener); return () => { subscribers.delete(listener); }; };
export function setOfflineOwner(owner: string | null) {
  session = { data: owner ? { user: { id: owner, name: owner === "owner-a" ? "Owner A" : "Owner B", email: `${owner}@example.test` } } : null, isPending: false };
  subscribers.forEach((listener) => listener());
}
export const authClient = {
  useSession: () => useSyncExternalStore(subscribe, () => session, () => session),
  listAccounts: async () => ({ data: [], error: null }),
  signOut: async () => {
    await fetch("/__uat/control", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "owner", owner: null }) });
    setOfflineOwner(null);
  },
};
const publishPath = () => paths.forEach((listener) => listener());
if (typeof window !== "undefined") window.addEventListener("popstate", publishPath);
export function navigate(path: string, replace = false) {
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin) throw new Error("Offline UAT blocks external navigation");
  window.history[replace ? "replaceState" : "pushState"]({}, "", url.pathname + url.search + url.hash);
  publishPath(); window.scrollTo(0, 0);
}
export function usePathname() {
  return useSyncExternalStore((listener) => { paths.add(listener); return () => { paths.delete(listener); }; }, () => location.pathname, () => "/setup");
}
export function useRouter() {
  return { push: (path: string) => navigate(path), replace: (path: string) => navigate(path, true), refresh: () => location.reload(), back: () => history.back() };
}
export default function OfflineLink({ href = "#", onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={href} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === "_blank") return;
    const url = new URL(href, location.origin);
    if (url.origin !== location.origin) { event.preventDefault(); return; }
    if (url.hash && url.pathname === location.pathname) return;
    event.preventDefault(); navigate(href);
  }} />;
}
