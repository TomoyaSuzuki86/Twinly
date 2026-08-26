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
  const entries = useMemo<SleepHistoryEntry[]>(() => {
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
  }, [analysis, rangeEnd, rangeStart]);
  const totalMinutes = entries.reduce(
    (sum, entry) =>
      sum + (Math.min(entry.end, rangeEnd) - Math.max(entry.start, rangeStart)) / (60 * 1000),
    0
  );
  const averageMinutes = entries.length === 0 ? 0 : totalMinutes / entries.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[75vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Moon className="h-5 w-5" />
            <span>{profile.displayName}の睡眠履歴</span>
          </DialogTitle>
          <DialogDescription>
            表示期間の睡眠時間・回数と、入眠から起床までの履歴を確認できます。
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

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">合計睡眠</div>
            <div className="mt-2 font-bold text-violet-300">{formatSleepDuration(totalMinutes)}</div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">睡眠回数</div>
            <div className="mt-2 font-bold">{entries.length}回</div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="text-xs text-muted-foreground">平均睡眠</div>
            <div className="mt-2 font-bold">{formatSleepDuration(averageMinutes)}</div>
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
