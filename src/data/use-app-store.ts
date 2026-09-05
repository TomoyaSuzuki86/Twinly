import { useEffect, useRef, useState } from "react";
import type { AppState } from "@/types";
import { db } from "@/firebase";
import { createInitialAppState } from "@/lib/app-state";
import { loadPendingEvents, removePendingEvents, mergePendingEvents } from "@/lib/pending-events";
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
    try {
      const instance = new AppStore(createFirestoreAppRepository(db, familyId, userId, allHistory),
        createInitialAppState(), localStorage, `twinly-outbox:${userId}:${familyId}`, (next, nextStatus) => {
          if (stopped) return;
          setApp((previous) => ({ ...next, ui: previous.ui }));
          setStatus(nextStatus);
          setLoading(!nextStatus.ready && !nextStatus.error);
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
    } catch (error) {
      setStatus({ pending: 0, ready: false, fromCache: true, error: error instanceof Error ? error.message : "端末の保存領域を利用できません。" });
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
    return () => { stopped = true; stop(); store.current = null;
      window.removeEventListener("storage", refresh);
      window.removeEventListener("online", retry); window.removeEventListener("beforeunload", beforeUnload); };
  }, [userId, familyId, allHistory, setApp, setLoading]);
  return { store, status };
}
