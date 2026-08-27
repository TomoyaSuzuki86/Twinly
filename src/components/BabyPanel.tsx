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
  CalendarRange,
  Utensils,
  Moon,
  Sun,
} from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "./ui/input";
import { BabyId, BabyProfile, LogEvent } from "@/types";
import { DiaperStockEstimate } from "@/lib/diaper-stock";
import { MilkProgressComparison } from "@/lib/milk-progress";
import { buildCareGauges } from "@/lib/care-gauges";
import { fmtTime, minutesSince } from "@/lib/utils";
import { EventCard } from "./EventCard";
import {
  analyzeSleepEvents,
  buildActivityGauge,
  buildSleepGauge,
  buildSleepLogSummary,
  formatSleepDuration,
  getAverageActivityMinutes,
  getDefaultActivityLimitMinutes,
  getDefaultSleepTargetHours,
} from "@/lib/sleep";

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
  lowStock: { size: string; remaining: number } | null;
  diaperEstimate: DiaperStockEstimate | null;
  milkProgress: MilkProgressComparison | null;
  onOpenHistory: (type: "milk" | "diaper" | "sleep", babyId: BabyId) => void;
  onOpenModal: (
    kind: "milk" | "diaper" | "edit",
    payload: { babyId: BabyId } | { eventId: string }
  ) => void;
  onAddEvent: (event: Omit<LogEvent, "id" | "timestamp">) => void;
  onOpenSleepTimeEditor: (payload: {
    babyId: BabyId;
    type: "sleepStart" | "wake";
  }) => void;
  onOpenDailyReport: () => void;
  onOpenHealthChart: () => void;
  onOpenTimeline: () => void;
  lastWeight: number | null;
  lastHeight: number | null;
  themeDimmedBgColor: string;
};

const adjustNumber = (current: string, amount: number, precision: number) => {
  const num = parseFloat(current);
  if (Number.isNaN(num)) return (0).toFixed(precision);
  return (num + amount).toFixed(precision);
};

const formatDiaperEstimateSummary = (estimate: DiaperStockEstimate | null) => {
  if (!estimate) return null;

  if (estimate.level === "unknown") {
    return {
      title: "在庫予測は準備中",
      detail: "記録が増えると、在庫切れの予測を表示します。",
    };
  }

  if (estimate.level === "urgent") {
    return {
      title: "今日中になくなりそう",
      detail: `在庫切れ予測: ${estimate.estimatedRunOutDate ?? "-"}`,
    };
  }

  const roundedDays = Math.max(1, Math.ceil(estimate.daysRemaining ?? 0));
  return {
    title: `このペースだとあと約${roundedDays}日`,
    detail: `在庫切れ予測: ${estimate.estimatedRunOutDate ?? "-"}`,
  };
};

const formatMilkProgressSummary = (progress: MilkProgressComparison | null) => {
  if (!progress) return null;

  if (progress.status === "no-history") {
    return {
      title: `${progress.currentAmount}ml / 平均なし`,
      detail: "過去7日分の記録がまだありません",
    };
  }

  const roundedAverage = Math.round(progress.trailingAverage);
  const roundedDifference = Math.round(Math.abs(progress.difference));
  const detail =
    roundedDifference === 0
      ? "過去7日平均とほぼ同じ"
      : progress.difference > 0
        ? `平均より ${roundedDifference}ml 多め`
        : `平均より ${roundedDifference}ml 少なめ`;

  return {
    title: `${progress.currentAmount}ml / 平均${roundedAverage}ml`,
    detail,
  };
};

