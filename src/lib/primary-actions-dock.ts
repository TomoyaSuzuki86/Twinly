const STYLE_ID = "twinly-primary-actions-dock-style";

type PrimaryActionKey = "food" | "diaper" | "sleep";

type PrimaryActionSource = {
  key: PrimaryActionKey;
  button: HTMLButtonElement;
  fill: HTMLElement | null;
};

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.twinly-primary-action-dock {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-top: 3px;
  padding: 5px 6px 7px;
  overflow: hidden;
  border: 1px solid hsl(var(--border) / 0.68);
  border-top: 0;
  border-radius: 0 0 14px 14px;
  background: hsl(var(--background) / 0.94);
  box-shadow: 0 10px 24px rgb(0 0 0 / 0.14);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  opacity: 0;
  transform: translateY(8px) scale(0.985);
  transform-origin: top center;
  pointer-events: none;
  will-change: opacity, transform;
}

.twinly-primary-action-dock-button {
  position: relative !important;
  width: 100% !important;
  min-width: 0 !important;
  height: 58px !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  border-radius: 10px !important;
  font-size: 13px !important;
  line-height: 1 !important;
  touch-action: none;
  -webkit-touch-callout: none;
}

.twinly-primary-action-dock-content {
  position: relative;
  z-index: 10;
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 2px 3px;
  text-align: center;
  pointer-events: none;
}

.twinly-primary-action-dock-content > :first-child {
  display: flex !important;
  min-width: 0 !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 4px !important;
  margin: 0 !important;
  padding: 0 !important;
  font-size: 13px !important;
  font-weight: 800 !important;
  line-height: 1 !important;
  white-space: nowrap;
}

.twinly-primary-action-dock-content svg {
  width: 16px !important;
  height: 16px !important;
  margin: 0 !important;
  flex: 0 0 auto;
}

.twinly-primary-action-dock-meta {
  max-width: 100%;
  overflow: hidden;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.78;
}

