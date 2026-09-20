import { useLayoutEffect, useRef, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { WIDE_SPLIT_LAYOUT_MIN_WIDTH_PX, WIDE_SPLIT_LAYOUT_QUERY, type LayoutMode } from "@/lib/appearance-preferences";
import "./primary-action-morph.css";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;

export const MORPH_START_INTRUSION = -4;
export const MORPH_FINAL_INTRUSION = 136;
export const MORPH_MIDPOINT_INTRUSION = (MORPH_START_INTRUSION + MORPH_FINAL_INTRUSION) / 2;
export const MORPH_SNAP_EPSILON = 2;
const MORPH_SCROLL_SETTLE_MS = 160;

type ElementRef<T extends HTMLElement> = { current: T | null };
export type MorphRect = { left: number; top: number; width: number; height: number };
type MorphButtonFrame = {
  rect: MorphRect;
  progress: number;
  compactProgress: number;
  interactive: boolean;
};

export type PrimaryActionMorphFrame = {
  intrusion: number;
  food: MorphButtonFrame;
  diaper: MorphButtonFrame;
  sleep: MorphButtonFrame | null;
};

export type PrimaryActionMorphGeometry = {
  stickyBottom: number;
  bounds: Pick<MorphRect, "left" | "width">;
  foodRect: MorphRect;
  diaperRect: MorphRect;
  sleepRect: MorphRect | null;
  splitLayoutActive: boolean;
};

const interpolateRect = (from: MorphRect, to: MorphRect, progress: number): MorphRect => ({
  left: lerp(from.left, to.left, progress),
  top: lerp(from.top, to.top, progress),
  width: lerp(from.width, to.width, progress),
  height: lerp(from.height, to.height, progress),
});

export const calculatePrimaryActionMorphFrame = ({
  stickyBottom,
  bounds,
  foodRect,
  diaperRect,
  sleepRect,
  splitLayoutActive,
}: PrimaryActionMorphGeometry): PrimaryActionMorphFrame => {
  const intrusion = stickyBottom - foodRect.top;
  const phase1 = clamp01((intrusion - MORPH_START_INTRUSION) / 88);
  const phase2 = sleepRect
    ? clamp01((intrusion - 34) / (MORPH_FINAL_INTRUSION - 34))
    : phase1;

  const horizontalPadding = splitLayoutActive ? 4 : 6;
  const gap = splitLayoutActive ? 4 : 6;
  const availableWidth = Math.max(150, bounds.width - horizontalPadding * 2);
  const halfWidth = (availableWidth - gap) / 2;
  const thirdWidth = (availableWidth - gap * 2) / 3;
  const targetTop = stickyBottom + 3;
  const left = bounds.left + horizontalPadding;

  const phase1FoodTarget: MorphRect = { left, top: targetTop, width: halfWidth, height: 64 };
  const phase1DiaperTarget: MorphRect = {
    left: left + halfWidth + gap,
    top: targetTop,
    width: halfWidth,
    height: 64,
  };

  const finalFood: MorphRect = {
    left,
    top: targetTop,
    width: sleepRect ? thirdWidth : halfWidth,
    height: 58,
  };
  const finalDiaper: MorphRect = {
    left: left + (sleepRect ? thirdWidth : halfWidth) + gap,
    top: targetTop,
    width: sleepRect ? thirdWidth : halfWidth,
    height: 58,
  };
  const finalSleep: MorphRect = {
    left: left + (thirdWidth + gap) * 2,
    top: targetTop,
    width: thirdWidth,
    height: 58,
  };

  const foodPhase1Rect = interpolateRect(foodRect, phase1FoodTarget, phase1);
  const diaperPhase1Rect = interpolateRect(diaperRect, phase1DiaperTarget, phase1);
  const compactProgress = Math.max(phase1, phase2);
  const interactive = phase2 >= 0.96;

  return {
    intrusion,
    food: {
      rect: interpolateRect(foodPhase1Rect, finalFood, phase2),
      progress: phase1,
      compactProgress,
      interactive,
    },
    diaper: {
      rect: interpolateRect(diaperPhase1Rect, finalDiaper, phase2),
      progress: phase1,
      compactProgress,
      interactive,
    },
    sleep: sleepRect
      ? {
          rect: interpolateRect(sleepRect, finalSleep, phase2),
          progress: phase2,
          compactProgress: phase2,
          interactive,
        }
      : null,
  };
};

export const getPrimaryActionMorphSnapTarget = (intrusion: number) => {
  if (intrusion <= MORPH_START_INTRUSION + MORPH_SNAP_EPSILON) return null;
  if (intrusion >= MORPH_FINAL_INTRUSION - MORPH_SNAP_EPSILON) return null;
  return intrusion < MORPH_MIDPOINT_INTRUSION
    ? MORPH_START_INTRUSION
    : MORPH_FINAL_INTRUSION;
};

const rectFromDomRect = (rect: DOMRect): MorphRect => ({
  left: rect.left,
  top: rect.top,
  width: rect.width,
  height: rect.height,
});

const applyRect = (element: HTMLElement, rect: MorphRect) => {
  element.style.left = `${rect.left.toFixed(2)}px`;
  element.style.top = `${rect.top.toFixed(2)}px`;
  element.style.width = `${Math.max(1, rect.width).toFixed(2)}px`;
  element.style.height = `${Math.max(1, rect.height).toFixed(2)}px`;
};

const setMorphButtonState = (button: HTMLButtonElement | null, frame: MorphButtonFrame | null) => {
  if (!button || !frame) {
    if (button) {
      button.style.opacity = "0";
      button.style.pointerEvents = "none";
      button.tabIndex = -1;
      button.dataset.morphCompact = "false";
    }
    return;
  }

  applyRect(button, frame.rect);
  button.style.opacity = frame.progress > 0.015 ? "1" : "0";
  button.dataset.morphCompact = frame.compactProgress >= 0.28 ? "true" : "false";
  button.style.pointerEvents = frame.interactive ? "auto" : "none";
  button.tabIndex = frame.interactive ? 0 : -1;
};

const setSourceHidden = (button: HTMLButtonElement | null, hidden: boolean) => {
  if (!button) return;
  const opacity = hidden ? "0" : "";
  const pointerEvents = hidden ? "none" : "";
  if (button.style.opacity !== opacity) button.style.opacity = opacity;
  if (button.style.pointerEvents !== pointerEvents) button.style.pointerEvents = pointerEvents;
};

const restoreSources = (...buttons: Array<HTMLButtonElement | null>) => {
  buttons.forEach((button) => {
    if (!button) return;
    button.style.removeProperty("opacity");
    button.style.removeProperty("pointer-events");
  });
};

const matchesMedia = (query: string) => {
  if (typeof window.matchMedia === "function") return window.matchMedia(query).matches;
  if (query === WIDE_SPLIT_LAYOUT_QUERY) return window.innerWidth >= WIDE_SPLIT_LAYOUT_MIN_WIDTH_PX;
  return false;
};

type PrimaryActionMorphProps = {
  selected: boolean;
  primaryInSplit: boolean;
  layoutMode: LayoutMode;
  stickyRef: ElementRef<HTMLElement>;
  boundsRef: ElementRef<HTMLElement>;
  foodSourceRef: ElementRef<HTMLButtonElement>;
  diaperSourceRef: ElementRef<HTMLButtonElement>;
  sleepSourceRef: ElementRef<HTMLButtonElement>;
  hasSleep: boolean;
  refreshKey: string;
  renderFood: (ref: Ref<HTMLButtonElement>) => ReactNode;
  renderDiaper: (ref: Ref<HTMLButtonElement>) => ReactNode;
  renderSleep?: (ref: Ref<HTMLButtonElement>) => ReactNode;
};

export function PrimaryActionMorph({
  selected,
  primaryInSplit,
  layoutMode,
  stickyRef,
  boundsRef,
  foodSourceRef,
  diaperSourceRef,
  sleepSourceRef,
  hasSleep,
  refreshKey,
  renderFood,
  renderDiaper,
  renderSleep,
}: PrimaryActionMorphProps) {
  const foodMorphRef = useRef<HTMLButtonElement | null>(null);
  const diaperMorphRef = useRef<HTMLButtonElement | null>(null);
  const sleepMorphRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    let frameId = 0;
    let scrollSettleTimer = 0;
    let snapReleaseTimer = 0;
    let touchScrolling = false;
    let snapInProgress = false;

    const splitLayoutActive = () =>
      layoutMode === "split" && matchesMedia(WIDE_SPLIT_LAYOUT_QUERY);
    const enabled = () => selected || splitLayoutActive();
    const snapOwner = () => (splitLayoutActive() ? primaryInSplit : selected);

    const hideMorphButtons = () => {
      setMorphButtonState(foodMorphRef.current, null);
      setMorphButtonState(diaperMorphRef.current, null);
      setMorphButtonState(sleepMorphRef.current, null);
    };

    const restore = () => {
      restoreSources(foodSourceRef.current, diaperSourceRef.current, sleepSourceRef.current);
      hideMorphButtons();
    };

    const refresh = () => {
      if (!enabled()) {
        restore();
        return;
      }

      const sticky = stickyRef.current;
      const bounds = boundsRef.current;
      const food = foodSourceRef.current;
      const diaper = diaperSourceRef.current;
      const sleep = hasSleep ? sleepSourceRef.current : null;
      if (!sticky || !bounds || !food || !diaper) {
        restore();
        return;
      }

      const frame = calculatePrimaryActionMorphFrame({
        stickyBottom: sticky.getBoundingClientRect().bottom,
        bounds: rectFromDomRect(bounds.getBoundingClientRect()),
        foodRect: rectFromDomRect(food.getBoundingClientRect()),
        diaperRect: rectFromDomRect(diaper.getBoundingClientRect()),
        sleepRect: sleep ? rectFromDomRect(sleep.getBoundingClientRect()) : null,
        splitLayoutActive: splitLayoutActive(),
      });

      setMorphButtonState(foodMorphRef.current, frame.food);
      setMorphButtonState(diaperMorphRef.current, frame.diaper);
      setMorphButtonState(sleepMorphRef.current, frame.sleep);
      setSourceHidden(food, frame.food.progress > 0.015);
      setSourceHidden(diaper, frame.diaper.progress > 0.015);
      setSourceHidden(sleep, Boolean(frame.sleep && frame.sleep.progress > 0.015));
    };

    const scheduleRefresh = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        refresh();
      });
    };

    const currentIntrusion = () => {
      if (!enabled() || !snapOwner()) return null;
      const sticky = stickyRef.current;
      const food = foodSourceRef.current;
      if (!sticky || !food) return null;
      return sticky.getBoundingClientRect().bottom - food.getBoundingClientRect().top;
    };

    const settleMorphPosition = () => {
      scrollSettleTimer = 0;
      if (touchScrolling || snapInProgress) return;

      const intrusion = currentIntrusion();
      if (intrusion === null) return;
      const targetIntrusion = getPrimaryActionMorphSnapTarget(intrusion);
      if (targetIntrusion === null) return;

      const delta = targetIntrusion - intrusion;
      if (Math.abs(delta) < 1) return;

      snapInProgress = true;
      window.scrollBy({
        top: delta,
        left: 0,
        behavior: matchesMedia("(prefers-reduced-motion: reduce)") ? "auto" : "smooth",
      });

      if (snapReleaseTimer) window.clearTimeout(snapReleaseTimer);
      snapReleaseTimer = window.setTimeout(() => {
        snapReleaseTimer = 0;
        snapInProgress = false;
        scheduleRefresh();
      }, 420);
    };

    const scheduleMorphSnap = (delay = MORPH_SCROLL_SETTLE_MS) => {
      if (!snapOwner() || touchScrolling || snapInProgress) return;
      if (scrollSettleTimer) window.clearTimeout(scrollSettleTimer);
      scrollSettleTimer = window.setTimeout(settleMorphPosition, delay);
    };

    const handleScroll = () => {
      scheduleRefresh();
      scheduleMorphSnap();
    };

    const handleTouchStart = () => {
      touchScrolling = true;
      if (scrollSettleTimer) {
        window.clearTimeout(scrollSettleTimer);
        scrollSettleTimer = 0;
      }
    };

    const handleTouchEnd = () => {
      touchScrolling = false;
      scheduleMorphSnap(80);
    };

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleRefresh);
    [
      stickyRef.current,
      boundsRef.current,
      foodSourceRef.current,
      diaperSourceRef.current,
      sleepSourceRef.current,
    ].forEach((element) => {
      if (element) resizeObserver?.observe(element);
    });

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", scheduleRefresh, { passive: true });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    refresh();

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      if (scrollSettleTimer) window.clearTimeout(scrollSettleTimer);
      if (snapReleaseTimer) window.clearTimeout(snapReleaseTimer);
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", scheduleRefresh);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
      restore();
    };
  }, [
    selected,
    primaryInSplit,
    layoutMode,
    hasSleep,
    refreshKey,
    stickyRef,
    boundsRef,
    foodSourceRef,
    diaperSourceRef,
    sleepSourceRef,
  ]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="twinly-primary-action-morph-layer" aria-hidden="true">
      {renderFood(foodMorphRef)}
      {renderDiaper(diaperMorphRef)}
      {hasSleep && renderSleep ? renderSleep(sleepMorphRef) : null}
    </div>,
    document.body
  );
}
