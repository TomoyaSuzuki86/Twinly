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
import { fmtDate, fmtTime } from "@/lib/utils";
import type { BabyProfile, LogEvent } from "@/types";
import { Moon } from "lucide-react";
import { useMemo, useState } from "react";

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

const getRangeStart = (timeRange: TimeRange, now: Date) => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (rangeDays[timeRange] - 1));
  return start.getTime();
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

const getClippedDurationMinutes = (
  entry: SleepHistoryEntry,
  rangeStart: number,
  rangeEnd: number
) =>
  Math.max(0, Math.min(entry.end, rangeEnd) - Math.max(entry.start, rangeStart)) /
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

const getSimultaneousSleepMinutes = (
  ownEntries: SleepHistoryEntry[],
  otherEntries: SleepHistoryEntry[],
  rangeStart: number,
  rangeEnd: number
) => {
  const own = [...ownEntries]
    .sort((left, right) => left.start - right.start)
    .map((entry) => ({
      start: Math.max(entry.start, rangeStart),
      end: Math.min(entry.end, rangeEnd),
    }));
  const other = [...otherEntries]
    .sort((left, right) => left.start - right.start)
    .map((entry) => ({
      start: Math.max(entry.start, rangeStart),
      end: Math.min(entry.end, rangeEnd),
    }));

  let ownIndex = 0;
  let otherIndex = 0;
  let overlapMs = 0;

  while (ownIndex < own.length && otherIndex < other.length) {
    const ownEntry = own[ownIndex];
    const otherEntry = other[otherIndex];
    const overlapStart = Math.max(ownEntry.start, otherEntry.start);
    const overlapEnd = Math.min(ownEntry.end, otherEntry.end);

    if (overlapEnd > overlapStart) {
      overlapMs += overlapEnd - overlapStart;
    }

    if (ownEntry.end <= otherEntry.end) {
      ownIndex += 1;
    } else {
      otherIndex += 1;
    }
  }

  return overlapMs / (60 * 1000);
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
  const otherBabyId = profile.babyId === "A" ? "B" : "A";
  const otherAnalysis = useMemo(
    () => analyzeSleepEvents(events, otherBabyId),
    [events, otherBabyId]
  );
  const rangeStart = getRangeStart(timeRange, now);
  const rangeEnd = now.getTime();
  const entries = useMemo(
    () => buildRangeEntries(analysis, rangeStart, rangeEnd),
    [analysis, rangeEnd, rangeStart]
  );
  const otherEntries = useMemo(
    () => buildRangeEntries(otherAnalysis, rangeStart, rangeEnd),
    [otherAnalysis, rangeEnd, rangeStart]
  );

  const totalMinutes = entries.reduce(
    (sum, entry) => sum + getClippedDurationMinutes(entry, rangeStart, rangeEnd),
    0
  );
  const dailyAverageMinutes = totalMinutes / rangeDays[timeRange];
  const longestSleepMinutes = entries.reduce(
    (longest, entry) =>
      Math.max(longest, getClippedDurationMinutes(entry, rangeStart, rangeEnd)),
    0
  );
  const averageAwakeMinutes = getAverageAwakeMinutes(entries);
  const simultaneousSleepMinutes = getSimultaneousSleepMinutes(
    entries,
    otherEntries,
    rangeStart,
    rangeEnd
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[82vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Moon className="h-5 w-5" />
            <span>{profile.displayName}の睡眠履歴</span>
          </DialogTitle>
          <DialogDescription>
            表示期間の睡眠リズムと、入眠から起床までの履歴を確認できます。
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
            <div className="text-xs text-muted-foreground">合計睡眠</div>
            <div className="mt-2 font-bold text-violet-300">{formatSleepDuration(totalMinutes)}</div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">1日平均</div>
            <div className="mt-2 font-bold">{formatSleepDuration(dailyAverageMinutes)}</div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">最長睡眠</div>
            <div className="mt-2 font-bold">{formatSleepDuration(longestSleepMinutes)}</div>
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
            <div className="text-xs text-muted-foreground">2人同時睡眠</div>
            <div className="mt-2 font-bold text-violet-300">
              {formatSleepDuration(simultaneousSleepMinutes)}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">履歴一覧</div>
            <div className="text-xs text-muted-foreground">{entries.length}件</div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {entries.length === 0 ? (
              <div className="rounded-lg border-2 border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">
                まだ睡眠記録がありません
              </div>
            ) : (
              entries.map((entry) => (
                <div key={entry.key} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">
                      {entry.complete ? "睡眠" : "睡眠中"} {formatSleepDuration((entry.end - entry.start) / (60 * 1000))}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {fmtTime(new Date(entry.start))}〜{entry.complete ? fmtTime(new Date(entry.end)) : "現在"}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{fmtDate(new Date(entry.start))}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
