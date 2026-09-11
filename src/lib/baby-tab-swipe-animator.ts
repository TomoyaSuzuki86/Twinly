type SwipeSession = {
  startX: number;
  startY: number;
  panelWidth: number;
  activeIndex: number;
  tabRects: RelativeRect[];
  startedOnAiAdvice: boolean;
};

type RelativeRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
};

const LIST_SELECTOR = ".twinly-baby-tabs-list";
const PANELS_SELECTOR = ".twinly-baby-tabs-panels";
const AI_ADVICE_SELECTOR = '[data-twinly-ai-advice-target="true"]';
const READY_CLASS = "twinly-fluid-tabs-ready";
const INDICATOR_CLASS = "twinly-fluid-tab-indicator";
const SETTLING_CLASS = "twinly-fluid-tab-indicator-settling";
const AI_ADVICE_SWIPE_DISTANCE_PX = 20;
const AI_ADVICE_CLICK_SUPPRESS_MS = 800;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;
const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const isSplitLayoutActive = () =>
  document.documentElement.dataset.twinlyLayout === "split" &&
  window.matchMedia("(min-width: 1180px)").matches;

const getDirectTabs = (list: HTMLElement) =>
  Array.from(list.children).filter(
    (child): child is HTMLButtonElement =>
      child instanceof HTMLButtonElement && child.getAttribute("role") === "tab"
  );

const getRelativeRect = (element: HTMLElement, container: HTMLElement): RelativeRect => {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const left = elementRect.left - containerRect.left;
  const top = elementRect.top - containerRect.top;
  return {
    left,
    top,
    width: elementRect.width,
    height: elementRect.height,
    right: left + elementRect.width,
  };
};

const getActiveIndex = (tabs: HTMLButtonElement[]) =>
  tabs.findIndex(
    (tab) => tab.dataset.state === "active" || tab.getAttribute("aria-selected") === "true"
  );

const computeStretchRect = (
  from: RelativeRect,
  to: RelativeRect,
  progress: number
): RelativeRect => {
  const p = clamp01(progress);
  const movingRight = to.left > from.left;
  let left = from.left;
  let right = from.right;

  if (p <= 0.5) {
    const amount = smoothstep(p * 2);
    if (movingRight) right = lerp(from.right, to.right, amount);
    else left = lerp(from.left, to.left, amount);
  } else {
    const amount = smoothstep((p - 0.5) * 2);
    if (movingRight) {
      right = to.right;
      left = lerp(from.left, to.left, amount);
    } else {
      left = to.left;
      right = lerp(from.right, to.right, amount);
    }
  }

  return {
    left,
    top: lerp(from.top, to.top, p),
    width: Math.max(1, right - left),
    height: lerp(from.height, to.height, p),
    right,
  };
};

const style = document.createElement("style");
style.textContent = `
.${READY_CLASS} {
  position: relative !important;
  isolation: isolate;
}

.${READY_CLASS} > [role="tab"] {
  position: relative;
  z-index: 1;
}

.${READY_CLASS} > [role="tab"][data-state="active"] {
  background: transparent !important;
  box-shadow: none !important;
}

.${INDICATOR_CLASS} {
  position: absolute;
  z-index: 0;
  pointer-events: none;
  background: hsl(var(--background));
  box-shadow: 0 1px 3px hsl(var(--foreground) / 0.12), 0 0 0 1px hsl(var(--border) / 0.38);
  transform-origin: center;
  will-change: left, width, transform, clip-path;
}

.${SETTLING_CLASS} {
  animation: twinly-tab-slime-settle 390ms cubic-bezier(.2,.9,.28,1.25);
}

@keyframes twinly-tab-slime-settle {
  0% { transform: scaleX(1.02) scaleY(.97); }
  38% { transform: scaleX(.965) scaleY(1.055); }
  68% { transform: scaleX(1.022) scaleY(.985); }
  86% { transform: scaleX(.995) scaleY(1.01); }
  100% { transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .${INDICATOR_CLASS} {
    transition: none !important;
    animation: none !important;
  }
}
`;
document.head.appendChild(style);

