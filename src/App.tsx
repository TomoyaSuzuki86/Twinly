import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Baby, Check, CircleUser, FileText, LineChart, Settings, Undo2 } from "lucide-react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, ensureAuthPersistence, isFirebaseConfigured } from "./firebase";
import { BabyPanel } from "./components/BabyPanel";
import { AppState, BabyId, DiaperKind, EventType, LogEvent, MilkMethod } from "./types";
import { endOfDayMs, fmtDate, startOfDayMs, uid, removeUndefined } from "./lib/utils";
import { MilkModal } from "./components/MilkModal";
import { DiaperModal } from "./components/DiaperModal";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { SettingsModal } from "./components/SettingsModal";
import { EditModal } from "./components/EditModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { BabyTabTrigger } from "./components/BabyTabTrigger";
import { iconGradients } from "./lib/utils";
import { HealthChartModal } from "./components/HealthChartModal";
import { SkeletonLoader } from "./components/SkeletonLoader";
import { DailyReportModal } from "./components/DailyReportModal";
import { EventHistoryModal } from "./components/EventHistoryModal";
import { createInitialAppState, stripLegacyCalendarFields } from "./lib/app-state";
import { createDefaultDiaperDraft, createDefaultMilkDraft } from "./lib/entry-drafts";

const createEmptyState = () => createInitialAppState(new Date());

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

