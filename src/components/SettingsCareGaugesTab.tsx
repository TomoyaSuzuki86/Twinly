import type { BabyId, BabyProfile, LogEvent } from "@/types";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { iconGradients } from "@/lib/utils";
import { formatSleepDuration } from "@/lib/sleep";
import { BABY_DISPLAY_ORDER, buildCareGaugeSettingsModel } from "@/lib/settings-gauge-policy";

export type GaugeResetRequest = {
  babyId: BabyId;
  kind: "milkWindow" | "milkTarget" | "diaperWindow" | "activityLimit" | "sleepTarget";
  label: string;
};

type GaugeChange = <K extends keyof BabyProfile>(
  babyId: BabyId,
  field: K,
  value: BabyProfile[K]
) => void;

export function SettingsCareGaugesTab({
  premiumGaugesEnabled,
  events,
  gaugeDraftProfiles,
  localProfiles,
  localSleepManagementEnabled,
  copiedGaugeFrom,
  gaugeSavedNotice,
  hasUnsavedGaugeChanges,
  onGaugeChange,
  onSleepCustomChange,
  onSleepModeChange,
  onCopyGaugeSettingsToOtherBaby,
  onResetRequest,
  onRestoreSavedGaugeSettings,
  onSaveGaugeSettings,
}: {
  premiumGaugesEnabled: boolean;
  events: LogEvent[];
  gaugeDraftProfiles: Record<BabyId, BabyProfile>;
  localProfiles: Record<BabyId, BabyProfile>;
  localSleepManagementEnabled: boolean;
  copiedGaugeFrom: BabyId | null;
  gaugeSavedNotice: boolean;
  hasUnsavedGaugeChanges: boolean;
  onGaugeChange: GaugeChange;
  onSleepCustomChange: (babyId: BabyId, kind: "activity" | "sleep", value: number) => void;
  onSleepModeChange: (
    babyId: BabyId,
    mode: "age" | "custom",
    defaultActivityLimitMinutes: number,
    defaultSleepTargetHours: number
  ) => void;
  onCopyGaugeSettingsToOtherBaby: (babyId: BabyId) => void;
  onResetRequest: (request: GaugeResetRequest) => void;
  onRestoreSavedGaugeSettings: () => void;
  onSaveGaugeSettings: () => void;
}) {
  return (
    <>

                <div className="rounded-lg border bg-background/40 p-4">
                  <h3 className="font-semibold">お世話ゲージ</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    お世話ゲージはPremium専用機能です。{premiumGaugesEnabled
                      ? "ここでゲージの目安を調整できます。"
                      : "Freeでも設定は先に調整・保存でき、Premium利用時に反映されます。"}
                  </p>
                </div>

                {BABY_DISPLAY_ORDER.map((babyId) => {
                  const profile = gaugeDraftProfiles[babyId];
                  const displayProfile = localProfiles[babyId];
                  const otherBabyId: BabyId = babyId === "A" ? "B" : "A";
                  const babyName = displayProfile.displayName || `赤ちゃん ${babyId}`;
                  const otherBabyName = localProfiles[otherBabyId].displayName || `赤ちゃん ${otherBabyId}`;
                  const {
                    autoMilkTarget,
                    milkTarget,
                    milkWindowHours,
                    diaperWindowMinutes,
                    defaultActivityLimitMinutes,
                    defaultSleepTargetHours,
                    activityLimitMinutes,
                    sleepTargetHours,
                    sleepUsesAgeDefaults,
                  } = buildCareGaugeSettingsModel({
                    babyId,
                    profile,
                    displayProfile,
                    events,
                    now: new Date(),
                  });
                  const babyDimmedBgColor =
                    iconGradients.find((gradient) => gradient.value === displayProfile.iconGradient)?.dimmedBgColor ??
                    "bg-background";

                  return (
                    <section
                      key={babyId}
                      data-testid={`care-gauge-settings-${babyId}`}
                      className={`space-y-4 rounded-xl border border-border/60 p-4 ${babyDimmedBgColor}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {displayProfile.iconEmoji ? <span aria-hidden>{displayProfile.iconEmoji}</span> : null}
                            <h3 className="font-semibold">{babyName}</h3>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">ゲージを見たときの「次のお世話」の目安です。</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onCopyGaugeSettingsToOtherBaby(babyId)}
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
                            <p className="text-xs text-muted-foreground">ミルクを飲むとゲージが減り、時間がたつと少しずつ増えます。</p>
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
                                onClick={() => onGaugeChange(babyId, "milkTargetMlOverride", null)}
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
                                  onGaugeChange(
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
                                onGaugeChange(
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
                                onGaugeChange(
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
                                onResetRequest({ babyId, kind: "milkWindow", label: "次のミルクまでの時間" })
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
                                onGaugeChange(
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
                                onGaugeChange(
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
                          <p className="text-sm font-medium">
                            {milkTarget == null
                              ? "記録がたまると1回量を自動で提案します"
                              : `${Math.round(milkTarget)}mlを飲んだ直後はゲージが空になります`}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            設定時間内のミルク量と経過時間を反映し、飲まずに
                            {formatSleepDuration(Math.round(milkWindowHours * 60))}
                            たつとゲージが満タンになります。追加で飲むと、その分ゲージが減ります。
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4 rounded-xl border bg-background/50 p-4">
                        <div>
                          <h4 className="font-semibold">🧷 おむつ</h4>
                          <p className="text-xs text-muted-foreground">
                            おむつ交換の直後はゲージが空になり、時間がたつほど増えていきます。
                          </p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <Label>次のおむつチェックまで</Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={diaperWindowMinutes === 120}
                              onClick={() =>
                                onResetRequest({ babyId, kind: "diaperWindow", label: "次のおむつチェックまでの時間" })
                              }
                              aria-label="おむつゲージの時間を初期値に戻す"
                            >
                              おすすめに戻す
                            </Button>
                          </div>
                          <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label={`${babyName}のおむつ間隔を30分短くする`}
                              disabled={diaperWindowMinutes <= 30}
                              onClick={() =>
                                onGaugeChange(
                                  babyId,
                                  "diaperGaugeWindowMinutes",
                                  Math.max(30, diaperWindowMinutes - 30)
                                )
                              }
                            >
                              −
                            </Button>
                            <div className="rounded-lg border bg-background px-3 py-2 text-center">
                              <div className="text-lg font-semibold">{formatSleepDuration(diaperWindowMinutes)}</div>
                              <div className="text-xs text-muted-foreground">おすすめは2時間</div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label={`${babyName}のおむつ間隔を30分長くする`}
                              disabled={diaperWindowMinutes >= 720}
                              onClick={() =>
                                onGaugeChange(
                                  babyId,
                                  "diaperGaugeWindowMinutes",
                                  Math.min(720, diaperWindowMinutes + 30)
                                )
                              }
                            >
                              ＋
                            </Button>
                          </div>
                        </div>

                        <div className="rounded-lg bg-muted/60 p-3 text-sm">
                          <p>交換直後はゲージが空になります。</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            その後少しずつ増え、{formatSleepDuration(diaperWindowMinutes)}たつと満タンになります。
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
                              onClick={() =>
                                onSleepModeChange(
                                  babyId,
                                  "age",
                                  defaultActivityLimitMinutes,
                                  defaultSleepTargetHours
                                )
                              }
                            >
                              月齢に合わせる
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={!sleepUsesAgeDefaults ? "default" : "ghost"}
                              className="flex-1"
                              onClick={() =>
                                onSleepModeChange(
                                  babyId,
                                  "custom",
                                  defaultActivityLimitMinutes,
                                  defaultSleepTargetHours
                                )
                              }
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
                                  onResetRequest({ babyId, kind: "activityLimit", label: "起きていられる目安" })
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
                                  onSleepCustomChange(
                                    babyId,
                                    "activity",
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
                                  onSleepCustomChange(
                                    babyId,
                                    "activity",
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
                                  onResetRequest({ babyId, kind: "sleepTarget", label: "1日の睡眠目安" })
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
                                  onSleepCustomChange(
                                    babyId,
                                    "sleep",
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
                                  onSleepCustomChange(
                                    babyId,
                                    "sleep",
                                    Math.min(24, Number((sleepTargetHours + 0.5).toFixed(1)))
                                  )
                                }
                              >
                                ＋
                              </Button>
                            </div>
                          </div>

                          <div className="rounded-lg bg-muted/60 p-3 text-sm">
                            <p>起床から約{formatSleepDuration(activityLimitMinutes)}で活動ゲージが満タンになります。</p>
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
              <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
                <div className="min-w-0 text-xs text-muted-foreground">
                  {gaugeSavedNotice
                    ? "保存しました。"
                    : hasUnsavedGaugeChanges
                    ? "保存していない変更があります。"
                    : "保存済みの設定です。"}
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!hasUnsavedGaugeChanges}
                    onClick={onRestoreSavedGaugeSettings}
                  >
                    保存した設定に戻す
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!hasUnsavedGaugeChanges}
                    onClick={onSaveGaugeSettings}
                  >
                    保存
                  </Button>
                </div>
              </div>
    </>
  );
}
