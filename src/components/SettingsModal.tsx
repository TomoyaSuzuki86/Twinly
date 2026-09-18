import * as DialogComponents from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "./ui/label";
import React, { useEffect, useState } from "react";
import type { User } from "firebase/auth";
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
import {
  formatSleepDuration,
  getDefaultActivityLimitMinutes,
  getDefaultSleepTargetHours,
} from "@/lib/sleep";
import { RotateCcw } from "lucide-react";
import { DailySummaryEmailSettings } from "./DailySummaryEmailSettings";

type SettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  app: AppState;
  premiumGaugesEnabled?: boolean;
  setApp: (updater: AppState | ((prev: AppState) => AppState)) => void;
  user: User | null;
  onSignIn: () => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
  pushPermission: NotificationPermission | "unsupported";
  pushSubscribed: boolean;
  pushBusy: boolean;
  webPushConfigured: boolean;
  onEnablePushNotifications: () => void | Promise<void>;
  onDisablePushNotifications: () => void | Promise<void>;
  wearPairingToken: string | null;
  wearPairingBusy: boolean;
  onCreateWearPairingToken: () => void | Promise<void>;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResetAll: () => void;
  onReplayTutorial?: () => void;
  appearance?: React.ReactNode;
  planAi?: React.ReactNode;
};

type ResetRequest = {
  babyId: BabyId;
  kind: "milkWindow" | "milkTarget" | "activityLimit" | "sleepTarget";
  label: string;
};

const BABY_DISPLAY_ORDER: readonly BabyId[] = ["A", "B"];

export const shouldDisablePushEnable = (
  pushBusy: boolean,
  pushSubscribed: boolean,
  webPushConfigured: boolean
) => pushBusy || pushSubscribed || !webPushConfigured;