export const installBabyTabSwipeAnimator = () => {
  let list: HTMLElement | null = null;
  let indicator: HTMLSpanElement | null = null;
  let session: SwipeSession | null = null;
  let refreshFrame = 0;
  let settlingTimer = 0;
  let suppressAiAdviceClickUntil = 0;

  const clearSettlingAnimation = () => {
    if (!indicator) return;
    indicator.classList.remove(SETTLING_CLASS);
    if (settlingTimer) window.clearTimeout(settlingTimer);
    settlingTimer = 0;
  };

  const ensureIndicator = () => {
    const nextList = document.querySelector<HTMLElement>(LIST_SELECTOR);
    if (!nextList) {
      list?.classList.remove(READY_CLASS);
      indicator?.remove();
      list = null;
      indicator = null;
      return false;
    }

    if (nextList !== list) {
      list?.classList.remove(READY_CLASS);
      indicator?.remove();
      list = nextList;
      indicator = document.createElement("span");
      indicator.className = INDICATOR_CLASS;
      indicator.setAttribute("aria-hidden", "true");
      list.prepend(indicator);
    }

    const currentIndicator = indicator;
    if (!currentIndicator) return false;

    if (isSplitLayoutActive()) {
      list.classList.remove(READY_CLASS);
      currentIndicator.style.display = "none";
      return false;
    }

    list.classList.add(READY_CLASS);
    currentIndicator.style.display = "block";
    return true;
  };

  const applyRect = (rect: RelativeRect, tension = 0, dragging = false) => {
    if (!indicator) return;
    if (dragging) {
      clearSettlingAnimation();
      indicator.style.transition = "none";
    } else {
      indicator.style.transition = [
        "left 430ms cubic-bezier(.2,1.42,.32,1)",
        "width 430ms cubic-bezier(.2,1.42,.32,1)",
        "top 320ms cubic-bezier(.2,.9,.3,1)",
        "height 320ms cubic-bezier(.2,.9,.3,1)",
        "clip-path 220ms ease-out",
        "border-radius 220ms ease-out",
      ].join(", ");
    }

    indicator.style.left = `${rect.left}px`;
    indicator.style.top = `${rect.top}px`;
    indicator.style.width = `${rect.width}px`;
    indicator.style.height = `${rect.height}px`;

    if (tension > 0.015) {
      const waist = Math.min(72, rect.width * 0.18) * tension;
      indicator.style.clipPath = `polygon(0 0, 100% 0, calc(100% - ${waist.toFixed(2)}px) 50%, 100% 100%, 0 100%, ${waist.toFixed(2)}px 50%)`;
      indicator.style.borderRadius = `${Math.round(7 + tension * 9)}px`;
      indicator.style.transform = `scaleX(${(1 + tension * 0.012).toFixed(4)}) scaleY(${(1 - tension * 0.075).toFixed(4)})`;
    } else {
      indicator.style.clipPath = "inset(0 round 8px)";
      indicator.style.borderRadius = "8px";
      indicator.style.transform = "scale(1)";
    }
  };

  const settleToActive = (withBounce: boolean) => {
    if (!ensureIndicator() || !list || !indicator) return;
    const tabs = getDirectTabs(list);
    const activeIndex = getActiveIndex(tabs);
    const active = tabs[activeIndex];
    if (!active) return;

    applyRect(getRelativeRect(active, list), 0, false);
    if (!withBounce || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    clearSettlingAnimation();
    void indicator.offsetWidth;
    indicator.classList.add(SETTLING_CLASS);
    settlingTimer = window.setTimeout(() => {
      indicator?.classList.remove(SETTLING_CLASS);
      settlingTimer = 0;
    }, 430);
  };

  const scheduleSettle = (withBounce = false) => {
    if (refreshFrame) window.cancelAnimationFrame(refreshFrame);
    refreshFrame = window.requestAnimationFrame(() => {
      refreshFrame = window.requestAnimationFrame(() => {
        refreshFrame = 0;
        if (!session) settleToActive(withBounce);
      });
    });
  };

  const handleTouchStart = (event: TouchEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const panels = target.closest<HTMLElement>(PANELS_SELECTOR);
    if (!panels || isSplitLayoutActive()) return;
    const touch = event.touches.item(0);
    if (!touch || !ensureIndicator() || !list) return;

    const tabs = getDirectTabs(list);
    const activeIndex = getActiveIndex(tabs);
    if (activeIndex < 0 || tabs.length < 2) return;

    session = {
      startX: touch.clientX,
      startY: touch.clientY,
      panelWidth: Math.max(1, panels.getBoundingClientRect().width),
      activeIndex,
      tabRects: tabs.map((tab) => getRelativeRect(tab, list!)),
      startedOnAiAdvice: Boolean(target.closest(AI_ADVICE_SELECTOR)),
    };
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (!session || !list || !indicator) return;
    const touch = event.touches.item(0);
    if (!touch) return;

    const deltaX = touch.clientX - session.startX;
    const deltaY = touch.clientY - session.startY;
    const horizontal = Math.abs(deltaX);
    const vertical = Math.abs(deltaY);

    // The AI launcher is portaled into BabyPanel, so React's normal panel touch handlers do not
    // receive its gesture. This native listener sees the physical DOM tree, therefore switch the
    // actual Radix tab directly as soon as a clear horizontal swipe is detected.
    if (
      session.startedOnAiAdvice &&
      horizontal >= AI_ADVICE_SWIPE_DISTANCE_PX &&
      horizontal > vertical
    ) {
      const tabs = getDirectTabs(list);
      const targetTab = deltaX < 0 ? tabs[1] : tabs[0];
      if (targetTab) {
        session = null;
        suppressAiAdviceClickUntil = Date.now() + AI_ADVICE_CLICK_SUPPRESS_MS;
        if (event.cancelable) event.preventDefault();
        targetTab.click();
        scheduleSettle(true);
        return;
      }
    }

    if (horizontal < 7 || horizontal < vertical * 0.72) return;

    const targetIndex = deltaX < 0 ? session.activeIndex + 1 : session.activeIndex - 1;
    const from = session.tabRects[session.activeIndex];
    const to = session.tabRects[targetIndex];
    if (!from || !to) {
      const rubber = Math.min(9, horizontal * 0.07) * (deltaX < 0 ? -1 : 1);
      applyRect({ ...from, left: from.left + rubber, right: from.right + rubber }, 0.12, true);
      return;
    }

    const progress = clamp01(horizontal / Math.max(120, session.panelWidth * 0.52));
    const tension = Math.sin(Math.PI * progress);
    applyRect(computeStretchRect(from, to, progress), tension, true);
  };

  const handleTouchEnd = () => {
    if (!session) return;
    session = null;
    scheduleSettle(true);
  };

  const handleTouchCancel = () => {
    if (!session) return;
    session = null;
    scheduleSettle(true);
  };

  const handleClickCapture = (event: MouseEvent) => {
    if (Date.now() >= suppressAiAdviceClickUntil) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(AI_ADVICE_SELECTOR)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  document.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true });
  document.addEventListener("touchmove", handleTouchMove, { capture: true, passive: false });
  document.addEventListener("touchend", handleTouchEnd, { capture: true, passive: true });
  document.addEventListener("touchcancel", handleTouchCancel, { capture: true, passive: true });
  document.addEventListener("click", handleClickCapture, true);

  const observer = new MutationObserver((mutations) => {
    let activeChanged = false;
    let structureChanged = false;
    for (const mutation of mutations) {
      if (mutation.type === "childList") structureChanged = true;
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "data-state" &&
        mutation.target instanceof HTMLElement &&
        mutation.target.getAttribute("role") === "tab"
      ) {
        activeChanged = true;
      }
    }

    if (structureChanged) {
      // React can mount the tab list with data-state="active" already present. In that case
      // there is no later data-state mutation to position the custom indicator, so explicitly
      // settle after the list/children arrive on the first render.
      ensureIndicator();
      if (!session) scheduleSettle(false);
    }
    if (activeChanged && !session) scheduleSettle(true);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-state"],
  });

  window.addEventListener("resize", () => scheduleSettle(false), { passive: true });
  ensureIndicator();
  scheduleSettle(false);
};

installBabyTabSwipeAnimator();
