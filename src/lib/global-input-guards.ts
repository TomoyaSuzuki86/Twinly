const STYLE_ID = "twinly-global-input-guards-style";
const SCROLL_EXCLUDED_SELECTOR = ".twinly-baby-tabs > .sticky > header, .twinly-baby-tabs-list";

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
${SCROLL_EXCLUDED_SELECTOR} {
  touch-action: none;
}
`;
  document.head.appendChild(style);
};

let currentCleanup: (() => void) | null = null;

export const installGlobalInputGuards = () => {
  currentCleanup?.();
  ensureStyle();

  const preventDefault = (event: Event) => event.preventDefault();
  const preventMultiTouchZoom = (event: TouchEvent) => {
    if (event.touches.length > 1) event.preventDefault();
  };
  const preventScrollFromExcludedArea = (event: TouchEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(SCROLL_EXCLUDED_SELECTOR)) event.preventDefault();
  };

  document.addEventListener("selectstart", preventDefault);
  document.addEventListener("dblclick", preventDefault, { passive: false });
  document.addEventListener("gesturestart", preventDefault, { passive: false });
  document.addEventListener("touchmove", preventMultiTouchZoom, { passive: false });
  document.addEventListener("touchmove", preventScrollFromExcludedArea, { passive: false });

  const cleanup = () => {
    document.removeEventListener("selectstart", preventDefault);
    document.removeEventListener("dblclick", preventDefault);
    document.removeEventListener("gesturestart", preventDefault);
    document.removeEventListener("touchmove", preventMultiTouchZoom);
    document.removeEventListener("touchmove", preventScrollFromExcludedArea);
    if (currentCleanup === cleanup) currentCleanup = null;
  };

  currentCleanup = cleanup;
  return cleanup;
};
