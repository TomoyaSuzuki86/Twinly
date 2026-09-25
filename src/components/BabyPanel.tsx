import {
  Milk,
  Droplets,
  Thermometer,
  Weight,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronsRight,
  Check,
  Ruler,
  FileText,
  ListPlus,
  Plus,
  CalendarRange,
  Utensils,
  Moon,
  Sun,
} from "lucide-react";
import { ReactNode, type Ref, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "./ui/input";
import { BabyId, BabyProfile, CustomMemoPreset, LogEvent } from "@/types";
import { DiaperStockEstimate } from "@/lib/diaper-stock";
import { MilkProgressComparison } from "@/lib/milk-progress";
import type { TutorialAnchorRefFactory } from "@/lib/tutorial-anchors";
import type { LayoutMode } from "@/lib/appearance-preferences";
import { PrimaryActionMorph } from "./PrimaryActionMorph";
import {
  adjustNumber,
} from "@/lib/baby-panel-presenters";
import { EventCard } from "./EventCard";
import { VoiceCommandButton } from "./VoiceCommandButton";
import { formatSleepDuration } from "@/lib/sleep";
import { buildBabyPanelViewModel } from "@/lib/baby-panel-view-model";
import { useBabyHealthInputs } from "@/lib/use-baby-health-inputs";
import { collapseExactRepeatedTranscript } from "@/lib/speech-transcript";

const SLEEP_LONG_PRESS_MS = 550;
const CUSTOM_MEMO_LONG_PRESS_MS = 550;
const SLEEP_TRANSITION_FEEDBACK_MS = 2000;

type BabyPanelProps = {
  profile: BabyProfile;
  events: LogEvent[];
  latestEvents?: LogEvent[];
  logEvents?: LogEvent[];
  logDateControls?: ReactNode;
  logDate?: string;
  now: Date;
  diaperStockManagementEnabled: boolean;
  sleepManagementEnabled: boolean;
  customMemoPresets?: CustomMemoPreset[];
  onAddCustomMemoPreset?: (emoji: string, text: string) => CustomMemoPreset | null;
  onDeleteCustomMemoPreset?: (id: string) => void;
  gaugesEnabled?: boolean;
  stockForecastEnabled?: boolean;
  lowStock: { size: string; remaining: number } | null;
  diaperEstimate: DiaperStockEstimate | null;
  milkProgress: MilkProgressComparison | null;
  onOpenHistory: (type: "milk" | "diaper" | "sleep", babyId: BabyId) => void;
  onOpenModal: (
    kind: "milk" | "diaper" | "edit",
    payload: { babyId: BabyId } | { eventId: string }
  ) => void;
  onAddEvent: (
    event: Omit<LogEvent, "id" | "timestamp" | "createdByUid" | "updatedByUid" | "createdAt" | "updatedAt">
  ) => boolean | void;
  onOpenSleepTimeEditor: (payload: {
    babyId: BabyId;
    type: "sleepStart" | "wake";
  }) => void;
  onOpenDailyReport: () => void;
  onOpenHealthChart: () => void;
  onOpenTimeline: () => void;
  onVoiceMessage?: (message: string) => void;
  lastWeight: number | null;
  lastHeight: number | null;
  themeDimmedBgColor: string;
  memberNameByUid?: Record<string, string>;
  tutorialAnchorRef?: TutorialAnchorRefFactory;
  primaryActionMorph?: {
    stickyRef: { current: HTMLElement | null };
    layoutMode: LayoutMode;
    selected: boolean;
    primaryInSplit: boolean;
  };
};

export function BabyPanel({
  profile,
  events,
  latestEvents = events,
  logEvents = events,
  logDateControls,
  logDate,
  now,
  diaperStockManagementEnabled,
  sleepManagementEnabled,
  customMemoPresets = [],
  onAddCustomMemoPreset = () => null,
  onDeleteCustomMemoPreset = () => {},
  gaugesEnabled = true,
  stockForecastEnabled = true,
  lowStock,
  diaperEstimate,
  milkProgress,
  onOpenHistory,
  onOpenModal,
  onAddEvent,
  onOpenSleepTimeEditor,
  onOpenDailyReport,
  onOpenHealthChart,
  onOpenTimeline,
  onVoiceMessage = () => {},
  lastWeight,
  lastHeight,
  themeDimmedBgColor,
  memberNameByUid = {},
  tutorialAnchorRef,
  primaryActionMorph,
}: BabyPanelProps) {
  const babyId = profile.babyId;
  const [healthOpen, setHealthOpen] = useState(false);
  const [customMemoOpen, setCustomMemoOpen] = useState(false);
  const [customMemoEmoji, setCustomMemoEmoji] = useState("");
  const [customMemoText, setCustomMemoText] = useState("");
  const {
    temperature,
    setTemperature,
    weight,
    setWeight,
    height,
    setHeight,
    dailyNote,
    setDailyNote,
    saveHealthRecord: handleSaveHealthRecord,
    saveDailyNote: handleSaveDailyNote,
  } = useBabyHealthInputs({ babyId, lastWeight, lastHeight, onAddEvent });

  useEffect(() => {
    setHealthOpen(false);
    setCustomMemoOpen(false);
    setCustomMemoEmoji("");
    setCustomMemoText("");
  }, [babyId]);

  const {
    milkTotal,
    milkCount,
    breastCount,
    solidFoodCount,
    peeCount,
    poopCount,
    diaperCount,
    remainingDiapers,
    diaperEstimateSummary,
    diaperProgressDifferenceLabel,
    milkProgressDifferenceLabel,
    sleepAnalysis,
    sleeping,
    activityGauge,
    sleepGauge,
    sleepButtonGaugePercent,
    previousSleepDuration,
    activityElapsed,
    currentSleepDuration,
    sleepLogSummary,
    sleepLogTotal,
    sleepProgressDifferenceLabel,
    averageActivityDuration,
    sleepDurationByWakeId,
    lastMilkEvent,
    lastMilkTime,
    lastMilkElapsed,
    lastDiaperEvent,
    lastDiaperTime,
    lastDiaperElapsed,
    milkGaugePercent,
    milkGaugeMode,
    milkGaugeRemainingMinutes,
    milkNeededMl,
    milkTargetMl,
    diaperGaugePercent,
  } = buildBabyPanelViewModel({
    profile,
    latestEvents,
    logEvents,
    logDate,
    now,
    diaperStockManagementEnabled,
    stockForecastEnabled,
    diaperEstimate,
    milkProgress,
  });

  const sleepLongPressTimerRef = useRef<number | null>(null);
  const sleepLongPressTriggeredRef = useRef(false);
  const [sleepTransition, setSleepTransition] = useState<'sleepStart'|'wake'|null>(null);
  const sleepTransitionUntil = useRef(0);
  const sleepTransitionTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => { clearTimeout(sleepTransitionTimer.current); }, []);

  const clearSleepLongPressTimer = () => {
    if (sleepLongPressTimerRef.current !== null) {
      window.clearTimeout(sleepLongPressTimerRef.current);
      sleepLongPressTimerRef.current = null;
    }
  };

  const startSleepLongPress = () => {
    if (Date.now() < sleepTransitionUntil.current) return;
    clearSleepLongPressTimer();
    sleepLongPressTriggeredRef.current = false;
    sleepLongPressTimerRef.current = window.setTimeout(() => {
      sleepLongPressTriggeredRef.current = true;
      onOpenSleepTimeEditor({ babyId, type: sleeping ? "wake" : "sleepStart" });
    }, SLEEP_LONG_PRESS_MS);
  };

  useEffect(() => () => clearSleepLongPressTimer(), []);

  const customMemoLongPressTimerRef = useRef<number | null>(null);
  const customMemoLongPressTriggeredRef = useRef(false);

  const clearCustomMemoLongPressTimer = () => {
    if (customMemoLongPressTimerRef.current !== null) {
      window.clearTimeout(customMemoLongPressTimerRef.current);
      customMemoLongPressTimerRef.current = null;
    }
  };

  const recordCustomMemo = (preset: CustomMemoPreset) =>
    onAddEvent({
      babyId,
      type: "daily",
      note: preset.text,
      customMemoId: preset.id,
      customMemoEmoji: preset.emoji,
    });

  const createAndRecordCustomMemo = () => {
    const emoji = customMemoEmoji.trim();
    const text = customMemoText.trim();
    if (!emoji || !text) return;
    const preset = onAddCustomMemoPreset(emoji, text);
    if (!preset) return;
    recordCustomMemo(preset);
    setCustomMemoEmoji("");
    setCustomMemoText("");
  };

  const startCustomMemoLongPress = (preset: CustomMemoPreset) => {
    clearCustomMemoLongPressTimer();
    customMemoLongPressTriggeredRef.current = false;
    customMemoLongPressTimerRef.current = window.setTimeout(() => {
      customMemoLongPressTimerRef.current = null;
      customMemoLongPressTriggeredRef.current = true;
      if (window.confirm(`「${preset.emoji} ${preset.text}」を削除しますか？`)) {
        onDeleteCustomMemoPreset(preset.id);
      }
    }, CUSTOM_MEMO_LONG_PRESS_MS);
  };

  useEffect(() => () => clearCustomMemoLongPressTimer(), []);

  const primaryActionBoundsRef = useRef<HTMLDivElement | null>(null);
  const milkButtonRef = useRef<HTMLButtonElement | null>(null);
  const diaperButtonRef = useRef<HTMLButtonElement | null>(null);
  const sleepButtonRef = useRef<HTMLButtonElement | null>(null);

  const primaryActionRef = (
    localRef: { current: HTMLButtonElement | null },
    action: "milk" | "diaper" | "sleep"
  ): Ref<HTMLButtonElement> => (node) => {
    localRef.current = node;
    tutorialAnchorRef?.(`primary:${babyId}:${action}`)(node);
  };

  const renderMilkAction = (ref: Ref<HTMLButtonElement>, morph = false) => (
    <Button
      ref={ref}
      size="lg"
      className={`relative h-28 select-none overflow-hidden [background:hsl(var(--gauge-milk-track))] p-0 text-2xl font-bold [color:hsl(var(--gauge-milk-text))] hover:[background:hsl(var(--gauge-milk-track))] [-webkit-touch-callout:none] ${
        morph ? "twinly-primary-action-morph-button" : ""
      }`}
      data-morph-action={morph ? "food" : undefined}
      tabIndex={morph ? -1 : undefined}
      onClick={() => onOpenModal("milk", { babyId })}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={!gaugesEnabled ? "食事を記録" : milkGaugeMode === "interval" ? `食事を記録・次の授乳目安${milkGaugePercent}%` : `食事を記録・推定空腹度${milkGaugePercent}%${milkNeededMl !== null && milkTargetMl !== null ? `・あと${milkNeededMl}ml・${milkTargetMl}ml` : ""}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 [background:hsl(var(--gauge-milk-fill))] transition-[width] duration-500"
        data-testid={morph ? undefined : "milk-gauge-fill"}
        style={{ width: morph && !gaugesEnabled ? "100%" : gaugesEnabled ? `${milkGaugePercent}%` : 0 }}
      />
      <div
        className="relative z-10 flex h-full w-full flex-col items-center justify-start pt-5"
        data-morph-role={morph ? "care-content" : undefined}
      >
        <div className="flex items-center [color:hsl(var(--gauge-milk-text))]">
          <Utensils className="mr-3 h-7 w-7" />
          食事
        </div>
        {!gaugesEnabled ? null : milkGaugeMode === "interval" ? (
          <span className="mt-0.5 whitespace-nowrap text-[15px] font-bold leading-tight [color:hsl(var(--gauge-milk-muted))]" data-morph-secondary={morph ? "true" : undefined}>
            {milkGaugeRemainingMinutes !== null && milkGaugeRemainingMinutes > 0 ? `次の授乳まで ${formatSleepDuration(milkGaugeRemainingMinutes)}` : "次の授乳目安です"}
          </span>
        ) : milkNeededMl !== null && milkTargetMl !== null ? (
          <span
            className="mt-0.5 whitespace-nowrap text-[15px] font-bold leading-tight [color:hsl(var(--gauge-milk-muted))]"
            data-morph-secondary={morph ? "true" : undefined}
          >
            あと {milkNeededMl} ml
            <span className="ml-1 font-semibold">/ {milkTargetMl} ml</span>
          </span>
        ) : (
          <span
            className="mt-0.5 text-[15px] font-bold leading-tight [color:hsl(var(--gauge-milk-muted))]"
            data-morph-secondary={morph ? "true" : undefined}
          >
            必要量を計算中
          </span>
        )}
        <span
          className="whitespace-nowrap text-[15px] font-bold leading-tight [color:hsl(var(--gauge-milk-muted))]"
          data-morph-secondary={morph ? "true" : undefined}
        >
          前回授乳 {lastMilkTime} / {lastMilkElapsed}
        </span>
      </div>
      {morph && gaugesEnabled ? <span className="twinly-primary-action-morph-percent">{milkGaugePercent}%</span> : null}
    </Button>
  );

  const renderDiaperAction = (ref: Ref<HTMLButtonElement>, morph = false) => (
    <Button
      ref={ref}
      size="lg"
      className={`relative h-28 select-none overflow-hidden [background:hsl(var(--gauge-diaper-track))] p-0 text-2xl font-bold [color:hsl(var(--gauge-diaper-text))] hover:[background:hsl(var(--gauge-diaper-track))] [-webkit-touch-callout:none] ${
        morph ? "twinly-primary-action-morph-button" : ""
      }`}
      data-morph-action={morph ? "diaper" : undefined}
      tabIndex={morph ? -1 : undefined}
      onClick={() => onOpenModal("diaper", { babyId })}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={!gaugesEnabled ? "おむつを記録" : `おむつを記録・交換必要度${diaperGaugePercent}%`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 [background:hsl(var(--gauge-diaper-fill))] transition-[width] duration-500"
        data-testid={morph ? undefined : "diaper-gauge-fill"}
        style={{ width: morph && !gaugesEnabled ? "100%" : gaugesEnabled ? `${diaperGaugePercent}%` : 0 }}
      />
      <div
        className="relative z-10 flex h-full w-full flex-col items-center justify-start pt-5"
        data-morph-role={morph ? "care-content" : undefined}
      >
        <div className="flex items-center [color:hsl(var(--gauge-diaper-text))]">
          <Droplets className="mr-3 h-7 w-7" />
          おむつ
        </div>
        {diaperStockManagementEnabled ? (
          <span
            className="mt-0.5 text-[15px] font-bold leading-tight [color:hsl(var(--gauge-diaper-muted))]"
            data-morph-secondary={morph ? "true" : undefined}
          >
            {profile.diaperSize}・残り {remainingDiapers}
          </span>
        ) : null}
        <span
          className="whitespace-nowrap text-[15px] font-bold leading-tight [color:hsl(var(--gauge-diaper-muted))]"
          data-morph-secondary={morph ? "true" : undefined}
        >
          前回 {lastDiaperTime} / {lastDiaperElapsed}
        </span>
      </div>
      {morph && gaugesEnabled ? <span className="twinly-primary-action-morph-percent">{diaperGaugePercent}%</span> : null}
    </Button>
  );

  const renderSleepAction = (ref: Ref<HTMLButtonElement>, morph = false) => (
    <Button
      ref={ref}
      disabled={sleepTransition !== null}
      data-transition={sleepTransition || undefined}
      data-morph-action={morph ? "sleep" : undefined}
      tabIndex={morph ? -1 : undefined}
      role="switch"
      aria-checked={sleeping}
      className={`relative mt-3 h-20 w-full select-none overflow-hidden rounded-md p-0 shadow-sm [-webkit-touch-callout:none] ${
        sleeping
          ? "border-violet-500/60 [background:hsl(var(--gauge-sleep-track))] hover:[background:hsl(var(--gauge-sleep-track))]"
          : "border-emerald-500/60 [background:hsl(var(--gauge-wake-track))] hover:[background:hsl(var(--gauge-wake-track))]"
      } ${morph ? "twinly-primary-action-morph-button" : ""}`}
      onPointerDown={startSleepLongPress}
      onPointerUp={clearSleepLongPressTimer}
      onPointerLeave={clearSleepLongPressTimer}
      onPointerCancel={clearSleepLongPressTimer}
      onContextMenu={(event) => event.preventDefault()}
      onClick={() => {
        if (Date.now() < sleepTransitionUntil.current) return;
        if (sleepLongPressTriggeredRef.current) {
          sleepLongPressTriggeredRef.current = false;
          return;
        }
        const next = sleeping ? "wake" : "sleepStart";
        sleepTransitionUntil.current = Date.now() + SLEEP_TRANSITION_FEEDBACK_MS;
        setSleepTransition(next);
        sleepTransitionTimer.current = setTimeout(() => {
          sleepTransitionUntil.current = 0;
          setSleepTransition(null);
        }, SLEEP_TRANSITION_FEEDBACK_MS);
        const saved = onAddEvent({
          babyId,
          type: next,
          note: sleeping ? "手動: 起床" : "手動: 入眠",
        });
        if (saved === false) {
          clearTimeout(sleepTransitionTimer.current);
          sleepTransitionUntil.current = 0;
          setSleepTransition(null);
        }
      }}
      aria-label={!gaugesEnabled ? (sleeping ? "起床を記録・長押しで時刻指定" : "入眠を記録・長押しで時刻指定") : `${sleeping ? "起床を記録" : "入眠を記録"}・長押しで時刻指定・${
        sleeping
          ? `必要睡眠時間の残り${sleepGauge.remainingPercent}%`
          : `活動時間経過${activityGauge.elapsedPercent}%`
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${
          sleeping ? "[background:hsl(var(--gauge-sleep-fill))]" : "[background:hsl(var(--gauge-wake-fill))]"
        }`}
        data-testid={morph ? undefined : "sleep-gauge-fill"}
        data-percent={sleepButtonGaugePercent}
        style={{ width: morph && !gaugesEnabled ? "100%" : gaugesEnabled ? `${sleepButtonGaugePercent}%` : 0 }}
      />
      {sleepTransition && (
        <span role="status" className="sleep-transition-message absolute inset-0 z-20 grid place-items-center whitespace-normal px-3 text-center text-sm font-bold text-white">
          {sleepTransition === "sleepStart" ? "入眠を記録しました · おやすみなさい" : "起床を記録しました · おはよう"}
        </span>
      )}
      <span className="relative z-10 flex h-full w-full items-stretch">
        <span
          className={`flex h-full w-[38%] shrink-0 flex-col items-center justify-center px-2 ${
            sleeping ? "[color:hsl(var(--gauge-sleep-on))]" : "[color:hsl(var(--gauge-wake-on))]"
          }`}
          data-testid={morph ? undefined : "sleep-state-label"}
          data-morph-role={morph ? "sleep-state" : undefined}
        >
          <span className="flex items-center gap-1.5 text-lg font-bold">
            {sleeping ? <Moon className="h-5 w-5 shrink-0" /> : <Sun className="h-5 w-5 shrink-0" />}
            <span>{sleeping ? "睡眠中" : "起床中"}</span>
          </span>
          <span
            className="mt-0.5 text-xs font-semibold opacity-80"
            data-morph-secondary={morph ? "true" : undefined}
          >
            長押しで時刻変更
          </span>
        </span>
        <span
          className={`flex min-w-0 flex-1 flex-col items-end justify-center px-3 text-right text-[15px] font-bold leading-tight ${
            sleeping ? "[color:hsl(var(--gauge-sleep-muted))]" : "[color:hsl(var(--gauge-wake-muted))]"
          }`}
          data-testid={morph ? undefined : "sleep-detail"}
          data-morph-secondary={morph ? "true" : undefined}
        >
          <span className="block">
            {sleeping ? `睡眠時間 ${currentSleepDuration ?? "0分"}` : activityElapsed}
          </span>
          <span className="block">前回睡眠 {previousSleepDuration}</span>
        </span>
      </span>
      {morph && gaugesEnabled ? <span className="twinly-primary-action-morph-percent">{sleepButtonGaugePercent}%</span> : null}
    </Button>
  );

  const primaryActionMorphRefreshKey = [
    gaugesEnabled,
    diaperStockManagementEnabled,
    sleepManagementEnabled,
    sleeping,
    milkGaugePercent,
    milkNeededMl ?? "",
    milkTargetMl ?? "",
    diaperGaugePercent,
    remainingDiapers,
    lastMilkTime,
    lastMilkElapsed,
    lastDiaperTime,
    lastDiaperElapsed,
    sleepButtonGaugePercent,
    currentSleepDuration ?? "",
    activityElapsed,
    previousSleepDuration,
    sleepTransition ?? "",
  ].join("|");

  return (
    <Card
      ref={primaryActionBoundsRef}
      className={`twinly-baby-panel flex flex-col border-border/60 ${themeDimmedBgColor} ${
        sleeping ? "ring-1 ring-indigo-400/60" : ""
      }`}
    >
      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-4">
          {renderMilkAction(primaryActionRef(milkButtonRef, "milk"))}
          {renderDiaperAction(primaryActionRef(diaperButtonRef, "diaper"))}
        </div>

        {sleepManagementEnabled ? renderSleepAction(primaryActionRef(sleepButtonRef, "sleep")) : null}

        {primaryActionMorph ? (
          <PrimaryActionMorph
            selected={primaryActionMorph.selected}
            primaryInSplit={primaryActionMorph.primaryInSplit}
            layoutMode={primaryActionMorph.layoutMode}
            stickyRef={primaryActionMorph.stickyRef}
            boundsRef={primaryActionBoundsRef}
            foodSourceRef={milkButtonRef}
            diaperSourceRef={diaperButtonRef}
            sleepSourceRef={sleepButtonRef}
            hasSleep={sleepManagementEnabled}
            refreshKey={primaryActionMorphRefreshKey}
            renderFood={(ref) => renderMilkAction(ref, true)}
            renderDiaper={(ref) => renderDiaperAction(ref, true)}
            renderSleep={(ref) => renderSleepAction(ref, true)}
          />
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div
            ref={tutorialAnchorRef?.(`memo:${babyId}`)}
            className="overflow-hidden rounded-lg border bg-card sm:col-span-2"
          >
            <div className="flex items-center gap-2 p-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={onOpenDailyReport}
                aria-label="メモ一覧を開く"
              >
                <FileText className="h-4 w-4" />
              </Button>
              <button
                type="button"
                className="flex-shrink-0 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setCustomMemoOpen((open) => !open)}
                aria-expanded={customMemoOpen}
                aria-label="カスタムメモを開閉"
              >
                一言メモ
              </button>
              <Input
                type="text"
                placeholder="ひとことメモ"
                value={dailyNote}
                onChange={(e) => setDailyNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveDailyNote();
                }}
                className="h-7 min-w-0 flex-1 px-2 text-sm"
              />
              {dailyNote.trim() ? (
                <Button
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={handleSaveDailyNote}
                  aria-label="一言メモを保存"
                >
                  <Check className="h-4 w-4" />
                </Button>
              ) : (
                <VoiceCommandButton
                  className="h-7 w-7 flex-shrink-0"
                  onCommand={() => {}}
                  onMessage={onVoiceMessage}
                  recognitionMode="dictation"
                  onTranscript={(text) => {
                    const note = collapseExactRepeatedTranscript(text);
                    if (!note) return;
                    onAddEvent({ babyId, type: "daily", note });
                    setDailyNote("");
                  }}
                />
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={() => setCustomMemoOpen((open) => !open)}
                aria-expanded={customMemoOpen}
                aria-label="カスタムメモを開閉"
              >
                <ListPlus className="h-4 w-4" />
              </Button>
            </div>

            {customMemoOpen ? (
              <div className="space-y-2 border-t bg-background/20 p-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={customMemoEmoji}
                    onChange={(event) => setCustomMemoEmoji(event.target.value)}
                    placeholder="🙂"
                    aria-label="カスタムメモの絵文字"
                    className="h-8 w-14 flex-none px-1 text-center text-lg placeholder:opacity-30"
                    maxLength={8}
                  />
                  <Input
                    value={customMemoText}
                    onChange={(event) => setCustomMemoText(event.target.value)}
                    placeholder="沐浴、散歩など"
                    aria-label="カスタムメモの内容"
                    className="h-8 min-w-0 flex-1"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") createAndRecordCustomMemo();
                    }}
                  />
                  <Button
                    size="icon"
                    className="h-8 w-8 flex-none"
                    disabled={!customMemoEmoji.trim() || !customMemoText.trim()}
                    onClick={createAndRecordCustomMemo}
                    aria-label="カスタムメモを追加"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {customMemoPresets.length ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {customMemoPresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className="flex select-none items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted/50 [-webkit-touch-callout:none]"
                        onPointerDown={() => startCustomMemoLongPress(preset)}
                        onPointerUp={clearCustomMemoLongPressTimer}
                        onPointerLeave={clearCustomMemoLongPressTimer}
                        onPointerCancel={clearCustomMemoLongPressTimer}
                        onContextMenu={(event) => event.preventDefault()}
                        onClick={() => {
                          if (customMemoLongPressTriggeredRef.current) {
                            customMemoLongPressTriggeredRef.current = false;
                            return;
                          }
                          recordCustomMemo(preset);
                        }}
                        aria-label={`${preset.text}を記録・長押しで削除`}
                      >
                        <span aria-hidden="true" className="text-base leading-none">{preset.emoji}</span>
                        <span>{preset.text}</span>
                      </button>
                      ))}
                    </div>
                    <p className="px-1 text-[10px] leading-none text-muted-foreground/70">
                      長押しで削除
                    </p>
                  </>
                ) : (
                  <p className="px-1 text-xs text-muted-foreground">よく使うルーティンを追加すると、ここから1タップで記録できます。</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-lg border bg-card/70 sm:col-span-2">
            <div className="flex items-center gap-1 p-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={onOpenHealthChart}
                aria-label="からだの記録グラフを開く"
              >
                <Ruler className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                className="h-7 min-w-0 flex-1 justify-start px-1 text-muted-foreground hover:bg-transparent hover:text-foreground"
                onClick={() => setHealthOpen((open) => !open)}
                aria-expanded={healthOpen}
                aria-label="からだの記録を開閉"
              >
                <span className="text-sm font-semibold">からだの記録</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-7 w-7 flex-shrink-0"
                onClick={() => setHealthOpen((open) => !open)}
                aria-expanded={healthOpen}
                aria-label="からだの記録を開閉"
              >
                {healthOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>

            {healthOpen ? (
              <div className="grid gap-2 border-t bg-background/20 p-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
                <div className="flex items-center justify-between gap-1 rounded-md border border-border/60 bg-background/50 p-2">
                <div className="flex flex-shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground">
                  <Thermometer className="h-4 w-4" />
                  <span>{"\u4f53\u6e29"}</span>
                </div>
                <Button variant="outline" size="icon" className="h-7 w-10" onClick={() => setTemperature((value) => adjustNumber(value, -0.5, 1))}>
                  <ChevronsLeft className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-10" onClick={() => setTemperature((value) => adjustNumber(value, -0.1, 1))}>
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Input type="number" placeholder="36.0" value={temperature} onChange={(e) => setTemperature(e.target.value)} className="h-7 w-20 px-1 text-center text-base font-bold" />
                <Button variant="outline" size="icon" className="h-7 w-10" onClick={() => setTemperature((value) => adjustNumber(value, 0.1, 1))}>
                  <ChevronRight className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-10" onClick={() => setTemperature((value) => adjustNumber(value, 0.5, 1))}>
                  <ChevronsRight className="h-3 w-3" />
                </Button>
                <Button size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => handleSaveHealthRecord("temperature")} disabled={!temperature}>
                  <Check className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center justify-between gap-1 rounded-md border border-border/60 bg-background/50 p-2">
                <div className="flex flex-shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground">
                  <Weight className="h-4 w-4" />
                  <span>{"\u4f53\u91cd"}</span>
                </div>
                <Button variant="outline" size="icon" className="h-7 w-10" onClick={() => setWeight((value) => adjustNumber(value, -0.5, 2))}>
                  <ChevronsLeft className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-10" onClick={() => setWeight((value) => adjustNumber(value, -0.1, 2))}>
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Input type="number" placeholder={lastWeight?.toFixed(2) ?? "0.00"} value={weight} onChange={(e) => setWeight(e.target.value)} className="h-7 w-20 px-1 text-center text-base font-bold" />
                <Button variant="outline" size="icon" className="h-7 w-10" onClick={() => setWeight((value) => adjustNumber(value, 0.1, 2))}>
                  <ChevronRight className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-10" onClick={() => setWeight((value) => adjustNumber(value, 0.5, 2))}>
                  <ChevronsRight className="h-3 w-3" />
                </Button>
                <Button size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => handleSaveHealthRecord("weight")} disabled={!weight}>
                  <Check className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center justify-between gap-1 rounded-md border border-border/60 bg-background/50 p-2">
                <div className="flex flex-shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground">
                  <Ruler className="h-4 w-4" />
                  <span>{"\u8eab\u9577"}</span>
                </div>
                <Button variant="outline" size="icon" className="h-7 w-10" onClick={() => setHeight((value) => adjustNumber(value, -0.5, 1))}>
                  <ChevronsLeft className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-10" onClick={() => setHeight((value) => adjustNumber(value, -0.1, 1))}>
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Input type="number" placeholder={lastHeight?.toFixed(1) ?? "0.0"} value={height} onChange={(e) => setHeight(e.target.value)} className="h-7 w-20 px-1 text-center text-base font-bold" />
                <Button variant="outline" size="icon" className="h-7 w-10" onClick={() => setHeight((value) => adjustNumber(value, 0.1, 1))}>
                  <ChevronRight className="h-3 w-3" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-10" onClick={() => setHeight((value) => adjustNumber(value, 0.5, 1))}>
                  <ChevronsRight className="h-3 w-3" />
                </Button>
                <Button size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => handleSaveHealthRecord("height")} disabled={!height}>
                  <Check className="h-4 w-4" />
                </Button>
              </div>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex min-h-0 flex-1 flex-col items-start gap-3">
        <div className="flex w-full items-center justify-between gap-3">
          <h3 ref={tutorialAnchorRef?.(`logs:${babyId}`)} className="text-sm font-semibold text-muted-foreground">ログ</h3>
          <Button
            ref={tutorialAnchorRef?.(`timeline:${babyId}`)}
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onOpenTimeline}
            aria-label="週間タイムラインを開く"
          >
            <CalendarRange className="h-4 w-4" />
            <span className="hidden min-[380px]:inline">タイムライン</span>
          </Button>
        </div>
        {logDateControls}
      <CardContent className="w-full flex-grow space-y-4 px-3 sm:px-6">
        <div
          ref={tutorialAnchorRef?.(`log-summary:${babyId}`)}
          className="pb-2"
        >
          <div className="grid min-w-0 grid-cols-2 items-stretch gap-3">
          <button
            type="button"
            className="h-full min-w-0 text-left"
            onClick={() => onOpenHistory("milk", babyId)}
            aria-label={`${profile.displayName}の食事履歴を開く`}
          >
            <Card className="h-full min-w-0 overflow-hidden transition-colors hover:border-sky-400/60 hover:bg-sky-500/5">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
                <CardTitle className="text-base font-medium text-muted-foreground">食事</CardTitle>
                {milkProgressDifferenceLabel ? (
                  <span className="shrink-0 whitespace-nowrap rounded-md border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-xs font-bold leading-tight [color:hsl(var(--gauge-milk-text))]">
                    {milkProgressDifferenceLabel}
                  </span>
                ) : null}
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold [color:hsl(var(--care-milk))]">{milkTotal}</span>
                  <span className="font-semibold text-muted-foreground">ml</span>
                </div>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>ミルク</span>
                    <span>{milkCount}回</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>母乳</span>
                    <span>{breastCount}回</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>離乳食</span>
                    <span>{solidFoodCount}回</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>

          <button
            type="button"
            className="h-full min-w-0 text-left"
            onClick={() => onOpenHistory("diaper", babyId)}
            aria-label={`${profile.displayName}のおむつ履歴を開く`}
          >
            <Card className="h-full min-w-0 overflow-hidden transition-colors hover:border-amber-400/60 hover:bg-amber-500/5">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
                <CardTitle className="text-base font-medium text-muted-foreground">おむつ</CardTitle>
                {diaperProgressDifferenceLabel ? (
                  <span className="shrink-0 whitespace-nowrap rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-xs font-bold leading-tight [color:hsl(var(--gauge-diaper-text))]">
                    {diaperProgressDifferenceLabel}
                  </span>
                ) : null}
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold [color:hsl(var(--care-diaper))]">{diaperCount}</span>
                    <span className="font-semibold text-muted-foreground">回</span>
                  </div>
                  {diaperEstimateSummary ? (
                    <div className="hidden min-w-0 max-w-[52%] shrink overflow-hidden rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-right min-[900px]:block">
                      <p className="truncate text-xs font-semibold leading-tight [color:hsl(var(--gauge-diaper-text))]">
                        {diaperEstimateSummary.title}
                      </p>
                      <p className="truncate text-[11px] leading-tight [color:hsl(var(--gauge-diaper-muted))]">
                        {diaperEstimateSummary.detail}
                      </p>
                    </div>
                  ) : null}
                  {diaperStockManagementEnabled && lowStock ? (
                    <div className="rounded-md border border-[hsl(var(--care-diaper)/.3)] bg-[hsl(var(--gauge-diaper-track))] px-2 py-1 text-xs font-semibold [color:hsl(var(--gauge-diaper-text))]">
                      3日以内
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>おしっこ</span>
                    <span>{peeCount}回</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>うんち</span>
                    <span>{poopCount}回</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>

          {sleepManagementEnabled ? (
            <button
              type="button"
              className="col-span-2 min-w-0 text-left"
              onClick={() => onOpenHistory("sleep", babyId)}
              aria-label={`${profile.displayName}の睡眠履歴を開く`}
            >
              <Card className="h-full min-w-0 overflow-hidden transition-colors hover:border-violet-400/60 hover:bg-violet-500/5">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 p-3">
                  <CardTitle className="text-base font-medium text-muted-foreground">睡眠</CardTitle>
                  {sleepProgressDifferenceLabel ? (
                    <span className="shrink-0 whitespace-nowrap rounded-md border border-violet-400/30 bg-violet-500/10 px-2 py-1 text-xs font-bold leading-tight [color:hsl(var(--gauge-sleep-fill))]">
                      {sleepProgressDifferenceLabel}
                    </span>
                  ) : null}
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="flex min-w-0 items-baseline gap-3">
                    <span className="whitespace-nowrap text-2xl font-bold [color:hsl(var(--gauge-sleep-fill))]">{sleepLogTotal}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between gap-2">
                      <span>睡眠回数</span>
                      <span>{sleepLogSummary.sleepCount}回</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>平均活動</span>
                      <span>{averageActivityDuration}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          ) : null}
          </div>
        </div>
      </CardContent>


        <div className="flex max-h-[42vh] w-full flex-col gap-3 overflow-y-auto pr-1">
          {logEvents.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">
              まだ記録がありません
            </div>
          ) : (
            logEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                creatorName={event.createdByUid ? memberNameByUid[event.createdByUid] : undefined}
                onEdit={() => onOpenModal("edit", { eventId: event.id })}
                invalidSleepMarker={
                  (event.type === "wake" && sleepAnalysis.invalidWakeIds.has(event.id)) ||
                  (event.type === "sleepStart" && sleepAnalysis.invalidSleepStartIds.has(event.id))
                }
                sleepDurationMinutes={event.type === "wake" ? sleepDurationByWakeId.get(event.id) : undefined}
              />
            ))
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
