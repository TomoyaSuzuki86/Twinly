import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/firebase";

const initialFromNickname = (nickname: unknown) =>
  typeof nickname === "string" ? nickname.trim().slice(0, 1) : "";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;

type PrimaryActionKey = "food" | "diaper" | "sleep";
type PrimaryActionSource = {
  key: PrimaryActionKey;
  button: HTMLButtonElement;
  fill: HTMLElement | null;
};

type MorphRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const actionTestIds: Record<PrimaryActionKey, string> = {
  food: "milk-gauge-fill",
  diaper: "diaper-gauge-fill",
  sleep: "sleep-gauge-fill",
};

const getPrimaryActionSources = (): PrimaryActionSource[] => {
  const activePanel = document.querySelector<HTMLElement>(
    '.twinly-baby-tabs-content[data-state="active"]'
  );
  if (!activePanel) return [];

  return (Object.entries(actionTestIds) as [PrimaryActionKey, string][])
    .map(([key, testId]) => {
      const fill = activePanel.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      const button = fill?.closest("button");
      return button instanceof HTMLButtonElement ? { key, button, fill } : null;
    })
    .filter((source): source is PrimaryActionSource => Boolean(source));
};

const stripTestIds = (element: Element) => {
  element.removeAttribute("data-testid");
  element.querySelectorAll("[data-testid]").forEach((child) => child.removeAttribute("data-testid"));
};

const rectFromDomRect = (rect: DOMRect): MorphRect => ({
  left: rect.left,
  top: rect.top,
  width: rect.width,
  height: rect.height,
});

const interpolateRect = (from: MorphRect, to: MorphRect, progress: number): MorphRect => ({
  left: lerp(from.left, to.left, progress),
  top: lerp(from.top, to.top, progress),
  width: lerp(from.width, to.width, progress),
  height: lerp(from.height, to.height, progress),
});

const applyRect = (element: HTMLElement, rect: MorphRect) => {
  element.style.left = `${rect.left.toFixed(2)}px`;
  element.style.top = `${rect.top.toFixed(2)}px`;
  element.style.width = `${Math.max(1, rect.width).toFixed(2)}px`;
  element.style.height = `${Math.max(1, rect.height).toFixed(2)}px`;
};

const prepareMorphClone = (source: PrimaryActionSource) => {
  const clone = source.button.cloneNode(true) as HTMLButtonElement;
  clone.classList.add("twinly-primary-action-morph-button");
  clone.dataset.morphAction = source.key;
  clone.removeAttribute("data-transition");

  const clonedFill = clone.querySelector<HTMLElement>(`[data-testid="${actionTestIds[source.key]}"]`);
  const ariaLabel = source.button.getAttribute("aria-label") ?? "";
  const percentMatch = ariaLabel.match(/(\d+)%/);

  // 無料版はゲージ情報そのものを提供しないため、コンパクト表示では
  // 「空ゲージ」に見せずボタン面を満タンとして扱う。
  if (clonedFill && !percentMatch) clonedFill.style.width = "100%";

  if (source.key === "sleep") {
    const stateLabel = clone.querySelector<HTMLElement>('[data-testid="sleep-state-label"]');
    const detail = clone.querySelector<HTMLElement>('[data-testid="sleep-detail"]');
    if (stateLabel) {
      stateLabel.dataset.morphRole = "sleep-state";
      const longPressHint = stateLabel.children.item(1);
      if (longPressHint instanceof HTMLElement) longPressHint.dataset.morphSecondary = "true";
    }
    if (detail) detail.dataset.morphSecondary = "true";
  } else {
    const content = Array.from(clone.children).find(
      (child) => child instanceof HTMLDivElement
    ) as HTMLDivElement | undefined;
    if (content) {
      content.dataset.morphRole = "care-content";
      Array.from(content.children).slice(1).forEach((child) => {
        if (child instanceof HTMLElement) child.dataset.morphSecondary = "true";
      });
    }
  }

  if (percentMatch) {
    const percentage = document.createElement("span");
    percentage.className = "twinly-primary-action-morph-percent";
    percentage.textContent = `${percentMatch[1]}%`;
    clone.appendChild(percentage);
  }

  stripTestIds(clone);
  clone.tabIndex = -1;
  clone.style.pointerEvents = "none";

  clone.addEventListener("contextmenu", (event) => event.preventDefault());

  if (source.key === "sleep") {
    const relayPointerEvent = (type: string, event: PointerEvent) => {
      source.button.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: event.pointerId,
          pointerType: event.pointerType || "touch",
          clientX: event.clientX,
          clientY: event.clientY,
          button: event.button,
          buttons: event.buttons,
          isPrimary: event.isPrimary,
        })
      );
    };
    clone.addEventListener("pointerdown", (event) => relayPointerEvent("pointerdown", event));
    clone.addEventListener("pointerup", (event) => relayPointerEvent("pointerup", event));
    clone.addEventListener("pointercancel", (event) => relayPointerEvent("pointercancel", event));
    clone.addEventListener("pointerleave", (event) => relayPointerEvent("pointerleave", event));
  }

  clone.addEventListener("click", (event) => {
    event.preventDefault();
    source.button.click();
  });

  return clone;
};

