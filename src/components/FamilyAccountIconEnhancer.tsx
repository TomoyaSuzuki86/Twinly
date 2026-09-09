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
type MorphRect = { left: number; top: number; width: number; height: number };
type MorphGroup = {
  id: string;
  panel: HTMLElement;
  sources: PrimaryActionSource[];
};
type MorphEntry = {
  groupId: string;
  source: PrimaryActionSource;
  clone: HTMLButtonElement;
};

const actionTestIds: Record<PrimaryActionKey, string> = {
  food: "milk-gauge-fill",
  diaper: "diaper-gauge-fill",
  sleep: "sleep-gauge-fill",
};

const getPanelSources = (panel: HTMLElement): PrimaryActionSource[] =>
  (Object.entries(actionTestIds) as [PrimaryActionKey, string][])
    .map(([key, testId]) => {
      const fill = panel.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      const button = fill?.closest("button");
      return button instanceof HTMLButtonElement ? { key, button, fill } : null;
    })
    .filter((source): source is PrimaryActionSource => Boolean(source));

const getMorphGroups = (splitLayoutActive: boolean): MorphGroup[] => {
  const panels = Array.from(document.querySelectorAll<HTMLElement>(".twinly-baby-tabs-content"));
  return panels
    .map((panel, index) => ({ panel, index }))
    .filter(({ panel }) => splitLayoutActive || panel.dataset.state === "active")
    .map(({ panel, index }) => ({
      id: `panel-${index}`,
      panel,
      sources: getPanelSources(panel),
    }))
    .filter((group) => group.sources.length >= 2);
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

  // Free mode deliberately hides gauge values. Its compact button should therefore
  // look fully filled rather than looking like a zero-percent gauge.
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

@media (min-width: 1180px) {
  html[data-twinly-layout="split"] .twinly-primary-action-morph-button[data-morph-compact="true"] {
    font-size: 12px !important;
  }

  html[data-twinly-layout="split"] .twinly-primary-action-morph-button[data-morph-compact="true"] [data-morph-role="care-content"] > :first-child,
  html[data-twinly-layout="split"] .twinly-primary-action-morph-button[data-morph-compact="true"] [data-morph-role="sleep-state"] > :first-child {
    font-size: 12px !important;
    gap: 3px !important;
  }

  html[data-twinly-layout="split"] .twinly-primary-action-morph-button[data-morph-compact="true"] svg {
    width: 15px !important;
    height: 15px !important;
  }
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

    let entries = new Map<string, MorphEntry>();
    let signature = "";
    let frame = 0;

    const entryKey = (groupId: string, key: PrimaryActionKey) => `${groupId}:${key}`;

    const restoreSources = () => {
      entries.forEach(({ source }) => {
        source.button.style.removeProperty("opacity");
        source.button.style.removeProperty("pointer-events");
      });
    };

    const clearMorph = () => {
      restoreSources();
      entries.forEach(({ clone }) => clone.remove());
      entries = new Map();
      signature = "";
    };

    const groupsSignature = (groups: MorphGroup[]) =>
      groups
        .flatMap((group) =>
          group.sources.map((source) =>
            [
              group.id,
              source.key,
              source.button.getAttribute("aria-label") ?? "",
              source.button.className,
              source.button.disabled ? "1" : "0",
              source.fill?.getAttribute("style") ?? "",
              source.button.textContent?.replace(/\s+/g, " ").trim() ?? "",
            ].join("|")
          )
        )
        .join("||");

    const rebuildIfNeeded = (groups: MorphGroup[]) => {
      const nextSignature = groupsSignature(groups);
      const flattened = groups.flatMap((group) => group.sources.map((source) => ({ groupId: group.id, source })));
      const sameSources =
        flattened.length === entries.size &&
        flattened.every(({ groupId, source }) => entries.get(entryKey(groupId, source.key))?.source.button === source.button);
      if (nextSignature === signature && sameSources) return;

      clearMorph();
      signature = nextSignature;
      flattened.forEach(({ groupId, source }) => {
        const clone = prepareMorphClone(source);
        clone.dataset.morphGroup = groupId;
        clone.style.opacity = "0";
        layer.appendChild(clone);
        entries.set(entryKey(groupId, source.key), { groupId, source, clone });
      });
    };

    const hideSource = (source: PrimaryActionSource | undefined, hidden: boolean) => {
      if (!source) return;
      const nextOpacity = hidden ? "0" : "";
      const nextPointerEvents = hidden ? "none" : "";
      if (source.button.style.opacity !== nextOpacity) source.button.style.opacity = nextOpacity;
      if (source.button.style.pointerEvents !== nextPointerEvents) source.button.style.pointerEvents = nextPointerEvents;
    };

    const setCloneState = (
      groupId: string,
      key: PrimaryActionKey,
      rect: MorphRect,
      progress: number,
      compactProgress: number,
      interactive: boolean
    ) => {
      const clone = entries.get(entryKey(groupId, key))?.clone;
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
      if (!stickyShell || !tabs) {
        clearMorph();
        return;
      }

      const splitLayoutActive =
        document.documentElement.dataset.twinlyLayout === "split" &&
        window.matchMedia("(min-width: 1180px)").matches;
      const groups = getMorphGroups(splitLayoutActive);
      if (!groups.length) {
        clearMorph();
        return;
      }

      rebuildIfNeeded(groups);
      const stickyBottom = stickyShell.getBoundingClientRect().bottom;
      const tabsRect = tabs.getBoundingClientRect();

      groups.forEach((group) => {
        const byKey = new Map(group.sources.map((source) => [source.key, source]));
        const food = byKey.get("food");
        const diaper = byKey.get("diaper");
        const sleep = byKey.get("sleep");
        if (!food || !diaper) return;

        const foodRect = rectFromDomRect(food.button.getBoundingClientRect());
        const diaperRect = rectFromDomRect(diaper.button.getBoundingClientRect());
        const sleepRect = sleep ? rectFromDomRect(sleep.button.getBoundingClientRect()) : null;
        const bounds = splitLayoutActive ? group.panel.getBoundingClientRect() : tabsRect;

        // Phase 1: food + diaper move upward and shrink.
        // Phase 2: they move left while sleep rises into the third slot.
        const intrusion = stickyBottom - foodRect.top;
        const phase1 = clamp01((intrusion + 4) / 88);
        const phase2 = sleep ? clamp01((intrusion - 34) / 102) : phase1;

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
          width: sleep ? thirdWidth : halfWidth,
          height: 58,
        };
        const finalDiaper: MorphRect = {
          left: left + (sleep ? thirdWidth : halfWidth) + gap,
          top: targetTop,
          width: sleep ? thirdWidth : halfWidth,
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
        const foodMorphRect = interpolateRect(foodPhase1Rect, finalFood, phase2);
        const diaperMorphRect = interpolateRect(diaperPhase1Rect, finalDiaper, phase2);
        const sleepMorphRect = sleepRect ? interpolateRect(sleepRect, finalSleep, phase2) : finalSleep;
        const finalInteractive = phase2 >= 0.96;

        setCloneState(group.id, "food", foodMorphRect, phase1, Math.max(phase1, phase2), finalInteractive);
        setCloneState(group.id, "diaper", diaperMorphRect, phase1, Math.max(phase1, phase2), finalInteractive);
        if (sleep && sleepRect) {
          setCloneState(group.id, "sleep", sleepMorphRect, phase2, phase2, finalInteractive);
        }

        hideSource(food, phase1 > 0.015);
        hideSource(diaper, phase1 > 0.015);
        hideSource(sleep, phase2 > 0.015);
      });
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
