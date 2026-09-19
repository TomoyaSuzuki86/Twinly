import type { ReactNode, TouchEvent } from "react";
import { useEffect, useRef } from "react";
import { Baby } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { detectHorizontalSwipe, type SwipePoint } from "@/lib/horizontal-swipe";
import { cn, iconGradients } from "@/lib/utils";
import type { BabyId, BabyProfile } from "@/types";

type HistoryDialogShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: BabyProfile;
  title: ReactNode;
  description: ReactNode;
  titlePrefix?: ReactNode;
  onSwitchBaby?: (babyId: BabyId) => void;
  className?: string;
  children: ReactNode;
};

const fallbackGradient = (babyId: BabyId) =>
  babyId === "A"
    ? "bg-gradient-to-br from-violet-500 to-fuchsia-500"
    : "bg-gradient-to-br from-sky-500 to-cyan-400";

export function HistoryDialogShell({
  open,
  onOpenChange,
  profile,
  title,
  description,
  titlePrefix,
  onSwitchBaby,
  className,
  children,
}: HistoryDialogShellProps) {
  const swipeStartRef = useRef<SwipePoint | null>(null);

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      import("@/components/EventHistoryModal"),
      import("@/components/SleepHistoryModal"),
    ]).catch(() => {});
  }, [open]);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches.item(0);
    swipeStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    const touch = event.changedTouches.item(0);
    if (!start || !touch || !onSwitchBaby) return;

    const direction = detectHorizontalSwipe(start, { x: touch.clientX, y: touch.clientY });
    const target =
      direction === "left" && profile.babyId === "A"
        ? "B"
        : direction === "right" && profile.babyId === "B"
          ? "A"
          : null;
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    onSwitchBaby(target);
  };

  const gradientClassName =
    iconGradients.find((gradient) => gradient.value === profile.iconGradient)?.bgColor ??
    fallbackGradient(profile.babyId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={className}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          swipeStartRef.current = null;
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {titlePrefix}
            <span
              data-history-baby-marker={profile.babyId}
              aria-hidden="true"
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full shadow-sm",
                gradientClassName
              )}
            >
              {profile.iconEmoji ? (
                <span className="text-[17px] leading-none">{profile.iconEmoji}</span>
              ) : (
                <Baby className="h-4 w-4 text-white" />
              )}
            </span>
            <span>{title}</span>
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
