import { HistoryDialogShell } from "./HistoryDialogShell";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { BabyId, BabyProfile, LogEvent } from "@/types";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { Droplets, Utensils } from "lucide-react";
import { buildMilkProgressComparison } from "@/lib/milk-progress";
import { fmtDate, fmtTime } from "@/lib/utils";
import {
  buildBreastfeedingChartData,
  buildDiaperChartData,
  buildMilkChartData,
  buildSolidFoodChartData,
  filterEventsForTimeRange,
  formatAverageDiaperCount,
  formatAverageMilkAmount,
  getDefaultHistoryRange,
  rangeDays,
  summarizeBreastfeedingEvents,
  summarizeDiaperEvents,
  summarizeMilkEvents,
  summarizeSolidFoodEvents,
  type BreastfeedingChartDatum,
  type BreastfeedingStats,
  type DiaperChartDatum,
  type DiaperStats,
  type MilkChartDatum,
  type MilkStats,
  type SolidFoodChartDatum,
  type TimeRange,
} from "@/lib/event-history";

type HistoryType = "milk" | "diaper";
type MealHistoryTab = "milk" | "breast" | "solidFood";

type EventHistoryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  historyType: HistoryType;
  events: LogEvent[];
  profile: BabyProfile;
  activeDate: string;
  now: Date;
  onSwitchBaby?: (babyId: BabyId) => void;
};

const strokeMap: Record<string, string> = {
  "from-violet-500 to-fuchsia-500": "#8b5cf6",
  "from-sky-500 to-cyan-400": "#0ea5e9",
  "from-emerald-500 to-teal-400": "#10b981",
  "from-amber-500 to-orange-400": "#f59e0b",
  "from-rose-500 to-red-400": "#f43f5e",
  "from-indigo-500 to-blue-400": "#6366f1",
  "from-lime-500 to-green-400": "#84cc16",
  "from-pink-500 to-purple-400": "#ec4899",
};

const formatHistoryTitle = (historyType: HistoryType) =>
  historyType === "milk" ? "食事履歴" : "おむつ履歴";

const formatHistoryDescription = (historyType: HistoryType) =>
  historyType === "milk"
    ? "ミルク・母乳・離乳食を分けて確認できます。"
    : "表示期間のうんち・おしっこ回数と、期間別の詳細を確認できます。";

const formatMilkComparison = (difference: number) => {
  const rounded = Math.round(Math.abs(difference));
  if (rounded === 0) return "過去7日平均とほぼ同じペースです";
  return difference > 0
    ? `過去7日平均より ${rounded}ml 多めです`
    : `過去7日平均より ${rounded}ml 少なめです`;
};

function MilkSummaryCard({ title, stats }: { title: string; stats: MilkStats }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">回数</span>
          <span className="font-semibold">{stats.count}回</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">合計</span>
          <span className="font-semibold">{stats.amount}ml</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">1回平均</span>
          <span className="font-semibold">{formatAverageMilkAmount(stats.average)}</span>
        </div>
      </div>
    </div>
  );
}

function CountSummaryCard({ title, count, daySpan }: { title: string; count: number; daySpan: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">回数</span>
          <span className="font-semibold">{count}回</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">1日平均</span>
          <span className="font-semibold">{(count / daySpan).toFixed(1)}回/日</span>
        </div>
      </div>
    </div>
  );
}

function BreastTodayCard({ stats }: { stats: BreastfeedingStats }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">今日</div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/35 p-3">
          <div className="text-xs text-muted-foreground">左</div>
          <div className="mt-1 text-xl font-semibold">{stats.leftMinutes}分</div>
        </div>
        <div className="rounded-lg bg-muted/35 p-3">
          <div className="text-xs text-muted-foreground">右</div>
          <div className="mt-1 text-xl font-semibold">{stats.rightMinutes}分</div>
        </div>
      </div>
    </div>
  );
}

