import { Baby, Milk, Droplets } from "lucide-react";
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
import { daysSince, fmtTime } from "@/lib/utils";
import { EventCard } from "./EventCard";

type BabyPanelProps = {
  profile: BabyProfile;
  events: LogEvent[];
  lowStock: { size: string; remaining: number } | null;
  onOpenModal: (
    kind: "milk" | "diaper" | "edit",
    payload: { babyId: BabyId } | { eventId: string }
  ) => void;
  onDeleteEvent: (eventId: string) => void;
  themeDimmedBgColor: string; // New prop for dimmed background color
};

export function BabyPanel({
  profile,
  events,
  lowStock,
  onOpenModal,
  onDeleteEvent,
  themeDimmedBgColor, // Destructure new prop
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

  const lastMilkEvent = milkEvents.length > 0 ? milkEvents[0] : null;
  const lastMilkTime = lastMilkEvent ? fmtTime(new Date(lastMilkEvent.timestamp)) : "-";

  return (
    <Card className={`flex flex-col border-border/60 ${themeDimmedBgColor}`}>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-4">
          <Button
            size="lg"
            className="h-24 flex-col bg-sky-600 text-2xl font-bold hover:bg-sky-500"
            onClick={() => onOpenModal("milk", { babyId })}
          >
            <div className="flex items-center">
              <Milk className="mr-3 h-7 w-7" />
              ミルク
            </div>
            <span className="mt-1 text-base font-normal opacity-80">最終: {lastMilkTime}</span>
          </Button>
          <Button
            size="lg"
            className="h-24 flex-col bg-amber-600 text-2xl font-bold hover:bg-amber-500"
            onClick={() => onOpenModal("diaper", { babyId })}
          >
            <div className="flex items-center">
              <Droplets className="mr-3 h-7 w-7" />
              おむつ
            </div>
            <span className="mt-1 text-base font-normal opacity-80">
              {p.diaperSize}・残り {rem}
            </span>
          </Button>
        </div>
      </CardContent>
      <CardHeader className="pt-0">
        <div className="flex flex-wrap items-center gap-2">
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
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-base font-medium text-muted-foreground">ミルク合計</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-sky-300">{milkTotal}</span>
                <span className="font-semibold text-muted-foreground">ml</span>
                <span className="ml-auto text-sm text-muted-foreground">{milkEvents.length}回</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-base font-medium text-muted-foreground">おむつ</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-amber-300">{diaperCount}</span>
                <span className="font-semibold text-muted-foreground">回</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-3">
        <h3 className="text-sm font-semibold text-muted-foreground">今日のログ</h3>
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

