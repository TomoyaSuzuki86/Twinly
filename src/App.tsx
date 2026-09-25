import { BillingPrompt } from "./components/BillingPrompt";
import { IntroTutorial } from "./components/IntroTutorial";
import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Baby, ChevronLeft, ChevronRight } from "lucide-react";
import { BabyPanel } from "./components/BabyPanel";
import {
  AppState,
  BabyId,
  CustomMemoPreset,
  FamilyRelationship,
  LogEvent,
} from "./types";
import { fmtDate, uid } from "./lib/utils";
import { MilkModal } from "./components/MilkModal";
import { DiaperModal } from "./components/DiaperModal";
import { SleepRecordModal } from "./components/SleepRecordModal";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { SettingsModal } from "./components/SettingsModal";
import { HelpModal } from "./components/HelpModal";
import { ComfortTools, type ComfortState, type ComfortToolsHandle } from "./components/ComfortTools";
import { ManualSyncButton } from "./components/ManualSyncButton";
import { SyncStatusOverlay } from "./components/SyncStatusOverlay";
import { ComfortMiniPlayer, HeaderOverflowMenu } from "./components/HeaderOverflowMenu";
import { useFamilyAccess } from "./lib/use-family-access";
import { useAppearancePreferences } from "./lib/use-appearance-preferences";
import { WIDE_SPLIT_LAYOUT_MIN_WIDTH_PX } from "./lib/appearance-preferences";
import { AiTools } from "./components/AiTools";
import { validConfirmedDrafts } from "./lib/ai";
import { EditModal } from "./components/EditModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { BabyTabTrigger } from "./components/BabyTabTrigger";
import { SnackbarUndo } from "./components/SnackbarUndo";
import { iconGradients } from "./lib/utils";
const HealthChartModal = lazy(() => import("./components/HealthChartModal").then((module) => ({ default: module.HealthChartModal })));
import { LaunchSplash } from "./components/LaunchSplash";
import { BabyPanelHydrationPlaceholder, BabyTabHydrationPlaceholder } from "./components/AppHydrationPlaceholder";
import { HistoryModalSkeleton } from "./components/HistoryModalSkeleton";
const DailyReportModal = lazy(() => import("./components/DailyReportModal").then((module) => ({ default: module.DailyReportModal })));
const EventHistoryModal = lazy(() => import("./components/EventHistoryModal").then((module) => ({ default: module.EventHistoryModal })));
const SleepHistoryModal = lazy(() => import("./components/SleepHistoryModal").then((module) => ({ default: module.SleepHistoryModal })));
const WeeklyTimelineModal = lazy(() => import("./components/WeeklyTimelineModal").then((module) => ({ default: module.WeeklyTimelineModal })));
import { LoginScreen } from "./components/LoginScreen";
import { ProfileSetup } from "./components/ProfileSetup";
import { AccountModal } from "./components/AccountModal";
import { VoiceCommandButton } from "./components/VoiceCommandButton";
import { createInitialAppState } from "./lib/app-state";
import { createDefaultDiaperDraft, createDefaultMilkDraft } from "./lib/entry-drafts";
import { useAppStore } from "./data/use-app-store";
import { updateSharedDiaperStock } from "./lib/event-mutations";
import { type EventDraft } from "./lib/event-recording";
import { detectHorizontalSwipe, SwipePoint } from "./lib/horizontal-swipe";
import { createVoiceCommandBabyNames } from "./lib/voice-command";
import { useScreenWakeLock } from "./lib/use-screen-wake-lock";
import {
  completeFamilyOnboarding,
  createFamilyInvite,
  joinFamilyWithInvite,
  updateMemberProfile,
} from "./lib/family";
import { buildDashboardSelectors } from "./lib/dashboard-selectors";
import { useAuthentication, type AuthChangeContext, type AuthUser } from "./lib/use-authentication";
import { usePushNotifications } from "./lib/use-push-notifications";
import { useTutorialAnchors } from "./lib/tutorial-anchors";
import { useAppClock } from "./lib/use-app-clock";
import { useAppModalController } from "./lib/use-app-modal-controller";
import { useEventOperations } from "./lib/use-event-operations";
import { useBackupActions } from "./lib/use-backup-actions";
import { shouldLoadCompleteHistory } from "./lib/history-loading-policy";
import { useVoiceInteraction } from "./lib/use-voice-interaction";
import { useFamilySessionLifecycle } from "./lib/use-family-session-lifecycle";
import { getOtherTwinId, hasTwinCopyDuplicate, supportsTwinCopyEvent } from "./lib/twin-copy";

