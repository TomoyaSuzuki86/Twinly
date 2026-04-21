import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BabyProfile, LogEvent } from "@/types";
import { fmtDate, fmtTime } from "@/lib/utils";
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
} from "recharts";
import { Droplets, Milk } from "lucide-react";
import {
  buildDiaperChartData,
  buildMilkChartData,
  filterEventsForTimeRange,
  formatAverageDiaperCount,
  formatAverageMilkAmount,
  getDefaultHistoryRange,
  rangeDays,
  summarizeDiaperEvents,
  summarizeMilkEvents,
  type DiaperChartDatum,
  type DiaperStats,
  type MilkChartDatum,
  type MilkStats,
  type TimeRange,
} from "@/lib/event-history";

type HistoryType = "milk" | "diaper";

type EventHistoryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  historyType: HistoryType;
  events: LogEvent[];
  profile: BabyProfile;
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
  historyType === "milk" ? "ミルク履歴" : "おむつ履歴";

const formatHistoryDescription = (historyType: HistoryType) =>
  historyType === "milk"
    ? "表示期間の累計回数、ミルク量、平均量と、期間別の詳細を確認できます。"
    : "表示期間のうんち・おしっこ回数と、期間別の詳細を確認できます。";

const describeEvent = (event: LogEvent) => {
  if (event.type === "milk") {
    const method = event.milkMethod === "breast" ? "母乳" : "哺乳瓶";
    return `${event.milkMl ?? 0}ml・${method}`;
  }

  if (event.type === "diaper") {
    const kind = event.diaperKind === "pee" ? "おしっこ" : event.diaperKind === "poop" ? "うんち" : "両方";
    return `おむつ・${kind}`;
  }

  return "";
};

