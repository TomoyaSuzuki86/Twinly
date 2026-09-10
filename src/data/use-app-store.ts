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
import type { SyncConflict } from "./app-repository";
import { createFirestoreAppRepository } from "./firestore-app-repository";

type HistoryMode = {
  identity: string;
  allHistory: boolean;
};

const SYNC_CHECKING_STYLE_ID = "twinly-sync-checking-style";
const CONFLICT_PANEL_ID = "twinly-conflict-panel";

const fieldLabel = (conflict: SyncConflict) => {
  if (conflict.field === "__record__") return "この記録";
  const labels: Record<string, string> = {
    timestamp: "時刻",
    milkMl: "ミルク量",
    milkMethod: "授乳方法",
    diaperKind: "おむつ",
    diaperSizeUsed: "おむつサイズ",
    temperature: "体温",
    weight: "体重",
    height: "身長",
    note: "メモ",
    babyId: "赤ちゃん",
    type: "記録の種類",
    displayName: "名前",
    birthDate: "生年月日",
    diaperSize: "おむつサイズ",
    diaperStockManagementEnabled: "おむつ在庫管理",
    sleepManagementEnabled: "睡眠管理",
  };
  if (conflict.path?.includes("diaperStockBySize")) {
    const size = conflict.path[conflict.path.length - 1];
    return `おむつ在庫（${size}）`;
  }
  return labels[conflict.field] ?? "設定";
};

const eventContext = (conflict: SyncConflict) => {
  const baby = conflict.babyId ? `赤ちゃん${conflict.babyId}` : "";
  const types: Record<string, string> = {
    milk: "ミルク",
    solidFood: "離乳食",
    diaper: "おむつ",
    sleepStart: "入眠",
    wake: "起床",
    daily: "一言メモ",
    temperature: "体温",
    weight: "体重",
    height: "身長",
  };
  const type = conflict.eventType ? types[conflict.eventType] ?? "記録" : "";
  return [baby, type].filter(Boolean).join("・");
};

