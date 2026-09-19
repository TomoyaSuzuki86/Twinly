import { useEffect, useRef, useState, type Ref } from "react";
import { dispatchAiAdviceOpen } from "@/lib/app-events";
import { HelpCircle, MoreVertical, Music, Pause, Settings, Sparkles } from "lucide-react";
import type { FamilyAccess } from "@/lib/ai";
import { Button } from "./ui/button";

export type ComfortHeaderState = {
  active: boolean;
  paused: boolean;
  trackId: string;
  trackLabel: string;
};

type HeaderOverflowMenuProps = {
  access: FamilyAccess | null;
  onOpenHelp: () => void;
  onOpenSettings: () => void;
  onOpenComfort: () => void;
  tutorialAnchorRef?: Ref<HTMLButtonElement>;
};

const stopHeaderGesture = (event: React.SyntheticEvent) => event.stopPropagation();

export function HeaderOverflowMenu({ access, onOpenHelp, onOpenSettings, onOpenComfort, tutorialAnchorRef }: HeaderOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const aiEnabled = Boolean(access?.features.aiReview);
  const aiLoading = access === null;
  const closeAnd = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div
      ref={wrapperRef}
      className="relative flex items-center"
      onPointerDown={stopHeaderGesture}
      onPointerUp={stopHeaderGesture}
      onDoubleClick={stopHeaderGesture}
      onContextMenu={stopHeaderGesture}
    >
      <Button
        ref={tutorialAnchorRef}
        variant="ghost"
        size="icon"
        type="button"
        aria-label="メニュー"
        aria-haspopup="menu"
        aria-expanded={open}
        title="メニュー"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>

      <div
        role="menu"
        data-open={open}
        className={`absolute right-0 top-[calc(100%+0.35rem)] z-[85] w-[11.5rem] origin-top-right rounded-[0.8rem] border bg-card/95 p-1.5 text-card-foreground shadow-2xl backdrop-blur transition duration-150 ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-95 opacity-0"
        }`}
      >
        <button
          type="button"
          role="menuitem"
          disabled={!aiEnabled}
          aria-disabled={!aiEnabled}
          title={
            aiEnabled
              ? "AIアドバイス"
              : aiLoading
                ? "利用状態を確認しています"
                : "Premiumで利用できます"
          }
          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
          onClick={closeAnd(dispatchAiAdviceOpen)}
        >
          <Sparkles className="h-4 w-4" />
          <span>AIアドバイス</span>
          {!aiLoading && !aiEnabled ? (
            <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-extrabold text-primary">
              Premium
            </span>
          ) : null}
        </button>
        <button
          type="button"
          role="menuitem"
          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold hover:bg-accent"
          onClick={closeAnd(onOpenComfort)}
        >
          <Music className="h-4 w-4" />
          <span>おやすみ音楽</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold hover:bg-accent"
          onClick={closeAnd(onOpenHelp)}
        >
          <HelpCircle className="h-4 w-4" />
          <span>ヘルプ</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold hover:bg-accent"
          onClick={closeAnd(onOpenSettings)}
        >
          <Settings className="h-4 w-4" />
          <span>設定</span>
        </button>
      </div>
    </div>
  );
}

export function ComfortMiniPlayer({
  state,
  onOpen,
  onTogglePause,
}: {
  state: ComfortHeaderState;
  onOpen: () => void;
  onTogglePause: () => void;
}) {
  if (!state.active || state.paused) return null;
  const label = state.trackLabel || "おやすみ音楽";

  return (
    <div
      className="mx-auto flex h-[1.15rem] min-h-[1.15rem] w-[min(100%,29rem)] items-center gap-1 overflow-hidden rounded-full border bg-card/80 pl-2 pr-1 text-card-foreground shadow-sm"
      onPointerDown={stopHeaderGesture}
      onDoubleClick={stopHeaderGesture}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden whitespace-nowrap border-0 bg-transparent text-left text-[10px] font-semibold"
        aria-label="おやすみ音楽を開く"
        title={label}
        onClick={onOpen}
      >
        <Music className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </button>
      <button
        type="button"
        className="grid h-[0.9rem] w-[2.6rem] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground active:scale-95"
        aria-label="一時停止"
        onClick={onTogglePause}
      >
        <Pause className="h-2 w-2" />
      </button>
    </div>
  );
}