export default function App() {
  const [app, setApp] = useState<AppState>(() => createEmptyState());
  const [activeDate, setActiveDate] = useState(() => createEmptyState().ui.lastViewedDate);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [appLoading, setAppLoading] = useState(false);
  const firebaseEnabled = isFirebaseConfigured && Boolean(auth);

  const [modal, setModal] = useState<
    | { kind: "milk"; babyId: BabyId }
    | { kind: "diaper"; babyId: BabyId }
    | { kind: "settings" }
    | { kind: "edit"; eventId: string }
    | null
  >(null);
  const [chartModalOpen, setChartModalOpen] = useState(false);
  const [dailyReportModalOpen, setDailyReportModalOpen] = useState(false);
  const [historyModal, setHistoryModal] = useState<{ babyId: BabyId; type: "milk" | "diaper" } | null>(null);
  const [undo, setUndo] = useState<{ open: boolean; event?: LogEvent }>({ open: false });
  const undoTimerRef = useRef<number | null>(null);

  const saveAppToFirestore = async (nextApp: AppState) => {
    if (!db || !authUser) return;
    try {
      const appRef = doc(db, "users", authUser.uid, "app", "state");
      await setDoc(
        appRef,
        {
          app: removeUndefined(nextApp),
          updatedAt: serverTimestamp(),
          updatedBy: authUser.uid,
        },
        { merge: true }
      );
    } catch (error) {
      console.error("saveAppToFirestore failed", error);
    }
  };

  const ensureUserDocument = async (user: User) => {
    if (!db) return;
    const userRef = doc(db, "users", user.uid);
    await setDoc(
      userRef,
      {
        uid: user.uid,
        displayName: user.displayName ?? "",
        email: user.email ?? "",
        photoURL: user.photoURL ?? "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return undefined;
    }

    let unsub = () => {};
    let cancelled = false;

    const init = async () => {
      await ensureAuthPersistence();
      if (cancelled) return;
      unsub = onAuthStateChanged(auth, (user) => {
        setAuthUser(user);
        if (user) {
          void ensureUserDocument(user);
        } else {
          const nextState = createEmptyState();
          setApp(nextState);
          setActiveDate(nextState.ui.lastViewedDate);
          setAppLoading(false);
        }
        setAuthReady(true);
      });
    };

    void init();

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!authUser || !db) return;
    setAppLoading(true);
    const appRef = doc(db, "users", authUser.uid, "app", "state");
    const unsub = onSnapshot(appRef, (snap) => {
      if (!snap.exists()) {
        const nextState = createEmptyState();
        setApp(nextState);
        setActiveDate(nextState.ui.lastViewedDate);
        setAppLoading(false);
        return;
      }

      const data = snap.data();
      if (!data.app) {
        const nextState = createEmptyState();
        setApp(nextState);
        setActiveDate(nextState.ui.lastViewedDate);
        setAppLoading(false);
        return;
      }

      const nextState = stripLegacyCalendarFields(data.app as Parameters<typeof stripLegacyCalendarFields>[0]);
      setApp(nextState);
      setActiveDate(nextState.ui.lastViewedDate);
      setAppLoading(false);
    });

    return () => unsub();
  }, [authUser]);

  useEffect(() => {
    setApp((prev) => {
      if (prev.ui.lastViewedDate === activeDate) return prev;
      const nextApp = { ...prev, ui: { ...prev.ui, lastViewedDate: activeDate } };
      void saveAppToFirestore(nextApp);
      return nextApp;
    });
  }, [activeDate]);

  const handleOpenModal = (
    kind: "milk" | "diaper" | "edit" | "settings",
    payload?: { babyId: BabyId } | { eventId: string }
  ) => {
    if ((kind === "milk" || kind === "diaper") && payload && "babyId" in payload) {
      setModal({ kind, babyId: payload.babyId });
      return;
    }
    if (kind === "edit" && payload && "eventId" in payload) {
      setModal({ kind, eventId: payload.eventId });
      return;
    }
    if (kind === "settings") {
      setModal({ kind });
    }
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
    if (!authUser || !db) return;

    const event: LogEvent = {
      id: uid(),
      babyId,
      type,
      timestamp: Date.now(),
      ...payload,
    };

    setApp((prevApp) => {
      const nextApp = { ...prevApp, events: [event, ...prevApp.events] };
      void saveAppToFirestore(nextApp);
      return nextApp;
    });

    scheduleUndo(event);
  };

  const onSaveMilk = (payload: { milkMl: number; milkMethod: MilkMethod; note: string; timestamp: number }) => {
    if (!modal || modal.kind !== "milk") return;
    addEvent(modal.babyId, "milk", payload);
  };

  const onSaveDiaper = (payload: {
    diaperKind: DiaperKind;
    note: string;
    selectedDiaperSize: string;
    timestamp: number;
  }) => {
    if (!modal || modal.kind !== "diaper") return;

    const babyId = modal.babyId;
    const { diaperKind, note, selectedDiaperSize } = payload;
    addEvent(babyId, "diaper", { diaperKind, note });

    setApp((prevApp) => {
      const nextProfiles = { ...prevApp.profiles };
      const currentStock = nextProfiles[babyId].diaperStockBySize[selectedDiaperSize] ?? 0;

      (Object.keys(nextProfiles) as BabyId[]).forEach((id) => {
        nextProfiles[id] = {
          ...nextProfiles[id],
          diaperStockBySize: {
            ...nextProfiles[id].diaperStockBySize,
            [selectedDiaperSize]: currentStock - 1,
          },
          diaperSize: id === babyId ? selectedDiaperSize : nextProfiles[id].diaperSize,
        };
      });

      const nextApp = { ...prevApp, profiles: nextProfiles };
      void saveAppToFirestore(nextApp);
      return nextApp;
    });
  };

  const onSaveEdit = (eventId: string, payload: Partial<LogEvent>) => {
    setApp((prevApp) => {
      const originalEvent = prevApp.events.find((event) => event.id === eventId);
      if (!originalEvent) return prevApp;
      const updatedEvent = { ...originalEvent, ...payload };
      const nextEvents = prevApp.events.map((event) => (event.id === eventId ? updatedEvent : event));
      const nextApp = { ...prevApp, events: nextEvents };
      void saveAppToFirestore(nextApp);
      return nextApp;
    });
  };

  const handleAddEvent = (eventData: Omit<LogEvent, "id" | "timestamp">) => {
    const { babyId, type, ...payload } = eventData;
    addEvent(babyId, type, payload);
  };

  const removeEvent = (eventId: string) => {
    if (!authUser || !db) return;
    setApp((prevApp) => {
      const nextApp = { ...prevApp, events: prevApp.events.filter((event) => event.id !== eventId) };
      void saveAppToFirestore(nextApp);
      return nextApp;
    });
  };

  const undoLast = () => {
    if (!authUser || !db || !undo.event) return;

    setApp((prevApp) => {
      const nextApp = { ...prevApp, events: prevApp.events.filter((event) => event.id !== undo.event?.id) };
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
    return app.events.find((event) => event.id === modal.eventId) ?? null;
  }, [modal, app.events]);

  const resetAll = () => {
    if (!authUser || !db) return;
    if (!confirm("すべてのデータを削除しますか？")) return;
    const nextState = createEmptyState();
    setApp(nextState);
    void saveAppToFirestore(nextState);
    setActiveDate(nextState.ui.lastViewedDate);
    setModal(null);
    setUndo({ open: false });
  };

  const onUpdateDiaperStock = (babyId: BabyId, size: string, stock: number) => {
    setApp((prevApp) => {
      const nextProfiles = { ...prevApp.profiles };
      nextProfiles[babyId] = {
        ...nextProfiles[babyId],
        diaperStockBySize: {
          ...nextProfiles[babyId].diaperStockBySize,
          [size]: stock,
        },
      };

      (Object.keys(nextProfiles) as BabyId[]).forEach((otherBabyId) => {
        if (otherBabyId === babyId) return;
        nextProfiles[otherBabyId] = {
          ...nextProfiles[otherBabyId],
          diaperStockBySize: {
            ...nextProfiles[otherBabyId].diaperStockBySize,
            [size]: stock,
          },
        };
      });

      const nextApp = { ...prevApp, profiles: nextProfiles };
      void saveAppToFirestore(nextApp);
      return nextApp;
    });
  };

  const handleSignIn = async () => {
    if (!auth) return;
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
      alert("サインインに失敗しました");
    }
  };

  const handleSignOut = async () => {
    if (!auth) return;
    await signOut(auth);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(app, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `twinly-backup-${fmtDate(new Date())}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = ev.target?.result as string;
        const importedState = stripLegacyCalendarFields(
          JSON.parse(json) as Parameters<typeof stripLegacyCalendarFields>[0]
        );
        setApp(importedState);
        setActiveDate(importedState.ui.lastViewedDate);
        void saveAppToFirestore(importedState);
        alert("データをインポートしました");
      } catch {
        alert("ファイルの読み込みに失敗しました");
      }
    };
    reader.readAsText(file);
  };

  const dayRange = useMemo(() => {
    const date = new Date(`${activeDate}T00:00:00`);
    return { from: startOfDayMs(date), to: endOfDayMs(date) };
  }, [activeDate]);

  const eventsToday = useMemo(
    () =>
      app.events
        .filter((event) => event.timestamp >= dayRange.from && event.timestamp <= dayRange.to)
        .sort((a, b) => b.timestamp - a.timestamp),
    [app.events, dayRange]
  );

  const byBaby = useMemo(() => {
    const grouped: Record<BabyId, LogEvent[]> = { A: [], B: [] };
    for (const event of eventsToday) grouped[event.babyId].push(event);
    return grouped;
  }, [eventsToday]);

  const lastWeights = useMemo(() => {
    const result: Record<BabyId, number | null> = { A: null, B: null };
    const sortedEvents = [...app.events].sort((a, b) => b.timestamp - a.timestamp);
    const lastWeightA = sortedEvents.find((event) => event.babyId === "A" && event.type === "weight" && event.weight !== undefined);
    const lastWeightB = sortedEvents.find((event) => event.babyId === "B" && event.type === "weight" && event.weight !== undefined);
    if (lastWeightA?.weight !== undefined) result.A = lastWeightA.weight;
    if (lastWeightB?.weight !== undefined) result.B = lastWeightB.weight;
    return result;
  }, [app.events]);

  const lastHeights = useMemo(() => {
    const result: Record<BabyId, number | null> = { A: null, B: null };
    const sortedEvents = [...app.events].sort((a, b) => b.timestamp - a.timestamp);
    const lastHeightA = sortedEvents.find((event) => event.babyId === "A" && event.type === "height" && event.height !== undefined);
    const lastHeightB = sortedEvents.find((event) => event.babyId === "B" && event.type === "height" && event.height !== undefined);
    if (lastHeightA?.height !== undefined) result.A = lastHeightA.height;
    if (lastHeightB?.height !== undefined) result.B = lastHeightB.height;
    return result;
  }, [app.events]);

  const lowStock = useMemo(() => {
    const result: Record<BabyId, { size: string; remaining: number } | null> = { A: null, B: null };
    (Object.keys(app.profiles) as BabyId[]).forEach((babyId) => {
      const profile = app.profiles[babyId];
      const remaining = profile.diaperStockBySize[profile.diaperSize] ?? 0;
      if (remaining <= 10) {
        result[babyId] = { size: profile.diaperSize, remaining };
      }
    });
    return result;
  }, [app.profiles]);

  const milkDraft = useMemo(() => {
    if (!modal || modal.kind !== "milk") {
      return createDefaultMilkDraft(app.events, "A");
    }
    return createDefaultMilkDraft(app.events, modal.babyId);
  }, [app.events, modal]);

  const diaperDraft = useMemo(() => {
    if (!modal || modal.kind !== "diaper") {
      return createDefaultDiaperDraft(app.profiles.A.diaperSize);
    }
    return createDefaultDiaperDraft(app.profiles[modal.babyId].diaperSize);
  }, [app.profiles, modal]);

  if (!firebaseEnabled) {
    return (
      <AppContainer>
        <div className="grid h-screen place-items-center p-6">
          <div className="max-w-md space-y-3 text-center">
            <h1 className="text-2xl font-bold">Twinly</h1>
            <p className="text-muted-foreground">Firebase env vars are missing. Set VITE_FIREBASE_* in the build environment.</p>
          </div>
        </div>
      </AppContainer>
    );
  }

  if (!authReady || appLoading) {
    return (
      <AppContainer>
        <SkeletonLoader />
      </AppContainer>
    );
  }

  if (!authUser) {
    return (
      <AppContainer>
        <div className="grid h-screen place-items-center p-4">
          <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 text-card-foreground">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Twinly</h1>
              <p className="text-muted-foreground">Sign in with Google to start.</p>
            </div>
            <Button className="w-full" onClick={handleSignIn}>
              Sign in with Google
            </Button>
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
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setDailyReportModalOpen(true)} aria-label="show daily reports">
                <FileText className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setChartModalOpen(true)} aria-label="show chart">
                <LineChart className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleOpenModal("settings")} aria-label="settings">
                <Settings className="h-5 w-5" />
              </Button>
              {authUser.photoURL ? (
                <img src={authUser.photoURL} alt="avatar" className="h-10 w-10 rounded-full" />
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
                onOpenHistory={(type, babyId) => setHistoryModal({ type, babyId })}
                onOpenModal={handleOpenModal}
                onDeleteEvent={removeEvent}
                onAddEvent={handleAddEvent}
                lastWeight={lastWeights.A}
                lastHeight={lastHeights.A}
                themeDimmedBgColor={
                  iconGradients.find((gradient) => gradient.value === app.profiles.A.iconGradient)?.dimmedBgColor ??
                  "bg-background"
                }
              />
            </TabsContent>
            <TabsContent value="B" className="mt-4">
              <BabyPanel
                profile={app.profiles.B}
                events={byBaby.B}
                lowStock={lowStock.B}
                onOpenHistory={(type, babyId) => setHistoryModal({ type, babyId })}
                onOpenModal={handleOpenModal}
                onDeleteEvent={removeEvent}
                onAddEvent={handleAddEvent}
                lastWeight={lastWeights.B}
                lastHeight={lastHeights.B}
                themeDimmedBgColor={
                  iconGradients.find((gradient) => gradient.value === app.profiles.B.iconGradient)?.dimmedBgColor ??
                  "bg-background"
                }
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
        initialDraft={milkDraft}
        onSave={onSaveMilk}
      />
      <DiaperModal
        open={modal?.kind === "diaper"}
        onOpenChange={(open) => !open && setModal(null)}
        displayName={modal?.kind === "diaper" ? app.profiles[modal.babyId].displayName : ""}
        initialDraft={diaperDraft}
        onSave={onSaveDiaper}
        diaperStockBySize={modal?.kind === "diaper" ? app.profiles[modal.babyId].diaperStockBySize : {}}
        onUpdateDiaperStock={(size, stock) =>
          modal?.kind === "diaper" && onUpdateDiaperStock(modal.babyId, size, stock)
        }
        babyProfile={modal?.kind === "diaper" ? app.profiles[modal.babyId] : app.profiles.A}
      />
      <SettingsModal
        open={modal?.kind === "settings"}
        onOpenChange={(open) => !open && setModal(null)}
        app={app}
        setApp={(updater) => {
          setApp((prevApp) => {
            const nextApp = typeof updater === "function" ? updater(prevApp) : updater;
            void saveAppToFirestore(nextApp);
            return nextApp;
          });
        }}
        user={authUser}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onExport={handleExport}
        onImport={handleImport}
        onResetAll={resetAll}
      />
      <EditModal open={modal?.kind === "edit"} onOpenChange={(open) => !open && setModal(null)} event={editTarget} onSave={onSaveEdit} />
      <HealthChartModal open={chartModalOpen} onOpenChange={setChartModalOpen} events={app.events} profiles={app.profiles} />
      <DailyReportModal open={dailyReportModalOpen} onOpenChange={setDailyReportModalOpen} events={app.events} profiles={app.profiles} />
      {historyModal ? (
        <EventHistoryModal
          open={Boolean(historyModal)}
          onOpenChange={(open) => !open && setHistoryModal(null)}
          historyType={historyModal.type}
          events={app.events}
          profile={app.profiles[historyModal.babyId]}
        />
      ) : null}
    </AppContainer>
  );
}