const roundMilkAmountUp = (amount: number) => Math.ceil(Math.max(0, amount) / 5) * 5;

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
  lastWeight,
  lastHeight,
  themeDimmedBgColor,
}: BabyPanelProps) {
  const babyId = profile.babyId;
  const [temperature, setTemperature] = useState("36.0");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [dailyNote, setDailyNote] = useState("");
  const [healthOpen, setHealthOpen] = useState(false);

  useEffect(() => {
    setHealthOpen(false);
  }, [babyId]);

  useEffect(() => {
    setWeight(lastWeight ? lastWeight.toFixed(2) : "");
  }, [lastWeight]);

  useEffect(() => {
    setHeight(lastHeight ? lastHeight.toFixed(1) : "");
  }, [lastHeight]);

  const formatElapsed = (timestamp: number | null) =>
    timestamp ? `${minutesSince(timestamp, now)}分前` : "未記録";

  const handleSaveHealthRecord = (type: "temperature" | "weight" | "height") => {
    if (type === "temperature" && temperature) {
      onAddEvent({
        babyId,
        type: "temperature",
        temperature: parseFloat(temperature),
      });
      setTemperature("36.0");
    }

    if (type === "weight" && weight) {
      onAddEvent({
        babyId,
        type: "weight",
        weight: parseFloat(weight),
      });
    }

    if (type === "height" && height) {
      onAddEvent({
        babyId,
        type: "height",
        height: parseFloat(height),
      });
    }
  };

  const handleSaveDailyNote = () => {
    const note = dailyNote.trim();
    if (!note) return;

    onAddEvent({
      babyId,
      type: "daily",
      note,
    });
    setDailyNote("");
  };

  const milkEvents = logEvents.filter((event) => event.type === "milk");
  const solidFoodEvents = logEvents.filter((event) => event.type === "solidFood");
  const diaperEvents = logEvents.filter((event) => event.type === "diaper");
  const milkTotal = milkEvents.reduce((sum, event) => sum + (event.milkMl ?? 0), 0);
  const peeCount = diaperEvents.reduce(
    (count, event) => count + (event.diaperKind === "pee" || event.diaperKind === "mix" ? 1 : 0),
    0
  );
  const poopCount = diaperEvents.reduce(
    (count, event) => count + (event.diaperKind === "poop" || event.diaperKind === "mix" ? 1 : 0),
    0
  );
  const diaperCount = peeCount + poopCount;
  const remainingDiapers = profile.diaperStockBySize[profile.diaperSize] ?? 0;
  const diaperEstimateSummary = diaperStockManagementEnabled ? formatDiaperEstimateSummary(diaperEstimate) : null;
  const milkProgressSummary = formatMilkProgressSummary(milkProgress);
  const sleepAnalysis = analyzeSleepEvents(latestEvents, babyId);
  const sleeping = Boolean(sleepAnalysis.currentSleepStart);
  const averageGaugeActivityMinutes = getAverageActivityMinutes(sleepAnalysis, now);
  const activityLimitMinutes =
    profile.activityLimitMinutesOverride ??
    averageGaugeActivityMinutes ??
    getDefaultActivityLimitMinutes(profile.birthDate, now);
  const activityLimitSource =
    profile.activityLimitMinutesOverride !== null && profile.activityLimitMinutesOverride !== undefined
      ? "設定"
      : averageGaugeActivityMinutes !== null
        ? "平均"
        : "目安";
  const activityGauge = buildActivityGauge(sleepAnalysis, now, activityLimitMinutes);
  const sleepTargetHours =
    profile.sleepTargetHoursOverride ?? getDefaultSleepTargetHours(profile.birthDate, now);
  const sleepGauge = buildSleepGauge(sleepAnalysis, now, now, sleepTargetHours);
  const sleepButtonGaugePercent = sleeping
    ? sleepGauge.remainingPercent
    : activityGauge.elapsedPercent;
  const latestCompletedSleep = sleepAnalysis.intervals.reduce(
    (latest, interval) => (!latest || interval.end > latest.end ? interval : latest),
    null as (typeof sleepAnalysis.intervals)[number] | null
  );
  const previousSleepDuration = latestCompletedSleep
    ? formatSleepDuration((latestCompletedSleep.end - latestCompletedSleep.start) / (60 * 1000))
    : "未記録";
  const activityElapsed = `活動時間 ${
    latestCompletedSleep
      ? `${formatSleepDuration(activityGauge.elapsedMinutes)} / ${activityLimitSource}${formatSleepDuration(activityGauge.limitMinutes)}`
      : "未記録"
  }`;
  const currentSleepDuration = sleepAnalysis.currentSleepStart
    ? formatSleepDuration((now.getTime() - sleepAnalysis.currentSleepStart.timestamp) / (60 * 1000))
    : null;
  const selectedLogDate = logDate ? new Date(`${logDate}T00:00:00`) : now;
  const sleepLogSummary = buildSleepLogSummary(sleepAnalysis, selectedLogDate, now);
  const sleepLogTotal = formatSleepDuration(sleepLogSummary.totalMinutes);
  const averageActivityDuration =
    sleepLogSummary.averageActivityMinutes === null
      ? "未記録"
      : formatSleepDuration(sleepLogSummary.averageActivityMinutes);
  const sleepDurationByWakeId = new Map(
    sleepAnalysis.intervals.map((interval) => [
      interval.wakeEventId,
      (interval.end - interval.start) / (60 * 1000),
    ])
  );

  const latestMilkEvents = latestEvents.filter((event) => event.type === "milk");
  const latestDiaperEvents = latestEvents.filter((event) => event.type === "diaper");

  const lastMilkEvent = latestMilkEvents[0] ?? null;
  const lastMilkTime = lastMilkEvent ? fmtTime(new Date(lastMilkEvent.timestamp)) : "-";
  const lastMilkElapsed = formatElapsed(lastMilkEvent?.timestamp ?? null);

  const lastDiaperEvent = latestDiaperEvents[0] ?? null;
  const lastDiaperTime = lastDiaperEvent ? fmtTime(new Date(lastDiaperEvent.timestamp)) : "-";
  const lastDiaperElapsed = formatElapsed(lastDiaperEvent?.timestamp ?? null);
  const careGauges = buildCareGauges({
    events: latestEvents,
    babyId,
    now,
    milkWindowHours: profile.milkGaugeWindowHours ?? 3,
    milkTargetMlOverride: profile.milkTargetMlOverride ?? null,
  });
  const milkGaugePercent = Math.round((1 - (careGauges.milk?.level ?? 0)) * 100);
  const milkNeededMl = careGauges.milk ? roundMilkAmountUp(careGauges.milk.neededMl) : null;
  const milkTargetMl = careGauges.milk ? roundMilkAmountUp(careGauges.milk.targetMilkMl) : null;
  const diaperGaugePercent = Math.round((1 - (careGauges.diaper?.level ?? (lastDiaperEvent ? 1 : 0))) * 100);
  const sleepLongPressTimerRef = useRef<number | null>(null);
  const sleepLongPressTriggeredRef = useRef(false);

  const clearSleepLongPressTimer = () => {
    if (sleepLongPressTimerRef.current !== null) {
      window.clearTimeout(sleepLongPressTimerRef.current);
      sleepLongPressTimerRef.current = null;
    }
  };

  const startSleepLongPress = () => {
    clearSleepLongPressTimer();
    sleepLongPressTriggeredRef.current = false;
    sleepLongPressTimerRef.current = window.setTimeout(() => {
      sleepLongPressTriggeredRef.current = true;
      onOpenSleepTimeEditor({ babyId, type: sleeping ? "wake" : "sleepStart" });
    }, 550);
  };

  useEffect(() => () => clearSleepLongPressTimer(), []);

  return (
    <Card
      className={`flex flex-col border-border/60 ${themeDimmedBgColor} ${
        sleeping ? "ring-1 ring-indigo-400/60" : ""
      }`}
    >
      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-4">
          <Button
            size="lg"
            className="relative h-28 select-none overflow-hidden bg-[#103846] p-0 text-2xl font-bold text-[#F2FAFD] hover:bg-[#103846] [-webkit-touch-callout:none]"
            onClick={() => onOpenModal("milk", { babyId })}
            onContextMenu={(event) => event.preventDefault()}
            aria-label={`食事を記録・推定空腹度${milkGaugePercent}%${milkNeededMl !== null && milkTargetMl !== null ? `・あと${milkNeededMl}ml・${milkTargetMl}ml` : ""}`}
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-[#1596C8] transition-[width] duration-500"
              data-testid="milk-gauge-fill"
              style={{ width: `${milkGaugePercent}%` }}
            />
            <div className="relative z-10 flex h-full w-full flex-col items-center justify-start pt-5">
              <div className="flex items-center text-[#F2FAFD]">
                <Utensils className="mr-3 h-7 w-7" />
                食事
              </div>
              {milkNeededMl !== null && milkTargetMl !== null ? (
                <span className="mt-0.5 whitespace-nowrap text-[15px] font-bold leading-tight text-[#C2DCE5]">
                  あと {milkNeededMl} ml
                  <span className="ml-1 font-semibold">/ {milkTargetMl} ml</span>
                </span>
              ) : (
                <span className="mt-0.5 text-[15px] font-bold leading-tight text-[#C2DCE5]">必要量を計算中</span>
              )}
              <span className="whitespace-nowrap text-[15px] font-bold leading-tight text-[#C2DCE5]">
                前回 {lastMilkTime} / {lastMilkElapsed}
              </span>
            </div>
          </Button>
          <Button
            size="lg"
            className="relative h-28 select-none overflow-hidden bg-[#493116] p-0 text-2xl font-bold text-[#FFF4E5] hover:bg-[#493116] [-webkit-touch-callout:none]"
            onClick={() => onOpenModal("diaper", { babyId })}
            onContextMenu={(event) => event.preventDefault()}
            aria-label={`おむつを記録・交換必要度${diaperGaugePercent}%`}
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-[#C87512] transition-[width] duration-500"
              data-testid="diaper-gauge-fill"
              style={{ width: `${diaperGaugePercent}%` }}
            />
            <div className="relative z-10 flex h-full w-full flex-col items-center justify-start pt-5">
              <div className="flex items-center text-[#FFF4E5]">
                <Droplets className="mr-3 h-7 w-7" />
                おむつ
              </div>
              {diaperStockManagementEnabled ? (
              <span className="mt-0.5 text-[15px] font-bold leading-tight text-[#E8C59A]">
                {profile.diaperSize}・残り {remainingDiapers}
              </span>
              ) : null}
              <span className="whitespace-nowrap text-[15px] font-bold leading-tight text-[#E8C59A]">
                前回 {lastDiaperTime} / {lastDiaperElapsed}
              </span>
            </div>
          </Button>
        </div>

        {sleepManagementEnabled ? (
        <Button
          role="switch"
          aria-checked={sleeping}
          className={`relative mt-3 h-20 w-full select-none overflow-hidden rounded-md p-0 shadow-sm [-webkit-touch-callout:none] ${
            sleeping
              ? "border-violet-500/60 bg-[#29233E] hover:bg-[#29233E]"
              : "border-emerald-500/60 bg-[#173C2B] hover:bg-[#173C2B]"
          }`}
          onPointerDown={startSleepLongPress}
          onPointerUp={clearSleepLongPressTimer}
          onPointerLeave={clearSleepLongPressTimer}
          onPointerCancel={clearSleepLongPressTimer}
          onContextMenu={(event) => event.preventDefault()}
          onClick={() => {
            if (sleepLongPressTriggeredRef.current) {
              sleepLongPressTriggeredRef.current = false;
              return;
            }
            onAddEvent({
              babyId,
              type: sleeping ? "wake" : "sleepStart",
              note: sleeping ? "手動: 起床" : "手動: 入眠",
            });
          }}
          aria-label={`${sleeping ? "起床を記録" : "入眠を記録"}・長押しで時刻指定・${
            sleeping
              ? `必要睡眠時間の残り${sleepGauge.remainingPercent}%`
              : `活動時間経過${activityGauge.elapsedPercent}%`
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${
              sleeping ? "bg-[#6755A5]" : "bg-[#61A77F]"
            }`}
            data-testid="sleep-gauge-fill"
            data-percent={sleepButtonGaugePercent}
            style={{ width: `${sleepButtonGaugePercent}%` }}
          />
          <span className="relative z-10 flex h-full w-full items-stretch">
            <span
              className={`flex h-full w-[38%] shrink-0 flex-col items-center justify-center px-2 ${
                sleeping ? "text-[#F3F0FF]" : "text-[#F1FAF5]"
              }`}
              data-testid="sleep-state-label"
            >
              <span className="flex items-center gap-1.5 text-lg font-bold">
                {sleeping ? <Moon className="h-5 w-5 shrink-0" /> : <Sun className="h-5 w-5 shrink-0" />}
                <span>{sleeping ? "睡眠中" : "起床中"}</span>
              </span>
              <span className="mt-0.5 text-xs font-semibold opacity-80">
                長押しで時刻変更
              </span>
            </span>
            <span
              className={`flex min-w-0 flex-1 flex-col items-end justify-center px-3 text-right text-[15px] font-bold leading-tight ${
                sleeping ? "text-[#C9C1E6]" : "text-[#C4DDCE]"
              }`}
              data-testid="sleep-detail"
            >
              <span className="block">
                {sleeping ? `睡眠時間 ${currentSleepDuration ?? "0分"}` : activityElapsed}
              </span>
              <span className="block">前回睡眠 {previousSleepDuration}</span>
            </span>
          </span>
        </Button>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2 sm:col-span-2">
            <div className="flex flex-shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>{"\u4e00\u8a00\u30e1\u30e2"}</span>
            </div>
            <Input
              type="text"
              placeholder={"\u3072\u3068\u3053\u3068\u30e1\u30e2"}
              value={dailyNote}
              onChange={(e) => setDailyNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveDailyNote();
              }}
              className="h-7 flex-1 px-2 text-sm"
            />
            <Button size="icon" className="h-7 w-7 flex-shrink-0" onClick={handleSaveDailyNote} disabled={!dailyNote.trim()}>
              <Check className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={onOpenDailyReport} aria-label="show daily reports">
              <FileText className="h-4 w-4" />
            </Button>
          </div>

          <div className="overflow-hidden rounded-lg border bg-card/70 sm:col-span-2">
            <div className="flex items-center gap-2 p-2">
              <Button
                variant="ghost"
                className="h-7 min-w-0 flex-1 justify-start px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                onClick={() => setHealthOpen((open) => !open)}
                aria-expanded={healthOpen}
                aria-label="からだの記録を開閉"
              >
                <Thermometer className="h-4 w-4" />
                <span className="text-sm font-semibold">{"\u304b\u3089\u3060\u306e\u8a18\u9332"}</span>
                {healthOpen ? <ChevronDown className="ml-auto h-4 w-4" /> : <ChevronRight className="ml-auto h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenHealthChart();
                }}
                aria-label="show chart"
              >
                <Ruler className="h-4 w-4" />
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
          <h3 className="text-sm font-semibold text-muted-foreground">ログ</h3>
          <Button
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
          className="-mx-1 overflow-x-auto px-1 pb-2"
          data-horizontal-scroll="true"
          onTouchStart={(event) => event.stopPropagation()}
          onTouchEnd={(event) => event.stopPropagation()}
          onTouchCancel={(event) => event.stopPropagation()}
        >
          <div
            className={`grid w-max min-w-full gap-3 ${
              sleepManagementEnabled
                ? "grid-cols-[repeat(3,minmax(160px,1fr))]"
                : "grid-cols-[repeat(2,minmax(160px,1fr))]"
            }`}
          >
          <button
            type="button"
            className="min-w-0 text-left"
            onClick={() => onOpenHistory("milk", babyId)}
            aria-label={`${profile.displayName}の食事履歴を開く`}
          >
            <Card className="min-w-0 overflow-hidden transition-colors hover:border-sky-400/60 hover:bg-sky-500/5">
              <CardHeader className="p-3">
                <CardTitle className="text-base font-medium text-muted-foreground">食事</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-sky-300">{milkTotal}</span>
                    <span className="font-semibold text-muted-foreground">ml</span>
                  </div>
                  {milkProgressSummary ? (
                    <div className="hidden min-w-0 max-w-[52%] shrink overflow-hidden rounded-md border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-right min-[900px]:block">
                      <p className="truncate text-xs font-semibold leading-tight text-sky-100">
                        {milkProgressSummary.title}
                      </p>
                      <p className="truncate text-[11px] leading-tight text-sky-100/80">
                        {milkProgressSummary.detail}
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>ミルク</span>
                    <span>{milkEvents.length}回</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>離乳食</span>
                    <span>{solidFoodEvents.length}回</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>

          <button
            type="button"
            className="min-w-0 text-left"
            onClick={() => onOpenHistory("diaper", babyId)}
            aria-label={`${profile.displayName}のおむつ履歴を開く`}
          >
            <Card className="min-w-0 overflow-hidden transition-colors hover:border-amber-400/60 hover:bg-amber-500/5">
              <CardHeader className="p-3">
                <CardTitle className="text-base font-medium text-muted-foreground">おむつ</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-amber-300">{diaperCount}</span>
                    <span className="font-semibold text-muted-foreground">回</span>
                  </div>
                  {diaperEstimateSummary ? (
                    <div className="hidden min-w-0 max-w-[52%] shrink overflow-hidden rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-right min-[900px]:block">
                      <p className="truncate text-xs font-semibold leading-tight text-amber-100">
                        {diaperEstimateSummary.title}
                      </p>
                      <p className="truncate text-[11px] leading-tight text-amber-100/80">
                        {diaperEstimateSummary.detail}
                      </p>
                    </div>
                  ) : null}
                  {diaperStockManagementEnabled && lowStock ? (
                    <div className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-100">
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
              className="min-w-0 text-left"
              onClick={() => onOpenHistory("sleep", babyId)}
              aria-label={`${profile.displayName}の睡眠履歴を開く`}
            >
              <Card className="h-full min-w-0 overflow-hidden transition-colors hover:border-violet-400/60 hover:bg-violet-500/5">
                <CardHeader className="p-3">
                  <CardTitle className="text-base font-medium text-muted-foreground">睡眠</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="flex min-w-0 items-baseline gap-1">
                    <span className="whitespace-nowrap text-2xl font-bold text-violet-300">{sleepLogTotal}</span>
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
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