function BreastRangeCard({ stats }: { stats: BreastfeedingStats }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">表示期間</div>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-sm">
        <span className="text-muted-foreground">授乳回数</span>
        <span className="text-right font-semibold">{stats.count}回</span>
        <span className="text-muted-foreground">左 合計</span>
        <span className="text-right font-semibold">{stats.leftMinutes}分</span>
        <span className="text-muted-foreground">右 合計</span>
        <span className="text-right font-semibold">{stats.rightMinutes}分</span>
        <span className="text-muted-foreground">1日平均</span>
        <span className="text-right font-semibold">{Math.round(stats.dailyAverageMinutes)}分/日</span>
      </div>
    </div>
  );
}

function DiaperSummaryCard({ title, stats }: { title: string; stats: DiaperStats }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">累計回数</span>
          <span className="font-semibold">{stats.count}回</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">1日平均</span>
          <span className="font-semibold">{formatAverageDiaperCount(stats.dailyAverage)}</span>
        </div>
      </div>
    </div>
  );
}

function MilkPeriodTooltipCard({ title, datum }: { title: string; datum: MilkChartDatum }) {
  return (
    <div className="min-w-[200px] rounded-lg border bg-background/95 p-3 shadow-xl backdrop-blur">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span>{datum.total.count}回</span>
        <span>{datum.total.amount}ml</span>
        <span>{formatAverageMilkAmount(datum.total.average)}</span>
      </div>
    </div>
  );
}

function BreastPeriodTooltipCard({ title, datum }: { title: string; datum: BreastfeedingChartDatum }) {
  return (
    <div className="min-w-[200px] rounded-lg border bg-background/95 p-3 shadow-xl backdrop-blur">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-4"><span>左</span><span>{datum.leftMinutes}分</span></div>
        <div className="flex justify-between gap-4"><span>右</span><span>{datum.rightMinutes}分</span></div>
        <div className="flex justify-between gap-4"><span>授乳回数</span><span>{datum.count}回</span></div>
      </div>
    </div>
  );
}

function SolidFoodPeriodTooltipCard({ title, datum }: { title: string; datum: SolidFoodChartDatum }) {
  return (
    <div className="min-w-[180px] rounded-lg border bg-background/95 p-3 shadow-xl backdrop-blur">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-3 flex justify-between gap-4 text-sm">
        <span>離乳食</span>
        <span>{datum.count}回</span>
      </div>
    </div>
  );
}

function DiaperPeriodTooltipCard({ title, datum }: { title: string; datum: DiaperChartDatum }) {
  return (
    <div className="min-w-[220px] rounded-lg border bg-background/95 p-3 shadow-xl backdrop-blur">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-3 space-y-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">合算</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span>{datum.total.count}回</span>
            <span>{formatAverageDiaperCount(datum.total.dailyAverage)}</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">おしっこ</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span>{datum.pee.count}回</span>
            <span>{formatAverageDiaperCount(datum.pee.dailyAverage)}</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">うんち</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span>{datum.poop.count}回</span>
            <span>{formatAverageDiaperCount(datum.poop.dailyAverage)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomMilkTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: MilkChartDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  return <MilkPeriodTooltipCard title={`${datum.label} の集計`} datum={datum} />;
}

function CustomBreastTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: BreastfeedingChartDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  return <BreastPeriodTooltipCard title={`${datum.label} の集計`} datum={datum} />;
}

function CustomSolidFoodTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: SolidFoodChartDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  return <SolidFoodPeriodTooltipCard title={`${datum.label} の集計`} datum={datum} />;
}

function CustomDiaperTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: DiaperChartDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  return <DiaperPeriodTooltipCard title={`${datum.label} の集計`} datum={datum} />;
}

const getMealLogDetail = (event: LogEvent) => {
  if (event.type === "solidFood") return event.note?.trim() || "メモなし";
  if (event.milkMethod === "breast") {
    const sides = [
      event.breastLeftMinutes ? `左 ${event.breastLeftMinutes}分` : null,
      event.breastRightMinutes ? `右 ${event.breastRightMinutes}分` : null,
    ].filter(Boolean);
    return sides.join(" / ") || "授乳時間未記録";
  }
  return `${event.milkMl ?? 0}ml`;
};

const mealLogTitle: Record<MealHistoryTab, string> = {
  milk: "ミルク",
  breast: "母乳",
  solidFood: "離乳食",
};

