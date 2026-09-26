import { BillingPrompt } from "./components/BillingPrompt";
import { IntroTutorial } from "./components/IntroTutorial";
import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BabyPanel } from "./components/BabyPanel";
import {
  AppState,
  BabyId,
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
import { AppearanceSettingsPanel } from "./components/AppearanceSettingsPanel";
import { HelpModal } from "./components/HelpModal";
import { ComfortTools, type ComfortState, type ComfortToolsHandle } from "./components/ComfortTools";
import { ManualSyncButton } from "./components/ManualSyncButton";
import { SyncStatusOverlay } from "./components/SyncStatusOverlay";
import { ComfortMiniPlayer, HeaderOverflowMenu } from "./components/HeaderOverflowMenu";
import { useFamilyAccess } from "./lib/use-family-access";
import { useAppearancePreferences } from "./lib/use-appearance-preferences";
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
import {
  createCustomMemoPreset,
  prependCustomMemoPreset,
  removeCustomMemoPreset,
} from "./lib/custom-memo-presets";

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

  const handleAddCustomMemoPreset = (emoji: string, text: string) => {
    const preset = createCustomMemoPreset(emoji, text, uid);
    if (!preset) return null;
    if (!updateApp((previous) => ({
      ...previous,
      customMemoPresets: prependCustomMemoPreset(previous.customMemoPresets, preset),
    }))) return null;
    return preset;
  };

  const handleDeleteCustomMemoPreset = (id: string) => {
    updateApp((previous) => ({
      ...previous,
      customMemoPresets: removeCustomMemoPreset(previous.customMemoPresets, id),
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
                <div className="flex items-center">
                  <img
                    src="data:image/webp;base64,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"
                    alt="Twinly"
                    className="h-8 w-auto max-w-[112px] object-contain"
                  />
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
          <AppearanceSettingsPanel
            theme={theme}
            layoutMode={layoutMode}
            premiumThemesEnabled={Boolean(familyAccess?.features.themes)}
            onSelectTheme={selectTheme}
            onSelectLayoutMode={selectLayoutMode}
          />
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

