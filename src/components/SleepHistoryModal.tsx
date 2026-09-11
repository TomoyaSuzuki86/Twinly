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

type SleepProgressComparison = {
  currentMinutes: number;
  trailingAverageMinutes: number;
  differenceMinutes: number;
  status: "higher" | "lower" | "same" | "no-history";
};

const NIGHT_START_HOUR = 19;
const NIGHT_END_HOUR = 6;
const NEXT_NIGHT_START_HOUR = 19;
const MINUTE_MS = 60 * 1000;

const startOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const getRangeStart = (timeRange: TimeRange, now: Date) => {
  const start = startOfDay(now);
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
  MINUTE_MS;

const sumSleepMinutes = (
  analysis: ReturnType<typeof analyzeSleepEvents>,
  windowStart: number,
  windowEnd: number
) =>
  buildRangeEntries(analysis, windowStart, windowEnd).reduce(
    (sum, entry) => sum + getOverlapMinutes(entry, windowStart, windowEnd),
    0
  );

const getAverageAwakeMinutes = (entries: SleepHistoryEntry[]) => {
  const chronological = [...entries].sort((left, right) => left.start - right.start);
  const awakeMinutes: number[] = [];

  for (let index = 1; index < chronological.length; index += 1) {
    const previous = chronological[index - 1];
    const current = chronological[index];
    if (current.start > previous.end) {
      awakeMinutes.push((current.start - previous.end) / MINUTE_MS);
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

const getNightRoutineWindowEndingOn = (day: Date) => {
  const bedtimeStart = new Date(day);
  bedtimeStart.setDate(bedtimeStart.getDate() - 1);
  bedtimeStart.setHours(NIGHT_START_HOUR, 0, 0, 0);

  const bedtimeEnd = new Date(day);
  bedtimeEnd.setHours(NIGHT_END_HOUR, 0, 0, 0);

  const wakeStart = new Date(day);
  wakeStart.setHours(NIGHT_END_HOUR, 0, 0, 0);

  const wakeEnd = new Date(day);
  wakeEnd.setHours(NEXT_NIGHT_START_HOUR, 0, 0, 0);

  return {
    bedtimeStart: bedtimeStart.getTime(),
    bedtimeEnd: bedtimeEnd.getTime(),
    wakeStart: wakeStart.getTime(),
    wakeEnd: wakeEnd.getTime(),
  };
};

const getAverageClockMinutes = (values: number[]) => {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const toBedtimeClockMinutes = (timestamp: number) => {
  const date = new Date(timestamp);
  const minutes = date.getHours() * 60 + date.getMinutes();
  return date.getHours() < NIGHT_END_HOUR ? minutes + 24 * 60 : minutes;
};

const toClockMinutes = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
};

const formatClockMinutes = (minutes: number | null) => {
  if (minutes === null) return "—";
  const rounded = Math.round(minutes) % (24 * 60);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
};

const getSleepProgressComparison = (
  analysis: ReturnType<typeof analyzeSleepEvents>,
  now: Date
): SleepProgressComparison => {
  const currentStart = startOfDay(now);
  const currentEnd = now.getTime();
  const currentMinutes = sumSleepMinutes(analysis, currentStart.getTime(), currentEnd);

  const trailingDailyMinutes = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(currentStart);
    day.setDate(day.getDate() - (index + 1));
    const cutoff = new Date(day);
    cutoff.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    return sumSleepMinutes(analysis, day.getTime(), cutoff.getTime());
  });

  const trailingAverageMinutes =
    trailingDailyMinutes.reduce((sum, minutes) => sum + minutes, 0) /
    trailingDailyMinutes.length;
  const differenceMinutes = currentMinutes - trailingAverageMinutes;
  const hasHistory = trailingDailyMinutes.some((minutes) => minutes > 0);

  return {
    currentMinutes,
    trailingAverageMinutes,
    differenceMinutes,
    status: !hasHistory
      ? "no-history"
      : Math.abs(differenceMinutes) < 0.5
        ? "same"
        : differenceMinutes > 0
          ? "higher"
          : "lower",
  };
};

const formatSleepComparison = (differenceMinutes: number) => {
  const rounded = Math.round(Math.abs(differenceMinutes));
  if (rounded === 0) return "過去7日平均とほぼ同じペースです";
  return differenceMinutes > 0
    ? `過去7日平均より ${formatSleepDuration(rounded)} 多めです`
    : `過去7日平均より ${formatSleepDuration(rounded)} 少なめです`;
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
  const sleepProgress = useMemo(() => getSleepProgressComparison(analysis, now), [analysis, now]);

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

        const routineWindow = getNightRoutineWindowEndingOn(day);
        const bedtime = [
          ...analysis.intervals.map((interval) => interval.start),
          ...(analysis.currentSleepStart ? [analysis.currentSleepStart.timestamp] : []),
        ]
          .filter(
            (timestamp) =>
              timestamp >= routineWindow.bedtimeStart &&
              timestamp < routineWindow.bedtimeEnd &&
              timestamp <= now.getTime()
          )
          .sort((left, right) => left - right)[0] ?? null;
        const wakeTime = analysis.intervals
          .map((interval) => interval.end)
          .filter(
            (timestamp) =>
              timestamp >= routineWindow.wakeStart &&
              timestamp < routineWindow.wakeEnd &&
              timestamp <= now.getTime()
          )
          .sort((left, right) => left - right)[0] ?? null;

        return { day, sleepMinutes, wakeCount, bedtime, wakeTime };
      }),
    [analysis, dayStarts, nightEntries, now]
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
  const averageBedtimeMinutes = getAverageClockMinutes(
    nightSummaries
      .map((summary) => summary.bedtime)
      .filter((timestamp): timestamp is number => timestamp !== null)
      .map(toBedtimeClockMinutes)
  );
  const averageWakeTimeMinutes = getAverageClockMinutes(
    nightSummaries
      .map((summary) => summary.wakeTime)
      .filter((timestamp): timestamp is number => timestamp !== null)
      .map(toClockMinutes)
  );

  const chartData = useMemo(
    () =>
      dayStarts.map((day, index) => {
        const dayStart = startOfDay(day);
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
            表示期間の睡眠リズムを確認できます。夜間は19:00〜翌6:00で集計します。
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
          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">平均入眠時間</div>
            <div className="mt-2 font-bold">{formatClockMinutes(averageBedtimeMinutes)}</div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">平均起床時間</div>
            <div className="mt-2 font-bold">{formatClockMinutes(averageWakeTimeMinutes)}</div>
          </div>
        </div>

        <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">現時点</span>
            <span className="font-semibold">{formatSleepDuration(sleepProgress.currentMinutes)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-muted-foreground">過去7日平均</span>
            <span className="font-semibold">
              {formatSleepDuration(sleepProgress.trailingAverageMinutes)}
            </span>
          </div>
          <div className="mt-3 font-medium" data-testid="sleep-progress-comparison">
            {sleepProgress.status === "no-history"
              ? "比較できる過去7日分の睡眠記録がまだありません"
              : formatSleepComparison(sleepProgress.differenceMinutes)}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="mb-1 text-sm font-medium">睡眠時間の推移</div>
          <div className="mb-4 text-xs text-muted-foreground">
            日ごとの総睡眠時間と、19:00〜翌6:00の夜間睡眠を比較します。
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
