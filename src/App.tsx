
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Baby, Check, CircleUser, Settings, Trash2, Undo2 } from "lucide-react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "./firebase";
import { BabyPanel } from "./components/BabyPanel";
import { AppState, BabyId, BabyProfile, DiaperKind, EventType, LogEvent, MilkMethod } from "./types";
import { endOfDayMs, fmtDate, startOfDayMs, uid, removeUndefined } from "./lib/utils";
import { MilkModal } from "./components/MilkModal";
import { DiaperModal } from "./components/DiaperModal";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { SettingsModal } from "./components/SettingsModal";
import { EditModal } from "./components/EditModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { BabyTabTrigger } from "./components/BabyTabTrigger.tsx";

const LS_FAMILY_KEY = "twinly-family-id";
const LS_GOOGLE_TOKEN = "twinly-google-access-token";

function useLocalStorage<T>(key: string, initialValue: T) {
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
    diaperStockBySize: { 新生児: 80, S: 0, M: 0, L: 0 },
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
    diaperStockBySize: { 新生児: 80, S: 0, M: 0, L: 0 },
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

function AppContainer({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
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
          <div className="overflow-hidden rounded-lg border bg-primary text-primary-foreground shadow-2xl">
            <div className="grid grid-cols-2">
              <div className="flex items-center gap-3 px-5 py-4">
                <Check className="h-5 w-5" />
                <div className="text-sm font-semibold">{message}</div>
              </div>
              <Button variant="ghost" className="h-full rounded-none border-l" onClick={onUndo}>
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

function CalendarStatusDot({ status }: { status?: LogEvent["calendarStatus"] }) {
  const dot =
    status === "synced"
      ? "bg-emerald-400"
      : status === "pending"
      ? "bg-amber-400"
      : status === "error"
      ? "bg-rose-400"
      : "bg-muted-foreground";
  return <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />;
}

export default function App() {
  const [app, setApp] = useState<AppState>(initialState);
  const [familyId, setFamilyId] = useLocalStorage(LS_FAMILY_KEY, "");
  const [familyInput, setFamilyInput] = useState("");
  const [activeDate, setActiveDate] = useState(() => app.ui.lastViewedDate);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<"idle" | "saving" | "loading" | "error" | "done">("idle");
  const [googleToken, setGoogleToken] = useLocalStorage(LS_GOOGLE_TOKEN, "");
  const firebaseEnabled = isFirebaseConfigured && Boolean(auth);

  const [modal, setModal] = useState<
    | { kind: "milk"; babyId: BabyId }
    | { kind: "diaper"; babyId: BabyId }
    | { kind: "settings" }
    | { kind: "edit"; eventId: string }
    | null
  >(null);

  const saveAppToFirestore = async (nextApp: AppState) => {
    console.log("saveAppToFirestore: Saving app", nextApp);
    if (!familyId || !db || !authUser) return;
    setCloudStatus("saving");
    try {
      const appRef = doc(db, "families", familyId, "app", "state");
      await setDoc(
        appRef,
        {
          app: removeUndefined(nextApp),
          updatedAt: serverTimestamp(),
          updatedBy: authUser.uid,
        },
        { merge: true }
      );
      console.log("saveAppToFirestore: Data saved to Firestore");
      setCloudStatus("done");
    } catch (e) {
      console.error("saveAppToFirestore: Error saving data", e);
      setCloudStatus("error");
    }
  };

  useEffect(() => {
    if (!familyId || !db) return;
    const appRef = doc(db, "families", familyId, "app", "state");
    const unsub = onSnapshot(appRef, (snap) => {
      if (snap.exists()) {
        console.log("onSnapshot: Data received from Firestore", snap.data());
        const data = snap.data();
        if (data.app) {
          setApp(data.app as AppState);
          console.log("onSnapshot: App state updated from Firestore", data.app);
        }
      }
    });
    return () => unsub();
  }, [familyId, db]);

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

  const onSaveMilk = (payload: { milkMl: number; milkMethod: MilkMethod; note: string }) => {
    if (!modal || modal.kind !== "milk") return;
    addEvent(modal.babyId, "milk", payload);
  };

  const onSaveDiaper = (payload: { diaperKind: DiaperKind; note: string }) => {
    if (!modal || modal.kind !== "diaper") return;
    addEvent(modal.babyId, "diaper", payload);
  };

  const onSaveEdit = (eventId: string, payload: Partial<LogEvent>) => {
    setApp((prevApp) => {
      const originalEvent = prevApp.events.find((e) => e.id === eventId);
      if (!originalEvent) return prevApp;
      const updatedEvent = { ...originalEvent, ...payload };
      const nextEvents = prevApp.events.map((e) => (e.id === eventId ? updatedEvent : e));
      const nextApp = { ...prevApp, events: nextEvents };
      void saveAppToFirestore(nextApp);
      if (googleToken) {
        void syncEventToCalendar(updatedEvent);
      }
      return nextApp;
    });
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
    const nextApp = { ...app, ui: { ...app.ui, lastViewedDate: activeDate } };
    void saveAppToFirestore(nextApp);
  }, [activeDate]);

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

  useEffect(() => {
    if (!authUser || !familyId || !db) return;
    const memberRef = doc(db, "families", familyId, "members", authUser.uid);
    void setDoc(
      memberRef,
      {
        uid: authUser.uid,
        displayName: authUser.displayName ?? "",
        email: authUser.email ?? "",
        photoURL: authUser.photoURL ?? "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [authUser, familyId, db]);

  const onUpdateDiaperStock = (babyId: BabyId, size: string, stock: number) => {
    setApp((prevApp) => {
      const nextProfiles = { ...prevApp.profiles };
      // 選択された赤ちゃんの在庫を更新
      nextProfiles[babyId] = {
        ...nextProfiles[babyId],
        diaperStockBySize: {
          ...nextProfiles[babyId].diaperStockBySize,
          [size]: stock,
        },
      };

      // 他の赤ちゃんの同じサイズのおむつ在庫も更新
      (Object.keys(nextProfiles) as BabyId[]).forEach((otherBabyId) => {
        if (otherBabyId !== babyId) {
          nextProfiles[otherBabyId] = {
            ...nextProfiles[otherBabyId],
            diaperStockBySize: {
              ...nextProfiles[otherBabyId].diaperStockBySize,
              [size]: stock,
            },
          };
        }
      });

      return { ...prevApp, profiles: nextProfiles };
    });
  };

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

    console.log("addEvent: Event created", event);

    // Perform optimistic local update here
    setApp((prevApp) => {
      const nextApp = { ...prevApp, events: [event, ...prevApp.events] };
      console.log("addEvent: Local app state updated optimistically", nextApp);
      void saveAppToFirestore(nextApp); // Persist this state
      return nextApp;
    });

    scheduleUndo(event);

    if (shouldSync) {
      void syncEventToCalendar(event);
    }
  };

  const removeEvent = (eventId: string) => {
    setApp((prevApp) => {
      const nextApp = { ...prevApp, events: prevApp.events.filter((e) => e.id !== eventId) };
      void saveAppToFirestore(nextApp);
      return nextApp;
    });
  };

  const undoLast = () => {
    const event = undo.event;
    if (!event) return;

    console.log("undoLast: Undoing event", event.id);
    setApp((prevApp) => {
      const nextApp = { ...prevApp, events: prevApp.events.filter((e) => e.id !== event.id) };
      void saveAppToFirestore(nextApp);
      return nextApp;
    });

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
    setApp(initialState); // Optimistically update local state
    void saveAppToFirestore(initialState);
    setActiveDate(fmtDate(new Date()));
    setModal(null);
    setUndo({ open: false });
  };

  const updateEventInState = (eventId: string, patch: Partial<LogEvent>) => {
    console.log("updateEventInState: Applying patch", { eventId, patch });
    setApp((prevApp) => {
      const nextEvents = prevApp.events.map((e) => (e.id === eventId ? { ...e, ...patch } : e));
      const nextApp = { ...prevApp, events: nextEvents };
      void saveAppToFirestore(nextApp);
      return nextApp;
    });
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
        setGoogleToken("");
      }
      const errorBody = await res.json();
      console.error("fetchCalendarApi: API Error", { status: res.status, body: errorBody });
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
    console.log("ensureCalendarId: Fetching calendar list for", p.calendarName);
    const list = await fetchCalendarApi("/users/me/calendarList");
    const found = (list.items ?? []).find((item: any) => item.summary === p.calendarName);
    if (!found) {
      console.warn("ensureCalendarId: Calendar not found, creating new one", p.calendarName);
      const newCalendar = await fetchCalendarApi("/calendars", {
        method: "POST",
        body: JSON.stringify({ summary: p.calendarName }),
      });
      if (!newCalendar || !newCalendar.id) {
        console.error("ensureCalendarId: Failed to create calendar", p.calendarName);
        return "";
      }
      setApp((prevApp) => {
        const nextProfiles = { ...prevApp.profiles, [babyId]: { ...p, calendarId: newCalendar.id } };
        const nextApp = { ...prevApp, profiles: nextProfiles };
        void saveAppToFirestore(nextApp);
        return nextApp;
      });
      return newCalendar.id as string;
    }
    setApp((prevApp) => {
      const nextProfiles = { ...prevApp.profiles, [babyId]: { ...p, calendarId: found.id } };
      const nextApp = { ...prevApp, profiles: nextProfiles };
      void saveAppToFirestore(nextApp);
      return nextApp;
    });
    return found.id as string;
  };

  const syncEventToCalendar = async (event: LogEvent) => {
    console.log("syncEventToCalendar: Attempting to sync event", { eventId: event.id, currentStatus: event.calendarStatus });
    const calendarId = await ensureCalendarId(event.babyId);
    if (!calendarId) {
      console.error("syncEventToCalendar: No calendarId found for baby", event.babyId);
      updateEventInState(event.id, { calendarStatus: "error" });
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
      console.log("syncEventToCalendar: API success", { eventId: event.id, resId: res.id });
      updateEventInState(event.id, { calendarStatus: "synced", calendarEventId: res.id });
    } catch (error) {
      console.error("syncEventToCalendar: API failure", { eventId: event.id, error });
      updateEventInState(event.id, { calendarStatus: "error" });
    }
  };

  const handleSignIn = async () => {
    if (!auth) return;
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope("https://www.googleapis.com/auth/calendar");
      const res = await signInWithPopup(auth, provider);
      const cred = GoogleAuthProvider.credentialFromResult(res);
      if (cred?.accessToken) {
        setGoogleToken(cred.accessToken);
      }
    } catch (e) {
      console.error(e);
      alert("サインインに失敗しました");
    }
  };

  const handleSignOut = async () => {
    if (!auth) return;
    await signOut(auth);
    setGoogleToken("");
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(app, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `twinly-backup-${fmtDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = ev.target?.result as string;
        const importedState = JSON.parse(json) as AppState;
        // TODO: Add validation logic
        setApp(importedState); // Optimistically update local state
        void saveAppToFirestore(importedState);
        alert("データをインポートしました");
      } catch {
        alert("ファイルの読み込みに失敗しました");
      }
    };
    reader.readAsText(file);
  };

  if (!authReady) {
    return (
      <AppContainer>
        <div className="grid h-screen place-items-center">
          <p>読み込み中...</p>
        </div>
      </AppContainer>
    );
  }

  if (!familyId) {
    return (
      <AppContainer>
        <div className="mx-auto grid h-screen max-w-md place-items-center p-4">
          <div className="space-y-6 rounded-xl border bg-card p-8 text-card-foreground">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Twinlyへようこそ</h1>
              <p className="text-muted-foreground">
                データを同期するために、ファミリーIDを設定してください。
              </p>
            </div>
            <div className="space-y-4">
              <Button className="w-full" onClick={() => setFamilyId(uid())}>
                新しいファミリーを作成
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">または</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  value={familyInput}
                  onChange={(e) => setFamilyInput(e.target.value)}
                  placeholder="既存のファミリーID"
                />
                <Button variant="secondary" onClick={() => setFamilyId(familyInput)}>
                  参加
                </Button>
              </div>
            </div>
          </div>
        </div>
      </AppContainer>
    );
  }

  return (
    <AppContainer>
      <div className="mx-auto max-w-7xl p-2 sm:p-4">
        <header className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500">
                <Baby className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight">Twinly</h1>
              <CalendarStatusDot status={syncStatus} />
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => handleOpenModal("settings")} aria-label="settings">
                <Settings className="h-5 w-5" />
              </Button>
              {authUser ? (
                <img src={authUser.photoURL!} alt="avatar" className="h-10 w-10 rounded-full" />
              ) : (
                <div className="grid h-10 w-10 place-items-center rounded-full bg-muted">
                  <CircleUser className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-muted-foreground">表示日</label>
            <Input type="date" className="w-auto" value={activeDate} onChange={(e) => setActiveDate(e.target.value)} />
            <Button variant="outline" onClick={() => setActiveDate(fmtDate(new Date()))}>
              今日
            </Button>
          </div>
        </header>

        <main>
          <Tabs defaultValue="A" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-2">
              <TabsTrigger value="A" className="h-auto">
                <BabyTabTrigger profile={app.profiles.A} />
              </TabsTrigger>
              <TabsTrigger value="B" className="h-auto">
                <BabyTabTrigger profile={app.profiles.B} />
              </TabsTrigger>
            </TabsList>
            <TabsContent value="A" className="mt-4">
              <BabyPanel
                profile={app.profiles.A}
                events={byBaby.A}
                lowStock={lowStock.A}
                onOpenModal={handleOpenModal}
                onDeleteEvent={removeEvent}
              />
            </TabsContent>
            <TabsContent value="B" className="mt-4">
              <BabyPanel
                profile={app.profiles.B}
                events={byBaby.B}
                lowStock={lowStock.B}
                onOpenModal={handleOpenModal}
                onDeleteEvent={removeEvent}
              />
            </TabsContent>
          </Tabs>
        </main>
      </div>

      <SnackbarUndo
        open={undo.open}
        message="記録を保存しました"
        onUndo={undoLast}
        onClose={() => setUndo({ open: false })}
      />

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
        diaperStockBySize={modal?.kind === "diaper" ? app.profiles[modal.babyId].diaperStockBySize : {}}
        onUpdateDiaperStock={(size, stock) =>
          modal?.kind === "diaper" && onUpdateDiaperStock(modal.babyId, size, stock)
        }
      />
      <SettingsModal
        open={modal?.kind === "settings"}
        onOpenChange={(open) => !open && setModal(null)}
        app={app}
        setApp={(updater) => {
          const nextApp = typeof updater === "function" ? updater(app) : updater;
          void saveAppToFirestore(nextApp);
        }}
        user={authUser}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onExport={handleExport}
        onImport={handleImport}
        onResetAll={resetAll}
        googleToken={googleToken}
      />
      <EditModal
        open={modal?.kind === "edit"}
        onOpenChange={(open) => !open && setModal(null)}
        event={editTarget}
        onSave={onSaveEdit}
      />
    </AppContainer>
  );
}
