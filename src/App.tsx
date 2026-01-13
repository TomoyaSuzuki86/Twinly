
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Baby,
  CalendarDays,
  Check,
  CircleUser,
  Droplets,
  FileText,
  Milk,
  Pencil,
  Settings,
  Trash2,
  Undo2,
  X,
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
import { auth, db } from "./firebase";

const LS_KEY = "twinly-app-v1";
const LS_FAMILY_KEY = "twinly-family-id";
const LS_GOOGLE_TOKEN = "twinly-google-access-token";

type BabyId = "A" | "B";
type EventType = "milk" | "diaper" | "daily";
type DiaperKind = "pee" | "poop" | "mix";
type MilkMethod = "bottle" | "breast";

type LogEvent = {
  id: string;
  babyId: BabyId;
  type: EventType;
  timestamp: number;
  milkMl?: number;
  milkMethod?: MilkMethod;
  diaperKind?: DiaperKind;
  note?: string;
  calendarStatus?: "pending" | "synced" | "error";
  calendarEventId?: string;
};

type BabyProfile = {
  babyId: BabyId;
  displayName: string;
  birthDate: string;
  diaperSize: string;
  diaperStockBySize: Record<string, number>;
  diaperPurchaseUrl?: string;
  calendarName: string;
  calendarId?: string;
};

type AppState = {
  profiles: Record<BabyId, BabyProfile>;
  events: LogEvent[];
  ui: {
    lastViewedDate: string;
  };
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const fmtTime = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const startOfDayMs = (d: Date) => {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  return dd.getTime();
};

const endOfDayMs = (d: Date) => {
  const dd = new Date(d);
  dd.setHours(23, 59, 59, 999);
  return dd.getTime();
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const daysSince = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  const now = new Date();
  const ms = startOfDayMs(now) - startOfDayMs(d);
  const days = Math.floor(ms / 1000 / 60 / 60 / 24);
  return Math.max(0, days);
};

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
  },
};

const initialState: AppState = {
  profiles: baseProfiles,
  events: [],
  ui: {
    lastViewedDate: fmtDate(new Date()),
  },
};

function TagPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80 shadow-sm">
      {children}
    </span>
  );
}

function MiniCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-sm">
      <div className="text-xs text-white/60">{label}</div>
      <div className="mt-2 text-4xl font-semibold tracking-tight text-white">{children}</div>
    </div>
  );
}

function SolidButton({
  tone,
  icon,
  title,
  onClick,
  onLongPress,
}: {
  tone: "milk" | "diaper";
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  onLongPress?: () => void;
}) {
  const timerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const bg = tone === "milk" ? "bg-sky-600 hover:bg-sky-500" : "bg-amber-600 hover:bg-amber-500";

  const onPointerDown = () => {
    longPressedRef.current = false;
    if (!onLongPress) return;
    timerRef.current = window.setTimeout(() => {
      longPressedRef.current = true;
      onLongPress();
    }, 520);
  };

  const onPointerUp = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!longPressedRef.current) onClick();
  };

  const onPointerLeave = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <button
      className={`flex h-24 w-full select-none items-center justify-center gap-3 rounded-[26px] ${bg} text-white shadow-lg shadow-black/20 active:scale-[0.99]`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      title={onLongPress ? "長押しで詳細" : undefined}
    >
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15">{icon}</div>
      <div className="text-2xl font-semibold tracking-tight">{title}</div>
    </button>
  );
}

