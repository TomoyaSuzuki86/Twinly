import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyzeSleepEvents, formatSleepDuration } from "@/lib/sleep";
import { rangeDays, type TimeRange } from "@/lib/event-history";
import type { BabyProfile, LogEvent } from "@/types";
import { Moon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SleepHistoryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: LogEvent[];
  profile: BabyProfile;
  now: Date;
};

type SleepHistoryEntry = {
  key: string;
  start: number;
  end: number;
  complete: boolean;
};

type NightWindow = {
  start: number;
  end: number;
};

const NIGHT_START_HOUR = 19;
const NIGHT_END_HOUR = 7;

const getRangeStart = (timeRange: TimeRange, now: Date) => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (rangeDays[timeRange] - 1));
  return start.getTime();
};

const getRangeDayStarts = (timeRange: TimeRange, now: Date) => {
  const start = new Date(getRangeStart(timeRange, now));
  return Array.from({ length: rangeDays[timeRange] }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

const buildRangeEntries = (
  analysis: ReturnType<typeof analyzeSleepEvents>,
  rangeStart: number,
  rangeEnd: number
): SleepHistoryEntry[] => {
  const completed = analysis.intervals.map((interval) => ({
    key: interval.wakeEventId,
    start: interval.start,
    end: interval.end,
    complete: true,
  }));
  const active = analysis.currentSleepStart
    ? [
        {
          key: analysis.currentSleepStart.id,
          start: analysis.currentSleepStart.timestamp,
          end: rangeEnd,
          complete: false,
        },
      ]
    : [];

  return [...completed, ...active]
    .filter((entry) => entry.end > rangeStart && entry.start <= rangeEnd)
    .sort((left, right) => right.start - left.start);
};

const getOverlapMinutes = (
  entry: SleepHistoryEntry,
  windowStart: number,
  windowEnd: number
) =>
  Math.max(0, Math.min(entry.end, windowEnd) - Math.max(entry.start, windowStart)) /
  (60 * 1000);

const getAverageAwakeMinutes = (entries: SleepHistoryEntry[]) => {
  const chronological = [...entries].sort((left, right) => left.start - right.start);
  const awakeMinutes: number[] = [];

  for (let index = 1; index < chronological.length; index += 1) {
    const previous = chronological[index - 1];
    const current = chronological[index];
    if (current.start > previous.end) {
      awakeMinutes.push((current.start - previous.end) / (60 * 1000));
    }
  }

  if (awakeMinutes.length === 0) return null;
  return awakeMinutes.reduce((sum, minutes) => sum + minutes, 0) / awakeMinutes.length;
};

const getNightWindowEndingOn = (day: Date, now: Date): NightWindow => {
  const end = new Date(day);
  end.setHours(NIGHT_END_HOUR, 0, 0, 0);

  const start = new Date(day);
  start.setDate(start.getDate() - 1);
  start.setHours(NIGHT_START_HOUR, 0, 0, 0);

  return {
    start: start.getTime(),
    end: Math.min(end.getTime(), now.getTime()),
  };
};

const formatShortDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

export function SleepHistoryModal({
  open,
  onOpenChange,
  events,
  profile,
  now,
}: SleepHistoryModalProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("1W");
  const analysis = useMemo(
    () => analyzeSleepEvents(events, profile.babyId),
    [events, profile.babyId]
  );
  const rangeStart = getRangeStart(timeRange, now);
  const rangeEnd = now.getTime();
  const dayStarts = useMemo(() => getRangeDayStarts(timeRange, now), [timeRange, now]);

  const entries = useMemo(
    () => buildRangeEntries(analysis, rangeStart, rangeEnd),
    [analysis, rangeEnd, rangeStart]
  );

  const earliestNightStart = useMemo(() => {
    const firstDay = dayStarts[0] ?? new Date(rangeStart);
    return getNightWindowEndingOn(firstDay, now).start;
  }, [dayStarts, now, rangeStart]);

  const nightEntries = useMemo(
    () => buildRangeEntries(analysis, earliestNightStart, rangeEnd),
    [analysis, earliestNightStart, rangeEnd]
  );

  const totalMinutes = entries.reduce(
    (sum, entry) => sum + getOverlapMinutes(entry, rangeStart, rangeEnd),
    0
  );
  const dailyAverageMinutes = totalMinutes / rangeDays[timeRange];
  const averageAwakeMinutes = getAverageAwakeMinutes(entries);

  const longestSleep = entries.reduce<{
    entry: SleepHistoryEntry | null;
    minutes: number;
  }>(
    (longest, entry) => {
      const minutes = getOverlapMinutes(entry, rangeStart, rangeEnd);
      return minutes > longest.minutes ? { entry, minutes } : longest;
    },
    { entry: null, minutes: 0 }
  );

  const nightSummaries = useMemo(
    () =>
      dayStarts.map((day) => {
        const window = getNightWindowEndingOn(day, now);
        const sleepMinutes = nightEntries.reduce(
          (sum, entry) => sum + getOverlapMinutes(entry, window.start, window.end),
          0
        );
        const wakeCount = nightEntries.filter(
          (entry) =>
            entry.complete &&
            entry.end >= window.start &&
            entry.end < window.end
        ).length;

        return { day, sleepMinutes, wakeCount };
      }),
    [dayStarts, nightEntries, now]
  );

  const averageNightSleepMinutes =
    nightSummaries.length === 0
      ? 0
      : nightSummaries.reduce((sum, summary) => sum + summary.sleepMinutes, 0) /
        nightSummaries.length;
  const averageNightWakeCount =
    nightSummaries.length === 0
      ? 0
      : nightSummaries.reduce((sum, summary) => sum + summary.wakeCount, 0) /
        nightSummaries.length;

  const chartData = useMemo(
    () =>
      dayStarts.map((day, index) => {
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const nextDay = new Date(dayStart);
        nextDay.setDate(nextDay.getDate() + 1);
        const dayEnd = Math.min(nextDay.getTime(), rangeEnd);
        const dailyMinutes = entries.reduce(
          (sum, entry) => sum + getOverlapMinutes(entry, dayStart.getTime(), dayEnd),
          0
        );

        return {
          date: `${day.getMonth() + 1}/${day.getDate()}`,
          totalMinutes: Math.round(dailyMinutes),
          nightMinutes: Math.round(nightSummaries[index]?.sleepMinutes ?? 0),
        };
      }),
    [dayStarts, entries, nightSummaries, rangeEnd]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-2xl flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Moon className="h-5 w-5" />
            <span>{profile.displayName}の睡眠履歴</span>
          </DialogTitle>
          <DialogDescription>
            表示期間の睡眠リズムを確認できます。夜間は19:00〜翌7:00で集計します。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end">
          <Tabs value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRange)}>
            <TabsList>
              <TabsTrigger value="1W">1週</TabsTrigger>
              <TabsTrigger value="1M">1か月</TabsTrigger>
              <TabsTrigger value="3M">3か月</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">1日平均</div>
            <div className="mt-2 font-bold text-violet-300">
              {formatSleepDuration(dailyAverageMinutes)}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>最長睡眠</span>
              {longestSleep.entry && (
                <span data-testid="longest-sleep-date" className="text-[10px]">
                  {formatShortDate(longestSleep.entry.start)}
                </span>
              )}
            </div>
            <div className="mt-2 font-bold">{formatSleepDuration(longestSleep.minutes)}</div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">睡眠回数</div>
            <div className="mt-2 font-bold">{entries.length}回</div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">平均覚醒時間</div>
            <div className="mt-2 font-bold">
              {averageAwakeMinutes === null ? "—" : formatSleepDuration(averageAwakeMinutes)}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">平均夜間睡眠</div>
            <div className="mt-2 font-bold text-violet-300">
              {formatSleepDuration(averageNightSleepMinutes)}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">平均夜間覚醒</div>
            <div className="mt-2 font-bold">{averageNightWakeCount.toFixed(1)}回/夜</div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="mb-1 text-sm font-medium">睡眠時間の推移</div>
          <div className="mb-4 text-xs text-muted-foreground">
            日ごとの総睡眠時間と、19:00〜翌7:00の夜間睡眠を比較します。
          </div>
          <div data-testid="sleep-history-chart" className="h-64 w-full text-violet-400">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                <XAxis dataKey="date" minTickGap={24} tick={{ fontSize: 11 }} />
                <YAxis
                  width={42}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => `${Math.round(Number(value) / 60)}h`}
                />
                <Tooltip
                  formatter={(value) => formatSleepDuration(Number(value))}
                  labelFormatter={(label) => `${label}`}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="totalMinutes"
                  name="1日睡眠"
                  stroke="currentColor"
                  strokeWidth={2}
                  dot={timeRange === "1W"}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="nightMinutes"
                  name="夜間睡眠"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