const primaryActionMorphCss = `
/* The previous prototype stays installed in main.tsx, but this morph supersedes it. */
.twinly-primary-action-dock { display: none !important; }

.twinly-primary-action-morph-layer {
  position: fixed;
  inset: 0;
  z-index: 45;
  pointer-events: none;
}

.twinly-primary-action-morph-button {
  position: absolute !important;
  min-width: 0 !important;
  margin: 0 !important;
  transform: none !important;
  transform-origin: center !important;
  transition: none !important;
  overflow: hidden !important;
  will-change: left, top, width, height, border-radius, box-shadow;
  -webkit-touch-callout: none;
}

.twinly-primary-action-morph-button[data-morph-compact="true"] {
  border-radius: 10px !important;
  padding: 0 !important;
  font-size: 13px !important;
  line-height: 1 !important;
  box-shadow: 0 7px 18px rgb(0 0 0 / 0.13) !important;
}

.twinly-primary-action-morph-button [data-morph-secondary="true"] {
  transition: opacity 120ms ease, transform 120ms ease;
}

.twinly-primary-action-morph-button[data-morph-compact="true"] [data-morph-secondary="true"] {
  position: absolute !important;
  opacity: 0 !important;
  transform: translateY(4px) !important;
  pointer-events: none !important;
}

.twinly-primary-action-morph-button[data-morph-compact="true"] [data-morph-role="care-content"] {
  display: flex !important;
  height: 100% !important;
  width: 100% !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 4px !important;
}

.twinly-primary-action-morph-button[data-morph-compact="true"] [data-morph-role="care-content"] > :first-child {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 4px !important;
  margin: 0 !important;
  font-size: 13px !important;
  line-height: 1 !important;
  white-space: nowrap !important;
}

.twinly-primary-action-morph-button[data-morph-compact="true"] [data-morph-role="care-content"] svg,
.twinly-primary-action-morph-button[data-morph-compact="true"] [data-morph-role="sleep-state"] svg {
  width: 16px !important;
  height: 16px !important;
  margin: 0 !important;
}

.twinly-primary-action-morph-button[data-morph-compact="true"] > span.relative.z-10 {
  display: flex !important;
  height: 100% !important;
  width: 100% !important;
  align-items: center !important;
  justify-content: center !important;
}

.twinly-primary-action-morph-button[data-morph-compact="true"] [data-morph-role="sleep-state"] {
  display: flex !important;
  height: 100% !important;
  width: 100% !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 4px !important;
}

.twinly-primary-action-morph-button[data-morph-compact="true"] [data-morph-role="sleep-state"] > :first-child {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 4px !important;
  font-size: 13px !important;
  line-height: 1 !important;
  white-space: nowrap !important;
}

.twinly-primary-action-morph-percent {
  position: absolute;
  z-index: 15;
  right: 5px;
  bottom: 4px;
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  opacity: 0;
  transition: opacity 120ms ease;
  pointer-events: none;
}

.twinly-primary-action-morph-button[data-morph-compact="true"] .twinly-primary-action-morph-percent {
  opacity: .72;
}

@media (prefers-reduced-motion: reduce) {
  .twinly-primary-action-morph-button [data-morph-secondary="true"],
  .twinly-primary-action-morph-percent {
    transition: none !important;
  }
}
`;

