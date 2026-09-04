import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Baby, Check, ChevronLeft, ChevronRight, Settings, Undo2 } from "lucide-react";
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithCredential,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import { deleteDoc, doc, onSnapshot, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db, ensureAuthPersistence, isFirebaseConfigured, webPushPublicKey } from "./firebase";
import { BabyPanel } from "./components/BabyPanel";
import {
  AppState,
  BabyId,
  DiaperKind,
  EventType,
  FamilyInfo,
  FamilyMember,
  FamilyRelationship,
  LogEvent,
} from "./types";
import { endOfDayMs, fmtDate, startOfDayMs, uid, removeUndefined } from "./lib/utils";
import { MilkModal } from "./components/MilkModal";
import { DiaperModal } from "./components/DiaperModal";
import { SleepRecordModal } from "./components/SleepRecordModal";
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
import { SleepHistoryModal } from "./components/SleepHistoryModal";
import { WeeklyTimelineModal } from "./components/WeeklyTimelineModal";
import { LoginScreen } from "./components/LoginScreen";
import { ProfileSetup } from "./components/ProfileSetup";
import { AccountModal } from "./components/AccountModal";
import { VoiceCommandButton, VoiceCommandButtonHandle } from "./components/VoiceCommandButton";
import { createInitialAppState, mergeSharedAppState, stripLegacyCalendarFields, toSharedAppState } from "./lib/app-state";
import { createDefaultDiaperDraft, createDefaultMilkDraft } from "./lib/entry-drafts";
import { estimateDiaperStockBySize } from "./lib/diaper-stock";
import { buildMilkProgressComparison } from "./lib/milk-progress";
import { buildCareGauges } from "./lib/care-gauges";
import {
  loadPendingEvents,
  mergePendingEvents,
  removePendingEvents,
  storePendingEvents,
} from "./lib/pending-events";
import { detectHorizontalSwipe, SwipePoint } from "./lib/horizontal-swipe";
import { createVoiceCommandBabyNames, expandVoiceCommandTargets, VoiceCommand } from "./lib/voice-command";
import { createWearPairingToken, hashWearPairingToken } from "./lib/wear-link";
import { useScreenWakeLock } from "./lib/use-screen-wake-lock";
import {
  analyzeSleepEvents,
  AutoWakeActivityType,
  buildActivityGauge,
  getAutoWakeTimestampForActivity,
  getAverageActivityMinutes,
  getDefaultActivityLimitMinutes,
  isBabySleeping,
} from "./lib/sleep";
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
import {
  completeFamilyOnboarding,
  createFamilyInvite,
  joinFamilyWithInvite,
  loadFamilySession,
  subscribeFamilyMembers,
  updateMemberProfile,
} from "./lib/family";

declare global {
  interface Window {
    TwinlyAndroid?: {
      saveWearToken?: (token: string) => void;
      signInWithGoogle?: () => void;
    };
  }
}

const createEmptyState = () => createInitialAppState(new Date());
const AUTO_REFRESH_MS = 60 * 1000;
const EMAIL_FOR_SIGN_IN_KEY = "twinly-email-for-sign-in";
const FAMILY_INVITE_KEY = "twinly-family-invite";
const clampDiaperStock = (stock: number) => Math.max(0, stock);
const autoWakeActivityLabels: Record<AutoWakeActivityType, string> = {
  milk: "ミルク",
  solidFood: "離乳食",
  diaper: "おむつ",
};

