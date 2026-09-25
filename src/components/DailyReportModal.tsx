import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BabyId, BabyProfile, LogEvent } from "@/types";
import { fmtDate, fmtTime, iconGradients } from "@/lib/utils";
import { Baby } from "lucide-react";
import { useMemo, useState } from "react";

type DailyReportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: LogEvent[];
  profiles: Record<BabyId, BabyProfile>;
  onSelectEvent: (selection: {
    eventId: string;
    repairEventId?: string;
    sharedDailyId?: string;
  }) => void;
};

type FilterValue = "all" | BabyId;
type DailyReportItem = {
  key: string;
  event: LogEvent;
  babyIds: BabyId[];
  repairEventId?: string;
  sharedDailyId?: string;
};

const sameLegacyCopiedDaily = (left: LogEvent, right: LogEvent) =>
  left.type === "daily" &&
  right.type === "daily" &&
  left.babyId !== right.babyId &&
  left.timestamp === right.timestamp &&
  (left.note ?? "") === (right.note ?? "") &&
  left.customMemoId === right.customMemoId &&
  left.customMemoEmoji === right.customMemoEmoji;

const uniqueBabyIds = (events: LogEvent[]) =>
  (["A", "B"] as BabyId[]).filter((babyId) => events.some((event) => event.babyId === babyId));

export function DailyReportModal({
  open,
  onOpenChange,
  events,
  profiles,
  onSelectEvent,
}: DailyReportModalProps) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const reports = useMemo(() => {
    const dailyEvents = events
      .filter((event) => event.type === "daily")
      .sort((a, b) => b.timestamp - a.timestamp);
    const bySharedId = new Map<string, LogEvent[]>();
    dailyEvents.forEach((event) => {
      if (!event.sharedDailyId) return;
      const group = bySharedId.get(event.sharedDailyId) ?? [];
      group.push(event);
      bySharedId.set(event.sharedDailyId, group);
    });

    const seenSharedIds = new Set<string>();
    const consumedEventIds = new Set<string>();
    const items: DailyReportItem[] = [];
    dailyEvents.forEach((event) => {
      if (consumedEventIds.has(event.id)) return;

      if (!event.sharedDailyId) {
        items.push({ key: event.id, event, babyIds: [event.babyId] });
        consumedEventIds.add(event.id);
        return;
      }

      if (seenSharedIds.has(event.sharedDailyId)) return;
      seenSharedIds.add(event.sharedDailyId);
      const group = bySharedId.get(event.sharedDailyId) ?? [event];
      group.forEach((member) => consumedEventIds.add(member.id));

      if (uniqueBabyIds(group).length === 1) {
        const orphanedOriginal = dailyEvents.find(
          (candidate) =>
            !candidate.sharedDailyId &&
            !consumedEventIds.has(candidate.id) &&
            sameLegacyCopiedDaily(event, candidate)
        );
        if (orphanedOriginal) {
          consumedEventIds.add(orphanedOriginal.id);
          items.push({
            key: `shared:${event.sharedDailyId}`,
            event,
            babyIds: uniqueBabyIds([...group, orphanedOriginal]),
            repairEventId: orphanedOriginal.id,
            sharedDailyId: event.sharedDailyId,
          });
          return;
        }
      }

      items.push({
        key: `shared:${event.sharedDailyId}`,
        event,
        babyIds: uniqueBabyIds(group),
        sharedDailyId: event.sharedDailyId,
      });
    });

    if (filter === "all") return items;
    return items.filter((item) => item.babyIds.includes(filter));
  }, [events, filter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">
            一言日記
            <Select
              value={filter}
              onValueChange={(value) => setFilter(value as FilterValue)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="表示対象" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">両方</SelectItem>
                <SelectItem value="A">{profiles.A.displayName}</SelectItem>
                <SelectItem value="B">{profiles.B.displayName}</SelectItem>
              </SelectContent>
            </Select>
          </DialogTitle>
          <DialogDescription>
            一言日記を新しい順に表示します。
          </DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto pr-2">
          {reports.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              日次レポートがありません。
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => {
                const firstBabyId = report.babyIds[0] ?? report.event.babyId;
                const firstProfile = profiles[firstBabyId];
                const createdAt = new Date(report.event.timestamp);
                const shared = report.babyIds.length > 1;
                const label = report.babyIds.map((babyId) => profiles[babyId].displayName).join(" & ");
                const firstGradient =
                  iconGradients.find((gradient) => gradient.value === firstProfile.iconGradient) ?? iconGradients[0];
                return (
                  <button
                    key={report.key}
                    type="button"
                    data-testid={`daily-report-${report.key}`}
                    aria-label={`${label || firstProfile.displayName}の日記を編集`}
                    className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${shared ? "bg-card/80" : firstGradient.dimmedBgColor}`}
                    onClick={() =>
                      onSelectEvent({
                        eventId: report.event.id,
                        repairEventId: report.repairEventId,
                        sharedDailyId: report.sharedDailyId,
                      })
                    }
                  >
                    {shared ? (
                      <div className="relative h-12 w-16 flex-shrink-0" aria-label={`${label}の共通メモ`}>
                        {report.babyIds.map((babyId, index) => {
                          const profile = profiles[babyId];
                          const gradient =
                            iconGradients.find((option) => option.value === profile.iconGradient) ?? iconGradients[0];
                          return (
                            <div
                              key={babyId}
                              className={`absolute top-0 grid h-12 w-12 place-items-center rounded-full ring-2 ring-background ${gradient.bgColor}`}
                              style={{ left: `${index * 18}px`, zIndex: report.babyIds.length - index }}
                            >
                              {profile.iconEmoji ? (
                                <span className="text-xl">{profile.iconEmoji}</span>
                              ) : (
                                <Baby className="h-6 w-6 text-white" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={`grid h-12 w-12 flex-shrink-0 place-items-center rounded-full ${firstGradient.bgColor}`}>
                        {firstProfile.iconEmoji ? (
                          <span className="text-xl">{firstProfile.iconEmoji}</span>
                        ) : (
                          <Baby className="h-6 w-6 text-white" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{label || firstProfile.displayName}</span>
                        <span>{fmtDate(createdAt)} {fmtTime(createdAt)}</span>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm">
                        {report.event.note?.trim() || "（内容なし）"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
