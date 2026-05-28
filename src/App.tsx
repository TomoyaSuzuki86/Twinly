import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Baby, Check, ChevronLeft, ChevronRight, CircleUser, Settings, Undo2 } from "lucide-react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { deleteDoc, doc, onSnapshot, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, ensureAuthPersistence, isFirebaseConfigured, webPushPublicKey } from "./firebase";
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
import { VoiceCommandButton, VoiceCommandButtonHandle } from "./components/VoiceCommandButton";
import { createInitialAppState, mergeSharedAppState, stripLegacyCalendarFields, toSharedAppState } from "./lib/app-state";
import { createDefaultDiaperDraft, createDefaultMilkDraft } from "./lib/entry-drafts";
import { estimateDiaperStockBySize } from "./lib/diaper-stock";
import { buildMilkProgressComparison } from "./lib/milk-progress";
import { createVoiceCommandBabyNames, expandVoiceCommandTargets, VoiceCommand } from "./lib/voice-command";
import { createWearPairingToken, hashWearPairingToken } from "./lib/wear-link";
import {
  getDeviceId,
  getExistingPushSubscription,
  getNotificationPermission,
  isWebPushSupported,
  requestNotificationPermission,
  serializePushSubscription,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "./lib/web-push";

declare global {
  interface Window {
    TwinlyAndroid?: {
      saveWearToken?: (token: string) => void;
    };
  }
}

const createEmptyState = () => createInitialAppState(new Date());
const AUTO_REFRESH_MS = 5 * 60 * 1000;

function AppContainer({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}

const shiftDate = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return fmtDate(date);
};

function SnackbarUndo({
  open,
  message,
  detail,
  onUndo,
  onRetry,
  onClose,
}: {
  open: boolean;
  message: string;
  detail?: string;
  onUndo: () => void;
  onRetry?: () => void;
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
            <div className="flex flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="flex min-w-0 items-start gap-3 px-4 py-3 sm:px-5 sm:py-4">
                <Check className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{message}</div>
                  {detail ? (
                    <div className="mt-1 whitespace-normal break-words text-xs leading-relaxed opacity-85">
                      聞き取り: 「{detail}」
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 border-t sm:contents">
                <Button variant="ghost" className="h-12 rounded-none sm:h-full sm:border-l" onClick={onUndo}>
                  <Undo2 className="mr-2 h-5 w-5" />
                  取り消す
                </Button>
                {onRetry ? (
                  <Button variant="ghost" className="h-12 rounded-none border-l sm:h-full" onClick={onRetry}>
                    やり直す
                  </Button>
                ) : null}
              </div>
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
  const [now, setNow] = useState(() => new Date());
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [appLoading, setAppLoading] = useState(false);
  const firebaseEnabled = isFirebaseConfigured && Boolean(auth);
  const todayDate = fmtDate(now);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">(
    getNotificationPermission()
  );
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [wearPairingToken, setWearPairingToken] = useState<string | null>(null);
  const [wearPairingBusy, setWearPairingBusy] = useState(false);

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
  const [selectedBabyTab, setSelectedBabyTab] = useState<BabyId>("A");
  const [undo, setUndo] = useState<{
    open: boolean;
    events?: LogEvent[];
    transcript?: string;
    retryVoice?: boolean;
  }>({ open: false });
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const voiceTimerRef = useRef<number | null>(null);
  const voiceButtonRef = useRef<VoiceCommandButtonHandle | null>(null);
  const lastKnownTodayRef = useRef(todayDate);

  const syncAppToFirestore = async (updater: (prevApp: AppState) => AppState) => {
    if (!db || !authUser) return;
    try {
      const appRef = doc(db, "users", authUser.uid, "app", "state");
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(appRef);
        const currentState =
          snap.exists() && snap.data().app
            ? stripLegacyCalendarFields(snap.data().app as Parameters<typeof stripLegacyCalendarFields>[0])
            : createEmptyState();
        const nextApp = updater(currentState);

        transaction.set(
          appRef,
          {
            app: removeUndefined(toSharedAppState(nextApp)),
            updatedAt: serverTimestamp(),
            updatedBy: authUser.uid,
          },
          { merge: true }
        );
      });
    } catch (error) {
      console.error("syncAppToFirestore failed", error);
    }
  };

  const updateApp = (updater: (prevApp: AppState) => AppState, syncRemote = true) => {
    setApp((prevApp) => updater(prevApp));
    if (syncRemote) {
      void syncAppToFirestore(updater);
    }
  };

  const ensureNotificationSettingsDocument = async (user: User) => {
    if (!db) return;
    const settingsRef = doc(db, "users", user.uid, "settings", "notifications");
    await setDoc(
      settingsRef,
      {
        milkReminder: {
          enabled: true,
          intervalMinutes: 150,
          mergeWindowMinutes: 15,
          lastSentByBaby: {},
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const syncPushSubscriptionToFirestore = async (user: User) => {
    if (!db || !isWebPushSupported()) return false;
    const subscription = await getExistingPushSubscription();
    if (!subscription || Notification.permission !== "granted") return false;

    const deviceId = getDeviceId();
    const deviceRef = doc(db, "users", user.uid, "devices", deviceId);
    await setDoc(
      deviceRef,
      {
        deviceId,
        platform: navigator.userAgent,
        notificationsEnabled: true,
        permission: Notification.permission,
        subscription: serializePushSubscription(subscription),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return true;
  };

  const removePushSubscriptionFromFirestore = async (user: User | null) => {
    if (!db || !user) return;
    const deviceId = getDeviceId();
    await deleteDoc(doc(db, "users", user.uid, "devices", deviceId));
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
    await ensureNotificationSettingsDocument(user);
  };

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), AUTO_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const previousToday = lastKnownTodayRef.current;
    if (todayDate !== previousToday) {
      setActiveDate((current) => (current === previousToday ? todayDate : current));
      lastKnownTodayRef.current = todayDate;
    }
  }, [todayDate]);

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
          setNow(new Date());
          lastKnownTodayRef.current = nextState.ui.lastViewedDate;
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
    if (!isWebPushSupported()) {
      setPushPermission("unsupported");
      setPushSubscribed(false);
      return;
    }

    setPushPermission(Notification.permission);
    void getExistingPushSubscription().then((subscription) => {
      setPushSubscribed(Boolean(subscription));
    });
  }, [authUser]);

  useEffect(() => {
    if (!authUser || pushPermission !== "granted") return;
    void syncPushSubscriptionToFirestore(authUser).then((synced) => {
      if (synced) setPushSubscribed(true);
    });
  }, [authUser, pushPermission]);

  useEffect(() => {
    if (!authUser || !db) return;
    setAppLoading(true);
    const appRef = doc(db, "users", authUser.uid, "app", "state");
    const unsub = onSnapshot(appRef, (snap) => {
      if (!snap.exists()) {
        const nextState = createEmptyState();
        setApp(nextState);
        setAppLoading(false);
        return;
      }

      const data = snap.data();
      if (!data.app) {
        const nextState = createEmptyState();
        setApp(nextState);
        setAppLoading(false);
        return;
      }

      const nextState = stripLegacyCalendarFields(data.app as Parameters<typeof stripLegacyCalendarFields>[0]);
      setApp((prev) => mergeSharedAppState(toSharedAppState(nextState), prev.ui));
      setAppLoading(false);
    });

    return () => unsub();
  }, [authUser]);

  useEffect(() => {
    updateApp((prev) => {
      if (prev.ui.lastViewedDate === activeDate) return prev;
      return { ...prev, ui: { ...prev.ui, lastViewedDate: activeDate } };
    }, false);
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

  const scheduleUndo = (events: LogEvent | LogEvent[], options?: { transcript?: string; retryVoice?: boolean }) => {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndo({ open: true, events: Array.isArray(events) ? events : [events], ...options });
    undoTimerRef.current = window.setTimeout(() => setUndo({ open: false }), 7000);
  };

  const showVoiceMessage = (message: string) => {
    if (voiceTimerRef.current) {
      window.clearTimeout(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    setVoiceMessage(message);
    voiceTimerRef.current = window.setTimeout(() => setVoiceMessage(null), 4500);
  };

  const createEvent = (babyId: BabyId, type: EventType, payload?: Partial<LogEvent>): LogEvent => {
    const payloadTimestamp = payload?.timestamp;
    const timestamp =
      typeof payloadTimestamp === "number" && Number.isFinite(payloadTimestamp) ? payloadTimestamp : Date.now();

    return {
      id: uid(),
      babyId,
      type,
      ...payload,
      timestamp,
    };
  };

  const addEvent = (babyId: BabyId, type: EventType, payload?: Partial<LogEvent>) => {
    if (!authUser || !db) return;
    const event = createEvent(babyId, type, payload);

    updateApp((prevApp) => ({ ...prevApp, events: [event, ...prevApp.events] }));

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
    const { diaperKind, note, selectedDiaperSize, timestamp } = payload;
    addEvent(babyId, "diaper", { diaperKind, note, timestamp });

    updateApp((prevApp) => {
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

      return { ...prevApp, profiles: nextProfiles };
    });
  };

  const handleVoiceCommand = (command: VoiceCommand) => {
    if (!authUser || !db) return;

    const createdEvents: LogEvent[] = [];

    if (command.type === "milk" || command.type === "diaper") {
      const targetedCommands = expandVoiceCommandTargets(command);

      targetedCommands.forEach((targetedCommand) => {
        if (targetedCommand.type === "milk") {
          const milkMl = targetedCommand.milkMlByBaby?.[targetedCommand.babyId] ?? targetedCommand.milkMl;
          createdEvents.push(
            createEvent(targetedCommand.babyId, "milk", {
              timestamp: targetedCommand.timestamp,
              milkMl,
              milkMethod: targetedCommand.milkMethod,
              note: targetedCommand.note,
            })
          );
          return;
        }

        createdEvents.push(
          createEvent(targetedCommand.babyId, "diaper", {
            timestamp: targetedCommand.timestamp,
            diaperKind: targetedCommand.diaperKind,
            note: targetedCommand.note,
          })
        );
      });
    }

    if (command.type === "daily") {
      createdEvents.push(
        createEvent(command.babyId, "daily", {
          timestamp: command.timestamp,
          note: command.dailyNote,
        })
      );
    }

    if (command.type === "temperature") {
      createdEvents.push(
        createEvent(command.babyId, "temperature", {
          timestamp: command.timestamp,
          temperature: command.temperature,
          note: command.note,
        })
      );
    }

    if (command.type === "weight") {
      createdEvents.push(
        createEvent(command.babyId, "weight", {
          timestamp: command.timestamp,
          weight: command.weight,
          note: command.note,
        })
      );
    }

    if (command.type === "height") {
      createdEvents.push(
        createEvent(command.babyId, "height", {
          timestamp: command.timestamp,
          height: command.height,
          note: command.note,
        })
      );
    }

    if (!createdEvents.length) return;

    updateApp((prevApp) => {
      const nextProfiles = { ...prevApp.profiles };

      createdEvents
        .filter((event) => event.type === "diaper")
        .forEach((event) => {
          const selectedDiaperSize = nextProfiles[event.babyId].diaperSize;
          const currentStock = nextProfiles[event.babyId].diaperStockBySize[selectedDiaperSize] ?? 0;

          (Object.keys(nextProfiles) as BabyId[]).forEach((id) => {
            nextProfiles[id] = {
              ...nextProfiles[id],
              diaperStockBySize: {
                ...nextProfiles[id].diaperStockBySize,
                [selectedDiaperSize]: currentStock - 1,
              },
            };
          });
        });

      return { ...prevApp, profiles: nextProfiles, events: [...createdEvents, ...prevApp.events] };
    });

    const transcript = command.note.startsWith("voice: ") ? command.note.slice("voice: ".length) : command.note;
    scheduleUndo(createdEvents, { transcript, retryVoice: true });
  };

  const onSaveEdit = (eventId: string, payload: Partial<LogEvent>) => {
    updateApp((prevApp) => {
      const originalEvent = prevApp.events.find((event) => event.id === eventId);
      if (!originalEvent) return prevApp;
      const updatedEvent = { ...originalEvent, ...payload };
      const nextEvents = prevApp.events.map((event) => (event.id === eventId ? updatedEvent : event));
      return { ...prevApp, events: nextEvents };
    });
  };

  const handleAddEvent = (eventData: Omit<LogEvent, "id" | "timestamp">) => {
    const { babyId, type, ...payload } = eventData;
    addEvent(babyId, type, payload);
  };

  const removeEvent = (eventId: string) => {
    if (!authUser || !db) return;
    updateApp((prevApp) => ({ ...prevApp, events: prevApp.events.filter((event) => event.id !== eventId) }));
  };

  const undoLast = () => {
    if (!authUser || !db || !undo.events?.length) return;

    const undoIds = new Set(undo.events.map((event) => event.id));
    updateApp((prevApp) => ({ ...prevApp, events: prevApp.events.filter((event) => !undoIds.has(event.id)) }));

    setUndo({ open: false });
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  const retryVoiceInput = () => {
    undoLast();
    window.setTimeout(() => voiceButtonRef.current?.startListening(), 0);
  };

  const startVoiceInputForBabyTab = (babyId: BabyId) => {
    setSelectedBabyTab(babyId);
    window.setTimeout(() => voiceButtonRef.current?.startListening(babyId), 0);
  };

  const editTarget = useMemo(() => {
    if (!modal || modal.kind !== "edit") return null;
    return app.events.find((event) => event.id === modal.eventId) ?? null;
  }, [modal, app.events]);

  const resetAll = () => {
    if (!authUser || !db) return;
    if (!confirm("すべてのデータを削除しますか？")) return;
    const nextState = createEmptyState();
    updateApp(() => nextState);
    setActiveDate(nextState.ui.lastViewedDate);
    setModal(null);
    setUndo({ open: false });
  };

  const onUpdateDiaperStock = (babyId: BabyId, size: string, stock: number) => {
    updateApp((prevApp) => {
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

      return { ...prevApp, profiles: nextProfiles };
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
    await removePushSubscriptionFromFirestore(authUser);
    await signOut(auth);
  };

  const handleEnablePushNotifications = async () => {
    if (!authUser || !webPushPublicKey) return;
    setPushBusy(true);
    try {
      const permission = await requestNotificationPermission();
      setPushPermission(permission);
      if (permission !== "granted") {
        setPushSubscribed(false);
        return;
      }

      await subscribeToPushNotifications(webPushPublicKey);
      const synced = await syncPushSubscriptionToFirestore(authUser);
      setPushSubscribed(synced);
    } catch (error) {
      console.error("Failed to enable push notifications", error);
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisablePushNotifications = async () => {
    setPushBusy(true);
    try {
      await unsubscribeFromPushNotifications();
      await removePushSubscriptionFromFirestore(authUser);
      setPushSubscribed(false);
    } catch (error) {
      console.error("Failed to disable push notifications", error);
    } finally {
      setPushBusy(false);
    }
  };

  const handleCreateWearPairingToken = async () => {
    if (!authUser || !db) return;
    setWearPairingBusy(true);
    try {
      const token = createWearPairingToken();
      const tokenHash = await hashWearPairingToken(token);
      await Promise.all([
        setDoc(doc(db, "wearPairingTokens", tokenHash), {
          uid: authUser.uid,
          active: true,
          createdAt: serverTimestamp(),
        }),
        setDoc(
          doc(db, "users", authUser.uid, "settings", "wear"),
          {
            tokenHash,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ),
      ]);
      window.TwinlyAndroid?.saveWearToken?.(token);
      setWearPairingToken(token);
    } catch (error) {
      console.error("Failed to create Wear OS pairing token", error);
      alert("Watch連携キーの作成に失敗しました");
    } finally {
      setWearPairingBusy(false);
    }
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
        void syncAppToFirestore(() => importedState);
        alert("データをインポートしました");
      } catch {
        alert("ファイルの読み込みに失敗しました");
      }
    };
    reader.readAsText(file);
  };

  const selectedLogDayRange = useMemo(() => {
    const date = new Date(`${activeDate}T00:00:00`);
    return { from: startOfDayMs(date), to: endOfDayMs(date) };
  }, [activeDate]);

  const currentDayRange = useMemo(() => {
    const date = new Date(`${todayDate}T00:00:00`);
    return { from: startOfDayMs(date), to: endOfDayMs(date) };
  }, [todayDate]);

  const selectedLogEvents = useMemo(
    () =>
      app.events
        .filter((event) => event.timestamp >= selectedLogDayRange.from && event.timestamp <= selectedLogDayRange.to)
        .sort((a, b) => b.timestamp - a.timestamp),
    [app.events, selectedLogDayRange]
  );

  const currentDayEvents = useMemo(
    () =>
      app.events
        .filter((event) => event.timestamp >= currentDayRange.from && event.timestamp <= currentDayRange.to)
        .sort((a, b) => b.timestamp - a.timestamp),
    [app.events, currentDayRange]
  );

  const currentEventsByBaby = useMemo(() => {
    const grouped: Record<BabyId, LogEvent[]> = { A: [], B: [] };
    for (const event of currentDayEvents) grouped[event.babyId].push(event);
    return grouped;
  }, [currentDayEvents]);

  const logEventsByBaby = useMemo(() => {
    const grouped: Record<BabyId, LogEvent[]> = { A: [], B: [] };
    for (const event of selectedLogEvents) grouped[event.babyId].push(event);
    return grouped;
  }, [selectedLogEvents]);

  const latestEventsByBaby = useMemo(() => {
    const grouped: Record<BabyId, LogEvent[]> = { A: [], B: [] };
    const sortedEvents = [...app.events].sort((a, b) => b.timestamp - a.timestamp);
    for (const event of sortedEvents) grouped[event.babyId].push(event);
    return grouped;
  }, [app.events]);

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

  const diaperEstimates = useMemo(() => {
    const result: Record<BabyId, ReturnType<typeof estimateDiaperStockBySize> | null> = { A: null, B: null };
    (Object.keys(app.profiles) as BabyId[]).forEach((babyId) => {
      const size = app.profiles[babyId].diaperSize;
      result[babyId] = estimateDiaperStockBySize({
        profiles: app.profiles,
        events: app.events,
        size,
        now,
      });
    });
    return result;
  }, [app.profiles, app.events, now]);

  const milkProgressByBaby = useMemo(() => {
    const result: Record<BabyId, ReturnType<typeof buildMilkProgressComparison>> = {
      A: buildMilkProgressComparison({ events: app.events, babyId: "A", targetDate: activeDate, now }),
      B: buildMilkProgressComparison({ events: app.events, babyId: "B", targetDate: activeDate, now }),
    };
    return result;
  }, [activeDate, app.events, now]);

  const voiceCommandBabyNames = useMemo(() => createVoiceCommandBabyNames(app.profiles), [app.profiles]);

  const defaultVoiceMilkMlByBaby = useMemo(() => {
    const result: Partial<Record<BabyId, number>> = {};
    (["A", "B"] as BabyId[]).forEach((babyId) => {
      const latestMilk = [...app.events]
        .filter((event) => event.babyId === babyId && event.type === "milk" && typeof event.milkMl === "number")
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      if (typeof latestMilk?.milkMl === "number") {
        result[babyId] = latestMilk.milkMl;
      }
    });
    return result;
  }, [app.events]);

  const renderLogDateControls = () => (
    <div className="flex w-full flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="previous day"
        onClick={() => setActiveDate((current) => shiftDate(current, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Input type="date" className="w-auto" value={activeDate} onChange={(e) => setActiveDate(e.target.value)} />
      <Button variant="outline" onClick={() => setActiveDate(todayDate)}>
        {"\u4eca\u65e5"}
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="next day"
        onClick={() => setActiveDate((current) => shiftDate(current, 1))}
        disabled={activeDate >= todayDate}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

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
        <header
          className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-4"
          onDoubleClick={() => voiceButtonRef.current?.startListening()}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500">
                <Baby className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight">Twinly</h1>
            </div>

            <div className="flex items-center gap-2">
              <VoiceCommandButton
                ref={voiceButtonRef}
                babyNames={voiceCommandBabyNames}
                defaultMilkMlByBaby={defaultVoiceMilkMlByBaby}
                onCommand={handleVoiceCommand}
                onMessage={showVoiceMessage}
              />
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

        </header>

        <main>
          <Tabs value={selectedBabyTab} onValueChange={(value) => setSelectedBabyTab(value as BabyId)} className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-2">
              <TabsTrigger value="A" className="h-auto" onDoubleClick={() => startVoiceInputForBabyTab("A")}>
                <BabyTabTrigger profile={app.profiles.A} />
              </TabsTrigger>
              <TabsTrigger value="B" className="h-auto" onDoubleClick={() => startVoiceInputForBabyTab("B")}>
                <BabyTabTrigger profile={app.profiles.B} />
              </TabsTrigger>
            </TabsList>
            <TabsContent value="A" className="mt-4">
              <BabyPanel
                profile={app.profiles.A}
                events={currentEventsByBaby.A}
                latestEvents={latestEventsByBaby.A}
                logEvents={logEventsByBaby.A}
                logDateControls={renderLogDateControls()}
                now={now}
                lowStock={lowStock.A}
                diaperEstimate={diaperEstimates.A}
                milkProgress={milkProgressByBaby.A}
                onOpenHistory={(type, babyId) => setHistoryModal({ type, babyId })}
                onOpenModal={handleOpenModal}
                onDeleteEvent={removeEvent}
                onAddEvent={handleAddEvent}
                onOpenDailyReport={() => setDailyReportModalOpen(true)}
                onOpenHealthChart={() => setChartModalOpen(true)}
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
                events={currentEventsByBaby.B}
                latestEvents={latestEventsByBaby.B}
                logEvents={logEventsByBaby.B}
                logDateControls={renderLogDateControls()}
                now={now}
                lowStock={lowStock.B}
                diaperEstimate={diaperEstimates.B}
                milkProgress={milkProgressByBaby.B}
                onOpenHistory={(type, babyId) => setHistoryModal({ type, babyId })}
                onOpenModal={handleOpenModal}
                onDeleteEvent={removeEvent}
                onAddEvent={handleAddEvent}
                onOpenDailyReport={() => setDailyReportModalOpen(true)}
                onOpenHealthChart={() => setChartModalOpen(true)}
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
        detail={undo.transcript}
        onUndo={undoLast}
        onRetry={undo.retryVoice ? retryVoiceInput : undefined}
        onClose={() => setUndo({ open: false })}
      />
      <AnimatePresence>
        {voiceMessage ? (
          <motion.div
            className="fixed bottom-24 left-1/2 z-50 w-[min(520px,calc(100%-16px))] -translate-x-1/2"
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 18, opacity: 0 }}
          >
            <div className="rounded-lg border bg-card px-4 py-3 text-sm font-semibold shadow-2xl">{voiceMessage}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
          updateApp((prevApp) => {
            const nextApp = typeof updater === "function" ? updater(prevApp) : updater;
            return nextApp;
          });
        }}
        user={authUser}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        pushPermission={pushPermission}
        pushSubscribed={pushSubscribed}
        pushBusy={pushBusy}
        webPushConfigured={Boolean(webPushPublicKey)}
        onEnablePushNotifications={handleEnablePushNotifications}
        onDisablePushNotifications={handleDisablePushNotifications}
        wearPairingToken={wearPairingToken}
        wearPairingBusy={wearPairingBusy}
        onCreateWearPairingToken={handleCreateWearPairingToken}
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
          activeDate={activeDate}
          now={now}
        />
      ) : null}
    </AppContainer>
  );
}