export function EventHistoryModal({
  open,
  onOpenChange,
  historyType,
  events,
  profile,
  activeDate,
  now,
  onSwitchBaby,
}: EventHistoryModalProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>(getDefaultHistoryRange(historyType));
  const [mealTab, setMealTab] = useState<MealHistoryTab>("milk");
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(null);
  const chartAreaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setTimeRange(getDefaultHistoryRange(historyType));
    setMealTab("milk");
    setSelectedPeriodKey(null);
  }, [open, historyType]);

  useEffect(() => {
    setSelectedPeriodKey(null);
  }, [timeRange, historyType, profile.babyId, mealTab]);

  useEffect(() => {
    if (!selectedPeriodKey) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!chartAreaRef.current?.contains(event.target as Node)) {
        setSelectedPeriodKey(null);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [selectedPeriodKey]);

  const filteredEvents = useMemo(
    () =>
      events
        .filter(
          (event) =>
            event.babyId === profile.babyId &&
            (historyType === "milk"
              ? event.type === "milk" || event.type === "solidFood"
              : event.type === "diaper")
        )
        .sort((a, b) => b.timestamp - a.timestamp),
    [events, historyType, profile.babyId]
  );

  const visibleEvents = useMemo(
    () => filterEventsForTimeRange(filteredEvents, timeRange, now),
    [filteredEvents, timeRange, now]
  );

  const visibleMealLogs = useMemo(() => {
    if (historyType !== "milk") return [];
    return visibleEvents.filter((event) => {
      if (mealTab === "solidFood") return event.type === "solidFood";
      if (mealTab === "breast") return event.type === "milk" && event.milkMethod === "breast";
      return event.type === "milk" && event.milkMethod !== "breast";
    });
  }, [historyType, mealTab, visibleEvents]);

  const milkChartData = useMemo(
    () => buildMilkChartData(filteredEvents, timeRange, now),
    [filteredEvents, timeRange, now]
  );
  const breastChartData = useMemo(
    () => buildBreastfeedingChartData(filteredEvents, timeRange, now),
    [filteredEvents, timeRange, now]
  );
  const solidFoodChartData = useMemo(
    () => buildSolidFoodChartData(filteredEvents, timeRange, now),
    [filteredEvents, timeRange, now]
  );
  const diaperChartData = useMemo(
    () => buildDiaperChartData(filteredEvents, timeRange, now),
    [filteredEvents, timeRange, now]
  );

  const visibleMilkSummary = useMemo(() => summarizeMilkEvents(visibleEvents), [visibleEvents]);
  const visibleBreastSummary = useMemo(
    () => summarizeBreastfeedingEvents(visibleEvents, rangeDays[timeRange]),
    [visibleEvents, timeRange]
  );
  const visibleSolidFoodSummary = useMemo(
    () => summarizeSolidFoodEvents(visibleEvents, rangeDays[timeRange]),
    [visibleEvents, timeRange]
  );
  const todayBreastSummary = useMemo(() => {
    const todayKey = fmtDate(now);
    return summarizeBreastfeedingEvents(
      filteredEvents.filter((event) => fmtDate(new Date(event.timestamp)) === todayKey),
      1
    );
  }, [filteredEvents, now]);

  const milkProgress = useMemo(
    () =>
      buildMilkProgressComparison({
        events,
        babyId: profile.babyId,
        targetDate: activeDate,
        now,
      }),
    [activeDate, events, now, profile.babyId]
  );

  const visibleDiaperSummary = useMemo(
    () => summarizeDiaperEvents(visibleEvents, rangeDays[timeRange]),
    [visibleEvents, timeRange]
  );

  const selectedMilkDatum = milkChartData.find((datum) => datum.key === selectedPeriodKey) ?? null;
  const selectedSolidFoodDatum = solidFoodChartData.find((datum) => datum.key === selectedPeriodKey) ?? null;
  const selectedDiaperDatum = diaperChartData.find((datum) => datum.key === selectedPeriodKey) ?? null;
  const chartColor =
    strokeMap[profile.iconGradient ?? ""] ?? (historyType === "milk" ? "#0ea5e9" : "#f59e0b");
  const Icon = historyType === "milk" ? Utensils : Droplets;

  const handleBarClick = (
    state: { activeIndex?: number | string | null },
    data: Array<{ key: string }>
  ) => {
    const index = state.activeIndex;
    const clickedKey = index == null ? undefined : data[Number(index)]?.key;
    if (!clickedKey) {
      setSelectedPeriodKey(null);
      return;
    }
    setSelectedPeriodKey((current) => (current === clickedKey ? null : clickedKey));
  };

  return (
    <HistoryDialogShell
      open={open}
      onOpenChange={onOpenChange}
      profile={profile}
      titlePrefix={<Icon className="h-5 w-5" />}
      title={`${profile.displayName}の${formatHistoryTitle(historyType)}`}
      description={formatHistoryDescription(historyType)}
      onSwitchBaby={onSwitchBaby}
      className="flex h-[75vh] max-w-4xl flex-col overflow-hidden"
    >
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4">
          {historyType === "milk" ? (
            <Tabs value={mealTab} onValueChange={(value) => setMealTab(value as MealHistoryTab)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="milk">ミルク</TabsTrigger>
                <TabsTrigger value="breast">母乳</TabsTrigger>
                <TabsTrigger value="solidFood">離乳食</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}

          {historyType === "milk" && mealTab === "milk" ? (
            <div className="space-y-4">
              <MilkSummaryCard title="表示期間" stats={visibleMilkSummary.total} />
              <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>現時点</span>
                  <span className="font-semibold">{milkProgress.currentAmount}ml</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span>過去7日平均</span>
                  <span className="font-semibold">{Math.round(milkProgress.trailingAverage)}ml</span>
                </div>
                <div className="mt-3 font-medium">
                  {milkProgress.status === "no-history"
                    ? "比較できる過去7日分の記録がまだありません"
                    : formatMilkComparison(milkProgress.difference)}
                </div>
              </div>
            </div>
          ) : null}

          {historyType === "milk" && mealTab === "breast" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <BreastTodayCard stats={todayBreastSummary} />
              <BreastRangeCard stats={visibleBreastSummary} />
            </div>
          ) : null}

          {historyType === "milk" && mealTab === "solidFood" ? (
            <CountSummaryCard
              title="表示期間"
              count={visibleSolidFoodSummary.count}
              daySpan={rangeDays[timeRange]}
            />
          ) : null}

          {historyType === "diaper" ? (
            <div className="grid gap-4 md:grid-cols-3">
              <DiaperSummaryCard title="合算" stats={visibleDiaperSummary.total} />
              <DiaperSummaryCard title="おしっこ" stats={visibleDiaperSummary.pee} />
              <DiaperSummaryCard title="うんち" stats={visibleDiaperSummary.poop} />
            </div>
          ) : null}

          <div className="rounded-xl border bg-card p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-medium">
                  {historyType === "diaper"
                    ? "表示期間の推移"
                    : mealTab === "milk"
                    ? "ミルク回数の推移"
                    : mealTab === "breast"
                    ? "授乳時間の推移"
                    : "離乳食回数の推移"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {historyType === "diaper"
                    ? "表示範囲の回数を確認できます。"
                    : mealTab === "breast"
                    ? "左・右それぞれの授乳時間を分単位で表示します。"
                    : "表示範囲の記録回数を確認できます。"}
                </div>
              </div>
              <Tabs value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
                <TabsList>
                  <TabsTrigger value="1W">1週</TabsTrigger>
                  <TabsTrigger value="1M">1か月</TabsTrigger>
                  <TabsTrigger value="3M">3か月</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div ref={chartAreaRef} className="relative h-[320px]">
              {historyType === "milk" && mealTab === "milk" && selectedMilkDatum ? (
                <div className="pointer-events-none absolute right-3 top-3 z-10">
                  <MilkPeriodTooltipCard title={`${selectedMilkDatum.label} を選択中`} datum={selectedMilkDatum} />
                </div>
              ) : null}
              {historyType === "milk" && mealTab === "solidFood" && selectedSolidFoodDatum ? (
                <div className="pointer-events-none absolute right-3 top-3 z-10">
                  <SolidFoodPeriodTooltipCard title={`${selectedSolidFoodDatum.label} を選択中`} datum={selectedSolidFoodDatum} />
                </div>
              ) : null}
              {historyType === "diaper" && selectedDiaperDatum ? (
                <div className="pointer-events-none absolute right-3 top-3 z-10">
                  <DiaperPeriodTooltipCard title={`${selectedDiaperDatum.label} を選択中`} datum={selectedDiaperDatum} />
                </div>
              ) : null}

              {historyType === "milk" && mealTab === "breast" ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={breastChartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} unit="分" />
                    <Tooltip content={<CustomBreastTooltip />} />
                    <Line type="monotone" dataKey="leftMinutes" name="左" stroke="#f472b6" strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="rightMinutes" name="右" stroke="#60a5fa" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : historyType === "milk" && mealTab === "solidFood" ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={solidFoodChartData}
                    margin={{ top: 8, right: 16, left: -16, bottom: 0 }}
                    onClick={(state) => handleBarClick(state, solidFoodChartData)}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomSolidFoodTooltip />} />
                    <Bar dataKey="count" fill="#a78bfa" radius={[8, 8, 0, 0]}>
                      {solidFoodChartData.map((datum) => {
                        const isSelected = selectedPeriodKey === datum.key;
                        const dimmed = selectedPeriodKey !== null && !isSelected;
                        return (
                          <Cell
                            key={datum.key}
                            fill="#a78bfa"
                            fillOpacity={dimmed ? 0.35 : 1}
                            stroke={isSelected ? "#ffffff" : undefined}
                            strokeWidth={isSelected ? 2 : 0}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : historyType === "milk" ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={milkChartData}
                    margin={{ top: 8, right: 16, left: -16, bottom: 0 }}
                    onClick={(state) => handleBarClick(state, milkChartData)}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomMilkTooltip />} />
                    <Bar dataKey="total.count" fill={chartColor} radius={[8, 8, 0, 0]}>
                      {milkChartData.map((datum) => {
                        const isSelected = selectedPeriodKey === datum.key;
                        const dimmed = selectedPeriodKey !== null && !isSelected;
                        return (
                          <Cell
                            key={datum.key}
                            fill={chartColor}
                            fillOpacity={dimmed ? 0.35 : 1}
                            stroke={isSelected ? "#ffffff" : undefined}
                            strokeWidth={isSelected ? 2 : 0}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={diaperChartData}
                    margin={{ top: 8, right: 16, left: -16, bottom: 0 }}
                    onClick={(state) => handleBarClick(state, diaperChartData)}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomDiaperTooltip />} />
                    <Bar dataKey="total.count" fill={chartColor} radius={[8, 8, 0, 0]}>
                      {diaperChartData.map((datum) => {
                        const isSelected = selectedPeriodKey === datum.key;
                        const dimmed = selectedPeriodKey !== null && !isSelected;
                        return (
                          <Cell
                            key={datum.key}
                            fill={chartColor}
                            fillOpacity={dimmed ? 0.35 : 1}
                            stroke={isSelected ? "#ffffff" : undefined}
                            strokeWidth={isSelected ? 2 : 0}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {historyType === "milk" ? (
            <div className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{mealLogTitle[mealTab]}の記録</div>
                <div className="text-xs text-muted-foreground">{visibleMealLogs.length}件</div>
              </div>
              {visibleMealLogs.length ? (
                <div className="divide-y">
                  {visibleMealLogs.map((event) => (
                    <div key={event.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <div className="font-medium">{getMealLogDetail(event)}</div>
                        {event.type !== "solidFood" && event.note?.trim() ? (
                          <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{event.note.trim()}</div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <div>{fmtDate(new Date(event.timestamp)).slice(5)}</div>
                        <div className="mt-0.5">{fmtTime(new Date(event.timestamp))}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  この期間の{mealLogTitle[mealTab]}記録はありません
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </HistoryDialogShell>
  );
}
