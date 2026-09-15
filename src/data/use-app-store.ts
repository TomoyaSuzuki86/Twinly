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
import { subscribeAppStoreLifecycle } from "./app-store-lifecycle";
import { applyAppStorePresentation } from "./app-store-presentation";
import { createFirestoreAppRepository } from "./firestore-app-repository";

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
  const initialLoadComplete = useRef(false);
  const initialLoadIdentity = useRef("");

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

    const reuseVisibleState = initialLoadIdentity.current === identity && initialLoadComplete.current;
    if (initialLoadIdentity.current !== identity) {
      initialLoadIdentity.current = identity;
      initialLoadComplete.current = false;
      lastApp.current = createInitialAppState();
    }

    setLoading(!initialLoadComplete.current);

    let stopped = false;
    let migrated = false;
    let stop = () => {};
    let latestStatus: StoreStatus = { pending: 0, error: null, ready: false, fromCache: true, conflicts: [] };
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
      const initial = reuseVisibleState ? lastApp.current : createInitialAppState();
      const instance = new AppStore(createFirestoreAppRepository(db, familyId, userId, effectiveAllHistory),
        initial, localStorage, `twinly-outbox:${userId}:${familyId}`, (next, nextStatus) => {
          if (stopped) return;
          latestStatus = nextStatus;
          setApp((previous) => {
            const merged = { ...next, ui: previous.ui };
            lastApp.current = merged;
            return merged;
          });
          setStatus(nextStatus);
          syncBootstrapLoading();
          if (!migrated && nextStatus.ready && familyId === userId) {
            migrated = true;
            const pending = loadPendingEvents(userId);
            if (pending.length) {
              instance.update((current) => ({ ...current, events: mergePendingEvents(current.events, pending) }));
              removePendingEvents(userId, pending.map((event) => event.id));
            }
          }
        }, { initialReady: reuseVisibleState });
      store.current = instance;
      stop = instance.start();
      syncBootstrapLoading();
    } catch (error) {
      latestStatus = { pending: 0, ready: false, fromCache: true, conflicts: [], error: error instanceof Error ? error.message : "端末の保存領域を利用できません。" };
      setStatus(latestStatus);
      initialLoadComplete.current = true;
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
      stopAccessBootstrap();
      store.current = null;
      stopLifecycle();
    };
  }, [userId, familyId, identity, effectiveAllHistory, setApp, setLoading]);

  const requestSync = () => {
    store.current?.recheck("pageshow");
    void store.current?.flush();
  };

  return { store, status, requestSync };
}