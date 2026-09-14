import fs from 'node:fs';

const appPath = 'src/App.tsx';
let source = fs.readFileSync(appPath, 'utf8');

const replaceExact = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Missing App.tsx fragment: ${label}`);
  source = source.replace(from, to);
};

const replaceRegex = (pattern, to, label) => {
  if (!pattern.test(source)) throw new Error(`Missing App.tsx pattern: ${label}`);
  source = source.replace(pattern, to);
};

replaceExact(
  'import { Baby, ChevronLeft, ChevronRight, HelpCircle, Settings } from "lucide-react";\n',
  'import { Baby, ChevronLeft, ChevronRight } from "lucide-react";\n',
  'lucide imports'
);
replaceRegex(/import \{\n  GoogleAuthProvider,[\s\S]*?\n\} from "firebase\/auth";\n/, '', 'firebase auth imports');
replaceExact('import { deleteDoc, doc, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";\n', '', 'firestore imports');
replaceExact('import { auth, db, ensureAuthPersistence, isFirebaseConfigured, webPushPublicKey } from "./firebase";\n', '', 'firebase app imports');
replaceExact(
  'import { ManualSyncButton } from "./components/ManualSyncButton";\n',
  'import { ManualSyncButton } from "./components/ManualSyncButton";\nimport { ComfortMiniPlayer, HeaderOverflowMenu, useComfortHeaderState } from "./components/HeaderOverflowMenu";\n',
  'header controls import'
);
replaceExact('import { estimateDiaperStockBySize } from "./lib/diaper-stock";\n', '', 'diaper selector import');
replaceExact('import { buildMilkProgressComparison } from "./lib/milk-progress";\n', '', 'milk selector import');
replaceExact('import { buildCareGauges } from "./lib/care-gauges";\n', '', 'care gauge import');
replaceExact('import { createWearPairingToken, hashWearPairingToken } from "./lib/wear-link";\n', '', 'wear imports');
replaceRegex(/import \{\n  analyzeSleepEvents,[\s\S]*?\n\} from "\.\/lib\/sleep";\n/, '', 'sleep derived imports');
replaceRegex(/import \{\n  getDeviceId,[\s\S]*?\n\} from "\.\/lib\/web-push";\n/, '', 'web push imports');
replaceExact(
  'import { endOfDayMs, fmtDate, startOfDayMs, uid } from "./lib/utils";\n',
  'import { fmtDate, uid } from "./lib/utils";\n',
  'utils imports'
);
replaceExact(
  '} from "./lib/family";\n',
  '} from "./lib/family";\nimport { buildDashboardSelectors } from "./lib/dashboard-selectors";\nimport { ensureNotificationSettingsDocument } from "./lib/notification-settings";\nimport { useAuthentication, type AuthChangeContext, type AuthUser } from "./lib/use-authentication";\nimport { usePushNotifications } from "./lib/use-push-notifications";\nimport { useWearPairing } from "./lib/use-wear-pairing";\n',
  'new orchestration imports'
);
replaceRegex(/declare global \{[\s\S]*?\n\}\n\nconst createEmptyState/, 'const createEmptyState', 'global native bridge declaration');
replaceExact('const EMAIL_FOR_SIGN_IN_KEY = "twinly-email-for-sign-in";\n', '', 'email constant');

replaceExact(
`  const [authUser, setAuthUser] = useState<User | null>(null);\n  const [family, setFamily] = useState<FamilyInfo | null>(null);\n  const [familyMember, setFamilyMember] = useState<FamilyMember | null>(null);\n  const {access: familyAccess, error: accessError} = useFamilyAccess(authUser?.uid, family?.id);\n  const { theme, layoutMode, selectTheme, selectLayoutMode } = useAppearancePreferences(\n    family?.id,\n    Boolean(familyAccess?.features.themes)\n  );\n  const sharedAccessBlocked = Boolean(familyMember && familyMember.role !== "owner" && !familyAccess?.features.familySharing);\n  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);\n  const [pendingInviteToken, setPendingInviteToken] = useState(readFamilyInvite);\n  const [authReady, setAuthReady] = useState(false);\n  const [appLoading, setAppLoading] = useState(() => isFirebaseConfigured && Boolean(auth));\n  const firebaseEnabled = isFirebaseConfigured && Boolean(auth);\n  const todayDate = fmtDate(now);\n  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">(\n    getNotificationPermission()\n  );\n  const [pushSubscribed, setPushSubscribed] = useState(false);\n  const [pushBusy, setPushBusy] = useState(false);\n  const [wearPairingToken, setWearPairingToken] = useState<string | null>(null);\n  const [wearPairingBusy, setWearPairingBusy] = useState(false);\n`,
`  const [family, setFamily] = useState<FamilyInfo | null>(null);\n  const [familyMember, setFamilyMember] = useState<FamilyMember | null>(null);\n  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);\n  const [pendingInviteToken, setPendingInviteToken] = useState(readFamilyInvite);\n  const [appLoading, setAppLoading] = useState(true);\n  const todayDate = fmtDate(now);\n`,
  'top-level auth/push/wear state'
);

