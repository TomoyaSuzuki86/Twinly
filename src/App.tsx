
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Baby,
  Check,
  CircleUser,
  Settings,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User,
} from "firebase/auth";
import { collection, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "./firebase";
import { BabyPanel } from "./components/BabyPanel";
import { AppState, BabyId, BabyProfile, DiaperKind, LogEvent, MilkMethod, EventType } from "./types";
import { clamp, daysSince, endOfDayMs, fmtDate, startOfDayMs, uid } from "./lib/utils";
import { MilkModal } from "./components/MilkModal";
import { DiaperModal } from "./components/DiaperModal";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { SettingsModal } from "./components/SettingsModal";
import { EditModal } from "./components/EditModal";

const LS_KEY = "twinly-app-v1";
const LS_FAMILY_KEY = "twinly-family-id";
const LS_GOOGLE_TOKEN = "twinly-google-access-token";

function useLocalStorageState<T>(key: string, initialValue: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [key, state]);

  return [state, setState] as const;
}

const demoBirthDate = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return fmtDate(d);
};

const baseProfiles: Record<BabyId, BabyProfile> = {
  A: {
    babyId: "A",
    displayName: "赤ちゃんA",
    birthDate: demoBirthDate(103),
    diaperSize: "新生児",
    diaperStockBySize: { "新生児": 80, S: 0, M: 0, L: 0 },
    diaperPurchaseUrl: "",
    calendarName: "育児記録-A",
    calendarId: "",
    iconEmoji: "👶",
    iconGradient: "from-violet-500 to-fuchsia-500",
  },
  B: {
    babyId: "B",
    displayName: "赤ちゃんB",
    birthDate: demoBirthDate(103),
    diaperSize: "新生児",
    diaperStockBySize: { "新生児": 80, S: 0, M: 0, L: 0 },
    diaperPurchaseUrl: "",
    calendarName: "育児記録-B",
    calendarId: "",
    iconEmoji: "🍼",
    iconGradient: "from-sky-500 to-cyan-400",
  },
};

const initialState: AppState = {
  profiles: baseProfiles,
  events: [],
  ui: {
    lastViewedDate: fmtDate(new Date()),
  },
};

function SnackbarUndo({
  open,
  message,
  onUndo,
  onClose,
}: {
  open: boolean;
  message: string;
  onUndo: () => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed bottom-4 left-1/2 z-50 w-[min(720px,calc(100%-16px))] -translate-x-1/2"
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 18, opacity: 0 }}
        >
          <div className="overflow-hidden rounded-lg border bg-primary text-primary-foreground shadow-2xl">
            <div className="grid grid-cols-2">
              <div className="flex items-center gap-3 px-5 py-4">
                <Check className="h-5 w-5" />
                <div className="text-sm font-semibold">{message}</div>
              </div>
              <Button
                variant="ghost"
                className="h-full rounded-none border-l"
                onClick={onUndo}
              >
                <Undo2 className="mr-2 h-5 w-5" />
                取り消す
              </Button>
            </div>
            <button className="sr-only" onClick={onClose} aria-label="close-snackbar" />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function CalendarStatusPill({ status }: { status?: LogEvent["calendarStatus"] }) {
  const text =
    status === "synced" ? "SYNCED" : status === "pending" ? "SYNCING" : status === "error" ? "ERROR" : "-";
  const dot =
    status === "synced"
      ? "bg-emerald-400"
      : status === "pending"
      ? "bg-amber-400"
      : status === "error"
      ? "bg-rose-400"
      : "bg-muted-foreground";
  return (
    <div className="flex items-center gap-2 rounded-full border bg-secondary px-4 py-2 text-xs text-secondary-foreground">
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      <span className="font-semibold">GOOGLE CALENDAR {text}</span>
    </div>
  );
}

