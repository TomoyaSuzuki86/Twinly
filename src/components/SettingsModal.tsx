import * as DialogComponents from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "./ui/label";
import React, { useEffect, useState } from "react";
import { AppState, BabyId, BabyProfile } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { iconGradients } from "@/lib/utils";
import { buildMilkGauge } from "@/lib/care-gauges";
import { adjustSharedDiaperStock } from "@/lib/diaper-stock";
import {
  applyGaugeProfiles,
  BABY_DISPLAY_ORDER,
  copyGaugeSettings,
  gaugeProfileSnapshot,
  gaugeProfilesEqual,
  setSleepCustomValue,
  setSleepGaugeMode,
} from "@/lib/settings-gauge-policy";
import {
  formatSleepDuration,
  getDefaultActivityLimitMinutes,
  getDefaultSleepTargetHours,
} from "@/lib/sleep";
import { SettingsProfileTab } from "./SettingsProfileTab";
import { SettingsNotificationsTab } from "./SettingsNotificationsTab";
import { SettingsDataTab } from "./SettingsDataTab";
import { SettingsCareGaugesTab, type GaugeResetRequest } from "./SettingsCareGaugesTab";
export { shouldDisablePushEnable } from "./SettingsNotificationsTab";

type SettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  app: AppState;
  premiumGaugesEnabled?: boolean;
  setApp: (updater: AppState | ((prev: AppState) => AppState)) => void;
  signedIn: boolean;
  onSignIn: () => void | Promise<void>;
  pushPermission: NotificationPermission | "unsupported";
  pushSubscribed: boolean;
  pushBusy: boolean;
  webPushConfigured: boolean;
  onEnablePushNotifications: () => void | Promise<void>;
  onDisablePushNotifications: () => void | Promise<void>;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResetAll: () => void;
  onReplayTutorial?: () => void;
  appearance?: React.ReactNode;
  planAi?: React.ReactNode;
};

type PendingGaugeExit =
  | { type: "tab"; value: string }
  | { type: "close" };