replaceExact(
`  const [sessionError, setSessionError] = useState<string | null>(null);\n  const allHistory = chartModalOpen || dailyReportModalOpen || timelineModalOpen || Boolean(historyModal) || modal?.kind === "settings" ||\n`,
`  const [sessionError, setSessionError] = useState<string | null>(null);\n\n  const handleAuthUserChanged = async (user: AuthUser | null, context: AuthChangeContext) => {\n    setSessionError(null);\n    setFamily(null);\n    setFamilyMember(null);\n    setFamilyMembers([]);\n    setApp(createEmptyState());\n    setModal(null);\n    setHelpModalOpen(false);\n    setHistoryModal(null);\n    setUndo({ open: false });\n\n    if (user) {\n      setAppLoading(true);\n      try {\n        const session = await loadFamilySession(user);\n        if (!context.isCurrent()) return;\n        setFamily(session?.family ?? null);\n        setFamilyMember(session?.member ?? null);\n        if (session) {\n          if (session.member.profileCompleted === false) setAccountModalOpen(true);\n          void ensureNotificationSettingsDocument(user).catch(console.error);\n        } else {\n          setFamilyMembers([]);\n          setAppLoading(false);\n        }\n      } catch (error) {\n        console.error("Failed to load family session", error);\n        if (!context.isCurrent()) return;\n        setSessionError("家族情報を取得できませんでした。通信状態を確認して再読み込みしてください。");\n        setFamily(null);\n        setFamilyMember(null);\n        setFamilyMembers([]);\n        setAppLoading(false);\n      }\n      return;\n    }\n\n    const nextState = createEmptyState();\n    setFamily(null);\n    setFamilyMember(null);\n    setFamilyMembers([]);\n    setApp(nextState);\n    setActiveDate(nextState.ui.lastViewedDate);\n    setNow(new Date());\n    lastKnownTodayRef.current = nextState.ui.lastViewedDate;\n    setAppLoading(false);\n  };\n\n  const {\n    user: authUser,\n    ready: authReady,\n    enabled: firebaseEnabled,\n    signInGoogle: handleSignIn,\n    sendEmailLink: handleSendEmailLink,\n    signOutUser,\n  } = useAuthentication({ inviteToken: pendingInviteToken, onUserChanged: handleAuthUserChanged });\n  const { access: familyAccess, error: accessError } = useFamilyAccess(authUser?.uid, family?.id);\n  const { theme, layoutMode, selectTheme, selectLayoutMode } = useAppearancePreferences(\n    family?.id,\n    Boolean(familyAccess?.features.themes)\n  );\n  const sharedAccessBlocked = Boolean(\n    familyMember && familyMember.role !== "owner" && !familyAccess?.features.familySharing\n  );\n  const pushNotifications = usePushNotifications(authUser);\n  const wearPairing = useWearPairing(authUser);\n  const comfortHeaderState = useComfortHeaderState();\n\n  const allHistory = chartModalOpen || dailyReportModalOpen || timelineModalOpen || Boolean(historyModal) || modal?.kind === "settings" ||\n`,
  'auth hook integration'
);