const formatConflictValue = (conflict: SyncConflict, value: unknown, side: "local" | "remote") => {
  if (conflict.field === "__record__") {
    if (value === null) return "削除する";
    return side === "local" ? "この端末の変更を使う" : "別の端末の変更を残す";
  }
  if (value === null || value === undefined || value === "") return "なし";
  if (conflict.field === "timestamp" && typeof value === "number") {
    return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }
  if (conflict.field === "milkMl") return `${value}ml`;
  if (conflict.field === "temperature") return `${value}℃`;
  if (conflict.field === "weight" && typeof value === "number") return `${value.toFixed(2)}kg`;
  if (conflict.field === "height") return `${value}cm`;
  if (conflict.field === "milkMethod") return value === "breast" ? "母乳" : value === "bottle" ? "哺乳瓶" : String(value);
  if (conflict.field === "diaperKind") {
    return value === "pee" ? "おしっこ" : value === "poop" ? "うんち" : value === "mix" ? "おしっこ＋うんち" : String(value);
  }
  if (typeof value === "boolean") return value ? "オン" : "オフ";
  return String(value);
};

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
    html[data-twinly-sync-managed='true'] header + [role='status'] {
      display: none !important;
    }
    body[data-twinly-sync-message]::after {
      content: attr(data-twinly-sync-message);
      position: fixed;
      top: max(3.7rem, calc(env(safe-area-inset-top) + 3.2rem));
      left: 50%;
      z-index: 72;
      width: max-content;
      max-width: calc(100vw - 1rem);
      transform: translateX(-50%);
      border: 1px solid hsl(var(--border));
      border-radius: 9999px;
      background: hsl(var(--card) / .96);
      color: hsl(var(--card-foreground));
      box-shadow: 0 3px 14px rgb(0 0 0 / .16);
      padding: .35rem .7rem;
      font: 600 12px/1.35 'DM Sans', 'Noto Sans JP', sans-serif;
      text-align: center;
      pointer-events: none;
    }
    #${CONFLICT_PANEL_ID} {
      position: fixed;
      left: .5rem;
      right: .5rem;
      bottom: max(.75rem, env(safe-area-inset-bottom));
      z-index: 90;
      max-width: 680px;
      margin: 0 auto;
      border: 1px solid hsl(var(--border));
      border-radius: 1rem;
      background: hsl(var(--card) / .98);
      color: hsl(var(--card-foreground));
      box-shadow: 0 12px 36px rgb(0 0 0 / .28);
      padding: .9rem;
      font-family: 'DM Sans', 'Noto Sans JP', sans-serif;
      backdrop-filter: blur(12px);
    }
    #${CONFLICT_PANEL_ID} .twinly-conflict-title { font-size: 14px; font-weight: 800; }
    #${CONFLICT_PANEL_ID} .twinly-conflict-context { margin-top: .2rem; font-size: 12px; color: hsl(var(--muted-foreground)); }
    #${CONFLICT_PANEL_ID} .twinly-conflict-field { margin-top: .7rem; font-size: 13px; font-weight: 700; }
    #${CONFLICT_PANEL_ID} .twinly-conflict-choices { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin-top: .55rem; }
    #${CONFLICT_PANEL_ID} .twinly-conflict-choice {
      min-width: 0;
      border: 1px solid hsl(var(--border));
      border-radius: .8rem;
      background: hsl(var(--background));
      color: hsl(var(--foreground));
      padding: .65rem .7rem;
      text-align: left;
    }
    #${CONFLICT_PANEL_ID} .twinly-conflict-choice:active { transform: scale(.985); }
    #${CONFLICT_PANEL_ID} .twinly-conflict-side { display: block; font-size: 10px; color: hsl(var(--muted-foreground)); }
    #${CONFLICT_PANEL_ID} .twinly-conflict-value { display: block; margin-top: .15rem; overflow-wrap: anywhere; font-size: 14px; font-weight: 800; }
    #${CONFLICT_PANEL_ID} .twinly-conflict-count { margin-top: .5rem; font-size: 10px; color: hsl(var(--muted-foreground)); text-align: right; }
  `;
  document.head.appendChild(style);
};

const renderConflictPanel = (conflicts: SyncConflict[], store: AppStore | null) => {
  document.getElementById(CONFLICT_PANEL_ID)?.remove();
  const conflict = conflicts[0];
  if (!conflict || !store) return;

  const panel = document.createElement("section");
  panel.id = CONFLICT_PANEL_ID;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-live", "polite");
  panel.setAttribute("aria-label", "変更内容の確認");

  const title = document.createElement("div");
  title.className = "twinly-conflict-title";
  title.textContent = "変更内容を確認してください";
  panel.appendChild(title);

  const context = eventContext(conflict);
  if (context) {
    const contextNode = document.createElement("div");
    contextNode.className = "twinly-conflict-context";
    contextNode.textContent = context;
    panel.appendChild(contextNode);
  }

  const field = document.createElement("div");
  field.className = "twinly-conflict-field";
  field.textContent = fieldLabel(conflict);
  panel.appendChild(field);

  const choices = document.createElement("div");
  choices.className = "twinly-conflict-choices";
  const addChoice = (side: "local" | "remote", label: string, value: unknown) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "twinly-conflict-choice";
    const sideNode = document.createElement("span");
    sideNode.className = "twinly-conflict-side";
    sideNode.textContent = label;
    const valueNode = document.createElement("span");
    valueNode.className = "twinly-conflict-value";
    valueNode.textContent = formatConflictValue(conflict, value, side);
    button.append(sideNode, valueNode);
    button.addEventListener("click", () => store.resolveConflict(conflict.id, side));
    choices.appendChild(button);
  };
  addChoice("local", "この端末", conflict.localValue);
  addChoice("remote", "別の端末", conflict.remoteValue);
  panel.appendChild(choices);

  if (conflicts.length > 1) {
    const count = document.createElement("div");
    count.className = "twinly-conflict-count";
    count.textContent = `確認が必要な変更 ${conflicts.length}件`;
    panel.appendChild(count);
  }
  document.body.appendChild(panel);
};

export function useAppStore(userId: string | undefined, familyId: string | undefined, allHistory: boolean,
  setApp: React.Dispatch<React.SetStateAction<AppState>>, setLoading: (value: boolean) => void) {
  const store = useRef<AppStore | null>(null);
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

  useEffect(() => {
    ensureSyncCheckingStyle();
    if (status.ready) document.documentElement.dataset.twinlySyncManaged = "true";
    else delete document.documentElement.dataset.twinlySyncManaged;
    const show = Boolean(status.ready && status.checking && !status.error && status.pending === 0);
    if (show) document.documentElement.dataset.twinlySyncChecking = "true";
    else delete document.documentElement.dataset.twinlySyncChecking;

    if (status.ready && status.error) {
      document.body.dataset.twinlySyncMessage = status.pending > 0
        ? "保存を待っています。通信が戻ると自動で保存します。"
        : "最新の状態を確認できません。通信が戻ると自動で再接続します。";
    } else {
      delete document.body.dataset.twinlySyncMessage;
    }

    renderConflictPanel(status.conflicts ?? [], store.current);
    return () => {
      delete document.documentElement.dataset.twinlySyncChecking;
      delete document.documentElement.dataset.twinlySyncManaged;
      delete document.body.dataset.twinlySyncMessage;
      document.getElementById(CONFLICT_PANEL_ID)?.remove();
    };
  }, [status.ready, status.checking, status.error, status.pending, status.conflicts]);

  useEffect(() => {
    if (!db || !userId || !familyId) return;

    if (initialLoadIdentity.current !== identity) {
      initialLoadIdentity.current = identity;
      initialLoadComplete.current = false;
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
      const instance = new AppStore(createFirestoreAppRepository(db, familyId, userId, effectiveAllHistory),
        createInitialAppState(), localStorage, `twinly-outbox:${userId}:${familyId}`, (next, nextStatus) => {
          if (stopped) return;
          latestStatus = nextStatus;
          setApp((previous) => ({ ...next, ui: previous.ui }));
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
        });
      store.current = instance;
      stop = instance.start();
      syncBootstrapLoading();
    } catch (error) {
      latestStatus = { pending: 0, ready: false, fromCache: true, conflicts: [], error: error instanceof Error ? error.message : "端末の保存領域を利用できません。" };
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
    const scopeKey = `twinly-outbox:${userId}:${familyId}`;
    const outboxPrefix = `${scopeKey}:`;
    const conflictPrefix = `${scopeKey}.conflict:`;
    const refresh = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(outboxPrefix) || event.key.startsWith(conflictPrefix)) store.current?.refresh();
    };
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
