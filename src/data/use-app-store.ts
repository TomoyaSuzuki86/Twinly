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

export function useAppStore(userId: string | undefined, familyId: string | undefined, allHistory: boolean,
  setApp: React.Dispatch<React.SetStateAction<AppState>>, setLoading: (value: boolean) => void) {
  const store = useRef<AppStore | null>(null);
  const [status, setStatus] = useState<StoreStatus>({ pending: 0, error: null, ready: false, fromCache: true });
  useEffect(() => {
    if (!db || !userId || !familyId) return;
    setLoading(true);
    let stopped = false;
    let migrated = false;
    let stop = () => {};
    let latestStatus: StoreStatus = { pending: 0, error: null, ready: false, fromCache: true };
    const syncBootstrapLoading = () => {
      if (stopped) return;
      const accessState = getFamilyAccessBootstrapState(userId, familyId);
      const accessLoading = accessState === "idle" || accessState === "loading";
      setLoading((!latestStatus.ready && !latestStatus.error) || accessLoading);
    };
    const stopAccessBootstrap = subscribeFamilyAccessBootstrap(syncBootstrapLoading);
    try {
      const instance = new AppStore(createFirestoreAppRepository(db, familyId, userId, allHistory),
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
  }, [userId, familyId, allHistory, setApp, setLoading]);
  return { store, status };
}