function ModalShell({
  open,
  title,
  onClose,
  children,
  footer,
  icon,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-2 sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            className="w-full max-w-2xl overflow-hidden rounded-[32px] sm:rounded-[40px] border border-white/10 bg-[#0B152D] shadow-2xl shadow-black/50"
            initial={{ y: 18, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 14, opacity: 0, scale: 0.98 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">
                  {icon ?? <Milk className="h-5 w-5 text-white" />}
                </div>
                <div className="text-xl font-semibold text-white">{title}</div>
              </div>
              <button
                className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5 hover:bg-white/10"
                onClick={onClose}
                aria-label="close"
              >
                <X className="h-5 w-5 text-white/70" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-4 pb-4 sm:px-6">{children}</div>
            <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-4 sm:px-6 sm:py-5">
              {footer}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

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
          <div className="overflow-hidden rounded-[26px] border border-white/10 bg-[#5B55F6] shadow-2xl shadow-black/40">
            <div className="grid grid-cols-2">
              <div className="flex items-center gap-3 px-5 py-4">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15">
                  <Check className="h-5 w-5 text-white" />
                </div>
                <div className="text-sm font-semibold text-white">{message}</div>
              </div>
              <button
                className="flex items-center justify-center gap-3 border-l border-white/15 px-5 py-4 text-white hover:bg-white/10"
                onClick={onUndo}
              >
                <Undo2 className="h-5 w-5" />
                <span className="text-sm font-semibold">取り消す</span>
              </button>
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
      : "bg-white/30";
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/80">
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      <span className="font-semibold">GOOGLE CALENDAR {text}</span>
    </div>
  );
}

function EventCard({
  event,
  onEdit,
  onDelete,
}: {
  event: LogEvent;
  onEdit: (event: LogEvent) => void;
  onDelete: (event: LogEvent) => void;
}) {
  const t = fmtTime(new Date(event.timestamp));
  const iconBg =
    event.type === "milk" ? "bg-sky-500/20" : event.type === "diaper" ? "bg-amber-500/20" : "bg-violet-500/20";
  const icon =
    event.type === "milk" ? (
      <Milk className="h-5 w-5 text-sky-300" />
    ) : event.type === "diaper" ? (
      <Droplets className="h-5 w-5 text-amber-300" />
    ) : (
      <FileText className="h-5 w-5 text-violet-300" />
    );

  const title =
    event.type === "milk"
      ? `${event.milkMl ?? 0}ml・${event.milkMethod === "breast" ? "母乳" : "哺乳瓶"}`
      : event.type === "diaper"
      ? `おむつ・${event.diaperKind === "pee" ? "おしっこ" : event.diaperKind === "poop" ? "うんち" : "両方"}`
      : "日次レポート";
  const statusDot =
    event.calendarStatus === "synced"
      ? "bg-emerald-400"
      : event.calendarStatus === "pending"
      ? "bg-amber-400"
      : event.calendarStatus === "error"
      ? "bg-rose-400"
      : "bg-white/30";

  return (
    <div className="flex items-center justify-between gap-3 rounded-[26px] border border-white/10 bg-white/5 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`grid h-12 w-12 place-items-center rounded-2xl ${iconBg}`}>{icon}</div>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-white">{title}</div>
          {event.note ? <div className="mt-1 truncate text-xs text-white/55">{event.note}</div> : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${statusDot}`} title={`カレンダー: ${event.calendarStatus ?? "-"}`} />
        <div className="w-14 text-right text-sm text-white/55">{t}</div>
        <button
          className="grid h-11 w-11 place-items-center rounded-2xl bg-white/5 hover:bg-white/10"
          onClick={() => onEdit(event)}
          aria-label="edit"
        >
          <Pencil className="h-4 w-4 text-white/75" />
        </button>
        <button
          className="grid h-11 w-11 place-items-center rounded-2xl bg-white/5 hover:bg-white/10"
          onClick={() => onDelete(event)}
          aria-label="delete"
        >
          <Trash2 className="h-4 w-4 text-white/75" />
        </button>
      </div>
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

  const [modal, setModal] = useState<
    | { kind: "milk"; babyId: BabyId }
    | { kind: "diaper"; babyId: BabyId }
    | { kind: "settings" }
    | { kind: "edit"; eventId: string }
    | null
  >(null);

  const [milkMl, setMilkMl] = useState(140);
  const [milkMethod, setMilkMethod] = useState<MilkMethod>("breast");
  const [diaperKind, setDiaperKind] = useState<DiaperKind>("pee");
  const [note, setNote] = useState("");

  const [undo, setUndo] = useState<{ open: boolean; event?: LogEvent }>({ open: false });
  const undoTimerRef = useRef<number | null>(null);

  useEffect(() => {
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
    if (!authUser || !familyId) return;
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
  }, [authUser, familyId]);

  useEffect(() => {
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

  useEffect(() => {
    if (!editTarget) return;
    setMilkMl(editTarget.milkMl ?? 140);
    setMilkMethod(editTarget.milkMethod ?? "breast");
    setDiaperKind(editTarget.diaperKind ?? "pee");
    setNote(editTarget.note ?? "");
  }, [editTarget]);

  const saveEdit = () => {
    if (!editTarget) return;

    const shouldSync = Boolean(authUser && googleToken);
    const updated: Partial<LogEvent> =
      editTarget.type === "milk"
        ? { milkMl, milkMethod, note }
        : editTarget.type === "diaper"
        ? { diaperKind, note }
        : { note };

    setApp((prev) => ({
      ...prev,
      events: prev.events.map((e) =>
        e.id === editTarget.id
          ? { ...e, ...updated, calendarStatus: shouldSync ? "pending" : e.calendarStatus }
          : e
      ),
    }));

    if (shouldSync) {
      void syncEventToCalendar({ ...editTarget, ...updated, calendarStatus: "pending" });
    }
    setModal(null);
  };

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

  const changeDiaperSize = (babyId: BabyId, next: string) => {
    setApp((prev) => ({
      ...prev,
      profiles: {
        ...prev.profiles,
        [babyId]: {
          ...prev.profiles[babyId],
          diaperSize: next,
          diaperStockBySize: {
            ...prev.profiles[babyId].diaperStockBySize,
            [next]: prev.profiles[babyId].diaperStockBySize[next] ?? 0,
          },
        },
      },
    }));
  };

  const addStock = (babyId: BabyId, size: string, add: number) => {
    setApp((prev) => ({
      ...prev,
      profiles: {
        ...prev.profiles,
        [babyId]: {
          ...prev.profiles[babyId],
          diaperStockBySize: {
            ...prev.profiles[babyId].diaperStockBySize,
            [size]: clamp((prev.profiles[babyId].diaperStockBySize[size] ?? 0) + add, 0, 9999),
          },
        },
      },
    }));
  };

  const addStockSize = (babyId: BabyId, size: string) => {
    const trimmed = size.trim();
    if (!trimmed) return;
    setApp((prev) => ({
      ...prev,
      profiles: {
        ...prev.profiles,
        [babyId]: {
          ...prev.profiles[babyId],
          diaperStockBySize: {
            ...prev.profiles[babyId].diaperStockBySize,
            [trimmed]: prev.profiles[babyId].diaperStockBySize[trimmed] ?? 0,
          },
        },
      },
    }));
  };

  const exportJson = () => {
    const content = JSON.stringify(app, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `twinly-backup-${fmtDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (raw: string) => {
    try {
      const next = JSON.parse(raw) as AppState;
      if (!next || !next.profiles || !next.events) throw new Error("invalid");
      setApp(next);
      setActiveDate(next.ui?.lastViewedDate ?? fmtDate(new Date()));
    } catch {
      alert("インポートに失敗しました。JSONの形式を確認してください。");
    }
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

  const createCalendar = async (babyId: BabyId) => {
    const p = app.profiles[babyId];
    try {
      const created = await fetchCalendarApi("/calendars", {
        method: "POST",
        body: JSON.stringify({ summary: p.calendarName }),
      });
      setApp((prev) => ({
        ...prev,
        profiles: {
          ...prev.profiles,
          [babyId]: { ...prev.profiles[babyId], calendarId: created.id },
        },
      }));
    } catch {
      alert("カレンダー作成に失敗しました。");
    }
  };

  const findCalendar = async (babyId: BabyId) => {
    try {
      const id = await ensureCalendarId(babyId);
      if (!id) alert("一致するカレンダーが見つかりません。");
    } catch {
      alert("カレンダー検索に失敗しました。");
    }
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

  const syncTodayEvents = async () => {
    if (!authUser) {
      alert("Googleログインしてください。");
      return;
    }
    if (!googleToken) {
      alert("カレンダー権限が必要です。設定で権限を取得してください。");
      return;
    }
    const targets = eventsToday;
    if (targets.length === 0) {
      alert("同期するイベントがありません。");
      return;
    }
    targets.forEach((e) => updateEvent(e.id, { calendarStatus: "pending" }));
    for (const ev of targets) {
      // Sequential to keep order and rate limits modest.
      // eslint-disable-next-line no-await-in-loop
      await syncEventToCalendar(ev);
    }
  };

  const signInGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope("https://www.googleapis.com/auth/calendar");
      provider.addScope("https://www.googleapis.com/auth/calendar.events");
      try {
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const accessToken = credential?.accessToken;
        if (accessToken) saveGoogleToken(accessToken);
      } catch {
        await signInWithRedirect(auth, provider);
      }
    } catch {
      alert("Googleログインに失敗しました。");
    }
  };

  const signOutGoogle = async () => {
    try {
      await signOut(auth);
      saveGoogleToken("");
    } catch {
      alert("ログアウトに失敗しました。");
    }
  };

  const createFamily = async () => {
    if (!authUser) {
      alert("先にGoogleログインしてください。");
      return;
    }
    const ref = doc(collection(db, "families"));
    await setDoc(
      ref,
      {
        ownerUid: authUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    saveFamilyId(ref.id);
  };

  const joinFamily = async () => {
    const trimmed = familyInput.trim();
    if (!trimmed) return;
    const ref = doc(db, "families", trimmed);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      alert("家族コードが見つかりません。");
      return;
    }
    saveFamilyId(trimmed);
    setFamilyInput("");
  };

  const saveToCloud = async () => {
    if (!authUser) {
      alert("Googleログインしてください。");
      return;
    }
    if (!familyId) {
      alert("家族コードを設定してください。");
      return;
    }
    setCloudStatus("saving");
    try {
      const ref = doc(db, "families", familyId, "app", "state");
      await setDoc(
        ref,
        {
          app,
          updatedAt: serverTimestamp(),
          updatedBy: authUser.uid,
        },
        { merge: true }
      );
      setCloudStatus("done");
    } catch {
      setCloudStatus("error");
      alert("クラウド保存に失敗しました。");
    }
  };

  const loadFromCloud = async () => {
    if (!authUser) {
      alert("Googleログインしてください。");
      return;
    }
    if (!familyId) {
      alert("家族コードを設定してください。");
      return;
    }
    setCloudStatus("loading");
    try {
      const ref = doc(db, "families", familyId, "app", "state");
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        alert("クラウドに保存されたデータがありません。");
        setCloudStatus("idle");
        return;
      }
      const data = snap.data() as { app?: AppState };
      if (!data?.app) {
        alert("クラウドデータの形式が不正です。");
        setCloudStatus("error");
        return;
      }
      setApp(data.app);
      setActiveDate(data.app.ui?.lastViewedDate ?? fmtDate(new Date()));
      setCloudStatus("done");
    } catch {
      setCloudStatus("error");
      alert("クラウド読み込みに失敗しました。");
    }
  };

  const BabyPanel = ({ babyId }: { babyId: BabyId }) => {
    const p = app.profiles[babyId];
    const ageDays = daysSince(p.birthDate);

    const milkEvents = byBaby[babyId].filter((e) => e.type === "milk");
    const diaperEvents = byBaby[babyId].filter((e) => e.type === "diaper");

    const milkTotal = milkEvents.reduce((sum, e) => sum + (e.milkMl ?? 0), 0);
    const diaperCount = diaperEvents.length;
    const rem = p.diaperStockBySize[p.diaperSize] ?? 0;

    const low = lowStock[babyId];
    const purchaseUrl = p.diaperPurchaseUrl?.trim();

    return (
      <div className="min-w-[320px] rounded-[36px] border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/30 lg:min-w-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-black/30">
              <Baby className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="text-2xl font-semibold tracking-tight text-white">{p.displayName}</div>
              <div className="mt-1 text-sm text-white/55">生後{ageDays}日</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <TagPill>
                  <span className="text-[11px]">おむつ {p.diaperSize}・残り {rem}</span>
                </TagPill>
                {low ? (
                  <TagPill>
                    <span className="text-[11px] text-amber-200">残り少ない</span>
                  </TagPill>
                ) : null}
                {low && purchaseUrl ? (
                  <a
                    className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-500/20 px-3 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/30"
                    href={purchaseUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    購入へ
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          <button
            className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 hover:bg-white/10"
            onClick={() => {
              const body = buildDailyReport(babyId, byBaby[babyId]);
              addEvent(babyId, "daily", { note: body });
            }}
            title="日次レポート"
          >
            <FileText className="h-4 w-4" />
            まとめ
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <MiniCard label="ミルク合計">
            <div className="flex items-end gap-2">
              <span className="text-sky-300">{milkTotal}</span>
              <span className="mb-1 text-lg font-semibold text-white/70">ml</span>
              <span className="mb-1 ml-auto text-sm text-white/50">{milkEvents.length}回</span>
            </div>
          </MiniCard>
          <MiniCard label="おむつ">
            <div className="flex items-end gap-2">
              <span className="text-amber-300">{diaperCount}</span>
              <span className="mb-1 text-lg font-semibold text-white/70">回</span>
            </div>
          </MiniCard>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <SolidButton
            tone="milk"
            icon={<Milk className="h-6 w-6" />}
            title="ミルク"
            onClick={() => {
              setMilkMl(140);
              setMilkMethod("breast");
              setNote("");
              setModal({ kind: "milk", babyId });
            }}
          />
          <SolidButton
            tone="diaper"
            icon={<Droplets className="h-6 w-6" />}
            title="おむつ"
            onClick={() => {
              setDiaperKind("pee");
              setNote("");
              setModal({ kind: "diaper", babyId });
            }}
          />
        </div>

        <div className="mt-5">
          <div className="text-sm font-semibold text-white/40">今日のログ</div>
          <div className="mt-3 flex flex-col gap-3">
            {byBaby[babyId].length === 0 ? (
              <div className="rounded-[26px] border border-white/10 bg-white/5 p-4 text-sm text-white/55">
                まだ記録がありません
              </div>
            ) : (
              byBaby[babyId]
                .slice(0, 4)
                .map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onEdit={(ev) => setModal({ kind: "edit", eventId: ev.id })}
                    onDelete={(ev) => removeEvent(ev.id)}
                  />
                ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const openSettings = () => setModal({ kind: "settings" });

  const milkTitle = modal && modal.kind === "milk" ? `${app.profiles[modal.babyId].displayName}: ミルク記録` : "ミルク記録";
  const diaperTitle =
    modal && modal.kind === "diaper" ? `${app.profiles[modal.babyId].displayName}: おむつ記録` : "おむつ記録";

  const [newSize, setNewSize] = useState<Record<BabyId, string>>({ A: "", B: "" });
  const [importText, setImportText] = useState("");

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#040814] via-[#050B1A] to-[#040814]">
      <div className="mx-auto max-w-[1500px] p-4">
        <div className="flex items-center justify-between gap-3 rounded-[28px] border border-white/10 bg-white/5 px-5 py-4 shadow-xl shadow-black/30">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-black/30">
              <Baby className="h-6 w-6 text-white" />
            </div>
            <div className="text-2xl font-extrabold tracking-tight text-white">Twinly</div>
            <TagPill>
              <span className="font-semibold">PWA</span>
            </TagPill>
            <CalendarStatusPill status={syncStatus} />
          </div>

          <div className="flex items-center gap-2">
            <button
              className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5 hover:bg-white/10"
              onClick={openSettings}
              aria-label="settings"
            >
              <Settings className="h-5 w-5 text-white/70" />
            </button>
            <div className="grid h-12 w-12 place-items-center rounded-full bg-white/10">
              <CircleUser className="h-6 w-6 text-white/70" />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TagPill>
              <CalendarDays className="h-4 w-4" />
              <span className="font-semibold">{todayLabel}</span>
            </TagPill>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-white/50">表示日</label>
            <input
              type="date"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
              value={activeDate}
              onChange={(e) => setActiveDate(e.target.value)}
            />
            <button
              className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
              onClick={resetAll}
              title="全消し"
            >
              <Trash2 className="h-4 w-4" />
              全消し
            </button>
          </div>
        </div>

        <div className="mt-4 flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-2 lg:overflow-visible lg:pb-0">
          <BabyPanel babyId="A" />
          <BabyPanel babyId="B" />
        </div>
      </div>

      <SnackbarUndo open={undo.open} message="記録を保存しました" onUndo={undoLast} onClose={() => setUndo({ open: false })} />

      <ModalShell
        open={!!modal && modal.kind === "milk"}
        title={milkTitle}
        onClose={() => setModal(null)}
        footer={
          <>
            <button
              className="rounded-2xl bg-white/5 px-6 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
              onClick={() => setModal(null)}
            >
              キャンセル
            </button>
            <button
              className="rounded-2xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white hover:bg-sky-500"
              onClick={() => {
                if (!modal || modal.kind !== "milk") return;
                addEvent(modal.babyId, "milk", { milkMl, milkMethod, note });
                setModal(null);
              }}
            >
              保存する
            </button>
          </>
        }
      >
        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
          <div className="text-center text-sm font-semibold text-white/55">量 (ml)</div>

          <div className="mt-6 flex items-center justify-center gap-6">
            <button
              className="grid h-16 w-16 place-items-center rounded-full bg-white/5 hover:bg-white/10"
              onClick={() => setMilkMl((v) => clamp(v - 10, 0, 999))}
              aria-label="minus"
            >
              <span className="text-3xl font-semibold text-white/70">-</span>
            </button>

            <div className="text-7xl font-extrabold tracking-tight text-sky-300">{milkMl}</div>

            <button
              className="grid h-16 w-16 place-items-center rounded-full bg-white/5 hover:bg-white/10"
              onClick={() => setMilkMl((v) => clamp(v + 10, 0, 999))}
              aria-label="plus"
            >
              <span className="text-3xl font-semibold text-white/70">+</span>
            </button>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <button
              className={`rounded-[22px] border px-4 py-4 text-base font-semibold ${
                milkMethod === "bottle"
                  ? "border-white/20 bg-white/10 text-white"
                  : "border-white/10 bg-white/5 text-white/55 hover:bg-white/8"
              }`}
              onClick={() => setMilkMethod("bottle")}
            >
              哺乳瓶
            </button>
            <button
              className={`rounded-[22px] border px-4 py-4 text-base font-semibold ${
                milkMethod === "breast"
                  ? "border-sky-300/40 bg-sky-600/30 text-white"
                  : "border-white/10 bg-white/5 text-white/55 hover:bg-white/8"
              }`}
              onClick={() => setMilkMethod("breast")}
            >
              母乳
            </button>
          </div>

          <div className="mt-5">
            <div className="text-xs text-white/50">メモ（任意）</div>
            <input
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例：途中でゲップ"
            />
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={!!modal && modal.kind === "diaper"}
        title={diaperTitle}
        onClose={() => setModal(null)}
        icon={<Droplets className="h-5 w-5 text-white" />}
        footer={
          <>
            <button
              className="rounded-2xl bg-white/5 px-6 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
              onClick={() => setModal(null)}
            >
              キャンセル
            </button>
            <button
              className="rounded-2xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-500"
              onClick={() => {
                if (!modal || modal.kind !== "diaper") return;
                addEvent(modal.babyId, "diaper", { diaperKind, note });
                setModal(null);
              }}
            >
              保存する
            </button>
          </>
        }
      >
        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
          <div className="text-sm font-semibold text-white/55">種類</div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {([
              { k: "pee", label: "おしっこ" },
              { k: "poop", label: "うんち" },
              { k: "mix", label: "両方" },
            ] as const).map((x) => (
              <button
                key={x.k}
                className={`rounded-[22px] border px-4 py-4 text-sm font-semibold ${
                  diaperKind === x.k
                    ? "border-amber-300/40 bg-amber-600/30 text-white"
                    : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10"
                }`}
                onClick={() => setDiaperKind(x.k)}
              >
                {x.label}
              </button>
            ))}
          </div>

          <div className="mt-5">
            <div className="text-xs text-white/50">メモ（任意）</div>
            <input
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例：肌荒れ気味"
            />
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={!!modal && modal.kind === "settings"}
        title="設定"
        onClose={() => setModal(null)}
        icon={<Settings className="h-5 w-5 text-white" />}
        footer={
          <>
            <button
              className="rounded-2xl bg-white/5 px-6 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
              onClick={() => setModal(null)}
            >
              閉じる
            </button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-5">
            <div className="text-base font-semibold text-white">Googleカレンダー</div>
            <div className="mt-2 text-xs text-white/55">
              ここはモックです。本実装はOAuth 2.0で権限を取り、各イベントを「育児記録-A/B」に作成します。
            </div>
            <div className="mt-3 text-xs text-white/55">アカウント</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/80">
              <span>
                {authReady ? (authUser ? `${authUser.displayName ?? "未設定"} (${authUser.email ?? "-"})` : "未ログイン") : "確認中..."}
              </span>
              {authUser ? (
                <button
                  className="rounded-2xl bg-white/5 px-4 py-2 text-xs font-semibold text-white/75 hover:bg-white/10"
                  onClick={signOutGoogle}
                >
                  ログアウト
                </button>
              ) : (
                <button
                  className="rounded-2xl bg-white/5 px-4 py-2 text-xs font-semibold text-white/75 hover:bg-white/10"
                  onClick={signInGoogle}
                >
                  Googleでログイン
                </button>
              )}
            </div>
            <div className="mt-3 text-xs text-white/55">カレンダー権限</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/80">
              <span>{googleToken ? "取得済み" : "未取得"}</span>
              <button
                className="rounded-2xl bg-white/5 px-4 py-2 text-xs font-semibold text-white/75 hover:bg-white/10"
                onClick={signInGoogle}
                disabled={!authUser}
                title={!authUser ? "ログインが必要です" : undefined}
              >
                権限を更新
              </button>
              <button
                className="rounded-2xl bg-white/5 px-4 py-2 text-xs font-semibold text-white/75 hover:bg-white/10"
                onClick={syncTodayEvents}
                disabled={!authUser}
                title={!authUser ? "ログインが必要です" : undefined}
              >
                今日を同期
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(Object.keys(app.profiles) as BabyId[]).map((babyId) => (
                <div key={babyId} className="min-w-0 rounded-[26px] border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold text-white">{babyId}</div>
                  <div className="mt-3 text-xs text-white/55">カレンダー名</div>
                  <input
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                    value={app.profiles[babyId].calendarName}
                    onChange={(e) =>
                      setApp((prev) => ({
                        ...prev,
                        profiles: {
                          ...prev.profiles,
                          [babyId]: { ...prev.profiles[babyId], calendarName: e.target.value },
                        },
                      }))
                    }
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                      onClick={() => createCalendar(babyId)}
                    >
                      カレンダー作成
                    </button>
                    <button
                      className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                      onClick={() => findCalendar(babyId)}
                    >
                      カレンダー検索
                    </button>
                  </div>
                  <div className="mt-3 text-xs text-white/55">カレンダーID</div>
                  <div className="mt-1 break-all rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
                    {app.profiles[babyId].calendarId || "-"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-white/5 p-5">
            <div className="text-base font-semibold text-white">クラウド共有（Phase 1.5）</div>
            <div className="mt-2 text-xs text-white/55">
              Googleログイン後、家族コードを共有して同じデータを使います。
            </div>
            <div className="mt-3 text-xs text-white/55">家族コード</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                {familyId || "未設定"}
              </div>
              <button
                className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                onClick={createFamily}
              >
                新しい家族を作成
              </button>
            </div>
            <div className="mt-3 text-xs text-white/55">参加する</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 sm:w-56"
                placeholder="家族コードを入力"
                value={familyInput}
                onChange={(e) => setFamilyInput(e.target.value)}
              />
              <button
                className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                onClick={joinFamily}
              >
                参加
              </button>
              {familyId ? (
                <button
                  className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                  onClick={() => saveFamilyId("")}
                >
                  解除
                </button>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                onClick={loadFromCloud}
              >
                クラウドから読み込み
              </button>
              <button
                className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                onClick={saveToCloud}
              >
                クラウドに保存
              </button>
              <span className="text-xs text-white/55">
                {cloudStatus === "saving"
                  ? "保存中..."
                  : cloudStatus === "loading"
                  ? "読み込み中..."
                  : cloudStatus === "done"
                  ? "完了"
                  : cloudStatus === "error"
                  ? "エラー"
                  : ""}
              </span>
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-white/5 p-5">
            <div className="text-base font-semibold text-white">赤ちゃんプロフィール</div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(Object.keys(app.profiles) as BabyId[]).map((babyId) => {
                const p = app.profiles[babyId];
                const sizes = Object.keys(p.diaperStockBySize);
                return (
                  <div key={babyId} className="min-w-0 rounded-[26px] border border-white/10 bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white">{babyId}</div>

                    <div className="mt-3 text-xs text-white/55">表示名</div>
                    <input
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                      value={p.displayName}
                      onChange={(e) =>
                        setApp((prev) => ({
                          ...prev,
                          profiles: {
                            ...prev.profiles,
                            [babyId]: { ...prev.profiles[babyId], displayName: e.target.value },
                          },
                        }))
                      }
                    />

                    <div className="mt-3 text-xs text-white/55">生年月日</div>
                    <input
                      type="date"
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                      value={p.birthDate}
                      onChange={(e) =>
                        setApp((prev) => ({
                          ...prev,
                          profiles: {
                            ...prev.profiles,
                            [babyId]: { ...prev.profiles[babyId], birthDate: e.target.value },
                          },
                        }))
                      }
                    />

                    <div className="mt-3 text-xs text-white/55">現在サイズ</div>
                    <select
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                      value={p.diaperSize}
                      onChange={(e) => changeDiaperSize(babyId, e.target.value)}
                    >
                      {sizes.map((size) => (
                        <option key={size} value={size} className="bg-[#0B152D]">
                          {size}
                        </option>
                      ))}
                    </select>

                    <div className="mt-3 text-xs text-white/55">購入リンク（任意）</div>
                    <input
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                      value={p.diaperPurchaseUrl ?? ""}
                      onChange={(e) =>
                        setApp((prev) => ({
                          ...prev,
                          profiles: {
                            ...prev.profiles,
                            [babyId]: { ...prev.profiles[babyId], diaperPurchaseUrl: e.target.value },
                          },
                        }))
                      }
                    />

                    <div className="mt-3 text-xs text-white/55">在庫数</div>
                    <div className="mt-2 grid gap-2">
                      {sizes.map((size) => (
                        <div
                          key={size}
                          className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                        >
                          <span>{size}</span>
                          <span>{p.diaperStockBySize[size] ?? 0}</span>
                          <div className="flex gap-2">
                            <button
                              className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 hover:bg-white/10"
                              onClick={() => addStock(babyId, size, 20)}
                            >
                              +20
                            </button>
                            <button
                              className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 hover:bg-white/10"
                              onClick={() => addStock(babyId, size, 50)}
                            >
                              +50
                            </button>
                            <button
                              className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 hover:bg-white/10"
                              onClick={() => addStock(babyId, size, -20)}
                            >
                              -20
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <input
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                        placeholder="サイズ追加（例：XL）"
                        value={newSize[babyId]}
                        onChange={(e) => setNewSize((prev) => ({ ...prev, [babyId]: e.target.value }))}
                      />
                      <button
                        className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                        onClick={() => {
                          addStockSize(babyId, newSize[babyId]);
                          setNewSize((prev) => ({ ...prev, [babyId]: "" }));
                        }}
                      >
                        追加
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-white/5 p-5">
            <div className="text-base font-semibold text-white">データ</div>
            <div className="mt-2 text-xs text-white/55">JSONのエクスポート・インポートが可能です。</div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                onClick={exportJson}
              >
                JSONをダウンロード
              </button>
            </div>

            <div className="mt-4">
              <div className="text-xs text-white/55">JSON貼り付け</div>
              <textarea
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                rows={4}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="ここにJSONを貼り付けてインポート"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                  onClick={() => importJson(importText)}
                >
                  インポート
                </button>
                <button
                  className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                  onClick={() => setImportText("")}
                >
                  クリア
                </button>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs text-white/55">ファイルから読み込み</div>
              <input
                type="file"
                accept="application/json"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  file.text().then((text) => importJson(text));
                }}
              />
            </div>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={!!modal && modal.kind === "edit"}
        title={editTarget ? `${app.profiles[editTarget.babyId].displayName}: 編集` : "編集"}
        onClose={() => setModal(null)}
        icon={<Pencil className="h-5 w-5 text-white" />}
        footer={
          <>
            <button
              className="rounded-2xl bg-white/5 px-6 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
              onClick={() => setModal(null)}
            >
              キャンセル
            </button>
            <button
              className="rounded-2xl bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15"
              onClick={saveEdit}
              disabled={!editTarget}
            >
              保存
            </button>
          </>
        }
      >
        {!editTarget ? (
          <div className="rounded-[26px] border border-white/10 bg-white/5 p-4 text-sm text-white/55">対象が見つかりません</div>
        ) : (
          <div className="grid gap-4">
            {editTarget.type === "milk" ? (
              <div className="rounded-[26px] border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white/70">ミルク</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-white/50">量 (ml)</div>
                    <input
                      type="number"
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                      value={milkMl}
                      onChange={(e) => setMilkMl(clamp(Number(e.target.value || 0), 0, 999))}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-white/50">種類</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                          milkMethod === "bottle" ? "border-white/20 bg-white/10 text-white" : "border-white/10 bg-white/5 text-white/55"
                        }`}
                        onClick={() => setMilkMethod("bottle")}
                      >
                        哺乳瓶
                      </button>
                      <button
                        className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                          milkMethod === "breast" ? "border-sky-300/40 bg-sky-600/30 text-white" : "border-white/10 bg-white/5 text-white/55"
                        }`}
                        onClick={() => setMilkMethod("breast")}
                      >
                        母乳
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {editTarget.type === "diaper" ? (
              <div className="rounded-[26px] border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white/70">おむつ</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {([
                    { k: "pee", label: "おしっこ" },
                    { k: "poop", label: "うんち" },
                    { k: "mix", label: "両方" },
                  ] as const).map((x) => (
                    <button
                      key={x.k}
                      className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
                        diaperKind === x.k ? "border-amber-300/40 bg-amber-600/30 text-white" : "border-white/10 bg-white/5 text-white/55"
                      }`}
                      onClick={() => setDiaperKind(x.k)}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-[26px] border border-white/10 bg-white/5 p-4">
              <div className="text-xs text-white/50">メモ</div>
              <textarea
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        )}
      </ModalShell>
    </div>
  );
}

