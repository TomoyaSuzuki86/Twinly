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
};

type FilterValue = "all" | BabyId;

const calcAgeLabel = (birthDate: string, at: Date) => {
  const birth = new Date(`${birthDate}T00:00:00`);
  const target = new Date(at);
  target.setHours(0, 0, 0, 0);
  if (target.getTime() < birth.getTime()) return "生後0か月0日";
  let months =
    (target.getFullYear() - birth.getFullYear()) * 12 +
    (target.getMonth() - birth.getMonth());
  let days = target.getDate() - birth.getDate();
  if (days < 0) {
    months -= 1;
    const lastDayPrevMonth = new Date(
      target.getFullYear(),
      target.getMonth(),
      0
    ).getDate();
    days = lastDayPrevMonth + days;
  }
  return `生後${months}か月${days}日`;
};

export function DailyReportModal({
  open,
  onOpenChange,
  events,
  profiles,
}: DailyReportModalProps) {
  const [filter, setFilter] = useState<FilterValue>("all");

  const reports = useMemo(() => {
    const sorted = events
      .filter((e) => e.type === "daily")
      .sort((a, b) => b.timestamp - a.timestamp);
    if (filter === "all") return sorted;
    return sorted.filter((e) => e.babyId === filter);
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
                const profile = profiles[report.babyId];
                const gradient =
                  iconGradients.find(
                    (g) => g.value === profile.iconGradient
                  ) ?? iconGradients[0];
                const createdAt = new Date(report.timestamp);
                return (
                  <div
                    key={report.id}
                    className={`flex items-start gap-3 rounded-lg border p-4 ${gradient.dimmedBgColor}`}
                  >
                    <div
                      className={`grid h-12 w-12 place-items-center rounded-full ${gradient.bgColor}`}
                    >
                      {profile.iconEmoji ? (
                        <span className="text-xl">{profile.iconEmoji}</span>
                      ) : (
                        <Baby className="h-6 w-6 text-white" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {profile.displayName}
                        </span>
                        <span>
                          {fmtDate(createdAt)} {fmtTime(createdAt)}
                        </span>
                        <span>
                          {calcAgeLabel(profile.birthDate, createdAt)}
                        </span>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm">
                        {report.note?.trim() || "（内容なし）"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
