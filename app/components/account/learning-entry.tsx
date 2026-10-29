"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authClient } from "../../lib/auth-client";
import { arcCloudClient, isArcApiError } from "../../lib/cloud-client";
import { planningClient } from "../../lib/planning-client";
import { useHydrated } from "../../lib/use-hydrated";
import { legacyDraftSchema, readPendingCreation, readSetupDraft } from "../setup/setup-draft";

type EntryState = "loading" | "create" | "resume" | "resume-creation" | "continue" | "error" | "sign-in";
const EntryContext = createContext<{ state: EntryState; retry: () => void }>({ state: "loading", retry: () => {} });
export const useLearningEntry = () => useContext(EntryContext);

// Read once per public page, without bootstrapping/migrating a learning workspace.
export function LearningEntry({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const hydrated = useHydrated();
  const owner = !hydrated || session.isPending || session.error ? null : session.data?.user ? `user:${session.data.user.id}` : "guest";
  if (!owner) return <EntryContext.Provider value={{ state: !hydrated || session.isPending ? "loading" : "error", retry: () => { void session.refetch(); } }}>{children}</EntryContext.Provider>;
  // A new owner/session lifecycle must never reuse an earlier absence decision.
  return <ResolvedLearningEntry key={owner} owner={owner}>{children}</ResolvedLearningEntry>;
}

function ResolvedLearningEntry({ owner, children }: { owner: string; children: ReactNode }) {
  const [revision, setRevision] = useState(0);
  const [entry, setEntry] = useState<{ revision: number; state: EntryState } | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    const publish = (state: EntryState) => { if (current) setEntry({ revision, state }); };
    const timer = setTimeout(() => { controller.abort(); publish("error"); }, 8000);
    const read = async () => {
      try {
        const draft = readSetupDraft(owner, "flow", legacyDraftSchema);
        if (owner === "guest") {
          const { readLocalLearningPresence } = await import("../../lib/planning/local-repository");
          if (controller.signal.aborted || !current) return;
          const local = readLocalLearningPresence();
          publish(local === "unavailable" ? "error" : local === "saved" ? "continue" : draft ? "resume" : "create");
          return;
        }
        const snapshot = await arcCloudClient.loadWorkspace(controller.signal);
        if (controller.signal.aborted || !current) return;
        const pending = readPendingCreation(owner);
        if (pending?.phase === "activation" || (pending && !snapshot)) {
          publish("resume-creation");
        } else if (snapshot && pending?.phase === "generate" && pending.goalId === snapshot.activeGoalId) {
          const planning = await planningClient.loadWorkspace(controller.signal);
          if (controller.signal.aborted || !current) return;
          publish(planning.workspace?.goalId === pending.goalId ? "continue" : "resume-creation");
        } else publish(snapshot ? "continue" : draft ? "resume" : "create");
      } catch (error) {
        if (!controller.signal.aborted) publish(isArcApiError(error) && error.status === 401 ? "sign-in" : "error");
      } finally { clearTimeout(timer); }
    };
    queueMicrotask(() => { if (current) void read(); });
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [owner, revision]);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    const storage = (event: StorageEvent) => { if (!event.key || event.key.startsWith("arc:setup-draft:v1:") || event.key === "arc-planning-state-v2" || event.key === "arc-demo-state-v1") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", storage);
    window.addEventListener("arc:learning-changed", refresh);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("storage", storage); window.removeEventListener("arc:learning-changed", refresh); };
  }, []);
  const state = entry?.revision === revision ? entry.state : "loading";
  const retry = () => setRevision(value => value + 1);
  return <EntryContext.Provider value={{ state, retry }}>{children}</EntryContext.Provider>;
}