@media (prefers-reduced-motion: reduce) {
  .twinly-primary-action-dock {
    transform: none !important;
  }
}
`;
  document.head.appendChild(style);
};

const getPrimaryActionSources = (): PrimaryActionSource[] => {
  const activePanel = document.querySelector<HTMLElement>(
    '.twinly-baby-tabs-content[data-state="active"]'
  );
  if (!activePanel) return [];

  const findSource = (key: PrimaryActionKey, testId: string): PrimaryActionSource | null => {
    const fill = activePanel.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    const button = fill?.closest("button");
    if (!(button instanceof HTMLButtonElement)) return null;
    return { key, button, fill };
  };

  return [
    findSource("food", "milk-gauge-fill"),
    findSource("diaper", "diaper-gauge-fill"),
    findSource("sleep", "sleep-gauge-fill"),
  ].filter((source): source is PrimaryActionSource => Boolean(source));
};

const stripTestIds = (element: Element) => {
  element.removeAttribute("data-testid");
  element.querySelectorAll("[data-testid]").forEach((child) => child.removeAttribute("data-testid"));
};

const buildCompactActionButton = (source: PrimaryActionSource) => {
  const clone = source.button.cloneNode(false) as HTMLButtonElement;
  clone.className = `${source.button.className} twinly-primary-action-dock-button`;
  clone.dataset.dockAction = source.key;
  clone.removeAttribute("data-transition");
  clone.removeAttribute("style");
  stripTestIds(clone);

  if (source.fill) {
    const fill = source.fill.cloneNode(true) as HTMLElement;
    stripTestIds(fill);
    clone.appendChild(fill);
  }

  const content = document.createElement("span");
  content.className = "twinly-primary-action-dock-content";

  if (source.key === "sleep") {
    const stateLabel = source.button.querySelector<HTMLElement>('[data-testid="sleep-state-label"]');
    const stateRow = stateLabel?.firstElementChild;
    if (stateRow) content.appendChild(stateRow.cloneNode(true));
  } else {
    const sourceContent = Array.from(source.button.children).find(
      (child) => child instanceof HTMLDivElement
    ) as HTMLDivElement | undefined;
    const labelRow = sourceContent?.firstElementChild;
    if (labelRow) content.appendChild(labelRow.cloneNode(true));
  }

  const ariaLabel = source.button.getAttribute("aria-label") ?? "";
  const percentMatch = ariaLabel.match(/(\d+)%/);
  if (percentMatch) {
    const meta = document.createElement("span");
    meta.className = "twinly-primary-action-dock-meta";
    meta.textContent = `${percentMatch[1]}%`;
    if (source.key === "sleep") {
      const foregroundToken = source.button.getAttribute("aria-checked") === "true"
        ? "--gauge-sleep-on"
        : "--gauge-wake-on";
      meta.style.color = `hsl(var(${foregroundToken}))`;
    }
    content.appendChild(meta);
  }

  clone.appendChild(content);
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

let currentCleanup: (() => void) | null = null;

export const installPrimaryActionsDock = () => {
  currentCleanup?.();
  ensureStyle();

  const root = document.getElementById("root");
  if (!root) return () => {};

  let dock: HTMLDivElement | null = null;
  let observedPanels: Element | null = null;
  let panelsObserver: MutationObserver | null = null;
  let frame = 0;
  let contentSignature = "";
  let dockInteractive = false;

  const scheduleRefresh = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      refresh();
    });
  };

  const ensureDock = () => {
    const stickyShell = document.querySelector<HTMLElement>(".twinly-baby-tabs > .sticky");
    if (!stickyShell) return null;
    if (dock && dock.parentElement === stickyShell) return dock;

    dock?.remove();
    dock = document.createElement("div");
    dock.className = "twinly-primary-action-dock";
    dock.setAttribute("aria-label", "主要な記録");
    dock.setAttribute("aria-hidden", "true");
    stickyShell.appendChild(dock);
    contentSignature = "";
    return dock;
  };

  const rebuildDockContent = (sources: PrimaryActionSource[]) => {
    const currentDock = ensureDock();
    if (!currentDock) return;

    const signature = sources
      .map((source) =>
        [
          source.key,
          source.button.getAttribute("aria-label") ?? "",
          source.button.disabled ? "1" : "0",
          source.fill?.getAttribute("style") ?? "",
          source.button.textContent?.replace(/\s+/g, " ").trim() ?? "",
        ].join("|")
      )
      .join("||");

    if (signature === contentSignature) return;
    contentSignature = signature;
    currentDock.replaceChildren(...sources.map(buildCompactActionButton));
  };

  const setDockProgress = (progress: number) => {
    if (!dock) return;
    const clamped = Math.max(0, Math.min(1, progress));
    dock.style.opacity = clamped.toFixed(3);
    dock.style.transform = `translateY(${((1 - clamped) * 8).toFixed(2)}px) scale(${(
      0.985 + clamped * 0.015
    ).toFixed(4)})`;

    const interactive = clamped >= 0.72;
    if (interactive !== dockInteractive) {
      dockInteractive = interactive;
      dock.style.pointerEvents = interactive ? "auto" : "none";
      dock.setAttribute("aria-hidden", interactive ? "false" : "true");
      dock.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        button.tabIndex = interactive ? 0 : -1;
      });
    }
  };

  const refresh = () => {
    const currentDock = ensureDock();
    const stickyShell = document.querySelector<HTMLElement>(".twinly-baby-tabs > .sticky");
    const sources = getPrimaryActionSources();

    const splitLayoutActive =
      document.documentElement.dataset.twinlyLayout === "split" &&
      window.matchMedia("(min-width: 1180px)").matches;

    if (!currentDock || !stickyShell || sources.length < 2 || splitLayoutActive) {
      setDockProgress(0);
      return;
    }

    rebuildDockContent(sources);

    const firstButtonTop = sources[0].button.getBoundingClientRect().top;
    const stickyBottom = stickyShell.getBoundingClientRect().bottom;
    const gap = firstButtonTop - stickyBottom;
    const progress = (12 - gap) / 58;
    setDockProgress(progress);
  };

  const attachPanelsObserver = () => {
    const nextPanels = document.querySelector(".twinly-baby-tabs-panels");
    if (nextPanels === observedPanels) return;

    panelsObserver?.disconnect();
    observedPanels = nextPanels;
    contentSignature = "";

    if (nextPanels) {
      panelsObserver = new MutationObserver(scheduleRefresh);
      panelsObserver.observe(nextPanels, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["data-state", "style", "disabled", "aria-label"],
      });
      scheduleRefresh();
    } else {
      setDockProgress(0);
    }
  };

  const rootObserver = new MutationObserver(attachPanelsObserver);
  rootObserver.observe(root, { childList: true, subtree: true });

  attachPanelsObserver();
  window.addEventListener("scroll", scheduleRefresh, { passive: true });
  window.addEventListener("resize", scheduleRefresh, { passive: true });

  const cleanup = () => {
    rootObserver.disconnect();
    panelsObserver?.disconnect();
    window.removeEventListener("scroll", scheduleRefresh);
    window.removeEventListener("resize", scheduleRefresh);
    if (frame) window.cancelAnimationFrame(frame);
    dock?.remove();
    dock = null;
    observedPanels = null;
    panelsObserver = null;
    frame = 0;
    if (currentCleanup === cleanup) currentCleanup = null;
  };

  currentCleanup = cleanup;
  return cleanup;
};
