import { Baby, FileText, Milk, Droplets } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BabyId, BabyProfile, LogEvent } from "@/types";
import { daysSince } from "@/lib/utils";
import { EventCard } from "./EventCard";

type BabyPanelProps = {
  profile: BabyProfile;
  events: LogEvent[];
  lowStock: { size: string; remaining: number } | null;
  onOpenModal: (
    kind: "milk" | "diaper" | "edit",
    payload: { babyId: BabyId } | { eventId: string }
  ) => void;
  onAddDailyReport: (babyId: BabyId, events: LogEvent[]) => void;
  onDeleteEvent: (eventId: string) => void;
};

export function BabyPanel({
  profile,
  events,
  lowStock,
  onOpenModal,
  onAddDailyReport,
  onDeleteEvent,
}: BabyPanelProps) {
  const p = profile;
  const babyId = p.babyId;
  const ageDays = daysSince(p.birthDate);

  const milkEvents = events.filter((e) => e.type === "milk");
  const diaperEvents = events.filter((e) => e.type === "diaper");

  const milkTotal = milkEvents.reduce((sum, e) => sum + (e.milkMl ?? 0), 0);
  const diaperCount = diaperEvents.length;
  const rem = p.diaperStockBySize[p.diaperSize] ?? 0;

  const purchaseUrl = p.diaperPurchaseUrl?.trim();

  return (
    <Card className="flex flex-col border-border/60">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <div
              className={`grid h-14 w-14 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br ${
                p.iconGradient ?? "from-violet-500 to-fuchsia-500"
              }`}
            >
              {p.iconEmoji ? (
                <span className="text-3xl">{p.iconEmoji}</span>
              ) : (
                <Baby className="h-8 w-8 text-white" />
              )}
            </div>
            <div>
              <CardTitle>{p.displayName}</CardTitle>
              <CardDescription className="mt-1">生後{ageDays}日</CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAddDailyReport(babyId, events)}
            title="日次レポート"
            className="flex-shrink-0"
          >
            <FileText className="mr-2 h-4 w-4" />
            まとめ
          </Button>
        </div>
        <div className="pt-4 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            おむつ {p.diaperSize}・残り {rem}
          </Badge>
          {lowStock ? <Badge variant="destructive">残りわずか</Badge> : null}
          {lowStock && purchaseUrl ? (
            <a href={purchaseUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                購入サイトへ
              </Button>
            </a>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex-grow space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Button
            size="lg"
            className="h-20 bg-sky-600 text-xl hover:bg-sky-500"
            onClick={() => onOpenModal("milk", { babyId })}
          >
            <Milk className="mr-2 h-6 w-6" />
            ミルク
          </Button>
          <Button
            size="lg"
            className="h-20 bg-amber-600 text-xl hover:bg-amber-500"
            onClick={() => onOpenModal("diaper", { babyId })}
          >
            <Droplets className="mr-2 h-6 w-6" />
            おむつ
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-base font-medium text-muted-foreground">
                ミルク合計
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-sky-300">
                  {milkTotal}
                </span>
                <span className="font-semibold text-muted-foreground">ml</span>
                <span className="ml-auto text-sm text-muted-foreground">
                  {milkEvents.length}回
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-base font-medium text-muted-foreground">
                おむつ
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-amber-300">
                  {diaperCount}
                </span>
                <span className="font-semibold text-muted-foreground">回</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-3">
        <h3 className="text-sm font-semibold text-muted-foreground">
          今日のログ
        </h3>
        <div className="flex w-full flex-col gap-3">
          {events.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">
              まだ記録がありません
            </div>
          ) : (
            events
              .slice(0, 4)
              .map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onEdit={() => onOpenModal("edit", { eventId: event.id })}
                  onDelete={() => onDeleteEvent(event.id)}
                />
              ))
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