function MilkSummaryCard({ title, stats }: { title: string; stats: MilkStats }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">累計回数</span>
          <span className="font-semibold">{stats.count}回</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">累計量</span>
          <span className="font-semibold">{stats.amount}ml</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">平均量</span>
          <span className="font-semibold">{formatAverageMilkAmount(stats.average)}</span>
        </div>
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
    <div className="min-w-[220px] rounded-lg border bg-background/95 p-3 shadow-xl backdrop-blur">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-3 space-y-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">合算</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span>{datum.total.count}回</span>
            <span>{datum.total.amount}ml</span>
            <span>{formatAverageMilkAmount(datum.total.average)}</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">哺乳瓶</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span>{datum.bottle.count}回</span>
            <span>{datum.bottle.amount}ml</span>
            <span>{formatAverageMilkAmount(datum.bottle.average)}</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">母乳</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span>{datum.breast.count}回</span>
            <span>{datum.breast.amount}ml</span>
            <span>{formatAverageMilkAmount(datum.breast.average)}</span>
          </div>
        </div>
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

export function EventHistoryModal({
  open,
  onOpenChange,
  historyType,
  events,
  profile,
}: EventHistoryModalProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>(getDefaultHistoryRange(historyType));
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(null);
  const chartAreaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setTimeRange(getDefaultHistoryRange(historyType));
    setSelectedPeriodKey(null);
  }, [open, historyType]);

  useEffect(() => {
    setSelectedPeriodKey(null);
  }, [timeRange, historyType, profile.babyId]);

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
        .filter((event) => event.babyId === profile.babyId && event.type === historyType)
        .sort((a, b) => b.timestamp - a.timestamp),
    [events, historyType, profile.babyId]
  );

  const now = useMemo(() => new Date(), [open, timeRange, historyType, filteredEvents.length]);
  const visibleEvents = useMemo(
    () => filterEventsForTimeRange(filteredEvents, timeRange, now),
    [filteredEvents, timeRange, now]
  );
  const milkChartData = useMemo(
    () => buildMilkChartData(filteredEvents, timeRange, now),
    [filteredEvents, timeRange, now]
  );
  const diaperChartData = useMemo(
    () => buildDiaperChartData(filteredEvents, timeRange, now),
    [filteredEvents, timeRange, now]
  );
  const visibleMilkSummary = useMemo(() => summarizeMilkEvents(visibleEvents), [visibleEvents]);
  const visibleDiaperSummary = useMemo(
    () => summarizeDiaperEvents(visibleEvents, rangeDays[timeRange]),
    [visibleEvents, timeRange]
  );
  const selectedMilkDatum = milkChartData.find((datum) => datum.key === selectedPeriodKey) ?? null;
  const selectedDiaperDatum = diaperChartData.find((datum) => datum.key === selectedPeriodKey) ?? null;
  const chartColor =
    strokeMap[profile.iconGradient ?? ""] ?? (historyType === "milk" ? "#0ea5e9" : "#f59e0b");
  const Icon = historyType === "milk" ? Milk : Droplets;

  const handleChartClick = (state: { activePayload?: Array<{ payload?: { key?: string } }> } | undefined) => {
    const clickedKey = state?.activePayload?.[0]?.payload?.key;
    if (!clickedKey) {
      setSelectedPeriodKey(null);
      return;
    }

    setSelectedPeriodKey((current) => (current === clickedKey ? null : clickedKey));
  };

  const chartData = historyType === "milk" ? milkChartData : diaperChartData;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[75vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            <span>
              {profile.displayName}の{formatHistoryTitle(historyType)}
            </span>
          </DialogTitle>
          <DialogDescription>{formatHistoryDescription(historyType)}</DialogDescription>
        </DialogHeader>

        <div className="grid flex-1 gap-4 overflow-y-auto md:min-h-0 md:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] md:overflow-hidden">
          <div className="space-y-4 md:min-h-0 md:overflow-y-auto md:pr-1">
            {historyType === "milk" ? (
              <div className="grid gap-4 md:grid-cols-3">
                <MilkSummaryCard title="合算" stats={visibleMilkSummary.total} />
                <MilkSummaryCard title="哺乳瓶" stats={visibleMilkSummary.bottle} />
                <MilkSummaryCard title="母乳" stats={visibleMilkSummary.breast} />
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                <DiaperSummaryCard title="合算" stats={visibleDiaperSummary.total} />
                <DiaperSummaryCard title="おしっこ" stats={visibleDiaperSummary.pee} />
                <DiaperSummaryCard title="うんち" stats={visibleDiaperSummary.poop} />
              </div>
            )}

            <div className="rounded-xl border bg-card p-4">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">表示期間の推移</div>
                  <div className="text-xs text-muted-foreground">
                    {historyType === "milk"
                      ? "表示範囲の集計を上部に表示します。バーを選ぶと期間別の詳細を確認できます。"
                      : "表示範囲の回数を上部に表示します。バーを選ぶと期間別の詳細を確認できます。"}
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
                {historyType === "milk" && selectedMilkDatum ? (
                  <div className="pointer-events-none absolute right-3 top-3 z-10">
                    <MilkPeriodTooltipCard title={`${selectedMilkDatum.label} を選択中`} datum={selectedMilkDatum} />
                  </div>
                ) : null}
                {historyType === "diaper" && selectedDiaperDatum ? (
                  <div className="pointer-events-none absolute right-3 top-3 z-10">
                    <DiaperPeriodTooltipCard title={`${selectedDiaperDatum.label} を選択中`} datum={selectedDiaperDatum} />
                  </div>
                ) : null}

                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }} onClick={handleChartClick}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    {historyType === "milk" ? (
                      <Tooltip content={<CustomMilkTooltip />} />
                    ) : (
                      <Tooltip content={<CustomDiaperTooltip />} />
                    )}
                    <Bar dataKey={historyType === "milk" ? "total.count" : "total.count"} fill={chartColor} radius={[8, 8, 0, 0]}>
                      {chartData.map((datum) => {
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
              </div>
            </div>
          </div>

          <div className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border bg-card p-4 md:min-h-0">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">履歴一覧</div>
              <div className="text-xs text-muted-foreground">{filteredEvents.length}件</div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
              {filteredEvents.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">
                  まだ記録がありません
                </div>
              ) : (
                filteredEvents.map((event) => (
                  <div key={event.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{describeEvent(event)}</div>
                      <div className="text-sm text-muted-foreground">{fmtTime(new Date(event.timestamp))}</div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{fmtDate(new Date(event.timestamp))}</div>
                    {event.note ? <div className="mt-2 text-sm text-muted-foreground">{event.note}</div> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
