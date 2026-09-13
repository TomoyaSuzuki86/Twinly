const BUTTON_ID = "twinly-manual-sync-button";
const STYLE_ID = "twinly-manual-sync-button-style";
const SUCCESS_HOLD_MS = 850;
const SETTLE_TIMEOUT_MS = 16_000;

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${BUTTON_ID} {
      width: 2.5rem;
      height: 2.5rem;
      flex: 0 0 2.5rem;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: .375rem;
      background: transparent;
      color: inherit;
      cursor: pointer;
      transition: background-color 460ms ease, color 460ms ease, border-radius 460ms ease, transform 140ms ease;
      -webkit-tap-highlight-color: transparent;
    }
    #${BUTTON_ID}:hover {
      background: hsl(var(--accent));
      color: hsl(var(--accent-foreground));
    }
    #${BUTTON_ID}:active {
      transform: scale(.96);
    }
    #${BUTTON_ID}[data-state='success'] {
      border-radius: 9999px;
      background: rgb(34 197 94);
      color: white;
    }
    #${BUTTON_ID} svg {
      width: 1rem;
      height: 1rem;
      transition: color 460ms ease;
    }
    #${BUTTON_ID}[data-state='syncing'] svg {
      animation: twinly-manual-sync-spin 800ms linear infinite;
    }
    @keyframes twinly-manual-sync-spin {
      to { transform: rotate(360deg); }
    }
    @media (prefers-reduced-motion: reduce) {
      #${BUTTON_ID}, #${BUTTON_ID} svg {
        transition-duration: 0ms;
      }
      #${BUTTON_ID}[data-state='syncing'] svg {
        animation-duration: 1400ms;
      }
    }
  `;
  document.head.appendChild(style);
};

const createRefreshIcon = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `
    <path d="M21 12a9 9 0 0 0-15-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 15 6.7L21 16" />
    <path d="M16 16h5v5" />
  `;
  return svg;
};

const getSyncStatusElement = (header: HTMLElement) => {
  const sibling = header.nextElementSibling;
  return sibling instanceof HTMLElement && sibling.getAttribute("role") === "status" ? sibling : null;
};

const setButtonState = (button: HTMLButtonElement, state: "idle" | "syncing" | "success") => {
  button.dataset.state = state;
  button.disabled = state === "syncing";
  button.setAttribute("aria-busy", state === "syncing" ? "true" : "false");
};

const runManualSync = (button: HTMLButtonElement, header: HTMLElement) => {
  if (button.dataset.state === "syncing") return;

  setButtonState(button, "syncing");
  const startedAt = Date.now();
  let sawSyncActivity = false;

  // useAppStore already handles pageshow by reconnecting to Firestore and flushing the outbox.
  // Reuse that path so the manual button cannot diverge from automatic synchronization behavior.
  window.dispatchEvent(new Event("pageshow"));

  const checkSettled = () => {
    if (!button.isConnected) return;

    const checking = document.documentElement.dataset.twinlySyncChecking === "true";
    const syncStatus = getSyncStatusElement(header);
    const syncMessage = document.body.dataset.twinlySyncMessage;

    if (checking || syncStatus || syncMessage) sawSyncActivity = true;

    const settled = !checking && !syncStatus && !syncMessage;
    const elapsed = Date.now() - startedAt;

    if (settled && (sawSyncActivity || elapsed >= 450)) {
      setButtonState(button, "success");
      window.setTimeout(() => {
        if (button.isConnected && button.dataset.state === "success") setButtonState(button, "idle");
      }, SUCCESS_HOLD_MS);
      return;
    }

    if (elapsed >= SETTLE_TIMEOUT_MS) {
      setButtonState(button, "idle");
      return;
    }

    window.setTimeout(checkSettled, 80);
  };

  window.setTimeout(checkSettled, 80);
};

const mountButton = () => {
  const header = document.querySelector<HTMLElement>('header[data-tutorial="header"]');
  if (!header || document.getElementById(BUTTON_ID)) return;

  const controls = header.lastElementChild;
  if (!(controls instanceof HTMLElement)) return;

  ensureStyle();

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.dataset.state = "idle";
  button.setAttribute("aria-label", "同期");
  button.setAttribute("aria-busy", "false");
  button.title = "同期";
  button.appendChild(createRefreshIcon());

  const stopHeaderGesture = (event: Event) => event.stopPropagation();
  button.addEventListener("pointerdown", stopHeaderGesture);
  button.addEventListener("pointerup", stopHeaderGesture);
  button.addEventListener("pointercancel", stopHeaderGesture);
  button.addEventListener("dblclick", stopHeaderGesture);
  button.addEventListener("contextmenu", stopHeaderGesture);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    runManualSync(button, header);
  });

  controls.prepend(button);
};

const observer = new MutationObserver(mountButton);
observer.observe(document.documentElement, { childList: true, subtree: true });
mountButton();
