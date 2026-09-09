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

const SYNC_CHECKING_STYLE_ID = "twinly-sync-checking-style";
const ensureSyncCheckingStyle = () => {
  if (document.getElementById(SYNC_CHECKING_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SYNC_CHECKING_STYLE_ID;
  style.textContent = `
    html[data-twinly-sync-checking='true'] body::before {
      content: '同期確認中';
      position: fixed;
      top: max(.5rem, env(safe-area-inset-top));
      right: 3.75rem;
      z-index: 70;
      pointer-events: none;
      border: 1px solid hsl(var(--border));
      border-radius: 9999px;
      background: hsl(var(--card) / .94);
      color: hsl(var(--card-foreground));
      box-shadow: 0 2px 10px rgb(0 0 0 / .14);
      padding: .22rem .5rem;
      font: 600 11px/1.25 'DM Sans', 'Noto Sans JP', sans-serif;
      letter-spacing: .01em;
      backdrop-filter: blur(8px);
    }
    html[data-twinly-sync-checking='true'] header + [role='status'] {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
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
    ensureSyncCheckingStyle();
    const show = Boolean(status.ready && status.checking && !status.error && status.pending === 0);
    if (show) document.documentElement.dataset.twinlySyncChecking = "true";
    else delete document.documentElement.dataset.twinlySyncChecking;
    return () => { delete document.documentElement.dataset.twinlySyncChecking; };
  }, [status.ready, status.checking, status.error, status.pending]);

  useEffect(() => {
    if (!db || !userId || !familyId) return;

    if (initialLoadIdentity.current !== identity) {
      initialLoadIdentity.current = identity;
      initialLoadComplete.current = false;
    }

    // The full-screen skeleton is only for the first authoritative bootstrap. A later
    // subscription change or reconnect keeps the already-rendered main UI mounted.
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

    const recheck = (reason: "online" | "visibility" | "pageshow") => {
      store.current?.recheck(reason);
      void store.current?.flush();
    };
    const onOnline = () => recheck("online");
    const onVisible = () => { if (document.visibilityState === "visible") recheck("visibility"); };
    const onPageShow = () => recheck("pageshow");
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (store.current?.hasPending) { event.preventDefault(); event.returnValue = ""; }
    };
    const refresh = () => store.current?.refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      stopped = true;
      stop();
      stopAccessBootstrap();
      store.current = null;
      window.removeEventListener("storage", refresh);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [userId, familyId, identity, effectiveAllHistory, setApp, setLoading]);
  return { store, status };
}
