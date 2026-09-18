import { useEffect, useRef, useState } from "react";
import type { AppState } from "@/types";
import { db } from "@/firebase";
import { createInitialAppState } from "@/lib/app-state";
import { loadPendingEvents, removePendingEvents, mergePendingEvents } from "@/lib/pending-events";
import { AppStore, type StoreStatus } from "./app-store";
import { subscribeAppStoreLifecycle } from "./app-store-lifecycle";
import { applyAppStorePresentation } from "./app-store-presentation";
import { createFirestoreAppRepository } from "./firestore-app-repository";
import { readCachedAppState, writeCachedAppState } from "./app-state-cache";

type HistoryMode = {
  identity: string;
  allHistory: boolean;
};

export function useAppStore(userId: string | undefined, familyId: string | undefined, allHistory: boolean,
  setApp: React.Dispatch<React.SetStateAction<AppState>>, setLoading: (value: boolean) => void) {
  const store = useRef<AppStore | null>(null);
  const lastApp = useRef<AppState>(createInitialAppState());
  const [status, setStatus] = useState<StoreStatus>({ pending: 0, error: null, ready: false, fromCache: true, conflicts: [] });
  const identity = `${userId ?? ""}:${familyId ?? ""}`;
  const [historyMode, setHistoryMode] = useState<HistoryMode>({ identity, allHistory });
  const visibleIdentity = useRef("");
  const serverReadyIdentity = useRef("");
  const [hydratedIdentity, setHydratedIdentity] = useState("");

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

  useEffect(() => applyAppStorePresentation(status, store.current), [
    status.ready,
    status.checking,
    status.error,
    status.pending,
    status.conflicts,
  ]);

  useEffect(() => {
    if (!db || !userId || !familyId) return;

    const reuseVisibleState = visibleIdentity.current === identity;
    let initialHydrated = reuseVisibleState && hydratedIdentity === identity;
    if (!reuseVisibleState) {
      visibleIdentity.current = identity;
      serverReadyIdentity.current = "";
      const cached = readCachedAppState(localStorage, userId, familyId);
      lastApp.current = cached ?? createInitialAppState();
      if (cached) {
        initialHydrated = true;
        setApp((previous) => ({ ...cached, ui: previous.ui }));
        setHydratedIdentity(identity);
      } else {
        setHydratedIdentity("");
      }
    }
    const reuseServerReady = serverReadyIdentity.current === identity;

    // The dashboard must not wait for family-access or server synchronization.
    // Restore the last hydrated state first; otherwise render neutral placeholders until
    // Firestore supplies the first local/server snapshot.
    setLoading(false);

    let stopped = false;
    let migrated = false;
    let stop = () => {};
    try {
      const initial = lastApp.current;
      const instance = new AppStore(createFirestoreAppRepository(db, familyId, userId, effectiveAllHistory),
        initial, localStorage, `twinly-outbox:${userId}:${familyId}`, (next, nextStatus) => {
          if (stopped) return;
          if (nextStatus.ready) serverReadyIdentity.current = identity;
          if (nextStatus.hydrated) {
            setApp((previous) => {
              const merged = { ...next, ui: previous.ui };
              lastApp.current = merged;
              writeCachedAppState(localStorage, userId, familyId, merged);
              return merged;
            });
            setHydratedIdentity(identity);
          }
          // A network error before the first server-confirmed snapshot is non-fatal.
          // Keep retry state visible through connection/checking while the local UI stays usable.
          setStatus(nextStatus.ready ? nextStatus : { ...nextStatus, error: null });
          if (!migrated && nextStatus.ready && familyId === userId) {
            migrated = true;
            const pending = loadPendingEvents(userId);
            if (pending.length) {
              instance.update((current) => ({ ...current, events: mergePendingEvents(current.events, pending) }));
              removePendingEvents(userId, pending.map((event) => event.id));
            }
          }
        }, { initialReady: reuseServerReady, initialHydrated });
      store.current = instance;
      stop = instance.start();
    } catch (error) {
      const nextStatus = { pending: 0, ready: false, fromCache: true, conflicts: [], error: error instanceof Error ? error.message : "端末の保存領域を利用できません。" };
      setStatus(nextStatus);
      setLoading(false);
    }

    const stopLifecycle = subscribeAppStoreLifecycle({
      userId,
      familyId,
      getStore: () => store.current,
    });

    return () => {
      stopped = true;
      stop();
      store.current = null;
      stopLifecycle();
    };
  }, [userId, familyId, identity, effectiveAllHistory, setApp, setLoading]);

  const requestSync = () => {
    store.current?.recheck("pageshow");
    void store.current?.flush();
  };

  const hydrated = Boolean(userId && familyId && hydratedIdentity === identity);

  return { store, status, requestSync, hydrated };
}
