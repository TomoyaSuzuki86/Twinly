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
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { Droplets, Milk } from "lucide-react";

type HistoryType = "milk" | "diaper";
type TimeRange = "1W" | "1M" | "3M";

type EventHistoryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  historyType: HistoryType;
  events: LogEvent[];
  profile: BabyProfile;
};

type ChartDatum = {
  label: string;
  count: number;
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

const rangeDays: Record<TimeRange, number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
};

const toPeriodLabel = (date: Date, timeRange: TimeRange) => {
  if (timeRange === "3M") {
    const start = new Date(date);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
    return fmtDate(start).slice(5);
  }

  return fmtDate(date).slice(5);
};

const buildChartData = (events: LogEvent[], timeRange: TimeRange): ChartDatum[] => {
  const now = new Date();
  const threshold = now.getTime() - rangeDays[timeRange] * 24 * 60 * 60 * 1000;
  const counts = new Map<string, number>();

  for (const event of events) {
    if (event.timestamp < threshold) continue;
    const label = toPeriodLabel(new Date(event.timestamp), timeRange);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([label, count]) => ({
    label,
    count,
  }));
};

const formatHistoryTitle = (historyType: HistoryType) =>
  historyType === "milk" ? "ミルク履歴" : "おむつ履歴";

const formatHistoryDescription = (historyType: HistoryType) =>
  historyType === "milk"
    ? "期間ごとの回数推移と、ミルク記録の一覧を確認できます。"
    : "期間ごとの回数推移と、おむつ記録の一覧を確認できます。";

const describeEvent = (event: LogEvent) => {
  if (event.type === "milk") {
    const method = event.milkMethod === "breast" ? "母乳" : "哺乳瓶";
    return `${event.milkMl ?? 0}ml・${method}`;
  }

  if (event.type === "diaper") {
    const kind =
      event.diaperKind === "pee" ? "おしっこ" : event.diaperKind === "poop" ? "うんち" : "両方";
    return `おむつ・${kind}`;
  }

  return "";
};

export function EventHistoryModal({
  open,
  onOpenChange,
  historyType,
  events,
  profile,
}: EventHistoryModalProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("1M");

  const filteredEvents = useMemo(
    () =>
      events
        .filter((event) => event.babyId === profile.babyId && event.type === historyType)
        .sort((a, b) => b.timestamp - a.timestamp),
    [events, historyType, profile.babyId]
  );

  const chartData = useMemo(() => buildChartData(filteredEvents, timeRange), [filteredEvents, timeRange]);

  const totalCount = filteredEvents.length;
  const totalMilkAmount = filteredEvents.reduce((sum, event) => sum + (event.milkMl ?? 0), 0);
  const chartColor =
    strokeMap[profile.iconGradient ?? ""] ?? (historyType === "milk" ? "#0ea5e9" : "#f59e0b");
  const Icon = historyType === "milk" ? Milk : Droplets;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[75vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            <span>
              {profile.displayName}の{formatHistoryTitle(historyType)}
            </span>
          </DialogTitle>
          <DialogDescription>{formatHistoryDescription(historyType)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border bg-card p-4">
                <div className="text-sm text-muted-foreground">累計回数</div>
                <div className="mt-2 text-3xl font-bold">{totalCount}</div>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <div className="text-sm text-muted-foreground">
                  {historyType === "milk" ? "累計ミルク量" : "直近の記録"}
                </div>
                <div className="mt-2 text-3xl font-bold">
                  {historyType === "milk"
                    ? `${totalMilkAmount}ml`
                    : filteredEvents[0]
                    ? fmtDate(new Date(filteredEvents[0].timestamp)).slice(5)
                    : "-"}
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">期間ごとの回数推移</div>
                  <div className="text-xs text-muted-foreground">
                    {timeRange === "3M" ? "3か月は週単位、それ以外は日単位で集計しています。" : "日ごとの記録回数を表示します。"}
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

              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number) => [`${value}回`, "回数"]} />
                    <Bar dataKey="count" fill={chartColor} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col rounded-xl border bg-card p-4">
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