const createEmptyState = () => createInitialAppState(new Date());
const FAMILY_INVITE_KEY = "twinly-family-invite";

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

export default function App() {
  const [tutorialReplay, setTutorialReplay] = useState(0);
  const [app, setApp] = useState<AppState>(() => createEmptyState());
  const [activeDate, setActiveDate] = useState(() => createEmptyState().ui.lastViewedDate);
  const { now, todayDate, refreshNow, resetClock } = useAppClock(setActiveDate);
  const [pendingInviteToken, setPendingInviteToken] = useState(readFamilyInvite);
  const [appLoading, setAppLoading] = useState(true);
  const { modal, openModal, openSleepTime, closeModal } = useAppModalController();
  const [chartModalOpen, setChartModalOpen] = useState(false);
  const [dailyReportModalOpen, setDailyReportModalOpen] = useState(false);
  const [timelineModalOpen, setTimelineModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [historyModal, setHistoryModal] = useState<{
    babyId: BabyId;
    type: "milk" | "diaper" | "sleep";
  } | null>(null);
  const [selectedBabyTab, setSelectedBabyTab] = useState<BabyId>("A");
  const {
    voiceMessage,
    voiceButtonRef,
    showVoiceMessage,
    startVoiceInput,
    startVoiceInputForBabyTab,
    beginVoiceLongPress,
    clearVoiceLongPress,
  } = useVoiceInteraction(setSelectedBabyTab);
  const babyTabSwipeStartRef = useRef<SwipePoint | null>(null);
  const primaryActionStickyRef = useRef<HTMLDivElement | null>(null);

  const sessionBoundaryResetRef = useRef<() => void>(() => {});
  const {
    family,
    familyMember,
    familyMembers,
    sessionError,
    setFamilyMember,
    handleAuthUserChanged: applyFamilySessionAuthChange,
    activateFamilySession,
  } = useFamilySessionLifecycle({
    setApp,
    setActiveDate,
    setAppLoading,
    resetClock,
    onProfileIncomplete: () => setAccountModalOpen(true),
  });

  const handleAuthUserChanged = async (user: AuthUser | null, context: AuthChangeContext) => {
    closeModal();
    setHelpModalOpen(false);
    setHistoryModal(null);
    sessionBoundaryResetRef.current();
    await applyFamilySessionAuthChange(user, context);
  };

  const {
    user: authUser,
    ready: authReady,
    enabled: firebaseEnabled,
    signInGoogle: handleSignIn,
    sendEmailLink: handleSendEmailLink,
    signOutUser,
  } = useAuthentication({ inviteToken: pendingInviteToken, onUserChanged: handleAuthUserChanged });
  const { access: familyAccess, error: accessError } = useFamilyAccess(authUser?.uid, family?.id);
  const { theme, layoutMode, selectTheme, selectLayoutMode } = useAppearancePreferences(
    family?.id,
    Boolean(familyAccess?.features.themes)
  );
  const sharedAccessBlocked = Boolean(
    familyMember && familyMember.role !== "owner" && !familyAccess?.features.familySharing
  );
  const pushNotifications = usePushNotifications(authUser);
  const comfortToolsRef = useRef<ComfortToolsHandle | null>(null);
  const [comfortHeaderState, setComfortHeaderState] = useState<ComfortState>({
    active: false,
    paused: false,
    trackId: "",
    trackLabel: "",
  });
  const tutorialAnchors = useTutorialAnchors();

  const allHistory = shouldLoadCompleteHistory({
    activeDate,
    now,
    overlays: {
      chartOpen: chartModalOpen,
      dailyReportOpen: dailyReportModalOpen,
      timelineOpen: timelineModalOpen,
      historyOpen: Boolean(historyModal),
      settingsOpen: modal?.kind === "settings",
    },
  });
  const { store, status: syncStatus, requestSync, hydrated: appHydrated } = useAppStore(
    authUser?.uid,
    sharedAccessBlocked ? undefined : family?.id,
    allHistory,
    setApp,
    setAppLoading
  );

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

  const updateApp = (updater: (previous: AppState) => AppState,
    options: { absoluteSettings?: boolean } = {}) => {
    try {
      if (!store.current) throw new Error("記録を読み込んでいます。");
      store.current.update(updater, options);
      refreshNow();
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : "端末に保存できませんでした。空き容量を確認してください。");
      return false;
    }
  };

  const {
    undo,
    dismissUndo,
    resetUndo,
    recordEventDrafts,
    handleAddEvent,
    onSaveMilk,
    onSaveSolidFood,
    onSaveDiaper,
    handleVoiceCommand,
    onSaveEdit,
    saveSleepEventAt,
    removeEvent,
    undoLast,
    retryLastVoiceInput,
    editTarget,
  } = useEventOperations({
    actorUid: authUser?.uid,
    app,
    modal,
    idFactory: uid,
    updateApp,
    retryVoiceInput: startVoiceInput,
  });
  sessionBoundaryResetRef.current = resetUndo;

  useEffect(() => {
    setApp((prev) => {
      if (prev.ui.lastViewedDate === activeDate) return prev;
      return { ...prev, ui: { ...prev.ui, lastViewedDate: activeDate } };
    });
  }, [activeDate]);

  const resetAll = () => {
    if (!authUser) return;
    if (syncStatus.fromCache || syncStatus.pending) { alert("通信が回復し、同期が完了してから削除してください。"); return; }
    if (!confirm("すべてのデータを削除しますか？")) return;
    const nextState = createEmptyState();
    if (!updateApp(() => nextState)) return;
    setActiveDate(nextState.ui.lastViewedDate);
    closeModal();
    resetUndo();
  };

  const onUpdateDiaperStock = (babyId: BabyId, size: string, stock: number) => {
    updateApp((previous) => updateSharedDiaperStock(previous, babyId, size, stock));
  };

  const handleAddCustomMemoPreset = (emoji: string, text: string): CustomMemoPreset | null => {
    const normalizedEmoji = emoji.trim();
    const normalizedText = text.trim();
    if (!normalizedEmoji || !normalizedText) return null;
    const preset: CustomMemoPreset = {
      id: uid(),
      emoji: normalizedEmoji,
      text: normalizedText,
    };
    if (!updateApp((previous) => ({
      ...previous,
      customMemoPresets: [preset, ...previous.customMemoPresets],
    }))) return null;
    return preset;
  };

  const handleDeleteCustomMemoPreset = (id: string) => {
    updateApp((previous) => ({
      ...previous,
      customMemoPresets: previous.customMemoPresets.filter((preset) => preset.id !== id),
    }));
  };

  const isTwinCopyDuplicate = (event: LogEvent, payload: Partial<LogEvent>) =>
    hasTwinCopyDuplicate(app.events, event, payload);

  const handleCopyToTwin = (event: LogEvent, payload: Partial<LogEvent>) => {
    if (!supportsTwinCopyEvent(event) || isTwinCopyDuplicate(event, payload)) return false;

    const sharedDailyId =
      event.type === "daily" ? event.sharedDailyId ?? uid() : undefined;
    const copied = recordEventDrafts([
      {
        babyId: getOtherTwinId(event.babyId),
        type: event.type,
        payload: sharedDailyId ? { ...payload, sharedDailyId } : payload,
        autoWake: false,
      },
    ]);
    if (!copied) return false;

    if (event.type === "daily" && sharedDailyId) {
      onSaveEdit(event.id, { ...payload, sharedDailyId });
    }
    return true;
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

    await activateFamilySession(authUser);
    window.localStorage.removeItem(FAMILY_INVITE_KEY);
    setPendingInviteToken("");
  };

  const handleSaveMemberProfile = async (profile: {
    nickname: string;
    relationship: FamilyRelationship;
  }) => {
    if (!authUser || !family) return;
    await updateMemberProfile(family.id, authUser.uid, profile);
    setFamilyMember((current) => current ? { ...current, ...profile, profileCompleted: true } : current);
  };

  const handleCreateFamilyInvite = async () => {
    if (!family) throw new Error("Family is not ready");
    const invite = await createFamilyInvite(family.id);
    const inviteUrl = new URL(window.location.origin);
    inviteUrl.searchParams.set("invite", invite.token);
    return inviteUrl.toString();
  };

  const handleSignOut = async () => {
    setAccountModalOpen(false);
    setHelpModalOpen(false);
    await pushNotifications.removeCurrentDevice();
    await signOutUser();
  };

  const { handleExport, handleImport } = useBackupActions({
    store,
    status: syncStatus,
    updateApp,
    setActiveDate,
  });

  const dashboard = useMemo(
    () => buildDashboardSelectors(app, activeDate, todayDate, now),
    [activeDate, app, now, todayDate]
  );

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

  if (sharedAccessBlocked) return <AppContainer><div className="mx-auto max-w-md space-y-4 p-6"><h1 className="text-xl font-bold">家族共有は有料機能です</h1><p>{accessError || (familyAccess ? "無料モードの間は管理者だけが記録を利用できます。管理者が無料体験またはPremiumの契約を開始すると共有を再開します。" : "プランを確認中…")}</p><p>既存の記録とメンバー登録は保持しています。</p><Button onClick={handleSignOut}>ログアウト</Button></div></AppContainer>;

  if (sessionError || (syncStatus.error && authUser && family && !syncStatus.ready)) {
    return <AppContainer><div className="grid min-h-screen place-items-center p-6"><div className="max-w-md space-y-4 text-center">
      <p role="alert">{sessionError || syncStatus.error}</p>
      <Button onClick={() => window.location.reload()}>再読み込み</Button>
      <Button variant="ghost" onClick={handleSignOut}>ログアウト</Button>
    </div></div></AppContainer>;
  }

  if (!authReady || appLoading) {
    return (
      <AppContainer>
        <LaunchSplash />
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
          <Tabs value={selectedBabyTab} onValueChange={(value) => setSelectedBabyTab(value as BabyId)} className="twinly-baby-tabs w-full">
            <div ref={primaryActionStickyRef} className="sticky top-0 z-40 space-y-1 bg-background">
              <header
                ref={tutorialAnchors.ref("header")}
                className="flex items-center justify-between rounded-lg border bg-card px-2.5 py-1.5 shadow-sm"
                onDoubleClick={startVoiceInput}
                onPointerDown={() => beginVoiceLongPress()}
                onPointerUp={clearVoiceLongPress}
                onPointerLeave={clearVoiceLongPress}
                onPointerCancel={clearVoiceLongPress}
                onContextMenu={(event) => event.preventDefault()}
              >
                <div className="flex items-center gap-2.5">
                  <div className="hidden h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 min-[430px]:grid">
                    <Baby className="h-5 w-5 text-white" />
                  </div>
                  <h1 className="text-xl font-extrabold tracking-tight">Twinly</h1>
                </div>

                <div className="flex items-center gap-1">
                  <ManualSyncButton status={syncStatus} onSync={requestSync} />
                  <div className="hidden" aria-hidden="true"><ComfortTools ref={comfortToolsRef} key={`comfort:${authUser.uid}:${family.id}`} access={familyAccess} app={app} familyId={family.id} onStateChange={setComfortHeaderState}/></div>
                  <VoiceCommandButton
                    ref={voiceButtonRef}
                    babyNames={voiceCommandBabyNames}
                    defaultMilkMlByBaby={defaultVoiceMilkMlByBaby}
                    onCommand={handleVoiceCommand}
                    onMessage={showVoiceMessage}
                  />
                  <HeaderOverflowMenu
                    tutorialAnchorRef={tutorialAnchors.ref("settings")}
                    access={familyAccess}
                    onOpenHelp={() => setHelpModalOpen(true)}
                    onOpenSettings={() => openModal("settings")}
                    onOpenComfort={() => comfortToolsRef.current?.open()}
                  />
                  <button
                    type="button"
                    className="twinly-account-avatar grid h-8 w-8 place-items-center rounded-full text-sm font-bold transition-colors"
                    onClick={() => setAccountModalOpen(true)}
                    aria-label="アカウントと家族を開く"
                    title={familyMember.nickname}
                  >
                    {familyMember.nickname.slice(0, 1)}
                  </button>
                </div>
              </header>
              <ComfortMiniPlayer
                state={comfortHeaderState}
                onOpen={() => comfortToolsRef.current?.open()}
                onTogglePause={() => comfortToolsRef.current?.togglePause()}
              />
              <p
                className="overflow-hidden whitespace-nowrap text-center text-[10px] leading-none text-muted-foreground"
                data-twinly-voice-hint="true"
                hidden={comfortHeaderState.active && !comfortHeaderState.paused}
              >
                <span className="hidden min-[480px]:inline">ダブルクリック／長押しで音声入力｜ヘッダー＝2人同時・タブ＝個別</span>
                <span className="min-[480px]:hidden">ダブルクリック／長押しで音声入力</span>
              </p>

              <TabsList
                ref={tutorialAnchors.ref("baby-tabs")}
                className={`twinly-baby-tabs-list grid h-auto w-full gap-1 p-1 min-[430px]:grid-cols-2 ${
                  selectedBabyTab === "A"
                    ? "grid-cols-[minmax(140px,0.85fr)_minmax(180px,1.15fr)]"
                    : "grid-cols-[minmax(180px,1.15fr)_minmax(140px,0.85fr)]"
                }`}
              >
                <TabsTrigger
                  value="A"
                  ref={tutorialAnchors.ref("baby-tab:A")}
                  className="h-auto px-1 py-0.5"
                  onDoubleClick={() => startVoiceInputForBabyTab("A")}
                  onPointerDown={() => beginVoiceLongPress("A")}
                  onPointerUp={clearVoiceLongPress}
                  onPointerLeave={clearVoiceLongPress}
                  onPointerCancel={clearVoiceLongPress}
                  onContextMenu={(event) => event.preventDefault()}
                >
                {appHydrated ? (
                  <BabyTabTrigger
                    profile={app.profiles.A}
                    gaugesEnabled={Boolean(familyAccess?.features.gauges)}
                    gaugePercents={dashboard.A.tabGaugePercents}
                    activityGaugeEnabled={app.sleepManagementEnabled}
                    sleeping={app.sleepManagementEnabled && dashboard.A.sleeping}
                    selected={selectedBabyTab === "A"}
                  />
                ) : (
                  <BabyTabHydrationPlaceholder selected={selectedBabyTab === "A"} />
                )}
                </TabsTrigger>
                <TabsTrigger
                  ref={tutorialAnchors.ref("baby-tab:B")}
                  value="B"
                  className="h-auto px-1 py-0.5"
                  onDoubleClick={() => startVoiceInputForBabyTab("B")}
                  onPointerDown={() => beginVoiceLongPress("B")}
                  onPointerUp={clearVoiceLongPress}
                  onPointerLeave={clearVoiceLongPress}
                  onPointerCancel={clearVoiceLongPress}
                  onContextMenu={(event) => event.preventDefault()}
                >
                {appHydrated ? (
                  <BabyTabTrigger
                    profile={app.profiles.B}
                    gaugesEnabled={Boolean(familyAccess?.features.gauges)}
                    gaugePercents={dashboard.B.tabGaugePercents}
                    activityGaugeEnabled={app.sleepManagementEnabled}
                    sleeping={app.sleepManagementEnabled && dashboard.B.sleeping}
                    selected={selectedBabyTab === "B"}
                  />
                ) : (
                  <BabyTabHydrationPlaceholder selected={selectedBabyTab === "B"} />
                )}
                </TabsTrigger>
              </TabsList>
            </div>
            <div
              className="twinly-baby-tabs-panels touch-auto"
              onTouchStart={handleBabyTabTouchStart}
              onTouchEnd={handleBabyTabTouchEnd}
              onTouchCancel={() => {
                babyTabSwipeStartRef.current = null;
              }}
            >
            <TabsContent forceMount value="A" className="twinly-baby-tabs-content mt-1 data-[state=inactive]:hidden">
              {appHydrated ? (
                <BabyPanel
                tutorialAnchorRef={tutorialAnchors.ref}
                primaryActionMorph={{
                  stickyRef: primaryActionStickyRef,
                  layoutMode,
                  selected: selectedBabyTab === "A",
                  primaryInSplit: true,
                }}
                profile={app.profiles.A}
                events={dashboard.A.currentEvents}
                latestEvents={dashboard.A.latestEvents}
                logEvents={dashboard.A.logEvents}
                logDateControls={renderLogDateControls()}
                logDate={activeDate}
                now={now}
                diaperStockManagementEnabled={app.diaperStockManagementEnabled}
                sleepManagementEnabled={app.sleepManagementEnabled}
                customMemoPresets={app.customMemoPresets}
                onAddCustomMemoPreset={handleAddCustomMemoPreset}
                onDeleteCustomMemoPreset={handleDeleteCustomMemoPreset}
                lowStock={dashboard.A.lowStock}
                gaugesEnabled={Boolean(familyAccess?.features.gauges)}
                stockForecastEnabled={Boolean(familyAccess?.features.stockForecast)}
                diaperEstimate={dashboard.A.diaperEstimate}
                milkProgress={dashboard.A.milkProgress}
                onOpenHistory={(type, babyId) => setHistoryModal({ type, babyId })}
                onOpenModal={openModal}
                onAddEvent={handleAddEvent}
                onOpenSleepTimeEditor={openSleepTime}
                onOpenDailyReport={() => setDailyReportModalOpen(true)}
                onOpenHealthChart={() => setChartModalOpen(true)}
                onOpenTimeline={() => { setSelectedBabyTab("A"); setTimelineModalOpen(true); }}
                onVoiceMessage={showVoiceMessage}
                lastWeight={dashboard.A.lastWeight}
                lastHeight={dashboard.A.lastHeight}
                themeDimmedBgColor={
                  iconGradients.find((gradient) => gradient.value === app.profiles.A.iconGradient)?.dimmedBgColor ??
                  "bg-background"
                }
                memberNameByUid={memberNameByUid}
              />
              ) : (
                <BabyPanelHydrationPlaceholder />
              )}
            </TabsContent>
            <TabsContent forceMount value="B" className="twinly-baby-tabs-content mt-1 data-[state=inactive]:hidden">
              {appHydrated ? (
                <BabyPanel
                tutorialAnchorRef={tutorialAnchors.ref}
                primaryActionMorph={{
                  stickyRef: primaryActionStickyRef,
                  layoutMode,
                  selected: selectedBabyTab === "B",
                  primaryInSplit: false,
                }}
                profile={app.profiles.B}
                events={dashboard.B.currentEvents}
                latestEvents={dashboard.B.latestEvents}
                logEvents={dashboard.B.logEvents}
                logDateControls={renderLogDateControls()}
                logDate={activeDate}
                now={now}
                diaperStockManagementEnabled={app.diaperStockManagementEnabled}
                sleepManagementEnabled={app.sleepManagementEnabled}
                customMemoPresets={app.customMemoPresets}
                onAddCustomMemoPreset={handleAddCustomMemoPreset}
                onDeleteCustomMemoPreset={handleDeleteCustomMemoPreset}
                lowStock={dashboard.B.lowStock}
                gaugesEnabled={Boolean(familyAccess?.features.gauges)}
                stockForecastEnabled={Boolean(familyAccess?.features.stockForecast)}
                diaperEstimate={dashboard.B.diaperEstimate}
                milkProgress={dashboard.B.milkProgress}
                onOpenHistory={(type, babyId) => setHistoryModal({ type, babyId })}
                onOpenModal={openModal}
                onAddEvent={handleAddEvent}
                onOpenSleepTimeEditor={openSleepTime}
                onOpenDailyReport={() => setDailyReportModalOpen(true)}
                onOpenHealthChart={() => setChartModalOpen(true)}
                onOpenTimeline={() => { setSelectedBabyTab("B"); setTimelineModalOpen(true); }}
                onVoiceMessage={showVoiceMessage}
                lastWeight={dashboard.B.lastWeight}
                lastHeight={dashboard.B.lastHeight}
                themeDimmedBgColor={
                  iconGradients.find((gradient) => gradient.value === app.profiles.B.iconGradient)?.dimmedBgColor ??
                  "bg-background"
                }
                memberNameByUid={memberNameByUid}
              />
              ) : (
                <BabyPanelHydrationPlaceholder />
              )}
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
        onRetry={undo.retryVoice ? retryLastVoiceInput : undefined}
        onClose={dismissUndo}
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
        onOpenChange={(open) => !open && closeModal()}
        displayName={modal?.kind === "milk" ? app.profiles[modal.babyId].displayName : ""}
        isSleeping={modal?.kind === "milk" ? dashboard[modal.babyId].sleeping : false}
        initialDraft={milkDraft}
        onSave={onSaveMilk}
        onSaveSolidFood={onSaveSolidFood}
      />
      <DiaperModal
        open={modal?.kind === "diaper"}
        onOpenChange={(open) => !open && closeModal()}
        displayName={modal?.kind === "diaper" ? app.profiles[modal.babyId].displayName : ""}
        isSleeping={modal?.kind === "diaper" ? dashboard[modal.babyId].sleeping : false}
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
        onOpenChange={(open) => !open && closeModal()}
        displayName={modal?.kind === "sleepTime" ? app.profiles[modal.babyId].displayName : ""}
        type={modal?.kind === "sleepTime" ? modal.type : "sleepStart"}
        onSave={saveSleepEventAt}
      />
      <IntroTutorial
        key={`tutorial:${authUser.uid}`}
        uid={authUser.uid}
        ready={syncStatus.ready && Boolean(familyAccess)}
        blocked={Boolean(modal) || helpModalOpen || accountModalOpen || timelineModalOpen || chartModalOpen || dailyReportModalOpen || Boolean(historyModal)}
        replay={tutorialReplay}
        names={[app.profiles.A.displayName, app.profiles.B.displayName]}
        anchors={tutorialAnchors}
        activeBabyId={selectedBabyTab}
        onOpenSettings={() => openModal("settings")}
      />
      <HelpModal
        open={helpModalOpen}
        onOpenChange={setHelpModalOpen}
        names={[app.profiles.A.displayName, app.profiles.B.displayName]}
        onReplayTutorial={() => {
          setHelpModalOpen(false);
          setTutorialReplay((value) => value + 1);
        }}
      />
      <SettingsModal
        open={modal?.kind === "settings"}
        onOpenChange={(open) => !open && closeModal()}
        app={app}
        premiumGaugesEnabled={Boolean(familyAccess?.features.gauges)}
        setApp={(updater) => {
          updateApp((prevApp) => {
            const nextApp = typeof updater === "function" ? updater(prevApp) : updater;
            return nextApp;
          });
        }}
        signedIn={Boolean(authUser)}
        onSignIn={handleSignIn}
        pushPermission={pushNotifications.permission}
        pushSubscribed={pushNotifications.subscribed}
        pushBusy={pushNotifications.busy}
        webPushConfigured={pushNotifications.configured}
        onEnablePushNotifications={pushNotifications.enable}
        onDisablePushNotifications={pushNotifications.disable}
        onExport={handleExport}
        onImport={handleImport}
        onResetAll={resetAll}
        appearance={
          <div className="space-y-6">
            <section className="space-y-3">
              <div>
                <h3 className="font-semibold">画面レイアウト</h3>
                <p className="text-sm text-muted-foreground">横長の端末で、双子の入力画面をどう表示するか選べます。</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => selectLayoutMode("single")}
                  className={`rounded-xl border-2 p-3 text-left transition ${layoutMode === "single" ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "border-border bg-card"}`}
                >
                  <span className="block text-sm font-bold">1人ずつ表示</span>
                  <span className="mt-1 block text-xs text-muted-foreground">従来どおり、双子タブで切り替えて画面いっぱいに表示</span>
                </button>
                <button
                  type="button"
                  onClick={() => selectLayoutMode("split")}
                  className={`rounded-xl border-2 p-3 text-left transition ${layoutMode === "split" ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "border-border bg-card"}`}
                >
                  <span className="block text-sm font-bold">左右2人表示</span>
                  <span className="mt-1 block text-xs text-muted-foreground">横幅{WIDE_SPLIT_LAYOUT_MIN_WIDTH_PX}px以上で2人を同時表示。狭い画面では自動で1人表示</span>
                </button>
              </div>
            </section>
            <section className="space-y-3">
              <div><h3 className="font-semibold">テーマ</h3><p className="text-sm text-muted-foreground">背景・文字・ゲージをまとめて切り替えます。</p></div>
              <div className="grid grid-cols-2 gap-2">{[
                ["dark", "ナイト", "from-slate-950 to-indigo-950"], ["milk", "ミルク", "from-stone-50 to-amber-100"],
                ["sakura", "さくら", "from-rose-50 to-pink-200"], ["sun", "ひだまり", "from-amber-50 to-orange-200"],
                ["forest", "森の朝", "from-emerald-50 to-green-200"]
              ].map(([id,label,colors]) => <button key={id} type="button" disabled={id!=="dark"&&id!=="milk"&&!familyAccess?.features.themes} onClick={() => selectTheme(id)} className={`rounded-xl border-2 bg-gradient-to-br ${colors} p-3 text-left ${theme===id ? "border-primary ring-2 ring-primary/30" : "border-border"} disabled:opacity-45`}><span className="block text-sm font-bold text-slate-800">{label}</span><span className="block text-xs text-slate-600">{id!=="dark"&&id!=="milk"&&!familyAccess?.features.themes ? "有料限定" : "選択"}</span></button>)}</div>
            </section>
          </div>
        }
        planAi={<AiTools key={`${authUser.uid}:${family.id}`} familyId={family.id} app={app} onSave={(drafts) => {
          if (!validConfirmedDrafts(drafts)) return false;
          const eventDrafts: EventDraft[] = drafts.map((draft) => ({
            babyId: draft.babyId,
            type: draft.type,
            payload: {
              timestamp: draft.timestamp!,
              ...(draft.type === "milk" ? { milkMl: draft.milkMl } : {}),
              ...(draft.type === "diaper" ? { diaperKind: draft.diaperKind } : {}),
              note: "AI音声・文章解析（確認済み）",
            },
            autoWake: false,
          }));
          return recordEventDrafts(eventDrafts);
        }} />}
      />
      <SyncStatusOverlay status={syncStatus} resolver={store.current} />
      <BillingPrompt />
      <AccountModal sharingEnabled={Boolean(familyAccess?.features.familySharing)}
        open={accountModalOpen}
        onOpenChange={setAccountModalOpen}
        accountEmail={authUser.email}
        family={family}
        member={familyMember}
        members={familyMembers}
        onSaveProfile={handleSaveMemberProfile}
        onCreateInvite={handleCreateFamilyInvite}
        onSignOut={handleSignOut}
      />
      <EditModal
        open={modal?.kind === "edit"}
        onOpenChange={(open) => !open && closeModal()}
        event={editTarget}
        memberNameByUid={memberNameByUid}
        onSave={onSaveEdit}
        onDelete={removeEvent}
        onCopyToTwin={handleCopyToTwin}
        isTwinCopyDuplicate={isTwinCopyDuplicate}
      />
      <Suspense fallback={<div role="status" className="fixed bottom-4 left-4 rounded border bg-background p-3">読み込み中…</div>}>
      {chartModalOpen && <HealthChartModal open={chartModalOpen} onOpenChange={setChartModalOpen} events={app.events} profiles={app.profiles} />}
      {dailyReportModalOpen && <DailyReportModal
        open={dailyReportModalOpen}
        onOpenChange={setDailyReportModalOpen}
        events={app.events}
        profiles={app.profiles}
        onSelectEvent={({ eventId, repairEventId, sharedDailyId }) => {
          if (repairEventId && sharedDailyId) {
            onSaveEdit(repairEventId, { sharedDailyId });
          }
          openModal("edit", { eventId });
        }}
      />}
      {timelineModalOpen && <WeeklyTimelineModal
        open={timelineModalOpen}
        onOpenChange={setTimelineModalOpen}
        events={app.events}
        profiles={app.profiles}
        initialDate={activeDate}
        initialBabyId={selectedBabyTab}
        now={now}
      />}
      </Suspense>
      <Suspense
        fallback={
          historyModal ? (
            <HistoryModalSkeleton
              open
              onOpenChange={(open) => !open && setHistoryModal(null)}
            />
          ) : null
        }
      >
      {historyModal?.type === "sleep" ? (
        <SleepHistoryModal
          open
          onOpenChange={(open) => !open && setHistoryModal(null)}
          events={app.events}
          profile={app.profiles[historyModal.babyId]}
          now={now}
          onSwitchBaby={(babyId) =>
            setHistoryModal((current) => current ? { ...current, babyId } : current)
          }
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
          onSwitchBaby={(babyId) =>
            setHistoryModal((current) => current ? { ...current, babyId } : current)
          }
        />
      ) : null}
      </Suspense>
    </AppContainer>
  );
}