export function FamilyAccountIconEnhancer() {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const currentAuth = auth;
    const currentDb = db;
    if (!currentAuth || !currentDb) return;

    let unsubscribeUser = () => {};
    let unsubscribeMember = () => {};

    const unsubscribeAuth = onAuthStateChanged(currentAuth, (user) => {
      unsubscribeUser();
      unsubscribeMember();
      setLabel("");
      if (!user) return;

      unsubscribeUser = onSnapshot(doc(currentDb, "users", user.uid), (userSnapshot) => {
        unsubscribeMember();
        const familyId = userSnapshot.data()?.activeFamilyId;
        if (typeof familyId !== "string" || !familyId) {
          setLabel("");
          return;
        }

        unsubscribeMember = onSnapshot(doc(currentDb, "families", familyId, "members", user.uid), (memberSnapshot) => {
          setLabel(initialFromNickname(memberSnapshot.data()?.nickname) || "?");
        });
      });
    });

    return () => {
      unsubscribeAuth();
      unsubscribeUser();
      unsubscribeMember();
    };
  }, []);

  useEffect(() => {
    if (!label) return;

    const sync = () => {
      const button = document.querySelector<HTMLButtonElement>('button[aria-label="アカウントと家族を開く"]');
      if (!button) return;
      if (button.textContent !== label) button.textContent = label;
      button.classList.remove(
        "bg-violet-500/20",
        "text-violet-200",
        "hover:bg-violet-500/30",
        "bg-primary",
        "text-primary-foreground",
        "hover:bg-primary/90",
        "ring-1",
        "ring-primary/30"
      );
      button.classList.add("twinly-account-avatar");
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [label]);

  useEffect(() => {
    const style = document.createElement("style");
    style.dataset.twinlyPrimaryActionMorph = "true";
    style.textContent = primaryActionMorphCss;
    document.head.appendChild(style);

    const layer = document.createElement("div");
    layer.className = "twinly-primary-action-morph-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);

    let sources: PrimaryActionSource[] = [];
    let clones = new Map<PrimaryActionKey, HTMLButtonElement>();
    let signature = "";
    let frame = 0;

    const restoreSources = () => {
      sources.forEach(({ button }) => {
        button.style.removeProperty("opacity");
        button.style.removeProperty("pointer-events");
      });
    };

    const clearMorph = () => {
      restoreSources();
      clones.forEach((clone) => clone.remove());
      clones = new Map();
      sources = [];
      signature = "";
    };

    const sourceSignature = (nextSources: PrimaryActionSource[]) =>
      nextSources
        .map((source) =>
          [
            source.key,
            source.button.getAttribute("aria-label") ?? "",
            source.button.className,
            source.button.disabled ? "1" : "0",
            source.fill?.getAttribute("style") ?? "",
            source.button.textContent?.replace(/\s+/g, " ").trim() ?? "",
          ].join("|")
        )
        .join("||");

    const rebuildIfNeeded = (nextSources: PrimaryActionSource[]) => {
      const nextSignature = sourceSignature(nextSources);
      if (
        nextSignature === signature &&
        sources.length === nextSources.length &&
        sources.every((source, index) => source.button === nextSources[index]?.button)
      ) {
        return;
      }

      restoreSources();
      clones.forEach((clone) => clone.remove());
      clones = new Map();
      sources = nextSources;
      signature = nextSignature;

      nextSources.forEach((source) => {
        const clone = prepareMorphClone(source);
        clone.style.opacity = "0";
        layer.appendChild(clone);
        clones.set(source.key, clone);
      });
    };

    const hideSource = (source: PrimaryActionSource | undefined, hidden: boolean) => {
      if (!source) return;
      if (hidden) {
        source.button.style.opacity = "0";
        source.button.style.pointerEvents = "none";
      } else {
        source.button.style.removeProperty("opacity");
        source.button.style.removeProperty("pointer-events");
      }
    };

    const setCloneState = (
      key: PrimaryActionKey,
      rect: MorphRect,
      progress: number,
      compactProgress: number,
      interactive: boolean
    ) => {
      const clone = clones.get(key);
      if (!clone) return;
      applyRect(clone, rect);
      clone.style.opacity = progress > 0.015 ? "1" : "0";
      clone.dataset.morphCompact = compactProgress >= 0.28 ? "true" : "false";
      clone.style.pointerEvents = interactive ? "auto" : "none";
      clone.tabIndex = interactive ? 0 : -1;
    };

    const refresh = () => {
      const stickyShell = document.querySelector<HTMLElement>(".twinly-baby-tabs > .sticky");
      const tabs = document.querySelector<HTMLElement>(".twinly-baby-tabs");
      const nextSources = getPrimaryActionSources();
      const splitLayoutActive =
        document.documentElement.dataset.twinlyLayout === "split" &&
        window.matchMedia("(min-width: 1180px)").matches;

      if (!stickyShell || !tabs || nextSources.length < 2 || splitLayoutActive) {
        clearMorph();
        return;
      }

      rebuildIfNeeded(nextSources);

      const byKey = new Map(nextSources.map((source) => [source.key, source]));
      const food = byKey.get("food");
      const diaper = byKey.get("diaper");
      const sleep = byKey.get("sleep");
      if (!food || !diaper) {
        clearMorph();
        return;
      }

      const foodRect = rectFromDomRect(food.button.getBoundingClientRect());
      const diaperRect = rectFromDomRect(diaper.button.getBoundingClientRect());
      const sleepRect = sleep ? rectFromDomRect(sleep.button.getBoundingClientRect()) : null;
      const stickyBottom = stickyShell.getBoundingClientRect().bottom;
      const tabsRect = tabs.getBoundingClientRect();

      // Phase 1: 食事・おむつが上へ移動しながら縮小。
      // Phase 2: 2つを左へ詰め、睡眠が右側へ合流して3等分になる。
      const intrusion = stickyBottom - foodRect.top;
      const phase1 = clamp01((intrusion + 4) / 88);
      const phase2 = sleep ? clamp01((intrusion - 34) / 102) : 0;

      const horizontalPadding = 6;
      const gap = 6;
      const availableWidth = Math.max(180, tabsRect.width - horizontalPadding * 2);
      const halfWidth = (availableWidth - gap) / 2;
      const thirdWidth = (availableWidth - gap * 2) / 3;
      const targetTop = stickyBottom + 3;

      const phase1FoodTarget: MorphRect = {
        left: tabsRect.left + horizontalPadding,
        top: targetTop,
        width: halfWidth,
        height: 64,
      };
      const phase1DiaperTarget: MorphRect = {
        left: tabsRect.left + horizontalPadding + halfWidth + gap,
        top: targetTop,
        width: halfWidth,
        height: 64,
      };

      const finalTargets: Record<PrimaryActionKey, MorphRect> = {
        food: {
          left: tabsRect.left + horizontalPadding,
          top: targetTop,
          width: thirdWidth,
          height: 58,
        },
        diaper: {
          left: tabsRect.left + horizontalPadding + thirdWidth + gap,
          top: targetTop,
          width: thirdWidth,
          height: 58,
        },
        sleep: {
          left: tabsRect.left + horizontalPadding + (thirdWidth + gap) * 2,
          top: targetTop,
          width: thirdWidth,
          height: 58,
        },
      };

      const foodPhase1Rect = interpolateRect(foodRect, phase1FoodTarget, phase1);
      const diaperPhase1Rect = interpolateRect(diaperRect, phase1DiaperTarget, phase1);
      const foodMorphRect = interpolateRect(foodPhase1Rect, finalTargets.food, phase2);
      const diaperMorphRect = interpolateRect(diaperPhase1Rect, finalTargets.diaper, phase2);
      const sleepMorphRect = sleepRect
        ? interpolateRect(sleepRect, finalTargets.sleep, phase2)
        : finalTargets.sleep;

      const finalInteractive = phase2 >= 0.96;

      setCloneState("food", foodMorphRect, phase1, Math.max(phase1, phase2), finalInteractive);
      setCloneState("diaper", diaperMorphRect, phase1, Math.max(phase1, phase2), finalInteractive);
      if (sleep && sleepRect) {
        setCloneState("sleep", sleepMorphRect, phase2, phase2, finalInteractive);
      }

      hideSource(food, phase1 > 0.015);
      hideSource(diaper, phase1 > 0.015);
      hideSource(sleep, phase2 > 0.015);
    };

    const scheduleRefresh = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        refresh();
      });
    };

    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.getElementById("root") ?? document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-state", "style", "disabled", "aria-label", "class"],
    });

    window.addEventListener("scroll", scheduleRefresh, { passive: true });
    window.addEventListener("resize", scheduleRefresh, { passive: true });
    scheduleRefresh();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", scheduleRefresh);
      window.removeEventListener("resize", scheduleRefresh);
      clearMorph();
      layer.remove();
      style.remove();
    };
  }, []);

  return null;
}
