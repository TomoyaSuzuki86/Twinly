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
  appearance?: React.ReactNode;
  planAi?: React.ReactNode;
};

const parseVoiceAliases = (value: string) =>
  value
    .split(/[\s,、]+/)
    .map((alias) => alias.trim())
    .filter(Boolean);

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

  useEffect(() => {
    if (open) {
      setLocalProfiles(app.profiles);
      setLocalDiaperStockManagementEnabled(app.diaperStockManagementEnabled);
      setLocalSleepManagementEnabled(app.sleepManagementEnabled);
      setResetRequest(null);
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
              プロフィール、通知、データ、デザイン、料金とプランをまとめて管理できます。
            </DialogComponents.DialogDescription>
          </DialogComponents.DialogHeader>

          <Tabs defaultValue="profile" className="py-4">
            <TabsList className="flex flex-wrap justify-between">
              <TabsTrigger value="profile">プロフィール</TabsTrigger>
              <TabsTrigger value="notifications">通知</TabsTrigger>
              <TabsTrigger value="data">データ管理</TabsTrigger>
              <TabsTrigger value="design">デザイン</TabsTrigger>
              <TabsTrigger value="premium">料金とプラン</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-4">
              <div className="grid gap-6 md:grid-cols-2">
                {BABY_DISPLAY_ORDER.map((babyId) => {
                  const profile = localProfiles[babyId];
                  const calculatedMilkTarget = buildMilkGauge({
                    events: app.events,
                    babyId,
                    now: new Date(),
                    windowHours: profile.milkGaugeWindowHours ?? 3,
                    targetMilkMlOverride: null,
                  })?.targetMilkMl;
                  const defaultActivityLimitMinutes = getDefaultActivityLimitMinutes(profile.birthDate, new Date());
                  const defaultSleepTargetHours = getDefaultSleepTargetHours(profile.birthDate, new Date());

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
                        <Label>音声入力名</Label>
                        <Input
                          value={(profile.voiceAliases ?? []).join(" ")}
                          onChange={(e) => handleProfileChange(babyId, "voiceAliases", parseVoiceAliases(e.target.value))}
                          placeholder="ひなた ひなちゃん"
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

                      <div className="space-y-2 rounded-lg border bg-background/40 p-3">
                        <Label htmlFor={`milk-window-${babyId}`}>ミルクゲージが空になる時間</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id={`milk-window-${babyId}`}
                            type="number"
                            min="0.5"
                            max="12"
                            step="0.5"
                            value={profile.milkGaugeWindowHours ?? 3}
                            onChange={(event) =>
                              handleProfileChange(
                                babyId,
                                "milkGaugeWindowHours",
                                Math.max(0.5, Math.min(12, Number(event.target.value) || 3))
                              )
                            }
                          />
                          <span className="text-sm text-muted-foreground">時間</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 flex-shrink-0"
                            disabled={(profile.milkGaugeWindowHours ?? 3) === 3}
                            onClick={() =>
                              setResetRequest({ babyId, kind: "milkWindow", label: "ミルクゲージの時間" })
                            }
                            aria-label="ミルクゲージの時間を初期値に戻す"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">初期値は3時間です。</p>
                      </div>

                      <div className="space-y-2 rounded-lg border bg-background/40 p-3">
                        <Label htmlFor={`milk-target-${babyId}`}>1回のミルク目安量</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id={`milk-target-${babyId}`}
                            type="number"
                            min="1"
                            max="999"
                            value={profile.milkTargetMlOverride ?? ""}
                            placeholder={calculatedMilkTarget ? `自動: ${Math.round(calculatedMilkTarget)}` : "自動計算"}
                            onChange={(event) =>
                              handleProfileChange(
                                babyId,
                                "milkTargetMlOverride",
                                event.target.value === ""
                                  ? null
                                  : Math.max(1, Math.min(999, Number(event.target.value)))
                              )
                            }
                          />
                          <span className="text-sm text-muted-foreground">ml</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 flex-shrink-0"
                            disabled={profile.milkTargetMlOverride == null}
                            onClick={() => setResetRequest({ babyId, kind: "milkTarget", label: "ミルク目安量" })}
                            aria-label="ミルク目安量を初期値に戻す"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {profile.milkTargetMlOverride == null
                            ? `自動計算${calculatedMilkTarget ? `: ${Math.round(calculatedMilkTarget)}ml` : "中"}`
                            : "手入力の値を使用中"}
                        </p>
                      </div>

                      {localSleepManagementEnabled ? (
                        <>
                          <div className="space-y-2 rounded-lg border bg-background/40 p-3">
                            <Label htmlFor={`activity-limit-${babyId}`}>活動可能時間</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                id={`activity-limit-${babyId}`}
                                type="number"
                                min="30"
                                max="720"
                                step="10"
                                value={profile.activityLimitMinutesOverride ?? ""}
                                placeholder={`月齢目安: ${defaultActivityLimitMinutes}`}
                                onChange={(event) =>
                                  handleProfileChange(
                                    babyId,
                                    "activityLimitMinutesOverride",
                                    event.target.value === ""
                                      ? null
                                      : Math.max(30, Math.min(720, Number(event.target.value)))
                                  )
                                }
                              />
                              <span className="text-sm text-muted-foreground">分</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 flex-shrink-0"
                                disabled={profile.activityLimitMinutesOverride == null}
                                onClick={() =>
                                  setResetRequest({ babyId, kind: "activityLimit", label: "活動可能時間" })
                                }
                                aria-label="活動可能時間を初期値に戻す"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {profile.activityLimitMinutesOverride == null
                                ? `月齢の目安を使用中: ${formatSleepDuration(defaultActivityLimitMinutes)}`
                                : "手入力の値を使用中"}
                            </p>
                          </div>

                          <div className="space-y-2 rounded-lg border bg-background/40 p-3">
                            <Label htmlFor={`sleep-target-${babyId}`}>1日の必要睡眠時間</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                id={`sleep-target-${babyId}`}
                                type="number"
                                min="1"
                                max="24"
                                step="0.5"
                                value={profile.sleepTargetHoursOverride ?? ""}
                                placeholder={`月齢目安: ${defaultSleepTargetHours}`}
                                onChange={(event) =>
                                  handleProfileChange(
                                    babyId,
                                    "sleepTargetHoursOverride",
                                    event.target.value === ""
                                      ? null
                                      : Math.max(1, Math.min(24, Number(event.target.value)))
                                  )
                                }
                              />
                              <span className="text-sm text-muted-foreground">時間</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 flex-shrink-0"
                                disabled={profile.sleepTargetHoursOverride == null}
                                onClick={() =>
                                  setResetRequest({ babyId, kind: "sleepTarget", label: "1日の必要睡眠時間" })
                                }
                                aria-label="必要睡眠時間を初期値に戻す"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {profile.sleepTargetHoursOverride == null
                                ? `月齢の目安を使用中: ${defaultSleepTargetHours}時間`
                                : "手入力の値を使用中"}
                            </p>
                          </div>
                        </>
                      ) : null}

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
