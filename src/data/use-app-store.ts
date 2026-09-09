import { useEffect, useRef, useState } from "react";
import type { AppState } from "@/types";
import { db } from "@/firebase";
import { createInitialAppState } from "@/lib/app-state";
import { loadPendingEvents, removePendingEvents, mergePendingEvents } from "@/lib/pending-events";
import {
  getFamilyAccessBootstrapState,
  subscribeFamilyAccessBootstrap,
} from "@/lib/family-access-bootstrap";
import { AppStore, type StoreStatus } from "./app-store";
import { createFirestoreAppRepository } from "./firestore-app-repository";

type HistoryMode = {
  identity: string;
  allHistory: boolean;
};

export function useAppStore(userId: string | undefined, familyId: string | undefined, allHistory: boolean,
  setApp: React.Dispatch<React.SetStateAction<AppState>>, setLoading: (value: boolean) => void) {
  const store = useRef<AppStore | null>(null);
  const [status, setStatus] = useState<StoreStatus>({ pending: 0, error: null, ready: false, fromCache: true });
  const identity = `${userId ?? ""}:${familyId ?? ""}`;
  const [historyMode, setHistoryMode] = useState<HistoryMode>({ identity, allHistory });
  const initialLoadComplete = useRef(false);
  const initialLoadIdentity = useRef("");

  // History subscriptions are an upgrade for the current family session. Once the app has
  // requested full history, keep that subscription until the family/session changes instead
  // of tearing it down every time a modal closes and rebuilding it on the next open.
  const effectiveAllHistory = historyMode.identity === identity
    ? historyMode.allHistory || allHistory
    : allHistory;

  useEffect(() => {
    setHistoryMode((current) => {
      if (current.identity !== identity) return { identity, allHistory };
      if (allHistory && !current.allHistory) return { identity, allHistory: true };
      return current;
    });
  }, [identity, allHistory]);

  useEffect(() => {
    if (!db || !userId || !familyId) return;

    if (initialLoadIdentity.current !== identity) {
      initialLoadIdentity.current = identity;
      initialLoadComplete.current = false;
    }

    // The full-screen skeleton is only for the first authoritative bootstrap. A later
    // subscription change (for example opening settings/history/timeline) must keep the
    // already-rendered main UI mounted while Firestore refreshes in the background.
    setLoading(!initialLoadComplete.current);

    let stopped = false;
    let migrated = false;
    let stop = () => {};
    let latestStatus: StoreStatus = { pending: 0, error: null, ready: false, fromCache: true };
    const syncBootstrapLoading = () => {
      if (stopped) return;

      if (initialLoadComplete.current) {
        setLoading(false);
        return;
      }

      const accessState = getFamilyAccessBootstrapState(userId, familyId);
      const accessLoading = accessState === "idle" || accessState === "loading";
      const loading = (!latestStatus.ready && !latestStatus.error) || accessLoading;
      setLoading(loading);
      if (!loading) initialLoadComplete.current = true;
    };
    const stopAccessBootstrap = subscribeFamilyAccessBootstrap(syncBootstrapLoading);
    try {
      const instance = new AppStore(createFirestoreAppRepository(db, familyId, userId, effectiveAllHistory),
        createInitialAppState(), localStorage, `twinly-outbox:${userId}:${familyId}`, (next, nextStatus) => {
          if (stopped) return;
          latestStatus = nextStatus;
          setApp((previous) => ({ ...next, ui: previous.ui }));
          setStatus(nextStatus);
          syncBootstrapLoading();
          // Legacy additions had only a uid scope. Only adopt them in that uid's original family.
          if (!migrated && nextStatus.ready && familyId === userId) {
            migrated = true;
            const pending = loadPendingEvents(userId);
            if (pending.length) {
              instance.update((current) => ({ ...current, events: mergePendingEvents(current.events, pending) }));
              removePendingEvents(userId, pending.map((event) => event.id));
            }
          }
        });
      store.current = instance;
      stop = instance.start();
      syncBootstrapLoading();
    } catch (error) {
      latestStatus = { pending: 0, ready: false, fromCache: true, error: error instanceof Error ? error.message : "端末の保存領域を利用できません。" };
      setStatus(latestStatus);
      initialLoadComplete.current = true;
      setLoading(false);
    }
    const retry = () => { void store.current?.flush(); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (store.current?.hasPending) { event.preventDefault(); event.returnValue = ""; }
    };
    const refresh = () => store.current?.refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("online", retry);
    window.addEventListener("beforeunload", beforeUnload);
    return () => { stopped = true; stop(); stopAccessBootstrap(); store.current = null;
      window.removeEventListener("storage", refresh);
      window.removeEventListener("online", retry); window.removeEventListener("beforeunload", beforeUnload); };
  }, [userId, familyId, identity, effectiveAllHistory, setApp, setLoading]);
  return { store, status };
}