export function SettingsModal({
  open,
  onOpenChange,
  app,
  premiumGaugesEnabled = false,
  setApp,
  signedIn,
  onSignIn,
  pushPermission,
  pushSubscribed,
  pushBusy,
  webPushConfigured,
  onEnablePushNotifications,
  onDisablePushNotifications,
  onExport,
  onImport,
  onResetAll,
  onReplayTutorial,
  appearance,
  planAi,
}: SettingsModalProps) {
  const [localProfiles, setLocalProfiles] = useState<Record<BabyId, BabyProfile>>(() => app.profiles);
  const [localDiaperStockManagementEnabled, setLocalDiaperStockManagementEnabled] = useState(
    () => app.diaperStockManagementEnabled
  );
  const [localSleepManagementEnabled, setLocalSleepManagementEnabled] = useState(
    () => app.sleepManagementEnabled
  );
  const [resetRequest, setResetRequest] = useState<GaugeResetRequest | null>(null);
  const [copiedGaugeFrom, setCopiedGaugeFrom] = useState<BabyId | null>(null);
  const [activeTab, setActiveTab] = useState("profile");
  const [gaugeDraftProfiles, setGaugeDraftProfiles] = useState<Record<BabyId, BabyProfile>>(() => app.profiles);
  const [savedGaugeProfiles, setSavedGaugeProfiles] = useState<Record<BabyId, BabyProfile>>(() => app.profiles);
  const [pendingGaugeExit, setPendingGaugeExit] = useState<PendingGaugeExit | null>(null);
  const [gaugeSavedNotice, setGaugeSavedNotice] = useState(false);
  const wasOpenRef = React.useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setLocalProfiles(app.profiles);
      setGaugeDraftProfiles(app.profiles);
      setSavedGaugeProfiles(app.profiles);
      setLocalDiaperStockManagementEnabled(app.diaperStockManagementEnabled);
      setLocalSleepManagementEnabled(app.sleepManagementEnabled);
      setResetRequest(null);
      setCopiedGaugeFrom(null);
      setPendingGaugeExit(null);
      setGaugeSavedNotice(false);
      setActiveTab("profile");
    }
    wasOpenRef.current = open;
  }, [open, app.profiles, app.diaperStockManagementEnabled, app.sleepManagementEnabled]);

  const hasUnsavedGaugeChanges = !gaugeProfilesEqual(gaugeDraftProfiles, savedGaugeProfiles);

  const handleProfileChange = <K extends keyof BabyProfile>(babyId: BabyId, field: K, value: BabyProfile[K]) => {
    setLocalProfiles((prev) => ({
      ...prev,
      [babyId]: {
        ...prev[babyId],
        [field]: value,
      },
    }));
  };

  const handleGaugeChange = <K extends keyof BabyProfile>(babyId: BabyId, field: K, value: BabyProfile[K]) => {
    setGaugeDraftProfiles((prev) => ({
      ...prev,
      [babyId]: {
        ...prev[babyId],
        [field]: value,
      },
    }));
    setCopiedGaugeFrom(null);
    setGaugeSavedNotice(false);
  };

  const handleSleepCustomChange = (
    babyId: BabyId,
    kind: "activity" | "sleep",
    value: number
  ) => {
    setGaugeDraftProfiles((prev) => setSleepCustomValue(prev, babyId, kind, value));
    setCopiedGaugeFrom(null);
    setGaugeSavedNotice(false);
  };

  const handleSleepModeChange = (
    babyId: BabyId,
    mode: "age" | "custom",
    defaultActivityLimitMinutes: number,
    defaultSleepTargetHours: number
  ) => {
    setGaugeDraftProfiles((prev) =>
      setSleepGaugeMode(
        prev,
        babyId,
        mode,
        defaultActivityLimitMinutes,
        defaultSleepTargetHours
      )
    );
    setCopiedGaugeFrom(null);
    setGaugeSavedNotice(false);
  };

  const copyGaugeSettingsToOtherBaby = (sourceBabyId: BabyId) => {
    setGaugeDraftProfiles((prev) => copyGaugeSettings(prev, sourceBabyId));
    setCopiedGaugeFrom(sourceBabyId);
    setGaugeSavedNotice(false);
  };

  const handleDiaperStockChange = (size: string, amount: number) => {
    setLocalProfiles((prev) => adjustSharedDiaperStock(prev, size, amount));
  };

  const finalizeClose = () => {
    if (
      JSON.stringify(localProfiles) !== JSON.stringify(app.profiles) ||
      localDiaperStockManagementEnabled !== app.diaperStockManagementEnabled ||
      localSleepManagementEnabled !== app.sleepManagementEnabled
    ) {
      setApp((prev) => ({
        ...prev,
        profiles: localProfiles,
        diaperStockManagementEnabled: localDiaperStockManagementEnabled,
        sleepManagementEnabled: localSleepManagementEnabled,
      }));
    }
    onOpenChange(false);
  };

  const handleDialogOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      onOpenChange(true);
      return;
    }
    if (hasUnsavedGaugeChanges) {
      setPendingGaugeExit({ type: "close" });
      return;
    }
    finalizeClose();
  };

  const handleTabChange = (value: string) => {
    if (activeTab === "care-gauges" && value !== "care-gauges" && hasUnsavedGaugeChanges) {
      setPendingGaugeExit({ type: "tab", value });
      return;
    }
    setActiveTab(value);
  };

  const handleSaveGaugeSettings = () => {
    const nextLocalProfiles = applyGaugeProfiles(localProfiles, gaugeDraftProfiles);
    setLocalProfiles(nextLocalProfiles);
    setSavedGaugeProfiles(gaugeDraftProfiles);
    setApp((prev) => ({
      ...prev,
      profiles: applyGaugeProfiles(prev.profiles, gaugeDraftProfiles),
    }));
    setGaugeSavedNotice(true);
  };

  const handleRestoreSavedGaugeSettings = () => {
    setGaugeDraftProfiles(savedGaugeProfiles);
    setCopiedGaugeFrom(null);
    setGaugeSavedNotice(false);
  };

  const discardGaugeChangesAndContinue = () => {
    const pending = pendingGaugeExit;
    setGaugeDraftProfiles(savedGaugeProfiles);
    setCopiedGaugeFrom(null);
    setGaugeSavedNotice(false);
    setPendingGaugeExit(null);
    if (pending?.type === "tab") {
      setActiveTab(pending.value);
    } else if (pending?.type === "close") {
      finalizeClose();
    }
  };

  const handleConfirmReset = () => {
    if (!resetRequest) return;
    if (resetRequest.kind === "milkWindow") {
      handleGaugeChange(resetRequest.babyId, "milkGaugeWindowHours", 3);
    } else if (resetRequest.kind === "milkTarget") {
      handleGaugeChange(resetRequest.babyId, "milkTargetMlOverride", null);
    } else if (resetRequest.kind === "diaperWindow") {
      handleGaugeChange(resetRequest.babyId, "diaperGaugeWindowMinutes", 120);
    } else if (resetRequest.kind === "activityLimit") {
      setGaugeDraftProfiles((prev) => ({
        ...prev,
        [resetRequest.babyId]: {
          ...prev[resetRequest.babyId],
          activityLimitMinutesCustom:
            prev[resetRequest.babyId].activityLimitMinutesOverride ??
            prev[resetRequest.babyId].activityLimitMinutesCustom,
          activityLimitMinutesOverride: null,
        },
      }));
      setGaugeSavedNotice(false);
    } else {
      setGaugeDraftProfiles((prev) => ({
        ...prev,
        [resetRequest.babyId]: {
          ...prev[resetRequest.babyId],
          sleepTargetHoursCustom:
            prev[resetRequest.babyId].sleepTargetHoursOverride ??
            prev[resetRequest.babyId].sleepTargetHoursCustom,
          sleepTargetHoursOverride: null,
        },
      }));
      setGaugeSavedNotice(false);
    }
    setResetRequest(null);
  };

  const embeddedPlan = React.isValidElement<{ embedded?: boolean }>(planAi)
    ? React.cloneElement(planAi, { embedded: true })
    : planAi;

  return (
    <>
      <DialogComponents.Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogComponents.DialogContent className="max-h-[90vh] overflow-y-auto p-4 sm:max-w-lg">
          <DialogComponents.DialogHeader>
            <DialogComponents.DialogTitle>設定</DialogComponents.DialogTitle>
            <DialogComponents.DialogDescription>
              {premiumGaugesEnabled
                ? "プロフィール、お世話ゲージ、通知、データ、デザイン、料金とプランをまとめて管理できます。"
                : "プロフィール、お世話ゲージ、データ、デザイン、料金とプランをまとめて管理できます。"}
            </DialogComponents.DialogDescription>
          </DialogComponents.DialogHeader>
          {onReplayTutorial && <Button variant="outline" className="w-full" onClick={onReplayTutorial}>使い方をもう一度見る</Button>}

          <Tabs value={activeTab} onValueChange={handleTabChange} className="py-4">
            <TabsList className="flex flex-wrap justify-between">
              <TabsTrigger value="profile">プロフィール</TabsTrigger>
              <TabsTrigger value="care-gauges">お世話ゲージ</TabsTrigger>
              {premiumGaugesEnabled ? <TabsTrigger value="notifications">通知</TabsTrigger> : null}
              <TabsTrigger value="data">データ管理</TabsTrigger>
              <TabsTrigger value="design">デザイン</TabsTrigger>
              <TabsTrigger value="premium">料金とプラン</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-4">
              <SettingsProfileTab
                profiles={localProfiles}
                diaperStockManagementEnabled={localDiaperStockManagementEnabled}
                onProfileChange={handleProfileChange}
              />
            </TabsContent>

            <TabsContent value="care-gauges" className=            <TabsContent value="care-gauges" className="mt-4 space-y-4">
              <SettingsCareGaugesTab
                premiumGaugesEnabled={premiumGaugesEnabled}
                events={app.events}
                gaugeDraftProfiles={gaugeDraftProfiles}
                localProfiles={localProfiles}
                localSleepManagementEnabled={localSleepManagementEnabled}
                copiedGaugeFrom={copiedGaugeFrom}
                gaugeSavedNotice={gaugeSavedNotice}
                hasUnsavedGaugeChanges={hasUnsavedGaugeChanges}
                onGaugeChange={handleGaugeChange}
                onSleepCustomChange={handleSleepCustomChange}
                onSleepModeChange={handleSleepModeChange}
                onCopyGaugeSettingsToOtherBaby={copyGaugeSettingsToOtherBaby}
                onResetRequest={setResetRequest}
                onRestoreSavedGaugeSettings={handleRestoreSavedGaugeSettings}
                onSaveGaugeSettings={handleSaveGaugeSettings}
              />
            </TabsContent>TabsContent value="notifications" className="mt-4 space-y-4">
                <SettingsNotificationsTab
                  signedIn={signedIn}
                  webPushConfigured={webPushConfigured}
                  pushPermission={pushPermission}
                  pushSubscribed={pushSubscribed}
                  pushBusy={pushBusy}
                  onEnablePushNotifications={onEnablePushNotifications}
                  onDisablePushNotifications={onDisablePushNotifications}
                  onSignIn={onSignIn}
                />
              </TabsContent>
            ) : null}

            <TabsContent value="data" className="mt-4 space-y-4">
              <SettingsDataTab
                profiles={localProfiles}
                sleepManagementEnabled={localSleepManagementEnabled}
                setSleepManagementEnabled={setLocalSleepManagementEnabled}
                diaperStockManagementEnabled={localDiaperStockManagementEnabled}
                setDiaperStockManagementEnabled={setLocalDiaperStockManagementEnabled}
                onDiaperStockChange={handleDiaperStockChange}
                onExport={onExport}
                onImport={onImport}
                onResetAll={onResetAll}
              />
            </TabsContent>

            <TabsContent value="design" className="mt-4">
              {appearance}
            </TabsContent>

            <TabsContent value="premium" className="mt-4">
              {embeddedPlan}
            </TabsContent>
          </Tabs>

          <DialogComponents.DialogFooter>
            <DialogComponents.DialogClose asChild>
              <Button variant="outline">閉じる</Button>
            </DialogComponents.DialogClose>
          </DialogComponents.DialogFooter>
        </DialogComponents.DialogContent>
      </DialogComponents.Dialog>

      <DialogComponents.Dialog
        open={Boolean(resetRequest)}
        onOpenChange={(isOpen) => !isOpen && setResetRequest(null)}
      >
        <DialogComponents.DialogContent className="sm:max-w-sm">
          <DialogComponents.DialogHeader>
            <DialogComponents.DialogTitle>初期値に戻しますか？</DialogComponents.DialogTitle>
            <DialogComponents.DialogDescription>
              {resetRequest?.label ?? "設定値"}を初期値に戻します。現在の入力内容は失われます。
            </DialogComponents.DialogDescription>
          </DialogComponents.DialogHeader>
          <DialogComponents.DialogFooter>
            <DialogComponents.DialogClose asChild>
              <Button variant="ghost">キャンセル</Button>
            </DialogComponents.DialogClose>
            <Button onClick={handleConfirmReset}>OK</Button>
          </DialogComponents.DialogFooter>
        </DialogComponents.DialogContent>
      </DialogComponents.Dialog>

      <DialogComponents.Dialog
        open={Boolean(pendingGaugeExit)}
        onOpenChange={(isOpen) => !isOpen && setPendingGaugeExit(null)}
      >
        <DialogComponents.DialogContent className="sm:max-w-sm">
          <DialogComponents.DialogHeader>
            <DialogComponents.DialogTitle>お世話ゲージに編集中の値があります</DialogComponents.DialogTitle>
            <DialogComponents.DialogDescription>
              保存していない変更があります。保存せずに
              {pendingGaugeExit?.type === "tab" ? "別のタブへ移動" : "設定画面を閉じる"}
              と、最後に保存した設定に戻ります。
            </DialogComponents.DialogDescription>
          </DialogComponents.DialogHeader>
          <DialogComponents.DialogFooter>
            <Button variant="ghost" onClick={() => setPendingGaugeExit(null)}>
              編集を続ける
            </Button>
            <Button variant="destructive" onClick={discardGaugeChangesAndContinue}>
              保存せずに{pendingGaugeExit?.type === "tab" ? "移動" : "閉じる"}
            </Button>
          </DialogComponents.DialogFooter>
        </DialogComponents.DialogContent>
      </DialogComponents.Dialog>
    </>
  );
}