export function SettingsModal({
  open,
  onOpenChange,
  app,
  premiumGaugesEnabled = false,
  setApp,
  user,
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
  const importRef = React.useRef<HTMLInputElement>(null);
  const [localProfiles, setLocalProfiles] = useState<Record<BabyId, BabyProfile>>(() => app.profiles);
  const [localDiaperStockManagementEnabled, setLocalDiaperStockManagementEnabled] = useState(
    () => app.diaperStockManagementEnabled
  );
  const [localSleepManagementEnabled, setLocalSleepManagementEnabled] = useState(
    () => app.sleepManagementEnabled
  );
  const [resetRequest, setResetRequest] = useState<ResetRequest | null>(null);
  const [copiedGaugeFrom, setCopiedGaugeFrom] = useState<BabyId | null>(null);

  useEffect(() => {
    if (open) {
      setLocalProfiles(app.profiles);
      setLocalDiaperStockManagementEnabled(app.diaperStockManagementEnabled);
      setLocalSleepManagementEnabled(app.sleepManagementEnabled);
      setResetRequest(null);
      setCopiedGaugeFrom(null);
    }
  }, [open, app.profiles, app.diaperStockManagementEnabled, app.sleepManagementEnabled]);

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
    handleProfileChange(babyId, field, value);
    setCopiedGaugeFrom(null);
  };

  const copyGaugeSettingsToOtherBaby = (sourceBabyId: BabyId) => {
    const targetBabyId: BabyId = sourceBabyId === "A" ? "B" : "A";
    setLocalProfiles((prev) => ({
      ...prev,
      [targetBabyId]: {
        ...prev[targetBabyId],
        milkGaugeWindowHours: prev[sourceBabyId].milkGaugeWindowHours,
        milkTargetMlOverride: prev[sourceBabyId].milkTargetMlOverride,
        activityLimitMinutesOverride: prev[sourceBabyId].activityLimitMinutesOverride,
        sleepTargetHoursOverride: prev[sourceBabyId].sleepTargetHoursOverride,
      },
    }));
    setCopiedGaugeFrom(sourceBabyId);
  };

  const handleDiaperStockChange = (size: string, amount: number) => {
    setLocalProfiles((prev) => {
      const nextProfiles = { ...prev };
      const currentStock = nextProfiles.A.diaperStockBySize[size] ?? 0;
      const nextStock = Math.max(0, currentStock + amount);

      (Object.keys(nextProfiles) as BabyId[]).forEach((babyId) => {
        nextProfiles[babyId] = {
          ...nextProfiles[babyId],
          diaperStockBySize: {
            ...nextProfiles[babyId].diaperStockBySize,
            [size]: nextStock,
          },
        };
      });

      return nextProfiles;
    });
  };

  const handleClose = (isOpen: boolean) => {
    if (
      !isOpen &&
      (JSON.stringify(localProfiles) !== JSON.stringify(app.profiles) ||
        localDiaperStockManagementEnabled !== app.diaperStockManagementEnabled ||
        localSleepManagementEnabled !== app.sleepManagementEnabled)
    ) {
      setApp((prev) => ({
        ...prev,
        profiles: localProfiles,
        diaperStockManagementEnabled: localDiaperStockManagementEnabled,
        sleepManagementEnabled: localSleepManagementEnabled,
      }));
    }
    onOpenChange(isOpen);
  };

  const handleConfirmReset = () => {
    if (!resetRequest) return;
    if (resetRequest.kind === "milkWindow") {
      handleProfileChange(resetRequest.babyId, "milkGaugeWindowHours", 3);
    } else if (resetRequest.kind === "milkTarget") {
      handleProfileChange(resetRequest.babyId, "milkTargetMlOverride", null);
    } else if (resetRequest.kind === "activityLimit") {
      handleProfileChange(resetRequest.babyId, "activityLimitMinutesOverride", null);
    } else {
      handleProfileChange(resetRequest.babyId, "sleepTargetHoursOverride", null);
    }
    setResetRequest(null);
  };

  const embeddedPlan = React.isValidElement<{ embedded?: boolean }>(planAi)
    ? React.cloneElement(planAi, { embedded: true })
    : planAi;

  return (
    <>
      <DialogComponents.Dialog open={open} onOpenChange={handleClose}>
        <DialogComponents.DialogContent className="max-h-[90vh] overflow-y-auto p-4 sm:max-w-lg">
          <DialogComponents.DialogHeader>
            <DialogComponents.DialogTitle>設定</DialogComponents.DialogTitle>
            <DialogComponents.DialogDescription>
              {premiumGaugesEnabled
                ? "プロフィール、お世話ゲージ、通知、データ、デザイン、料金とプランをまとめて管理できます。"
                : "プロフィール、データ、デザイン、料金とプランをまとめて管理できます。"}
            </DialogComponents.DialogDescription>
          </DialogComponents.DialogHeader>
          {onReplayTutorial && <Button variant="outline" className="w-full" onClick={onReplayTutorial}>使い方をもう一度見る</Button>}

          <Tabs defaultValue="profile" className="py-4">
            <TabsList className="flex flex-wrap justify-between">
              <TabsTrigger value="profile">プロフィール</TabsTrigger>
              {premiumGaugesEnabled ? <TabsTrigger value="care-gauges">お世話ゲージ</TabsTrigger> : null}
              {premiumGaugesEnabled ? <TabsTrigger value="notifications">通知</TabsTrigger> : null}
              <TabsTrigger value="data">データ管理</TabsTrigger>
              <TabsTrigger value="design">デザイン</TabsTrigger>
              <TabsTrigger value="premium">料金とプラン</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-4">
              <div className="grid gap-6 md:grid-cols-2">
                {BABY_DISPLAY_ORDER.map((babyId) => {
                  const profile = localProfiles[babyId];

                  return (
                    <div key={babyId} className="space-y-4 rounded-lg border p-4">
                      <h3 className="font-semibold">赤ちゃん {babyId}</h3>

                      <div className="space-y-2">
                        <Label>表示名</Label>
                        <Input
                          value={profile.displayName}
                          onChange={(e) => handleProfileChange(babyId, "displayName", e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>アイコン絵文字</Label>
                        <Input
                          maxLength={2}
                          value={profile.iconEmoji ?? ""}
                          onChange={(e) => handleProfileChange(babyId, "iconEmoji", e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>アイコンカラー</Label>
                        <Select
                          value={profile.iconGradient ?? ""}
                          onValueChange={(value) => handleProfileChange(babyId, "iconGradient", value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="アイコンカラーを選択" />
                          </SelectTrigger>
                          <SelectContent>
                            {iconGradients.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                <div className="flex items-center gap-2">
                                  <span className={`h-4 w-4 rounded-full ${option.bgColor}`} />
                                  {option.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>生年月日</Label>
                        <Input
                          type="date"
                          value={profile.birthDate}
                          onChange={(e) => handleProfileChange(babyId, "birthDate", e.target.value)}
                        />
                      </div>

                      {localDiaperStockManagementEnabled ? (
                        <div className="space-y-2">
                          <Label>おむつ購入リンク</Label>
                          <Input
                            value={profile.diaperPurchaseUrl ?? ""}
                            onChange={(e) => handleProfileChange(babyId, "diaperPurchaseUrl", e.target.value)}
                            placeholder="https://..."
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {premiumGaugesEnabled ? (
              <TabsContent value="care-gauges" className="mt-4 space-y-4">
                <div className="rounded-lg border bg-background/40 p-4">
                  <h3 className="font-semibold">お世話ゲージ</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    難しい数値ではなく、実際のお世話の目安として調整できます。変更内容はホームのゲージに反映されます。
                  </p>
                </div>

                {BABY_DISPLAY_ORDER.map((babyId) => {
                  const profile = localProfiles[babyId];
                  const otherBabyId: BabyId = babyId === "A" ? "B" : "A";
                  const babyName = profile.displayName || `赤ちゃん ${babyId}`;
                  const otherBabyName = localProfiles[otherBabyId].displayName || `赤ちゃん ${otherBabyId}`;
                  const calculatedMilkTarget = buildMilkGauge({
                    events: app.events,
                    babyId,
                    now: new Date(),
                    windowHours: profile.milkGaugeWindowHours ?? 3,
                    targetMilkMlOverride: null,
                  })?.targetMilkMl;
                  const autoMilkTarget = calculatedMilkTarget ? Math.round(calculatedMilkTarget) : null;
                  const milkTarget = profile.milkTargetMlOverride ?? autoMilkTarget;
                  const milkWindowHours = profile.milkGaugeWindowHours ?? 3;
                  const defaultActivityLimitMinutes = getDefaultActivityLimitMinutes(profile.birthDate, new Date());
                  const defaultSleepTargetHours = getDefaultSleepTargetHours(profile.birthDate, new Date());
                  const activityLimitMinutes = profile.activityLimitMinutesOverride ?? defaultActivityLimitMinutes;
                  const sleepTargetHours = profile.sleepTargetHoursOverride ?? defaultSleepTargetHours;
                  const sleepUsesAgeDefaults =
                    profile.activityLimitMinutesOverride == null && profile.sleepTargetHoursOverride == null;

                  return (
                    <section key={babyId} className="space-y-4 rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {profile.iconEmoji ? <span aria-hidden>{profile.iconEmoji}</span> : null}
                            <h3 className="font-semibold">{babyName}</h3>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">ゲージを見たときの「次のお世話」の目安です。</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => copyGaugeSettingsToOtherBaby(babyId)}
                          aria-label={`${babyName}のお世話ゲージ設定を${otherBabyName}にも反映`}
                        >
                          もう1人にも反映
                        </Button>
                      </div>

                      {copiedGaugeFrom === babyId ? (
                        <p className="rounded-md bg-muted px-3 py-2 text-xs">
                          ✓ {otherBabyName}にも同じ設定を反映しました
                        </p>
                      ) : null}

                      <div className="space-y-4 rounded-xl border bg-background/50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h4 className="font-semibold">🍼 ミルク</h4>
                            <p className="text-xs text-muted-foreground">飲んだ量と経過時間から、次のミルクを見やすくします。</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <Label>1回の目安</Label>
                            <div className="flex gap-1 rounded-lg bg-muted p-1">
                              <Button
                                type="button"
                                size="sm"
                                variant={profile.milkTargetMlOverride == null ? "default" : "ghost"}
                                className="h-7 px-2 text-xs"
                                onClick={() => handleGaugeChange(babyId, "milkTargetMlOverride", null)}
                              >
                                おまかせ
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={profile.milkTargetMlOverride != null ? "default" : "ghost"}
                                className="h-7 px-2 text-xs"
                                disabled={milkTarget == null}
                                onClick={() =>
                                  handleGaugeChange(
                                    babyId,
                                    "milkTargetMlOverride",
                                    Math.max(1, Math.min(999, milkTarget ?? 1))
                                  )
                                }
                              >
                                カスタム
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={milkTarget == null}
                              aria-label={`${babyName}のミルク目安量を10ml減らす`}
                              onClick={() =>
                                handleGaugeChange(
                                  babyId,
                                  "milkTargetMlOverride",
                                  Math.max(1, (milkTarget ?? 10) - 10)
                                )
                              }
                            >
                              −
                            </Button>
                            <div className="rounded-lg border bg-background px-3 py-2 text-center">
                              <div className="text-lg font-semibold">
                                {milkTarget == null ? "自動計算中" : `${Math.round(milkTarget)} ml`}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {profile.milkTargetMlOverride == null ? "最近の記録から自動調整" : "カスタム設定"}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={milkTarget == null}
                              aria-label={`${babyName}のミルク目安量を10ml増やす`}
                              onClick={() =>
                                handleGaugeChange(
                                  babyId,
                                  "milkTargetMlOverride",
                                  Math.min(999, (milkTarget ?? 0) + 10)
                                )
                              }
                            >
                              ＋
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <Label>次のミルクまで</Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={milkWindowHours === 3}
                              onClick={() =>
                                setResetRequest({ babyId, kind: "milkWindow", label: "次のミルクまでの時間" })
                              }
                              aria-label="ミルクゲージの時間を初期値に戻す"
                            >
                              おすすめに戻す
                            </Button>
                          </div>
                          <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label={`${babyName}のミルク間隔を30分短くする`}
                              onClick={() =>
                                handleGaugeChange(
                                  babyId,
                                  "milkGaugeWindowHours",
                                  Math.max(0.5, Number((milkWindowHours - 0.5).toFixed(1)))
                                )
                              }
                            >
                              −
                            </Button>
                            <div className="rounded-lg border bg-background px-3 py-2 text-center">
                              <div className="text-lg font-semibold">
                                {formatSleepDuration(Math.round(milkWindowHours * 60))}
                              </div>
                              <div className="text-xs text-muted-foreground">おすすめは3時間</div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label={`${babyName}のミルク間隔を30分長くする`}
                              onClick={() =>
                                handleGaugeChange(
                                  babyId,
                                  "milkGaugeWindowHours",
                                  Math.min(12, Number((milkWindowHours + 0.5).toFixed(1)))
                                )
                              }
                            >
                              ＋
                            </Button>
                          </div>
                        </div>

                        <div className="rounded-lg bg-muted/60 p-3">
                          <div className="mb-2 h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full w-full rounded-full bg-primary" />
                          </div>
                          <p className="text-sm font-medium">
                            {milkTarget == null ? "記録がたまると1回量を自動で提案します" : `${Math.round(milkTarget)}mlで満タン`}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            約{formatSleepDuration(Math.round(milkWindowHours * 60))}でゲージが空になります
                          </p>
                        </div>
                      </div>

                      {localSleepManagementEnabled ? (
                        <div className="space-y-4 rounded-xl border bg-background/50 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="font-semibold">🌙 睡眠</h4>
                              <p className="text-xs text-muted-foreground">月齢に合わせた目安をそのまま使うことも、家庭に合わせて調整することもできます。</p>
                            </div>
                          </div>

                          <div className="flex gap-1 rounded-lg bg-muted p-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={sleepUsesAgeDefaults ? "default" : "ghost"}
                              className="flex-1"
                              onClick={() => {
                                handleGaugeChange(babyId, "activityLimitMinutesOverride", null);
                                handleGaugeChange(babyId, "sleepTargetHoursOverride", null);
                              }}
                            >
                              月齢に合わせる
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={!sleepUsesAgeDefaults ? "default" : "ghost"}
                              className="flex-1"
                              onClick={() => {
                                handleGaugeChange(
                                  babyId,
                                  "activityLimitMinutesOverride",
                                  activityLimitMinutes
                                );
                                handleGaugeChange(babyId, "sleepTargetHoursOverride", sleepTargetHours);
                              }}
                            >
                              カスタム
                            </Button>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <Label>起きていられる目安</Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={profile.activityLimitMinutesOverride == null}
                                onClick={() =>
                                  setResetRequest({ babyId, kind: "activityLimit", label: "起きていられる目安" })
                                }
                                aria-label="活動可能時間を初期値に戻す"
                              >
                                月齢目安に戻す
                              </Button>
                            </div>
                            <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label={`${babyName}の活動可能時間を10分短くする`}
                                onClick={() =>
                                  handleGaugeChange(
                                    babyId,
                                    "activityLimitMinutesOverride",
                                    Math.max(30, activityLimitMinutes - 10)
                                  )
                                }
                              >
                                −
                              </Button>
                              <div className="rounded-lg border bg-background px-3 py-2 text-center">
                                <div className="text-lg font-semibold">{formatSleepDuration(activityLimitMinutes)}</div>
                                <div className="text-xs text-muted-foreground">
                                  {profile.activityLimitMinutesOverride == null ? "月齢の目安" : "カスタム設定"}
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label={`${babyName}の活動可能時間を10分長くする`}
                                onClick={() =>
                                  handleGaugeChange(
                                    babyId,
                                    "activityLimitMinutesOverride",
                                    Math.min(720, activityLimitMinutes + 10)
                                  )
                                }
                              >
                                ＋
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <Label>1日の睡眠目安</Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={profile.sleepTargetHoursOverride == null}
                                onClick={() =>
                                  setResetRequest({ babyId, kind: "sleepTarget", label: "1日の睡眠目安" })
                                }
                                aria-label="必要睡眠時間を初期値に戻す"
                              >
                                月齢目安に戻す
                              </Button>
                            </div>
                            <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label={`${babyName}の1日の睡眠目安を30分短くする`}
                                onClick={() =>
                                  handleGaugeChange(
                                    babyId,
                                    "sleepTargetHoursOverride",
                                    Math.max(1, Number((sleepTargetHours - 0.5).toFixed(1)))
                                  )
                                }
                              >
                                −
                              </Button>
                              <div className="rounded-lg border bg-background px-3 py-2 text-center">
                                <div className="text-lg font-semibold">{formatSleepDuration(Math.round(sleepTargetHours * 60))}</div>
                                <div className="text-xs text-muted-foreground">
                                  {profile.sleepTargetHoursOverride == null ? "月齢の目安" : "カスタム設定"}
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label={`${babyName}の1日の睡眠目安を30分長くする`}
                                onClick={() =>
                                  handleGaugeChange(
                                    babyId,
                                    "sleepTargetHoursOverride",
                                    Math.min(24, Number((sleepTargetHours + 0.5).toFixed(1)))
                                  )
                                }
                              >
                                ＋
                              </Button>
                            </div>
                          </div>

                          <div className="rounded-lg bg-muted/60 p-3 text-sm">
                            <p>起床から約{formatSleepDuration(activityLimitMinutes)}で活動ゲージが空になります。</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              1日の睡眠目標は{formatSleepDuration(Math.round(sleepTargetHours * 60))}です。
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                          睡眠管理がオフです。データ管理からオンにすると睡眠ゲージを調整できます。
                        </div>
                      )}
                    </section>
                  );
                })}
              </TabsContent>
            ) : null}

            {premiumGaugesEnabled ? (
              <TabsContent value="notifications" className="mt-4 space-y-4">
                <div className="space-y-4 rounded-lg border p-4">
                  <div>
                    <h3 className="font-semibold">プッシュ通知</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      この端末への育児リマインド通知を管理します。
                    </p>
                  </div>
  
                  {user ? (
                    !webPushConfigured ? (
                      <p className="text-sm text-muted-foreground">
                        通知用の公開鍵が未設定のため、この端末ではまだ通知を有効化できません。
                      </p>
                    ) : pushPermission === "unsupported" ? (
                      <p className="text-sm text-muted-foreground">
                        この端末・ブラウザでは PWA のプッシュ通知に対応していません。
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground">
                          ミルク・おむつのゲージが空になると通知します。通知時刻が15分以内ならまとめて1通にします。
                        </p>
                        <p className="text-sm text-muted-foreground">
                          状態:{" "}
                          {pushSubscribed && pushPermission === "granted"
                            ? "有効"
                            : pushPermission === "denied"
                            ? "ブラウザで拒否されています"
                            : "未設定"}
                        </p>
                        <div className="flex gap-3">
                          <Button
                            onClick={onEnablePushNotifications}
                            disabled={shouldDisablePushEnable(pushBusy, pushSubscribed, webPushConfigured)}
                          >
                            通知を有効化
                          </Button>
                          <Button
                            variant="outline"
                            onClick={onDisablePushNotifications}
                            disabled={pushBusy || !pushSubscribed}
                          >
                            通知を解除
                          </Button>
                        </div>
                      </>
                    )
                  ) : (
                    <Button onClick={onSignIn}>ログイン画面を開く</Button>
                  )}
                </div>
  
                {user ? <DailySummaryEmailSettings /> : null}
              </TabsContent>
            ) : null}

            <TabsContent value="data" className="mt-4 space-y-4">
              <section className="space-y-4 rounded-lg border p-4">
                <div>
                  <h3 className="font-semibold">記録機能</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    ホーム画面で使う記録機能と在庫管理を切り替えます。
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border bg-background/50 p-3">
                  <div>
                    <div className="text-sm font-semibold">睡眠管理</div>
                    <div className="text-xs text-muted-foreground">
                      オフにするとホーム画面の睡眠記録ボタンを隠します。
                    </div>
                  </div>
                  <Button
                    aria-label="睡眠管理を切り替え"
                    variant={localSleepManagementEnabled ? "default" : "outline"}
                    onClick={() => setLocalSleepManagementEnabled((enabled) => !enabled)}
                  >
                    {localSleepManagementEnabled ? "オン" : "オフ"}
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border bg-background/50 p-3">
                  <div>
                    <div className="text-sm font-semibold">おむつ在庫管理</div>
                    <div className="text-xs text-muted-foreground">
                      オフにすると在庫数・サイズ・購入リンクの入力を隠します。
                    </div>
                  </div>
                  <Button
                    aria-label="おむつ在庫管理を切り替え"
                    variant={localDiaperStockManagementEnabled ? "default" : "outline"}
                    onClick={() => setLocalDiaperStockManagementEnabled((enabled) => !enabled)}
                  >
                    {localDiaperStockManagementEnabled ? "オン" : "オフ"}
                  </Button>
                </div>

                {localDiaperStockManagementEnabled ? (
                  <div className="space-y-4 rounded-lg border bg-background/30 p-3">
                    <div>
                      <h4 className="text-sm font-semibold">おむつ在庫</h4>
                      <p className="text-xs text-muted-foreground">
                        サイズごとの在庫は2人で共有されます。
                      </p>
                    </div>
                    {Object.keys(localProfiles.A.diaperStockBySize).map((size) => (
                      <div key={size} className="flex items-center gap-2 sm:gap-3">
                        <Label className="w-16 flex-shrink-0">{size}</Label>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleDiaperStockChange(size, -10)}
                          className="h-9 w-9"
                        >
                          -10
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleDiaperStockChange(size, -1)}
                          className="h-9 w-9"
                        >
                          -1
                        </Button>
                        <Input
                          aria-label={`${size}のおむつ在庫`}
                          type="number"
                          value={localProfiles.A.diaperStockBySize[size] ?? 0}
                          onChange={(e) =>
                            handleDiaperStockChange(
                              size,
                              Number(e.target.value) - (localProfiles.A.diaperStockBySize[size] ?? 0)
                            )
                          }
                          className="min-w-0 flex-1 text-center text-base"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleDiaperStockChange(size, 1)}
                          className="h-9 w-9"
                        >
                          +1
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleDiaperStockChange(size, 10)}
                          className="h-9 w-9"
                        >
                          +10
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="space-y-4 rounded-lg border p-4">
                <div>
                  <h3 className="font-semibold">バックアップ</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    現在のデータを JSON で書き出したり、バックアップから復元できます。
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={onExport}>
                    エクスポート
                  </Button>
                  <Button variant="outline" onClick={() => importRef.current?.click()}>
                    インポート
                  </Button>
                  <input type="file" accept=".json" ref={importRef} className="hidden" onChange={onImport} />
                </div>
              </section>

              <section className="space-y-3 rounded-lg border border-destructive/30 p-4">
                <h3 className="font-semibold">データ削除</h3>
                <p className="text-sm text-muted-foreground">Twinlyの記録をすべて初期化します。</p>
                <Button variant="destructive" onClick={onResetAll}>
                  すべてのデータを削除
                </Button>
              </section>
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
    </>
  );
}