export default function App() {
  const [app, setApp] = useLocalStorageState<AppState>(LS_KEY, initialState);
  const [activeDate, setActiveDate] = useState(() => app.ui.lastViewedDate);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [familyId, setFamilyId] = useState(() => localStorage.getItem(LS_FAMILY_KEY) ?? "");
  const [familyInput, setFamilyInput] = useState("");
  const [cloudStatus, setCloudStatus] = useState<"idle" | "saving" | "loading" | "error" | "done">("idle");
  const [googleToken, setGoogleToken] = useState(() => localStorage.getItem(LS_GOOGLE_TOKEN) ?? "");
  const firebaseEnabled = isFirebaseConfigured && Boolean(auth);

  const [modal, setModal] = useState<
    | { kind: "milk"; babyId: BabyId }
    | { kind: "diaper"; babyId: BabyId }
    | { kind: "settings" }
    | { kind: "edit"; eventId: string }
    | null
  >(null);

  const handleOpenModal = (
    kind: "milk" | "diaper" | "edit" | "settings",
    payload?: { babyId: BabyId } | { eventId: string }
  ) => {
    if ((kind === "milk" || kind === "diaper") && payload && "babyId" in payload) {
      setModal({ kind, babyId: payload.babyId });
    } else if (kind === "edit" && payload && "eventId" in payload) {
      setModal({ kind, eventId: payload.eventId });
    } else if (kind === "settings") {
      setModal({ kind });
    }
  };

  const handleAddDailyReport = (babyId: BabyId, events: LogEvent[]) => {
    const body = buildDailyReport(babyId, events);
    addEvent(babyId, "daily", { note: body });
  };

  const onSaveMilk = (payload: { milkMl: number; milkMethod: MilkMethod; note: string }) => {
    if (!modal || modal.kind !== "milk") return;
    addEvent(modal.babyId, "milk", payload);
  };

  const onSaveDiaper = (payload: { diaperKind: DiaperKind; note: string }) => {
    if (!modal || modal.kind !== "diaper") return;
    addEvent(modal.babyId, "diaper", payload);
  };

  const onSaveEdit = (eventId: string, payload: Partial<LogEvent>) => {
    const shouldSync = Boolean(authUser && googleToken);
    const originalEvent = app.events.find((e) => e.id === eventId);
    if (!originalEvent) return;

    const updatedEvent = { ...originalEvent, ...payload };

    setApp((prev) => ({
      ...prev,
      events: prev.events.map((e) =>
        e.id === eventId
          ? { ...updatedEvent, calendarStatus: shouldSync ? "pending" : e.calendarStatus }
          : e
      ),
    }));

    if (shouldSync) {
      void syncEventToCalendar({ ...updatedEvent, calendarStatus: "pending" });
    }
  };

  const [undo, setUndo] = useState<{ open: boolean; event?: LogEvent }>({ open: false });
  const undoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return undefined;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setApp((prev) => ({ ...prev, ui: { ...prev.ui, lastViewedDate: activeDate } }));
  }, [activeDate, setApp]);

  const dayRange = useMemo(() => {
    const d = new Date(`${activeDate}T00:00:00`);
    return { from: startOfDayMs(d), to: endOfDayMs(d) };
  }, [activeDate]);

  const eventsToday = useMemo(() => {
    return app.events
      .filter((e) => e.timestamp >= dayRange.from && e.timestamp <= dayRange.to)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [app.events, dayRange]);

  const byBaby = useMemo(() => {
    const out: Record<BabyId, LogEvent[]> = { A: [], B: [] };
    for (const e of eventsToday) out[e.babyId].push(e);
    return out;
  }, [eventsToday]);

  const syncStatus = useMemo<LogEvent["calendarStatus"]>(() => {
    if (eventsToday.some((e) => e.calendarStatus === "error")) return "error";
    if (eventsToday.some((e) => e.calendarStatus === "pending")) return "pending";
    if (eventsToday.length > 0) return "synced";
    return "synced";
  }, [eventsToday]);

  const lowStock = useMemo(() => {
    const out: Record<BabyId, { size: string; remaining: number } | null> = { A: null, B: null };
    (Object.keys(app.profiles) as BabyId[]).forEach((babyId) => {
      const p = app.profiles[babyId];
      const rem = p.diaperStockBySize[p.diaperSize] ?? 0;
      if (rem <= 10) out[babyId] = { size: p.diaperSize, remaining: rem };
    });
    return out;
  }, [app.profiles]);

  const saveFamilyId = (next: string) => {
    setFamilyId(next);
    if (next) {
      localStorage.setItem(LS_FAMILY_KEY, next);
    } else {
      localStorage.removeItem(LS_FAMILY_KEY);
    }
  };

  const saveGoogleToken = (token: string) => {
    setGoogleToken(token);
    if (token) {
      localStorage.setItem(LS_GOOGLE_TOKEN, token);
    } else {
      localStorage.removeItem(LS_GOOGLE_TOKEN);
    }
  };

  useEffect(() => {
    if (!authUser || !familyId || !db) return;
    const familyRef = doc(db, "families", familyId);
    const memberRef = doc(db, "families", familyId, "members", authUser.uid);
    setDoc(
      familyRef,
      {
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    setDoc(
      memberRef,
      {
        uid: authUser.uid,
        displayName: authUser.displayName ?? "",
        email: authUser.email ?? "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [authUser, familyId, db]);

  useEffect(() => {
    if (!auth) return;
    getRedirectResult(auth)
      .then((result) => {
        if (!result) return;
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const accessToken = credential?.accessToken;
        if (accessToken) saveGoogleToken(accessToken);
      })
      .catch(() => {
        // ignore redirect errors
      });
  }, []);

  const scheduleUndo = (event: LogEvent) => {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndo({ open: true, event });
    undoTimerRef.current = window.setTimeout(() => setUndo({ open: false }), 7000);
  };

  const addEvent = (babyId: BabyId, type: EventType, payload?: Partial<LogEvent>) => {
    const shouldSync = Boolean(authUser && googleToken);
    const event: LogEvent = {
      id: uid(),
      babyId,
      type,
      timestamp: Date.now(),
      calendarStatus: shouldSync ? "pending" : undefined,
      ...payload,
    };

    if (type === "diaper") {
      const p = app.profiles[babyId];
      const size = p.diaperSize;
      const remaining = (p.diaperStockBySize[size] ?? 0) - 1;
      setApp((prev) => ({
        ...prev,
        profiles: {
          ...prev.profiles,
          [babyId]: {
            ...prev.profiles[babyId],
            diaperStockBySize: {
              ...prev.profiles[babyId].diaperStockBySize,
              [size]: Math.max(0, remaining),
            },
          },
        },
        events: [event, ...prev.events],
      }));
    } else {
      setApp((prev) => ({ ...prev, events: [event, ...prev.events] }));
    }

    scheduleUndo(event);

    if (shouldSync) {
      void syncEventToCalendar(event);
    }
  };

  const removeEvent = (eventId: string) => {
    setApp((prev) => ({ ...prev, events: prev.events.filter((e) => e.id !== eventId) }));
  };

  const undoLast = () => {
    const event = undo.event;
    if (!event) return;

    if (event.type === "diaper") {
      const p = app.profiles[event.babyId];
      const size = p.diaperSize;
      setApp((prev) => ({
        ...prev,
        profiles: {
          ...prev.profiles,
          [event.babyId]: {
            ...prev.profiles[event.babyId],
            diaperStockBySize: {
              ...prev.profiles[event.babyId].diaperStockBySize,
              [size]: (prev.profiles[event.babyId].diaperStockBySize[size] ?? 0) + 1,
            },
          },
        },
        events: prev.events.filter((e) => e.id !== event.id),
      }));
    } else {
      removeEvent(event.id);
    }

    setUndo({ open: false });
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  const editTarget = useMemo(() => {
    if (!modal || modal.kind !== "edit") return null;
    return app.events.find((e) => e.id === modal.eventId) ?? null;
  }, [modal, app.events]);

  const resetAll = () => {
    if (!confirm("全てのデータを削除しますか？")) return;
    setApp(initialState);
    setActiveDate(fmtDate(new Date()));
    setModal(null);
    setUndo({ open: false });
  };

  const todayLabel = useMemo(() => {
    const d = new Date(`${activeDate}T00:00:00`);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }, [activeDate]);

  const buildDailyReport = (_babyId: BabyId, events: LogEvent[]) => {
    const milkEvents = events.filter((e) => e.type === "milk");
    const diaperEvents = events.filter((e) => e.type === "diaper");
    const milkTotal = milkEvents.reduce((sum, e) => sum + (e.milkMl ?? 0), 0);
    const diaperCount = diaperEvents.length;
    return `${todayLabel} のまとめ：ミルク ${milkEvents.length}回（合計 ${milkTotal}ml）、おむつ ${diaperCount}回`;
  };

  const updateEvent = (eventId: string, patch: Partial<LogEvent>) => {
    setApp((prev) => ({
      ...prev,
      events: prev.events.map((e) => (e.id === eventId ? { ...e, ...patch } : e)),
    }));
  };

  const fetchCalendarApi = async (path: string, options: RequestInit = {}) => {
    if (!googleToken) {
      alert("Googleカレンダー権限が必要です。設定画面でログインしてください。");
      throw new Error("missing-token");
    }
    const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${googleToken}`,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
    if (!res.ok) {
      if (res.status === 401) {
        alert("認証が切れています。再ログインしてください。");
      }
      throw new Error(`calendar-api-${res.status}`);
    }
    return res.json() as Promise<any>;
  };

  const buildCalendarEvent = (babyId: BabyId, event: LogEvent) => {
    const profile = app.profiles[babyId];
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const baseTitle = profile.displayName;
    if (event.type === "daily") {
      const day = fmtDate(new Date(event.timestamp));
      const nextDay = fmtDate(new Date(event.timestamp + 24 * 60 * 60 * 1000));
      return {
        summary: `${baseTitle} 日次レポート`,
        description: event.note ?? "",
        start: { date: day },
        end: { date: nextDay },
      };
    }
    const start = new Date(event.timestamp);
    const end = new Date(event.timestamp + 10 * 60 * 1000);
    const detail =
      event.type === "milk"
        ? `${event.milkMl ?? 0}ml・${event.milkMethod === "breast" ? "母乳" : "哺乳瓶"}`
        : `おむつ・${event.diaperKind === "pee" ? "おしっこ" : event.diaperKind === "poop" ? "うんち" : "両方"}`;
    return {
      summary: `${baseTitle} ${detail}`,
      description: event.note ?? "",
      start: { dateTime: start.toISOString(), timeZone: tz },
      end: { dateTime: end.toISOString(), timeZone: tz },
    };
  };

  const ensureCalendarId = async (babyId: BabyId) => {
    const p = app.profiles[babyId];
    if (p.calendarId) return p.calendarId;
    const list = await fetchCalendarApi("/users/me/calendarList");
    const found = (list.items ?? []).find((item: any) => item.summary === p.calendarName);
    if (!found) return "";
    setApp((prev) => ({
      ...prev,
      profiles: {
        ...prev.profiles,
        [babyId]: { ...prev.profiles[babyId], calendarId: found.id },
      },
    }));
    return found.id as string;
  };

  const syncEventToCalendar = async (event: LogEvent) => {
    const calendarId = await ensureCalendarId(event.babyId);
    if (!calendarId) {
      updateEvent(event.id, { calendarStatus: "error" });
      return;
    }
    const body = buildCalendarEvent(event.babyId, event);
    try {
      const res = event.calendarEventId
        ? await fetchCalendarApi(`/calendars/${encodeURIComponent(calendarId)}/events/${event.calendarEventId}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : await fetchCalendarApi(`/calendars/${encodeURIComponent(calendarId)}/events`, {
            method: "POST",
            body: JSON.stringify(body),
          });
      updateEvent(event.id, { calendarStatus: "synced", calendarEventId: res.id });
    } catch {
      updateEvent(event.id, { calendarStatus: "error" });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl p-2 sm:p-4">
        <header className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500">
              <Baby className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">Twinly</h1>
            <CalendarStatusPill status={syncStatus} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-muted-foreground">表示日</label>
            <Input
              type="date"
              className="w-auto"
              value={activeDate}
              onChange={(e) => setActiveDate(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={resetAll}
              title="全消し"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              全消し
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleOpenModal("settings")}
              aria-label="settings"
            >
              <Settings className="h-5 w-5" />
            </Button>
            <div className="grid h-10 w-10 place-items-center rounded-full bg-muted">
              <CircleUser className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
        </header>

        <main className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BabyPanel
            profile={app.profiles.A}
            events={byBaby.A}
            lowStock={lowStock.A}
            onOpenModal={handleOpenModal}
            onAddDailyReport={handleAddDailyReport}
            onDeleteEvent={removeEvent}
          />
          <BabyPanel
            profile={app.profiles.B}
            events={byBaby.B}
            lowStock={lowStock.B}
            onOpenModal={handleOpenModal}
            onAddDailyReport={handleAddDailyReport}
            onDeleteEvent={removeEvent}
          />
        </main>
      </div>

      <SnackbarUndo open={undo.open} message="記録を保存しました" onUndo={undoLast} onClose={() => setUndo({ open: false })} />

      <MilkModal
        open={modal?.kind === "milk"}
        onOpenChange={(open) => !open && setModal(null)}
        displayName={modal?.kind === "milk" ? app.profiles[modal.babyId].displayName : ""}
        onSave={onSaveMilk}
      />
      <DiaperModal
        open={modal?.kind === "diaper"}
        onOpenChange={(open) => !open && setModal(null)}
        displayName={modal?.kind === "diaper" ? app.profiles[modal.babyId].displayName : ""}
        onSave={onSaveDiaper}
      />
      <SettingsModal
        open={modal?.kind === "settings"}
        onOpenChange={(open) => !open && setModal(null)}
        app={app}
        setApp={setApp}
      />
      <EditModal
        open={modal?.kind === "edit"}
        onOpenChange={(open) => !open && setModal(null)}
        event={editTarget}
        onSave={onSaveEdit}
      />
    </div>
  );
}