replaceRegex(/\n  const ensureNotificationSettingsDocument = async \(user: User\) => \{[\s\S]*?\n  \};\n\n  useEffect\(\(\) => \{\n    const refreshNow/, '\n  useEffect(() => {\n    const refreshNow', 'notification/push helper block');
replaceRegex(/\n  useEffect\(\(\) => \{\n    if \(!auth\) \{[\s\S]*?\n  \}, \[\]\);\n\n  useEffect\(\(\) => \{\n    if \(!family\) return;/, '\n  useEffect(() => {\n    if (!family) return;', 'auth lifecycle effect');
replaceRegex(/\n  useEffect\(\(\) => \{\n    if \(!isWebPushSupported\(\)\) \{[\s\S]*?\n  \}, \[authUser, pushPermission\]\);\n/, '\n', 'push effects');

source = source.replace('if (!authUser || !db || !drafts.length) return false;', 'if (!authUser || !drafts.length) return false;');
source = source.replace('if (!authUser || !db) return;\n    updateApp((prevApp) => {', 'if (!authUser) return;\n    updateApp((prevApp) => {');
source = source.replace('if (!authUser || !db || !undo.events?.length) return;', 'if (!authUser || !undo.events?.length) return;');
source = source.replace('if (!authUser || !db) return;\n    if (syncStatus.fromCache', 'if (!authUser) return;\n    if (syncStatus.fromCache');

replaceRegex(/\n  const handleSignIn = async \(\) => \{[\s\S]*?\n  const handleProfileSetup = async/, '\n  const handleProfileSetup = async', 'inline auth handlers');
replaceRegex(/\n  const handleSignOut = async \(\) => \{[\s\S]*?\n  const handleExport = async/, `\n  const handleSignOut = async () => {\n    setAccountModalOpen(false);\n    setHelpModalOpen(false);\n    await pushNotifications.removeCurrentDevice();\n    await signOutUser();\n  };\n\n  const handleExport = async`, 'signout/push/wear handlers');

replaceRegex(/\n  const selectedLogDayRange = useMemo\(\(\) => \{[\s\S]*?\n  const voiceCommandBabyNames = useMemo/, `\n  const dashboard = useMemo(\n    () => buildDashboardSelectors(app, activeDate, todayDate, now),\n    [activeDate, app, now, todayDate]\n  );\n\n  const voiceCommandBabyNames = useMemo`, 'dashboard derived state block');

for (const [from, to] of [
  ['currentEventsByBaby.A', 'dashboard.A.currentEvents'],
  ['currentEventsByBaby.B', 'dashboard.B.currentEvents'],
  ['latestEventsByBaby.A', 'dashboard.A.latestEvents'],
  ['latestEventsByBaby.B', 'dashboard.B.latestEvents'],
  ['logEventsByBaby.A', 'dashboard.A.logEvents'],
  ['logEventsByBaby.B', 'dashboard.B.logEvents'],
  ['lowStock.A', 'dashboard.A.lowStock'],
  ['lowStock.B', 'dashboard.B.lowStock'],
  ['diaperEstimates.A', 'dashboard.A.diaperEstimate'],
  ['diaperEstimates.B', 'dashboard.B.diaperEstimate'],
  ['milkProgressByBaby.A', 'dashboard.A.milkProgress'],
  ['milkProgressByBaby.B', 'dashboard.B.milkProgress'],
  ['lastWeights.A', 'dashboard.A.lastWeight'],
  ['lastWeights.B', 'dashboard.B.lastWeight'],
  ['lastHeights.A', 'dashboard.A.lastHeight'],
  ['lastHeights.B', 'dashboard.B.lastHeight'],
  ['tabGaugePercents.A', 'dashboard.A.tabGaugePercents'],
  ['tabGaugePercents.B', 'dashboard.B.tabGaugePercents'],
  ['sleepingByBaby.A', 'dashboard.A.sleeping'],
  ['sleepingByBaby.B', 'dashboard.B.sleeping'],
  ['sleepingByBaby[modal.babyId]', 'dashboard[modal.babyId].sleeping'],
]) source = source.replaceAll(from, to);

replaceExact(
'                  <ComfortTools key={`comfort:${authUser.uid}:${family.id}`} access={familyAccess} app={app} familyId={family.id}/>\n',
'                  <div className="hidden" aria-hidden="true"><ComfortTools key={`comfort:${authUser.uid}:${family.id}`} access={familyAccess} app={app} familyId={family.id}/></div>\n',
'hidden comfort trigger'
);
replaceRegex(/                  <Button\n                    variant="ghost"\n                    size="icon"\n                    onClick=\{\(event\) => \{ event\.stopPropagation\(\); setHelpModalOpen\(true\); \}\}[\s\S]*?                  <\/Button>\n                  <Button variant="ghost" size="icon" onClick=\{\(\) => handleOpenModal\("settings"\)\} aria-label="settings">\n                    <Settings className="h-5 w-5" \/>\n                  <\/Button>\n/, `                  <HeaderOverflowMenu\n                    access={familyAccess}\n                    onOpenHelp={() => setHelpModalOpen(true)}\n                    onOpenSettings={() => handleOpenModal("settings")}\n                  />\n`, 'header overflow JSX');
replaceExact(
'              </header>\n              <p\n                className="overflow-hidden whitespace-nowrap text-center text-[10px] leading-none text-muted-foreground"\n                data-twinly-voice-hint="true"\n              >\n',
'              </header>\n              <ComfortMiniPlayer state={comfortHeaderState} />\n              <p\n                className="overflow-hidden whitespace-nowrap text-center text-[10px] leading-none text-muted-foreground"\n                data-twinly-voice-hint="true"\n                hidden={comfortHeaderState.active && !comfortHeaderState.paused}\n              >\n',
'mini player JSX'
);

source = source.replace('pushPermission={pushPermission}', 'pushPermission={pushNotifications.permission}');
source = source.replace('pushSubscribed={pushSubscribed}', 'pushSubscribed={pushNotifications.subscribed}');
source = source.replace('pushBusy={pushBusy}', 'pushBusy={pushNotifications.busy}');
source = source.replace('webPushConfigured={Boolean(webPushPublicKey)}', 'webPushConfigured={pushNotifications.configured}');
source = source.replace('onEnablePushNotifications={handleEnablePushNotifications}', 'onEnablePushNotifications={pushNotifications.enable}');
source = source.replace('onDisablePushNotifications={handleDisablePushNotifications}', 'onDisablePushNotifications={pushNotifications.disable}');
source = source.replace('wearPairingToken={wearPairingToken}', 'wearPairingToken={wearPairing.token}');
source = source.replace('wearPairingBusy={wearPairingBusy}', 'wearPairingBusy={wearPairing.busy}');
source = source.replace('onCreateWearPairingToken={handleCreateWearPairingToken}', 'onCreateWearPairingToken={wearPairing.createPairingToken}');

fs.writeFileSync(appPath, source);

const legacyPath = 'src/legacy-dom-enhancers.ts';
let legacy = fs.readFileSync(legacyPath, 'utf8');
legacy = legacy.replace('import "./lib/header-overflow-menu-v3";\n', '');
fs.writeFileSync(legacyPath, legacy);

console.log('Applied STEP 5-7 refactor transforms.');
