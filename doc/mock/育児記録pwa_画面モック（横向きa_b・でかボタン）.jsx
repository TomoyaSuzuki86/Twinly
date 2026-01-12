import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Baby,
  Droplets,
  Milk,
  Undo2,
  CalendarDays,
  Settings,
  FileText,
  Trash2,
  Pencil,
  Check,
  X,
  CircleUser,
} from "lucide-react";

/**
 * 育児記録PWA 画面モック（ダークUI）
 * - 添付のデザイン寄り（濃い紺 + 大きいボタン + 角丸）
 * - A/B 2カラム（横向き想定）
 * - ミルク/おむつを即記録、詳細はモーダル
 * - Undo（数秒）
 * - 当日ログ（カード）
 * - Googleカレンダー同期はモック（表示だけ）
 */

const LS_KEY = "twin-log-mock-v2";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtTime(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

type BabyId = "A" | "B";

type EventType = "milk" | "diaper" | "daily";

type DiaperKind = "pee" | "poop" | "mix";

type MilkMethod = "bottle" | "breast";

type LogEvent = {
  id: string;
  baby: BabyId;
  type: EventType;
  ts: number; // epoch ms
  milkMl?: number;
  milkMethod?: MilkMethod;
  diaperKind?: DiaperKind;
  note?: string;
  calendarStatus?: "pending" | "synced" | "error"; // モック
};

type BabyProfile = {
  id: BabyId;
  label: string;
  birthDateISO: string; // YYYY-MM-DD（デモ表示用）
  diaperSize: string;
  diaperStock: Record<string, number>; // size -> remaining
  calendarName: string;
};

type AppState = {
  profiles: Record<BabyId, BabyProfile>;
  events: LogEvent[];
  ui: {
    lastViewedDate: string;
  };
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function startOfDayMs(d: Date) {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  return dd.getTime();
}

function endOfDayMs(d: Date) {
  const dd = new Date(d);
  dd.setHours(23, 59, 59, 999);
  return dd.getTime();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function daysSince(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const now = new Date();
  const ms = startOfDayMs(now) - startOfDayMs(d);
  const days = Math.floor(ms / 1000 / 60 / 60 / 24);
  return Math.max(0, days);
}

function useLocalStorageState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initial;
      return JSON.parse(raw);
    } catch {
      return initial;
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

function demoBirthDate(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return fmtDate(d);
}

const baseProfiles: Record<BabyId, BabyProfile> = {
  A: {
    id: "A",
    label: "赤ちゃんA",
    birthDateISO: demoBirthDate(103),
    diaperSize: "新生児",
    diaperStock: { "新生児": 80, S: 0, M: 0 },
    calendarName: "育児記録-A",
  },
  B: {
    id: "B",
    label: "赤ちゃんB",
    birthDateISO: demoBirthDate(103),
    diaperSize: "新生児",
    diaperStock: { "新生児": 80, S: 0, M: 0 },
    calendarName: "育児記録-B",
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

  const bg =
    tone === "milk"
      ? "bg-sky-600 hover:bg-sky-500"
      : "bg-amber-600 hover:bg-amber-500";

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
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            className="w-full max-w-2xl overflow-hidden rounded-[40px] border border-white/10 bg-[#0B152D] shadow-2xl shadow-black/50"
            initial={{ y: 18, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 14, opacity: 0, scale: 0.98 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">
                  <Milk className="h-5 w-5 text-white" />
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
            <div className="px-6 pb-4">{children}</div>
            <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-5">
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
            <button
              className="sr-only"
              onClick={onClose}
              aria-label="close-snackbar"
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function CalendarStatusPill({ status }: { status?: LogEvent["calendarStatus"] }) {
  const text = status === "synced" ? "SYNCED" : status === "pending" ? "SYNCING" : status === "error" ? "ERROR" : "—";
  const dot = status === "synced" ? "bg-emerald-400" : status === "pending" ? "bg-amber-400" : status === "error" ? "bg-rose-400" : "bg-white/30";
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/80">
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      <span className="font-semibold">GOOGLE CALENDAR {text}</span>
    </div>
  );
}

function EventCard({
  e,
  onEdit,
  onDelete,
}: {
  e: LogEvent;
  onEdit: (e: LogEvent) => void;
  onDelete: (e: LogEvent) => void;
}) {
  const t = fmtTime(new Date(e.ts));

  const iconBg = e.type === "milk" ? "bg-sky-500/20" : e.type === "diaper" ? "bg-amber-500/20" : "bg-violet-500/20";
  const icon = e.type === "milk" ? <Milk className="h-5 w-5 text-sky-300" /> : e.type === "diaper" ? <Droplets className="h-5 w-5 text-amber-300" /> : <FileText className="h-5 w-5 text-violet-300" />;

  const title =
    e.type === "milk"
      ? `${e.milkMl ?? 0}ml（${e.milkMethod === "breast" ? "母乳" : "哺乳瓶"}）`
      : e.type === "diaper"
      ? `おむつ（${e.diaperKind === "pee" ? "おしっこ" : e.diaperKind === "poop" ? "うんち" : "両方"}）`
      : "日次レポート";

  return (
    <div className="flex items-center justify-between gap-3 rounded-[26px] border border-white/10 bg-white/5 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`grid h-12 w-12 place-items-center rounded-2xl ${iconBg}`}>{icon}</div>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-white">{title}</div>
          {e.note ? <div className="mt-1 truncate text-xs text-white/55">{e.note}</div> : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-14 text-right text-sm text-white/55">{t}</div>
        <button
          className="grid h-11 w-11 place-items-center rounded-2xl bg-white/5 hover:bg-white/10"
          onClick={() => onEdit(e)}
          aria-label="edit"
        >
          <Pencil className="h-4 w-4 text-white/75" />
        </button>
        <button
          className="grid h-11 w-11 place-items-center rounded-2xl bg-white/5 hover:bg-white/10"
          onClick={() => onDelete(e)}
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

  // モーダル
  const [modal, setModal] = useState<
    | { kind: "milk"; baby: BabyId }
    | { kind: "diaper"; baby: BabyId }
    | { kind: "settings" }
    | { kind: "edit"; eventId: string }
    | null
  >(null);

  // 入力
  const [milkMl, setMilkMl] = useState(140);
  const [milkMethod, setMilkMethod] = useState<MilkMethod>("breast");
  const [diaperKind, setDiaperKind] = useState<DiaperKind>("pee");
  const [note, setNote] = useState("");

  // Undo
  const [undo, setUndo] = useState<{ open: boolean; event?: LogEvent }>({ open: false });
  const undoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setApp((prev) => ({ ...prev, ui: { ...prev.ui, lastViewedDate: activeDate } }));
  }, [activeDate, setApp]);

  const dayRange = useMemo(() => {
    const d = new Date(activeDate + "T00:00:00");
    return { from: startOfDayMs(d), to: endOfDayMs(d) };
  }, [activeDate]);

  const eventsToday = useMemo(() => {
    return app.events
      .filter((e) => e.ts >= dayRange.from && e.ts <= dayRange.to)
      .sort((a, b) => b.ts - a.ts);
  }, [app.events, dayRange]);

  const byBaby = useMemo(() => {
    const out: Record<BabyId, LogEvent[]> = { A: [], B: [] };
    for (const e of eventsToday) out[e.baby].push(e);
    return out;
  }, [eventsToday]);

  const syncStatus = useMemo<LogEvent["calendarStatus"]>(() => {
    // 今日のイベントが全てsyncedならsynced、pendingがあればpending、errorがあればerror
    if (eventsToday.some((e) => e.calendarStatus === "error")) return "error";
    if (eventsToday.some((e) => e.calendarStatus === "pending")) return "pending";
    if (eventsToday.length > 0) return "synced";
    return "synced";
  }, [eventsToday]);

  const lowStock = useMemo(() => {
    const out: Record<BabyId, { size: string; remaining: number } | null> = { A: null, B: null };
    (Object.keys(app.profiles) as BabyId[]).forEach((b) => {
      const p = app.profiles[b];
      const rem = p.diaperStock[p.diaperSize] ?? 0;
      if (rem <= 10) out[b] = { size: p.diaperSize, remaining: rem };
    });
    return out;
  }, [app.profiles]);

  const scheduleUndo = (event: LogEvent) => {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndo({ open: true, event });
    undoTimerRef.current = window.setTimeout(() => setUndo({ open: false }), 7000);
  };

  const setCalendarMockStatus = (eventId: string, status: LogEvent["calendarStatus"]) => {
    setApp((prev) => ({
      ...prev,
      events: prev.events.map((e) => (e.id === eventId ? { ...e, calendarStatus: status } : e)),
    }));
  };

  const addEvent = (baby: BabyId, type: EventType, payload?: Partial<LogEvent>) => {
    const ev: LogEvent = {
      id: uid(),
      baby,
      type,
      ts: Date.now(),
      calendarStatus: "pending",
      ...payload,
    };

    // おむつ在庫（現在サイズを1つ減らす）
    if (type === "diaper") {
      const p = app.profiles[baby];
      const size = p.diaperSize;
      const remaining = (p.diaperStock[size] ?? 0) - 1;
      setApp((prev) => ({
        ...prev,
        profiles: {
          ...prev.profiles,
          [baby]: {
            ...prev.profiles[baby],
            diaperStock: {
              ...prev.profiles[baby].diaperStock,
              [size]: Math.max(0, remaining),
            },
          },
        },
        events: [ev, ...prev.events],
      }));
    } else {
      setApp((prev) => ({ ...prev, events: [ev, ...prev.events] }));
    }

    // モック：少し遅れて同期済みにする
    window.setTimeout(() => setCalendarMockStatus(ev.id, "synced"), 450);

    scheduleUndo(ev);
  };

  const removeEvent = (eventId: string) => {
    setApp((prev) => ({ ...prev, events: prev.events.filter((e) => e.id !== eventId) }));
  };

  const undoLast = () => {
    const ev = undo.event;
    if (!ev) return;

    // おむつなら在庫を戻す
    if (ev.type === "diaper") {
      const p = app.profiles[ev.baby];
      const size = p.diaperSize;
      setApp((prev) => ({
        ...prev,
        profiles: {
          ...prev.profiles,
          [ev.baby]: {
            ...prev.profiles[ev.baby],
            diaperStock: {
              ...prev.profiles[ev.baby].diaperStock,
              [size]: (prev.profiles[ev.baby].diaperStock[size] ?? 0) + 1,
            },
          },
        },
        events: prev.events.filter((e) => e.id !== ev.id),
      }));
    } else {
      removeEvent(ev.id);
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

    const updated: Partial<LogEvent> =
      editTarget.type === "milk"
        ? { milkMl, milkMethod, note }
        : editTarget.type === "diaper"
        ? { diaperKind, note }
        : { note };

    setApp((prev) => ({
      ...prev,
      events: prev.events.map((e) =>
        e.id === editTarget.id ? { ...e, ...updated, calendarStatus: "pending" } : e
      ),
    }));

    window.setTimeout(() => setCalendarMockStatus(editTarget.id, "synced"), 500);
    setModal(null);
  };

  const resetAll = () => {
    setApp(initialState);
    setActiveDate(fmtDate(new Date()));
    setModal(null);
    setUndo({ open: false });
  };

  const todayLabel = useMemo(() => {
    const d = new Date(activeDate + "T00:00:00");
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }, [activeDate]);

  const BabyPanel = ({ baby }: { baby: BabyId }) => {
    const p = app.profiles[baby];
    const ageDays = daysSince(p.birthDateISO);

    const milkEvents = byBaby[baby].filter((e) => e.type === "milk");
    const diaperEvents = byBaby[baby].filter((e) => e.type === "diaper");

    const milkTotal = milkEvents.reduce((sum, e) => sum + (e.milkMl ?? 0), 0);
    const diaperCount = diaperEvents.length;

    const rem = p.diaperStock[p.diaperSize] ?? 0;

    return (
      <div className="rounded-[36px] border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/30">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-black/30">
              <Baby className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="text-2xl font-semibold tracking-tight text-white">{p.label}</div>
              <div className="mt-1 text-sm text-white/55">生後 {ageDays}日</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <TagPill>
                  <span className="text-[11px]">おむつ {p.diaperSize}：残り {rem}</span>
                </TagPill>
                {lowStock[baby] ? (
                  <TagPill>
                    <span className="text-[11px] text-amber-200">残り少ない</span>
                  </TagPill>
                ) : null}
              </div>
            </div>
          </div>

          <button
            className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 hover:bg-white/10"
            onClick={() => {
              const body = `${todayLabel} のまとめ
ミルク：${milkEvents.length}回（合計${milkTotal}ml）
おむつ：${diaperCount}回`;
              addEvent(baby, "daily", { note: body });
            }}
            title="日次レポート（モック）"
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
            onClick={() => addEvent(baby, "milk", { milkMl: 140, milkMethod: "breast" })}
            onLongPress={() => {
              setMilkMl(140);
              setMilkMethod("breast");
              setNote("");
              setModal({ kind: "milk", baby });
            }}
          />
          <SolidButton
            tone="diaper"
            icon={<Droplets className="h-6 w-6" />}
            title="おむつ"
            onClick={() => addEvent(baby, "diaper", { diaperKind: "pee" })}
            onLongPress={() => {
              setDiaperKind("pee");
              setNote("");
              setModal({ kind: "diaper", baby });
            }}
          />
        </div>

        <div className="mt-5">
          <div className="text-sm font-semibold text-white/40">今日のログ</div>
          <div className="mt-3 flex flex-col gap-3">
            {byBaby[baby].length === 0 ? (
              <div className="rounded-[26px] border border-white/10 bg-white/5 p-4 text-sm text-white/55">
                まだ記録がありません
              </div>
            ) : (
              byBaby[baby]
                .slice(0, 4)
                .map((e) => (
                  <EventCard
                    key={e.id}
                    e={e}
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

  const changeDiaperSize = (baby: BabyId, next: string) => {
    setApp((prev) => ({
      ...prev,
      profiles: {
        ...prev.profiles,
        [baby]: {
          ...prev.profiles[baby],
          diaperSize: next,
          diaperStock: {
            ...prev.profiles[baby].diaperStock,
            [next]: prev.profiles[baby].diaperStock[next] ?? 0,
          },
        },
      },
    }));
  };

  const addStock = (baby: BabyId, size: string, add: number) => {
    setApp((prev) => ({
      ...prev,
      profiles: {
        ...prev.profiles,
        [baby]: {
          ...prev.profiles[baby],
          diaperStock: {
            ...prev.profiles[baby].diaperStock,
            [size]: clamp((prev.profiles[baby].diaperStock[size] ?? 0) + add, 0, 9999),
          },
        },
      },
    }));
  };

  const openSettings = () => setModal({ kind: "settings" });

  const milkTitle = modal && modal.kind === "milk" ? `${app.profiles[modal.baby].label}: ミルク記録` : "ミルク記録";
  const diaperTitle = modal && modal.kind === "diaper" ? `${app.profiles[modal.baby].label}: おむつ記録` : "おむつ記録";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#040814] via-[#050B1A] to-[#040814]">
      <div className="mx-auto max-w-[1500px] p-4">
        {/* TOP BAR */}
        <div className="flex items-center justify-between gap-3 rounded-[28px] border border-white/10 bg-white/5 px-5 py-4 shadow-xl shadow-black/30">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-black/30">
              <Baby className="h-6 w-6 text-white" />
            </div>
            <div className="text-2xl font-extrabold tracking-tight text-white">BABY LOG</div>
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

        {/* DATE ROW */}
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
              title="全消し（モック）"
            >
              <Trash2 className="h-4 w-4" />
              全消し
            </button>
          </div>
        </div>

        {/* 2カラム */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <BabyPanel baby="A" />
          <BabyPanel baby="B" />
        </div>
      </div>

      {/* SNACKBAR UNDO */}
      <SnackbarUndo
        open={undo.open}
        message="記録を保存しました"
        onUndo={undoLast}
        onClose={() => setUndo({ open: false })}
      />

      {/* ミルクモーダル */}
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
                addEvent(modal.baby, "milk", { milkMl, milkMethod, note });
                setModal(null);
              }}
            >
              保存する
            </button>
          </>
        }
      >
        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
          <div className="text-center text-sm font-semibold text-white/55">量（ML）</div>

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

      {/* おむつモーダル */}
      <ModalShell
        open={!!modal && modal.kind === "diaper"}
        title={diaperTitle}
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
              className="rounded-2xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-500"
              onClick={() => {
                if (!modal || modal.kind !== "diaper") return;
                addEvent(modal.baby, "diaper", { diaperKind, note });
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

      {/* 設定モーダル */}
      <ModalShell
        open={!!modal && modal.kind === "settings"}
        title="設定（モック）"
        onClose={() => setModal(null)}
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
              ここはモックです。本実装ではOAuth 2.0で権限を取り、各イベントを「育児記録-A/B」に作成します。
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(Object.keys(app.profiles) as BabyId[]).map((b) => (
                <div key={b} className="rounded-[26px] border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold text-white">{b}</div>
                  <div className="mt-3 text-xs text-white/55">カレンダー名</div>
                  <input
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                    value={app.profiles[b].calendarName}
                    onChange={(e) =>
                      setApp((prev) => ({
                        ...prev,
                        profiles: {
                          ...prev.profiles,
                          [b]: { ...prev.profiles[b], calendarName: e.target.value },
                        },
                      }))
                    }
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                      onClick={() => alert("（モック）Googleでログイン")}
                    >
                      ログイン
                    </button>
                    <button
                      className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                      onClick={() => alert("（モック）カレンダー作成")}
                    >
                      カレンダー作成
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-white/5 p-5">
            <div className="text-base font-semibold text-white">おむつ在庫</div>
            <div className="mt-2 text-xs text-white/55">A/Bそれぞれ、現在サイズと残数を管理します（モック）。</div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(Object.keys(app.profiles) as BabyId[]).map((b) => {
                const p = app.profiles[b];
                const size = p.diaperSize;
                const rem = p.diaperStock[size] ?? 0;

                return (
                  <div key={b} className="rounded-[26px] border border-white/10 bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white">{b}</div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-white/55">現在サイズ</div>
                        <select
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                          value={size}
                          onChange={(e) => changeDiaperSize(b, e.target.value)}
                        >
                          {Object.keys(p.diaperStock).map((k) => (
                            <option key={k} value={k} className="bg-[#0B152D]">
                              {k}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="text-xs text-white/55">残り（{size}）</div>
                        <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                          {rem}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                        onClick={() => addStock(b, size, 20)}
                      >
                        +20
                      </button>
                      <button
                        className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                        onClick={() => addStock(b, size, 50)}
                      >
                        +50
                      </button>
                      <button
                        className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 hover:bg-white/10"
                        onClick={() => addStock(b, size, -20)}
                      >
                        -20
                      </button>
                    </div>

                    <div className="mt-2 text-xs text-white/45">残り10枚以下で「購入へ」を出す想定です。</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </ModalShell>

      {/* 編集モーダル（簡易） */}
      <ModalShell
        open={!!modal && modal.kind === "edit"}
        title={editTarget ? `${app.profiles[editTarget.baby].label}: 編集` : "編集"}
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
                    <div className="text-xs text-white/50">量（ml）</div>
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