const readFamilyInvite = () => {
  const url = new URL(window.location.href);
  const inviteFromUrl = url.searchParams.get("invite")?.trim();
  if (inviteFromUrl) {
    window.localStorage.setItem(FAMILY_INVITE_KEY, inviteFromUrl);
    url.searchParams.delete("invite");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    return inviteFromUrl;
  }
  return window.localStorage.getItem(FAMILY_INVITE_KEY) ?? "";
};

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
  const [family, setFamily] = useState<FamilyInfo | null>(null);
  const [familyMember, setFamilyMember] = useState<FamilyMember | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [pendingInviteToken, setPendingInviteToken] = useState(readFamilyInvite);
  const [authReady, setAuthReady] = useState(false);
  const [appLoading, setAppLoading] = useState(() => isFirebaseConfigured && Boolean(auth));
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
    | { kind: "sleepTime"; babyId: BabyId; type: "sleepStart" | "wake" }
    | null
  >(null);
  const [chartModalOpen, setChartModalOpen] = useState(false);
  const [dailyReportModalOpen, setDailyReportModalOpen] = useState(false);
  const [timelineModalOpen, setTimelineModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [historyModal, setHistoryModal] = useState<{
    babyId: BabyId;
    type: "milk" | "diaper" | "sleep";
  } | null>(null);
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
  const voiceLongPressTimerRef = useRef<number | null>(null);
  const babyTabSwipeStartRef = useRef<SwipePoint | null>(null);
  const lastKnownTodayRef = useRef(todayDate);
  const syncingPendingEventIdsRef = useRef(new Set<string>());

  const syncAppToFirestore = async (updater: (prevApp: AppState) => AppState) => {
    if (!db || !authUser || !family) return false;
    try {
      const appRef = doc(db, "families", family.id, "app", "state");
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
      return true;
    } catch (error) {
      console.error("syncAppToFirestore failed", error);
      return false;
    }
  };

  const handleBabyTabTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches.item(0);
    if (!touch) return;
    babyTabSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleBabyTabTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = babyTabSwipeStartRef.current;
    babyTabSwipeStartRef.current = null;
    const touch = event.changedTouches.item(0);
    if (!start || !touch) return;

    const direction = detectHorizontalSwipe(start, { x: touch.clientX, y: touch.clientY });
    if (direction === "left" && selectedBabyTab === "A") setSelectedBabyTab("B");
    if (direction === "right" && selectedBabyTab === "B") setSelectedBabyTab("A");
  };

  const updateApp = (updater: (prevApp: AppState) => AppState, syncRemote = true) => {
    setApp((prevApp) => updater(prevApp));
    setNow(new Date());
    if (syncRemote) {
      void syncAppToFirestore(updater);
    }
  };

  const updateAppWithPendingEvents = (events: LogEvent[], updater: (prevApp: AppState) => AppState) => {
    if (!authUser) return;
    const eventIds = events.map((event) => event.id);
    storePendingEvents(authUser.uid, events);
    eventIds.forEach((eventId) => syncingPendingEventIdsRef.current.add(eventId));
    setApp((prevApp) => updater(prevApp));
    setNow(new Date());
    void syncAppToFirestore(updater).then((synced) => {
      if (synced) removePendingEvents(authUser.uid, eventIds);
      eventIds.forEach((eventId) => syncingPendingEventIdsRef.current.delete(eventId));
    });
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
        },
        careReminder: {
          enabled: true,
          mergeWindowMinutes: 15,
          diaperGaugeWindowMinutes: 120,
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

  useEffect(() => {
    const refreshNow = () => setNow(new Date());
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshNow();
    };
    const intervalId = window.setInterval(refreshNow, AUTO_REFRESH_MS);
    window.addEventListener("focus", refreshNow);
    window.addEventListener("pageshow", refreshNow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshNow);
      window.removeEventListener("pageshow", refreshNow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
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
      if (isSignInWithEmailLink(auth, window.location.href)) {
        const email = window.localStorage.getItem(EMAIL_FOR_SIGN_IN_KEY) || window.prompt("ログイン用メールアドレスを入力してください");
        if (email) {
          try {
            await signInWithEmailLink(auth, email, window.location.href);
            window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY);
            window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
          } catch (error) {
            console.error("Email link sign-in failed", error);
            alert("メールリンクでログインできませんでした。もう一度メールを送信してください。");
          }
        }
      }
      if (cancelled) return;
      unsub = onAuthStateChanged(auth, (user) => {
        setAuthUser(user);
        if (user) {
          setAppLoading(true);
          void loadFamilySession(user)
            .then((session) => {
              if (cancelled) return;
              setFamily(session?.family ?? null);
              setFamilyMember(session?.member ?? null);
              if (session) {
                void ensureNotificationSettingsDocument(user);
              } else {
                setFamilyMembers([]);
                setAppLoading(false);
              }
              setAuthReady(true);
            })
            .catch((error) => {
              console.error("Failed to load family session", error);
              if (cancelled) return;
              setFamily(null);
              setFamilyMember(null);
              setFamilyMembers([]);
              setAppLoading(false);
              setAuthReady(true);
            });
        } else {
          const nextState = createEmptyState();
          setFamily(null);
          setFamilyMember(null);
          setFamilyMembers([]);
          setApp(nextState);
          setActiveDate(nextState.ui.lastViewedDate);
          setNow(new Date());
          lastKnownTodayRef.current = nextState.ui.lastViewedDate;
          setAppLoading(false);
          setAuthReady(true);
        }
      });
    };

    void init();

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!family) return;
    return subscribeFamilyMembers(family.id, (members) => {
      setFamilyMembers(members);
      if (authUser) {
        const currentMember = members.find((member) => member.uid === authUser.uid);
        if (currentMember) setFamilyMember(currentMember);
      }
    });
  }, [authUser, family]);

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
    if (!authUser || !db || !family) return;
    setAppLoading(true);
    const appRef = doc(db, "families", family.id, "app", "state");
    const unsub = onSnapshot(appRef, (snap) => {
      setNow(new Date());
      const data = snap.exists() ? snap.data() : null;
      const remoteState = data?.app
        ? stripLegacyCalendarFields(data.app as Parameters<typeof stripLegacyCalendarFields>[0])
        : createEmptyState();
      const pendingEvents = loadPendingEvents(authUser.uid);
      const remoteEventIds = new Set(remoteState.events.map((event) => event.id));
      const confirmedEventIds = pendingEvents
        .filter((event) => remoteEventIds.has(event.id))
        .map((event) => event.id);
      if (confirmedEventIds.length) removePendingEvents(authUser.uid, confirmedEventIds);

      const eventsToReplay = pendingEvents.filter(
        (event) => !remoteEventIds.has(event.id) && !syncingPendingEventIdsRef.current.has(event.id)
      );
      if (eventsToReplay.length) {
        const replayIds = eventsToReplay.map((event) => event.id);
        replayIds.forEach((eventId) => syncingPendingEventIdsRef.current.add(eventId));
        void syncAppToFirestore((currentState) => ({
          ...currentState,
          events: mergePendingEvents(currentState.events, eventsToReplay),
        })).then((synced) => {
          if (synced) removePendingEvents(authUser.uid, replayIds);
          replayIds.forEach((eventId) => syncingPendingEventIdsRef.current.delete(eventId));
        });
      }

      const nextState = {
        ...remoteState,
        events: mergePendingEvents(remoteState.events, pendingEvents),
      };
      setApp((prev) => mergeSharedAppState(toSharedAppState(nextState), prev.ui));
      setAppLoading(false);
    });

    return () => unsub();
  }, [authUser, family]);

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

    const recordedAt = Date.now();
    return {
      id: uid(),
      babyId,
      type,
      ...payload,
      createdByUid: authUser?.uid,
      updatedByUid: authUser?.uid,
      createdAt: recordedAt,
      updatedAt: recordedAt,
      timestamp,
    };
  };

  const addEvent = (
    babyId: BabyId,
    type: EventType,
    payload?: Partial<LogEvent>,
    options: { autoWake?: boolean } = {}
  ) => {
    if (!authUser || !db) return;
    const event = createEvent(babyId, type, payload);
    const createdEvents = [event];

    if (options.autoWake !== false && (type === "milk" || type === "solidFood" || type === "diaper")) {
      const autoWakeTimestamp = getAutoWakeTimestampForActivity(app.events, babyId, event.timestamp, type);
      if (autoWakeTimestamp !== null) {
        createdEvents.push(
          createEvent(babyId, "wake", {
            timestamp: autoWakeTimestamp,
            note: `${autoWakeActivityLabels[type]}記録により自動起床`,
          })
        );
      }
    }

    updateAppWithPendingEvents(createdEvents, (prevApp) => ({
      ...prevApp,
      events: mergePendingEvents(prevApp.events, createdEvents),
    }));

    scheduleUndo(createdEvents);
  };

  const onSaveMilk = (payload: { milkMl: number; note: string; timestamp: number; autoWake: boolean }) => {
    if (!modal || modal.kind !== "milk") return;
    const { autoWake, ...eventPayload } = payload;
    addEvent(modal.babyId, "milk", eventPayload, { autoWake });
  };

  const onSaveSolidFood = (payload: { note: string; timestamp: number; autoWake: boolean }) => {
    if (!modal || modal.kind !== "milk") return;
    const { autoWake, ...eventPayload } = payload;
    addEvent(modal.babyId, "solidFood", eventPayload, { autoWake });
  };

  const onSaveDiaper = (payload: {
    diaperKind: DiaperKind;
    note: string;
    selectedDiaperSize: string;
    timestamp: number;
    autoWake: boolean;
  }) => {
    if (!modal || modal.kind !== "diaper") return;

    const babyId = modal.babyId;
    const { diaperKind, note, selectedDiaperSize, timestamp, autoWake } = payload;
    addEvent(babyId, "diaper", { diaperKind, note, timestamp }, { autoWake });

    if (!app.diaperStockManagementEnabled) return;

    updateApp((prevApp) => {
      const nextProfiles = { ...prevApp.profiles };
      const currentStock = nextProfiles[babyId].diaperStockBySize[selectedDiaperSize] ?? 0;
      const nextStock = clampDiaperStock(currentStock - 1);

      (Object.keys(nextProfiles) as BabyId[]).forEach((id) => {
        nextProfiles[id] = {
          ...nextProfiles[id],
          diaperStockBySize: {
            ...nextProfiles[id].diaperStockBySize,
            [selectedDiaperSize]: nextStock,
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

    if (
      command.type === "milk" ||
      command.type === "solidFood" ||
      command.type === "diaper" ||
      command.type === "sleepStart" ||
      command.type === "wake"
    ) {
      const targetedCommands = expandVoiceCommandTargets(command);

      targetedCommands.forEach((targetedCommand) => {
        if (targetedCommand.type === "milk") {
          const milkMl = targetedCommand.milkMlByBaby?.[targetedCommand.babyId] ?? targetedCommand.milkMl;
          createdEvents.push(
            createEvent(targetedCommand.babyId, "milk", {
              timestamp: targetedCommand.timestamp,
              milkMl,
              note: targetedCommand.note,
            })
          );
          return;
        }

        if (targetedCommand.type === "solidFood") {
          createdEvents.push(
            createEvent(targetedCommand.babyId, "solidFood", {
              timestamp: targetedCommand.timestamp,
              note: targetedCommand.note,
            })
          );
          return;
        }

        if (targetedCommand.type === "diaper") {
          createdEvents.push(
            createEvent(targetedCommand.babyId, "diaper", {
              timestamp: targetedCommand.timestamp,
              diaperKind: targetedCommand.diaperKind,
              note: targetedCommand.note,
            })
          );
          return;
        }

        if (targetedCommand.type === "sleepStart" || targetedCommand.type === "wake") {
          createdEvents.push(
            createEvent(targetedCommand.babyId, targetedCommand.type, {
              timestamp: targetedCommand.timestamp,
              note: targetedCommand.note,
            })
          );
        }
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

    const eventsWithAutoWake: LogEvent[] = [];
    createdEvents.forEach((event) => {
      if (event.type === "milk" || event.type === "solidFood" || event.type === "diaper") {
        const autoWakeTimestamp = getAutoWakeTimestampForActivity(
          [...eventsWithAutoWake, ...app.events],
          event.babyId,
          event.timestamp,
          event.type
        );
        if (autoWakeTimestamp !== null) {
          eventsWithAutoWake.push(
            createEvent(event.babyId, "wake", {
              timestamp: autoWakeTimestamp,
              note: `${autoWakeActivityLabels[event.type]}記録により自動起床`,
            })
          );
        }
      }
      eventsWithAutoWake.push(event);
    });

    updateAppWithPendingEvents(eventsWithAutoWake, (prevApp) => {
      const nextProfiles = { ...prevApp.profiles };

      createdEvents
        .filter((event) => event.type === "diaper")
        .forEach((event) => {
          if (!prevApp.diaperStockManagementEnabled) return;
          const selectedDiaperSize = nextProfiles[event.babyId].diaperSize;
          const currentStock = nextProfiles[event.babyId].diaperStockBySize[selectedDiaperSize] ?? 0;
          const nextStock = clampDiaperStock(currentStock - 1);

          (Object.keys(nextProfiles) as BabyId[]).forEach((id) => {
            nextProfiles[id] = {
              ...nextProfiles[id],
              diaperStockBySize: {
                ...nextProfiles[id].diaperStockBySize,
                [selectedDiaperSize]: nextStock,
              },
            };
          });
        });

      return {
        ...prevApp,
        profiles: nextProfiles,
        events: mergePendingEvents(prevApp.events, eventsWithAutoWake),
      };
    });

    const transcript = command.note.startsWith("voice: ") ? command.note.slice("voice: ".length) : command.note;
    scheduleUndo(eventsWithAutoWake, { transcript, retryVoice: true });
  };

  const onSaveEdit = (eventId: string, payload: Partial<LogEvent>) => {
    const auditPayload = authUser
      ? { ...payload, updatedByUid: authUser.uid, updatedAt: Date.now() }
      : payload;
    if (authUser) {
      const pendingEvent = loadPendingEvents(authUser.uid).find((event) => event.id === eventId);
      if (pendingEvent) storePendingEvents(authUser.uid, [{ ...pendingEvent, ...auditPayload }]);
    }
    updateApp((prevApp) => {
      const originalEvent = prevApp.events.find((event) => event.id === eventId);
      if (!originalEvent) return prevApp;
      const updatedEvent = { ...originalEvent, ...auditPayload };
      const nextEvents = prevApp.events.map((event) => (event.id === eventId ? updatedEvent : event));
      return { ...prevApp, events: nextEvents };
    });
  };

  const handleAddEvent = (
    eventData: Omit<LogEvent, "id" | "timestamp" | "createdByUid" | "updatedByUid" | "createdAt" | "updatedAt">
  ) => {
    const { babyId, type, ...payload } = eventData;
    addEvent(babyId, type, payload);
  };

  const saveSleepEventAt = (timestamp: number) => {
    if (!modal || modal.kind !== "sleepTime") return;
    addEvent(modal.babyId, modal.type, {
      timestamp,
      note: modal.type === "wake" ? "手動: 起床（時刻指定）" : "手動: 入眠（時刻指定）",
    });
  };

  const removeEvent = (eventId: string) => {
    if (!authUser || !db) return;
    removePendingEvents(authUser.uid, [eventId]);
    updateApp((prevApp) => ({ ...prevApp, events: prevApp.events.filter((event) => event.id !== eventId) }));
  };

  const undoLast = () => {
    if (!authUser || !db || !undo.events?.length) return;

    const undoIds = new Set(undo.events.map((event) => event.id));
    removePendingEvents(authUser.uid, undoIds);
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

  const clearVoiceLongPress = () => {
    if (voiceLongPressTimerRef.current === null) return;
    window.clearTimeout(voiceLongPressTimerRef.current);
    voiceLongPressTimerRef.current = null;
  };

  const beginVoiceLongPress = (babyId?: BabyId) => {
    clearVoiceLongPress();
    voiceLongPressTimerRef.current = window.setTimeout(() => {
      voiceLongPressTimerRef.current = null;
      if (babyId) {
        startVoiceInputForBabyTab(babyId);
      } else {
        voiceButtonRef.current?.startListening();
      }
    }, 550);
  };

  useEffect(
    () => () => {
      if (voiceLongPressTimerRef.current !== null) {
        window.clearTimeout(voiceLongPressTimerRef.current);
      }
    },
    []
  );

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
      const nextStock = clampDiaperStock(stock);
      const nextProfiles = { ...prevApp.profiles };
      nextProfiles[babyId] = {
        ...nextProfiles[babyId],
        diaperStockBySize: {
          ...nextProfiles[babyId].diaperStockBySize,
          [size]: nextStock,
        },
      };

      (Object.keys(nextProfiles) as BabyId[]).forEach((otherBabyId) => {
        if (otherBabyId === babyId) return;
        nextProfiles[otherBabyId] = {
          ...nextProfiles[otherBabyId],
          diaperStockBySize: {
            ...nextProfiles[otherBabyId].diaperStockBySize,
            [size]: nextStock,
          },
        };
      });

      return { ...prevApp, profiles: nextProfiles };
    });
  };

  const handleSignIn = async () => {
    if (!auth) return;
    if (window.TwinlyAndroid?.signInWithGoogle) {
      window.TwinlyAndroid.signInWithGoogle();
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
      alert("サインインに失敗しました");
    }
  };

  const handleSendEmailLink = async (email: string) => {
    if (!auth) return;
    const continueUrl = new URL(window.location.origin);
    if (pendingInviteToken) continueUrl.searchParams.set("invite", pendingInviteToken);
    await sendSignInLinkToEmail(auth, email, {
      url: continueUrl.toString(),
      handleCodeInApp: true,
    });
    window.localStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, email);
  };

  const handleProfileSetup = async (profile: {
    nickname: string;
    relationship: FamilyRelationship;
  }) => {
    if (!authUser) return;
    if (pendingInviteToken) {
      await joinFamilyWithInvite({ token: pendingInviteToken, ...profile });
    } else {
      await completeFamilyOnboarding(profile);
    }

    const session = await loadFamilySession(authUser);
    if (!session) throw new Error("Family session was not created");
    window.localStorage.removeItem(FAMILY_INVITE_KEY);
    setPendingInviteToken("");
    setFamily(session.family);
    setFamilyMember(session.member);
    setFamilyMembers([session.member]);
    setAppLoading(true);
    await ensureNotificationSettingsDocument(authUser);
  };

  const handleSaveMemberProfile = async (profile: {
    nickname: string;
    relationship: FamilyRelationship;
  }) => {
    if (!authUser || !family) return;
    await updateMemberProfile(family.id, authUser.uid, profile);
    setFamilyMember((current) => current ? { ...current, ...profile } : current);
  };

  const handleCreateFamilyInvite = async () => {
    if (!family) throw new Error("Family is not ready");
    const invite = await createFamilyInvite(family.id);
    const inviteUrl = new URL(window.location.origin);
    inviteUrl.searchParams.set("invite", invite.token);
    return inviteUrl.toString();
  };

  const handleSignOut = async () => {
    if (!auth) return;
    setAccountModalOpen(false);
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

  useEffect(() => {
    const handleAndroidGoogleToken = async (event: Event) => {
      if (!auth) return;
      const idToken = (event as CustomEvent<{ idToken?: string }>).detail?.idToken;
      if (!idToken) return;
      try {
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
      } catch (error) {
        console.error(error);
        alert("Googleログインに失敗しました");
      }
    };

    window.addEventListener("twinlyAndroidGoogleIdToken", handleAndroidGoogleToken);
    return () => window.removeEventListener("twinlyAndroidGoogleIdToken", handleAndroidGoogleToken);
  }, []);

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
    if (!app.diaperStockManagementEnabled) return result;
    (Object.keys(app.profiles) as BabyId[]).forEach((babyId) => {
      const profile = app.profiles[babyId];
      const remaining = profile.diaperStockBySize[profile.diaperSize] ?? 0;
      if (remaining <= 10) {
        result[babyId] = { size: profile.diaperSize, remaining };
      }
    });
    return result;
  }, [app.diaperStockManagementEnabled, app.profiles]);

  const diaperEstimates = useMemo(() => {
    const result: Record<BabyId, ReturnType<typeof estimateDiaperStockBySize> | null> = { A: null, B: null };
    if (!app.diaperStockManagementEnabled) return result;
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
  }, [app.diaperStockManagementEnabled, app.profiles, app.events, now]);

  const milkProgressByBaby = useMemo(() => {
    const result: Record<BabyId, ReturnType<typeof buildMilkProgressComparison>> = {
      A: buildMilkProgressComparison({ events: app.events, babyId: "A", targetDate: activeDate, now }),
      B: buildMilkProgressComparison({ events: app.events, babyId: "B", targetDate: activeDate, now }),
    };
    return result;
  }, [activeDate, app.events, now]);

  const sleepingByBaby = useMemo(
    () => ({
      A: isBabySleeping(app.events, "A"),
      B: isBabySleeping(app.events, "B"),
    }),
    [app.events]
  );

  const tabGaugePercents = useMemo(() => {
    const result: Record<BabyId, { milk: number; diaper: number; activity: number }> = {
      A: { milk: 0, diaper: 0, activity: 0 },
      B: { milk: 0, diaper: 0, activity: 0 },
    };

    (["A", "B"] as BabyId[]).forEach((babyId) => {
      const latestEvents = latestEventsByBaby[babyId];
      const profile = app.profiles[babyId];
      const gauges = buildCareGauges({
        events: latestEvents,
        babyId,
        now,
        milkWindowHours: profile.milkGaugeWindowHours ?? 3,
        milkTargetMlOverride: profile.milkTargetMlOverride ?? null,
      });
      const hasDiaperRecord = latestEvents.some((event) => event.type === "diaper");
      const sleepAnalysis = analyzeSleepEvents(latestEvents, babyId);
      const activityLimitMinutes =
        profile.activityLimitMinutesOverride ??
        getAverageActivityMinutes(sleepAnalysis, now) ??
        getDefaultActivityLimitMinutes(profile.birthDate, now);
      result[babyId] = {
        milk: Math.round((1 - (gauges.milk?.level ?? 0)) * 100),
        diaper: Math.round((1 - (gauges.diaper?.level ?? (hasDiaperRecord ? 1 : 0))) * 100),
        activity: sleepAnalysis.currentSleepStart
          ? 0
          : buildActivityGauge(sleepAnalysis, now, activityLimitMinutes).elapsedPercent,
      };
    });

    return result;
  }, [app.profiles, latestEventsByBaby, now]);

  const voiceCommandBabyNames = useMemo(() => createVoiceCommandBabyNames(app.profiles), [app.profiles]);
  const memberNameByUid = useMemo(
    () => Object.fromEntries(familyMembers.map((member) => [member.uid, member.nickname])),
    [familyMembers]
  );
  useScreenWakeLock(Boolean(authUser));

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
        <LoginScreen onSendEmailLink={handleSendEmailLink} onGoogleSignIn={handleSignIn} />
      </AppContainer>
    );
  }

  if (!family || !familyMember) {
    return (
      <AppContainer>
        <ProfileSetup
          defaultNickname={authUser.displayName || ""}
          joiningFamily={Boolean(pendingInviteToken)}
          onSubmit={handleProfileSetup}
          onSignOut={handleSignOut}
        />
      </AppContainer>
    );
  }

  return (
    <AppContainer>
      <div className="mx-auto max-w-7xl px-2 pb-2 sm:px-4 sm:pb-4">
        <main>
          <Tabs value={selectedBabyTab} onValueChange={(value) => setSelectedBabyTab(value as BabyId)} className="w-full">
            <div className="sticky top-0 z-40 space-y-1 bg-background">
              <header
                className="flex items-center justify-between rounded-lg border bg-card px-2.5 py-1.5 shadow-sm"
                onDoubleClick={() => voiceButtonRef.current?.startListening()}
                onPointerDown={() => beginVoiceLongPress()}
                onPointerUp={clearVoiceLongPress}
                onPointerLeave={clearVoiceLongPress}
                onPointerCancel={clearVoiceLongPress}
                onContextMenu={(event) => event.preventDefault()}
              >
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500">
                    <Baby className="h-5 w-5 text-white" />
                  </div>
                  <h1 className="text-xl font-extrabold tracking-tight">Twinly</h1>
                </div>

                <div className="flex items-center gap-1">
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
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-full bg-violet-500/20 text-sm font-bold text-violet-200 transition-colors hover:bg-violet-500/30"
                    onClick={() => setAccountModalOpen(true)}
                    aria-label="アカウントと家族を開く"
                    title={familyMember.nickname}
                  >
                    {familyMember.nickname.slice(0, 1)}
                  </button>
                </div>
              </header>

              <p className="text-center text-[10px] leading-none text-muted-foreground">
                ダブルクリック／長押しで音声入力
              </p>

              <TabsList
                className={`grid h-auto w-full gap-1 p-1 min-[430px]:grid-cols-2 ${
                  selectedBabyTab === "A"
                    ? "grid-cols-[minmax(140px,0.85fr)_minmax(180px,1.15fr)]"
                    : "grid-cols-[minmax(180px,1.15fr)_minmax(140px,0.85fr)]"
                }`}
              >
                <TabsTrigger
                  value="A"
                  className="h-auto px-1 py-0.5"
                  onDoubleClick={() => startVoiceInputForBabyTab("A")}
                  onPointerDown={() => beginVoiceLongPress("A")}
                  onPointerUp={clearVoiceLongPress}
                  onPointerLeave={clearVoiceLongPress}
                  onPointerCancel={clearVoiceLongPress}
                  onContextMenu={(event) => event.preventDefault()}
                >
                <BabyTabTrigger
                  profile={app.profiles.A}
                  gaugePercents={tabGaugePercents.A}
                  activityGaugeEnabled={app.sleepManagementEnabled}
                  sleeping={app.sleepManagementEnabled && sleepingByBaby.A}
                  selected={selectedBabyTab === "A"}
                />
                </TabsTrigger>
                <TabsTrigger
                  value="B"
                  className="h-auto px-1 py-0.5"
                  onDoubleClick={() => startVoiceInputForBabyTab("B")}
                  onPointerDown={() => beginVoiceLongPress("B")}
                  onPointerUp={clearVoiceLongPress}
                  onPointerLeave={clearVoiceLongPress}
                  onPointerCancel={clearVoiceLongPress}
                  onContextMenu={(event) => event.preventDefault()}
                >
                <BabyTabTrigger
                  profile={app.profiles.B}
                  gaugePercents={tabGaugePercents.B}
                  activityGaugeEnabled={app.sleepManagementEnabled}
                  sleeping={app.sleepManagementEnabled && sleepingByBaby.B}
                  selected={selectedBabyTab === "B"}
                />
                </TabsTrigger>
              </TabsList>
            </div>
            <div
              className="touch-auto"
              onTouchStart={handleBabyTabTouchStart}
              onTouchEnd={handleBabyTabTouchEnd}
              onTouchCancel={() => {
                babyTabSwipeStartRef.current = null;
              }}
            >
            <TabsContent value="A" className="mt-1">
              <BabyPanel
                profile={app.profiles.A}
                events={currentEventsByBaby.A}
                latestEvents={latestEventsByBaby.A}
                logEvents={logEventsByBaby.A}
                logDateControls={renderLogDateControls()}
                logDate={activeDate}
                now={now}
                diaperStockManagementEnabled={app.diaperStockManagementEnabled}
                sleepManagementEnabled={app.sleepManagementEnabled}
                lowStock={lowStock.A}
                diaperEstimate={diaperEstimates.A}
                milkProgress={milkProgressByBaby.A}
                onOpenHistory={(type, babyId) => setHistoryModal({ type, babyId })}
                onOpenModal={handleOpenModal}
                onAddEvent={handleAddEvent}
                onOpenSleepTimeEditor={({ babyId, type }) => setModal({ kind: "sleepTime", babyId, type })}
                onOpenDailyReport={() => setDailyReportModalOpen(true)}
                onOpenHealthChart={() => setChartModalOpen(true)}
                onOpenTimeline={() => setTimelineModalOpen(true)}
                lastWeight={lastWeights.A}
                lastHeight={lastHeights.A}
                themeDimmedBgColor={
                  iconGradients.find((gradient) => gradient.value === app.profiles.A.iconGradient)?.dimmedBgColor ??
                  "bg-background"
                }
                memberNameByUid={memberNameByUid}
              />
            </TabsContent>
            <TabsContent value="B" className="mt-1">
              <BabyPanel
                profile={app.profiles.B}
                events={currentEventsByBaby.B}
                latestEvents={latestEventsByBaby.B}
                logEvents={logEventsByBaby.B}
                logDateControls={renderLogDateControls()}
                logDate={activeDate}
                now={now}
                diaperStockManagementEnabled={app.diaperStockManagementEnabled}
                sleepManagementEnabled={app.sleepManagementEnabled}
                lowStock={lowStock.B}
                diaperEstimate={diaperEstimates.B}
                milkProgress={milkProgressByBaby.B}
                onOpenHistory={(type, babyId) => setHistoryModal({ type, babyId })}
                onOpenModal={handleOpenModal}
                onAddEvent={handleAddEvent}
                onOpenSleepTimeEditor={({ babyId, type }) => setModal({ kind: "sleepTime", babyId, type })}
                onOpenDailyReport={() => setDailyReportModalOpen(true)}
                onOpenHealthChart={() => setChartModalOpen(true)}
                onOpenTimeline={() => setTimelineModalOpen(true)}
                lastWeight={lastWeights.B}
                lastHeight={lastHeights.B}
                themeDimmedBgColor={
                  iconGradients.find((gradient) => gradient.value === app.profiles.B.iconGradient)?.dimmedBgColor ??
                  "bg-background"
                }
                memberNameByUid={memberNameByUid}
              />
            </TabsContent>
            </div>
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
        isSleeping={modal?.kind === "milk" ? sleepingByBaby[modal.babyId] : false}
        initialDraft={milkDraft}
        onSave={onSaveMilk}
        onSaveSolidFood={onSaveSolidFood}
      />
      <DiaperModal
        open={modal?.kind === "diaper"}
        onOpenChange={(open) => !open && setModal(null)}
        displayName={modal?.kind === "diaper" ? app.profiles[modal.babyId].displayName : ""}
        isSleeping={modal?.kind === "diaper" ? sleepingByBaby[modal.babyId] : false}
        initialDraft={diaperDraft}
        onSave={onSaveDiaper}
        diaperStockManagementEnabled={app.diaperStockManagementEnabled}
        diaperStockBySize={modal?.kind === "diaper" ? app.profiles[modal.babyId].diaperStockBySize : {}}
        onUpdateDiaperStock={(size, stock) =>
          modal?.kind === "diaper" && onUpdateDiaperStock(modal.babyId, size, stock)
        }
        babyProfile={modal?.kind === "diaper" ? app.profiles[modal.babyId] : app.profiles.A}
      />
      <SleepRecordModal
        open={modal?.kind === "sleepTime"}
        onOpenChange={(open) => !open && setModal(null)}
        displayName={modal?.kind === "sleepTime" ? app.profiles[modal.babyId].displayName : ""}
        type={modal?.kind === "sleepTime" ? modal.type : "sleepStart"}
        onSave={saveSleepEventAt}
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
      <AccountModal
        open={accountModalOpen}
        onOpenChange={setAccountModalOpen}
        user={authUser}
        family={family}
        member={familyMember}
        members={familyMembers}
        onSaveProfile={handleSaveMemberProfile}
        onCreateInvite={handleCreateFamilyInvite}
        onSignOut={handleSignOut}
      />
      <EditModal
        open={modal?.kind === "edit"}
        onOpenChange={(open) => !open && setModal(null)}
        event={editTarget}
        memberNameByUid={memberNameByUid}
        onSave={onSaveEdit}
        onDelete={removeEvent}
      />
      <HealthChartModal open={chartModalOpen} onOpenChange={setChartModalOpen} events={app.events} profiles={app.profiles} />
      <DailyReportModal open={dailyReportModalOpen} onOpenChange={setDailyReportModalOpen} events={app.events} profiles={app.profiles} />
      <WeeklyTimelineModal
        open={timelineModalOpen}
        onOpenChange={setTimelineModalOpen}
        events={app.events}
        profiles={app.profiles}
        initialDate={activeDate}
        initialBabyId={selectedBabyTab}
        now={now}
      />
      {historyModal?.type === "sleep" ? (
        <SleepHistoryModal
          open
          onOpenChange={(open) => !open && setHistoryModal(null)}
          events={app.events}
          profile={app.profiles[historyModal.babyId]}
          now={now}
        />
      ) : historyModal ? (
        <EventHistoryModal
          open
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
